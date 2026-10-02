import { KP, NUM_KEYPOINTS, type Keypoint, type PoseFrame, type PoseTrack } from "./types";
import type { TaskSettings } from "../ergo/settings";
import type { Calibration } from "../ergo/measures";

/**
 * Skeleton-only session files and pose import from other pipelines
 * (server-tier models such as RTMW, Sapiens, MotionBERT, Pose2Sim, SMPL-X
 * joint regressors). Storing skeletons instead of video protects privacy.
 */

export interface SessionFile {
  format: "ergocapture.session";
  version: 1;
  createdAt: string;
  tracks: PoseTrack[];
  settings: TaskSettings;
  calib: Calibration;
}

export function makeSessionFile(tracks: PoseTrack[], settings: TaskSettings, calib: Calibration): SessionFile {
  return { format: "ergocapture.session", version: 1, createdAt: new Date().toISOString(), tracks, settings, calib };
}

/**
 * Generic pose file:
 * {
 *   "format": "blazepose33" | "coco17" | "h36m17" | "mhr70",
 *   "fps": 30,
 *   "units": "m" | "mm",          // default m
 *   "yUp": false,                 // true if +y points up (most mocap/3D lifters)
 *   "frames": [ { "t": 0.0, "keypoints3d": [[x,y,z,conf], ...], "keypoints2d": [[u,v,conf], ...] } ]
 * }
 */
export type PoseFormat = "blazepose33" | "coco17" | "h36m17" | "mhr70";

export interface GenericPoseFile {
  format: PoseFormat;
  fps: number;
  units?: "m" | "mm";
  yUp?: boolean;
  width?: number;
  height?: number;
  label?: string;
  /** Pose engine name shown in reports, e.g. "SAM 3D Body (dinov3)" */
  source?: string;
  frames: Array<{ t?: number; keypoints3d: number[][] | null; keypoints2d?: number[][] | null }>;
}

type P = [number, number, number, number];

/**
 * SAM 3D Body (Meta, 2025) outputs the first 70 Momentum Human Rig keypoints
 * ("mhr70", see sam_3d_body/metadata/mhr70.py). Fingers give real knuckle
 * positions, so wrist angles are far better than from coarse landmarks.
 */
export const MHR70_TO_BP: Record<number, number> = {
  0: KP.nose,
  1: KP.leftEye,
  2: KP.rightEye,
  3: KP.leftEar,
  4: KP.rightEar,
  5: KP.leftShoulder,
  6: KP.rightShoulder,
  7: KP.leftElbow,
  8: KP.rightElbow,
  9: KP.leftHip,
  10: KP.rightHip,
  11: KP.leftKnee,
  12: KP.rightKnee,
  13: KP.leftAnkle,
  14: KP.rightAnkle,
  15: KP.leftFootIndex, // left big-toe tip
  17: KP.leftHeel,
  18: KP.rightFootIndex, // right big-toe tip
  20: KP.rightHeel,
  21: KP.rightThumb, // right thumb tip
  28: KP.rightIndex, // right index third joint (knuckle)
  40: KP.rightPinky, // right pinky third joint (knuckle)
  41: KP.rightWrist,
  42: KP.leftThumb,
  49: KP.leftIndex,
  61: KP.leftPinky,
  62: KP.leftWrist,
};

const COCO17_TO_BP: Record<number, number> = {
  0: KP.nose,
  1: KP.leftEye,
  2: KP.rightEye,
  3: KP.leftEar,
  4: KP.rightEar,
  5: KP.leftShoulder,
  6: KP.rightShoulder,
  7: KP.leftElbow,
  8: KP.rightElbow,
  9: KP.leftWrist,
  10: KP.rightWrist,
  11: KP.leftHip,
  12: KP.rightHip,
  13: KP.leftKnee,
  14: KP.rightKnee,
  15: KP.leftAnkle,
  16: KP.rightAnkle,
};

const H36M_TO_BP: Record<number, number> = {
  1: KP.rightHip,
  2: KP.rightKnee,
  3: KP.rightAnkle,
  4: KP.leftHip,
  5: KP.leftKnee,
  6: KP.leftAnkle,
  11: KP.leftShoulder,
  12: KP.leftElbow,
  13: KP.leftWrist,
  14: KP.rightShoulder,
  15: KP.rightElbow,
  16: KP.rightWrist,
};

/** Fill BlazePose points that a sparser skeleton does not provide (low confidence). */
function completeSkeleton(bp: (P | null)[], extra?: { head?: P; neck?: P; nose?: P }): Keypoint[] {
  const g = (i: number) => bp[i];
  const lerp = (a: P, b: P, w: number, c = 0.3): P => [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w, c];
  const setIf = (i: number, v: P | null | undefined) => {
    if (!bp[i] && v) bp[i] = v;
  };
  // Head points from head/neck/nose if missing.
  const nose = g(KP.nose) ?? extra?.nose ?? extra?.head ?? null;
  setIf(KP.nose, nose);
  const lSh = g(KP.leftShoulder),
    rSh = g(KP.rightShoulder);
  if (lSh && rSh) {
    const shMid = lerp(lSh, rSh, 0.5, Math.min(lSh[3], rSh[3]));
    const head = extra?.head ?? nose;
    if (head) {
      const earMid = lerp(shMid, head, 0.85, 0.3);
      setIf(KP.leftEar, lerp(earMid, lSh, 0.2, 0.3));
      setIf(KP.rightEar, lerp(earMid, rSh, 0.2, 0.3));
    }
  }
  for (const [e, i] of [
    [KP.leftEye, KP.leftEyeInner],
    [KP.leftEye, KP.leftEyeOuter],
    [KP.rightEye, KP.rightEyeInner],
    [KP.rightEye, KP.rightEyeOuter],
    [KP.nose, KP.mouthLeft],
    [KP.nose, KP.mouthRight],
    [KP.nose, KP.leftEye],
    [KP.nose, KP.rightEye],
  ])
    setIf(i, g(e) ? ([...g(e)!.slice(0, 3), 0.2] as P) : null);
  // Hands: extend the forearm (wrist angle unobservable → reads neutral, low confidence).
  for (const [el, wr, idx, pk, th] of [
    [KP.leftElbow, KP.leftWrist, KP.leftIndex, KP.leftPinky, KP.leftThumb],
    [KP.rightElbow, KP.rightWrist, KP.rightIndex, KP.rightPinky, KP.rightThumb],
  ]) {
    const E = g(el),
      W = g(wr);
    if (E && W) {
      const tip = lerp(E, W, 1.3, 0.15);
      setIf(idx, tip);
      setIf(pk, lerp(E, W, 1.28, 0.15));
      setIf(th, lerp(E, W, 1.2, 0.15));
    }
  }
  // Feet from ankles.
  for (const [kn, an, heel, toe] of [
    [KP.leftKnee, KP.leftAnkle, KP.leftHeel, KP.leftFootIndex],
    [KP.rightKnee, KP.rightAnkle, KP.rightHeel, KP.rightFootIndex],
  ]) {
    const K = g(kn),
      A = g(an);
    if (K && A) {
      setIf(heel, lerp(K, A, 1.1, 0.3));
      setIf(toe, lerp(K, A, 1.12, 0.3));
    }
  }
  return Array.from({ length: NUM_KEYPOINTS }, (_, i) => {
    const p = bp[i];
    return p ? { x: p[0], y: p[1], z: p[2], v: p[3] } : { x: 0, y: 0, z: 0, v: 0 };
  });
}

export function mapFrame(
  fmt: PoseFormat,
  pts: number[][] | null | undefined,
  k: number,
  flipY: boolean,
  is3d: boolean,
): Keypoint[] | null {
  if (!pts || !pts.length) return null;
  // 3D entries: [x, y, z, conf?]; 2D entries: [u, v, conf?]
  const P3 = (a: number[]): P => [a[0] * k, (flipY ? -1 : 1) * a[1] * k, (a[2] ?? 0) * k, a[3] ?? 1];
  const P2 = (a: number[]): P => [a[0], a[1], 0, a[2] ?? 1];
  const conv = is3d ? P3 : P2;
  if (fmt === "blazepose33") return pts.map((a) => conv(a)).map((p) => ({ x: p[0], y: p[1], z: p[2], v: p[3] }));
  const bp: (P | null)[] = new Array(NUM_KEYPOINTS).fill(null);
  const table = fmt === "coco17" ? COCO17_TO_BP : fmt === "mhr70" ? MHR70_TO_BP : H36M_TO_BP;
  for (const [src, dst] of Object.entries(table)) if (pts[+src]) bp[dst] = conv(pts[+src]);
  if (fmt === "h36m17") return completeSkeleton(bp, { head: pts[10] && conv(pts[10]), nose: pts[9] && conv(pts[9]) });
  return completeSkeleton(bp);
}

export function importGenericPose(file: GenericPoseFile, viewId = "import"): PoseTrack {
  const k = file.units === "mm" ? 0.001 : 1;
  const frames: PoseFrame[] = file.frames.map((f, i) => {
    const world = mapFrame(file.format, f.keypoints3d, k, !!file.yUp, true);
    // Centre world coordinates on the hips like MediaPipe.
    if (world) {
      const cx = (world[KP.leftHip].x + world[KP.rightHip].x) / 2;
      const cy = (world[KP.leftHip].y + world[KP.rightHip].y) / 2;
      const cz = (world[KP.leftHip].z + world[KP.rightHip].z) / 2;
      for (const p of world) {
        p.x -= cx;
        p.y -= cy;
        p.z -= cz;
      }
    }
    const image2d = f.keypoints2d ? mapFrame(file.format, f.keypoints2d, 1, false, false) : null;
    const W = file.width ?? 1,
      H = file.height ?? 1;
    const image = image2d ? image2d.map((p) => ({ ...p, x: W > 1 ? p.x / W : p.x, y: H > 1 ? p.y / H : p.y })) : null;
    return { t: f.t ?? i / file.fps, world, image };
  });
  return {
    viewId,
    viewLabel: file.label ?? `Imported ${file.format}`,
    source: file.source ?? (file.format === "mhr70" ? "SAM 3D Body" : `Imported ${file.format}`),
    detailedHands: file.format === "mhr70",
    personId: 1,
    fps: file.fps,
    width: file.width ?? 1280,
    height: file.height ?? 720,
    frames,
  };
}

export function parsePoseJson(text: string): { tracks: PoseTrack[]; settings?: TaskSettings; calib?: Calibration } {
  const data = JSON.parse(text);
  if (data?.format === "ergocapture.session") return { tracks: data.tracks, settings: data.settings, calib: data.calib };
  if (["blazepose33", "coco17", "h36m17", "mhr70"].includes(data?.format)) return { tracks: [importGenericPose(data)] };
  throw new Error(
    'Unrecognised file. Expected an ErgoCapture session or a pose file with "format": "blazepose33" | "coco17" | "h36m17" | "mhr70".',
  );
}
