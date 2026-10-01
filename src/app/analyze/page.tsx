"use client";

import { Results } from "@/components/Results";
import { SettingsPanel } from "@/components/SettingsPanel";
import { Button, Card, Field, NumberInput, Progress, Select, Toggle } from "@/components/ui";
import { analyzeSession } from "@/lib/ergo/analyze";
import { parsePoseJson } from "@/lib/pose/importExport";
import { demoTrack } from "@/lib/pose/synthetic";
import { checkServer, processRemote } from "@/lib/pose/remoteProcessor";
import { processVideo } from "@/lib/pose/videoProcessor";
import { hydrateSettings, newId, selectedTracks, useStore, type ViewSource } from "@/lib/store";
import { detectAudioSync, detectFlashSync } from "@/lib/sync";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

export default function AnalyzePage() {
  return (
    <Suspense>
      <Analyze />
    </Suspense>
  );
}

function Analyze() {
  const s = useStore();
  const params = useSearchParams();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    hydrateSettings();
  }, []);

  useEffect(() => {
    if (params.get("demo") === "1" && !useStore.getState().analysis) loadDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const loadDemo = () => {
    const st = useStore.getState();
    st.reset();
    const track = demoTrack(10, 60);
    st.setViews([{ id: "demo", label: track.viewLabel, kind: "demo", offsetSec: 0, status: "done", progress: 1, processed: { viewId: "demo", label: track.viewLabel, tracks: [track], width: track.width, height: track.height, duration: 60 } }]);
    st.setTitle("Demo: pick-and-place station");
    const settings = { ...st.settings, subjectHeightCm: st.settings.subjectHeightCm || 175, loadKg: st.settings.loadKg || 8 };
    st.setSettings(settings);
    st.setAnalysis(analyzeSession({ tracks: [track], settings, calib: {} }));
  };

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    setError(null);
    for (const file of Array.from(files)) {
      if (file.name.endsWith(".json")) {
        try {
          const parsed = parsePoseJson(await file.text());
          for (const tr of parsed.tracks)
            s.addView({
              id: newId(),
              label: tr.viewLabel || file.name,
              kind: "pose",
              offsetSec: 0,
              status: "done",
              progress: 1,
              processed: { viewId: tr.viewId, label: tr.viewLabel, tracks: [tr], width: tr.width, height: tr.height, duration: tr.frames.length / tr.fps },
            });
          if (parsed.settings) s.setSettings(parsed.settings);
          if (parsed.calib) s.setCalib(parsed.calib);
        } catch (e) {
          setError((e as Error).message);
        }
      } else if (file.type.startsWith("video/") || /\.(mp4|mov|webm|mkv|m4v)$/i.test(file.name)) {
        if (useStore.getState().views.length >= 4) {
          setError("Up to 4 camera views are supported.");
          break;
        }
        s.addView({ id: newId(), label: file.name, kind: "video", file, url: URL.createObjectURL(file), offsetSec: 0, status: "idle", progress: 0 });
      } else setError(`Unsupported file: ${file.name}`);
    }
  };

  const syncViews = async (method: "audio" | "flash") => {
    const views = useStore.getState().views.filter((v) => v.kind === "video");
    for (const v of views) {
      s.updateView(v.id, { syncEventSec: undefined });
      const t = method === "audio" ? await detectAudioSync(v.file!) : await detectFlashSync(v.url!);
      s.updateView(v.id, { syncEventSec: t });
    }
    const vs = useStore.getState().views.filter((v) => v.kind === "video");
    const ref = vs[0]?.syncEventSec;
    if (ref == null) {
      setError(`No ${method === "audio" ? "clap/beep" : "flash"} found in the first view. Set offsets manually.`);
      return;
    }
    for (const v of vs) if (v.syncEventSec != null) s.updateView(v.id, { offsetSec: +(ref - v.syncEventSec).toFixed(3) });
  };

  const run = async () => {
    setError(null);
    if (s.process.engine === "sam3d" && !s.process.endpoint) {
      setError("Enter the SAM 3D Body server URL, or switch the pose engine to on-device.");
      return;
    }
    setRunning(true);
    abort.current = new AbortController();
    try {
      for (const v of useStore.getState().views) {
        if (v.kind !== "video" || (v.status === "done" && v.processed)) continue;
        s.updateView(v.id, { status: "processing", progress: 0, error: undefined, phase: undefined });
        try {
          const processed =
            s.process.engine === "sam3d"
              ? await processRemote(v.file!, v.id, v.label, {
                  endpoint: s.process.endpoint,
                  token: s.process.token || undefined,
                  fps: s.process.fps,
                  offsetSec: v.offsetSec,
                  signal: abort.current.signal,
                  onProgress: (p, phase) =>
                    s.updateView(v.id, {
                      progress: p,
                      phase: phase === "upload" ? "Uploading to SAM 3D Body server" : phase === "queued" ? "Queued on server" : "SAM 3D Body running",
                    }),
                })
              : await processVideo(v.url!, v.id, v.label, {
                  fps: s.process.fps,
                  variant: s.process.variant,
                  maxPersons: s.process.maxPersons,
                  offsetSec: v.offsetSec,
                  signal: abort.current.signal,
                  onProgress: (p) => s.updateView(v.id, { progress: p }),
                });
          s.updateView(v.id, { status: "done", processed, selectedPersonId: processed.tracks[0]?.personId });
        } catch (e) {
          if ((e as Error).name === "AbortError") throw e;
          s.updateView(v.id, { status: "error", error: (e as Error).message });
        }
      }
      const st = useStore.getState();
      const tracks = selectedTracks(st.views);
      if (!tracks.length) throw new Error("No person was detected in any view.");
      // Resample all views to one rate for fusion.
      const fps = tracks[0].fps;
      if (tracks.some((t) => t.fps !== fps)) throw new Error("All views must use the same sampling rate. Re-process with one setting.");
      st.setAnalysis(analyzeSession({ tracks, settings: st.settings, calib: st.calib }));
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  if (s.analysis)
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => s.setAnalysis(null)}>
            ← Sources and settings
          </Button>
          <Button variant="ghost" onClick={() => s.reset()}>
            New assessment
          </Button>
        </div>
        <Results a={s.analysis} />
      </div>
    );

  const videos = s.views.filter((v) => v.kind === "video");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Analyze recordings</h1>
        <p className="text-sm text-slate-500">
          Add 1–4 videos of the same task from different angles (or a saved skeleton session), set the task inputs, and run.{" "}
          {s.process.engine === "sam3d" ? "Videos are sent to your SAM 3D Body server for pose estimation; scoring runs in this browser." : "Everything is processed in this browser."}
        </p>
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <Card
        title="Camera views"
        actions={
          <>
            <Button variant="ghost" onClick={loadDemo}>
              Load demo
            </Button>
            <label className="inline-flex cursor-pointer items-center rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700">
              Add video / session
              <input type="file" multiple accept="video/*,.json,application/json" className="hidden" onChange={(e) => addFiles(e.target.files)} />
            </label>
          </>
        }
      >
        {s.views.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-slate-200 p-8 text-center text-sm text-slate-500" onDragOver={(e) => e.preventDefault()} onDrop={(e) => (e.preventDefault(), addFiles(e.dataTransfer.files))}>
            Drop videos here (MP4, MOV, WebM) or a <code>.json</code> skeleton session.
            <br />
            Tip: film from the side at hip height with the whole body in frame. A second camera at ~90° greatly improves accuracy.
          </div>
        ) : (
          <div className="space-y-3">
            {s.views.map((v, k) => (
              <ViewRow key={v.id} v={v} index={k} />
            ))}
          </div>
        )}
        {videos.length > 1 && (
          <div className="mt-4 rounded-lg bg-slate-50 p-3">
            <div className="mb-2 text-sm font-medium">Synchronise cameras</div>
            <p className="mb-2 text-xs text-slate-500">
              Start all recordings, then clap once (or use the flash on the <a className="text-sky-700 underline" href="/sync">Sync page</a>) in view of every camera.
              Offsets are relative to the first view.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => syncViews("audio")}>
                Detect clap / beep
              </Button>
              <Button variant="secondary" onClick={() => syncViews("flash")}>
                Detect flash
              </Button>
            </div>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Processing">
          <div className="grid gap-3">
            <Field label="Sampling rate" hint="Frames analysed per second of video">
              <Select value={s.process.fps} onChange={(fps) => s.setProcess({ fps })} options={[5, 10, 15, 30].map((f) => ({ value: f, label: `${f} fps` }))} />
            </Field>
            <Field label="Pose engine">
              <Select
                value={s.process.engine}
                onChange={(engine) => s.setProcess({ engine })}
                options={[
                  { value: "mediapipe", label: "On-device: MediaPipe (private, any device)" },
                  { value: "sam3d", label: "SAM 3D Body (your GPU server, most accurate)" },
                ]}
              />
            </Field>
            {s.process.engine === "mediapipe" ? (
              <>
                <Field label="Pose model" hint="Heavy is most accurate and slowest">
                  <Select
                    value={s.process.variant}
                    onChange={(variant) => s.setProcess({ variant })}
                    options={[
                      { value: "lite", label: "Lite (fast)" },
                      { value: "full", label: "Full (balanced)" },
                      { value: "heavy", label: "Heavy (accurate)" },
                    ]}
                  />
                </Field>
                <Field label="People to track">
                  <Select value={s.process.maxPersons} onChange={(maxPersons) => s.setProcess({ maxPersons })} options={[1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))} />
                </Field>
              </>
            ) : (
              <Sam3dServerFields />
            )}
            <Toggle checked={s.privacy.blurFaces} onChange={(blurFaces) => s.setPrivacy({ blurFaces })} label="Blur faces in review and reports" />
            <Toggle checked={s.privacy.skeletonOnly} onChange={(skeletonOnly) => s.setPrivacy({ skeletonOnly })} label="Skeleton only (never show video)" />
            {s.calib.up && <p className="text-xs text-emerald-700">Neutral-posture calibration from Live mode is active.</p>}
          </div>
        </Card>
        <Card title="Task inputs" className="lg:col-span-2">
          <SettingsPanel />
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={run} disabled={running || s.views.length === 0} className="px-6 py-2.5 text-base">
          {running ? "Analysing…" : "Run analysis"}
        </Button>
        {running && (
          <Button variant="secondary" onClick={() => abort.current?.abort()}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

function ViewRow({ v, index }: { v: ViewSource; index: number }) {
  const s = useStore();
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">View {index + 1}</span>
        <input value={v.label} onChange={(e) => s.updateView(v.id, { label: e.target.value })} className="min-w-0 flex-1 rounded border border-transparent px-1 text-sm hover:border-slate-200" />
        <span className="text-xs text-slate-500">{v.kind === "video" ? "video" : v.kind === "pose" ? "skeleton file" : v.kind}</span>
        {v.kind === "video" && (
          <div className="w-28">
            <Field label="Offset (s)">
              <NumberInput value={v.offsetSec} step={0.01} onChange={(offsetSec) => s.updateView(v.id, { offsetSec, status: v.status === "done" ? "idle" : v.status, processed: undefined })} />
            </Field>
          </div>
        )}
        {v.syncEventSec !== undefined && (
          <span className="text-xs text-slate-500">sync event: {v.syncEventSec === null ? "not found" : `${v.syncEventSec.toFixed(2)} s`}</span>
        )}
        <Button variant="ghost" onClick={() => s.removeView(v.id)}>
          Remove
        </Button>
      </div>
      {v.status === "processing" && (
        <div className="mt-2">
          <Progress value={v.progress} />
          <div className="mt-1 text-xs text-slate-500">{v.phase ? `${v.phase}… ${Math.round(v.progress * 100)}%` : v.progress === 0 ? "Loading pose model…" : `Estimating pose… ${Math.round(v.progress * 100)}%`}</div>
        </div>
      )}
      {v.status === "error" && <p className="mt-2 text-sm text-red-600">{v.error}</p>}
      {v.processed && v.processed.tracks.length > 1 && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-xs text-slate-500">Worker to assess:</span>
          {v.processed.tracks.slice(0, 6).map((t) => {
            const cov = (t.frames.filter((f) => f.world).length / Math.max(1, t.frames.length)) * 100;
            return (
              <label key={t.personId} className="flex items-center gap-1">
                <input type="radio" name={`p-${v.id}`} checked={(v.selectedPersonId ?? v.processed!.tracks[0].personId) === t.personId} onChange={() => s.updateView(v.id, { selectedPersonId: t.personId })} />
                Person {t.personId} <span className="text-xs text-slate-400">({cov.toFixed(0)}% of frames)</span>
              </label>
            );
          })}
        </div>
      )}
      {v.status === "done" && v.processed && (
        <p className="mt-1 text-xs text-emerald-700">
          Ready: {v.processed.tracks.length} person track(s), {v.processed.tracks[0]?.frames.length ?? 0} frames.
        </p>
      )}
    </div>
  );
}

function Sam3dServerFields() {
  const process = useStore((x) => x.process);
  const setProcess = useStore((x) => x.setProcess);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const test = async () => {
    setStatus(null);
    try {
      const h = await checkServer(process.endpoint, process.token || undefined);
      setStatus({ ok: true, text: `Connected: ${h.model} on ${h.device}` });
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message === "Failed to fetch" ? "Cannot reach server (URL, HTTPS or CORS origins)" : (e as Error).message });
    }
  };
  const inputCls = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";
  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-3">
      <Field label="Server URL" hint="Your SAM 3D Body server (see server/sam3d_body in the repository)">
        <input className={inputCls} value={process.endpoint} onChange={(e) => setProcess({ endpoint: e.target.value })} placeholder="https://gpu.example.com" />
      </Field>
      <Field label="Access token" hint="Kept in memory only">
        <input className={inputCls} type="password" value={process.token} onChange={(e) => setProcess({ token: e.target.value })} />
      </Field>
      <Button variant="secondary" onClick={test} disabled={!process.endpoint}>
        Test connection
      </Button>
      {status && <p className={`text-xs ${status.ok ? "text-emerald-700" : "text-red-600"}`}>{status.text}</p>}
      <p className="text-[11px] leading-snug text-slate-500">
        Videos are uploaded to this server only, deleted after processing, and results come back as 3D keypoints. Use on-device processing when video must not leave the device.
      </p>
    </div>
  );
}
