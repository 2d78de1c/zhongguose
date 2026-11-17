import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, chmodSync, cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compareVersions, parseVersion, selectReleaseVersion } from './release-version.mjs';

export class GitHubClient {
  constructor(token, apiUrl = 'https://api.github.com') {
    this.token = token;
    this.apiUrl = apiUrl.replace(/\/$/, '');
  }
  async request(method, path, body) {
    return this.send(method, `${this.apiUrl}${path}`, body === undefined ? undefined : JSON.stringify(body), 'application/json');
  }
  async upload(url, content) { return this.send('POST', url, content, 'application/octet-stream'); }
  async send(method, url, body, contentType) {
    const response = await fetch(url, {
      method, body,
      headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': contentType },
      signal: AbortSignal.timeout(120000),
    });
    const text = await response.text();
    const result = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const error = new Error(`GitHub ${method} ${new URL(url).pathname}: ${response.status} ${result?.message || response.statusText}`);
      error.status = response.status;
      throw error;
    }
    return result;
  }
}

export function expectedAssetNames(tag) {
  return [`zhongguose-${tag}.zip`, `zhongguose-${tag}.tar.gz`, 'SHA256SUMS.txt'];
}

// Normalize timestamps and modes so a retry produces the same archive bytes.
export function packageRelease({ tag, commitSha, repository, distDir = 'dist', outDir = 'release' }) {
  if (!parseVersion(tag)) throw new Error('Invalid release tag');
  if (!existsSync(join(distDir, 'index.html'))) throw new Error('Build output dist/index.html is missing');
  mkdirSync(outDir, { recursive: true });
  const stage = mkdtempSync(join(tmpdir(), 'zhongguose-release-'));
  try {
    cpSync(distDir, stage, { recursive: true });
    writeFileSync(join(stage, 'release.json'), JSON.stringify({ version: tag.slice(1), tag, commit: commitSha, repository }, null, 2) + '\n');
    const files = [];
    const visit = directory => {
      for (const name of readdirSync(join(stage, directory)).sort()) {
        const relative = directory ? `${directory}/${name}` : name;
        const path = join(stage, relative);
        if (statSync(path).isDirectory()) visit(relative);
        else { files.push(relative); chmodSync(path, 0o644); utimesSync(path, 315532800, 315532800); }
      }
      chmodSync(join(stage, directory), 0o755);
      utimesSync(join(stage, directory), 315532800, 315532800);
    };
    visit('');
    const [zipName, tarName, sumsName] = expectedAssetNames(tag);
    // zip updates existing archives, so remove only this run's generated output first.
    for (const name of [zipName, tarName, sumsName]) rmSync(join(outDir, name), { force: true });
    execFileSync('zip', ['-X', '-q', resolve(outDir, zipName), ...files], { cwd: stage, stdio: 'inherit', timeout: 60000 });
    execFileSync('tar', ['--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner', '-czf', resolve(outDir, tarName), '-C', stage, '.'], { stdio: 'inherit', timeout: 60000 });
    const archives = [zipName, tarName].map(name => ({ name, content: readFileSync(join(outDir, name)) }));
    const sums = archives.map(asset => `${createHash('sha256').update(asset.content).digest('hex')}  ${asset.name}`).join('\n') + '\n';
    writeFileSync(join(outDir, sumsName), sums);
    return [...archives, { name: sumsName, content: Buffer.from(sums) }];
  } finally { rmSync(stage, { recursive: true, force: true }); }
}

async function listTags(client, repoPath) {
  const tags = [];
  for (let page = 1; ; page++) {
    const batch = await client.request('GET', `${repoPath}/tags?per_page=100&page=${page}`);
    tags.push(...batch.map(tag => ({ name: tag.name, sha: tag.commit.sha })));
    if (batch.length < 100) return tags;
  }
}

async function listReleases(client, repoPath) {
  const releases = [];
  for (let page = 1; ; page++) {
    const batch = await client.request('GET', `${repoPath}/releases?per_page=100&page=${page}`);
    releases.push(...batch);
    if (batch.length < 100) return releases;
  }
}

export async function findRelease(client, repoPath, tag) {
  try { return await client.request('GET', `${repoPath}/releases/tags/${encodeURIComponent(tag)}`); }
  catch (error) { if (error.status !== 404) throw error; }
  // The by-tag endpoint only guarantees published releases. Authenticated list
  // responses include drafts, which are essential for resuming failed uploads.
  let found = null;
  for (let page = 1; ; page++) {
    const releases = await client.request('GET', `${repoPath}/releases?per_page=100&page=${page}`);
    for (const candidate of releases.filter(release => release.tag_name === tag)) {
      if (!found || (!candidate.draft && found.draft) || (candidate.draft === found.draft && candidate.id < found.id)) found = candidate;
    }
    if (releases.length < 100) return found;
  }
}

export async function publishRelease({ client, repository, commitSha, ref, initialVersion = '0.0.0', distDir = 'dist', outDir = 'release', packager = packageRelease }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid repository');
  if (!/^[0-9a-f]{40}$/.test(commitSha)) throw new Error('Invalid commit SHA');
  const explicitTag = ref.startsWith('refs/tags/') ? ref.slice('refs/tags/'.length) : null;
  if (explicitTag && !parseVersion(explicitTag)) throw new Error('Release tags must be stable vMAJOR.MINOR.PATCH versions');
  if (!explicitTag && ref !== 'refs/heads/master') throw new Error('Automatic releases only run on master');
  const repoPath = `/repos/${repository}`;
  const master = await client.request('GET', `${repoPath}/git/ref/heads/master`);
  const comparison = await client.request('GET', `${repoPath}/compare/${commitSha}...${master.object.sha}`);
  if (!['ahead', 'identical'].includes(comparison.status)) throw new Error('Release commit must belong to master history');

  let chosen;
  for (let attempt = 0; attempt < 25; attempt++) {
    const tags = await listTags(client, repoPath);
    chosen = selectReleaseVersion({ tags, commitSha, explicitTag, initialVersion });
    if (chosen.reuse) break;
    try {
      await client.request('POST', `${repoPath}/git/refs`, { ref: `refs/tags/${chosen.tag}`, sha: commitSha });
      break;
    } catch (error) {
      // Only an actual tag collision is retryable; permissions/ruleset failures remain errors.
      if (![409, 422].includes(error.status)) throw error;
      const freshTags = await listTags(client, repoPath);
      if (!freshTags.some(tag => tag.name === chosen.tag)) throw error;
      chosen = null;
    }
  }
  if (!chosen) throw new Error('Version allocation remained busy; rerun this workflow');
  const { tag } = chosen;
  let release = await findRelease(client, repoPath, tag);
  const names = expectedAssetNames(tag);
  const hasAsset = name => release?.assets?.some(asset => asset.name === name && asset.size > 0);
  if (release && !release.draft && names.every(hasAsset)) {
    return { tag, version: tag.slice(1), url: release.html_url, reused: true };
  }

  const assets = packager({ tag, commitSha, repository, distDir, outDir });
  let createdReleaseId = null;
  if (!release) {
    try { release = await client.request('POST', `${repoPath}/releases`, {
      tag_name: tag, target_commitish: commitSha, name: `中国色 ${tag}`, draft: true, prerelease: false, generate_release_notes: true,
      body: `静态网站构建包，解压后可直接部署。\n\n提交：${commitSha}\n\n提供 ZIP、tar.gz 与 SHA-256 校验文件。包内 release.json 记录版本和源提交。`,
    });
    createdReleaseId = release.id;
    } catch (error) {
      if (![409, 422].includes(error.status)) throw error;
      release = await findRelease(client, repoPath, tag);
      if (!release) throw error;
    }
    // GitHub can accept multiple drafts for one tag. Prefer the oldest draft,
    // and only clean up a duplicate that this invocation created itself.
    const canonical = await findRelease(client, repoPath, tag);
    if (canonical && canonical.id !== release.id) {
      if (createdReleaseId === release.id) {
        const ownDraft = await client.request('GET', `${repoPath}/releases/${createdReleaseId}`);
        if (ownDraft.draft && !ownDraft.assets.length) await client.request('DELETE', `${repoPath}/releases/${createdReleaseId}`);
      }
      release = canonical;
    }
  }
  for (const asset of assets) {
    if (hasAsset(asset.name)) continue;
    const empty = release.assets?.find(item => item.name === asset.name && item.size === 0);
    if (empty) await client.request('DELETE', `${repoPath}/releases/assets/${empty.id}`);
    const uploadUrl = new URL(release.upload_url.replace(/\{.*$/, ''));
    uploadUrl.searchParams.set('name', asset.name);
    try {
      const uploaded = await client.upload(uploadUrl.href, asset.content);
      if (!uploaded?.size) throw new Error(`Empty release asset: ${asset.name}`);
    } catch (error) {
      if (error.status !== 422) throw error;
      release = await client.request('GET', `${repoPath}/releases/${release.id}`);
      if (!hasAsset(asset.name)) throw error;
    }
  }
  // Re-read the server state before exposing a draft release.
  release = await client.request('GET', `${repoPath}/releases/${release.id}`);
  if (!names.every(hasAsset)) throw new Error('Release assets are incomplete; rerun to finish the same version');
  if (release.draft) {
    // An older parallel build must not replace the latest release for current master.
    const currentMaster = await client.request('GET', `${repoPath}/git/ref/heads/master`);
    const published = (await listReleases(client, repoPath)).filter(item => !item.draft && !item.prerelease && parseVersion(item.tag_name));
    const highest = published.every(item => compareVersions(tag, item.tag_name) >= 0);
    const makeLatest = highest && (explicitTag !== null || currentMaster.object.sha === commitSha);
    try {
      release = await client.request('PATCH', `${repoPath}/releases/${release.id}`, { draft: false, make_latest: makeLatest ? 'true' : 'false' });
    } catch (error) {
      if (![409, 422].includes(error.status)) throw error;
      const published = await findRelease(client, repoPath, tag);
      if (!published || published.draft || !names.every(name => published.assets.some(asset => asset.name === name && asset.size > 0))) throw error;
      if (createdReleaseId === release.id && release.id !== published.id) {
        const ownDraft = await client.request('GET', `${repoPath}/releases/${createdReleaseId}`);
        if (ownDraft.draft) await client.request('DELETE', `${repoPath}/releases/${createdReleaseId}`);
      }
      release = published;
    }
  }
  return { tag, version: tag.slice(1), url: release.html_url, reused: chosen.reuse };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (!process.env.GH_TOKEN) throw new Error('GH_TOKEN is required');
    const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const result = await publishRelease({
      client: new GitHubClient(process.env.GH_TOKEN, process.env.GITHUB_API_URL),
      repository: process.env.GITHUB_REPOSITORY,
      commitSha,
      ref: process.env.GITHUB_REF,
      initialVersion: JSON.parse(readFileSync('package.json', 'utf8')).version,
    });
    console.log(`Published ${result.tag}: ${result.url}`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tag=${result.tag}\nversion=${result.version}\nrelease_url=${result.url}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### 中国色 ${result.tag}\n\n[下载 Release](${result.url})\n\n源提交：\`${commitSha}\`\n\nZIP、tar.gz 与 SHA256SUMS.txt 已上传。\n`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
