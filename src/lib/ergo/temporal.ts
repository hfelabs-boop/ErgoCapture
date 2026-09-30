import type { FrameMeasures, MeasureKey } from "./measures";
import type { FrameContext, TaskSettings } from "./settings";

/** Temporal analysis: repetition counting, static holds, activity segmentation. */

export function movingAverage(x: number[], win: number): number[] {
  const out = new Array(x.length).fill(NaN);
  const half = Math.max(0, Math.floor(win / 2));
  for (let i = 0; i < x.length; i++) {
    let s = 0,
      n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(x.length - 1, i + half); j++) {
      if (Number.isFinite(x[j])) {
        s += x[j];
        n++;
      }
    }
    out[i] = n ? s / n : NaN;
  }
  return out;
}

/** Linear interpolation over NaNs (edges held). */
export function fillNaN(x: number[]): number[] {
  const out = [...x];
  let last = -1;
  for (let i = 0; i < out.length; i++) {
    if (!Number.isFinite(out[i])) continue;
    if (last === -1) for (let j = 0; j < i; j++) out[j] = out[i];
    else for (let j = last + 1; j < i; j++) out[j] = out[last] + ((out[i] - out[last]) * (j - last)) / (i - last);
    last = i;
  }
  if (last === -1) return out.map(() => 0);
  for (let j = last + 1; j < out.length; j++) out[j] = out[last];
  return out;
}

export interface CycleResult {
  key: string;
  label: string;
  /** Times of detected cycle peaks (s) */
  peaks: number[];
  cycles: number;
  perMin: number;
  /** Median cycle time (s) */
  cycleTime: number;
  /** Median peak-to-trough amplitude (units of the signal) */
  amplitude: number;
}

/**
 * Cycle detection by peak finding with prominence on a smoothed, detrended
 * signal. A peak counts when it rises `minProminence` above the surrounding
 * troughs on both sides and is at least `minGapSec` from the previous peak.
 */
export function countCycles(
  t: number[],
  signal: number[],
  opts: { minProminence: number; minGapSec?: number; fps: number },
): { peaks: number[]; amplitudes: number[] } {
  const n = signal.length;
  if (n < 5) return { peaks: [], amplitudes: [] };
  const x = movingAverage(fillNaN(signal), Math.max(1, Math.round(opts.fps * 0.25)));
  const minGap = opts.minGapSec ?? 0.4;
  const peaks: number[] = [];
  const amps: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (!(x[i] >= x[i - 1] && x[i] > x[i + 1])) continue;
    // Walk left/right to find the lowest point before a higher peak.
    let lMin = x[i];
    for (let j = i - 1; j >= 0 && x[j] <= x[i]; j--) lMin = Math.min(lMin, x[j]);
    let rMin = x[i];
    for (let j = i + 1; j < n && x[j] <= x[i]; j++) rMin = Math.min(rMin, x[j]);
    const prom = x[i] - Math.max(lMin, rMin);
    if (prom < opts.minProminence) continue;
    if (peaks.length && t[i] - peaks[peaks.length - 1] < minGap) {
      if (prom > amps[amps.length - 1]) {
        peaks[peaks.length - 1] = t[i];
        amps[amps.length - 1] = prom;
      }
      continue;
    }
    peaks.push(t[i]);
    amps.push(prom);
  }
  return { peaks, amplitudes: amps };
}

const median = (a: number[]) => {
  const s = a.filter(Number.isFinite).sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

export const CYCLE_SIGNALS: Array<{ key: MeasureKey; label: string; prom: number }> = [
  { key: "shoulderElevR", label: "Right upper arm", prom: 15 },
  { key: "shoulderElevL", label: "Left upper arm", prom: 15 },
  { key: "elbowFlexR", label: "Right elbow", prom: 20 },
  { key: "elbowFlexL", label: "Left elbow", prom: 20 },
  { key: "wristFlexR", label: "Right wrist", prom: 15 },
  { key: "wristFlexL", label: "Left wrist", prom: 15 },
  { key: "trunkFlex", label: "Trunk", prom: 15 },
  { key: "handHeightR", label: "Right hand height", prom: 0.15 },
  { key: "handHeightL", label: "Left hand height", prom: 0.15 },
];

export function repetitionAnalysis(ms: FrameMeasures[], fps: number): CycleResult[] {
  const t = ms.map((f) => f.t);
  const dur = t.length > 1 ? t[t.length - 1] - t[0] : 0;
  return CYCLE_SIGNALS.map(({ key, label, prom }) => {
    const sig = ms.map((f) => (f.valid ? f.m[key] : NaN));
    const { peaks, amplitudes } = countCycles(t, sig, { minProminence: prom, fps });
    const gaps = peaks.slice(1).map((p, i) => p - peaks[i]);
    return {
      key,
      label,
      peaks,
      cycles: peaks.length,
      perMin: dur > 0 ? (peaks.length / dur) * 60 : 0,
      cycleTime: median(gaps),
      amplitude: median(amplitudes),
    };
  });
}

/** Count of discrete hand movements per minute (speed peaks) — proxy for technical actions. */
export function handMovementsPerMin(ms: FrameMeasures[], fps: number, side: "L" | "R") {
  const t = ms.map((f) => f.t);
  const h = fillNaN(ms.map((f) => f.m[`handHeight${side}`]));
  const r = fillNaN(ms.map((f) => f.m[`reach${side}`]));
  const speed = h.map((_, i) => {
    if (i === 0) return 0;
    const dt = t[i] - t[i - 1] || 1 / fps;
    return Math.hypot(h[i] - h[i - 1], (r[i] - r[i - 1]) * 0.6) / dt;
  });
  const { peaks } = countCycles(t, speed, { minProminence: 0.25, minGapSec: 0.35, fps });
  const dur = t.length > 1 ? t[t.length - 1] - t[0] : 0;
  return dur > 0 ? (peaks.length / dur) * 60 : 0;
}

/** Per-frame context flags: static holds, repetitive work, rapid changes, load presence, seated. */
export function frameContexts(ms: FrameMeasures[], fps: number, s: TaskSettings, cycles: CycleResult[]): FrameContext[] {
  const n = ms.length;
  const t = ms.map((f) => f.t);
  const keys: MeasureKey[] = ["trunkFlex", "neckFlex", "shoulderElevL", "shoulderElevR"];
  const sigs = keys.map((k) => fillNaN(ms.map((f) => f.m[k])));

  // Static: all key angles stay within a 20° band for the preceding 60 s
  // (sliding-window min/max with monotonic deques, O(n)).
  const win = 60;
  const staticHold = new Array<boolean>(n).fill(t.length > 0 && t[n - 1] - t[0] >= win);
  for (const sig of sigs) {
    const maxQ: number[] = [];
    const minQ: number[] = [];
    let start = 0;
    for (let i = 0; i < n; i++) {
      while (maxQ.length && sig[maxQ[maxQ.length - 1]] <= sig[i]) maxQ.pop();
      maxQ.push(i);
      while (minQ.length && sig[minQ[minQ.length - 1]] >= sig[i]) minQ.pop();
      minQ.push(i);
      while (t[i] - t[start] > win) start++;
      while (maxQ[0] < start) maxQ.shift();
      while (minQ[0] < start) minQ.shift();
      if (t[i] - t[0] < win || sig[maxQ[0]] - sig[minQ[0]] > 20) staticHold[i] = false;
    }
  }
  // Mark the whole held window, not only its end.
  for (let i = n - 1; i >= 0; i--) if (staticHold[i]) for (let j = i - 1; j >= 0 && t[i] - t[j] <= win; j--) staticHold[j] = true;

  // Repetitive: any upper-limb signal cycling > 4/min within a local 60 s window.
  const upper = cycles.filter((c) => !c.key.startsWith("trunk"));
  const repetitive = t.map((ti) =>
    upper.some((c) => {
      const lo = Math.max(t[0], ti - 30);
      const hi = Math.min(t[n - 1], ti + 30);
      const span = Math.max(hi - lo, 1);
      const cnt = c.peaks.filter((p) => p >= lo && p <= hi).length;
      return cnt >= 3 && (cnt / span) * 60 > 4;
    }),
  );

  // Rapid large-range change: trunk or upper-arm swings > 45° within ~1 s.
  const lag = Math.max(1, Math.round(fps));
  const rapidChange = t.map((_, i) =>
    sigs.some((sig) => {
      const j = Math.max(0, i - lag);
      return Math.abs(sig[i] - sig[j]) > 45;
    }),
  );

  const seated = ms.map((f) => {
    if (s.seated === "yes") return true;
    if (s.seated === "no") return false;
    return f.valid && f.m.thighL > 55 && f.m.thighR > 55 && f.m.kneeHeight > 0.3 && f.m.locomotion < 0.3;
  });

  // Hands-occupied heuristic: both hands close together, in front of the body.
  const loadActive = ms.map(
    (f) => f.valid && f.m.handsGap < 0.5 && Math.max(f.m.reachL, f.m.reachR) > 0.2 && f.m.handHeightL < 1.6,
  );

  return t.map((_, i) => ({
    staticHold: staticHold[i],
    repetitive: repetitive[i],
    rapidChange: rapidChange[i],
    loadActive: loadActive[i],
    seated: seated[i],
  }));
}

export type ActivityLabel =
  | "Lifting"
  | "Lowering"
  | "Carrying / walking"
  | "Walking"
  | "Overhead work"
  | "Bending"
  | "Squatting / kneeling"
  | "Reaching"
  | "Seated work"
  | "Static standing"
  | "Manual work"
  | "No person";

export interface ActivitySegment {
  label: ActivityLabel;
  start: number;
  end: number;
}

/**
 * Rule-based activity segmentation from posture and motion. The server tier
 * can replace this with a learned action-recognition model (e.g. VideoMAE);
 * the output format is identical.
 */
export function segmentActivities(
  ms: FrameMeasures[],
  ctx: FrameContext[],
  lifts: Array<{ start: number; end: number; kind: "lift" | "lower" }>,
): ActivitySegment[] {
  const labels: ActivityLabel[] = ms.map((f, i) => {
    if (!f.valid) return "No person";
    const lift = lifts.find((l) => f.t >= l.start && f.t <= l.end);
    if (lift) return lift.kind === "lift" ? "Lifting" : "Lowering";
    const m = f.m;
    if (m.locomotion > 0.35) return ctx[i].loadActive ? "Carrying / walking" : "Walking";
    if (ctx[i].seated) return "Seated work";
    if (Math.max(m.shoulderElevL, m.shoulderElevR) > 100) return "Overhead work";
    if (m.trunkFlex > 45) return "Bending";
    if (m.kneeFlexL > 80 && m.kneeFlexR > 80) return "Squatting / kneeling";
    if (Math.max(m.reachL, m.reachR) > 0.8) return "Reaching";
    if (ctx[i].staticHold) return "Static standing";
    return "Manual work";
  });
  const segs: ActivitySegment[] = [];
  labels.forEach((l, i) => {
    const t = ms[i].t;
    const last = segs[segs.length - 1];
    if (last && last.label === l) last.end = t;
    else segs.push({ label: l, start: t, end: t });
  });
  // Absorb flicker (< 0.5 s) into the preceding segment.
  const merged: ActivitySegment[] = [];
  for (const s of segs) {
    const prev = merged[merged.length - 1];
    if (prev && (s.end - s.start < 0.5 || prev.label === s.label)) prev.end = s.end;
    else merged.push({ ...s });
  }
  return merged;
}
