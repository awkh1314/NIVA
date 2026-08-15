import * as THREE from 'three'
import type { ArmPose, CustomReaction, MotionName } from '../core/types'

type BoneName =
  | 'hips' | 'spine' | 'chest' | 'upperChest' | 'neck' | 'head'
  | 'leftUpperArm' | 'leftLowerArm' | 'leftHand'
  | 'rightUpperArm' | 'rightLowerArm' | 'rightHand'
  | 'leftUpperLeg' | 'leftLowerLeg' | 'leftFoot'
  | 'rightUpperLeg' | 'rightLowerLeg' | 'rightFoot'

type MotionState = {
  name: MotionName
  start: number
  duration: number
}

type LifeState = 'idle' | 'attention' | 'listening' | 'thinking' | 'speaking' | 'backstage'

const TRACKED: BoneName[] = [
  'hips','spine','chest','upperChest','neck','head',
  'leftUpperArm','leftLowerArm','leftHand',
  'rightUpperArm','rightLowerArm','rightHand',
  'leftUpperLeg','leftLowerLeg','leftFoot',
  'rightUpperLeg','rightLowerLeg','rightFoot',
]

const clamp = (value: number | undefined, min = -1, max = 1) =>
  THREE.MathUtils.clamp(Number.isFinite(value) ? Number(value) : 0, min, max)

/**
 * Procedural avatar motion controller.
 *
 * All motion definitions below use one semantic coordinate system:
 *   +Y = up, +Z = avatar forward, sideSign = avatar left/right.
 *
 * VRM 0.x stores avatars facing Z-, while VRM 1.0 stores them facing Z+.
 * This controller normalizes that difference before solving the raw skeleton,
 * so a gesture keeps the same meaning on both formats and at every view angle.
 */
export class RawMotionController {
  private vrm: any = null
  private rest = new Map<BoneName, THREE.Quaternion>()
  private sideSign = { left: 1, right: -1 }
  private tmpParentQ = new THREE.Quaternion()
  private tmpInvQ = new THREE.Quaternion()
  private tmpAlign = new THREE.Quaternion()
  private tmpRestDir = new THREE.Vector3()
  private tmpDesired = new THREE.Vector3()
  private tmpRootQ = new THREE.Quaternion()
  private tmpRootInvQ = new THREE.Quaternion()
  private tmpUpperWorld = new THREE.Vector3()
  private tmpLowerWorld = new THREE.Vector3()
  private baseYaw = 0
  private viewYaw = 0
  private forwardSign = 1
  private rotationXZSign = 1
  private rotationControlsInstalled = false
  private dragging = false
  private dragPointerId = -1
  private dragX = 0

  attach(vrm: any) {
    this.vrm = vrm
    this.rest.clear()
    if (!vrm?.humanoid) return

    const metaVersion = String(vrm?.meta?.metaVersion ?? vrm?.metaVersion ?? '')
    const isVrm0 = metaVersion === '0'

    // VRM 0.x is authored facing Z-. VRM 1.0 is authored facing Z+.
    // The camera watches from +Z, so only VRM0 needs a 180° presentation yaw.
    this.baseYaw = isVrm0 ? Math.PI : 0
    this.forwardSign = isVrm0 ? -1 : 1

    // Converting VRM0 semantic rotations into the VRM1-style motion space flips X/Z axes.
    // Y/yaw keeps the same sign under the 180° Y conversion.
    this.rotationXZSign = isVrm0 ? -1 : 1
    this.viewYaw = 0
    this.applyRootOrientation()
    this.installRotationControls()

    // We intentionally solve the real skinned skeleton. Rest rotations are preserved so
    // VRM1 models that are not fully normalized still keep their authored bone roll.
    vrm.humanoid.autoUpdateHumanBones = false
    for (const name of TRACKED) {
      const node = this.bone(name)
      if (node) this.rest.set(name, node.quaternion.clone())
    }

    // VRM0 and VRM1 use opposite X handedness for avatar right. Derive left/right
    // from the actual model instead of hard-coding one format's convention.
    const hips = this.worldPos('hips')
    const left = this.worldPos('leftUpperArm')
    const right = this.worldPos('rightUpperArm')
    const root = this.vrm?.scene as THREE.Object3D | undefined
    if (root) {
      root.updateWorldMatrix(true, false)
      root.getWorldQuaternion(this.tmpRootInvQ).invert()
      if (hips && left) {
        const localLeft = left.clone().sub(hips).applyQuaternion(this.tmpRootInvQ)
        this.sideSign.left = Math.sign(localLeft.x) || 1
      }
      if (hips && right) {
        const localRight = right.clone().sub(hips).applyQuaternion(this.tmpRootInvQ)
        this.sideSign.right = Math.sign(localRight.x) || -1
      }
    }
  }

  private applyRootOrientation() {
    const root = this.vrm?.scene as THREE.Object3D | undefined
    if (!root) return
    root.rotation.y = this.baseYaw + this.viewYaw
    root.updateMatrixWorld(true)
  }

  private installRotationControls() {
    if (this.rotationControlsInstalled) return
    const stage = document.querySelector<HTMLElement>('#stage')
    if (!stage) return
    this.rotationControlsInstalled = true
    stage.style.touchAction = 'none'
    stage.style.cursor = 'grab'

    stage.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return
      this.dragging = true
      this.dragPointerId = event.pointerId
      this.dragX = event.clientX
      stage.style.cursor = 'grabbing'
      try { stage.setPointerCapture(event.pointerId) } catch { /* optional */ }
    })

    stage.addEventListener('pointermove', (event) => {
      if (!this.dragging || event.pointerId !== this.dragPointerId) return
      const dx = event.clientX - this.dragX
      this.dragX = event.clientX
      this.viewYaw += dx * 0.012
      this.applyRootOrientation()
    })

    const stopDrag = (event: PointerEvent) => {
      if (event.pointerId !== this.dragPointerId) return
      this.dragging = false
      this.dragPointerId = -1
      stage.style.cursor = 'grab'
      try { stage.releasePointerCapture(event.pointerId) } catch { /* optional */ }
    }
    stage.addEventListener('pointerup', stopDrag)
    stage.addEventListener('pointercancel', stopDrag)

    stage.addEventListener('dblclick', () => {
      this.viewYaw = 0
      this.applyRootOrientation()
    })
  }

  private bone(name: BoneName): THREE.Object3D | null {
    return this.vrm?.humanoid?.getRawBoneNode(name) as THREE.Object3D | null
  }

  private worldPos(name: BoneName): THREE.Vector3 | null {
    const node = this.bone(name)
    if (!node) return null
    node.updateWorldMatrix(true, false)
    return node.getWorldPosition(new THREE.Vector3())
  }

  private reset() {
    for (const [name, q] of this.rest) {
      const node = this.bone(name)
      if (node) node.quaternion.copy(q)
    }
    this.vrm?.scene?.updateMatrixWorld(true)
  }

  private rotate(name: BoneName, x = 0, y = 0, z = 0) {
    const node = this.bone(name)
    const rest = this.rest.get(name)
    if (!node || !rest) return

    const delta = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      x * this.rotationXZSign,
      y,
      z * this.rotationXZSign,
      'XYZ',
    ))
    node.quaternion.copy(rest).multiply(delta)
  }

  /** Convert semantic avatar-local direction (+Z forward) to current world space. */
  private avatarDirectionToWorld(localDirection: THREE.Vector3, target: THREE.Vector3) {
    const root = this.vrm?.scene as THREE.Object3D | undefined
    target.set(localDirection.x, localDirection.y, localDirection.z * this.forwardSign).normalize()
    if (!root) return target
    root.updateWorldMatrix(true, false)
    root.getWorldQuaternion(this.tmpRootQ)
    return target.applyQuaternion(this.tmpRootQ).normalize()
  }

  /** Aim a bone's child toward a world-space direction while preserving authored roll. */
  private aim(name: BoneName, childName: BoneName, worldDirection: THREE.Vector3, strength = 1) {
    const node = this.bone(name)
    const child = this.bone(childName)
    const rest = this.rest.get(name)
    if (!node || !child || !rest || !node.parent) return

    node.parent.updateWorldMatrix(true, false)
    node.parent.getWorldQuaternion(this.tmpParentQ)
    this.tmpInvQ.copy(this.tmpParentQ).invert()

    this.tmpDesired.copy(worldDirection).normalize().applyQuaternion(this.tmpInvQ).normalize()
    this.tmpRestDir.copy(child.position).normalize().applyQuaternion(rest).normalize()
    this.tmpAlign.setFromUnitVectors(this.tmpRestDir, this.tmpDesired)

    const target = this.tmpAlign.multiply(rest.clone())
    node.quaternion.copy(rest).slerp(target, THREE.MathUtils.clamp(strength, 0, 1))
    this.vrm.scene.updateMatrixWorld(true)
  }

  private arm(side: 'left' | 'right', upperDir: THREE.Vector3, lowerDir: THREE.Vector3, strength = 1) {
    const upper = `${side}UpperArm` as BoneName
    const lower = `${side}LowerArm` as BoneName
    const hand = `${side}Hand` as BoneName
    this.avatarDirectionToWorld(upperDir, this.tmpUpperWorld)
    this.avatarDirectionToWorld(lowerDir, this.tmpLowerWorld)
    this.aim(upper, lower, this.tmpUpperWorld, strength)
    this.aim(lower, hand, this.tmpLowerWorld, strength)
  }

  private relaxedArms(leftBias = 0, rightBias = 0) {
    const l = this.sideSign.left
    const r = this.sideSign.right
    this.arm('left', new THREE.Vector3(l * (.14 + leftBias), -.989, .045), new THREE.Vector3(l * .04, -.996, .07))
    this.arm('right', new THREE.Vector3(r * (.14 + rightBias), -.989, .045), new THREE.Vector3(r * .04, -.996, .07))
  }

  private applyArmPose(side: 'left' | 'right', pose: ArmPose | undefined, strength: number) {
    const s = this.sideSign[side]
    switch (pose) {
      case 'open':
        this.arm(side, new THREE.Vector3(s * .70, -.34, .12), new THREE.Vector3(s * .82, -.44, .18), strength)
        break
      case 'up':
        this.arm(side, new THREE.Vector3(s * .48, .72, .10), new THREE.Vector3(s * .16, .96, .08), strength)
        break
      case 'cheek':
        this.arm(side, new THREE.Vector3(s * .24, -.66, .22), new THREE.Vector3(-s * .28, .80, .38), strength)
        break
      case 'forward':
        this.arm(side, new THREE.Vector3(s * .16, -.18, .97), new THREE.Vector3(s * .04, -.16, .99), strength)
        break
      case 'chest':
        this.arm(side, new THREE.Vector3(s * .24, -.58, .24), new THREE.Vector3(-s * .48, .34, .57), strength)
        break
      case 'down':
      default:
        this.arm(side, new THREE.Vector3(s * .13, -.990, .04), new THREE.Vector3(s * .035, -.997, .06), strength)
        break
    }
  }

  private applyCustom(custom: CustomReaction | undefined, e: number, breath: number, sway: number, p: number) {
    if (!custom) return
    const energy = THREE.MathUtils.clamp(custom.energy ?? .65, 0, 1)
    const strength = THREE.MathUtils.clamp(.55 + energy * .45, 0, 1) * Math.max(.35, e)
    const yaw = clamp(custom.headYaw) * .34
    const pitch = clamp(custom.headPitch) * .23
    const tilt = clamp(custom.headTilt) * .25
    const lean = clamp(custom.bodyLean) * .13
    const turn = clamp(custom.bodyTurn) * .18
    const pulse = Math.sin(p * Math.PI * (2 + energy * 4)) * .014 * energy

    this.rotate('hips', -lean * .18, turn * .22, -lean * .07)
    this.rotate('spine', lean * .38 + breath * .006, turn * .32, sway * .004)
    this.rotate('chest', lean * .48 + pulse, turn * .52, -tilt * .10)
    this.rotate('head', pitch, yaw, tilt)
    this.applyArmPose('left', custom.leftArm, strength)
    this.applyArmPose('right', custom.rightArm, strength)
  }

  update(
    now: number,
    motion: MotionState,
    lookX: number,
    lookY: number,
    custom?: CustomReaction | null,
    lifeState: LifeState = 'idle',
  ) {
    if (!this.vrm?.humanoid) return
    this.reset()

    const t = now / 1000
    const breath = Math.sin(t * 1.58)
    const sway = Math.sin(t * .46)
    const weight = Math.sin(t * .19 + .8)
    const micro = Math.sin(t * .25)
    const talk = Math.sin(t * 2.75)
    const talkAccent = Math.sin(t * 5.1 + .6)
    const finite = Number.isFinite(motion.duration)
    const p = finite ? THREE.MathUtils.clamp((now - motion.start) / motion.duration, 0, 1) : .62
    const e = finite ? Math.sin(Math.PI * p) : .9

    // The life state owns only the quiet baseline. Explicit motions below can still
    // take over, but when they finish NIVA keeps a distinct listening/thinking/speaking
    // posture instead of snapping back to the same generic idle pose.
    let swayScale = 1
    let forwardLean = 0
    let stateHeadPitch = 0
    let stateHeadYaw = 0
    let stateHeadTilt = 0
    let stateTurn = 0
    let armBiasL = 0
    let armBiasR = 0

    switch (lifeState) {
      case 'attention':
        swayScale = .55
        forwardLean = -.010
        stateHeadPitch = -.010
        break
      case 'listening':
        swayScale = .28
        forwardLean = -.016
        stateHeadPitch = -.014
        break
      case 'thinking':
        swayScale = .34
        forwardLean = .008
        stateHeadPitch = .035
        stateHeadYaw = -.055 + micro * .018
        stateHeadTilt = -.035
        stateTurn = -.018
        armBiasR = .012
        break
      case 'speaking':
        swayScale = .48
        forwardLean = -.008 + talkAccent * .003
        stateHeadPitch = talk * .010 - .006
        stateHeadYaw = talkAccent * .018
        stateHeadTilt = -talk * .008
        stateTurn = talk * .008
        armBiasL = .006 + Math.max(0, talk) * .010
        armBiasR = .006 + Math.max(0, -talk) * .010
        break
      case 'backstage':
        swayScale = .18
        break
      case 'idle':
      default:
        break
    }

    const bodySway = sway * swayScale
    const weightShift = weight * .012 * swayScale
    this.rotate('hips', forwardLean * .10, bodySway * .010 + stateTurn, -weightShift)
    this.rotate('spine', forwardLean * .34 + breath * .007, bodySway * .006 + stateTurn * .35, micro * .005 * swayScale)
    this.rotate('chest', forwardLean * .55 + breath * .011, -bodySway * .007 + stateTurn * .45, bodySway * .008)
    this.rotate('upperChest', forwardLean * .28 + breath * .005, -bodySway * .003, bodySway * .004)
    this.rotate(
      'head',
      stateHeadPitch - lookY * (lifeState === 'listening' ? .055 : .09) + breath * .003,
      stateHeadYaw + lookX * (lifeState === 'listening' ? .095 : .15) + bodySway * .008,
      stateHeadTilt - bodySway * .008,
    )
    this.relaxedArms(armBiasL, armBiasR)

    // Tiny alternating leg load makes a long idle feel grounded without looking like
    // a dance. Listening/backstage reduce it almost to zero so deliberate states read clearly.
    const legScale = lifeState === 'idle' || lifeState === 'attention' ? 1 : lifeState === 'speaking' ? .55 : .2
    this.rotate('leftUpperLeg', 0, 0, weightShift * .22 * legScale)
    this.rotate('rightUpperLeg', 0, 0, -weightShift * .22 * legScale)
    this.rotate('leftLowerLeg', Math.max(0, weight) * .006 * legScale, 0, 0)
    this.rotate('rightLowerLeg', Math.max(0, -weight) * .006 * legScale, 0, 0)

    const ls = this.sideSign.left
    const rs = this.sideSign.right

    switch (motion.name) {
      case 'dance': {
        // 16-second looping choreography with four phrases:
        // side groove -> overhead wave -> forward/open -> star finish and reset.
        const danceT = ((now - motion.start) / 1000) % 16
        const phrase = Math.floor(danceT / 4)
        const phraseT = (danceT % 4) / 4
        const beat = Math.sin(danceT * Math.PI * 2)
        const fast = Math.sin(danceT * Math.PI * 4)
        const side = Math.sin(danceT * Math.PI)
        const turn = Math.sin(danceT * Math.PI * .5)
        const bounce = Math.max(0, fast)

        this.rotate('hips', -.020 * bounce, .065 * turn, -.055 * side)
        this.rotate('spine', -.010 * bounce, .032 * turn, .035 * side)
        this.rotate('chest', -.014 * bounce, -.025 * turn, .050 * side)
        this.rotate('upperChest', -.008 * bounce, -.018 * turn, .026 * side)
        this.rotate('head', -.018 * bounce - lookY * .035, lookX * .055 + .025 * turn, -.038 * side)

        // Small in-place steps keep the full body involved without translating the avatar.
        this.rotate('leftUpperLeg', beat * .040, 0, -side * .025)
        this.rotate('rightUpperLeg', -beat * .040, 0, side * .025)
        this.rotate('leftLowerLeg', Math.max(0, -beat) * .055, 0, 0)
        this.rotate('rightLowerLeg', Math.max(0, beat) * .055, 0, 0)
        this.rotate('leftFoot', -beat * .018, 0, side * .012)
        this.rotate('rightFoot', beat * .018, 0, -side * .012)

        if (phrase === 0) {
          // Phrase A: alternating diagonal side sweeps.
          this.arm('left',
            new THREE.Vector3(ls * (.48 + beat * .08), -.50 + beat * .20, .18),
            new THREE.Vector3(ls * (.70 + beat * .06), -.35 + beat * .18, .22),
          )
          this.arm('right',
            new THREE.Vector3(rs * (.48 - beat * .08), -.50 - beat * .20, .18),
            new THREE.Vector3(rs * (.70 - beat * .06), -.35 - beat * .18, .22),
          )
        } else if (phrase === 1) {
          // Phrase B: both arms overhead, elbows alternating to the beat.
          this.arm('left',
            new THREE.Vector3(ls * .46, .58 + beat * .10, .12),
            new THREE.Vector3(ls * (.16 + beat * .18), .96, .10),
          )
          this.arm('right',
            new THREE.Vector3(rs * .46, .58 - beat * .10, .12),
            new THREE.Vector3(rs * (.16 - beat * .18), .96, .10),
          )
        } else if (phrase === 2) {
          // Phrase C: push toward the viewer, then open back out to the sides.
          const reach = .5 + .5 * Math.sin((danceT - 8) * Math.PI)
          this.arm('left',
            new THREE.Vector3(ls * (.28 + (1 - reach) * .34), -.10 + beat * .10, .22 + reach * .58),
            new THREE.Vector3(ls * (.10 + (1 - reach) * .54), -.04 + beat * .08, .28 + reach * .66),
          )
          this.arm('right',
            new THREE.Vector3(rs * (.28 + (1 - reach) * .34), -.10 - beat * .10, .22 + reach * .58),
            new THREE.Vector3(rs * (.10 + (1 - reach) * .54), -.04 - beat * .08, .28 + reach * .66),
          )
        } else {
          // Phrase D: star/celebration finish. During the final second the arms return
          // smoothly to phrase A so the 16-second loop has no visible snap.
          const reset = THREE.MathUtils.smoothstep(phraseT, .72, 1)
          const upperX = THREE.MathUtils.lerp(.52, .48, reset)
          const upperY = THREE.MathUtils.lerp(.66 + beat * .08, -.50, reset)
          const lowerX = THREE.MathUtils.lerp(.20, .70, reset)
          const lowerY = THREE.MathUtils.lerp(.96, -.35, reset)
          const z = THREE.MathUtils.lerp(.12, .20, reset)
          this.arm('left',
            new THREE.Vector3(ls * upperX, upperY, z),
            new THREE.Vector3(ls * lowerX, lowerY, z + .04),
          )
          this.arm('right',
            new THREE.Vector3(rs * upperX, upperY, z),
            new THREE.Vector3(rs * lowerX, lowerY, z + .04),
          )
        }
        break
      }
      case 'thinking': {
        // Right hand to chin/cheek, left arm remains relaxed.
        this.rotate('head', .025 - lookY * .06, -.08 + lookX * .08, -.09)
        this.rotate('chest', breath * .008, -.018, -.020)
        this.arm('left', new THREE.Vector3(ls * .13, -.991, .04), new THREE.Vector3(ls * .035, -.998, .06))
        this.arm('right', new THREE.Vector3(rs * .24, -.72, .26), new THREE.Vector3(-rs * .28, .76, .46), e)
        break
      }
      case 'wave': {
        const wave = Math.sin(p * Math.PI * 7)
        this.arm('right', new THREE.Vector3(rs * .54, .56, .12), new THREE.Vector3(rs * (.12 + wave * .28), .93, .10), e)
        this.rotate('head', -.02, lookX * .06, -rs * .035 * e)
        break
      }
      case 'greet': {
        // A small nod and slight forward acknowledgement, not a random head roll.
        const nod = Math.sin(p * Math.PI * 2) * .07 * e
        this.rotate('head', .05 * e + nod - lookY * .04, lookX * .06, -.025 * e)
        this.rotate('chest', -.018 * e, 0, .012 * e)
        break
      }
      case 'happy': {
        // Clearly readable celebration: both arms up/out, small body bounce.
        const bounce = Math.sin(p * Math.PI * 4) * e
        this.rotate('hips', -.020 * Math.max(0, bounce), sway * .008, 0)
        this.arm('left', new THREE.Vector3(ls * .50, .64, .10), new THREE.Vector3(ls * .18, .95, .08), e)
        this.arm('right', new THREE.Vector3(rs * .50, .64, .10), new THREE.Vector3(rs * .18, .95, .08), e)
        this.rotate('head', -.045 * e, 0, sway * .014)
        break
      }
      case 'sad': {
        // Lower gaze and soften the torso; hands remain visibly at the sides.
        this.rotate('head', .12 * e, 0, .025 * e)
        this.rotate('chest', .065 * e, 0, -.012 * e)
        this.arm('left', new THREE.Vector3(ls * .08, -.996, -.02), new THREE.Vector3(ls * .02, -.999, -.01))
        this.arm('right', new THREE.Vector3(rs * .08, -.996, -.02), new THREE.Vector3(rs * .02, -.999, -.01))
        break
      }
      case 'lookAround': {
        this.rotate('head', -lookY * .06, Math.sin(p * Math.PI * 3) * .28 * e, sway * .012)
        break
      }
      case 'surprised': {
        // Hands lift slightly away from the body; avoid the previous crossed/inside pose.
        this.rotate('head', -.06 * e, 0, 0)
        this.arm('left', new THREE.Vector3(ls * .34, -.76, .24), new THREE.Vector3(ls * .24, -.86, .28), e)
        this.arm('right', new THREE.Vector3(rs * .34, -.76, .24), new THREE.Vector3(rs * .24, -.86, .28), e)
        break
      }
      case 'angry': {
        // Firm posture only; do not shake the head/body aggressively.
        this.rotate('head', -.015 * e, lookX * .04, 0)
        this.rotate('chest', -.020 * e, 0, 0)
        this.arm('left', new THREE.Vector3(ls * .18, -.96, .16), new THREE.Vector3(-ls * .22, -.78, .50), e * .65)
        this.arm('right', new THREE.Vector3(rs * .18, -.96, .16), new THREE.Vector3(-rs * .22, -.78, .50), e * .65)
        break
      }
      case 'custom': {
        this.applyCustom(custom ?? undefined, e, breath, sway, p)
        break
      }
      case 'idle':
      default:
        break
    }

    this.vrm.scene.updateMatrixWorld(true)
  }
}