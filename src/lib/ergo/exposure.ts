import type { SegmentKey } from "../pose/types";
import type { FrameMeasures, MeasureKey } from "./measures";
import type { RiskLevel } from "./risk";

/** Time-in-posture risk bands and per-body-segment exposure (for heatmap and skeleton colouring). */

export interface Band {
  label: string;
  lo: number;
  hi: number;
  risk: RiskLevel;
}

export interface BandDef {
  key: MeasureKey;
  label: string;
  bands: Band[];
}

const B = (label: string, lo: number, hi: number, risk: RiskLevel): Band => ({ label, lo, hi, risk });

export const BAND_DEFS: BandDef[] = [
  {
    key: "trunkFlex",
    label: "Trunk flexion",
    bands: [B("Extended > 10°", -360, -10, 2), B("Neutral −10–20°", -10, 20, 0), B("20–60°", 20, 60, 2), B("> 60°", 60, 360, 4)],
  },
  {
    key: "neckFlex",
    label: "Neck flexion",
    bands: [B("Extended", -360, -5, 3), B("Neutral −5–10°", -5, 10, 0), B("10–20°", 10, 20, 1), B("> 20°", 20, 360, 3)],
  },
  ...(["L", "R"] as const).map((s) => ({
    key: `shoulderElev${s}` as MeasureKey,
    label: `${s === "L" ? "Left" : "Right"} upper arm elevation`,
    bands: [B("< 20°", 0, 20, 0 as RiskLevel), B("20–45°", 20, 45, 1 as RiskLevel), B("45–90°", 45, 90, 3 as RiskLevel), B("> 90°", 90, 360, 4 as RiskLevel)],
  })),
  ...(["L", "R"] as const).map((s) => ({
    key: `elbowFlex${s}` as MeasureKey,
    label: `${s === "L" ? "Left" : "Right"} elbow flexion`,
    bands: [B("< 60°", 0, 60, 1 as RiskLevel), B("60–100°", 60, 100, 0 as RiskLevel), B("> 100°", 100, 360, 1 as RiskLevel)],
  })),
  ...(["L", "R"] as const).map((s) => ({
    key: `wristFlex${s}` as MeasureKey,
    label: `${s === "L" ? "Left" : "Right"} wrist flexion/extension`,
    bands: [B("< 15°", 0, 15, 0 as RiskLevel), B("15–45°", 15, 45, 2 as RiskLevel), B("> 45°", 45, 360, 3 as RiskLevel)],
  })),
  ...(["L", "R"] as const).map((s) => ({
    key: `kneeFlex${s}` as MeasureKey,
    label: `${s === "L" ? "Left" : "Right"} knee flexion`,
    bands: [B("< 30°", 0, 30, 0 as RiskLevel), B("30–60°", 30, 60, 1 as RiskLevel), B("> 60°", 60, 360, 3 as RiskLevel)],
  })),
];

export function bandOf(def: BandDef, x: number): Band | undefined {
  if (!Number.isFinite(x)) return undefined;
  return def.bands.find((b) => x >= b.lo && x < b.hi);
}

export interface TimeInPosture {
  key: MeasureKey;
  label: string;
  bands: Array<Band & { pct: number; seconds: number }>;
}

export function timeInPosture(ms: FrameMeasures[], fps: number): TimeInPosture[] {
  const valid = ms.filter((f) => f.valid);
  const n = Math.max(1, valid.length);
  return BAND_DEFS.map((def) => {
    const counts = def.bands.map(() => 0);
    for (const f of valid) {
      const b = bandOf(def, f.m[def.key]);
      if (b) counts[def.bands.indexOf(b)]++;
    }
    return {
      key: def.key,
      label: def.label,
      bands: def.bands.map((b, i) => ({ ...b, pct: (counts[i] / n) * 100, seconds: counts[i] / fps })),
    };
  });
}

const SEGMENT_MEASURES: Record<SegmentKey, MeasureKey[]> = {
  neck: ["neckFlex"],
  trunk: ["trunkFlex"],
  upperArmL: ["shoulderElevL"],
  upperArmR: ["shoulderElevR"],
  lowerArmL: ["elbowFlexL"],
  lowerArmR: ["elbowFlexR"],
  wristL: ["wristFlexL"],
  wristR: ["wristFlexR"],
  legL: ["kneeFlexL"],
  legR: ["kneeFlexR"],
};

/** Risk level per body segment for one frame (twist/side-bend escalate neck and trunk). */
export function segmentRisk(f: FrameMeasures): Record<SegmentKey, RiskLevel> {
  const out = {} as Record<SegmentKey, RiskLevel>;
  for (const [seg, keys] of Object.entries(SEGMENT_MEASURES) as Array<[SegmentKey, MeasureKey[]]>) {
    let r = 0;
    for (const k of keys) {
      const def = BAND_DEFS.find((d) => d.key === k);
      const b = def && bandOf(def, f.m[k]);
      if (b) r = Math.max(r, b.risk);
    }
    if (seg === "trunk" && (f.m.trunkTwist > 20 || f.m.trunkSide > 10)) r = Math.min(4, r + 1);
    if (seg === "neck" && (f.m.neckTwist > 20 || f.m.neckSide > 10)) r = Math.min(4, r + 1);
    if ((seg === "upperArmL" && f.m.shoulderAbdL > 30) || (seg === "upperArmR" && f.m.shoulderAbdR > 30))
      r = Math.max(r, 1);
    out[seg] = r as RiskLevel;
  }
  return out;
}

export interface SegmentExposure {
  segment: SegmentKey;
  /** % of valid time at risk level ≥ 2 (medium or worse) */
  pctElevated: number;
  /** % of valid time at risk level ≥ 3 */
  pctHigh: number;
  /** Time-weighted mean risk (0..4) */
  meanRisk: number;
}

export function segmentExposure(ms: FrameMeasures[]): SegmentExposure[] {
  const valid = ms.filter((f) => f.valid);
  const n = Math.max(1, valid.length);
  const segs = Object.keys(SEGMENT_MEASURES) as SegmentKey[];
  const acc = Object.fromEntries(segs.map((s) => [s, { e: 0, h: 0, sum: 0 }])) as Record<SegmentKey, { e: number; h: number; sum: number }>;
  for (const f of valid) {
    const r = segmentRisk(f);
    for (const s of segs) {
      acc[s].sum += r[s];
      if (r[s] >= 2) acc[s].e++;
      if (r[s] >= 3) acc[s].h++;
    }
  }
  return segs.map((s) => ({
    segment: s,
    pctElevated: (acc[s].e / n) * 100,
    pctHigh: (acc[s].h / n) * 100,
    meanRisk: acc[s].sum / n,
  }));
}
