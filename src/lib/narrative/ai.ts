"use client";

import { isConstrainedDevice } from "../pose/engines";
import { AI_MODELS, type AiDevice, type FrameInput } from "./aiCore";
import { factSheet, type Narrative } from "./template";

/**
 * Optional AI-written narrative, run entirely in the browser (Transformers.js
 * in a Web Worker, WebGPU). Two open models from Hugging Face:
 *  - SmolVLM2-500M (Apache-2.0) describes a few key video frames;
 *  - Qwen3-1.7B (Apache-2.0) rewrites the computed results as a narrative.
 * The text model only rephrases facts from the analysis; sentences with
 * numbers that are not in those facts are removed.
 */

export { AI_MODELS };
export type { AiDevice };

const DOWNLOADED_KEY = "ergocapture.ai.downloaded.v1";

export interface AiAvailability {
  ok: boolean;
  device?: AiDevice;
  reason?: string;
}

/** Disabled on phones/tablets and on browsers without WebGPU. */
export async function aiAvailability(): Promise<AiAvailability> {
  if (typeof window === "undefined") return { ok: false, reason: "Not available" };
  // CPU mode for automated testing only.
  const testMode = new URLSearchParams(window.location.search).get("ai");
  if (testMode === "wasm" || testMode === "wasm-full") return { ok: true, device: "wasm" };
  if (isConstrainedDevice()) return { ok: false, reason: "The AI narrative is turned off on phones and tablets (≈ 1.8 GB of models). Use a laptop or desktop." };
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (gpu && (await gpu.requestAdapter())) return { ok: true, device: "webgpu" };
  } catch {
    /* no adapter */
  }
  return { ok: false, reason: "The AI narrative needs WebGPU (current Chrome or Edge on a laptop/desktop). The standard narrative is available." };
}

export function aiModelsDownloaded(): boolean {
  try {
    return window.localStorage.getItem(DOWNLOADED_KEY) === "1";
  } catch {
    return false;
  }
}

export const aiDownloadMb = () => AI_MODELS.vision.mb + AI_MODELS.text.mb;

export interface AiOptions {
  device: AiDevice;
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
}

type Notes = Array<{ t: number; text: string }>;
type WorkerMsg =
  | { type: "progress"; message: string }
  | { type: "result"; sections: Narrative["sections"]; removed: number; model: string; frameNotes: Notes }
  | { type: "error"; message: string; oom?: boolean; frameNotes?: Notes };

class WorkerError extends Error {
  constructor(
    message: string,
    public oom: boolean,
    public frameNotes?: Notes,
  ) {
    super(message);
  }
}

/** One attempt in a fresh worker (fresh memory). */
async function runWorker(job: Record<string, unknown>, transfer: Transferable[], o: AiOptions) {
  const worker = new Worker(new URL("./ai.worker.ts", import.meta.url), { type: "module" });
  try {
    return await new Promise<Extract<WorkerMsg, { type: "result" }>>((resolve, reject) => {
      o.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      worker.onerror = (e) => reject(new WorkerError(e.message || "AI worker failed", false));
      worker.onmessage = (e: MessageEvent<WorkerMsg>) => {
        const m = e.data;
        if (m.type === "progress") o.onProgress?.(m.message);
        else if (m.type === "error") reject(new WorkerError(m.message, !!m.oom, m.frameNotes));
        else resolve(m);
      };
      worker.postMessage(job, transfer);
    });
  } finally {
    // Terminating frees the models' memory and stops work immediately on cancel.
    worker.terminate();
  }
}

export async function generateAiNarrative(
  template: Narrative,
  frames: Array<{ t: number; canvas: HTMLCanvasElement }>,
  o: AiOptions,
): Promise<Narrative & { removedSentences: number }> {
  const inputs: FrameInput[] = frames.map((f) => {
    const img = f.canvas.getContext("2d")!.getImageData(0, 0, f.canvas.width, f.canvas.height);
    return { t: f.t, width: img.width, height: img.height, data: img.data };
  });
  const fullWriter = new URLSearchParams(window.location.search).get("ai") === "wasm-full";
  const job = { device: o.device, facts: factSheet(template), fullWriter };
  let res: Extract<WorkerMsg, { type: "result" }>;
  try {
    res = await runWorker({ ...job, frames: inputs }, inputs.map((f) => f.data.buffer), o);
  } catch (e) {
    if (!(e instanceof WorkerError) || !e.oom) throw e;
    // Large writer did not fit: retry with the small one in a fresh worker, reusing the frame notes.
    o.onProgress?.(`${AI_MODELS.text.name} did not fit in this device's memory; using the smaller ${AI_MODELS.textCpu.name}…`);
    res = await runWorker({ ...job, frames: [], small: true, frameNotes: e.frameNotes ?? [] }, [], o);
  }
  try {
    window.localStorage.setItem(DOWNLOADED_KEY, "1");
  } catch {
    /* storage unavailable */
  }
  if (!res.sections.length) throw new Error("The AI model did not produce a usable narrative. Use the standard narrative.");
  return {
    title: template.title,
    source: "ai",
    model: res.frameNotes.length ? `${res.model} + ${AI_MODELS.vision.name}` : res.model,
    // Descriptive sections from the model; recommendations verbatim from the rule-based engine.
    sections: [...res.sections, ...template.sections.filter((s) => s.heading === "Recommendations")],
    frameNotes: res.frameNotes,
    removedSentences: res.removed,
  };
}
