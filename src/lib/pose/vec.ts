import type { Keypoint, Vec3 } from "./types";

export const v3 = (k: Keypoint): Vec3 => [k.x, k.y, k.z];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: Vec3): Vec3 => {
  const n = norm(a);
  return n > 1e-9 ? scale(a, 1 / n) : [0, 0, 0];
};
export const mid = (a: Vec3, b: Vec3): Vec3 => scale(add(a, b), 0.5);
/** Remove the component of `a` along unit vector `u`. */
export const reject = (a: Vec3, u: Vec3): Vec3 => sub(a, scale(u, dot(a, u)));

export const RAD = 180 / Math.PI;
export const deg = (rad: number) => rad * RAD;

/** Unsigned angle between two vectors, degrees. */
export function angleBetween(a: Vec3, b: Vec3): number {
  const na = norm(a);
  const nb = norm(b);
  if (na < 1e-9 || nb < 1e-9) return NaN;
  const c = Math.max(-1, Math.min(1, dot(a, b) / (na * nb)));
  return deg(Math.acos(c));
}

/** Angle of `a` measured from reference axis `ref` towards axis `pos`, in the plane spanned by them. */
export function planeAngle(a: Vec3, ref: Vec3, pos: Vec3): number {
  return deg(Math.atan2(dot(a, pos), dot(a, ref)));
}

/** Signed angle from `a` to `b` around `axis` (all projected on the plane normal to axis). */
export function signedAngleAround(a: Vec3, b: Vec3, axis: Vec3): number {
  const pa = reject(a, axis);
  const pb = reject(b, axis);
  if (norm(pa) < 1e-9 || norm(pb) < 1e-9) return NaN;
  return deg(Math.atan2(dot(cross(pa, pb), axis), dot(pa, pb)));
}

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
