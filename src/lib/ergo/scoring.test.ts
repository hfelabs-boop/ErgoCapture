import { describe, expect, it } from "vitest";
import { NEUTRAL, demoTrack, synthesize, toFrame, type SynthPose } from "../pose/synthetic";
import { analyzeSession } from "./analyze";
import { computeFrameMeasures } from "./measures";
import { am, cm, dm, fm, hm, LC, vm } from "./niosh";
import { owasActionCategory, scoreOwas } from "./owas";
import { rebaTableA, rebaTableB, rebaTableC, scoreReba } from "./reba";
import { rulaGrand, scoreRula } from "./rula";
import { DEFAULT_SETTINGS, NEUTRAL_CONTEXT } from "./settings";
import { strainIndex } from "./repetitive";

const m = (o: Partial<SynthPose>) =>
  computeFrameMeasures(toFrame(synthesize({ ...NEUTRAL, yaw: 60, ...o }), 0, 0), { scale: 1, calib: {} }).m;

describe("REBA tables", () => {
  it("matches published table values", () => {
    expect(rebaTableA(3, 2, 2)).toBe(5);
    expect(rebaTableA(1, 3, 1)).toBe(3);
    expect(rebaTableA(5, 3, 4)).toBe(9);
    expect(rebaTableB(3, 2, 2)).toBe(5);
    expect(rebaTableB(6, 2, 3)).toBe(9);
    expect(rebaTableC(5, 5)).toBe(6);
    expect(rebaTableC(1, 1)).toBe(1);
    expect(rebaTableC(12, 12)).toBe(12);
    expect(rebaTableC(6, 1)).toBe(6);
  });
});

describe("RULA tables", () => {
  it("grand score table", () => {
    expect(rulaGrand(1, 1)).toBe(1);
    expect(rulaGrand(4, 4)).toBe(4);
    expect(rulaGrand(8, 7)).toBe(7);
    expect(rulaGrand(12, 12)).toBe(7);
    expect(rulaGrand(3, 7)).toBe(6);
  });
});

describe("posture scoring on synthetic skeletons", () => {
  it("neutral standing is acceptable", () => {
    const x = m({});
    expect(scoreRula(x, NEUTRAL_CONTEXT, DEFAULT_SETTINGS).score).toBe(2);
    expect(scoreReba(x, NEUTRAL_CONTEXT, DEFAULT_SETTINGS).score).toBe(1);
    expect(scoreOwas(x, NEUTRAL_CONTEXT, DEFAULT_SETTINGS).score).toBe(1);
  });

  it("deep stoop with bent knees is high risk", () => {
    const x = m({ trunkFlex: 70, hipFlexL: 25, hipFlexR: 25, kneeFlexL: 70, kneeFlexR: 70, shoulderFlexL: 80, shoulderFlexR: 80 });
    const reba = scoreReba(x, NEUTRAL_CONTEXT, DEFAULT_SETTINGS);
    expect(reba.parts.trunk).toBe(4);
    expect(reba.parts.legs).toBe(3);
    // Table A 6 + table B 4 → table C 7 (medium, just below high) without load.
    expect(reba.score).toBe(7);
    const rula = scoreRula(x, NEUTRAL_CONTEXT, DEFAULT_SETTINGS);
    expect(rula.parts.trunk).toBe(4);
    // Table A 3 (arms) + table B 5 (trunk 4) → grand score 4.
    expect(rula.score).toBe(4);
    expect(scoreOwas(x, NEUTRAL_CONTEXT, DEFAULT_SETTINGS).parts.back).toBe(2);
  });

  it("load raises REBA via force score", () => {
    const x = m({ trunkFlex: 30 });
    const ctx = { ...NEUTRAL_CONTEXT, loadActive: true };
    const light = scoreReba(x, ctx, { ...DEFAULT_SETTINGS, loadKg: 2 });
    const heavy = scoreReba(x, ctx, { ...DEFAULT_SETTINGS, loadKg: 15 });
    expect(heavy.parts.force).toBe(2);
    expect(heavy.score).toBeGreaterThan(light.score);
  });

  it("overhead work flags arms in OWAS", () => {
    const x = m({ shoulderFlexL: 140, shoulderFlexR: 140 });
    expect(scoreOwas(x, NEUTRAL_CONTEXT, DEFAULT_SETTINGS).parts.arms).toBe(3);
  });
});

describe("OWAS action categories", () => {
  it("table spot checks", () => {
    expect(owasActionCategory(1, 1, 2, 1)).toBe(1);
    expect(owasActionCategory(2, 1, 4, 1)).toBe(3);
    expect(owasActionCategory(4, 3, 4, 3)).toBe(4);
    expect(owasActionCategory(3, 1, 5, 1)).toBe(4);
  });
});

describe("NIOSH lifting equation", () => {
  it("computes RWL for a textbook case", () => {
    // H=40, V=30, D=60, A=0, F=1/min, ≤2 h, fair coupling
    const rwl = LC * hm(40) * vm(30) * dm(60) * am(0) * fm(1, 2, 30) * cm("fair", 30);
    expect(rwl).toBeCloseTo(9.3, 1);
  });
  it("frequency multiplier interpolates and hits zero past limits", () => {
    expect(fm(0.1, 8, 30)).toBe(0.85);
    expect(fm(1.5, 8, 30)).toBeCloseTo(0.7, 5);
    expect(fm(16, 1, 80)).toBe(0);
  });
});

describe("full session on the synthetic demo", () => {
  const settings = { ...DEFAULT_SETTINGS, subjectHeightCm: 175, loadKg: 8 };
  const a = analyzeSession({ tracks: [demoTrack(10, 60)], settings });

  it("covers the recording", () => {
    expect(a.dataQuality.validPct).toBeGreaterThan(99);
    expect(a.duration).toBeGreaterThan(59);
  });
  it("finds the box lifts", () => {
    const lifts = a.niosh.lifts.filter((l) => l.kind === "lift");
    expect(lifts.length).toBeGreaterThanOrEqual(4);
    expect(a.niosh.maxLi).toBeGreaterThan(0);
    // Lifts start near the floor
    expect(Math.min(...lifts.map((l) => l.origin.V))).toBeLessThan(60);
  });
  it("scores the stoop phases as high risk", () => {
    expect(a.summary.reba.max).toBeGreaterThanOrEqual(8);
    expect(a.summary.rula.max).toBeGreaterThanOrEqual(6);
  });
  it("detects repetitive reaching", () => {
    const upper = a.cycles.find((c) => c.key === "shoulderElevR")!;
    expect(upper.cycles).toBeGreaterThanOrEqual(8);
    expect(a.contexts.some((c) => c.repetitive)).toBe(true);
  });
  it("segments activities", () => {
    const labels = new Set(a.activities.map((s) => s.label));
    expect(labels.has("Lifting")).toBe(true);
    expect(labels.has("Overhead work")).toBe(true);
  });
  it("estimates stature near the entered value and scales segments", () => {
    expect(a.anthropometry.statureCm).toBe(175);
    expect(a.anthropometry.segmentsCm.upperArm).toBeGreaterThan(25);
    expect(a.anthropometry.segmentsCm.upperArm).toBeLessThan(35);
    expect(a.views[0].scale).toBeGreaterThan(0.85);
    expect(a.views[0].scale).toBeLessThan(1.2);
  });
  it("gives every score a confidence", () => {
    expect(a.reba.every((r) => r.conf >= 0 && r.conf <= 1)).toBe(true);
    expect(a.summary.reba.meanConf).toBeGreaterThan(0.3);
  });
  it("produces recommendations", () => {
    expect(a.recommendations.length).toBeGreaterThan(1);
  });
  it("strain index is finite", () => {
    const si = strainIndex(a.frames, 10, a.cycles, settings, "R");
    expect(Number.isFinite(si.si)).toBe(true);
  });
  it("multi-view fusion keeps the same timeline and raises confidence", () => {
    const b = analyzeSession({ tracks: [demoTrack(10, 20, 55), { ...demoTrack(10, 20, -30), viewId: "v2" }], settings });
    expect(b.frames.length).toBe(200);
    const single = analyzeSession({ tracks: [demoTrack(10, 20, 55)], settings });
    const meanC = (x: typeof b) => x.frames.reduce((s, f) => s + f.c.trunkFlex, 0) / x.frames.length;
    expect(meanC(b)).toBeGreaterThan(meanC(single));
  });
});
