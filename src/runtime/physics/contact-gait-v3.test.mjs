import test from 'node:test';
import assert from 'node:assert/strict';
import { ContactGaitController } from './contact-gait-v3.mjs';

test('walking always keeps support load normalized',()=>{
  const g=new ContactGaitController();
  for(let i=0;i<120;i++){
    const p=(i%60)/60;const s=g.update(1/60,{phase:p,action:'walk',moving:true});
    assert.ok(Math.abs(s.supportLoad.left+s.supportLoad.right-1)<1e-6);
    assert.ok(s.supportLoad.left>=0&&s.supportLoad.left<=1);
    assert.ok(s.supportLoad.right>=0&&s.supportLoad.right<=1);
  }
});

test('swing foot unloads while stance foot carries body',()=>{
  const g=new ContactGaitController();
  for(let i=0;i<12;i++)g.update(1/60,{phase:.64,action:'walk',moving:true});
  const s=g.state();
  assert.equal(s.left.contact,false);
  assert.equal(s.right.contact,true);
  assert.ok(s.supportLoad.right>.9);
});

test('heel strike loads progressively instead of teleporting pressure',()=>{
  const g=new ContactGaitController();
  g.update(1/60,{phase:.99,action:'walk',moving:true});
  const a=g.update(1/60,{phase:.01,action:'walk',moving:true});
  const b=g.update(1/60,{phase:.07,action:'walk',moving:true});
  assert.ok(a.left.heelContact>.9);
  assert.ok(b.left.load>=a.left.load);
  assert.ok(b.left.toeContact>a.left.toeContact);
});

test('root drive comes from planted contact and remains bounded',()=>{
  const g=new ContactGaitController();
  for(const p of [0,.1,.25,.4,.55,.7,.9]){
    const s=g.update(1/60,{phase:p,action:'walk',moving:true});
    assert.ok(s.stance.left||s.stance.right);
    assert.ok(s.rootDrive>=.28&&s.rootDrive<=1.08);
  }
});

test('idle returns to stable double support',()=>{
  const g=new ContactGaitController();
  g.update(1/60,{phase:.7,action:'walk',moving:true});
  for(let i=0;i<60;i++)g.update(1/60,{action:'idle',moving:false});
  const s=g.state();
  assert.equal(s.doubleSupport,true);
  assert.ok(Math.abs(s.supportLoad.left-.5)<.02);
});
