use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::services::hue_client::HueClient;

/// Tracks whether the background event-stream task is running so we never spawn
/// more than one. Stored as Tauri managed state.
#[derive(Default)]
pub struct EventStreamState {
    active: Arc<AtomicBool>,
}

impl EventStreamState {
    pub fn stop(&self) {
        self.active.store(false, Ordering::SeqCst);
    }
}

#[tauri::command(rename = "start-hue-events")]
pub fn start_hue_events(app: AppHandle, state: State<'_, EventStreamState>) -> Result<(), String> {
    // Already running: nothing to do.
    if state.active.swap(true, Ordering::SeqCst) {
        return Ok(());
    }

    let active = state.active.clone();
    let reset = || active.store(false, Ordering::SeqCst);

    let client = match HueClient::new_streaming() {
        Ok(client) => client,
        Err(error) => {
            reset();
            return Err(error);
        }
    };
    let stored_bridge = match client.get_stored_bridge(&app) {
        Ok(bridge) => bridge,
        Err(error) => {
            reset();
            return Err(error);
        }
    };
    let application_key = match client.get_stored_application_key(&app) {
        Ok(key) => key,
        Err(error) => {
            reset();
            return Err(error);
        }
    };

    let app_handle = app.clone();
    let task_active = active.clone();
    tauri::async_runtime::spawn(async move {
        client
            .run_event_stream(
                &app_handle,
                task_active.clone(),
                &stored_bridge.bridge_ip,
                &application_key,
            )
            .await;
        task_active.store(false, Ordering::SeqCst);
    });

    Ok(())
}

#[tauri::command(rename = "stop-hue-events")]
pub fn stop_hue_events(state: State<'_, EventStreamState>) {
    state.stop();
}
