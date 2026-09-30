import type { Measures } from "./measures";
import type { RiskLevel, ScoreDetail } from "./risk";
import { effectiveLoad, type FrameContext, type TaskSettings } from "./settings";

/**
 * RULA — Rapid Upper Limb Assessment (McAtamney & Corlett, 1993).
 * Each side is scored separately and the worse side is reported.
 */

// TABLE_A[upperArm-1][lowerArm-1][wrist-1][wristTwist-1]
const TABLE_A: number[][][][] = [
  [[[1, 2], [2, 2], [2, 3], [3, 3]], [[2, 2], [2, 2], [3, 3], [3, 3]], [[2, 3], [3, 3], [3, 3], [4, 4]]],
  [[[2, 3], [3, 3], [3, 4], [4, 4]], [[3, 3], [3, 3], [3, 4], [4, 4]], [[3, 4], [4, 4], [4, 4], [5, 5]]],
  [[[3, 3], [4, 4], [4, 4], [5, 5]], [[3, 4], [4, 4], [4, 4], [5, 5]], [[4, 4], [4, 4], [4, 5], [5, 5]]],
  [[[4, 4], [4, 4], [4, 5], [5, 5]], [[4, 4], [4, 4], [4, 5], [5, 5]], [[4, 4], [4, 5], [5, 5], [6, 6]]],
  [[[5, 5], [5, 5], [5, 6], [6, 7]], [[5, 6], [6, 6], [6, 7], [7, 7]], [[6, 6], [6, 7], [7, 7], [7, 8]]],
  [[[7, 7], [7, 7], [7, 8], [8, 9]], [[8, 8], [8, 8], [8, 9], [9, 9]], [[9, 9], [9, 9], [9, 9], [9, 9]]],
];

// TABLE_B[neck-1][trunk-1][legs-1]
const TABLE_B: number[][][] = [
  [[1, 3], [2, 3], [3, 4], [5, 5], [6, 6], [7, 7]],
  [[2, 3], [2, 3], [4, 5], [5, 5], [6, 7], [7, 7]],
  [[3, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 7]],
  [[5, 5], [5, 6], [6, 7], [7, 7], [7, 7], [8, 8]],
  [[7, 7], [7, 7], [7, 8], [8, 8], [8, 8], [8, 8]],
  [[8, 8], [8, 8], [8, 8], [8, 9], [9, 9], [9, 9]],
];

// TABLE_C[min(scoreC,8)-1][min(scoreD,7)-1]
const TABLE_C: number[][] = [
  [1, 2, 3, 3, 4, 5, 5],
  [2, 2, 3, 4, 4, 5, 5],
  [3, 3, 3, 4, 4, 5, 6],
  [3, 3, 3, 4, 5, 6, 6],
  [4, 4, 4, 5, 6, 7, 7],
  [4, 4, 5, 6, 6, 7, 7],
  [5, 5, 6, 6, 7, 7, 7],
  [5, 5, 6, 7, 7, 7, 7],
];

export const RULA_THRESHOLDS = {
  abducted: 30,
  wristNeutral: 5,
  wristDeviation: 20,
  neckTwist: 20,
  neckSide: 10,
  trunkTwist: 20,
  trunkSide: 10,
  shrugPct: 12,
  crossMidline: -0.03,
  outToSide: 0.42,
  footLift: 0.08,
};
const T = RULA_THRESHOLDS;

const clampIdx = (x: number, max: number) => Math.max(1, Math.min(max, Math.round(x)));

/** Signed upper arm angle for RULA/REBA: extension negative, otherwise overall elevation. */
export function upperArmAngle(m: Measures, side: "L" | "R") {
  const flex = m[`shoulderFlex${side}`];
  const elev = m[`shoulderElev${side}`];
  const abd = m[`shoulderAbd${side}`];
  if (flex < 0 && abd < T.abducted) return -elev;
  return elev;
}

export function upperArmBase(angle: number): number {
  if (angle < -20) return 2;
  if (angle <= 20) return 1;
  if (angle <= 45) return 2;
  if (angle <= 90) return 3;
  return 4;
}

export function rulaSide(m: Measures, fc: FrameContext, s: TaskSettings, side: "L" | "R") {
  const d: string[] = [];
  const S = side === "L" ? "Left" : "Right";
  const ua = upperArmAngle(m, side);
  let upperArm = upperArmBase(ua);
  if (upperArm >= 3) d.push(`${S} upper arm raised ${Math.round(ua)}°`);
  if (ua < -20) d.push(`${S} upper arm extended`);
  if (m[`shoulderAbd${side}`] > T.abducted) {
    upperArm += 1;
    d.push(`${S} arm abducted`);
  }
  if (m[`shoulderRaise${side}`] > T.shrugPct) {
    upperArm += 1;
    d.push(`${S} shoulder raised`);
  }
  if (s.armsSupported) upperArm -= 1;
  upperArm = clampIdx(upperArm, 6);

  const el = m[`elbowFlex${side}`];
  let lowerArm = el >= 60 && el <= 100 ? 1 : 2;
  const lat = m[`wristMidline${side}`];
  if (lat < T.crossMidline || lat > T.outToSide) {
    lowerArm += 1;
    d.push(`${S} hand working across midline or out to the side`);
  }
  lowerArm = clampIdx(lowerArm, 3);

  const wf = m[`wristFlex${side}`];
  let wrist = wf <= T.wristNeutral ? 1 : wf <= 15 ? 2 : 3;
  if (wrist === 3) d.push(`${S} wrist bent ${Math.round(wf)}°`);
  if (m[`wristDev${side}`] > T.wristDeviation) {
    wrist += 1;
    d.push(`${S} wrist deviated`);
  }
  wrist = clampIdx(wrist, 4);
  const wristTwist = 1; // forearm rotation is not observable from body keypoints; assume mid-range

  const postureA = TABLE_A[upperArm - 1][lowerArm - 1][wrist - 1][wristTwist - 1];
  const muscle = fc.staticHold || fc.repetitive ? 1 : 0;
  const load = effectiveLoad(s, fc);
  let force = 0;
  if (s.shockForce) force = 3;
  else if (load >= 10) force = s.loadPattern === "intermittent" ? 2 : 3;
  else if (load >= 2) force = s.loadPattern === "intermittent" ? 1 : 2;
  const scoreC = postureA + muscle + force;
  return { upperArm, lowerArm, wrist, wristTwist, postureA, scoreC, drivers: d };
}

export function rulaNeckTrunkLegs(m: Measures, fc: FrameContext, s: TaskSettings) {
  const d: string[] = [];
  const nf = m.neckFlex;
  let neck = nf < -5 ? 4 : nf <= 10 ? 1 : nf <= 20 ? 2 : 3;
  if (neck >= 3) d.push(nf < -5 ? "Neck extended" : `Neck flexed ${Math.round(nf)}°`);
  if (m.neckTwist > T.neckTwist) {
    neck += 1;
    d.push("Neck twisted");
  }
  if (m.neckSide > T.neckSide) {
    neck += 1;
    d.push("Neck bent sideways");
  }
  neck = clampIdx(neck, 6);

  const tf = m.trunkFlex;
  let trunk: number;
  if (fc.seated && s.trunkSupported && Math.abs(tf) < 20) trunk = 1;
  else if (Math.abs(tf) <= 5) trunk = 1;
  else if (tf < 0 || tf <= 20) trunk = 2;
  else if (tf <= 60) trunk = 3;
  else trunk = 4;
  if (trunk >= 3) d.push(`Trunk flexed ${Math.round(tf)}°`);
  if (m.trunkTwist > T.trunkTwist) {
    trunk += 1;
    d.push("Trunk twisted");
  }
  if (m.trunkSide > T.trunkSide) {
    trunk += 1;
    d.push("Trunk bent sideways");
  }
  trunk = clampIdx(trunk, 6);

  const legs = fc.seated || m.footLift < T.footLift ? 1 : 2;
  if (legs === 2) d.push("Legs not evenly balanced");
  const postureB = TABLE_B[neck - 1][trunk - 1][legs - 1];
  const muscle = fc.staticHold || fc.repetitive ? 1 : 0;
  const load = effectiveLoad(s, fc);
  let force = 0;
  if (s.shockForce) force = 3;
  else if (load >= 10) force = s.loadPattern === "intermittent" ? 2 : 3;
  else if (load >= 2) force = s.loadPattern === "intermittent" ? 1 : 2;
  const scoreD = postureB + muscle + force;
  return { neck, trunk, legs, postureB, scoreD, drivers: d };
}

export function rulaGrand(scoreC: number, scoreD: number) {
  return TABLE_C[clampIdx(scoreC, 8) - 1][clampIdx(scoreD, 7) - 1];
}

export const RULA_ACTION: Record<number, string> = {
  1: "Acceptable posture",
  2: "Acceptable posture",
  3: "Investigate further",
  4: "Investigate further, change may be needed",
  5: "Investigate and change soon",
  6: "Investigate and change soon",
  7: "Investigate and change immediately",
};

export function rulaRisk(score: number): RiskLevel {
  return score <= 2 ? 0 : score <= 4 ? 2 : score <= 6 ? 3 : 4;
}

export function scoreRula(m: Measures, fc: FrameContext, s: TaskSettings): ScoreDetail {
  const L = rulaSide(m, fc, s, "L");
  const R = rulaSide(m, fc, s, "R");
  const ntl = rulaNeckTrunkLegs(m, fc, s);
  const gL = rulaGrand(L.scoreC, ntl.scoreD);
  const gR = rulaGrand(R.scoreC, ntl.scoreD);
  const worst = gR >= gL ? R : L;
  const score = Math.max(gL, gR);
  return {
    score,
    risk: rulaRisk(score),
    label: RULA_ACTION[score],
    parts: {
      upperArmL: L.upperArm,
      upperArmR: R.upperArm,
      lowerArmL: L.lowerArm,
      lowerArmR: R.lowerArm,
      wristL: L.wrist,
      wristR: R.wrist,
      neck: ntl.neck,
      trunk: ntl.trunk,
      legs: ntl.legs,
      scoreA: worst.postureA,
      scoreB: ntl.postureB,
      scoreC: worst.scoreC,
      scoreD: ntl.scoreD,
      left: gL,
      right: gR,
    },
    drivers: [...worst.drivers, ...ntl.drivers],
  };
}
