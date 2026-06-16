mod commands;
mod services;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            commands::discovery::discover_bridges,
            commands::discovery::pair_bridge,
            commands::discovery::get_hue_session,
            commands::discovery::reset_hue_session
        ])
        .setup(|app| {
            #[cfg(target_os = "windows")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_shadow(true);

                    if let Ok(hwnd_struct) = window.hwnd() {
                        // 1. Convert the window handle to a plain raw pointer integer
                        let hwnd_raw = hwnd_struct.0 as isize;

                        unsafe {
                            // 2. Dynamically link the Windows DWM function directly to bypass crate version conflicts
                            #[link(name = "dwmapi")]
                            extern "system" {
                                fn DwmSetWindowAttribute(
                                    hwnd: isize,
                                    dwAttribute: u32,
                                    pvAttribute: *const std::ffi::c_void,
                                    cbAttribute: u32,
                                ) -> i32;
                            }

                            let border_color: u32 = 0xFFFFFFFF; // Fully transparent/white fallback
                            const DWMWA_BORDER_COLOR: u32 = 34; // Windows DWM system constant for border color

                            // 3. Make the API call using pure, basic data types
                            let _ = DwmSetWindowAttribute(
                                hwnd_raw,
                                DWMWA_BORDER_COLOR,
                                &border_color as *const u32 as *const _,
                                std::mem::size_of::<u32>() as u32,
                            );
                        }
                    }
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
