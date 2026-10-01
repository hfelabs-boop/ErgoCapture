"""HTTP job server so the ErgoCapture web app can use SAM 3D Body on your GPU.

    uvicorn app:app --host 0.0.0.0 --port 8000

Environment:
    ERGOCAPTURE_ORIGINS  comma-separated allowed browser origins
                         (e.g. https://your-app.vercel.app); default "*"
    ERGOCAPTURE_TOKEN    if set, requests must send "Authorization: Bearer <token>"
    SAM3D_MODEL          Hugging Face repo id (default facebook/sam-3d-body-dinov3)
    SAM3D_DETECTOR       vitdet | sam3 (default vitdet)
    SAM3D_FOV            optional FOV estimator, e.g. moge2
    MAX_UPLOAD_MB        default 1024

API:
    GET  /health              → {"ok": true, "model": ..., "device": ...}  (no auth)
    GET  /auth                → {"ok": true} if the token is accepted
    POST /jobs  (multipart: file, fps, label) → {"id": ...}
    GET  /jobs/{id}           → {"status": queued|running|done|error, "progress": 0..1, "error"?}
    GET  /jobs/{id}/result    → ErgoCapture pose file (format "mhr70"); deleted after download
"""

from __future__ import annotations

import os
import queue
import secrets
import tempfile
import threading
import time
from typing import Any, Callable

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

MODEL = os.environ.get("SAM3D_MODEL", "facebook/sam-3d-body-dinov3")
DETECTOR = os.environ.get("SAM3D_DETECTOR", "vitdet")
FOV = os.environ.get("SAM3D_FOV", "")
TOKEN = os.environ.get("ERGOCAPTURE_TOKEN", "")
MAX_UPLOAD = int(os.environ.get("MAX_UPLOAD_MB", "1024")) * 1024 * 1024
JOB_TTL_S = 3600

Processor = Callable[[str, float, str, Callable[[float], None]], dict[str, Any]]


def create_app(processor: Processor | None = None, device_name: str = "") -> FastAPI:
    """`processor` is injectable so the API can be tested without a GPU."""
    app = FastAPI(title="ErgoCapture SAM 3D Body server")
    origins = [o.strip() for o in os.environ.get("ERGOCAPTURE_ORIGINS", "*").split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
    )
    jobs: dict[str, dict[str, Any]] = {}
    work: queue.Queue[str] = queue.Queue()
    state: dict[str, Any] = {"processor": processor, "device": device_name}

    def get_processor() -> Processor:
        if state["processor"] is None:
            import torch  # noqa: PLC0415

            from ergocapture_sam3d import load_estimator, process_video  # noqa: PLC0415

            est = load_estimator(MODEL, DETECTOR, FOV)
            state["device"] = "cuda" if torch.cuda.is_available() else "cpu"
            source = f"SAM 3D Body ({MODEL.rsplit('-', 1)[-1]})"
            state["processor"] = lambda path, fps, label, cb: process_video(
                path, est, fps=fps, label=label, source=source, on_progress=cb
            )
        return state["processor"]

    def worker() -> None:
        # One job at a time: the GPU is the bottleneck.
        while True:
            job_id = work.get()
            job = jobs.get(job_id)
            if not job:
                continue
            job["status"] = "running"
            try:
                job["result"] = get_processor()(job["path"], job["fps"], job["label"], lambda p: job.update(progress=p))
                job["status"], job["progress"] = "done", 1.0
            except Exception as e:  # noqa: BLE001 — report any failure to the client
                job["status"], job["error"] = "error", str(e)
            finally:
                try:
                    os.unlink(job["path"])  # never keep uploaded video
                except OSError:
                    pass
            now = time.time()
            for k in [k for k, j in jobs.items() if now - j["created"] > JOB_TTL_S]:
                jobs.pop(k, None)

    threading.Thread(target=worker, daemon=True).start()

    def auth(authorization: str = Header(default="")) -> None:
        if TOKEN and not secrets.compare_digest(authorization, f"Bearer {TOKEN}"):
            raise HTTPException(401, "Invalid or missing token")

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {"ok": True, "engine": "SAM 3D Body", "model": MODEL, "device": state["device"] or "loads on first job", "auth": bool(TOKEN)}

    @app.get("/auth", dependencies=[Depends(auth)])
    def auth_check() -> dict[str, bool]:
        return {"ok": True}

    @app.post("/jobs", dependencies=[Depends(auth)])
    async def create_job(file: UploadFile = File(...), fps: float = Form(10.0), label: str = Form("")) -> dict[str, str]:
        if not 1 <= fps <= 30:
            raise HTTPException(400, "fps must be between 1 and 30")
        suffix = os.path.splitext(file.filename or "")[1] or ".mp4"
        fd, path = tempfile.mkstemp(suffix=suffix)
        size = 0
        with os.fdopen(fd, "wb") as out:
            while chunk := await file.read(1 << 20):
                size += len(chunk)
                if size > MAX_UPLOAD:
                    out.close()
                    os.unlink(path)
                    raise HTTPException(413, "Video too large")
                out.write(chunk)
        job_id = secrets.token_urlsafe(12)
        jobs[job_id] = {"status": "queued", "progress": 0.0, "path": path, "fps": fps, "label": label or file.filename or "video", "created": time.time()}
        work.put(job_id)
        return {"id": job_id}

    @app.get("/jobs/{job_id}", dependencies=[Depends(auth)])
    def job_status(job_id: str) -> dict[str, Any]:
        job = jobs.get(job_id)
        if not job:
            raise HTTPException(404, "Unknown job")
        return {k: job[k] for k in ("status", "progress", "error") if k in job} | {"queued_ahead": work.qsize() if job["status"] == "queued" else 0}

    @app.get("/jobs/{job_id}/result", dependencies=[Depends(auth)])
    def job_result(job_id: str) -> dict[str, Any]:
        job = jobs.get(job_id)
        if not job or job["status"] != "done":
            raise HTTPException(404, "Result not ready")
        jobs.pop(job_id, None)
        return job["result"]

    return app


app = create_app()
