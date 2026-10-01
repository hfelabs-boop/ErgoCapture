import { describe, expect, it } from "vitest";
import { computeFrameMeasures } from "../ergo/measures";
import { importGenericPose, parsePoseJson, type GenericPoseFile } from "./importExport";
import { NEUTRAL, synthesize, type SynthPose } from "./synthetic";
import { KP } from "./types";

// MHR70 index → BlazePose index (inverse of the importer's table), to fake SAM 3D Body output.
const BP_FOR_MHR: Record<number, number> = {
  0: KP.nose, 1: KP.leftEye, 2: KP.rightEye, 3: KP.leftEar, 4: KP.rightEar,
  5: KP.leftShoulder, 6: KP.rightShoulder, 7: KP.leftElbow, 8: KP.rightElbow,
  9: KP.leftHip, 10: KP.rightHip, 11: KP.leftKnee, 12: KP.rightKnee, 13: KP.leftAnkle, 14: KP.rightAnkle,
  15: KP.leftFootIndex, 16: KP.leftFootIndex, 17: KP.leftHeel, 18: KP.rightFootIndex, 19: KP.rightFootIndex, 20: KP.rightHeel,
  21: KP.rightThumb, 28: KP.rightIndex, 40: KP.rightPinky, 41: KP.rightWrist,
  42: KP.leftThumb, 49: KP.leftIndex, 61: KP.leftPinky, 62: KP.leftWrist,
  67: KP.leftShoulder, 68: KP.rightShoulder,
};

function mhrFrame(p: Partial<SynthPose>, offset = [0.1, -0.2, 3.0]) {
  const bp = synthesize({ ...NEUTRAL, ...p });
  // Camera frame (y down, z forward), translated away from the camera like pred_keypoints_3d + cam_t.
  return Array.from({ length: 70 }, (_, i) => {
    const q = BP_FOR_MHR[i] !== undefined ? bp[BP_FOR_MHR[i]] : bp[KP.leftHip];
    return [q[0] + offset[0], q[1] + offset[1], q[2] + offset[2], 0.9];
  });
}

describe("SAM 3D Body (mhr70) import", () => {
  const poses: Partial<SynthPose>[] = [
    { yaw: 60, trunkFlex: 45, wristFlexR: 30, elbowFlexR: 80 },
    { yaw: 0, shoulderFlexL: 100, kneeFlexR: 50, hipFlexR: 30 },
  ];
  const file: GenericPoseFile = {
    format: "mhr70",
    fps: 10,
    source: "SAM 3D Body (dinov3)",
    frames: poses.map((p, i) => ({ t: i / 10, keypoints3d: mhrFrame(p) })),
  };

  it("maps keypoints so joint angles are preserved", () => {
    const track = importGenericPose(file);
    expect(track.source).toBe("SAM 3D Body (dinov3)");
    expect(track.detailedHands).toBe(true);
    const m0 = computeFrameMeasures(track.frames[0], { scale: 1, calib: {}, detailedHands: true }).m;
    expect(m0.trunkFlex).toBeCloseTo(45, 0);
    expect(m0.wristFlexR).toBeCloseTo(30, 0);
    expect(m0.elbowFlexR).toBeCloseTo(80, 0);
    const m1 = computeFrameMeasures(track.frames[1], { scale: 1, calib: {}, detailedHands: true }).m;
    expect(m1.shoulderElevL).toBeCloseTo(100, 0);
    expect(m1.kneeFlexR).toBeCloseTo(50, 0);
  });

  it("re-centres on the hips", () => {
    const w = importGenericPose(file).frames[0].world!;
    expect(Math.abs((w[KP.leftHip].x + w[KP.rightHip].x) / 2)).toBeLessThan(1e-9);
  });

  it("gives detailed-hand wrist angles more confidence than coarse landmarks", () => {
    const f = importGenericPose(file).frames[0];
    const fine = computeFrameMeasures(f, { scale: 1, calib: {}, detailedHands: true }).c.wristFlexR;
    const coarse = computeFrameMeasures(f, { scale: 1, calib: {} }).c.wristFlexR;
    expect(fine).toBeGreaterThan(coarse);
  });

  it("is accepted by the generic JSON parser", () => {
    expect(parsePoseJson(JSON.stringify(file)).tracks).toHaveLength(1);
  });
});
