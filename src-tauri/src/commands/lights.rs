use tauri::AppHandle;

use crate::services::hue_client::{HueClient, HueLight};

#[tauri::command(rename = "get-hue-lights")]
pub async fn get_hue_lights(app: AppHandle) -> Result<Vec<HueLight>, String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .get_lights(&stored_bridge.bridge_ip, &application_key)
        .await
}

#[tauri::command(rename = "set-light-state")]
pub async fn set_light_state(
    app: AppHandle,
    id: String,
    on: bool,
    brightness: Option<u8>,
) -> Result<(), String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .set_light_state(&stored_bridge.bridge_ip, &application_key, &id, on, brightness)
        .await
}
