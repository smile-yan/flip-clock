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

## License

BSD-4-Clause
