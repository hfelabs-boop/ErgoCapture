import { describe, expect, it } from "vitest";
import { computeFrameMeasures } from "../../ergo/measures";
import { NEUTRAL, synthesize, type SynthPose } from "../synthetic";
import { KP } from "../types";
import { COCO_WB_TO_BP, mapMhr70, mapRtmw, metresPerPixel, rtmwVisibility } from "./mapping";
import { MHR70_TO_BP } from "../importExport";

const W = 1280,
  H = 720;
const M_PER_PX = 0.004; // ground truth scale of the fake image

/** Fake RTMW3D output: x, y in pixels (scaled orthographic), z metric depth. */
function fakeRtmw(p: Partial<SynthPose>, score = 0.75) {
  const bp = synthesize({ ...NEUTRAL, ...p });
  const kp: number[][] = Array.from({ length: 133 }, () => [640, 360, 0]);
  for (const [src, dst] of Object.entries(COCO_WB_TO_BP)) {
    const q = bp[dst];
    kp[Number(src)] = [640 + q[0] / M_PER_PX, 360 + q[1] / M_PER_PX, q[2]];
  }
  return { kp, scores: kp.map(() => score) };
}

const angles = (o: Partial<SynthPose>) => {
  const { kp, scores } = fakeRtmw(o);
  const mapped = mapRtmw(kp, scores, W, H, 1.75)!;
  return computeFrameMeasures({ t: 0, image: mapped.image, world: mapped.world }, { scale: 1, calib: {}, detailedHands: true }).m;
};

describe("RTMW3D mapping", () => {
  it("recovers metres per pixel from segment proportions", () => {
    const { kp, scores } = fakeRtmw({ yaw: 50, trunkFlex: 30 });
    const m = metresPerPixel(kp, scores.map(rtmwVisibility), 1.75);
    expect(m).toBeGreaterThan(M_PER_PX * 0.9);
    expect(m).toBeLessThan(M_PER_PX * 1.1);
  });

  for (const yaw of [0, 60, 90]) {
    it(`preserves joint angles at camera yaw ${yaw}°`, () => {
      const m = angles({ yaw, trunkFlex: 40, neckFlex: 20, shoulderFlexR: 70, elbowFlexR: 80, wristFlexR: 30, hipFlexL: 30, kneeFlexL: 50 });
      expect(Math.abs(m.trunkFlex - 40)).toBeLessThan(4);
      expect(Math.abs(m.neckFlex - 20)).toBeLessThan(4);
      expect(Math.abs(m.shoulderElevR - 70)).toBeLessThan(4);
      expect(Math.abs(m.elbowFlexR - 80)).toBeLessThan(4);
      expect(Math.abs(m.wristFlexR - 30)).toBeLessThan(5);
      expect(Math.abs(m.kneeFlexL - 50)).toBeLessThan(4);
    });
  }

  it("normalises image coordinates and hip-centres world coordinates", () => {
    const { kp, scores } = fakeRtmw({});
    const r = mapRtmw(kp, scores, W, H, 1.75)!;
    expect(r.image[KP.nose].x).toBeGreaterThan(0);
    expect(r.image[KP.nose].x).toBeLessThan(1);
    expect(Math.abs(r.world[KP.leftHip].x + r.world[KP.rightHip].x)).toBeLessThan(1e-9);
  });

  it("maps low scores to low visibility", () => {
    expect(rtmwVisibility(0.15)).toBe(0);
    expect(rtmwVisibility(0.7)).toBeCloseTo(1);
    expect(rtmwVisibility(0.45)).toBeGreaterThan(0.4);
  });

  it("rejects non-whole-body output", () => {
    expect(mapRtmw([[0, 0, 0]], [1], W, H)).toBeNull();
  });
});

describe("MHR-70 mapping (InstantHMR / SAM 3D Body)", () => {
  it("preserves angles and flags off-image keypoints", () => {
    const bp = synthesize({ ...NEUTRAL, yaw: 40, trunkFlex: 35, wristFlexL: 25 });
    const kp3: number[][] = Array.from({ length: 70 }, () => [0, 0, 3]);
    const kp2: number[][] = Array.from({ length: 70 }, () => [640, 360]);
    for (const [src, dst] of Object.entries(MHR70_TO_BP)) {
      const q = bp[dst];
      kp3[Number(src)] = [q[0], q[1], q[2] + 3];
      kp2[Number(src)] = [640 + q[0] * 200, 360 + q[1] * 200];
    }
    kp2[0] = [-20, 100]; // nose outside the frame
    const r = mapMhr70(kp3, kp2, W, H)!;
    expect(r.world[KP.nose].v).toBeLessThan(r.world[KP.leftShoulder].v);
    const m = computeFrameMeasures({ t: 0, image: r.image, world: r.world }, { scale: 1, calib: {}, detailedHands: true }).m;
    expect(m.trunkFlex).toBeCloseTo(35, 0);
    expect(m.wristFlexL).toBeCloseTo(25, 0);
  });
});
