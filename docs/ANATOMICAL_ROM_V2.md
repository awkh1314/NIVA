# NIVA Anatomical ROM V2

## Goal

Make every controllable NIVA Humanoid bone obey a normal-adult anatomical motion envelope before rendering. Clinical joint ROM is treated as a human-body constraint, not copied directly onto one VRM Euler axis.

Runtime order:

`Animation / LLM / Balance / IK -> whole-pose Anatomical ROM V2 -> per-joint soft + angular-speed guard -> continuous self-collision projection -> VRM update/render`

The solver is model-agnostic at the anatomy layer and model-specific only at the local-axis mapping layer.

## Evidence baseline

Primary normal-adult references used for the engineering baseline:

- AAFP, Telemedicine Management of Musculoskeletal Issues: shoulder abduction/flexion 180°, extension 45–60°, shoulder IR/ER 90°, elbow flexion 135–150°, extension -10–0°, pronation/supination 75–90°, wrist extension 70°, flexion 80–90°, radial deviation 20–30°, ulnar deviation 50°; hip flexion 120°, extension 10–20°, IR 40°, ER 45°; knee flexion 130–135°, extension -10–0°; ankle dorsiflexion 20°, plantar flexion 45°, inversion 30°, eversion 20°. https://www.aafp.org/afp/2021/0201/p147
- CDC Normal Joint Range of Motion Study: population reference values for hip, knee, ankle, shoulder and elbow across age/sex groups. https://archive.cdc.gov/www_cdc_gov/ncbddd/jointrom/index.html
- McGregor et al., normative lumbar ROM database: adult lumbar flexion about 72→40° across age, extension 29→6°, lateral flexion 29→15° each side, axial rotation about 7° each side. PMID 11518438.
- Ferrario et al., healthy young adult head/cervical 3D ROM: total flexion-extension about 130–136°, lateral bending total 77–91°, axial rotation total 155–162°. PMID 11853078.
- The range of movement of the thumb: CMC palmar abduction mean 61.2° (50–71), radial abduction 62.9° (53–71), MCP flexion mean 60° (43–70), IP flexion mean 88° (80–90). PMCID PMC3653006.
- Hand Rehabilitation Devices systematic review, healthy finger ROM table: MCP flexion about 90°, PIP 110/110/120/135° index→little, DIP about 80–90°, MCP extension 30–40°, finger-dependent abduction/adduction. PMCID PMC9325203.
- Healthy ocular duction data: adduction/abduction about 44–45°, elevation about 28°, depression about 47°. PMID 30837710.

These values are population/reference ranges, not diagnostic thresholds. NIVA uses conservative model-space envelopes plus collision constraints.

## Current NIVA controllable coverage

Anatomical ROM V2 covers all 54 expected controllable humanoid bones in the current NIVA VRM:

- Trunk: hips, spine, chest, upperChest
- Head/neck: neck, head
- Eyes: leftEye, rightEye
- Shoulder/arms: left/right Shoulder, UpperArm, LowerArm, Hand
- Thumbs: Metacarpal, Proximal, Distal on both sides
- Fingers: Index/Middle/Ring/Little Proximal, Intermediate, Distal on both sides
- Legs: left/right UpperLeg, LowerLeg, Foot, Toes

## Model-axis semantic map

All values are deltas from the calibrated relaxed `baseQuats` pose.

| VRM chain | NIVA local semantic use |
| --- | --- |
| spine/chest/upperChest | X flex-extension, Y axial rotation, Z lateral bend |
| neck/head | X flex-extension, Y axial rotation, Z lateral bend |
| UpperArm | X flex-extension, Y humeral axial rotation, Z ab/adduction/elevation |
| LowerArm | Y elbow flexion (mirrored sign left/right), X forearm twist proxy, Z only small non-hinge tolerance |
| Hand | X wrist flex-extension, Z radial/ulnar deviation, Y small residual twist |
| UpperLeg | X hip flex-extension, Y axial rotation, Z ab/adduction |
| LowerLeg | X knee flexion, Y tibial axial rotation, Z small varus/valgus tolerance |
| Foot | X dorsiflexion/plantarflexion proxy, Z inversion/eversion proxy, Y small twist |
| Toes | X forefoot/MTP flex-extension proxy |
| Finger MCP/PIP/DIP | Y primary flexion (mirrored left/right); MCP gets limited spread; PIP/DIP are near-hinge joints |

If the VRM model changes, re-calibrate this mapping while preserving the anatomy evidence table and coupling rules.

## Coupled ROM rules

### 1. Spine chain

`spine + chest + upperChest` cannot each independently reach their maxima.

Combined targets:
- flexion: <= 60°
- extension: <= 30°
- axial rotation: <= 25° each side for the modeled trunk chain
- lateral bend: <= 30° each side

### 2. Neck + head

`neck + head` are one serial cervical/head chain.

Combined targets:
- flexion/extension: <= 60° each direction in the runtime envelope
- axial rotation: <= 75° each direction
- lateral bend: <= 45° each direction

### 3. Scapulohumeral coupling

Above ~80° upper-arm elevation, the shoulder/scapular bone is automatically recruited. Above ~120°, a small upper-chest contribution is permitted. Humeral axial-rotation freedom narrows as elevation approaches the extreme range.

This prevents `UpperArm=extreme elevation + extreme axial twist` while still allowing near-overhead reach through multiple bones.

### 4. Hip flexion coupling

As hip flexion rises above ~85°, remaining axial-rotation and ab/adduction room progressively decreases. At ~120° flexion the envelope is substantially narrower than in neutral standing.

### 5. Knee flexion / tibial rotation

Knee axial rotation is almost locked near full extension and progressively increases with knee flexion. Runtime cap grows from about 8° near extension to about 32° in deep flexion. Varus/valgus remains very small.

### 6. Wrist flexion / deviation

Near extreme wrist flexion or extension, remaining radial/ulnar deviation is reduced instead of allowing simultaneous independent maxima.

### 7. Finger MCP spread

MCP ab/adduction is available when fingers are open, but progressively collapses as MCP flexion approaches a fist.

### 8. PIP / DIP hinge behavior

PIP and DIP joints only receive tiny non-flexion tolerance. Full DIP curl without accompanying PIP flexion is dynamically restricted to avoid hooked/non-human finger poses.

### 9. Thumb opposition

Thumb CMC opposition is treated as a coupled saddle-joint motion. CMC, MCP and IP flexion have separate limits, and CMC axial freedom remains bounded during high opposition.

### 10. Eye and toe limits

Eye ductions use human-scale horizontal/vertical envelopes. `Toes` is a single VRM forefoot proxy rather than five independently modeled toes; its X range approximates first-MTP/forefoot flex-extension and remains subject to ground/contact IK.

## Safety hierarchy

Anatomical ROM V2 is not the only safety layer:

1. Whole-pose anatomical projection: rejects biomechanically impossible joint combinations.
2. Soft joint boundary: compresses motion near the hard envelope.
3. Angular-speed limiter: prevents single-frame snapping.
4. Predictive self-collision projector: sweeps the whole quaternion path and truncates it before body/garment proxy collision.
5. Foot IK / ground constraints: maintain contact and stance behavior.

No runtime collision rollback is used.

## Acceptance criteria

- Every expected controllable humanoid bone has an anatomical envelope.
- Serial chains cannot stack independent maxima.
- High shoulder elevation recruits shoulder/chest and loses some free axial rotation.
- Knee rotation depends on knee flexion.
- Hip rotation/abduction depends on hip flexion.
- Finger spread depends on MCP flexion; PIP/DIP remain near-hinge.
- Thumb opposition is coupled.
- Eye and toe ranges are explicitly bounded.
- Joint guard applies the whole-pose projection before writing any final quaternion.
- Existing biomechanics, IK, motion bridge and continuous self-collision tests remain green.
