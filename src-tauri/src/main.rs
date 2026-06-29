// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod menu;

use config::{available_styles, available_themes, available_time_formats, load, save};
use menu::create_app_menu;
use std::collections::HashMap;
use tauri::{menu::MenuEvent, Emitter, Manager, Runtime};

#[tauri::command]
fn get_config() -> Result<HashMap<String, serde_json::Value>, String> {
    let cfg = load()?;

    let mut map = HashMap::new();
    map.insert("motto".to_string(), serde_json::json!(cfg.motto));
    map.insert("width".to_string(), serde_json::json!(cfg.width));
    map.insert("height".to_string(), serde_json::json!(cfg.height));
    map.insert("x".to_string(), serde_json::json!(cfg.x));
    map.insert("y".to_string(), serde_json::json!(cfg.y));
    map.insert(
        "showInDock".to_string(),
        serde_json::json!(cfg.show_in_dock),
    );
    map.insert("theme".to_string(), serde_json::json!(cfg.theme));
    map.insert("style".to_string(), serde_json::json!(cfg.style));
    map.insert("timeFormat".to_string(), serde_json::json!(cfg.time_format));
    map.insert("showDate".to_string(), serde_json::json!(cfg.show_date));
    map.insert(
        "showSeconds".to_string(),
        serde_json::json!(cfg.show_seconds),
    );
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
    available_themes()
        .into_iter()
        .map(|s| s.to_string())
        .collect()
}

#[tauri::command]
fn get_release_url() -> String {
    // Configured in tauri.conf.json under "update.releaseUrl".
    // Hardcoded fallback to keep the command self-contained.
    "https://github.com/smile-yan/flip-clock/releases/latest".to_string()
}

#[tauri::command]
fn get_available_styles() -> Vec<String> {
    available_styles()
        .into_iter()
        .map(|s| s.to_string())
        .collect()
}

#[tauri::command]
fn get_available_time_formats() -> Vec<String> {
    available_time_formats()
        .into_iter()
        .map(|s| s.to_string())
        .collect()
}

/// Apply the "show in dock / taskbar" preference. Per-platform:
/// - macOS: flips `NSApp.activationPolicy` via Tauri's `set_dock_visibility`
///   (Regular ↔ Accessory), which also hides/reveals the window.
/// - Windows: toggles `WS_EX_APPWINDOW` for the main window via
///   `Window::set_skip_taskbar`.
/// - Linux: no cross-desktop API in Tauri core; we persist the preference
///   anyway and log a warning. (A status-notifier / tray icon would be the
///   Linux-friendly way to recover the window when the launcher entry is
///   suppressed — out of scope for this setting.)
fn apply_dock_visibility<R: Runtime>(
    app: &tauri::AppHandle<R>,
    visible: bool,
) -> Result<(), String> {
    log::info!("apply_dock_visibility: visible={}", visible);

    #[cfg(target_os = "macos")]
    {
        app.set_dock_visibility(visible)
            .map_err(|e| format!("Failed to set macOS dock visibility: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(window) = app.get_webview_window("main") {
            window
                .set_skip_taskbar(!visible)
                .map_err(|e| format!("Failed to set Windows skip_taskbar: {}", e))?;
        } else {
            log::warn!("apply_dock_visibility: 'main' window not found");
        }
    }

    #[cfg(target_os = "linux")]
    {
        log::warn!(
            "Linux: no cross-desktop 'hide from dock/taskbar' API in Tauri core. \
             The preference is saved and applied on macOS/Windows."
        );
        // Both params are unused on Linux — silence the `unused_variables` lint
        // that CI's `-D warnings` turns into an error.
        let _ = (app, visible);
    }

    Ok(())
}

#[tauri::command]
fn set_dock_visibility<R: Runtime>(app: tauri::AppHandle<R>, visible: bool) -> Result<(), String> {
    apply_dock_visibility(&app, visible)
}

/// Handle menu events from the native menu bar
fn handle_menu_event<R: Runtime>(app: &tauri::AppHandle<R>, event: MenuEvent) {
    let id = event.id().as_ref();
    log::info!("Menu event: {}", id);

    match id {
        "about" => {
            // Call openAbout directly via eval
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.eval("if (typeof openAbout === 'function') { openAbout(); } else { console.error('openAbout not found'); }");
            }
        }
        "settings" => {
            // Call openSettings directly via eval
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.eval("if (typeof openSettings === 'function') { openSettings(); } else { console.error('openSettings not found'); }");
            }
        }
        "check_updates" => {
            // Emit check-updates event to frontend
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.emit("check-updates", ());
            }
        }
        "quit" => {
            // Save config before quitting
            if let Ok(cfg) = load() {
                if let Err(e) = save(&cfg) {
                    log::error!("Failed to save config on quit: {}", e);
                }
            }
            app.exit(0);
        }
        "fullscreen" => {
            // Toggle fullscreen
            if let Some(window) = app.get_webview_window("main") {
                match window.is_fullscreen() {
                    Ok(true) => {
                        let _ = window.set_fullscreen(false);
                        log::info!("Exited fullscreen via menu");
                    }
                    Ok(false) => {
                        let _ = window.set_fullscreen(true);
                        log::info!("Entered fullscreen via menu");
                    }
                    Err(e) => log::error!("Failed to get fullscreen state: {}", e),
                }
            }
        }
        // PredefinedMenuItem IDs (minimize, zoom) are handled by the system
        _ => {}
    }
}

fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    log::info!("Starting flip-clock application");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_settings,
            toggle_fullscreen,
            get_available_themes,
            get_available_styles,
            get_available_time_formats,
            get_release_url,
            set_dock_visibility
        ])
        .setup(|app| {
            log::info!("App setup complete");

            // Create and set the application menu
            let app_menu = create_app_menu(app.handle())?;
            app.set_menu(app_menu.clone())?;

            // Handle menu events
            app.on_menu_event(|app, event| {
                handle_menu_event(app, event);
            });

            // Apply the persisted "show in dock / taskbar" preference now, so
            // users who previously disabled the icon don't see a flash of the
            // dock/taskbar entry before the setting kicks in.
            if let Ok(cfg) = load() {
                if let Err(e) = apply_dock_visibility(app.handle(), cfg.show_in_dock) {
                    log::error!("Failed to apply initial dock visibility: {}", e);
                }
            }

            // Get the main window and set up close handler
            if let Some(window) = app.get_webview_window("main") {
                // Set window size to half of screen (delayed to ensure window is ready)
                let win = window.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                    if let Ok(Some(monitor)) = win.current_monitor() {
                        let screen_width = monitor.size().width as f64;
                        let screen_height = monitor.size().height as f64;
                        let scale_factor = win.scale_factor().unwrap_or(1.0);
                        let half_width = screen_width / scale_factor / 2.0;
                        let half_height = screen_height / scale_factor / 2.0;
                        log::info!(
                            "[WINDOW] Screen: {}x{}, scale: {}, window: {}x{}",
                            screen_width,
                            screen_height,
                            scale_factor,
                            half_width,
                            half_height
                        );
                        let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize {
                            width: half_width,
                            height: half_height,
                        }));
                        let _ = win.center();
                    }
                });

                // Track fullscreen transitions so we can hide/restore the native menu on Windows.
                // On Windows the menu bar is part of the window chrome, so it stays visible
                // unless we explicitly remove it while in fullscreen.
                let menu_for_fullscreen = app_menu.clone();
                let last_fullscreen = std::sync::Arc::new(std::sync::Mutex::new(false));
                let win_for_fs = window.clone();
                #[allow(unused_variables)]
                let menu_for_fs = menu_for_fullscreen.clone();

                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { .. } = event {
                        log::info!("Window close requested, saving config");
                        if let Ok(cfg) = load() {
                            if let Err(e) = save(&cfg) {
                                log::error!("Failed to save config on close: {}", e);
                            }
                        }
                        return;
                    }

                    // `Resized` fires on both enter- and exit-fullscreen on Windows.
                    // We check the actual fullscreen state (rather than parsing the size)
                    // because Win11's "maximize" produces the same monitor-sized Resized.
                    if matches!(event, tauri::WindowEvent::Resized(_)) {
                        let now_fullscreen = win_for_fs.is_fullscreen().unwrap_or(false);
                        let mut last = last_fullscreen.lock().unwrap();
                        if now_fullscreen != *last {
                            #[cfg(target_os = "windows")]
                            {
                                if now_fullscreen {
                                    log::info!("Hiding menu bar for fullscreen");
                                    let _ = win_for_fs.remove_menu();
                                } else {
                                    log::info!("Restoring menu bar after fullscreen");
                                    let _ = win_for_fs.set_menu(menu_for_fs.clone());
                                }
                            }
                            *last = now_fullscreen;
                        }
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
