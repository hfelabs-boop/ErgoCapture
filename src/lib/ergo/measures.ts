import { KP, type Keypoint, type PoseFrame, type Vec3 } from "../pose/types";
import {
  angleBetween,
  clamp,
  cross,
  deg,
  dot,
  mid,
  norm,
  normalize,
  planeAngle,
  reject,
  scale,
  signedAngleAround,
  sub,
  v3,
} from "../pose/vec";

/**
 * Joint angle and posture measure computation from 3D keypoints.
 *
 * Conventions: world coordinates are metric, y points down (MediaPipe world
 * landmarks). "Up" is -y unless a neutral-posture calibration supplied a
 * better gravity estimate. All angles in degrees.
 */

export type Plane = "sagittal" | "frontal" | "transverse" | "joint" | "distance";

export const MEASURE_DEFS = [
  { key: "trunkFlex", label: "Trunk flexion (+) / extension (−)", unit: "°", plane: "sagittal" },
  { key: "trunkSide", label: "Trunk side bend", unit: "°", plane: "frontal" },
  { key: "trunkTwist", label: "Trunk twist", unit: "°", plane: "transverse" },
  { key: "neckFlex", label: "Neck flexion (+) / extension (−)", unit: "°", plane: "sagittal" },
  { key: "neckSide", label: "Neck side bend", unit: "°", plane: "frontal" },
  { key: "neckTwist", label: "Neck twist", unit: "°", plane: "transverse" },
  { key: "shoulderFlexL", label: "Left upper arm flexion (+) / extension (−)", unit: "°", plane: "sagittal" },
  { key: "shoulderFlexR", label: "Right upper arm flexion (+) / extension (−)", unit: "°", plane: "sagittal" },
  { key: "shoulderAbdL", label: "Left upper arm abduction", unit: "°", plane: "frontal" },
  { key: "shoulderAbdR", label: "Right upper arm abduction", unit: "°", plane: "frontal" },
  { key: "shoulderElevL", label: "Left upper arm elevation", unit: "°", plane: "joint" },
  { key: "shoulderElevR", label: "Right upper arm elevation", unit: "°", plane: "joint" },
  { key: "shoulderRaiseL", label: "Left shoulder raised (shrug)", unit: "%", plane: "frontal" },
  { key: "shoulderRaiseR", label: "Right shoulder raised (shrug)", unit: "%", plane: "frontal" },
  { key: "elbowFlexL", label: "Left elbow flexion", unit: "°", plane: "joint" },
  { key: "elbowFlexR", label: "Right elbow flexion", unit: "°", plane: "joint" },
  { key: "wristFlexL", label: "Left wrist flexion/extension", unit: "°", plane: "joint" },
  { key: "wristFlexR", label: "Right wrist flexion/extension", unit: "°", plane: "joint" },
  { key: "wristDevL", label: "Left wrist deviation", unit: "°", plane: "joint" },
  { key: "wristDevR", label: "Right wrist deviation", unit: "°", plane: "joint" },
  { key: "kneeFlexL", label: "Left knee flexion", unit: "°", plane: "joint" },
  { key: "kneeFlexR", label: "Right knee flexion", unit: "°", plane: "joint" },
  { key: "thighL", label: "Left thigh angle from vertical", unit: "°", plane: "sagittal" },
  { key: "thighR", label: "Right thigh angle from vertical", unit: "°", plane: "sagittal" },
  { key: "handHeightL", label: "Left hand height above floor", unit: "m", plane: "distance" },
  { key: "handHeightR", label: "Right hand height above floor", unit: "m", plane: "distance" },
  { key: "handHoriz", label: "Hands horizontal distance from ankles (NIOSH H)", unit: "m", plane: "distance" },
  { key: "handAsym", label: "Hands asymmetry angle (NIOSH A)", unit: "°", plane: "transverse" },
  { key: "reachL", label: "Left reach (fraction of arm length)", unit: "", plane: "distance" },
  { key: "reachR", label: "Right reach (fraction of arm length)", unit: "", plane: "distance" },
  { key: "wristMidlineL", label: "Left wrist lateral offset from midline", unit: "m", plane: "frontal" },
  { key: "wristMidlineR", label: "Right wrist lateral offset from midline", unit: "m", plane: "frontal" },
  { key: "kneeHeight", label: "Lowest knee height above floor", unit: "m", plane: "distance" },
  { key: "footLift", label: "Foot height difference", unit: "m", plane: "distance" },
  { key: "handsGap", label: "Distance between hands", unit: "m", plane: "distance" },
  { key: "locomotion", label: "Body translation speed", unit: "body-heights/s", plane: "distance" },
] as const satisfies ReadonlyArray<{ key: string; label: string; unit: string; plane: Plane }>;

export type MeasureKey = (typeof MEASURE_DEFS)[number]["key"];
export type Measures = Record<MeasureKey, number>;
export const MEASURE_KEYS = MEASURE_DEFS.map((d) => d.key) as MeasureKey[];

export interface FrameMeasures {
  t: number;
  valid: boolean;
  interpolated: boolean;
  /** Camera yaw relative to body, folded to 0..90: 0 = front/back view, 90 = side view */
  viewYaw: number;
  m: Measures;
  /** Per-measure confidence 0..1 */
  c: Measures;
}

export interface Calibration {
  /** Gravity "up" in world coords, from a neutral standing capture */
  up?: Vec3;
  /** Offsets subtracted so the neutral pose reads ~0° */
  neckFlexOffset?: number;
  trunkFlexOffset?: number;
  /** Neutral ear–shoulder distance (m) per side, for shrug detection */
  earShoulderL?: number;
  earShoulderR?: number;
}

export interface MeasureContext {
  /** Multiply world coordinates by this to get metres (from subject stature) */
  scale: number;
  calib: Calibration;
}

export const emptyMeasures = (fill = NaN): Measures =>
  Object.fromEntries(MEASURE_KEYS.map((k) => [k, fill])) as Measures;

const vis = (w: Keypoint[], ...idx: number[]) => Math.min(...idx.map((i) => w[i].v));

/** Confidence multiplier from how well the camera sees a given plane. */
export function viewFactor(plane: Plane, yawDeg: number): number {
  const s = Math.abs(Math.sin((yawDeg * Math.PI) / 180));
  const c = Math.abs(Math.cos((yawDeg * Math.PI) / 180));
  switch (plane) {
    case "sagittal":
      return 0.55 + 0.45 * s;
    case "frontal":
      return 0.55 + 0.45 * c;
    case "transverse":
      return 0.6;
    case "joint":
      return 0.8 + 0.2 * Math.max(s, c);
    case "distance":
      return 0.85;
  }
}

/** Median segment lengths → estimated stature (m, in model units). */
export function estimateStature(frames: PoseFrame[]): number {
  const med = (a: number[]) => {
    const s = a.filter(Number.isFinite).sort((x, y) => x - y);
    return s.length ? s[Math.floor(s.length / 2)] : NaN;
  };
  const shank: number[] = [];
  const thigh: number[] = [];
  const trunk: number[] = [];
  const head: number[] = [];
  for (const f of frames) {
    const w = f.world;
    if (!w || f.interpolated) continue;
    const p = (i: number) => v3(w[i]);
    const seg = (a: number, b: number) => (vis(w, a, b) > 0.5 ? norm(sub(p(a), p(b))) : NaN);
    shank.push((seg(KP.leftAnkle, KP.leftKnee) + seg(KP.rightAnkle, KP.rightKnee)) / 2);
    thigh.push((seg(KP.leftKnee, KP.leftHip) + seg(KP.rightKnee, KP.rightHip)) / 2);
    if (vis(w, KP.leftHip, KP.rightHip, KP.leftShoulder, KP.rightShoulder) > 0.5)
      trunk.push(norm(sub(mid(p(KP.leftShoulder), p(KP.rightShoulder)), mid(p(KP.leftHip), p(KP.rightHip)))));
    if (vis(w, KP.leftEar, KP.rightEar, KP.leftShoulder, KP.rightShoulder) > 0.5)
      head.push(norm(sub(mid(p(KP.leftEar), p(KP.rightEar)), mid(p(KP.leftShoulder), p(KP.rightShoulder)))));
  }
  // Ankle→ear chain is ~87% of stature (Drillis & Contini segment proportions).
  return (med(shank) + med(thigh) + med(trunk) + med(head)) / 0.87;
}

/** Derive a neutral-posture calibration from frames of the subject standing upright, arms relaxed. */
export function calibrateNeutral(frames: PoseFrame[]): Calibration {
  const ups: Vec3[] = [];
  for (const f of frames) {
    const w = f.world;
    if (!w) continue;
    const p = (i: number) => v3(w[i]);
    const ankle = mid(p(KP.leftAnkle), p(KP.rightAnkle));
    const sh = mid(p(KP.leftShoulder), p(KP.rightShoulder));
    ups.push(normalize(sub(sh, ankle)));
  }
  if (!ups.length) return {};
  const up = normalize(ups.reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], [0, 0, 0] as Vec3));
  const base: Calibration = { up };
  const ms = frames
    .map((f) => computeFrameMeasures(f, { scale: 1, calib: base }))
    .filter((m) => m.valid);
  const avg = (fn: (m: FrameMeasures) => number) => {
    const xs = ms.map(fn).filter(Number.isFinite);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined;
  };
  const earSh = (ear: number, sh: number) => {
    const xs = frames
      .filter((f) => f.world && Math.min(f.world[ear].v, f.world[sh].v) > 0.5)
      .map((f) => norm(sub(v3(f.world![ear]), v3(f.world![sh]))));
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined;
  };
  return {
    up,
    neckFlexOffset: avg((m) => m.m.neckFlex + 10),
    trunkFlexOffset: avg((m) => m.m.trunkFlex),
    earShoulderL: earSh(KP.leftEar, KP.leftShoulder),
    earShoulderR: earSh(KP.rightEar, KP.rightShoulder),
  };
}

export function computeFrameMeasures(frame: PoseFrame, ctx: MeasureContext): FrameMeasures {
  const m = emptyMeasures();
  const c = emptyMeasures(0);
  const w = frame.world;
  if (!w) return { t: frame.t, valid: false, interpolated: !!frame.interpolated, viewYaw: NaN, m, c };
  const s = ctx.scale || 1;
  const p = (i: number): Vec3 => scale(v3(w[i]), s);

  const U: Vec3 = ctx.calib.up ?? [0, -1, 0];
  const lSh = p(KP.leftShoulder),
    rSh = p(KP.rightShoulder),
    lHip = p(KP.leftHip),
    rHip = p(KP.rightHip);
  const shMid = mid(lSh, rSh);
  const hipMid = mid(lHip, rHip);
  const trunk = sub(shMid, hipMid);

  // Body frame from the pelvis: L points to the subject's right.
  const Lh = normalize(reject(sub(rHip, lHip), U));
  const F = normalize(cross(U, Lh));
  // Camera sits along -z from the subject.
  const toCam: Vec3 = [0, 0, -1];
  // Folded to 0..90: a back view sees the same planes as a front view.
  const rawYaw = Math.abs(signedAngleAround(F, toCam, U));
  const viewYaw = rawYaw > 90 ? 180 - rawYaw : rawYaw;

  const set = (k: MeasureKey, value: number, conf: number, plane: Plane) => {
    m[k] = value;
    c[k] = Number.isFinite(value) ? clamp(conf * viewFactor(plane, viewYaw), 0, 1) : 0;
  };

  // ---- Trunk
  const vTrunk = vis(w, KP.leftShoulder, KP.rightShoulder, KP.leftHip, KP.rightHip);
  const trunkFlexRaw = planeAngle(reject(trunk, Lh), U, F);
  set("trunkFlex", trunkFlexRaw - (ctx.calib.trunkFlexOffset ?? 0), vTrunk, "sagittal");
  set("trunkSide", Math.abs(planeAngle(reject(trunk, F), U, Lh)), vTrunk, "frontal");
  const twist = signedAngleAround(sub(rHip, lHip), sub(rSh, lSh), U);
  set("trunkTwist", Math.abs(twist), vTrunk, "transverse");

  // Trunk-attached frame (for neck and arms, which RULA/REBA measure relative to the trunk).
  const Ut = normalize(trunk);
  const Lt = normalize(reject(sub(rSh, lSh), Ut));
  const Ft = normalize(cross(Ut, Lt));

  // ---- Neck / head
  const earMid = mid(p(KP.leftEar), p(KP.rightEar));
  const neck = sub(earMid, shMid);
  const vNeck = Math.min(vTrunk, vis(w, KP.leftEar, KP.rightEar));
  const neckFlexRaw = planeAngle(reject(neck, Lt), Ut, Ft);
  // Ears sit slightly forward of the shoulder joint in a neutral posture (~10°).
  const neckOffset = ctx.calib.neckFlexOffset ?? 10;
  set("neckFlex", neckFlexRaw - neckOffset, vNeck, "sagittal");
  set("neckSide", Math.abs(planeAngle(reject(neck, Ft), Ut, Lt)), vNeck, "frontal");
  const headFwd = sub(p(KP.nose), earMid);
  const neckTwist = signedAngleAround(Ft, headFwd, Ut);
  set("neckTwist", Math.abs(neckTwist), Math.min(vNeck, w[KP.nose].v) * 0.9, "transverse");

  // ---- Arms
  const arm = (side: "L" | "R") => {
    const S = side === "L" ? KP.leftShoulder : KP.rightShoulder;
    const E = side === "L" ? KP.leftElbow : KP.rightElbow;
    const Wr = side === "L" ? KP.leftWrist : KP.rightWrist;
    const I = side === "L" ? KP.leftIndex : KP.rightIndex;
    const Pk = side === "L" ? KP.leftPinky : KP.rightPinky;
    const Ear = side === "L" ? KP.leftEar : KP.rightEar;
    const out: Vec3 = side === "L" ? scale(Lt, -1) : Lt;
    const sh = p(S),
      el = p(E),
      wr = p(Wr),
      idx = p(I),
      pk = p(Pk);
    const ua = sub(el, sh);
    const fa = sub(wr, el);
    const down = scale(Ut, -1);
    const vUa = Math.min(vis(w, S, E), vTrunk);
    set(`shoulderFlex${side}`, planeAngle(reject(ua, Lt), down, Ft), vUa, "sagittal");
    // Lateral elevation out of the sagittal plane (robust when the arm is also flexed).
    set(`shoulderAbd${side}`, Math.max(0, deg(Math.asin(clamp(dot(normalize(ua), out), -1, 1)))), vUa, "frontal");
    set(`shoulderElev${side}`, angleBetween(ua, down), vUa, "joint");
    const vEl = vis(w, S, E, Wr);
    set(`elbowFlex${side}`, 180 - angleBetween(scale(ua, -1), fa), vEl, "joint");

    // Wrist from the pose model's coarse hand points (index, pinky): lower fidelity.
    const handMid = mid(idx, pk);
    const hand = sub(handMid, wr);
    const palmN = normalize(cross(sub(idx, wr), sub(pk, wr)));
    const faN = normalize(fa);
    const vWr = vis(w, E, Wr, I, Pk) * 0.6;
    const flex = Math.abs(deg(Math.asin(clamp(dot(faN, palmN), -1, 1))));
    set(`wristFlex${side}`, flex, vWr, "joint");
    const inPlane = angleBetween(reject(fa, palmN), hand);
    set(`wristDev${side}`, inPlane, vWr * 0.8, "joint");

    // Shrug: ear–shoulder distance shrinks vs calibrated neutral.
    const neutral = side === "L" ? ctx.calib.earShoulderL : ctx.calib.earShoulderR;
    const es = norm(sub(p(Ear), sh));
    if (neutral) set(`shoulderRaise${side}`, Math.max(0, (1 - es / (neutral * s)) * 100), vis(w, Ear, S), "frontal");
    else set(`shoulderRaise${side}`, 0, 0.25, "frontal");

    // Reach: horizontal shoulder→hand distance relative to arm length.
    const armLen = norm(ua) + norm(fa) + norm(hand) * 0.5;
    const horiz = norm(reject(sub(handMid, sh), U));
    set(`reach${side}`, armLen > 0 ? horiz / armLen : NaN, vEl, "distance");
    const lat = dot(sub(wr, shMid), out);
    set(`wristMidline${side}`, lat, vEl, "frontal");
    return { handMid };
  };
  const armL = arm("L");
  const armR = arm("R");

  // ---- Legs
  const leg = (side: "L" | "R") => {
    const H = side === "L" ? KP.leftHip : KP.rightHip;
    const K = side === "L" ? KP.leftKnee : KP.rightKnee;
    const A = side === "L" ? KP.leftAnkle : KP.rightAnkle;
    const vL = vis(w, H, K, A);
    const th = sub(p(K), p(H));
    set(`kneeFlex${side}`, 180 - angleBetween(scale(th, -1), sub(p(A), p(K))), vL, "joint");
    set(`thigh${side}`, angleBetween(th, scale(U, -1)), vis(w, H, K), "sagittal");
  };
  leg("L");
  leg("R");

  // ---- Floor-referenced heights and NIOSH geometry
  const footIdx = [KP.leftAnkle, KP.rightAnkle, KP.leftHeel, KP.rightHeel, KP.leftFootIndex, KP.rightFootIndex];
  const heightAlong = (q: Vec3) => dot(q, U);
  const floor = Math.min(...footIdx.map((i) => heightAlong(p(i))));
  const vFeet = Math.max(vis(w, KP.leftHeel, KP.leftFootIndex), vis(w, KP.rightHeel, KP.rightFootIndex));
  set("handHeightL", heightAlong(armL.handMid) - floor, Math.min(vFeet, w[KP.leftWrist].v), "distance");
  set("handHeightR", heightAlong(armR.handMid) - floor, Math.min(vFeet, w[KP.rightWrist].v), "distance");
  set(
    "kneeHeight",
    Math.min(heightAlong(p(KP.leftKnee)), heightAlong(p(KP.rightKnee))) - floor,
    Math.min(vFeet, vis(w, KP.leftKnee, KP.rightKnee)),
    "distance",
  );
  const hLHeel = heightAlong(p(KP.leftAnkle));
  const hRHeel = heightAlong(p(KP.rightAnkle));
  set("footLift", Math.abs(hLHeel - hRHeel), vis(w, KP.leftAnkle, KP.rightAnkle), "distance");

  const lA = p(KP.leftAnkle),
    rA = p(KP.rightAnkle);
  const ankleMid = mid(lA, rA);
  const handsMid = mid(armL.handMid, armR.handMid);
  const handVec = reject(sub(handsMid, ankleMid), U);
  const La = normalize(reject(sub(rA, lA), U));
  const Fa = normalize(cross(U, La));
  // NIOSH H: horizontal distance of hands from the mid-point of the inner ankle bones.
  set("handHoriz", Math.abs(dot(handVec, Fa)), vis(w, KP.leftWrist, KP.rightWrist, KP.leftAnkle, KP.rightAnkle), "distance");
  const asym = Math.abs(signedAngleAround(Fa, handVec, U));
  set("handAsym", norm(handVec) > 0.08 ? asym : 0, vis(w, KP.leftWrist, KP.rightWrist, KP.leftAnkle, KP.rightAnkle) * 0.8, "transverse");
  set("handsGap", norm(sub(armL.handMid, armR.handMid)), vis(w, KP.leftWrist, KP.rightWrist), "distance");
  // Filled in by the temporal pass.
  m.locomotion = 0;
  c.locomotion = 0.5;

  return { t: frame.t, valid: true, interpolated: !!frame.interpolated, viewYaw, m, c };
}

/** Temporal pass: body translation speed (image space, normalised by body height) for walking detection. */
export function addLocomotion(frames: PoseFrame[], ms: FrameMeasures[]) {
  const pos = frames.map((f) => {
    const im = f.image;
    if (!im) return null;
    const hip = mid(v3(im[KP.leftHip]), v3(im[KP.rightHip]));
    const sh = mid(v3(im[KP.leftShoulder]), v3(im[KP.rightShoulder]));
    const ank = mid(v3(im[KP.leftAnkle]), v3(im[KP.rightAnkle]));
    const bodyH = Math.max(0.05, Math.abs(ank[1] - sh[1]) * 1.25);
    return { x: hip[0] / bodyH, y: hip[1] / bodyH };
  });
  const win = 3;
  for (let i = 0; i < ms.length; i++) {
    const a = pos[Math.max(0, i - win)];
    const b = pos[Math.min(ms.length - 1, i + win)];
    const dt = ms[Math.min(ms.length - 1, i + win)].t - ms[Math.max(0, i - win)].t;
    if (a && b && dt > 0) {
      ms[i].m.locomotion = Math.hypot(b.x - a.x, b.y - a.y) / dt;
      ms[i].c.locomotion = 0.7;
    }
  }
}
