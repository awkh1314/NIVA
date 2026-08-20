use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::time::Duration;

const DEEPSEEK_URL: &str = "https://api.deepseek.com/chat/completions";
const OPENAI_URL: &str = "https://api.openai.com/v1/chat/completions";
const ASR_HEALTH_URL: &str = "http://127.0.0.1:8080/asr-health";
const ASR_URL: &str = "http://127.0.0.1:8080/v1/audio/transcriptions";

fn endpoint_for(provider: &str, base_url: &str) -> Result<String, String> {
  match provider {
    "deepseek" => Ok(DEEPSEEK_URL.to_string()),
    "openai" => Ok(OPENAI_URL.to_string()),
    "custom" => {
      let url = base_url.trim();
      if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("自定义 Brain Endpoint 必须是 http:// 或 https://".into());
      }
      Ok(url.to_string())
    }
    _ => Err(format!("不支持的 Brain provider: {}", provider)),
  }
}

#[tauri::command]
async fn llm_orchestrate(
  provider: String,
  api_key: String,
  base_url: String,
  model: String,
  system_prompt: String,
  user_text: String,
  payload_json: String,
) -> Result<String, String> {
  if api_key.trim().is_empty() { return Err("Brain API Key 为空".into()); }
  let endpoint = endpoint_for(provider.trim(), &base_url)?;
  let mut payload: Value = serde_json::from_str(&payload_json).map_err(|e| e.to_string())?;
  payload["model"] = json!(model.trim());
  payload["messages"] = json!([
    {"role":"system","content":system_prompt},
    {"role":"user","content":user_text}
  ]);

  let client = reqwest::Client::builder()
    .timeout(Duration::from_secs(45))
    .build()
    .map_err(|e| e.to_string())?;
  let response = client.post(endpoint)
    .bearer_auth(api_key.trim())
    .json(&payload)
    .send().await.map_err(|e| e.to_string())?;
  let status = response.status();
  let body: Value = response.json().await.map_err(|e| e.to_string())?;
  if !status.is_success() { return Err(format!("Brain HTTP {}: {}", status, body)); }
  body.pointer("/choices/0/message/content")
    .and_then(Value::as_str)
    .map(str::to_string)
    .ok_or_else(|| "Brain 返回缺少 choices[0].message.content；当前适配器要求 OpenAI-compatible 响应格式".to_string())
}

#[tauri::command]
async fn local_asr_probe() -> bool {
  let client = match reqwest::Client::builder().timeout(Duration::from_millis(900)).build() { Ok(c) => c, Err(_) => return false };
  client.get(ASR_HEALTH_URL).send().await.map(|r| r.status().is_success()).unwrap_or(false)
}

#[tauri::command]
async fn local_asr(audio_base64: String) -> Result<String, String> {
  let audio = STANDARD.decode(audio_base64.as_bytes()).map_err(|e| e.to_string())?;
  let client = reqwest::Client::builder().timeout(Duration::from_secs(45)).build().map_err(|e| e.to_string())?;
  let response = client.post(ASR_URL)
    .header("content-type", "audio/wav")
    .body(audio)
    .send().await.map_err(|e| e.to_string())?;
  let status = response.status();
  let body: Value = response.json().await.map_err(|e| e.to_string())?;
  if !status.is_success() { return Err(format!("Vosk ASR HTTP {}: {}", status, body)); }
  Ok(body.get("text").and_then(Value::as_str).unwrap_or("").to_string())
}

fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![llm_orchestrate, local_asr_probe, local_asr])
    .run(tauri::generate_context!())
    .expect("error while running NIVA");
}
