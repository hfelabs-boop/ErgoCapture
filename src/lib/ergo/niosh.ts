import type { FrameMeasures } from "./measures";
import type { TaskSettings } from "./settings";
import { fillNaN, movingAverage } from "./temporal";
import type { RiskLevel } from "./risk";

/**
 * Revised NIOSH Lifting Equation (Waters et al., 1993).
 * RWL = LC · HM · VM · DM · AM · FM · CM,  LI = load / RWL.
 * H, V, D and A are estimated from the skeleton at the origin and destination
 * of every detected lift; the load weight must be entered manually.
 */

export const LC = 23; // kg

export const hm = (Hcm: number) => (Hcm <= 25 ? 1 : Hcm > 63 ? 0 : 25 / Hcm);
export const vm = (Vcm: number) => (Vcm > 175 || Vcm < 0 ? 0 : 1 - 0.003 * Math.abs(Vcm - 75));
export const dm = (Dcm: number) => (Dcm <= 25 ? 1 : Dcm > 175 ? 0 : 0.82 + 4.5 / Dcm);
export const am = (Adeg: number) => (Adeg > 135 ? 0 : 1 - 0.0032 * Adeg);

// Frequency multiplier table: rows = lifts/min, cols = [≤1h V<75, ≤1h V≥75, ≤2h V<75, ≤2h V≥75, ≤8h V<75, ≤8h V≥75]
const FM_ROWS: Array<[number, number[]]> = [
  [0.2, [1.0, 1.0, 0.95, 0.95, 0.85, 0.85]],
  [0.5, [0.97, 0.97, 0.92, 0.92, 0.81, 0.81]],
  [1, [0.94, 0.94, 0.88, 0.88, 0.75, 0.75]],
  [2, [0.91, 0.91, 0.84, 0.84, 0.65, 0.65]],
  [3, [0.88, 0.88, 0.79, 0.79, 0.55, 0.55]],
  [4, [0.84, 0.84, 0.72, 0.72, 0.45, 0.45]],
  [5, [0.8, 0.8, 0.6, 0.6, 0.35, 0.35]],
  [6, [0.75, 0.75, 0.5, 0.5, 0.27, 0.27]],
  [7, [0.7, 0.7, 0.42, 0.42, 0.22, 0.22]],
  [8, [0.6, 0.6, 0.35, 0.35, 0.18, 0.18]],
  [9, [0.52, 0.52, 0.3, 0.3, 0.0, 0.15]],
  [10, [0.45, 0.45, 0.26, 0.26, 0.0, 0.13]],
  [11, [0.41, 0.41, 0.0, 0.23, 0.0, 0.0]],
  [12, [0.37, 0.37, 0.0, 0.21, 0.0, 0.0]],
  [13, [0.0, 0.34, 0.0, 0.0, 0.0, 0.0]],
  [14, [0.0, 0.31, 0.0, 0.0, 0.0, 0.0]],
  [15, [0.0, 0.28, 0.0, 0.0, 0.0, 0.0]],
];

export function fm(liftsPerMin: number, hoursPerDay: number, Vcm: number) {
  const col = (hoursPerDay <= 1 ? 0 : hoursPerDay <= 2 ? 2 : 4) + (Vcm >= 75 ? 1 : 0);
  const f = Math.max(0.2, liftsPerMin);
  if (f > 15) return 0;
  for (let i = 0; i < FM_ROWS.length; i++) {
    const [fi, row] = FM_ROWS[i];
    if (f === fi) return row[col];
    if (f < fi) {
      const [f0, r0] = FM_ROWS[i - 1];
      // Linear interpolation between tabulated frequencies.
      return r0[col] + ((row[col] - r0[col]) * (f - f0)) / (fi - f0);
    }
  }
  return FM_ROWS[FM_ROWS.length - 1][1][col];
}

export function cm(coupling: TaskSettings["coupling"], Vcm: number) {
  if (coupling === "good") return 1;
  if (coupling === "fair") return Vcm < 75 ? 0.95 : 1;
  return 0.9;
}

export interface NioshPoint {
  t: number;
  H: number; // cm
  V: number; // cm
  A: number; // deg
  conf: number;
}

export interface NioshLift {
  kind: "lift" | "lower";
  start: number;
  end: number;
  origin: NioshPoint;
  destination: NioshPoint;
  D: number;
  rwlOrigin: number;
  rwlDestination: number;
  rwl: number;
  li: number;
  multipliers: { HM: number; VM: number; DM: number; AM: number; FM: number; CM: number };
  conf: number;
}

export interface NioshResult {
  lifts: NioshLift[];
  frequency: number;
  frequencySource: "auto" | "manual";
  maxLi: number;
  risk: RiskLevel;
  label: string;
}

export function nioshRisk(li: number): RiskLevel {
  return li <= 0 || !Number.isFinite(li) ? 0 : li <= 1 ? 1 : li <= 2 ? 2 : li <= 3 ? 3 : 4;
}

export function rwlAt(p: NioshPoint, D: number, F: number, s: TaskSettings) {
  const M = {
    HM: hm(p.H),
    VM: vm(p.V),
    DM: dm(D),
    AM: am(p.A),
    FM: fm(F, s.taskHoursPerDay, p.V),
    CM: cm(s.coupling, p.V),
  };
  return { rwl: LC * M.HM * M.VM * M.DM * M.AM * M.FM * M.CM, M };
}

/**
 * Detect lifts/lowers as sustained vertical hand displacements (≥ 25 cm
 * within 0.4–5 s) with both hands near each other (holding an object).
 */
export function detectLifts(ms: FrameMeasures[], fps: number) {
  const t = ms.map((f) => f.t);
  const h = movingAverage(
    fillNaN(ms.map((f) => (f.valid ? (f.m.handHeightL + f.m.handHeightR) / 2 : NaN))),
    Math.max(1, Math.round(fps * 0.3)),
  );
  const gap = ms.map((f) => f.m.handsGap);
  const events: Array<{ i0: number; i1: number; kind: "lift" | "lower" }> = [];
  // Find extrema (turning points), then keep monotonic runs with enough travel.
  const ext: number[] = [0];
  for (let i = 1; i < h.length - 1; i++) {
    const d0 = h[i] - h[i - 1];
    const d1 = h[i + 1] - h[i];
    if ((d0 > 0 && d1 <= 0) || (d0 < 0 && d1 >= 0)) {
      // Ignore tiny wiggles: merge with previous extreme if travel < 5 cm.
      if (Math.abs(h[i] - h[ext[ext.length - 1]]) < 0.05) continue;
      ext.push(i);
    }
  }
  ext.push(h.length - 1);
  for (let k = 0; k < ext.length - 1; k++) {
    const i0 = ext[k],
      i1 = ext[k + 1];
    const travel = h[i1] - h[i0];
    const dur = t[i1] - t[i0];
    if (Math.abs(travel) < 0.25 || dur < 0.3 || dur > 5) continue;
    let held = 0;
    for (let i = i0; i <= i1; i++) if (gap[i] < 0.55) held++;
    if (held / (i1 - i0 + 1) < 0.6) continue;
    events.push({ i0, i1, kind: travel > 0 ? "lift" : "lower" });
  }
  return events;
}

export function analyzeNiosh(ms: FrameMeasures[], fps: number, s: TaskSettings): NioshResult {
  const events = detectLifts(ms, fps);
  const dur = ms.length > 1 ? ms[ms.length - 1].t - ms[0].t : 0;
  // A pick-and-place cycle usually has a loaded lift and an (often empty-handed)
  // return; count the dominant direction so the return is not double counted.
  const nLift = events.filter((e) => e.kind === "lift").length;
  const nLower = events.length - nLift;
  const autoF = dur > 0 ? (Math.max(nLift, nLower) / dur) * 60 : 0;
  const F = s.nioshLiftsPerMin > 0 ? s.nioshLiftsPerMin : autoF;
  const point = (i: number): NioshPoint => {
    const f = ms[i];
    const conf = Math.min(f.c.handHoriz, f.c.handHeightL, f.c.handHeightR);
    return {
      t: f.t,
      H: Math.max(25, f.m.handHoriz * 100),
      V: ((f.m.handHeightL + f.m.handHeightR) / 2) * 100,
      A: f.m.handAsym,
      conf,
    };
  };
  const lifts: NioshLift[] = events.map((e) => {
    const o = point(e.i0);
    const d = point(e.i1);
    const D = Math.abs(d.V - o.V);
    const ro = rwlAt(o, D, F, s);
    const rd = rwlAt(d, D, F, s);
    const useDest = s.nioshDestinationControl;
    const rwl = useDest ? Math.min(ro.rwl, rd.rwl) : ro.rwl;
    const M = useDest && rd.rwl < ro.rwl ? rd.M : ro.M;
    return {
      kind: e.kind,
      start: o.t,
      end: d.t,
      origin: o,
      destination: d,
      D,
      rwlOrigin: ro.rwl,
      rwlDestination: rd.rwl,
      rwl,
      li: rwl > 0 ? s.loadKg / rwl : s.loadKg > 0 ? Infinity : 0,
      multipliers: M,
      conf: Math.min(o.conf, d.conf),
    };
  });
  const maxLi = lifts.reduce((a, l) => Math.max(a, l.li), 0);
  const risk = nioshRisk(maxLi);
  const label = !lifts.length
    ? "No lifts detected"
    : s.loadKg <= 0
      ? "Enter the load weight to compute the Lifting Index"
      : maxLi <= 1
        ? "LI ≤ 1: acceptable for most healthy workers"
        : maxLi <= 3
          ? "1 < LI ≤ 3: increased risk, redesign recommended"
          : "LI > 3: high risk, redesign required";
  return { lifts, frequency: F, frequencySource: s.nioshLiftsPerMin > 0 ? "manual" : "auto", maxLi, risk, label };
}
