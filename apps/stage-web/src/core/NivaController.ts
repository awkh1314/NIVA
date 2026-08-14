import type { NivaAction } from './types'
import { AvatarRuntime } from '../avatar/AvatarRuntime'
import { MotionController } from '../avatar/MotionController'

export class NivaController {
  constructor(
    private avatar: AvatarRuntime,
    private motions: MotionController,
    private speak: (text: string) => void,
  ) {}

  act(action: NivaAction) {
    if (action.text) this.speak(action.text)
    if (action.emotion) {
      this.avatar.setExpression(action.emotion, action.expressionIntensity ?? .8)
    }
    if (action.motion) this.motions.play(action.motion)
    if (action.lookTarget) {
      this.avatar.setLookTarget(action.lookTarget.x, action.lookTarget.y)
    }
  }

  update(dt: number) {
    this.avatar.update(dt)
    this.motions.update(dt)
  }
}
