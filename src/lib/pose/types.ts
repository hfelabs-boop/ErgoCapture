/**
 * Core pose data types. Keypoints follow the 33-point BlazePose topology
 * (MediaPipe Pose Landmarker). Any other 2D/3D pose source (RTMW, Sapiens,
 * Pose2Sim triangulation, SMPL-X joints) can be imported by mapping onto
 * these indices — see `importPoseJson`.
 */

export type Vec3 = [number, number, number];

export interface Keypoint {
  x: number;
  y: number;
  z: number;
  /** Visibility / confidence, 0..1 */
  v: number;
}

export interface PoseFrame {
  /** Time in seconds from start of the recording (after sync offset) */
  t: number;
  /** 33 normalized image coordinates (x,y in 0..1, z relative depth) or null if not detected */
  image: Keypoint[] | null;
  /** 33 metric 3D coordinates (metres, hip-centred, x right, y down, z away from camera) */
  world: Keypoint[] | null;
  /** True when this frame was filled by interpolation across a short gap */
  interpolated?: boolean;
}

export interface PoseTrack {
  viewId: string;
  viewLabel: string;
  personId: number;
  /** Sampling rate of `frames` */
  fps: number;
  /** Source frame size in pixels (for overlay drawing) */
  width: number;
  height: number;
  frames: PoseFrame[];
}

export const KP = {
  nose: 0,
  leftEyeInner: 1,
  leftEye: 2,
  leftEyeOuter: 3,
  rightEyeInner: 4,
  rightEye: 5,
  rightEyeOuter: 6,
  leftEar: 7,
  rightEar: 8,
  mouthLeft: 9,
  mouthRight: 10,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftPinky: 17,
  rightPinky: 18,
  leftIndex: 19,
  rightIndex: 20,
  leftThumb: 21,
  rightThumb: 22,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFootIndex: 31,
  rightFootIndex: 32,
} as const;

export const NUM_KEYPOINTS = 33;

/** Skeleton edges for drawing, tagged with the body segment they belong to. */
export const SKELETON_EDGES: Array<[number, number, SegmentKey]> = [
  [KP.leftShoulder, KP.rightShoulder, "trunk"],
  [KP.leftShoulder, KP.leftHip, "trunk"],
  [KP.rightShoulder, KP.rightHip, "trunk"],
  [KP.leftHip, KP.rightHip, "trunk"],
  [KP.leftShoulder, KP.leftElbow, "upperArmL"],
  [KP.leftElbow, KP.leftWrist, "lowerArmL"],
  [KP.leftWrist, KP.leftIndex, "wristL"],
  [KP.leftWrist, KP.leftPinky, "wristL"],
  [KP.leftIndex, KP.leftPinky, "wristL"],
  [KP.rightShoulder, KP.rightElbow, "upperArmR"],
  [KP.rightElbow, KP.rightWrist, "lowerArmR"],
  [KP.rightWrist, KP.rightIndex, "wristR"],
  [KP.rightWrist, KP.rightPinky, "wristR"],
  [KP.rightIndex, KP.rightPinky, "wristR"],
  [KP.leftHip, KP.leftKnee, "legL"],
  [KP.leftKnee, KP.leftAnkle, "legL"],
  [KP.leftAnkle, KP.leftHeel, "legL"],
  [KP.leftHeel, KP.leftFootIndex, "legL"],
  [KP.rightHip, KP.rightKnee, "legR"],
  [KP.rightKnee, KP.rightAnkle, "legR"],
  [KP.rightAnkle, KP.rightHeel, "legR"],
  [KP.rightHeel, KP.rightFootIndex, "legR"],
  [KP.leftEar, KP.leftEye, "neck"],
  [KP.rightEar, KP.rightEye, "neck"],
  [KP.leftEye, KP.nose, "neck"],
  [KP.rightEye, KP.nose, "neck"],
];

export type SegmentKey =
  | "neck"
  | "trunk"
  | "upperArmL"
  | "upperArmR"
  | "lowerArmL"
  | "lowerArmR"
  | "wristL"
  | "wristR"
  | "legL"
  | "legR";

export const SEGMENT_LABELS: Record<SegmentKey, string> = {
  neck: "Neck",
  trunk: "Trunk",
  upperArmL: "Left upper arm",
  upperArmR: "Right upper arm",
  lowerArmL: "Left lower arm",
  lowerArmR: "Right lower arm",
  wristL: "Left wrist",
  wristR: "Right wrist",
  legL: "Left leg",
  legR: "Right leg",
};
