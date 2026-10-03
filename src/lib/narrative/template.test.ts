import { describe, expect, it } from "vitest";
import { analyzeSession } from "../ergo/analyze";
import { DEFAULT_SETTINGS } from "../ergo/settings";
import { demoTrack } from "../pose/synthetic";
import { factSheet, templateNarrative } from "./template";

describe("template narrative", () => {
  const a = analyzeSession({ tracks: [demoTrack(10, 60)], settings: { ...DEFAULT_SETTINGS, subjectHeightCm: 175, loadKg: 8 } });
  const n = templateNarrative(a, "Demo");

  it("covers the main sections", () => {
    expect(n.sections.map((s) => s.heading)).toEqual([
      "Overview",
      "Working postures",
      "Highest-risk moments",
      "Assessment results",
      "Recommendations",
      "Confidence and limitations",
    ]);
  });

  it("reports facts from the analysis", () => {
    const text = factSheet(n);
    expect(text).toContain(`REBA at ${a.summary.reba.max}`);
    expect(text).toMatch(/lifts and \d+ lowering movements were detected/);
    expect(text).toMatch(/NIOSH Lifting Index/);
    expect(text).toMatch(/overhead work/i);
    expect(text).not.toMatch(/NaN|undefined|Infinity/);
  });
});
