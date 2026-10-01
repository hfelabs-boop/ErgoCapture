"use client";

import { analyzeSession, type SessionAnalysis } from "@/lib/ergo/analyze";
import { BAND_DEFS } from "@/lib/ergo/exposure";
import { MEASURE_DEFS } from "@/lib/ergo/measures";
import { OWAS_ARMS, OWAS_BACK, OWAS_LEGS, OWAS_LOAD } from "@/lib/ergo/owas";
import { RISK_COLORS, type RiskLevel, type ScoredFrame } from "@/lib/ergo/risk";
import { analysisToCsv, download } from "@/lib/export/csv";
import { buildReportImages } from "@/lib/export/images";
import { summaryRows } from "@/lib/export/reportModel";
import { makeSessionFile } from "@/lib/pose/importExport";
import { selectedTracks, useStore } from "@/lib/store";
import { useCallback, useMemo, useState } from "react";
import { BodyHeatmap } from "./BodyHeatmap";
import { Player } from "./Player";
import { SettingsPanel } from "./SettingsPanel";
import { Timeline } from "./Timeline";
import { Button, Card, ConfBadge, RiskBadge, Stat, Tabs, Toggle } from "./ui";

type Tab = "summary" | "rula" | "reba" | "owas" | "niosh" | "repetitive" | "static" | "reach" | "body" | "data";

const fmtT = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const pct = (x: number) => `${x.toFixed(0)}%`;
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : "–");

export function Results({ a }: { a: SessionAnalysis }) {
  const views = useStore((s) => s.views);
  const privacy = useStore((s) => s.privacy);
  const setPrivacy = useStore((s) => s.setPrivacy);
  const settings = useStore((s) => s.settings);
  const calib = useStore((s) => s.calib);
  const setAnalysis = useStore((s) => s.setAnalysis);
  const title = useStore((s) => s.title);
  const setTitle = useStore((s) => s.setTitle);
  const [tab, setTab] = useState<Tab>("summary");
  const [time, setTime] = useState(a.frames[0]?.t ?? 0);
  const [busy, setBusy] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const tracks = useMemo(() => selectedTracks(views), [views]);
  const primaryView = views.find((v) => v.processed?.tracks.length);
  const primaryTrack = tracks[0];
  const i = Math.max(0, Math.min(a.frames.length - 1, Math.round((time - (a.frames[0]?.t ?? 0)) * a.fps)));
  const rows = useMemo(() => summaryRows(a), [a]);
  const seek = useCallback((t: number) => setTime(t), []);

  const reanalyze = () => {
    setBusy("Re-scoring…");
    setTimeout(() => {
      setAnalysis(analyzeSession({ tracks, settings, calib }));
      setBusy(null);
      setShowSettings(false);
    }, 20);
  };

  const exportReport = async (kind: "pdf" | "docx") => {
    setBusy(kind === "pdf" ? "Building PDF…" : "Building Word document…");
    try {
      const images = await buildReportImages(a, primaryTrack, primaryView?.url, privacy, primaryView?.offsetSec ?? 0);
      const name = `${title.replace(/[^\w-]+/g, "_") || "ergocapture"}`;
      if (kind === "pdf") {
        const { exportPdf } = await import("@/lib/export/pdf");
        download(`${name}.pdf`, await exportPdf(a, images, title), "application/pdf");
      } else {
        const { exportDocx } = await import("@/lib/export/docx");
        download(`${name}.docx`, await exportDocx(a, images, title), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      }
    } catch (e) {
      alert(`Export failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 text-xl font-semibold hover:border-slate-200 focus:border-sky-500 focus:outline-none"
          aria-label="Assessment title"
        />
        <RiskBadge risk={a.overall.risk} text={`Overall: ${["negligible", "low", "medium", "high", "very high"][a.overall.risk]} risk`} size="lg" />
        <Button variant="secondary" onClick={() => setShowSettings(!showSettings)}>
          Task settings
        </Button>
        <Button onClick={() => exportReport("pdf")} disabled={!!busy}>
          PDF report
        </Button>
        <Button variant="secondary" onClick={() => exportReport("docx")} disabled={!!busy}>
          Word
        </Button>
        <Button variant="secondary" onClick={() => download("ergocapture-data.csv", analysisToCsv(a), "text/csv")}>
          CSV
        </Button>
      </div>
      {busy && <div className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">{busy}</div>}
      {showSettings && (
        <Card title="Task settings" actions={<Button onClick={reanalyze}>Re-score with these settings</Button>}>
          <SettingsPanel />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <Player a={a} track={primaryTrack} videoUrl={primaryView?.url} offsetSec={primaryView?.offsetSec ?? 0} privacy={privacy} time={time} onTime={seek} />
          <div className="mt-3 flex flex-wrap gap-4">
            <Toggle checked={privacy.blurFaces} onChange={(v) => setPrivacy({ blurFaces: v })} label="Blur faces" />
            <Toggle checked={privacy.skeletonOnly} onChange={(v) => setPrivacy({ skeletonOnly: v })} label="Skeleton only (hide video)" />
          </div>
        </Card>
        <FramePanel a={a} i={i} />
      </div>

      <Card title="Timeline" actions={<span className="text-xs text-slate-400">Click to jump; ▼ marks the highest-risk moments</span>}>
        <Timeline a={a} time={time} onSeek={seek} />
      </Card>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "summary", label: "Summary" },
          { key: "rula", label: "RULA" },
          { key: "reba", label: "REBA" },
          { key: "owas", label: "OWAS" },
          { key: "niosh", label: "NIOSH lifting" },
          { key: "repetitive", label: "OCRA / Strain Index" },
          { key: "static", label: "ISO 11226 / EN 1005-4" },
          { key: "reach", label: "Reach & fit" },
          { key: "body", label: "Body heatmap" },
          { key: "data", label: "Data & export" },
        ]}
      />

      {tab === "summary" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Scores" className="lg:col-span-2">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="py-1.5 pr-2 font-medium">Method</th>
                    <th className="py-1.5 pr-2 font-medium">Result</th>
                    <th className="py-1.5 pr-2 font-medium">Risk</th>
                    <th className="py-1.5 font-medium">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.method} className="border-t border-slate-100 align-top">
                      <td className="py-2 pr-2 font-medium whitespace-nowrap">{r.method}</td>
                      <td className="py-2 pr-2 text-slate-600">{r.result}</td>
                      <td className="py-2 pr-2">
                        <RiskBadge risk={r.risk} text={r.riskText} />
                      </td>
                      <td className="py-2">
                        <ConfBadge conf={r.conf} label={false} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <div className="space-y-4">
            <Card title="Recommendations">
              <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
                {a.recommendations.map((r, k) => (
                  <li key={k}>{r}</li>
                ))}
              </ol>
            </Card>
            <Card title="Data quality">
              <div className="mb-2 grid grid-cols-2 gap-3">
                <Stat label="Person detected" value={pct(a.dataQuality.validPct)} />
                <Stat label="Gap-filled" value={pct(a.dataQuality.interpolatedPct)} />
              </div>
              {a.views.map((v) => (
                <p key={v.viewId} className="text-xs text-slate-500">
                  {v.label} ({v.source}): view angle {Number.isFinite(v.meanYaw) ? `${v.meanYaw.toFixed(0)}°` : "–"} (0° frontal, 90° side), visibility {pct(v.meanVisibility * 100)}
                </p>
              ))}
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-500">
                {a.dataQuality.notes.map((n, k) => (
                  <li key={k}>{n}</li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
      {tab === "rula" && <ScoreTab a={a} which="rula" onSeek={seek} />}
      {tab === "reba" && <ScoreTab a={a} which="reba" onSeek={seek} />}
      {tab === "owas" && <OwasTab a={a} />}
      {tab === "niosh" && <NioshTab a={a} onSeek={seek} />}
      {tab === "repetitive" && <RepetitiveTab a={a} />}
      {tab === "static" && <StaticTab a={a} onSeek={seek} />}
      {tab === "reach" && <ReachTab a={a} />}
      {tab === "body" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Body heatmap (time at medium-or-higher risk)">
            <BodyHeatmap exposure={a.exposure} />
          </Card>
          <TimeInPostureCard a={a} />
        </div>
      )}
      {tab === "data" && (
        <Card title="Data and export">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => download("ergocapture-data.csv", analysisToCsv(a), "text/csv")}>Per-frame CSV (angles, confidences, scores)</Button>
            <Button
              variant="secondary"
              onClick={() => download("ergocapture-session.json", JSON.stringify(makeSessionFile(tracks, settings, calib)), "application/json")}
            >
              Skeleton-only session (.json)
            </Button>
          </div>
          <p className="mt-3 text-sm text-slate-500">
            The session file stores skeletons, settings and calibration but no video, so it can be archived or shared without identifying images and re-opened on the
            Analyze page.
          </p>
        </Card>
      )}
    </div>
  );
}

function FramePanel({ a, i }: { a: SessionAnalysis; i: number }) {
  const f = a.frames[i];
  const r = a.rula[i];
  const e = a.reba[i];
  const o = a.owas[i];
  const act = a.activities.find((s) => f.t >= s.start && f.t <= s.end)?.label;
  const keys = ["trunkFlex", "trunkSide", "trunkTwist", "neckFlex", "shoulderElevL", "shoulderElevR", "elbowFlexL", "elbowFlexR", "wristFlexL", "wristFlexR", "kneeFlexL", "kneeFlexR"] as const;
  return (
    <Card title={`Frame at ${fmtT(f.t)}`} className="lg:col-span-2" actions={act && <span className="text-xs text-slate-500">{act}</span>}>
      {!f.valid ? (
        <p className="text-sm text-slate-500">No person detected in this frame.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <ScoreChip name="RULA" s={r} />
            <ScoreChip name="REBA" s={e} />
            <ScoreChip name="OWAS" s={o} prefix="AC" />
          </div>
          {(r.drivers.length > 0 || e.drivers.length > 0) && (
            <ul className="mt-3 space-y-0.5 text-xs text-slate-600">
              {[...new Set([...e.drivers, ...r.drivers])].slice(0, 6).map((d) => (
                <li key={d}>• {d}</li>
              ))}
            </ul>
          )}
          <table className="mt-3 w-full text-xs">
            <tbody>
              {keys.map((k) => {
                const def = MEASURE_DEFS.find((d) => d.key === k)!;
                return (
                  <tr key={k} className="border-t border-slate-100">
                    <td className="py-0.5 text-slate-600">{def.label}</td>
                    <td className="tabular py-0.5 text-right font-medium">{Number.isFinite(f.m[k]) ? `${f.m[k].toFixed(0)}${def.unit}` : "–"}</td>
                    <td className="w-16 py-0.5 pl-2">
                      <div className="h-1.5 rounded-full bg-slate-100" title={`confidence ${(f.c[k] * 100).toFixed(0)}%`}>
                        <div className="h-full rounded-full" style={{ width: `${f.c[k] * 100}%`, background: f.c[k] >= 0.75 ? "#16a34a" : f.c[k] >= 0.5 ? "#ca8a04" : "#dc2626" }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-slate-400">Bars show per-angle confidence. Camera view angle this frame: {f.viewYaw.toFixed(0)}°.</p>
        </>
      )}
    </Card>
  );
}

function ScoreChip({ name, s, prefix = "" }: { name: string; s: ScoredFrame; prefix?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-2 text-center">
      <div className="text-[11px] font-medium text-slate-500">{name}</div>
      <div className="tabular text-2xl font-bold" style={{ color: RISK_COLORS[s.risk] }}>
        {prefix}
        {s.score}
      </div>
      <ConfBadge conf={s.conf} label={false} />
    </div>
  );
}

function Distribution({ pctByScore, riskOf }: { pctByScore: Record<number, number>; riskOf: (s: number) => RiskLevel }) {
  const entries = Object.entries(pctByScore).map(([k, v]) => [Number(k), v] as const);
  const max = Math.max(1, ...entries.map((e) => e[1]));
  return (
    <div className="flex h-36 items-end gap-1">
      {entries.map(([k, v]) => (
        <div key={k} className="flex flex-1 flex-col items-center gap-1">
          <span className="tabular text-[10px] text-slate-500">{v >= 0.5 ? `${v.toFixed(0)}%` : ""}</span>
          <div className="w-full rounded-t" style={{ height: `${(v / max) * 100}px`, background: RISK_COLORS[riskOf(k)] }} />
          <span className="text-[11px] text-slate-600">{k}</span>
        </div>
      ))}
    </div>
  );
}

function ScoreTab({ a, which, onSeek }: { a: SessionAnalysis; which: "rula" | "reba"; onSeek: (t: number) => void }) {
  const s = a.summary[which];
  const scores = a[which];
  const riskOf = (k: number) => scores.find((x) => x.score === k)?.risk ?? ((which === "rula" ? (k <= 2 ? 0 : k <= 4 ? 2 : k <= 6 ? 3 : 4) : k <= 1 ? 0 : k <= 3 ? 1 : k <= 7 ? 2 : k <= 10 ? 3 : 4) as RiskLevel);
  const partNames =
    which === "rula"
      ? ["upperArmL", "upperArmR", "lowerArmL", "lowerArmR", "wristL", "wristR", "neck", "trunk", "legs", "scoreA", "scoreB", "scoreC", "scoreD"]
      : ["trunk", "neck", "legs", "upperArm", "lowerArm", "wrist", "tableA", "scoreA", "tableB", "scoreB", "tableC", "activity", "force", "coupling"];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={`${which.toUpperCase()} distribution (% of time per score)`}>
        <div className="mb-4 grid grid-cols-4 gap-3">
          <Stat label="Peak" value={s.max} />
          <Stat label="Typical high (P90)" value={s.p90} />
          <Stat label="Median" value={s.median} />
          <Stat label="Mean confidence" value={pct(s.meanConf * 100)} sub={s.confLevel} />
        </div>
        <Distribution pctByScore={s.pctByScore} riskOf={riskOf} />
      </Card>
      <Card title="Highest-risk moments">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-1 font-medium">Time</th>
              <th className="py-1 font-medium">Score</th>
              <th className="py-1 font-medium">Why</th>
              <th className="py-1 font-medium">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {s.worstFrames.map((k) => (
              <tr key={k} className="cursor-pointer border-t border-slate-100 align-top hover:bg-slate-50" onClick={() => onSeek(a.frames[k].t)}>
                <td className="tabular py-1.5 text-sky-700 underline">{fmtT(a.frames[k].t)}</td>
                <td className="py-1.5">
                  <RiskBadge risk={scores[k].risk} text={String(scores[k].score)} />
                </td>
                <td className="py-1.5 text-xs text-slate-600">{scores[k].drivers.slice(0, 4).join("; ")}</td>
                <td className="py-1.5">
                  <ConfBadge conf={scores[k].conf} label={false} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-slate-500">
          Sub-scores at the worst moment:{" "}
          {s.worstFrames[0] !== undefined &&
            partNames
              .filter((p) => scores[s.worstFrames[0]].parts[p] !== undefined)
              .map((p) => `${p} ${scores[s.worstFrames[0]].parts[p]}`)
              .join(" · ")}
        </p>
      </Card>
    </div>
  );
}

function Bars({ items }: { items: Array<{ label: string; pct: number; color?: string }> }) {
  return (
    <div className="space-y-1.5">
      {items.map((it) => (
        <div key={it.label} className="text-xs">
          <div className="flex justify-between text-slate-600">
            <span>{it.label}</span>
            <span className="tabular">{it.pct.toFixed(0)}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, it.pct)}%`, background: it.color ?? "#0284c7" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function OwasTab({ a }: { a: SessionAnalysis }) {
  const d = a.owasDist;
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card title="Action categories (% of time)">
        <Bars items={d.ac.map((p, k) => ({ label: `AC${k + 1}`, pct: p, color: RISK_COLORS[([0, 2, 3, 4] as RiskLevel[])[k]] }))} />
        <p className="mt-3 text-xs text-slate-500">AC1 no action · AC2 action in the near future · AC3 action as soon as possible · AC4 action immediately.</p>
      </Card>
      <Card title="Back">
        <Bars items={OWAS_BACK.map((l, k) => ({ label: `${k + 1} ${l}`, pct: d.back[k] }))} />
      </Card>
      <Card title="Arms">
        <Bars items={OWAS_ARMS.map((l, k) => ({ label: `${k + 1} ${l}`, pct: d.arms[k] }))} />
      </Card>
      <Card title="Legs">
        <Bars items={OWAS_LEGS.map((l, k) => ({ label: `${k + 1} ${l}`, pct: d.legs[k] }))} />
      </Card>
      <Card title="Load">
        <Bars items={OWAS_LOAD.map((l, k) => ({ label: `${k + 1} ${l}`, pct: d.load[k] }))} />
      </Card>
    </div>
  );
}

function NioshTab({ a, onSeek }: { a: SessionAnalysis; onSeek: (t: number) => void }) {
  const n = a.niosh;
  return (
    <Card title="Revised NIOSH Lifting Equation" actions={<RiskBadge risk={n.risk} text={n.label} />}>
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Events detected" value={n.lifts.length} />
        <Stat label="Frequency" value={`${f1(n.frequency)}/min`} sub={n.frequencySource} />
        <Stat label="Load" value={`${a.settings.loadKg} kg`} sub="entered manually" />
        <Stat label="Max Lifting Index" value={Number.isFinite(n.maxLi) ? n.maxLi.toFixed(2) : "> 3"} />
      </div>
      {n.lifts.length === 0 ? (
        <p className="text-sm text-slate-500">No lifts or lowers were detected (hands travelling ≥ 25 cm vertically within 5 s while held together).</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                {["Time", "Type", "H (cm)", "V (cm)", "D", "A (°)", "HM", "VM", "DM", "AM", "FM", "CM", "RWL", "LI", "Conf."].map((h) => (
                  <th key={h} className="py-1 pr-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {n.lifts.map((l, k) => (
                <tr key={k} className="tabular border-t border-slate-100">
                  <td className="cursor-pointer py-1 pr-2 text-sky-700 underline" onClick={() => onSeek(l.start)}>
                    {fmtT(l.start)}
                  </td>
                  <td className="py-1 pr-2">{l.kind}</td>
                  <td className="py-1 pr-2">
                    {l.origin.H.toFixed(0)}→{l.destination.H.toFixed(0)}
                  </td>
                  <td className="py-1 pr-2">
                    {l.origin.V.toFixed(0)}→{l.destination.V.toFixed(0)}
                  </td>
                  <td className="py-1 pr-2">{l.D.toFixed(0)}</td>
                  <td className="py-1 pr-2">
                    {l.origin.A.toFixed(0)}→{l.destination.A.toFixed(0)}
                  </td>
                  {Object.values(l.multipliers).map((m, j) => (
                    <td key={j} className="py-1 pr-2">
                      {m.toFixed(2)}
                    </td>
                  ))}
                  <td className="py-1 pr-2">{l.rwl.toFixed(1)}</td>
                  <td className="py-1 pr-2 font-semibold">{Number.isFinite(l.li) ? l.li.toFixed(2) : "∞"}</td>
                  <td className="py-1">
                    <ConfBadge conf={l.conf} label={false} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">
        H = horizontal hand distance from the mid-ankles; V = hand height above the floor; D = vertical travel; A = asymmetry angle. RWL = 23 kg × multipliers; LI = load
        / RWL. LI ≤ 1 is acceptable for most workers; LI &gt; 3 indicates high risk. Measured values assume a correct worker height; enter it in task settings.
      </p>
    </Card>
  );
}

function RepetitiveTab({ a }: { a: SessionAnalysis }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {a.strainIndex.map((s) => (
        <Card key={`si${s.side}`} title={`Strain Index — ${s.side === "L" ? "left" : "right"} hand`} actions={<RiskBadge risk={s.risk} text={`SI ${f1(s.si)} · ${s.label}`} />}>
          <table className="w-full text-sm">
            <tbody>
              {[
                ["Intensity of exertion", `rating ${s.ratings.intensity} (manual)`, s.multipliers.IE],
                ["Duration of exertion", `${pct(s.inputs.dutyCyclePct)} of cycle`, s.multipliers.DE],
                ["Efforts per minute", f1(s.inputs.effortsPerMin), s.multipliers.EM],
                ["Hand/wrist posture", `P75 flexion ${f1(s.inputs.wristFlexP75)}°, deviation ${f1(s.inputs.wristDevP75)}°`, s.multipliers.HWP],
                ["Speed of work", `rating ${s.ratings.speed} (manual)`, s.multipliers.SW],
                ["Duration per day", `${a.settings.taskHoursPerDay} h`, s.multipliers.DD],
              ].map(([k, v, m]) => (
                <tr key={String(k)} className="border-t border-slate-100">
                  <td className="py-1 text-slate-600">{k}</td>
                  <td className="py-1 text-slate-800">{v}</td>
                  <td className="tabular py-1 text-right font-medium">×{Number(m).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
      {a.ocra.map((o) => (
        <Card key={`oc${o.side}`} title={`OCRA checklist — ${o.side === "L" ? "left" : "right"} limb`} actions={<RiskBadge risk={o.risk} text={`${f1(o.score)} · ${o.label}`} />}>
          <table className="w-full text-sm">
            <tbody>
              {[
                ["Recovery (manual)", o.factors.recovery],
                [`Frequency (${f1(o.actionsPerMin)} actions/min)`, o.factors.frequency],
                ["Force (manual)", o.factors.force],
                [`Posture (shoulder ${o.posture.shoulder}, elbow ${o.posture.elbow}, wrist ${o.posture.wrist}, grip ${o.posture.grip}, stereotypy ${o.posture.stereotypy})`, o.factors.posture],
                ["Additional (manual)", o.factors.additional],
                ["Duration multiplier", o.durationMultiplier],
              ].map(([k, v]) => (
                <tr key={String(k)} className="border-t border-slate-100">
                  <td className="py-1 text-slate-600">{k}</td>
                  <td className="tabular py-1 text-right font-medium">{Number(v).toFixed(Number(v) % 1 ? 2 : 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
      <Card title="Repetition counting" className="lg:col-span-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-1 font-medium">Signal</th>
              <th className="py-1 font-medium">Cycles</th>
              <th className="py-1 font-medium">Per minute</th>
              <th className="py-1 font-medium">Median cycle time</th>
              <th className="py-1 font-medium">Median amplitude</th>
            </tr>
          </thead>
          <tbody>
            {a.cycles.map((c) => (
              <tr key={c.key} className="tabular border-t border-slate-100">
                <td className="py-1">{c.label}</td>
                <td className="py-1">{c.cycles}</td>
                <td className="py-1">{f1(c.perMin)}</td>
                <td className="py-1">{Number.isFinite(c.cycleTime) ? `${c.cycleTime.toFixed(1)} s` : "–"}</td>
                <td className="py-1">{Number.isFinite(c.amplitude) ? (c.key.startsWith("hand") ? `${(c.amplitude * 100).toFixed(0)} cm` : `${c.amplitude.toFixed(0)}°`) : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function StaticTab({ a, onSeek }: { a: SessionAnalysis; onSeek: (t: number) => void }) {
  const s = a.staticPosture;
  const color = { acceptable: "#16a34a", conditional: "#ca8a04", "not acceptable": "#dc2626" };
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Verdict per body part">
        {Object.keys(s.summary).length === 0 && <p className="text-sm text-slate-500">No holds ≥ 4 s were found.</p>}
        {Object.entries(s.summary).map(([k, v]) => (
          <div key={k} className="flex justify-between border-t border-slate-100 py-1.5 text-sm">
            <span>{k}</span>
            <span className="font-medium" style={{ color: color[v] }}>
              {v}
            </span>
          </div>
        ))}
        <h3 className="mt-4 mb-1 text-xs font-semibold text-slate-500">Movement frequency (EN 1005-4)</h3>
        {s.movements.map((m, k) => (
          <div key={k} className="flex justify-between border-t border-slate-100 py-1 text-xs">
            <span>
              {m.part} {m.zone}: {m.perMin.toFixed(1)}/min
            </span>
            <span style={{ color: color[m.verdict] }}>{m.verdict}</span>
          </div>
        ))}
      </Card>
      <Card title="Static holds (≥ 4 s)" className="lg:col-span-2">
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-1 font-medium">Start</th>
                <th className="py-1 font-medium">Body part</th>
                <th className="py-1 font-medium">Held</th>
                <th className="py-1 font-medium">Angle</th>
                <th className="py-1 font-medium">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {s.holds.map((h, k) => (
                <tr key={k} className="border-t border-slate-100" title={h.reason}>
                  <td className="tabular cursor-pointer py-1 text-sky-700 underline" onClick={() => onSeek(h.start)}>
                    {fmtT(h.start)}
                  </td>
                  <td className="py-1">{h.part}</td>
                  <td className="tabular py-1">{h.duration.toFixed(0)} s</td>
                  <td className="tabular py-1">{h.angle.toFixed(0)}°</td>
                  <td className="py-1 text-xs" style={{ color: color[h.verdict] }}>
                    {h.verdict} — {h.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ReachTab({ a }: { a: SessionAnalysis }) {
  const r = a.reach;
  const an = a.anthropometry;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {(["L", "R"] as const).map((s) => (
        <Card key={s} title={`${s === "L" ? "Left" : "Right"} hand reach zones`}>
          <Bars
            items={[
              { label: "Primary (< 50% arm)", pct: r.zonePct[s].primary, color: "#16a34a" },
              { label: "Secondary (50–80%)", pct: r.zonePct[s].secondary, color: "#84cc16" },
              { label: "Maximum (80–100%)", pct: r.zonePct[s].maximum, color: "#eab308" },
              { label: "Beyond (trunk lean)", pct: r.zonePct[s].beyond, color: "#dc2626" },
              { label: "Above shoulder", pct: r.aboveShoulderPct[s], color: "#f97316" },
              { label: "Below knuckle height", pct: r.belowKnucklePct[s], color: "#f97316" },
            ]}
          />
          <p className="mt-2 text-xs text-slate-500">Max reach {(r.maxReach[s] * 100).toFixed(0)}% of arm length.</p>
        </Card>
      ))}
      <Card title="Anthropometry" actions={<ConfBadge conf={an.conf} label={false} />}>
        <p className="mb-2 text-sm">
          Stature <b>{an.statureCm.toFixed(0)} cm</b> <span className="text-slate-500">({an.statureSource})</span>
        </p>
        <table className="w-full text-xs">
          <tbody>
            {Object.entries({ ...an.segmentsCm, ...an.derivedCm }).map(([k, v]) => (
              <tr key={k} className="border-t border-slate-100">
                <td className="py-0.5 capitalize text-slate-600">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</td>
                <td className="tabular py-0.5 text-right">{f1(v)} cm</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3 className="mt-3 mb-1 text-xs font-semibold text-slate-500">Workstation fit</h3>
        {a.workstation.length === 0 ? (
          <p className="text-xs text-slate-500">Enter work-surface height or control distance in task settings to check fit.</p>
        ) : (
          a.workstation.map((w) => (
            <p key={w.item} className="text-xs">
              <b style={{ color: w.ok ? "#16a34a" : "#dc2626" }}>{w.ok ? "✓" : "✗"}</b> {w.item}: {w.actualCm.toFixed(0)} cm (recommended {w.recommendedCm[0].toFixed(0)}–
              {w.recommendedCm[1].toFixed(0)} cm). {w.advice}.
            </p>
          ))
        )}
      </Card>
    </div>
  );
}

function TimeInPostureCard({ a }: { a: SessionAnalysis }) {
  return (
    <Card title="Time in posture (risk bands)">
      <div className="space-y-2">
        {a.timeInPosture.map((t) => (
          <div key={t.key}>
            <div className="mb-0.5 text-xs text-slate-600">{t.label}</div>
            <div className="flex h-4 overflow-hidden rounded">
              {t.bands.map((b) => (
                <div
                  key={b.label}
                  title={`${b.label}: ${b.pct.toFixed(0)}% (${b.seconds.toFixed(0)} s)`}
                  style={{ width: `${b.pct}%`, background: RISK_COLORS[b.risk] }}
                  className="text-[9px] leading-4 text-white"
                >
                  {b.pct > 12 ? `${b.label} ${b.pct.toFixed(0)}%` : ""}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Bands: {BAND_DEFS.length} joints; hover a segment for exact values.</p>
    </Card>
  );
}
