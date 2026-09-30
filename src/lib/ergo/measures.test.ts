import { describe, expect, it } from "vitest";
import { NEUTRAL, synthesize, toFrame, type SynthPose } from "../pose/synthetic";
import { computeFrameMeasures } from "./measures";

const measure = (o: Partial<SynthPose>) =>
  computeFrameMeasures(toFrame(synthesize({ ...NEUTRAL, ...o }), 0, 0), { scale: 1, calib: {} }).m;

describe("joint angles from synthetic skeletons", () => {
  for (const yaw of [0, 45, 90, -60]) {
    describe(`camera yaw ${yaw}°`, () => {
      it("neutral standing reads near zero", () => {
        const m = measure({ yaw });
        expect(Math.abs(m.trunkFlex)).toBeLessThan(2);
        expect(m.trunkSide).toBeLessThan(2);
        expect(m.trunkTwist).toBeLessThan(2);
        expect(Math.abs(m.neckFlex)).toBeLessThan(2);
        expect(m.kneeFlexL).toBeLessThan(2);
        expect(m.footLift).toBeLessThan(0.01);
      });
      it("trunk flexion, side bend and twist", () => {
        expect(measure({ yaw, trunkFlex: 45 }).trunkFlex).toBeCloseTo(45, 0);
        expect(measure({ yaw, trunkFlex: -15 }).trunkFlex).toBeCloseTo(-15, 0);
        expect(measure({ yaw, trunkSide: 20 }).trunkSide).toBeCloseTo(20, 0);
        expect(measure({ yaw, trunkTwist: 30 }).trunkTwist).toBeCloseTo(30, 0);
      });
      it("neck flexion relative to trunk", () => {
        expect(measure({ yaw, neckFlex: 25 }).neckFlex).toBeCloseTo(25, 0);
        expect(measure({ yaw, trunkFlex: 30, neckFlex: 15 }).neckFlex).toBeCloseTo(15, 0);
      });
      it("upper arm flexion, abduction and elevation", () => {
        const m = measure({ yaw, shoulderFlexR: 70, shoulderAbdR: 0, shoulderFlexL: -30, shoulderAbdL: 0 });
        expect(m.shoulderFlexR).toBeCloseTo(70, 0);
        expect(m.shoulderElevR).toBeCloseTo(70, 0);
        expect(m.shoulderFlexL).toBeCloseTo(-30, 0);
        const a = measure({ yaw, shoulderFlexL: 0, shoulderAbdL: 60 });
        expect(a.shoulderAbdL).toBeCloseTo(60, 0);
        expect(a.shoulderElevL).toBeCloseTo(60, 0);
      });
      it("elbow, wrist and knee flexion", () => {
        const m = measure({ yaw, elbowFlexR: 90, wristFlexR: 30, hipFlexL: 30, kneeFlexL: 50 });
        expect(m.elbowFlexR).toBeCloseTo(90, 0);
        expect(m.wristFlexR).toBeCloseTo(30, 0);
        expect(m.kneeFlexL).toBeCloseTo(50, 0);
        expect(m.thighL).toBeCloseTo(30, 0);
      });
    });
  }

  it("hand height and horizontal distance are metric", () => {
    const m = measure({ shoulderFlexL: 90, shoulderFlexR: 90, elbowFlexL: 0, elbowFlexR: 0 });
    // Shoulder height ~ 0.9 (hip) + 0.5 (trunk) + ankle→floor offsets
    expect(m.handHeightR).toBeGreaterThan(1.3);
    expect(m.handHeightR).toBeLessThan(1.6);
    expect(m.handHoriz).toBeGreaterThan(0.5);
    expect(m.reachR).toBeGreaterThan(0.9);
  });

  it("detects unilateral stance", () => {
    const m = measure({ hipFlexL: 40, kneeFlexL: 60 });
    expect(m.footLift).toBeGreaterThan(0.1);
  });
});
