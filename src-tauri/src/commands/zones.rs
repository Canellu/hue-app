use tauri::AppHandle;

use crate::services::hue_client::{HueClient, HueZone};

#[tauri::command(rename = "get-hue-zones")]
pub async fn get_hue_zones(app: AppHandle) -> Result<Vec<HueZone>, String> {
    let client = HueClient::new()?;
    let stored_bridge = client.get_stored_bridge(&app)?;
    let application_key = client.get_stored_application_key(&app)?;
    client
        .get_zones(&stored_bridge.bridge_ip, &application_key)
        .await
}
