import type { Keypoint, PoseFrame } from "./types";

/**
 * One-Euro filter (Casiez et al., CHI 2012): an adaptive low-pass filter whose
 * cutoff rises with signal speed — removes jitter when still, keeps lag low
 * when moving.
 */
export class OneEuro {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev: number | null = null;
  constructor(
    private minCutoff = 1.2,
    private beta = 0.02,
    private dCutoff = 1.0,
  ) {}

  private static alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  reset() {
    this.xPrev = null;
    this.tPrev = null;
    this.dxPrev = 0;
  }

  filter(x: number, t: number): number {
    if (this.xPrev === null || this.tPrev === null || t <= this.tPrev) {
      this.xPrev = x;
      this.tPrev = t;
      return x;
    }
    const dt = t - this.tPrev;
    const dx = (x - this.xPrev) / dt;
    const aD = OneEuro.alpha(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = OneEuro.alpha(cutoff, dt);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.xPrev = xHat;
    this.dxPrev = dxHat;
    this.tPrev = t;
    return xHat;
  }
}

/** Streaming smoother for a whole skeleton (used in live mode). */
export class SkeletonSmoother {
  private filters = new Map<string, OneEuro>();
  constructor(
    private minCutoff = 1.2,
    private beta = 0.02,
  ) {}

  private f(key: string) {
    let f = this.filters.get(key);
    if (!f) {
      // Metric world coordinates move ~100x less than pixels -> scale beta.
      f = new OneEuro(this.minCutoff, key.startsWith("w") ? this.beta * 50 : this.beta * 10);
      this.filters.set(key, f);
    }
    return f;
  }

  reset() {
    this.filters.clear();
  }

  smooth(kps: Keypoint[] | null, t: number, prefix: "i" | "w"): Keypoint[] | null {
    if (!kps) return null;
    return kps.map((k, i) => ({
      x: this.f(`${prefix}${i}x`).filter(k.x, t),
      y: this.f(`${prefix}${i}y`).filter(k.y, t),
      z: this.f(`${prefix}${i}z`).filter(k.z, t),
      v: k.v,
    }));
  }
}

function lerpKps(a: Keypoint[], b: Keypoint[], w: number): Keypoint[] {
  return a.map((ka, i) => {
    const kb = b[i];
    return {
      x: ka.x + (kb.x - ka.x) * w,
      y: ka.y + (kb.y - ka.y) * w,
      z: ka.z + (kb.z - ka.z) * w,
      // Interpolated points are less trustworthy than either endpoint.
      v: Math.min(ka.v, kb.v) * 0.6,
    };
  });
}

/**
 * Bridge short occlusions by linear interpolation. Gaps longer than
 * `maxGapSec` stay empty (null) so they are excluded from scoring.
 */
export function fillGaps(frames: PoseFrame[], maxGapSec = 0.6): PoseFrame[] {
  const out = frames.map((f) => ({ ...f }));
  let lastIdx = -1;
  for (let i = 0; i < out.length; i++) {
    if (!out[i].world) continue;
    if (lastIdx >= 0 && i - lastIdx > 1 && out[i].t - out[lastIdx].t <= maxGapSec) {
      const a = out[lastIdx];
      const b = out[i];
      for (let j = lastIdx + 1; j < i; j++) {
        const w = (out[j].t - a.t) / (b.t - a.t);
        out[j] = {
          t: out[j].t,
          world: lerpKps(a.world!, b.world!, w),
          image: a.image && b.image ? lerpKps(a.image, b.image, w) : null,
          interpolated: true,
        };
      }
    }
    lastIdx = i;
  }
  return out;
}

/** Offline zero-phase-ish smoothing: forward One-Euro pass then backward pass, averaged. */
export function smoothTrack(frames: PoseFrame[], minCutoff = 1.5, beta = 0.02): PoseFrame[] {
  const run = (order: number[]) => {
    const sm = new SkeletonSmoother(minCutoff, beta);
    const res: PoseFrame[] = new Array(frames.length);
    let prevT: number | null = null;
    for (const i of order) {
      const f = frames[i];
      if (!f.world) {
        sm.reset();
        prevT = null;
        res[i] = f;
        continue;
      }
      // Backward pass uses mirrored time so the filter sees increasing t.
      const t = order[0] === 0 ? f.t : -f.t;
      if (prevT !== null && t <= prevT) sm.reset();
      prevT = t;
      res[i] = { ...f, world: sm.smooth(f.world, t, "w"), image: sm.smooth(f.image, t, "i") };
    }
    return res;
  };
  const idx = frames.map((_, i) => i);
  const fwd = run(idx);
  const bwd = run([...idx].reverse());
  return frames.map((f, i) => {
    if (!f.world) return f;
    const avg = (a: Keypoint[] | null, b: Keypoint[] | null) =>
      a && b ? a.map((k, j) => ({ x: (k.x + b[j].x) / 2, y: (k.y + b[j].y) / 2, z: (k.z + b[j].z) / 2, v: k.v })) : a;
    return { ...f, world: avg(fwd[i].world, bwd[i].world), image: avg(fwd[i].image, bwd[i].image) };
  });
}
