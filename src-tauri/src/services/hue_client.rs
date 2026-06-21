use keyring::Entry;
use mdns_sd::{ServiceDaemon, ServiceEvent};
use reqwest::Client;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_store::StoreExt;
use tokio::sync::Semaphore;

const DISCOVERY_URL: &str = "https://discovery.meethue.com/";
const STORE_FILE: &str = "hue-store.json";
const STORE_KEY: &str = "bridge";
const KEYRING_SERVICE: &str = "com.anton.hue-app";
const KEYRING_ACCOUNT: &str = "hue-application-key";
const DEVICE_TYPE: &str = "hue-app#desktop";
const REQUEST_TIMEOUT_SECS: u64 = 8;

/// The local Hue Bridge tolerates only a handful of simultaneous connections;
/// fanning out every resource fetch at once makes it reset or return empty
/// bodies. Cap the in-flight v2 requests so bursts stay within its budget.
const MAX_CONCURRENT_BRIDGE_REQUESTS: usize = 3;
/// Total attempts for an idempotent GET before surfacing the failure.
const MAX_REQUEST_ATTEMPTS: u32 = 3;
/// Base backoff between retries; multiplied by the attempt index.
const RETRY_BACKOFF: Duration = Duration::from_millis(250);
const ACCESSORY_SERVICE_TYPES: &[&str] = &[
    "button",
    "relative_rotary",
    "motion",
    "camera_motion",
    "temperature",
    "light_level",
    "contact",
    "tamper",
    "device_power",
];

/// Process-wide limiter shared across every `HueClient` (each Tauri command
/// builds its own client) so concurrency is bounded globally, not per call.
fn bridge_semaphore() -> &'static Semaphore {
    static SEM: OnceLock<Semaphore> = OnceLock::new();
    SEM.get_or_init(|| Semaphore::new(MAX_CONCURRENT_BRIDGE_REQUESTS))
}

/// Builds (once) and returns a clone of a shared `reqwest::Client` stored in the
/// caller's `OnceLock`. All bridge clients accept the bridge's self-signed cert;
/// `configure` layers on per-variant options (e.g. a request timeout).
fn shared_client(
    cell: &'static OnceLock<Client>,
    configure: impl FnOnce(reqwest::ClientBuilder) -> reqwest::ClientBuilder,
) -> Result<Client, reqwest::Error> {
    if let Some(client) = cell.get() {
        return Ok(client.clone());
    }
    let client = configure(Client::builder().danger_accept_invalid_certs(true)).build()?;
    // A racing thread may have set it first; either way the stored client wins.
    let _ = cell.set(client);
    Ok(cell.get().expect("client just set").clone())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredBridge {
    pub bridge_id: String,
    pub bridge_ip: String,
    /// Hardware model reported by the bridge's public config (e.g. "BSB002"
    /// for the white square v2, a newer id for the Hue Bridge Pro). `None`
    /// when the bridge could not be reached for its config.
    #[serde(default)]
    pub model_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HueSession {
    pub configured: bool,
    pub connected: bool,
    pub bridge_id: Option<String>,
    pub bridge_ip: Option<String>,
    pub application_key: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredBridgeInfo {
    pub bridge_id: String,
    pub bridge_ip: String,
    #[serde(default)]
    pub application_key: Option<String>,
}

// ---------------------------------------------------------------------------
// Public payloads returned to the frontend (Hue API v2 shapes, camelCased).
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HueLight {
    /// v2 resource UUID.
    pub id: String,
    /// Owning v2 device UUID.
    pub device_id: Option<String>,
    pub name: String,
    pub is_on: bool,
    /// Dimming percentage, 0–100.
    pub brightness: Option<f64>,
    pub reachable: bool,
    /// "ct" when a valid mired is set, otherwise "xy" for color fixtures.
    pub color_mode: Option<String>,
    pub xy: Option<[f64; 2]>,
    /// Color temperature in mireds.
    pub ct: Option<u16>,
    /// Active dynamic effect identifier (e.g. "no_effect", "candle").
    pub effect: Option<String>,
    /// Effect identifiers this fixture supports.
    pub effects: Vec<String>,
    /// Active modern effect identifier from `effects_v2`, when available.
    pub effect_v2: Option<String>,
    /// Modern effect identifiers this fixture supports.
    pub effects_v2: Vec<String>,
    pub supports_color: bool,
    pub supports_ct: bool,
    pub ct_min: Option<u16>,
    pub ct_max: Option<u16>,
    pub gamut: Option<[[f64; 2]; 3]>,
    pub model_id: Option<String>,
    pub product_name: Option<String>,
    pub type_name: Option<String>,
    pub sw_version: Option<String>,
    pub unique_id: Option<String>,
    /// Light function: one of `functional`, `decorative`, `mixed`, `unknown`.
    pub function: Option<String>,
}

/// A non-light accessory (switch/remote or sensor) belonging to a room. Rooms
/// group whole `device` resources, so accessories ride along with their lights;
/// zones group only `light` services and therefore never carry accessories.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HueAccessory {
    /// v2 device UUID.
    pub id: String,
    pub name: String,
    /// "switch" (button/dial) or "sensor" (motion/temperature/etc.).
    pub kind: String,
    pub product_name: Option<String>,
    pub reachable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HueRoom {
    /// v2 room UUID.
    pub id: String,
    pub name: String,
    /// v2 archetype (e.g. "living_room").
    pub class: String,
    pub resource_type: String,
    pub any_on: bool,
    pub all_on: bool,
    pub brightness: Option<f64>,
    pub light_count: usize,
    pub light_ids: Vec<String>,
    /// Device children in this room. Rooms manage device membership.
    pub device_ids: Vec<String>,
    /// The grouped_light resource that controls this room's on/brightness.
    pub grouped_light_id: Option<String>,
    /// Switches and sensors placed in this room.
    pub accessories: Vec<HueAccessory>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HueZone {
    /// v2 zone UUID.
    pub id: String,
    pub name: String,
    /// v2 archetype, when supplied by the bridge.
    pub class: String,
    pub resource_type: String,
    pub any_on: bool,
    pub all_on: bool,
    pub brightness: Option<f64>,
    pub light_count: usize,
    pub light_ids: Vec<String>,
    /// Always empty for zones; present so rooms and zones share a frontend shape.
    pub device_ids: Vec<String>,
    /// The grouped_light resource that controls this zone's on/brightness.
    pub grouped_light_id: Option<String>,
    /// Always empty for zones (zones group lights, not whole devices); present
    /// so rooms and zones share a single frontend shape.
    pub accessories: Vec<HueAccessory>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HueScene {
    pub id: String,
    pub name: String,
    /// `scene` or `smart_scene`.
    pub resource_type: String,
    /// The room/zone UUID this scene targets.
    pub group: Option<String>,
    pub scene_type: Option<String>,
    pub status: Option<String>,
    pub dynamic: bool,
    pub speed: Option<f64>,
    pub auto_dynamic: bool,
    pub smart: bool,
    /// Preset color palette from the scene's per-light actions. Each entry
    /// carries either an `xy` chromaticity or a `mirek` color temperature.
    pub colors: Vec<SceneColor>,
    /// Per-light scene targets used by the UI for immediate optimistic recall.
    pub actions: Vec<SceneLightAction>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HueSettingsSummary {
    pub bridge: HueSettingsBridge,
    pub devices: Vec<HueSettingsDevice>,
    pub accessory_services: Vec<HueAccessoryService>,
    pub switch_input_configurations: Vec<HueSwitchInputConfiguration>,
    pub device_discovery_supported: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HueSettingsBridge {
    pub bridge_id: String,
    pub bridge_ip: String,
    pub product_name: Option<String>,
    pub model_id: Option<String>,
    pub sw_version: Option<String>,
    pub application_key_saved: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HueSettingsDevice {
    pub id: String,
    pub name: String,
    pub product_name: Option<String>,
    pub model_id: Option<String>,
    pub product_archetype: Option<String>,
    pub sw_version: Option<String>,
    pub reachable: bool,
    pub unique_id: Option<String>,
    pub service_types: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HueAccessoryService {
    pub id: String,
    pub resource_type: String,
    pub device_id: Option<String>,
    pub device_name: Option<String>,
    pub product_name: Option<String>,
    pub reachable: bool,
    pub enabled: Option<bool>,
    pub value: Option<String>,
    pub updated: Option<String>,
    pub raw: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HueSwitchInputConfiguration {
    pub id: String,
    pub device_id: Option<String>,
    pub device_name: Option<String>,
    pub mode: Option<String>,
    pub raw: Value,
}

/// One color from a scene action — exactly one of `xy`/`mirek` is set.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneColor {
    pub xy: Option<[f64; 2]>,
    pub mirek: Option<u16>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HueSceneRecipeColor {
    #[serde(default)]
    pub xy: Option<[f64; 2]>,
    #[serde(default)]
    pub mirek: Option<u16>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneLightAction {
    pub target_id: String,
    pub on: Option<bool>,
    pub brightness: Option<f64>,
    pub xy: Option<[f64; 2]>,
    pub mirek: Option<u16>,
    pub effect: Option<String>,
    pub effect_v2: Option<String>,
}

/// A single resource change pushed to the frontend from the event stream.
/// `brightness` is the dimming percentage (0–100).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HueEventUpdate {
    /// SSE container kind: `update`, `add`, `delete`, or `error`.
    pub event_type: Option<String>,
    #[serde(rename = "type")]
    pub rtype: String,
    pub id: Option<String>,
    pub on: Option<bool>,
    pub brightness: Option<f64>,
    /// Live CIE xy chromaticity, when the change includes a color.
    pub xy: Option<[f64; 2]>,
    /// Live color temperature in mireds, when the change includes one.
    pub mirek: Option<u16>,
    /// Active live color mode, derived from `mirek_valid` when present.
    pub color_mode: Option<String>,
    /// Active legacy effect identifier when the event carries one.
    pub effect: Option<String>,
    /// Active `effects_v2` identifier when the event carries one.
    pub effect_v2: Option<String>,
    /// Dynamic-palette speed (0–1), when a scene or live dynamics update carries it.
    pub speed: Option<f64>,
    /// Whether a dynamic scene auto-starts when recalled as active.
    pub auto_dynamic: Option<bool>,
    /// Compact display value for accessory/sensor events.
    pub value: Option<String>,
}

// ---------------------------------------------------------------------------
// Hue API v2 envelope + resource structs.
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct HueApiResponse<T> {
    #[serde(default = "Vec::new")]
    errors: Vec<HueApiError>,
    #[serde(default = "Vec::new")]
    data: Vec<T>,
}

#[derive(Debug, Deserialize)]
struct HueApiError {
    description: String,
}

#[derive(Debug, Clone, Deserialize)]
struct HueResourceRef {
    rid: String,
    rtype: String,
}

#[derive(Debug, Deserialize)]
struct HueMetadata {
    #[serde(default)]
    name: String,
    #[serde(default)]
    archetype: Option<String>,
    /// Light function: one of `functional`, `decorative`, `mixed`, `unknown`.
    #[serde(default)]
    function: Option<String>,
}

#[derive(Debug, Deserialize)]
struct HueOn {
    on: bool,
}

#[derive(Debug, Deserialize)]
struct HueDimming {
    brightness: f64,
}

#[derive(Debug, Deserialize)]
struct HueXy {
    x: f64,
    y: f64,
}

#[derive(Debug, Deserialize)]
struct HueGamut {
    red: HueXy,
    green: HueXy,
    blue: HueXy,
}

#[derive(Debug, Deserialize)]
struct HueColor {
    xy: HueXy,
    #[serde(default)]
    gamut: Option<HueGamut>,
}

#[derive(Debug, Deserialize)]
struct HueMirekSchema {
    mirek_minimum: u16,
    mirek_maximum: u16,
}

#[derive(Debug, Deserialize)]
struct HueColorTemperature {
    #[serde(default)]
    mirek: Option<u16>,
    #[serde(default)]
    mirek_valid: bool,
    #[serde(default)]
    mirek_schema: Option<HueMirekSchema>,
}

#[derive(Debug, Deserialize)]
struct HueEffectsFeature {
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    effect_values: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct HueEffectsV2Feature {
    #[serde(default)]
    status: Option<Value>,
    #[serde(default)]
    action: Option<Value>,
    #[serde(default)]
    effect_values: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct HueLightResource {
    id: String,
    owner: HueResourceRef,
    metadata: HueMetadata,
    on: HueOn,
    #[serde(default)]
    dimming: Option<HueDimming>,
    #[serde(default)]
    color: Option<HueColor>,
    #[serde(default)]
    color_temperature: Option<HueColorTemperature>,
    #[serde(default)]
    effects: Option<HueEffectsFeature>,
    #[serde(default)]
    effects_v2: Option<HueEffectsV2Feature>,
}

#[derive(Debug, Deserialize)]
struct HueProductData {
    #[serde(default)]
    model_id: Option<String>,
    #[serde(default)]
    product_name: Option<String>,
    #[serde(default)]
    product_archetype: Option<String>,
    #[serde(default)]
    software_version: Option<String>,
}

#[derive(Debug, Deserialize)]
struct HueDeviceResource {
    id: String,
    #[serde(default)]
    metadata: Option<HueMetadata>,
    #[serde(default)]
    product_data: Option<HueProductData>,
    #[serde(default)]
    services: Vec<HueResourceRef>,
}

#[derive(Debug, Deserialize)]
struct HueRawResource {
    id: String,
    #[serde(rename = "type", default)]
    rtype: Option<String>,
    #[serde(default)]
    owner: Option<HueResourceRef>,
    #[serde(default)]
    metadata: Option<HueMetadata>,
    #[serde(default)]
    enabled: Option<bool>,
    #[serde(flatten)]
    extra: Map<String, Value>,
}

#[derive(Debug, Deserialize)]
struct HueZigbeeConnectivityResource {
    owner: HueResourceRef,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    mac_address: Option<String>,
}

#[derive(Debug, Deserialize)]
struct HueRoomZoneResource {
    id: String,
    metadata: HueMetadata,
    #[serde(default)]
    children: Vec<HueResourceRef>,
    #[serde(default)]
    services: Vec<HueResourceRef>,
}

#[derive(Debug, Deserialize)]
struct HueGroupedLightResource {
    id: String,
    on: HueOn,
    #[serde(default)]
    dimming: Option<HueDimming>,
}

#[derive(Debug, Deserialize)]
struct HueBridgeResource {
    #[serde(default)]
    bridge_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct HueDeviceDiscoveryResource {
    id: String,
}

#[derive(Debug)]
pub struct HueQrInstallCode {
    pub mac_address: String,
    pub install_code: String,
}

#[derive(Debug, Deserialize)]
struct HueSceneResource {
    id: String,
    #[serde(rename = "type", default)]
    rtype: Option<String>,
    metadata: HueMetadata,
    #[serde(default)]
    group: Option<HueResourceRef>,
    #[serde(default)]
    actions: Vec<HueSceneActionEntry>,
    #[serde(flatten)]
    extra: Map<String, Value>,
}

#[derive(Debug, Deserialize)]
struct HueSceneActionEntry {
    #[serde(default)]
    target: Option<HueResourceRef>,
    #[serde(default)]
    action: Option<HueSceneAction>,
}

#[derive(Debug, Deserialize)]
struct HueSceneAction {
    #[serde(default)]
    on: Option<HueOn>,
    #[serde(default)]
    dimming: Option<HueDimming>,
    #[serde(default)]
    color: Option<HueColor>,
    #[serde(default)]
    color_temperature: Option<HueColorTemperature>,
    #[serde(default)]
    effects: Option<Value>,
    #[serde(default)]
    effects_v2: Option<Value>,
}

// ---------------------------------------------------------------------------
// Event stream parsing structs.
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct EventContainer {
    #[serde(rename = "type", default)]
    event_type: Option<String>,
    #[serde(default)]
    data: Vec<Value>,
}

// ---------------------------------------------------------------------------
// Pairing (CLIP link-button) response structs — the only non-v2/resource call.
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct DiscoveryBridgeResponse {
    id: String,
    internalipaddress: String,
}

/// Unauthenticated public config served at `/api/0/config`. Exposes just
/// enough to tell bridge models apart before pairing.
#[derive(Debug, Deserialize)]
struct PublicBridgeConfig {
    #[serde(default)]
    modelid: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PairErrorResponse {
    error: PairErrorDetail,
}

#[derive(Debug, Deserialize)]
struct PairErrorDetail {
    #[serde(rename = "type")]
    error_type: u32,
    description: String,
}

#[derive(Debug, Deserialize)]
struct PairSuccessResponse {
    success: PairUsername,
}

#[derive(Debug, Deserialize)]
struct PairUsername {
    username: String,
}

pub struct HueClient {
    client: Client,
}

impl HueClient {
    /// Standard client for v2 calls: a request timeout plus acceptance of the
    /// bridge's self-signed certificate (v2 is HTTPS-only on the local bridge).
    ///
    /// The underlying `reqwest::Client` owns a connection pool and TLS config, so
    /// it is built once and shared process-wide. Rebuilding it per command (this
    /// runs on every slider tick / toggle) added needless latency and dropped
    /// keep-alive connections. `Client` clones are cheap (internally an `Arc`).
    pub fn new() -> Result<Self, String> {
        static CLIENT: OnceLock<Client> = OnceLock::new();
        let client = shared_client(&CLIENT, |builder| {
            builder.timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        })
        .map_err(|error| format!("Failed to create HTTP client: {error}"))?;
        Ok(Self { client })
    }

    /// Client tuned for the long-lived event stream: no request timeout so the
    /// connection can stay open indefinitely.
    pub fn new_streaming() -> Result<Self, String> {
        static CLIENT: OnceLock<Client> = OnceLock::new();
        let client = shared_client(&CLIENT, |builder| builder)
            .map_err(|error| format!("Failed to create streaming HTTP client: {error}"))?;
        Ok(Self { client })
    }

    // ---- Generic v2 resource helpers ----------------------------------------

    async fn get_v2<T: DeserializeOwned>(
        &self,
        ip: &str,
        application_key: &str,
        resource: &str,
    ) -> Result<Vec<T>, String> {
        let url = format!("https://{ip}/clip/v2/resource/{resource}");
        let text = self.fetch_text(&url, application_key, resource).await?;

        let response = serde_json::from_str::<HueApiResponse<T>>(&text)
            .map_err(|error| format!("Invalid {resource} response: {error}"))?;
        if let Some(error) = response.errors.first() {
            return Err(format!("Hue bridge error: {}", error.description));
        }
        Ok(response.data)
    }

    /// Performs a throttled GET against the bridge, retrying the transient
    /// failures it produces under concurrent load — an empty body, HTTP 429,
    /// 5xx, or a dropped connection — with a short backoff. A non-retriable
    /// status (e.g. 403) returns immediately. The returned body is guaranteed
    /// non-empty, so callers no longer see a bare JSON "expected value at line
    /// 1 column 1" when the bridge hands back nothing.
    async fn fetch_text(
        &self,
        url: &str,
        application_key: &str,
        resource: &str,
    ) -> Result<String, String> {
        let mut last_error = format!("Failed to fetch {resource}");
        for attempt in 0..MAX_REQUEST_ATTEMPTS {
            if attempt > 0 {
                tokio::time::sleep(RETRY_BACKOFF * attempt).await;
            }

            // Hold a concurrency permit only for the duration of the request,
            // so retries wait (above) without occupying the budget.
            let _permit = bridge_semaphore().acquire().await.ok();
            let retriable = match self
                .client
                .get(url)
                .header("hue-application-key", application_key)
                .send()
                .await
            {
                Ok(response) => {
                    let status = response.status();
                    match response.text().await {
                        Ok(text) if status.is_success() && !text.trim().is_empty() => {
                            return Ok(text);
                        }
                        Ok(text) if text.trim().is_empty() => {
                            last_error = format!(
                                "Failed to fetch {resource}: bridge returned an empty response (HTTP {status})"
                            );
                            // Empty body is the hallmark of the bridge dropping
                            // a request under load — always worth a retry.
                            true
                        }
                        Ok(_) => {
                            // Non-success with a body: surface it as-is.
                            last_error = format!(
                                "Failed to fetch {resource}: bridge returned HTTP {status}"
                            );
                            status.as_u16() == 429 || status.is_server_error()
                        }
                        Err(error) => {
                            last_error = format!("Failed to read {resource} response: {error}");
                            true
                        }
                    }
                }
                Err(error) => {
                    last_error = format!("Failed to fetch {resource}: {error}");
                    true
                }
            };

            if !retriable {
                break;
            }
        }
        Err(last_error)
    }

    async fn put_v2(
        &self,
        ip: &str,
        application_key: &str,
        resource: &str,
        id: &str,
        body: Value,
    ) -> Result<(), String> {
        let url = format!("https://{ip}/clip/v2/resource/{resource}/{id}");
        let permit = bridge_semaphore().acquire().await.ok();
        let response = self
            .client
            .put(&url)
            .header("hue-application-key", application_key)
            .json(&body)
            .send()
            .await
            .map_err(|error| format!("Failed to update {resource}: {error}"))?;
        let status = response.status();
        let text = response
            .text()
            .await
            .map_err(|error| format!("Failed to read {resource} update response: {error}"))?;
        drop(permit);

        let parsed = serde_json::from_str::<HueApiResponse<Value>>(&text).ok();

        // Only a non-2xx status is a real failure. A 207 (multi-status) carries
        // per-light errors — e.g. one unreachable bulb in a room — while the
        // reachable lights still updated; treating that as a hard error made the
        // UI refetch and revert the whole tile even though the change applied.
        if !status.is_success() {
            let detail = parsed
                .as_ref()
                .and_then(|response| response.errors.first())
                .map(|error| error.description.clone())
                .unwrap_or_else(|| format!("HTTP {status}"));
            return Err(format!("Hue bridge error: {detail}"));
        }
        Ok(())
    }

    async fn delete_v2(
        &self,
        ip: &str,
        application_key: &str,
        resource: &str,
        id: &str,
    ) -> Result<(), String> {
        let url = format!("https://{ip}/clip/v2/resource/{resource}/{id}");
        let permit = bridge_semaphore().acquire().await.ok();
        let text = self
            .client
            .delete(&url)
            .header("hue-application-key", application_key)
            .send()
            .await
            .map_err(|error| format!("Failed to delete {resource}: {error}"))?
            .text()
            .await
            .map_err(|error| format!("Failed to read {resource} delete response: {error}"))?;
        drop(permit);

        let response = serde_json::from_str::<HueApiResponse<Value>>(&text)
            .map_err(|error| format!("Invalid {resource} delete response: {error}"))?;
        if let Some(error) = response.errors.first() {
            return Err(format!("Hue bridge error: {}", error.description));
        }
        Ok(())
    }

    /// Creates a v2 resource via POST and returns the new resource's `rid`.
    async fn post_v2(
        &self,
        ip: &str,
        application_key: &str,
        resource: &str,
        body: Value,
    ) -> Result<String, String> {
        let url = format!("https://{ip}/clip/v2/resource/{resource}");
        let permit = bridge_semaphore().acquire().await.ok();
        let text = self
            .client
            .post(&url)
            .header("hue-application-key", application_key)
            .json(&body)
            .send()
            .await
            .map_err(|error| format!("Failed to create {resource}: {error}"))?
            .text()
            .await
            .map_err(|error| format!("Failed to read {resource} create response: {error}"))?;
        drop(permit);

        let response = serde_json::from_str::<HueApiResponse<HueResourceRef>>(&text)
            .map_err(|error| format!("Invalid {resource} create response: {error}"))?;
        if let Some(error) = response.errors.first() {
            return Err(format!("Hue bridge error: {}", error.description));
        }
        response
            .data
            .into_iter()
            .next()
            .map(|reference| reference.rid)
            .ok_or_else(|| format!("Bridge did not return the created {resource}."))
    }

    pub async fn get_resource(
        &self,
        ip: &str,
        application_key: &str,
        resource_type: &str,
        id: Option<&str>,
    ) -> Result<Vec<Value>, String> {
        ensure_supported_resource_type(resource_type)?;
        let resource = id
            .map(|value| format!("{resource_type}/{value}"))
            .unwrap_or_else(|| resource_type.to_string());
        self.get_v2(ip, application_key, &resource).await
    }

    pub async fn create_resource(
        &self,
        ip: &str,
        application_key: &str,
        resource_type: &str,
        body: Value,
    ) -> Result<String, String> {
        ensure_supported_resource_type(resource_type)?;
        self.post_v2(ip, application_key, resource_type, body).await
    }

    pub async fn update_resource(
        &self,
        ip: &str,
        application_key: &str,
        resource_type: &str,
        id: &str,
        body: Value,
    ) -> Result<(), String> {
        ensure_supported_resource_type(resource_type)?;
        self.put_v2(ip, application_key, resource_type, id, body)
            .await
    }

    pub async fn delete_resource(
        &self,
        ip: &str,
        application_key: &str,
        resource_type: &str,
        id: &str,
    ) -> Result<(), String> {
        ensure_supported_resource_type(resource_type)?;
        self.delete_v2(ip, application_key, resource_type, id).await
    }

    // ---- Discovery & pairing ------------------------------------------------

    pub async fn discover_bridges(&self) -> Result<Vec<DiscoveredBridge>, String> {
        let bridges = self.collect_bridges().await?;
        Ok(self.attach_models(bridges).await)
    }

    /// Finds bridges via mDNS (preferred) and falls back to the cloud
    /// discovery endpoint. The returned bridges carry no model yet.
    async fn collect_bridges(&self) -> Result<Vec<DiscoveredBridge>, String> {
        if let Ok(bridges) = self.discover_via_mdns().await {
            if !bridges.is_empty() {
                return Ok(bridges);
            }
        }

        let response = self
            .client
            .get(DISCOVERY_URL)
            .send()
            .await
            .map_err(|error| format!("Bridge discovery failed: {error}"))?;

        let status = response.status();
        let body = response.text().await.map_err(|error| {
            format!("Bridge discovery returned an unreadable response: {error}")
        })?;

        if !status.is_success() {
            if status.as_u16() == 429 {
                return Err(
                    "Hue discovery is rate limited right now. Please wait a moment and try again."
                        .to_string(),
                );
            }
            return Err(format!("Hue discovery failed with HTTP status {status}."));
        }

        let bridges = serde_json::from_str::<Vec<DiscoveryBridgeResponse>>(&body)
            .map_err(|error| format!("Hue discovery returned an unexpected response: {error}"))?;

        Ok(bridges
            .into_iter()
            .map(|bridge| DiscoveredBridge {
                bridge_id: bridge.id.to_uppercase(),
                bridge_ip: bridge.internalipaddress,
                model_id: None,
            })
            .collect())
    }

    /// Enriches discovered bridges with their hardware model by querying each
    /// bridge's unauthenticated public config. Unreachable bridges keep their
    /// existing (likely `None`) model so discovery never fails over this.
    async fn attach_models(&self, bridges: Vec<DiscoveredBridge>) -> Vec<DiscoveredBridge> {
        let mut enriched = Vec::with_capacity(bridges.len());
        for mut bridge in bridges {
            if bridge.model_id.is_none() {
                bridge.model_id = self.fetch_bridge_model(&bridge.bridge_ip).await;
            }
            enriched.push(bridge);
        }
        enriched
    }

    /// Reads `modelid` from a bridge's public config. Tries plain HTTP first
    /// (the v1 config endpoint every bridge still serves) then HTTPS, and
    /// swallows all errors into `None` since this is best-effort metadata.
    async fn fetch_bridge_model(&self, ip: &str) -> Option<String> {
        let host = format_host(ip);
        for scheme in ["http", "https"] {
            let url = format!("{scheme}://{host}/api/0/config");
            if let Ok(response) = self.client.get(&url).send().await {
                if let Ok(config) = response.json::<PublicBridgeConfig>().await {
                    if config.modelid.is_some() {
                        return config.modelid;
                    }
                }
            }
        }
        None
    }

    async fn discover_via_mdns(&self) -> Result<Vec<DiscoveredBridge>, String> {
        let mdns = ServiceDaemon::new().map_err(|e| e.to_string())?;
        let receiver = mdns.browse("_hue._tcp.local.").map_err(|e| e.to_string())?;

        let mut bridges = Vec::new();
        let timeout = Duration::from_secs(3);
        let start = Instant::now();

        while start.elapsed() < timeout {
            if let Ok(event) = receiver.recv_timeout(Duration::from_millis(100)) {
                if let ServiceEvent::ServiceResolved(info) = event {
                    let mut addresses: Vec<_> = info.get_addresses().iter().collect();
                    addresses.sort_by_key(|addr| !addr.is_ipv4());
                    if let Some(ip) = addresses.first() {
                        let id = info
                            .get_fullname()
                            .split('.')
                            .next()
                            .and_then(|s| s.split('-').last())
                            .unwrap_or("UNKNOWN")
                            .to_string();
                        bridges.push(DiscoveredBridge {
                            bridge_id: id.to_uppercase(),
                            bridge_ip: ip.to_string(),
                            model_id: None,
                        });
                    }
                }
            }
        }
        Ok(bridges)
    }

    pub async fn pair_bridge(&self, ip: &str) -> Result<(StoredBridgeInfo, String), String> {
        let formatted_ip = format_host(ip);

        // The CLIP link-button handshake is unchanged between API versions.
        let url = format!("http://{}/api", formatted_ip);
        let payload = json!({ "devicetype": DEVICE_TYPE, "generateclientkey": true });

        let response = self
            .client
            .post(&url)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Failed to reach {}. Error: {}. Ensure your bridge is on the same network and accessible via HTTP.", url, e))?;

        let json = response
            .json::<Value>()
            .await
            .map_err(|error| format!("Invalid pairing response: {error}"))?;

        let username = extract_hue_username(&json)?;
        let bridge_id = self.fetch_bridge_id(&formatted_ip, &username).await?;

        Ok((
            StoredBridgeInfo {
                bridge_id: bridge_id.to_uppercase(),
                bridge_ip: ip.to_string(),
                application_key: Some(username.clone()),
            },
            username,
        ))
    }

    // ---- Session restore / persistence --------------------------------------

    pub async fn restore_session<R: Runtime>(
        &self,
        app: &AppHandle<R>,
    ) -> Result<HueSession, String> {
        let stored_bridge = match load_bridge_info(app)? {
            Some(bridge) => bridge,
            None => {
                let _ = clear_application_key();
                return Ok(disconnected_session(false, None, None, None, None));
            }
        };

        let application_key = match load_application_key() {
            Ok(Some(key)) => key,
            Ok(None) | Err(_) => match stored_bridge.application_key.clone() {
                Some(key) => key,
                None => {
                    clear_bridge_info(app)?;
                    return Ok(disconnected_session(false, None, None, None, None));
                }
            },
        };

        if let Ok(bridge_id) = self
            .fetch_bridge_id(&stored_bridge.bridge_ip, &application_key)
            .await
        {
            if bridge_matches(&bridge_id, &stored_bridge.bridge_id) {
                return Ok(HueSession {
                    configured: true,
                    connected: true,
                    bridge_id: Some(bridge_id.to_uppercase()),
                    bridge_ip: Some(stored_bridge.bridge_ip),
                    application_key: Some(application_key),
                    error: None,
                });
            }
        }

        let rediscovered = self
            .discover_bridges()
            .await
            .unwrap_or_default()
            .into_iter()
            .find(|bridge| bridge_matches(&bridge.bridge_id, &stored_bridge.bridge_id));

        if let Some(bridge) = rediscovered {
            if let Ok(bridge_id) = self
                .fetch_bridge_id(&bridge.bridge_ip, &application_key)
                .await
            {
                if bridge_matches(&bridge_id, &stored_bridge.bridge_id) {
                    let updated = StoredBridgeInfo {
                        bridge_id: bridge_id.to_uppercase(),
                        bridge_ip: bridge.bridge_ip.clone(),
                        application_key: stored_bridge.application_key.clone(),
                    };
                    save_bridge_info(app, &updated)?;
                    return Ok(HueSession {
                        configured: true,
                        connected: true,
                        bridge_id: Some(updated.bridge_id),
                        bridge_ip: Some(updated.bridge_ip),
                        application_key: Some(application_key),
                        error: None,
                    });
                }
            }
        }

        Ok(HueSession {
            configured: true,
            connected: false,
            bridge_id: Some(stored_bridge.bridge_id),
            bridge_ip: Some(stored_bridge.bridge_ip),
            application_key: Some(application_key),
            error: Some("Unable to reconnect to the saved Hue Bridge.".to_string()),
        })
    }

    pub async fn save_session<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        bridge: &StoredBridgeInfo,
        application_key: &str,
    ) -> Result<HueSession, String> {
        save_bridge_info(app, bridge)?;
        if let Err(error) = save_application_key(application_key) {
            println!("WARN: Failed to save Hue application key in keyring: {error}");
        }
        Ok(HueSession {
            configured: true,
            connected: true,
            bridge_id: Some(bridge.bridge_id.clone()),
            bridge_ip: Some(bridge.bridge_ip.clone()),
            application_key: Some(application_key.to_string()),
            error: None,
        })
    }

    pub fn clear_session<R: Runtime>(&self, app: &AppHandle<R>) -> Result<(), String> {
        clear_bridge_info(app)?;
        clear_application_key()?;
        Ok(())
    }

    async fn fetch_bridge_id(&self, ip: &str, application_key: &str) -> Result<String, String> {
        let bridges: Vec<HueBridgeResource> = self.get_v2(ip, application_key, "bridge").await?;
        bridges
            .into_iter()
            .find_map(|bridge| bridge.bridge_id)
            .ok_or_else(|| "Bridge did not report its identifier.".to_string())
    }

    pub fn get_stored_bridge<R: Runtime>(
        &self,
        app: &AppHandle<R>,
    ) -> Result<StoredBridgeInfo, String> {
        load_bridge_info(app)?.ok_or_else(|| {
            "No stored bridge information found. Please pair a Hue bridge.".to_string()
        })
    }

    pub fn get_stored_application_key<R: Runtime>(
        &self,
        app: &AppHandle<R>,
    ) -> Result<String, String> {
        match load_application_key() {
            Ok(Some(key)) => Ok(key),
            Ok(None) | Err(_) => {
                if let Err(error) = load_application_key() {
                    println!(
                        "WARN: keyring lookup failed while resolving application key: {error}"
                    );
                }
                let stored_bridge = load_bridge_info(app)?.ok_or_else(|| {
                    "No stored bridge information found. Please pair a Hue bridge.".to_string()
                })?;
                stored_bridge.application_key.ok_or_else(|| {
                    "No Hue application key found. Please re-pair your Hue bridge.".to_string()
                })
            }
        }
    }

    // ---- Lights -------------------------------------------------------------

    pub async fn get_lights(
        &self,
        ip: &str,
        application_key: &str,
    ) -> Result<Vec<HueLight>, String> {
        let lights: Vec<HueLightResource> = self.get_v2(ip, application_key, "light").await?;
        let devices: Vec<HueDeviceResource> = self
            .get_v2(ip, application_key, "device")
            .await
            .unwrap_or_default();
        let zigbee: Vec<HueZigbeeConnectivityResource> = self
            .get_v2(ip, application_key, "zigbee_connectivity")
            .await
            .unwrap_or_default();

        let device_map: HashMap<String, &HueDeviceResource> = devices
            .iter()
            .map(|device| (device.id.clone(), device))
            .collect();

        // device id -> (reachable, zigbee mac)
        let mut zigbee_map: HashMap<String, (bool, Option<String>)> = HashMap::new();
        for resource in &zigbee {
            let reachable = resource
                .status
                .as_deref()
                .map(zigbee_status_is_reachable)
                .unwrap_or(true);
            zigbee_map.insert(
                resource.owner.rid.clone(),
                (reachable, resource.mac_address.clone()),
            );
        }
        let zigbee_known = !zigbee.is_empty();

        Ok(lights
            .into_iter()
            .map(|light| {
                let device = device_map.get(&light.owner.rid);
                let product = device.and_then(|d| d.product_data.as_ref());
                let (reachable, mac) = match zigbee_map.get(&light.owner.rid) {
                    Some((reachable, mac)) => (*reachable, mac.clone()),
                    None => (true, None),
                };
                let reachable = if zigbee_known { reachable } else { true };

                let color = light.color.as_ref();
                let color_temp = light.color_temperature.as_ref();
                let supports_color = color.is_some();
                let supports_ct = color_temp.is_some();
                let xy = color.map(|c| [c.xy.x, c.xy.y]);
                let gamut = color.and_then(|c| c.gamut.as_ref()).map(|g| {
                    [
                        [g.red.x, g.red.y],
                        [g.green.x, g.green.y],
                        [g.blue.x, g.blue.y],
                    ]
                });
                let ct = color_temp.and_then(|c| c.mirek);
                let (ct_min, ct_max) = color_temp
                    .and_then(|c| c.mirek_schema.as_ref())
                    .map(|s| (Some(s.mirek_minimum), Some(s.mirek_maximum)))
                    .unwrap_or((None, None));
                let color_mode = if color_temp.map(|c| c.mirek_valid).unwrap_or(false) {
                    Some("ct".to_string())
                } else if supports_color {
                    Some("xy".to_string())
                } else {
                    None
                };
                let effects = light
                    .effects
                    .as_ref()
                    .map(|e| e.effect_values.clone())
                    .unwrap_or_default();
                let legacy_effect = light.effects.as_ref().and_then(|e| e.status.clone());
                let effects_v2 = light
                    .effects_v2
                    .as_ref()
                    .map(|e| e.effect_values.clone())
                    .unwrap_or_default();
                let effect_v2 = light
                    .effects_v2
                    .as_ref()
                    .and_then(|e| extract_effect_id(e.status.as_ref().or(e.action.as_ref())));
                let effect = effect_v2.clone().or(legacy_effect);

                let archetype = light.metadata.archetype.clone();
                let function = light.metadata.function.clone();

                HueLight {
                    id: light.id,
                    device_id: Some(light.owner.rid),
                    name: light.metadata.name,
                    is_on: light.on.on,
                    brightness: light.dimming.as_ref().map(|d| d.brightness),
                    reachable,
                    color_mode,
                    xy,
                    ct,
                    effect,
                    effects,
                    effect_v2,
                    effects_v2,
                    supports_color,
                    supports_ct,
                    ct_min,
                    ct_max,
                    gamut,
                    model_id: product.and_then(|p| p.model_id.clone()),
                    product_name: product.and_then(|p| p.product_name.clone()),
                    type_name: archetype
                        .or_else(|| product.and_then(|p| p.product_archetype.clone())),
                    sw_version: product.and_then(|p| p.software_version.clone()),
                    unique_id: mac,
                    function,
                }
            })
            .collect())
    }

    pub async fn set_light_state(
        &self,
        ip: &str,
        application_key: &str,
        id: &str,
        on: Option<bool>,
        brightness: Option<f64>,
        transition_ms: Option<u32>,
    ) -> Result<(), String> {
        let mut body = Map::new();
        // Omit `on` when the caller isn't changing it: each parameter becomes a
        // separate ZigBee message, so sending a redundant `on` slows the write
        // (see docs/HUE/hue-system-performance.md).
        if let Some(on) = on {
            body.insert("on".to_string(), json!({ "on": on }));
        }
        if let Some(value) = brightness {
            body.insert("dimming".to_string(), json!({ "brightness": value }));
        }
        insert_v2_transition(&mut body, transition_ms);
        self.put_v2(ip, application_key, "light", id, Value::Object(body))
            .await
    }

    /// Updates an individual light's color attributes. Any combination of `xy`,
    /// `ct` (mireds) or `effect` may be supplied; setting one also turns the
    /// light on so the change is visible immediately.
    pub async fn set_light_color(
        &self,
        ip: &str,
        application_key: &str,
        id: &str,
        xy: Option<[f64; 2]>,
        ct: Option<u16>,
        effect: Option<String>,
        transition_ms: Option<u32>,
    ) -> Result<(), String> {
        let mut body = Map::new();
        body.insert("on".to_string(), json!({ "on": true }));
        if let Some([x, y]) = xy {
            body.insert("color".to_string(), json!({ "xy": { "x": x, "y": y } }));
        }
        if let Some(value) = ct {
            body.insert("color_temperature".to_string(), json!({ "mirek": value }));
        }
        insert_v2_transition(&mut body, transition_ms);
        if let Some(value) = effect {
            let mut v2_body = body.clone();
            v2_body.insert(
                "effects_v2".to_string(),
                json!({ "action": { "effect": value } }),
            );
            if self
                .put_v2(ip, application_key, "light", id, Value::Object(v2_body))
                .await
                .is_ok()
            {
                return Ok(());
            }

            body.insert("effects".to_string(), json!({ "effect": value }));
        }
        self.put_v2(ip, application_key, "light", id, Value::Object(body))
            .await
    }

    // ---- Rooms -------------------------------------------------------------

    pub async fn get_rooms(&self, ip: &str, application_key: &str) -> Result<Vec<HueRoom>, String> {
        let rooms: Vec<HueRoomZoneResource> = self.get_v2(ip, application_key, "room").await?;
        let grouped: Vec<HueGroupedLightResource> = self
            .get_v2(ip, application_key, "grouped_light")
            .await
            .unwrap_or_default();
        let devices: Vec<HueDeviceResource> = self
            .get_v2(ip, application_key, "device")
            .await
            .unwrap_or_default();
        let zigbee: Vec<HueZigbeeConnectivityResource> = self
            .get_v2(ip, application_key, "zigbee_connectivity")
            .await
            .unwrap_or_default();
        let grouped_map: HashMap<String, &HueGroupedLightResource> =
            grouped.iter().map(|g| (g.id.clone(), g)).collect();

        // device id -> the resource, for accessory metadata lookups.
        let device_map: HashMap<String, &HueDeviceResource> = devices
            .iter()
            .map(|device| (device.id.clone(), device))
            .collect();

        // device id -> reachable, derived from its zigbee connectivity status.
        let mut reachable_map: HashMap<String, bool> = HashMap::new();
        for resource in &zigbee {
            let reachable = resource
                .status
                .as_deref()
                .map(zigbee_status_is_reachable)
                .unwrap_or(true);
            reachable_map.insert(resource.owner.rid.clone(), reachable);
        }
        let zigbee_known = !zigbee.is_empty();

        // device id -> its light service ids
        let device_lights: HashMap<String, Vec<String>> = devices
            .iter()
            .map(|device| {
                let lights = device
                    .services
                    .iter()
                    .filter(|service| service.rtype == "light")
                    .map(|service| service.rid.clone())
                    .collect();
                (device.id.clone(), lights)
            })
            .collect();

        Ok(rooms
            .into_iter()
            .map(|room| {
                let grouped_light_id = room
                    .services
                    .iter()
                    .find(|service| service.rtype == "grouped_light")
                    .map(|service| service.rid.clone());
                let grouped_light = grouped_light_id.as_ref().and_then(|id| grouped_map.get(id));
                let any_on = grouped_light.map(|g| g.on.on).unwrap_or(false);
                let brightness =
                    grouped_light.and_then(|g| g.dimming.as_ref().map(|d| d.brightness));

                let device_ids = room
                    .children
                    .iter()
                    .filter(|child| child.rtype == "device")
                    .map(|child| child.rid.clone())
                    .collect::<Vec<_>>();
                let light_ids = device_ids
                    .iter()
                    .flat_map(|device_id| device_lights.get(device_id).cloned().unwrap_or_default())
                    .collect::<Vec<_>>();

                let accessories = room
                    .children
                    .iter()
                    .filter(|child| child.rtype == "device")
                    .filter_map(|child| device_map.get(&child.rid).copied())
                    .filter_map(|device| {
                        let service_types: Vec<&str> = device
                            .services
                            .iter()
                            .map(|service| service.rtype.as_str())
                            .collect();
                        let kind = device_kind(&service_types)?;
                        if kind == "light" {
                            return None;
                        }
                        let product = device.product_data.as_ref();
                        let name = device
                            .metadata
                            .as_ref()
                            .map(|metadata| metadata.name.clone())
                            .filter(|name| !name.is_empty())
                            .or_else(|| product.and_then(|product| product.product_name.clone()))
                            .unwrap_or_else(|| "Hue accessory".to_string());
                        let reachable = match reachable_map.get(&device.id) {
                            Some(reachable) => *reachable,
                            None => true,
                        };
                        Some(HueAccessory {
                            id: device.id.clone(),
                            name,
                            kind: kind.to_string(),
                            product_name: product.and_then(|p| p.product_name.clone()),
                            reachable: if zigbee_known { reachable } else { true },
                        })
                    })
                    .collect::<Vec<_>>();

                HueRoom {
                    id: room.id,
                    name: room.metadata.name,
                    class: room
                        .metadata
                        .archetype
                        .unwrap_or_else(|| "other".to_string()),
                    resource_type: "room".to_string(),
                    any_on,
                    all_on: any_on,
                    brightness,
                    light_count: light_ids.len(),
                    light_ids,
                    device_ids,
                    grouped_light_id,
                    accessories,
                }
            })
            .collect())
    }

    // ---- Zones -------------------------------------------------------------

    pub async fn get_zones(&self, ip: &str, application_key: &str) -> Result<Vec<HueZone>, String> {
        let zones: Vec<HueRoomZoneResource> = self.get_v2(ip, application_key, "zone").await?;
        let grouped: Vec<HueGroupedLightResource> = self
            .get_v2(ip, application_key, "grouped_light")
            .await
            .unwrap_or_default();

        let grouped_map: HashMap<String, &HueGroupedLightResource> =
            grouped.iter().map(|g| (g.id.clone(), g)).collect();

        Ok(zones
            .into_iter()
            .map(|zone| {
                let grouped_light_id = zone
                    .services
                    .iter()
                    .find(|service| service.rtype == "grouped_light")
                    .map(|service| service.rid.clone());
                let grouped_light = grouped_light_id.as_ref().and_then(|id| grouped_map.get(id));
                let any_on = grouped_light.map(|g| g.on.on).unwrap_or(false);
                let brightness =
                    grouped_light.and_then(|g| g.dimming.as_ref().map(|d| d.brightness));

                let light_ids = zone
                    .children
                    .iter()
                    .filter(|child| child.rtype == "light")
                    .map(|child| child.rid.clone())
                    .collect::<Vec<_>>();

                HueZone {
                    id: zone.id,
                    name: zone.metadata.name,
                    class: zone
                        .metadata
                        .archetype
                        .unwrap_or_else(|| "other".to_string()),
                    resource_type: "zone".to_string(),
                    any_on,
                    all_on: any_on,
                    brightness,
                    light_count: light_ids.len(),
                    light_ids,
                    device_ids: Vec::new(),
                    grouped_light_id,
                    accessories: Vec::new(),
                }
            })
            .collect())
    }

    /// Sets on/brightness for a grouped_light (a room, zone, or the whole house).
    pub async fn set_grouped_light_state(
        &self,
        ip: &str,
        application_key: &str,
        id: &str,
        on: Option<bool>,
        brightness: Option<f64>,
        transition_ms: Option<u32>,
    ) -> Result<(), String> {
        let mut body = Map::new();
        // Group commands broadcast on ZigBee and are capped near 1/s, so dropping
        // a redundant `on` (when only dimming changes) matters even more here.
        if let Some(on) = on {
            body.insert("on".to_string(), json!({ "on": on }));
        }
        if let Some(value) = brightness {
            body.insert("dimming".to_string(), json!({ "brightness": value }));
        }
        insert_v2_transition(&mut body, transition_ms);
        self.put_v2(
            ip,
            application_key,
            "grouped_light",
            id,
            Value::Object(body),
        )
        .await
    }

    // ---- Scenes -------------------------------------------------------------

    pub async fn get_scenes(
        &self,
        ip: &str,
        application_key: &str,
    ) -> Result<Vec<HueScene>, String> {
        let scenes: Vec<HueSceneResource> = self.get_v2(ip, application_key, "scene").await?;
        let smart_scenes: Vec<HueSceneResource> = self
            .get_v2(ip, application_key, "smart_scene")
            .await
            .unwrap_or_default();
        Ok(scenes
            .into_iter()
            .map(|scene| scene_to_public(scene, "scene"))
            .chain(
                smart_scenes
                    .into_iter()
                    .map(|scene| scene_to_public(scene, "smart_scene")),
            )
            .collect())
    }

    pub async fn get_smart_scenes(
        &self,
        ip: &str,
        application_key: &str,
    ) -> Result<Vec<HueScene>, String> {
        let scenes: Vec<HueSceneResource> = self
            .get_v2(ip, application_key, "smart_scene")
            .await
            .unwrap_or_default();
        Ok(scenes
            .into_iter()
            .map(|scene| scene_to_public(scene, "smart_scene"))
            .collect())
    }

    pub async fn activate_scene(
        &self,
        ip: &str,
        application_key: &str,
        scene_id: &str,
        transition_ms: Option<u32>,
    ) -> Result<(), String> {
        self.recall_scene(ip, application_key, scene_id, "active", transition_ms)
            .await
    }

    pub async fn start_dynamic_scene(
        &self,
        ip: &str,
        application_key: &str,
        scene_id: &str,
        transition_ms: Option<u32>,
    ) -> Result<(), String> {
        self.recall_scene(
            ip,
            application_key,
            scene_id,
            "dynamic_palette",
            transition_ms,
        )
        .await
    }

    pub async fn stop_dynamic_scene(
        &self,
        ip: &str,
        application_key: &str,
        scene_id: &str,
        transition_ms: Option<u32>,
    ) -> Result<(), String> {
        self.recall_scene(ip, application_key, scene_id, "static", transition_ms)
            .await
    }

    async fn recall_scene(
        &self,
        ip: &str,
        application_key: &str,
        scene_id: &str,
        action: &str,
        transition_ms: Option<u32>,
    ) -> Result<(), String> {
        let body = scene_recall_body(action, transition_ms);
        match self
            .put_v2(ip, application_key, "scene", scene_id, body)
            .await
        {
            Ok(()) => Ok(()),
            Err(error) if transition_ms.is_some() => {
                let fallback_body = json!({ "recall": { "action": action } });
                self.put_v2(ip, application_key, "scene", scene_id, fallback_body)
                    .await
                    .map_err(|fallback_error| {
                        format!(
                            "Unable to recall scene: {fallback_error}. First attempt with transition failed with: {error}"
                        )
                    })
            }
            Err(error) => Err(error),
        }
    }

    pub async fn activate_smart_scene(
        &self,
        ip: &str,
        application_key: &str,
        scene_id: &str,
        _transition_ms: Option<u32>,
    ) -> Result<(), String> {
        self.put_v2(
            ip,
            application_key,
            "smart_scene",
            scene_id,
            json!({ "recall": { "action": "activate" } }),
        )
        .await
    }

    pub async fn deactivate_smart_scene(
        &self,
        ip: &str,
        application_key: &str,
        scene_id: &str,
    ) -> Result<(), String> {
        self.put_v2(
            ip,
            application_key,
            "smart_scene",
            scene_id,
            json!({ "recall": { "action": "deactivate" } }),
        )
        .await
    }

    /// Sets a scene's overall brightness by rescaling every stored action's
    /// dimming. A scene has no single brightness field in v2 — each action
    /// carries its own — so we scale them proportionally from the brightest
    /// light, preserving the relative differences the scene was designed with.
    pub async fn set_scene_brightness(
        &self,
        ip: &str,
        application_key: &str,
        scene_id: &str,
        brightness: f64,
    ) -> Result<(), String> {
        if !brightness.is_finite() {
            return Err("Invalid scene brightness.".to_string());
        }
        let target = brightness.clamp(1.0, 100.0);

        let scenes: Vec<Value> = self.get_v2(ip, application_key, "scene").await?;
        let mut scene = scenes
            .into_iter()
            .find(|scene| scene.get("id").and_then(Value::as_str) == Some(scene_id))
            .ok_or_else(|| "Scene not found on the bridge.".to_string())?;

        let updated_actions = {
            let actions = scene
                .get_mut("actions")
                .and_then(Value::as_array_mut)
                .ok_or_else(|| "Scene has no actions to adjust.".to_string())?;

            let max = actions
                .iter()
                .filter_map(|entry| {
                    entry
                        .pointer("/action/dimming/brightness")
                        .and_then(Value::as_f64)
                })
                .fold(0.0_f64, f64::max);
            let factor = if max > 0.0 { target / max } else { 1.0 };

            for entry in actions.iter_mut() {
                let Some(current) = entry
                    .pointer("/action/dimming/brightness")
                    .and_then(Value::as_f64)
                else {
                    continue;
                };
                if let Some(slot) = entry.pointer_mut("/action/dimming/brightness") {
                    *slot = json!((current * factor).clamp(1.0, 100.0));
                }
            }
            actions.clone()
        };

        self.put_v2(
            ip,
            application_key,
            "scene",
            scene_id,
            json!({ "actions": updated_actions }),
        )
        .await
    }

    pub async fn create_scene(
        &self,
        ip: &str,
        application_key: &str,
        name: &str,
        group_id: &str,
        group_type: &str,
    ) -> Result<String, String> {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err("Scene name cannot be empty.".to_string());
        }
        if !matches!(group_type, "room" | "zone") {
            return Err("Scenes can only target a room or zone.".to_string());
        }

        let light_ids = self
            .group_light_ids(ip, application_key, group_type, group_id)
            .await?;
        if light_ids.is_empty() {
            return Err("That room or zone has no lights to snapshot.".to_string());
        }

        let all_lights: Vec<HueLightResource> = self.get_v2(ip, application_key, "light").await?;
        let wanted = light_ids
            .into_iter()
            .collect::<std::collections::HashSet<_>>();
        let lights = all_lights
            .into_iter()
            .filter(|light| wanted.contains(&light.id))
            .collect::<Vec<_>>();
        if lights.is_empty() {
            return Err("No current light states were available for that space.".to_string());
        }

        let body = snapshot_scene_body(trimmed, group_id, group_type, &lights, true);
        match self.post_v2(ip, application_key, "scene", body).await {
            Ok(id) => Ok(id),
            Err(error_with_effects) => {
                let body = snapshot_scene_body(trimmed, group_id, group_type, &lights, false);
                self.post_v2(ip, application_key, "scene", body)
                    .await
                    .map_err(|fallback_error| {
                        format!(
                            "Unable to create scene: {fallback_error}. First attempt with effect state failed with: {error_with_effects}"
                        )
                    })
            }
        }
    }

    pub async fn create_gallery_scene(
        &self,
        ip: &str,
        application_key: &str,
        name: &str,
        group_id: &str,
        group_type: &str,
        colors: &[HueSceneRecipeColor],
        brightness: f64,
        requested_speed: Option<f64>,
    ) -> Result<HueScene, String> {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err("Scene name cannot be empty.".to_string());
        }
        if !matches!(group_type, "room" | "zone") {
            return Err("Scenes can only target a room or zone.".to_string());
        }
        if colors.is_empty() {
            return Err("Scene gallery presets need at least one color.".to_string());
        }

        let light_ids = self
            .group_light_ids(ip, application_key, group_type, group_id)
            .await?;
        if light_ids.is_empty() {
            return Err("That room or zone has no lights for a gallery scene.".to_string());
        }

        let all_lights: Vec<HueLightResource> = self.get_v2(ip, application_key, "light").await?;
        let wanted = light_ids
            .into_iter()
            .collect::<std::collections::HashSet<_>>();
        let lights = all_lights
            .into_iter()
            .filter(|light| wanted.contains(&light.id))
            .collect::<Vec<_>>();
        if lights.is_empty() {
            return Err("No current light resources were available for that space.".to_string());
        }

        let (actions, public_actions) = gallery_scene_actions(&lights, colors, brightness);
        // A multi-color preset must carry a `palette` so the bridge can cycle
        // the colors when recalled dynamically. Without it the scene is static
        // and the play/speed controls have nothing to drive. `auto_dynamic`
        // makes even a plain `active` recall start the animation.
        let palette = gallery_palette(colors, brightness);
        let dynamic = palette.is_some();
        // Honor the speed the gallery asked for; fall back to the bridge's own
        // default (step 4) when none was supplied so an unspecified create still
        // reads back consistently.
        let speed = if dynamic {
            Some(requested_speed.unwrap_or(GALLERY_DYNAMIC_SPEED))
        } else {
            None
        };

        let mut body = json!({
            "type": "scene",
            "metadata": { "name": trimmed },
            "group": { "rid": group_id, "rtype": group_type },
            "actions": actions,
        });
        if let Some(palette) = palette {
            let map = body
                .as_object_mut()
                .expect("gallery scene body is a JSON object");
            map.insert("palette".to_string(), palette);
            map.insert(
                "speed".to_string(),
                json!(speed.unwrap_or(GALLERY_DYNAMIC_SPEED)),
            );
            map.insert("auto_dynamic".to_string(), json!(true));
        }
        let id = self.post_v2(ip, application_key, "scene", body).await?;
        let public_colors = public_actions
            .iter()
            .filter_map(|action| {
                action
                    .xy
                    .map(|xy| SceneColor {
                        xy: Some(xy),
                        mirek: None,
                    })
                    .or_else(|| {
                        action.mirek.map(|mirek| SceneColor {
                            xy: None,
                            mirek: Some(mirek),
                        })
                    })
            })
            .collect();

        Ok(HueScene {
            id,
            name: trimmed.to_string(),
            resource_type: "scene".to_string(),
            group: Some(group_id.to_string()),
            scene_type: Some(group_type.to_string()),
            status: Some("Inactive".to_string()),
            dynamic,
            speed,
            auto_dynamic: dynamic,
            smart: false,
            colors: public_colors,
            actions: public_actions,
        })
    }

    async fn group_light_ids(
        &self,
        ip: &str,
        application_key: &str,
        group_type: &str,
        group_id: &str,
    ) -> Result<Vec<String>, String> {
        let groups: Vec<HueRoomZoneResource> = self
            .get_v2(ip, application_key, &format!("{group_type}/{group_id}"))
            .await?;
        let group = groups
            .into_iter()
            .next()
            .ok_or_else(|| "That room or zone no longer exists.".to_string())?;

        if group_type == "zone" {
            return Ok(group
                .children
                .into_iter()
                .filter(|child| child.rtype == "light")
                .map(|child| child.rid)
                .collect());
        }

        let device_ids = group
            .children
            .into_iter()
            .filter(|child| child.rtype == "device")
            .map(|child| child.rid)
            .collect::<std::collections::HashSet<_>>();
        let devices: Vec<HueDeviceResource> = self
            .get_v2(ip, application_key, "device")
            .await
            .unwrap_or_default();
        Ok(devices
            .into_iter()
            .filter(|device| device_ids.contains(&device.id))
            .flat_map(|device| {
                device
                    .services
                    .into_iter()
                    .filter(|service| service.rtype == "light")
                    .map(|service| service.rid)
            })
            .collect())
    }

    // ---- Settings -----------------------------------------------------------

    pub async fn get_settings_summary(
        &self,
        bridge: &StoredBridgeInfo,
        application_key: &str,
    ) -> Result<HueSettingsSummary, String> {
        let devices_result = self
            .get_v2::<HueDeviceResource>(&bridge.bridge_ip, application_key, "device")
            .await;
        // A successful device fetch means the bridge is reachable, which is all
        // the classic v1 light search needs to run as a discovery fallback.
        let bridge_reachable = devices_result.is_ok();
        let devices: Vec<HueDeviceResource> = devices_result.unwrap_or_default();
        let zigbee: Vec<HueZigbeeConnectivityResource> = self
            .get_v2(&bridge.bridge_ip, application_key, "zigbee_connectivity")
            .await
            .unwrap_or_default();
        let bridge_resources: Vec<HueBridgeResource> = self
            .get_v2(&bridge.bridge_ip, application_key, "bridge")
            .await
            .unwrap_or_default();
        let v2_discovery_supported = self
            .get_v2::<HueDeviceDiscoveryResource>(
                &bridge.bridge_ip,
                application_key,
                "zigbee_device_discovery",
            )
            .await
            .map(|resources| !resources.is_empty())
            .unwrap_or(false);
        // Bridges with current v2 firmware expose `zigbee_device_discovery`;
        // standard bridges may still need the classic v1 search fallback.
        let device_discovery_supported = v2_discovery_supported || bridge_reachable;
        let accessory_services = self
            .get_accessory_services(&bridge.bridge_ip, application_key)
            .await
            .unwrap_or_default();
        let switch_input_configurations = self
            .get_switch_input_configurations(&bridge.bridge_ip, application_key)
            .await
            .unwrap_or_default();

        let reported_bridge_id = bridge_resources
            .into_iter()
            .find_map(|resource| resource.bridge_id)
            .unwrap_or_else(|| bridge.bridge_id.clone());

        let mut zigbee_map: HashMap<String, (bool, Option<String>)> = HashMap::new();
        for resource in &zigbee {
            let reachable = resource
                .status
                .as_deref()
                .map(zigbee_status_is_reachable)
                .unwrap_or(true);
            zigbee_map.insert(
                resource.owner.rid.clone(),
                (reachable, resource.mac_address.clone()),
            );
        }
        let zigbee_known = !zigbee.is_empty();

        let bridge_device = devices.iter().find(|device| {
            device
                .services
                .iter()
                .any(|service| service.rtype == "bridge")
                || device
                    .product_data
                    .as_ref()
                    .and_then(|product| product.product_name.as_deref())
                    .map(|name| name.to_lowercase().contains("bridge"))
                    .unwrap_or(false)
        });
        let bridge_product = bridge_device.and_then(|device| device.product_data.as_ref());
        let bridge_product_name = bridge_product.and_then(|product| product.product_name.clone());
        let bridge_model_id = bridge_product.and_then(|product| product.model_id.clone());
        let bridge_sw_version = bridge_product.and_then(|product| product.software_version.clone());

        let devices = devices
            .into_iter()
            .map(|device| {
                let product = device.product_data.as_ref();
                let (reachable, unique_id) =
                    zigbee_map.get(&device.id).cloned().unwrap_or((true, None));
                let reachable = if zigbee_known { reachable } else { true };
                let service_types = device
                    .services
                    .iter()
                    .map(|service| service.rtype.clone())
                    .collect::<Vec<_>>();
                let name = device
                    .metadata
                    .as_ref()
                    .map(|metadata| metadata.name.clone())
                    .filter(|name| !name.is_empty())
                    .or_else(|| product.and_then(|product| product.product_name.clone()))
                    .unwrap_or_else(|| "Hue device".to_string());

                HueSettingsDevice {
                    id: device.id,
                    name,
                    product_name: product.and_then(|product| product.product_name.clone()),
                    model_id: product.and_then(|product| product.model_id.clone()),
                    product_archetype: product
                        .and_then(|product| product.product_archetype.clone()),
                    sw_version: product.and_then(|product| product.software_version.clone()),
                    reachable,
                    unique_id,
                    service_types,
                }
            })
            .collect();

        Ok(HueSettingsSummary {
            bridge: HueSettingsBridge {
                bridge_id: reported_bridge_id,
                bridge_ip: bridge.bridge_ip.clone(),
                product_name: bridge_product_name,
                model_id: bridge_model_id,
                sw_version: bridge_sw_version,
                application_key_saved: true,
            },
            devices,
            accessory_services,
            switch_input_configurations,
            device_discovery_supported,
        })
    }

    /// The user-given name of the Hue bridge, used as the home/house label on
    /// the Home screen. The CLIP v2 API exposes no dedicated "home" resource
    /// name, so we surface the bridge device's `metadata.name` — the field users
    /// edit when they rename their setup in the Hue app. Returns `None` when the
    /// bridge device carries no name, leaving the UI to decide a fallback.
    pub async fn get_home_name(
        &self,
        ip: &str,
        application_key: &str,
    ) -> Result<Option<String>, String> {
        let devices: Vec<HueDeviceResource> = self.get_v2(ip, application_key, "device").await?;
        let name = devices
            .iter()
            .find(|device| {
                device
                    .services
                    .iter()
                    .any(|service| service.rtype == "bridge")
                    || device
                        .product_data
                        .as_ref()
                        .and_then(|product| product.product_name.as_deref())
                        .map(|name| name.to_lowercase().contains("bridge"))
                        .unwrap_or(false)
            })
            .and_then(|device| device.metadata.as_ref())
            .map(|metadata| metadata.name.clone())
            .filter(|name| !name.is_empty());
        Ok(name)
    }

    pub async fn get_accessory_services(
        &self,
        ip: &str,
        application_key: &str,
    ) -> Result<Vec<HueAccessoryService>, String> {
        let devices: Vec<HueDeviceResource> = self
            .get_v2(ip, application_key, "device")
            .await
            .unwrap_or_default();
        let zigbee: Vec<HueZigbeeConnectivityResource> = self
            .get_v2(ip, application_key, "zigbee_connectivity")
            .await
            .unwrap_or_default();
        let device_map = device_public_map(&devices);
        let reachable_map = reachable_public_map(&zigbee);
        let zigbee_known = !zigbee.is_empty();

        let mut services = Vec::new();
        for resource_type in ACCESSORY_SERVICE_TYPES {
            let resources: Vec<HueRawResource> = self
                .get_v2(ip, application_key, resource_type)
                .await
                .unwrap_or_default();
            for resource in resources {
                let device_id = resource.owner.as_ref().map(|owner| owner.rid.clone());
                let device = device_id.as_ref().and_then(|id| device_map.get(id));
                let reachable = device_id
                    .as_ref()
                    .and_then(|id| reachable_map.get(id).copied())
                    .unwrap_or(true);
                let raw = raw_resource_value(&resource);
                services.push(HueAccessoryService {
                    id: resource.id,
                    resource_type: resource_type.to_string(),
                    device_id,
                    device_name: device.map(|entry| entry.0.clone()),
                    product_name: device.and_then(|entry| entry.1.clone()),
                    reachable: if zigbee_known { reachable } else { true },
                    enabled: resource.enabled,
                    value: summarize_resource_value(&raw),
                    updated: extract_updated(&raw),
                    raw,
                });
            }
        }
        Ok(services)
    }

    pub async fn get_switch_input_configurations(
        &self,
        ip: &str,
        application_key: &str,
    ) -> Result<Vec<HueSwitchInputConfiguration>, String> {
        let devices: Vec<HueDeviceResource> = self
            .get_v2(ip, application_key, "device")
            .await
            .unwrap_or_default();
        let device_map = device_public_map(&devices);
        let resources: Vec<HueRawResource> = self
            .get_v2(ip, application_key, "switch_input_configuration")
            .await
            .unwrap_or_default();

        Ok(resources
            .into_iter()
            .map(|resource| {
                let device_id = resource.owner.as_ref().map(|owner| owner.rid.clone());
                let device = device_id.as_ref().and_then(|id| device_map.get(id));
                let raw = raw_resource_value(&resource);
                HueSwitchInputConfiguration {
                    id: resource.id,
                    device_id,
                    device_name: device.map(|entry| entry.0.clone()),
                    mode: extract_mode(&raw),
                    raw,
                }
            })
            .collect())
    }

    pub async fn set_switch_input_configuration(
        &self,
        ip: &str,
        application_key: &str,
        id: &str,
        body: Value,
    ) -> Result<(), String> {
        self.put_v2(ip, application_key, "switch_input_configuration", id, body)
            .await
    }

    pub async fn rename_resource(
        &self,
        ip: &str,
        application_key: &str,
        resource_type: &str,
        id: &str,
        name: &str,
    ) -> Result<(), String> {
        match resource_type {
            "light" | "room" | "zone" | "scene" | "smart_scene" | "device" => {}
            _ => {
                return Err(format!(
                    "Renaming Hue resource type '{resource_type}' is not supported."
                ));
            }
        }

        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err("Name cannot be empty.".to_string());
        }

        let body = json!({ "metadata": { "name": trimmed } });
        self.put_v2(ip, application_key, resource_type, id, body)
            .await
    }

    // ---- Placing newly-found devices ----------------------------------------

    pub async fn create_zone(
        &self,
        ip: &str,
        application_key: &str,
        name: &str,
        archetype: Option<&str>,
        light_ids: Vec<String>,
    ) -> Result<(), String> {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err("Zone name cannot be empty.".to_string());
        }
        let archetype = archetype
            .filter(|value| !value.is_empty())
            .unwrap_or("other");
        let children = light_ids
            .into_iter()
            .filter(|id| !id.trim().is_empty())
            .map(|id| json!({ "rid": id, "rtype": "light" }))
            .collect::<Vec<_>>();
        let body = json!({
            "type": "zone",
            "metadata": { "name": trimmed, "archetype": archetype },
            "children": children,
        });
        self.post_v2(ip, application_key, "zone", body)
            .await
            .map(|_| ())
    }

    pub async fn update_room_members(
        &self,
        ip: &str,
        application_key: &str,
        room_id: &str,
        device_ids: Vec<String>,
    ) -> Result<(), String> {
        let children = device_ids
            .into_iter()
            .filter(|id| !id.trim().is_empty())
            .map(|id| json!({ "rid": id, "rtype": "device" }))
            .collect::<Vec<_>>();
        self.put_v2(
            ip,
            application_key,
            "room",
            room_id,
            json!({ "children": children }),
        )
        .await
    }

    pub async fn update_zone_members(
        &self,
        ip: &str,
        application_key: &str,
        zone_id: &str,
        light_ids: Vec<String>,
    ) -> Result<(), String> {
        let children = light_ids
            .into_iter()
            .filter(|id| !id.trim().is_empty())
            .map(|id| json!({ "rid": id, "rtype": "light" }))
            .collect::<Vec<_>>();
        self.put_v2(
            ip,
            application_key,
            "zone",
            zone_id,
            json!({ "children": children }),
        )
        .await
    }

    /// Reads a single room or zone's current `children` as JSON refs, ready to
    /// extend and PUT back. `resource` is `"room"` or `"zone"`.
    async fn get_group_children(
        &self,
        ip: &str,
        application_key: &str,
        resource: &str,
        id: &str,
    ) -> Result<Vec<Value>, String> {
        let groups: Vec<HueRoomZoneResource> = self
            .get_v2(ip, application_key, &format!("{resource}/{id}"))
            .await?;
        let group = groups
            .into_iter()
            .next()
            .ok_or_else(|| format!("That {resource} no longer exists."))?;
        Ok(group
            .children
            .into_iter()
            .map(|child| json!({ "rid": child.rid, "rtype": child.rtype }))
            .collect())
    }

    /// Adds a device to an existing room (rooms group `device` resources).
    pub async fn assign_device_to_room(
        &self,
        ip: &str,
        application_key: &str,
        device_id: &str,
        room_id: &str,
    ) -> Result<(), String> {
        let mut children = self
            .get_group_children(ip, application_key, "room", room_id)
            .await?;
        if children
            .iter()
            .any(|child| child.get("rid").and_then(Value::as_str) == Some(device_id))
        {
            return Ok(());
        }
        children.push(json!({ "rid": device_id, "rtype": "device" }));
        self.put_v2(
            ip,
            application_key,
            "room",
            room_id,
            json!({ "children": children }),
        )
        .await
    }

    /// Adds a device's light services to an existing zone (zones group `light`
    /// resources). Errors for devices that expose no lights.
    pub async fn assign_device_to_zone(
        &self,
        ip: &str,
        application_key: &str,
        device_id: &str,
        zone_id: &str,
    ) -> Result<(), String> {
        let light_rids = self
            .device_light_rids(ip, application_key, device_id)
            .await?;
        if light_rids.is_empty() {
            return Err("This device has no lights to add to a zone.".to_string());
        }
        let mut children = self
            .get_group_children(ip, application_key, "zone", zone_id)
            .await?;
        for rid in light_rids {
            let already_present = children
                .iter()
                .any(|child| child.get("rid").and_then(Value::as_str) == Some(rid.as_str()));
            if !already_present {
                children.push(json!({ "rid": rid, "rtype": "light" }));
            }
        }
        self.put_v2(
            ip,
            application_key,
            "zone",
            zone_id,
            json!({ "children": children }),
        )
        .await
    }

    /// Creates a room containing the given device. Hue requires an archetype;
    /// `"other"` is used when the caller supplies none.
    pub async fn create_room(
        &self,
        ip: &str,
        application_key: &str,
        name: &str,
        archetype: Option<&str>,
        device_id: &str,
    ) -> Result<String, String> {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err("Room name cannot be empty.".to_string());
        }
        let archetype = archetype
            .filter(|value| !value.is_empty())
            .unwrap_or("other");
        let body = json!({
            "type": "room",
            "metadata": { "name": trimmed, "archetype": archetype },
            "children": [{ "rid": device_id, "rtype": "device" }],
        });
        self.post_v2(ip, application_key, "room", body).await
    }

    /// Light service rids owned by a device, for zone membership.
    async fn device_light_rids(
        &self,
        ip: &str,
        application_key: &str,
        device_id: &str,
    ) -> Result<Vec<String>, String> {
        let devices: Vec<HueDeviceResource> = self
            .get_v2(ip, application_key, &format!("device/{device_id}"))
            .await?;
        let device = devices
            .into_iter()
            .next()
            .ok_or_else(|| "That device no longer exists.".to_string())?;
        Ok(device
            .services
            .into_iter()
            .filter(|service| service.rtype == "light")
            .map(|service| service.rid)
            .collect())
    }

    pub async fn start_device_discovery(
        &self,
        ip: &str,
        application_key: &str,
    ) -> Result<(), String> {
        match self
            .start_zigbee_device_discovery(ip, application_key, "search_allow_default_link_key")
            .await
        {
            Ok(()) => return Ok(()),
            Err(error) if error == "unsupported" => {}
            Err(_) => {}
        }

        // The standard Hue Bridge may have no v2 discovery resource, so fall
        // back to the classic v1 search for both lights and accessories.
        self.start_device_discovery_v1(ip, application_key).await
    }

    pub async fn start_qr_device_discovery(
        &self,
        ip: &str,
        application_key: &str,
        qr_text: &str,
    ) -> Result<(), String> {
        let install_code = parse_hue_qr_install_code(qr_text)?;
        let resource = self
            .get_zigbee_device_discovery_resource(ip, application_key)
            .await?
            .ok_or_else(|| {
                "This bridge does not expose Hue v2 Zigbee install-code discovery.".to_string()
            })?;
        let body = json!({
            "add_install_codes": {
                "install_codes": [{
                    "mac_address": install_code.mac_address,
                    "ic": install_code.install_code,
                }],
            },
        });
        self.put_v2(
            ip,
            application_key,
            "zigbee_device_discovery",
            &resource.id,
            body,
        )
        .await?;
        self.start_zigbee_device_discovery(ip, application_key, "search")
            .await
    }

    pub async fn start_serial_light_discovery(
        &self,
        ip: &str,
        application_key: &str,
        serial: &str,
    ) -> Result<(), String> {
        let serial = normalize_hue_serial(serial)?;
        self.search_v1_collection_with_body(
            ip,
            application_key,
            "lights",
            Some(json!({ "deviceid": [serial] })),
        )
        .await
    }

    async fn get_zigbee_device_discovery_resource(
        &self,
        ip: &str,
        application_key: &str,
    ) -> Result<Option<HueDeviceDiscoveryResource>, String> {
        let resources: Vec<HueDeviceDiscoveryResource> = self
            .get_v2(ip, application_key, "zigbee_device_discovery")
            .await
            .unwrap_or_default();

        Ok(resources.into_iter().next())
    }

    async fn start_zigbee_device_discovery(
        &self,
        ip: &str,
        application_key: &str,
        action_type: &str,
    ) -> Result<(), String> {
        let resource = self
            .get_zigbee_device_discovery_resource(ip, application_key)
            .await?;
        let Some(resource) = resource else {
            return Err("unsupported".to_string());
        };
        let body = json!({ "action": { "action_type": action_type } });
        self.put_v2(
            ip,
            application_key,
            "zigbee_device_discovery",
            &resource.id,
            body,
        )
        .await
        .map_err(|_| "The bridge rejected the device discovery request.".to_string())
    }

    /// Classic v1 fallback for bridges without the v2 `device_discovery`
    /// resource. Scans the Zigbee network for new lights and accessories;
    /// results surface through the normal resource refresh. The application key
    /// doubles as the v1 username.
    async fn start_device_discovery_v1(
        &self,
        ip: &str,
        application_key: &str,
    ) -> Result<(), String> {
        self.search_v1_collection(ip, application_key, "lights")
            .await?;
        self.search_v1_collection(ip, application_key, "sensors")
            .await
    }

    /// Triggers a v1 search on a collection via `POST /api/<key>/<collection>`
    /// (`lights` or `sensors`).
    async fn search_v1_collection(
        &self,
        ip: &str,
        application_key: &str,
        collection: &str,
    ) -> Result<(), String> {
        self.search_v1_collection_with_body(ip, application_key, collection, None)
            .await
    }

    async fn search_v1_collection_with_body(
        &self,
        ip: &str,
        application_key: &str,
        collection: &str,
        body: Option<Value>,
    ) -> Result<(), String> {
        let url = format!(
            "http://{}/api/{}/{}",
            format_host(ip),
            application_key,
            collection
        );
        let permit = bridge_semaphore().acquire().await.ok();
        let request = self.client.post(&url);
        let request = if let Some(body) = body {
            request.json(&body)
        } else {
            request
        };
        let text = request
            .send()
            .await
            .map_err(|error| format!("Failed to start {collection} search: {error}"))?
            .text()
            .await
            .map_err(|error| format!("Failed to read {collection} search response: {error}"))?;
        drop(permit);

        // The v1 API reports failures as `[{ "error": { "description": ... } }]`.
        if let Ok(entries) = serde_json::from_str::<Vec<Value>>(&text) {
            if let Some(description) = entries.iter().find_map(|entry| {
                entry
                    .get("error")
                    .and_then(|error| error.get("description"))
                    .and_then(|description| description.as_str())
            }) {
                return Err(format!("Hue bridge error: {description}"));
            }
        }
        Ok(())
    }

    // ---- Real-time event stream ---------------------------------------------

    /// Opens a persistent SSE connection to the bridge event stream and emits a
    /// `hue-event` Tauri event (`Vec<HueEventUpdate>`) for every change the
    /// bridge reports, reconnecting with a short backoff until `active` clears.
    pub async fn run_event_stream<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        active: Arc<AtomicBool>,
        ip: &str,
        application_key: &str,
    ) {
        let url = format!("https://{ip}/eventstream/clip/v2");

        while active.load(Ordering::Relaxed) {
            let result = self
                .client
                .get(&url)
                .header("hue-application-key", application_key)
                .header("Accept", "text/event-stream")
                .send()
                .await;

            match result {
                Ok(mut response) => {
                    println!("DEBUG: event stream connected ({})", response.status());
                    let mut buffer = String::new();

                    loop {
                        if !active.load(Ordering::Relaxed) {
                            return;
                        }

                        match response.chunk().await {
                            Ok(Some(bytes)) => {
                                buffer.push_str(&String::from_utf8_lossy(&bytes));
                                while let Some(idx) = buffer.find("\n\n") {
                                    let block: String = buffer.drain(..idx + 2).collect();
                                    if let Some(updates) = parse_event_block(&block) {
                                        if !updates.is_empty() {
                                            if let Err(error) = app.emit("hue-event", updates) {
                                                println!("WARN: failed to emit hue-event: {error}");
                                            }
                                        }
                                    }
                                }
                            }
                            Ok(None) => {
                                println!("DEBUG: event stream closed by bridge");
                                break;
                            }
                            Err(error) => {
                                println!("WARN: event stream read error: {error}");
                                break;
                            }
                        }
                    }
                }
                Err(error) => {
                    println!("WARN: event stream connection failed: {error}");
                }
            }

            if active.load(Ordering::Relaxed) {
                tokio::time::sleep(Duration::from_secs(3)).await;
            }
        }
    }
}

fn ensure_supported_resource_type(resource_type: &str) -> Result<(), String> {
    match resource_type {
        "light"
        | "room"
        | "zone"
        | "grouped_light"
        | "scene"
        | "smart_scene"
        | "device"
        | "button"
        | "relative_rotary"
        | "motion"
        | "camera_motion"
        | "temperature"
        | "light_level"
        | "contact"
        | "tamper"
        | "device_power"
        | "zigbee_connectivity"
        | "switch_input_configuration"
        | "device_discovery" => Ok(()),
        _ => Err(format!(
            "Hue resource type '{resource_type}' is not supported by this app."
        )),
    }
}

fn insert_v2_transition(body: &mut Map<String, Value>, transition_ms: Option<u32>) {
    if let Some(duration) = transition_ms {
        body.insert("dynamics".to_string(), json!({ "duration": duration }));
    }
}

fn scene_recall_body(action: &str, transition_ms: Option<u32>) -> Value {
    let mut recall = Map::new();
    recall.insert("action".to_string(), json!(action));
    if let Some(duration) = transition_ms {
        recall.insert("duration".to_string(), json!(duration));
    }
    let mut body = Map::new();
    body.insert("recall".to_string(), Value::Object(recall));
    Value::Object(body)
}

#[allow(dead_code)]
fn transition_ms_to_v1_transitiontime(transition_ms: u32) -> u32 {
    ((transition_ms as f64) / 100.0).round() as u32
}

#[allow(dead_code)]
fn brightness_pct_to_v1_bri(brightness_pct: f64) -> u8 {
    if brightness_pct <= 0.0 {
        return 0;
    }

    ((brightness_pct.clamp(0.0, 100.0) / 100.0) * 254.0)
        .round()
        .clamp(1.0, 254.0) as u8
}

fn scene_to_public(scene: HueSceneResource, fallback_type: &str) -> HueScene {
    let resource_type = scene
        .rtype
        .clone()
        .unwrap_or_else(|| fallback_type.to_string());
    let status = extract_scene_status(&scene.extra);
    // The bridge stores a `palette` on every scene — including a single-color
    // one for static scenes — so "has a palette" is not enough. A scene only
    // animates (and earns the play/speed controls) when its palette holds at
    // least two colors.
    let palette = scene.extra.get("palette");
    let dynamic_color_count = palette.map(palette_dynamic_color_count).unwrap_or(0);
    let speed = scene.extra.get("speed").and_then(Value::as_f64);
    let dynamic = resource_type == "scene" && dynamic_color_count >= 2;
    let auto_dynamic = scene
        .extra
        .get("auto_dynamic")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let smart = resource_type == "smart_scene";
    let group = scene.group.as_ref().map(|g| g.rid.clone());
    let scene_type = scene.group.as_ref().map(|g| g.rtype.clone());
    // Prefer the palette's colors for the preview bubble: for a dynamic scene
    // the per-light actions are only the static fallback and may all share one
    // color, whereas the palette is the set the bridge actually cycles.
    let palette_preview = if dynamic {
        palette.map(palette_colors).unwrap_or_default()
    } else {
        Vec::new()
    };
    let actions = scene
        .actions
        .into_iter()
        .filter_map(scene_action_to_public)
        .collect::<Vec<_>>();
    let colors = if palette_preview.is_empty() {
        actions
            .iter()
            .filter_map(|action| {
                action
                    .xy
                    .map(|xy| SceneColor {
                        xy: Some(xy),
                        mirek: None,
                    })
                    .or_else(|| {
                        action.mirek.map(|mirek| SceneColor {
                            xy: None,
                            mirek: Some(mirek),
                        })
                    })
            })
            .collect()
    } else {
        palette_preview
    };

    HueScene {
        id: scene.id,
        name: scene.metadata.name,
        resource_type,
        group,
        scene_type,
        status,
        dynamic,
        speed,
        auto_dynamic,
        smart,
        colors,
        actions,
    }
}

/// The number of swatches a scene's palette would animate through. The bridge
/// stores a single-swatch palette even on static scenes — and the built-in warm
/// scenes (Nightlight, Rest) pair a single `color` swatch with a single
/// `color_temperature` swatch so both color and white bulbs have a target — so
/// summing the two arrays would wrongly flag those static scenes as dynamic. A
/// scene only animates when one swatch *kind* on its own holds at least two
/// entries, so take the larger of the two counts rather than their sum.
fn palette_dynamic_color_count(palette: &Value) -> usize {
    let len = |key: &str| palette.get(key).and_then(Value::as_array).map_or(0, Vec::len);
    len("color").max(len("color_temperature"))
}

/// Extracts a palette's colors for the preview bubble: chromaticities from
/// `color[].color.xy` and color temperatures from
/// `color_temperature[].color_temperature.mirek`.
fn palette_colors(palette: &Value) -> Vec<SceneColor> {
    let mut colors = Vec::new();
    if let Some(items) = palette.get("color").and_then(Value::as_array) {
        for item in items {
            let x = item.pointer("/color/xy/x").and_then(Value::as_f64);
            let y = item.pointer("/color/xy/y").and_then(Value::as_f64);
            if let (Some(x), Some(y)) = (x, y) {
                colors.push(SceneColor {
                    xy: Some([x, y]),
                    mirek: None,
                });
            }
        }
    }
    if let Some(items) = palette.get("color_temperature").and_then(Value::as_array) {
        for item in items {
            if let Some(mirek) = item
                .pointer("/color_temperature/mirek")
                .and_then(Value::as_u64)
            {
                colors.push(SceneColor {
                    xy: None,
                    mirek: Some(mirek as u16),
                });
            }
        }
    }
    colors
}

fn scene_action_to_public(entry: HueSceneActionEntry) -> Option<SceneLightAction> {
    let target = entry.target?;
    if target.rtype != "light" {
        return None;
    }
    let action = entry.action?;
    Some(SceneLightAction {
        target_id: target.rid,
        on: action.on.as_ref().map(|on| on.on),
        brightness: action.dimming.as_ref().map(|dimming| dimming.brightness),
        xy: action.color.as_ref().map(|color| [color.xy.x, color.xy.y]),
        mirek: action.color_temperature.as_ref().and_then(|ct| ct.mirek),
        effect: action
            .effects
            .as_ref()
            .and_then(|effects| extract_effect_id(Some(effects))),
        effect_v2: action
            .effects_v2
            .as_ref()
            .and_then(|effects| extract_effect_id(Some(effects))),
    })
}

/// Default animation speed (0..1) for a freshly created dynamic gallery scene
/// when the caller doesn't specify one. 0.5 corresponds to step 4 of the UI's
/// 12-step scale, matching the gallery's default label.
const GALLERY_DYNAMIC_SPEED: f64 = 0.5;

/// Builds the `palette` object the bridge cycles when a scene plays
/// dynamically. Returns `None` for single-color presets, which stay static.
///
/// The v2 palette has three required arrays: `color` (up to 9 chromaticity
/// entries), `color_temperature` (at most 1), and `dimming` (at most 1). We
/// only treat a preset as dynamic when it yields at least two palette colors —
/// a one-color "palette" would animate to nothing.
fn gallery_palette(colors: &[HueSceneRecipeColor], brightness: f64) -> Option<Value> {
    let brightness = if brightness.is_finite() {
        brightness.clamp(1.0, 100.0)
    } else {
        100.0
    };

    let color_entries = colors
        .iter()
        .filter_map(|color| color.xy.and_then(sanitize_xy))
        .take(9)
        .map(|xy| {
            json!({
                "color": { "xy": { "x": xy[0], "y": xy[1] } },
                "dimming": { "brightness": brightness },
            })
        })
        .collect::<Vec<_>>();

    let ct_entries = colors
        .iter()
        .filter_map(|color| color.mirek)
        .take(1)
        .map(|mirek| {
            json!({
                "color_temperature": { "mirek": mirek },
                "dimming": { "brightness": brightness },
            })
        })
        .collect::<Vec<_>>();

    if color_entries.len() + ct_entries.len() < 2 {
        return None;
    }

    Some(json!({
        "color": color_entries,
        "dimming": [ { "brightness": brightness } ],
        "color_temperature": ct_entries,
    }))
}

fn gallery_scene_actions(
    lights: &[HueLightResource],
    colors: &[HueSceneRecipeColor],
    brightness: f64,
) -> (Vec<Value>, Vec<SceneLightAction>) {
    let brightness = if brightness.is_finite() {
        brightness.clamp(1.0, 100.0)
    } else {
        100.0
    };

    lights
        .iter()
        .enumerate()
        .map(|(index, light)| {
            gallery_light_scene_action(light, &colors[index % colors.len()], brightness)
        })
        .unzip()
}

fn gallery_light_scene_action(
    light: &HueLightResource,
    color: &HueSceneRecipeColor,
    brightness: f64,
) -> (Value, SceneLightAction) {
    let mut action = Map::new();
    action.insert("on".to_string(), json!({ "on": true }));

    let mut public = SceneLightAction {
        target_id: light.id.clone(),
        on: Some(true),
        brightness: None,
        xy: None,
        mirek: None,
        effect: None,
        effect_v2: None,
    };

    if light.dimming.is_some() {
        action.insert("dimming".to_string(), json!({ "brightness": brightness }));
        public.brightness = Some(brightness);
    }

    if let Some(mirek) = color.mirek {
        if let Some(color_temperature) = &light.color_temperature {
            let mirek = color_temperature
                .mirek_schema
                .as_ref()
                .map(|schema| mirek.clamp(schema.mirek_minimum, schema.mirek_maximum))
                .unwrap_or(mirek);
            action.insert("color_temperature".to_string(), json!({ "mirek": mirek }));
            public.mirek = Some(mirek);
        }
    }

    if public.mirek.is_none() {
        if let Some(xy) = color.xy.and_then(sanitize_xy) {
            if light.color.is_some() {
                action.insert(
                    "color".to_string(),
                    json!({ "xy": { "x": xy[0], "y": xy[1] } }),
                );
                public.xy = Some(xy);
            }
        }
    }

    (
        json!({
            "target": { "rid": light.id, "rtype": "light" },
            "action": action,
        }),
        public,
    )
}

fn sanitize_xy([x, y]: [f64; 2]) -> Option<[f64; 2]> {
    if !x.is_finite() || !y.is_finite() {
        return None;
    }
    Some([x.clamp(0.0, 1.0), y.clamp(0.0, 1.0)])
}

fn snapshot_scene_body(
    name: &str,
    group_id: &str,
    group_type: &str,
    lights: &[HueLightResource],
    include_effects: bool,
) -> Value {
    let actions = lights
        .iter()
        .map(|light| light_scene_action(light, include_effects))
        .collect::<Vec<_>>();
    json!({
        "type": "scene",
        "metadata": { "name": name },
        "group": { "rid": group_id, "rtype": group_type },
        "actions": actions,
    })
}

fn light_scene_action(light: &HueLightResource, include_effects: bool) -> Value {
    let mut action = Map::new();
    action.insert("on".to_string(), json!({ "on": light.on.on }));
    if let Some(dimming) = &light.dimming {
        action.insert(
            "dimming".to_string(),
            json!({ "brightness": dimming.brightness }),
        );
    }
    if let Some(color) = &light.color {
        action.insert(
            "color".to_string(),
            json!({ "xy": { "x": color.xy.x, "y": color.xy.y } }),
        );
    }
    if let Some(mirek) = light.color_temperature.as_ref().and_then(|ct| ct.mirek) {
        action.insert("color_temperature".to_string(), json!({ "mirek": mirek }));
    }
    if include_effects {
        if let Some(effect) = light.effects_v2.as_ref().and_then(|effects| {
            extract_effect_id(effects.status.as_ref().or(effects.action.as_ref()))
        }) {
            action.insert(
                "effects_v2".to_string(),
                json!({ "action": { "effect": effect } }),
            );
        } else if let Some(effect) = light
            .effects
            .as_ref()
            .and_then(|effects| effects.status.clone())
        {
            action.insert("effects".to_string(), json!({ "effect": effect }));
        }
    }

    json!({
        "target": { "rid": light.id, "rtype": "light" },
        "action": action,
    })
}

fn raw_resource_value(resource: &HueRawResource) -> Value {
    let mut object = resource.extra.clone();
    object.insert("id".to_string(), json!(resource.id.clone()));
    if let Some(rtype) = &resource.rtype {
        object.insert("type".to_string(), json!(rtype.clone()));
    }
    if let Some(owner) = &resource.owner {
        object.insert(
            "owner".to_string(),
            json!({ "rid": owner.rid.clone(), "rtype": owner.rtype.clone() }),
        );
    }
    if let Some(metadata) = &resource.metadata {
        object.insert(
            "metadata".to_string(),
            json!({
                "name": metadata.name.clone(),
                "archetype": metadata.archetype.clone(),
            }),
        );
    }
    if let Some(enabled) = resource.enabled {
        object.insert("enabled".to_string(), json!(enabled));
    }
    Value::Object(object)
}

fn device_public_map(devices: &[HueDeviceResource]) -> HashMap<String, (String, Option<String>)> {
    devices
        .iter()
        .map(|device| {
            let product = device.product_data.as_ref();
            let name = device
                .metadata
                .as_ref()
                .map(|metadata| metadata.name.clone())
                .filter(|name| !name.is_empty())
                .or_else(|| product.and_then(|product| product.product_name.clone()))
                .unwrap_or_else(|| "Hue device".to_string());
            (
                device.id.clone(),
                (
                    name,
                    product.and_then(|product| product.product_name.clone()),
                ),
            )
        })
        .collect()
}

fn reachable_public_map(resources: &[HueZigbeeConnectivityResource]) -> HashMap<String, bool> {
    resources
        .iter()
        .map(|resource| {
            (
                resource.owner.rid.clone(),
                resource
                    .status
                    .as_deref()
                    .map(zigbee_status_is_reachable)
                    .unwrap_or(true),
            )
        })
        .collect()
}

fn extract_scene_status(extra: &Map<String, Value>) -> Option<String> {
    extra
        .get("status")
        .and_then(value_to_compact_string)
        .or_else(|| extra.get("state").and_then(value_to_compact_string))
        .or_else(|| extra.get("recall").and_then(value_to_compact_string))
}

fn extract_effect_id(value: Option<&Value>) -> Option<String> {
    let value = value?;
    if let Some(text) = value.as_str() {
        return Some(text.to_string());
    }
    if let Some(object) = value.as_object() {
        for key in ["effect", "status", "active", "active_effect", "action"] {
            if let Some(found) = object.get(key).and_then(|entry| {
                entry
                    .as_str()
                    .map(ToString::to_string)
                    .or_else(|| extract_effect_id(Some(entry)))
            }) {
                return Some(found);
            }
        }
    }
    None
}

fn summarize_resource_value(raw: &Value) -> Option<String> {
    let rtype = raw.get("type").and_then(Value::as_str).unwrap_or_default();
    match rtype {
        "button" => find_nested_string(raw, "last_event")
            .or_else(|| find_nested_string(raw, "event"))
            .map(humanize_hue_value),
        "relative_rotary" => find_nested_string(raw, "last_event")
            .or_else(|| find_nested_string(raw, "action"))
            .map(humanize_hue_value),
        "motion" | "camera_motion" => find_nested_bool(raw, "motion")
            .map(|motion| if motion { "Motion" } else { "No motion" }.to_string()),
        "temperature" => find_nested_number(raw, "temperature")
            .map(|value| format!("{:.1} °C", normalize_temperature(value))),
        "light_level" => find_nested_number(raw, "light_level")
            .or_else(|| find_nested_number(raw, "light_level_report"))
            .map(|value| format!("{value:.0}")),
        "contact" => find_nested_string(raw, "state").or_else(|| {
            find_nested_bool(raw, "contact").map(|closed| {
                if closed {
                    "Closed".to_string()
                } else {
                    "Open".to_string()
                }
            })
        }),
        "tamper" => find_nested_string(raw, "state").or_else(|| {
            find_nested_bool(raw, "tampered").map(|tampered| {
                if tampered {
                    "Tampered".to_string()
                } else {
                    "Clear".to_string()
                }
            })
        }),
        "device_power" => find_nested_number(raw, "battery_level")
            .map(|value| format!("Battery {value:.0}%"))
            .or_else(|| find_nested_string(raw, "battery_state").map(humanize_hue_value)),
        "scene" => raw
            .get("status")
            .and_then(value_to_compact_string)
            .or_else(|| raw.get("recall").and_then(value_to_compact_string)),
        "smart_scene" => find_nested_string(raw, "state")
            .map(humanize_hue_value)
            .or_else(|| raw.get("recall").and_then(value_to_compact_string)),
        _ => None,
    }
}

fn extract_updated(raw: &Value) -> Option<String> {
    find_nested_string(raw, "last_updated")
        .or_else(|| find_nested_string(raw, "updated"))
        .or_else(|| find_nested_string(raw, "time"))
}

fn extract_mode(raw: &Value) -> Option<String> {
    find_nested_string(raw, "mode")
        .or_else(|| find_nested_string(raw, "device_mode"))
        .or_else(|| find_nested_string(raw, "switch_mode"))
        .map(humanize_hue_value)
}

fn value_to_compact_string(value: &Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        return Some(humanize_hue_value(text.to_string()));
    }
    if let Some(bool_value) = value.as_bool() {
        return Some(if bool_value { "Active" } else { "Inactive" }.to_string());
    }
    if let Some(number) = value.as_f64() {
        return Some(format!("{number:.0}"));
    }
    if let Some(object) = value.as_object() {
        for key in ["status", "state", "action", "active"] {
            if let Some(found) = object.get(key).and_then(value_to_compact_string) {
                return Some(found);
            }
        }
    }
    None
}

fn find_nested_string(value: &Value, key: &str) -> Option<String> {
    match value {
        Value::Object(object) => {
            if let Some(found) = object.get(key).and_then(Value::as_str) {
                return Some(found.to_string());
            }
            object
                .values()
                .find_map(|nested| find_nested_string(nested, key))
        }
        Value::Array(items) => items
            .iter()
            .find_map(|nested| find_nested_string(nested, key)),
        _ => None,
    }
}

fn find_nested_bool(value: &Value, key: &str) -> Option<bool> {
    match value {
        Value::Object(object) => {
            if let Some(found) = object.get(key).and_then(Value::as_bool) {
                return Some(found);
            }
            object
                .values()
                .find_map(|nested| find_nested_bool(nested, key))
        }
        Value::Array(items) => items
            .iter()
            .find_map(|nested| find_nested_bool(nested, key)),
        _ => None,
    }
}

fn find_nested_number(value: &Value, key: &str) -> Option<f64> {
    match value {
        Value::Object(object) => {
            if let Some(found) = object.get(key).and_then(Value::as_f64) {
                return Some(found);
            }
            object
                .values()
                .find_map(|nested| find_nested_number(nested, key))
        }
        Value::Array(items) => items
            .iter()
            .find_map(|nested| find_nested_number(nested, key)),
        _ => None,
    }
}

fn normalize_temperature(value: f64) -> f64 {
    if value.abs() > 100.0 {
        value / 100.0
    } else {
        value
    }
}

fn humanize_hue_value(value: String) -> String {
    let mut result = String::new();
    for (index, part) in value.split('_').filter(|part| !part.is_empty()).enumerate() {
        if index > 0 {
            result.push(' ');
        }
        let mut chars = part.chars();
        if let Some(first) = chars.next() {
            result.extend(first.to_uppercase());
            result.push_str(chars.as_str());
        }
    }
    if result.is_empty() {
        value
    } else {
        result
    }
}

fn bridge_matches(left: &str, right: &str) -> bool {
    left.eq_ignore_ascii_case(right)
}

/// Normalizes a discovered address into a URL host: strips any IPv6 zone id
/// (`%scope`) and wraps IPv6 literals in brackets.
fn format_host(ip: &str) -> String {
    let clean_ip = ip.split('%').next().unwrap_or(ip);
    if clean_ip.contains(':') {
        format!("[{clean_ip}]")
    } else {
        clean_ip.to_string()
    }
}

fn disconnected_session(
    configured: bool,
    bridge_id: Option<String>,
    bridge_ip: Option<String>,
    application_key: Option<String>,
    error: Option<String>,
) -> HueSession {
    HueSession {
        configured,
        connected: false,
        bridge_id,
        bridge_ip,
        application_key,
        error,
    }
}

/// Parses one SSE message block into the flat list of resource changes the
/// frontend cares about. The `data:` payload is a JSON array of event
/// containers, each holding a `data` array of changed resources.
fn parse_event_block(block: &str) -> Option<Vec<HueEventUpdate>> {
    let mut payload = String::new();
    for line in block.lines() {
        if let Some(rest) = line.strip_prefix("data:") {
            payload.push_str(rest.trim_start());
        }
    }

    if payload.is_empty() {
        return None;
    }

    let containers = serde_json::from_str::<Vec<EventContainer>>(&payload).ok()?;
    let mut updates = Vec::new();
    for container in containers {
        let event_type = container.event_type;
        for resource in container.data {
            let rtype = resource
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let id = resource
                .get("id")
                .and_then(Value::as_str)
                .map(ToString::to_string);
            let xy = resource
                .pointer("/color/xy")
                .and_then(|xy| Some([xy.get("x")?.as_f64()?, xy.get("y")?.as_f64()?]));
            let mirek = resource
                .pointer("/color_temperature/mirek")
                .and_then(Value::as_u64)
                .and_then(|value| u16::try_from(value).ok());
            let color_mode = if resource
                .pointer("/color_temperature/mirek_valid")
                .and_then(Value::as_bool)
                .unwrap_or(false)
                && mirek.is_some()
            {
                Some("ct".to_string())
            } else if xy.is_some() {
                Some("xy".to_string())
            } else {
                None
            };
            updates.push(HueEventUpdate {
                event_type: event_type.clone(),
                rtype,
                id,
                on: resource.pointer("/on/on").and_then(Value::as_bool),
                brightness: resource
                    .pointer("/dimming/brightness")
                    .and_then(Value::as_f64),
                xy,
                mirek,
                color_mode,
                effect: resource
                    .get("effects")
                    .and_then(|effects| {
                        effects
                            .get("status")
                            .and_then(Value::as_str)
                            .or_else(|| effects.get("effect").and_then(Value::as_str))
                    })
                    .map(ToString::to_string),
                effect_v2: resource.get("effects_v2").and_then(|effects| {
                    extract_effect_id(
                        effects
                            .get("status")
                            .or_else(|| effects.get("action"))
                            .or(Some(effects)),
                    )
                }),
                speed: resource
                    .get("speed")
                    .and_then(Value::as_f64)
                    .or_else(|| resource.pointer("/dynamics/speed").and_then(Value::as_f64)),
                auto_dynamic: resource.get("auto_dynamic").and_then(Value::as_bool),
                value: summarize_resource_value(&resource),
            });
        }
    }

    Some(updates)
}

fn zigbee_status_is_reachable(status: &str) -> bool {
    matches!(status, "connected")
}

fn parse_hue_qr_install_code(qr_text: &str) -> Result<HueQrInstallCode, String> {
    let trimmed = qr_text.trim();
    if !trimmed.starts_with("HUE:") {
        return Err("That QR code is not a Hue Zigbee QR code.".to_string());
    }

    let mut install_code: Option<String> = None;
    let mut mac_address: Option<String> = None;
    for part in trimmed.split_whitespace() {
        if let Some(value) = part
            .strip_prefix("HUE:Z:")
            .or_else(|| part.strip_prefix("Z:"))
        {
            install_code = Some(value.to_ascii_uppercase());
        } else if let Some(value) = part.strip_prefix("M:") {
            mac_address = Some(value.to_ascii_uppercase());
        }
    }

    let install_code =
        install_code.ok_or_else(|| "Hue QR code is missing a Zigbee install code.".to_string())?;
    let mac_address =
        mac_address.ok_or_else(|| "Hue QR code is missing a Zigbee MAC address.".to_string())?;

    if install_code.len() != 36 || !install_code.chars().all(|char| char.is_ascii_hexdigit()) {
        return Err("Hue QR install code must be 36 hexadecimal characters.".to_string());
    }
    if mac_address.len() != 16 || !mac_address.chars().all(|char| char.is_ascii_hexdigit()) {
        return Err("Hue QR MAC address must be 16 hexadecimal characters.".to_string());
    }

    Ok(HueQrInstallCode {
        mac_address,
        install_code,
    })
}

fn normalize_hue_serial(serial: &str) -> Result<String, String> {
    let normalized = serial
        .trim()
        .chars()
        .filter(|char| !char.is_whitespace() && *char != '-' && *char != ':')
        .collect::<String>()
        .to_ascii_uppercase();
    if normalized.is_empty() {
        return Err("Enter a Hue device serial number.".to_string());
    }
    if normalized.len() > 32 || !normalized.chars().all(|char| char.is_ascii_alphanumeric()) {
        return Err("Hue serial number should contain only letters and numbers.".to_string());
    }
    Ok(normalized)
}

/// Buckets a device by its v2 service types for UI grouping. Lights take
/// precedence, then switches/remotes (buttons and rotary dials), then sensors.
/// Returns `None` for devices that are neither (e.g. the bridge itself).
fn device_kind(service_types: &[&str]) -> Option<&'static str> {
    if service_types.contains(&"light") {
        Some("light")
    } else if service_types
        .iter()
        .any(|rtype| matches!(*rtype, "button" | "relative_rotary"))
    {
        Some("switch")
    } else if service_types.iter().any(|rtype| {
        matches!(
            *rtype,
            "motion" | "camera_motion" | "temperature" | "light_level" | "contact" | "tamper"
        )
    }) {
        Some("sensor")
    } else {
        None
    }
}

fn extract_hue_username(value: &Value) -> Result<String, String> {
    let array = value
        .as_array()
        .ok_or_else(|| "Unexpected pairing response from bridge".to_string())?;
    for item in array {
        if let Ok(success) = serde_json::from_value::<PairSuccessResponse>(item.clone()) {
            return Ok(success.success.username);
        }
        if let Ok(error) = serde_json::from_value::<PairErrorResponse>(item.clone()) {
            return Err(format!(
                "Hue error {}: {}",
                error.error.error_type, error.error.description
            ));
        }
    }
    Err("Unexpected pairing response from bridge".to_string())
}

fn save_bridge_info<R: Runtime>(
    app: &AppHandle<R>,
    bridge: &StoredBridgeInfo,
) -> Result<(), String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|error| format!("Failed to open bridge store: {error}"))?;
    store.set(
        STORE_KEY,
        serde_json::to_value(bridge)
            .map_err(|error| format!("Invalid bridge store data: {error}"))?,
    );
    store
        .save()
        .map_err(|error| format!("Failed to save bridge store: {error}"))
}

fn load_bridge_info<R: Runtime>(app: &AppHandle<R>) -> Result<Option<StoredBridgeInfo>, String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|error| format!("Failed to open bridge store: {error}"))?;
    let Some(value) = store.get(STORE_KEY) else {
        return Ok(None);
    };
    if value.is_null() {
        return Ok(None);
    }
    serde_json::from_value::<StoredBridgeInfo>(value.clone())
        .map(Some)
        .map_err(|error| format!("Failed to read bridge store: {error}"))
}

fn clear_bridge_info<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let store = app
        .store(STORE_FILE)
        .map_err(|error| format!("Failed to open bridge store: {error}"))?;
    store.delete(STORE_KEY);
    store
        .save()
        .map_err(|error| format!("Failed to clear bridge store: {error}"))
}

fn keyring_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
        .map_err(|error| format!("Failed to access secure keyring: {error}"))
}

/// In-memory cache of the application key. The OS keyring read (Windows
/// Credential Manager `CredRead`, etc.) is a blocking syscall, and control
/// commands resolve the key on every call — caching keeps that off the hot path
/// so dimming/toggling isn't gated on keyring latency.
fn app_key_cache() -> &'static Mutex<Option<String>> {
    static CACHE: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

fn save_application_key(application_key: &str) -> Result<(), String> {
    keyring_entry()?
        .set_password(application_key)
        .map_err(|error| format!("Failed to save application key: {error}"))?;
    *app_key_cache().lock().unwrap() = Some(application_key.to_string());
    Ok(())
}

fn load_application_key() -> Result<Option<String>, String> {
    if let Some(key) = app_key_cache().lock().unwrap().clone() {
        return Ok(Some(key));
    }
    match keyring_entry()?.get_password() {
        Ok(password) => {
            *app_key_cache().lock().unwrap() = Some(password.clone());
            Ok(Some(password))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("Failed to read application key: {error}")),
    }
}

fn clear_application_key() -> Result<(), String> {
    *app_key_cache().lock().unwrap() = None;
    match keyring_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("Failed to clear application key: {error}")),
    }
}
