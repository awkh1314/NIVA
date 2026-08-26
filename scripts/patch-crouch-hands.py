from pathlib import Path

p = Path('src/runtime/physics/niva-body-physics.mjs')
s = p.read_text(encoding='utf-8')

old = """    if (this.ikEnabled) {
      for (const side of ['left', 'right']) {
        const stance = this.stanceFor(action, phase, side);
        if (stance && !this.lastStance[side]) this.captureFoot(side);
        if (!stance && this.lastStance[side] && !['crouch', 'recovery'].includes(action)) this.footAnchor[side] = null;
        this.lastStance[side] = stance;
        if (stance && this.footAnchor[side]) this.solveLeg(side, this.footAnchor[side], this.ikStrength, action);
      }

      if (action === 'walk' || action === 'run') this.solveLocomotionArms(action, phase);
      if (action === 'wave') this.solveWavePose(phase);
      if (action === 'recovery') this.solveHandsToKnees(0.86);
    }
"""
new = """    if (this.ikEnabled) {
      for (const side of ['left', 'right']) {
        const stance = this.stanceFor(action, phase, side);
        if (stance && !this.lastStance[side]) this.captureFoot(side);
        if (!stance && this.lastStance[side] && !['crouch', 'recovery'].includes(action)) this.footAnchor[side] = null;
        this.lastStance[side] = stance;
        if (stance && this.footAnchor[side]) this.solveLeg(side, this.footAnchor[side], this.ikStrength, action);
      }
    }

    // Upper-body action IK is independent from the foot-IK toggle.
    if (action === 'walk' || action === 'run') this.solveLocomotionArms(action, phase);
    if (action === 'wave') this.solveWavePose(phase);
    if (action === 'crouch') this.solveCrouchHandsToHead(0.96);
    if (action === 'recovery') this.solveHandsToKnees(0.86);
"""
if old not in s:
    raise SystemExit('solvePostAnimation marker not found')
s = s.replace(old, new, 1)

marker = "  solveHandsToKnees(weight = 0.8) {\n"
method = """  solveCrouchHandsToHead(weight = 0.96) {
    this.vrm.scene.updateMatrixWorld(true);
    const head = this.getBone('head');
    if (!head) return;
    const { right, up, forward } = this.bodyBasis();
    const headPos = head.getWorldPosition(new THREE.Vector3());

    // Same-side targets behind the crown plus wide elbow poles create a true
    // hands-on-head squat. Left hand stays left; right hand stays right.
    for (const side of ['left', 'right']) {
      const upper = this.getBone(`${side}UpperArm`);
      if (!upper) continue;
      const sign = side === 'left' ? -1 : 1;
      const target = headPos.clone()
        .addScaledVector(right, sign * this.modelHeight * 0.078)
        .addScaledVector(up, this.modelHeight * 0.018)
        .addScaledVector(forward, -this.modelHeight * 0.052);
      const pole = upper.getWorldPosition(new THREE.Vector3())
        .addScaledVector(right, sign * this.modelHeight * 0.34)
        .addScaledVector(up, this.modelHeight * 0.055)
        .addScaledVector(forward, this.modelHeight * 0.015);
      this.solveArm(side, target, weight, pole);
    }
  }

"""
if marker not in s:
    raise SystemExit('hands-to-knees marker not found')
s = s.replace(marker, method + marker, 1)
s = s.replace("solver: 'pole-guided-ccd-v3',", "solver: 'pole-guided-ccd-v3.1-hands-on-head',", 1)
p.write_text(s, encoding='utf-8')

Path('DEPLOY_VERSION.txt').write_text(
    'NIVA Biomechanics V3.1\n'
    'Crouch: feet planted, knees forward, both hands behind/sides of head, elbows out.\n'
    'Left/right arm targets are never swapped.\n',
    encoding='utf-8',
)
