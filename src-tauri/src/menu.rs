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
    // Cmd+Ctrl+F is macOS's native fullscreen shortcut — keep it there so the
    // menu intercepts it and routes through our `set_fullscreen`. On Windows
    // and Linux "Cmd+Ctrl+F" resolves to a key combination that can't actually
    // be pressed (two Ctrl keys), so use Ctrl+Alt+F instead. This is the same
    // combo the frontend webview listens for; native menu accelerators and
    // webview keydown events do not conflict because the native layer
    // consumes the accelerator first, and the webview's listener is a
    // fallback for environments without the menu (e.g. dev preview).
    let fullscreen_accelerator = if cfg!(target_os = "macos") {
        "Cmd+Ctrl+F"
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
