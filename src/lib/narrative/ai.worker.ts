/// <reference lib="webworker" />
import { describeFrames, isOutOfMemory, writeNarrative, type AiDevice, type FrameInput } from "./aiCore";

interface Job {
  device: AiDevice;
  facts: string;
  frames: FrameInput[];
  fullWriter?: boolean;
  /** Use the small writer (retry after running out of memory) */
  small?: boolean;
  /** Frame descriptions from an earlier attempt, so the vision step is not repeated */
  frameNotes?: Array<{ t: number; text: string }>;
}

/** Runs the AI narrative models off the main thread so the page stays responsive. */
self.onmessage = async (e: MessageEvent<Job>) => {
  const { device, facts, frames, fullWriter, small } = e.data;
  const onProgress = (message: string) => self.postMessage({ type: "progress", message });
  let frameNotes = e.data.frameNotes;
  try {
    frameNotes ??= await describeFrames(frames, { device, onProgress });
    const { sections, removed, model } = await writeNarrative(facts, frameNotes, { device, onProgress, fullWriter, small });
    self.postMessage({ type: "result", sections, removed, model, frameNotes });
  } catch (err) {
    // WebAssembly memory cannot shrink: the page retries in a fresh worker.
    self.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err), oom: isOutOfMemory(err), frameNotes });
  }
};
