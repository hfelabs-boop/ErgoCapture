# SAM 3D Body server tier

[SAM 3D Body](https://github.com/facebookresearch/sam-3d-body) (Meta, 2025) recovers a full 3D body mesh, including all finger joints, from a single image. It is far more robust than the in-browser MediaPipe model to occlusion, unusual postures and side views, and gives real knuckle positions for wrist angles. It needs a CUDA GPU, so it runs here and not in the browser or on Vercel.

This folder turns a video into an ErgoCapture pose file (`"format": "mhr70"`): 70 metric keypoints per frame in the camera frame, with one worker tracked across frames. All ergonomic scoring still happens in the web app.

## 1. Get model access

The checkpoints are gated. Request access on Hugging Face for [`facebook/sam-3d-body-dinov3`](https://huggingface.co/facebook/sam-3d-body-dinov3) (or `facebook/sam-3d-body-vith`), then create a read token and export it as `HF_TOKEN`.

Licence: the SAM License grants a royalty-free licence to use, modify and distribute the models, including commercially, subject to its terms (acceptable use and trade-control restrictions). Review the `LICENSE` in the SAM 3D Body repository before company use.

## 2a. Run as a server (recommended)

```bash
docker build -t ergocapture-sam3d .
docker run --gpus all -p 8000:8000 \
  -e HF_TOKEN=hf_xxx \
  -e ERGOCAPTURE_ORIGINS=https://your-app.vercel.app \
  -e ERGOCAPTURE_TOKEN=choose-a-secret \
  ergocapture-sam3d
```

In ErgoCapture → Analyze → Processing, choose **SAM 3D Body (GPU server)**, enter the server URL (it must be HTTPS when the app is served over HTTPS, e.g. behind a reverse proxy or a tunnel) and the token, and run. Videos are uploaded to your server only, processed one at a time, and deleted after processing; results are deleted after they are downloaded.

| Variable | Default | |
|---|---|---|
| `ERGOCAPTURE_ORIGINS` | `*` | Allowed browser origins (set to your app URL) |
| `ERGOCAPTURE_TOKEN` | none | Require `Authorization: Bearer <token>` |
| `SAM3D_MODEL` | `facebook/sam-3d-body-dinov3` | or `facebook/sam-3d-body-vith` (smaller) |
| `SAM3D_DETECTOR` | `vitdet` | or `sam3` |
| `SAM3D_FOV` | none | `moge2` estimates camera field of view (install MoGe) |
| `MAX_UPLOAD_MB` | 1024 | |

## 2b. Run from the command line

With the SAM 3D Body environment installed (see its INSTALL.md) and its repo on `PYTHONPATH`:

```bash
pip install -r requirements.txt
python cli.py side.mp4 front.mp4 --fps 10
# → side.pose.json, front.pose.json
```

Open the `.pose.json` files on the Analyze page with **Add video / session**. Several files are treated as camera views of the same task.

## Tests (no GPU needed)

```bash
pip install numpy pytest fastapi httpx python-multipart
pytest -q test_sam3d.py
```
