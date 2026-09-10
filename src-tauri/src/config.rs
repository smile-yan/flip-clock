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
    // 旧版本配置文件里没有该字段，default 允许缺失时按关闭处理
    #[serde(rename = "showFireflies", default)]
    pub show_fireflies: bool,
    // 萤火虫数量 / 速度档位（1..=3，3 为最多/最快），旧配置缺失时取默认档
    #[serde(rename = "fireflyCount", default = "default_firefly_count")]
    pub firefly_count: i32,
    #[serde(rename = "fireflySpeed", default = "default_firefly_speed")]
    pub firefly_speed: i32,
    pub color: String,
}

fn default_firefly_count() -> i32 {
    DEFAULT_FIREFLY_COUNT
}

fn default_firefly_speed() -> i32 {
    DEFAULT_FIREFLY_SPEED
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
            show_fireflies: false,
            firefly_count: DEFAULT_FIREFLY_COUNT,
            firefly_speed: DEFAULT_FIREFLY_SPEED,
            color: "".to_string(),
        }
    }
}

pub const DEFAULT_THEME: &str = "dark";
pub const DEFAULT_STYLE: &str = "with-seconds";
pub const DEFAULT_TIME_FORMAT: &str = "24h";

// 萤火虫档位：1 少/慢，2 适中，3 多/快（默认，等同旧版表现）
pub const MIN_FIREFLY_LEVEL: i32 = 1;
pub const MAX_FIREFLY_LEVEL: i32 = 3;
pub const DEFAULT_FIREFLY_COUNT: i32 = 3;
pub const DEFAULT_FIREFLY_SPEED: i32 = 3;

/// 档位只认 1..=3，越界（含旧配置的 0 和手改的脏值）一律退回 fallback
pub fn clamp_firefly_level(level: i32, fallback: i32) -> i32 {
    if (MIN_FIREFLY_LEVEL..=MAX_FIREFLY_LEVEL).contains(&level) {
        level
    } else {
        fallback
    }
}

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
    // 档位可能来自旧配置（无字段）或手改的 config.json，统一收敛到 1..=3
    cfg.firefly_count = clamp_firefly_level(cfg.firefly_count, DEFAULT_FIREFLY_COUNT);
    cfg.firefly_speed = clamp_firefly_level(cfg.firefly_speed, DEFAULT_FIREFLY_SPEED);

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

#[cfg(test)]
mod tests {
    use super::*;

    // 前端 TAURI_KEY_MAP 用 camelCase 与后端对话，字段名一旦漂移就会静默丢配置
    #[test]
    fn levels_round_trip_as_camel_case() {
        let cfg = Config {
            firefly_count: 1,
            firefly_speed: 2,
            ..Config::default()
        };
        let json = serde_json::to_string(&cfg).unwrap();
        assert!(json.contains("\"fireflyCount\":1"), "{}", json);
        assert!(json.contains("\"fireflySpeed\":2"), "{}", json);

        let back: Config = serde_json::from_str(&json).unwrap();
        assert_eq!(back.firefly_count, 1);
        assert_eq!(back.firefly_speed, 2);
    }

    // 升级上来的老配置没有这两个字段，必须按默认档（3）读出来
    #[test]
    fn old_config_without_firefly_levels_uses_defaults() {
        let old = r#"{"motto":"hi","width":600,"height":300,"x":-1,"y":-1,
            "showInDock":false,"theme":"dark","style":"with-seconds",
            "timeFormat":"24h","showDate":true,"showSeconds":true,
            "showLunar":false,"showMotto":true,"showFireflies":true,"color":""}"#;
        let cfg: Config = serde_json::from_str(old).unwrap();
        assert_eq!(cfg.firefly_count, DEFAULT_FIREFLY_COUNT);
        assert_eq!(cfg.firefly_speed, DEFAULT_FIREFLY_SPEED);
    }

    // 手改过 config.json 或旧值越界时收敛到默认档，不能让画面挂掉
    #[test]
    fn out_of_range_levels_fall_back() {
        assert_eq!(clamp_firefly_level(0, DEFAULT_FIREFLY_COUNT), 3);
        assert_eq!(clamp_firefly_level(9, DEFAULT_FIREFLY_COUNT), 3);
        assert_eq!(clamp_firefly_level(-1, DEFAULT_FIREFLY_SPEED), 3);
        assert_eq!(clamp_firefly_level(2, DEFAULT_FIREFLY_SPEED), 2);
    }
}
