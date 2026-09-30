"use client";

import type { PoseLandmarker as PL } from "@mediapipe/tasks-vision";
import type { Keypoint } from "./types";
import type { Detection } from "./tracker";

/**
 * On-device pose estimation with MediaPipe Pose Landmarker (Apache-2.0,
 * commercial use permitted). Runs in the browser on the GPU when available;
 * no video leaves the device.
 */

export type ModelVariant = "lite" | "full" | "heavy";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL = (v: ModelVariant) =>
  `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${v}/float16/latest/pose_landmarker_${v}.task`;

export interface DetectorOptions {
  variant: ModelVariant;
  numPoses: number;
  mode: "VIDEO" | "IMAGE";
}

export class PoseDetector {
  private constructor(
    private lm: PL,
    public readonly options: DetectorOptions,
    public readonly delegate: "GPU" | "CPU",
  ) {}

  static async create(options: DetectorOptions): Promise<PoseDetector> {
    const timeout = <T>(p: Promise<T>, ms: number) =>
      Promise.race([
        p,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timed out loading the pose model. Check the network connection (the model is fetched from Google's CDN).")), ms),
        ),
      ]);
    return timeout(PoseDetector.load(options), 90_000);
  }

  private static async load(options: DetectorOptions): Promise<PoseDetector> {
    const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    const make = (delegate: "GPU" | "CPU") =>
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL(options.variant), delegate },
        runningMode: options.mode,
        numPoses: options.numPoses,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    try {
      return new PoseDetector(await make("GPU"), options, "GPU");
    } catch {
      return new PoseDetector(await make("CPU"), options, "CPU");
    }
  }

  /** Detect poses in a video frame. `timestampMs` must increase monotonically in VIDEO mode. */
  detect(source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap, timestampMs: number): Detection[] {
    const r = this.options.mode === "VIDEO" ? this.lm.detectForVideo(source, timestampMs) : this.lm.detect(source);
    const conv = (arr: Array<{ x: number; y: number; z: number; visibility?: number }>): Keypoint[] =>
      arr.map((p) => ({ x: p.x, y: p.y, z: p.z, v: p.visibility ?? 1 }));
    return r.landmarks.map((l, i) => ({ image: conv(l), world: conv(r.worldLandmarks[i] ?? l) }));
  }

  close() {
    this.lm.close();
  }
}
