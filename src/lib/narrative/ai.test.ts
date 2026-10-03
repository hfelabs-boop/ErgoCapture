import { describe, expect, it } from "vitest";
import { guardClaims, guardNumbers, numbersIn, parseSections } from "./aiCore";

describe("AI narrative guards", () => {
  it("parses markdown sections and strips thinking", () => {
    const s = parseSections("<think>hmm</think>\n## Overview\nThe task lasted 60 s.\n\n## Main risks\n- Trunk bent 27% of the time.\n- REBA peaked at 11.");
    expect(s.map((x) => x.heading)).toEqual(["Overview", "Main risks"]);
    expect(s[1].paragraphs).toEqual(["Trunk bent 27% of the time.", "REBA peaked at 11."]);
  });

  it("drops sentences with invented numbers", () => {
    const facts = "REBA peaked at 11. Trunk bent 27% of the time. Lifting Index 4.08.";
    const { sections, removed } = guardNumbers(
      [{ heading: "Risks", paragraphs: ["REBA reached 11. The lifting index was 4.08. Injury risk rises 35% per year."] }],
      facts,
    );
    expect(removed).toBe(1);
    expect(sections[0].paragraphs[0]).toBe("REBA reached 11. The lifting index was 4.08.");
  });

  it("normalises numbers", () => {
    expect(numbersIn("4.080 and 27%").has("4.08")).toBe(true);
  });

  it("drops reassuring sentences that contradict a medium-or-higher risk", () => {
    const sections = [
      {
        heading: "Confidence",
        paragraphs: [
          "The assessment concluded that the posture meets standard safety criteria. REBA peaked at 11. Static postures were not within acceptable limits.",
        ],
      },
    ];
    const high = guardClaims(sections, 4);
    expect(high.removed).toBe(1);
    expect(high.sections[0].paragraphs[0]).toBe("REBA peaked at 11. Static postures were not within acceptable limits.");
    expect(guardClaims(sections, 0).removed).toBe(0);
  });
});
