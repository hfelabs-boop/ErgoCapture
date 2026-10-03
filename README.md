# ErgoCapture

Camera-based ergonomic posture analysis that runs in the browser. Record a worker with a phone, webcam or network camera (or upload 1–4 synchronised videos). ErgoCapture estimates 2D and 3D whole-body posture on-device (RTMW by default, with MediaPipe and SAM 3D Body as alternatives), then scores it on standard ergonomic methods, with a confidence level for every score.

**Modules:** RULA · REBA · OWAS · Revised NIOSH Lifting Equation · Strain Index · OCRA checklist · ISO 11226 / EN 1005-4 static postures · reach zones · anthropometric fit. **Supporting analysis:** repetition counting, activity segmentation, time-in-posture, static-hold detection, hand-load heuristic.

**Outputs:** live colour-coded skeleton with running scores, timeline with bookmarks at the worst moments, body heatmap, PDF and Word reports, per-frame CSV, skeleton-only session files.

**Privacy:** video never leaves the device. Faces are blurred by default, and a "skeleton only" mode hides and discards video.

## Run locally

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # unit tests: angles, scoring tables, full demo session
npm run build
```

Open `/analyze?demo=1` for a synthetic 60-second pick-and-place demo that needs no camera.

## Deploy to Vercel

This is a standard Next.js app with no server code or environment variables. Import the repository in Vercel (framework preset: Next.js) and deploy. Camera access requires HTTPS, which `*.vercel.app` provides.

The pose model (`pose_landmarker_{lite,full,heavy}.task`) is fetched from Google's CDN and the WASM runtime from jsDelivr at runtime. For offline or on-premise deployment, mirror those files and change `WASM_BASE` / `MODEL_URL` in `src/lib/pose/detector.ts`.

## Pose engines

| Engine | Runs | Notes |
|---|---|---|
| **RTMW3D-X** (default on laptops/desktops) | browser | 133 whole-body keypoints incl. finger joints; ≈ 190 MB, downloaded once after the user confirms, then stored in the browser; Apache-2.0 |
| MediaPipe Pose (default on phones / slow connections) | browser | fastest, best for live use on phones; coarse hands; Apache-2.0 |
| SAM 3D Body Lite (InstantHMR) | browser | ≈ 80 MB distillation of SAM 3D Body; SAM License |
| SAM 3D Body | your GPU server | see below; SAM License |

The RTMW model is served from [Hfelabs/ergocapture-models](https://huggingface.co/Hfelabs/ergocapture-models): the same RTMW3D-X with weights stored as float16 (compute stays float32), 187 MB instead of 369 MB; keypoints used for the angles match the original within 0.6 px. The original export is the automatic fallback.

Browser engines come from [rtmlib-ts](https://github.com/GOH23/rtmlib-ts) on ONNX Runtime Web (WebGPU, else multi-threaded WebAssembly; the site sends COOP/COEP headers for threading). Person detection uses EfficientDet-Lite0 (Apache-2.0) rather than the AGPL YOLO models. `scripts/patch-rtmlib.mjs` pins the MediaPipe WASM version rtmlib-ts loads, and `package.json` pins `onnxruntime-web` to the version whose WASM it fetches.

## SAM 3D Body (GPU server tier)

For the most accurate assessments, `server/sam3d_body/` runs Meta's [SAM 3D Body](https://github.com/facebookresearch/sam-3d-body) on a CUDA GPU (Docker image, HTTP job server and CLI). Choose **SAM 3D Body** as the pose engine on the Analyze page and enter your server URL, or convert videos with the CLI and open the `.pose.json` files. It returns a full-body mesh fit with finger joints (`mhr70` keypoints), which improves robustness to occlusion and makes wrist angles reliable. See [server/sam3d_body/README.md](server/sam3d_body/README.md). Vercel only hosts the web app; the GPU server runs on your own hardware or cloud GPU.

## Architecture

```
src/lib/pose/       capture and pose layer
  engines/            pose engines behind one interface: RTMW3D-X (default), MediaPipe, InstantHMR
  detector.ts         MediaPipe Pose Landmarker wrapper (GPU, CPU fallback)
  videoProcessor.ts   offline frame-stepping of recorded video
  tracker.ts          multi-person IoU tracker (stable worker IDs)
  filters.ts          One-Euro smoothing, gap filling
  importExport.ts     session files; import from BlazePose-33 / COCO-17 / H36M-17 / SAM 3D Body (MHR-70)
  remoteProcessor.ts  client for the SAM 3D Body GPU server
  synthetic.ts        forward-kinematics skeleton for the demo and tests
src/lib/ergo/       analysis layer (pure TypeScript, unit-tested)
  measures.ts         joint angles and distances with per-angle reliability
  confidence.ts       Monte Carlo score stability → confidence
  rula.ts reba.ts owas.ts niosh.ts repetitive.ts staticPosture.ts reach.ts
  temporal.ts         repetition counting, static holds, activity segmentation
  exposure.ts         time-in-posture bands, body-segment exposure
  analyze.ts          session orchestration and multi-view fusion
src/lib/export/     PDF (jsPDF), Word (docx), CSV, report images
src/app/            pages: / · /live · /analyze · /sync · /methods
server/sam3d_body/  SAM 3D Body GPU server (Python, Docker)
```

The `/methods` page documents each algorithm, the confidence model, the pose import format for server-tier models (RTMW, Sapiens, MotionBERT, Pose2Sim, SMPL-X), the validation plan and known limitations.

## Scope of this version

Implemented: single and multi-camera (2–4 views, clap/flash sync, confidence-weighted angle fusion), live mode with neutral-posture calibration and coaching beeps, all analysis modules listed above, reports and exports, privacy controls.

Not in the browser build (by design): other GPU server models (Sapiens, SMPL-X fitting, WHAM/GVHMR lifting), calibrated ChArUco multi-view triangulation, learned action recognition, and hand-object detection by a vision model. Their outputs can be imported through the pose file format and then use all the same analysis modules. MediaPipe Pose is Apache-2.0; check licences of any non-commercial server-tier models before company use.

ErgoCapture is a screening tool. Results should be reviewed by a qualified ergonomist.
