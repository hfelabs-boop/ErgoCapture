import type { FrameMeasures } from "./measures";
import type { RiskLevel } from "./risk";
import type { TaskSettings } from "./settings";
import { handMovementsPerMin, type CycleResult } from "./temporal";

/** Strain Index (Moore & Garg, 1995) and OCRA Checklist (Colombini, 2002) for repetitive hand/arm work. */

const pct = (xs: number[], p: number) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN;
};

export interface StrainIndexSide {
  side: "L" | "R";
  ratings: { intensity: number; duration: number; efforts: number; posture: number; speed: number; perDay: number };
  multipliers: { IE: number; DE: number; EM: number; HWP: number; SW: number; DD: number };
  inputs: { dutyCyclePct: number; effortsPerMin: number; wristFlexP75: number; wristDevP75: number };
  si: number;
  risk: RiskLevel;
  label: string;
}

export function siRisk(si: number): RiskLevel {
  return si <= 3 ? 0 : si < 7 ? 2 : si < 13 ? 3 : 4;
}

export function strainIndex(ms: FrameMeasures[], fps: number, cycles: CycleResult[], s: TaskSettings, side: "L" | "R"): StrainIndexSide {
  const valid = ms.filter((f) => f.valid);
  const effortsCycle = cycles.find((c) => c.key === `wristFlex${side}`)?.perMin ?? 0;
  const elbowCycle = cycles.find((c) => c.key === `elbowFlex${side}`)?.perMin ?? 0;
  const effortsPerMin = Math.max(effortsCycle, elbowCycle, handMovementsPerMin(ms, fps, side) * 0.5);
  // Duty cycle proxy: hand is actively working (lifted from the relaxed hanging position).
  const active = valid.filter((f) => f.m[`shoulderElev${side}`] > 20 || f.m[`elbowFlex${side}`] > 45).length;
  const duty = valid.length ? (active / valid.length) * 100 : 0;
  const wf = pct(valid.map((f) => f.m[`wristFlex${side}`]), 0.75);
  const wd = pct(valid.map((f) => f.m[`wristDev${side}`]), 0.75);

  const IE = [1, 3, 6, 9, 13][s.siIntensity - 1];
  const dRating = duty < 10 ? 1 : duty < 30 ? 2 : duty < 50 ? 3 : duty < 80 ? 4 : 5;
  const DE = [0.5, 1, 1.5, 2, 3][dRating - 1];
  const eRating = effortsPerMin < 4 ? 1 : effortsPerMin < 9 ? 2 : effortsPerMin < 15 ? 3 : effortsPerMin < 20 ? 4 : 5;
  const EM = [0.5, 1, 1.5, 2, 3][eRating - 1];
  // Posture rating from the 75th-percentile wrist angles (flexion bands per Moore & Garg).
  const flexRating = wf <= 5 ? 1 : wf <= 15 ? 2 : wf <= 30 ? 3 : wf <= 50 ? 4 : 5;
  const devRating = wd <= 10 ? 1 : wd <= 15 ? 2 : wd <= 20 ? 3 : wd <= 25 ? 4 : 5;
  const pRating = Math.max(flexRating, devRating);
  const HWP = [1, 1, 1.5, 2, 3][pRating - 1];
  const SW = [1, 1, 1, 1.5, 2][s.siSpeed - 1];
  const h = s.taskHoursPerDay;
  const ddRating = h <= 1 ? 1 : h <= 2 ? 2 : h <= 4 ? 3 : h <= 8 ? 4 : 5;
  const DD = [0.25, 0.5, 0.75, 1, 1.5][ddRating - 1];
  const si = IE * DE * EM * HWP * SW * DD;
  const risk = siRisk(si);
  return {
    side,
    ratings: { intensity: s.siIntensity, duration: dRating, efforts: eRating, posture: pRating, speed: s.siSpeed, perDay: ddRating },
    multipliers: { IE, DE, EM, HWP, SW, DD },
    inputs: { dutyCyclePct: duty, effortsPerMin, wristFlexP75: wf, wristDevP75: wd },
    si,
    risk,
    label: si <= 3 ? "Probably safe" : si < 7 ? "Uncertain" : "Probably hazardous",
  };
}

export interface OcraSide {
  side: "L" | "R";
  actionsPerMin: number;
  factors: { recovery: number; frequency: number; force: number; posture: number; additional: number };
  posture: { shoulder: number; elbow: number; wrist: number; grip: number; stereotypy: number };
  durationMultiplier: number;
  score: number;
  risk: RiskLevel;
  label: string;
}

export function ocraFrequencyScore(apm: number) {
  if (apm <= 20) return 0;
  if (apm <= 30) return 1;
  if (apm <= 40) return 3;
  if (apm <= 50) return 6;
  if (apm <= 60) return 8;
  if (apm <= 70) return 9;
  return 10;
}

export function ocraDurationMultiplier(minutes: number) {
  if (minutes < 120) return 0.5;
  if (minutes <= 180) return 0.65;
  if (minutes <= 240) return 0.75;
  if (minutes <= 300) return 0.85;
  if (minutes <= 360) return 0.925;
  if (minutes <= 420) return 0.95;
  if (minutes <= 480) return 1;
  if (minutes <= 540) return 1.2;
  if (minutes <= 600) return 1.5;
  return 2;
}

export function ocraRisk(score: number): { risk: RiskLevel; label: string } {
  if (score <= 7.5) return { risk: 0, label: "Acceptable" };
  if (score <= 11) return { risk: 1, label: "Borderline / very low risk" };
  if (score <= 14) return { risk: 2, label: "Low risk" };
  if (score <= 22.5) return { risk: 3, label: "Medium risk" };
  return { risk: 4, label: "High risk" };
}

/** Fraction-of-time → OCRA checklist posture points (≈1/3, >1/2, almost all). */
function timeScore(frac: number, pts: [number, number, number]) {
  return frac >= 0.8 ? pts[2] : frac >= 0.5 ? pts[1] : frac >= 0.25 ? pts[0] : 0;
}

export function ocraChecklist(ms: FrameMeasures[], fps: number, cycles: CycleResult[], s: TaskSettings, side: "L" | "R"): OcraSide {
  const valid = ms.filter((f) => f.valid);
  const n = Math.max(1, valid.length);
  const cyc = cycles.filter((c) => c.key.endsWith(side) && c.cycles > 0);
  const cycleTime = cyc.length ? Math.min(...cyc.map((c) => c.cycleTime).filter(Number.isFinite)) : NaN;
  const actionsPerMin =
    s.ocraActionsPerCycle > 0 && Number.isFinite(cycleTime)
      ? (60 / cycleTime) * s.ocraActionsPerCycle
      : handMovementsPerMin(ms, fps, side);
  const shoulderFrac = valid.filter((f) => f.m[`shoulderElev${side}`] >= 80).length / n;
  let elbowFast = 0;
  for (let i = 1; i < valid.length; i++) {
    const dt = valid[i].t - valid[i - 1].t || 1 / fps;
    if (Math.abs(valid[i].m[`elbowFlex${side}`] - valid[i - 1].m[`elbowFlex${side}`]) / dt > 90) elbowFast++;
  }
  const elbowFrac = elbowFast / n;
  const wristFrac = valid.filter((f) => f.m[`wristFlex${side}`] > 45 || f.m[`wristDev${side}`] > 20).length / n;
  const shoulder = shoulderFrac >= 0.8 ? 12 : shoulderFrac >= 0.5 ? 6 : shoulderFrac >= 0.25 ? 2 : shoulderFrac >= 0.1 ? 1 : 0;
  const elbow = timeScore(elbowFrac * 3, [2, 4, 8]);
  const wrist = timeScore(wristFrac, [2, 4, 8]);
  const stereotypy = Number.isFinite(cycleTime) ? (cycleTime < 8 ? 3 : cycleTime < 15 ? 1.5 : 0) : 0;
  const postureScore = Math.max(shoulder, elbow, wrist, s.ocraGrip) + stereotypy;
  const frequency = ocraFrequencyScore(actionsPerMin);
  const factors = {
    recovery: s.ocraRecovery,
    frequency,
    force: s.ocraForce,
    posture: postureScore,
    additional: s.ocraAdditional,
  };
  const durationMultiplier = ocraDurationMultiplier(s.taskHoursPerDay * 60);
  const score = (factors.recovery + factors.frequency + factors.force + factors.posture + factors.additional) * durationMultiplier;
  const r = ocraRisk(score);
  return {
    side,
    actionsPerMin,
    factors,
    posture: { shoulder, elbow, wrist, grip: s.ocraGrip, stereotypy },
    durationMultiplier,
    score,
    ...r,
  };
}
