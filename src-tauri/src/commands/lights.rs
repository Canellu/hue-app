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
    brightness: Option<f64>,
) -> Result<(), String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .set_light_state(
            &stored_bridge.bridge_ip,
            &application_key,
            &id,
            on,
            brightness,
        )
        .await
}

#[tauri::command(rename = "set-light-color")]
pub async fn set_light_color(
    app: AppHandle,
    id: String,
    xy: Option<[f64; 2]>,
    ct: Option<u16>,
    effect: Option<String>,
) -> Result<(), String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .set_light_color(
            &stored_bridge.bridge_ip,
            &application_key,
            &id,
            xy,
            ct,
            effect,
        )
        .await
}
