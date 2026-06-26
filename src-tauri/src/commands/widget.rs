use std::{
    collections::HashSet,
    fs,
    path::PathBuf,
    thread,
    time::Duration,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{
    Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

const WIDGET_LABEL_PREFIX: &str = "widget-";
const LEGACY_WIDGET_ID: &str = "main";
const WIDGET_SETTINGS_FILE_NAME: &str = "widget-settings.json";
const DEFAULT_WIDGET_WIDTH: f64 = 360.0;
const DEFAULT_WIDGET_HEIGHT: f64 = 136.0;
const MIN_WIDGET_WIDTH: u32 = 360;
const MIN_WIDGET_HEIGHT: u32 = 136;
const MAX_OPEN_WIDGETS: usize = 3;

/// The kinds of Hue resource a control can target.
const CONTROL_TARGET_KINDS: [&str; 3] = ["room", "zone", "light"];
/// The actions a control's global hotkey can perform.
const CONTROL_HOTKEY_ACTIONS: [&str; 2] = ["toggle", "scene"];
/// How many quick-scene buttons a single control may expose, keeping a widget
/// card compact.
const MAX_CONTROL_SCENES: usize = 6;

/// Emitted to a widget window when its controls are changed elsewhere (e.g.
/// from the Settings tab) so the live window updates without being reopened.
const WIDGET_CONTROLS_EVENT: &str = "widget-controls-changed";
const WIDGET_SETTINGS_CHANGED_EVENT: &str = "widget-settings-changed";
const OPEN_WIDGET_SETTINGS_EVENT: &str = "open-widget-settings";

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredWidgetBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

/// The Hue resource a control manages.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredControlTarget {
    /// One of "room", "zone", or "light".
    kind: String,
    /// v2 resource UUID.
    id: String,
}

/// An optional global hotkey bound to a control.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredControlHotkey {
    /// A Tauri global-control accelerator, e.g. "CommandOrControl+Alt+1".
    accelerator: String,
    /// "toggle" the target, or recall a "scene".
    action: String,
    /// The scene to recall when `action` is "scene".
    #[serde(default)]
    scene_id: Option<String>,
}

/// One configured control on a widget: a single Hue target plus which controls
/// to surface for it. Persisted per widget so a widget reopens with its
/// controls intact.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredWidgetControl {
    id: String,
    target: StoredControlTarget,
    /// Custom display name; the renderer falls back to the resource's own name
    /// when this is absent.
    #[serde(default)]
    label: Option<String>,
    /// Whether to show a brightness slider (auto-defaulted from dimmability when
    /// the control is created).
    #[serde(default = "default_true")]
    show_brightness: bool,
    /// Ordered scene ids to expose as quick buttons (room/zone targets only).
    #[serde(default)]
    scene_ids: Vec<String>,
    /// Toggle-only display: hides the brightness slider and scene pills. Defaults
    /// to false (full) for controls stored before this field existed.
    #[serde(default)]
    compact: bool,
    #[serde(default)]
    hotkey: Option<StoredControlHotkey>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WidgetStylePreset {
    Windows11,
    #[serde(alias = "rainmeter")]
    Borderless,
    #[serde(alias = "ios")]
    Macos,
}

impl Default for WidgetStylePreset {
    fn default() -> Self {
        Self::Windows11
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WidgetThemeMode {
    Light,
    Dark,
    System,
}

impl Default for WidgetThemeMode {
    fn default() -> Self {
        Self::System
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WidgetDensity {
    Compact,
    Expanded,
}

impl Default for WidgetDensity {
    fn default() -> Self {
        Self::Compact
    }
}

/// Which edge of the widget the hover title bar (drag region + window controls)
/// sits on. Top/bottom lay the controls out horizontally; left/right vertically.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WidgetTitleBarPosition {
    Top,
    Bottom,
    Left,
    Right,
}

impl Default for WidgetTitleBarPosition {
    fn default() -> Self {
        Self::Top
    }
}

/// Where the window-control buttons sit along the title bar's axis. For a
/// top/bottom bar this reads as left/center/right; for a left/right bar it
/// reads as top/center/bottom.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WidgetButtonAlignment {
    Start,
    Center,
    End,
}

impl Default for WidgetButtonAlignment {
    fn default() -> Self {
        Self::End
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredWidget {
    id: String,
    #[serde(default)]
    title: Option<String>,
    enabled: bool,
    pinned: bool,
    bounds: Option<StoredWidgetBounds>,
    #[serde(default)]
    user_sized: bool,
    #[serde(default)]
    style_preset: WidgetStylePreset,
    #[serde(default)]
    theme_mode: WidgetThemeMode,
    #[serde(default)]
    density: WidgetDensity,
    #[serde(default)]
    title_bar_position: WidgetTitleBarPosition,
    #[serde(default)]
    button_alignment: WidgetButtonAlignment,
    /// Keeps the widget window floating above other windows. Independent of
    /// `pinned` (which also locks position), though pinning always implies
    /// on-top — see [`StoredWidget::keeps_on_top`].
    #[serde(default)]
    always_on_top: bool,
    #[serde(default)]
    controls: Vec<StoredWidgetControl>,
}

impl StoredWidget {
    /// Whether the window should float above others. A pinned widget is locked
    /// in place to stay visible, so it always stays on top regardless of the
    /// independent `always_on_top` toggle.
    fn keeps_on_top(&self) -> bool {
        self.pinned || self.always_on_top
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredWidgetSettings {
    #[serde(default)]
    widgets: Vec<StoredWidget>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenWidgetResult {
    widget_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetState {
    widget_id: String,
    title: Option<String>,
    pinned: bool,
    always_on_top: bool,
    enabled: bool,
    user_sized: bool,
    style_preset: WidgetStylePreset,
    theme_mode: WidgetThemeMode,
    density: WidgetDensity,
    title_bar_position: WidgetTitleBarPosition,
    button_alignment: WidgetButtonAlignment,
    controls: Vec<StoredWidgetControl>,
}

impl WidgetState {
    fn from_stored(widget: &StoredWidget) -> Self {
        Self {
            widget_id: widget.id.clone(),
            title: widget.title.clone(),
            pinned: widget.pinned,
            always_on_top: widget.always_on_top,
            enabled: widget.enabled,
            user_sized: widget.user_sized,
            style_preset: widget.style_preset.clone(),
            theme_mode: widget.theme_mode.clone(),
            density: widget.density.clone(),
            title_bar_position: widget.title_bar_position,
            button_alignment: widget.button_alignment,
            controls: widget.controls.clone(),
        }
    }
}

#[tauri::command(rename = "open-widget-window")]
pub fn open_widget_window(
    app: tauri::AppHandle,
    widget_id: Option<String>,
    title: Option<String>,
    controls: Option<Vec<StoredWidgetControl>>,
    style_preset: Option<WidgetStylePreset>,
    theme_mode: Option<WidgetThemeMode>,
    density: Option<WidgetDensity>,
) -> Result<OpenWidgetResult, String> {
    let mut settings = read_widget_settings(&app)?;
    let sanitized_controls = controls.map(sanitize_controls);

    // Reopening a known (closed) widget reuses its id, bounds, and controls;
    // otherwise this spawns a brand-new widget with no controls configured yet.
    let reopen_id = widget_id
        .filter(|id| is_valid_widget_id(id))
        .filter(|id| settings.widgets.iter().any(|widget| &widget.id == id));

    let widget = if let Some(id) = reopen_id {
        let widget = settings
            .widgets
            .iter_mut()
            .find(|widget| widget.id == id)
            .expect("widget existence checked above");
        widget.enabled = true;
        widget.clone()
    } else {
        if let Some(controls) = &sanitized_controls {
            if let Some(existing) = find_widget_with_same_composition(&settings, controls) {
                let label = widget_label(&existing.id);
                if let Some(window) = app.get_webview_window(&label) {
                    let _ = window.show();
                    let _ = window.set_focus();
                    let _ = app.emit_to(&label, "widget-flash", ());
                    return Ok(OpenWidgetResult {
                        widget_id: existing.id.clone(),
                    });
                }
            }
        }
        if settings
            .widgets
            .iter()
            .filter(|widget| widget.enabled)
            .count()
            >= MAX_OPEN_WIDGETS
        {
            return Err("Maximum of 3 desktop widgets reached. Please close an open widget before creating a new one.".to_string());
        }
        let widget = StoredWidget {
            id: next_widget_id(&settings),
            enabled: true,
            title: sanitize_widget_title(title),
            pinned: false,
            bounds: None,
            user_sized: false,
            style_preset: style_preset.unwrap_or_default(),
            theme_mode: theme_mode.unwrap_or_default(),
            density: density.unwrap_or_default(),
            title_bar_position: WidgetTitleBarPosition::default(),
            button_alignment: WidgetButtonAlignment::default(),
            always_on_top: false,
            controls: sanitized_controls.unwrap_or_default(),
        };
        settings.widgets.push(widget.clone());
        widget
    };
    let widget_id = widget.id.clone();

    write_widget_settings(&app, &settings)?;

    let app_for_thread = app.clone();
    let widget_for_thread = widget.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(25));
        let app_for_window = app_for_thread.clone();
        let widget_for_window = widget_for_thread.clone();
        let _ = app_for_thread.run_on_main_thread(move || {
            if let Err(error) = show_widget_window(&app_for_window, &widget_for_window, true) {
                eprintln!("failed to open widget window: {error}");
            }
        });
    });

    Ok(OpenWidgetResult { widget_id })
}

#[tauri::command(rename = "list-widgets")]
pub fn list_widgets(app: tauri::AppHandle) -> Result<Vec<WidgetState>, String> {
    let settings = read_widget_settings(&app)?;
    // Every persisted widget is returned, open or closed, so the Settings tab
    // can list closed widgets with a Reopen action instead of losing track of
    // them. The `enabled` flag tells the two apart.
    Ok(settings
        .widgets
        .iter()
        .map(WidgetState::from_stored)
        .collect())
}

#[tauri::command(rename = "get-widget-state")]
pub fn get_widget_state(
    app: tauri::AppHandle,
    widget_id: Option<String>,
) -> Result<WidgetState, String> {
    let settings = read_widget_settings(&app)?;
    let widget_id = resolve_widget_id(&app, widget_id)?;

    Ok(settings
        .widgets
        .iter()
        .find(|widget| widget.id == widget_id)
        .map(WidgetState::from_stored)
        .unwrap_or_else(|| WidgetState {
            widget_id,
            title: None,
            pinned: false,
            always_on_top: false,
            enabled: false,
            user_sized: false,
            style_preset: WidgetStylePreset::default(),
            theme_mode: WidgetThemeMode::default(),
            density: WidgetDensity::default(),
            title_bar_position: WidgetTitleBarPosition::default(),
            button_alignment: WidgetButtonAlignment::default(),
            controls: Vec::new(),
        }))
}

#[tauri::command(rename = "close-widget-window")]
pub fn close_widget_window(app: tauri::AppHandle, widget_id: Option<String>) -> Result<(), String> {
    let target_ids = resolve_target_widget_ids(&app, widget_id)?;
    let mut settings = read_widget_settings(&app)?;

    for target_id in target_ids {
        let label = widget_label(&target_id);
        if let Some(window) = app.get_webview_window(&label) {
            mark_widget_closed(&mut settings, &target_id, &window);
            let _ = window.hide();
        } else if let Some(widget) = settings
            .widgets
            .iter_mut()
            .find(|widget| widget.id == target_id)
        {
            widget.enabled = false;
        }
    }

    write_widget_settings(&app, &settings)
}

#[tauri::command(rename = "save-widget-bounds")]
pub fn save_widget_bounds(
    app: tauri::AppHandle,
    widget_id: Option<String>,
    user_sized: Option<bool>,
) -> Result<(), String> {
    let target_ids = resolve_target_widget_ids(&app, widget_id)?;
    let mut settings = read_widget_settings(&app)?;

    for target_id in target_ids {
        let label = widget_label(&target_id);
        let Some(window) = app.get_webview_window(&label) else {
            continue;
        };
        if let Some(widget) = settings
            .widgets
            .iter_mut()
            .find(|widget| widget.id == target_id)
        {
            widget.bounds = read_window_bounds(&window).or(widget.bounds);
            if let Some(user_sized) = user_sized {
                widget.user_sized = user_sized;
            }
        }
    }

    write_widget_settings(&app, &settings)
}

#[tauri::command(rename = "sync-widget-layout")]
pub fn sync_widget_layout(
    app: tauri::AppHandle,
    widget_id: Option<String>,
    min_width: u32,
    min_height: u32,
    auto_fit: bool,
) -> Result<WidgetState, String> {
    let widget_id = resolve_widget_id(&app, widget_id)?;
    let label = widget_label(&widget_id);
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| "Widget window is not available.".to_string())?;

    let min_width = min_width.max(MIN_WIDGET_WIDTH);
    let min_height = min_height.max(MIN_WIDGET_HEIGHT);
    let min_size = LogicalSize::new(min_width as f64, min_height as f64);
    window
        .set_min_size(Some(min_size))
        .map_err(|error| error.to_string())?;

    let mut settings = read_widget_settings(&app)?;
    let widget = settings
        .widgets
        .iter_mut()
        .find(|widget| widget.id == widget_id)
        .ok_or_else(|| "Widget settings are not available.".to_string())?;

    let clamped_size = clamped_widget_size(&window, min_width, min_height);
    let target_size = if auto_fit && !widget.user_sized {
        Some(min_size)
    } else {
        clamped_size
    };

    if let Some(target_size) = target_size {
        let _ = window.set_size(target_size);
        widget.bounds = read_window_bounds(&window).or(Some(StoredWidgetBounds {
            x: widget.bounds.map(|bounds| bounds.x).unwrap_or_default(),
            y: widget.bounds.map(|bounds| bounds.y).unwrap_or_default(),
            width: target_size.width.round() as u32,
            height: target_size.height.round() as u32,
        }));
    } else if let Some(bounds) = read_window_bounds(&window) {
        widget.bounds = Some(bounds);
    }

    let next_state = WidgetState::from_stored(widget);
    write_widget_settings(&app, &settings)?;
    Ok(next_state)
}

#[tauri::command(rename = "widget-frontend-ready")]
pub fn widget_frontend_ready(
    app: tauri::AppHandle,
    widget_id: Option<String>,
) -> Result<WidgetState, String> {
    let widget_id = resolve_widget_id(&app, widget_id)?;
    let settings = read_widget_settings(&app)?;
    let Some(widget) = settings
        .widgets
        .iter()
        .find(|widget| widget.id == widget_id)
        .cloned()
    else {
        return Ok(WidgetState {
            widget_id,
            title: None,
            pinned: false,
            always_on_top: false,
            enabled: false,
            user_sized: false,
            style_preset: WidgetStylePreset::default(),
            theme_mode: WidgetThemeMode::default(),
            density: WidgetDensity::default(),
            title_bar_position: WidgetTitleBarPosition::default(),
            button_alignment: WidgetButtonAlignment::default(),
            controls: Vec::new(),
        });
    };

    let label = widget_label(&widget.id);
    let Some(window) = app.get_webview_window(&label) else {
        return Ok(WidgetState::from_stored(&widget));
    };

    apply_widget_bounds(&window, &widget);
    let _ = window.set_always_on_top(widget.keeps_on_top());
    if widget.enabled || widget.pinned {
        let _ = window.show();
    }

    Ok(WidgetState::from_stored(&widget))
}

pub fn restore_widget_window(app: &tauri::AppHandle) -> Result<(), String> {
    let mut settings = read_widget_settings(app)?;
    let mut restored_widgets = Vec::new();
    let mut changed = false;

    for widget in &mut settings.widgets {
        if widget.pinned && !widget.enabled {
            widget.enabled = true;
            changed = true;
        }
        if widget.enabled {
            restored_widgets.push(widget.clone());
        }
    }

    if changed {
        write_widget_settings(app, &settings)?;
    }

    for widget in restored_widgets {
        show_widget_window(app, &widget, false)?;
    }

    Ok(())
}

fn show_widget_window(
    app: &tauri::AppHandle,
    widget: &StoredWidget,
    focus: bool,
) -> Result<(), String> {
    let label = widget_label(&widget.id);

    if let Some(window) = app.get_webview_window(&label) {
        apply_widget_bounds(&window, widget);
        let _ = window.set_always_on_top(widget.keeps_on_top());
        let _ = window.show();
        if focus {
            let _ = window.set_focus();
        }
        return Ok(());
    }

    let widget_url = format!(
        "index.html?window=widget&widgetId={}&v={}",
        widget.id,
        widget_url_cache_buster()
    );
    let mut builder =
        WebviewWindowBuilder::new(app, label.clone(), WebviewUrl::App(widget_url.into()))
            .title("Hue Widget")
            .inner_size(DEFAULT_WIDGET_WIDTH, DEFAULT_WIDGET_HEIGHT)
            .min_inner_size(MIN_WIDGET_WIDTH as f64, MIN_WIDGET_HEIGHT as f64)
            .decorations(false)
            .resizable(true)
            .always_on_top(widget.keeps_on_top())
            .transparent(true)
            .skip_taskbar(false)
            // Let the webview receive HTML5 drag-and-drop so the settings panel
            // can accept dropped image files; the OS handler would swallow them.
            .disable_drag_drop_handler()
            .visible(true);

    if let Some(bounds) = widget.bounds.filter(valid_bounds) {
        builder = builder
            .position(bounds.x as f64, bounds.y as f64)
            .inner_size(bounds.width as f64, bounds.height as f64);
    }

    let window = builder
        .build()
        .map_err(|error| format!("failed to build widget window: {error}"))?;
    install_widget_close_handler(&window, app.clone(), widget.id.clone());

    // The widget window is transparent so its content shell can render rounded
    // corners; a native rectangular shadow would frame the invisible corners, so
    // it stays off. Windows 11 also paints a 1px DWM frame border (a faint
    // rounded outline) on undecorated windows — strip it so only the CSS shell is
    // visible. Both apply to the window itself, so they run now (the HWND exists
    // as soon as `build` returns) rather than waiting on the webview.
    let _ = window.set_shadow(false);
    remove_window_border(&window);

    if focus {
        let _ = window.set_focus();
    }

    Ok(())
}

#[tauri::command(rename = "set-widget-pinned")]
pub fn set_widget_pinned(
    app: tauri::AppHandle,
    widget_id: Option<String>,
    pinned: bool,
) -> Result<(), String> {
    let widget_id = resolve_widget_id(&app, widget_id)?;
    let mut settings = read_widget_settings(&app)?;
    let widget = settings
        .widgets
        .iter_mut()
        .find(|widget| widget.id == widget_id)
        .ok_or_else(|| "Widget settings are not available.".to_string())?;

    let label = widget_label(&widget_id);
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| "Widget window is not available.".to_string())?;

    widget.enabled = true;
    widget.pinned = pinned;
    // Pinning locks the widget to its current spot so it reopens there on the
    // next launch; unpinning forgets that spot and frees the window to move.
    widget.bounds = if pinned {
        read_window_bounds(&window).or(widget.bounds)
    } else {
        None
    };
    // Pinning forces on-top; unpinning falls back to the standalone toggle so a
    // widget the user explicitly set to stay on top keeps doing so.
    let keeps_on_top = widget.keeps_on_top();
    write_widget_settings(&app, &settings)?;

    window
        .set_always_on_top(keeps_on_top)
        .map_err(|error| error.to_string())
}

#[tauri::command(rename = "set-widget-always-on-top")]
pub fn set_widget_always_on_top(
    app: tauri::AppHandle,
    widget_id: Option<String>,
    always_on_top: bool,
) -> Result<(), String> {
    let widget_id = resolve_widget_id(&app, widget_id)?;
    let mut settings = read_widget_settings(&app)?;
    let widget = settings
        .widgets
        .iter_mut()
        .find(|widget| widget.id == widget_id)
        .ok_or_else(|| "Widget settings are not available.".to_string())?;
    widget.always_on_top = always_on_top;
    let keeps_on_top = widget.keeps_on_top();
    write_widget_settings(&app, &settings)?;

    // Apply live when the window is open; closed widgets pick it up on reopen.
    let label = widget_label(&widget_id);
    if let Some(window) = app.get_webview_window(&label) {
        window
            .set_always_on_top(keeps_on_top)
            .map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command(rename = "get-widget-controls")]
pub fn get_widget_controls(
    app: tauri::AppHandle,
    widget_id: Option<String>,
) -> Result<Vec<StoredWidgetControl>, String> {
    let widget_id = resolve_widget_id(&app, widget_id)?;
    let settings = read_widget_settings(&app)?;
    Ok(settings
        .widgets
        .iter()
        .find(|widget| widget.id == widget_id)
        .map(|widget| widget.controls.clone())
        .unwrap_or_default())
}

#[tauri::command(rename = "set-widget-controls")]
pub fn set_widget_controls(
    app: tauri::AppHandle,
    widget_id: Option<String>,
    controls: Vec<StoredWidgetControl>,
) -> Result<(), String> {
    let widget_id = resolve_widget_id(&app, widget_id)?;
    let controls = sanitize_controls(controls);

    let mut settings = read_widget_settings(&app)?;
    let widget = settings
        .widgets
        .iter_mut()
        .find(|widget| widget.id == widget_id)
        .ok_or_else(|| "Widget settings are not available.".to_string())?;
    widget.controls = controls.clone();
    let next_state = WidgetState::from_stored(widget);
    write_widget_settings(&app, &settings)?;

    // If the widget is open, push the change so it updates live; edits made from
    // the Settings tab would otherwise only apply on the next open.
    let label = widget_label(&widget_id);
    if app.get_webview_window(&label).is_some() {
        let _ = app.emit_to(&label, WIDGET_CONTROLS_EVENT, &next_state);
    }

    Ok(())
}

#[tauri::command(rename = "preview-widget-config")]
pub fn preview_widget_config(
    app: tauri::AppHandle,
    widget_id: Option<String>,
    controls: Vec<StoredWidgetControl>,
    style_preset: WidgetStylePreset,
    theme_mode: WidgetThemeMode,
    density: WidgetDensity,
    title_bar_position: WidgetTitleBarPosition,
    button_alignment: WidgetButtonAlignment,
) -> Result<(), String> {
    let widget_id = resolve_widget_id(&app, widget_id)?;
    let settings = read_widget_settings(&app)?;
    let widget = settings
        .widgets
        .iter()
        .find(|widget| widget.id == widget_id)
        .ok_or_else(|| "Widget settings are not available.".to_string())?;
    let mut preview = widget.clone();
    preview.controls = sanitize_controls(controls);
    preview.style_preset = style_preset;
    preview.theme_mode = theme_mode;
    preview.density = density;
    preview.title_bar_position = title_bar_position;
    preview.button_alignment = button_alignment;
    let next_state = WidgetState::from_stored(&preview);

    let label = widget_label(&widget_id);
    if app.get_webview_window(&label).is_some() {
        let _ = app.emit_to(&label, WIDGET_SETTINGS_CHANGED_EVENT, &next_state);
    }

    Ok(())
}

#[tauri::command(rename = "set-widget-config")]
pub fn set_widget_config(
    app: tauri::AppHandle,
    widget_id: Option<String>,
    controls: Vec<StoredWidgetControl>,
    style_preset: WidgetStylePreset,
    theme_mode: WidgetThemeMode,
    density: WidgetDensity,
    title_bar_position: WidgetTitleBarPosition,
    button_alignment: WidgetButtonAlignment,
) -> Result<(), String> {
    let widget_id = resolve_widget_id(&app, widget_id)?;
    let mut settings = read_widget_settings(&app)?;
    let widget = settings
        .widgets
        .iter_mut()
        .find(|widget| widget.id == widget_id)
        .ok_or_else(|| "Widget settings are not available.".to_string())?;
    widget.controls = sanitize_controls(controls);
    widget.style_preset = style_preset;
    widget.theme_mode = theme_mode;
    widget.density = density;
    widget.title_bar_position = title_bar_position;
    widget.button_alignment = button_alignment;
    let next_state = WidgetState::from_stored(widget);
    write_widget_settings(&app, &settings)?;

    let label = widget_label(&widget_id);
    if app.get_webview_window(&label).is_some() {
        let _ = app.emit_to(&label, WIDGET_SETTINGS_CHANGED_EVENT, &next_state);
    }

    Ok(())
}

#[tauri::command(rename = "set-widget-style-preset")]
pub fn set_widget_style_preset(
    app: tauri::AppHandle,
    widget_id: Option<String>,
    style_preset: WidgetStylePreset,
) -> Result<(), String> {
    let widget_id = resolve_widget_id(&app, widget_id)?;
    let mut settings = read_widget_settings(&app)?;
    let widget = settings
        .widgets
        .iter_mut()
        .find(|widget| widget.id == widget_id)
        .ok_or_else(|| "Widget settings are not available.".to_string())?;
    widget.style_preset = style_preset;
    let next_state = WidgetState::from_stored(widget);
    write_widget_settings(&app, &settings)?;

    let label = widget_label(&widget_id);
    if app.get_webview_window(&label).is_some() {
        let _ = app.emit_to(&label, WIDGET_SETTINGS_CHANGED_EVENT, &next_state);
    }

    Ok(())
}

#[tauri::command(rename = "set-widget-titlebar")]
pub fn set_widget_titlebar(
    app: tauri::AppHandle,
    widget_id: Option<String>,
    position: WidgetTitleBarPosition,
    alignment: WidgetButtonAlignment,
) -> Result<(), String> {
    let widget_id = resolve_widget_id(&app, widget_id)?;
    let mut settings = read_widget_settings(&app)?;
    let widget = settings
        .widgets
        .iter_mut()
        .find(|widget| widget.id == widget_id)
        .ok_or_else(|| "Widget settings are not available.".to_string())?;
    widget.title_bar_position = position;
    widget.button_alignment = alignment;
    let next_state = WidgetState::from_stored(widget);
    write_widget_settings(&app, &settings)?;

    let label = widget_label(&widget_id);
    if app.get_webview_window(&label).is_some() {
        let _ = app.emit_to(&label, WIDGET_SETTINGS_CHANGED_EVENT, &next_state);
    }

    Ok(())
}

#[tauri::command(rename = "open-widget-settings")]
pub fn open_widget_settings(app: tauri::AppHandle) -> Result<(), String> {
    crate::commands::app_settings::show_main_window(&app)?;
    if app.get_webview_window("main").is_some() {
        let _ = app.emit_to("main", OPEN_WIDGET_SETTINGS_EVENT, ());
    }
    Ok(())
}

#[tauri::command(rename = "remove-widget")]
pub fn remove_widget(app: tauri::AppHandle, widget_id: Option<String>) -> Result<(), String> {
    let widget_id = resolve_widget_id(&app, widget_id)?;

    // Destroy (not close) any live window so the close handler — which only
    // hides and re-marks the widget — can't resurrect the entry we're deleting.
    if let Some(window) = app.get_webview_window(&widget_label(&widget_id)) {
        let _ = window.destroy();
    }

    let mut settings = read_widget_settings(&app)?;
    settings.widgets.retain(|widget| widget.id != widget_id);
    write_widget_settings(&app, &settings)
}

#[tauri::command(rename = "set-widget-acrylic")]
pub fn set_widget_acrylic(
    app: tauri::AppHandle,
    widget_id: Option<String>,
    enabled: bool,
    radius: Option<f64>,
    color: Option<[u8; 4]>,
) -> Result<(), String> {
    let widget_id = resolve_widget_id(&app, widget_id)?;
    let label = widget_label(&widget_id);
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| "Widget window is not available.".to_string())?;

    apply_acrylic_effect(&window, enabled, radius, color);
    Ok(())
}

/// Applies a native Acrylic (frosted) effect to the widget window. CSS
/// `backdrop-filter` cannot blur the desktop behind a transparent window on
/// Windows, so the real frosted look — and the antialiased rounded corners via
/// `radius` — come from the platform compositor here. `color` is an RGBA tint.
fn apply_acrylic_effect(
    window: &WebviewWindow,
    enabled: bool,
    radius: Option<f64>,
    color: Option<[u8; 4]>,
) {
    #[cfg(target_os = "windows")]
    {
        use tauri::utils::config::{Color, WindowEffectsConfig};
        use tauri::window::Effect;

        let effects = enabled.then(|| WindowEffectsConfig {
            effects: vec![Effect::Acrylic],
            radius,
            color: color.map(|[r, g, b, a]| Color(r, g, b, a)),
            ..Default::default()
        });
        let _ = window.set_effects(effects);
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (window, enabled, radius, color);
    }
}

/// Removes the native Windows 11 DWM frame border from a window. On undecorated
/// windows DWM still draws a thin rounded outline; setting `DWMWA_BORDER_COLOR`
/// to `DWMWA_COLOR_NONE` hides it so only the transparent CSS shell shows.
#[cfg(target_os = "windows")]
fn remove_window_border(window: &WebviewWindow) {
    use windows_sys::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_BORDER_COLOR};

    // `DWMWA_COLOR_NONE` (0xFFFFFFFE) tells DWM to skip painting the border.
    const DWMWA_COLOR_NONE: u32 = 0xFFFF_FFFE;

    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    let color: u32 = DWMWA_COLOR_NONE;
    unsafe {
        DwmSetWindowAttribute(
            hwnd.0 as _,
            DWMWA_BORDER_COLOR as u32,
            &color as *const u32 as *const core::ffi::c_void,
            std::mem::size_of::<u32>() as u32,
        );
    }
}

#[cfg(not(target_os = "windows"))]
fn remove_window_border(_window: &WebviewWindow) {}

fn install_widget_close_handler(window: &WebviewWindow, app: tauri::AppHandle, widget_id: String) {
    let window_for_handler = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            if let Ok(mut settings) = read_widget_settings(&app) {
                mark_widget_closed(&mut settings, &widget_id, &window_for_handler);
                let _ = write_widget_settings(&app, &settings);
            }
            let _ = window_for_handler.hide();
        }
    });
}

fn mark_widget_closed(
    settings: &mut StoredWidgetSettings,
    widget_id: &str,
    window: &WebviewWindow,
) {
    if let Some(widget) = settings
        .widgets
        .iter_mut()
        .find(|widget| widget.id == widget_id)
    {
        widget.enabled = false;
        widget.bounds = read_window_bounds(window).or(widget.bounds);
    }
}

fn read_window_bounds(window: &WebviewWindow) -> Option<StoredWidgetBounds> {
    let PhysicalPosition { x, y } = window.outer_position().ok()?;
    let PhysicalSize { width, height } = window.inner_size().ok()?;
    Some(StoredWidgetBounds {
        x,
        y,
        width,
        height,
    })
    .filter(valid_bounds)
}

fn valid_bounds(bounds: &StoredWidgetBounds) -> bool {
    bounds.width >= MIN_WIDGET_WIDTH && bounds.height >= MIN_WIDGET_HEIGHT
}

fn apply_widget_bounds(window: &WebviewWindow, widget: &StoredWidget) {
    if let Some(bounds) = widget.bounds.filter(valid_bounds) {
        let _ = window.set_position(PhysicalPosition::new(bounds.x, bounds.y));
        let _ = window.set_size(PhysicalSize::new(bounds.width, bounds.height));
    }
}

fn clamped_widget_size(
    window: &WebviewWindow,
    min_width: u32,
    min_height: u32,
) -> Option<LogicalSize<f64>> {
    let scale_factor = window.scale_factor().ok()?;
    let current = window.inner_size().ok()?.to_logical::<f64>(scale_factor);
    let width = current.width.max(min_width as f64).ceil();
    let height = current.height.max(min_height as f64).ceil();

    (width > current.width || height > current.height).then_some(LogicalSize::new(width, height))
}

fn resolve_widget_id(app: &tauri::AppHandle, widget_id: Option<String>) -> Result<String, String> {
    if let Some(widget_id) = widget_id.filter(|id| is_valid_widget_id(id)) {
        return Ok(widget_id);
    }

    app.webview_windows()
        .keys()
        .find_map(|label| widget_id_from_label(label))
        .ok_or_else(|| "Widget id is not available.".to_string())
}

fn resolve_target_widget_ids(
    app: &tauri::AppHandle,
    widget_id: Option<String>,
) -> Result<Vec<String>, String> {
    if let Some(widget_id) = widget_id.filter(|id| is_valid_widget_id(id)) {
        return Ok(vec![widget_id]);
    }

    let ids = app
        .webview_windows()
        .keys()
        .filter_map(|label| widget_id_from_label(label))
        .collect::<Vec<_>>();

    if ids.is_empty() {
        Err("Widget id is not available.".to_string())
    } else {
        Ok(ids)
    }
}

fn widget_label(widget_id: &str) -> String {
    format!("{WIDGET_LABEL_PREFIX}{widget_id}")
}

fn widget_id_from_label(label: &str) -> Option<String> {
    let widget_id = label.strip_prefix(WIDGET_LABEL_PREFIX)?;
    is_valid_widget_id(widget_id).then(|| widget_id.to_string())
}

fn next_widget_id(settings: &StoredWidgetSettings) -> String {
    let existing_ids = settings
        .widgets
        .iter()
        .map(|widget| widget.id.as_str())
        .collect::<HashSet<_>>();
    let base = widget_url_cache_buster();

    for suffix in 0..1000 {
        let candidate = format!("w{}", base + suffix);
        if !existing_ids.contains(candidate.as_str()) {
            return candidate;
        }
    }

    format!("w{base}")
}

fn is_valid_widget_id(widget_id: &str) -> bool {
    !widget_id.is_empty()
        && widget_id.len() <= 64
        && widget_id.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        })
}

fn widget_url_cache_buster() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn widget_settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join(WIDGET_SETTINGS_FILE_NAME))
}

fn read_widget_settings(app: &tauri::AppHandle) -> Result<StoredWidgetSettings, String> {
    let path = widget_settings_path(app)?;
    let contents = match fs::read_to_string(&path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(StoredWidgetSettings::default());
        }
        Err(error) => return Err(error.to_string()),
    };

    let contents_without_bom = contents.trim_start_matches('\u{feff}');
    let value = match serde_json::from_str::<Value>(contents_without_bom) {
        Ok(value) => value,
        Err(error) => {
            eprintln!(
                "failed to parse widget settings at {} ({} bytes): {error}; using defaults",
                path.display(),
                contents.len()
            );
            return Ok(StoredWidgetSettings::default());
        }
    };

    if value.get("widgets").is_some() {
        let settings = serde_json::from_value::<StoredWidgetSettings>(value)
            .map_err(|error| error.to_string())?;
        return Ok(sanitize_widget_settings(settings));
    }

    Ok(legacy_widget_settings_from_value(&value))
}

fn write_widget_settings(
    app: &tauri::AppHandle,
    settings: &StoredWidgetSettings,
) -> Result<(), String> {
    let path = widget_settings_path(app)?;
    let settings = sanitize_widget_settings(settings.clone());
    let contents = serde_json::to_string_pretty(&settings).map_err(|error| error.to_string())?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

fn sanitize_widget_settings(mut settings: StoredWidgetSettings) -> StoredWidgetSettings {
    let mut seen_ids = HashSet::new();

    settings.widgets.retain_mut(|widget| {
        if !is_valid_widget_id(&widget.id) || !seen_ids.insert(widget.id.clone()) {
            return false;
        }
        if !widget.bounds.is_some_and(|bounds| valid_bounds(&bounds)) {
            widget.bounds = None;
        }
        widget.title = sanitize_widget_title(widget.title.clone());
        widget.controls = sanitize_controls(widget.controls.clone());
        true
    });

    settings
}

fn sanitize_widget_title(title: Option<String>) -> Option<String> {
    title
        .map(|title| title.trim().chars().take(64).collect::<String>())
        .filter(|title| !title.is_empty())
}

fn control_composition_key(controls: &[StoredWidgetControl]) -> Vec<String> {
    let mut key = controls
        .iter()
        .map(|control| format!("{}:{}", control.target.kind, control.target.id))
        .collect::<Vec<_>>();
    key.sort();
    key.dedup();
    key
}

fn find_widget_with_same_composition<'a>(
    settings: &'a StoredWidgetSettings,
    controls: &[StoredWidgetControl],
) -> Option<&'a StoredWidget> {
    if controls.is_empty() {
        return None;
    }
    let target_key = control_composition_key(controls);
    settings
        .widgets
        .iter()
        .filter(|widget| widget.enabled)
        .find(|widget| control_composition_key(&widget.controls) == target_key)
}

/// Drops controls a hand-edited or stale settings file can't render: unknown
/// target kinds, duplicate ids, over-long scene lists, and malformed hotkeys.
fn sanitize_controls(controls: Vec<StoredWidgetControl>) -> Vec<StoredWidgetControl> {
    let mut seen_ids = HashSet::new();
    controls
        .into_iter()
        .filter_map(|mut control| {
            if control.id.trim().is_empty() || !seen_ids.insert(control.id.clone()) {
                return None;
            }
            if !CONTROL_TARGET_KINDS.contains(&control.target.kind.as_str())
                || control.target.id.trim().is_empty()
            {
                return None;
            }
            // Scenes only make sense for a group target, and stay capped so a card
            // can't grow an unbounded row of buttons.
            if control.target.kind == "light" {
                control.scene_ids.clear();
            } else {
                control.scene_ids.truncate(MAX_CONTROL_SCENES);
            }
            if let Some(hotkey) = &control.hotkey {
                let valid = !hotkey.accelerator.trim().is_empty()
                    && CONTROL_HOTKEY_ACTIONS.contains(&hotkey.action.as_str())
                    && (hotkey.action != "scene" || hotkey.scene_id.is_some());
                if !valid {
                    control.hotkey = None;
                }
            }
            Some(control)
        })
        .collect()
}

fn legacy_widget_settings_from_value(value: &Value) -> StoredWidgetSettings {
    let enabled = value
        .get("enabled")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let pinned = value
        .get("pinned")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let bounds = widget_bounds_from_value(value);

    if !enabled && !pinned && bounds.is_none() {
        return StoredWidgetSettings::default();
    }

    StoredWidgetSettings {
        widgets: vec![StoredWidget {
            id: LEGACY_WIDGET_ID.to_string(),
            title: None,
            enabled,
            pinned,
            bounds,
            user_sized: false,
            style_preset: WidgetStylePreset::default(),
            theme_mode: WidgetThemeMode::default(),
            density: WidgetDensity::default(),
            title_bar_position: WidgetTitleBarPosition::default(),
            button_alignment: WidgetButtonAlignment::default(),
            always_on_top: false,
            controls: Vec::new(),
        }],
    }
}

fn widget_bounds_from_value(value: &Value) -> Option<StoredWidgetBounds> {
    let source = value.get("bounds").unwrap_or(value);
    let bounds = StoredWidgetBounds {
        x: value_as_i32(source.get("x")?)?,
        y: value_as_i32(source.get("y")?)?,
        width: value_as_u32(source.get("width")?)?,
        height: value_as_u32(source.get("height")?)?,
    };

    valid_bounds(&bounds).then_some(bounds)
}

fn value_as_i32(value: &Value) -> Option<i32> {
    if let Some(value) = value.as_i64() {
        return i32::try_from(value).ok();
    }
    value.as_f64().and_then(|value| {
        value
            .is_finite()
            .then_some(value.round())
            .and_then(|value| i32::try_from(value as i64).ok())
    })
}

fn value_as_u32(value: &Value) -> Option<u32> {
    if let Some(value) = value.as_u64() {
        return u32::try_from(value).ok();
    }
    value.as_f64().and_then(|value| {
        value
            .is_finite()
            .then_some(value.round())
            .and_then(|value| u32::try_from(value as i64).ok())
    })
}
