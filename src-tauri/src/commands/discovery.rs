use tauri::{AppHandle, Manager};

use crate::commands::events::EventStreamState;
use crate::services::hue_client::{DiscoveredBridge, HueClient, HueSession};

#[tauri::command(rename = "discover-bridges")]
pub async fn discover_bridges() -> Result<Vec<DiscoveredBridge>, String> {
    HueClient::new()?.discover_bridges().await
}

#[tauri::command(rename = "pair-bridge")]
pub async fn pair_bridge(app: AppHandle, ip: String) -> Result<HueSession, String> {
    let client = HueClient::new()?;
    let (bridge, application_key) = client.pair_bridge(&ip).await?;
    client.save_session(&app, &bridge, &application_key).await
}

#[tauri::command(rename = "get-hue-session")]
pub async fn get_hue_session(app: AppHandle) -> Result<HueSession, String> {
    HueClient::new()?.restore_session(&app).await
}

#[tauri::command(rename = "reset-hue-session")]
pub fn reset_hue_session(app: AppHandle) -> Result<(), String> {
    if let Some(state) = app.try_state::<EventStreamState>() {
        state.stop();
    }
    HueClient::new()?.clear_session(&app)
}
