import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { VRM } from '@pixiv/three-vrm'
import {
  VRMAnimationLoaderPlugin,
  createVRMAnimationClip,
} from '@pixiv/three-vrm-animation'
import type { MotionName } from '../core/types'

export class MotionController {
  private mixer: THREE.AnimationMixer | null = null
  private actions = new Map<MotionName, THREE.AnimationAction>()
  private current: THREE.AnimationAction | null = null

  attach(vrm: VRM) {
    this.mixer = new THREE.AnimationMixer(vrm.scene)
    this.actions.clear()
    this.current = null
  }

  async load(name: MotionName, url: string, vrm: VRM) {
    if (!this.mixer) throw new Error('MotionController must be attached before loading motions')
    const loader = new GLTFLoader()
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser))
    const gltf = await loader.loadAsync(url)
    const animation = gltf.userData.vrmAnimations?.[0]
    if (!animation) throw new Error(`No VRM animation found: ${url}`)
    const clip = createVRMAnimationClip(animation, vrm)
    const action = this.mixer.clipAction(clip)
    if (name === 'idle') {
      action.setLoop(THREE.LoopRepeat, Infinity)
    } else {
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
    }
    this.actions.set(name, action)
  }

  play(name: MotionName, fade = .35) {
    const next = this.actions.get(name)
    if (!next) return false
    if (this.current === next && next.isRunning()) return true

    next.reset().fadeIn(fade).play()
    if (this.current) this.current.fadeOut(fade)
    this.current = next

    if (name !== 'idle' && this.mixer) {
      const onFinished = (event: { action?: THREE.AnimationAction }) => {
        if (event.action !== next) return
        this.mixer?.removeEventListener('finished', onFinished as never)
        this.play('idle', .4)
      }
      this.mixer.addEventListener('finished', onFinished as never)
    }
    return true
  }

  update(dt: number) {
    this.mixer?.update(dt)
  }
}
