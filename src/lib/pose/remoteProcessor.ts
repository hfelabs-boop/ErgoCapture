"use client";

import { importGenericPose, type GenericPoseFile } from "./importExport";
import type { ProcessedView } from "./videoProcessor";

/**
 * Client for the SAM 3D Body GPU server (server/sam3d_body). The video is
 * uploaded to the user's own server, processed there, and the 3D keypoints
 * come back as an ErgoCapture "mhr70" pose file.
 */

export interface RemoteOptions {
  endpoint: string;
  token?: string;
  fps: number;
  offsetSec: number;
  onProgress?: (fraction: number, phase: "upload" | "queued" | "processing") => void;
  signal?: AbortSignal;
}

const base = (u: string) => u.trim().replace(/\/+$/, "");
const headers = (token?: string): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

export async function checkServer(endpoint: string, token?: string): Promise<{ engine: string; model: string; device: string }> {
  const r = await fetch(`${base(endpoint)}/health`, { headers: headers(token) });
  if (!r.ok) throw new Error(`Server answered ${r.status}`);
  const a = await fetch(`${base(endpoint)}/auth`, { headers: headers(token) });
  if (a.status === 401) throw new Error("Server reached, but the access token was rejected");
  return r.json();
}

function upload(url: string, form: FormData, token: string | undefined, onProgress: (f: number) => void, signal?: AbortSignal) {
  // XHR gives upload progress, which fetch does not.
  return new Promise<{ id: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
      else reject(new Error(xhr.status === 401 ? "Server rejected the access token" : `Upload failed (${xhr.status}): ${xhr.responseText.slice(0, 200)}`));
    };
    xhr.onerror = () => reject(new Error("Cannot reach the SAM 3D Body server (check the URL, HTTPS and CORS origins)"));
    signal?.addEventListener("abort", () => {
      xhr.abort();
      reject(new DOMException("Aborted", "AbortError"));
    });
    xhr.send(form);
  });
}

export async function processRemote(file: File, viewId: string, label: string, o: RemoteOptions): Promise<ProcessedView> {
  const url = base(o.endpoint);
  const form = new FormData();
  form.append("file", file);
  form.append("fps", String(o.fps));
  form.append("label", label);
  const { id } = await upload(`${url}/jobs`, form, o.token, (f) => o.onProgress?.(f, "upload"), o.signal);

  for (;;) {
    if (o.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    await new Promise((r) => setTimeout(r, 1500));
    const r = await fetch(`${url}/jobs/${id}`, { headers: headers(o.token), signal: o.signal });
    if (!r.ok) throw new Error(`Job status failed (${r.status})`);
    const st: { status: string; progress: number; error?: string } = await r.json();
    if (st.status === "error") throw new Error(`SAM 3D Body failed: ${st.error}`);
    if (st.status === "done") break;
    o.onProgress?.(st.progress, st.status === "queued" ? "queued" : "processing");
  }

  const res = await fetch(`${url}/jobs/${id}/result`, { headers: headers(o.token), signal: o.signal });
  if (!res.ok) throw new Error(`Could not download result (${res.status})`);
  const pose: GenericPoseFile = await res.json();
  const track = importGenericPose(pose, viewId);
  track.viewLabel = label;
  for (const f of track.frames) f.t += o.offsetSec;
  return {
    viewId,
    label,
    tracks: [track],
    width: track.width,
    height: track.height,
    duration: track.frames.length / track.fps,
  };
}
