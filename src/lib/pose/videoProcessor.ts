"use client";

import { PoseDetector, type ModelVariant } from "./detector";
import { PoseTracker } from "./tracker";
import type { PoseFrame, PoseTrack } from "./types";

export interface ProcessOptions {
  fps: number;
  variant: ModelVariant;
  maxPersons: number;
  /** Seconds to add to this view's timeline (from camera sync) */
  offsetSec: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** Called with the frame image + detections, e.g. to capture thumbnails */
  onFrame?: (video: HTMLVideoElement, t: number) => void;
}

export interface ProcessedView {
  viewId: string;
  label: string;
  tracks: PoseTrack[];
  width: number;
  height: number;
  duration: number;
}

function seek(video: HTMLVideoElement, t: number) {
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      video.removeEventListener("error", fail);
      resolve();
    };
    const fail = () => {
      video.removeEventListener("seeked", done);
      reject(new Error("Video seek failed"));
    };
    video.addEventListener("seeked", done);
    video.addEventListener("error", fail);
    video.currentTime = t;
  });
}

export async function loadVideo(url: string): Promise<HTMLVideoElement> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error("Could not decode this video in the browser. Try MP4 (H.264) or WebM."));
  });
  return video;
}

/**
 * Offline analysis of a recorded video: step through it at a fixed sampling
 * rate, run pose estimation on each frame, and track every person.
 */
export async function processVideo(url: string, viewId: string, label: string, opts: ProcessOptions): Promise<ProcessedView> {
  const video = await loadVideo(url);
  const detector = await PoseDetector.create({ variant: opts.variant, numPoses: opts.maxPersons, mode: "VIDEO" });
  const tracker = new PoseTracker();
  const duration = video.duration;
  const n = Math.max(1, Math.floor(duration * opts.fps));
  const byPerson = new Map<number, PoseFrame[]>();
  const times: number[] = [];
  try {
    for (let i = 0; i < n; i++) {
      if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const t = i / opts.fps;
      await seek(video, Math.min(t, duration - 0.001));
      const dets = detector.detect(video, Math.round(t * 1000) + 1);
      const ids = tracker.update(dets, t);
      times.push(t);
      dets.forEach((d, k) => {
        const id = ids[k];
        if (!byPerson.has(id)) byPerson.set(id, []);
        byPerson.get(id)!.push({ t: t + opts.offsetSec, image: d.image, world: d.world });
      });
      opts.onFrame?.(video, t);
      opts.onProgress?.((i + 1) / n);
      // Yield so the UI stays responsive.
      if (i % 4 === 0) await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    detector.close();
  }
  // Densify each person's track onto the full timeline (null where absent).
  const tracks: PoseTrack[] = [...byPerson.entries()]
    .map(([personId, fr]) => {
      const map = new Map(fr.map((f) => [Math.round((f.t - opts.offsetSec) * opts.fps), f]));
      const frames = times.map((t, i) => map.get(i) ?? { t: t + opts.offsetSec, image: null, world: null });
      return {
        viewId,
        viewLabel: label,
        personId,
        fps: opts.fps,
        width: video.videoWidth,
        height: video.videoHeight,
        frames,
      };
    })
    .sort((a, b) => b.frames.filter((f) => f.world).length - a.frames.filter((f) => f.world).length);
  return { viewId, label, tracks, width: video.videoWidth, height: video.videoHeight, duration };
}
