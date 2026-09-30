"use client";

import type { SessionAnalysis } from "../ergo/analyze";
import { rebaRisk } from "../ergo/reba";
import { rulaRisk } from "../ergo/rula";
import { drawBodyHeatmap, drawFrame, drawScoreChart, type DrawOptions } from "../draw";
import type { PoseTrack } from "../pose/types";
import { loadVideo } from "../pose/videoProcessor";

export interface WorstMoment {
  t: number;
  frameIndex: number;
  method: "RULA" | "REBA";
  score: number;
  conf: number;
  label: string;
  drivers: string[];
  image: string;
}

export interface ReportImages {
  rulaChart: string;
  rebaChart: string;
  heatmap: string;
  worst: WorstMoment[];
}

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export function chartImage(a: SessionAnalysis, which: "rula" | "reba", w = 1000, h = 220) {
  const c = canvas(w, h);
  const t = a.frames.map((f) => f.t);
  const scores = a[which];
  drawScoreChart(
    c.getContext("2d")!,
    w,
    h,
    t,
    scores.map((s, i) => (a.frames[i].valid ? s.score : NaN)),
    scores.map((s) => s.conf),
    which === "rula" ? 7 : 15,
    which === "rula" ? rulaRisk : rebaRisk,
    which === "rula" ? "RULA score over time (line opacity = confidence)" : "REBA score over time (line opacity = confidence)",
  );
  return c.toDataURL("image/png");
}

export function heatmapImage(a: SessionAnalysis) {
  const c = canvas(400, 840);
  drawBodyHeatmap(c.getContext("2d")!, a.exposure, 2);
  return c.toDataURL("image/png");
}

/** Render worst moments: video frame (if kept) with face blur + risk-coloured skeleton, else skeleton only. */
export async function worstMoments(
  a: SessionAnalysis,
  primary: PoseTrack | undefined,
  videoUrl: string | undefined,
  opts: DrawOptions,
  videoOffsetSec = 0,
  max = 4,
): Promise<WorstMoment[]> {
  const picks: Array<{ i: number; method: "RULA" | "REBA" }> = [];
  for (const i of a.summary.reba.worstFrames) if (picks.length < Math.ceil(max / 2)) picks.push({ i, method: "REBA" });
  for (const i of a.summary.rula.worstFrames)
    if (picks.length < max && picks.every((p) => Math.abs(a.frames[p.i].t - a.frames[i].t) > 2)) picks.push({ i, method: "RULA" });
  let video: HTMLVideoElement | null = null;
  if (videoUrl && !opts.skeletonOnly) {
    try {
      video = await loadVideo(videoUrl);
    } catch {
      video = null;
    }
  }
  const W = 640;
  const H = primary ? Math.round((W * primary.height) / primary.width) : 360;
  const out: WorstMoment[] = [];
  for (const p of picks) {
    const f = a.frames[p.i];
    const pf = primary?.frames.reduce((best, x) => (Math.abs(x.t - f.t) < Math.abs(best.t - f.t) ? x : best), primary.frames[0]);
    const c = canvas(W, H);
    const g = c.getContext("2d")!;
    if (video) {
      await new Promise<void>((r) => {
        video!.onseeked = () => r();
        // Track times include the sync offset; the video's own clock does not.
        video!.currentTime = Math.max(0, (pf ? pf.t : f.t) - videoOffsetSec);
      });
    }
    drawFrame(g, video, pf?.image ?? null, f, W, H, { ...opts, lineWidth: 4 });
    const s = p.method === "RULA" ? a.rula[p.i] : a.reba[p.i];
    out.push({ t: f.t, frameIndex: p.i, method: p.method, score: s.score, conf: s.conf, label: s.label, drivers: s.drivers, image: c.toDataURL("image/jpeg", 0.85) });
  }
  return out;
}

export async function buildReportImages(
  a: SessionAnalysis,
  primary: PoseTrack | undefined,
  videoUrl: string | undefined,
  opts: DrawOptions,
  videoOffsetSec = 0,
): Promise<ReportImages> {
  const worst = await worstMoments(a, primary, videoUrl, opts, videoOffsetSec);
  return { rulaChart: chartImage(a, "rula"), rebaChart: chartImage(a, "reba"), heatmap: heatmapImage(a), worst };
}
