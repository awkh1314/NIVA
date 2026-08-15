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
  private rotationControlsInstalled = false
  private dragging = false
  private dragPointerId = -1
  private dragX = 0

  attach(vrm: any) {
    this.vrm = vrm
    this.rest.clear()
    if (!vrm?.humanoid) return

    // AvatarSample_A/legacy VRM exports may face away from a +Z camera.
    // Correct only known legacy/sample bodies; other imported VRM models keep their authored facing.
    const metaName = String(vrm?.meta?.name ?? vrm?.meta?.title ?? '')
    const metaVersion = String(vrm?.meta?.metaVersion ?? vrm?.metaVersion ?? '')
    this.baseYaw = metaVersion === '0' || /AvatarSample[_\s-]*A/i.test(metaName) ? Math.PI : 0
    this.viewYaw = 0
    this.applyRootOrientation()
    this.installRotationControls()

    // Drive the real skinned skeleton so a wider range of VRM exports visibly respond.
    vrm.humanoid.autoUpdateHumanBones = false
    for (const name of TRACKED) {
      const node = this.bone(name)
      if (node) this.rest.set(name, node.quaternion.clone())
    }

    // Determine left/right in avatar-local coordinates, not world X.
    // World X flips when the user rotates the model 180 degrees, which previously made both arms converge.
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
      try { stage.setPointerCapture(event.pointerId) } catch { /* unsupported capture is harmless */ }
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
      try { stage.releasePointerCapture(event.pointerId) } catch { /* already released */ }
    }
    stage.addEventListener('pointerup', stopDrag)
    stage.addEventListener('pointercancel', stopDrag)

    // Double-click restores the authored/default front view.
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
    const delta = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'))
    node.quaternion.copy(rest).multiply(delta)
  }

  /** Convert an avatar-local direction to world space using the current model/view rotation. */
  private avatarDirectionToWorld(localDirection: THREE.Vector3, target: THREE.Vector3) {
    const root = this.vrm?.scene as THREE.Object3D | undefined
    target.copy(localDirection).normalize()
    if (!root) return target
    root.updateWorldMatrix(true, false)
    root.getWorldQuaternion(this.tmpRootQ)
    return target.applyQuaternion(this.tmpRootQ).normalize()
  }

  /** Aim a bone's child toward a world-space direction while preserving the bone's rest roll. */
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

    // Motion definitions are authored in avatar-local space.
    // Rotate those directions together with the avatar before solving the raw bones in world space.
    this.avatarDirectionToWorld(upperDir, this.tmpUpperWorld)
    this.avatarDirectionToWorld(lowerDir, this.tmpLowerWorld)
    this.aim(upper, lower, this.tmpUpperWorld, strength)
    this.aim(lower, hand, this.tmpLowerWorld, strength)
  }

  private relaxedArms() {
    const l = this.sideSign.left
    const r = this.sideSign.right
    this.arm('left', new THREE.Vector3(l * .17, -.98, .05), new THREE.Vector3(l * .06, -.995, .08))
    this.arm('right', new THREE.Vector3(r * .17, -.98, .05), new THREE.Vector3(r * .06, -.995, .08))
  }

  private applyArmPose(side: 'left' | 'right', pose: ArmPose | undefined, strength: number) {
    const s = this.sideSign[side]
    switch (pose) {
      case 'open':
        this.arm(side, new THREE.Vector3(s * .72, -.26, .08), new THREE.Vector3(s * .84, -.38, .12), strength)
        break
      case 'up':
        this.arm(side, new THREE.Vector3(s * .52, .66, .10), new THREE.Vector3(s * .20, .94, .08), strength)
        break
      case 'cheek':
        this.arm(side, new THREE.Vector3(s * .27, -.62, .17), new THREE.Vector3(-s * .32, .80, .30), strength)
        break
      case 'forward':
        this.arm(side, new THREE.Vector3(s * .18, -.15, .96), new THREE.Vector3(s * .05, -.18, .98), strength)
        break
      case 'chest':
        this.arm(side, new THREE.Vector3(s * .28, -.52, .16), new THREE.Vector3(-s * .55, .30, .48), strength)
        break
      case 'down':
      default:
        this.arm(side, new THREE.Vector3(s * .15, -.985, .05), new THREE.Vector3(s * .04, -.995, .07), strength)
        break
    }
  }

  private applyCustom(custom: CustomReaction | undefined, e: number, breath: number, sway: number, p: number) {
    if (!custom) return
    const energy = THREE.MathUtils.clamp(custom.energy ?? .65, 0, 1)
    const strength = THREE.MathUtils.clamp(.55 + energy * .45, 0, 1) * Math.max(.35, e)
    const yaw = clamp(custom.headYaw) * .38
    const pitch = clamp(custom.headPitch) * .26
    const tilt = clamp(custom.headTilt) * .30
    const lean = clamp(custom.bodyLean) * .15
    const turn = clamp(custom.bodyTurn) * .20
    const pulse = Math.sin(p * Math.PI * (2 + energy * 4)) * .018 * energy

    this.rotate('hips', -lean * .22, turn * .25, -lean * .10)
    this.rotate('spine', lean * .45 + breath * .008, turn * .38, sway * .006)
    this.rotate('chest', lean * .55 + pulse, turn * .62, -tilt * .12)
    this.rotate('head', pitch, yaw, tilt)
    this.applyArmPose('left', custom.leftArm, strength)
    this.applyArmPose('right', custom.rightArm, strength)
  }

  update(now: number, motion: MotionState, lookX: number, lookY: number, custom?: CustomReaction | null) {
    if (!this.vrm?.humanoid) return
    this.reset()

    const t = now / 1000
    const breath = Math.sin(t * 1.85)
    const sway = Math.sin(t * .62)
    const micro = Math.sin(t * .27)
    const finite = Number.isFinite(motion.duration)
    const p = finite ? THREE.MathUtils.clamp((now - motion.start) / motion.duration, 0, 1) : .62
    const e = finite ? Math.sin(Math.PI * p) : .9

    // Persistent life: breathing, weight shift and head attention never stop.
    this.rotate('hips', 0, sway * .018, -sway * .015)
    this.rotate('spine', breath * .012, sway * .010, micro * .010)
    this.rotate('chest', breath * .018, -sway * .012, sway * .018)
    this.rotate('upperChest', breath * .008, -sway * .006, sway * .009)
    this.rotate('head', -lookY * .12 + breath * .006, lookX * .19 + sway * .018, -sway * .018)
    this.relaxedArms()

    const ls = this.sideSign.left
    const rs = this.sideSign.right

    switch (motion.name) {
      case 'thinking': {
        this.rotate('head', .035 - lookY * .08, -.10 + lookX * .10, -.13)
        this.rotate('chest', breath * .012, -.025, -.035)
        this.arm('left', new THREE.Vector3(ls * .13, -.99, .03), new THREE.Vector3(ls * .03, -1, .04))
        this.arm('right', new THREE.Vector3(rs * .28, -.73, .15), new THREE.Vector3(-rs * .33, .78, .30), e)
        break
      }
      case 'wave': {
        const wave = Math.sin(p * Math.PI * 7)
        this.arm('right', new THREE.Vector3(rs * .62, .48, .12), new THREE.Vector3(rs * (.16 + wave * .34), .88, .12), e)
        this.rotate('head', -.03, lookX * .08, -rs * .05 * e)
        break
      }
      case 'greet': {
        this.rotate('head', .10 * e - lookY * .06, lookX * .1, -.08 * e)
        this.rotate('chest', -.025 * e, 0, .025 * e)
        break
      }
      case 'happy': {
        const bounce = Math.sin(p * Math.PI * 4) * e
        this.rotate('hips', -.035 * Math.max(0, bounce), sway * .01, 0)
        this.arm('left', new THREE.Vector3(ls * .58, .48, .08), new THREE.Vector3(ls * .18, .88, .12), e)
        this.arm('right', new THREE.Vector3(rs * .58, .48, .08), new THREE.Vector3(rs * .18, .88, .12), e)
        this.rotate('head', -.08 * e, 0, sway * .025)
        break
      }
      case 'sad': {
        this.rotate('head', .18 * e, 0, .04 * e)
        this.rotate('chest', .10 * e, 0, -.02 * e)
        this.arm('left', new THREE.Vector3(ls * .10, -.995, -.06), new THREE.Vector3(-ls * .02, -.995, -.05))
        this.arm('right', new THREE.Vector3(rs * .10, -.995, -.06), new THREE.Vector3(-rs * .02, -.995, -.05))
        break
      }
      case 'lookAround': {
        this.rotate('head', -lookY * .08, Math.sin(p * Math.PI * 3) * .36 * e, sway * .02)
        break
      }
      case 'surprised': {
        this.rotate('head', -.11 * e, 0, 0)
        this.arm('left', new THREE.Vector3(ls * .42, -.70, .16), new THREE.Vector3(ls * .28, -.86, .20), e)
        this.arm('right', new THREE.Vector3(rs * .42, -.70, .16), new THREE.Vector3(rs * .28, -.86, .20), e)
        break
      }
      case 'angry': {
        this.rotate('head', .02, Math.sin(p * Math.PI * 10) * .06 * (1 - p), 0)
        this.rotate('chest', 0, 0, .025 * Math.sin(p * Math.PI * 6))
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
