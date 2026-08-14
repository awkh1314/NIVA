use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NivaAction {
    pub text: Option<String>,
    pub emotion: Option<String>,
    pub expression_intensity: Option<f32>,
    pub motion: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}

#[derive(Debug, Deserialize)]
struct ChatMessage {
    content: Option<String>,
}

#[tauri::command]
async fn deepseek_chat(message: String) -> Result<NivaAction, String> {
    let api_key = std::env::var("DEEPSEEK_API_KEY")
        .map_err(|_| "请先在 Windows 环境变量中配置 DEEPSEEK_API_KEY".to_string())?;

    let payload = serde_json::json!({
        "model": "deepseek-v4-flash",
        "messages": [
            {
                "role": "system",
                "content": "你是 NIVA，一个活跃、聪明、自然的数字生命陪伴精灵。请只输出 JSON：{\"text\":\"回复\",\"emotion\":\"neutral|happy|shy|sad|angry|surprised|thinking\",\"expressionIntensity\":0.8,\"motion\":\"wave|greet|thinking|happy|sad|lookAround|surprised|angry\"}。用简洁自然的中文，不要像客服。"
            },
            {"role": "user", "content": message}
        ],
        "thinking": {"type": "disabled"},
        "response_format": {"type": "json_object"},
        "stream": false
    });

    let response = reqwest::Client::new()
        .post("https://api.deepseek.com/chat/completions")
        .bearer_auth(api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("DeepSeek 请求失败: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("DeepSeek 返回错误状态: {status}"));
    }

    let body: ChatResponse = response.json().await.map_err(|e| e.to_string())?;
    let content = body
        .choices
        .first()
        .and_then(|choice| choice.message.content.as_deref())
        .unwrap_or("")
        .trim();

    serde_json::from_str::<NivaAction>(content).or_else(|_| {
        Ok(NivaAction {
            text: Some(content.to_string()),
            emotion: Some("neutral".to_string()),
            expression_intensity: Some(0.7),
            motion: Some("greet".to_string()),
        })
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![deepseek_chat])
        .run(tauri::generate_context!())
        .expect("error while running NIVA");
}
