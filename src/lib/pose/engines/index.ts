"use client";

import type { InstantHMR3DResult, Pose3DResult } from "rtmlib-ts";
import type { Detection } from "../tracker";
import { mapMhr70, mapRtmw } from "./mapping";
import { canStore, isStored, modelObjectUrl } from "./modelStore";

/**
 * Pose engines behind one interface. All run in the browser except
 * "sam3d", which is a remote GPU server (see remoteProcessor.ts).
 */

export type EngineId = "rtmw" | "mediapipe" | "instanthmr" | "sam3d";

export interface EngineInfo {
  id: EngineId;
  label: string;
  /** Name stored with tracks and shown in reports */
  source: string;
  download: string;
  licence: string;
  detailedHands: boolean;
  where: "browser" | "server";
  summary: string;
}

export const ENGINES: Record<EngineId, EngineInfo> = {
  rtmw: {
    id: "rtmw",
    label: "RTMW whole-body (recommended)",
    source: "RTMW3D-X",
    download: "≈ 190 MB on first use, then cached",
    licence: "Apache-2.0",
    detailedHands: true,
    where: "browser",
    summary: "133 keypoints including finger joints, so wrist angles are reliable. Slower than MediaPipe; best for recorded video on a laptop or desktop.",
  },
  mediapipe: {
    id: "mediapipe",
    label: "MediaPipe Pose (fastest)",
    source: "MediaPipe Pose",
    download: "≈ 6–30 MB",
    licence: "Apache-2.0",
    detailedHands: false,
    where: "browser",
    summary: "Real-time even on phones. Coarse hand points, so wrist angles are indicative.",
  },
  instanthmr: {
    id: "instanthmr",
    label: "SAM 3D Body Lite (InstantHMR)",
    source: "InstantHMR (SAM 3D Body distillation)",
    download: "≈ 80 MB",
    licence: "SAM License (Meta)",
    detailedHands: true,
    where: "browser",
    summary: "A community distillation of Meta's SAM 3D Body: full-body mesh fit, robust to occlusion. Not independently validated; no per-keypoint confidence.",
  },
  sam3d: {
    id: "sam3d",
    label: "SAM 3D Body (your GPU server)",
    source: "SAM 3D Body",
    download: "runs on your server",
    licence: "SAM License (Meta)",
    detailedHands: true,
    where: "server",
    summary: "Most robust; needs a CUDA GPU server you run (server/sam3d_body). Video is uploaded to that server.",
  },
};

export const BROWSER_ENGINES: EngineId[] = ["rtmw", "mediapipe", "instanthmr"];

/** Model files the app loads; also the keys of the browser's model cache. */
/**
 * RTMW3D-X with float16-stored weights (compute stays float32): 187 MB instead
 * of 369 MB. Converted and validated for this app; see the model card.
 */
export const RTMW_MODEL_URL = "https://huggingface.co/Hfelabs/ergocapture-models/resolve/main/rtmw3d-x-fp16w.onnx";
/** Original full-size export, used only if the copy above is unreachable. */
export const RTMW_MODEL_FALLBACK_URL =
  "https://huggingface.co/Soykaf/RTMW3D-x/resolve/main/onnx/rtmw3d-x_8xb64_cocktail14-384x288-b0a0eab7_20240626.onnx";
export const INSTANTHMR_MODEL_URL = "https://huggingface.co/momolesang/InstantHMR/resolve/main/instanthmr.onnx";

const BIG_MODELS: Partial<Record<EngineId, { url: string; mb: number }>> = {
  rtmw: { url: RTMW_MODEL_URL, mb: 187 },
  instanthmr: { url: INSTANTHMR_MODEL_URL, mb: 80 },
};

/** Size in MB still to download before this engine can run (0 when stored or small). */
export async function pendingDownloadMb(id: EngineId): Promise<number> {
  const m = BIG_MODELS[id];
  if (!m) return 0;
  try {
    if (id === "rtmw") return (await isStored(m.url)) ? 0 : m.mb;
    const { isModelCached } = await import("rtmlib-ts");
    return (await isModelCached(m.url)) ? 0 : m.mb;
  } catch {
    return m.mb;
  }
}

/** False when the browser has too little storage to keep the model (it would re-download each time). */
export async function canKeepModel(id: EngineId): Promise<boolean> {
  const m = BIG_MODELS[id];
  return m ? canStore(m.mb * 1e6) : true;
}

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
  type?: string;
}

/** Phone/tablet, data-saver mode, or a slow or cellular connection. */
export function isConstrainedDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean }; connection?: NetworkInformationLike };
  const c = nav.connection;
  if (c?.saveData || c?.type === "cellular" || ["slow-2g", "2g", "3g"].includes(c?.effectiveType ?? "")) return true;
  if (nav.userAgentData?.mobile) return true;
  // iPadOS reports a desktop UA; touch points give it away.
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent) || (nav.maxTouchPoints > 1 && /Macintosh/.test(nav.userAgent))) return true;
  return false;
}

/** RTMW on laptops/desktops; MediaPipe on phones and constrained connections. */
export function defaultEngine(): Exclude<EngineId, "sam3d"> {
  return isConstrainedDevice() ? "mediapipe" : "rtmw";
}

export interface PoseEngine {
  info: EngineInfo;
  /** Backend actually used (gpu, webgpu, wasm…) */
  backend: string;
  detect(source: HTMLVideoElement | HTMLCanvasElement, timestampMs: number): Promise<Detection[]>;
  close(): void;
}

export interface EngineOptions {
  numPoses: number;
  /** MediaPipe model size */
  variant?: "lite" | "full" | "heavy";
  /** Worker stature (m) used to recover metric scale for RTMW; default 1.70 */
  statureM?: number;
  /** "VIDEO" for timestamped streams (MediaPipe); other engines ignore it */
  mode?: "VIDEO" | "IMAGE";
  onProgress?: (message: string) => void;
}

const timeout = <T>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timed out loading ${what}. Check the network connection.`)), ms)),
  ]);

const sizeOf = (s: HTMLVideoElement | HTMLCanvasElement) =>
  "videoWidth" in s ? { w: s.videoWidth, h: s.videoHeight } : { w: s.width, h: s.height };

/** Keep the most confident / largest detections. */
function topN<T extends { bbox: { x1: number; y1: number; x2: number; y2: number; confidence: number } }>(items: T[], n: number) {
  const area = (b: T["bbox"]) => (b.x2 - b.x1) * (b.y2 - b.y1);
  return [...items].sort((a, b) => b.bbox.confidence * area(b.bbox) - a.bbox.confidence * area(a.bbox)).slice(0, n);
}

async function rtmlibDetector(pose3dModel: "rtmw3d" | "instanthmr", onProgress?: (m: string) => void, only?: "wasm") {
  const { Pose3DDetector } = await import("rtmlib-ts");
  // RTMW: we download and store the model ourselves (progress, persistence,
  // no second download on fallback) and pass a local URL.
  const poseModel =
    pose3dModel === "rtmw3d"
      ? await modelObjectUrl(RTMW_MODEL_URL, (f) => onProgress?.(`Downloading RTMW model… ${Math.round(f * 100)}% (≈ 190 MB, first use only)`)).catch(() =>
          modelObjectUrl(RTMW_MODEL_FALLBACK_URL, (f) => onProgress?.(`Downloading RTMW model (mirror)… ${Math.round(f * 100)}% (≈ 370 MB)`)),
        )
      : undefined;
  const stages: Record<string, string> = {
    "mp-init": "Loading person detector…",
    "pose-load": pose3dModel === "rtmw3d" ? "Preparing RTMW model…" : "Downloading InstantHMR model (≈ 80 MB)…",
    ready: "Model ready",
  };
  // WebGPU when the browser has it, else multi-/single-threaded WASM.
  const backends: Array<"webgpu" | "wasm"> = !only && (await hasWebGpu()) ? ["webgpu", "wasm"] : ["wasm"];
  let lastErr: unknown;
  for (const backend of backends) {
    try {
      const d = new Pose3DDetector({
        // EfficientDet-Lite0 (Apache-2.0) as person detector; the YOLO options are AGPL-licensed.
        objectModel: "mediapipe",
        pose3dModel,
        // Local copy for RTMW (library cache off to avoid storing it twice).
        ...(poseModel ? { poseModel, cache: false } : { cache: true }),
        backend,
        poseConfidence: 0.01, // keep raw scores; the app applies its own reliability model
        detConfidence: 0.4,
        onInitProgress: (stage) => stages[stage] && onProgress?.(stages[stage]),
      });
      await timeout(d.init(), 300_000, pose3dModel === "rtmw3d" ? "the RTMW model" : "the InstantHMR model");
      return { d, backend };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

type RtmlibDetector = Awaited<ReturnType<typeof rtmlibDetector>>["d"];

/** Run detection; if WebGPU fails at inference time, rebuild on WASM and retry once. */
function withFallback(
  model: "rtmw3d" | "instanthmr",
  first: { d: RtmlibDetector; backend: string },
  onProgress?: (m: string) => void,
) {
  let cur = first;
  return {
    get backend() {
      return cur.backend;
    },
    async run(src: HTMLVideoElement | HTMLCanvasElement) {
      const call = () => ("videoWidth" in src ? cur.d.detectFromVideo(src) : cur.d.detectFromCanvas(src));
      try {
        return await call();
      } catch (e) {
        if (cur.backend !== "webgpu") throw e;
        onProgress?.("GPU inference failed; switching to CPU (WebAssembly)…");
        cur.d.dispose();
        cur = await rtmlibDetector(model, onProgress, "wasm");
        return await call();
      }
    },
    dispose: () => cur.d.dispose(),
  };
}

export async function createPoseEngine(id: EngineId, o: EngineOptions): Promise<PoseEngine> {
  const info = ENGINES[id];
  if (id === "mediapipe") {
    const { PoseDetector } = await import("../detector");
    o.onProgress?.("Loading MediaPipe pose model…");
    const det = await PoseDetector.create({ variant: o.variant ?? "full", numPoses: o.numPoses, mode: o.mode ?? "VIDEO" });
    return {
      info,
      backend: det.delegate,
      detect: async (src, ts) => det.detect(src, ts),
      close: () => det.close(),
    };
  }
  if (id === "rtmw") {
    const det = withFallback("rtmw3d", await rtmlibDetector("rtmw3d", o.onProgress), o.onProgress);
    const stature = o.statureM && o.statureM > 0 ? o.statureM : 1.7;
    return {
      info,
      get backend() {
        return det.backend;
      },
      detect: async (src) => {
        const { w, h } = sizeOf(src);
        const r = (await det.run(src)) as Pose3DResult;
        const people = r.keypoints.map((kp, i) => ({ kp, scores: r.scores[i], bbox: personBox(r.keypoints2d[i], r.scores[i]) }));
        return topN(people, o.numPoses)
          .map((p) => mapRtmw(p.kp, p.scores, w, h, stature))
          .filter((m): m is NonNullable<typeof m> => !!m);
      },
      close: () => det.dispose(),
    };
  }
  if (id === "instanthmr") {
    const det = withFallback("instanthmr", await rtmlibDetector("instanthmr", o.onProgress), o.onProgress);
    return {
      info,
      get backend() {
        return det.backend;
      },
      detect: async (src) => {
        const { w, h } = sizeOf(src);
        const r = (await det.run(src)) as unknown as InstantHMR3DResult;
        const persons = r.persons ?? [];
        return topN(persons, o.numPoses)
          .map((p) => mapMhr70(p.keypoints3d.map((k) => [k.x, k.y, k.z]), p.keypoints2d.map((k) => [k.x, k.y]), w, h))
          .filter((m): m is NonNullable<typeof m> => !!m);
      },
      close: () => det.dispose(),
    };
  }
  throw new Error("SAM 3D Body runs on a server; use processRemote instead.");
}

/** Bounding box of confident 2D keypoints (RTMW results carry no box). */
function personBox(kp2: number[][], scores: number[]) {
  let x1 = Infinity,
    y1 = Infinity,
    x2 = -Infinity,
    y2 = -Infinity,
    s = 0,
    n = 0;
  kp2.slice(0, 23).forEach(([x, y], i) => {
    if (scores[i] < 0.3) return;
    x1 = Math.min(x1, x);
    y1 = Math.min(y1, y);
    x2 = Math.max(x2, x);
    y2 = Math.max(y2, y);
    s += scores[i];
    n++;
  });
  return n ? { x1, y1, x2, y2, confidence: s / n } : { x1: 0, y1: 0, x2: 0, y2: 0, confidence: 0 };
}

/** True only when the browser can actually provide a WebGPU adapter. */
async function hasWebGpu(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return !!gpu && !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}
