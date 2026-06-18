use tauri::AppHandle;

use crate::services::hue_client::HueClient;

/// Controls a grouped_light resource, which Hue uses for room/zone power and brightness.
#[tauri::command(rename = "set-grouped-light-state")]
pub async fn set_grouped_light_state(
    app: AppHandle,
    id: String,
    on: bool,
    brightness: Option<f64>,
    transition_ms: Option<u32>,
) -> Result<(), String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .set_grouped_light_state(
            &stored_bridge.bridge_ip,
            &application_key,
            &id,
            on,
            brightness,
            transition_ms,
        )
        .await
}
