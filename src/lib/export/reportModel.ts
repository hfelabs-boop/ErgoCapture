import type { SessionAnalysis } from "../ergo/analyze";
import { MEASURE_DEFS, type MeasureKey } from "../ergo/measures";
import { OWAS_ARMS, OWAS_BACK, OWAS_LEGS } from "../ergo/owas";
import { confidenceLevel, RISK_NAMES, type ConfidenceLevel, type RiskLevel } from "../ergo/risk";
import { SEGMENT_LABELS } from "../pose/types";

/** Format-neutral report content, rendered to PDF, Word and the on-screen summary. */

export interface SummaryRow {
  method: string;
  result: string;
  risk: RiskLevel;
  riskText: string;
  conf: number;
  confLevel: ConfidenceLevel;
}

export interface Table {
  head: string[];
  rows: string[][];
}

export interface Section {
  heading: string;
  paragraphs?: string[];
  table?: Table;
}

const pct = (x: number) => `${x.toFixed(0)}%`;
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : "–");
const fmtT = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

export function meanConf(a: SessionAnalysis, keys: MeasureKey[]) {
  const v = a.frames.filter((f) => f.valid);
  if (!v.length) return 0;
  return v.reduce((s, f) => s + keys.reduce((q, k) => q + f.c[k], 0) / keys.length, 0) / v.length;
}

export function summaryRows(a: SessionAnalysis): SummaryRow[] {
  const row = (method: string, result: string, risk: RiskLevel, conf: number, riskText = RISK_NAMES[risk]): SummaryRow => ({
    method,
    result,
    risk,
    riskText,
    conf,
    confLevel: confidenceLevel(conf),
  });
  const s = a.summary;
  const rows: SummaryRow[] = [];
  const rulaRisk = a.rula.find((r) => r.score === s.rula.p90)?.risk ?? 0;
  rows.push(
    row(
      "RULA",
      `Typical high (P90) ${s.rula.p90}, peak ${s.rula.max}, median ${s.rula.median}; ${pct(s.rula.pctByRisk[3] + s.rula.pctByRisk[4])} of time at action level 3–4`,
      rulaRisk,
      s.rula.representativeConf,
      a.rula.find((r) => r.score === s.rula.p90)?.label,
    ),
  );
  const rebaRisk = a.reba.find((r) => r.score === s.reba.p90)?.risk ?? 0;
  rows.push(
    row(
      "REBA",
      `Typical high (P90) ${s.reba.p90}, peak ${s.reba.max}, median ${s.reba.median}; ${pct(s.reba.pctByRisk[3] + s.reba.pctByRisk[4])} of time high or very high`,
      rebaRisk,
      s.reba.representativeConf,
      a.reba.find((r) => r.score === s.reba.p90)?.label,
    ),
  );
  const ac = a.owasDist.ac;
  const owasRisk = (ac[3] > 1 ? 4 : ac[2] > 5 ? 3 : ac[1] > 30 ? 2 : ac[1] > 5 ? 1 : 0) as RiskLevel;
  rows.push(row("OWAS", ac.map((p, i) => `AC${i + 1} ${pct(p)}`).join(", "), owasRisk, s.owas.meanConf));
  const n = a.niosh;
  const lifts = n.lifts.filter((l) => l.kind === "lift").length;
  const nioshConf = n.lifts.length ? Math.min(...n.lifts.map((l) => l.conf)) * (a.settings.subjectHeightCm > 0 ? 1 : 0.7) : 0;
  rows.push(
    row(
      "NIOSH lifting",
      n.lifts.length
        ? `${lifts} lifts, ${n.lifts.length - lifts} lowers, ${f1(n.frequency)}/min (${n.frequencySource}); max LI ${Number.isFinite(n.maxLi) ? n.maxLi.toFixed(2) : "> 3 (outside limits)"}`
        : "No lifts detected",
      n.risk,
      nioshConf,
      n.label,
    ),
  );
  for (const si of a.strainIndex)
    rows.push(
      row(
        `Strain Index (${si.side === "L" ? "left" : "right"})`,
        `SI ${f1(si.si)}: ${si.label}`,
        si.risk,
        meanConf(a, [`wristFlex${si.side}`, `elbowFlex${si.side}`]) * 0.8,
        si.label,
      ),
    );
  for (const o of a.ocra)
    rows.push(
      row(
        `OCRA checklist (${o.side === "L" ? "left" : "right"})`,
        `Score ${f1(o.score)} (${f1(o.actionsPerMin)} actions/min est.)`,
        o.risk,
        meanConf(a, [`shoulderElev${o.side}`, `elbowFlex${o.side}`]) * 0.7,
        o.label,
      ),
    );
  const verdicts = Object.entries(a.staticPosture.summary);
  rows.push(
    row(
      "ISO 11226 / EN 1005-4",
      verdicts.length ? verdicts.map(([k, v]) => `${k}: ${v}`).join("; ") : "No static holds ≥ 4 s",
      a.staticPosture.risk,
      meanConf(a, ["trunkFlex", "neckFlex", "shoulderElevL", "shoulderElevR"]),
    ),
  );
  const r = a.reach;
  rows.push(
    row(
      "Reach zones",
      `Beyond reach L ${pct(r.zonePct.L.beyond)} / R ${pct(r.zonePct.R.beyond)}; hands above shoulder L ${pct(r.aboveShoulderPct.L)} / R ${pct(r.aboveShoulderPct.R)}`,
      r.risk,
      meanConf(a, ["reachL", "reachR"]),
    ),
  );
  const fitBad = a.workstation.filter((w) => !w.ok);
  rows.push(
    row(
      "Anthropometric fit",
      a.workstation.length
        ? fitBad.length
          ? fitBad.map((w) => `${w.item}: ${w.advice}`).join("; ")
          : "Workstation dimensions fit this worker"
        : `Stature ${a.anthropometry.statureCm.toFixed(0)} cm (${a.anthropometry.statureSource}); enter workstation dimensions to assess fit`,
      (fitBad.length ? 2 : 0) as RiskLevel,
      a.anthropometry.conf,
    ),
  );
  return rows;
}

export function buildSections(a: SessionAnalysis): Section[] {
  const sec: Section[] = [];
  sec.push({
    heading: "Time in posture",
    table: {
      head: ["Joint", ...["Band 1", "Band 2", "Band 3", "Band 4"]],
      rows: a.timeInPosture.map((t) => [t.label, ...t.bands.map((b) => `${b.label}: ${pct(b.pct)}`), ...Array(4 - t.bands.length).fill("")]),
    },
  });
  sec.push({
    heading: "Body exposure",
    table: {
      head: ["Body part", "Medium+ risk time", "High risk time"],
      rows: a.exposure.map((e) => [SEGMENT_LABELS[e.segment], pct(e.pctElevated), pct(e.pctHigh)]),
    },
  });
  sec.push({
    heading: "OWAS posture distribution",
    table: {
      head: ["Category", "Code", "Time"],
      rows: [
        ...OWAS_BACK.map((l, i) => ["Back", `${i + 1} ${l}`, pct(a.owasDist.back[i])]),
        ...OWAS_ARMS.map((l, i) => ["Arms", `${i + 1} ${l}`, pct(a.owasDist.arms[i])]),
        ...OWAS_LEGS.map((l, i) => ["Legs", `${i + 1} ${l}`, pct(a.owasDist.legs[i])]),
      ],
    },
  });
  if (a.niosh.lifts.length)
    sec.push({
      heading: "NIOSH lifting events",
      paragraphs: [
        `Load ${a.settings.loadKg} kg, frequency ${f1(a.niosh.frequency)} lifts/min, ${a.settings.taskHoursPerDay} h/day, coupling ${a.settings.coupling}. H, V and A are measured from the skeleton at the origin and destination of each event.`,
      ],
      table: {
        head: ["#", "Type", "Time", "H cm", "V cm", "D cm", "A°", "RWL kg", "LI", "Conf."],
        rows: a.niosh.lifts.map((l, i) => [
          String(i + 1),
          l.kind,
          fmtT(l.start),
          `${l.origin.H.toFixed(0)}→${l.destination.H.toFixed(0)}`,
          `${l.origin.V.toFixed(0)}→${l.destination.V.toFixed(0)}`,
          l.D.toFixed(0),
          `${l.origin.A.toFixed(0)}→${l.destination.A.toFixed(0)}`,
          l.rwl.toFixed(1),
          Number.isFinite(l.li) ? l.li.toFixed(2) : "∞",
          confidenceLevel(l.conf),
        ]),
      },
    });
  sec.push({
    heading: "Repetitive work (Strain Index and OCRA)",
    table: {
      head: ["Side", "Efforts/min", "Duty cycle", "Wrist P75", "SI", "OCRA actions/min", "OCRA posture", "OCRA score"],
      rows: (["L", "R"] as const).map((s, i) => {
        const si = a.strainIndex[i];
        const o = a.ocra[i];
        return [
          s === "L" ? "Left" : "Right",
          f1(si.inputs.effortsPerMin),
          pct(si.inputs.dutyCyclePct),
          `${f1(si.inputs.wristFlexP75)}°`,
          `${f1(si.si)} (${si.label})`,
          f1(o.actionsPerMin),
          f1(o.factors.posture),
          `${f1(o.score)} (${o.label})`,
        ];
      }),
    },
  });
  sec.push({
    heading: "Repetition counting",
    table: {
      head: ["Signal", "Cycles", "Per minute", "Cycle time", "Amplitude"],
      rows: a.cycles
        .filter((c) => c.cycles > 0)
        .map((c) => [
          c.label,
          String(c.cycles),
          f1(c.perMin),
          Number.isFinite(c.cycleTime) ? `${c.cycleTime.toFixed(1)} s` : "–",
          c.key.startsWith("handHeight") ? `${(c.amplitude * 100).toFixed(0)} cm` : `${f1(c.amplitude)}°`,
        ]),
    },
  });
  const holds = a.staticPosture.holds.filter((h) => h.verdict !== "acceptable");
  sec.push({
    heading: "Static postures (ISO 11226 / EN 1005-4)",
    paragraphs: holds.length ? undefined : ["No static hold exceeded the standards' limits."],
    table: holds.length
      ? {
          head: ["Body part", "From", "Duration", "Angle", "Verdict", "Reason"],
          rows: holds.slice(0, 30).map((h) => [h.part, fmtT(h.start), `${h.duration.toFixed(0)} s`, `${h.angle.toFixed(0)}°`, h.verdict, h.reason]),
        }
      : undefined,
  });
  sec.push({
    heading: "Activities",
    table: {
      head: ["Activity", "Start", "End", "Duration"],
      rows: a.activities
        .filter((s) => s.end - s.start >= 1)
        .slice(0, 40)
        .map((s) => [s.label, fmtT(s.start), fmtT(s.end), `${(s.end - s.start).toFixed(1)} s`]),
    },
  });
  const an = a.anthropometry;
  sec.push({
    heading: "Anthropometry and workstation fit",
    paragraphs: [
      `Stature ${an.statureCm.toFixed(0)} cm (${an.statureSource}). Segment lengths are medians over the recording; standing heights combine them with population proportions.`,
    ],
    table: {
      head: ["Dimension", "cm"],
      rows: [
        ...Object.entries(an.segmentsCm).map(([k, v]) => [k.replace(/([A-Z])/g, " $1").toLowerCase(), f1(v)]),
        ...Object.entries(an.derivedCm).map(([k, v]) => [k.replace(/([A-Z])/g, " $1").toLowerCase(), f1(v)]),
        ...a.workstation.map((w) => [
          w.item,
          `${w.actualCm.toFixed(0)} (recommended ${w.recommendedCm[0].toFixed(0)}–${w.recommendedCm[1].toFixed(0)}) ${w.ok ? "✓" : "✗"}`,
        ]),
      ],
    },
  });
  sec.push({
    heading: "Data quality and confidence",
    paragraphs: [
      `Person detected in ${pct(a.dataQuality.validPct)} of frames; ${pct(a.dataQuality.interpolatedPct)} gap-filled.`,
      ...a.views.map(
        (v) =>
          `${v.label}: coverage ${pct(v.coveragePct)}, mean keypoint visibility ${pct(v.meanVisibility * 100)}, mean view angle to body ${Number.isFinite(v.meanYaw) ? v.meanYaw.toFixed(0) + "°" : "–"} (0° = frontal, 90° = side).`,
      ),
      ...a.dataQuality.notes,
      "Confidence combines keypoint visibility, how well the camera sees each joint's plane of motion, and score stability: every frame is re-scored with angles perturbed by their estimated error, and the share of re-scores landing on the same risk level is reported.",
    ],
  });
  return sec;
}

export function methodsText(): string[] {
  return [
    "Pose: MediaPipe Pose Landmarker (33 keypoints, 2D + metric 3D), smoothed with a bidirectional One-Euro filter; gaps ≤ 0.6 s are interpolated. Multi-camera sessions are time-aligned and fused per joint angle, weighted by confidence.",
    "RULA: McAtamney & Corlett (1993). REBA: Hignett & McAtamney (2000). OWAS: Karhu et al. (1977). Revised NIOSH Lifting Equation: Waters et al. (1993). Strain Index: Moore & Garg (1995). OCRA checklist: Colombini et al. (2002), screening-level implementation. ISO 11226:2000 and EN 1005-4:2005 static and movement limits, with linearised holding-time curves.",
    "Values not observable from video (load weight, coupling quality, exertion intensity, recovery periods) are taken from the task settings. Forearm rotation (RULA wrist twist) is assumed mid-range.",
    "This is a screening tool. Results should be reviewed by a qualified ergonomist before decisions are made.",
  ];
}

export const MEASURE_LABEL = Object.fromEntries(MEASURE_DEFS.map((d) => [d.key, d.label])) as Record<MeasureKey, string>;
