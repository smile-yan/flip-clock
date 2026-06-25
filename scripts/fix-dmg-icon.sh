#!/bin/bash
# Post-process DMG file to embed custom icon
# Uses a Swift script to set the icon using macOS native APIs
#
# Usage: ./scripts/fix-dmg-icon.sh <path-to-dmg> <path-to-icns-icon>
#
# This is needed because hdiutil doesn't preserve custom icons on DMG files.
# The Swift script uses NSWorkspace.setIcon() to embed the icon properly.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SWIFT_SCRIPT="$SCRIPT_DIR/SetFileIcon"

DMG_PATH="${1:?Usage: $0 <dmg-path> <icns-path>}"
ICNS_PATH="${2:?Usage: $0 <dmg-path> <icns-path>}"

if [[ ! -f "$DMG_PATH" ]]; then
    echo "Error: DMG not found: $DMG_PATH" >&2
    exit 1
fi

if [[ ! -f "$ICNS_PATH" ]]; then
    echo "Error: Icon not found: $ICNS_PATH" >&2
    exit 1
fi

# Check if Swift script exists
if [[ ! -x "$SWIFT_SCRIPT" ]]; then
    echo "Compiling Swift icon setter..."
    (cd "$SCRIPT_DIR" && swiftc SetFileIcon.swift -o SetFileIcon)
fi

echo "Setting custom icon on DMG: $DMG_PATH"
echo "Using icon: $ICNS_PATH"

# Run the Swift script
"$SWIFT_SCRIPT" "$ICNS_PATH" "$DMG_PATH"

# Verify
ATTRS=$(GetFileInfo -a "$DMG_PATH" 2>/dev/null)
if echo "$ATTRS" | grep -q "C"; then
    echo ""
    echo "✅ SUCCESS: Custom icon has been set on the DMG"
    echo ""
    echo "Note: You may need to restart Finder or clear the icon cache"
    echo "      to see the new icon. Run:"
    echo "        killall Finder"
    exit 0
else
    echo "❌ WARNING: Could not verify icon was set" >&2
    exit 1
fi
