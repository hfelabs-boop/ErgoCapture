"use client";

import { create } from "zustand";
import type { SessionAnalysis } from "./ergo/analyze";
import type { Calibration } from "./ergo/measures";
import { DEFAULT_SETTINGS, type TaskSettings } from "./ergo/settings";
import type { ModelVariant } from "./pose/detector";
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
  error?: string;
  processed?: ProcessedView;
  selectedPersonId?: number;
}

export interface Privacy {
  blurFaces: boolean;
  skeletonOnly: boolean;
}

export interface ProcessOptions {
  fps: number;
  variant: ModelVariant;
  maxPersons: number;
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
  process: { fps: 10, variant: "full", maxPersons: 2 },
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
  setProcess: (patch) => set({ process: { ...get().process, ...patch } }),
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
  useStore.setState({ settings: loadSettings() });
}

/** The track chosen for analysis in each processed view. */
export function selectedTracks(views: ViewSource[]): PoseTrack[] {
  return views
    .filter((v) => v.processed && v.processed.tracks.length)
    .map((v) => v.processed!.tracks.find((t) => t.personId === v.selectedPersonId) ?? v.processed!.tracks[0]);
}

export const newId = () => Math.random().toString(36).slice(2, 9);
