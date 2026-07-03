//! Display topology enumeration for PC sync.
//!
//! Combines `windows-capture`'s monitor handles with `GetMonitorInfoW` for
//! virtual-desktop bounds (which can be negative for monitors left of or
//! above the primary) and the primary flag.

use serde::Serialize;

use super::analysis::Bounds;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DisplayInfo {
    /// Stable GDI device name (e.g. `\\.\DISPLAY1`); used as the persisted id.
    pub id: String,
    /// Monitor friendly name (e.g. `LG ULTRAGEAR`), falling back to the id.
    pub name: String,
    /// Adapter the monitor is driven by (e.g. the GPU name).
    pub adapter: Option<String>,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
    pub refresh_rate: Option<u32>,
    /// True when Windows Advanced Color/HDR is currently enabled.
    pub hdr_enabled: bool,
}

impl DisplayInfo {
    pub fn bounds(&self) -> Bounds {
        Bounds {
            x: self.x,
            y: self.y,
            width: self.width,
            height: self.height,
        }
    }
}

#[cfg(windows)]
pub fn enumerate_displays() -> Result<Vec<DisplayInfo>, String> {
    use windows_capture::monitor::Monitor;
    use windows_sys::Win32::Graphics::Gdi::{GetMonitorInfoW, MONITORINFOEXW};

    // Not exported by windows-sys' Gdi module; documented flag of
    // MONITORINFO.dwFlags.
    const MONITORINFOF_PRIMARY: u32 = 1;

    let monitors =
        Monitor::enumerate().map_err(|error| format!("Failed to enumerate displays: {error}"))?;
    let hdr_states = query_hdr_states();

    let mut displays = Vec::with_capacity(monitors.len());
    for monitor in monitors {
        let mut info: MONITORINFOEXW = unsafe { std::mem::zeroed() };
        info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
        let ok = unsafe {
            GetMonitorInfoW(
                monitor.as_raw_hmonitor() as _,
                &mut info.monitorInfo as *mut _,
            )
        };
        if ok == 0 {
            continue;
        }

        let rect = info.monitorInfo.rcMonitor;
        let id = match monitor.device_name() {
            Ok(name) => name,
            Err(_) => continue,
        };
        displays.push(DisplayInfo {
            name: monitor.name().unwrap_or_else(|_| id.clone()),
            adapter: monitor.device_string().ok(),
            x: rect.left,
            y: rect.top,
            width: (rect.right - rect.left).max(0) as u32,
            height: (rect.bottom - rect.top).max(0) as u32,
            is_primary: info.monitorInfo.dwFlags & MONITORINFOF_PRIMARY != 0,
            refresh_rate: monitor.refresh_rate().ok(),
            hdr_enabled: hdr_states.get(&id).copied().unwrap_or(false),
            id,
        });
    }

    if displays.is_empty() {
        return Err("No active displays found.".to_string());
    }
    Ok(displays)
}

#[cfg(windows)]
fn query_hdr_states() -> std::collections::HashMap<String, bool> {
    use windows_sys::Win32::Devices::Display::{
        DisplayConfigGetDeviceInfo, GetDisplayConfigBufferSizes, QueryDisplayConfig,
        DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO,
        DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME, DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO,
        DISPLAYCONFIG_MODE_INFO, DISPLAYCONFIG_PATH_INFO, DISPLAYCONFIG_SOURCE_DEVICE_NAME,
        QDC_ONLY_ACTIVE_PATHS,
    };
    use windows_sys::Win32::Foundation::ERROR_INSUFFICIENT_BUFFER;

    let paths = loop {
        let mut path_count = 0;
        let mut mode_count = 0;
        if unsafe {
            GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, &mut path_count, &mut mode_count)
        } != 0
        {
            return Default::default();
        }

        let mut paths: Vec<DISPLAYCONFIG_PATH_INFO> =
            vec![unsafe { std::mem::zeroed() }; path_count as usize];
        let mut modes: Vec<DISPLAYCONFIG_MODE_INFO> =
            vec![unsafe { std::mem::zeroed() }; mode_count as usize];
        let result = unsafe {
            QueryDisplayConfig(
                QDC_ONLY_ACTIVE_PATHS,
                &mut path_count,
                paths.as_mut_ptr(),
                &mut mode_count,
                modes.as_mut_ptr(),
                std::ptr::null_mut(),
            )
        };
        if result == ERROR_INSUFFICIENT_BUFFER {
            continue;
        }
        if result != 0 {
            return Default::default();
        }
        paths.truncate(path_count as usize);
        break paths;
    };

    let mut states = std::collections::HashMap::new();
    for path in paths {
        let mut source: DISPLAYCONFIG_SOURCE_DEVICE_NAME = unsafe { std::mem::zeroed() };
        source.header.r#type = DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME;
        source.header.size = std::mem::size_of_val(&source) as u32;
        source.header.adapterId = path.sourceInfo.adapterId;
        source.header.id = path.sourceInfo.id;
        if unsafe { DisplayConfigGetDeviceInfo(&mut source.header) } != 0 {
            continue;
        }
        let name_len = source
            .viewGdiDeviceName
            .iter()
            .position(|&unit| unit == 0)
            .unwrap_or(source.viewGdiDeviceName.len());
        let display_id = String::from_utf16_lossy(&source.viewGdiDeviceName[..name_len]);

        let mut color: DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO = unsafe { std::mem::zeroed() };
        color.header.r#type = DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO;
        color.header.size = std::mem::size_of_val(&color) as u32;
        color.header.adapterId = path.targetInfo.adapterId;
        color.header.id = path.targetInfo.id;
        if unsafe { DisplayConfigGetDeviceInfo(&mut color.header) } == 0 {
            // Bit 1 is advancedColorEnabled. Bit 0 only indicates support.
            let advanced_color_enabled = unsafe { color.Anonymous.value } & (1 << 1) != 0;
            states.insert(display_id, advanced_color_enabled);
        }
    }
    states
}

#[cfg(not(windows))]
pub fn enumerate_displays() -> Result<Vec<DisplayInfo>, String> {
    Err("PC sync display capture is only available on Windows.".to_string())
}

/// Resolves the displays to capture from the persisted preference: automatic
/// primary tracking, or an explicit selection (multiple allowed). Explicitly
/// selected displays that are no longer attached are skipped; it is an error
/// only when none of them remain.
pub fn resolve_selected(
    displays: &[DisplayInfo],
    automatic: bool,
    selected_ids: &[String],
) -> Result<Vec<DisplayInfo>, String> {
    if automatic || selected_ids.is_empty() {
        let primary = displays
            .iter()
            .find(|display| display.is_primary)
            .or_else(|| displays.first())
            .ok_or_else(|| "No displays available.".to_string())?;
        return Ok(vec![primary.clone()]);
    }

    let matched: Vec<DisplayInfo> = displays
        .iter()
        .filter(|display| selected_ids.contains(&display.id))
        .cloned()
        .collect();
    if matched.is_empty() {
        return Err(
            "None of the selected displays are connected. Choose displays again in settings."
                .to_string(),
        );
    }
    Ok(matched)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn display(id: &str, is_primary: bool) -> DisplayInfo {
        DisplayInfo {
            id: id.to_string(),
            name: id.to_string(),
            adapter: None,
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            is_primary,
            refresh_rate: Some(60),
            hdr_enabled: false,
        }
    }

    #[test]
    fn automatic_mode_tracks_the_primary_display() {
        let displays = [
            display("\\\\.\\DISPLAY1", false),
            display("\\\\.\\DISPLAY2", true),
        ];
        let selected = resolve_selected(&displays, true, &[]).unwrap();
        assert_eq!(selected.len(), 1);
        assert_eq!(selected[0].id, "\\\\.\\DISPLAY2");
    }

    #[test]
    fn custom_mode_returns_every_matching_display() {
        let displays = [
            display("\\\\.\\DISPLAY1", true),
            display("\\\\.\\DISPLAY2", false),
            display("\\\\.\\DISPLAY3", false),
        ];
        let ids = vec!["\\\\.\\DISPLAY1".to_string(), "\\\\.\\DISPLAY3".to_string()];
        let selected = resolve_selected(&displays, false, &ids).unwrap();
        assert_eq!(selected.len(), 2);
        assert_eq!(selected[0].id, "\\\\.\\DISPLAY1");
        assert_eq!(selected[1].id, "\\\\.\\DISPLAY3");
    }

    #[test]
    fn missing_explicit_displays_are_skipped_but_all_missing_errors() {
        let displays = [display("\\\\.\\DISPLAY1", true)];
        let some = resolve_selected(
            &displays,
            false,
            &["\\\\.\\DISPLAY1".to_string(), "\\\\.\\DISPLAY9".to_string()],
        )
        .unwrap();
        assert_eq!(some.len(), 1);

        let none = resolve_selected(&displays, false, &["\\\\.\\DISPLAY9".to_string()]);
        assert!(none.is_err());
    }

    #[test]
    fn empty_custom_selection_falls_back_to_primary() {
        let displays = [
            display("\\\\.\\DISPLAY1", true),
            display("\\\\.\\DISPLAY2", false),
        ];
        let selected = resolve_selected(&displays, false, &[]).unwrap();
        assert_eq!(selected[0].id, "\\\\.\\DISPLAY1");
    }
}
