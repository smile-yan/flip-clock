#!/usr/bin/env python3
"""Render the Tauri updater manifest (update.json) for a GitHub release.

The manifest is what `tauri-plugin-updater` fetches on "检查更新": each platform
entry pairs a download URL with the minisign signature of that exact payload. A
missing signature or a URL that points at a nonexistent asset makes the updater
fail closed, so this script refuses to emit an entry unless both the payload and
its `.sig` sidecar are present in the artifact directory.

Usage:
    render-update-json.py --tag v1.0.23 --repo smile-yan/flip-clock \
        --assets release-assets --out update.json

Artifact names are produced by the release workflow's rename step, e.g.
`flip-clock-v1.0.23-macos-arm64.app.tar.gz`, so matching on the suffix is enough
to identify which file backs each platform key.
"""

from __future__ import annotations

import argparse
import datetime
import json
import pathlib
import sys
import urllib.parse

# Tauri platform key -> suffix of the release asset that backs it.
#
# macOS and Windows are backed by the updater payloads the bundler generates
# (`createUpdaterArtifacts`): a `.app.tar.gz` and the NSIS setup executable.
# Linux is backed by the AppImage tarball rather than the .deb/.rpm, because
# replacing an AppImage needs no privileges — the deb/rpm paths in the plugin
# shell out to dpkg/rpm through pkexec or sudo, which is not silent.
PLATFORM_ASSETS = {
    "darwin-aarch64": "-macos-arm64.app.tar.gz",
    "darwin-x86_64": "-macos-x86_64.app.tar.gz",
    "windows-x86_64": "-windows-x86_64-setup.exe",
    "linux-x86_64": "-linux-x86_64.AppImage.tar.gz",
}


class AmbiguousAssetError(RuntimeError):
    """Two assets matched one platform key — the rename step let a collision through."""


def find_asset(assets_dir: pathlib.Path, suffix: str) -> pathlib.Path | None:
    """Return the single file under assets_dir whose name ends with suffix."""
    matches = [p for p in assets_dir.rglob("*") if p.is_file() and p.name.endswith(suffix)]
    if not matches:
        return None
    if len(matches) > 1:
        # Ambiguity means the rename step let a collision through; picking one
        # arbitrarily would silently ship a manifest pointing at the wrong build.
        names = ", ".join(sorted(p.name for p in matches))
        raise AmbiguousAssetError(f"multiple assets match {suffix!r}: {names}")
    return matches[0]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tag", required=True, help="git tag, e.g. v1.0.23")
    parser.add_argument("--repo", required=True, help="owner/name on GitHub")
    parser.add_argument("--assets", required=True, type=pathlib.Path)
    parser.add_argument("--out", required=True, type=pathlib.Path)
    parser.add_argument(
        "--notes",
        default="Bug fixes and improvements",
        help="release notes shown in the in-app update prompt",
    )
    parser.add_argument(
        "--platform",
        action="append",
        dest="platforms",
        help="restrict output to this platform key (repeatable); default is all",
    )
    args = parser.parse_args()

    if not args.assets.is_dir():
        print(f"error: assets directory {args.assets} does not exist", file=sys.stderr)
        return 1

    version = args.tag[1:] if args.tag.startswith("v") else args.tag
    wanted = args.platforms or list(PLATFORM_ASSETS)

    platforms: dict[str, dict[str, str]] = {}
    missing: list[str] = []

    try:
        for key in wanted:
            suffix = PLATFORM_ASSETS.get(key)
            if suffix is None:
                print(f"error: unknown platform key {key!r}", file=sys.stderr)
                return 1

            asset = find_asset(args.assets, suffix)
            if asset is None:
                missing.append(f"{key} (no asset matching '*{suffix}')")
                continue

            # The bundler writes `<payload>.sig` next to the payload it signed.
            sig_file = asset.with_name(asset.name + ".sig")
            if not sig_file.is_file():
                missing.append(f"{key} (missing signature {sig_file.name})")
                continue

            signature = sig_file.read_text(encoding="utf-8").strip()
            if not signature:
                missing.append(f"{key} (empty signature in {sig_file.name})")
                continue

            url = (
                f"https://github.com/{args.repo}/releases/download/"
                f"{urllib.parse.quote(args.tag)}/{urllib.parse.quote(asset.name)}"
            )
            platforms[key] = {"signature": signature, "url": url}
    except AmbiguousAssetError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if missing:
        # Fail rather than publish a manifest with holes: a platform that is
        # silently absent means those users never see the update at all.
        print("error: incomplete updater artifacts:", file=sys.stderr)
        for item in missing:
            print(f"  - {item}", file=sys.stderr)
        return 1

    manifest = {
        "version": version,
        "notes": args.notes,
        "pub_date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "platforms": platforms,
    }

    args.out.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {args.out} for v{version} ({len(platforms)} platform(s))")
    return 0


if __name__ == "__main__":
    sys.exit(main())
