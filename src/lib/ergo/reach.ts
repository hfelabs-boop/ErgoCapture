import { KP, type PoseFrame } from "../pose/types";
import { mid, norm, sub, v3 } from "../pose/vec";
import type { FrameMeasures } from "./measures";
import type { RiskLevel } from "./risk";
import type { TaskSettings } from "./settings";

/** Reach-zone and anthropometric-fit analysis. */

export const REACH_ZONES = [
  { key: "primary", label: "Primary (elbows close, < 50% arm)", max: 0.5, risk: 0 as RiskLevel },
  { key: "secondary", label: "Secondary (50–80% arm)", max: 0.8, risk: 1 as RiskLevel },
  { key: "maximum", label: "Maximum (80–100% arm)", max: 1.0, risk: 2 as RiskLevel },
  { key: "beyond", label: "Beyond reach (trunk lean needed)", max: Infinity, risk: 3 as RiskLevel },
];

export interface ReachResult {
  zonePct: Record<"L" | "R", Record<string, number>>;
  aboveShoulderPct: Record<"L" | "R", number>;
  belowKnucklePct: Record<"L" | "R", number>;
  maxReach: Record<"L" | "R", number>;
  risk: RiskLevel;
}

export interface Anthropometry {
  statureCm: number;
  statureSource: "entered" | "estimated";
  segmentsCm: Record<string, number>;
  derivedCm: Record<string, number>;
  conf: number;
}

export interface WorkstationFit {
  item: string;
  actualCm: number;
  recommendedCm: [number, number];
  ok: boolean;
  advice: string;
}

export function analyzeReach(ms: FrameMeasures[], anthro: Anthropometry): ReachResult {
  const valid = ms.filter((f) => f.valid);
  const n = Math.max(1, valid.length);
  const knuckle = (anthro.derivedCm.knuckleHeight ?? 75) / 100;
  const zonePct = { L: {} as Record<string, number>, R: {} as Record<string, number> };
  const above = { L: 0, R: 0 };
  const below = { L: 0, R: 0 };
  const maxReach = { L: 0, R: 0 };
  for (const side of ["L", "R"] as const) {
    for (const z of REACH_ZONES) zonePct[side][z.key] = 0;
    for (const f of valid) {
      const r = f.m[`reach${side}`];
      if (!Number.isFinite(r)) continue;
      const z = REACH_ZONES.find((z) => r < z.max)!;
      zonePct[side][z.key] += 100 / n;
      maxReach[side] = Math.max(maxReach[side], r);
      if (f.m[`shoulderElev${side}`] >= 90) above[side] += 100 / n;
      if (f.m[`handHeight${side}`] < knuckle * 0.8) below[side] += 100 / n;
    }
  }
  const beyond = Math.max(zonePct.L.beyond, zonePct.R.beyond);
  const maxZ = Math.max(zonePct.L.maximum, zonePct.R.maximum);
  const risk: RiskLevel = beyond > 10 ? 3 : beyond > 2 || maxZ > 30 ? 2 : maxZ > 10 ? 1 : 0;
  return { zonePct, aboveShoulderPct: above, belowKnucklePct: below, maxReach, risk };
}

export function estimateAnthropometry(frames: PoseFrame[], scale: number, enteredCm: number, modelStatureM: number): Anthropometry {
  const lens: Record<string, number[]> = {
    upperArm: [],
    forearm: [],
    thigh: [],
    shank: [],
    shoulderBreadth: [],
    hipBreadth: [],
    trunk: [],
  };
  let visSum = 0,
    visN = 0;
  for (const f of frames) {
    const w = f.world;
    if (!w || f.interpolated) continue;
    const d = (a: number, b: number) => (Math.min(w[a].v, w[b].v) > 0.5 ? norm(sub(v3(w[a]), v3(w[b]))) * scale : NaN);
    lens.upperArm.push((d(KP.leftShoulder, KP.leftElbow) + d(KP.rightShoulder, KP.rightElbow)) / 2);
    lens.forearm.push((d(KP.leftElbow, KP.leftWrist) + d(KP.rightElbow, KP.rightWrist)) / 2);
    lens.thigh.push((d(KP.leftHip, KP.leftKnee) + d(KP.rightHip, KP.rightKnee)) / 2);
    lens.shank.push((d(KP.leftKnee, KP.leftAnkle) + d(KP.rightKnee, KP.rightAnkle)) / 2);
    lens.shoulderBreadth.push(d(KP.leftShoulder, KP.rightShoulder));
    lens.hipBreadth.push(d(KP.leftHip, KP.rightHip));
    lens.trunk.push(
      norm(sub(mid(v3(w[KP.leftShoulder]), v3(w[KP.rightShoulder])), mid(v3(w[KP.leftHip]), v3(w[KP.rightHip])))) * scale,
    );
    for (const k of w) {
      visSum += k.v;
      visN++;
    }
  }
  const med = (a: number[]) => {
    const s = a.filter(Number.isFinite).sort((x, y) => x - y);
    return s.length ? s[Math.floor(s.length / 2)] * 100 : NaN;
  };
  const seg = Object.fromEntries(Object.entries(lens).map(([k, v]) => [k, med(v)]));
  const stature = enteredCm > 0 ? enteredCm : modelStatureM * scale * 100;
  // Standing heights from segment chain + population proportions (Drillis & Contini).
  const ankle = 0.039 * stature;
  const knee = ankle + seg.shank;
  const hip = knee + seg.thigh;
  const shoulder = hip + seg.trunk;
  const elbow = shoulder - seg.upperArm;
  const knuckle = elbow - seg.forearm - 0.05 * stature;
  const derived = {
    eyeHeight: 0.936 * stature,
    shoulderHeight: shoulder,
    elbowHeight: elbow,
    knuckleHeight: knuckle,
    hipHeight: hip,
    kneeHeight: knee,
    forwardReach: seg.upperArm + seg.forearm + 0.1 * stature,
  };
  return {
    statureCm: stature,
    statureSource: enteredCm > 0 ? "entered" : "estimated",
    segmentsCm: seg,
    derivedCm: derived,
    conf: (visN ? visSum / visN : 0) * (enteredCm > 0 ? 1 : 0.6),
  };
}

/** Workstation fit using Grandjean's work-surface recommendations relative to elbow height. */
export function workstationFit(a: Anthropometry, s: TaskSettings): WorkstationFit[] {
  const out: WorkstationFit[] = [];
  const e = a.derivedCm.elbowHeight;
  if (s.workSurfaceCm > 0 && Number.isFinite(e)) {
    const [lo, hi] =
      s.workType === "precision" ? [e + 5, e + 10] : s.workType === "light" ? [e - 15, e - 10] : [e - 40, e - 15];
    const ok = s.workSurfaceCm >= lo && s.workSurfaceCm <= hi;
    out.push({
      item: `Work surface (${s.workType} work)`,
      actualCm: s.workSurfaceCm,
      recommendedCm: [lo, hi],
      ok,
      advice: ok
        ? "Within the recommended range"
        : s.workSurfaceCm < lo
          ? `Raise by ${(lo - s.workSurfaceCm).toFixed(0)} cm (or provide a height-adjustable surface)`
          : `Lower by ${(s.workSurfaceCm - hi).toFixed(0)} cm (or provide a platform for the worker)`,
    });
  }
  if (s.farthestControlCm > 0 && Number.isFinite(a.derivedCm.forwardReach)) {
    const comfy = a.derivedCm.forwardReach * 0.8;
    const ok = s.farthestControlCm <= comfy;
    out.push({
      item: "Farthest control / part",
      actualCm: s.farthestControlCm,
      recommendedCm: [0, comfy],
      ok,
      advice: ok ? "Within comfortable reach" : `Move closer by ${(s.farthestControlCm - comfy).toFixed(0)} cm`,
    });
  }
  return out;
}
