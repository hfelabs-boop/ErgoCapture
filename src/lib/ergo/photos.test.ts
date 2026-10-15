import { describe, expect, it } from "vitest";
import { NEUTRAL, synthesize, toFrame, type SynthPose } from "../pose/synthetic";
import { analyzePhotos, type PhotoInput } from "./photos";
import { DEFAULT_SETTINGS } from "./settings";

const photo = (id: string, o: Partial<SynthPose> | null): PhotoInput => {
  const f = o ? toFrame(synthesize({ ...NEUTRAL, yaw: 60, ...o }), 0, 0) : { image: null, world: null };
  return { id, name: `${id}.jpg`, width: 1280, height: 720, image: f.image, world: f.world, source: "test", detailedHands: false };
};

describe("photo analysis", () => {
  const inputs = [
    photo("neutral", {}),
    photo("stoop", { trunkFlex: 70, hipFlexL: 25, hipFlexR: 25, kneeFlexL: 70, kneeFlexR: 70, shoulderFlexL: 80, shoulderFlexR: 80 }),
    photo("overhead", { shoulderFlexL: 140, shoulderFlexR: 140, neckFlex: -20 }),
    photo("empty", null),
  ];
  const a = analyzePhotos(inputs, { ...DEFAULT_SETTINGS, subjectHeightCm: 175 }, {}, { staticHold: false, repetitive: false });

  it("scores each photo on its own", () => {
    expect(a.items[0].reba!.score).toBe(1);
    expect(a.items[0].rula!.score).toBe(2);
    expect(a.items[1].reba!.score).toBe(7);
    expect(a.items[2].owas!.parts.arms).toBe(3);
  });

  it("reports photos without a person and ranks the rest", () => {
    expect(a.items[3].found).toBe(false);
    expect(a.ranked).toHaveLength(3);
    expect(a.ranked[0]).toBe(1);
    expect(a.ranked.at(-1)).toBe(0);
    expect(a.notes.join(" ")).toMatch(/No person was found in 1 of 4/);
  });

  it("gives every score a confidence and a risk level", () => {
    for (const i of a.ranked) {
      expect(a.items[i].reba!.conf).toBeGreaterThan(0);
      expect(a.items[i].reba!.conf).toBeLessThanOrEqual(1);
    }
    expect(a.overallRisk).toBeGreaterThanOrEqual(2);
  });

  it("applies the held/repeated options to RULA and REBA", () => {
    const held = analyzePhotos(inputs, { ...DEFAULT_SETTINGS, subjectHeightCm: 175 }, {}, { staticHold: true, repetitive: true });
    expect(held.items[1].reba!.score).toBeGreaterThan(a.items[1].reba!.score);
    expect(held.items[1].rula!.parts.scoreC).toBeGreaterThan(a.items[1].rula!.parts.scoreC);
  });

  it("uses the entered stature", () => {
    expect(a.statureCm).toBe(175);
    expect(a.statureSource).toBe("entered");
  });
});
