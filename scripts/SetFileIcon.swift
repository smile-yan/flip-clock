#!/usr/bin/env swift

import Foundation
import AppKit

// Usage: SetFileIcon <icon.icns> <target-file>

let args = CommandLine.arguments
guard args.count >= 3 else {
    print("Usage: SetFileIcon <icon.icns> <target-file>")
    exit(1)
}

let iconPath = args[1]
let targetPath = args[2]

// Load the icon from the icns file
guard let iconImage = NSImage(contentsOfFile: iconPath) else {
    print("Error: Could not load icon from \(iconPath)")
    exit(1)
}

// Set the icon on the target file
let targetURL = URL(fileURLWithPath: targetPath)
let success = NSWorkspace.shared.setIcon(iconImage, forFile: targetPath, options: [])

if success {
    print("SUCCESS: Icon set on \(targetPath)")
    exit(0)
} else {
    print("FAILED: Could not set icon on \(targetPath)")
    exit(1)
}
