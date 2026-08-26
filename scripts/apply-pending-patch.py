from pathlib import Path

p=Path('src/runtime/physics/niva-body-physics.mjs')
s=p.read_text()

s=s.replace(
"import { GaitBalanceController, HUMANOID_MASS_WEIGHTS, weightedCenterOfMass } from './biomechanics-life.mjs';",
"import { GaitBalanceController, HUMANOID_MASS_WEIGHTS, weightedCenterOfMass } from './biomechanics-life.mjs';\nimport { RootMotionEstimator, RecoveryStepPlanner, capturePoint } from './predictive-stability.mjs';"
)

old="""    this.balanceController = new GaitBalanceController({ modelHeight });
    this.balancePlan = null;
"""
new="""    this.balanceController = new GaitBalanceController({ modelHeight });
    this.balancePlan = null;
    this.motionEstimator = new RootMotionEstimator();
    this.recoveryPlanner = new RecoveryStepPlanner({ modelHeight });
    this.predictivePlan = null;
"""
assert old in s
s=s.replace(old,new,1)

old="""    this.balancePlan = this.balanceController.update(dt, {
      action,
      phase,
      stance,
      centerOfMass,
      leftFoot,
      rightFoot,
      forward,
      right,
      grounded: this.grounded,
    });

    // Physics owns root translation. A small visual pelvis shift places the
"""
new="""    this.balancePlan = this.balanceController.update(dt, {
      action,
      phase,
      stance,
      centerOfMass,
      leftFoot,
      rightFoot,
      forward,
      right,
      grounded: this.grounded,
    });

    const rootPosition = this.characterBody?.translation?.() || this.vrm.scene.position;
    const motion = this.motionEstimator.update(dt, rootPosition);
    const projectedCapture = capturePoint({
      centerOfMass,
      velocity: motion.velocity,
      groundY: this.groundY,
    });
    this.predictivePlan = this.recoveryPlanner.update(dt, {
      action,
      grounded: this.grounded,
      capturePoint: projectedCapture,
      supportCenter: this.balancePlan?.supportCenter || null,
      leftFoot,
      rightFoot,
      stance,
      forward,
      right,
      velocity: motion.velocity,
      acceleration: motion.acceleration,
    });

    if (this.balancePlan) {
      this.balancePlan.velocity = motion.velocity;
      this.balancePlan.acceleration = motion.acceleration;
      this.balancePlan.capturePoint = projectedCapture;
      this.balancePlan.predictive = this.predictivePlan ? { ...this.predictivePlan } : null;
      const fullBody = this.balancePlan.fullBody;
      if (fullBody && this.predictivePlan) {
        const pp = this.predictivePlan.preLeanPitchDeg || 0;
        const pr = this.predictivePlan.preLeanRollDeg || 0;
        fullBody.hips.x += pp * 0.18; fullBody.hips.z += pr * 0.34;
        fullBody.spine.x += pp * 0.28; fullBody.spine.z += pr * 0.25;
        fullBody.chest.x += pp * 0.24; fullBody.chest.z += pr * 0.17;
        fullBody.upperChest.x += pp * 0.14; fullBody.upperChest.z += pr * 0.09;
        fullBody.neck.x -= pp * 0.08; fullBody.neck.z -= pr * 0.10;
        fullBody.head.x -= pp * 0.07; fullBody.head.z -= pr * 0.08;
      }
    }

    // If the capture point leaves the dynamic support area, move the free foot
    // through a bounded recovery arc. IK remains the sole limb-transform owner.
    if (this.predictivePlan?.needsStep && this.predictivePlan.stepSide && this.predictivePlan.stepTarget) {
      const side = this.predictivePlan.stepSide;
      const source = side === 'left' ? leftFoot : rightFoot;
      const target = new THREE.Vector3(
        this.predictivePlan.stepTarget.x,
        this.predictivePlan.stepTarget.y,
        this.predictivePlan.stepTarget.z,
      );
      const ground = this.groundHitAt(target);
      if (ground) target.y = Math.max(target.y, ground.point.y + this.footOffset[side]);
      else if (source) target.y = Math.max(target.y, source.y);
      this.footAnchor[side] = target;
      stance[side] = true;
      this.lastStance[side] = true;
    }

    // Physics owns root translation. A small visual pelvis shift places the
"""
assert old in s
s=s.replace(old,new,1)

s=s.replace("owner: 'Rapier + root position + ground contacts + COM balance plan',","owner: 'Rapier + root position + contacts + COM/capture-point recovery planning',",1)
s=s.replace("solver: 'physics-balance-v2',","solver: 'physics-predictive-balance-v3',",1)

p.write_text(s)
Path('scripts/apply-pending-patch.py').unlink()
print('NIVA predictive stability runtime wired')
