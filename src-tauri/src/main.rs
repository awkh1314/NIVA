use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::time::Duration;

const DEEPSEEK_URL: &str = "https://api.deepseek.com/chat/completions";
const QWEN_TTS_URL: &str = "http://127.0.0.1:8080/v1/audio/speech";
const QWEN_HEALTH_URL: &str = "http://127.0.0.1:8080/health";
const ASR_HEALTH_URL: &str = "http://127.0.0.1:8080/asr-health";
const ASR_URL: &str = "http://127.0.0.1:8080/v1/audio/transcriptions";

#[tauri::command]
async fn deepseek_orchestrate(api_key: String, system_prompt: String, user_text: String, payload_json: String) -> Result<String, String> {
  if api_key.trim().is_empty() { return Err("DeepSeek API Key 为空".into()); }
  let mut payload: Value = serde_json::from_str(&payload_json).map_err(|e| e.to_string())?;
  payload["messages"] = json!([
    {"role":"system","content":system_prompt},
    {"role":"user","content":user_text}
  ]);
  let client = reqwest::Client::builder().timeout(Duration::from_secs(45)).build().map_err(|e| e.to_string())?;
  let response = client.post(DEEPSEEK_URL).bearer_auth(api_key.trim()).json(&payload).send().await.map_err(|e| e.to_string())?;
  let status = response.status();
  let body: Value = response.json().await.map_err(|e| e.to_string())?;
  if !status.is_success() { return Err(format!("DeepSeek HTTP {}: {}", status, body)); }
  body.pointer("/choices/0/message/content").and_then(Value::as_str).map(str::to_string)
    .ok_or_else(|| "DeepSeek 返回缺少 choices[0].message.content".to_string())
}

#[tauri::command]
async fn qwen_tts_probe() -> bool {
  let client = match reqwest::Client::builder().timeout(Duration::from_millis(900)).build() { Ok(c) => c, Err(_) => return false };
  client.get(QWEN_HEALTH_URL).send().await.map(|r| r.status().is_success()).unwrap_or(false)
}

#[tauri::command]
async fn qwen_tts(text: String, instruction: String) -> Result<String, String> {
  let client = reqwest::Client::builder().timeout(Duration::from_secs(120)).build().map_err(|e| e.to_string())?;
  let response = client.post(QWEN_TTS_URL).json(&json!({
    "input": text,
    "voice": "Serena",
    "language": "Chinese",
    "instructions": instruction,
    "response_format": "wav",
    "speed": 1.0
  })).send().await.map_err(|e| e.to_string())?;
  let status = response.status();
  let bytes = response.bytes().await.map_err(|e| e.to_string())?;
  if !status.is_success() { return Err(format!("Qwen3-TTS HTTP {}", status)); }
  Ok(STANDARD.encode(bytes))
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
    .invoke_handler(tauri::generate_handler![deepseek_orchestrate, qwen_tts_probe, qwen_tts, local_asr_probe, local_asr])
    .run(tauri::generate_context!())
    .expect("error while running NIVA");
}
