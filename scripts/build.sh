#!/bin/bash
# Build script for flip-clock that includes DMG icon fix
# Usage: ./scripts/build.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "========================================"
echo "Building flip-clock"
echo "========================================"
echo ""

# Build with Tauri
echo "Step 1: Building with Tauri..."
cd "$PROJECT_DIR/src-tauri"
cargo tauri build

echo ""
echo "Step 2: Setting custom icon on DMG..."

# Find the DMG file
DMG_DIR="$PROJECT_DIR/src-tauri/target/release/bundle/dmg"
ICNS_PATH="$PROJECT_DIR/src-tauri/icons/icon.icns"

# Find the DMG file (there might be multiple for different architectures)
DMG_FILE=$(ls -t "$DMG_DIR"/*.dmg 2>/dev/null | head -1)

if [[ -z "$DMG_FILE" ]]; then
    echo "Error: No DMG file found in $DMG_DIR" >&2
    exit 1
fi

if [[ ! -f "$ICNS_PATH" ]]; then
    echo "Error: Icon file not found: $ICNS_PATH" >&2
    exit 1
fi

echo "DMG: $DMG_FILE"
echo "Icon: $ICNS_PATH"

# Run the icon fix script
"$SCRIPT_DIR/fix-dmg-icon.sh" "$DMG_FILE" "$ICNS_PATH"

echo ""
echo "========================================"
echo "Build complete!"
echo "========================================"
echo ""
echo "Output: $DMG_FILE"
