# flip-clock

<p align="center">
  <img src="./src-tauri/icons/icon.png" alt="Flip Clock" width="200">
</p>

<h1 align="center">Flip Clock</h1>

<p align="center">
  <strong>A minimalist, open-source desktop flip clock built with Tauri</strong><br>
  <em>24h/12h Display · Multiple Themes · Pure CSS Animation · Cross-Platform</em>
</p>

---

## Features

- **Pure CSS Flip Animation** - No external dependencies, smooth 3D transforms
- **10 Beautiful Themes** - Dark, Light, Sepia, Blue, Forest, Sunset, Midnight, Ocean, Rose, Slate
- **12h / 24h Toggle** - Switch time formats with one click
- **Lunar Calendar (农历)** - Display Chinese lunar date
- **Custom Motto** - Add your own daily quote
- **Native Fullscreen** - Real fullscreen support on macOS
- **Hide Desktop Icon** - Run as background app with no dock/taskbar entry (see [Background Mode](#background-mode))
- **Local-first** - No cloud, no telemetry

## Tech Stack

- **Tauri 2** - Native desktop framework
- **Rust** - Application backend
- **Pure CSS/JS** - Flip clock animation (no jQuery, no external libraries)

## Quick Start

### Prerequisites

- Rust 1.70+
- Node.js 18+ (for frontend development, optional)
- macOS, Windows, or Linux

### Build & Run

```bash
# Build the application
cargo build

# Run in development mode
cargo run

# Build release version
cargo build --release
```

### Run the Built Binary

```bash
# macOS/Linux
./src-tauri/target/debug/flip-clock

# Or from the src-tauri directory
cd src-tauri && cargo run
```

## Configuration

Configuration is stored at:
- **macOS/Linux**: `~/.flip-clock/config.json`
- **Windows**: `%USERPROFILE%\.flip-clock\config.json`

Default config:

```json
{
  "motto": "君子三思而后行",
  "theme": "dark",
  "style": "with-seconds",
  "timeFormat": "24h",
  "showDate": true,
  "showSeconds": true,
  "showLunar": false,
  "showMotto": true,
  "showInDock": true
}
```

The `showInDock` toggle controls whether the app shows a dock/taskbar icon. See [Background Mode](#background-mode) for details.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `F11` | Toggle fullscreen |
| `Ctrl/Cmd + ,` | Open settings |
| `Escape` | Close settings |

## Project Structure

```
flip-clock/
├── Cargo.toml              # Rust workspace
├── src-tauri/
│   ├── Cargo.toml          # Tauri app config
│   ├── build.rs            # Build script
│   ├── tauri.conf.json     # Tauri configuration
│   ├── capabilities/        # Permissions
│   ├── icons/              # App icons
│   └── src/
│       ├── main.rs         # Entry point + Tauri commands
│       └── config.rs       # Config management
└── frontend/
    ├── index.html          # Main HTML
    ├── styles.css          # Pure CSS (themes + flip animation)
    └── clock.js            # Pure JS clock logic
```

## Themes

| Theme | Description |
|-------|-------------|
| `dark` | Deep black background |
| `light` | Clean white background |
| `sepia` | Warm vintage tone |
| `blue` | Cool blue palette |
| `forest` | Natural green tones |
| `sunset` | Warm orange/red |
| `midnight` | Purple night sky |
| `ocean` | Teal ocean waves |
| `rose` | Soft pink tones |
| `slate` | Neutral gray |

## Background Mode

Toggle **"桌面图标 (Dock/任务栏)"** in Settings to drop the dock/taskbar icon and run as a background clock. The preference is persisted to `config.json` as `showInDock` and applied at startup so users who disabled the icon never see a flash of the entry on launch.

How it actually behaves per platform (driven by the underlying OS API Tauri's `set_dock_visibility` / `set_skip_taskbar` wraps):

| Platform | Tauri API | What changes |
|----------|-----------|--------------|
| **macOS** | `AppHandle::set_dock_visibility(false)` → `TransformProcessType(...kProcessTransformToUIElementApplication)` (verified via `lsappinfo type` field flipping between `"Foreground"` and `"UIElement"`) | The dock icon is removed and the process becomes a **UIElement**. The clock **window itself stays on the desktop** — confirmed by screenshot. Tauri does **not** call `NSApp.hide(nil)` in this path. The app's menu-bar items (`翻转时钟` / `窗口`) are still registered with the system, but they're only visible when the window has actual focus (click it first). |
| **Windows** | `Window::set_skip_taskbar(true)` → toggles `WS_EX_APPWINDOW` on the main window | Only the **taskbar entry** is removed; the window stays visible on the desktop and can still be alt-tabbed / interacted with. Reach Settings via `Ctrl+,` to toggle it back on. |
| **Linux** | _None_ | The preference is **saved and respected** on macOS/Windows, but on Linux it has no visible effect. See [Known Limitations](#known-limitations). |

Toggling the checkbox in Settings invokes `set_dock_visibility` immediately, so the change is live — there's no need to restart.

## Known Limitations

- **Linux "Hide Desktop Icon" is a no-op.** Tauri 2's core runtime does not expose a cross-desktop API for suppressing the launcher / taskbar entry. GNOME's dash-to-dock, KDE's plasmashell, XFCE's xfce4-panel each use different D-Bus interfaces (`com.canonical.Unity.LauncherEntry`, `org.kde.plasma`, etc.), and no single call suppresses all of them. The reliable Linux-compatible fix is a system-tray icon with a "Show clock" menu — tracked as a follow-up, out of scope for the `showInDock` setting.

- **On Windows, only the taskbar entry is hidden** — the window itself remains visible. This is the closest equivalent Tauri exposes; it matches the macOS intent (no dock clutter) without the "where did my window go?" problem on a platform that has no menu-bar surface to recover from.

- **On macOS, the window *stays on screen* after toggling off** (verified in v1.0.9 testing). Tauri's `set_dock_visibility(false)` only calls `TransformProcessType(..., kProcessTransformToUIElementApplication)` — it does **not** call `NSApp.hide(nil)`. So with the dock icon gone, the clock window is still right where you left it. That makes the recovery path easy: click the visible window to focus it, then use the menu bar (the `翻转时钟` → `设置` item) to flip the toggle back on. If for some reason the window is also off-screen, you can edit `~/.flip-clock/config.json` by hand — set `"showInDock": true` and relaunch.

- **There's a 1-second debounce on the macOS path** (in tao `set_dock_hide`). Hiding the dock icon immediately after showing it again is a no-op for 1 s, because rapid dock-show/dock-hide transitions can leave stray icons. So if you toggle the setting on then off in quick succession, the second `off` may appear unresponsive — wait a second and try again.

- **One-shot config migration on upgrade to v1.0.9.** Older releases wrote `showInDock: false` to `config.json` as a dead-field default (the field was never wired to runtime before). If every such legacy value were honored on first v1.0.9 launch, every existing user would silently lose the dock icon — without ever touching the setting. To prevent that, the first launch of v1.0.9+ detects configs with `version < 2`, resets `showInDock` to `true`, and re-saves the file with the new schema marker. Users who later flip the toggle off in Settings are unaffected — only the legacy dead-field value is migrated.

## CI/CD

This project uses GitHub Actions for continuous integration and release automation.

### Workflows

#### CI Workflow (`.github/workflows/ci.yml`)

Runs on every push to `main`/`master` and on pull requests:

| Job | Description |
|-----|-------------|
| `lint` | Code formatting check and Clippy linting |
| `test` | Unit tests via `cargo test` |
| `build-check` | Cross-platform build verification (Linux, Windows, macOS) |

#### Release Workflow (`.github/workflows/release.yml`)

Triggered by:
- Pushing a version tag (`git tag v*` and push)
- Manual trigger via `workflow_dispatch`

Builds and packages:
- **Linux**: Standalone binary
- **Windows**: NSIS installer
- **macOS**: Universal DMG (arm64 + x86_64)

Artifacts are uploaded to GitHub Releases as draft releases.

### Running Locally

```bash
# Build with Tauri (produces native binaries)
cd src-tauri
cargo tauri build

# Or use the build script (includes DMG icon fix)
./scripts/build.sh
```

### Creating a Release

```bash
# Update version in:
# - src-tauri/Cargo.toml
# - src-tauri/tauri.conf.json

# Create and push a tag
git tag v1.0.0
git push origin v1.0.0
```

The release workflow will automatically:
1. Build for all platforms
2. Package macOS DMG as universal binary
3. Create a draft GitHub Release with artifacts

## License

MIT License
