export const BODY_REGIONS = Object.freeze({
  root: Object.freeze([]),
  pelvis: Object.freeze(['hips']),
  torso: Object.freeze(['spine', 'chest', 'upperChest']),
  head: Object.freeze(['neck', 'head', 'leftEye', 'rightEye', 'jaw']),
  leftArm: Object.freeze(['leftShoulder', 'leftUpperArm', 'leftLowerArm']),
  rightArm: Object.freeze(['rightShoulder', 'rightUpperArm', 'rightLowerArm']),
  leftHand: Object.freeze([
    'leftHand',
    'leftThumbMetacarpal', 'leftThumbProximal', 'leftThumbDistal',
    'leftIndexProximal', 'leftIndexIntermediate', 'leftIndexDistal',
    'leftMiddleProximal', 'leftMiddleIntermediate', 'leftMiddleDistal',
    'leftRingProximal', 'leftRingIntermediate', 'leftRingDistal',
    'leftLittleProximal', 'leftLittleIntermediate', 'leftLittleDistal',
  ]),
  rightHand: Object.freeze([
    'rightHand',
    'rightThumbMetacarpal', 'rightThumbProximal', 'rightThumbDistal',
    'rightIndexProximal', 'rightIndexIntermediate', 'rightIndexDistal',
    'rightMiddleProximal', 'rightMiddleIntermediate', 'rightMiddleDistal',
    'rightRingProximal', 'rightRingIntermediate', 'rightRingDistal',
    'rightLittleProximal', 'rightLittleIntermediate', 'rightLittleDistal',
  ]),
  leftLeg: Object.freeze(['leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes']),
  rightLeg: Object.freeze(['rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes']),
  face: Object.freeze([]),
  gaze: Object.freeze([]),
  voice: Object.freeze([]),
});

export const BODY_REGION_NAMES = Object.freeze(Object.keys(BODY_REGIONS));

export function bonesForRegions(regions = []) {
  return [...new Set(regions.flatMap((region) => BODY_REGIONS[region] || []))];
}

export function regionForBone(boneName) {
  for (const [region, bones] of Object.entries(BODY_REGIONS)) {
    if (bones.includes(boneName)) return region;
  }
  return null;
}
