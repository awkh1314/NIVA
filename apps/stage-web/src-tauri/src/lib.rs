use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::Manager;

const MAX_HISTORY_MESSAGES: usize = 24;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppConfig {
    #[serde(default)]
    deepseek_api_key: String,
    #[serde(default = "default_model")]
    deepseek_model: String,
    #[serde(default = "default_interaction_mode")]
    interaction_mode: String,
    #[serde(default = "default_active_model")]
    active_model: String,
    #[serde(default = "default_voice_output")]
    voice_output: bool,
    #[serde(default)]
    avatar_default_version: u8,
}

fn default_model() -> String { "deepseek-v4-flash".to_string() }
fn default_interaction_mode() -> String { "voice".to_string() }
fn default_active_model() -> String { "local:AvatarSample_A.vrm".to_string() }
fn default_voice_output() -> bool { true }

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            deepseek_api_key: String::new(),
            deepseek_model: default_model(),
            interaction_mode: default_interaction_mode(),
            active_model: default_active_model(),
            voice_output: default_voice_output(),
            avatar_default_version: 1,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SettingsView {
    interaction_mode: String,
    deepseek_model: String,
    active_model: String,
    voice_output: bool,
    has_api_key: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SettingsInput {
    interaction_mode: String,
    deepseek_model: String,
    active_model: String,
    voice_output: bool,
    api_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct HistoryMessage {
    role: String,
    content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomReaction {
    pub head_yaw: Option<f32>,
    pub head_pitch: Option<f32>,
    pub head_tilt: Option<f32>,
    pub body_lean: Option<f32>,
    pub body_turn: Option<f32>,
    pub left_arm: Option<String>,
    pub right_arm: Option<String>,
    pub energy: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NivaAction {
    pub text: Option<String>,
    pub emotion: Option<String>,
    pub expression_intensity: Option<f32>,
    pub motion: Option<String>,
    pub reaction_key: Option<String>,
    pub custom_reaction: Option<CustomReaction>,
}

#[derive(Debug, Deserialize)]
struct ChatResponse { choices: Vec<ChatChoice> }

#[derive(Debug, Deserialize)]
struct ChatChoice { message: ChatMessage }

#[derive(Debug, Deserialize)]
struct ChatMessage { content: Option<String> }

fn app_config_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_config_dir(app)?.join("niva-settings.json"))
}

fn history_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_config_dir(app)?.join("niva-conversation.json"))
}

fn history_epoch_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_config_dir(app)?.join("niva-conversation.epoch"))
}

fn load_config(app: &tauri::AppHandle) -> Result<AppConfig, String> {
    let path = config_path(app)?;
    if !path.exists() { return Ok(AppConfig::default()); }
    let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

fn save_config(app: &tauri::AppHandle, config: &AppConfig) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(config_path(app)?, raw).map_err(|e| e.to_string())
}

fn load_history(app: &tauri::AppHandle) -> Vec<HistoryMessage> {
    let Ok(path) = history_path(app) else { return Vec::new(); };
    if !path.exists() { return Vec::new(); }
    let Ok(raw) = fs::read_to_string(path) else { return Vec::new(); };
    let Ok(mut history) = serde_json::from_str::<Vec<HistoryMessage>>(&raw) else { return Vec::new(); };
    history.retain(|item| {
        (item.role == "user" || item.role == "assistant") && !item.content.trim().is_empty()
    });
    if history.len() > MAX_HISTORY_MESSAGES {
        history.drain(0..history.len() - MAX_HISTORY_MESSAGES);
    }
    history
}

fn save_history(app: &tauri::AppHandle, history: &[HistoryMessage]) -> Result<(), String> {
    let mut trimmed = history.to_vec();
    if trimmed.len() > MAX_HISTORY_MESSAGES {
        trimmed.drain(0..trimmed.len() - MAX_HISTORY_MESSAGES);
    }
    let raw = serde_json::to_string_pretty(&trimmed).map_err(|e| e.to_string())?;
    fs::write(history_path(app)?, raw).map_err(|e| e.to_string())
}

fn load_history_epoch(app: &tauri::AppHandle) -> u64 {
    let Ok(path) = history_epoch_path(app) else { return 0; };
    let Ok(raw) = fs::read_to_string(path) else { return 0; };
    raw.trim().parse::<u64>().unwrap_or(0)
}

fn bump_history_epoch(app: &tauri::AppHandle) -> Result<u64, String> {
    let next = load_history_epoch(app).saturating_add(1);
    fs::write(history_epoch_path(app)?, next.to_string()).map_err(|e| e.to_string())?;
    Ok(next)
}

fn normalize_model(model: &str) -> String {
    match model {
        "deepseek-v4-pro" => "deepseek-v4-pro".to_string(),
        _ => "deepseek-v4-flash".to_string(),
    }
}

#[tauri::command]
fn get_settings(app: tauri::AppHandle) -> Result<SettingsView, String> {
    let mut config = load_config(&app)?;
    if config.avatar_default_version == 0 {
        if config.active_model == "NIVA.vrm" {
            config.active_model = default_active_model();
        }
        config.avatar_default_version = 1;
        save_config(&app, &config)?;
    }
    Ok(SettingsView {
        interaction_mode: if config.interaction_mode == "text" { "text".into() } else { "voice".into() },
        deepseek_model: normalize_model(&config.deepseek_model),
        active_model: config.active_model,
        voice_output: config.voice_output,
        has_api_key: !config.deepseek_api_key.trim().is_empty(),
    })
}

#[tauri::command]
fn save_settings(app: tauri::AppHandle, settings: SettingsInput) -> Result<SettingsView, String> {
    let mut config = load_config(&app)?;
    config.interaction_mode = if settings.interaction_mode == "text" { "text".into() } else { "voice".into() };
    config.deepseek_model = normalize_model(&settings.deepseek_model);
    config.active_model = if settings.active_model.trim().is_empty() { default_active_model() } else { settings.active_model.trim().to_string() };
    config.voice_output = settings.voice_output;
    config.avatar_default_version = 1;
    if let Some(key) = settings.api_key {
        let key = key.trim();
        if !key.is_empty() { config.deepseek_api_key = key.to_string(); }
    }
    save_config(&app, &config)?;
    get_settings(app)
}

#[tauri::command]
fn clear_conversation(app: tauri::AppHandle) -> Result<(), String> {
    bump_history_epoch(&app)?;
    let path = history_path(&app)?;
    if path.exists() { fs::remove_file(path).map_err(|e| e.to_string())?; }
    Ok(())
}

#[tauri::command]
async fn deepseek_chat(app: tauri::AppHandle, message: String) -> Result<NivaAction, String> {
    let config = load_config(&app)?;
    if config.deepseek_api_key.trim().is_empty() {
        return Err("尚未配置 DeepSeek API Key。双击 NIVA 打开后台进行配置。".to_string());
    }

    let user_text = message.trim().to_string();
    if user_text.is_empty() { return Err("输入内容为空。".to_string()); }
    let request_history_epoch = load_history_epoch(&app);

    let system_prompt = r#"你是 NIVA，一个活跃、聪明、自然的数字生命陪伴精灵。你的输出会直接驱动桌面 3D 身体。你会收到最近的对话记录，要保持人物身份、上下文和语气连续，不要把每一句都当成第一次见面。
你必须只输出一个合法 json 对象，不要 markdown，不要额外解释。

优先从这些预设反应里选 motion：
- dance：完整循环舞蹈；用户明确要求跳舞、舞蹈或展示舞姿时使用
- wave：挥手/打招呼
- greet：轻微点头或回应
- thinking：思考
- happy：庆祝/开心
- sad：安慰/低落
- surprised：惊讶
- angry：生气/坚定
- lookAround：观察周围
- idle：无明显动作

只有当上面确实没有合适反应时，才允许 motion="custom"，并填写 customReaction。customReaction 是安全的程序化姿态参数，不是代码：
headYaw/headPitch/headTilt/bodyLean/bodyTurn 取 -1 到 1；leftArm/rightArm 只能是 down/open/up/cheek/forward/chest；energy 取 0 到 1。
reactionKey 用简短英文语义键，例如 "curious-lean"。如果 motion 是预设动作，也给出稳定的 reactionKey，例如 dance/greet/wave/celebrate/comfort/think/surprise/anger/look-around。

json 示例：
{"text":"好呀，看我跳一段。","emotion":"happy","expressionIntensity":0.42,"motion":"dance","reactionKey":"dance"}
或
{"text":"我在。","emotion":"happy","expressionIntensity":0.8,"motion":"wave","reactionKey":"wave"}
或
{"text":"这个反应我以前没做过，不过可以试试。","emotion":"happy","expressionIntensity":0.72,"motion":"custom","reactionKey":"playful-curious","customReaction":{"headYaw":0.25,"headPitch":-0.1,"headTilt":0.35,"bodyLean":0.12,"bodyTurn":0.15,"leftArm":"chest","rightArm":"open","energy":0.65}}

emotion 只能是 neutral/happy/shy/sad/angry/surprised/thinking。回复用自然简洁中文，不要像客服，不要每次都挥手。"#;

    let mut history = load_history(&app);
    let mut messages = Vec::with_capacity(history.len() + 2);
    messages.push(serde_json::json!({"role": "system", "content": system_prompt}));
    for item in &history {
        messages.push(serde_json::json!({"role": item.role, "content": item.content}));
    }
    messages.push(serde_json::json!({"role": "user", "content": user_text}));

    let payload = serde_json::json!({
        "model": normalize_model(&config.deepseek_model),
        "messages": messages,
        "thinking": {"type": "disabled"},
        "response_format": {"type": "json_object"},
        "max_tokens": 800,
        "stream": false
    });

    let response = reqwest::Client::new()
        .post("https://api.deepseek.com/chat/completions")
        .bearer_auth(&config.deepseek_api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("DeepSeek 请求失败: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(format!("DeepSeek 返回 {status}: {body}"));
    }

    let body: ChatResponse = response.json().await.map_err(|e| e.to_string())?;
    let content = body
        .choices
        .first()
        .and_then(|choice| choice.message.content.as_deref())
        .unwrap_or("")
        .trim();

    if content.is_empty() { return Err("DeepSeek 返回了空内容，请重试。".to_string()); }

    let without_prefix = content
        .strip_prefix("```json")
        .or_else(|| content.strip_prefix("```"))
        .unwrap_or(content);
    let cleaned = without_prefix.strip_suffix("```").unwrap_or(without_prefix).trim();

    let action = serde_json::from_str::<NivaAction>(cleaned).unwrap_or_else(|_| NivaAction {
        text: Some(content.to_string()),
        emotion: Some("neutral".to_string()),
        expression_intensity: Some(0.7),
        motion: Some("greet".to_string()),
        reaction_key: Some("greet".to_string()),
        custom_reaction: None,
    });

    let assistant_text = action
        .text
        .as_deref()
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .unwrap_or(cleaned)
        .to_string();

    history.push(HistoryMessage { role: "user".to_string(), content: user_text });
    history.push(HistoryMessage { role: "assistant".to_string(), content: assistant_text });
    if history.len() > MAX_HISTORY_MESSAGES {
        history.drain(0..history.len() - MAX_HISTORY_MESSAGES);
    }
    if load_history_epoch(&app) == request_history_epoch {
        if let Err(error) = save_history(&app, &history) {
            eprintln!("[NIVA] unable to persist conversation history: {error}");
        }
    } else {
        eprintln!("[NIVA] conversation memory changed while request was in flight; stale history was not restored");
    }

    Ok(action)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_settings, save_settings, clear_conversation, deepseek_chat])
        .run(tauri::generate_context!())
        .expect("error while running NIVA");
}
