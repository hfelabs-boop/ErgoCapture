import { MEASURE_DEFS, type MeasureKey, type Measures } from "./measures";
import type { ScoreDetail, ScoredFrame } from "./risk";
import type { FrameContext, TaskSettings } from "./settings";

/**
 * Score confidence by Monte Carlo perturbation.
 *
 * Each measure gets an uncertainty that grows as its reliability (keypoint
 * visibility × camera-view suitability) drops. We re-score the frame with
 * perturbed inputs; the fraction of samples that reproduce the nominal score
 * at the same risk (action) level is the score's *stability*. A score that sits far from any threshold stays
 * stable even with noisy inputs — which is exactly what a practitioner wants
 * to know.
 */

export type Scorer = (m: Measures, fc: FrameContext, s: TaskSettings) => ScoreDetail;

const PLANE_OF = Object.fromEntries(MEASURE_DEFS.map((d) => [d.key, d.plane])) as Record<MeasureKey, string>;
const UNIT_OF = Object.fromEntries(MEASURE_DEFS.map((d) => [d.key, d.unit])) as Record<MeasureKey, string>;

export function sigmaFor(key: MeasureKey, conf: number): number {
  const u = 1 - Math.max(0, Math.min(1, conf));
  const unit = UNIT_OF[key];
  if (unit === "°") return PLANE_OF[key] === "transverse" ? 5 + 15 * u : 2 + 12 * u;
  if (unit === "m") return 0.01 + 0.08 * u;
  if (unit === "%") return 3 + 15 * u;
  if (unit === "") return 0.03 + 0.2 * u;
  return 0.05 + 0.2 * u;
}

/** Deterministic PRNG (mulberry32) so reports are reproducible. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r: () => number) {
  const u = Math.max(1e-12, r());
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const KEYS = MEASURE_DEFS.map((d) => d.key) as MeasureKey[];

export function scoreWithConfidence(
  scorer: Scorer,
  m: Measures,
  c: Measures,
  fc: FrameContext,
  s: TaskSettings,
  samples = 24,
  seed = 1,
): ScoredFrame {
  const nominal = scorer(m, fc, s);
  const r = rng(seed);
  let same = 0;
  const pm = { ...m };
  for (let i = 0; i < samples; i++) {
    for (const k of KEYS) {
      const x = m[k];
      if (!Number.isFinite(x)) continue;
      let y = x + gauss(r) * sigmaFor(k, c[k]);
      // Magnitude-only measures cannot go negative.
      if (k !== "trunkFlex" && k !== "neckFlex" && !k.startsWith("shoulderFlex") && !k.startsWith("wristMidline"))
        y = Math.abs(y);
      pm[k] = y;
    }
    // Agreement = same risk/action level; that is what drives a decision.
    if (scorer(pm, fc, s).risk === nominal.risk) same++;
  }
  const stability = same / samples;
  // Input reliability: mean confidence of the angular measures that drive posture scores.
  const used = KEYS.filter((k) => UNIT_OF[k] === "°" && Number.isFinite(m[k]));
  const inputConf = used.length ? used.reduce((a, k) => a + c[k], 0) / used.length : 0;
  const conf = Math.max(0, Math.min(1, stability * (0.4 + 0.6 * inputConf)));
  return { ...nominal, conf, stability };
}
