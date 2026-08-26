# NIVA Runtime Architecture V1

## Purpose

This document freezes module ownership before further motion tuning. The runtime must not infer character direction from animated limbs or let physics decide gestures.

## Canonical coordinate contract

For `NIVA.vrm` at root yaw = 0:

- local `+X` = character right
- local `+Y` = character up
- local `+Z` = character forward
- local `-Z` = character back

`CharacterFrame` is the only runtime source for forward/right/up. Animated bones are forbidden inputs to the character frame.

The contract is intentionally aligned with locomotion yaw: `atan2(direction.x, direction.z)` points the character's local `+Z` at the travel direction.

## Exclusive ownership

| Module | Owns | May read | Must not write |
| --- | --- | --- | --- |
| `NivaVrmAdapter` | normalized bone lookup, bind-pose access, model contract | VRM humanoid | root motion, action intent |
| `CharacterFrame` | forward/right/up/yaw interpretation | VRM root yaw | any bone |
| `FacingController` | VRM root `rotation.y` | requested world direction | limb bones, root position |
| `AnimationMixer` / clips | authored base pose timeline | normalized bones | world collision, ground truth |
| `NivaIKSystem` | post-animation limb-bone correction | CharacterFrame, contact plan, normalized limbs | VRM root position/yaw |
| `NivaPhysicsBodySystem` | Rapier world, collider, root world position, ground/contact plan | read-only foot positions | humanoid bone quaternions, root yaw, gesture intent |
| Gaze | eyes + limited head/neck look | user/camera target | root facing |
| Hand pose | finger bones | hand-pose intent | body frame/root |
| Face/lipsync | expressions | speech/emotion state | skeleton/root |
| Director | high-level action selection | runtime states | raw bone transforms |
| Renderer | scene rendering | final transforms | behavior decisions |

## Frame pipeline

The render frame order is fixed:

1. `AnimationMixer.update()` — authored base pose.
2. Life-state additive layers — breathing/heartbeat where enabled.
3. Physics body — Rapier movement, root position and ground/contact plan only.
4. IK system — feet/legs/arms from the contact/action plan.
5. Facing controller — enforce the sole root-yaw result.
6. Gaze / face / lipsync / finger additive layers.
7. `vrm.update()`.
8. render.

A later module may refine its owned channels but must never rewrite channels owned by another module.

## Root authority

- Root X/Z and physical grounding: PhysicsBody.
- Root Y posture offset: PhysicsBody.
- Root yaw: FacingController only.
- Root pitch/roll: zero unless a future explicitly named balance controller owns them.

No IK solver may write root rotation or position.

## Action authority

- `walk/run/crouch/wave/...` are action intents chosen by UI/Director.
- Physics does not know how a wave or hands-on-head pose looks.
- IK does not choose actions. It only consumes an action/contact plan.
- Facing does not choose travel targets. It only turns toward an explicit direction.

## Coordinate calibration mode

The FREE control panel exposes `坐标校准`.

When enabled the stage shows:

- Forward arrow
- Right arrow
- Up arrow
- Root yaw
- Camera forward vector
- Explicit contract `+X=右 +Y=上 +Z=前`

Acceptance test before tuning any motion:

1. yaw 0: Forward points from the character's back through the face.
2. yaw +90 degrees: Forward rotates to world +X.
3. Right is always 90 degrees to Forward.
4. Raising arms, crouching or moving the head does not change Forward/Right.
5. Camera orbit changes only Camera vector, never CharacterFrame.

## Forbidden couplings

The following are architecture failures:

- deriving character forward from shoulders/arms/feet/head;
- Physics calling `solveWavePose`, `solveCrouchHandsToHead` or locomotion-arm solvers;
- IK assigning `vrm.scene.position` or `vrm.scene.rotation`;
- a gesture directly rotating root yaw;
- multiple modules independently applying `atan2` to determine character facing;
- manually patching front/back signs inside individual actions.

If one of these appears, fix the ownership violation before tuning motion parameters.

## Current audit result

The previous runtime mixed Rapier, foot IK, gait arm swing, wave IK, crouch hands and character-basis calculation inside `niva-body-physics.mjs`. `main.js` separately modified root yaw during locomotion. That allowed transforms from one layer to feed back into another.

Runtime Boundaries V1 separates those responsibilities:

- stable `CharacterFrame` with local +Z forward;
- exclusive `FacingController`;
- PhysicsBody limited to Rapier/root position/contact planning;
- `NivaIKSystem` limited to normalized limb corrections;
- coordinate debug overlay for visual calibration.

Do not resume detailed crouch/walk/run tuning until the coordinate calibration acceptance test passes visually on `NIVA.vrm`.
