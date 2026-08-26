from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / 'src/main.js'
text = path.read_text(encoding='utf-8')
old = "    const m=manualOffsets.get(name)||[0,0,0];node.quaternion.copy(base).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(m[0]),rad(m[1]),rad(m[2]),'XYZ'))).multiply(delta));"
new = "    const m=manualOffsets.get(name)||[0,0,0];\n    const manualQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(m[0]),rad(m[1]),rad(m[2]),'XYZ'));\n    node.quaternion.copy(base).multiply(manualQ).multiply(delta);"
count = text.count(old)
if count != 1:
    raise RuntimeError(f'expected one broken additive composition, found {count}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
Path(__file__).unlink()
print('additive quaternion syntax fixed')
