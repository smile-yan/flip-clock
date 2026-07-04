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
  "showMotto": true
}
```

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
