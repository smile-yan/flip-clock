#!/bin/bash
# Regenerate all derived icon assets from the master sources in src-tauri/icons.
#
# Master sources (do NOT overwrite):
#   src-tauri/icons/icon.png  — 1024x1024 pixel master
#   src-tauri/icons/icon.svg  — vector sibling, shipped verbatim to Linux deb/AppImage
#
# Derived outputs (overwritten by this script):
#   src-tauri/icons/32x32.png, 128x128.png, 128x128@2x.png
#   src-tauri/icons/linux-{16,22,24,32,48,64,96,128,256,512}.png
#   src-tauri/icons/icon.ico   — 8-layer PNG-embedded, max 256x256 per layer
#   src-tauri/icons/icon.icns  — only rebuilt when this script runs on macOS
#
# Run this after editing icon.png or icon.svg, before committing.
# Usage: ./scripts/regen-icons.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ICONS_DIR="$PROJECT_DIR/src-tauri/icons"

echo "========================================"
echo "Regenerating icons from master"
echo "========================================"
echo ""

# --- Pre-flight checks ----------------------------------------------------

if ! command -v python3 >/dev/null 2>&1; then
  echo "❌ python3 not found on PATH. Install Python 3.10+ and retry." >&2
  exit 1
fi

if ! python3 -c "import PIL" 2>/dev/null; then
  echo "❌ Pillow (Python Imaging Library) not installed." >&2
  echo "   Install with: pip install pillow" >&2
  exit 1
fi

if [[ ! -f "$ICONS_DIR/icon.png" ]]; then
  echo "❌ Missing master: $ICONS_DIR/icon.png" >&2
  exit 1
fi

if [[ ! -f "$ICONS_DIR/icon.svg" ]]; then
  echo "❌ Missing master: $ICONS_DIR/icon.svg" >&2
  exit 1
fi

# --- Step 1: regenerate PNG variants + icon.ico ---------------------------

echo "Step 1: Regenerating PNG variants + icon.ico..."
python3 "$SCRIPT_DIR/regen-icons.py" "$ICONS_DIR"
echo ""

# --- Step 2: regenerate icon.icns on macOS ---------------------------------

if [[ "$(uname)" == "Darwin" ]]; then
  if ! command -v iconutil >/dev/null 2>&1; then
    echo "⚠️  iconutil not found; skipping icon.icns rebuild. The existing icon.icns is left in place." >&2
  else
    echo "Step 2: Rebuilding icon.icns via iconutil..."
    ICONSET_DIR="$(mktemp -d)/flip-clock.iconset"
    mkdir -p "$ICONSET_DIR"

    # macOS iconset layout — every variant is a normal-resolution file plus
    # an @2x retina twin. We derive everything from the 1024x1024 master.
    cp "$ICONS_DIR/icon.png" "$ICONSET_DIR/icon_512x512@2x.png"
    sips -z 512 512 "$ICONS_DIR/icon.png" --out "$ICONSET_DIR/icon_512x512.png"   >/dev/null
    sips -z 256 256 "$ICONS_DIR/icon.png" --out "$ICONSET_DIR/icon_256x256.png"   >/dev/null
    sips -z 256 256 "$ICONS_DIR/icon.png" --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null
    sips -z 128 128 "$ICONS_DIR/icon.png" --out "$ICONSET_DIR/icon_128x128.png"   >/dev/null
    sips -z  64  64 "$ICONS_DIR/icon.png" --out "$ICONSET_DIR/icon_32x32@2x.png"  >/dev/null
    sips -z  32  32 "$ICONS_DIR/icon.png" --out "$ICONSET_DIR/icon_32x32.png"     >/dev/null
    sips -z  32  32 "$ICONS_DIR/icon.png" --out "$ICONSET_DIR/icon_16x16@2x.png"  >/dev/null
    sips -z  16  16 "$ICONS_DIR/icon.png" --out "$ICONSET_DIR/icon_16x16.png"     >/dev/null

    iconutil -c icns "$ICONSET_DIR" -o "$ICONS_DIR/icon.icns"
    rm -rf "$(dirname "$ICONSET_DIR")"
    echo "   ✅ icon.icns rebuilt"
  fi
  echo ""
elif [[ "$(uname)" == "Linux" ]]; then
  echo "Step 2: Skipping icon.icns (iconutil only ships on macOS)."
  echo "       The existing icon.icns is left in place; it can be refreshed on a macOS host."
  echo ""
else
  # windows (Git Bash / WSL)
  echo "Step 2: Skipping icon.icns (iconutil not available on $(uname))."
  echo ""
fi

echo "========================================"
echo "✅ Done. Review 'git status' under $ICONS_DIR"
echo "========================================"