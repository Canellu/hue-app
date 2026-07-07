use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, State};

use crate::services::hue_client::HueClient;

/// Tracks the running event-stream task so at most one streams at a time.
///
/// Each spawned task owns its own cancellation flag (a "generation"). `stop`
/// clears the current generation's flag; `begin` cancels any current generation
/// and mints a fresh one. Because a restart uses a brand-new flag rather than
/// flipping a shared bool back to `true`, switching bridges can never revive the
/// task that was streaming the previous bridge. Stored as Tauri managed state.
#[derive(Default)]
pub struct EventStreamState {
    current: Mutex<Option<Arc<AtomicBool>>>,
}

impl EventStreamState {
    /// Cancels the running task, if any.
    pub fn stop(&self) {
        if let Some(flag) = self.current.lock().unwrap().take() {
            flag.store(false, Ordering::SeqCst);
        }
    }

    /// Reserves a new generation to run, or `None` if one is already running.
    /// The caller must spawn the task with the returned flag. The stream loop
    /// only ever exits after its flag is cleared (by `stop`), so no on-exit
    /// cleanup of the slot is needed.
    fn begin(&self) -> Option<Arc<AtomicBool>> {
        let mut guard = self.current.lock().unwrap();
        if guard.is_some() {
            return None;
        }
        let flag = Arc::new(AtomicBool::new(true));
        *guard = Some(flag.clone());
        Some(flag)
    }
}

#[tauri::command(rename = "start-hue-events")]
pub fn start_hue_events(app: AppHandle, state: State<'_, EventStreamState>) -> Result<(), String> {
    // Already running: nothing to do.
    let Some(flag) = state.begin() else {
        return Ok(());
    };
    let reset = || state.stop();

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
    tauri::async_runtime::spawn(async move {
        client
            .run_event_stream(
                &app_handle,
                flag,
                &stored_bridge.bridge_ip,
                &application_key,
            )
            .await;
    });

    Ok(())
}

#[tauri::command(rename = "stop-hue-events")]
pub fn stop_hue_events(state: State<'_, EventStreamState>) {
    state.stop();
}
