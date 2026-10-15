# Methods reference

How ErgoCapture turns images into joint angles and ergonomic scores. Every threshold below is the value used in the code (`src/lib/ergo/`), so this page can be checked against the implementation. Where the app departs from, simplifies or approximates a published method, it says so under **Deviations**.

For the evidence on how valid these methods and measurements are, see [Validity of the analytical methods](validity.md).

## 1. Processing pipeline

1. **Pose estimation.** One of four engines produces body keypoints per video frame or photo (see [Pose engines](#2-pose-engines)). Up to 4 people are detected; an IoU tracker keeps one identity per person across frames. For photos the largest person is used.
2. **Common skeleton.** Every engine's output is mapped to one 33-point layout (BlazePose topology): image coordinates (0–1) and metric 3D coordinates centred on the hips (x right, y down, z away from the camera).
3. **Gap filling.** Gaps of up to 0.6 s where the person is lost are linearly interpolated; interpolated points get 0.6 × the lower visibility of the two ends. Longer gaps stay empty and are excluded from scoring.
4. **Smoothing.** A One-Euro filter (Casiez et al., 2012) run forwards and backwards and averaged (approximately zero phase lag).
5. **Scale.** If the worker's height is entered, the skeleton is scaled so the ankle-to-ear segment chain equals 87 % of stature (Drillis & Contini proportions). Otherwise the engine's own metric scale is used.
6. **Joint angles and distances** per frame, each with a reliability value (section 3).
7. **Multi-camera fusion** (2–4 videos): views are time-aligned (clap/beep audio onset or screen-flash brightness jump, or manual offsets) and each angle is fused by confidence-weighted averaging. This is angle-level fusion, not calibrated 3D triangulation.
8. **Temporal analysis** (video only): repetition counting, static holds, rapid changes, lift detection, activity segmentation.
9. **Scoring** of every frame (RULA, REBA, OWAS) with a confidence value, plus session-level methods.

Sampling rate for recorded video is selectable (5–30 frames per second; default 10).

## 2. Pose engines

| Engine | Where | Keypoints | Hand detail | Reliability input |
|---|---|---|---|---|
| RTMW3D-X (default on laptops/desktops) | browser | 133 COCO-WholeBody, x/y in pixels, z metric depth | finger joints | SimCC score s mapped to (s − 0.15)/0.55, clipped 0–1 |
| MediaPipe Pose (default on phones) | browser | 33 BlazePose, 2D + metric 3D | index/pinky/thumb only | landmark visibility |
| InstantHMR (SAM 3D Body distillation) | browser | 70 MHR, metric camera frame | finger joints | none from the model: 0.85 inside the image, 0.4 outside |
| SAM 3D Body | your GPU server | 70 MHR, metric camera frame | finger joints | as InstantHMR |

**RTMW metric scale.** RTMW3D returns x, y in pixels and z as metric depth. The app finds the metres-per-pixel factor m that minimises Σ w·(√((Δx·m)² + (Δy·m)² + Δz²) − L)² over visible segments (shanks 0.246 H, thighs 0.245 H, upper arms 0.186 H, forearms 0.146 H, trunk 0.288 H; H = entered stature or 1.70 m), by golden-section search. The angles therefore depend on the stature assumption when height is not entered.

**Deviations.** The RTMW score-to-visibility mapping and the fixed reliabilities for mesh models are judgement-based, not calibrated against reference data.

## 3. Joint angles

Reference frames: "up" is the image vertical (−y) unless a neutral-posture calibration (Live page, 2.5 s standing upright) supplies a measured vertical. The body frame comes from the pelvis (hip line) and the trunk frame from the shoulder line.

| Angle | Definition |
|---|---|
| Trunk flexion (+) / extension (−) | Mid-hip→mid-shoulder vector in the sagittal plane, relative to vertical |
| Trunk side bend | Same vector in the frontal plane |
| Trunk twist | Angle between the hip line and the shoulder line around vertical |
| Neck flexion / extension | Mid-shoulder→mid-ear vector relative to the trunk, minus a 10° neutral offset (ears sit forward of the shoulders); replaced by the calibrated offset when available |
| Neck side bend, twist | Neck vector in the trunk's frontal plane; nose direction vs trunk forward |
| Upper-arm flexion, abduction, elevation | Shoulder→elbow vector relative to the trunk: flexion in the sagittal plane; abduction = lateral elevation out of the sagittal plane; elevation = angle from hanging down |
| Shoulder raised | Ear–shoulder distance shrinking > 12 % vs the calibrated neutral; without calibration it is set to "not raised" with reliability 0.25 |
| Elbow flexion | 180° − angle between upper arm and forearm |
| Wrist flexion / extension | Out-of-plane angle between forearm and palm plane (wrist, index, pinky points) |
| Wrist deviation | In-plane angle between forearm and hand direction |
| Knee flexion | 180° − hip–knee–ankle angle |
| Hand height, horizontal distance, asymmetry | Hands' mid-point relative to the floor (lowest foot point) and to the mid-ankles, measured along the feet's forward axis |
| Reach | Horizontal shoulder→hand distance / arm length |

**Reliability of each angle** = lowest visibility of the keypoints it uses × a camera-view factor (view angle φ from the body's facing direction, folded to 0–90°):

- sagittal-plane angles (bending, arm flexion): 0.55 + 0.45·|sin φ| (best from the side)
- frontal-plane angles (side bend, abduction): 0.55 + 0.45·|cos φ| (best from the front)
- twist: 0.6 always; joint angles (elbow, knee, wrist): 0.8 + 0.2·max(|sin φ|, |cos φ|); distances: 0.85
- wrists: × 0.6 with coarse hand points (MediaPipe), × 0.9 with finger joints

## 4. Posture scores (every frame or photo)

### RULA (McAtamney & Corlett, 1993)

Full tables A, B and C. Each arm is scored separately and the worse side is reported.

- Upper arm: −20° to 20° → 1; extension > 20° or 20–45° → 2; 45–90° → 3; > 90° → 4. +1 abducted (lateral elevation > 30°), +1 shoulder raised, −1 if "arms supported" is set. The angle used is the elevation, signed negative for extension.
- Lower arm: elbow 60–100° → 1, otherwise 2; +1 if the wrist crosses the body midline (> 3 cm) or is > 42 cm out to the side.
- Wrist: ≤ 5° → 1; ≤ 15° → 2; > 15° → 3; +1 deviation > 20°. Wrist twist always 1 (mid-range).
- Neck: extension beyond −5° → 4; 0–10° → 1; 10–20° → 2; > 20° → 3; +1 twist > 20°, +1 side bend > 10°.
- Trunk: within ±5° → 1 (or seated with trunk support and < 20°); extension or ≤ 20° → 2; 20–60° → 3; > 60° → 4; +1 twist > 20°, +1 side bend > 10°.
- Legs: 1 if seated or feet level (height difference < 8 cm), else 2.
- Muscle use +1 if a static hold (> 1 min) or repetition (> 4/min) is detected (photos: from the options).
- Force/load from task settings: < 2 kg → 0; 2–10 kg → 1 intermittent, 2 static/repeated; ≥ 10 kg → 2 intermittent, 3 static/repeated; shock → 3. With "load applies: auto", the load counts only in frames where both hands appear to hold something.

**Deviations.** Wrist twist is not measured. Shoulder elevation needs calibration. Abduction, twist, side-bend and midline thresholds are fixed values chosen for automation; the original method leaves them to the observer.

### REBA (Hignett & McAtamney, 2000)

Full tables A, B and C.

- Neck: −5° to 20° flexion → 1; otherwise 2; +1 twist > 20° or side bend > 10°.
- Trunk: within ±5° → 1; to ±20° → 2; 20–60° flexion or > 20° extension → 3; > 60° → 4; +1 twist > 20° or side bend > 10°.
- Legs: bilateral support → 1, one foot raised (> 8 cm) → 2; +1 knee 30–60°, +2 knee > 60° (not when seated).
- Upper arm as RULA (+1 abduction > 30°, +1 shoulder raised, −1 supported); lower arm 60–100° → 1 else 2; wrist ≤ 15° → 1 else 2, +1 deviation > 20°.
- Load/force: < 5 kg → 0; 5–10 kg → 1; > 10 kg → 2; +1 shock. Coupling (good/fair/poor/unacceptable = 0–3) is added only while a load is held.
- Activity: +1 static hold > 1 min, +1 repetition > 4/min, +1 rapid large change (> 45° within 1 s).

**Deviations.** The −5° neutral tolerance for the neck avoids measurement noise reading as extension. Forearm rotation is not measured.

### OWAS (Karhu et al., 1977)

Each frame gets a 4-digit code and the action category (AC 1–4) from the standard table.

- Back: bent if flexion or extension > 20°; twisted if twist or side bend > 20°.
- Arms: count of arms with elevation ≥ 90°.
- Legs: sitting (seated rule); walking if body speed > 0.35 body heights/s; kneeling if a knee is < 15 cm above the floor with flexion > 70°; one leg raised > 10 cm (straight or bent support leg at 30°); both knees > 30° → bent; else standing straight.
- Load from task settings: < 10, 10–20, > 20 kg.

**Deviations.** The results show the time share per posture code and per action category; the time-based OWAS action charts (action category by percentage of working time per body part) are not implemented.

## 5. Session methods (video only)

### Revised NIOSH Lifting Equation (Waters et al., 1993)

RWL = 23 kg × HM × VM × DM × AM × FM × CM; LI = load / RWL.

- **Lift detection:** the mid-hand height (smoothed) moves monotonically ≥ 25 cm within 0.3–5 s while the hands are < 55 cm apart for ≥ 60 % of the movement. Upward = lift, downward = lower.
- H = horizontal distance of the hands from the mid-ankles along the feet's forward axis (minimum 25 cm); V = hand height above the lowest foot point; D = |V destination − V origin|; A = angle of the hands from the mid-sagittal plane defined by the ankles.
- HM 25/H (0 above 63 cm); VM 1 − 0.003·|V − 75|; DM 0.82 + 4.5/D; AM 1 − 0.0032·A; FM from the frequency table (by duration and V), linearly interpolated between tabulated frequencies; CM from coupling and V.
- Frequency: detected lifts or lowers per minute (whichever is larger, so an empty-handed return is not double counted), or entered manually.
- RWL is computed at the origin, or the lower of origin and destination when "significant control at destination" is set.

**Deviations.** Load weight, coupling and daily duration are entered, not measured. H, V and A are measured from the skeleton, so they depend on scale (enter the worker's height) and on depth estimation. The equation's conditions (two-handed, smooth lifts, no carrying, etc.) are not checked automatically. Interpolating FM is common practice but is not part of the published table.

### Strain Index (Moore & Garg, 1995), per hand

SI = IE × DE × EM × HWP × SW × DD (original 1995 version, not the revised Strain Index of 2017).

- Intensity of exertion and speed of work: entered ratings (1–5).
- Duration of exertion: share of time the hand is "active" (upper arm elevated > 20° or elbow > 45°), a proxy for the exertion duty cycle.
- Efforts per minute: largest of wrist cycles, elbow cycles, or 0.5 × detected hand movements per minute.
- Hand/wrist posture: rating from the 75th-percentile wrist flexion and deviation.
- Duration per day: from task hours.
- Bands used: ≤ 3 probably safe; 3–7 uncertain; ≥ 7 probably hazardous.

**Deviations.** Exertion timing is inferred from posture, not from force; wrist posture relies on hand keypoints.

### OCRA checklist (screening implementation), per side

Score = (recovery + frequency + force + posture + additional) × duration multiplier.

- Frequency: technical actions per minute estimated as hand-movement peaks per minute (or cycle time × actions per cycle when entered); mapped ≤ 20 → 0, ≤ 30 → 1, ≤ 40 → 3, ≤ 50 → 6, ≤ 60 → 8, ≤ 70 → 9, > 70 → 10.
- Posture: shoulder (elevation ≥ 80° for ≥ 10 % / 25 % / 50 % / 80 % of time → 1 / 2 / 6 / 12), elbow (fast flexion changes), wrist (flexion > 45° or deviation > 20°), grip (entered), plus stereotypy (cycle < 8 s → 3, < 15 s → 1.5).
- Recovery, force, grip and additional factors: entered.
- Duration multiplier from daily task minutes (0.5 below 120 min up to 2 above 600 min).
- Bands: ≤ 7.5 acceptable; ≤ 11 borderline; ≤ 14 low; ≤ 22.5 medium; > 22.5 high.

**Deviations.** This is a simplified screening version: counting technical actions from movement peaks is an approximation of the observer's count, and the point mappings are condensed from the checklist. It is not the full OCRA index of ISO 11228-3.

### ISO 11226 / EN 1005-4 (static and movement limits)

- A static hold is ≥ 4 s with the angle within ±5° of its mean.
- Trunk inclination: ≤ 20° acceptable; 20–60° acceptable only with full trunk support, otherwise compared with a maximum holding time; > 60° not acceptable; backward inclination without support not acceptable; side bend or twist > 10° held → not acceptable.
- Head/neck: ≤ 25° acceptable; 25–85° compared with a maximum holding time; > 85° or extension not acceptable.
- Upper arm elevation: ≤ 20° acceptable; 20–60° acceptable with full arm support, otherwise compared with a maximum holding time; > 60° not acceptable (conditional with support).
- Movement frequency (EN 1005-4): upper arm 20–60° < 10/min acceptable; > 60° < 2/min conditional; trunk flexion > 20° < 2/min acceptable, < 10/min conditional.

**Deviations.** The maximum acceptable holding times are **linear approximations** of the standards' curves (trunk 240 s at 20° to 60 s at 60°; upper arm 180 s to 60 s; head 480 s at 25° to 60 s at 85°). The text of ISO 11226 and EN 1005-4 is copyrighted and was not available when these were written; check the limits against the standards before relying on them.

## 6. Other analyses

- **Repetition counting:** peaks in smoothed angle or hand-height signals with prominence ≥ 15–20° (or 15 cm) and ≥ 0.4 s apart; rate per minute, median cycle time and amplitude.
- **Static holds:** RULA/REBA "static" = trunk, neck and both upper-arm angles each stay within a 20° range over the preceding 60 s.
- **Repetitive:** an upper-limb signal shows ≥ 3 peaks and > 4 per minute within ±30 s.
- **Activity segmentation:** rule-based labels (lifting, lowering, walking/carrying, overhead work, bending, squatting/kneeling, reaching, seated, static standing, manual work), merged when shorter than 0.5 s.
- **Time in posture and body heatmap:** share of time in fixed angle bands per joint; a body part is "medium or higher" when its band risk is ≥ 2.
- **Reach zones:** horizontal reach ratio < 0.5 primary, < 0.8 secondary, < 1.0 maximum, ≥ 1.0 beyond reach; also time above shoulder and below knuckle height.
- **Anthropometry and workstation fit:** segment lengths from the skeleton (medians), standing heights from Drillis & Contini proportions; work-surface recommendation relative to elbow height after Grandjean (precision +5 to +10 cm, light −15 to −10 cm, heavy −40 to −15 cm).

## 7. Confidence of each score

1. Each measure has a reliability r (section 3) and an assumed error σ that grows as r falls: 2° + 6°·(1 − r) for bending and joint angles, 4° + 10°·(1 − r) for twist, 1 cm + 5 cm·(1 − r) for distances, 3 + 10·(1 − r) percentage points for shoulder elevation. These are the typical errors of smoothed markerless angles reported in the literature (about 3–5° for well-seen joints, more for poorly seen ones and for axial rotation).
2. **Measurement quality** = mean reliability of the measures that can change this score: those where an error of ±2σ, applied to that measure alone, changes the score. A weak twist or wrist angle far from any threshold therefore does not lower the confidence of a score it cannot change. If no measure can change the score, the mean reliability of all angles is used.
3. The frame is re-scored 10–24 times (40 for photos) with every measure perturbed by Gaussian noise of its σ (fixed random seed, so reports are reproducible).
4. **Stability** = share of re-scores that stay on the same action level or within ±1 score point (RULA, REBA); for OWAS, whose score is the action category, the same category.
5. **Level stability** = share of re-scores on the same action level. Below 60 % the score is flagged **near cut-off**: it is measured well enough, but the posture lies so close to an action-level boundary that a small error could move it to the neighbouring level.
6. **Confidence** = stability × √(measurement quality). A perfectly measured, stable score reaches 100 %. High ≥ 75 %, medium ≥ 50 %, low below.

The tooltip of each confidence badge shows the measurement quality and the level stability separately, so a low confidence can be traced to the camera (low quality: change the set-up) or to the posture (near cut-off: check on the video). Measures that cannot be determined are left out, not assumed: a raised shoulder (shrug) is measured only after neutral-posture calibration.

**Deviations.** The σ values are taken from typical errors in the literature, not measured for ErgoCapture's own pipeline. The confidence is a measure of how robust a score is to plausible measurement error, not a validated probability of agreement with an expert. Calibrating it needs reference data (see [Validity](validity.md#6-validation-plan)).

## 8. Photos

Each photo is scored on its own (RULA, REBA, OWAS with confidence; 40 perturbations). Methods that need time (repetition, NIOSH, Strain Index, OCRA, holding times) are not applied. The options "held > 1 min" and "repeated > 4/min" add the RULA muscle-use and REBA activity points. Stature is estimated across the photo set, assuming one worker.

## 9. Narrative

The standard narrative is generated from the computed results only. The optional AI narrative (beta) runs SmolVLM2-500M (frame descriptions) and Qwen3-1.7B or 0.6B (text) in the browser; sentences with numbers not present in the results, or that call the work safe or acceptable when the measured risk is medium or higher, are removed; recommendations always come from the rule-based engine.

## References

- Casiez G, Roussel N, Vogel D (2012). 1€ filter: a simple speed-based low-pass filter for noisy input in interactive systems. *CHI 2012*. https://doi.org/10.1145/2207676.2208639
- Hignett S, McAtamney L (2000). Rapid Entire Body Assessment (REBA). *Applied Ergonomics* 31(2):201–205. https://doi.org/10.1016/S0003-6870(99)00039-3
- Karhu O, Kansi P, Kuorinka I (1977). Correcting working postures in industry: a practical method for analysis. *Applied Ergonomics* 8(4):199–201. https://doi.org/10.1016/0003-6870(77)90164-8
- McAtamney L, Corlett EN (1993). RULA: a survey method for the investigation of work-related upper limb disorders. *Applied Ergonomics* 24(2):91–99. https://doi.org/10.1016/0003-6870(93)90080-S
- Moore JS, Garg A (1995). The Strain Index: a proposed method to analyze jobs for risk of distal upper extremity disorders. *AIHA Journal* 56(5):443–458. https://doi.org/10.1080/15428119591016863
- Waters TR, Putz-Anderson V, Garg A, Fine LJ (1993). Revised NIOSH equation for the design and evaluation of manual lifting tasks. *Ergonomics* 36(7):749–776. https://doi.org/10.1080/00140139308967940
- ISO 11226:2000 Ergonomics — Evaluation of static working postures. ISO 11228-3:2007 Handling of low loads at high frequency. EN 1005-4:2005+A1:2008 Safety of machinery — Human physical performance — Part 4.
- Further references, including the pose-estimation literature, are listed in [Validity](validity.md#references).
