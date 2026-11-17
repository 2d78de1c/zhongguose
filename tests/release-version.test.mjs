import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVersion, compareVersions, selectReleaseVersion } from '../scripts/release-version.mjs';

const commitSha = 'current-commit';
const tagged = (name, sha = 'older-commit') => ({ name, sha });

test('only canonical stable tags are parsed', () => {
  assert.deepEqual(parseVersion('v0.0.0'), { major: 0, minor: 0, patch: 0 });
  assert.deepEqual(parseVersion('v12.30.405'), { major: 12, minor: 30, patch: 405 });
  for (const value of [
    '', null, undefined, 123, '1.2.3', 'V1.2.3', 'v1.2', 'v1.2.3.4',
    'v01.2.3', 'v1.02.3', 'v1.2.03', 'v1.-2.3', 'v+1.2.3',
    'v1.2.3-rc.1', 'v1.2.3+build.1', ' v1.2.3', 'v1.2.3 ', 'v1.2.3\n',
  ]) assert.equal(parseVersion(value), null, String(value));
});

test('versions are compared numerically across every component', () => {
  assert.equal(compareVersions('v1.9.99', 'v1.10.0'), -1);
  assert.equal(compareVersions(parseVersion('v2.0.0'), parseVersion('v1.99.999')), 1);
  assert.equal(compareVersions('v1.10.9', 'v1.10.10'), -1);
  assert.equal(compareVersions('v1.10.10', { major: 1, minor: 10, patch: 10 }), 0);
  assert.throws(() => compareVersions('v1.2', 'v1.2.3'), TypeError);
  assert.throws(() => compareVersions({ major: 1, minor: -1, patch: 0 }, 'v1.0.0'), TypeError);
});

test('the first release increments the package baseline', () => {
  assert.deepEqual(selectReleaseVersion({ tags: [], commitSha }), {
    tag: 'v0.0.1', version: '0.0.1', reuse: false,
  });
  assert.deepEqual(selectReleaseVersion({ tags: [], commitSha, initialVersion: '3.2.8' }), {
    tag: 'v3.2.9', version: '3.2.9', reuse: false,
  });
  for (const initialVersion of ['v0.0.0', '00.0.0', '1.0.0-beta.1', '1.0', '1.0.0\n', null]) {
    assert.throws(() => selectReleaseVersion({ tags: [], commitSha, initialVersion }), /initialVersion/);
  }
});

test('automatic release increments the numerically highest existing stable patch', () => {
  const tags = [tagged('v1.9.99'), tagged('v1.10.9'), tagged('v1.10.10'), tagged('v1.2.100')];
  const expected = { tag: 'v1.10.11', version: '1.10.11', reuse: false };
  assert.deepEqual(selectReleaseVersion({ tags, commitSha }), expected);
  assert.deepEqual(selectReleaseVersion({ tags: [...tags].reverse(), commitSha }), expected);
});

test('a manually tagged major release is reused and subsequent releases continue its patch line', () => {
  const tags = [tagged('v1.99.99'), tagged('v2.0.0', commitSha)];
  assert.deepEqual(selectReleaseVersion({ tags, commitSha, explicitTag: 'v2.0.0' }), {
    tag: 'v2.0.0', version: '2.0.0', reuse: true,
  });
  assert.deepEqual(selectReleaseVersion({ tags, commitSha: 'next-commit' }), {
    tag: 'v2.0.1', version: '2.0.1', reuse: false,
  });
});

test('rerunning the same commit reuses its highest stable tag even after newer releases', () => {
  const tags = [
    tagged('v1.0.9', commitSha), tagged('v9.0.0'), tagged('v1.0.10', commitSha),
    tagged('v10.0.0-rc.1', commitSha),
  ];
  assert.deepEqual(selectReleaseVersion({ tags, commitSha }), {
    tag: 'v1.0.10', version: '1.0.10', reuse: true,
  });
  assert.deepEqual(selectReleaseVersion({ tags, commitSha, explicitTag: 'v1.0.9' }), {
    tag: 'v1.0.9', version: '1.0.9', reuse: true,
  });
});

test('an explicit tag must be stable, exist, and point to the requested commit', () => {
  const tags = [tagged('v1.0.0', commitSha), tagged('v2.0.0', 'different-commit')];
  for (const explicitTag of ['', '1.0.0', 'v01.0.0', 'v1.00.0', 'v1.0.00', 'v1.0.0-beta.1']) {
    assert.throws(() => selectReleaseVersion({ tags, commitSha, explicitTag }), /explicitTag/);
  }
  assert.throws(() => selectReleaseVersion({ tags, commitSha, explicitTag: 'v3.0.0' }), /does not exist/);
  assert.throws(() => selectReleaseVersion({ tags, commitSha, explicitTag: 'v2.0.0' }), /does not point/);
});

test('prerelease, metadata, malformed, and unprefixed tags never advance or reuse a stable release', () => {
  const ignored = [
    'v99.0.0-rc.1', 'v90.0.0+build.1', 'v08.0.0', '7.0.0', 'latest', 'v9.0', 'v8.0.0\n',
  ].map(name => tagged(name, commitSha));
  assert.deepEqual(selectReleaseVersion({ tags: ignored, commitSha }), {
    tag: 'v0.0.1', version: '0.0.1', reuse: false,
  });
  assert.deepEqual(selectReleaseVersion({ tags: [...ignored, tagged('v1.2.3')], commitSha }), {
    tag: 'v1.2.4', version: '1.2.4', reuse: false,
  });
});

test('unsafe integer tags are rejected and patch increment never overflows', () => {
  const max = Number.MAX_SAFE_INTEGER;
  const overflow = (BigInt(max) + 1n).toString();
  assert.deepEqual(parseVersion(`v${max}.0.0`), { major: max, minor: 0, patch: 0 });
  for (const value of [`v${overflow}.0.0`, `v0.${overflow}.0`, `v0.0.${overflow}`]) {
    assert.equal(parseVersion(value), null);
    assert.throws(() => selectReleaseVersion({ tags: [tagged(value, commitSha)], commitSha, explicitTag: value }), /explicitTag/);
  }
  assert.deepEqual(selectReleaseVersion({ tags: [tagged(`v0.0.${max - 1}`)], commitSha }), {
    tag: `v0.0.${max}`, version: `0.0.${max}`, reuse: false,
  });
  assert.throws(() => selectReleaseVersion({ tags: [tagged(`v0.0.${max}`)], commitSha }), RangeError);
  assert.throws(() => selectReleaseVersion({ tags: [], commitSha, initialVersion: `0.0.${max}` }), RangeError);
  assert.deepEqual(selectReleaseVersion({ tags: [tagged(`v0.0.${max}`, commitSha)], commitSha }), {
    tag: `v0.0.${max}`, version: `0.0.${max}`, reuse: true,
  });
});

test('tag snapshots and parsed version inputs are never mutated', () => {
  const tags = Object.freeze([
    Object.freeze(tagged('v1.9.99')), Object.freeze(tagged('v1.10.0')),
  ]);
  const before = structuredClone(tags);
  assert.deepEqual(selectReleaseVersion({ tags, commitSha }), {
    tag: 'v1.10.1', version: '1.10.1', reuse: false,
  });
  assert.deepEqual(tags, before);
  const version = Object.freeze({ major: 1, minor: 10, patch: 0 });
  assert.equal(compareVersions(version, version), 0);
});

test('missing tag snapshots and empty commit identities are rejected', () => {
  assert.throws(() => selectReleaseVersion({ tags: null, commitSha }), /tags/);
  for (const sha of ['', ' ', null, undefined]) {
    assert.throws(() => selectReleaseVersion({ tags: [], commitSha: sha }), /commitSha/);
  }
});
