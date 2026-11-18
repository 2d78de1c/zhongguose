#!/usr/bin/env python3
"""Pull and deploy the rolling server ZIP. Requires Python 3 and curl on Linux."""
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import uuid
import zipfile


DEFAULT_URL = 'https://github.com/2d78de1c/zhongguose/releases/download/latest'
ZIP_NAME = 'dist-vlatest.zip'
SHA_NAME = ZIP_NAME + '.sha256'
VERSION = r'(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)'


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def manifest(directory):
    data = json.loads((directory / 'release.json').read_text())
    if (not isinstance(data, dict)
            or not re.fullmatch(VERSION, str(data.get('version', '')))
            or data.get('tag') != 'v' + data['version']
            or not re.fullmatch(r'[0-9a-f]{40}', str(data.get('commit', '')))
            or not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', str(data.get('repository', '')))):
        raise ValueError('包内 release.json 版本信息无效')
    return data


def fetch(url, output, proxy):
    command = ['curl', '--fail', '--location', '--silent', '--show-error',
               '--retry', '2', '--connect-timeout', '15', '--max-time', '120',
               '--header', 'Cache-Control: no-cache', '--header', 'Pragma: no-cache']
    if proxy:
        command += ['--socks5-hostname', proxy]
    result = subprocess.run(command + ['--output', str(output), url], capture_output=True, text=True)
    if result.returncode:
        error = result.stderr.strip()
        if proxy:
            error = error.replace(proxy, '[proxy]')
        raise RuntimeError(f'下载失败 (curl {result.returncode}): {error}')


def download(base_url, cache, proxy, retry_delay):
    """A mismatched rolling pair must be fetched together again, never deployed."""
    cached_zip = cache / ZIP_NAME
    last_error = None
    for attempt in range(3):
        try:
            with tempfile.TemporaryDirectory(prefix='.download-', dir=cache) as temporary:
                work = Path(temporary)
                nonce = uuid.uuid4().hex
                fetch(f'{base_url}/{SHA_NAME}?update={nonce}', work / SHA_NAME, proxy)
                checksum = (work / SHA_NAME).read_text().strip()
                match = re.fullmatch(r'([0-9a-fA-F]{64})\s+\*?dist-vlatest\.zip', checksum)
                if not match:
                    raise ValueError('远程 SHA256 文件格式无效，停止使用该文件')
                expected = match[1].lower()
                if cached_zip.is_file() and digest(cached_zip) == expected:
                    print('缓存 ZIP 校验通过；继续检查实际部署目录。', flush=True)
                else:
                    fetch(f'{base_url}/{ZIP_NAME}?update={nonce}', work / ZIP_NAME, proxy)
                    if digest(work / ZIP_NAME) != expected:
                        raise ValueError('ZIP 与 SHA256 不一致，可能正在切换 latest 附件')
                    os.replace(work / ZIP_NAME, cached_zip)
                    print('已下载并校验最新 ZIP。', flush=True)
                os.replace(work / SHA_NAME, cache / SHA_NAME)
                return cached_zip, expected
        except (OSError, ValueError, RuntimeError) as error:
            last_error = error
            print(f'第 {attempt + 1}/3 次获取失败：{error}', file=sys.stderr, flush=True)
            if attempt < 2:
                time.sleep(retry_delay)
    raise RuntimeError(f'未获取到有效的 latest 下载包；现有部署保留。最后错误：{last_error}')


def unpack(archive, stage):
    """Validate all members before extracting any files into a private stage."""
    with zipfile.ZipFile(archive) as source:
        entries = source.infolist()
        names = set()
        if sum(entry.file_size for entry in entries) > 128 * 1024 * 1024:
            raise ValueError('解压内容超过静态网站包的大小限制')
        for entry in entries:
            path = PurePosixPath(entry.filename)
            mode = entry.external_attr >> 16
            if (not path.parts or path.parts[0] != 'dist' or path.is_absolute()
                    or '..' in path.parts or '\\' in entry.filename
                    or (len(path.parts) == 1 and not entry.is_dir())
                    or stat.S_ISLNK(mode) or (stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR))):
                raise ValueError(f'ZIP 包含非法路径或非普通文件：{entry.filename}')
            normalized = str(path)
            if normalized in names:
                raise ValueError(f'ZIP 包含重复路径：{normalized}')
            names.add(normalized)
        if not {'dist/index.html', 'dist/release.json'} <= names:
            raise ValueError('ZIP 必须包含 dist/index.html 和 dist/release.json')
        broken = source.testzip()
        if broken:
            raise ValueError(f'ZIP 文件损坏：{broken}')
        for entry in entries:
            destination = stage.joinpath(*PurePosixPath(entry.filename).parts)
            if entry.is_dir():
                destination.mkdir(parents=True, exist_ok=True)
                continue
            destination.parent.mkdir(parents=True, exist_ok=True)
            with source.open(entry) as stream, destination.open('xb') as output:
                shutil.copyfileobj(stream, output)
            destination.chmod(0o644)
    # A restrictive cron umask must not make the web server lose directory access.
    for directory in stage.rglob('*'):
        if directory.is_dir():
            directory.chmod(0o755)
    if not (stage / 'dist/index.html').is_file() or not (stage / 'dist/index.html').stat().st_size:
        raise ValueError('包内 index.html 为空或不是普通文件')
    return manifest(stage / 'dist')


def same_files(first, second):
    if not second.is_dir() or second.is_symlink():
        return False
    def files(root):
        result = {}
        for path in root.rglob('*'):
            if path.is_symlink():
                return None
            if path.is_file():
                result[path.relative_to(root)] = path
        return result
    expected, actual = files(first), files(second)
    if expected is None or actual is None or expected.keys() != actual.keys():
        return False
    return all(expected[name].stat().st_size == actual[name].stat().st_size
               and digest(expected[name]) == digest(actual[name]) for name in expected)


def recover(root):
    live, previous = root / 'dist', root / '.dist-previous'
    if live.is_symlink() or previous.is_symlink():
        raise RuntimeError('dist 或备份是符号链接，请先确认当前服务器部署方式')
    if not live.exists() and previous.is_dir():
        os.replace(previous, live)
        print('检测到中断的目录切换，已恢复上一版 dist。', flush=True)


def deploy(stage, root):
    live, previous = root / 'dist', root / '.dist-previous'
    if live.is_symlink() or previous.is_symlink():
        raise RuntimeError('不能替换符号链接形式的部署目录')
    if previous.exists():
        os.replace(previous, root / ('.dist-backup-' + uuid.uuid4().hex))
    moved = False
    try:
        if live.exists():
            os.replace(live, previous)
            moved = True
        os.replace(stage / 'dist', live)
    except BaseException:
        if moved and not live.exists():
            os.replace(previous, live)
        raise
    return moved


def main():
    root = Path(os.environ.get('EXTRACT_DIR', '/data/app/zhongguose')).expanduser().absolute()
    if root == Path('/'):
        raise ValueError('EXTRACT_DIR 不得为根目录')
    new_root = not root.exists()
    root.mkdir(parents=True, exist_ok=True)
    if new_root:
        root.chmod(0o755)
    with (root / '.deploy.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('另一更新进程正在运行，本次退出')
        recover(root)
        base_url = os.environ.get('BASE_URL', DEFAULT_URL).rstrip('/')
        cache = Path(os.environ.get('CACHE_DIR', str(root / '.download-cache'))).expanduser().absolute()
        cache.mkdir(parents=True, exist_ok=True)
        retry_delay = float(os.environ.get('PULL_RETRY_DELAY', '1'))
        if not 0 <= retry_delay <= 60:
            raise ValueError('PULL_RETRY_DELAY 必须在 0 到 60 秒之间')
        archive, checksum = download(base_url, cache, os.environ.get('PROXY', ''), retry_delay)
        with tempfile.TemporaryDirectory(prefix='.deploy-', dir=root) as temporary:
            stage = Path(temporary)
            release = unpack(archive, stage)
            print(f"下载包版本：{release['tag']}  提交：{release['commit']}\nSHA256：{checksum}", flush=True)
            try:
                installed = manifest(root / 'dist')
            except (OSError, ValueError, TypeError):
                installed = None
            if (installed and tuple(map(int, installed['version'].split('.')))
                    > tuple(map(int, release['version'].split('.')))
                    and os.environ.get('ALLOW_DOWNGRADE') != '1'):
                raise RuntimeError(f"远程包 {release['tag']} 比已部署的 {installed['tag']} 旧，拒绝自动降级；请检查下载地址或代理缓存")
            if same_files(stage / 'dist', root / 'dist'):
                print('实际部署文件全部一致，无需替换。', flush=True)
            else:
                had_previous = deploy(stage, root)
                print('部署文件已更新。' + ('上一版保留在 .dist-previous。' if had_previous else '首次部署完成。'), flush=True)
            print(f"当前部署：{release['tag']}\n部署目录：{root / 'dist'}", flush=True)
            print('若网站仍是旧版，请核对 Web 服务根目录，以及 index.html / release.json 的缓存。', flush=True)


if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt) as error:
        print(f'更新失败：{error}', file=sys.stderr)
        sys.exit(1)
