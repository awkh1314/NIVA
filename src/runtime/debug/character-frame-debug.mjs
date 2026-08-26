import * as THREE from 'three';

export class CharacterFrameDebug {
  constructor({ scene, frame, root, camera, stage }) {
    this.scene = scene;
    this.frame = frame;
    this.root = root;
    this.camera = camera;
    this.visible = false;
    this.group = new THREE.Group();
    this.forward = new THREE.ArrowHelper(new THREE.Vector3(0,0,1), new THREE.Vector3(), 0.55, 0x35e38a, 0.12, 0.07);
    this.right = new THREE.ArrowHelper(new THREE.Vector3(1,0,0), new THREE.Vector3(), 0.45, 0x4aa3ff, 0.11, 0.065);
    this.up = new THREE.ArrowHelper(new THREE.Vector3(0,1,0), new THREE.Vector3(), 0.45, 0xffcf4a, 0.11, 0.065);
    this.group.add(this.forward, this.right, this.up);
    this.group.visible = false;
    scene.add(this.group);

    this.hud = document.createElement('div');
    Object.assign(this.hud.style, {
      position:'absolute', left:'18px', top:'64px', zIndex:'20', padding:'9px 11px',
      border:'1px solid #315466', borderRadius:'8px', background:'rgba(5,15,20,.88)',
      color:'#bdeef0', font:'12px/1.45 ui-monospace,Consolas,monospace', whiteSpace:'pre', pointerEvents:'none',
    });
    this.hud.hidden = true;
    stage?.appendChild?.(this.hud);
  }

  setVisible(visible) {
    this.visible = Boolean(visible);
    this.group.visible = this.visible;
    this.hud.hidden = !this.visible;
  }

  update() {
    if (!this.visible) return;
    const { forward, right, up, yaw } = this.frame.basis();
    const origin = this.root.position.clone();
    origin.y += 0.04;
    for (const arrow of [this.forward, this.right, this.up]) arrow.position.copy(origin);
    this.forward.setDirection(forward);
    this.right.setDirection(right);
    this.up.setDirection(up);
    const cameraForward = new THREE.Vector3(0,0,-1).applyQuaternion(this.camera.quaternion).normalize();
    const fmt = (v) => v.toArray().map(n=>n.toFixed(2)).join(', ');
    this.hud.textContent = [
      'NIVA CharacterFrame',
      '契约: +X=右  +Y=上  +Z=前',
      `Root Yaw: ${THREE.MathUtils.radToDeg(yaw).toFixed(1)}°`,
      `Forward: ${fmt(forward)}`,
      `Right:   ${fmt(right)}`,
      `Up:      ${fmt(up)}`,
      `Camera:  ${fmt(cameraForward)}`,
    ].join('\n');
  }
}
