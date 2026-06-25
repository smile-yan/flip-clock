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
    let window_menu = SubmenuBuilder::new(app, "窗口")
        .item(&PredefinedMenuItem::minimize(app, None)?)
        .item(&PredefinedMenuItem::maximize(app, None)?)
        .separator()
        // 全屏 (Cmd+Ctrl+F)
        .item(
            &MenuItemBuilder::with_id("fullscreen", "全屏")
                .accelerator("Cmd+Ctrl+F")
                .build(app)?,
        )
        .build()?;

    builder.item(&app_menu).item(&window_menu).build()
}