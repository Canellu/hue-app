//! Persisted PC sync preferences.
//!
//! Stored in their own Tauri store file so sync settings never contend with
//! the bridge session data in `hue-store.json`.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

use super::analysis::{SyncIntensity, SyncMode};
use super::music::{MusicChannelCount, MusicPaletteChoice};

const STORE_FILE: &str = "host-sync.json";
const STORE_KEY: &str = "preferences";

/// What happens to the member lights after a normal stop. Failures always
/// restore the snapshot regardless of this setting.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StopBehavior {
    /// Reapply the pre-sync snapshot (default).
    #[default]
    Restore,
    /// Keep the final streamed colors.
    Keep,
    /// Turn the member lights off.
    TurnOff,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct HostSyncPreferences {
    /// Track the primary display automatically. When false, `display_ids`
    /// holds the explicit selection (multiple displays allowed).
    pub automatic_display: bool,
    pub display_ids: Vec<String>,
    /// `None` follows the Windows default output device.
    pub audio_device_id: Option<String>,
    pub mode: SyncMode,
    pub intensity: SyncIntensity,
    /// Effect brightness, 0-100.
    pub brightness: f64,
    /// Audio-driven brightness emphasis for Video mode.
    pub video_audio_reactive: bool,
    pub music_palette: MusicPaletteChoice,
    pub music_channel_count: MusicChannelCount,
    pub stop_behavior: StopBehavior,
}

impl Default for HostSyncPreferences {
    fn default() -> Self {
        Self {
            automatic_display: true,
            display_ids: Vec::new(),
            audio_device_id: None,
            mode: SyncMode::Video,
            intensity: SyncIntensity::Moderate,
            brightness: 100.0,
            video_audio_reactive: false,
            music_palette: MusicPaletteChoice::default(),
            music_channel_count: MusicChannelCount::MatchArea,
            stop_behavior: StopBehavior::Restore,
        }
    }
}

pub fn load<R: Runtime>(app: &AppHandle<R>) -> HostSyncPreferences {
    let Ok(store) = app.store(STORE_FILE) else {
        return HostSyncPreferences::default();
    };
    store
        .get(STORE_KEY)
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default()
}

pub fn save<R: Runtime>(
    app: &AppHandle<R>,
    preferences: &HostSyncPreferences,
) -> Result<(), String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|error| format!("Failed to open sync settings store: {error}"))?;
    store.set(
        STORE_KEY,
        serde_json::to_value(preferences)
            .map_err(|error| format!("Invalid sync settings: {error}"))?,
    );
    store
        .save()
        .map_err(|error| format!("Failed to save sync settings: {error}"))
}
