"use client";

import type { PhotoInput } from "../ergo/photos";
import type { ModelVariant } from "./detector";
import { createPoseEngine, type EngineId } from "./engines";
import type { Detection } from "./tracker";

/** Pose estimation on still photos with any browser engine. */

const MAX_SIDE = 1600;

/** Decode a photo upright (EXIF orientation applied) onto a canvas, downscaled for speed. */
export async function loadPhoto(file: File): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(
      /\.hei[cf]$/i.test(file.name)
        ? `${file.name}: HEIC photos cannot be read by this browser. Export as JPEG (iPhone: Settings → Camera → Formats → Most Compatible).`
        : `${file.name}: this image format cannot be read by the browser.`,
    );
  }
  const k = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bitmap.width * k);
  c.height = Math.round(bitmap.height * k);
  c.getContext("2d")!.drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close();
  return c;
}

/** The main person: largest box of confident image keypoints. */
export function mainPerson(dets: Detection[]): Detection | null {
  let best: Detection | null = null;
  let bestArea = 0;
  for (const d of dets) {
    const pts = d.image.filter((k) => k.v > 0.3);
    if (pts.length < 5) continue;
    const xs = pts.map((k) => k.x);
    const ys = pts.map((k) => k.y);
    const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    if (area > bestArea) {
      bestArea = area;
      best = d;
    }
  }
  return best;
}

export interface PhotoJob {
  id: string;
  name: string;
  file: File;
}

export async function detectPhotos(
  jobs: PhotoJob[],
  engineId: Exclude<EngineId, "sam3d">,
  o: {
    variant?: ModelVariant;
    statureM?: number;
    onProgress?: (done: number, total: number, message?: string) => void;
    onError?: (job: PhotoJob, message: string) => void;
    signal?: AbortSignal;
  },
): Promise<PhotoInput[]> {
  const engine = await createPoseEngine(engineId, {
    numPoses: 3,
    variant: o.variant ?? "heavy", // photos: accuracy over speed
    statureM: o.statureM,
    mode: "IMAGE",
    onProgress: (m) => o.onProgress?.(0, jobs.length, m),
  });
  const out: PhotoInput[] = [];
  try {
    for (const [i, job] of jobs.entries()) {
      if (o.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      o.onProgress?.(i, jobs.length, `Analysing ${job.name}…`);
      let det: Detection | null = null;
      let width = 0,
        height = 0;
      try {
        const canvas = await loadPhoto(job.file);
        width = canvas.width;
        height = canvas.height;
        det = mainPerson(await engine.detect(canvas, i + 1));
      } catch (e) {
        o.onError?.(job, (e as Error).message);
      }
      out.push({
        id: job.id,
        name: job.name,
        width,
        height,
        image: det?.image ?? null,
        world: det?.world ?? null,
        source: engine.info.source,
        detailedHands: engine.info.detailedHands,
      });
      o.onProgress?.(i + 1, jobs.length);
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    engine.close();
  }
  return out;
}
