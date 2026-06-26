use std::{fs, path::PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const SETTINGS_FILE_NAME: &str = "app-settings.json";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CloseButtonBehavior {
    Exit,
    MinimizeToTray,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    close_button_behavior: CloseButtonBehavior,
    auto_start: bool,
    auto_start_supported: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredAppSettings {
    close_button_behavior: CloseButtonBehavior,
}

impl Default for StoredAppSettings {
    fn default() -> Self {
        Self {
            close_button_behavior: CloseButtonBehavior::Exit,
        }
    }
}

#[tauri::command(rename = "get-app-settings")]
pub fn get_app_settings(app: AppHandle) -> Result<AppSettings, String> {
    current_settings(&app)
}

#[tauri::command(rename = "set-close-button-behavior")]
pub fn set_close_button_behavior(
    app: AppHandle,
    behavior: CloseButtonBehavior,
) -> Result<AppSettings, String> {
    let mut settings = read_stored_settings(&app)?;
    settings.close_button_behavior = behavior;
    write_stored_settings(&app, &settings)?;
    current_settings(&app)
}

#[tauri::command(rename = "set-auto-start")]
pub fn set_auto_start(app: AppHandle, enabled: bool) -> Result<AppSettings, String> {
    set_auto_start_enabled(enabled)?;
    current_settings(&app)
}

/// The flag we append to the registry Run command so a login-triggered launch
/// can be told apart from a normal one and start hidden in the tray.
pub const AUTOSTART_FLAG: &str = "--autostart";

/// True when this process was launched by the Windows "Run" entry at login.
pub fn launched_via_autostart() -> bool {
    std::env::args().any(|arg| arg == AUTOSTART_FLAG)
}

#[tauri::command(rename = "handle-main-window-close")]
pub fn handle_main_window_close(app: AppHandle) -> Result<(), String> {
    match read_stored_settings(&app)?.close_button_behavior {
        CloseButtonBehavior::Exit => {
            app.exit(0);
            Ok(())
        }
        CloseButtonBehavior::MinimizeToTray => hide_main_window(&app),
    }
}

#[tauri::command(rename = "minimize-main-window")]
pub fn minimize_main_window(app: AppHandle) -> Result<(), String> {
    // The minimize button is the complement of the close button: if the X exits
    // the app, minimize keeps it running in the tray; if the X hides to the tray,
    // minimize performs the conventional shrink-to-taskbar instead.
    match read_stored_settings(&app)?.close_button_behavior {
        CloseButtonBehavior::Exit => hide_main_window(&app),
        CloseButtonBehavior::MinimizeToTray => minimize_main_window_to_taskbar(&app),
    }
}

fn minimize_main_window_to_taskbar(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window is not available.".to_string())?;
    window.minimize().map_err(|error| error.to_string())
}

pub fn should_minimize_to_tray(app: &AppHandle) -> bool {
    read_stored_settings(app)
        .map(|settings| settings.close_button_behavior == CloseButtonBehavior::MinimizeToTray)
        .unwrap_or(false)
}

pub fn hide_main_window(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window is not available.".to_string())?;
    window.hide().map_err(|error| error.to_string())
}

pub fn show_main_window(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window is not available.".to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.unminimize().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

fn current_settings(app: &AppHandle) -> Result<AppSettings, String> {
    let stored = read_stored_settings(app)?;
    Ok(AppSettings {
        close_button_behavior: stored.close_button_behavior,
        auto_start: get_auto_start_enabled()?,
        auto_start_supported: auto_start_supported(),
    })
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join(SETTINGS_FILE_NAME))
}

fn read_stored_settings(app: &AppHandle) -> Result<StoredAppSettings, String> {
    let path = settings_path(app)?;
    match fs::read_to_string(path) {
        Ok(contents) => serde_json::from_str(&contents).map_err(|error| error.to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Ok(StoredAppSettings::default())
        }
        Err(error) => Err(error.to_string()),
    }
}

fn write_stored_settings(app: &AppHandle, settings: &StoredAppSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    let contents = serde_json::to_string_pretty(settings).map_err(|error| error.to_string())?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

#[cfg(target_os = "windows")]
fn auto_start_supported() -> bool {
    true
}

#[cfg(not(target_os = "windows"))]
fn auto_start_supported() -> bool {
    false
}

#[cfg(target_os = "windows")]
fn get_auto_start_enabled() -> Result<bool, String> {
    use windows_registry::CURRENT_USER;

    let key = match CURRENT_USER.open(auto_start_run_key()) {
        Ok(key) => key,
        Err(_) => return Ok(false),
    };
    // Treat any non-empty entry under our value name as "enabled". Matching the
    // exact command would report a stale entry (after the app moves or updates)
    // as disabled, leaving the toggle out of sync with reality.
    Ok(key
        .get_string(auto_start_value_name())
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false))
}

#[cfg(not(target_os = "windows"))]
fn get_auto_start_enabled() -> Result<bool, String> {
    Ok(false)
}

#[cfg(target_os = "windows")]
fn set_auto_start_enabled(enabled: bool) -> Result<(), String> {
    use windows_registry::CURRENT_USER;

    let key = CURRENT_USER
        .create(auto_start_run_key())
        .map_err(|error| error.to_string())?;
    if enabled {
        key.set_string(auto_start_value_name(), auto_start_command()?)
            .map_err(|error| error.to_string())
    } else {
        if key.get_string(auto_start_value_name()).is_ok() {
            key.remove_value(auto_start_value_name())
                .map_err(|error| error.to_string())?;
        }
        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
fn set_auto_start_enabled(_enabled: bool) -> Result<(), String> {
    Err("Auto start is only supported on Windows.".to_string())
}

#[cfg(target_os = "windows")]
fn auto_start_command() -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|error| error.to_string())?;
    // The flag lets the login launch start hidden in the tray instead of
    // popping the main window in the user's face on every sign-in.
    Ok(format!("\"{}\" {}", exe.display(), AUTOSTART_FLAG))
}

#[cfg(target_os = "windows")]
fn auto_start_run_key() -> &'static str {
    r"Software\Microsoft\Windows\CurrentVersion\Run"
}

#[cfg(target_os = "windows")]
fn auto_start_value_name() -> &'static str {
    "Hue Desktop"
}
