"use client";

import type { SessionAnalysis } from "@/lib/ergo/analyze";
import { rawFrames } from "@/lib/export/images";
import { aiAvailability, aiDownloadMb, aiModelsDownloaded, generateAiNarrative, type AiAvailability } from "@/lib/narrative/ai";
import { printNarrative } from "@/lib/narrative/print";
import { templateNarrative, type Narrative } from "@/lib/narrative/template";
import { useStore } from "@/lib/store";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card } from "./ui";

/** Standard narrative (always) and the optional on-device AI narrative. */
export function NarrativePanel({ a, videoUrl, videoOffsetSec }: { a: SessionAnalysis; videoUrl?: string; videoOffsetSec: number }) {
  const title = useStore((s) => s.title);
  const ai = useStore((s) => s.aiNarrative);
  const setAi = useStore((s) => s.setAiNarrative);
  const which = useStore((s) => s.reportNarrative);
  const setWhich = useStore((s) => s.setReportNarrative);
  const template = useMemo(() => templateNarrative(a, title), [a, title]);
  const [avail, setAvail] = useState<AiAvailability | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    aiAvailability().then(setAvail);
  }, []);

  const shown: Narrative = which === "ai" && ai ? ai : template;

  const run = async () => {
    setConfirm(false);
    setError(null);
    if (!avail?.ok || !avail.device) return;
    abort.current = new AbortController();
    try {
      setBusy("Preparing…");
      // Key moments for the vision model: the worst REBA frames plus one typical frame.
      const idx = [...a.summary.reba.worstFrames.slice(0, 3)];
      const valid = a.frames.map((f, i) => (f.valid ? i : -1)).filter((i) => i >= 0);
      if (valid.length) idx.push(valid[Math.floor(valid.length / 2)]);
      const times = [...new Set(idx)].map((i) => a.frames[i].t).sort((x, y) => x - y);
      const frames = videoUrl ? await rawFrames(videoUrl, times, videoOffsetSec) : [];
      const n = await generateAiNarrative({ ...template, title }, frames, {
        device: avail.device,
        signal: abort.current.signal,
        onProgress: setBusy,
      });
      setAi(n);
      if (n.removedSentences) setError(`${n.removedSentences} AI sentence(s) contained numbers that are not in the measured results and were removed.`);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(`AI narrative failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card
        className="lg:col-span-2"
        title={shown.source === "ai" ? `AI narrative (${shown.model})` : "Narrative"}
        actions={
          <Button variant="secondary" onClick={() => printNarrative(shown, a)}>
            Print
          </Button>
        }
      >
        {shown.source === "ai" && (
          <p className="mb-3 rounded-md bg-sky-50 px-2 py-1.5 text-xs text-sky-800">
            Written on this device by an AI model from the measured results. Numbers not found in the results were removed, but wording can still be imprecise: check before use.
          </p>
        )}
        <div className="space-y-4">
          {shown.sections.map((s) => (
            <section key={s.heading}>
              <h3 className="mb-1 text-sm font-semibold text-slate-800">{s.heading}</h3>
              {s.paragraphs.map((p, i) => (
                <p key={i} className="mb-1.5 text-sm leading-relaxed text-slate-700">
                  {p}
                </p>
              ))}
            </section>
          ))}
          {shown.frameNotes && shown.frameNotes.length > 0 && (
            <section>
              <h3 className="mb-1 text-sm font-semibold text-slate-800">What the camera shows (AI description, indicative)</h3>
              {shown.frameNotes.map((f) => (
                <p key={f.t} className="mb-1 text-sm text-slate-700">
                  <b className="tabular">
                    {Math.floor(f.t / 60)}:{String(Math.floor(f.t % 60)).padStart(2, "0")}
                  </b>{" "}
                  {f.text}
                </p>
              ))}
            </section>
          )}
        </div>
      </Card>
      <div className="space-y-4">
        <Card title="Narrative in reports">
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" checked={which === "template"} onChange={() => setWhich("template")} /> Standard (from the measured results)
            </label>
            <label className={`flex items-center gap-2 ${ai ? "" : "text-slate-400"}`}>
              <input type="radio" disabled={!ai} checked={which === "ai"} onChange={() => setWhich("ai")} /> AI-written {ai ? "" : "(not generated yet)"}
            </label>
            <p className="text-xs text-slate-500">The chosen narrative is used by Print and by the PDF and Word reports.</p>
          </div>
        </Card>
        <Card title="AI narrative (optional)">
          {!avail ? (
            <p className="text-sm text-slate-500">Checking this device…</p>
          ) : !avail.ok ? (
            <p className="text-sm text-slate-500">{avail.reason}</p>
          ) : (
            <div className="space-y-2 text-sm text-slate-600">
              <p>
                Two open models run in this browser: SmolVLM2 looks at key moments of the video{videoUrl ? "" : " (no video in this session, so it is skipped)"}, and Qwen3 writes the
                narrative from the measured results. Nothing is uploaded.
              </p>
              {!aiModelsDownloaded() && <p className="text-xs text-amber-700">First use downloads about {(aiDownloadMb() / 1000).toFixed(1)} GB of models; they are cached afterwards.</p>}
              {busy ? (
                <div className="space-y-2">
                  <p className="rounded-md bg-sky-50 px-2 py-1.5 text-sky-800">{busy}</p>
                  <Button variant="secondary" onClick={() => abort.current?.abort()}>
                    Cancel
                  </Button>
                </div>
              ) : confirm ? (
                <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-2">
                  <p className="text-amber-900">Download about {(aiDownloadMb() / 1000).toFixed(1)} GB now? This can take several minutes.</p>
                  <div className="flex gap-2">
                    <Button onClick={run}>Download and write</Button>
                    <Button variant="ghost" onClick={() => setConfirm(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button onClick={() => (aiModelsDownloaded() ? run() : setConfirm(true))}>{ai ? "Write again" : "Write AI narrative"}</Button>
              )}
            </div>
          )}
          {error && <p className="mt-2 text-xs text-amber-700">{error}</p>}
        </Card>
      </div>
    </div>
  );
}
