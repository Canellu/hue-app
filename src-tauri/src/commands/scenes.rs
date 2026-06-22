use tauri::AppHandle;

use crate::services::hue_client::{HueClient, HueScene, HueSceneRecipeColor};

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

#[tauri::command(rename = "start-dynamic-scene")]
pub async fn start_dynamic_scene(
    app: AppHandle,
    scene_id: String,
    transition_ms: Option<u32>,
    brightness: Option<f64>,
) -> Result<(), String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .start_dynamic_scene(
            &stored_bridge.bridge_ip,
            &application_key,
            &scene_id,
            transition_ms,
            brightness,
        )
        .await
}

#[tauri::command(rename = "stop-dynamic-scene")]
pub async fn stop_dynamic_scene(
    app: AppHandle,
    scene_id: String,
    transition_ms: Option<u32>,
) -> Result<(), String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .stop_dynamic_scene(
            &stored_bridge.bridge_ip,
            &application_key,
            &scene_id,
            transition_ms,
        )
        .await
}

#[tauri::command(rename = "set-scene-brightness")]
pub async fn set_scene_brightness(
    app: AppHandle,
    scene_id: String,
    brightness: f64,
) -> Result<(), String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .set_scene_brightness(
            &stored_bridge.bridge_ip,
            &application_key,
            &scene_id,
            brightness,
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

#[tauri::command(rename = "deactivate-smart-scene")]
pub async fn deactivate_smart_scene(app: AppHandle, scene_id: String) -> Result<(), String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .deactivate_smart_scene(&stored_bridge.bridge_ip, &application_key, &scene_id)
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

#[tauri::command(rename = "create-hue-gallery-scene")]
pub async fn create_hue_gallery_scene(
    app: AppHandle,
    name: String,
    group_id: String,
    group_type: String,
    colors: Vec<HueSceneRecipeColor>,
    brightness: f64,
    speed: Option<f64>,
) -> Result<HueScene, String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .create_gallery_scene(
            &stored_bridge.bridge_ip,
            &application_key,
            &name,
            &group_id,
            &group_type,
            &colors,
            brightness,
            speed,
        )
        .await
}
