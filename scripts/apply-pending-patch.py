from pathlib import Path

p=Path('src/runtime/safety/anatomical-rom-v2.mjs')
s=p.read_text(encoding='utf-8')
old="""    const upperChest=pose.upperChest;
    if(upperChest&&elevation>120){
      const thoracic=Math.min(10,(elevation-120)*0.25);
      if(Math.abs(upperChest.z)<thoracic)upperChest.z=sign*thoracic;
    }
"""
new="""    const upperChest=pose.upperChest;
    if(upperChest&&elevation>120){
      const thoracic=Math.min(10,(elevation-120)*0.25);
      // Overhead reach recruits a small thoracic extension component. Do not
      // side-bend the chest based on arm side: bilateral elevation must remain symmetric.
      upperChest.x=Math.min(upperChest.x,-thoracic);
    }
"""
if old not in s: raise SystemExit('shoulder thoracic anchor missing')
s=s.replace(old,new,1)
old2="""  for(const side of ['left','right']){
    projectShoulderComplex(pose,side);projectHip(pose,side);projectKnee(pose,side);projectWrist(pose,side);projectThumb(pose,side);
    for(const finger of ['Index','Middle','Ring','Little'])projectFinger(pose,side,finger);
  }

  return pose;
"""
new2="""  for(const side of ['left','right']){
    projectShoulderComplex(pose,side);projectHip(pose,side);projectKnee(pose,side);projectWrist(pose,side);projectThumb(pose,side);
    for(const finger of ['Index','Middle','Ring','Little'])projectFinger(pose,side,finger);
  }

  // Coupled shoulder recruitment may alter upperChest. Re-project the serial
  // trunk totals so no secondary coupling can escape the global spine envelope.
  limitCombined(pose,['spine','chest','upperChest'],'x',-30,60);
  limitCombined(pose,['spine','chest','upperChest'],'y',-25,25);
  limitCombined(pose,['spine','chest','upperChest'],'z',-30,30);

  return pose;
"""
if old2 not in s: raise SystemExit('post coupling anchor missing')
s=s.replace(old2,new2,1)
p.write_text(s,encoding='utf-8')

p=Path('src/runtime/safety/anatomical-rom-v2.test.mjs')
s=p.read_text(encoding='utf-8')
s=s.replace("  assert.ok(Math.abs(out.upperChest.z)>0);", "  assert.ok(out.upperChest.x<0);",1)
anchor="""test('deep hip flexion reduces remaining rotation and abduction room',()=>{
"""
extra="""test('bilateral overhead reach recruits both shoulders without lateral chest bias',()=>{
  const out=projectAnatomicalPose(pose({leftShoulder:{},rightShoulder:{},leftUpperArm:{z:-130},rightUpperArm:{z:130},upperChest:{}}));
  assert.ok(out.leftShoulder.z<0);
  assert.ok(out.rightShoulder.z>0);
  assert.ok(Math.abs(out.upperChest.z)<1e-6);
  assert.ok(out.upperChest.x<0);
});

"""+anchor
if anchor not in s: raise SystemExit('bilateral test anchor missing')
s=s.replace(anchor,extra,1)
p.write_text(s,encoding='utf-8')

Path(__file__).unlink()
print('NIVA Anatomical ROM V2 bilateral shoulder coupling refined')
