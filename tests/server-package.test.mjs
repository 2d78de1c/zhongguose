import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packageServerRelease } from '../scripts/server-package.mjs';

const sourceZipName = 'zhongguose-v1.2.3.zip';
const commit = '1234567890abcdef1234567890abcdef12345678';
const checksum = content => createHash('sha256').update(content).digest('hex');
const site = [
  { name: 'index.html', content: '<html><script src="assets/app.js"></script></html>' },
  { name: 'assets/app.js', content: 'console.log("中国色");\n' },
  { name: 'release.json', content: JSON.stringify({ version: '1.2.3', commit }) },
];

function workspace(t) {
  const directory = mkdtempSync(join(tmpdir(), 'server-package-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function makeZip(directory, entries, suffix = '') {
  const input = join(directory, `entries${suffix}.json`);
  const output = join(directory, `input${suffix}.zip`);
  const script = join(directory, 'make-zip.py');
  writeFileSync(input, JSON.stringify(entries));
  writeFileSync(script, `import json, stat, sys, zipfile
from pathlib import Path
with zipfile.ZipFile(sys.argv[2], 'w') as archive:
    for entry in json.loads(Path(sys.argv[1]).read_text()):
        info = zipfile.ZipInfo(entry['name'], tuple(entry.get('time', [2024, 1, 2, 3, 4, 6])))
        info.create_system = 3
        kind = stat.S_IFLNK if entry.get('symlink') else (stat.S_IFDIR if entry['name'].endswith('/') else stat.S_IFREG)
        info.external_attr = (kind | entry.get('mode', 0o755)) << 16
        archive.writestr(info, entry.get('content', '').encode('utf-8'))
`);
  execFileSync('python3', [script, input, output], { stdio: 'inherit' });
  return readFileSync(output);
}

function inspectZip(directory, content) {
  const input = join(directory, 'inspect.zip');
  const output = join(directory, 'inspection.json');
  const script = join(directory, 'inspect.py');
  writeFileSync(input, content);
  writeFileSync(script, `import json, sys, zipfile
from pathlib import Path
with zipfile.ZipFile(sys.argv[1]) as archive:
    result = [dict(name=e.filename, time=e.date_time, mode=(e.external_attr >> 16) & 0o777, extra=e.extra.hex(), content=archive.read(e).decode('utf-8')) for e in archive.infolist()]
Path(sys.argv[2]).write_text(json.dumps(result), encoding='utf-8')
`);
  execFileSync('python3', [script, input, output], { stdio: 'inherit' });
  return JSON.parse(readFileSync(output, 'utf8'));
}

function options(directory, sourceZip, extra = {}) {
  return {
    sourceZip, sourceZipName, sourceChecksums: `${checksum(sourceZip)}  ${sourceZipName}\n`,
    outDir: join(directory, 'release'), ...extra,
  };
}

test('server archive has one dist wrapper, correct contents, and a standard checksum file', t => {
  const directory = workspace(t);
  const source = makeZip(directory, site);
  const assets = packageServerRelease(options(directory, source, { expectedVersion: '1.2.3', expectedCommit: commit }));
  assert.deepEqual(assets.map(asset => asset.name), ['dist-vlatest.zip', 'dist-vlatest.zip.sha256']);
  assert.ok(assets.every(asset => Buffer.isBuffer(asset.content)));
  const entries = inspectZip(directory, assets[0].content);
  assert.deepEqual(entries.map(entry => entry.name), [
    'dist/', 'dist/assets/', 'dist/assets/app.js', 'dist/index.html', 'dist/release.json',
  ]);
  assert.equal(entries.find(entry => entry.name === 'dist/index.html').content, site[0].content);
  assert.equal(entries.find(entry => entry.name === 'dist/assets/app.js').content, site[1].content);
  for (const entry of entries) {
    assert.deepEqual(entry.time, [1980, 1, 1, 0, 0, 0]);
    assert.equal(entry.mode, entry.name.endsWith('/') ? 0o755 : 0o644);
    assert.equal(entry.extra, '');
  }
  assert.equal(assets[1].content.toString(), `${checksum(assets[0].content)}  dist-vlatest.zip\n`);
  for (const asset of assets) assert.deepEqual(readFileSync(join(directory, 'release', asset.name)), asset.content);
});

test('repeated packaging and equivalent sources with different order or metadata produce identical hashes', t => {
  const directory = workspace(t);
  const source = makeZip(directory, site);
  const first = packageServerRelease(options(directory, source));
  const rerun = packageServerRelease(options(directory, source));
  const reordered = makeZip(directory, [...site].reverse().map(entry => ({ ...entry, mode: 0o600, time: [2025, 8, 9, 10, 11, 12] })), '-reordered');
  const normalized = packageServerRelease(options(directory, reordered));
  assert.deepEqual(rerun, first);
  assert.deepEqual(normalized, first);
});

test('the named source must have exactly one matching and correct SHA-256 entry', t => {
  const directory = workspace(t);
  const source = makeZip(directory, site);
  assert.throws(() => packageServerRelease(options(directory, source, {
    sourceChecksums: `${'0'.repeat(64)}  ${sourceZipName}\n`,
  })), /checksum mismatch/);
  assert.throws(() => packageServerRelease(options(directory, source, {
    sourceChecksums: `${checksum(source)}  other.zip\n`,
  })), /exactly one source checksum/);
  assert.throws(() => packageServerRelease(options(directory, source, {
    sourceChecksums: `${checksum(source)}  ${sourceZipName}\n`.repeat(2),
  })), /exactly one source checksum/);
  assert.deepEqual(readdirSync(directory).sort(), ['entries.json', 'input.zip', 'make-zip.py']);
});

test('source checksums can include other assets and binary-mode checksum notation', t => {
  const directory = workspace(t);
  const source = makeZip(directory, site);
  const assets = packageServerRelease(options(directory, source, {
    sourceChecksums: `${'0'.repeat(64)}  other.tar.gz\r\n${checksum(source).toUpperCase()} *${sourceZipName}\r\n`,
  }));
  assert.equal(assets.length, 2);
});

test('unsafe absolute, traversal, and Windows ZIP paths are rejected', t => {
  const directory = workspace(t);
  for (const [index, name] of ['../escape', 'assets/../../escape', '/escape', 'C:/escape', 'assets\\escape'].entries()) {
    const source = makeZip(directory, [...site, { name, content: 'unsafe' }], `-${index}`);
    assert.throws(() => packageServerRelease(options(directory, source)), /ZIP entry path/);
  }
});

test('symbolic links are rejected even when their names remain inside the archive', t => {
  const directory = workspace(t);
  const source = makeZip(directory, [...site, { name: 'assets/link', content: '../../escape', symlink: true }]);
  assert.throws(() => packageServerRelease(options(directory, source)), /Symbolic links/);
});

test('a root index.html is required and an already wrapped source cannot create dist/dist', t => {
  const directory = workspace(t);
  const missing = makeZip(directory, site.filter(entry => entry.name !== 'index.html'));
  assert.throws(() => packageServerRelease(options(directory, missing)), /root index.html/);
  const wrapped = makeZip(directory, site.map(entry => ({ ...entry, name: `dist/${entry.name}` })), '-wrapped');
  assert.throws(() => packageServerRelease(options(directory, wrapped)), /without a dist wrapper/);
});

test('expected release metadata must match both the version and source commit', t => {
  const directory = workspace(t);
  const source = makeZip(directory, site);
  assert.throws(() => packageServerRelease(options(directory, source, { expectedVersion: '2.0.0' })), /version does not match/);
  assert.throws(() => packageServerRelease(options(directory, source, { expectedCommit: 'another-commit' })), /commit does not match/);
  const missing = makeZip(directory, site.filter(entry => entry.name !== 'release.json'), '-missing');
  assert.throws(() => packageServerRelease(options(directory, missing, { expectedCommit: commit })), /root release.json/);
});

test('duplicate entry names and file-directory conflicts are rejected', t => {
  const directory = workspace(t);
  const duplicate = makeZip(directory, [...site, { name: 'index.html', content: 'different content' }], '-duplicate');
  assert.throws(() => packageServerRelease(options(directory, duplicate)), /Duplicate ZIP entry/);
  const conflict = makeZip(directory, [...site, { name: 'assets', content: 'not a directory' }], '-conflict');
  assert.throws(() => packageServerRelease(options(directory, conflict)), /conflicts with a directory/);
});

test('invalid ZIP content is rejected and temporary packaging directories are cleaned', t => {
  const directory = workspace(t);
  const before = readdirSync(tmpdir()).filter(name => name.startsWith('zhongguose-server-package-')).sort();
  const malformed = Buffer.from('not a zip archive');
  assert.throws(() => packageServerRelease(options(directory, malformed)), /Cannot package source ZIP/);
  const valid = makeZip(directory, site);
  packageServerRelease(options(directory, valid));
  assert.deepEqual(readdirSync(tmpdir()).filter(name => name.startsWith('zhongguose-server-package-')).sort(), before);
});
