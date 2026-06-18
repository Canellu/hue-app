use tauri::AppHandle;

use crate::services::hue_client::{HueClient, HueScene};

#[tauri::command(rename = "get-hue-scenes")]
pub async fn get_hue_scenes(app: AppHandle) -> Result<Vec<HueScene>, String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .get_scenes(&stored_bridge.bridge_ip, &application_key)
        .await
}

#[tauri::command(rename = "get-hue-smart-scenes")]
pub async fn get_hue_smart_scenes(app: AppHandle) -> Result<Vec<HueScene>, String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .get_smart_scenes(&stored_bridge.bridge_ip, &application_key)
        .await
}

#[tauri::command(rename = "activate-scene")]
pub async fn activate_scene(
    app: AppHandle,
    scene_id: String,
    transition_ms: Option<u32>,
) -> Result<(), String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .activate_scene(
            &stored_bridge.bridge_ip,
            &application_key,
            &scene_id,
            transition_ms,
        )
        .await
}

#[tauri::command(rename = "activate-smart-scene")]
pub async fn activate_smart_scene(
    app: AppHandle,
    scene_id: String,
    transition_ms: Option<u32>,
) -> Result<(), String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .activate_smart_scene(
            &stored_bridge.bridge_ip,
            &application_key,
            &scene_id,
            transition_ms,
        )
        .await
}

#[tauri::command(rename = "create-hue-scene")]
pub async fn create_hue_scene(
    app: AppHandle,
    name: String,
    group_id: String,
    group_type: String,
) -> Result<String, String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .create_scene(
            &stored_bridge.bridge_ip,
            &application_key,
            &name,
            &group_id,
            &group_type,
        )
        .await
}
