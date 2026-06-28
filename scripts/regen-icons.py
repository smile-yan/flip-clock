#!/usr/bin/env python3
"""Regenerate all derived icon assets from the master icon.

Source of truth:
  - icons/icon.png (1024x1024 RGBA) — pixel master
  - icons/icon.svg — vector sibling, used by Linux deb/AppImage bundlers as-is

Derived output (overwritten in place):
  - icons/32x32.png           (Tauri default)
  - icons/128x128.png         (Tauri default)
  - icons/128x128@2x.png      (macOS @2x)
  - icons/linux-{16,22,24,32,48,64,96,128,256,512}.png
  - icons/icon.ico            (8-layer PNG-embedded ICO, max layer 256x256)

Why no 512-px ICO layer: the ICO header's width/height fields are one byte
each, so 256 is the largest size that can be described natively. Embedding
a 512-px PNG payload with a 256x256 header produces an icon that Windows
renders by trusting the header — the upscaled result is the "blurry taskbar"
bug we are fixing here.

Usage:
  python3 scripts/regen-icons.py [ICONS_DIR]

ICONS_DIR defaults to ../src-tauri/icons relative to this script.
"""

from __future__ import annotations

import io
import os
import struct
import sys
from pathlib import Path

from PIL import Image

# Pillow 9.1+ has the Resampling enum; older releases use Image.LANCZOS.
try:
    LANCZOS = Image.Resampling.LANCZOS  # type: ignore[attr-defined]
except AttributeError:  # pragma: no cover - Pillow < 9.1 fallback
    LANCZOS = Image.LANCZOS  # type: ignore[attr-defined]

# Pairs where two filenames must be byte-identical outputs (Tauri's bundler
# treats the desktop entries and the Linux hicolor entries independently,
# but they should be the same pixel data so the icon doesn't drift).
SHARED_PNG_LAYOUT = [
    # (output_filename, size_px, shared_aliases)
    ("32x32.png",       32,  ["linux-32.png"]),
    ("128x128.png",     128, ["linux-128.png"]),
    ("128x128@2x.png",  256, ["linux-256.png"]),
]

# Linux-only sizes that don't have a Tauri-default alias.
LINUX_ONLY_PNG_LAYOUT = [
    ("linux-16.png",   16),
    ("linux-22.png",   22),
    ("linux-24.png",   24),
    ("linux-48.png",   48),
    ("linux-64.png",   64),
    ("linux-96.png",   96),   # 175% DPI; not present in the repo today
    ("linux-512.png",  512),
]

# ICO layers — must all be ≤ 256 (see module docstring).
ICO_LAYERS = [16, 24, 32, 48, 64, 96, 128, 256]


def _die(msg: str) -> "None":
    print(f"❌ {msg}", file=sys.stderr)
    sys.exit(1)


def _load_master(icons_dir: Path) -> Image.Image:
    master_png = icons_dir / "icon.png"
    master_svg = icons_dir / "icon.svg"
    if not master_png.exists():
        _die(f"missing master {master_png}")
    if not master_svg.exists():
        _die(f"missing master {master_svg}")

    img = Image.open(master_png)
    if img.size != (1024, 1024):
        _die(
            f"{master_png} must be 1024x1024, got {img.size}. "
            "Re-export the master from your design tool and re-run."
        )
    if img.mode != "RGBA":
        # Common when the source PNG was saved without an alpha channel.
        img = img.convert("RGBA")
    return img


def _downsample(master: Image.Image, size: int) -> Image.Image:
    """Resize master to (size, size) using Lanczos resampling."""
    return master.resize((size, size), resample=LANCZOS)


def _write_png(img: Image.Image, path: Path) -> None:
    img.save(path, format="PNG", optimize=True)


def regenerate_pngs(icons_dir: Path, master: Image.Image) -> None:
    # Shared pairs: write the primary, then byte-copy to aliases.
    for primary, size, aliases in SHARED_PNG_LAYOUT:
        resized = _downsample(master, size)
        _write_png(resized, icons_dir / primary)
        for alias in aliases:
            # Pillow's PNG output is deterministic given identical input and
            # options, so writing the same Image object twice yields the
            # same bytes — but copy the file to make the contract explicit.
            data = (icons_dir / primary).read_bytes()
            (icons_dir / alias).write_bytes(data)

    # Linux-only sizes.
    for name, size in LINUX_ONLY_PNG_LAYOUT:
        _write_png(_downsample(master, size), icons_dir / name)


def _build_ico_layers(master: Image.Image) -> list[Image.Image]:
    """Return one PIL Image per ICO layer, all square PNG."""
    return [_downsample(master, s) for s in ICO_LAYERS]


def regenerate_ico(icons_dir: Path, master: Image.Image) -> None:
    ico_path = icons_dir / "icon.ico"
    layers = _build_ico_layers(master)
    sizes = [(s, s) for s in ICO_LAYERS]

    # Pillow ≥ 10 honors `sizes` exactly when writing a fresh ICO. We pass
    # the largest layer as the primary `Image` and `sizes=` to enumerate
    # the rest. We deliberately do NOT pass `append_images=` because that
    # path historically let mismatched frames slip through.
    primary = layers[-1]  # 256x256
    primary.save(
        ico_path,
        format="ICO",
        sizes=sizes,
    )

    # Sanity check: read back, confirm each layer's header matches its PNG
    # payload dimensions. This is the regression that bit us last time.
    verify_ico_header_payload_consistency(ico_path)


def verify_ico_header_payload_consistency(ico_path: Path) -> None:
    """Fail loudly if any ICO layer's header width/height disagrees with its
    embedded PNG payload size.

    This must catch the bug from commit 722310a, where the largest layer's
    header field was 256 but its PNG payload was 512.
    """
    data = ico_path.read_bytes()
    if len(data) < 6:
        _die(f"{ico_path} too small to be an ICO ({len(data)} bytes)")

    reserved, img_type, count = struct.unpack("<HHH", data[:6])
    if reserved != 0:
        _die(f"{ico_path} reserved field must be 0, got {reserved}")
    if img_type != 1:
        _die(f"{ico_path} type must be 1 (icon), got {img_type}")
    if count == 0:
        _die(f"{ico_path} contains zero layers")

    expected_header = 6 + count * 16
    if len(data) < expected_header:
        _die(f"{ico_path} truncated: header claims {count} layers but file is {len(data)} bytes")

    print(f"  {ico_path.name}: {count} layers declared in header")
    bad: list[tuple[int, int, int, tuple[int, int]]] = []

    for i in range(count):
        base = 6 + i * 16
        w, h, palette, _reserved, planes, bpp, size, off = struct.unpack(
            "<BBBBHHII", data[base : base + 16]
        )
        header_w = 256 if w == 0 else w
        header_h = 256 if h == 0 else h
        if header_w != header_h:
            bad.append((i, header_w, header_h, (0, 0)))
            continue
        if off + size > len(data):
            bad.append((i, header_w, header_h, (0, 0)))
            print(
                f"    layer {i}: payload offset+size out of bounds "
                f"(off={off} size={size} file={len(data)})",
                file=sys.stderr,
            )
            continue

        payload = data[off : off + size]
        try:
            frame = Image.open(io.BytesIO(payload))
            frame.load()
            actual = frame.size
        except Exception as exc:
            print(
                f"    layer {i}: failed to decode payload: {exc}",
                file=sys.stderr,
            )
            bad.append((i, header_w, header_h, (0, 0)))
            continue

        if actual != (header_w, header_h):
            bad.append((i, header_w, header_h, actual))

    if bad:
        msg = ", ".join(
            f"layer {i} header={hw}x{hh} but payload={pa}" for i, hw, hh, pa in bad
        )
        _die(f"{ico_path} header/payload mismatch: {msg}")

    sizes: list[int] = []
    for i in range(count):
        w, _h = struct.unpack("<BB", data[6 + i * 16 : 8 + i * 16])
        sizes.append(256 if w == 0 else w)
    print(f"    sizes: {sorted(sizes, reverse=True)}")


def main(argv: list[str]) -> int:
    if len(argv) > 2:
        print("Usage: regen-icons.py [ICONS_DIR]", file=sys.stderr)
        return 2

    if len(argv) == 2:
        icons_dir = Path(argv[1])
    else:
        icons_dir = Path(__file__).resolve().parent.parent / "src-tauri" / "icons"

    if not icons_dir.is_dir():
        _die(f"icons dir not found: {icons_dir}")

    print(f"📁 Icons dir: {icons_dir}")

    master = _load_master(icons_dir)
    print(f"🎨 Master loaded: 1024x1024 RGBA")

    print("🖼  Regenerating PNG variants...")
    regenerate_pngs(icons_dir, master)

    print("🪟 Regenerating icon.ico (8-layer, header==payload verified)...")
    regenerate_ico(icons_dir, master)

    print("✅ All derived icons regenerated.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))