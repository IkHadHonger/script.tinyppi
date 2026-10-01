"""Merge upstream without discarding the Jellyfin fork; stop on real conflicts."""
from pathlib import Path
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET


def git(*args, check=True):
    return subprocess.run(['git', *args], check=check, text=True, capture_output=True)


def version(text):
    value = ET.fromstring(text).attrib['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+', value):
        raise ValueError(f'Manual version review needed: {value}')
    return tuple(map(int, value.split('.')))


def normalize(text, current):
    # Only release bookkeeping is resolved automatically. All code conflicts stop.
    text = re.sub(r'(<addon\b[^>]*\bversion=")[^"]+', r'\g<1>' + current['version'], text, count=1)
    return re.sub(r'(\bprovider-name=")[^"]+', r'\g<1>' + current['provider-name'], text, count=1)


def main():
    if git('status', '--porcelain').stdout.strip():
        raise RuntimeError('Worktree must be clean')
    git('fetch', 'https://github.com/CE-Repo/script.tinyppi.git', 'main')
    upstream = git('rev-parse', 'FETCH_HEAD').stdout.strip()
    if git('merge-base', '--is-ancestor', upstream, 'HEAD', check=False).returncode == 0:
        print('Already synchronized; no changes')
        return
    base = git('merge-base', 'HEAD', upstream).stdout.strip()
    changes = git('diff', '--name-only', base, upstream).stdout.splitlines()
    if any(p.startswith(('.github/', 'tools/sync_upstream')) for p in changes):
        raise RuntimeError('Upstream automation changes require manual review')
    ours = git('show', 'HEAD:addon.xml').stdout
    theirs = git('show', f'{upstream}:addon.xml').stdout
    previous = git('show', f'{base}:addon.xml').stdout
    current = ET.fromstring(ours).attrib
    result = git('merge', '--no-commit', '--no-ff', upstream, check=False)
    conflicts = git('diff', '--name-only', '--diff-filter=U').stdout.splitlines()
    if result.returncode and conflicts != ['addon.xml']:
        raise RuntimeError('Manual merge needed: ' + result.stderr + ', '.join(conflicts))
    if conflicts:
        with tempfile.TemporaryDirectory() as temporary:
            paths = [Path(temporary) / str(i) for i in range(3)]
            for path, text in zip(paths, [ours, previous, theirs]):
                path.write_text(normalize(text, current), encoding='utf-8')
            merged = git('merge-file', '-p', *map(str, paths), check=False)
            if merged.returncode:
                raise RuntimeError('Addon metadata conflict needs manual review')
            Path('addon.xml').write_text(merged.stdout, encoding='utf-8')
    text = Path('addon.xml').read_text(encoding='utf-8')
    highest = max(version(ours), version(theirs))
    new = '.'.join(map(str, (*highest[:2], highest[2] + 1)))
    text = re.sub(r'(<addon\b[^>]*\bversion=")[^"]+', r'\g<1>' + new, text, count=1)
    root = ET.fromstring(text)
    # Fork intentionally remains installable on Kodi 21; a future ABI change stops.
    dependency = root.find("requires/import[@addon='xbmc.python']")
    if dependency.attrib['version'] != '3.0.0':
        raise RuntimeError('Kodi Python ABI changed; compatibility review required')
    Path('addon.xml').write_text(text, encoding='utf-8')
    bridge = Path('resources/lib/web/jellyfin.py')
    bridge.write_text(re.sub(r'Version="[\d.]+"', f'Version="{new}"', bridge.read_text(encoding='utf-8')), encoding='utf-8')
    git('add', 'addon.xml', str(bridge))
    print(f'Upstream merge ready for tests: {new}')


if __name__ == '__main__':
    main()
