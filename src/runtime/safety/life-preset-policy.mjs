export const LIFE_PRESET_BONE_ALLOWLIST=Object.freeze({
  breath:Object.freeze(['spine','chest','upperChest','leftShoulder','rightShoulder']),
  heartbeat:Object.freeze(['chest','upperChest']),
});

export function lifePresetAllowsBone(layer,bone){
  const list=LIFE_PRESET_BONE_ALLOWLIST[layer];
  return !list||list.includes(bone);
}

export function isRootAffectingBone(name){
  return name==='hips'||/UpperLeg|LowerLeg|Foot|Toes/.test(String(name||''));
}
