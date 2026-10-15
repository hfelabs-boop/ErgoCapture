# Technical reference

## Architecture

ErgoCapture is a static Next.js app (no server code). All pose estimation and scoring run in the browser; the optional SAM 3D Body engine runs on a separate GPU server.

```
src/lib/pose/          capture and pose
  engines/               engine interface: RTMW3D-X, MediaPipe, InstantHMR; keypoint mapping; model storage
  detector.ts            MediaPipe Pose Landmarker wrapper
  videoProcessor.ts      frame-stepping of recorded video
  photoProcessor.ts      still photos (EXIF orientation, main person)
  remoteProcessor.ts     client for the SAM 3D Body server
  tracker.ts             multi-person IoU tracker
  filters.ts             One-Euro smoothing, gap filling
  importExport.ts        session files and pose import (BlazePose-33, COCO-17, H36M-17, MHR-70)
  synthetic.ts           forward-kinematics skeleton (demo and tests)
src/lib/ergo/          analysis (pure TypeScript, unit-tested)
  measures.ts            joint angles and distances with reliabilities
  rula.ts reba.ts owas.ts niosh.ts repetitive.ts staticPosture.ts reach.ts
  temporal.ts            repetition, static holds, activity segmentation
  exposure.ts            time in posture, body exposure
  confidence.ts          Monte Carlo score confidence
  analyze.ts             session orchestration, multi-view fusion
  photos.ts              photo-set analysis
src/lib/narrative/     standard narrative, AI narrative (Web Worker), print view
src/lib/export/        PDF, Word, CSV, report images, photo reports
src/app/               pages: / · /live · /analyze · /sync · /methods · /docs
server/sam3d_body/     SAM 3D Body GPU server (Python, FastAPI, Docker)
docs/                  this documentation (also rendered in the app at /docs)
```

## Pose file format (import)

```json
{
  "format": "blazepose33 | coco17 | h36m17 | mhr70",
  "fps": 30,
  "units": "m | mm",
  "yUp": false,
  "width": 1920, "height": 1080,
  "label": "Camera 1",
  "source": "Name of the pose engine",
  "frames": [
    { "t": 0.0,
      "keypoints3d": [[x, y, z, confidence], ...],
      "keypoints2d": [[u, v, confidence], ...] }
  ]
}
```

3D coordinates are metric (or millimetres with `"units": "mm"`); set `"yUp": true` when +y points up. Sparser skeletons are mapped onto the 33-point layout; missing hand points are placed along the forearm with low confidence. ErgoCapture session files (Data & export → Skeleton-only session) can also be reopened.

## Models and licences

| Component | Licence | Source |
|---|---|---|
| RTMW3D-X (float16-weight copy) | Apache-2.0 | huggingface.co/Hfelabs/ergocapture-models (original: OpenMMLab MMPose) |
| MediaPipe Pose Landmarker, EfficientDet-Lite0 | Apache-2.0 | Google |
| InstantHMR | SAM License | huggingface.co/momolesang/InstantHMR |
| SAM 3D Body | SAM License (gated checkpoints) | facebookresearch/sam-3d-body |
| SmolVLM2-500M, Qwen3-1.7B / 0.6B (AI narrative) | Apache-2.0 | Hugging Face |
| rtmlib-ts, ONNX Runtime Web, Transformers.js | Apache-2.0 / MIT | npm |

The AGPL-licensed YOLO person detectors bundled with rtmlib-ts are not used.

## Deployment

- Vercel, framework preset Next.js (`vercel.json`). No environment variables.
- The site sends `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` so WebAssembly can use several threads.
- `scripts/patch-rtmlib.mjs` (postinstall) pins the MediaPipe WASM version loaded by rtmlib-ts; `package.json` overrides pin `onnxruntime-web` for rtmlib-ts and replace Node-only packages pulled by Transformers.js with empty stubs (`stubs/`).
- Offline / on-premise: mirror the model files and change the URLs in `src/lib/pose/engines/index.ts`, `src/lib/pose/detector.ts` and `src/lib/narrative/aiCore.ts`.

## Development and tests

```bash
npm install
npm run dev       # http://localhost:3000
npm test          # unit tests
npm run build
cd server/sam3d_body && pytest -q   # server tests (no GPU needed)
```

What the automated tests cover is listed in [Validity → Verification of the implementation](validity.md#4-verification-of-the-implementation).
