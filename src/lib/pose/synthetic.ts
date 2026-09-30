import { KP, NUM_KEYPOINTS, type Keypoint, type PoseFrame, type PoseTrack, type Vec3 } from "./types";
import { add, cross, dot, normalize, reject, scale, sub } from "./vec";

/**
 * Forward-kinematics skeleton generator. Produces BlazePose-topology frames
 * from joint angles — used for the in-app demo and for unit tests that check
 * the angle and scoring pipeline against known ground truth.
 */

export interface SynthPose {
  trunkFlex: number;
  trunkSide: number;
  trunkTwist: number;
  neckFlex: number;
  shoulderFlexL: number;
  shoulderFlexR: number;
  shoulderAbdL: number;
  shoulderAbdR: number;
  elbowFlexL: number;
  elbowFlexR: number;
  wristFlexL: number;
  wristFlexR: number;
  hipFlexL: number;
  hipFlexR: number;
  kneeFlexL: number;
  kneeFlexR: number;
  /** Rotation of the whole body about vertical, relative to facing the camera (deg) */
  yaw: number;
  /** Horizontal displacement (m) for walking */
  x: number;
}

export const NEUTRAL: SynthPose = {
  trunkFlex: 0,
  trunkSide: 0,
  trunkTwist: 0,
  neckFlex: 0,
  shoulderFlexL: 0,
  shoulderFlexR: 0,
  shoulderAbdL: 5,
  shoulderAbdR: 5,
  elbowFlexL: 10,
  elbowFlexR: 10,
  wristFlexL: 0,
  wristFlexR: 0,
  hipFlexL: 0,
  hipFlexR: 0,
  kneeFlexL: 0,
  kneeFlexR: 0,
  yaw: 0,
  x: 0,
};

const R = Math.PI / 180;

/** Rodrigues rotation of v about unit axis k by `deg`. */
export function rotate(v: Vec3, k: Vec3, deg: number): Vec3 {
  const th = deg * R;
  const c = Math.cos(th),
    s = Math.sin(th);
  return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
}

export function synthesize(p: SynthPose, statureM = 1.75): Vec3[] {
  const k = statureM / 1.75;
  const U: Vec3 = [0, -1, 0];
  const F0: Vec3 = [0, 0, -1];
  const Rt0: Vec3 = [-1, 0, 0]; // subject's right when facing camera
  const pts: Vec3[] = new Array(NUM_KEYPOINTS).fill(0).map(() => [0, 0, 0] as Vec3);

  const pelvis: Vec3 = [0, 0, 0];
  pts[KP.leftHip] = add(pelvis, scale(Rt0, -0.09 * k));
  pts[KP.rightHip] = add(pelvis, scale(Rt0, 0.09 * k));

  // Trunk: flex forward about the right axis (pick the rotation sign that tilts
  // toward F), then side-bend about the forward axis.
  let Ut = rotate(U, Rt0, -p.trunkFlex);
  if (dot(Ut, F0) * p.trunkFlex < 0) Ut = rotate(U, Rt0, p.trunkFlex);
  const Fside = normalize(cross(Rt0, Ut)); // forward-ish axis orthogonal to trunk
  Ut = rotate(Ut, Fside, p.trunkSide);
  let Rt = normalize(reject(Rt0, Ut));
  Rt = rotate(Rt, Ut, p.trunkTwist);
  const Ft = normalize(cross(Ut, Rt));
  const shMid = add(pelvis, scale(Ut, 0.5 * k));
  pts[KP.leftShoulder] = add(shMid, scale(Rt, -0.19 * k));
  pts[KP.rightShoulder] = add(shMid, scale(Rt, 0.19 * k));

  // Head: neutral ears sit ~10° forward of the trunk line.
  const tilt = (v: Vec3, axisR: Vec3, deg: number, fwd: Vec3) => {
    const a = rotate(v, axisR, deg);
    return dot(a, fwd) * deg >= 0 ? a : rotate(v, axisR, -deg);
  };
  const Uh = tilt(Ut, Rt, p.neckFlex + 10, Ft);
  const Fh = normalize(cross(Uh, Rt));
  const earMid = add(shMid, scale(Uh, 0.2 * k));
  pts[KP.leftEar] = add(earMid, scale(Rt, -0.075 * k));
  pts[KP.rightEar] = add(earMid, scale(Rt, 0.075 * k));
  pts[KP.nose] = add(add(earMid, scale(Fh, 0.1 * k)), scale(Uh, -0.02 * k));
  const eye = (side: number, off: number) => add(add(add(earMid, scale(Fh, 0.08 * k)), scale(Rt, side * off * k)), scale(Uh, 0.01 * k));
  pts[KP.leftEyeInner] = eye(-1, 0.015);
  pts[KP.leftEye] = eye(-1, 0.03);
  pts[KP.leftEyeOuter] = eye(-1, 0.045);
  pts[KP.rightEyeInner] = eye(1, 0.015);
  pts[KP.rightEye] = eye(1, 0.03);
  pts[KP.rightEyeOuter] = eye(1, 0.045);
  pts[KP.mouthLeft] = add(add(earMid, scale(Fh, 0.09 * k)), add(scale(Uh, -0.06 * k), scale(Rt, -0.025 * k)));
  pts[KP.mouthRight] = add(add(earMid, scale(Fh, 0.09 * k)), add(scale(Uh, -0.06 * k), scale(Rt, 0.025 * k)));

  const arm = (side: "L" | "R") => {
    const out = side === "L" ? scale(Rt, -1) : Rt;
    const f = (side === "L" ? p.shoulderFlexL : p.shoulderFlexR) * R;
    const a = (side === "L" ? p.shoulderAbdL : p.shoulderAbdR) * R;
    const e = side === "L" ? p.elbowFlexL : p.elbowFlexR;
    const w = side === "L" ? p.wristFlexL : p.wristFlexR;
    const sh = side === "L" ? pts[KP.leftShoulder] : pts[KP.rightShoulder];
    const dir = normalize(
      add(add(scale(Ut, -Math.cos(f) * Math.cos(a)), scale(Ft, Math.sin(f) * Math.cos(a))), scale(out, Math.sin(a))),
    );
    const el = add(sh, scale(dir, 0.3 * k));
    let pv = reject(Ft, dir);
    if (Math.hypot(...pv) < 1e-3) pv = reject(Ut, dir);
    const pn = normalize(pv);
    const fdir = add(scale(dir, Math.cos(e * R)), scale(pn, Math.sin(e * R)));
    const wr = add(el, scale(fdir, 0.26 * k));
    // Unit vector in the elbow bend plane, perpendicular to the forearm.
    const pp = normalize(sub(scale(pn, Math.cos(e * R)), scale(dir, Math.sin(e * R))));
    const q = normalize(cross(fdir, pp));
    const h = add(scale(fdir, Math.cos(w * R)), scale(pp, Math.sin(w * R)));
    const qq = side === "L" ? scale(q, -1) : q;
    const idx = side === "L" ? [KP.leftElbow, KP.leftWrist, KP.leftIndex, KP.leftPinky, KP.leftThumb] : [KP.rightElbow, KP.rightWrist, KP.rightIndex, KP.rightPinky, KP.rightThumb];
    pts[idx[0]] = el;
    pts[idx[1]] = wr;
    pts[idx[2]] = add(wr, add(scale(h, 0.085 * k), scale(qq, 0.02 * k)));
    pts[idx[3]] = add(wr, add(scale(h, 0.075 * k), scale(qq, -0.025 * k)));
    pts[idx[4]] = add(wr, add(scale(h, 0.05 * k), scale(qq, 0.04 * k)));
  };
  arm("L");
  arm("R");

  const leg = (side: "L" | "R") => {
    const hf = side === "L" ? p.hipFlexL : p.hipFlexR;
    const kf = side === "L" ? p.kneeFlexL : p.kneeFlexR;
    const hip = side === "L" ? pts[KP.leftHip] : pts[KP.rightHip];
    const down = scale(U, -1);
    const thigh = tilt(down, Rt0, hf, F0);
    const kn = add(hip, scale(thigh, 0.43 * k));
    // Knee flexes the shank backwards relative to the thigh.
    const back = scale(F0, -1);
    let shank = rotate(thigh, Rt0, kf);
    if (dot(sub(shank, thigh), back) < 0 && kf > 0) shank = rotate(thigh, Rt0, -kf);
    const an = add(kn, scale(shank, 0.42 * k));
    const ids =
      side === "L"
        ? [KP.leftKnee, KP.leftAnkle, KP.leftHeel, KP.leftFootIndex]
        : [KP.rightKnee, KP.rightAnkle, KP.rightHeel, KP.rightFootIndex];
    pts[ids[0]] = kn;
    pts[ids[1]] = an;
    pts[ids[2]] = add(an, add(scale(back, 0.05 * k), scale(down, 0.05 * k)));
    pts[ids[3]] = add(an, add(scale(F0, 0.15 * k), scale(down, 0.06 * k)));
  };
  leg("L");
  leg("R");

  // Global yaw about the pelvis vertical, then translation.
  return pts.map((q) => add(rotate(q, U, p.yaw), [p.x, 0, 0]));
}

export function toFrame(points: Vec3[], t: number, noise = 0, rand: () => number = Math.random, yaw = 0): PoseFrame {
  const g = () => (rand() + rand() + rand() - 1.5) * 0.8 * noise;
  // Far-side limbs are harder to see when the body is side-on.
  const sideOn = Math.abs(Math.sin(yaw * R));
  const farLeft = Math.sin(yaw * R) > 0;
  const vis = (i: number) => {
    const isLeft = [11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 7, 1, 2, 3, 9].includes(i);
    const far = farLeft ? isLeft : !isLeft;
    return far ? 0.95 - 0.35 * sideOn : 0.95;
  };
  const world: Keypoint[] = points.map((q, i) => ({ x: q[0] + g(), y: q[1] + g(), z: q[2] + g(), v: vis(i) }));
  // Pinhole projection (16:9 frame), camera 3.2 m in front of the pelvis at hip height.
  const image: Keypoint[] = world.map((q) => {
    const Z = q.z + 3.2;
    return { x: 0.5 + (0.75 * q.x) / Z, y: 0.5 + (1.33 * q.y) / Z, z: q.z, v: q.v };
  });
  return { t, world, image };
}

/** A 60-second demo of a pick-and-place job: box lifts from the floor, shelf placing, overhead work, and reaching. */
export function demoTrack(fps = 10, seconds = 60, yaw = 55): PoseTrack {
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const frames: PoseFrame[] = [];
  const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, x)));
  const mix = (a: SynthPose, b: SynthPose, w: number): SynthPose =>
    Object.fromEntries(Object.keys(a).map((key) => [key, a[key as keyof SynthPose] * (1 - w) + b[key as keyof SynthPose] * w])) as unknown as SynthPose;
  const P = (o: Partial<SynthPose>): SynthPose => ({ ...NEUTRAL, yaw, ...o });
  const stand = P({});
  const bentPick = P({ trunkFlex: 70, neckFlex: -5, shoulderFlexL: 75, shoulderFlexR: 75, elbowFlexL: 20, elbowFlexR: 20, hipFlexL: 25, hipFlexR: 25, kneeFlexL: 40, kneeFlexR: 40 });
  const hold = P({ trunkFlex: 5, shoulderFlexL: 20, shoulderFlexR: 20, elbowFlexL: 85, elbowFlexR: 85, shoulderAbdL: 10, shoulderAbdR: 10 });
  const shelf = P({ trunkFlex: 0, trunkTwist: 35, neckFlex: -12, shoulderFlexL: 110, shoulderFlexR: 110, elbowFlexL: 30, elbowFlexR: 30, wristFlexL: 25, wristFlexR: 25 });
  const overhead = P({ neckFlex: -25, shoulderFlexL: 140, shoulderFlexR: 125, shoulderAbdL: 20, shoulderAbdR: 25, elbowFlexL: 40, elbowFlexR: 50, wristFlexL: 30, wristFlexR: 35 });
  const reachA = P({ trunkFlex: 30, neckFlex: 25, shoulderFlexR: 80, elbowFlexR: 15, shoulderFlexL: 30, elbowFlexL: 80, wristFlexR: 20 });
  const reachB = P({ trunkFlex: 15, neckFlex: 30, shoulderFlexR: 35, elbowFlexR: 90, shoulderFlexL: 30, elbowFlexL: 80, wristFlexR: 40 });

  for (let i = 0; i < fps * seconds; i++) {
    const t = i / fps;
    let pose: SynthPose;
    if (t < 4) pose = stand;
    else if (t < 34) {
      // 5 lift cycles of 6 s: stand → pick → hold → shelf → stand
      const c = ((t - 4) % 6) / 6;
      if (c < 0.2) pose = mix(stand, bentPick, ease(c / 0.2));
      else if (c < 0.4) pose = mix(bentPick, hold, ease((c - 0.2) / 0.2));
      else if (c < 0.6) pose = mix(hold, shelf, ease((c - 0.4) / 0.2));
      else if (c < 0.8) pose = shelf;
      else pose = mix(shelf, stand, ease((c - 0.8) / 0.2));
    } else if (t < 38) pose = mix(stand, overhead, ease((t - 34) / 1.5));
    else if (t < 46) {
      const wob = Math.sin((t - 38) * 2.5) * 8;
      pose = { ...overhead, shoulderFlexR: overhead.shoulderFlexR + wob, elbowFlexR: overhead.elbowFlexR - wob };
    } else if (t < 48) pose = mix(overhead, reachB, ease((t - 46) / 2));
    else {
      // Repetitive reaching at ~24 cycles/min
      const c = 0.5 - 0.5 * Math.cos(((t - 48) / 2.5) * 2 * Math.PI);
      pose = mix(reachB, reachA, c);
    }
    frames.push(toFrame(synthesize(pose), t, 0.006, rand, yaw));
  }
  return { viewId: "demo", viewLabel: "Demo (synthetic side view)", personId: 1, fps, width: 1280, height: 720, frames };
}
