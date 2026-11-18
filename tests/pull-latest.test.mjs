import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pullScript = fileURLToPath(new URL('../scripts/pull-latest.py', import.meta.url));
const archiveName = 'dist-vlatest.zip';
const baseUrl = 'https://example.test/releases/download/latest';
const checksum = content => createHash('sha256').update(content).digest('hex');
const oldVersion = '0.0.4';
const newVersion = '0.0.5';

const mockCurl = `#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
from urllib.parse import urlsplit

args = sys.argv[1:]
output = Path(args[args.index('--output') + 1])
url = args[-1]
name = Path(urlsplit(url).path).name
kind = 'sha' if name.endswith('.sha256') else 'zip'
base = Path(os.environ['PULL_TEST_REMOTE'])
state_file = base / 'requests.json'
requests = json.loads(state_file.read_text()) if state_file.exists() else []
index = sum(request['kind'] == kind for request in requests)
requests.append({'kind': kind, 'url': url, 'args': args})
state_file.write_text(json.dumps(requests))
responses = json.loads((base / 'responses.json').read_text())[kind]
response = responses[min(index, len(responses) - 1)]
if response.get('status', 0):
    print('curl: (22) The requested URL returned error: 404', file=sys.stderr)
    sys.exit(response['status'])
output.parent.mkdir(parents=True, exist_ok=True)
output.write_bytes((base / response['file']).read_bytes())
`;

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'pull-latest-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const root = join(directory, 'app');
  const bin = join(directory, 'bin');
  const remote = join(directory, 'remote');
  for (const path of [root, bin, remote]) mkdirSync(path, { recursive: true });
  writeFileSync(join(bin, 'curl'), mockCurl, { mode: 0o755 });
  return { directory, root, bin, remote, cache: join(root, '.download-cache', archiveName) };
}

function site(version = newVersion) {
  return {
    'index.html': `<html><script src="./assets/app.js"></script><body>${version}</body></html>\n`,
    'assets/app.js': `console.log("中国色 ${version}");\n`,
    'release.json': JSON.stringify({
      version, tag: `v${version}`, commit: (version === oldVersion ? 'a' : 'b').repeat(40), repository: '2d78de1c/zhongguose',
    }) + '\n',
  };
}

function writeSite(destination, version = newVersion) {
  for (const [name, content] of Object.entries(site(version))) {
    const path = join(destination, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}

function assertSite(destination, version = newVersion) {
  for (const [name, content] of Object.entries(site(version))) {
    assert.equal(readFileSync(join(destination, name), 'utf8'), content, name);
  }
}

function executePython(args, { cwd, env = process.env, timeout = 15000 }) {
  // File-backed output also works in restricted runners that cannot create child pipes.
  const output = join(cwd, 'python.stdout');
  const errors = join(cwd, 'python.stderr');
  const stdout = openSync(output, 'w');
  const stderr = openSync(errors, 'w');
  let result;
  try {
    result = spawnSync('python3', args, { cwd, env, timeout, stdio: ['ignore', stdout, stderr] });
  } finally {
    closeSync(stdout);
    closeSync(stderr);
  }
  assert.ifError(result.error);
  result.stdout = readFileSync(output, 'utf8');
  result.stderr = readFileSync(errors, 'utf8');
  assert.equal(result.signal, null, `Python process received ${result.signal}: ${result.stderr}`);
  return result;
}

function makeZip(f, version = newVersion, extraEntries = []) {
  const output = join(f.remote, `site-${version}.zip`);
  const entries = [...Object.entries(site(version)).map(([name, content]) => ({ name: `dist/${name}`, content })), ...extraEntries];
  const input = join(f.remote, 'zip-entries.json');
  writeFileSync(input, JSON.stringify(entries));
  const result = executePython(['-c', `import json, stat, sys, zipfile
from pathlib import Path
with zipfile.ZipFile(sys.argv[1], 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for entry in json.loads(Path(sys.argv[2]).read_text()):
        info = zipfile.ZipInfo(entry['name'])
        info.create_system = 3
        info.external_attr = (stat.S_IFREG | 0o644) << 16
        archive.writestr(info, entry['content'].encode('utf-8'))
`, output, input], { cwd: f.directory });
  assertSuccess(result);
  return readFileSync(output);
}

function configureRemote(f, zip, options = {}) {
  writeFileSync(join(f.remote, 'download.zip'), zip);
  writeFileSync(join(f.remote, 'download.sha256'), `${checksum(zip)}  ${archiveName}\n`);
  writeFileSync(join(f.remote, 'responses.json'), JSON.stringify({
    sha: options.sha || [{ file: 'download.sha256' }],
    zip: options.zip || [{ file: 'download.zip' }],
  }));
}

function cacheZip(f, zip) {
  mkdirSync(dirname(f.cache), { recursive: true });
  writeFileSync(f.cache, zip);
}

function runPull(f, extraEnv = {}) {
  const environment = {
    ...process.env,
    EXTRACT_DIR: f.root,
    BASE_URL: baseUrl,
    PROXY: '',
    ALLOW_DOWNGRADE: '0',
    PULL_RETRY_DELAY: '0',
    PULL_TEST_REMOTE: f.remote,
    PYTHONDONTWRITEBYTECODE: '1',
    PATH: `${f.bin}${delimiter}${process.env.PATH || ''}`,
  };
  // Exercise the default cache location without inheriting a developer's override.
  delete environment.CACHE_DIR;
  return executePython([pullScript], {
    cwd: f.directory,
    env: { ...environment, ...extraEnv },
  });
}

function assertSuccess(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

function assertFailure(result) {
  assert.notEqual(result.status, 0, `Pull unexpectedly succeeded: ${result.stdout}\n${result.stderr}`);
}

function requests(f) {
  const path = join(f.remote, 'requests.json');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
}

test('pull-latest installs a verified archive into an empty deployment directory', t => {
  const f = fixture(t);
  const zip = makeZip(f);
  configureRemote(f, zip);
  assertSuccess(runPull(f));
  assertSite(join(f.root, 'dist'));
  assert.deepEqual(readFileSync(f.cache), zip);
});

test('pull-latest deploys new cached ZIP contents even when the current dist is old', t => {
  const f = fixture(t);
  const zip = makeZip(f);
  writeSite(join(f.root, 'dist'), oldVersion);
  cacheZip(f, zip);
  configureRemote(f, zip);
  assertSuccess(runPull(f));
  assertSite(join(f.root, 'dist'));
  assertSite(join(f.root, '.dist-previous'), oldVersion);
  assert.deepEqual(readFileSync(f.cache), zip);
});

test('pull-latest repairs a missing deployed asset despite a correct cached ZIP and release.json', t => {
  const f = fixture(t);
  const zip = makeZip(f);
  writeSite(join(f.root, 'dist'));
  unlinkSync(join(f.root, 'dist/assets/app.js'));
  cacheZip(f, zip);
  configureRemote(f, zip);
  assertSuccess(runPull(f));
  assertSite(join(f.root, 'dist'));
});

test('pull-latest repairs changed deployed content even when release metadata is current', t => {
  const f = fixture(t);
  const zip = makeZip(f);
  writeSite(join(f.root, 'dist'));
  writeFileSync(join(f.root, 'dist/assets/app.js'), 'stale asset\n');
  cacheZip(f, zip);
  configureRemote(f, zip);
  assertSuccess(runPull(f));
  assertSite(join(f.root, 'dist'));
});

test('pull-latest leaves a byte-for-byte current deployment in place', t => {
  const f = fixture(t);
  const zip = makeZip(f);
  const live = join(f.root, 'dist');
  writeSite(live);
  cacheZip(f, zip);
  configureRemote(f, zip);
  const index = join(live, 'index.html');
  utimesSync(index, 1234567890, 1234567890);
  const before = { inode: statSync(live).ino, mtime: statSync(index).mtimeMs };
  assertSuccess(runPull(f));
  assertSite(live);
  assert.equal(statSync(live).ino, before.inode, 'unchanged deployment must not be replaced');
  assert.equal(statSync(index).mtimeMs, before.mtime);
  assert.equal(existsSync(join(f.root, '.dist-previous')), false);
});

test('pull-latest keeps the old website and cache when downloads return HTTP 404', t => {
  const f = fixture(t);
  const oldZip = makeZip(f, oldVersion);
  writeSite(join(f.root, 'dist'), oldVersion);
  cacheZip(f, oldZip);
  configureRemote(f, makeZip(f), { sha: [{ status: 22 }] });
  assertFailure(runPull(f));
  assertSite(join(f.root, 'dist'), oldVersion);
  assert.deepEqual(readFileSync(f.cache), oldZip);
  assert.equal(requests(f).filter(request => request.kind === 'sha').length, 3);
});

test('pull-latest retries both files when rolling latest briefly serves a mismatched pair', t => {
  const f = fixture(t);
  const oldZip = makeZip(f, oldVersion);
  const zip = makeZip(f);
  writeSite(join(f.root, 'dist'), oldVersion);
  writeFileSync(join(f.remote, 'old.sha256'), `${checksum(oldZip)}  ${archiveName}\n`);
  configureRemote(f, zip, { sha: [{ file: 'old.sha256' }, { file: 'download.sha256' }] });
  assertSuccess(runPull(f));
  assertSite(join(f.root, 'dist'));
  assert.equal(requests(f).filter(request => request.kind === 'sha').length, 2);
  assert.equal(requests(f).filter(request => request.kind === 'zip').length, 2);
});

test('pull-latest gives up after three mismatched pairs without changing the old website or cache', t => {
  const f = fixture(t);
  const oldZip = makeZip(f, oldVersion);
  writeSite(join(f.root, 'dist'), oldVersion);
  cacheZip(f, oldZip);
  writeFileSync(join(f.remote, 'wrong.sha256'), `${'0'.repeat(64)}  ${archiveName}\n`);
  configureRemote(f, makeZip(f), { sha: [{ file: 'wrong.sha256' }] });
  assertFailure(runPull(f));
  assertSite(join(f.root, 'dist'), oldVersion);
  assert.deepEqual(readFileSync(f.cache), oldZip);
  assert.equal(requests(f).filter(request => request.kind === 'sha').length, 3);
  assert.equal(requests(f).filter(request => request.kind === 'zip').length, 3);
});

test('pull-latest rejects a corrupt ZIP with a matching SHA without deleting the old website', t => {
  const f = fixture(t);
  writeSite(join(f.root, 'dist'), oldVersion);
  configureRemote(f, Buffer.from('This is not a ZIP archive.\n'));
  assertFailure(runPull(f));
  assertSite(join(f.root, 'dist'), oldVersion);
  assert.equal(existsSync(join(f.root, '.dist-previous')), false);
});

test('pull-latest rejects ZIP traversal paths before touching the old deployment', t => {
  const f = fixture(t);
  writeSite(join(f.root, 'dist'), oldVersion);
  const zip = makeZip(f, newVersion, [{ name: 'dist/../../escaped.txt', content: 'must not be extracted' }]);
  configureRemote(f, zip);
  assertFailure(runPull(f));
  assertSite(join(f.root, 'dist'), oldVersion);
  assert.equal(existsSync(join(f.root, 'escaped.txt')), false);
  assert.equal(existsSync(join(f.directory, 'escaped.txt')), false);
  assert.equal(existsSync(join(f.root, '.dist-previous')), false);
});

test('pull-latest restores an interrupted deployment before attempting a failing download', t => {
  const f = fixture(t);
  writeSite(join(f.root, '.dist-previous'), oldVersion);
  configureRemote(f, makeZip(f), { sha: [{ status: 22 }] });
  assertFailure(runPull(f));
  assertSite(join(f.root, 'dist'), oldVersion);
  assert.equal(existsSync(join(f.root, '.dist-previous')), false);
});

test('pull-latest refuses an older valid remote package without replacing the newer deployed website', t => {
  const f = fixture(t);
  writeSite(join(f.root, 'dist'));
  configureRemote(f, makeZip(f, oldVersion));
  assertFailure(runPull(f));
  assertSite(join(f.root, 'dist'));
  assert.equal(existsSync(join(f.root, '.dist-previous')), false);
});

test('pull-latest permits an intentional downgrade only when explicitly enabled', t => {
  const f = fixture(t);
  writeSite(join(f.root, 'dist'));
  configureRemote(f, makeZip(f, oldVersion));
  assertSuccess(runPull(f, { ALLOW_DOWNGRADE: '1' }));
  assertSite(join(f.root, 'dist'), oldVersion);
  assertSite(join(f.root, '.dist-previous'));
});

test('pull-latest replaces a symlinked deployed asset without following or changing its external target', t => {
  const f = fixture(t);
  const zip = makeZip(f);
  writeSite(join(f.root, 'dist'));
  const outside = join(f.directory, 'external-app.js');
  writeFileSync(outside, site()['assets/app.js']);
  const asset = join(f.root, 'dist/assets/app.js');
  unlinkSync(asset);
  symlinkSync(outside, asset);
  cacheZip(f, zip);
  configureRemote(f, zip);
  assertSuccess(runPull(f));
  assertSite(join(f.root, 'dist'));
  assert.equal(lstatSync(asset).isSymbolicLink(), false);
  assert.equal(readFileSync(outside, 'utf8'), site()['assets/app.js']);
  assert.equal(lstatSync(join(f.root, '.dist-previous/assets/app.js')).isSymbolicLink(), true);
});

test('pull-latest deploy restores the old directory when installing the prepared directory fails', t => {
  const f = fixture(t);
  const stage = join(f.directory, 'stage');
  writeSite(join(f.root, 'dist'), oldVersion);
  writeSite(join(stage, 'dist'));
  const result = executePython(['-c', `import importlib.util, os, sys
from pathlib import Path

script, root, stage = map(Path, sys.argv[1:])
spec = importlib.util.spec_from_file_location('pull_latest_rollback_test', script)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
original_replace = module.os.replace
calls = []
def fail_install(source, destination, *args, **kwargs):
    calls.append((Path(source), Path(destination)))
    if Path(source) == stage / 'dist' and Path(destination) == root / 'dist':
        raise OSError('injected failure installing prepared dist')
    return original_replace(source, destination, *args, **kwargs)
module.os.replace = fail_install
failed = False
try:
    module.deploy(stage, root)
except (OSError, RuntimeError):
    failed = True
assert failed, 'installation failure must be surfaced'
assert len(calls) >= 3, calls
assert calls[1] == (stage / 'dist', root / 'dist'), calls
assert (root / 'dist' / 'index.html').read_text() == ${JSON.stringify(site(oldVersion)['index.html'])}
assert (root / 'dist' / 'assets' / 'app.js').read_text() == ${JSON.stringify(site(oldVersion)['assets/app.js'])}
assert (stage / 'dist' / 'index.html').is_file(), 'failed replacement must preserve staged files'
`, pullScript, f.root, stage], {
    cwd: f.directory,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  assertSuccess(result);
  assertSite(join(f.root, 'dist'), oldVersion);
});

test('pull-latest unpack creates web-readable files and directories under a restrictive cron umask', t => {
  const f = fixture(t);
  makeZip(f);
  const stage = join(f.directory, 'stage');
  mkdirSync(stage);
  const result = executePython(['-c', `import importlib.util, os, stat, sys
from pathlib import Path

script, archive, stage = map(Path, sys.argv[1:])
spec = importlib.util.spec_from_file_location('pull_latest_permissions_test', script)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
previous_umask = os.umask(0o077)
try:
    module.unpack(archive, stage)
finally:
    os.umask(previous_umask)
dist = stage / 'dist'
for path in [dist, *dist.rglob('*')]:
    expected = 0o755 if path.is_dir() else 0o644
    assert stat.S_IMODE(path.stat().st_mode) == expected, (str(path), oct(path.stat().st_mode))
`, pullScript, join(f.remote, `site-${newVersion}.zip`), stage], {
    cwd: f.directory,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  assertSuccess(result);
  assertSite(join(stage, 'dist'));
});

test('pull-latest exits without downloading or changing the website while another deployment owns the lock', t => {
  const f = fixture(t);
  writeSite(join(f.root, 'dist'), oldVersion);
  configureRemote(f, makeZip(f));
  const result = executePython(['-c', `import fcntl, os, subprocess, sys
from pathlib import Path

script, root = map(Path, sys.argv[1:])
with (root / '.deploy.lock').open('a') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    result = subprocess.run([sys.executable, str(script)], capture_output=True, text=True, env=os.environ, timeout=5)
    assert result.returncode != 0, (result.stdout, result.stderr)
    assert not (Path(os.environ['PULL_TEST_REMOTE']) / 'requests.json').exists(), 'locked run must not download'
`, pullScript, f.root], {
    cwd: f.directory,
    env: {
      ...process.env, EXTRACT_DIR: f.root, BASE_URL: baseUrl, PROXY: '', PULL_RETRY_DELAY: '0',
      PULL_TEST_REMOTE: f.remote, PYTHONDONTWRITEBYTECODE: '1',
      PATH: `${f.bin}${delimiter}${process.env.PATH || ''}`,
    },
  });
  assertSuccess(result);
  assertSite(join(f.root, 'dist'), oldVersion);
  assert.deepEqual(requests(f), []);
});
