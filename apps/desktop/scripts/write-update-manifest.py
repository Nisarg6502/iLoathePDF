"""Write latest.json, the update manifest installed copies of the app read.

    python3 write-update-manifest.py <dist dir> <tag> <owner/repo> > latest.json

<dist dir> holds the release files as release-desktop.yml collects them: the
Windows installer and the two macOS update archives, each next to its
minisign signature (<file>.sig) made with TAURI_SIGNING_PRIVATE_KEY. The app
checks a download against that signature before installing it.
"""

import datetime
import json
import sys
from pathlib import Path

# tauri-plugin-updater's platform key -> how the file for it is named.
PLATFORMS = {
    "windows-x86_64": "_x64-setup.exe",
    "darwin-aarch64": "_aarch64.app.tar.gz",
    "darwin-x86_64": "_x86_64.app.tar.gz",
}


def main() -> None:
    dist, tag, repo = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
    base = f"https://github.com/{repo}/releases/download/{tag}/"

    platforms = {}
    for platform, suffix in PLATFORMS.items():
        found = [p for p in dist.iterdir() if p.name.endswith(suffix)]
        if len(found) != 1:
            sys.exit(f"{platform}: expected one file ending in {suffix}, found {[p.name for p in found]}")
        signature = found[0].with_name(found[0].name + ".sig")
        if not signature.is_file():
            sys.exit(f"{platform}: no signature for {found[0].name}. Is TAURI_SIGNING_PRIVATE_KEY set?")
        platforms[platform] = {"signature": signature.read_text().strip(), "url": base + found[0].name}

    manifest = {
        "version": tag.lstrip("v"),
        "notes": f"See https://github.com/{repo}/releases/tag/{tag}",
        "pub_date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "platforms": platforms,
    }
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
