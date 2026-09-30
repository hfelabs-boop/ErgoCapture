import type { FrameMeasures, MeasureKey } from "./measures";
import type { RiskLevel } from "./risk";
import type { TaskSettings } from "./settings";

/**
 * Static posture evaluation after ISO 11226:2000 and EN 1005-4:2005.
 *
 * A "hold" is a period ≥ 4 s where the angle stays within ±5° of its mean.
 * Holding-time limits for the conditionally-acceptable zone use linear
 * approximations of the ISO 11226 maximum-acceptable-holding-time curves.
 * Dynamic (movement) evaluation follows EN 1005-4 frequency limits.
 */

export type Verdict = "acceptable" | "conditional" | "not acceptable";

export interface HoldEval {
  part: string;
  start: number;
  end: number;
  duration: number;
  angle: number;
  verdict: Verdict;
  reason: string;
}

export interface MovementEval {
  part: string;
  zone: string;
  perMin: number;
  verdict: Verdict;
  reason: string;
}

export interface StaticResult {
  holds: HoldEval[];
  movements: MovementEval[];
  summary: Record<string, Verdict>;
  risk: RiskLevel;
}

const lerp = (x: number, x0: number, y0: number, x1: number, y1: number) => y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);

/** Maximum acceptable holding time (s) — linearised ISO 11226 curves. */
export const maht = {
  trunk: (deg: number) => (deg <= 20 ? Infinity : deg > 60 ? 0 : lerp(deg, 20, 240, 60, 60)),
  upperArm: (deg: number) => (deg <= 20 ? Infinity : deg > 60 ? 0 : lerp(deg, 20, 180, 60, 60)),
  head: (deg: number) => (deg <= 25 ? Infinity : deg > 85 ? 0 : lerp(deg, 25, 480, 85, 60)),
};

function findHolds(ms: FrameMeasures[], key: MeasureKey, minSec = 4, tol = 5) {
  const out: Array<{ i0: number; i1: number; mean: number }> = [];
  let i0 = 0;
  while (i0 < ms.length) {
    if (!ms[i0].valid || !Number.isFinite(ms[i0].m[key])) {
      i0++;
      continue;
    }
    let lo = ms[i0].m[key],
      hi = lo,
      sum = lo,
      i1 = i0;
    while (i1 + 1 < ms.length && ms[i1 + 1].valid) {
      const x = ms[i1 + 1].m[key];
      if (!Number.isFinite(x)) break;
      const nlo = Math.min(lo, x),
        nhi = Math.max(hi, x);
      if (nhi - nlo > 2 * tol) break;
      lo = nlo;
      hi = nhi;
      sum += x;
      i1++;
    }
    if (ms[i1].t - ms[i0].t >= minSec) out.push({ i0, i1, mean: sum / (i1 - i0 + 1) });
    i0 = i1 + 1;
  }
  return out;
}

function countEntries(ms: FrameMeasures[], key: MeasureKey, lo: number, hi: number) {
  let n = 0;
  let inside = false;
  for (const f of ms) {
    const x = f.m[key];
    const now = f.valid && x >= lo && x < hi;
    if (now && !inside) n++;
    inside = now;
  }
  const dur = ms.length > 1 ? ms[ms.length - 1].t - ms[0].t : 0;
  return dur > 0 ? (n / dur) * 60 : 0;
}

export function analyzeStatic(ms: FrameMeasures[], s: TaskSettings): StaticResult {
  const holds: HoldEval[] = [];
  const push = (part: string, h: { i0: number; i1: number; mean: number }, verdict: Verdict, reason: string) =>
    holds.push({
      part,
      start: ms[h.i0].t,
      end: ms[h.i1].t,
      duration: ms[h.i1].t - ms[h.i0].t,
      angle: h.mean,
      verdict,
      reason,
    });

  for (const h of findHolds(ms, "trunkFlex")) {
    const a = h.mean;
    const dur = ms[h.i1].t - ms[h.i0].t;
    if (a < -5) push("Trunk", h, s.trunkSupported ? "conditional" : "not acceptable", "Backward inclination without full trunk support");
    else if (a <= 20) push("Trunk", h, "acceptable", "Inclination ≤ 20°");
    else if (a > 60) push("Trunk", h, "not acceptable", "Inclination > 60°");
    else if (s.trunkSupported) push("Trunk", h, "acceptable", "20–60° with full trunk support");
    else
      push(
        "Trunk",
        h,
        dur <= maht.trunk(a) ? "conditional" : "not acceptable",
        `20–60° held ${dur.toFixed(0)} s (limit ≈ ${maht.trunk(a).toFixed(0)} s)`,
      );
  }
  for (const key of ["trunkSide", "trunkTwist"] as const)
    for (const h of findHolds(ms, key))
      if (h.mean > 10) push("Trunk", h, "not acceptable", `${key === "trunkSide" ? "Lateral bend" : "Axial rotation"} > 10° held`);

  for (const h of findHolds(ms, "neckFlex")) {
    const a = h.mean;
    const dur = ms[h.i1].t - ms[h.i0].t;
    if (a < -5) push("Head/neck", h, "not acceptable", "Neck extension without head support");
    else if (a <= 25) push("Head/neck", h, "acceptable", "Neck flexion ≤ 25°");
    else if (a > 85) push("Head/neck", h, "not acceptable", "Neck flexion > 85°");
    else
      push(
        "Head/neck",
        h,
        dur <= maht.head(a) ? "conditional" : "not acceptable",
        `25–85° held ${dur.toFixed(0)} s (limit ≈ ${maht.head(a).toFixed(0)} s)`,
      );
  }

  for (const side of ["L", "R"] as const) {
    const part = side === "L" ? "Left upper arm" : "Right upper arm";
    for (const h of findHolds(ms, `shoulderElev${side}`)) {
      const a = h.mean;
      const dur = ms[h.i1].t - ms[h.i0].t;
      if (a <= 20) push(part, h, "acceptable", "Elevation ≤ 20°");
      else if (a > 60) push(part, h, s.armsSupported ? "conditional" : "not acceptable", "Elevation > 60°");
      else if (s.armsSupported) push(part, h, "acceptable", "20–60° with full arm support");
      else
        push(
          part,
          h,
          dur <= maht.upperArm(a) ? "conditional" : "not acceptable",
          `20–60° held ${dur.toFixed(0)} s (limit ≈ ${maht.upperArm(a).toFixed(0)} s)`,
        );
    }
  }

  // EN 1005-4 movement frequency limits.
  const movements: MovementEval[] = [];
  for (const side of ["L", "R"] as const) {
    const part = side === "L" ? "Left upper arm" : "Right upper arm";
    const f2060 = countEntries(ms, `shoulderElev${side}`, 20, 60);
    const f60 = countEntries(ms, `shoulderElev${side}`, 60, 360);
    movements.push({
      part,
      zone: "20–60°",
      perMin: f2060,
      verdict: f2060 < 10 || s.armsSupported ? "acceptable" : "not acceptable",
      reason: f2060 < 10 ? "< 10 movements/min" : "≥ 10 movements/min without arm support",
    });
    movements.push({
      part,
      zone: "> 60°",
      perMin: f60,
      verdict: f60 < 2 ? "conditional" : "not acceptable",
      reason: f60 < 2 ? "< 2 movements/min" : "≥ 2 movements/min",
    });
  }
  const fTrunk = countEntries(ms, "trunkFlex", 20, 360);
  movements.push({
    part: "Trunk",
    zone: "> 20° flexion",
    perMin: fTrunk,
    verdict: fTrunk < 2 ? "acceptable" : fTrunk < 10 ? "conditional" : "not acceptable",
    reason: `${fTrunk.toFixed(1)} bends/min`,
  });

  const order: Record<Verdict, number> = { acceptable: 0, conditional: 1, "not acceptable": 2 };
  const summary: Record<string, Verdict> = {};
  for (const e of [...holds, ...movements]) {
    if (!summary[e.part] || order[e.verdict] > order[summary[e.part]]) summary[e.part] = e.verdict;
  }
  const worst = Math.max(0, ...Object.values(summary).map((v) => order[v]));
  return { holds, movements, summary, risk: (worst === 2 ? 3 : worst === 1 ? 2 : 0) as RiskLevel };
}
