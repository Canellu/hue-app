use keyring::Entry;
use mdns_sd::{ServiceDaemon, ServiceEvent};
use reqwest::{Certificate, Client};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::net::{IpAddr, SocketAddr};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "hue-store.json";
const STORE_KEY: &str = "syncBox";
const KEYRING_SERVICE: &str = "com.anton.hue-app";
const KEYRING_ACCOUNT: &str = "hue-sync-box-access-token";
const REQUEST_TIMEOUT_SECS: u64 = 8;
const DISCOVERY_TIMEOUT_SECS: u64 = 3;
const MIN_API_LEVEL: u32 = 7;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncBoxDevice {
    pub name: String,
    pub device_type: String,
    pub unique_id: String,
    pub api_level: u32,
    pub firmware_version: String,
    #[serde(default)]
    pub ip_address: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredSyncBox {
    pub name: String,
    pub device_type: String,
    pub unique_id: String,
    pub ip_address: String,
    pub port: u16,
    pub api_level: u32,
    pub firmware_version: String,
    pub supported: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredSyncBoxInfo {
    pub name: String,
    pub device_type: String,
    pub unique_id: String,
    pub ip_address: String,
    #[serde(default = "default_https_port")]
    pub port: u16,
    pub api_level: u32,
    pub firmware_version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncBoxSession {
    pub configured: bool,
    pub connected: bool,
    pub sync_box: Option<StoredSyncBoxInfo>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncBoxState {
    pub device: SyncBoxStateDevice,
    pub hue: SyncBoxHue,
    pub execution: SyncBoxExecution,
    pub hdmi: SyncBoxHdmi,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncBoxStateDevice {
    pub name: String,
    #[serde(default)]
    pub overheating: bool,
    #[serde(default)]
    pub undervolt: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncBoxHue {
    pub connection_state: String,
    #[serde(default)]
    pub groups: HashMap<String, SyncBoxHueGroup>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncBoxHueGroup {
    pub name: String,
    pub num_lights: u32,
    #[serde(default)]
    pub active: bool,
    /// Name of the application currently streaming to this group, e.g.
    /// "HueSyncBox (C429960B4B6C)" — present while `active` is true.
    #[serde(default)]
    pub owner: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncBoxExecution {
    pub mode: String,
    pub sync_active: bool,
    pub hdmi_active: bool,
    pub hdmi_source: String,
    #[serde(default)]
    pub hue_target: Option<String>,
    pub brightness: u16,
    #[serde(default)]
    pub last_sync_mode: Option<String>,
    #[serde(default)]
    pub video: Option<SyncBoxModeSettings>,
    #[serde(default)]
    pub game: Option<SyncBoxModeSettings>,
    #[serde(default)]
    pub music: Option<SyncBoxModeSettings>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncBoxModeSettings {
    #[serde(default)]
    pub intensity: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncBoxHdmi {
    pub input1: SyncBoxHdmiInput,
    pub input2: SyncBoxHdmiInput,
    pub input3: SyncBoxHdmiInput,
    pub input4: SyncBoxHdmiInput,
    #[serde(default)]
    pub content_specs: Option<String>,
    #[serde(default)]
    pub video_sync_supported: bool,
    #[serde(default)]
    pub audio_sync_supported: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncBoxHdmiInput {
    pub name: String,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(rename = "type", default)]
    pub input_type: Option<String>,
    #[serde(default)]
    pub last_sync_mode: Option<String>,
}

struct MdnsSyncBox {
    ip_address: String,
    port: u16,
}

/// Box identity a pinned client was built for; a change to any field means the
/// cached client's DNS override is stale and it must be rebuilt.
#[derive(Debug, Clone, PartialEq, Eq)]
struct SecureTarget {
    unique_id: String,
    ip_address: String,
    port: u16,
}

pub struct SyncBoxClient {
    /// Insecure transport used only for unauthenticated discovery probes,
    /// where the box's uniqueId (needed to build the pinned client) is not yet
    /// known. Secrets never travel over this client.
    probe_client: Client,
    /// The Philips "root-hsb" CA that signs every Sync Box leaf certificate.
    ca: Certificate,
    /// Cached pinned client for the one configured box; rebuilt if it moves.
    secure: Mutex<Option<(SecureTarget, Client)>>,
}

impl SyncBoxClient {
    pub fn new() -> Result<Self, String> {
        let probe_client = Client::builder()
            .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .danger_accept_invalid_certs(true)
            .build()
            .map_err(|error| format!("Failed to create Sync Box HTTP client: {error}"))?;
        let ca = Certificate::from_pem(include_bytes!("../../assets/hsb_cacert.pem"))
            .map_err(|error| format!("Invalid bundled Sync Box CA certificate: {error}"))?;
        Ok(Self {
            probe_client,
            ca,
            secure: Mutex::new(None),
        })
    }

    /// Pinned-TLS transport for everything beyond discovery probes. Dials the
    /// box by its uniqueId — which is the certificate's CN — and routes that
    /// name to the discovered IP, so both the chain (against the bundled
    /// Philips CA only) and the hostname are fully validated. The leaf cert
    /// carries a CN but no SAN, which native-tls accepts and rustls would
    /// reject, so this must stay on reqwest's native-tls backend.
    fn secure_client(
        &self,
        unique_id: &str,
        ip_address: &str,
        port: u16,
    ) -> Result<Client, String> {
        let hostname = sync_box_hostname(unique_id)?;
        if port == 0 {
            return Err("Invalid Sync Box HTTPS port 0.".to_string());
        }
        // The URL parser lowercases hostnames before reqwest's DNS override
        // lookup, so the override must be registered lowercase too.
        let target = SecureTarget {
            unique_id: hostname,
            ip_address: ip_address.to_string(),
            port,
        };
        let mut cache = self
            .secure
            .lock()
            .map_err(|_| "Sync Box client state is unavailable.".to_string())?;
        if let Some((cached, client)) = cache.as_ref() {
            if *cached == target {
                return Ok(client.clone());
            }
        }
        let ip: IpAddr = ip_address
            .parse()
            .map_err(|error| format!("Invalid Sync Box IP address {ip_address}: {error}"))?;
        let client = Client::builder()
            .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .tls_built_in_root_certs(false)
            .add_root_certificate(self.ca.clone())
            .resolve(&target.unique_id, SocketAddr::new(ip, port))
            .build()
            .map_err(|error| format!("Failed to create pinned Sync Box HTTP client: {error}"))?;
        *cache = Some((target, client.clone()));
        Ok(client)
    }

    pub async fn discover(&self) -> Result<Vec<DiscoveredSyncBox>, String> {
        let mdns = ServiceDaemon::new()
            .map_err(|error| format!("Failed to start Sync Box discovery: {error}"))?;
        let receiver = mdns
            .browse("_huesync._tcp.local.")
            .map_err(|error| format!("Failed to browse for Sync Boxes: {error}"))?;

        let started = Instant::now();
        let mut services = Vec::new();
        let mut seen = HashSet::new();

        while started.elapsed() < Duration::from_secs(DISCOVERY_TIMEOUT_SECS) {
            if let Ok(ServiceEvent::ServiceResolved(info)) =
                receiver.recv_timeout(Duration::from_millis(100))
            {
                let mut addresses: Vec<_> = info
                    .get_addresses()
                    .iter()
                    .filter(|address| address.is_ipv4())
                    .collect();
                addresses.sort_by_key(|address| address.to_string());

                if let Some(address) = addresses.first() {
                    let ip_address = address.to_string();
                    if seen.insert(ip_address.clone()) {
                        services.push(MdnsSyncBox {
                            ip_address,
                            port: info.get_port(),
                        });
                    }
                }
            }
        }

        let _ = mdns.stop_browse("_huesync._tcp.local.");

        let mut discovered = Vec::new();
        for service in services {
            let Ok(device) = self.get_device(&service.ip_address, service.port).await else {
                continue;
            };
            discovered.push(DiscoveredSyncBox {
                name: device.name,
                device_type: device.device_type,
                unique_id: device.unique_id,
                ip_address: service.ip_address,
                port: service.port,
                api_level: device.api_level,
                firmware_version: device.firmware_version,
                supported: device.api_level >= MIN_API_LEVEL,
            });
        }

        discovered.sort_by(|left, right| left.name.cmp(&right.name));
        Ok(discovered)
    }

    pub async fn register(
        &self,
        ip_address: &str,
        port: u16,
    ) -> Result<(StoredSyncBoxInfo, String), String> {
        // The insecure probe only supplies the uniqueId needed to build the
        // pinned client. Everything after it — including re-reading the device
        // info that gets stored — happens over pinned TLS, so a spoofed probe
        // response can only make pairing fail, never leak the access token.
        let probed = self.get_device(ip_address, port).await?;
        let client = self.secure_client(&probed.unique_id, ip_address, port)?;
        let device = get_device_secure(&client, &probed.unique_id, port).await?;
        ensure_supported(&device)?;

        let url = secure_endpoint(&device.unique_id, port, "/api/v1/registrations")?;
        let response = client
            .post(&url)
            .json(&json!({
                "appName": "Hue Desktop",
                "instanceName": "Desktop",
            }))
            .send()
            .await
            .map_err(|error| format!("Failed to reach the Sync Box: {error}"))?;
        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|error| format!("Sync Box returned an unreadable response: {error}"))?;
        let value: Value = serde_json::from_str(&body)
            .map_err(|error| format!("Invalid Sync Box registration response: {error}"))?;

        if value.get("code").and_then(Value::as_u64) == Some(16) {
            return Err(
                "Sync Box button authorization is still required. Hold the button for three seconds until the LED blinks green, then release it."
                    .to_string(),
            );
        }

        if !status.is_success() {
            let message = value
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("Registration failed");
            return Err(format!("Sync Box registration failed: {message}"));
        }

        let access_token = value
            .get("accessToken")
            .and_then(Value::as_str)
            .filter(|token| !token.is_empty())
            .ok_or_else(|| "Sync Box registration did not return an access token.".to_string())?
            .to_string();

        Ok((
            StoredSyncBoxInfo {
                name: device.name,
                device_type: device.device_type,
                unique_id: device.unique_id,
                ip_address: ip_address.to_string(),
                port,
                api_level: device.api_level,
                firmware_version: device.firmware_version,
            },
            access_token,
        ))
    }

    pub async fn save_session<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        sync_box: &StoredSyncBoxInfo,
        access_token: &str,
    ) -> Result<SyncBoxSession, String> {
        save_access_token(access_token)?;
        if let Err(error) = save_sync_box_info(app, sync_box) {
            let _ = clear_access_token();
            return Err(error);
        }

        Ok(SyncBoxSession {
            configured: true,
            connected: true,
            sync_box: Some(sync_box.clone()),
            error: None,
        })
    }

    pub async fn restore_session<R: Runtime>(
        &self,
        app: &AppHandle<R>,
    ) -> Result<SyncBoxSession, String> {
        let Some(sync_box) = load_sync_box_info(app)? else {
            return Ok(empty_session());
        };
        let Some(access_token) = load_access_token()? else {
            return Ok(SyncBoxSession {
                configured: true,
                connected: false,
                sync_box: Some(sync_box),
                error: Some(
                    "The saved Sync Box access token is missing. Pair the Sync Box again."
                        .to_string(),
                ),
            });
        };

        match self.get_state(&sync_box, &access_token).await {
            Ok(_) => Ok(SyncBoxSession {
                configured: true,
                connected: true,
                sync_box: Some(sync_box),
                error: None,
            }),
            Err(error) => Ok(SyncBoxSession {
                configured: true,
                connected: false,
                sync_box: Some(sync_box),
                error: Some(error),
            }),
        }
    }

    pub fn clear_session<R: Runtime>(&self, app: &AppHandle<R>) -> Result<(), String> {
        clear_sync_box_info(app)?;
        clear_access_token()
    }

    /// Unauthenticated discovery probe by IP. The response is untrusted; the
    /// pinned client re-reads anything that gets persisted or acted on.
    async fn get_device(&self, ip_address: &str, port: u16) -> Result<SyncBoxDevice, String> {
        let url = endpoint(ip_address, port, "/api/v1/device");
        let response = self
            .probe_client
            .get(&url)
            .send()
            .await
            .map_err(|error| format!("Failed to reach Sync Box at {ip_address}: {error}"))?;
        let status = response.status();
        if !status.is_success() {
            return Err(format!(
                "Sync Box device request failed with HTTP status {status}."
            ));
        }
        response
            .json::<SyncBoxDevice>()
            .await
            .map_err(|error| format!("Invalid Sync Box device response: {error}"))
    }

    pub async fn get_saved_state<R: Runtime>(
        &self,
        app: &AppHandle<R>,
    ) -> Result<SyncBoxState, String> {
        let sync_box =
            load_sync_box_info(app)?.ok_or_else(|| "No Sync Box is configured.".to_string())?;
        let access_token = load_access_token()?.ok_or_else(|| {
            "The saved Sync Box access token is missing. Pair it again.".to_string()
        })?;
        self.get_state(&sync_box, &access_token).await
    }

    pub async fn update_saved_execution<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        update: Value,
    ) -> Result<SyncBoxState, String> {
        let sync_box =
            load_sync_box_info(app)?.ok_or_else(|| "No Sync Box is configured.".to_string())?;
        let access_token = load_access_token()?.ok_or_else(|| {
            "The saved Sync Box access token is missing. Pair it again.".to_string()
        })?;
        let object = update
            .as_object()
            .filter(|object| !object.is_empty())
            .ok_or_else(|| "Execution update must be a non-empty JSON object.".to_string())?;
        let client =
            self.secure_client(&sync_box.unique_id, &sync_box.ip_address, sync_box.port)?;
        let url = secure_endpoint(&sync_box.unique_id, sync_box.port, "/api/v1/execution")?;
        let response = client
            .put(url)
            .bearer_auth(&access_token)
            .json(object)
            .send()
            .await
            .map_err(|error| format!("Unable to update the Sync Box: {error}"))?;

        if !response.status().is_success() {
            return Err(sync_box_response_error(response, "Sync Box execution update").await);
        }

        self.get_state(&sync_box, &access_token).await
    }

    pub async fn update_saved_source_mode<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        source: &str,
        mode: &str,
    ) -> Result<SyncBoxState, String> {
        if !matches!(source, "input1" | "input2" | "input3" | "input4") {
            return Err("Invalid Sync Box HDMI source.".to_string());
        }
        if !matches!(mode, "video" | "game" | "music") {
            return Err("Invalid Sync Box mode.".to_string());
        }

        let sync_box =
            load_sync_box_info(app)?.ok_or_else(|| "No Sync Box is configured.".to_string())?;
        let access_token = load_access_token()?.ok_or_else(|| {
            "The saved Sync Box access token is missing. Pair it again.".to_string()
        })?;
        let client =
            self.secure_client(&sync_box.unique_id, &sync_box.ip_address, sync_box.port)?;
        let path = format!("/api/v1/hdmi/{source}");
        let url = secure_endpoint(&sync_box.unique_id, sync_box.port, &path)?;
        let response = client
            .put(url)
            .bearer_auth(&access_token)
            .json(&json!({ "lastSyncMode": mode }))
            .send()
            .await
            .map_err(|error| format!("Unable to update the Sync Box source mode: {error}"))?;

        if !response.status().is_success() {
            return Err(sync_box_response_error(response, "Sync Box source mode update").await);
        }

        self.get_state(&sync_box, &access_token).await
    }

    async fn get_state(
        &self,
        sync_box: &StoredSyncBoxInfo,
        access_token: &str,
    ) -> Result<SyncBoxState, String> {
        let client =
            self.secure_client(&sync_box.unique_id, &sync_box.ip_address, sync_box.port)?;
        let url = secure_endpoint(&sync_box.unique_id, sync_box.port, "/api/v1")?;
        let response = client
            .get(&url)
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|error| format!("Unable to reach the saved Sync Box: {error}"))?;

        if !response.status().is_success() {
            return Err(sync_box_response_error(response, "Sync Box state request").await);
        }
        response
            .json::<SyncBoxState>()
            .await
            .map_err(|error| format!("Invalid Sync Box state response: {error}"))
    }
}

async fn get_device_secure(
    client: &Client,
    unique_id: &str,
    port: u16,
) -> Result<SyncBoxDevice, String> {
    let url = secure_endpoint(unique_id, port, "/api/v1/device")?;
    let response = client.get(url).send().await.map_err(|error| {
        format!("Unable to establish a secure connection to the Sync Box: {error}")
    })?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!(
            "Secure Sync Box device request failed with HTTP status {status}."
        ));
    }
    let device = response
        .json::<SyncBoxDevice>()
        .await
        .map_err(|error| format!("Invalid secure Sync Box device response: {error}"))?;
    if !device.unique_id.eq_ignore_ascii_case(unique_id) {
        return Err(format!(
            "Sync Box identity mismatch: expected {unique_id}, received {}.",
            device.unique_id
        ));
    }
    Ok(device)
}

async fn sync_box_response_error(response: reqwest::Response, context: &str) -> String {
    let status = response.status();
    if status.as_u16() == 401 {
        return "The Sync Box rejected the saved access token. Pair it again.".to_string();
    }
    let body = response.text().await.unwrap_or_default();
    if let Ok(value) = serde_json::from_str::<Value>(&body) {
        let code = value.get("code").and_then(Value::as_u64);
        let message = value.get("message").and_then(Value::as_str);
        if code == Some(16) {
            return "The Sync Box cannot apply that setting in its current state. Check its Hue Bridge connection and active HDMI source.".to_string();
        }
        if let Some(message) = message {
            return format!("{context} failed: {message}");
        }
    }
    format!("{context} failed with HTTP status {status}.")
}

fn ensure_supported(device: &SyncBoxDevice) -> Result<(), String> {
    if device.api_level >= MIN_API_LEVEL {
        return Ok(());
    }
    Err(format!(
        "{} uses Sync Box API level {}. Update its firmware in the official Hue Sync app before connecting.",
        device.name, device.api_level
    ))
}

fn endpoint(ip_address: &str, port: u16, path: &str) -> String {
    let host = if ip_address.contains(':') && !ip_address.starts_with('[') {
        format!("[{ip_address}]")
    } else {
        ip_address.to_string()
    };
    if port == default_https_port() {
        format!("https://{host}{path}")
    } else {
        format!("https://{host}:{port}{path}")
    }
}

fn secure_endpoint(unique_id: &str, port: u16, path: &str) -> Result<String, String> {
    let hostname = sync_box_hostname(unique_id)?;
    if port == 0 {
        return Err("Invalid Sync Box HTTPS port 0.".to_string());
    }
    if !path.starts_with('/') {
        return Err("Sync Box API path must start with '/'.".to_string());
    }
    if port == default_https_port() {
        Ok(format!("https://{hostname}{path}"))
    } else {
        Ok(format!("https://{hostname}:{port}{path}"))
    }
}

fn sync_box_hostname(unique_id: &str) -> Result<String, String> {
    if unique_id.len() != 12 || !unique_id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(format!(
            "Invalid Sync Box unique ID '{unique_id}'; expected 12 hexadecimal characters."
        ));
    }
    Ok(unique_id.to_ascii_lowercase())
}

const fn default_https_port() -> u16 {
    443
}

fn empty_session() -> SyncBoxSession {
    SyncBoxSession {
        configured: false,
        connected: false,
        sync_box: None,
        error: None,
    }
}

fn save_sync_box_info<R: Runtime>(
    app: &AppHandle<R>,
    sync_box: &StoredSyncBoxInfo,
) -> Result<(), String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|error| format!("Failed to open Sync Box store: {error}"))?;
    store.set(
        STORE_KEY,
        serde_json::to_value(sync_box)
            .map_err(|error| format!("Invalid Sync Box store data: {error}"))?,
    );
    store
        .save()
        .map_err(|error| format!("Failed to save Sync Box details: {error}"))
}

fn load_sync_box_info<R: Runtime>(app: &AppHandle<R>) -> Result<Option<StoredSyncBoxInfo>, String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|error| format!("Failed to open Sync Box store: {error}"))?;
    let Some(value) = store.get(STORE_KEY) else {
        return Ok(None);
    };
    if value.is_null() {
        return Ok(None);
    }
    serde_json::from_value(value.clone())
        .map(Some)
        .map_err(|error| format!("Failed to read Sync Box details: {error}"))
}

fn clear_sync_box_info<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|error| format!("Failed to open Sync Box store: {error}"))?;
    store.delete(STORE_KEY);
    store
        .save()
        .map_err(|error| format!("Failed to clear Sync Box details: {error}"))
}

fn token_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|error| format!("Failed to access secure keyring: {error}"))
}

fn save_access_token(access_token: &str) -> Result<(), String> {
    token_entry()?
        .set_password(access_token)
        .map_err(|error| format!("Failed to save Sync Box access token: {error}"))
}

fn load_access_token() -> Result<Option<String>, String> {
    match token_entry()?.get_password() {
        Ok(access_token) => Ok(Some(access_token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("Failed to read Sync Box access token: {error}")),
    }
}

fn clear_access_token() -> Result<(), String> {
    match token_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("Failed to clear Sync Box access token: {error}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secure_endpoint_uses_normalized_certificate_hostname() {
        assert_eq!(
            secure_endpoint("C429960B4B6C", 443, "/api/v1").unwrap(),
            "https://c429960b4b6c/api/v1"
        );
        assert_eq!(
            secure_endpoint("c429960b4b6c", 8443, "/api/v1/device").unwrap(),
            "https://c429960b4b6c:8443/api/v1/device"
        );
    }

    #[test]
    fn secure_endpoint_rejects_untrusted_hostname_input() {
        assert!(secure_endpoint("not-a-device", 443, "/api/v1").is_err());
        assert!(secure_endpoint("C429960B4B6C.example", 443, "/api/v1").is_err());
        assert!(secure_endpoint("C429960B4B6C", 0, "/api/v1").is_err());
        assert!(secure_endpoint("C429960B4B6C", 443, "api/v1").is_err());
    }

    #[test]
    fn bundled_ca_builds_a_pinned_client() {
        let client = SyncBoxClient::new().unwrap();
        client
            .secure_client("C429960B4B6C", "192.168.1.12", 443)
            .unwrap();

        let cache = client.secure.lock().unwrap();
        let (target, _) = cache.as_ref().unwrap();
        assert_eq!(target.unique_id, "c429960b4b6c");
        assert_eq!(target.ip_address, "192.168.1.12");
        assert_eq!(target.port, 443);
    }
}
