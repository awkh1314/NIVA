const continuous = (id, config = {}) => Object.freeze({ lane: 'continuous', id, ...config });
const overlay = (id, config = {}) => Object.freeze({ lane: 'overlay', id, ...config });

export const MOTION_SPECS = Object.freeze({
  idle: continuous('idle', {
    loop: true,
    kind: 'idle',
    claims: ['pelvis','torso','leftArm','rightArm','leftHand','rightHand','leftLeg','rightLeg'],
    support: { leftFoot: 'planted', rightFoot: 'planted' },
    invariants: ['root-upright','feet-grounded','hands-relaxed'],
  }),
  walk: continuous('walk', {
    loop: true,
    kind: 'locomotion',
    claims: ['pelvis','torso','leftArm','rightArm','leftHand','rightHand','leftLeg','rightLeg'],
    root: { translation: 'physics', yaw: 'facing' },
    support: { feet: 'alternating-contact' },
    phases: ['left-contact','left-push','flight-transfer','right-contact','right-push','flight-transfer'],
    invariants: ['forward-is-character-forward','counter-swing-arms','feet-near-ground','hands-relaxed'],
  }),
  run: continuous('run', {
    loop: true,
    kind: 'locomotion',
    claims: ['pelvis','torso','leftArm','rightArm','leftHand','rightHand','leftLeg','rightLeg'],
    root: { translation: 'physics', yaw: 'facing' },
    support: { feet: 'alternating-contact-with-flight' },
    phases: ['left-contact','left-drive','flight','right-contact','right-drive','flight'],
    invariants: ['forward-is-character-forward','strong-counter-swing-arms','short-ground-contact','hands-relaxed'],
  }),
  crouch: continuous('crouch', {
    loop: true,
    kind: 'posture',
    claims: ['pelvis','torso','leftArm','rightArm','leftHand','rightHand','leftLeg','rightLeg'],
    root: { translationY: 'physics-posture', yaw: 'locked' },
    support: { leftFoot: 'planted', rightFoot: 'planted' },
    phases: ['stand','descent','hold'],
    invariants: ['knees-forward','hips-back','torso-forward','heels-down','feet-grounded','hands-on-head','no-root-spin'],
  }),
  thinkLoop: continuous('thinkLoop', {
    loop: true,
    kind: 'posture',
    claims: ['torso','rightArm','rightHand','head'],
    support: { leftFoot: 'planted', rightFoot: 'planted' },
    invariants: ['lower-body-stable','right-hand-near-face','gaze-available'],
  }),
  recovery: continuous('recovery', {
    loop: true,
    kind: 'recovery',
    claims: ['pelvis','torso','leftArm','rightArm','leftHand','rightHand','leftLeg','rightLeg','head'],
    support: { leftFoot: 'planted', rightFoot: 'planted' },
    invariants: ['torso-forward','hands-on-knees','heavy-breathing','feet-grounded'],
  }),

  wave: overlay('wave', {
    loop: false,
    kind: 'gesture',
    claims: ['rightArm','rightHand'],
    invariants: ['left-side-unmodified','no-root-translation','no-torso-intersection'],
  }),
  nod: overlay('nod', {
    loop: false,
    kind: 'gesture',
    claims: ['head'],
    invariants: ['no-root-translation'],
  }),
  reach: overlay('reach', {
    loop: false,
    kind: 'gesture',
    claims: ['torso','rightArm','rightHand','head'],
    invariants: ['feet-stay-supported','no-root-spin'],
  }),
  weight: overlay('weight', {
    loop: false,
    kind: 'gesture',
    claims: ['pelvis','torso','leftLeg','rightLeg'],
    invariants: ['both-feet-near-ground','no-root-spin'],
  }),
  speechGesture: overlay('speechGesture', {
    loop: false,
    kind: 'speech-overlay',
    claims: ['head','leftArm','rightArm','leftHand','rightHand','face','voice'],
    invariants: ['continuous-locomotion-may-continue','speech-does-not-own-root'],
  }),
});

export function getMotionSpec(id) {
  return MOTION_SPECS[id] || null;
}
