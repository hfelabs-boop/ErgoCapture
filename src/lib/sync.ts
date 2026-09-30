"use client";

/**
 * Multi-camera time synchronisation.
 *
 * Each phone records the same sync event — a clap, or the flash + beep from
 * the /sync page. We locate that event in every recording (audio onset or
 * brightness spike) and shift timelines so the events line up.
 */

/** Time (s) of the loudest sharp audio onset within the first `searchSec` seconds. */
export async function detectAudioSync(file: Blob, searchSec = 20): Promise<number | null> {
  try {
    const buf = await file.arrayBuffer();
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const audio = await ctx.decodeAudioData(buf);
    await ctx.close();
    const data = audio.getChannelData(0);
    const sr = audio.sampleRate;
    const hop = Math.round(sr * 0.005);
    const limit = Math.min(data.length, Math.round(searchSec * sr));
    const env: number[] = [];
    for (let i = 0; i + hop < limit; i += hop) {
      let e = 0;
      for (let j = i; j < i + hop; j++) e += data[j] * data[j];
      env.push(Math.sqrt(e / hop));
    }
    // Onset strength: energy jump over the preceding 50 ms average.
    let best = -1,
      bestVal = 0;
    for (let k = 10; k < env.length; k++) {
      let prev = 0;
      for (let j = k - 10; j < k; j++) prev += env[j];
      prev /= 10;
      const v = env[k] - prev;
      if (v > bestVal) {
        bestVal = v;
        best = k;
      }
    }
    const peak = Math.max(...env);
    if (best < 0 || bestVal < peak * 0.3) return null;
    return (best * hop) / sr;
  } catch {
    return null;
  }
}

/** Time (s) of the largest frame-to-frame brightness jump (screen flash) within the first `searchSec` seconds. */
export async function detectFlashSync(url: string, searchSec = 20, fps = 30): Promise<number | null> {
  const video = document.createElement("video");
  video.muted = true;
  video.src = url;
  video.crossOrigin = "anonymous";
  await new Promise<void>((res, rej) => {
    video.onloadeddata = () => res();
    video.onerror = () => rej(new Error("decode"));
  });
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 18;
  const g = canvas.getContext("2d", { willReadFrequently: true })!;
  const end = Math.min(video.duration, searchSec);
  let prev: number | null = null;
  let best: number | null = null;
  let bestJump = 0;
  for (let t = 0; t < end; t += 1 / fps) {
    await new Promise<void>((r) => {
      video.onseeked = () => r();
      video.currentTime = t;
    });
    g.drawImage(video, 0, 0, 32, 18);
    const px = g.getImageData(0, 0, 32, 18).data;
    let lum = 0;
    for (let i = 0; i < px.length; i += 4) lum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    lum /= px.length / 4;
    if (prev !== null && lum - prev > bestJump) {
      bestJump = lum - prev;
      best = t;
    }
    prev = lum;
  }
  return bestJump > 25 ? best : null;
}
