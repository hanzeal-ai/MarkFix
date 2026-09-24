"""Publish verified immutable installers, then switch the existing API policy."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit
from urllib.request import urlopen


def digest(path):
    checksum = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            checksum.update(chunk)
    return checksum.hexdigest()


def validate_artifact(source, commit):
    manifest = json.loads((source / 'download-manifest.json').read_text())
    if manifest.get('schemaVersion') != 1 or not re.fullmatch(r'[a-f0-9]{40}', commit):
        raise ValueError('Invalid manifest or commit')
    if manifest.get('commit') != commit:
        raise ValueError('Artifact commit mismatch')
    version = manifest.get('version', '')
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Invalid desktop version')
    platform = manifest.get('platform')
    distribution = manifest.get('distribution')
    if distribution not in ('trial', 'signed'):
        raise ValueError('Unknown distribution')
    if platform == 'windows' and manifest.get('arch') == 'x64':
        expected = [f'MarkFix-{version}-windows-x64-setup.exe']
    elif platform == 'macos' and manifest.get('arch') == 'arm64':
        expected = [f'MarkFix-{version}-arm64.dmg']
        if distribution == 'signed':
            expected.append(f'MarkFix-{version}-arm64.zip')
    else:
        raise ValueError('Unsupported platform or architecture')
    origin = manifest.get('origin', '')
    url = urlsplit(origin)
    if (url.scheme != 'https' or not url.hostname or url.username or url.password
            or url.path not in ('', '/') or url.query or url.fragment
            or any(c.isspace() for c in origin)):
        raise ValueError('Downloads require a plain HTTPS origin')
    files = manifest.get('files', [])
    if [entry.get('name') for entry in files] != expected:
        raise ValueError('Unexpected package filenames')
    for entry in files:
        path = source / entry['name']
        if path.is_symlink() or not path.is_file():
            raise ValueError('Package must be a regular file')
        if entry.get('size', 0) <= 0 or path.stat().st_size != entry['size']:
            raise ValueError('Package size mismatch')
        if digest(path) != entry.get('sha256'):
            raise ValueError('Package checksum mismatch')
    return manifest


def stage_artifact(source, root, manifest):
    relative = Path(manifest['platform']) / manifest['version'] / manifest['commit']
    destination = root / relative
    if destination.exists():
        for entry in manifest['files']:
            if not (destination / entry['name']).is_file() or digest(destination / entry['name']) != entry['sha256']:
                raise ValueError('An immutable release already exists with different bytes')
        return destination, relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    for directory in (root, root / manifest['platform'], destination.parent):
        directory.chmod(0o755)
    temporary = Path(tempfile.mkdtemp(prefix='.incoming-', dir=destination.parent))
    try:
        for entry in manifest['files']:
            shutil.copyfile(source / entry['name'], temporary / entry['name'])
            (temporary / entry['name']).chmod(0o644)
        checksums = ''.join(f"{entry['sha256']}  {entry['name']}\n" for entry in manifest['files'])
        (temporary / 'SHA256SUMS.txt').write_text(checksums)
        (temporary / 'SHA256SUMS.txt').chmod(0o644)
        temporary.chmod(0o755)
        temporary.rename(destination)
    except BaseException:
        shutil.rmtree(temporary)
        raise
    return destination, relative


def policy_changes(manifest, relative):
    base = manifest['origin'].rstrip('/') + '/downloads/' + relative.as_posix() + '/'
    version = manifest['version']
    if manifest['platform'] == 'windows':
        return {'MARKFIX_DESKTOP_WINDOWS_X64_DOWNLOAD_URL': base + manifest['files'][0]['name'],
                'MARKFIX_WINDOWS_RECOMMENDED_DESKTOP_VERSION': version,
                'MARKFIX_DESKTOP_WINDOWS_DISTRIBUTION': manifest['distribution']}
    return {'MARKFIX_DESKTOP_DOWNLOAD_URL': base + manifest['files'][0]['name'],
            'MARKFIX_RECOMMENDED_DESKTOP_VERSION': version,
            'MARKFIX_DESKTOP_MAC_DISTRIBUTION': manifest['distribution'],
            'MARKFIX_DESKTOP_MAC_ARM64_UPDATE_URL': base + manifest['files'][1]['name'] if manifest['distribution'] == 'signed' else ''}


def replace_env(original, changes):
    # Preserve unrelated configuration, including comments and quoting.
    lines = [line for line in original.splitlines() if line.split('=', 1)[0] not in changes]
    return '\n'.join(lines + [f'{key}={value}' for key, value in changes.items()]) + '\n'


def atomic_write(path, contents):
    descriptor, temporary = tempfile.mkstemp(prefix='.desktop-policy-', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'w') as stream:
            stream.write(contents)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def verify_public(url, expected):
    checksum = hashlib.sha256()
    with urlopen(url, timeout=120) as response:
        if response.status != 200:
            raise ValueError('Public download did not return HTTP 200')
        for chunk in iter(lambda: response.read(1024 * 1024), b''):
            checksum.update(chunk)
    if checksum.hexdigest() != expected:
        raise ValueError('Anonymous public download checksum mismatch')


def publish(source, deploy_root, commit):
    manifest = validate_artifact(source, commit)
    with (deploy_root / 'deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        current = (deploy_root / 'current').resolve(strict=True)
        if (current / 'source.sha').read_text().strip() != commit:
            raise ValueError('Refusing to publish packages for a different deployed commit')
        root = deploy_root / 'downloads'
        _, relative = stage_artifact(source, root, manifest)
        base = manifest['origin'].rstrip('/') + '/downloads/' + relative.as_posix() + '/'
        for entry in manifest['files']:
            verify_public(base + entry['name'], entry['sha256'])
        env_file = deploy_root / 'app.env'
        original = env_file.read_text()
        changes = policy_changes(manifest, relative)
        backup_dir = deploy_root / 'backups'
        backup_dir.mkdir(exist_ok=True)
        fd, backup = tempfile.mkstemp(prefix='desktop-policy-', suffix='.env', dir=backup_dir)
        with os.fdopen(fd, 'w') as stream:
            stream.write(original)
        command = ['docker', 'compose', '--project-name', 'markfix-preview', '--env-file', str(env_file),
                   '--env-file', str(current / 'images.env'), '-f', str(current / 'compose.yaml'),
                   'up', '-d', '--no-deps', '--wait', '--wait-timeout', '180', 'api']
        environment = dict(os.environ, MARKFIX_ENV_FILE=str(env_file), MARKFIX_DOWNLOAD_ROOT=str(root))
        try:
            atomic_write(env_file, replace_env(original, changes))
            subprocess.run(command, env=environment, check=True)
            query = 'win32&arch=x64' if manifest['platform'] == 'windows' else 'darwin&arch=arm64'
            with urlopen(manifest['origin'].rstrip('/') + '/v1/client-policy?version=' + manifest['version'] + '&platform=' + query, timeout=30) as response:
                policy = json.load(response)
            if policy.get('downloadUrl') != base + manifest['files'][0]['name'] or policy.get('distribution') != manifest['distribution']:
                raise ValueError('Published API policy does not match verified installer')
        except BaseException:
            atomic_write(env_file, original)
            subprocess.run(command, env=environment, check=True)
            raise
        print('Published verified ' + manifest['platform'] + ' download: ' + base + manifest['files'][0]['name'])
        print('Previous policy backup: ' + backup)


if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit('Usage: publish_desktop.py ARTIFACT_DIR DEPLOY_ROOT COMMIT_SHA')
    publish(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3])
