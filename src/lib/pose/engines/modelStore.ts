"use client";

/**
 * Download-once storage for large model files (RTMW ≈ 350 MB).
 *
 * The model is fetched with progress reporting, saved in the Cache API (with
 * a request for persistent storage so the browser does not evict it), and
 * handed to ONNX Runtime as a local blob: URL, so a WebGPU→WASM fallback
 * never downloads it twice. If the browser refuses to store it (private
 * window, low disk), it still works for this session.
 */

const CACHE = "ergocapture-models-v1";

export async function isStored(url: string): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  try {
    return !!(await (await caches.open(CACHE)).match(url));
  } catch {
    return false;
  }
}

/** Whether the browser is likely to keep a file of this size. */
export async function canStore(bytes: number): Promise<boolean> {
  try {
    const est = await navigator.storage?.estimate?.();
    if (!est?.quota) return true;
    return est.quota - (est.usage ?? 0) > bytes * 1.2;
  } catch {
    return true;
  }
}

const objectUrls = new Map<string, string>();

export async function modelObjectUrl(url: string, onProgress?: (fraction: number) => void): Promise<string> {
  const known = objectUrls.get(url);
  if (known) return known;
  let blob: Blob | null = null;
  try {
    const hit = typeof caches !== "undefined" ? await (await caches.open(CACHE)).match(url) : undefined;
    if (hit) blob = await hit.blob();
  } catch {
    blob = null;
  }
  if (!blob) {
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`Model download failed (${res.status})`);
    const total = Number(res.headers.get("content-length")) || 0;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.byteLength;
      if (total) onProgress?.(got / total);
    }
    blob = new Blob(chunks as BlobPart[], { type: "application/octet-stream" });
    if (blob.size === 0) throw new Error("Model download returned an empty file");
    try {
      await navigator.storage?.persist?.();
      if (typeof caches !== "undefined") await (await caches.open(CACHE)).put(url, new Response(blob));
    } catch {
      // Not stored (quota or private window): works now, downloads again next time.
    }
  }
  const objectUrl = URL.createObjectURL(blob);
  objectUrls.set(url, objectUrl);
  return objectUrl;
}

export async function forgetModel(url: string) {
  const o = objectUrls.get(url);
  if (o) URL.revokeObjectURL(o);
  objectUrls.delete(url);
  try {
    await (await caches.open(CACHE)).delete(url);
  } catch {
    /* nothing stored */
  }
}
