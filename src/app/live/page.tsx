"use client";

import { SettingsPanel } from "@/components/SettingsPanel";
import { Button, Card, ConfBadge, Field, RiskBadge, Select, Toggle } from "@/components/ui";
import { drawFrame } from "@/lib/draw";
import { analyzeSession } from "@/lib/ergo/analyze";
import { scoreWithConfidence } from "@/lib/ergo/confidence";
import { calibrateNeutral, computeFrameMeasures, estimateStature, type FrameMeasures } from "@/lib/ergo/measures";
import { scoreReba } from "@/lib/ergo/reba";
import { RISK_COLORS, type ScoredFrame } from "@/lib/ergo/risk";
import { scoreRula } from "@/lib/ergo/rula";
import { NEUTRAL_CONTEXT } from "@/lib/ergo/settings";
import { PoseDetector, type ModelVariant } from "@/lib/pose/detector";
import { SkeletonSmoother } from "@/lib/pose/filters";
import type { PoseFrame, PoseTrack } from "@/lib/pose/types";
import { hydrateSettings, useStore } from "@/lib/store";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

interface LiveScore {
  rula: ScoredFrame;
  reba: ScoredFrame;
  fm: FrameMeasures;
}

export default function LivePage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [streamUrl, setStreamUrl] = useState("");
  const [variant, setVariant] = useState<ModelVariant>("lite");
  const [state, setState] = useState<"idle" | "loading" | "running">("idle");
  const [recording, setRecording] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [alerts, setAlerts] = useState(true);
  const [score, setScore] = useState<LiveScore | null>(null);
  const [avg, setAvg] = useState<{ rula: number; reba: number } | null>(null);
  const [fps, setFps] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const privacy = useStore((s) => s.privacy);
  const setPrivacy = useStore((s) => s.setPrivacy);
  const calib = useStore((s) => s.calib);

  const rt = useRef({
    detector: null as PoseDetector | null,
    stream: null as MediaStream | null,
    raf: 0,
    smoother: new SkeletonSmoother(1.0, 0.03),
    t0: 0,
    recStart: 0,
    frames: [] as PoseFrame[],
    calibFrames: [] as PoseFrame[],
    recorder: null as MediaRecorder | null,
    chunks: [] as Blob[],
    history: [] as Array<{ t: number; rula: number; reba: number }>,
    highSince: null as number | null,
    lastBeep: 0,
    scale: 1,
    frameTimes: [] as number[],
  });
  const flags = useRef({ recording: false, calibrating: false, alerts: true, privacy });
  flags.current = { recording, calibrating, alerts, privacy };

  useEffect(() => {
    hydrateSettings();
    navigator.mediaDevices?.enumerateDevices().then((d) => setDevices(d.filter((x) => x.kind === "videoinput")));
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const beep = () => {
    try {
      const ctx = new AudioContext();
      const o = ctx.createOscillator();
      o.frequency.value = 880;
      o.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.15);
      setTimeout(() => ctx.close(), 400);
    } catch {
      /* audio unavailable */
    }
  };

  const loop = useCallback(() => {
    const r = rt.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!r.detector || !video || !canvas) return;
    if (video.readyState >= 2) {
      const now = performance.now();
      const t = (now - r.t0) / 1000;
      const dets = r.detector.detect(video, now);
      const det = dets[0];
      const frame: PoseFrame = det
        ? { t, image: r.smoother.smooth(det.image, t, "i"), world: r.smoother.smooth(det.world, t, "w") }
        : { t, image: null, world: null };
      if (canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      const st = useStore.getState();
      const fm = computeFrameMeasures(frame, { scale: r.scale, calib: st.calib });
      let live: LiveScore | null = null;
      if (fm.valid) {
        const rula = scoreWithConfidence(scoreRula, fm.m, fm.c, NEUTRAL_CONTEXT, st.settings, 8, 1);
        const reba = scoreWithConfidence(scoreReba, fm.m, fm.c, NEUTRAL_CONTEXT, st.settings, 8, 2);
        live = { rula, reba, fm };
        r.history.push({ t, rula: rula.score, reba: reba.score });
        while (r.history.length && t - r.history[0].t > 30) r.history.shift();
        // Coaching alert: high REBA sustained for 3 s.
        if (reba.risk >= 3) {
          r.highSince ??= t;
          if (flags.current.alerts && t - r.highSince > 3 && t - r.lastBeep > 5) {
            beep();
            r.lastBeep = t;
          }
        } else r.highSince = null;
      }
      drawFrame(canvas.getContext("2d")!, video, frame.image, fm, canvas.width, canvas.height, flags.current.privacy);
      if (flags.current.recording) r.frames.push({ ...frame, t: t - r.recStart });
      if (flags.current.calibrating && frame.world) r.calibFrames.push(frame);
      r.frameTimes.push(now);
      while (r.frameTimes.length && now - r.frameTimes[0] > 1000) r.frameTimes.shift();
      if (r.frameTimes.length % 3 === 0) {
        setScore(live);
        setFps(r.frameTimes.length);
        if (r.history.length) {
          const n = r.history.length;
          setAvg({ rula: r.history.reduce((a, h) => a + h.rula, 0) / n, reba: r.history.reduce((a, h) => a + h.reba, 0) / n });
        }
      }
    }
    r.raf = requestAnimationFrame(loop);
  }, []);

  const start = async () => {
    setError(null);
    setState("loading");
    try {
      const video = videoRef.current!;
      if (streamUrl) {
        video.srcObject = null;
        video.crossOrigin = "anonymous";
        video.src = streamUrl;
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "environment" },
          audio: false,
        });
        rt.current.stream = stream;
        video.srcObject = stream;
        navigator.mediaDevices.enumerateDevices().then((d) => setDevices(d.filter((x) => x.kind === "videoinput")));
      }
      await video.play();
      rt.current.detector = await PoseDetector.create({ variant, numPoses: 1, mode: "VIDEO" });
      rt.current.t0 = performance.now();
      rt.current.smoother.reset();
      setState("running");
      rt.current.raf = requestAnimationFrame(loop);
    } catch (e) {
      setError(
        (e as Error).name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access in the browser and try again."
          : `Could not start: ${(e as Error).message}`,
      );
      stop();
    }
  };

  const stop = () => {
    const r = rt.current;
    cancelAnimationFrame(r.raf);
    r.detector?.close();
    r.detector = null;
    r.stream?.getTracks().forEach((t) => t.stop());
    r.stream = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    setState("idle");
  };

  const calibrate = () => {
    rt.current.calibFrames = [];
    setCalibrating(true);
    setTimeout(() => {
      setCalibrating(false);
      const frames = rt.current.calibFrames;
      if (frames.length < 5) {
        setError("Calibration failed: no person visible. Stand upright, arms relaxed, whole body in view.");
        return;
      }
      useStore.getState().setCalib(calibrateNeutral(frames));
      const st = useStore.getState().settings;
      const est = estimateStature(frames);
      rt.current.scale = st.subjectHeightCm > 0 && est > 0 ? st.subjectHeightCm / 100 / est : 1;
    }, 2500);
  };

  const startRecording = () => {
    const r = rt.current;
    r.frames = [];
    r.chunks = [];
    r.recStart = (performance.now() - r.t0) / 1000;
    if (r.stream && !privacy.skeletonOnly && typeof MediaRecorder !== "undefined") {
      try {
        r.recorder = new MediaRecorder(r.stream);
        r.recorder.ondataavailable = (e) => e.data.size && r.chunks.push(e.data);
        r.recorder.start(1000);
      } catch {
        r.recorder = null;
      }
    }
    setRecording(true);
  };

  const stopRecording = async () => {
    setRecording(false);
    const r = rt.current;
    let url: string | undefined;
    if (r.recorder) {
      await new Promise<void>((res) => {
        r.recorder!.onstop = () => res();
        r.recorder!.stop();
      });
      url = URL.createObjectURL(new Blob(r.chunks, { type: r.recorder.mimeType || "video/webm" }));
      r.recorder = null;
    }
    const frames = r.frames;
    if (frames.length < 10) {
      setError("Recording too short.");
      return;
    }
    // Resample the variable-rate live stream to a fixed 10 fps grid.
    const fps = 10;
    const dur = frames[frames.length - 1].t;
    const grid: PoseFrame[] = [];
    let j = 0;
    for (let k = 0; k * (1 / fps) <= dur; k++) {
      const t = k / fps;
      while (j + 1 < frames.length && Math.abs(frames[j + 1].t - t) <= Math.abs(frames[j].t - t)) j++;
      const f = frames[j];
      grid.push(Math.abs(f.t - t) < 0.2 ? { ...f, t } : { t, image: null, world: null });
    }
    const video = videoRef.current!;
    const track: PoseTrack = { viewId: "live", viewLabel: "Live camera", personId: 1, fps, width: video.videoWidth || 1280, height: video.videoHeight || 720, frames: grid };
    stop();
    const st = useStore.getState();
    st.reset();
    st.setCalib(calib);
    st.setViews([{ id: "live", label: "Live camera", kind: "live", url, offsetSec: 0, status: "done", progress: 1, processed: { viewId: "live", label: "Live camera", tracks: [track], width: track.width, height: track.height, duration: dur } }]);
    st.setTitle(`Live session ${new Date().toLocaleString()}`);
    st.setAnalysis(analyzeSession({ tracks: [track], settings: st.settings, calib: st.calib }));
    router.push("/analyze");
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Live coaching</h1>
        <p className="text-sm text-slate-500">
          Real-time pose and RULA/REBA on this device. Record a session to get the full multi-method analysis and report.
        </p>
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="relative overflow-hidden rounded-lg bg-slate-900" style={{ aspectRatio: "16 / 9" }}>
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full object-contain" />
            <video ref={videoRef} playsInline muted className="hidden" />
            {state !== "running" && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
                {state === "loading" ? "Loading camera and pose model…" : "Camera off"}
              </div>
            )}
            {recording && <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white">● REC</div>}
            {calibrating && <div className="absolute inset-x-0 bottom-4 text-center text-lg font-semibold text-white drop-shadow">Stand upright, arms relaxed…</div>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {state === "running" ? (
              <>
                <Button variant="secondary" onClick={stop}>
                  Stop camera
                </Button>
                <Button variant="secondary" onClick={calibrate} disabled={calibrating || recording}>
                  Calibrate neutral posture
                </Button>
                {recording ? (
                  <Button variant="danger" onClick={stopRecording}>
                    Stop and analyse
                  </Button>
                ) : (
                  <Button onClick={startRecording}>Start recording</Button>
                )}
              </>
            ) : (
              <Button onClick={start} disabled={state === "loading"}>
                Start camera
              </Button>
            )}
            <span className="tabular ml-auto text-xs text-slate-500">{state === "running" ? `${fps} fps` : ""}</span>
          </div>
        </Card>
        <div className="space-y-4">
          <Card title="Current posture">
            {score ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {(["rula", "reba"] as const).map((k) => (
                    <div key={k} className="rounded-lg border p-3 text-center" style={{ borderColor: RISK_COLORS[score[k].risk] }}>
                      <div className="text-xs font-medium text-slate-500">{k.toUpperCase()}</div>
                      <div className="tabular text-4xl font-bold" style={{ color: RISK_COLORS[score[k].risk] }}>
                        {score[k].score}
                      </div>
                      <ConfBadge conf={score[k].conf} label={false} />
                    </div>
                  ))}
                </div>
                <div className="mt-2">
                  <RiskBadge risk={score.reba.risk} text={score.reba.label} />
                </div>
                <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                  {[...new Set([...score.reba.drivers, ...score.rula.drivers])].slice(0, 5).map((d) => (
                    <li key={d}>• {d}</li>
                  ))}
                </ul>
                {avg && (
                  <p className="mt-2 text-xs text-slate-500">
                    30 s average: RULA {avg.rula.toFixed(1)}, REBA {avg.reba.toFixed(1)}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-500">{state === "running" ? "No person detected. Step back so the whole body is visible." : "Start the camera to begin."}</p>
            )}
          </Card>
          <Card title="Camera">
            <div className="space-y-3">
              <Field label="Source">
                <Select
                  value={deviceId}
                  onChange={setDeviceId}
                  options={[{ value: "", label: "Default camera" }, ...devices.map((d, k) => ({ value: d.deviceId, label: d.label || `Camera ${k + 1}` }))]}
                />
              </Field>
              <Field label="Or network stream URL" hint="IP camera stream playable in the browser (MP4/HLS/WebM) with CORS enabled">
                <input className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={streamUrl} onChange={(e) => setStreamUrl(e.target.value)} placeholder="https://camera.local/stream.m3u8" />
              </Field>
              <Field label="Model">
                <Select
                  value={variant}
                  onChange={setVariant}
                  options={[
                    { value: "lite", label: "Lite (phones, fastest)" },
                    { value: "full", label: "Full" },
                    { value: "heavy", label: "Heavy (desktop GPU)" },
                  ]}
                />
              </Field>
              <Toggle checked={privacy.blurFaces} onChange={(v) => setPrivacy({ blurFaces: v })} label="Blur faces" />
              <Toggle checked={privacy.skeletonOnly} onChange={(v) => setPrivacy({ skeletonOnly: v })} label="Skeleton only (no video stored)" />
              <Toggle checked={alerts} onChange={setAlerts} label="Beep when high risk lasts > 3 s" />
              {calib.up && <p className="text-xs text-emerald-700">Neutral calibration active.</p>}
            </div>
          </Card>
          <Card title="Task inputs">
            <SettingsPanel compact />
          </Card>
        </div>
      </div>
    </div>
  );
}
