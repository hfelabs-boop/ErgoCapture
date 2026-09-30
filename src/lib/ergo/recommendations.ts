import type { SessionAnalysis } from "./analyze";

type Partial = Omit<SessionAnalysis, "recommendations" | "overall">;

/** Rule-based, plain-language recommendations derived from the analysis. */
export function recommendations(a: Partial): string[] {
  const out: string[] = [];
  const tip = (name: string) => a.timeInPosture.find((t) => t.key === name);
  const pctAbove = (name: string, lo: number) =>
    tip(name)?.bands.filter((b) => b.lo >= lo).reduce((s, b) => s + b.pct, 0) ?? 0;

  const trunk60 = pctAbove("trunkFlex", 60);
  const trunk20 = pctAbove("trunkFlex", 20);
  if (trunk60 > 5)
    out.push(
      `Deep forward bending (> 60°) for ${trunk60.toFixed(0)}% of the time. Raise the work or the parts (lift tables, tilted bins, raised pallets) so work happens between knuckle and shoulder height.`,
    );
  else if (trunk20 > 25)
    out.push(
      `Trunk bent more than 20° for ${trunk20.toFixed(0)}% of the time. Check work height against elbow height and bring items closer to the body.`,
    );

  const neck = pctAbove("neckFlex", 20);
  if (neck > 25)
    out.push(
      `Neck flexed more than 20° for ${neck.toFixed(0)}% of the time. Raise displays, documents or the work object, or tilt it toward the worker.`,
    );

  const armHi = Math.max(pctAbove("shoulderElevL", 90), pctAbove("shoulderElevR", 90));
  const armMid = Math.max(pctAbove("shoulderElevL", 45), pctAbove("shoulderElevR", 45));
  if (armHi > 5)
    out.push(
      `Hands above shoulder height for ${armHi.toFixed(0)}% of the time. Lower shelves or controls, use platforms, or provide tool extensions.`,
    );
  else if (armMid > 30)
    out.push(`Upper arm raised above 45° for ${armMid.toFixed(0)}% of the time. Move work closer and lower, or add arm support.`);

  const wrist = Math.max(pctAbove("wristFlexL", 45), pctAbove("wristFlexR", 45));
  if (wrist > 15)
    out.push(
      `Strongly bent wrists for ~${wrist.toFixed(0)}% of the time (indicative). Consider bent-handle tools, re-orienting the work piece, or a different grip.`,
    );

  const knee = Math.max(pctAbove("kneeFlexL", 60), pctAbove("kneeFlexR", 60));
  if (knee > 10) out.push(`Deep squatting or kneeling for ${knee.toFixed(0)}% of the time. Raise low work or provide knee pads and a stool.`);

  if (a.reach.risk >= 2)
    out.push(
      `Frequent reaching near or beyond arm's length (max ${(Math.max(a.reach.maxReach.L, a.reach.maxReach.R) * 100).toFixed(0)}% of arm length). Move frequently used items into the primary zone (within ~50% of arm length).`,
    );

  if (a.niosh.lifts.length) {
    if (a.settings.loadKg <= 0)
      out.push(`${a.niosh.lifts.length} lift/lower events were detected. Enter the load weight to compute the NIOSH Lifting Index.`);
    else if (a.niosh.maxLi > 1) {
      const worst = [...a.niosh.lifts].sort((x, y) => y.li - x.li)[0];
      const m = worst.multipliers;
      const limiting = Object.entries(m).sort((x, y) => x[1] - y[1])[0];
      const hints: Record<string, string> = {
        HM: "bring the load closer to the body (reduce horizontal distance)",
        VM: "move the origin/destination closer to knuckle height (~75 cm)",
        DM: "reduce the vertical travel distance",
        AM: "remove twisting by re-positioning origin and destination in front of the worker",
        FM: "reduce lifting frequency or add rotation/breaks",
        CM: "improve handles or containers (coupling)",
      };
      if (!Number.isFinite(a.niosh.maxLi) || worst.rwl <= 0) {
        out.push(
          `NIOSH: at least one lift falls outside the equation's limits (RWL = 0, limiting factor ${limiting[0]}): ${hints[limiting[0]]}. This lift should not be performed manually as designed.`,
        );
        return finish(out, a);
      }
      out.push(
        `NIOSH Lifting Index up to ${a.niosh.maxLi.toFixed(2)}. The most limiting factor is ${limiting[0]} (${limiting[1].toFixed(2)}): ${hints[limiting[0]]}. Also consider reducing the load below ${worst.rwl.toFixed(1)} kg or using lift assists.`,
      );
    }
  }

  return finish(out, a);
}

function finish(out: string[], a: Partial): string[] {
  const si = Math.max(...a.strainIndex.map((s) => s.si));
  if (si >= 7) out.push(`Strain Index ${si.toFixed(1)} (probably hazardous for distal upper-limb disorders). Reduce exertion intensity, frequency or wrist deviation; add job rotation.`);
  const ocra = Math.max(...a.ocra.map((o) => o.score));
  if (ocra > 14) out.push(`OCRA checklist score ${ocra.toFixed(1)}. Reduce technical actions per minute, improve recovery periods, and address awkward postures.`);

  const bad = Object.entries(a.staticPosture.summary).filter(([, v]) => v === "not acceptable");
  if (bad.length)
    out.push(`Static postures exceed ISO 11226 / EN 1005-4 limits for: ${bad.map(([k]) => k).join(", ")}. Add support, change work height, or break up holds.`);

  for (const w of a.workstation) if (!w.ok) out.push(`${w.item}: ${w.advice}.`);

  if (!out.length) out.push("No major posture risks identified in the recorded period. Re-assess if the task, workstation or worker changes.");
  return out;
}
