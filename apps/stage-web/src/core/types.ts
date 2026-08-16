export type SemanticExpression =
  | 'neutral'
  | 'happy'
  | 'shy'
  | 'sad'
  | 'angry'
  | 'surprised'
  | 'thinking'

export type MotionName =
  | 'idle'
  | 'dance'
  | 'wave'
  | 'greet'
  | 'thinking'
  | 'happy'
  | 'sad'
  | 'surprised'
  | 'angry'
  | 'lookAround'
  | 'custom'

export type ArmPose = 'down' | 'open' | 'up' | 'cheek' | 'forward' | 'chest'

/**
 * Safe procedural pose channels. DeepSeek may choose these values when no
 * built-in reaction matches, but it never receives permission to execute code.
 */
export interface CustomReaction {
  headYaw?: number
  headPitch?: number
  headTilt?: number
  bodyLean?: number
  bodyTurn?: number
  leftArm?: ArmPose
  rightArm?: ArmPose
  energy?: number
}

export interface NivaAction {
  text?: string
  emotion?: SemanticExpression
  expressionIntensity?: number
  motion?: MotionName
  reactionKey?: string
  customReaction?: CustomReaction
  lookTarget?: { x: number; y: number }
  /** At most two stable, cross-session facts NIVA decided are worth remembering. */
  memoryWrites?: string[]
}

export interface LongTermMemorySnapshot {
  count: number
  capacity: number
  items: string[]
}

export type InteractionMode = 'voice' | 'text'

export interface DesktopSettings {
  interactionMode: InteractionMode
  deepseekModel: 'deepseek-v4-flash' | 'deepseek-v4-pro'
  activeModel: string
  voiceOutput: boolean
  hasApiKey: boolean
}
