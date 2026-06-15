use serde::Deserialize;

#[derive(Deserialize)]
struct HueError {
    error: HueErrorDetail,
}

#[derive(Deserialize)]
struct HueErrorDetail {
    typefield: u32,
    description: String,
}

#[derive(Deserialize)]
struct HueSuccess {
    success: HueUsername,
}

#[derive(Deserialize)]
struct HueUsername {
    username: String,
}

#[tauri::command]
pub async fn discover_bridges() -> Result<Vec<String>, String> {
    Ok(vec!["192.168.5.208".to_string()])
}

#[tauri::command]
pub async fn pair_bridge(ip: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!("http://{}/api", ip);
    let payload = serde_json::json!({ "devicetype": "tauri_hue_app" });

    let response = client.post(&url).json(&payload).send().await.map_err(|e| e.to_string())?;
    let json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;

    if let Some(arr) = json.as_array() {
        if let Some(item) = arr.first() {
            if let Some(success) = item.get("success") {
                if let Some(username) = success.get("username").and_then(|u| u.as_str()) {
                    return Ok(username.to_string());
                }
            }
            if let Some(error) = item.get("error") {
                if let Some(desc) = error.get("description").and_then(|d| d.as_str()) {
                    return Err(desc.to_string());
                }
            }
        }
    }

    Err("Unexpected response from bridge".to_string())
}
