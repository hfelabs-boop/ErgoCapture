"use client";

import { create } from "zustand";
import type { SessionAnalysis } from "./ergo/analyze";
import type { Calibration } from "./ergo/measures";
import { DEFAULT_SETTINGS, type TaskSettings } from "./ergo/settings";
import type { ModelVariant } from "./pose/detector";
import { defaultEngine, type EngineId } from "./pose/engines";
import type { PoseTrack } from "./pose/types";
import type { ProcessedView } from "./pose/videoProcessor";

export type SourceKind = "video" | "pose" | "live" | "demo";

export interface ViewSource {
  id: string;
  label: string;
  kind: SourceKind;
  file?: File;
  /** Object URL of the video (kept only in memory, never uploaded) */
  url?: string;
  /** Seconds added to this view's clock to align with the first view */
  offsetSec: number;
  /** Detected sync event time in this recording (s) */
  syncEventSec?: number | null;
  status: "idle" | "processing" | "done" | "error";
  progress: number;
  /** Progress label, e.g. "Uploading", "Queued on server" */
  phase?: string;
  error?: string;
  processed?: ProcessedView;
  selectedPersonId?: number;
}

export interface Privacy {
  blurFaces: boolean;
  skeletonOnly: boolean;
}

export type PoseEngine = EngineId;

export interface ProcessOptions {
  fps: number;
  variant: ModelVariant;
  maxPersons: number;
  engine: PoseEngine;
  /** SAM 3D Body server URL (server/sam3d_body) */
  endpoint: string;
  /** Access token for the server; kept in memory only, never persisted */
  token: string;
}

interface State {
  views: ViewSource[];
  settings: TaskSettings;
  calib: Calibration;
  process: ProcessOptions;
  privacy: Privacy;
  analysis: SessionAnalysis | null;
  title: string;
  addView: (v: ViewSource) => void;
  updateView: (id: string, patch: Partial<ViewSource>) => void;
  removeView: (id: string) => void;
  setViews: (v: ViewSource[]) => void;
  setSettings: (patch: Partial<TaskSettings>) => void;
  setCalib: (c: Calibration) => void;
  setProcess: (patch: Partial<ProcessOptions>) => void;
  setPrivacy: (patch: Partial<Privacy>) => void;
  setAnalysis: (a: SessionAnalysis | null) => void;
  setTitle: (t: string) => void;
  reset: () => void;
}

const SETTINGS_KEY = "ergocapture.settings.v1";
const PROCESS_KEY = "ergocapture.engine.v2";

function loadSettings(): TaskSettings {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(SETTINGS_KEY) : null;
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export const useStore = create<State>((set, get) => ({
  views: [],
  settings: DEFAULT_SETTINGS,
  calib: {},
  process: { fps: 10, variant: "full", maxPersons: 2, engine: "rtmw", endpoint: "", token: "" },
  privacy: { blurFaces: true, skeletonOnly: false },
  analysis: null,
  title: "Workstation assessment",
  addView: (v) => set({ views: [...get().views, v] }),
  updateView: (id, patch) => set({ views: get().views.map((v) => (v.id === id ? { ...v, ...patch } : v)) }),
  removeView: (id) => {
    const v = get().views.find((x) => x.id === id);
    if (v?.url) URL.revokeObjectURL(v.url);
    set({ views: get().views.filter((x) => x.id !== id) });
  },
  setViews: (views) => set({ views }),
  setSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* storage unavailable */
    }
    set({ settings });
  },
  setCalib: (calib) => set({ calib }),
  setProcess: (patch) => {
    const process = { ...get().process, ...patch };
    try {
      window.localStorage.setItem(PROCESS_KEY, JSON.stringify({ engine: process.engine, endpoint: process.endpoint }));
    } catch {
      /* storage unavailable */
    }
    set({ process });
  },
  setPrivacy: (patch) => set({ privacy: { ...get().privacy, ...patch } }),
  setAnalysis: (analysis) => set({ analysis }),
  setTitle: (title) => set({ title }),
  reset: () => {
    for (const v of get().views) if (v.url) URL.revokeObjectURL(v.url);
    set({ views: [], analysis: null, calib: {} });
  },
}));

/** Load persisted settings once on the client. */
export function hydrateSettings() {
  let engine: Partial<ProcessOptions> = {};
  try {
    engine = JSON.parse(window.localStorage.getItem(PROCESS_KEY) ?? "{}");
  } catch {
    /* storage unavailable */
  }
  // No saved choice yet: pick by device (MediaPipe on phones, RTMW elsewhere).
  if (!engine.engine) engine.engine = defaultEngine();
  useStore.setState((s) => ({ settings: loadSettings(), process: { ...s.process, ...engine } }));
}

/** The track chosen for analysis in each processed view. */
export function selectedTracks(views: ViewSource[]): PoseTrack[] {
  return views
    .filter((v) => v.processed && v.processed.tracks.length)
    .map((v) => v.processed!.tracks.find((t) => t.personId === v.selectedPersonId) ?? v.processed!.tracks[0]);
}

export const newId = () => Math.random().toString(36).slice(2, 9);
