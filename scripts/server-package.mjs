import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ZIP_NAME = 'dist-vlatest.zip';
const sha256 = content => createHash('sha256').update(content).digest('hex');

// zipfile is part of Python's standard library. Repack directly from validated
// entries instead of extracting paths supplied by an archive onto the filesystem.
const REPACK = String.raw`
import datetime, json, re, shutil, stat, struct, sys, zipfile
from pathlib import Path

source_path, output_path, parameters_path, error_path = sys.argv[1:]

def package():
    parameters = json.loads(Path(parameters_path).read_text(encoding='utf-8'))
    expected, timestamp = parameters['expected'], parameters['timestamp']
    date_time = (1980, 1, 1, 0, 0, 0) if timestamp is None else datetime.datetime.fromtimestamp(timestamp, datetime.timezone.utc).timetuple()[:6]
    # DOS dates have no time zone and only two-second precision. Info-ZIP uses
    # the standard UT extra field to restore the exact UTC modification time.
    extra = b'' if timestamp is None else struct.pack('<HHBI', 0x5455, 5, 1, timestamp)
    with zipfile.ZipFile(source_path) as source:
        entries = {}
        directories = {'dist'}
        for entry in source.infolist():
            name = entry.orig_filename
            if not name or name != entry.filename or '\\' in name or '\x00' in name:
                raise ValueError('Unsafe ZIP entry path')
            if name.startswith('/') or re.match(r'^[A-Za-z]:', name):
                raise ValueError('Absolute ZIP entry path is not allowed')
            directory = entry.is_dir()
            path = name[:-1] if directory else name
            parts = path.split('/')
            if any(part in ('', '.', '..') for part in parts):
                raise ValueError('Unsafe ZIP entry path component')
            if parts[0] == 'dist':
                raise ValueError('Source ZIP must contain site files at its root, without a dist wrapper')
            kind = stat.S_IFMT(entry.external_attr >> 16)
            if kind == stat.S_IFLNK:
                raise ValueError('Symbolic links are not allowed in the source ZIP')
            allowed_kind = stat.S_IFDIR if directory else stat.S_IFREG
            if kind not in (0, allowed_kind):
                raise ValueError('Only regular files and directories are allowed in the source ZIP')
            if entry.flag_bits & 1:
                raise ValueError('Encrypted ZIP entries are not supported')
            if path in entries:
                raise ValueError('Duplicate ZIP entry path')
            entries[path] = entry
            for length in range(1, len(parts)):
                directories.add('dist/' + '/'.join(parts[:length]))
            if directory:
                directories.add('dist/' + path)

        for path in entries:
            parts = path.split('/')
            for length in range(1, len(parts)):
                parent = entries.get('/'.join(parts[:length]))
                if parent and not parent.is_dir():
                    raise ValueError('A ZIP file conflicts with a directory path')
        if 'index.html' not in entries or entries['index.html'].is_dir():
            raise ValueError('Source ZIP must contain a root index.html file')

        if expected:
            metadata_entry = entries.get('release.json')
            if not metadata_entry or metadata_entry.is_dir():
                raise ValueError('Source ZIP must contain root release.json metadata')
            metadata = json.loads(source.read(metadata_entry))
            if not isinstance(metadata, dict):
                raise ValueError('release.json must be an object')
            for key, value in expected.items():
                if metadata.get(key) != value:
                    raise ValueError('release.json ' + key + ' does not match the expected release')

        def info(name, directory):
            value = zipfile.ZipInfo(name, date_time=date_time)
            value.create_system = 3
            value.external_attr = ((stat.S_IFDIR | 0o755) << 16 | 0x10) if directory else ((stat.S_IFREG | 0o644) << 16)
            value.compress_type = zipfile.ZIP_STORED if directory else zipfile.ZIP_DEFLATED
            value.extra = extra
            value.comment = b''
            return value

        files = { 'dist/' + path: entry for path, entry in entries.items() if not entry.is_dir() }
        names = sorted([path + '/' for path in directories] + list(files))
        with zipfile.ZipFile(output_path, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as output:
            for name in names:
                directory = name.endswith('/')
                if directory:
                    output.writestr(info(name, True), b'')
                else:
                    with source.open(files[name]) as incoming, output.open(info(name, False), 'w') as outgoing:
                        shutil.copyfileobj(incoming, outgoing)

try:
    package()
except Exception as error:
    Path(error_path).write_text(str(error), encoding='utf-8')
    sys.exit(1)
`;

/** Verify a versioned ZIP and produce the deterministic dist/ server archive. */
export function packageServerRelease({
  sourceZip,
  sourceChecksums,
  sourceZipName,
  outDir,
  expectedVersion,
  expectedCommit,
  publishedAt,
}) {
  if (!Buffer.isBuffer(sourceZip)) throw new TypeError('sourceZip must be a Buffer');
  if (typeof sourceChecksums !== 'string') throw new TypeError('sourceChecksums must be a string');
  if (typeof sourceZipName !== 'string' || !sourceZipName || /[/\\\r\n\0]/.test(sourceZipName)) {
    throw new TypeError('sourceZipName must be a single archive filename');
  }
  if (typeof outDir !== 'string' || !outDir.trim()) throw new TypeError('outDir must be a nonempty path');
  const expected = {};
  for (const [key, value] of [['version', expectedVersion], ['commit', expectedCommit]]) {
    if (value !== undefined) {
      if (typeof value !== 'string' || !value) throw new TypeError(`Expected ${key} must be a nonempty string`);
      expected[key] = value;
    }
  }

  let timestamp = null;
  if (publishedAt !== undefined) {
    // Require an explicit time zone and reject dates Date.parse would normalize
    // (for example February 30) instead of silently publishing the wrong mtime.
    const match = typeof publishedAt === 'string'
      && /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(publishedAt);
    const calendarDate = match ? new Date(`${match[1]}T00:00:00Z`) : null;
    const milliseconds = match ? Date.parse(publishedAt) : NaN;
    if (!Number.isFinite(milliseconds) || !Number.isFinite(calendarDate?.getTime()) || calendarDate.toISOString().slice(0, 10) !== match[1]) {
      throw new TypeError('publishedAt must be a valid ISO timestamp with an explicit time zone');
    }
    const year = new Date(milliseconds).getUTCFullYear();
    if (year < 1980 || year > 2107) throw new RangeError('publishedAt must fall within ZIP years 1980 through 2107');
    timestamp = Math.floor(milliseconds / 1000);
    // UT stores an unsigned 32-bit Unix timestamp, a stricter upper bound than DOS.
    if (timestamp > 0xffffffff) throw new RangeError('publishedAt exceeds the UT timestamp limit of 2106-02-07T06:28:15Z');
  }

  const matching = sourceChecksums.split(/\r?\n/).flatMap(line => {
    const match = /^([\da-fA-F]{64}) [ *](.+)$/.exec(line);
    return match && match[2] === sourceZipName ? [match[1].toLowerCase()] : [];
  });
  if (matching.length !== 1) throw new Error('Expected exactly one source checksum for sourceZipName');
  if (sha256(sourceZip) !== matching[0]) throw new Error('Source ZIP SHA-256 checksum mismatch');

  const temporary = mkdtempSync(join(tmpdir(), 'zhongguose-server-package-'));
  try {
    const input = join(temporary, 'source.zip');
    const output = join(temporary, ZIP_NAME);
    const script = join(temporary, 'repack.py');
    const metadata = join(temporary, 'parameters.json');
    const errors = join(temporary, 'error.txt');
    writeFileSync(input, sourceZip);
    writeFileSync(script, REPACK);
    writeFileSync(metadata, JSON.stringify({ expected, timestamp }));
    try {
      execFileSync('python3', [script, input, output, metadata, errors], { stdio: 'inherit', timeout: 60000 });
    } catch (cause) {
      const detail = existsSync(errors) ? readFileSync(errors, 'utf8') : 'Python ZIP processing failed';
      throw new Error(`Cannot package source ZIP: ${detail}`, { cause });
    }
    const content = readFileSync(output);
    const assets = [
      { name: ZIP_NAME, content },
      { name: `${ZIP_NAME}.sha256`, content: Buffer.from(`${sha256(content)}  ${ZIP_NAME}\n`) },
    ];
    mkdirSync(outDir, { recursive: true });
    for (const asset of assets) writeFileSync(join(outDir, asset.name), asset.content);
    return assets;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
