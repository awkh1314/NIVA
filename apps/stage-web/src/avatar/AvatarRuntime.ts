import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRM, VRMUtils } from '@pixiv/three-vrm'
import type { SemanticExpression } from '../core/types'

const expressionMap: Record<SemanticExpression, string | null> = {
  neutral: null,
  happy: 'happy',
  shy: 'happy',
  sad: 'sad',
  angry: 'angry',
  surprised: 'surprised',
  thinking: 'relaxed',
}

// Temporary CC0 fallback body used only when the repo-local NIVA.vrm is absent.
// Source: Polygonal Mind 100Avatars R1, avatar 057 "Rose".
const FALLBACK_VRM_URL = 'https://arweave.net/Ea1KXujzJatQgCFSMzGOzp_UtHqB1pyia--U3AtkMAY'

export class AvatarRuntime {
  vrm: VRM | null = null
  root = new THREE.Group()
  usingFallback = false
  private target = new THREE.Object3D()
  private look = new THREE.Vector2()
  private desiredLook = new THREE.Vector2()
  private blinkClock = 0
  private nextBlink = 2.2
  private blinkPhase = -1
  private time = 0

  constructor(private scene: THREE.Scene) {
    scene.add(this.root)
    scene.add(this.target)
  }

  private createLoader() {
    const loader = new GLTFLoader()
    loader.register((parser) => new VRMLoaderPlugin(parser))
    return loader
  }

  private async loadVrm(url: string) {
    const gltf = await this.createLoader().loadAsync(url)
    const vrm = gltf.userData.vrm as VRM | undefined
    if (!vrm) throw new Error(`No VRM data found in ${url}`)
    return vrm
  }

  async load(url: string) {
    let vrm: VRM
    this.usingFallback = false

    try {
      vrm = await this.loadVrm(url)
    } catch (localError) {
      console.warn('Local NIVA.vrm unavailable; loading temporary CC0 fallback body.', localError)
      vrm = await this.loadVrm(FALLBACK_VRM_URL)
      this.usingFallback = true
    }

    if (this.vrm) {
      this.root.remove(this.vrm.scene)
      VRMUtils.deepDispose(this.vrm.scene)
    }

    this.vrm = vrm
    VRMUtils.removeUnnecessaryVertices(vrm.scene)
    VRMUtils.combineSkeletons(vrm.scene)
    vrm.scene.traverse((obj) => {
      obj.frustumCulled = false
    })
    this.root.add(vrm.scene)
    if (vrm.lookAt) vrm.lookAt.target = this.target
    this.setExpression('neutral', 1)
  }

  setExpression(name: SemanticExpression, intensity = 1) {
    const manager = this.vrm?.expressionManager
    if (!manager) return
    for (const key of ['happy', 'relaxed', 'sad', 'angry', 'surprised']) {
      manager.setValue(key, 0)
    }
    const preset = expressionMap[name]
    if (preset) manager.setValue(preset, THREE.MathUtils.clamp(intensity, 0, 1))
    if (name === 'shy') manager.setValue('happy', Math.min(.55, intensity))
  }

  setLookTarget(x: number, y: number) {
    this.desiredLook.set(
      THREE.MathUtils.clamp(x, -1, 1),
      THREE.MathUtils.clamp(y, -1, 1),
    )
  }

  update(dt: number) {
    const vrm = this.vrm
    if (!vrm) return
    this.time += dt
    vrm.update(dt)

    this.look.x = THREE.MathUtils.damp(this.look.x, this.desiredLook.x, 5, dt)
    this.look.y = THREE.MathUtils.damp(this.look.y, this.desiredLook.y, 5, dt)
    this.target.position.set(this.look.x * 1.2, 1.45 + this.look.y * .55, 2.7)

    const chest = vrm.humanoid?.getNormalizedBoneNode('chest')
    const hips = vrm.humanoid?.getNormalizedBoneNode('hips')
    if (chest) chest.rotation.x = Math.sin(this.time * 2.1) * .008
    if (hips) hips.position.y = Math.sin(this.time * 1.1) * .004

    this.blinkClock += dt
    const manager = vrm.expressionManager
    if (manager) {
      if (this.blinkPhase < 0 && this.blinkClock >= this.nextBlink) {
        this.blinkPhase = 0
        this.blinkClock = 0
      }
      if (this.blinkPhase >= 0) {
        this.blinkPhase += dt / .18
        const p = Math.min(1, this.blinkPhase)
        const value = 1 - Math.abs(p * 2 - 1)
        manager.setValue('blink', value)
        if (p >= 1) {
          manager.setValue('blink', 0)
          this.blinkPhase = -1
          this.nextBlink = 2 + Math.random() * 3.2
        }
      }
    }
  }
}
