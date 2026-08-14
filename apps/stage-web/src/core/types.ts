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
  | 'wave'
  | 'greet'
  | 'thinking'
  | 'happy'
  | 'sad'
  | 'surprised'
  | 'angry'
  | 'lookAround'

export interface NivaAction {
  text?: string
  emotion?: SemanticExpression
  expressionIntensity?: number
  motion?: MotionName
  lookTarget?: { x: number; y: number }
}
