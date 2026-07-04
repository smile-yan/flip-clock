use tauri::{
    menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    AppHandle, Runtime,
};

/// Creates the native application menu bar with App and Window menus
pub fn create_app_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let builder = MenuBuilder::new(app);

    // App Menu (翻转时钟)
    let app_menu = SubmenuBuilder::new(app, "翻转时钟")
        // 关于
        .item(&MenuItemBuilder::with_id("about", "关于").build(app)?)
        .separator()
        // 设置 (CmdOrCtrl+,)
        .item(
            &MenuItemBuilder::with_id("settings", "设置")
                .accelerator("CmdOrCtrl+,")
                .build(app)?,
        )
        // 检查更新
        .item(&MenuItemBuilder::with_id("check_updates", "检查更新").build(app)?)
        .separator()
        // 退出 (CmdOrCtrl+Q)
        .item(
            &MenuItemBuilder::with_id("quit", "退出")
                .accelerator("CmdOrCtrl+Q")
                .build(app)?,
        )
        .build()?;

    // Window Menu (窗口)
    // macOS gets a native menu accelerator for Cmd+Ctrl+F (system fullscreen
    // convention). On Windows and Linux we intentionally omit any accelerator
    // here — the frontend webview owns Ctrl+Alt+F. If we register it as a
    // native accelerator, the menu layer consumes the key first; then when
    // the window enters fullscreen on Windows the entire menu is removed
    // (see main.rs `remove_menu` in the Resized handler), at which point the
    // native accelerator dies with the menu and Ctrl+Alt+F stops working
    // until the menu is restored. Routing through the webview keydown
    // listener keeps the shortcut alive across fullscreen transitions.
    #[cfg(target_os = "macos")]
    let fullscreen_accelerator: Option<&'static str> = Some("Cmd+Ctrl+F");
    #[cfg(not(target_os = "macos"))]
    let fullscreen_accelerator: Option<&'static str> = None;

    let mut window_builder = SubmenuBuilder::new(app, "窗口")
        .item(&PredefinedMenuItem::minimize(app, None)?)
        .item(&PredefinedMenuItem::maximize(app, None)?)
        .separator();
    window_builder = if let Some(accel) = fullscreen_accelerator {
        window_builder.item(
            &MenuItemBuilder::with_id("fullscreen", "全屏")
                .accelerator(accel)
                .build(app)?,
        )
    } else {
        window_builder.item(
            &MenuItemBuilder::with_id("fullscreen", "全屏").build(app)?,
        )
    };
    let window_menu = window_builder.build()?;

    builder.item(&app_menu).item(&window_menu).build()
}
