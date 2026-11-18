import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
  writeFileSync(script, `import json, struct, sys, zipfile
from pathlib import Path
with zipfile.ZipFile(sys.argv[1]) as archive, open(sys.argv[1], 'rb') as raw:
    result = []
    for e in archive.infolist():
        raw.seek(e.header_offset + 26)
        name_length, extra_length = struct.unpack('<HH', raw.read(4))
        raw.seek(name_length, 1)
        local_extra = raw.read(extra_length)
        result.append(dict(name=e.filename, time=e.date_time, mode=(e.external_attr >> 16) & 0o777, extra=e.extra.hex(), localExtra=local_extra.hex(), content=archive.read(e).decode('utf-8')))
Path(sys.argv[2]).write_text(json.dumps(result), encoding='utf-8')
`);
  execFileSync('python3', [script, input, output], { stdio: 'inherit' });
  return JSON.parse(readFileSync(output, 'utf8'));
}

function utTimestamp(extraHex) {
  const extra = Buffer.from(extraHex, 'hex');
  assert.equal(extra.length, 9);
  assert.equal(extra.readUInt16LE(0), 0x5455);
  assert.equal(extra.readUInt16LE(2), 5);
  assert.equal(extra[4], 1, 'UT flags should include only modification time');
  return extra.readUInt32LE(5);
}

function extractedMtime(directory, content, label, timeZone) {
  const archive = join(directory, `${label}.zip`);
  const destination = join(directory, `extracted-${label}`);
  writeFileSync(archive, content);
  execFileSync('unzip', ['-q', archive, '-d', destination], { stdio: 'inherit', env: { ...process.env, TZ: timeZone } });
  return statSync(join(destination, 'dist/index.html')).mtimeMs / 1000;
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
    assert.equal(entry.localExtra, '');
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

test('published server archives are reproducible and preserve release metadata independently of timestamps', t => {
  const directory = workspace(t);
  const source = makeZip(directory, site);
  const settings = { expectedVersion: '1.2.3', expectedCommit: commit, publishedAt: '2026-11-18T06:07:11.987Z' };
  const first = packageServerRelease(options(directory, source, settings));
  const second = packageServerRelease(options(directory, source, settings));
  const sameSecond = packageServerRelease(options(directory, source, { ...settings, publishedAt: '2026-11-18T06:07:11.001Z' }));
  assert.deepEqual(second, first);
  assert.deepEqual(sameSecond, first, 'subsecond differences must not change the archive');
  const metadata = inspectZip(directory, first[0].content).find(entry => entry.name === 'dist/release.json');
  assert.equal(metadata.content, site.find(entry => entry.name === 'release.json').content);
});

test('every published ZIP entry has a UTC DOS date and second-precision UT timestamps in both headers', t => {
  const directory = workspace(t);
  const source = makeZip(directory, site);
  const publishedAt = '2026-11-18T06:07:11.987Z';
  const assets = packageServerRelease(options(directory, source, { publishedAt }));
  const expectedTimestamp = Math.floor(Date.parse(publishedAt) / 1000);
  for (const entry of inspectZip(directory, assets[0].content)) {
    // The DOS header truncates odd seconds; the UT field retains the exact second.
    assert.deepEqual(entry.time, [2026, 11, 18, 6, 7, 10]);
    assert.equal(utTimestamp(entry.extra), expectedTimestamp);
    assert.equal(utTimestamp(entry.localExtra), expectedTimestamp);
  }
  const sameInstant = packageServerRelease(options(directory, source, { publishedAt: '2026-11-18T14:07:11.987+08:00' }));
  assert.deepEqual(sameInstant, assets);
  assert.equal(extractedMtime(directory, assets[0].content, 'utc', 'UTC'), expectedTimestamp);
  assert.equal(extractedMtime(directory, assets[0].content, 'shanghai', 'Asia/Shanghai'), expectedTimestamp);
});

test('same-size changed HTML gets a different extracted mtime when the published second changes', t => {
  const directory = workspace(t);
  const older = site.map(entry => entry.name === 'index.html' ? { ...entry, content: entry.content + '<!-- A -->' } : entry);
  const newer = site.map(entry => entry.name === 'index.html' ? { ...entry, content: entry.content + '<!-- B -->' } : entry);
  assert.equal(Buffer.byteLength(older[0].content), Buffer.byteLength(newer[0].content));
  assert.notEqual(checksum(Buffer.from(older[0].content)), checksum(Buffer.from(newer[0].content)));
  const beforeTime = '2026-11-18T06:07:10Z';
  const afterTime = '2026-11-18T06:07:11Z';
  const before = packageServerRelease(options(directory, makeZip(directory, older, '-older'), { publishedAt: beforeTime }));
  const after = packageServerRelease(options(directory, makeZip(directory, newer, '-newer'), { publishedAt: afterTime }));
  const oldMtime = extractedMtime(directory, before[0].content, 'before', 'Asia/Shanghai');
  const newMtime = extractedMtime(directory, after[0].content, 'after', 'Asia/Shanghai');
  assert.equal(oldMtime, Date.parse(beforeTime) / 1000);
  assert.equal(newMtime, Date.parse(afterTime) / 1000);
  assert.equal(newMtime - oldMtime, 1, 'even releases in one DOS two-second interval need distinct mtimes');
});

test('invalid, ambiguous, and unrepresentable publication dates are rejected', t => {
  const directory = workspace(t);
  const source = makeZip(directory, site);
  for (const publishedAt of [
    null, 0, '', 'not-a-date', '2026-11-18', '2026-11-18T06:07:11',
    '2026-02-30T06:07:11Z', '2026-13-01T00:00:00Z', '2026-11-18T24:00:00Z',
    '1979-12-31T23:59:59Z', '2108-01-01T00:00:00Z',
    '2106-02-07T06:28:16Z', '2107-01-01T00:00:00Z',
  ]) {
    assert.throws(() => packageServerRelease(options(directory, source, { publishedAt })), /publishedAt/);
  }
});

test('the earliest DOS date and latest unsigned UT second are representable without overflow', t => {
  const directory = workspace(t);
  const source = makeZip(directory, site);
  for (const publishedAt of ['1980-01-01T00:00:00Z', '2106-02-07T06:28:15Z']) {
    const assets = packageServerRelease(options(directory, source, { publishedAt }));
    for (const entry of inspectZip(directory, assets[0].content)) {
      assert.equal(utTimestamp(entry.extra), Date.parse(publishedAt) / 1000);
      assert.equal(utTimestamp(entry.localExtra), Date.parse(publishedAt) / 1000);
    }
  }
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
