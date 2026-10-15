import { MEASURE_DEFS, type MeasureKey, type Measures } from "./measures";
import type { ScoreDetail, ScoredFrame } from "./risk";
import type { FrameContext, TaskSettings } from "./settings";

/**
 * Score confidence by Monte Carlo perturbation.
 *
 * Two things are kept apart:
 * - *quality*: how well the camera measured the angles this score actually
 *   depends on (keypoint visibility × camera-view suitability). Only measures
 *   whose plausible error can change the score count, so a weak twist or wrist
 *   angle that sits far from any threshold does not lower the confidence of,
 *   say, a trunk-driven REBA score.
 * - *stability*: re-scoring with every input perturbed by its estimated error,
 *   the share of re-scores that stay within `tolerance` score points or on the
 *   same action level. *levelStability* is the stricter share that stays on the
 *   same action level; when it is low the posture sits near a cut-off.
 *
 * conf = stability × √quality, so a perfectly measured, stable score reaches 1.
 */

export type Scorer = (m: Measures, fc: FrameContext, s: TaskSettings) => ScoreDetail;

const PLANE_OF = Object.fromEntries(MEASURE_DEFS.map((d) => [d.key, d.plane])) as Record<MeasureKey, string>;
const UNIT_OF = Object.fromEntries(MEASURE_DEFS.map((d) => [d.key, d.unit])) as Record<MeasureKey, string>;

export function sigmaFor(key: MeasureKey, conf: number): number {
  const u = 1 - Math.max(0, Math.min(1, conf));
  const unit = UNIT_OF[key];
  // Errors of smoothed markerless angles: about 3–5° for well-seen joints,
  // 6–10° when poorly seen; axial rotation is the hardest to see.
  if (unit === "°") return PLANE_OF[key] === "transverse" ? 4 + 10 * u : 2 + 6 * u;
  if (unit === "m") return 0.01 + 0.05 * u;
  if (unit === "%") return 3 + 10 * u;
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

const SIGNED = (k: MeasureKey) => k === "trunkFlex" || k === "neckFlex" || k.startsWith("shoulderFlex") || k.startsWith("wristMidline");

/**
 * @param tolerance score points a re-score may differ and still agree
 *   (1 for RULA and REBA; 0 for OWAS, whose score is the action category).
 */
export function scoreWithConfidence(
  scorer: Scorer,
  m: Measures,
  c: Measures,
  fc: FrameContext,
  s: TaskSettings,
  samples = 24,
  seed = 1,
  tolerance = 1,
): ScoredFrame {
  const nominal = scorer(m, fc, s);
  const keys = KEYS.filter((k) => Number.isFinite(m[k]));
  const pm = { ...m };

  // Quality: confidence of the measures whose plausible error (±2σ) changes the score.
  let wSum = 0;
  let cSum = 0;
  for (const k of keys) {
    const d = 2 * sigmaFor(k, c[k]);
    let changes = false;
    for (const y of [m[k] + d, m[k] - d]) {
      pm[k] = SIGNED(k) ? y : Math.abs(y);
      if (scorer(pm, fc, s).score !== nominal.score) {
        changes = true;
        break;
      }
    }
    pm[k] = m[k];
    if (changes) {
      wSum++;
      cSum += c[k];
    }
  }
  // Nothing within reach of a threshold: fall back to the posture angles overall.
  const deg = keys.filter((k) => UNIT_OF[k] === "°");
  const quality = wSum ? cSum / wSum : deg.length ? deg.reduce((a, k) => a + c[k], 0) / deg.length : 0;

  const r = rng(seed);
  let agree = 0;
  let sameLevel = 0;
  for (let i = 0; i < samples; i++) {
    for (const k of keys) {
      const y = m[k] + gauss(r) * sigmaFor(k, c[k]);
      // Magnitude-only measures cannot go negative.
      pm[k] = SIGNED(k) ? y : Math.abs(y);
    }
    const p = scorer(pm, fc, s);
    if (p.risk === nominal.risk) sameLevel++;
    if (p.risk === nominal.risk || Math.abs(p.score - nominal.score) <= tolerance) agree++;
  }
  const stability = agree / samples;
  const levelStability = sameLevel / samples;
  const conf = Math.max(0, Math.min(1, stability * Math.sqrt(Math.max(0, quality))));
  return { ...nominal, conf, stability, levelStability, quality };
}
