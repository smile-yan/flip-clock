use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    /// Schema version, bumped whenever a migration runs in `load()`.
    /// v1.0.x files had no `version` field at all — `#[serde(default)]`
    /// makes them parse with `version = 0` so the migration branch can
    /// catch them and bump to `CURRENT_SCHEMA_VERSION`.
    #[serde(default)]
    pub version: u32,
    pub motto: String,
    #[serde(rename = "width")]
    pub width: i32,
    #[serde(rename = "height")]
    pub height: i32,
    #[serde(rename = "x")]
    pub x: i32,
    #[serde(rename = "y")]
    pub y: i32,
    #[serde(rename = "showInDock")]
    pub show_in_dock: bool,
    pub theme: String,
    pub style: String,
    #[serde(rename = "timeFormat")]
    pub time_format: String,
    #[serde(rename = "showDate")]
    pub show_date: bool,
    #[serde(rename = "showSeconds")]
    pub show_seconds: bool,
    #[serde(rename = "showLunar")]
    pub show_lunar: bool,
    #[serde(rename = "showMotto")]
    pub show_motto: bool,
    pub color: String,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            // Current schema version. Bump this when `load()` learns a
            // new migration branch so existing files migrate in place.
            version: CURRENT_SCHEMA_VERSION,
            motto: "君子三思而后行".to_string(),
            width: 600,
            height: 300,
            x: -1,
            y: -1,
            // Default to `true` — the dock/taskbar icon is shown out of the box.
            // Users who want a background clock can flip this off in Settings.
            show_in_dock: true,
            theme: "dark".to_string(),
            style: "with-seconds".to_string(),
            time_format: "24h".to_string(),
            show_date: true,
            show_seconds: true,
            show_lunar: false,
            show_motto: true,
            color: "".to_string(),
        }
    }
}

/// Bumped from `1` (the v1.0.9 default when the field was added) to `2`
/// when one-shot migration of legacy `showInDock: false` was introduced.
/// Any pre-v1.0.9 config.json — written with the dead-field default
/// `false` — migrates to `show_in_dock = true` on first load and is
/// re-saved with `version = 2`.
pub const CURRENT_SCHEMA_VERSION: u32 = 2;

pub const DEFAULT_THEME: &str = "dark";
pub const DEFAULT_STYLE: &str = "with-seconds";
pub const DEFAULT_TIME_FORMAT: &str = "24h";

pub fn available_themes() -> Vec<&'static str> {
    vec![
        "dark", "light", "sepia", "blue", "forest", "sunset", "midnight", "ocean", "rose", "slate",
    ]
}

pub fn available_styles() -> Vec<&'static str> {
    vec!["with-seconds", "without-seconds"]
}

pub fn available_time_formats() -> Vec<&'static str> {
    vec!["24h", "12h"]
}

fn get_config_dir() -> Result<PathBuf, String> {
    let home_dir = dirs::home_dir().ok_or_else(|| "Failed to get home directory".to_string())?;
    Ok(home_dir.join(".flip-clock"))
}

fn get_config_path() -> Result<PathBuf, String> {
    Ok(get_config_dir()?.join("config.json"))
}

pub fn load() -> Result<Config, String> {
    let config_path = get_config_path()?;

    if !config_path.exists() {
        log::info!("Config file not found, using defaults");
        return Ok(Config::default());
    }

    let data =
        fs::read_to_string(&config_path).map_err(|e| format!("Failed to read config: {}", e))?;

    let mut cfg: Config =
        serde_json::from_str(&data).map_err(|e| format!("Failed to parse config: {}", e))?;

    // One-shot migration: v1.0.x files were written with showInDock =
    // false as the dead-field default. After show_in_dock became a live
    // signal in v1.0.9, that legacy "false" would have hidden the dock
    // icon (and on macOS the window itself) for every existing user on
    // first upgrade — even though they never made that choice. Reset to
    // the new default and persist the bumped schema version.
    if migrate_in_place(&mut cfg) {
        // Best-effort write-back. If it fails, the in-memory migration
        // still takes effect this session; next launch will re-try.
        if let Err(e) = save(&cfg) {
            log::warn!("Failed to persist migrated config: {}", e);
        }
    }

    // Apply defaults for missing fields
    if cfg.theme.is_empty() {
        cfg.theme = DEFAULT_THEME.to_string();
    }
    if cfg.style.is_empty() {
        cfg.style = DEFAULT_STYLE.to_string();
    }
    if cfg.time_format.is_empty() {
        cfg.time_format = DEFAULT_TIME_FORMAT.to_string();
    }

    log::info!(
        "Loaded config: motto={} theme={} style={} time_format={}",
        cfg.motto,
        cfg.theme,
        cfg.style,
        cfg.time_format
    );

    Ok(cfg)
}

pub fn save(cfg: &Config) -> Result<(), String> {
    let config_dir = get_config_dir()?;
    let config_path = get_config_path()?;

    // Create config directory if it doesn't exist
    fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config directory: {}", e))?;

    let data = serde_json::to_string_pretty(cfg)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&config_path, data).map_err(|e| format!("Failed to write config: {}", e))?;

    log::info!("Config saved to {:?}", config_path);

    Ok(())
}

/// Bring a `Config` deserialized from disk up to `CURRENT_SCHEMA_VERSION`.
/// Returns `true` when something was actually migrated (so the caller can
/// decide to re-save). Extracted so it can be unit-tested without touching
/// `~/.flip-clock/config.json`.
fn migrate_in_place(cfg: &mut Config) -> bool {
    if cfg.version >= CURRENT_SCHEMA_VERSION {
        return false;
    }

    log::info!(
        "Migrating legacy config schema (version={} → {})",
        cfg.version,
        CURRENT_SCHEMA_VERSION
    );

    // v0 / v1 → v2: legacy files were written with showInDock = false as
    // a dead-field default. After v1.0.9 made that field live, every
    // upgraded user would have lost the dock icon and (on macOS) the
    // window itself without ever touching the setting. Reset to the new
    // default and bump the schema marker so we don't migrate twice.
    cfg.show_in_dock = true;
    cfg.version = CURRENT_SCHEMA_VERSION;
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Regression guard for v1.0.9: fresh installs (Config::default)
    /// must keep the dock/taskbar icon visible. The old default was
    /// `false`, which after the field became a live `set_dock_visibility`
    /// signal would silently hide the icon for new users.
    #[test]
    fn default_show_in_dock_is_true() {
        assert!(
            Config::default().show_in_dock,
            "Config::default() must default show_in_dock to true so new \
             installs see the dock/taskbar icon"
        );
    }

    /// The frontend speaks camelCase (`showInDock`); the Rust struct uses
    /// snake_case (`show_in_dock`). serde rename wires them together —
    /// verify both directions so a rename regression doesn't break the
    /// frontend/backend contract.
    #[test]
    fn serde_uses_camel_case_show_in_dock() {
        let cfg = Config::default();
        let json = serde_json::to_string(&cfg).expect("serialize");
        assert!(
            json.contains("\"showInDock\""),
            "Serialized config must use camelCase 'showInDock' for the \
             frontend; got: {json}"
        );
        assert!(
            !json.contains("\"show_in_dock\""),
            "Serialized config must NOT expose the Rust snake_case name: {json}"
        );
    }

    /// JSON written by `Config` must reload into an equal `Config`. This
    /// is the property that protects any future field additions from
    /// silently breaking load (e.g. missing-field errors that block
    /// start-up).
    #[test]
    fn serde_round_trip_preserves_field() {
        let mut cfg = Config::default();
        cfg.show_in_dock = false;
        cfg.motto = "退笔如山未足珍".to_string();
        cfg.theme = "ocean".to_string();

        let json = serde_json::to_string(&cfg).expect("serialize");
        let restored: Config = serde_json::from_str(&json).expect("deserialize");

        assert_eq!(restored.show_in_dock, false, "show_in_dock must round-trip");
        assert_eq!(restored.motto, "退笔如山未足珍");
        assert_eq!(restored.theme, "ocean");
    }

    /// A legacy v1.0.x config.json written with `showInDock: false` (the
    /// old dead-field default) must still parse cleanly into a Config
    /// with `show_in_dock == false` and `version == 0`. That's the exact
    /// shape `load()` needs to detect so the migration branch can reset
    /// `show_in_dock` to `true`.
    #[test]
    fn parse_legacy_show_in_dock_false_yields_version_zero() {
        // Mimic a config.json written by v1.0.6 / v1.0.7.
        let legacy = r#"{
            "motto": "君子三思而后行",
            "width": 600, "height": 300, "x": -1, "y": -1,
            "showInDock": false,
            "theme": "dark", "style": "with-seconds", "timeFormat": "24h",
            "showDate": true, "showSeconds": true,
            "showLunar": false, "showMotto": true,
            "color": ""
        }"#;

        let cfg: Config =
            serde_json::from_str(legacy).expect("legacy config.json must still parse");

        assert_eq!(
            cfg.show_in_dock, false,
            "legacy showInDock:false must survive parse so we can detect \
             it and run the upgrade-migration path"
        );
        assert_eq!(
            cfg.version, 0,
            "a v1.0.x config.json has no `version` field; #[serde(default)] \
             on the field makes it parse as 0 so migration can fire"
        );
    }

    /// The actual upgrade-safety guard: legacy config (version < 2 +
    /// show_in_dock = false) must be migrated to version 2 and have
    /// show_in_dock flipped to `true`. Without this, every existing
    /// user upgrading to v1.0.9 would suddenly see the icon disappear.
    #[test]
    fn migrate_resets_legacy_show_in_dock_false() {
        let legacy = r#"{
            "version": 0,
            "motto": "君子三思而后行",
            "width": 600, "height": 300, "x": -1, "y": -1,
            "showInDock": false,
            "theme": "dark", "style": "with-seconds", "timeFormat": "24h",
            "showDate": true, "showSeconds": true,
            "showLunar": false, "showMotto": true,
            "color": ""
        }"#;

        let mut cfg: Config = serde_json::from_str(legacy).expect("parse");
        let migrated = migrate_in_place(&mut cfg);

        assert!(
            migrated,
            "migrate_in_place must report it touched the config"
        );
        assert_eq!(
            cfg.show_in_dock, true,
            "legacy showInDock:false must be reset to true — otherwise the \
             very first v1.0.9 launch hides the dock icon for every existing user"
        );
        assert_eq!(
            cfg.version, CURRENT_SCHEMA_VERSION,
            "schema version must be bumped so we don't migrate twice on next load"
        );
    }

    /// A second load of an already-migrated file must be a no-op.
    /// Otherwise we'd log "Migrating..." on every launch and re-write the
    /// file unnecessarily.
    #[test]
    fn migrate_is_idempotent_on_current_version() {
        let mut cfg = Config::default();
        assert_eq!(cfg.version, CURRENT_SCHEMA_VERSION);

        let migrated = migrate_in_place(&mut cfg);

        assert!(!migrated, "current-version config must not need migration");
        assert_eq!(cfg.show_in_dock, true);
        assert_eq!(cfg.version, CURRENT_SCHEMA_VERSION);
    }

    /// `Config::default` carries the current schema marker so any
    /// first-run file already says "I'm up to date" and `load()` won't
    /// need to re-save it immediately.
    #[test]
    fn default_is_at_current_schema_version() {
        assert_eq!(Config::default().version, CURRENT_SCHEMA_VERSION);
    }
}
