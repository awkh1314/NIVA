from pathlib import Path

p = Path('src/runtime/physics/niva-body-physics.mjs')
s = p.read_text(encoding='utf-8')

old_basis = '''  bodyBasis() {
    this.vrm.scene.updateMatrixWorld(true);
    const l = this.getBone('leftUpperArm');
    const r = this.getBone('rightUpperArm');
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.vrm.scene.getWorldQuaternion(new THREE.Quaternion())).normalize();
    let right;
    if (l && r) {
      right = r.getWorldPosition(new THREE.Vector3()).sub(l.getWorldPosition(new THREE.Vector3())).normalize();
    } else {
      right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.vrm.scene.getWorldQuaternion(new THREE.Quaternion())).normalize();
    }
    let forward = up.clone().cross(right).normalize();
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1).applyQuaternion(this.vrm.scene.quaternion).normalize();
    return { right, up, forward };
  }
'''
new_basis = '''  bodyBasis() {
    // Stable character frame: never derive right/forward from animated limbs.
    // Hands-on-head IK moves the upper arms every frame; using them as the frame
    // creates a positive feedback loop that makes the whole crouch rotate.
    this.vrm.scene.updateMatrixWorld(true);
    const q = this.vrm.scene.getWorldQuaternion(new THREE.Quaternion());
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q).normalize();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize();
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q).normalize();
    return { right, up, forward };
  }
'''
if old_basis in s:
    s = s.replace(old_basis, new_basis, 1)
elif new_basis not in s:
    raise SystemExit('bodyBasis marker mismatch')

if 'this.crouchRootYaw = null;' not in s:
    marker = '    this.crouchReference = null;\n'
    if marker not in s:
        raise SystemExit('crouchReference marker missing')
    s = s.replace(marker, marker + '    this.crouchRootYaw = null;\n', 1)

old_changed = '''      if (action === 'crouch' || action === 'recovery') { this.captureBothFeet(); if (action === 'crouch') this.captureCrouchReference(); }
      else this.clearFeet();
      this.lastAction = action;
'''
new_changed = '''      if (action === 'crouch' || action === 'recovery') {
        this.captureBothFeet();
        if (action === 'crouch') {
          this.crouchRootYaw = this.vrm.scene.rotation.y;
          this.captureCrouchReference();
        }
      } else {
        this.clearFeet();
        this.crouchRootYaw = null;
      }
      this.lastAction = action;
'''
if old_changed in s:
    s = s.replace(old_changed, new_changed, 1)
elif new_changed not in s:
    raise SystemExit('action transition marker mismatch')

old_post = '''    if (action === 'walk' || action === 'run') this.solveLocomotionArms(action, phase);
    if (action === 'wave') this.solveWavePose(phase);
    if (action === 'crouch') this.solveCrouchHandsToHead(0.96 * crouchAmount);
    if (action === 'recovery') this.solveHandsToKnees(0.86);
  }
'''
new_post = '''    if (action === 'walk' || action === 'run') this.solveLocomotionArms(action, phase);
    if (action === 'wave') this.solveWavePose(phase);
    if (action === 'crouch') {
      this.solveCrouchHandsToHead(0.96 * crouchAmount);
      // Crouch is stationary: hand/leg IK must never feed back into root yaw.
      if (Number.isFinite(this.crouchRootYaw)) this.vrm.scene.rotation.y = this.crouchRootYaw;
    }
    if (action === 'recovery') this.solveHandsToKnees(0.86);
  }
'''
if old_post in s:
    s = s.replace(old_post, new_post, 1)
elif new_post not in s:
    raise SystemExit('post animation marker mismatch')

p.write_text(s, encoding='utf-8')

Path('DEPLOY_VERSION.txt').write_text(
    'NIVA Biomechanics V4.2\n'
    'Crouch rotation hotfix: body basis is derived only from the VRM root transform; animated arms no longer define character right/forward; crouch captures and holds its entry yaw so hands-on-head IK cannot create a self-rotating feedback loop.\n',
    encoding='utf-8',
)

# Remove obsolete one-shot workflow if it exists; this patch is applied by pages.yml.
failed = Path('.github/workflows/fix-crouch-basis-v42.yml')
if failed.exists():
    failed.unlink()

# Self-delete so the patch can only be applied once.
Path(__file__).unlink()
