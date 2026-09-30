"use client";

import { segmentRisk, type SegmentExposure } from "./ergo/exposure";
import type { FrameMeasures } from "./ergo/measures";
import { RISK_COLORS, type RiskLevel } from "./ergo/risk";
import { KP, SKELETON_EDGES, type Keypoint, type SegmentKey } from "./pose/types";

/** Canvas drawing shared by live overlay, review player and report images. */

export interface DrawOptions {
  blurFaces: boolean;
  skeletonOnly: boolean;
  lineWidth?: number;
}

export function blurFace(ctx: CanvasRenderingContext2D, src: CanvasImageSource, kps: Keypoint[], w: number, h: number) {
  const head = [KP.nose, KP.leftEye, KP.rightEye, KP.leftEar, KP.rightEar, KP.mouthLeft, KP.mouthRight].map((i) => kps[i]);
  const vis = head.filter((k) => k.v > 0.2);
  if (!vis.length) return;
  const xs = vis.map((k) => k.x * w);
  const ys = vis.map((k) => k.y * h);
  const shoulderW = Math.abs(kps[KP.leftShoulder].x - kps[KP.rightShoulder].x) * w;
  const size = Math.max(Math.max(...xs) - Math.min(...xs), shoulderW * 0.55, 24) * 1.7;
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, size / 2, size * 0.62, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.filter = `blur(${Math.max(8, size / 6)}px)`;
  ctx.drawImage(src, 0, 0, w, h);
  ctx.filter = "none";
  ctx.fillStyle = "rgba(120,120,120,0.35)";
  ctx.fill();
  ctx.restore();
}

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  kps: Keypoint[],
  w: number,
  h: number,
  risk?: Record<SegmentKey, RiskLevel>,
  lineWidth = Math.max(2, w / 250),
) {
  ctx.save();
  ctx.lineCap = "round";
  for (const [a, b, seg] of SKELETON_EDGES) {
    const A = kps[a],
      B = kps[b];
    if (A.v < 0.2 || B.v < 0.2) continue;
    ctx.strokeStyle = risk ? RISK_COLORS[risk[seg]] : "#38bdf8";
    ctx.globalAlpha = Math.max(0.35, Math.min(A.v, B.v));
    ctx.lineWidth = seg === "neck" ? lineWidth * 0.6 : lineWidth;
    ctx.beginPath();
    ctx.moveTo(A.x * w, A.y * h);
    ctx.lineTo(B.x * w, B.y * h);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const i of [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
    const k = kps[i];
    if (k.v < 0.2) continue;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(k.x * w, k.y * h, lineWidth * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Draw one analysed frame (video frame optional) with a risk-coloured skeleton. */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource | null,
  kps: Keypoint[] | null,
  fm: FrameMeasures | null,
  w: number,
  h: number,
  opts: DrawOptions,
) {
  if (src && !opts.skeletonOnly) {
    ctx.drawImage(src, 0, 0, w, h);
    if (opts.blurFaces && kps) blurFace(ctx, src, kps, w, h);
  } else {
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, w, h);
  }
  if (kps) drawSkeleton(ctx, kps, w, h, fm && fm.valid ? segmentRisk(fm) : undefined, opts.lineWidth);
}

/** Body heatmap geometry: capsules on a 200 × 420 front-view canvas. */
export const BODY_SHAPES: Array<{ seg: SegmentKey; x1: number; y1: number; x2: number; y2: number; r: number }> = [
  { seg: "neck", x1: 100, y1: 30, x2: 100, y2: 78, r: 24 },
  { seg: "trunk", x1: 100, y1: 105, x2: 100, y2: 215, r: 40 },
  { seg: "upperArmR", x1: 55, y1: 105, x2: 42, y2: 180, r: 13 },
  { seg: "upperArmL", x1: 145, y1: 105, x2: 158, y2: 180, r: 13 },
  { seg: "lowerArmR", x1: 42, y1: 185, x2: 34, y2: 250, r: 11 },
  { seg: "lowerArmL", x1: 158, y1: 185, x2: 166, y2: 250, r: 11 },
  { seg: "wristR", x1: 33, y1: 258, x2: 30, y2: 282, r: 10 },
  { seg: "wristL", x1: 167, y1: 258, x2: 170, y2: 282, r: 10 },
  { seg: "legR", x1: 80, y1: 245, x2: 74, y2: 400, r: 17 },
  { seg: "legL", x1: 120, y1: 245, x2: 126, y2: 400, r: 17 },
];

/** Colour for a time-weighted exposure: fraction of time at medium-or-worse risk. */
export function exposureColor(pctElevated: number, pctHigh: number): string {
  const r: RiskLevel = pctHigh > 30 ? 4 : pctHigh > 10 ? 3 : pctElevated > 25 ? 2 : pctElevated > 5 ? 1 : 0;
  return RISK_COLORS[r];
}

export function drawBodyHeatmap(ctx: CanvasRenderingContext2D, exposure: SegmentExposure[], scale = 1) {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 200, 420);
  ctx.lineCap = "round";
  for (const s of BODY_SHAPES) {
    const e = exposure.find((x) => x.segment === s.seg);
    ctx.strokeStyle = e ? exposureColor(e.pctElevated, e.pctHigh) : "#cbd5e1";
    ctx.lineWidth = s.r * 2;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Line chart of a score over time with risk-coloured background bands (for reports). */
export function drawScoreChart(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number[],
  y: number[],
  conf: number[],
  yMax: number,
  riskOf: (v: number) => RiskLevel,
  title: string,
) {
  const padL = 36,
    padB = 22,
    padT = 20;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  const X = (ti: number) => padL + ((ti - t[0]) / Math.max(1e-6, t[t.length - 1] - t[0])) * (w - padL - 8);
  const Y = (v: number) => padT + (1 - v / yMax) * (h - padT - padB);
  for (let v = 1; v <= yMax; v++) {
    ctx.fillStyle = RISK_COLORS[riskOf(v)] + "22";
    ctx.fillRect(padL, Y(v), w - padL - 8, Y(v - 1) - Y(v));
  }
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 1;
  ctx.strokeRect(padL, padT, w - padL - 8, h - padT - padB);
  ctx.fillStyle = "#334155";
  ctx.font = "11px sans-serif";
  ctx.fillText(title, padL, 13);
  for (let v = 0; v <= yMax; v += yMax > 8 ? 3 : 1) ctx.fillText(String(v), 8, Y(v) + 4);
  const dur = t[t.length - 1] - t[0];
  const step = dur > 600 ? 120 : dur > 120 ? 30 : dur > 30 ? 10 : 5;
  for (let s = 0; s <= dur; s += step) ctx.fillText(`${Math.round(s)}s`, X(t[0] + s) - 8, h - 6);
  for (let i = 1; i < t.length; i++) {
    if (!Number.isFinite(y[i]) || !Number.isFinite(y[i - 1]) || y[i] === 0) continue;
    ctx.strokeStyle = RISK_COLORS[riskOf(y[i])];
    ctx.globalAlpha = 0.35 + 0.65 * (conf[i] ?? 1);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(X(t[i - 1]), Y(y[i - 1]));
    ctx.lineTo(X(t[i]), Y(y[i]));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
