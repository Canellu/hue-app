use keyring::Entry;
use mdns_sd::{ServiceDaemon, ServiceEvent};
use reqwest::Client;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_store::StoreExt;

const DISCOVERY_URL: &str = "https://discovery.meethue.com/";
const STORE_FILE: &str = "hue-store.json";
const STORE_KEY: &str = "bridge";
const KEYRING_SERVICE: &str = "com.anton.hue-app";
const KEYRING_ACCOUNT: &str = "hue-application-key";
const DEVICE_TYPE: &str = "hue-app#desktop";
const REQUEST_TIMEOUT_SECS: u64 = 8;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredBridge {
    pub bridge_id: String,
    pub bridge_ip: String,
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
    /// The grouped_light resource that controls this room's on/brightness.
    pub grouped_light_id: Option<String>,
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
    /// The grouped_light resource that controls this zone's on/brightness.
    pub grouped_light_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HueScene {
    pub id: String,
    pub name: String,
    /// The room/zone UUID this scene targets.
    pub group: Option<String>,
    pub scene_type: Option<String>,
    /// Preset color palette from the scene's per-light actions. Each entry
    /// carries either an `xy` chromaticity or a `mirek` color temperature.
    pub colors: Vec<SceneColor>,
}

/// One color from a scene action — exactly one of `xy`/`mirek` is set.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SceneColor {
    pub xy: Option<[f64; 2]>,
    pub mirek: Option<u16>,
}

/// A single resource change pushed to the frontend from the event stream.
/// `brightness` is the dimming percentage (0–100).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HueEventUpdate {
    #[serde(rename = "type")]
    pub rtype: String,
    pub id: Option<String>,
    pub on: Option<bool>,
    pub brightness: Option<f64>,
    /// Live CIE xy chromaticity, when the change includes a color.
    pub xy: Option<[f64; 2]>,
    /// Live color temperature in mireds, when the change includes one.
    pub mirek: Option<u16>,
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
    product_data: Option<HueProductData>,
    #[serde(default)]
    services: Vec<HueResourceRef>,
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
struct HueSceneResource {
    id: String,
    metadata: HueMetadata,
    #[serde(default)]
    group: Option<HueResourceRef>,
    #[serde(default)]
    actions: Vec<HueSceneActionEntry>,
}

#[derive(Debug, Deserialize)]
struct HueSceneActionEntry {
    #[serde(default)]
    action: Option<HueSceneAction>,
}

#[derive(Debug, Deserialize)]
struct HueSceneAction {
    #[serde(default)]
    color: Option<HueColor>,
    #[serde(default)]
    color_temperature: Option<HueColorTemperature>,
}

// ---------------------------------------------------------------------------
// Event stream parsing structs.
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct EventContainer {
    #[serde(default)]
    data: Vec<EventResource>,
}

#[derive(Debug, Deserialize)]
struct EventResource {
    #[serde(rename = "type", default)]
    rtype: Option<String>,
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    on: Option<HueOn>,
    #[serde(default)]
    dimming: Option<HueDimming>,
    #[serde(default)]
    color: Option<HueColor>,
    #[serde(default)]
    color_temperature: Option<HueColorTemperature>,
}

// ---------------------------------------------------------------------------
// Pairing (CLIP link-button) response structs — the only non-v2/resource call.
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct DiscoveryBridgeResponse {
    id: String,
    internalipaddress: String,
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
    pub fn new() -> Result<Self, String> {
        let client = Client::builder()
            .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .danger_accept_invalid_certs(true)
            .build()
            .map_err(|error| format!("Failed to create HTTP client: {error}"))?;

        Ok(Self { client })
    }

    /// Client tuned for the long-lived event stream: no request timeout so the
    /// connection can stay open indefinitely.
    pub fn new_streaming() -> Result<Self, String> {
        let client = Client::builder()
            .danger_accept_invalid_certs(true)
            .build()
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
        let text = self
            .client
            .get(&url)
            .header("hue-application-key", application_key)
            .send()
            .await
            .map_err(|error| format!("Failed to fetch {resource}: {error}"))?
            .text()
            .await
            .map_err(|error| format!("Failed to read {resource} response: {error}"))?;

        let response = serde_json::from_str::<HueApiResponse<T>>(&text)
            .map_err(|error| format!("Invalid {resource} response: {error}"))?;
        if let Some(error) = response.errors.first() {
            return Err(format!("Hue bridge error: {}", error.description));
        }
        Ok(response.data)
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
        let text = self
            .client
            .put(&url)
            .header("hue-application-key", application_key)
            .json(&body)
            .send()
            .await
            .map_err(|error| format!("Failed to update {resource}: {error}"))?
            .text()
            .await
            .map_err(|error| format!("Failed to read {resource} update response: {error}"))?;

        let response = serde_json::from_str::<HueApiResponse<Value>>(&text)
            .map_err(|error| format!("Invalid {resource} update response: {error}"))?;
        if let Some(error) = response.errors.first() {
            return Err(format!("Hue bridge error: {}", error.description));
        }
        Ok(())
    }

    // ---- Discovery & pairing ------------------------------------------------

    pub async fn discover_bridges(&self) -> Result<Vec<DiscoveredBridge>, String> {
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
            })
            .collect())
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
                        });
                    }
                }
            }
        }
        Ok(bridges)
    }

    pub async fn pair_bridge(&self, ip: &str) -> Result<(StoredBridgeInfo, String), String> {
        let clean_ip = ip.split('%').next().unwrap_or(ip);
        let formatted_ip = if clean_ip.contains(':') {
            format!("[{}]", clean_ip)
        } else {
            clean_ip.to_string()
        };

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
                let effect = light.effects.as_ref().and_then(|e| e.status.clone());

                let archetype = light.metadata.archetype.clone();

                HueLight {
                    id: light.id,
                    name: light.metadata.name,
                    is_on: light.on.on,
                    brightness: light.dimming.as_ref().map(|d| d.brightness),
                    reachable,
                    color_mode,
                    xy,
                    ct,
                    effect,
                    effects,
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
                }
            })
            .collect())
    }

    pub async fn set_light_state(
        &self,
        ip: &str,
        application_key: &str,
        id: &str,
        on: bool,
        brightness: Option<f64>,
    ) -> Result<(), String> {
        let mut body = Map::new();
        body.insert("on".to_string(), json!({ "on": on }));
        if let Some(value) = brightness {
            body.insert("dimming".to_string(), json!({ "brightness": value }));
        }
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
    ) -> Result<(), String> {
        let mut body = Map::new();
        body.insert("on".to_string(), json!({ "on": true }));
        if let Some([x, y]) = xy {
            body.insert("color".to_string(), json!({ "xy": { "x": x, "y": y } }));
        }
        if let Some(value) = ct {
            body.insert("color_temperature".to_string(), json!({ "mirek": value }));
        }
        if let Some(value) = effect {
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
        let grouped_map: HashMap<String, &HueGroupedLightResource> =
            grouped.iter().map(|g| (g.id.clone(), g)).collect();

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

                let light_ids = room
                    .children
                    .iter()
                    .filter(|child| child.rtype == "device")
                    .flat_map(|child| device_lights.get(&child.rid).cloned().unwrap_or_default())
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
                    grouped_light_id,
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
                    grouped_light_id,
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
        on: bool,
        brightness: Option<f64>,
    ) -> Result<(), String> {
        let mut body = Map::new();
        body.insert("on".to_string(), json!({ "on": on }));
        if let Some(value) = brightness {
            body.insert("dimming".to_string(), json!({ "brightness": value }));
        }
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
        Ok(scenes
            .into_iter()
            .map(|scene| {
                let colors = scene
                    .actions
                    .into_iter()
                    .filter_map(|entry| entry.action)
                    .filter_map(|action| {
                        if let Some(color) = action.color {
                            Some(SceneColor {
                                xy: Some([color.xy.x, color.xy.y]),
                                mirek: None,
                            })
                        } else if let Some(mirek) = action.color_temperature.and_then(|ct| ct.mirek)
                        {
                            Some(SceneColor {
                                xy: None,
                                mirek: Some(mirek),
                            })
                        } else {
                            None
                        }
                    })
                    .collect();
                HueScene {
                    id: scene.id,
                    name: scene.metadata.name,
                    group: scene.group.as_ref().map(|g| g.rid.clone()),
                    scene_type: scene.group.map(|g| g.rtype),
                    colors,
                }
            })
            .collect())
    }

    pub async fn activate_scene(
        &self,
        ip: &str,
        application_key: &str,
        scene_id: &str,
    ) -> Result<(), String> {
        let body = json!({ "recall": { "action": "active" } });
        self.put_v2(ip, application_key, "scene", scene_id, body)
            .await
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

fn bridge_matches(left: &str, right: &str) -> bool {
    left.eq_ignore_ascii_case(right)
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
        for resource in container.data {
            updates.push(HueEventUpdate {
                rtype: resource.rtype.unwrap_or_default(),
                id: resource.id,
                on: resource.on.map(|state| state.on),
                brightness: resource.dimming.map(|state| state.brightness),
                xy: resource.color.map(|c| [c.xy.x, c.xy.y]),
                mirek: resource.color_temperature.and_then(|c| c.mirek),
            });
        }
    }

    Some(updates)
}

fn zigbee_status_is_reachable(status: &str) -> bool {
    matches!(status, "connected")
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

fn save_application_key(application_key: &str) -> Result<(), String> {
    keyring_entry()?
        .set_password(application_key)
        .map_err(|error| format!("Failed to save application key: {error}"))
}

fn load_application_key() -> Result<Option<String>, String> {
    match keyring_entry()?.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("Failed to read application key: {error}")),
    }
}

fn clear_application_key() -> Result<(), String> {
    match keyring_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("Failed to clear application key: {error}")),
    }
}
