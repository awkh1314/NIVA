import test from 'node:test';
import assert from 'node:assert/strict';
import { DayNightCycle, sampleDayNight } from './day-night-cycle.mjs';

test('sunrise noon sunset midnight have distinct lighting states',()=>{
  const sunrise=sampleDayNight(0),noon=sampleDayNight(.25),sunset=sampleDayNight(.5),midnight=sampleDayNight(.75);
  assert.ok(noon.sunPosition.y>20);assert.ok(midnight.sunPosition.y<-20);assert.ok(noon.dayFactor>.95);assert.ok(midnight.nightFactor>.95);assert.ok(sunrise.horizonFactor>.9);assert.ok(sunset.horizonFactor>.9);
});

test('cycle advances continuously and can pause resume and set time',()=>{
  const c=new DayNightCycle({timeOfDay:.25,dayDurationSeconds:100,auto:true,speed:2});const a=c.timeOfDay;c.update(1);assert.ok(c.timeOfDay>a);c.pause();const b=c.timeOfDay;c.update(1);assert.equal(c.timeOfDay,b);c.setTimeOfDay(.75);assert.ok(Math.abs(c.state().hour-18)<1e-8);c.resume();c.setSpeed(.5);c.update(1);assert.ok(c.timeOfDay>.75);
});

test('stars are hidden by day and visible at night',()=>{assert.ok(sampleDayNight(.25).starOpacity<.05);assert.ok(sampleDayNight(.75).starOpacity>.9);});
