"""Merge upstream without discarding the Jellyfin fork; stop on real conflicts."""

import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path


def git(*args, check=True):
    return subprocess.run(["git", *args], check=check, text=True, capture_output=True)


def version(text):
    value = ET.fromstring(text).attrib["version"]
    if not re.fullmatch(r"\d+\.\d+\.\d+", value):
        raise ValueError(f"Manual version review needed: {value}")
    return tuple(map(int, value.split(".")))


def normalize(text, current):
    # Only release bookkeeping is resolved automatically. All code conflicts stop.
    text = re.sub(r'(<addon\b[^>]*\bversion=")[^"]+', r"\g<1>" + current["version"], text, count=1)
    return re.sub(r'(\bprovider-name=")[^"]+', r"\g<1>" + current["provider-name"], text, count=1)


def preserve_python_compatibility(text):
    """Keep the fork's postponed annotations on top of upstream properties."""
    marker = "from __future__ import annotations"
    if marker in text:
        return text
    match = re.match(r'((?:#.*\n)*\n?"""[\s\S]*?"""\n)', text)
    if not match:
        raise RuntimeError("properties.py module header needs manual review")
    return text[:match.end()] + "\n" + marker + "\n" + text[match.end():]


def main():
    if git("status", "--porcelain").stdout.strip():
        raise RuntimeError("Worktree must be clean")
    git("fetch", "https://github.com/CE-Repo/script.tinyppi.git", "main")
    upstream = git("rev-parse", "FETCH_HEAD").stdout.strip()
    if git("merge-base", "--is-ancestor", upstream, "HEAD", check=False).returncode == 0:
        print("Already synchronized; no changes")
        return
    base = git("merge-base", "HEAD", upstream).stdout.strip()
    changes = git("diff", "--name-only", base, upstream).stdout.splitlines()
    reviewed_automation = {".github/workflows/wiki.yml"}
    automation_changes = [
        p for p in changes
        if p.startswith((".github/", "tools/sync_upstream"))
        and p not in reviewed_automation
    ]
    if automation_changes:
        raise RuntimeError(
            "Upstream automation changes require manual review: "
            + ", ".join(automation_changes)
        )
    ours = git("show", "HEAD:addon.xml").stdout
    theirs = git("show", f"{upstream}:addon.xml").stdout
    previous = git("show", f"{base}:addon.xml").stdout
    current = ET.fromstring(ours).attrib
    result = git("merge", "--no-commit", "--no-ff", upstream, check=False)
    conflicts = git("diff", "--name-only", "--diff-filter=U").stdout.splitlines()
    supported = {
        "addon.xml",
        "docs/web-dashboard.md",
        "resources/lib/info/properties.py",
    }
    if result.returncode and not set(conflicts).issubset(supported):
        raise RuntimeError("Manual merge needed: " + result.stderr + ", ".join(conflicts))
    if "docs/web-dashboard.md" in conflicts:
        # Upstream replaced its redirect page with wiki/, but this fork's page
        # contains Jellyfin, multi-box and relay documentation of its own.
        git("checkout", "--ours", "--", "docs/web-dashboard.md")
        git("add", "docs/web-dashboard.md")
    if "resources/lib/info/properties.py" in conflicts:
        path = Path("resources/lib/info/properties.py")
        upstream_properties = git("show", f"{upstream}:{path}").stdout
        path.write_text(preserve_python_compatibility(upstream_properties), encoding="utf-8")
        git("add", str(path))
    if "addon.xml" in conflicts:
        with tempfile.TemporaryDirectory() as temporary:
            paths = [Path(temporary) / str(i) for i in range(3)]
            for path, text in zip(paths, [ours, previous, theirs], strict=True):
                path.write_text(normalize(text, current), encoding="utf-8")
            merged = git("merge-file", "-p", *map(str, paths), check=False)
            if merged.returncode:
                raise RuntimeError("Addon metadata conflict needs manual review")
            Path("addon.xml").write_text(merged.stdout, encoding="utf-8")
    awards = Path("resources/data/awards.json")
    if awards.exists():
        # Upstream's generated single-line dataset may carry whitespace after
        # the JSON value; keep the payload byte-for-byte and normalize its EOF.
        awards.write_text(awards.read_text(encoding="utf-8").rstrip() + "\n", encoding="utf-8")
        git("add", str(awards))
    text = Path("addon.xml").read_text(encoding="utf-8")
    highest = max(version(ours), version(theirs))
    new = ".".join(map(str, (*highest[:2], highest[2] + 1)))
    text = re.sub(r'(<addon\b[^>]*\bversion=")[^"]+', r"\g<1>" + new, text, count=1)
    root = ET.fromstring(text)
    # Fork intentionally remains installable on Kodi 21; a future ABI change stops.
    dependency = root.find("requires/import[@addon='xbmc.python']")
    if dependency is None:
        raise RuntimeError("Kodi Python dependency disappeared; compatibility review required")
    # This fork targets Kodi 21 / CoreELEC 21.3 as well as Piers. The complete
    # suite below is the compatibility gate; do not inherit upstream's 3.1
    # declaration while the fork remains valid on Python 3.11.
    dependency.attrib["version"] = "3.0.0"
    text = ET.tostring(root, encoding="unicode")
    if not text.startswith("<?xml"):
        text = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + text
    text = "\n".join(line.rstrip() for line in text.splitlines()) + "\n"
    Path("addon.xml").write_text(text, encoding="utf-8")
    bridge = Path("resources/lib/web/jellyfin.py")
    bridge.write_text(
        re.sub(r'Version="[\d.]+"', f'Version="{new}"', bridge.read_text(encoding="utf-8")),
        encoding="utf-8",
    )
    git("add", "addon.xml", str(bridge))
    print(f"Upstream merge ready for tests: {new}")


if __name__ == "__main__":
    main()
