import type { Keypoint, PoseFrame } from "../pose/types";
import { scoreWithConfidence } from "./confidence";
import { segmentRisk } from "./exposure";
import { computeFrameMeasures, estimateStature, type Calibration, type FrameMeasures } from "./measures";
import { scoreOwas } from "./owas";
import { scoreReba } from "./reba";
import type { RiskLevel, ScoredFrame } from "./risk";
import { scoreRula } from "./rula";
import type { FrameContext, TaskSettings } from "./settings";
import { handsHoldLoad, isSeated } from "./temporal";
import type { SegmentKey } from "../pose/types";

/**
 * Posture assessment of a set of still photos. Each photo is scored on its
 * own (RULA, REBA, OWAS with confidence). Methods that need movement over
 * time (repetition, lifting, OCRA, Strain Index, holding times) do not apply.
 */

export interface PhotoInput {
  id: string;
  name: string;
  width: number;
  height: number;
  image: Keypoint[] | null;
  world: Keypoint[] | null;
  source: string;
  detailedHands: boolean;
}

export interface PhotoOptions {
  /** The postures shown are held for more than 1 minute (RULA muscle use, REBA activity) */
  staticHold: boolean;
  /** The postures shown are repeated more than 4 times per minute */
  repetitive: boolean;
}

export interface PhotoResult {
  id: string;
  name: string;
  width: number;
  height: number;
  image: Keypoint[] | null;
  found: boolean;
  m: FrameMeasures;
  context: FrameContext;
  rula: ScoredFrame | null;
  reba: ScoredFrame | null;
  owas: ScoredFrame | null;
  segments: Record<SegmentKey, RiskLevel> | null;
}

export interface PhotoAnalysis {
  version: 1;
  createdAt: string;
  items: PhotoResult[];
  /** Indices of photos with a person, highest REBA first */
  ranked: number[];
  overallRisk: RiskLevel;
  statureCm: number;
  statureSource: "entered" | "estimated";
  source: string;
  notes: string[];
  settings: TaskSettings;
  options: PhotoOptions;
  /** The detected poses, kept so photos can be re-scored without re-running pose estimation */
  inputs: PhotoInput[];
}

export function analyzePhotos(inputs: PhotoInput[], settings: TaskSettings, calib: Calibration, options: PhotoOptions): PhotoAnalysis {
  const frames: PoseFrame[] = inputs.map((p) => ({ t: 0, image: p.image, world: p.world }));
  const modelStature = estimateStature(frames.filter((f) => f.world));
  const scale = settings.subjectHeightCm > 0 && modelStature > 0 ? settings.subjectHeightCm / 100 / modelStature : 1;

  const items: PhotoResult[] = inputs.map((p, i) => {
    const m = computeFrameMeasures(frames[i], { scale, calib, detailedHands: p.detailedHands });
    m.m.locomotion = 0; // a still photo shows no walking
    const context: FrameContext = {
      staticHold: options.staticHold,
      repetitive: options.repetitive,
      rapidChange: false,
      loadActive: handsHoldLoad(m),
      seated: isSeated(m, settings),
    };
    if (!m.valid) return { id: p.id, name: p.name, width: p.width, height: p.height, image: p.image, found: false, m, context, rula: null, reba: null, owas: null, segments: null };
    const run = (scorer: typeof scoreRula, seed: number) => scoreWithConfidence(scorer, m.m, m.c, context, settings, 40, seed + i);
    return {
      id: p.id,
      name: p.name,
      width: p.width,
      height: p.height,
      image: p.image,
      found: true,
      m,
      context,
      rula: run(scoreRula, 11),
      reba: run(scoreReba, 23),
      owas: run(scoreOwas, 37),
      segments: segmentRisk(m),
    };
  });

  const ranked = items
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => it.found)
    .sort((a, b) => b.it.reba!.score - a.it.reba!.score || b.it.rula!.score - a.it.rula!.score)
    .map(({ i }) => i);
  const overallRisk = Math.max(0, ...items.filter((x) => x.found).map((x) => Math.max(x.rula!.risk, x.reba!.risk, x.owas!.risk))) as RiskLevel;

  const notes: string[] = [];
  const missing = items.filter((x) => !x.found).length;
  if (missing) notes.push(`No person was found in ${missing} of ${items.length} photo(s).`);
  notes.push(
    "Photos are snapshots: repetition, lifting (NIOSH), OCRA, Strain Index and holding-time limits need video and are not assessed.",
  );
  if (!options.staticHold && !options.repetitive)
    notes.push("Scores assume the postures are neither held over 1 minute nor repeated over 4 times per minute; tick those options if they are.");
  if (settings.subjectHeightCm <= 0) notes.push("Worker height not entered: distances use the model's scale estimate.");
  if (inputs.length > 1) notes.push("Body proportions are estimated across all photos, assuming they show the same worker.");
  if (!inputs.every((p) => p.detailedHands)) notes.push("Wrist angles come from coarse hand keypoints; treat wrist sub-scores as indicative.");
  notes.push("Single-image depth is estimated: forward bending seen from the front and twisting are the least reliable angles.");

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    items,
    ranked,
    overallRisk,
    statureCm: settings.subjectHeightCm > 0 ? settings.subjectHeightCm : modelStature * scale * 100,
    statureSource: settings.subjectHeightCm > 0 ? "entered" : "estimated",
    source: [...new Set(inputs.map((p) => p.source))].join(", "),
    notes,
    settings,
    options,
    inputs,
  };
}
