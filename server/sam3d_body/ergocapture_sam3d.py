"""Run Meta's SAM 3D Body on a video and write an ErgoCapture pose file.

SAM 3D Body recovers a full-body Momentum Human Rig (MHR) mesh per person
per image. We keep its first 70 keypoints ("mhr70": body, feet, all finger
joints) in metric camera coordinates (x right, y down, z forward), track one
worker across frames, and emit the JSON format ErgoCapture imports
(`"format": "mhr70"`). All ergonomic scoring then happens in the app.

Heavy dependencies (torch, cv2, sam_3d_body) are imported lazily so the
conversion and tracking code can be tested without a GPU.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, Sequence

import numpy as np

NUM_KEYPOINTS = 70
BODY_CONF = 0.9  # SAM 3D Body gives no per-keypoint score; it always fits a complete body
OFF_IMAGE_CONF = 0.4  # keypoints projected outside the frame are guesses

ProgressFn = Callable[[float], None]


# ---------------------------------------------------------------- model setup


def load_estimator(
    hf_repo_id: str = "facebook/sam-3d-body-dinov3",
    detector_name: str = "vitdet",
    fov_name: str = "",
    device: str | None = None,
):
    """Build the SAM 3D Body estimator. Requires the sam-3d-body repo on PYTHONPATH."""
    import torch  # noqa: PLC0415
    from notebook.utils import setup_sam_3d_body  # noqa: PLC0415  (from facebookresearch/sam-3d-body)

    device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    return setup_sam_3d_body(
        hf_repo_id=hf_repo_id,
        detector_name=detector_name,
        segmentor_name="",  # masks are not needed for keypoints
        fov_name=fov_name,
        device=device,
    )


# ------------------------------------------------------------------ tracking


def iou(a: Sequence[float], b: Sequence[float]) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


@dataclass
class Track:
    id: int
    box: list[float]
    last_t: float
    frames: dict[int, dict[str, Any]] = field(default_factory=dict)


class IouTracker:
    """Greedy IoU association so one worker keeps one identity across frames."""

    def __init__(self, min_iou: float = 0.2, max_age_s: float = 1.5):
        self.min_iou = min_iou
        self.max_age_s = max_age_s
        self.tracks: list[Track] = []
        self._next = 1

    def update(self, frame_idx: int, t: float, people: list[dict[str, Any]]) -> None:
        alive = [tr for tr in self.tracks if t - tr.last_t <= self.max_age_s]
        pairs = sorted(
            ((iou(p["bbox"], tr.box), pi, ti) for pi, p in enumerate(people) for ti, tr in enumerate(alive)),
            reverse=True,
        )
        used_p: set[int] = set()
        used_t: set[int] = set()
        for score, pi, ti in pairs:
            if score < self.min_iou:
                break
            if pi in used_p or ti in used_t:
                continue
            used_p.add(pi)
            used_t.add(ti)
            tr = alive[ti]
            tr.box, tr.last_t = list(people[pi]["bbox"]), t
            tr.frames[frame_idx] = people[pi]
        for pi, p in enumerate(people):
            if pi in used_p:
                continue
            tr = Track(self._next, list(p["bbox"]), t)
            tr.frames[frame_idx] = p
            self._next += 1
            self.tracks.append(tr)

    def longest(self) -> Track | None:
        return max(self.tracks, key=lambda tr: len(tr.frames), default=None)


# ---------------------------------------------------------------- conversion


def person_keypoints(person: dict[str, Any], width: int, height: int) -> tuple[list[list[float]], list[list[float]]]:
    """SAM 3D Body output for one person → (keypoints3d [x,y,z,conf], keypoints2d [u,v,conf])."""
    k3 = np.asarray(person["pred_keypoints_3d"], dtype=float)[:NUM_KEYPOINTS]
    cam_t = np.asarray(person.get("pred_cam_t", np.zeros(3)), dtype=float).reshape(1, 3)
    k3 = k3 + cam_t  # metric camera frame
    k2 = np.asarray(person["pred_keypoints_2d"], dtype=float)[:NUM_KEYPOINTS]
    inside = (k2[:, 0] >= 0) & (k2[:, 0] < width) & (k2[:, 1] >= 0) & (k2[:, 1] < height)
    conf = np.where(inside, BODY_CONF, OFF_IMAGE_CONF)
    kp3 = [[round(float(x), 5), round(float(y), 5), round(float(z), 5), float(c)] for (x, y, z), c in zip(k3, conf)]
    kp2 = [[round(float(u), 2), round(float(v), 2), float(c)] for (u, v), c in zip(k2, conf)]
    return kp3, kp2


def to_ergocapture(
    track: Track | None,
    n_frames: int,
    fps: float,
    width: int,
    height: int,
    label: str,
    source: str,
) -> dict[str, Any]:
    frames = []
    for i in range(n_frames):
        person = track.frames.get(i) if track else None
        if person is None:
            frames.append({"t": round(i / fps, 4), "keypoints3d": None, "keypoints2d": None})
            continue
        kp3, kp2 = person_keypoints(person, width, height)
        frames.append({"t": round(i / fps, 4), "keypoints3d": kp3, "keypoints2d": kp2})
    return {
        "format": "mhr70",
        "fps": fps,
        "units": "m",
        "yUp": False,
        "width": width,
        "height": height,
        "label": label,
        "source": source,
        "frames": frames,
    }


def track_people(
    per_frame: Iterable[tuple[int, float, list[dict[str, Any]]]],
) -> IouTracker:
    tracker = IouTracker()
    for idx, t, people in per_frame:
        tracker.update(idx, t, [p for p in people if "bbox" in p])
    return tracker


# ------------------------------------------------------------------- driving


def sample_times(duration_s: float, fps: float) -> list[float]:
    n = max(1, int(math.floor(duration_s * fps)))
    return [i / fps for i in range(n)]


def process_video(
    path: str,
    estimator,
    fps: float = 10.0,
    label: str | None = None,
    source: str = "SAM 3D Body",
    on_progress: ProgressFn | None = None,
) -> dict[str, Any]:
    """Sample `path` at `fps`, run SAM 3D Body on each frame, track the main worker."""
    import cv2  # noqa: PLC0415

    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {path}")
    native_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    times = sample_times(total / native_fps if total else 0, fps)

    def frames():
        for i, t in enumerate(times):
            cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
            ok, bgr = cap.read()
            if not ok:
                break
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            people = estimator.process_one_image(rgb) or []
            if on_progress:
                on_progress((i + 1) / len(times))
            yield i, t, people

    try:
        tracker = track_people(frames())
    finally:
        cap.release()
    return to_ergocapture(tracker.longest(), len(times), fps, width, height, label or path.rsplit("/", 1)[-1], source)
