mod commands;
mod services;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(commands::events::EventStreamState::default())
        .invoke_handler(tauri::generate_handler![
            commands::discovery::discover_bridges,
            commands::discovery::pair_bridge,
            commands::discovery::get_hue_session,
            commands::discovery::reset_hue_session,
            commands::lights::get_hue_lights,
            commands::lights::set_light_state,
            commands::lights::set_light_color,
            commands::rooms::get_hue_rooms,
            commands::rooms::update_room_members,
            commands::zones::get_hue_zones,
            commands::zones::create_hue_zone,
            commands::zones::update_zone_members,
            commands::grouped_lights::set_grouped_light_state,
            commands::scenes::get_hue_scenes,
            commands::scenes::get_hue_smart_scenes,
            commands::scenes::activate_scene,
            commands::scenes::start_dynamic_scene,
            commands::scenes::stop_dynamic_scene,
            commands::scenes::set_scene_brightness,
            commands::scenes::activate_smart_scene,
            commands::scenes::deactivate_smart_scene,
            commands::scenes::create_hue_scene,
            commands::scenes::create_hue_gallery_scene,
            commands::settings::get_hue_settings_summary,
            commands::settings::get_hue_home_name,
            commands::settings::rename_hue_resource,
            commands::settings::get_hue_resource,
            commands::settings::create_hue_resource,
            commands::settings::update_hue_resource,
            commands::settings::delete_hue_resource,
            commands::settings::get_hue_accessory_services,
            commands::settings::get_switch_input_configuration,
            commands::settings::set_switch_input_configuration,
            commands::settings::start_hue_device_discovery,
            commands::settings::start_hue_qr_device_discovery,
            commands::settings::start_hue_serial_light_discovery,
            commands::settings::assign_device_to_room,
            commands::settings::assign_device_to_zone,
            commands::settings::create_hue_room,
            commands::events::start_hue_events,
            commands::events::stop_hue_events,
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
