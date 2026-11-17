const STABLE_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Parse a canonical stable vMAJOR.MINOR.PATCH tag, or return null. */
export function parseVersion(tag) {
  if (typeof tag !== 'string') return null;
  const match = STABLE_TAG.exec(tag);
  // JavaScript's $ also matches before a final newline; require the whole input.
  if (!match || match[0] !== tag) return null;
  const [major, minor, patch] = match.slice(1).map(Number);
  if (![major, minor, patch].every(Number.isSafeInteger)) return null;
  return { major, minor, patch };
}

function checkedVersion(value) {
  const version = typeof value === 'string' ? parseVersion(value) : value;
  if (!version || !['major', 'minor', 'patch'].every(key => (
    Number.isSafeInteger(version[key]) && version[key] >= 0
  ))) {
    throw new TypeError('Expected a stable version with nonnegative safe integer components');
  }
  return version;
}

/** Compare parsed versions or stable tag strings, returning -1, 0, or 1. */
export function compareVersions(a, b) {
  const left = checkedVersion(a);
  const right = checkedVersion(b);
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] < right[key]) return -1;
    if (left[key] > right[key]) return 1;
  }
  return 0;
}

function formatVersion({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`;
}

function highestVersion(entries) {
  return entries.reduce((highest, entry) => (
    !highest || compareVersions(entry.version, highest.version) > 0 ? entry : highest
  ), null);
}

/**
 * Select a release from an immutable snapshot of tag names and peeled commit SHAs.
 * This function performs no I/O and does not reserve a tag. The caller must create
 * the selected tag atomically and retry with a fresh snapshot after a conflict.
 * initialVersion is an unprefixed package version used only without stable tags.
 */
export function selectReleaseVersion({
  tags,
  commitSha,
  explicitTag = null,
  initialVersion = '0.0.0',
}) {
  if (!Array.isArray(tags)) throw new TypeError('tags must be an array');
  if (typeof commitSha !== 'string' || !commitSha.trim()) {
    throw new TypeError('commitSha must be a nonempty string');
  }

  const stableTags = tags.flatMap(tag => {
    const version = parseVersion(tag?.name);
    return version ? [{ name: tag.name, sha: tag.sha, version }] : [];
  });

  if (explicitTag !== null) {
    const version = parseVersion(explicitTag);
    if (!version) throw new TypeError('explicitTag must be a canonical stable vMAJOR.MINOR.PATCH tag');
    const existing = stableTags.find(tag => tag.name === explicitTag);
    if (!existing) throw new Error(`Explicit release tag ${explicitTag} does not exist`);
    if (existing.sha !== commitSha) {
      throw new Error(`Explicit release tag ${explicitTag} does not point to commitSha`);
    }
    return { tag: explicitTag, version: formatVersion(version), reuse: true };
  }

  const matching = highestVersion(stableTags.filter(tag => tag.sha === commitSha));
  if (matching) {
    return { tag: matching.name, version: formatVersion(matching.version), reuse: true };
  }

  const latest = highestVersion(stableTags);
  const base = latest?.version ?? (
    typeof initialVersion === 'string' ? parseVersion(`v${initialVersion}`) : null
  );
  if (!base) throw new TypeError('initialVersion must be a canonical stable MAJOR.MINOR.PATCH version');
  if (base.patch === Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Cannot increment the release patch beyond Number.MAX_SAFE_INTEGER');
  }
  const version = formatVersion({ ...base, patch: base.patch + 1 });
  return { tag: `v${version}`, version, reuse: false };
}
