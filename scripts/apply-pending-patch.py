from pathlib import Path

# Remove the obsolete rollback API. Runtime collision handling is projection-only.
p=Path('runtime/niva-vrm-collision-guard.mjs')
s=p.read_text(encoding='utf-8')
marker='export function createAnatomicalCollisionGuard({'
if marker not in s:
    raise SystemExit('legacy rollback API marker missing')
s=s.split(marker,1)[0].rstrip()+"\n"
p.write_text(s,encoding='utf-8')

p=Path('runtime/niva-vrm-collision-guard.test.mjs')
s=p.read_text(encoding='utf-8')
s=s.replace('  createAnatomicalCollisionGuard,\n','',1)
marker="test('guard rolls offending chain back to last safe pose'"
if marker not in s:
    raise SystemExit('legacy rollback test marker missing')
s=s.split(marker,1)[0].rstrip()+"\n"
p.write_text(s,encoding='utf-8')

# Idle/static frames need one probe only; fast/high-angle motion remains adaptively swept.
p=Path('src/runtime/safety/self-collision-projector.mjs')
s=p.read_text(encoding='utf-8')
old="    return clamp(Math.ceil(maxAngle/5),4,24);"
new="    if(maxAngle<.25)return 1;\n    return clamp(Math.ceil(maxAngle/5),2,24);"
if old not in s:
    raise SystemExit('projector sample-count anchor missing')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')

p=Path('src/runtime/safety/self-collision-projector.test.mjs')
s=p.read_text(encoding='utf-8')
old='  assert.ok(small>=4);'
new='  assert.equal(small,1);'
if old not in s:
    raise SystemExit('projector test anchor missing')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')

Path(__file__).unlink()
print('NIVA collision runtime is projection-only; idle sweep optimized')
