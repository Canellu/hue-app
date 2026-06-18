use tauri::AppHandle;

use crate::services::hue_client::{HueClient, HueRoom};

#[tauri::command(rename = "get-hue-rooms")]
pub async fn get_hue_rooms(app: AppHandle) -> Result<Vec<HueRoom>, String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .get_rooms(&stored_bridge.bridge_ip, &application_key)
        .await
}

#[tauri::command(rename = "update-room-members")]
pub async fn update_room_members(
    app: AppHandle,
    room_id: String,
    device_ids: Vec<String>,
) -> Result<(), String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .update_room_members(
            &stored_bridge.bridge_ip,
            &application_key,
            &room_id,
            device_ids,
        )
        .await
}
