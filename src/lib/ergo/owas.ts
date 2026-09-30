import type { Measures } from "./measures";
import type { RiskLevel, ScoreDetail } from "./risk";
import { effectiveLoad, type FrameContext, type TaskSettings } from "./settings";

/**
 * OWAS — Ovako Working Posture Analysis System (Karhu et al., 1977).
 * Each frame gets a 4-digit posture code (back, arms, legs, load) and an
 * action category (AC 1–4). Session output is the frequency distribution.
 */

// AC[back-1][arms-1][legs-1][load-1]
const AC: number[][][][] = [
  [
    [[1, 1, 1], [1, 1, 1], [1, 1, 1], [2, 2, 2], [2, 2, 2], [1, 1, 1], [1, 1, 1]],
    [[1, 1, 1], [1, 1, 1], [1, 1, 1], [2, 2, 2], [2, 2, 2], [1, 1, 1], [1, 1, 1]],
    [[1, 1, 1], [1, 1, 1], [1, 1, 1], [2, 2, 3], [2, 2, 3], [1, 1, 1], [1, 1, 2]],
  ],
  [
    [[2, 2, 3], [2, 2, 3], [2, 2, 3], [3, 3, 3], [3, 3, 3], [2, 2, 2], [2, 3, 3]],
    [[2, 2, 3], [2, 2, 3], [2, 3, 3], [3, 4, 4], [3, 4, 4], [3, 3, 4], [2, 3, 4]],
    [[3, 3, 4], [2, 2, 3], [3, 3, 3], [3, 4, 4], [4, 4, 4], [4, 4, 4], [2, 3, 4]],
  ],
  [
    [[1, 1, 1], [1, 1, 1], [1, 1, 2], [3, 3, 3], [4, 4, 4], [1, 1, 1], [1, 1, 1]],
    [[2, 2, 3], [1, 1, 1], [1, 1, 2], [4, 4, 4], [4, 4, 4], [3, 3, 3], [1, 1, 1]],
    [[2, 2, 3], [1, 1, 1], [2, 3, 3], [4, 4, 4], [4, 4, 4], [4, 4, 4], [1, 1, 1]],
  ],
  [
    [[2, 3, 3], [2, 2, 3], [2, 2, 3], [4, 4, 4], [4, 4, 4], [4, 4, 4], [2, 3, 4]],
    [[3, 3, 4], [2, 3, 4], [3, 3, 4], [4, 4, 4], [4, 4, 4], [4, 4, 4], [2, 3, 4]],
    [[4, 4, 4], [2, 3, 4], [3, 3, 4], [4, 4, 4], [4, 4, 4], [4, 4, 4], [2, 3, 4]],
  ],
];

export const OWAS_BACK = ["Straight", "Bent", "Twisted / side-bent", "Bent and twisted"];
export const OWAS_ARMS = ["Both below shoulder", "One at/above shoulder", "Both at/above shoulder"];
export const OWAS_LEGS = [
  "Sitting",
  "Standing, both legs straight",
  "Standing on one straight leg",
  "Standing/squatting, both knees bent",
  "Standing/squatting on one bent leg",
  "Kneeling",
  "Walking / moving",
];
export const OWAS_LOAD = ["< 10 kg", "10–20 kg", "> 20 kg"];
export const OWAS_AC_TEXT: Record<number, string> = {
  1: "AC1: No corrective action needed",
  2: "AC2: Corrective action in the near future",
  3: "AC3: Corrective action as soon as possible",
  4: "AC4: Corrective action immediately",
};

export function owasActionCategory(back: number, arms: number, legs: number, load: number) {
  return AC[back - 1][arms - 1][legs - 1][load - 1];
}

export function owasCodes(m: Measures, fc: FrameContext, s: TaskSettings) {
  const bent = m.trunkFlex > 20 || m.trunkFlex < -20;
  const twisted = m.trunkTwist > 20 || m.trunkSide > 20;
  const back = bent && twisted ? 4 : twisted ? 3 : bent ? 2 : 1;

  const raised = (m.shoulderElevL >= 90 ? 1 : 0) + (m.shoulderElevR >= 90 ? 1 : 0);
  const arms = raised + 1;

  let legs: number;
  const kL = m.kneeFlexL,
    kR = m.kneeFlexR;
  if (fc.seated) legs = 1;
  else if (m.locomotion > 0.35) legs = 7;
  else if (m.kneeHeight < 0.15 && Math.max(kL, kR) > 70) legs = 6;
  else if (m.footLift > 0.1) legs = Math.min(kL, kR) > 30 ? 5 : 3;
  else legs = kL > 30 && kR > 30 ? 4 : 2;

  const kg = effectiveLoad(s, fc);
  const load = kg > 20 ? 3 : kg >= 10 ? 2 : 1;
  return { back, arms, legs, load };
}

export function owasRisk(ac: number): RiskLevel {
  return ac <= 1 ? 0 : ac === 2 ? 2 : ac === 3 ? 3 : 4;
}

export function scoreOwas(m: Measures, fc: FrameContext, s: TaskSettings): ScoreDetail {
  const { back, arms, legs, load } = owasCodes(m, fc, s);
  const ac = owasActionCategory(back, arms, legs, load);
  const drivers: string[] = [];
  if (back > 1) drivers.push(`Back: ${OWAS_BACK[back - 1]}`);
  if (arms > 1) drivers.push(`Arms: ${OWAS_ARMS[arms - 1]}`);
  if (legs > 2) drivers.push(`Legs: ${OWAS_LEGS[legs - 1]}`);
  if (load > 1) drivers.push(`Load: ${OWAS_LOAD[load - 1]}`);
  return {
    score: ac,
    risk: owasRisk(ac),
    label: OWAS_AC_TEXT[ac],
    parts: { back, arms, legs, load, code: back * 1000 + arms * 100 + legs * 10 + load },
    drivers,
  };
}
