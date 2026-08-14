import * as THREE from 'three'
import type { MotionName } from '../core/types'

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

export class RawMotionController {
  private vrm: any = null
  private rest = new Map<BoneName, THREE.Quaternion>()
  private sideSign = { left: 1, right: -1 }
  private tmpParentQ = new THREE.Quaternion()
  private tmpInvQ = new THREE.Quaternion()
  private tmpAlign = new THREE.Quaternion()
  private tmpRestDir = new THREE.Vector3()
  private tmpDesired = new THREE.Vector3()
  private tmpWorld = new THREE.Vector3()
  private tmpCenter = new THREE.Vector3()

  attach(vrm: any) {
    this.vrm = vrm
    this.rest.clear()
    if (!vrm?.humanoid) return

    // We intentionally drive the real skinned skeleton. This bypasses models whose
    // normalized humanoid bridge does not visibly respond in the renderer.
    vrm.humanoid.autoUpdateHumanBones = false
    for (const name of TRACKED) {
      const node = this.bone(name)
      if (node) this.rest.set(name, node.quaternion.clone())
    }

    const hips = this.worldPos('hips')
    const left = this.worldPos('leftUpperArm')
    const right = this.worldPos('rightUpperArm')
    if (hips && left) this.sideSign.left = Math.sign(left.x - hips.x) || 1
    if (hips && right) this.sideSign.right = Math.sign(right.x - hips.x) || -1
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
    this.aim(upper, lower, upperDir, strength)
    this.aim(lower, hand, lowerDir, strength)
  }

  private relaxedArms() {
    const l = this.sideSign.left
    const r = this.sideSign.right
    this.arm('left', new THREE.Vector3(l * .17, -.98, .05), new THREE.Vector3(l * .06, -.995, .08))
    this.arm('right', new THREE.Vector3(r * .17, -.98, .05), new THREE.Vector3(r * .06, -.995, .08))
  }

  update(now: number, motion: MotionState, lookX: number, lookY: number) {
    if (!this.vrm?.humanoid) return
    this.reset()

    const t = now / 1000
    const breath = Math.sin(t * 1.85)
    const sway = Math.sin(t * .62)
    const micro = Math.sin(t * .27)
    const finite = Number.isFinite(motion.duration)
    const p = finite ? THREE.MathUtils.clamp((now - motion.start) / motion.duration, 0, 1) : .62
    const e = finite ? Math.sin(Math.PI * p) : .9

    // Persistent life: breathing, weight shift and eye/head attention never stop.
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
        // Right hand rises toward the cheek/chin; left arm stays naturally down.
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
      case 'idle':
      default:
        break
    }

    this.vrm.scene.updateMatrixWorld(true)
  }
}
