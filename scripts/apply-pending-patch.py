from pathlib import Path
import re

p = Path('src/runtime/physics/niva-body-physics.mjs')
s = p.read_text(encoding='utf-8')

if 'this.crouchReference = null;' not in s:
    s = s.replace(
        '    this.lastGroundNormal = new THREE.Vector3(0, 1, 0);\n',
        '    this.lastGroundNormal = new THREE.Vector3(0, 1, 0);\n    this.crouchReference = null;\n',
        1,
    )

s = s.replace(
    "      if (action === 'crouch' || action === 'recovery') this.captureBothFeet();\n",
    "      if (action === 'crouch' || action === 'recovery') { this.captureBothFeet(); if (action === 'crouch') this.captureCrouchReference(); }\n",
    1,
)

s = s.replace(
    '      const depth = this.modelHeight * clamp(crouchDepth, 0.12, 0.24) * eased;\n',
    '      const depth = this.modelHeight * clamp(crouchDepth, 0.10, 0.145) * eased;\n',
    1,
)

old_loop = """    if (this.ikEnabled) {
      for (const side of ['left', 'right']) {
        const stance = this.stanceFor(action, phase, side);
        if (stance && !this.lastStance[side]) this.captureFoot(side);
        if (!stance && this.lastStance[side] && !['crouch', 'recovery'].includes(action)) this.footAnchor[side] = null;
        this.lastStance[side] = stance;
        if (stance && this.footAnchor[side]) this.solveLeg(side, this.footAnchor[side], this.ikStrength, action);
      }
      if (action === 'crouch') this.stabilizeCrouchFeet(crouchAmount);
    }
"""
new_loop = """    if (this.ikEnabled) {
      if (action === 'crouch') {
        this.solveStableCrouch(crouchAmount);
      } else {
        for (const side of ['left', 'right']) {
          const stance = this.stanceFor(action, phase, side);
          if (stance && !this.lastStance[side]) this.captureFoot(side);
          if (!stance && this.lastStance[side] && !['crouch', 'recovery'].includes(action)) this.footAnchor[side] = null;
          this.lastStance[side] = stance;
          if (stance && this.footAnchor[side]) this.solveLeg(side, this.footAnchor[side], this.ikStrength, action);
        }
      }
    }
"""
if old_loop not in s:
    raise SystemExit('stable crouch: expected V4 solve loop not found')
s = s.replace(old_loop, new_loop, 1)

s, n = re.subn(
    r"  applyCrouchBalance\(amount\) \{.*?\n  \}\n\n  flattenFoot",
    """  applyCrouchBalance(amount) {
    const a = clamp(amount, 0, 1);
    if (a <= 0.001) return;
    const right = this.bodyBasis().right;
    this.rotateWorldAround(this.getBone('spine'), right, THREE.MathUtils.degToRad(3.5 * a), 0.72);
    this.rotateWorldAround(this.getBone('chest'), right, THREE.MathUtils.degToRad(2.0 * a), 0.58);
    this.rotateWorldAround(this.getBone('upperChest'), right, THREE.MathUtils.degToRad(1.0 * a), 0.45);
  }

  flattenFoot""",
    s,
    count=1,
    flags=re.S,
)
if n != 1:
    raise SystemExit('stable crouch: applyCrouchBalance marker not found')

marker = '  rotateWorldAround(bone, axis, radians, weight = 1) {\n'
methods = """  captureCrouchReference() {
    this.vrm.scene.updateMatrixWorld(true);
    const ref = { kneeDir: {}, footVector: {} };
    for (const side of ['left', 'right']) {
      const upper = this.getBone(`${side}UpperLeg`);
      const lower = this.getBone(`${side}LowerLeg`);
      const foot = this.getBone(`${side}Foot`);
      const toes = this.getBone(`${side}Toes`);
      if (upper && lower) {
        const hip = upper.getWorldPosition(new THREE.Vector3());
        const knee = lower.getWorldPosition(new THREE.Vector3());
        const d = knee.sub(hip); d.y = 0;
        if (d.lengthSq() > 1e-6) ref.kneeDir[side] = d.normalize().clone();
      }
      if (foot && toes) {
        const fp = foot.getWorldPosition(new THREE.Vector3());
        const tp = toes.getWorldPosition(new THREE.Vector3());
        const d = tp.sub(fp); d.y = 0;
        if (d.lengthSq() > 1e-6) ref.footVector[side] = d.normalize().clone();
      }
    }
    this.crouchReference = ref;
  }

  solveStableCrouch(amount = 1) {
    const a = clamp(amount, 0, 1);
    if (a <= 0.001) return;
    const { right, forward } = this.bodyBasis();
    for (const side of ['left', 'right']) {
      const upper = this.getBone(`${side}UpperLeg`);
      const lower = this.getBone(`${side}LowerLeg`);
      const foot = this.getBone(`${side}Foot`);
      const anchor = this.footAnchor[side];
      if (!upper || !lower || !foot || !anchor) continue;
      const hip = upper.getWorldPosition(new THREE.Vector3());
      const sign = side === 'left' ? -1 : 1;
      const kneeDir = this.crouchReference?.kneeDir?.[side]?.clone() || forward.clone();
      if (kneeDir.dot(forward) < 0) kneeDir.negate();
      const pole = hip.clone()
        .addScaledVector(kneeDir, this.modelHeight * (0.075 + 0.035 * a))
        .addScaledVector(right, sign * this.modelHeight * 0.026)
        .addScaledVector(new THREE.Vector3(0, -1, 0), this.modelHeight * 0.035);
      this.solveChain(upper, lower, foot, anchor, pole, 0.52 + 0.26 * a, 3);
      this.flattenFoot(side, 0.55 + 0.35 * a);
    }
    this.correctRootToPlantedFeet(Math.min(0.55, a));
  }

"""
if '  solveStableCrouch(amount = 1) {' not in s:
    if marker not in s:
        raise SystemExit('stable crouch: insertion marker not found')
    s = s.replace(marker, methods + marker, 1)

s = s.replace(
    '    const limit = this.modelHeight * 0.028;\n    const correction = clamp(avg, -limit, limit) * 0.88 * clamp(amount, 0, 1);\n',
    '    const limit = this.modelHeight * 0.009;\n    const correction = clamp(avg, -limit, limit) * 0.55 * clamp(amount, 0, 1);\n',
    1,
)

s, n = re.subn(
    r"  stabilizeCrouchFeet\(amount = 1\) \{.*?\n  \}\n\n  solveCrouchHandsToHead",
    """  stabilizeCrouchFeet(amount = 1) {
    const a = clamp(amount, 0, 1);
    if (a <= 0.001) return;
    this.flattenFoot('left', a);
    this.flattenFoot('right', a);
    this.correctRootToPlantedFeet(Math.min(a, 0.5));
  }

  solveCrouchHandsToHead""",
    s,
    count=1,
    flags=re.S,
)
if n != 1:
    raise SystemExit('stable crouch: stabilizeCrouchFeet marker not found')

s = s.replace("solver: 'structured-squat-v4-flat-feet',", "solver: 'stable-squat-v4.1-standing-reference',", 1)
p.write_text(s, encoding='utf-8')

p = Path('src/main.js')
m = p.read_text(encoding='utf-8')
m = m.replace('crouchDepth:0.20,', 'crouchDepth:0.14,', 1)
m = m.replace("version:'0.96-structured-squat-v4'", "version:'0.961-stable-squat-v41'", 1)
p.write_text(m, encoding='utf-8')

Path('DEPLOY_VERSION.txt').write_text(
    'NIVA Biomechanics V4.1\n'
    'Stable squat hotfix: removed recursive crouch CCD, reduced squat depth, derives knee direction from the standing skeleton, uses one bounded leg solve per frame, keeps torso hinge small, flattens feet, and tightly limits root-Y correction. Hands remain on head.\n',
    encoding='utf-8',
)

# Clean failed one-shot workflow and consume this patch script in the same commit.
Path('.github/workflows/fix-crouch-stable-v41.yml').unlink(missing_ok=True)
Path(__file__).unlink(missing_ok=True)
