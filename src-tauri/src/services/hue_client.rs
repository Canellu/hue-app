use keyring::Entry;
use mdns_sd::{ServiceDaemon, ServiceEvent};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{BTreeMap, HashMap};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

const DISCOVERY_URL: &str = "https://discovery.meethue.com/";
const STORE_FILE: &str = "hue-store.json";
const STORE_KEY: &str = "bridge";
const KEYRING_SERVICE: &str = "com.anton.hue-app";
const KEYRING_ACCOUNT: &str = "hue-application-key";
const DEVICE_TYPE: &str = "hue-app#desktop";
const REQUEST_TIMEOUT_SECS: u64 = 4;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HueLight {
    pub id: String,
    pub name: String,
    pub is_on: bool,
    pub brightness: Option<u8>,
    pub reachable: bool,
}

#[derive(Debug, Deserialize)]
struct HueLightResponse {
    name: String,
    state: HueLightState,
    #[serde(default)]
    reachable: bool,
}

#[derive(Debug, Deserialize)]
struct HueLightState {
    on: bool,
    bri: Option<u8>,
}

#[derive(Debug, Deserialize)]
struct ZigbeeConnectivityList {
    data: Vec<ZigbeeConnectivityResource>,
}

#[derive(Debug, Deserialize)]
struct ZigbeeConnectivityResource {
    id: String,
    status: String,
    owner: Option<ResourceOwner>,
    #[serde(default)]
    id_v1: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ResourceOwner {
    rid: String,
    rtype: String,
}

#[derive(Debug, Deserialize)]
struct DiscoveryBridgeResponse {
    id: String,
    internalipaddress: String,
}

#[derive(Debug, Deserialize)]
struct BridgeConfigResponse {
    bridgeid: String,
}

#[derive(Debug, Deserialize)]
struct HueErrorResponse {
    error: HueErrorDetail,
}

#[derive(Debug, Deserialize)]
struct HueErrorDetail {
    #[serde(rename = "type")]
    error_type: u32,
    description: String,
}

#[derive(Debug, Deserialize)]
struct HueSuccessResponse {
    success: HueUsernameResponse,
}

#[derive(Debug, Deserialize)]
struct HueUsernameResponse {
    username: String,
}

pub struct HueClient {
    client: Client,
}

impl HueClient {
    pub fn new() -> Result<Self, String> {
        let client = Client::builder()
            .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .build()
            .map_err(|error| format!("Failed to create HTTP client: {error}"))?;

        Ok(Self { client })
    }

    pub async fn discover_bridges(&self) -> Result<Vec<DiscoveredBridge>, String> {
        println!("DEBUG: Starting discovery...");
        
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
        let body = response
            .text()
            .await
            .map_err(|error| format!("Bridge discovery returned an unreadable response: {error}"))?;

        if !status.is_success() {
            if status.as_u16() == 429 {
                return Err("Hue discovery is rate limited right now. Please wait a moment and try again.".to_string());
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
                        let id = info.get_fullname().split('.').next()
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

        let url = format!("http://{}/api", formatted_ip);
        let payload = serde_json::json!({ "devicetype": DEVICE_TYPE });

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
        let config = self.fetch_bridge_config(&formatted_ip, &username).await?;

        Ok((
            StoredBridgeInfo {
                bridge_id: config.bridgeid.to_uppercase(),
                bridge_ip: ip.to_string(),
                application_key: Some(username.clone()),
            },
            username,
        ))
    }

    pub async fn restore_session<R: Runtime>(&self, app: &AppHandle<R>) -> Result<HueSession, String> {
        let stored_bridge = match load_bridge_info(app)? {
            Some(bridge) => bridge,
            None => {
                let _ = clear_application_key();
                return Ok(HueSession {
                    configured: false,
                    connected: false,
                    bridge_id: None,
                    bridge_ip: None,
                    application_key: None,
                    error: None,
                });
            }
        };

        let application_key = match load_application_key() {
            Ok(Some(key)) => key,
            Ok(None) => {
                if let Some(key) = stored_bridge.application_key.clone() {
                    key
                } else {
                    clear_bridge_info(app)?;
                    return Ok(HueSession {
                        configured: false,
                        connected: false,
                        bridge_id: None,
                        bridge_ip: None,
                        application_key: None,
                        error: None,
                    });
                }
            }
            Err(error) => {
                println!("WARN: keyring lookup failed during restore: {error}");
                if let Some(key) = stored_bridge.application_key.clone() {
                    key
                } else {
                    clear_bridge_info(app)?;
                    return Ok(HueSession {
                        configured: false,
                        connected: false,
                        bridge_id: None,
                        bridge_ip: None,
                        application_key: None,
                        error: None,
                    });
                }
            }
        };

        if let Ok(config) = self.fetch_bridge_config(&stored_bridge.bridge_ip, &application_key).await {
            if bridge_matches(&config.bridgeid, &stored_bridge.bridge_id) {
                return Ok(HueSession {
                    configured: true,
                    connected: true,
                    bridge_id: Some(config.bridgeid.to_uppercase()),
                    bridge_ip: Some(stored_bridge.bridge_ip),
                    application_key: Some(application_key.clone()),
                    error: None,
                });
            }
        }

        let rediscovered_bridge = self.discover_bridges().await?.into_iter().find(|bridge| bridge_matches(&bridge.bridge_id, &stored_bridge.bridge_id));

        if let Some(bridge) = rediscovered_bridge {
            if let Ok(config) = self.fetch_bridge_config(&bridge.bridge_ip, &application_key).await {
                if bridge_matches(&config.bridgeid, &stored_bridge.bridge_id) {
                    let updated_bridge = StoredBridgeInfo {
                        bridge_id: config.bridgeid.to_uppercase(),
                        bridge_ip: bridge.bridge_ip.clone(),
                        application_key: stored_bridge.application_key.clone(),
                    };
                    save_bridge_info(app, &updated_bridge)?;
                    return Ok(HueSession {
                    configured: true,
                    connected: true,
                    bridge_id: Some(updated_bridge.bridge_id),
                    bridge_ip: Some(updated_bridge.bridge_ip),
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

    pub async fn save_session<R: Runtime>(&self, app: &AppHandle<R>, bridge: &StoredBridgeInfo, application_key: &str) -> Result<HueSession, String> {
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

    async fn fetch_bridge_config(&self, ip: &str, application_key: &str) -> Result<BridgeConfigResponse, String> {
        let url = format!("http://{ip}/api/{application_key}/config");
        let response = self.client.get(&url).send().await.map_err(|error| format!("Bridge request failed: {error}"))?;
        let json = response.json::<Value>().await.map_err(|error| format!("Invalid bridge response: {error}"))?;
        if let Some(hue_error) = parse_hue_error(&json) { return Err(format_hue_error(hue_error)); }
        serde_json::from_value::<BridgeConfigResponse>(json).map_err(|error| format!("Invalid bridge config response: {error}"))
    }

    pub fn get_stored_bridge<R: Runtime>(&self, app: &AppHandle<R>) -> Result<StoredBridgeInfo, String> {
        load_bridge_info(app)?.ok_or_else(|| "No stored bridge information found. Please pair a Hue bridge.".to_string())
    }

    pub fn get_stored_application_key<R: Runtime>(&self, app: &AppHandle<R>) -> Result<String, String> {
        match load_application_key() {
            Ok(Some(key)) => Ok(key),
            Ok(None) | Err(_) => {
                if let Err(error) = load_application_key() {
                    println!("WARN: keyring lookup failed while resolving application key: {error}");
                }
                let stored_bridge = load_bridge_info(app)?.ok_or_else(|| "No stored bridge information found. Please pair a Hue bridge.".to_string())?;
                stored_bridge.application_key.ok_or_else(|| "No Hue application key found. Please re-pair your Hue bridge.".to_string())
            }
        }
    }

    async fn get_light_resources(&self, ip: &str, application_key: &str) -> Result<Vec<ZigbeeConnectivityResource>, String> {
        let url = format!("https://{ip}/clip/v2/resource/zigbee_connectivity");
        let response = self
            .client
            .get(&url)
            .header("hue-application-key", application_key)
            .send()
            .await
            .map_err(|error| format!("Failed to fetch zigbee connectivity: {error}"))?;

        let status = response.status();
        let text = response
            .text()
            .await
            .map_err(|error| format!("Failed to read zigbee connectivity body: {error}"))?;

        println!("DEBUG: zigbee_connectivity HTTP {status} for {ip}");
        println!("DEBUG: zigbee_connectivity raw body: {text}");

        let json = serde_json::from_str::<Value>(&text)
            .map_err(|error| format!("Invalid zigbee connectivity response JSON: {error}"))?;

        println!("DEBUG: zigbee_connectivity response for {ip} = {json:#}");

        if let Some(hue_error) = parse_hue_error(&json) {
            return Err(format_hue_error(hue_error));
        }

        let list = serde_json::from_value::<ZigbeeConnectivityList>(json)
            .map_err(|error| format!("Invalid zigbee connectivity payload: {error}"))?;
        Ok(list.data)
    }

    fn light_id_from_owner(owner: &Option<ResourceOwner>) -> Option<String> {
        owner.as_ref().and_then(|owner| {
            let rid = owner.rid.as_str();
            if let Some(light_id) = rid.strip_prefix("light:") {
                return Some(light_id.to_string());
            }
            if let Some(light_id) = rid.strip_prefix("light/") {
                return Some(light_id.to_string());
            }
            if owner.rtype == "light" {
                return rid.split(':').last().map(|id| id.to_string());
            }
            None
        })
    }

    pub async fn get_lights(&self, ip: &str, application_key: &str) -> Result<Vec<HueLight>, String> {
        let lights_url = format!("http://{ip}/api/{application_key}/lights");
        let response = self
            .client
            .get(&lights_url)
            .send()
            .await
            .map_err(|error| format!("Failed to fetch lights: {error}"))?;
        let json = response
            .json::<Value>()
            .await
            .map_err(|error| format!("Invalid lights response: {error}"))?;
        if let Some(hue_error) = parse_hue_error(&json) {
            return Err(format_hue_error(hue_error));
        }

        let light_map = serde_json::from_value::<BTreeMap<String, HueLightResponse>>(json)
            .map_err(|error| format!("Invalid lights payload: {error}"))?;

        let resources = self.get_light_resources(ip, application_key).await.unwrap_or_default();
        let statuses: HashMap<String, String> = resources
            .into_iter()
            .filter_map(|resource| {
                // Prefer the bridge-provided v1 mapping when available (e.g. "/lights/38").
                if let Some(id_v1) = resource.id_v1.as_ref() {
                    if let Some(stripped) = id_v1.strip_prefix("/lights/") {
                        let status_string = resource.status.to_lowercase();
                        println!(
                            "DEBUG: mapped zigbee resource id={} id_v1={} -> light_id={} status={}",
                            resource.id,
                            id_v1,
                            stripped,
                            status_string,
                        );
                        return Some((stripped.to_string(), status_string));
                    }
                }

                // Fallback: try to extract a light id from the owner info.
                Self::light_id_from_owner(&resource.owner).map(|light_id| {
                    let status_string = resource.status.to_lowercase();
                    println!(
                        "DEBUG: mapped zigbee resource id={} owner={:?} -> light_id={} status={}",
                        resource.id,
                        resource.owner,
                        light_id,
                        status_string,
                    );
                    (light_id, status_string)
                })
            })
            .collect();

        // Debug: print available v1 light IDs and the computed statuses map so we can
        // see why no status matches are being found.
        println!(
            "DEBUG: v1 lights for {ip} = {:?}",
            light_map.keys().cloned().collect::<Vec<_>>()
        );
        println!("DEBUG: zigbee statuses map = {:?}", statuses);

        let optimistic_reachable = statuses.is_empty();
        if optimistic_reachable {
            println!("DEBUG: zigbee statuses empty for {ip}, falling back to optimistic reachable=true");
        }

        Ok(light_map
            .into_iter()
            .map(|(id, light)| {
                let reachable = if optimistic_reachable {
                    true
                } else {
                    statuses
                        .get(&id)
                        .map(|status| zigbee_status_is_reachable(status))
                        .unwrap_or(light.reachable)
                };

                HueLight {
                    id,
                    name: light.name,
                    is_on: light.state.on,
                    brightness: light.state.bri,
                    reachable,
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
        brightness: Option<u8>,
    ) -> Result<(), String> {
        let url = format!("http://{ip}/api/{application_key}/lights/{id}/state");
        let mut payload = Map::new();
        payload.insert("on".to_string(), serde_json::Value::Bool(on));
        if let Some(value) = brightness {
            payload.insert("bri".to_string(), serde_json::Value::Number(value.into()));
        }

        let response = self
            .client
            .put(&url)
            .json(&payload)
            .send()
            .await
            .map_err(|error| format!("Failed to update light: {error}"))?;

        let json = response.json::<Value>().await.map_err(|error| format!("Invalid light update response: {error}"))?;
        if let Some(hue_error) = parse_hue_error(&json) { return Err(format_hue_error(hue_error)); }
        Ok(())
    }
}

fn bridge_matches(left: &str, right: &str) -> bool { left.eq_ignore_ascii_case(right) }

fn parse_hue_error(value: &Value) -> Option<HueErrorResponse> {
    value.as_array().and_then(|items| items.first()).and_then(|item| serde_json::from_value::<HueErrorResponse>(item.clone()).ok())
}

fn zigbee_status_is_reachable(status: &str) -> bool {
    match status {
        // Known reachable state
        "connected" => true,
        // Known non-reachable or problematic states
        "disconnected" | "connectivity_issue" | "unidirectional_incoming" | "pending_discovery" => false,
        // Default conservative fallback
        _ => false,
    }
}

fn extract_hue_username(value: &Value) -> Result<String, String> {
    let array = value.as_array().ok_or_else(|| "Unexpected pairing response from bridge".to_string())?;
    for item in array {
        if let Ok(success) = serde_json::from_value::<HueSuccessResponse>(item.clone()) { return Ok(success.success.username); }
        if let Ok(error) = serde_json::from_value::<HueErrorResponse>(item.clone()) { return Err(format_hue_error(error)); }
    }
    Err("Unexpected pairing response from bridge".to_string())
}

fn format_hue_error(error: HueErrorResponse) -> String {
    format!("Hue error {}: {}", error.error.error_type, error.error.description)
}

fn save_bridge_info<R: Runtime>(app: &AppHandle<R>, bridge: &StoredBridgeInfo) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|error| format!("Failed to open bridge store: {error}"))?;
    store.set(STORE_KEY, serde_json::to_value(bridge).map_err(|error| format!("Invalid bridge store data: {error}"))?);
    store.save().map_err(|error| format!("Failed to save bridge store: {error}"))
}

fn load_bridge_info<R: Runtime>(app: &AppHandle<R>) -> Result<Option<StoredBridgeInfo>, String> {
    let store = app.store(STORE_FILE).map_err(|error| format!("Failed to open bridge store: {error}"))?;
    let Some(value) = store.get(STORE_KEY) else { return Ok(None); };
    if value.is_null() { return Ok(None); }
    serde_json::from_value::<StoredBridgeInfo>(value.clone()).map(Some).map_err(|error| format!("Failed to read bridge store: {error}"))
}

fn clear_bridge_info<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|error| format!("Failed to open bridge store: {error}"))?;
    store.delete(STORE_KEY);
    store.save().map_err(|error| format!("Failed to clear bridge store: {error}"))
}

fn keyring_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|error| format!("Failed to access secure keyring: {error}"))
}

fn save_application_key(application_key: &str) -> Result<(), String> {
    keyring_entry()?.set_password(application_key).map_err(|error| format!("Failed to save application key: {error}"))
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