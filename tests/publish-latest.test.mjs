import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { publishLatest } from '../scripts/publish-latest.mjs';

const repository = 'example/zhongguose';
const repoPath = `/repos/${repository}`;
const oldSha = 'a'.repeat(40);
const newSha = 'b'.repeat(40);
const newestSha = 'c'.repeat(40);
const serverNames = ['dist-vlatest.zip', 'dist-vlatest.zip.sha256'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = value => structuredClone(value);
const httpError = (status, message) => Object.assign(new Error(message), { status });

// Archive construction is tested in server-package.test.mjs. These deterministic
// bytes let publisher tests verify exactly which version and checksum were sent.
function serverAssets(tag, commit) {
  const zip = Buffer.from(`dist/index.html\nversion=${tag.slice(1)}\ncommit=${commit}\n`);
  return [
    { name: serverNames[0], content: zip },
    { name: serverNames[1], content: Buffer.from(`${sha256(zip)}  ${serverNames[0]}\n`) },
  ];
}

function stable(tag = 'v1.0.0', commit = oldSha, id = 10) {
  const zip = Buffer.from(`versioned source ZIP ${tag} ${commit}`);
  const zipName = `zhongguose-${tag}.zip`;
  return {
    commit,
    release: {
      id, tag_name: tag, draft: false, prerelease: false,
      published_at: '2026-11-18T00:40:43Z',
      html_url: `https://github.example/${repository}/releases/tag/${tag}`,
      assets: [
        { id: id * 10 + 1, name: zipName, size: zip.length, url: `https://api.example/assets/${id * 10 + 1}` },
        { id: id * 10 + 2, name: 'SHA256SUMS.txt', size: 1, url: `https://api.example/assets/${id * 10 + 2}` },
      ],
    },
    bytes: [zip, Buffer.from(`${sha256(zip)}  ${zipName}\n`)],
  };
}

function createServer({ sources = [stable()], currentIndex = 0, rollingSource = null, draft = false, immutable = false, withDigests = true } = {}) {
  const state = {
    sources, currentId: sources[currentIndex].release.id,
    releases: sources.map(source => clone(source.release)),
    tags: new Map(sources.map(source => [source.release.tag_name, { type: 'commit', sha: source.commit }])),
    bytes: new Map(), events: [], uploadFailure: null, withDigests,
  };
  let nextId = 1000;
  const assetRecord = (name, content) => {
    const id = nextId++;
    state.bytes.set(id, Buffer.from(content));
    return {
      id, name, size: content.length, url: `https://api.example/assets/${id}`,
      ...(state.withDigests ? { digest: `sha256:${sha256(content)}` } : {}),
    };
  };
  for (const source of sources) {
    source.release.assets.forEach((asset, index) => state.bytes.set(asset.id, Buffer.from(source.bytes[index])));
  }
  const makeRolling = (commit, id = 500) => ({
    id, tag_name: 'latest', draft: true, prerelease: false, immutable: false, assets: [],
    html_url: `https://github.example/${repository}/releases/tag/latest`,
    upload_url: `https://uploads.example${repoPath}/releases/${id}/assets{?name,label}`,
    target_commitish: commit, body: '',
  });
  if (rollingSource) {
    const release = makeRolling(rollingSource.commit);
    const assets = serverAssets(rollingSource.release.tag_name, rollingSource.commit);
    Object.assign(release, {
      draft, immutable,
      name: `Latest · ${rollingSource.release.tag_name}`,
      body: `<!-- zhongguose-latest:${JSON.stringify({ tag: rollingSource.release.tag_name, commit: rollingSource.commit, sha256: sha256(assets[0].content) })} -->`,
      assets: assets.map(asset => assetRecord(asset.name, asset.content)),
    });
    state.releases.push(release);
    state.tags.set('latest', { type: 'commit', sha: rollingSource.commit });
  }
  const client = {
    async request(method, path, body) {
      state.events.push({ method, path, body: clone(body) });
      if (method === 'GET' && path === `${repoPath}/releases/latest`) {
        const source = state.releases.find(release => release.id === state.currentId);
        assert.ok(source, 'the simulated GitHub current release exists');
        return clone(source);
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
      if (method === 'GET' && path.startsWith(`${repoPath}/git/ref/tags/`)) {
        const tag = decodeURIComponent(path.slice(`${repoPath}/git/ref/tags/`.length));
        const object = state.tags.get(tag);
        if (!object) throw httpError(404, 'Not Found');
        return { ref: `refs/tags/${tag}`, object: clone(object) };
      }
      if (method === 'POST' && path === `${repoPath}/git/refs`) {
        assert.equal(body.ref, 'refs/tags/latest', 'only the mutable alias may be created');
        assert.ok(!state.tags.has('latest'));
        const object = { type: 'commit', sha: body.sha };
        state.tags.set('latest', object);
        return { ref: body.ref, object: clone(object) };
      }
      if (method === 'PATCH' && path.startsWith(`${repoPath}/git/refs/`)) {
        assert.equal(path, `${repoPath}/git/refs/tags/latest`, 'stable version tags must never move');
        assert.equal(body.force, true);
        const object = { type: 'commit', sha: body.sha };
        state.tags.set('latest', object);
        return { ref: 'refs/tags/latest', object: clone(object) };
      }
      if (method === 'POST' && path === `${repoPath}/releases`) {
        assert.equal(body.tag_name, 'latest');
        assert.equal(body.draft, true);
        assert.equal(body.make_latest, 'false', 'the alias must not replace GitHub current stable');
        const release = Object.assign(makeRolling(body.target_commitish, nextId++), body);
        state.releases.push(release);
        return clone(release);
      }
      const assetMatch = path.match(/\/releases\/assets\/(\d+)$/);
      if (method === 'DELETE' && assetMatch) {
        for (const release of state.releases) {
          release.assets = release.assets.filter(asset => asset.id !== Number(assetMatch[1]));
        }
        state.bytes.delete(Number(assetMatch[1]));
        return null;
      }
      const releaseMatch = path.match(/\/releases\/(\d+)$/);
      if (releaseMatch) {
        const release = state.releases.find(item => item.id === Number(releaseMatch[1]));
        assert.ok(release, `release exists: ${path}`);
        if (method === 'GET') return clone(release);
        if (method === 'PATCH') {
          assert.equal(release.tag_name, 'latest', 'stable release metadata is immutable to this publisher');
          assert.equal(body.make_latest, 'false');
          assert.ok(serverNames.every(name => release.assets.some(asset => asset.name === name && asset.size > 0)), 'publishing the alias requires both assets');
          Object.assign(release, body);
          return clone(release);
        }
      }
      throw new Error(`Unexpected mock API call: ${method} ${path}`);
    },
    async download(asset) {
      state.events.push({ method: 'DOWNLOAD', id: asset.id, name: asset.name });
      const bytes = state.bytes.get(asset.id);
      assert.ok(bytes, `downloaded asset exists: ${asset.name}`);
      return Buffer.from(bytes);
    },
    async upload(url, content) {
      const target = new URL(url);
      assert.equal(target.origin, 'https://uploads.example');
      const releaseId = Number(target.pathname.match(/\/releases\/(\d+)\/assets$/)?.[1]);
      const release = state.releases.find(item => item.id === releaseId);
      const name = target.searchParams.get('name');
      assert.ok(release);
      assert.equal(release.tag_name, 'latest');
      assert.ok(Buffer.isBuffer(content));
      state.events.push({ method: 'UPLOAD', releaseId, name, content: Buffer.from(content) });
      if (state.uploadFailure === name) {
        state.uploadFailure = null;
        throw httpError(502, 'temporary latest upload failure');
      }
      assert.ok(!release.assets.some(asset => asset.name === name), 'old assets are removed before replacement');
      const asset = assetRecord(name, content);
      release.assets.push(asset);
      return clone(asset);
    },
  };
  return { client, state };
}

function createPackager(onPackage) {
  const calls = [];
  const packager = options => {
    calls.push({ ...options, sourceZip: Buffer.from(options.sourceZip) });
    onPackage?.(options, calls.length);
    return serverAssets(`v${options.expectedVersion}`, options.expectedCommit);
  };
  return { calls, packager };
}

const publish = (server, packager, extra = {}) => publishLatest({ client: server.client, repository, packager, ...extra });
const mutations = state => state.events.filter(event => ['POST', 'PATCH', 'DELETE', 'UPLOAD'].includes(event.method));
const uploadedNames = state => state.events.filter(event => event.method === 'UPLOAD').map(event => event.name);
const rollingRelease = state => state.releases.find(release => release.tag_name === 'latest');
const metadata = release => JSON.parse(/<!-- zhongguose-latest:({[^\n]*}) -->/.exec(release.body)[1]);

test('first publication creates a latest draft, uploads ZIP then SHA, and keeps GitHub latest on the stable release', async () => {
  const source = stable();
  const server = createServer({ sources: [source] });
  const { calls, packager } = createPackager();
  const result = await publish(server, packager, { outDir: '/fake/latest-output' });
  assert.equal(result.sourceTag, source.release.tag_name);
  assert.equal(result.reused, false);
  assert.equal(rollingRelease(server.state).draft, false);
  assert.deepEqual(uploadedNames(server.state), serverNames);
  assert.equal(server.state.currentId, source.release.id);
  assert.deepEqual(server.state.tags.get('latest'), { type: 'commit', sha: source.commit });
  assert.deepEqual(calls, [{
    sourceZip: source.bytes[0], sourceChecksums: source.bytes[1].toString('utf8'),
    sourceZipName: 'zhongguose-v1.0.0.zip', expectedVersion: '1.0.0', expectedCommit: source.commit,
    publishedAt: source.release.published_at, outDir: '/fake/latest-output',
  }]);
  const releaseWrites = mutations(server.state).filter(event => event.path === `${repoPath}/releases` || event.path === `${repoPath}/releases/${rollingRelease(server.state).id}`);
  assert.equal(releaseWrites.length, 2);
  assert.ok(releaseWrites.every(event => event.body.make_latest === 'false'));
  assert.deepEqual(metadata(rollingRelease(server.state)), { tag: source.release.tag_name, commit: source.commit, sha256: sha256(serverAssets(source.release.tag_name, source.commit)[0].content) });
});

test('updating latest replaces ZIP before SHA and moves only the latest tag after both assets verify', async () => {
  const oldSource = stable('v1.0.0', oldSha, 10);
  const newSource = stable('v1.0.1', newSha, 20);
  const server = createServer({ sources: [oldSource, newSource], currentIndex: 1, rollingSource: oldSource });
  const oldAssets = clone(rollingRelease(server.state).assets);
  const stableBefore = clone(server.state.releases.filter(release => release.tag_name !== 'latest'));
  const { packager } = createPackager();
  await publish(server, packager);
  assert.deepEqual(uploadedNames(server.state), serverNames);
  const writes = mutations(server.state);
  assert.deepEqual(writes.slice(0, 4).map(event => event.method === 'UPLOAD' ? `UPLOAD ${event.name}` : `${event.method} ${event.path}`), [
    `DELETE ${repoPath}/releases/assets/${oldAssets[0].id}`, `UPLOAD ${serverNames[0]}`,
    `DELETE ${repoPath}/releases/assets/${oldAssets[1].id}`, `UPLOAD ${serverNames[1]}`,
  ]);
  const refWrites = writes.filter(event => event.path?.includes('/git/'));
  assert.deepEqual(refWrites.map(event => ({ method: event.method, path: event.path, body: event.body })), [
    { method: 'PATCH', path: `${repoPath}/git/refs/tags/latest`, body: { sha: newSha, force: true } },
  ]);
  assert.ok(writes.indexOf(refWrites[0]) > writes.findLastIndex(event => event.method === 'UPLOAD'));
  assert.equal(server.state.tags.get('v1.0.0').sha, oldSha);
  assert.equal(server.state.tags.get('v1.0.1').sha, newSha);
  assert.deepEqual(server.state.releases.filter(release => release.tag_name !== 'latest'), stableBefore);
  assert.equal(metadata(rollingRelease(server.state)).tag, 'v1.0.1');
});

test('an identical source and verified assets make reruns completely read-only', async () => {
  const source = stable('v1.2.3', newSha);
  const server = createServer({ sources: [source], rollingSource: source });
  const { calls, packager } = createPackager();
  const result = await publish(server, packager);
  assert.equal(result.reused, true);
  assert.equal(calls.length, 1, 'deterministic expected bytes are checked before skipping');
  assert.deepEqual(mutations(server.state), []);
});

test('legacy assets without GitHub digests are downloaded and checked before an idempotent skip', async () => {
  const source = stable();
  const server = createServer({ sources: [source], rollingSource: source, withDigests: false });
  const existingIds = rollingRelease(server.state).assets.map(asset => asset.id);
  const { packager } = createPackager();
  const result = await publish(server, packager);
  assert.equal(result.reused, true);
  assert.ok(existingIds.every(id => server.state.events.some(event => event.method === 'DOWNLOAD' && event.id === id)));
  assert.deepEqual(mutations(server.state), []);
});

test('a source checksum rejection propagates from the packager before any GitHub mutation', async () => {
  const source = stable();
  const server = createServer({ sources: [source] });
  const invalidChecksums = 'incorrect source checksum\n';
  server.state.bytes.set(source.release.assets[1].id, Buffer.from(invalidChecksums));
  let packageCalls = 0;
  const packager = options => {
    packageCalls++;
    assert.equal(options.sourceChecksums, invalidChecksums);
    assert.deepEqual(options.sourceZip, source.bytes[0]);
    throw new Error('Source ZIP SHA-256 checksum mismatch');
  };
  await assert.rejects(publish(server, packager), /Source ZIP SHA-256 checksum mismatch/);
  assert.equal(packageCalls, 1);
  assert.deepEqual(mutations(server.state), []);
  assert.ok(!server.state.tags.has('latest'));
});

test('rerunning an old workflow selects GitHub current stable each time instead of GITHUB_SHA', async () => {
  const previousEnvSha = process.env.GITHUB_SHA;
  process.env.GITHUB_SHA = oldSha;
  try {
    const first = stable('v1.0.1', newSha, 20);
    const second = stable('v1.0.2', newestSha, 30);
    const server = createServer({ sources: [first, second] });
    const { calls, packager } = createPackager();
    await publish(server, packager);
    server.state.currentId = second.release.id;
    const result = await publish(server, packager);
    assert.deepEqual(calls.map(call => call.expectedCommit), [newSha, newestSha]);
    assert.deepEqual(calls.map(call => call.expectedVersion), ['1.0.1', '1.0.2']);
    assert.equal(result.sourceTag, 'v1.0.2');
    assert.equal(server.state.tags.get('latest').sha, newestSha);
    assert.ok(!server.state.events.some(event => event.path?.includes(oldSha)), 'workflow SHA is never used to select or move the alias');
  } finally {
    if (previousEnvSha === undefined) delete process.env.GITHUB_SHA;
    else process.env.GITHUB_SHA = previousEnvSha;
  }
});

test('numeric version ordering prevents v1.9.99 from rolling latest back from v1.10.0', async () => {
  const lower = stable('v1.9.99', oldSha, 10);
  const higher = stable('v1.10.0', newSha, 20);
  const server = createServer({ sources: [lower, higher], rollingSource: higher });
  const { calls, packager } = createPackager();
  const result = await publish(server, packager);
  assert.equal(result.skipped, true);
  assert.equal(result.sourceTag, 'v1.10.0');
  assert.equal(calls.length, 0);
  assert.deepEqual(mutations(server.state), []);
  assert.equal(server.state.tags.get('latest').sha, newSha);
});

test('numeric version ordering permits advancing latest from v1.9.99 to v1.10.0', async () => {
  const lower = stable('v1.9.99', oldSha, 10);
  const higher = stable('v1.10.0', newSha, 20);
  const server = createServer({ sources: [lower, higher], currentIndex: 1, rollingSource: lower });
  const { packager } = createPackager();
  const result = await publish(server, packager);
  assert.equal(result.sourceTag, 'v1.10.0');
  assert.equal(server.state.tags.get('latest').sha, newSha);
});

test('a stable release changing while packaging is reselected before uploading any bytes', async () => {
  const first = stable('v1.0.0', oldSha, 10);
  const second = stable('v1.0.1', newSha, 20);
  const server = createServer({ sources: [first, second] });
  const { calls, packager } = createPackager((_options, callNumber) => {
    if (callNumber === 1) server.state.currentId = second.release.id;
  });
  const result = await publish(server, packager);
  assert.equal(result.sourceTag, 'v1.0.1');
  assert.deepEqual(calls.map(call => call.expectedVersion), ['1.0.0', '1.0.1']);
  const uploadEvents = server.state.events.filter(event => event.method === 'UPLOAD');
  assert.equal(uploadEvents.length, 2);
  assert.deepEqual(uploadEvents.map(event => event.content), serverAssets('v1.0.1', newSha).map(asset => asset.content));
  assert.equal(server.state.tags.get('latest').sha, newSha);
  assert.equal(server.state.events.filter(event => event.method === 'POST' && event.path === `${repoPath}/git/refs`).length, 1);
});

test('continually changing stable releases fail without creating a tag or partial release', async () => {
  const first = stable('v1.0.0', oldSha, 10);
  const second = stable('v1.0.1', newSha, 20);
  const server = createServer({ sources: [first, second] });
  const { calls, packager } = createPackager(() => {
    server.state.currentId = server.state.currentId === first.release.id ? second.release.id : first.release.id;
  });
  await assert.rejects(publish(server, packager), /Stable release kept changing/);
  assert.equal(calls.length, 5);
  assert.deepEqual(mutations(server.state), []);
});

test('an interrupted SHA upload is repaired on rerun without reuploading the verified ZIP', async () => {
  const previous = stable('v1.0.0', oldSha, 10);
  const current = stable('v1.0.1', newSha, 20);
  const server = createServer({ sources: [previous, current], currentIndex: 1, rollingSource: previous });
  server.state.uploadFailure = serverNames[1];
  const { packager } = createPackager();
  await assert.rejects(publish(server, packager), /temporary latest upload failure/);
  assert.equal(server.state.tags.get('latest').sha, oldSha, 'alias is not moved before the checksum finishes');
  assert.equal(metadata(rollingRelease(server.state)).tag, 'v1.0.0');
  assert.deepEqual(rollingRelease(server.state).assets.map(asset => asset.name), [serverNames[0]]);
  const firstRunEventCount = server.state.events.length;

  const result = await publish(server, packager);
  assert.equal(result.sourceTag, 'v1.0.1');
  assert.deepEqual(server.state.events.slice(firstRunEventCount).filter(event => event.method === 'UPLOAD').map(event => event.name), [serverNames[1]]);
  assert.deepEqual(rollingRelease(server.state).assets.map(asset => asset.name), serverNames);
  assert.equal(server.state.tags.get('latest').sha, newSha);
  assert.equal(metadata(rollingRelease(server.state)).tag, 'v1.0.1');
});

test('an interrupted first publication resumes its draft from authenticated listings after by-tag 404', async () => {
  const server = createServer();
  server.state.uploadFailure = serverNames[1];
  const { packager } = createPackager();
  await assert.rejects(publish(server, packager), /temporary latest upload failure/);
  const draftId = rollingRelease(server.state).id;
  assert.equal(rollingRelease(server.state).draft, true);
  const offset = server.state.events.length;
  await publish(server, packager);
  assert.equal(rollingRelease(server.state).id, draftId);
  assert.equal(rollingRelease(server.state).draft, false);
  assert.ok(server.state.events.slice(offset).some(event => event.path === `${repoPath}/releases?per_page=100&page=1`));
  assert.equal(server.state.events.filter(event => event.method === 'POST' && event.path === `${repoPath}/releases`).length, 1);
  assert.equal(server.state.events.filter(event => event.method === 'POST' && event.path === `${repoPath}/git/refs`).length, 1);
  assert.deepEqual(server.state.events.slice(offset).filter(event => event.method === 'UPLOAD').map(event => event.name), [serverNames[1]]);
});

test('an immutable latest release is rejected without packaging, asset deletion, or tag movement', async () => {
  const source = stable();
  const server = createServer({ sources: [source], rollingSource: source, immutable: true });
  const { calls, packager } = createPackager();
  await assert.rejects(publish(server, packager), /latest release is immutable/);
  assert.equal(calls.length, 0);
  assert.deepEqual(mutations(server.state), []);
});

test('the current release must be a stable published version rather than latest, a draft, or a prerelease', async () => {
  for (const change of [{ tag_name: 'latest' }, { draft: true }, { prerelease: true }, { tag_name: 'v1.0.0-rc.1' }]) {
    const server = createServer();
    Object.assign(server.state.releases[0], change);
    const { calls, packager } = createPackager();
    await assert.rejects(publish(server, packager), /GitHub latest must identify a published stable/);
    assert.equal(calls.length, 0);
    assert.deepEqual(mutations(server.state), []);
  }
});

test('missing or invalid publication time is rejected before changing server assets', async () => {
  for (const published_at of [undefined, null, 'invalid-date']) {
    const server = createServer();
    server.state.releases[0].published_at = published_at;
    const { calls, packager } = createPackager();
    await assert.rejects(publish(server, packager), /valid publication time/);
    assert.equal(calls.length, 0);
    assert.deepEqual(mutations(server.state), []);
  }
});

test('missing source assets and malformed package outputs fail before any alias mutation', async () => {
  const missing = createServer();
  missing.state.releases[0].assets = missing.state.releases[0].assets.filter(asset => asset.name !== 'SHA256SUMS.txt');
  const { calls, packager } = createPackager();
  await assert.rejects(publish(missing, packager), /missing its ZIP or SHA256SUMS/);
  assert.equal(calls.length, 0);
  assert.deepEqual(mutations(missing.state), []);

  const invalidPackage = createServer();
  await assert.rejects(publish(invalidPackage, () => [{ name: serverNames[0], content: Buffer.from('no checksum') }]), /must include ZIP and its SHA256/);
  assert.deepEqual(mutations(invalidPackage.state), []);
});

test('upload verification rejects corrupt bytes before publishing metadata or moving an existing alias', async () => {
  const previous = stable('v1.0.0', oldSha, 10);
  const current = stable('v1.0.1', newSha, 20);
  const server = createServer({ sources: [previous, current], currentIndex: 1, rollingSource: previous });
  const upload = server.client.upload;
  server.client.upload = async (url, content) => {
    const uploaded = await upload(url, content);
    return { ...uploaded, digest: `sha256:${'0'.repeat(64)}` };
  };
  const { packager } = createPackager();
  await assert.rejects(publish(server, packager), /Uploaded server asset failed verification/);
  assert.equal(server.state.tags.get('latest').sha, oldSha);
  assert.equal(metadata(rollingRelease(server.state)).tag, 'v1.0.0');
  assert.ok(!mutations(server.state).some(event => event.method === 'PATCH'));
});
