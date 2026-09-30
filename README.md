# ErgoCapture

Camera-based ergonomic posture analysis that runs in the browser. Record a worker with a phone, webcam or network camera (or upload 1–4 synchronised videos). ErgoCapture estimates 2D and 3D body posture on-device, then scores it on standard ergonomic methods, with a confidence level for every score.

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

## Architecture

```
src/lib/pose/       capture and pose layer
  detector.ts         MediaPipe Pose Landmarker wrapper (GPU, CPU fallback)
  videoProcessor.ts   offline frame-stepping of recorded video
  tracker.ts          multi-person IoU tracker (stable worker IDs)
  filters.ts          One-Euro smoothing, gap filling
  importExport.ts     session files; import from BlazePose-33 / COCO-17 / H36M-17 3D output
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
```

The `/methods` page documents each algorithm, the confidence model, the pose import format for server-tier models (RTMW, Sapiens, MotionBERT, Pose2Sim, SMPL-X), the validation plan and known limitations.

## Scope of this version

Implemented: single and multi-camera (2–4 views, clap/flash sync, confidence-weighted angle fusion), live mode with neutral-posture calibration and coaching beeps, all analysis modules listed above, reports and exports, privacy controls.

Not in the browser build (by design): GPU server models (Sapiens, SMPL-X fitting, WHAM/GVHMR lifting), calibrated ChArUco multi-view triangulation, learned action recognition, and hand-object detection by a vision model. Their outputs can be imported through the pose file format and then use all the same analysis modules. MediaPipe Pose is Apache-2.0; check licences of any non-commercial server-tier models before company use.

ErgoCapture is a screening tool. Results should be reviewed by a qualified ergonomist.
