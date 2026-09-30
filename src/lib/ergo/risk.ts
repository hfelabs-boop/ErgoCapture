/** Common 0..4 risk scale used for colouring and the heatmap. */
export type RiskLevel = 0 | 1 | 2 | 3 | 4;

export const RISK_COLORS: Record<RiskLevel, string> = {
  0: "#16a34a",
  1: "#84cc16",
  2: "#eab308",
  3: "#f97316",
  4: "#dc2626",
};

export const RISK_NAMES: Record<RiskLevel, string> = {
  0: "Negligible",
  1: "Low",
  2: "Medium",
  3: "High",
  4: "Very high",
};

export type ConfidenceLevel = "high" | "medium" | "low";

export function confidenceLevel(c: number): ConfidenceLevel {
  if (!Number.isFinite(c)) return "low";
  return c >= 0.75 ? "high" : c >= 0.5 ? "medium" : "low";
}

export const CONFIDENCE_COLORS: Record<ConfidenceLevel, string> = {
  high: "#16a34a",
  medium: "#ca8a04",
  low: "#dc2626",
};

export interface ScoreDetail {
  score: number;
  risk: RiskLevel;
  label: string;
  /** Intermediate sub-scores, e.g. upperArm, trunk, tableA */
  parts: Record<string, number>;
  /** Human-readable reasons for the score (drivers) */
  drivers: string[];
}

export interface ScoredFrame extends ScoreDetail {
  /** Confidence 0..1 combining input reliability and score stability */
  conf: number;
  /** Fraction of Monte Carlo perturbations that reproduced the same risk level */
  stability: number;
}
