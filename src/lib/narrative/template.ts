import type { SessionAnalysis } from "../ergo/analyze";
import { OWAS_AC_TEXT } from "../ergo/owas";
import { confidenceLevel, RISK_NAMES } from "../ergo/risk";
import { summaryRows } from "../export/reportModel";
import { SEGMENT_LABELS } from "../pose/types";

/**
 * Plain-language narrative written directly from the computed analysis.
 * Deterministic, instant and works on any device; every number in it comes
 * from the analysis. The optional AI narrative rewrites these same facts.
 */

export interface NarrativeSection {
  heading: string;
  paragraphs: string[];
}

export interface Narrative {
  title: string;
  source: "template" | "ai";
  model?: string;
  sections: NarrativeSection[];
  /** Short descriptions of key video frames, when an AI vision model was used */
  frameNotes?: Array<{ t: number; text: string }>;
}

const pct = (x: number) => `${Math.round(x)}%`;
const secs = (s: number) => (s >= 90 ? `${(s / 60).toFixed(1)} min` : `${Math.round(s)} s`);
const at = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

function bandShare(a: SessionAnalysis, key: string, lo: number) {
  return a.timeInPosture.find((t) => t.key === key)?.bands.filter((b) => b.lo >= lo).reduce((s, b) => s + b.pct, 0) ?? 0;
}

export function templateNarrative(a: SessionAnalysis, title: string): Narrative {
  const S: NarrativeSection[] = [];
  const views = a.views.map((v) => `${v.label} (${v.source})`);

  // Overview
  const acts = new Map<string, number>();
  for (const s of a.activities) if (s.label !== "No person") acts.set(s.label, (acts.get(s.label) ?? 0) + (s.end - s.start));
  const topActs = [...acts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
  S.push({
    heading: "Overview",
    paragraphs: [
      `This assessment covers ${secs(a.duration)} of recording from ${a.views.length === 1 ? "one camera view" : `${a.views.length} synchronised camera views`}: ${list(views)}. The worker was detected in ${pct(a.dataQuality.validPct)} of the analysed frames.`,
      topActs.length
        ? `Most of the time was spent on ${list(topActs.map(([l, d]) => `${l.toLowerCase()} (${secs(d)})`))}.`
        : "No distinct activities were identified.",
      `Overall the task is rated ${RISK_NAMES[a.overall.risk].toLowerCase()} risk. ${a.overall.headline}.`,
    ],
  });

  // Posture
  const p: string[] = [];
  const trunk20 = bandShare(a, "trunkFlex", 20),
    trunk60 = bandShare(a, "trunkFlex", 60);
  if (trunk20 > 5) p.push(`The trunk was bent forward more than 20° for ${pct(trunk20)} of the time${trunk60 > 1 ? `, including ${pct(trunk60)} beyond 60°` : ""}.`);
  else p.push("The trunk stayed mostly upright.");
  const neck20 = bandShare(a, "neckFlex", 20);
  if (neck20 > 5) p.push(`The neck was flexed more than 20° for ${pct(neck20)} of the time.`);
  const armHi = Math.max(bandShare(a, "shoulderElevL", 90), bandShare(a, "shoulderElevR", 90));
  const armMid = Math.max(bandShare(a, "shoulderElevL", 45), bandShare(a, "shoulderElevR", 45));
  if (armHi > 2) p.push(`At least one hand worked at or above shoulder height for ${pct(armHi)} of the time.`);
  else if (armMid > 10) p.push(`The upper arms were raised above 45° for ${pct(armMid)} of the time.`);
  const wrist = Math.max(bandShare(a, "wristFlexL", 45), bandShare(a, "wristFlexR", 45));
  if (wrist > 5) p.push(`Strongly bent wrists (over 45°) appeared in ${pct(wrist)} of frames.`);
  const knee = Math.max(bandShare(a, "kneeFlexL", 60), bandShare(a, "kneeFlexR", 60));
  if (knee > 5) p.push(`Deep knee bending (over 60°) occurred for ${pct(knee)} of the time.`);
  const exposed = [...a.exposure].sort((x, y) => y.pctElevated - x.pctElevated).filter((e) => e.pctElevated >= 10).slice(0, 3);
  if (exposed.length)
    p.push(`The most exposed body parts were ${list(exposed.map((e) => `the ${SEGMENT_LABELS[e.segment].toLowerCase()} (${pct(e.pctElevated)} of the time at medium risk or higher)`))}.`);
  S.push({ heading: "Working postures", paragraphs: [p.join(" ")] });

  // Key moments
  const moments = a.summary.reba.worstFrames.slice(0, 3).map((i) => {
    const r = a.reba[i];
    return `at ${at(a.frames[i].t)} (REBA ${r.score}${r.drivers.length ? `: ${r.drivers.slice(0, 3).join(", ").toLowerCase()}` : ""})`;
  });
  if (moments.length)
    S.push({
      heading: "Highest-risk moments",
      paragraphs: [
        `The highest whole-body scores occurred ${list(moments)}. RULA peaked at ${a.summary.rula.max} and REBA at ${a.summary.reba.max}; 90% of the time REBA stayed at or below ${a.summary.reba.p90}.`,
      ],
    });

  // Methods results
  const m: string[] = [];
  const ac = a.owasDist.ac;
  const worstAc = ac.reduce((best, v, i) => (v >= 1 ? i : best), 0);
  m.push(`OWAS placed ${pct(ac[0])} of the time in action category 1; the most severe category reached for at least 1% of the time was ${OWAS_AC_TEXT[worstAc + 1]}.`);
  const n = a.niosh;
  if (n.lifts.length) {
    const lifts = n.lifts.filter((l) => l.kind === "lift").length;
    m.push(
      a.settings.loadKg > 0
        ? `${lifts} lifts and ${n.lifts.length - lifts} lowering movements were detected (${n.frequency.toFixed(1)} per minute). With a load of ${a.settings.loadKg} kg the highest NIOSH Lifting Index is ${Number.isFinite(n.maxLi) ? n.maxLi.toFixed(2) : "above 3 (outside the equation's limits)"} (${n.label}).`
        : `${lifts} lifts and ${n.lifts.length - lifts} lowering movements were detected; enter the load weight to obtain the NIOSH Lifting Index.`,
    );
  }
  const si = [...a.strainIndex].sort((x, y) => y.si - x.si)[0];
  const oc = [...a.ocra].sort((x, y) => y.score - x.score)[0];
  if (si && oc)
    m.push(
      `For repetitive hand and arm work, the Strain Index is ${si.si.toFixed(1)} on the ${si.side === "L" ? "left" : "right"} side (${si.label.toLowerCase()}) and the OCRA checklist score is ${oc.score.toFixed(1)} (${oc.label.toLowerCase()}).`,
    );
  const bad = Object.entries(a.staticPosture.summary).filter(([, v]) => v === "not acceptable").map(([k]) => k.toLowerCase());
  m.push(bad.length ? `Static postures exceeded ISO 11226 / EN 1005-4 limits for the ${list(bad)}.` : "No static posture exceeded the ISO 11226 / EN 1005-4 limits.");
  const beyond = Math.max(a.reach.zonePct.L.beyond, a.reach.zonePct.R.beyond);
  if (beyond > 2) m.push(`Hands were beyond comfortable reach (needing a trunk lean) for ${pct(beyond)} of the time.`);
  for (const w of a.workstation) if (!w.ok) m.push(`${w.item}: ${w.advice}.`);
  S.push({ heading: "Assessment results", paragraphs: m });

  S.push({ heading: "Recommendations", paragraphs: a.recommendations });

  // Confidence
  const rows = summaryRows(a);
  const low = rows.filter((r) => r.confLevel === "low").map((r) => r.method);
  S.push({
    heading: "Confidence and limitations",
    paragraphs: [
      `Mean confidence is ${confidenceLevel(a.summary.reba.meanConf)} for REBA (${pct(a.summary.reba.meanConf * 100)}) and ${confidenceLevel(a.summary.rula.meanConf)} for RULA (${pct(a.summary.rula.meanConf * 100)}).${low.length ? ` Results with low confidence: ${list(low)}.` : ""}`,
      ...a.dataQuality.notes,
      "This narrative was generated automatically from measured postures. It is a screening result and should be reviewed by a qualified ergonomist.",
    ],
  });
  return { title, source: "template", sections: S };
}

/** The template narrative as a compact fact sheet (input for the AI writer). */
export function factSheet(n: Narrative): string {
  return n.sections.map((s) => `## ${s.heading}\n${s.paragraphs.map((p) => `- ${p}`).join("\n")}`).join("\n\n");
}
