"use client";

import { drawFrame } from "@/lib/draw";
import type { SessionAnalysis } from "@/lib/ergo/analyze";
import type { PoseTrack } from "@/lib/pose/types";
import type { Privacy } from "@/lib/store";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./ui";

/**
 * Review player: video (optional) with face blur and a risk-coloured
 * skeleton overlay. Without video (skeleton-only sessions) it animates the
 * skeleton on its own clock.
 */
export function Player({
  a,
  track,
  videoUrl,
  offsetSec,
  privacy,
  time,
  onTime,
}: {
  a: SessionAnalysis;
  track?: PoseTrack;
  videoUrl?: string;
  offsetSec: number;
  privacy: Privacy;
  time: number;
  onTime: (t: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const clock = useRef({ t: time, last: 0 });
  const useVideo = !!videoUrl && !privacy.skeletonOnly;
  const w = track?.width ?? 1280;
  const h = track?.height ?? 720;
  const t0 = a.frames[0]?.t ?? 0;

  const frameAt = useCallback(
    (t: number) => {
      const i = Math.max(0, Math.min(a.frames.length - 1, Math.round((t - t0) * a.fps)));
      return i;
    },
    [a, t0],
  );

  const draw = useCallback(
    (t: number) => {
      const c = canvasRef.current;
      if (!c) return;
      const g = c.getContext("2d")!;
      const i = frameAt(t);
      const tf = track?.frames.length ? track.frames[Math.max(0, Math.min(track.frames.length - 1, Math.round((t - track.frames[0].t) * track.fps)))] : null;
      drawFrame(g, useVideo ? videoRef.current : null, tf?.image ?? null, a.frames[i], c.width, c.height, { ...privacy, lineWidth: Math.max(3, c.width / 300) });
      const r = a.reba[i];
      const u = a.rula[i];
      g.fillStyle = "rgba(15,23,42,0.75)";
      g.fillRect(8, 8, 300, 30);
      g.fillStyle = "#fff";
      g.font = `${Math.max(14, c.width / 70)}px sans-serif`;
      g.fillText(a.frames[i].valid ? `t ${t.toFixed(1)}s   RULA ${u.score}   REBA ${r.score}   OWAS AC${a.owas[i].score}` : `t ${t.toFixed(1)}s   no person`, 16, 29);
    },
    [a, track, useVideo, privacy, frameAt],
  );

  // External seeks
  useEffect(() => {
    clock.current.t = time;
    const v = videoRef.current;
    if (useVideo && v && Math.abs(v.currentTime - (time - offsetSec)) > 0.15) v.currentTime = Math.max(0, time - offsetSec);
    else draw(time);
  }, [time, useVideo, offsetSec, draw]);

  useEffect(() => {
    const v = videoRef.current;
    if (!useVideo || !v) return;
    const onSeeked = () => draw(v.currentTime + offsetSec);
    v.addEventListener("seeked", onSeeked);
    v.addEventListener("loadeddata", onSeeked);
    return () => {
      v.removeEventListener("seeked", onSeeked);
      v.removeEventListener("loadeddata", onSeeked);
    };
  }, [useVideo, offsetSec, draw]);

  // Playback loop
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const v = videoRef.current;
    if (useVideo && v) {
      v.playbackRate = rate;
      void v.play();
    }
    clock.current.last = performance.now();
    const end = t0 + a.duration;
    const tick = (now: number) => {
      let t: number;
      if (useVideo && v) t = v.currentTime + offsetSec;
      else {
        t = clock.current.t + ((now - clock.current.last) / 1000) * rate;
        clock.current.last = now;
      }
      if (t >= end) {
        setPlaying(false);
        t = end;
      }
      clock.current.t = t;
      draw(t);
      onTime(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      v?.pause();
    };
  }, [playing, rate, useVideo, offsetSec, a.duration, t0, draw, onTime]);

  return (
    <div>
      <div className="relative overflow-hidden rounded-lg bg-slate-900">
        <canvas ref={canvasRef} width={w > 1280 ? 1280 : w} height={w > 1280 ? Math.round((1280 * h) / w) : h} className="block h-auto w-full" />
        {useVideo && <video ref={videoRef} src={videoUrl} muted playsInline preload="auto" crossOrigin="anonymous" className="hidden" />}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button onClick={() => setPlaying(!playing)}>{playing ? "Pause" : "Play"}</Button>
        <Button variant="secondary" onClick={() => onTime(Math.max(t0, time - 1 / a.fps))} title="Previous frame">
          ◀
        </Button>
        <Button variant="secondary" onClick={() => onTime(Math.min(t0 + a.duration, time + 1 / a.fps))} title="Next frame">
          ▶
        </Button>
        <select className="rounded-md border border-slate-300 px-2 py-1 text-sm" value={rate} onChange={(e) => setRate(Number(e.target.value))}>
          {[0.25, 0.5, 1, 2, 4].map((r) => (
            <option key={r} value={r}>
              {r}×
            </option>
          ))}
        </select>
        <span className="tabular ml-auto text-sm text-slate-500">
          {time.toFixed(1)} / {(t0 + a.duration).toFixed(1)} s
        </span>
      </div>
    </div>
  );
}
