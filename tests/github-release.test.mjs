import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expectedAssetNames, packageRelease, publishRelease } from '../scripts/github-release.mjs';

const repository = 'example/zhongguose';
const repoPath = `/repos/${repository}`;
const commitSha = 'a'.repeat(40);
const otherCommit = 'b'.repeat(40);
const newestCommit = 'c'.repeat(40);
const clone = value => structuredClone(value);
const httpError = (status, message) => Object.assign(new Error(message), { status });
const tagRecord = (name, sha = otherCommit) => ({ name, commit: { sha } });
const assetRecord = (name, id, size = 20) => ({ name, id, size });

function releaseRecord(tag, { id = 10, draft = true, assets = [] } = {}) {
  return {
    id, tag_name: tag, draft, assets,
    html_url: `https://github.example/${repository}/releases/tag/${tag}`,
    upload_url: `https://uploads.example${repoPath}/releases/${id}/assets{?name,label}`,
  };
}

// A stateful in-memory GitHub API returns snapshots, so local response mutations
// cannot make an upload appear on the server. Unknown calls fail without network.
function createServer({ tags = [], releases = [], masterSha = commitSha, comparison = 'identical', collideOnce = false, failUploadOnce = null } = {}) {
  const state = {
    tags: clone(tags), releases: clone(releases), masterSha,
    events: [], comparison, collideOnce, failUploadOnce,
  };
  let nextId = 100;
  const client = {
    async request(method, path, body) {
      state.events.push({ method, path, body: clone(body) });
      if (method === 'GET' && path === `${repoPath}/git/ref/heads/master`) {
        return { object: { sha: state.masterSha } };
      }
      if (method === 'GET' && path.startsWith(`${repoPath}/compare/`)) {
        assert.equal(path, `${repoPath}/compare/${commitSha}...${state.masterSha}`);
        return { status: state.comparison };
      }
      if (method === 'GET' && path.startsWith(`${repoPath}/tags?`)) {
        const query = new URL(path, 'https://api.example').searchParams;
        const start = (Number(query.get('page')) - 1) * 100;
        return clone(state.tags.slice(start, start + 100));
      }
      if (method === 'POST' && path === `${repoPath}/git/refs`) {
        const name = body.ref.replace(/^refs\/tags\//, '');
        if (state.collideOnce) {
          state.collideOnce = false;
          state.tags.push(tagRecord(name, otherCommit));
          throw httpError(422, 'Reference already exists');
        }
        if (state.tags.some(tag => tag.name === name)) throw httpError(422, 'Reference already exists');
        state.tags.push(tagRecord(name, body.sha));
        return { ref: body.ref, object: { sha: body.sha } };
      }
      if (method === 'GET' && path.startsWith(`${repoPath}/releases/tags/`)) {
        const tag = decodeURIComponent(path.slice(`${repoPath}/releases/tags/`.length));
        const release = state.releases.find(item => item.tag_name === tag && !item.draft);
        if (!release) throw httpError(404, 'Not Found');
        return clone(release);
      }
      if (method === 'GET' && path.startsWith(`${repoPath}/releases?`)) {
        const query = new URL(path, 'https://api.example').searchParams;
        const start = (Number(query.get('page')) - 1) * 100;
        return clone(state.releases.slice(start, start + 100));
      }
      if (method === 'POST' && path === `${repoPath}/releases`) {
        assert.equal(body.draft, true, 'a new release must remain draft while assets upload');
        assert.equal(body.target_commitish, commitSha);
        assert.ok(state.tags.some(tag => tag.name === body.tag_name));
        const release = releaseRecord(body.tag_name, { id: nextId++ });
        state.releases.push(release);
        return clone(release);
      }
      const assetMatch = path.match(/\/releases\/assets\/(\d+)$/);
      if (method === 'DELETE' && assetMatch) {
        for (const release of state.releases) {
          release.assets = release.assets.filter(asset => asset.id !== Number(assetMatch[1]));
        }
        return null;
      }
      const releaseMatch = path.match(/\/releases\/(\d+)$/);
      if (releaseMatch) {
        const release = state.releases.find(item => item.id === Number(releaseMatch[1]));
        assert.ok(release, `release exists: ${path}`);
        if (method === 'GET') return clone(release);
        if (method === 'DELETE') {
          state.releases = state.releases.filter(item => item.id !== release.id);
          return null;
        }
        if (method === 'PATCH') {
          assert.ok(expectedAssetNames(release.tag_name).every(name => release.assets.some(asset => asset.name === name && asset.size > 0)), 'publishing requires all three assets on the server');
          Object.assign(release, body);
          return clone(release);
        }
      }
      throw new Error(`Unexpected mock API call: ${method} ${path}`);
    },
    async upload(url, content) {
      const target = new URL(url);
      assert.equal(target.origin, 'https://uploads.example');
      const releaseId = Number(target.pathname.match(/\/releases\/(\d+)\/assets$/)?.[1]);
      const release = state.releases.find(item => item.id === releaseId);
      const name = target.searchParams.get('name');
      assert.ok(release, 'uploads target an existing release');
      assert.ok(Buffer.isBuffer(content), 'asset bytes are uploaded directly');
      state.events.push({ method: 'UPLOAD', name, releaseId, size: content.length });
      if (name === state.failUploadOnce) {
        state.failUploadOnce = null;
        throw httpError(502, 'temporary upload failure');
      }
      assert.ok(!release.assets.some(asset => asset.name === name), 'existing assets are not uploaded twice');
      const asset = assetRecord(name, nextId++, content.length);
      release.assets.push(asset);
      return clone(asset);
    },
  };
  return { client, state };
}

function createPackager() {
  const calls = [];
  const packager = options => {
    calls.push(clone(options));
    return expectedAssetNames(options.tag).map(name => ({ name, content: Buffer.from(`built ${options.commitSha}: ${name}`) }));
  };
  return { calls, packager };
}

function publish(server, packager, overrides = {}) {
  return publishRelease({ client: server.client, repository, commitSha, ref: 'refs/heads/master', packager, ...overrides });
}

const tagCreations = state => state.events.filter(event => event.method === 'POST' && event.path === `${repoPath}/git/refs`);
const publications = state => state.events.filter(event => event.method === 'PATCH');
const uploads = state => state.events.filter(event => event.method === 'UPLOAD');

test('the first master release reserves a tag, uploads three assets to a draft, then publishes', async () => {
  const server = createServer();
  const { calls, packager } = createPackager();
  const result = await publish(server, packager, { distDir: '/fake/dist', outDir: '/fake/release' });

  assert.deepEqual(result, { tag: 'v0.0.1', version: '0.0.1', url: `https://github.example/${repository}/releases/tag/v0.0.1`, reused: false });
  assert.deepEqual(tagCreations(server.state).map(event => event.body), [{ ref: 'refs/tags/v0.0.1', sha: commitSha }]);
  assert.deepEqual(calls, [{ tag: 'v0.0.1', commitSha, repository, distDir: '/fake/dist', outDir: '/fake/release' }]);
  assert.deepEqual(uploads(server.state).map(event => event.name), expectedAssetNames('v0.0.1'));
  assert.deepEqual(publications(server.state).map(event => event.body), [{ draft: false, make_latest: 'true' }]);
  const events = server.state.events;
  const draftIndex = events.findIndex(event => event.method === 'POST' && event.path === `${repoPath}/releases`);
  const finalUploadIndex = events.findLastIndex(event => event.method === 'UPLOAD');
  const recheckIndex = events.findIndex((event, index) => index > finalUploadIndex && event.method === 'GET' && event.path === `${repoPath}/releases/${server.state.releases[0].id}`);
  const publishIndex = events.findIndex(event => event.method === 'PATCH');
  assert.ok(draftIndex < events.findIndex(event => event.method === 'UPLOAD'));
  assert.ok(finalUploadIndex < recheckIndex && recheckIndex < publishIndex, 'server assets are verified before publication');
  assert.equal(server.state.releases[0].draft, false);
});

test('an already published complete release is an idempotent no-op, including packaging', async () => {
  const tag = 'v1.2.3';
  const server = createServer({
    tags: [tagRecord(tag, commitSha)],
    releases: [releaseRecord(tag, { draft: false, assets: expectedAssetNames(tag).map((name, index) => assetRecord(name, index + 1)) })],
  });
  const { calls, packager } = createPackager();
  const result = await publish(server, packager);
  assert.equal(result.tag, tag);
  assert.equal(result.reused, true);
  assert.equal(calls.length, 0);
  assert.deepEqual(server.state.events.filter(event => event.method !== 'GET'), []);
});

test('a 422 tag reservation collision reloads tags and reserves the next version', async () => {
  const server = createServer({ collideOnce: true });
  const { calls, packager } = createPackager();
  const result = await publish(server, packager);
  assert.equal(result.tag, 'v0.0.2');
  assert.deepEqual(tagCreations(server.state).map(event => event.body.ref), ['refs/tags/v0.0.1', 'refs/tags/v0.0.2']);
  assert.deepEqual(server.state.tags, [tagRecord('v0.0.1', otherCommit), tagRecord('v0.0.2', commitSha)]);
  assert.deepEqual(calls.map(call => call.tag), ['v0.0.2']);
  assert.deepEqual(uploads(server.state).map(event => event.name), expectedAssetNames('v0.0.2'));
});

test('a 422 that is not an occupied tag remains an error rather than incrementing forever', async () => {
  const server = createServer();
  const { calls, packager } = createPackager();
  const request = server.client.request;
  server.client.request = async (method, path, body) => {
    if (method === 'POST' && path === `${repoPath}/git/refs`) throw httpError(422, 'Repository rules prohibit tag creation');
    return request(method, path, body);
  };
  await assert.rejects(publish(server, packager), /Repository rules prohibit tag creation/);
  assert.equal(calls.length, 0);
  assert.equal(server.state.tags.length, 0);
  assert.equal(server.state.releases.length, 0);
});

test('rerunning after an upload failure finishes the same tag without reuploading completed assets', async () => {
  const tag = 'v0.0.1';
  const server = createServer({ failUploadOnce: expectedAssetNames(tag)[1] });
  const { calls, packager } = createPackager();
  await assert.rejects(publish(server, packager), /temporary upload failure/);
  assert.equal(server.state.releases[0].draft, true);
  assert.deepEqual(server.state.releases[0].assets.map(asset => asset.name), [expectedAssetNames(tag)[0]]);
  assert.equal(publications(server.state).length, 0);
  const firstRunEventCount = server.state.events.length;

  const result = await publish(server, packager);
  assert.equal(result.tag, tag);
  assert.equal(result.reused, true);
  assert.equal(tagCreations(server.state).length, 1, 'the retry must not allocate +1');
  assert.deepEqual(calls.map(call => call.tag), [tag, tag]);
  assert.deepEqual(server.state.events.slice(firstRunEventCount).filter(event => event.method === 'UPLOAD').map(event => event.name), expectedAssetNames(tag).slice(1));
  assert.deepEqual(server.state.releases[0].assets.map(asset => asset.name), expectedAssetNames(tag));
  assert.equal(server.state.releases[0].draft, false);
});

test('an interrupted zero-byte asset is deleted and replaced before publication', async () => {
  const tag = 'v0.0.1';
  const names = expectedAssetNames(tag);
  const server = createServer({
    tags: [tagRecord(tag, commitSha)],
    releases: [releaseRecord(tag, { assets: [assetRecord(names[0], 1), assetRecord(names[1], 2, 0)] })],
  });
  const { packager } = createPackager();
  await publish(server, packager);
  const deletion = server.state.events.findIndex(event => event.method === 'DELETE' && event.path === `${repoPath}/releases/assets/2`);
  const replacement = server.state.events.findIndex(event => event.method === 'UPLOAD' && event.name === names[1]);
  assert.ok(deletion >= 0 && deletion < replacement);
  assert.deepEqual(uploads(server.state).map(event => event.name), names.slice(1));
  assert.equal(server.state.releases[0].assets.length, 3);
});

test('a manual tag whose commit is outside master history is rejected before any mutation', async () => {
  const server = createServer({ tags: [tagRecord('v2.0.0', commitSha)], masterSha: newestCommit, comparison: 'diverged' });
  const { calls, packager } = createPackager();
  await assert.rejects(publish(server, packager, { ref: 'refs/tags/v2.0.0' }), /must belong to master history/);
  assert.equal(calls.length, 0);
  assert.deepEqual(server.state.events.filter(event => event.method !== 'GET'), []);
  assert.equal(server.state.releases.length, 0);
});

test('an older parallel commit can publish but cannot replace current master as latest', async () => {
  const server = createServer({ masterSha: newestCommit, comparison: 'ahead' });
  const { packager } = createPackager();
  const result = await publish(server, packager);
  assert.equal(result.tag, 'v0.0.1');
  assert.deepEqual(publications(server.state).map(event => event.body), [{ draft: false, make_latest: 'false' }]);
});

test('master moving during asset upload is rechecked before assigning latest', async () => {
  const server = createServer();
  const upload = server.client.upload;
  server.client.upload = async (url, content) => {
    const result = await upload(url, content);
    server.state.masterSha = newestCommit;
    return result;
  };
  const { packager } = createPackager();
  await publish(server, packager);
  assert.equal(publications(server.state)[0].body.make_latest, 'false');
});

test('a higher published stable release prevents an old resumed release taking latest', async () => {
  const server = createServer({
    tags: [tagRecord('v1.0.1', commitSha), tagRecord('v2.0.0', newestCommit)],
    releases: [releaseRecord('v2.0.0', { draft: false, assets: expectedAssetNames('v2.0.0').map((name, index) => assetRecord(name, index + 1)) })],
  });
  const { packager } = createPackager();
  const result = await publish(server, packager);
  assert.equal(result.tag, 'v1.0.1');
  assert.equal(tagCreations(server.state).length, 0);
  assert.equal(publications(server.state)[0].body.make_latest, 'false');
});

test('a higher draft release does not stop the current successful master release becoming latest', async () => {
  const server = createServer({
    tags: [tagRecord('v1.0.1', commitSha), tagRecord('v2.0.0', newestCommit)],
    releases: [releaseRecord('v2.0.0', { draft: true })],
  });
  const { packager } = createPackager();
  const result = await publish(server, packager);
  assert.equal(result.tag, 'v1.0.1');
  assert.equal(publications(server.state)[0].body.make_latest, 'true');
  assert.equal(server.state.releases.find(release => release.tag_name === 'v2.0.0').draft, true);
});

test('a manual v2.0.0 event publishes exactly that tag without automatic patch advancement', async () => {
  const server = createServer({ tags: [tagRecord('v1.9.9'), tagRecord('v2.0.0', commitSha)] });
  const { calls, packager } = createPackager();
  const result = await publish(server, packager, { ref: 'refs/tags/v2.0.0' });
  assert.equal(result.tag, 'v2.0.0');
  assert.equal(result.version, '2.0.0');
  assert.equal(result.reused, true);
  assert.equal(tagCreations(server.state).length, 0);
  assert.deepEqual(calls.map(call => call.tag), ['v2.0.0']);
  assert.deepEqual(uploads(server.state).map(event => event.name), expectedAssetNames('v2.0.0'));
  assert.equal(publications(server.state)[0].body.make_latest, 'true');
});

test('tag pagination includes older pages when choosing the highest version', async () => {
  const tags = Array.from({ length: 100 }, (_, index) => tagRecord(`unrelated-${index}`));
  tags.push(tagRecord('v7.8.9'));
  const server = createServer({ tags });
  const { packager } = createPackager();
  const result = await publish(server, packager);
  assert.equal(result.tag, 'v7.8.10');
  assert.ok(server.state.events.some(event => event.path === `${repoPath}/tags?per_page=100&page=2`));
});

test('draft recovery pages through authenticated release listings when by-tag returns 404', async () => {
  const tag = 'v1.2.3';
  const irrelevant = Array.from({ length: 100 }, (_, index) => releaseRecord(`historical-${index}`, { id: index + 1000, draft: false }));
  const server = createServer({ tags: [tagRecord(tag, commitSha)], releases: [...irrelevant, releaseRecord(tag, { id: 2000 })] });
  const { packager } = createPackager();
  const result = await publish(server, packager);
  assert.equal(result.tag, tag);
  assert.ok(server.state.events.some(event => event.path === `${repoPath}/releases?per_page=100&page=2`));
  assert.equal(server.state.events.filter(event => event.method === 'POST' && event.path === `${repoPath}/releases`).length, 0);
  assert.equal(server.state.releases.find(release => release.id === 2000).draft, false);
});

test('a concurrent draft creation collision recovers the same draft and completes it', async () => {
  const server = createServer();
  const request = server.client.request;
  let collide = true;
  server.client.request = async (method, path, body) => {
    const result = await request(method, path, body);
    if (collide && method === 'POST' && path === `${repoPath}/releases`) {
      collide = false;
      // Another workflow created this server-side draft after the initial lookup.
      throw httpError(422, 'Release already exists');
    }
    return result;
  };
  const { packager } = createPackager();
  const result = await publish(server, packager);
  assert.equal(result.tag, 'v0.0.1');
  assert.equal(server.state.releases.length, 1);
  assert.equal(server.state.releases[0].draft, false);
  assert.deepEqual(server.state.releases[0].assets.map(asset => asset.name), expectedAssetNames('v0.0.1'));
  assert.equal(tagCreations(server.state).length, 1);
});

test('a concurrent asset upload collision is accepted only after the server confirms the asset exists', async () => {
  const server = createServer();
  const upload = server.client.upload;
  let collide = true;
  server.client.upload = async (url, content) => {
    const result = await upload(url, content);
    if (collide) {
      collide = false;
      // Another workflow finished this upload after this client read the draft.
      throw httpError(422, 'Asset already exists');
    }
    return result;
  };
  const { packager } = createPackager();
  const result = await publish(server, packager);
  assert.equal(result.tag, 'v0.0.1');
  assert.equal(server.state.releases[0].assets.length, 3);
  assert.equal(server.state.releases[0].draft, false);
  const firstUpload = server.state.events.findIndex(event => event.method === 'UPLOAD');
  const serverCheck = server.state.events.findIndex((event, index) => index > firstUpload && event.method === 'GET' && event.path === `${repoPath}/releases/${server.state.releases[0].id}`);
  assert.ok(serverCheck > firstUpload);
});

test('an upload 422 without a successfully uploaded asset is not silently ignored', async () => {
  const server = createServer();
  server.client.upload = async () => { throw httpError(422, 'Asset upload rejected'); };
  const { packager } = createPackager();
  await assert.rejects(publish(server, packager), /Asset upload rejected/);
  assert.equal(server.state.releases[0].draft, true);
  assert.equal(publications(server.state).length, 0);
});

test('concurrent successful draft creations converge on the oldest draft and remove only this run’s empty duplicate', async () => {
  const server = createServer();
  const request = server.client.request;
  server.client.request = async (method, path, body) => {
    const result = await request(method, path, body);
    if (method === 'POST' && path === `${repoPath}/releases`) {
      server.state.releases.push(releaseRecord(body.tag_name, { id: 99 }));
      server.state.releases.push(releaseRecord('v9.0.0', { id: 98 }));
    }
    return result;
  };
  const { packager } = createPackager();
  await publish(server, packager);
  assert.deepEqual(server.state.events.filter(event => event.method === 'DELETE').map(event => event.path), [`${repoPath}/releases/100`]);
  assert.ok(uploads(server.state).every(event => event.releaseId === 99));
  assert.equal(server.state.releases.find(release => release.id === 99).draft, false);
  assert.ok(server.state.releases.some(release => release.id === 98), 'an unrelated existing draft must be preserved');
  assert.ok(!server.state.releases.some(release => release.id === 100));
});

test('a publish collision reuses a complete published release and cleans up only its own duplicate', async () => {
  const server = createServer();
  const request = server.client.request;
  server.client.request = async (method, path, body) => {
    if (method === 'PATCH') {
      const own = server.state.releases[0];
      server.state.releases.push(releaseRecord(own.tag_name, { id: 99, draft: false, assets: clone(own.assets) }));
      throw httpError(422, 'Release already published by another workflow');
    }
    return request(method, path, body);
  };
  const { packager } = createPackager();
  const result = await publish(server, packager);
  assert.equal(result.tag, 'v0.0.1');
  assert.equal(server.state.releases.length, 1);
  assert.equal(server.state.releases[0].id, 99);
  assert.equal(server.state.releases[0].draft, false);
  assert.deepEqual(server.state.events.filter(event => event.method === 'DELETE').map(event => event.path), [`${repoPath}/releases/100`]);
});

function extractedFiles(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? extractedFiles(join(directory, entry.name), relative) : [relative];
  }).sort();
}

test('packageRelease produces deployable ZIP and tar.gz archives with a manifest and verifiable SHA256SUMS', t => {
  const root = mkdtempSync(join(tmpdir(), 'zhongguose-package-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const distDir = join(root, 'dist');
  const outDir = join(root, 'release');
  mkdirSync(join(distDir, 'assets'), { recursive: true });
  writeFileSync(join(distDir, 'index.html'), '<!doctype html><title>中国色</title>\n');
  writeFileSync(join(distDir, 'assets', 'main.js'), 'console.log("中国色");\n');
  writeFileSync(join(distDir, 'assets', 'font.woff2'), Buffer.from([0, 1, 2, 255]));
  // A build-time manifest must not conceal the release's real source commit.
  writeFileSync(join(distDir, 'release.json'), '{"commit":"stale"}\n');

  const options = { tag: 'v2.0.0', commitSha, repository, distDir, outDir };
  const assets = packageRelease(options);
  assert.deepEqual(assets.map(asset => asset.name), expectedAssetNames(options.tag));
  for (const asset of assets) {
    assert.ok(asset.content.length > 0);
    assert.deepEqual(readFileSync(join(outDir, asset.name)), asset.content);
  }
  const checksumLines = assets[2].content.toString('utf8').trimEnd().split('\n');
  assert.deepEqual(checksumLines, assets.slice(0, 2).map(asset => `${createHash('sha256').update(asset.content).digest('hex')}  ${asset.name}`));

  const expectedFiles = ['assets/font.woff2', 'assets/main.js', 'index.html', 'release.json'];
  const zipPath = join(outDir, assets[0].name);
  const tarPath = join(outDir, assets[1].name);
  const zipExtract = join(root, 'zip-extracted');
  const tarExtract = join(root, 'tar-extracted');
  mkdirSync(tarExtract);
  execFileSync('unzip', ['-q', zipPath, '-d', zipExtract], { stdio: 'inherit', timeout: 60000 });
  execFileSync('tar', ['-xzf', tarPath, '-C', tarExtract], { stdio: 'inherit', timeout: 60000 });
  assert.deepEqual(extractedFiles(zipExtract), expectedFiles);
  assert.deepEqual(extractedFiles(tarExtract), expectedFiles);
  const expectedManifest = { version: '2.0.0', tag: 'v2.0.0', commit: commitSha, repository };
  for (const extracted of [zipExtract, tarExtract]) {
    assert.deepEqual(JSON.parse(readFileSync(join(extracted, 'release.json'), 'utf8')), expectedManifest);
    for (const file of expectedFiles.filter(name => name !== 'release.json')) {
      assert.deepEqual(readFileSync(join(extracted, file)), readFileSync(join(distDir, file)));
    }
  }
  assert.equal(JSON.parse(readFileSync(join(distDir, 'release.json'), 'utf8')).commit, 'stale', 'packaging leaves the original build directory untouched');

  // A retry must not vary because a build copy has different file modes/mtimes.
  chmodSync(join(distDir, 'index.html'), 0o600);
  utimesSync(join(distDir, 'index.html'), 1700000000, 1700000000);
  const repeated = packageRelease(options);
  assert.deepEqual(repeated, assets);

  // zip updates existing files by default: rebuilding the same output must also
  // discard files removed from dist, rather than preserving stale archive entries.
  rmSync(join(distDir, 'assets', 'main.js'));
  packageRelease(options);
  const rebuiltExtract = join(root, 'rebuilt-extracted');
  execFileSync('unzip', ['-q', zipPath, '-d', rebuiltExtract], { stdio: 'inherit', timeout: 60000 });
  assert.deepEqual(extractedFiles(rebuiltExtract), expectedFiles.filter(name => name !== 'assets/main.js'));
});

test('packageRelease fails clearly for an invalid tag or missing build output', t => {
  const root = mkdtempSync(join(tmpdir(), 'zhongguose-missing-dist-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const options = { commitSha, repository, distDir: join(root, 'missing-dist'), outDir: join(root, 'release') };
  assert.throws(() => packageRelease({ ...options, tag: 'v2.0.0-rc.1' }), /Invalid release tag/);
  assert.throws(() => packageRelease({ ...options, tag: 'v2.0.0' }), /dist\/index.html is missing/);
});
