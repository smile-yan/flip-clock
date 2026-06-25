// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;

use config::{available_styles, available_themes, available_time_formats, load, save};
use std::collections::HashMap;
use tauri::Manager;

#[tauri::command]
fn get_config() -> Result<HashMap<String, serde_json::Value>, String> {
    let cfg = load()?;

    let mut map = HashMap::new();
    map.insert("motto".to_string(), serde_json::json!(cfg.motto));
    map.insert("width".to_string(), serde_json::json!(cfg.width));
    map.insert("height".to_string(), serde_json::json!(cfg.height));
    map.insert("x".to_string(), serde_json::json!(cfg.x));
    map.insert("y".to_string(), serde_json::json!(cfg.y));
    map.insert("showInDock".to_string(), serde_json::json!(cfg.show_in_dock));
    map.insert("theme".to_string(), serde_json::json!(cfg.theme));
    map.insert("style".to_string(), serde_json::json!(cfg.style));
    map.insert("timeFormat".to_string(), serde_json::json!(cfg.time_format));
    map.insert("showDate".to_string(), serde_json::json!(cfg.show_date));
    map.insert("showSeconds".to_string(), serde_json::json!(cfg.show_seconds));
    map.insert("showLunar".to_string(), serde_json::json!(cfg.show_lunar));
    map.insert("showMotto".to_string(), serde_json::json!(cfg.show_motto));
    map.insert("color".to_string(), serde_json::json!(cfg.color));

    Ok(map)
}

#[tauri::command]
fn save_settings(payload: HashMap<String, serde_json::Value>) -> Result<(), String> {
    log::info!("SaveSettings called with payload: {:?}", payload);

    let mut cfg = load().unwrap_or_default();

    // motto 允许空字符串
    if let Some(v) = payload.get("motto") {
        if let Some(s) = v.as_str() {
            cfg.motto = s.to_string();
        }
    }

    if let Some(v) = payload.get("showInDock") {
        if let Some(b) = v.as_bool() {
            cfg.show_in_dock = b;
        }
    }

    if let Some(v) = payload.get("theme") {
        if let Some(s) = v.as_str() {
            if available_themes().contains(&s) {
                cfg.theme = s.to_string();
            }
        }
    }

    if let Some(v) = payload.get("style") {
        if let Some(s) = v.as_str() {
            if available_styles().contains(&s) {
                cfg.style = s.to_string();
            }
        }
    }

    if let Some(v) = payload.get("timeFormat") {
        if let Some(s) = v.as_str() {
            if available_time_formats().contains(&s) {
                cfg.time_format = s.to_string();
            }
        }
    }

    if let Some(v) = payload.get("showDate") {
        if let Some(b) = v.as_bool() {
            cfg.show_date = b;
        }
    }

    if let Some(v) = payload.get("showSeconds") {
        if let Some(b) = v.as_bool() {
            cfg.show_seconds = b;
        }
    }

    if let Some(v) = payload.get("showLunar") {
        if let Some(b) = v.as_bool() {
            cfg.show_lunar = b;
        }
    }

    if let Some(v) = payload.get("showMotto") {
        if let Some(b) = v.as_bool() {
            cfg.show_motto = b;
        }
    }

    if let Some(v) = payload.get("color") {
        if let Some(s) = v.as_str() {
            cfg.color = s.to_string();
        }
    }

    log::info!(
        "Saving config: motto={} theme={} style={} time_format={}",
        cfg.motto,
        cfg.theme,
        cfg.style,
        cfg.time_format
    );

    save(&cfg)
}

#[tauri::command]
fn toggle_fullscreen(window: tauri::Window) -> Result<(), String> {
    let is_fullscreen = window.is_fullscreen().map_err(|e| e.to_string())?;

    if is_fullscreen {
        window.set_fullscreen(false).map_err(|e| e.to_string())?;
        log::info!("Exited fullscreen");
    } else {
        window.set_fullscreen(true).map_err(|e| e.to_string())?;
        log::info!("Entered fullscreen");
    }

    Ok(())
}

#[tauri::command]
fn get_available_themes() -> Vec<String> {
    available_themes().into_iter().map(|s| s.to_string()).collect()
}

#[tauri::command]
fn get_available_styles() -> Vec<String> {
    available_styles().into_iter().map(|s| s.to_string()).collect()
}

#[tauri::command]
fn get_available_time_formats() -> Vec<String> {
    available_time_formats()
        .into_iter()
        .map(|s| s.to_string())
        .collect()
}

fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    log::info!("Starting flip-clock application");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_settings,
            toggle_fullscreen,
            get_available_themes,
            get_available_styles,
            get_available_time_formats
        ])
        .setup(|app| {
            log::info!("App setup complete");

            // Get the main window and set up close handler
            if let Some(window) = app.get_webview_window("main") {
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { .. } = event {
                        log::info!("Window close requested, saving config");
                        if let Ok(cfg) = load() {
                            if let Err(e) = save(&cfg) {
                                log::error!("Failed to save config on close: {}", e);
                            }
                        }
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
