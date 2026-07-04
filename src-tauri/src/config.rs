use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
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
            motto: "君子三思而后行".to_string(),
            width: 600,
            height: 300,
            x: -1,
            y: -1,
            show_in_dock: false,
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
