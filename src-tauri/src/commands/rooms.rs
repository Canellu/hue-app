use tauri::AppHandle;

use crate::services::hue_client::{HueClient, HueGroups};

#[tauri::command(rename = "get-hue-groups")]
pub async fn get_hue_groups(app: AppHandle) -> Result<HueGroups, String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .get_groups(&stored_bridge.bridge_ip, &application_key)
        .await
}

/// Controls a grouped_light (a room, zone, or the whole house via its id).
#[tauri::command(rename = "set-room-state")]
pub async fn set_room_state(
    app: AppHandle,
    id: String,
    on: bool,
    brightness: Option<f64>,
) -> Result<(), String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .set_grouped_light_state(&stored_bridge.bridge_ip, &application_key, &id, on, brightness)
        .await
}
