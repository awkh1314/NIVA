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

  private relaxedArms() {
    const l = this.sideSign.left
    const r = this.sideSign.right
    this.arm('left', new THREE.Vector3(l * .14, -.989, .045), new THREE.Vector3(l * .04, -.996, .07))
    this.arm('right', new THREE.Vector3(r * .14, -.989, .045), new THREE.Vector3(r * .04, -.996, .07))
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

  update(now: number, motion: MotionState, lookX: number, lookY: number, custom?: CustomReaction | null) {
    if (!this.vrm?.humanoid) return
    this.reset()

    const t = now / 1000
    const breath = Math.sin(t * 1.72)
    const sway = Math.sin(t * .55)
    const micro = Math.sin(t * .25)
    const finite = Number.isFinite(motion.duration)
    const p = finite ? THREE.MathUtils.clamp((now - motion.start) / motion.duration, 0, 1) : .62
    const e = finite ? Math.sin(Math.PI * p) : .9

    // Natural baseline: small breathing/weight shift, eyes/head follow attention, arms down.
    this.rotate('hips', 0, sway * .012, -sway * .010)
    this.rotate('spine', breath * .008, sway * .007, micro * .006)
    this.rotate('chest', breath * .012, -sway * .008, sway * .010)
    this.rotate('upperChest', breath * .005, -sway * .004, sway * .005)
    this.rotate('head', -lookY * .10 + breath * .004, lookX * .16 + sway * .010, -sway * .010)
    this.relaxedArms()

    const ls = this.sideSign.left
    const rs = this.sideSign.right

    switch (motion.name) {
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
