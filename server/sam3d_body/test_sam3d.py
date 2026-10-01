"""Tests that run without a GPU: conversion, tracking and the job API."""

import time

import numpy as np
from fastapi.testclient import TestClient

from app import create_app
from ergocapture_sam3d import NUM_KEYPOINTS, OFF_IMAGE_CONF, iou, person_keypoints, to_ergocapture, track_people


def fake_person(x0: float, shift: float = 0.0) -> dict:
    k3 = np.zeros((NUM_KEYPOINTS, 3))
    k3[:, 0] = np.linspace(-0.2, 0.2, NUM_KEYPOINTS) + shift
    k2 = np.tile([[x0 + 50, 200.0]], (NUM_KEYPOINTS, 1))
    k2[0] = [-10, 200]  # nose off-image
    return {"bbox": [x0, 100, x0 + 100, 400], "pred_keypoints_3d": k3, "pred_cam_t": np.array([0, 0, 3.0]), "pred_keypoints_2d": k2}


def test_iou():
    assert iou([0, 0, 10, 10], [0, 0, 10, 10]) == 1
    assert iou([0, 0, 10, 10], [20, 20, 30, 30]) == 0


def test_keypoints_are_metric_camera_frame_with_confidence():
    kp3, kp2 = person_keypoints(fake_person(100), 640, 480)
    assert len(kp3) == NUM_KEYPOINTS and len(kp3[0]) == 4
    assert kp3[5][2] == 3.0  # cam_t applied
    assert kp3[0][3] == OFF_IMAGE_CONF and kp2[0][2] == OFF_IMAGE_CONF
    assert kp3[5][3] > OFF_IMAGE_CONF


def test_tracking_keeps_main_worker_and_fills_gaps():
    frames = []
    for i in range(10):
        people = [fake_person(100 + i * 2)]
        if i % 3 == 0:
            people.append(fake_person(500))  # a passer-by in some frames
        if i == 4:
            people = []  # occlusion
        frames.append((i, i / 10, people))
    tracker = track_people(frames)
    main = tracker.longest()
    assert len(main.frames) == 9
    out = to_ergocapture(main, 10, 10, 640, 480, "cam1", "SAM 3D Body (test)")
    assert out["format"] == "mhr70" and out["yUp"] is False
    assert out["frames"][4]["keypoints3d"] is None
    assert out["frames"][5]["t"] == 0.5


def test_job_api_round_trip():
    def processor(path, fps, label, cb):
        cb(0.5)
        return {"format": "mhr70", "fps": fps, "label": label, "frames": []}

    client = TestClient(create_app(processor, "test"))
    assert client.get("/health").json()["ok"]
    job = client.post("/jobs", files={"file": ("a.mp4", b"\0" * 10, "video/mp4")}, data={"fps": "5", "label": "side"}).json()
    for _ in range(50):
        st = client.get(f"/jobs/{job['id']}").json()
        if st["status"] == "done":
            break
        time.sleep(0.02)
    assert st["status"] == "done"
    res = client.get(f"/jobs/{job['id']}/result").json()
    assert res["fps"] == 5 and res["label"] == "side"
    assert client.get(f"/jobs/{job['id']}/result").status_code == 404  # deleted after download


def test_rejects_bad_fps():
    client = TestClient(create_app(lambda *a: {}, "test"))
    r = client.post("/jobs", files={"file": ("a.mp4", b"\0", "video/mp4")}, data={"fps": "99"})
    assert r.status_code == 400


def test_token_required(monkeypatch):
    import app as app_module

    monkeypatch.setattr(app_module, "TOKEN", "s3cret")
    client = TestClient(create_app(lambda *a: {}, "test"))
    assert client.get("/health").status_code == 200
    assert client.get("/auth").status_code == 401
    assert client.get("/auth", headers={"Authorization": "Bearer s3cret"}).status_code == 200
    assert client.post("/jobs", files={"file": ("a.mp4", b"\0", "video/mp4")}).status_code == 401
