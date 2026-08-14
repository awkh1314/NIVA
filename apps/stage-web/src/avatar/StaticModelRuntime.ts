import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export class StaticModelRuntime {
  root = new THREE.Group()
  model: THREE.Object3D | null = null

  constructor(scene: THREE.Scene) {
    scene.add(this.root)
  }

  async loadFile(file: File) {
    const url = URL.createObjectURL(file)
    try {
      await this.loadUrl(url)
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  async loadUrl(url: string) {
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync(url)

    if (this.model) {
      this.root.remove(this.model)
      this.disposeObject(this.model)
    }

    const model = gltf.scene
    model.traverse((obj) => {
      obj.frustumCulled = false
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
    })

    const box = new THREE.Box3().setFromObject(model)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const targetHeight = 1.78
    const scale = size.y > 0 ? targetHeight / size.y : 1
    model.scale.setScalar(scale)

    const scaledBox = new THREE.Box3().setFromObject(model)
    const scaledCenter = scaledBox.getCenter(new THREE.Vector3())
    const minY = scaledBox.min.y
    model.position.x -= scaledCenter.x
    model.position.z -= scaledCenter.z
    model.position.y -= minY

    this.model = model
    this.root.add(model)
  }

  clear() {
    if (!this.model) return
    this.root.remove(this.model)
    this.disposeObject(this.model)
    this.model = null
  }

  private disposeObject(root: THREE.Object3D) {
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.geometry?.dispose()
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const material of materials) {
        const mat = material as THREE.MeshStandardMaterial
        mat.map?.dispose()
        mat.normalMap?.dispose()
        mat.roughnessMap?.dispose()
        mat.metalnessMap?.dispose()
        material.dispose()
      }
    })
  }
}
