import test from 'node:test';
import assert from 'node:assert/strict';
import { KeyboardLocomotionController, movementAxes, isMovementCode } from './keyboard-locomotion.mjs';

test('WASD and arrow keys map to the same normalized movement axes',()=>{
  assert.deepEqual(movementAxes(['KeyW']),{x:0,z:1,active:true});
  assert.deepEqual(movementAxes(['ArrowDown']),{x:0,z:-1,active:true});
  assert.deepEqual(movementAxes(['KeyA']),{x:-1,z:0,active:true});
  assert.deepEqual(movementAxes(['ArrowRight']),{x:1,z:0,active:true});
  const diagonal=movementAxes(['KeyW','KeyD']);
  assert.ok(Math.abs(Math.hypot(diagonal.x,diagonal.z)-1)<1e-9);
  assert.ok(diagonal.x>0&&diagonal.z>0);
});

test('opposite keys cancel without creating phantom locomotion',()=>{
  assert.deepEqual(movementAxes(['KeyW','KeyS']),{x:0,z:0,active:false});
  assert.deepEqual(movementAxes(['ArrowLeft','KeyD']),{x:0,z:0,active:false});
});

test('controller accelerates and decelerates instead of snapping root speed',()=>{
  const c=new KeyboardLocomotionController({acceleration:10,deceleration:13});
  assert.equal(c.keyDown('KeyW'),true);
  const a=c.update(1/60),b=c.update(1/60);
  assert.ok(a.speed01>0&&a.speed01<1);
  assert.ok(b.speed01>a.speed01);
  c.keyUp('KeyW');
  const before=b.speed01,after=c.update(1/60).speed01;
  assert.ok(after<before&&after>0);
});

test('controller remembers last direction during the braking tail',()=>{
  const c=new KeyboardLocomotionController();
  c.keyDown('KeyA');c.update(.05);c.keyUp('KeyA');
  const s=c.update(.01);
  assert.ok(s.moving);
  assert.equal(s.axisX,-1);
  assert.equal(s.axisZ,0);
});

test('only movement codes are captured',()=>{
  assert.equal(isMovementCode('KeyW'),true);
  assert.equal(isMovementCode('ArrowUp'),true);
  assert.equal(isMovementCode('KeyC'),false);
});
