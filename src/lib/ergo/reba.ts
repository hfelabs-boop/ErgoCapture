import { upperArmAngle, upperArmBase } from "./rula";
import type { Measures } from "./measures";
import type { RiskLevel, ScoreDetail } from "./risk";
import { effectiveLoad, type FrameContext, type TaskSettings } from "./settings";

/**
 * REBA — Rapid Entire Body Assessment (Hignett & McAtamney, 2000).
 */

// TABLE_A[trunk-1][neck-1][legs-1]
const TABLE_A: number[][][] = [
  [[1, 2, 3, 4], [1, 2, 3, 4], [3, 3, 5, 6]],
  [[2, 3, 4, 5], [3, 4, 5, 6], [4, 5, 6, 7]],
  [[2, 4, 5, 6], [4, 5, 6, 7], [5, 6, 7, 8]],
  [[3, 5, 6, 7], [5, 6, 7, 8], [6, 7, 8, 9]],
  [[4, 6, 7, 8], [6, 7, 8, 9], [7, 8, 9, 9]],
];

// TABLE_B[upperArm-1][lowerArm-1][wrist-1]
const TABLE_B: number[][][] = [
  [[1, 2, 2], [1, 2, 3]],
  [[1, 2, 3], [2, 3, 4]],
  [[3, 4, 5], [4, 5, 5]],
  [[4, 5, 5], [5, 6, 7]],
  [[6, 7, 8], [7, 8, 8]],
  [[7, 8, 8], [8, 9, 9]],
];

// TABLE_C[scoreA-1][scoreB-1]
const TABLE_C: number[][] = [
  [1, 1, 1, 2, 3, 3, 4, 5, 6, 7, 7, 7],
  [1, 2, 2, 3, 4, 4, 5, 6, 6, 7, 7, 8],
  [2, 3, 3, 3, 4, 5, 6, 7, 7, 8, 8, 8],
  [3, 4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9],
  [4, 4, 4, 5, 6, 7, 8, 8, 9, 9, 9, 9],
  [6, 6, 6, 7, 8, 8, 9, 9, 10, 10, 10, 10],
  [7, 7, 7, 8, 9, 9, 9, 10, 10, 11, 11, 11],
  [8, 8, 8, 9, 10, 10, 10, 10, 10, 11, 11, 11],
  [9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12, 12],
  [10, 10, 10, 11, 11, 11, 11, 12, 12, 12, 12, 12],
  [11, 11, 11, 11, 12, 12, 12, 12, 12, 12, 12, 12],
  [12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12],
];

const ci = (x: number, max: number) => Math.max(1, Math.min(max, Math.round(x)));

export function rebaTableA(trunk: number, neck: number, legs: number) {
  return TABLE_A[ci(trunk, 5) - 1][ci(neck, 3) - 1][ci(legs, 4) - 1];
}
export function rebaTableB(upperArm: number, lowerArm: number, wrist: number) {
  return TABLE_B[ci(upperArm, 6) - 1][ci(lowerArm, 2) - 1][ci(wrist, 3) - 1];
}
export function rebaTableC(a: number, b: number) {
  return TABLE_C[ci(a, 12) - 1][ci(b, 12) - 1];
}

export function rebaRisk(score: number): RiskLevel {
  return score <= 1 ? 0 : score <= 3 ? 1 : score <= 7 ? 2 : score <= 10 ? 3 : 4;
}

export const REBA_ACTION: Record<RiskLevel, string> = {
  0: "Negligible risk",
  1: "Low risk, change may be needed",
  2: "Medium risk, investigate and implement change soon",
  3: "High risk, investigate and implement change",
  4: "Very high risk, implement change now",
};

function rebaArm(m: Measures, s: TaskSettings, side: "L" | "R", d: string[]) {
  const S = side === "L" ? "Left" : "Right";
  const ua = upperArmAngle(m, side);
  let upperArm = upperArmBase(ua);
  if (upperArm >= 3) d.push(`${S} upper arm raised ${Math.round(ua)}°`);
  if (m[`shoulderAbd${side}`] > 30) upperArm += 1;
  if (m[`shoulderRaise${side}`] > 12) upperArm += 1;
  if (s.armsSupported) upperArm -= 1;
  const el = m[`elbowFlex${side}`];
  const lowerArm = el >= 60 && el <= 100 ? 1 : 2;
  const wf = m[`wristFlex${side}`];
  let wrist = wf <= 15 ? 1 : 2;
  if (wrist === 2) d.push(`${S} wrist bent ${Math.round(wf)}°`);
  if (m[`wristDev${side}`] > 20) wrist += 1;
  return { upperArm: ci(upperArm, 6), lowerArm, wrist: ci(wrist, 3) };
}

export function scoreReba(m: Measures, fc: FrameContext, s: TaskSettings): ScoreDetail {
  const d: string[] = [];
  // Neck
  const nf = m.neckFlex;
  // 5° tolerance around neutral so measurement noise does not read as extension.
  let neck = nf >= -5 && nf <= 20 ? 1 : 2;
  if (neck === 2) d.push(nf < 0 ? "Neck extended" : `Neck flexed ${Math.round(nf)}°`);
  if (m.neckTwist > 20 || m.neckSide > 10) {
    neck += 1;
    d.push("Neck twisted or side-bent");
  }
  // Trunk
  const tf = m.trunkFlex;
  let trunk: number;
  if (Math.abs(tf) <= 5) trunk = 1;
  else if (tf <= 20 && tf >= -20) trunk = 2;
  else if (tf < -20 || tf <= 60) trunk = 3;
  else trunk = 4;
  if (trunk >= 3) d.push(tf < 0 ? "Trunk extended" : `Trunk flexed ${Math.round(tf)}°`);
  if (m.trunkTwist > 20 || m.trunkSide > 10) {
    trunk += 1;
    d.push("Trunk twisted or side-bent");
  }
  // Legs
  let legs = fc.seated || m.footLift < 0.08 ? 1 : 2;
  if (!fc.seated) {
    const kf = Math.max(m.kneeFlexL, m.kneeFlexR);
    if (kf > 60) {
      legs += 2;
      d.push(`Knees bent ${Math.round(kf)}°`);
    } else if (kf >= 30) legs += 1;
  }
  const a = rebaTableA(trunk, neck, legs);
  const load = effectiveLoad(s, fc);
  let force = load > 10 ? 2 : load >= 5 ? 1 : 0;
  if (s.shockForce) force += 1;
  if (force >= 2) d.push(`Load ${load} kg`);
  const scoreA = a + force;

  const L = rebaArm(m, s, "L", []);
  const R = rebaArm(m, s, "R", []);
  const bL = rebaTableB(L.upperArm, L.lowerArm, L.wrist);
  const bR = rebaTableB(R.upperArm, R.lowerArm, R.wrist);
  const worstSide: "L" | "R" = bR >= bL ? "R" : "L";
  const W = worstSide === "R" ? R : L;
  rebaArm(m, s, worstSide, d);
  const coupling = { good: 0, fair: 1, poor: 2, unacceptable: 3 }[s.coupling];
  const scoreB = Math.max(bL, bR) + (load > 0 ? coupling : 0);
  const c = rebaTableC(scoreA, scoreB);
  let activity = 0;
  if (fc.staticHold) activity += 1;
  if (fc.repetitive) activity += 1;
  if (fc.rapidChange) activity += 1;
  if (activity) d.push("Static, repetitive or rapidly changing activity");
  const score = c + activity;
  const risk = rebaRisk(score);
  return {
    score,
    risk,
    label: REBA_ACTION[risk],
    parts: {
      trunk,
      neck,
      legs,
      upperArm: W.upperArm,
      lowerArm: W.lowerArm,
      wrist: W.wrist,
      tableA: a,
      scoreA,
      tableB: Math.max(bL, bR),
      scoreB,
      tableC: c,
      activity,
      force,
      coupling,
    },
    drivers: d,
  };
}
