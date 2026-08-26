# NIVA Biomechanics V2

## Goal
Replace the fragile iterative limb CCD path with a stable layered stack:

AnimationMixer -> contact plan -> analytical Two-Bone IK -> sole alignment -> self-collision constraint -> VRM update.

## Ownership
- CharacterFrame: forward/right/up only.
- FacingController: root yaw only.
- Rapier NivaPhysicsBodySystem: world collision, ground, root translation and foot contact targets only.
- NivaIKSystem: limb post-animation correction only.
- SelfCollisionConstraint: validates the final humanoid proxy pose and may roll back/reduce an IK correction; it never moves root.

## Foot IK
`NivaFootIKSystem` uses an analytical two-bone solve with explicit min/max bend limits. The knee pole is projected from CharacterFrame.forward, so animated limb noise cannot redefine character front/back. The foot is then aligned to the ground plane normal.

The analytical method is adapted from the MIT-licensed FootIK implementation in `hh-hang/three-player-controller`, specifically its `internal/twoBoneIK.ts` design. NIVA uses its own ES module implementation and VRM normalized-bone adapter.

## Self-collision
NIVA uses lightweight humanoid collision proxies rather than full skinned-mesh self-collision every frame:
- torso/head/pelvis capsules
- upper arm/forearm/hand proxies
- thigh/shin proxies

Neutral-pose penetration is calibrated as baseline tolerance. New penetration beyond baseline is rejected. The IK action is retried at 100%, 65%, then 35% weight; if all attempts collide, the limb pose is restored instead of accepting clipping.

Protected pairs currently include arm/hand vs torso/head and left/right leg crossings. Crouch intentionally permits hand/head contact because hands-on-head is part of that pose.

## Why not add three-mesh-bvh to the body loop yet
`three-mesh-bvh` is excellent for static/complex scene mesh queries, and `three-player-controller` uses it for scene collision. NIVA already owns world collision through Rapier. Adding a second world-collision backend would violate the runtime ownership rules and duplicate work. For self-collision, capsule proxies are cheaper and deterministic for the single fixed humanoid.

If NIVA later adds arbitrary complex stage meshes outside Rapier, `three-mesh-bvh` can be added behind a scene-query adapter without changing the IK ownership model.

## Regression rules
- no `solveChain` / `rotateBoneTowardEnd` iterative CCD in NivaIKSystem
- Physics never mutates humanoid quaternions
- IK never mutates root transform
- analytical solver preserves segment length
- foot IK has explicit bend limits and sole alignment
- self-collision guard covers torso/head and left-right leg crossings
