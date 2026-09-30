import type { Keypoint } from "./types";

/**
 * Lightweight multi-person tracker (greedy nearest-neighbour association on
 * 2D bounding boxes, in the spirit of ByteTrack's IoU matching). Gives each
 * worker a stable id across frames so the analysis follows one person.
 */

export interface Detection {
  image: Keypoint[];
  world: Keypoint[];
}

interface Track {
  id: number;
  box: [number, number, number, number];
  lastSeen: number;
  hits: number;
}

function bbox(kps: Keypoint[]): [number, number, number, number] {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const k of kps) {
    if (k.v < 0.3) continue;
    x0 = Math.min(x0, k.x);
    y0 = Math.min(y0, k.y);
    x1 = Math.max(x1, k.x);
    y1 = Math.max(y1, k.y);
  }
  if (!isFinite(x0)) return [0, 0, 0, 0];
  return [x0, y0, x1, y1];
}

function iou(a: number[], b: number[]) {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  const ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
  return ua > 0 ? inter / ua : 0;
}

export class PoseTracker {
  private tracks: Track[] = [];
  private nextId = 1;
  constructor(
    private maxAgeSec = 1.5,
    private minIou = 0.2,
  ) {}

  /** Returns a track id for every detection, in the same order. */
  update(dets: Detection[], t: number): number[] {
    this.tracks = this.tracks.filter((tr) => t - tr.lastSeen <= this.maxAgeSec);
    const boxes = dets.map((d) => bbox(d.image));
    const pairs: Array<[number, number, number]> = [];
    boxes.forEach((b, di) => this.tracks.forEach((tr, ti) => pairs.push([iou(b, tr.box), di, ti])));
    pairs.sort((a, b) => b[0] - a[0]);
    const ids = new Array<number>(dets.length).fill(-1);
    const usedT = new Set<number>();
    for (const [score, di, ti] of pairs) {
      if (score < this.minIou) break;
      if (ids[di] !== -1 || usedT.has(ti)) continue;
      ids[di] = this.tracks[ti].id;
      usedT.add(ti);
      Object.assign(this.tracks[ti], { box: boxes[di], lastSeen: t, hits: this.tracks[ti].hits + 1 });
    }
    ids.forEach((id, di) => {
      if (id !== -1) return;
      const tr: Track = { id: this.nextId++, box: boxes[di], lastSeen: t, hits: 1 };
      this.tracks.push(tr);
      ids[di] = tr.id;
    });
    return ids;
  }
}
