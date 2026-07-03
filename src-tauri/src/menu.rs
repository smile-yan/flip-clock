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
    // Fullscreen shortcut, per platform:
    //   - macOS:           Ctrl + Cmd + F
    //   - Windows / Linux: Ctrl + Alt + F
    // These mirror the combos the frontend webview listens for. Native menu
    // accelerators and webview keydown events do not conflict because the
    // native layer consumes the accelerator first; the webview's listener is
    // a fallback for environments without the menu (e.g. dev preview).
    let fullscreen_accelerator = if cfg!(target_os = "macos") {
        "Ctrl+Cmd+F"
    } else {
        "Ctrl+Alt+F"
    };

    let window_menu = SubmenuBuilder::new(app, "窗口")
        .item(&PredefinedMenuItem::minimize(app, None)?)
        .item(&PredefinedMenuItem::maximize(app, None)?)
        .separator()
        // 全屏
        .item(
            &MenuItemBuilder::with_id("fullscreen", "全屏")
                .accelerator(fullscreen_accelerator)
                .build(app)?,
        )
        .build()?;

    builder.item(&app_menu).item(&window_menu).build()
}
