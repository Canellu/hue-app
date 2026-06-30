use tauri::AppHandle;

use crate::services::sync_box_client::{DiscoveredSyncBox, SyncBoxClient, SyncBoxSession};

#[tauri::command(rename = "discover-sync-boxes")]
pub async fn discover_sync_boxes() -> Result<Vec<DiscoveredSyncBox>, String> {
    SyncBoxClient::new()?.discover().await
}

#[tauri::command(rename = "pair-sync-box")]
pub async fn pair_sync_box(
    app: AppHandle,
    ip_address: String,
    port: u16,
) -> Result<SyncBoxSession, String> {
    let client = SyncBoxClient::new()?;
    let (sync_box, access_token) = client.register(&ip_address, port).await?;
    client.save_session(&app, &sync_box, &access_token).await
}

#[tauri::command(rename = "get-sync-box-session")]
pub async fn get_sync_box_session(app: AppHandle) -> Result<SyncBoxSession, String> {
    SyncBoxClient::new()?.restore_session(&app).await
}

#[tauri::command(rename = "reset-sync-box-session")]
pub fn reset_sync_box_session(app: AppHandle) -> Result<(), String> {
    SyncBoxClient::new()?.clear_session(&app)
}
