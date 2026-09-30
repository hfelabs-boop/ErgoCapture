/** Task-level inputs that cannot be measured from video (or can be overridden). */
export interface TaskSettings {
  /** Subject stature in cm; scales the metric skeleton. 0 = use model estimate */
  subjectHeightCm: number;
  /** Handled load (kg). Weight cannot be seen by a camera; enter it manually. */
  loadKg: number;
  /** When the load counts: always, or only when hands appear to be holding something */
  loadApplies: "always" | "auto" | "never";
  /** RULA/REBA force pattern */
  loadPattern: "intermittent" | "static" | "repeated";
  shockForce: boolean;
  coupling: "good" | "fair" | "poor" | "unacceptable";
  armsSupported: boolean;
  seated: "auto" | "yes" | "no";
  trunkSupported: boolean;
  /** Hours per shift spent on this task */
  taskHoursPerDay: number;
  /** NIOSH */
  nioshLiftsPerMin: number; // 0 = auto from detected lifts
  nioshDestinationControl: boolean;
  /** Strain Index manual ratings (1..5) */
  siIntensity: 1 | 2 | 3 | 4 | 5;
  siSpeed: 1 | 2 | 3 | 4 | 5;
  /** OCRA checklist manual factors */
  ocraRecovery: number; // 0..10
  ocraForce: number; // 0..32 (Borg-based)
  ocraGrip: number; // 0,2,4,8
  ocraAdditional: number; // 0..3
  ocraActionsPerCycle: number; // 0 = auto (movement-count proxy)
  /** Workstation (anthropometric fit) */
  workSurfaceCm: number; // 0 = not assessed
  workType: "precision" | "light" | "heavy";
  farthestControlCm: number; // horizontal distance from front of body, 0 = not assessed
}

export const DEFAULT_SETTINGS: TaskSettings = {
  subjectHeightCm: 0,
  loadKg: 0,
  loadApplies: "auto",
  loadPattern: "intermittent",
  shockForce: false,
  coupling: "fair",
  armsSupported: false,
  seated: "auto",
  trunkSupported: false,
  taskHoursPerDay: 4,
  nioshLiftsPerMin: 0,
  nioshDestinationControl: false,
  siIntensity: 2,
  siSpeed: 3,
  ocraRecovery: 2,
  ocraForce: 0,
  ocraGrip: 0,
  ocraAdditional: 0,
  ocraActionsPerCycle: 0,
  workSurfaceCm: 0,
  workType: "light",
  farthestControlCm: 0,
};

/** Per-frame context derived from the temporal analysis. */
export interface FrameContext {
  /** Posture held essentially unchanged for > 1 min */
  staticHold: boolean;
  /** Upper-limb action repeated > 4 times/min */
  repetitive: boolean;
  /** Rapid large-range posture change */
  rapidChange: boolean;
  /** Hands appear to be holding a load */
  loadActive: boolean;
  seated: boolean;
}

export const NEUTRAL_CONTEXT: FrameContext = {
  staticHold: false,
  repetitive: false,
  rapidChange: false,
  loadActive: false,
  seated: false,
};

/** Load (kg) that counts at this frame. */
export function effectiveLoad(s: TaskSettings, fc: FrameContext) {
  if (s.loadApplies === "never") return 0;
  if (s.loadApplies === "always") return s.loadKg;
  return fc.loadActive ? s.loadKg : 0;
}
