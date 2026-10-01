import { fillGaps, smoothTrack } from "../pose/filters";
import type { PoseFrame, PoseTrack } from "../pose/types";
import { scoreWithConfidence, type Scorer } from "./confidence";
import { segmentExposure, timeInPosture, type SegmentExposure, type TimeInPosture } from "./exposure";
import {
  addLocomotion,
  computeFrameMeasures,
  emptyMeasures,
  estimateStature,
  MEASURE_DEFS,
  MEASURE_KEYS,
  type Calibration,
  type FrameMeasures,
} from "./measures";
import { analyzeNiosh, type NioshResult } from "./niosh";
import { scoreOwas } from "./owas";
import { ocraChecklist, strainIndex, type OcraSide, type StrainIndexSide } from "./repetitive";
import { analyzeReach, estimateAnthropometry, workstationFit, type Anthropometry, type ReachResult, type WorkstationFit } from "./reach";
import { rebaRisk, scoreReba } from "./reba";
import { recommendations } from "./recommendations";
import { confidenceLevel, type ConfidenceLevel, type RiskLevel, type ScoredFrame } from "./risk";
import { rulaRisk, scoreRula } from "./rula";
import type { FrameContext, TaskSettings } from "./settings";
import { analyzeStatic, type StaticResult } from "./staticPosture";
import {
  frameContexts,
  repetitionAnalysis,
  segmentActivities,
  type ActivitySegment,
  type CycleResult,
} from "./temporal";

export interface ScoreSummary {
  max: number;
  mean: number;
  median: number;
  p90: number;
  /** Percent of valid time per score value */
  pctByScore: Record<number, number>;
  pctByRisk: Record<RiskLevel, number>;
  meanConf: number;
  confLevel: ConfidenceLevel;
  /** Frame indices of distinct worst moments */
  worstFrames: number[];
  /** Score that is exceeded only 10% of the time, with its confidence */
  representative: number;
  representativeConf: number;
}

export interface ViewQuality {
  viewId: string;
  label: string;
  source: string;
  coveragePct: number;
  meanVisibility: number;
  meanYaw: number;
  scale: number;
}

export interface SessionAnalysis {
  version: 1;
  createdAt: string;
  fps: number;
  duration: number;
  views: ViewQuality[];
  frames: FrameMeasures[];
  contexts: FrameContext[];
  rula: ScoredFrame[];
  reba: ScoredFrame[];
  owas: ScoredFrame[];
  summary: { rula: ScoreSummary; reba: ScoreSummary; owas: ScoreSummary };
  owasDist: { back: number[]; arms: number[]; legs: number[]; load: number[]; ac: number[] };
  niosh: NioshResult;
  strainIndex: StrainIndexSide[];
  ocra: OcraSide[];
  staticPosture: StaticResult;
  reach: ReachResult;
  anthropometry: Anthropometry;
  workstation: WorkstationFit[];
  cycles: CycleResult[];
  activities: ActivitySegment[];
  timeInPosture: TimeInPosture[];
  exposure: SegmentExposure[];
  dataQuality: { validPct: number; interpolatedPct: number; notes: string[] };
  recommendations: string[];
  overall: { risk: RiskLevel; headline: string };
  settings: TaskSettings;
}

export interface AnalyzeInput {
  tracks: PoseTrack[];
  settings: TaskSettings;
  calib?: Calibration;
  /** Skip offline smoothing (e.g. data was already smoothed by the server tier) */
  skipSmoothing?: boolean;
}

/** Prepare one view: gap filling, smoothing, scale, per-frame measures. */
export function processView(track: PoseTrack, settings: TaskSettings, calib: Calibration, skipSmoothing = false) {
  let frames: PoseFrame[] = fillGaps(track.frames);
  if (!skipSmoothing) frames = smoothTrack(frames);
  const modelStature = estimateStature(frames);
  const scale = settings.subjectHeightCm > 0 && modelStature > 0 ? settings.subjectHeightCm / 100 / modelStature : 1;
  const ms = frames.map((f) => computeFrameMeasures(f, { scale, calib, detailedHands: track.detailedHands }));
  addLocomotion(frames, ms);
  return { frames, ms, scale, modelStature };
}

/**
 * Multi-view fusion at the joint-angle level: confidence-weighted average per
 * measure. Views that disagree reduce the fused confidence. (Full multi-view
 * triangulation with calibrated cameras belongs to the server tier; its 3D
 * output can be imported directly as a single "view".)
 */
export function fuseViews(views: FrameMeasures[][], fps: number): FrameMeasures[] {
  if (views.length === 1) return views[0];
  const starts = views.map((v) => v[0]?.t ?? 0);
  const ends = views.map((v) => v[v.length - 1]?.t ?? 0);
  const t0 = Math.min(...starts);
  const t1 = Math.max(...ends);
  const n = Math.max(0, Math.round((t1 - t0) * fps) + 1);
  const out: FrameMeasures[] = [];
  for (let i = 0; i < n; i++) {
    const t = t0 + i / fps;
    const samples = views
      .map((v, vi) => v[Math.round((t - starts[vi]) * fps)])
      .filter((f): f is FrameMeasures => !!f && f.valid && Math.abs(f.t - t) <= 0.75 / fps);
    if (!samples.length) {
      out.push({ t, valid: false, interpolated: false, viewYaw: NaN, m: emptyMeasures(), c: emptyMeasures(0) });
      continue;
    }
    const m = emptyMeasures();
    const c = emptyMeasures(0);
    for (const def of MEASURE_DEFS) {
      const k = def.key;
      let sw = 0,
        sx = 0;
      for (const s of samples) {
        if (!Number.isFinite(s.m[k])) continue;
        const w = Math.max(1e-3, s.c[k]) ** 2;
        sw += w;
        sx += w * s.m[k];
      }
      if (sw === 0) continue;
      const mean = sx / sw;
      let sv = 0;
      for (const s of samples) if (Number.isFinite(s.m[k])) sv += Math.max(1e-3, s.c[k]) ** 2 * (s.m[k] - mean) ** 2;
      const sd = Math.sqrt(sv / sw);
      const tol = def.unit === "°" ? 15 : def.unit === "m" ? 0.1 : def.unit === "%" ? 10 : 0.15;
      const agreement = Math.exp(-((sd / tol) ** 2));
      const combined = 1 - samples.reduce((p, s) => p * (1 - Math.min(0.99, s.c[k])), 1);
      m[k] = mean;
      c[k] = Math.min(1, combined * agreement);
    }
    out.push({
      t,
      valid: true,
      interpolated: samples.every((s) => s.interpolated),
      viewYaw: samples[0].viewYaw,
      m,
      c,
    });
  }
  return out;
}

function summarize(scores: ScoredFrame[], frames: FrameMeasures[], possible: number[], minGapSec = 2): ScoreSummary {
  const idx = scores.map((_, i) => i).filter((i) => frames[i].valid);
  const vals = idx.map((i) => scores[i].score);
  const n = Math.max(1, vals.length);
  const sorted = [...vals].sort((a, b) => a - b);
  const pctByScore: Record<number, number> = {};
  for (const p of possible) pctByScore[p] = 0;
  for (const v of vals) pctByScore[v] = (pctByScore[v] ?? 0) + 100 / n;
  const pctByRisk = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 } as Record<RiskLevel, number>;
  for (const i of idx) pctByRisk[scores[i].risk] += 100 / n;
  const meanConf = idx.reduce((a, i) => a + scores[i].conf, 0) / n;
  // Worst distinct moments: highest score, then highest confidence.
  const ranked = [...idx].sort((a, b) => scores[b].score - scores[a].score || scores[b].conf - scores[a].conf);
  const worst: number[] = [];
  for (const i of ranked) {
    if (worst.length >= 6) break;
    if (worst.every((j) => Math.abs(frames[j].t - frames[i].t) >= minGapSec)) worst.push(i);
  }
  const p90 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(0.9 * sorted.length))] : 0;
  const repIdx = idx.filter((i) => scores[i].score === p90);
  const representativeConf = repIdx.length ? repIdx.reduce((a, i) => a + scores[i].conf, 0) / repIdx.length : 0;
  return {
    max: sorted.length ? sorted[sorted.length - 1] : 0,
    mean: vals.reduce((a, b) => a + b, 0) / n,
    median: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0,
    p90,
    pctByScore,
    pctByRisk,
    meanConf,
    confLevel: confidenceLevel(meanConf),
    worstFrames: worst,
    representative: p90,
    representativeConf,
  };
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export function analyzeSession(input: AnalyzeInput): SessionAnalysis {
  const { settings } = input;
  const calib = input.calib ?? {};
  const fps = input.tracks[0]?.fps ?? 10;
  const processed = input.tracks.map((tr) => processView(tr, settings, calib, input.skipSmoothing));
  const frames = fuseViews(
    processed.map((p) => p.ms),
    fps,
  );
  const views: ViewQuality[] = input.tracks.map((tr, i) => {
    const ms = processed[i].ms;
    const valid = ms.filter((f) => f.valid);
    const vis = processed[i].frames
      .filter((f) => f.world)
      .map((f) => f.world!.reduce((a, k) => a + k.v, 0) / f.world!.length);
    return {
      viewId: tr.viewId,
      label: tr.viewLabel,
      source: tr.source ?? "MediaPipe Pose",
      coveragePct: ms.length ? (valid.length / ms.length) * 100 : 0,
      meanVisibility: vis.length ? vis.reduce((a, b) => a + b, 0) / vis.length : 0,
      meanYaw: valid.length ? valid.reduce((a, f) => a + f.viewYaw, 0) / valid.length : NaN,
      scale: processed[i].scale,
    };
  });

  const cycles = repetitionAnalysis(frames, fps);
  const contexts = frameContexts(frames, fps, settings, cycles);
  const samples = frames.length > 6000 ? 10 : frames.length > 2000 ? 16 : 24;
  const run = (scorer: Scorer, seed: number) =>
    frames.map((f, i) =>
      f.valid
        ? scoreWithConfidence(scorer, f.m, f.c, contexts[i], settings, samples, seed + i)
        : { score: 0, risk: 0 as RiskLevel, label: "No person detected", parts: {}, drivers: [], conf: 0, stability: 0 },
    );
  const rula = run(scoreRula, 11);
  const reba = run(scoreReba, 23);
  const owas = run(scoreOwas, 37);

  const owasDist = { back: [0, 0, 0, 0], arms: [0, 0, 0], legs: [0, 0, 0, 0, 0, 0, 0], load: [0, 0, 0], ac: [0, 0, 0, 0] };
  const nValid = Math.max(1, frames.filter((f) => f.valid).length);
  owas.forEach((o, i) => {
    if (!frames[i].valid) return;
    owasDist.back[o.parts.back - 1] += 100 / nValid;
    owasDist.arms[o.parts.arms - 1] += 100 / nValid;
    owasDist.legs[o.parts.legs - 1] += 100 / nValid;
    owasDist.load[o.parts.load - 1] += 100 / nValid;
    owasDist.ac[o.score - 1] += 100 / nValid;
  });

  const niosh = analyzeNiosh(frames, fps, settings);
  const activities = segmentActivities(
    frames,
    contexts,
    niosh.lifts.map((l) => ({ start: l.start, end: l.end, kind: l.kind })),
  );
  const primary = processed[0];
  const anthropometry = estimateAnthropometry(primary.frames, primary.scale, settings.subjectHeightCm, primary.modelStature);
  const reach = analyzeReach(frames, anthropometry);
  const staticPosture = analyzeStatic(frames, settings);
  const strain = (["L", "R"] as const).map((s) => strainIndex(frames, fps, cycles, settings, s));
  const ocra = (["L", "R"] as const).map((s) => ocraChecklist(frames, fps, cycles, settings, s));

  const validPct = frames.length ? (nValid / frames.length) * 100 : 0;
  const interpolatedPct = frames.length ? (frames.filter((f) => f.interpolated).length / frames.length) * 100 : 0;
  const notes: string[] = [];
  if (validPct < 80) notes.push(`The worker was detected in only ${validPct.toFixed(0)}% of frames; scores cover the visible portion.`);
  if (interpolatedPct > 10) notes.push(`${interpolatedPct.toFixed(0)}% of frames were gap-filled after short occlusions.`);
  if (settings.subjectHeightCm <= 0)
    notes.push("Subject height not entered: distances (NIOSH H/V, reach, anthropometry) use the model's scale estimate.");
  if (input.tracks.length === 1) {
    const yaw = views[0].meanYaw;
    if (Number.isFinite(yaw) && yaw < 30)
      notes.push("Single camera mostly facing the worker: forward bending angles rely on depth estimation (lower confidence). A side view or a second camera improves accuracy.");
    if (Number.isFinite(yaw) && yaw > 60)
      notes.push("Single side-on camera: side bending, twisting and the far-side arm are less reliable. A second camera at ~90° improves accuracy.");
  }
  if (!calib.up) notes.push("No neutral-posture calibration: vertical is assumed from the camera's orientation. Keep the camera level.");
  if (!input.tracks.every((t) => t.detailedHands))
    notes.push("Wrist angles come from coarse hand keypoints; treat wrist sub-scores as indicative.");

  const summary = {
    rula: summarize(rula, frames, range(1, 7)),
    reba: summarize(reba, frames, range(1, 15)),
    owas: summarize(owas, frames, range(1, 4)),
  };

  const partial: Omit<SessionAnalysis, "recommendations" | "overall"> = {
    version: 1,
    createdAt: new Date().toISOString(),
    fps,
    duration: frames.length ? frames[frames.length - 1].t - frames[0].t : 0,
    views,
    frames,
    contexts,
    rula,
    reba,
    owas,
    summary,
    owasDist,
    niosh,
    strainIndex: strain,
    ocra,
    staticPosture,
    reach,
    anthropometry,
    workstation: workstationFit(anthropometry, settings),
    cycles,
    activities,
    timeInPosture: timeInPosture(frames, fps),
    exposure: segmentExposure(frames),
    dataQuality: { validPct, interpolatedPct, notes },
    settings,
  };
  const recs = recommendations(partial);
  const overallRisk = Math.max(
    rulaRisk(summary.rula.p90),
    rebaRisk(summary.reba.p90),
    niosh.risk,
    ...strain.map((x) => x.risk),
    ...ocra.map((o) => o.risk),
  ) as RiskLevel;
  const headline = `REBA peak ${summary.reba.max} (typical high ${summary.reba.p90}), RULA peak ${summary.rula.max} (typical high ${summary.rula.p90})`;
  return { ...partial, recommendations: recs, overall: { risk: overallRisk, headline } };
}

export { MEASURE_KEYS };
