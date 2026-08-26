from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / 'src/runtime/physics/niva-body-physics.mjs'
text = path.read_text(encoding='utf-8')
old = "    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.vrm.scene.quaternion).setY(0);\n    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.vrm.scene.quaternion).setY(0);"
new = "    const rootOrientation = this.vrm.scene.getWorldQuaternion(new THREE.Quaternion());\n    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(rootOrientation).setY(0);\n    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rootOrientation).setY(0);"
if text.count(old) != 1:
    raise RuntimeError(f'expected one orientation read, found {text.count(old)}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
Path(__file__).unlink()
print('physics orientation read boundary fixed')
