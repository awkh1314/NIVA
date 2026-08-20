import {
  NIVA_EMOTIONS,
  NIVA_GESTURES,
  NIVA_VOICE_STYLES,
  brainToStageCue,
  buildBrainSystemPrompt,
  buildChatPayload,
  fallbackBrainResponse,
  normalizeBrainResponse,
} from '../runtime/brain/protocol.mjs';

export { NIVA_EMOTIONS, NIVA_VOICE_STYLES };
export const NIVA_GESTURE_NAMES = NIVA_GESTURES;
export const NIVA_ORCHESTRATION_SYSTEM_PROMPT = buildBrainSystemPrompt();

export function normalizeOrchestration(value) {
  return brainToStageCue(normalizeBrainResponse(value));
}

export function deepSeekPayload(userText) {
  return buildChatPayload(userText, 'deepseek-chat');
}

export function fallbackOrchestration(text) {
  return brainToStageCue(fallbackBrainResponse(text));
}
