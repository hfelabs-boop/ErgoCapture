import { mapFrame } from "../importExport";
import { KP, NUM_KEYPOINTS, type Keypoint } from "../types";

/**
 * Pure keypoint conversions from each pose engine's native output to the
 * app's 33-point skeleton (image: normalised 0..1; world: metres, hip-centred,
 * x right, y down, z away from the camera). Kept free of browser APIs so they
 * can be unit-tested.
 */

/** COCO-WholeBody (133 points: body 17, feet 6, face 68, hands 2×21) → BlazePose index. */
export const COCO_WB_TO_BP: Record<number, number> = {
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
  17: KP.leftFootIndex, // left big toe
  19: KP.leftHeel,
  20: KP.rightFootIndex, // right big toe
  22: KP.rightHeel,
  // Face (68-point iBUG layout starts at 23): eye corners and mouth corners.
  59: KP.rightEyeOuter, // face 36
  62: KP.rightEyeInner, // face 39
  65: KP.leftEyeInner, // face 42
  68: KP.leftEyeOuter, // face 45
  71: KP.mouthRight, // face 48
  77: KP.mouthLeft, // face 54
  // Left hand (91–111): thumb tip, index and pinky knuckles (MCP).
  95: KP.leftThumb,
  96: KP.leftIndex,
  108: KP.leftPinky,
  // Right hand (112–132)
  116: KP.rightThumb,
  117: KP.rightIndex,
  129: KP.rightPinky,
};

/**
 * RTMW SimCC scores are lower than MediaPipe visibilities for the same
 * quality (clear joints score ~0.6–0.8). Rescale onto a visibility-like 0..1
 * range so the confidence model treats engines alike. To be refined on
 * validation data.
 */
export const rtmwVisibility = (score: number) => Math.max(0, Math.min(1, (score - 0.15) / 0.55));

/** Segment-length proportions of stature (Drillis & Contini), used to recover metric scale. */
const SEGMENTS: Array<[number, number, number]> = [
  // [from, to, fraction of stature] in COCO-WholeBody indices
  [15, 13, 0.246], // left shank
  [16, 14, 0.246],
  [13, 11, 0.245], // left thigh
  [14, 12, 0.245],
  [5, 7, 0.186], // left upper arm
  [6, 8, 0.186],
  [7, 9, 0.146], // left forearm
  [8, 10, 0.146],
];
const TRUNK_FRACTION = 0.288; // mid-hip to mid-shoulder

/**
 * RTMW3D returns x, y in image pixels and z as metric depth relative to the
 * body. Find the metres-per-pixel factor that makes the visible segments'
 * 3D lengths match a body of the given stature (least squares, golden-section
 * search), then build hip-centred metric coordinates.
 */
export function metresPerPixel(kp: number[][], vis: number[], statureM: number): number {
  type Seg = { dx: number; dy: number; dz: number; target: number; w: number };
  const segs: Seg[] = [];
  for (const [a, b, f] of SEGMENTS) {
    const w = Math.min(vis[a], vis[b]);
    if (w < 0.3) continue;
    segs.push({ dx: kp[b][0] - kp[a][0], dy: kp[b][1] - kp[a][1], dz: kp[b][2] - kp[a][2], target: f * statureM, w });
  }
  const mid = (i: number, j: number) => kp[i].map((v, k) => (v + kp[j][k]) / 2);
  const trunkW = Math.min(vis[5], vis[6], vis[11], vis[12]);
  if (trunkW >= 0.3) {
    const s = mid(5, 6),
      h = mid(11, 12);
    segs.push({ dx: s[0] - h[0], dy: s[1] - h[1], dz: s[2] - h[2], target: TRUNK_FRACTION * statureM, w: trunkW * 1.5 });
  }
  if (!segs.length) return NaN;
  const cost = (m: number) =>
    segs.reduce((acc, g) => acc + g.w * (Math.sqrt((g.dx * m) ** 2 + (g.dy * m) ** 2 + g.dz ** 2) - g.target) ** 2, 0);
  let lo = 1e-5,
    hi = 0.05;
  const phi = (Math.sqrt(5) - 1) / 2;
  let x1 = hi - phi * (hi - lo),
    x2 = lo + phi * (hi - lo);
  let f1 = cost(x1),
    f2 = cost(x2);
  for (let i = 0; i < 60; i++) {
    if (f1 < f2) {
      hi = x2;
      x2 = x1;
      f2 = f1;
      x1 = hi - phi * (hi - lo);
      f1 = cost(x1);
    } else {
      lo = x1;
      x1 = x2;
      f1 = f2;
      x2 = lo + phi * (hi - lo);
      f2 = cost(x2);
    }
  }
  return (lo + hi) / 2;
}

export interface MappedPose {
  image: Keypoint[];
  world: Keypoint[];
}

function fromTable(
  table: Record<number, number>,
  get: (src: number) => { x: number; y: number; z: number; v: number } | null,
): Keypoint[] {
  const out: Keypoint[] = Array.from({ length: NUM_KEYPOINTS }, () => ({ x: 0, y: 0, z: 0, v: 0 }));
  for (const [src, dst] of Object.entries(table)) {
    const p = get(Number(src));
    if (p) out[dst] = p;
  }
  return out;
}

function hipCentre(w: Keypoint[]) {
  const cx = (w[KP.leftHip].x + w[KP.rightHip].x) / 2;
  const cy = (w[KP.leftHip].y + w[KP.rightHip].y) / 2;
  const cz = (w[KP.leftHip].z + w[KP.rightHip].z) / 2;
  for (const p of w) {
    p.x -= cx;
    p.y -= cy;
    p.z -= cz;
  }
  return w;
}

/** RTMW3D (COCO-WholeBody, pixels + metric depth) → app skeleton. */
export function mapRtmw(kp: number[][], scores: number[], width: number, height: number, statureM = 1.7): MappedPose | null {
  if (kp.length < 133) return null;
  const vis = scores.map(rtmwVisibility);
  const m = metresPerPixel(kp, vis, statureM);
  if (!Number.isFinite(m)) return null;
  const image = fromTable(COCO_WB_TO_BP, (i) => ({ x: kp[i][0] / width, y: kp[i][1] / height, z: kp[i][2], v: vis[i] }));
  const world = hipCentre(fromTable(COCO_WB_TO_BP, (i) => ({ x: kp[i][0] * m, y: kp[i][1] * m, z: kp[i][2], v: vis[i] })));
  return { image, world };
}

export const INSTANTHMR_CONF = 0.85;
export const OFF_IMAGE_CONF = 0.4;

/**
 * InstantHMR / SAM 3D Body (MHR-70: metric camera frame, y down) → app
 * skeleton. Neither model scores keypoints; points that project outside the
 * frame are marked as guesses.
 */
export function mapMhr70(kp3: number[][], kp2: number[][], width: number, height: number, conf = INSTANTHMR_CONF): MappedPose | null {
  if (kp3.length < 70) return null;
  const inside = kp2.map(([u, v]) => u >= 0 && u < width && v >= 0 && v < height);
  const c = inside.map((ok) => (ok ? conf : OFF_IMAGE_CONF));
  const world = mapFrame("mhr70", kp3.map((p, i) => [p[0], p[1], p[2], c[i]]), 1, false, true);
  const image = mapFrame("mhr70", kp2.map((p, i) => [p[0] / width, p[1] / height, c[i]]), 1, false, false);
  if (!world || !image) return null;
  return { image, world: hipCentre(world) };
}
