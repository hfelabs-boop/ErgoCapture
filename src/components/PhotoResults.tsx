"use client";

import { drawFrame } from "@/lib/draw";
import { analyzePhotos, type PhotoAnalysis, type PhotoResult } from "@/lib/ergo/photos";
import { confidenceLevel, RISK_COLORS, RISK_NAMES } from "@/lib/ergo/risk";
import { download } from "@/lib/export/csv";
import {
  exportPhotosDocx,
  exportPhotosPdf,
  PHOTO_ANGLES,
  photoConfidence,
  photoDrivers,
  photosCsv,
  printPhotos,
  renderPhotoImage,
} from "@/lib/export/photoReport";
import { MEASURE_DEFS } from "@/lib/ergo/measures";
import { useStore, type Privacy } from "@/lib/store";
import { useEffect, useRef, useState } from "react";
import { SettingsPanel } from "./SettingsPanel";
import { Button, Card, ConfBadge, RiskBadge, Toggle } from "./ui";

const DEF = Object.fromEntries(MEASURE_DEFS.map((d) => [d.key, d]));

function PhotoCanvas({ it, url, privacy }: { it: PhotoResult; url: string; privacy: Privacy }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const img = new Image();
    img.src = url;
    img.decode().then(() => {
      const c = ref.current;
      if (!c) return;
      const w = Math.min(960, it.width || img.naturalWidth);
      c.width = w;
      c.height = Math.round((w * (it.height || img.naturalHeight)) / (it.width || img.naturalWidth));
      drawFrame(c.getContext("2d")!, img, it.image, it.found ? it.m : null, c.width, c.height, { ...privacy, lineWidth: Math.max(3, w / 200) });
    });
  }, [it, url, privacy]);
  return <canvas ref={ref} className="block h-auto w-full rounded-lg bg-slate-900" />;
}

function Chip({ name, score, risk, conf }: { name: string; score: string; risk: number; conf: number }) {
  return (
    <div className="rounded-lg border border-slate-200 p-2 text-center">
      <div className="text-[11px] font-medium text-slate-500">{name}</div>
      <div className="tabular text-2xl font-bold" style={{ color: RISK_COLORS[risk as 0] }}>
        {score}
      </div>
      <ConfBadge conf={conf} label={false} />
    </div>
  );
}

export function PhotoResults({ pa }: { pa: PhotoAnalysis }) {
  const photos = useStore((s) => s.photos);
  const privacy = useStore((s) => s.privacy);
  const setPrivacy = useStore((s) => s.setPrivacy);
  const title = useStore((s) => s.title);
  const setTitle = useStore((s) => s.setTitle);
  const settings = useStore((s) => s.settings);
  const calib = useStore((s) => s.calib);
  const options = useStore((s) => s.photoOptions);
  const setOptions = useStore((s) => s.setPhotoOptions);
  const setPhotoAnalysis = useStore((s) => s.setPhotoAnalysis);
  const [busy, setBusy] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const urlOf = (id: string) => photos.find((p) => p.id === id)?.url;

  /** Re-score with new task settings or options, reusing the detected poses. */
  const rescore = (opts = options) => setPhotoAnalysis(analyzePhotos(pa.inputs, settings, calib, opts));

  const images = async () => {
    const out: Record<string, string> = {};
    for (const it of pa.items) {
      const u = urlOf(it.id);
      if (u) out[it.id] = await renderPhotoImage(it, u, privacy);
    }
    return out;
  };

  const exportAs = async (kind: "pdf" | "docx" | "print") => {
    setBusy(kind === "print" ? "Preparing print view…" : "Building report…");
    try {
      const imgs = await images();
      const name = title.replace(/[^\w-]+/g, "_") || "ergocapture-photos";
      if (kind === "pdf") download(`${name}.pdf`, await exportPhotosPdf(pa, imgs, title), "application/pdf");
      else if (kind === "docx")
        download(`${name}.docx`, await exportPhotosDocx(pa, imgs, title), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      else printPhotos(pa, imgs, title);
    } catch (e) {
      alert(`Export failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const order = [...pa.ranked, ...pa.items.map((_, i) => i).filter((i) => !pa.ranked.includes(i))];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="min-w-0 flex-1 basis-full rounded-md border border-transparent bg-transparent px-1 text-xl font-semibold hover:border-slate-200 focus:border-sky-500 focus:outline-none sm:basis-auto"
          aria-label="Assessment title"
        />
        <RiskBadge risk={pa.overallRisk} text={`Highest: ${RISK_NAMES[pa.overallRisk].toLowerCase()} risk`} size="lg" />
        <Button variant="secondary" onClick={() => setShowSettings(!showSettings)}>
          Task settings
        </Button>
        <Button onClick={() => exportAs("pdf")} disabled={!!busy}>
          PDF report
        </Button>
        <Button variant="secondary" onClick={() => exportAs("docx")} disabled={!!busy}>
          Word
        </Button>
        <Button variant="secondary" onClick={() => download("ergocapture-photos.csv", photosCsv(pa), "text/csv")}>
          CSV
        </Button>
        <Button variant="secondary" onClick={() => exportAs("print")} disabled={!!busy}>
          Print
        </Button>
      </div>
      {busy && <div className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">{busy}</div>}
      {showSettings && (
        <Card title="Task settings" actions={<Button onClick={() => (rescore(), setShowSettings(false))}>Re-score photos</Button>}>
          <SettingsPanel compact />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={`Photos (${pa.items.length})`} className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="py-1.5 pr-2 font-medium">Photo</th>
                  <th className="py-1.5 pr-2 font-medium">RULA</th>
                  <th className="py-1.5 pr-2 font-medium">REBA</th>
                  <th className="py-1.5 pr-2 font-medium">OWAS</th>
                  <th className="py-1.5 pr-2 font-medium">Confidence</th>
                  <th className="hidden py-1.5 font-medium sm:table-cell">Main reasons</th>
                </tr>
              </thead>
              <tbody>
                {order.map((i) => {
                  const it = pa.items[i];
                  return (
                    <tr
                      key={it.id}
                      className="cursor-pointer border-t border-slate-100 align-top hover:bg-slate-50"
                      onClick={() => document.getElementById(`photo-${it.id}`)?.scrollIntoView({ behavior: "smooth" })}
                    >
                      <td className="max-w-[8rem] truncate py-1.5 pr-2 font-medium text-sky-700 sm:max-w-[12rem]">{it.name}</td>
                      {it.found ? (
                        <>
                          <td className="py-1.5 pr-2">
                            <RiskBadge risk={it.rula!.risk} text={String(it.rula!.score)} />
                          </td>
                          <td className="py-1.5 pr-2">
                            <RiskBadge risk={it.reba!.risk} text={String(it.reba!.score)} />
                          </td>
                          <td className="py-1.5 pr-2">
                            <RiskBadge risk={it.owas!.risk} text={`AC${it.owas!.score}`} />
                          </td>
                          <td className="py-1.5 pr-2">
                            <ConfBadge conf={photoConfidence(it)} label={false} />
                          </td>
                          <td className="hidden py-1.5 text-xs text-slate-600 sm:table-cell">{photoDrivers(it, 3).join("; ")}</td>
                        </>
                      ) : (
                        <td colSpan={5} className="py-1.5 text-xs text-slate-500">
                          No person found
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="space-y-4">
          <Card title="Options">
            <div className="space-y-2">
              <Toggle
                checked={options.staticHold}
                onChange={(v) => (setOptions({ staticHold: v }), rescore({ ...options, staticHold: v }))}
                label="Postures are held for more than 1 minute"
                hint="Adds RULA muscle-use and REBA activity points"
              />
              <Toggle
                checked={options.repetitive}
                onChange={(v) => (setOptions({ repetitive: v }), rescore({ ...options, repetitive: v }))}
                label="Postures are repeated more than 4 times per minute"
              />
              <Toggle checked={privacy.blurFaces} onChange={(v) => setPrivacy({ blurFaces: v })} label="Blur faces" />
              <Toggle checked={privacy.skeletonOnly} onChange={(v) => setPrivacy({ skeletonOnly: v })} label="Skeleton only (hide photos)" />
            </div>
          </Card>
          <Card title="Notes">
            <ul className="list-disc space-y-1 pl-4 text-xs text-slate-500">
              {pa.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
              <li>
                Pose engine: {pa.source}. Stature {Math.round(pa.statureCm)} cm ({pa.statureSource}).
              </li>
            </ul>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {order.map((i) => {
          const it = pa.items[i];
          const url = urlOf(it.id);
          return (
            <section key={it.id} id={`photo-${it.id}`} className="scroll-mt-20 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 truncate text-sm font-semibold">{it.name}</h3>
              {url && <PhotoCanvas it={it} url={url} privacy={privacy} />}
              {!it.found ? (
                <p className="mt-3 text-sm text-slate-500">No person was found in this photo. Make sure the whole body is visible.</p>
              ) : (
                <>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Chip name="RULA" score={String(it.rula!.score)} risk={it.rula!.risk} conf={it.rula!.conf} />
                    <Chip name="REBA" score={String(it.reba!.score)} risk={it.reba!.risk} conf={it.reba!.conf} />
                    <Chip name="OWAS" score={`AC${it.owas!.score}`} risk={it.owas!.risk} conf={it.owas!.conf} />
                  </div>
                  <p className="mt-2 text-xs text-slate-600">{it.reba!.label}</p>
                  {photoDrivers(it).length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                      {photoDrivers(it).map((d) => (
                        <li key={d}>• {d}</li>
                      ))}
                    </ul>
                  )}
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-slate-500">Joint angles</summary>
                    <table className="mt-1 w-full text-xs">
                      <tbody>
                        {PHOTO_ANGLES.map((k) => (
                          <tr key={k} className="border-t border-slate-100">
                            <td className="py-0.5 text-slate-600">{DEF[k].label}</td>
                            <td className="tabular py-0.5 text-right font-medium">{Number.isFinite(it.m.m[k]) ? `${it.m.m[k].toFixed(0)}${DEF[k].unit}` : "–"}</td>
                            <td className="w-16 py-0.5 pl-2 text-right text-slate-400">{confidenceLevel(it.m.c[k])}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                </>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
