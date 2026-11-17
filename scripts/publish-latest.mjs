import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GitHubClient, findRelease } from './github-release.mjs';
import { compareVersions, parseVersion } from './release-version.mjs';
import { packageServerRelease } from './server-package.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const marker = /<!-- zhongguose-latest:({[^\n]*}) -->/;

export class ReleaseDownloadClient extends GitHubClient {
  async download(asset) {
    const response = await fetch(asset.url, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/octet-stream', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error(`Cannot download ${asset.name}: HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
}

function sourceMetadata(release) {
  try { return JSON.parse(marker.exec(release?.body || '')?.[1] || 'null'); }
  catch { return null; }
}

async function stableRelease(client, path) {
  const release = await client.request('GET', `${path}/releases/latest`);
  if (release.draft || release.prerelease || !parseVersion(release.tag_name)) {
    throw new Error('GitHub latest must identify a published stable vX.Y.Z release, not the rolling latest tag');
  }
  return release;
}

async function commitForTag(client, path, tag) {
  let object = (await client.request('GET', `${path}/git/ref/tags/${encodeURIComponent(tag)}`)).object;
  for (let depth = 0; depth < 10 && object.type === 'tag'; depth++) {
    object = (await client.request('GET', `${path}/git/tags/${object.sha}`)).object;
  }
  if (object.type !== 'commit' || !/^[0-9a-f]{40}$/.test(object.sha)) throw new Error('Release tag does not resolve to a commit');
  return object.sha;
}

async function assetMatches(client, asset, content) {
  if (!asset || asset.size !== content.length) return false;
  const digest = `sha256:${sha256(content)}`;
  if (asset.digest) return asset.digest === digest;
  return sha256(await client.download(asset)) === sha256(content);
}

export async function publishLatest({ client, repository, outDir = 'release/latest', packager = packageServerRelease }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid repository');
  const path = `/repos/${repository}`;
  // The latest job is serialized across all workflow runs. Re-select after
  // packaging too, because another version job can finish while this one runs.
  let source, commitSha, assets, rolling;
  for (let attempt = 0; attempt < 5; attempt++) {
    source = await stableRelease(client, path);
    rolling = await findRelease(client, path, 'latest');
    if (rolling?.immutable) throw new Error('The latest release is immutable; rolling updates require mutable releases');
    const previous = sourceMetadata(rolling);
    if (previous && parseVersion(previous.tag) && compareVersions(source.tag_name, previous.tag) < 0) {
      return { sourceTag: previous.tag, url: rolling.html_url, skipped: true };
    }
    const zipName = `zhongguose-${source.tag_name}.zip`;
    const sourceZip = source.assets.find(asset => asset.name === zipName && asset.size > 0);
    const checksums = source.assets.find(asset => asset.name === 'SHA256SUMS.txt' && asset.size > 0);
    if (!sourceZip || !checksums) throw new Error('Stable release is missing its ZIP or SHA256SUMS.txt');
    commitSha = await commitForTag(client, path, source.tag_name);
    const zipBytes = await client.download(sourceZip);
    const checksumBytes = await client.download(checksums);
    assets = packager({ sourceZip: zipBytes, sourceChecksums: checksumBytes.toString('utf8'), sourceZipName: zipName, expectedVersion: source.tag_name.slice(1), expectedCommit: commitSha, outDir });
    const current = await stableRelease(client, path);
    if (current.id === source.id && current.tag_name === source.tag_name) break;
    assets = null;
  }
  if (!assets) throw new Error('Stable release kept changing; rerun the latest job');
  const expectedNames = ['dist-vlatest.zip', 'dist-vlatest.zip.sha256'];
  if (assets.length !== 2 || expectedNames.some(name => !assets.find(asset => asset.name === name && asset.content.length))) {
    throw new Error('Server package must include ZIP and its SHA256 file');
  }

  let latestRef;
  try { latestRef = await client.request('GET', `${path}/git/ref/tags/latest`); }
  catch (error) { if (error.status !== 404) throw error; }
  if (!latestRef) latestRef = await client.request('POST', `${path}/git/refs`, { ref: 'refs/tags/latest', sha: commitSha });
  if (!rolling) {
    rolling = await client.request('POST', `${path}/releases`, {
      tag_name: 'latest', target_commitish: commitSha, name: `Latest · ${source.tag_name}`, draft: true, prerelease: false, make_latest: 'false',
    });
  }
  let changed = false;
  // Fixed URLs cannot be replaced transactionally on GitHub. Replace ZIP first
  // and checksum last; clients must reject a mismatched pair and retry.
  for (const name of expectedNames) {
    const asset = assets.find(item => item.name === name);
    const existing = rolling.assets.find(item => item.name === name);
    if (await assetMatches(client, existing, asset.content)) continue;
    if (existing) await client.request('DELETE', `${path}/releases/assets/${existing.id}`);
    const url = new URL(rolling.upload_url.replace(/\{.*$/, ''));
    url.searchParams.set('name', name);
    const uploaded = await client.upload(url.href, asset.content);
    if (!await assetMatches(client, uploaded, asset.content)) throw new Error(`Uploaded server asset failed verification: ${name}`);
    changed = true;
  }
  rolling = await client.request('GET', `${path}/releases/${rolling.id}`);
  for (const asset of assets) {
    if (!await assetMatches(client, rolling.assets.find(item => item.name === asset.name), asset.content)) {
      throw new Error('Server assets are incomplete; rerun to repair latest');
    }
  }
  if (latestRef.object.sha !== commitSha || latestRef.object.type !== 'commit') {
    // Only this explicitly mutable alias moves. Stable version tags never move.
    await client.request('PATCH', `${path}/git/refs/tags/latest`, { sha: commitSha, force: true });
    changed = true;
  }
  const zipHash = sha256(assets.find(asset => asset.name === 'dist-vlatest.zip').content);
  const metadata = { tag: source.tag_name, commit: commitSha, sha256: zipHash };
  const previous = sourceMetadata(rolling);
  if (changed || rolling.draft || JSON.stringify(previous) !== JSON.stringify(metadata)) {
    rolling = await client.request('PATCH', `${path}/releases/${rolling.id}`, {
      draft: false, prerelease: false, make_latest: 'false', name: `Latest · ${source.tag_name}`,
      body: `服务器自动拉取入口；历史版本见 [${source.tag_name}](${source.html_url})。\n\n包内包含 dist/index.html，校验文件为 dist-vlatest.zip.sha256。\n\n源提交：${commitSha}\n\n<!-- zhongguose-latest:${JSON.stringify(metadata)} -->`,
    });
  }
  return { sourceTag: source.tag_name, url: rolling.html_url, reused: !changed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (!process.env.GH_TOKEN) throw new Error('GH_TOKEN is required');
    const result = await publishLatest({ client: new ReleaseDownloadClient(process.env.GH_TOKEN, process.env.GITHUB_API_URL), repository: process.env.GITHUB_REPOSITORY });
    console.log(`Server latest tracks ${result.sourceTag}: ${result.url}`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### 服务器固定下载入口\n\n[latest](${result.url}) → ${result.sourceTag}\n\n附件：dist-vlatest.zip、dist-vlatest.zip.sha256；ZIP 包含 dist/index.html。\n`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
