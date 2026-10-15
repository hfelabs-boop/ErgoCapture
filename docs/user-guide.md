# User guide

ErgoCapture estimates a worker's posture from video or photos and scores it with standard ergonomic methods. It runs in the web browser; with the default settings, nothing you record leaves your device.

> ErgoCapture is a **screening tool**. Treat its results as a structured first look that a qualified ergonomist reviews before decisions are made. See [Validity of the analytical methods](validity.md) for what the results can and cannot support.

## 1. Choosing how to capture

| Situation | Use | Notes |
|---|---|---|
| Quick look at one task | One phone or webcam, **Live** or a recorded video | Side view at hip height works best for bending and lifting |
| More accurate assessment | **2–4 cameras** recorded at the same time, about 90° apart | Synchronise with a clap or the **Sync** page flash |
| Postures that are hard to film | **Photos** of the key postures | Snapshot scores only (RULA, REBA, OWAS) |
| Data from another system | **Pose file** (`.json`) | BlazePose-33, COCO-17, Human3.6M-17 or SAM 3D Body (MHR-70) |

### Filming checklist

- The whole body, including feet and hands, stays in frame for the whole task.
- Camera still (tripod or propped up), level, about 3–5 m away, at roughly hip height.
- One camera: film from the side for bending and lifting tasks, from the front for side bending and reaching across the body. Twisting is hard to see from any single camera.
- Good, even lighting; avoid strong backlight. Loose or bulky clothing hides joints.
- Record at least one full work cycle; for repetitive work, several minutes.
- If others walk through the scene, check after analysis that the right person was assessed (Analyze → camera view → "Worker to assess").

## 2. Workflows

### Live coaching (`/live`)

1. Choose the camera (or a network stream URL) and the pose engine. Phones start with MediaPipe; laptops with RTMW.
2. **Start camera.** A colour-coded skeleton shows the risk of each body part; RULA and REBA update continuously with their confidence.
3. Optional: **Calibrate neutral posture** — the worker stands upright, arms relaxed, for 2.5 s. This corrects a tilted camera and improves neck and shoulder measurements.
4. **Start recording**, then **Stop and analyse** for the full report. A beep can warn when a high-risk posture lasts over 3 s.

### Recorded videos (`/analyze`)

1. **Add video / photos / session** or drop files (MP4, MOV, WebM). Up to 4 videos of the same task from different angles.
2. With several videos: start all cameras, clap once or flash the **Sync** page in view of all cameras, then use **Detect clap / beep** or **Detect flash**. Offsets can also be set manually.
3. Choose the **pose engine** and sampling rate (10 frames per second is a good default).
4. Fill in **Task inputs** — anything a camera cannot see: the worker's height, load weight, hand coupling, hours per day, and the manual ratings for the Strain Index and OCRA.
5. **Run analysis.**

### Photos (`/analyze`)

1. Add photos (JPG, PNG, WebP; up to 50). Phone photos are turned upright automatically. HEIC must be exported as JPEG.
2. Tick **held for more than 1 minute** or **repeated more than 4 times per minute** if that applies to the postures shown.
3. **Analyze N photos.** Each photo is scored on its own, highest risk first.

### Demo

Open `/analyze?demo=1` for a 60-second synthetic pick-and-place job that needs no camera.

## 3. Pose engines

| Engine | Best for | First download |
|---|---|---|
| **RTMW** (default on laptops/desktops) | Recorded video and photos; detailed hands, so wrist angles are reliable | ≈ 190 MB, once, after you confirm |
| **MediaPipe** (default on phones) | Live coaching on phones; fastest | 6–30 MB |
| **SAM 3D Body Lite (InstantHMR)** | Occlusion and unusual postures; not independently validated | ≈ 80 MB |
| **SAM 3D Body** (server) | Most robust; needs your own GPU server (`server/sam3d_body`); video is uploaded to that server | — |

On single photos MediaPipe is noticeably less reliable than RTMW.

## 4. Task inputs that matter most

| Input | Why |
|---|---|
| Worker height | Converts the skeleton to real distances (NIOSH H and V, reach, anthropometry) and fixes RTMW's depth scale |
| Load (kg) and when it applies | RULA/REBA force scores, OWAS load class, NIOSH Lifting Index. Cameras cannot weigh objects |
| Coupling | REBA coupling score, NIOSH coupling multiplier |
| Hours per day | NIOSH frequency multiplier, Strain Index, OCRA duration multiplier |
| Arms / trunk supported, seated | Adjust RULA, REBA and the static-posture limits |
| Strain Index and OCRA ratings | Exertion intensity, speed, recovery, force, grip, additional factors are judged by the assessor |

Change inputs later with **Task settings → Re-score**; pose estimation does not have to run again.

## 5. Reading the results

- **Overall risk** — the highest of the "typical high" (90th percentile) RULA and REBA levels and the session methods.
- **Confidence** next to every score — high / medium / low, from keypoint visibility, camera angle, and whether the score would change under plausible measurement error. A low-confidence score is not wrong, but it should be checked on the video.
- **Timeline** — RULA and REBA over time, OWAS, activities, static/repetitive periods and confidence. ▼ marks the worst moments; click to jump.
- **Frame panel** — the scores, reasons and joint angles of the current frame, each angle with a confidence bar.
- **Tabs:** Summary, Narrative, RULA, REBA, OWAS, NIOSH lifting, OCRA / Strain Index, ISO 11226 / EN 1005-4, Reach & fit, Body heatmap, Data & export.
- **Photos:** a summary table, then one card per photo with overlay, scores, reasons and angles.

Scores use these action levels:

| Method | Levels |
|---|---|
| RULA | 1–2 acceptable · 3–4 investigate further · 5–6 investigate and change soon · 7 change immediately |
| REBA | 1 negligible · 2–3 low · 4–7 medium · 8–10 high · 11–15 very high |
| OWAS | AC1 no action · AC2 near future · AC3 as soon as possible · AC4 immediately |
| NIOSH LI | ≤ 1 acceptable for most workers · 1–3 increased risk · > 3 high risk |
| Strain Index | ≤ 3 probably safe · 3–7 uncertain · ≥ 7 probably hazardous |
| OCRA checklist | ≤ 7.5 acceptable · ≤ 11 borderline · ≤ 14 low · ≤ 22.5 medium · > 22.5 high |

## 6. Reports and data

- **PDF / Word** — summary with confidence, narrative, charts, worst moments, body heatmap and method details. Photo assessments get one page per photo.
- **Print** — a print-ready page of the narrative (video) or all photos.
- **CSV** — every angle with its confidence and every score, per frame or per photo, for your own statistics.
- **Skeleton-only session (`.json`)** — the poses, settings and calibration without video, to archive or reopen later.
- **Narrative** — a standard narrative written from the results (all devices) and an optional AI narrative (beta, laptops/desktops with WebGPU). Reports use the standard narrative unless you choose the AI one.

## 7. Privacy

- Pose estimation runs in the browser; videos and photos are not uploaded (except to your own server when you choose the SAM 3D Body server engine).
- Faces are blurred by default in playback, photos and report images. **Skeleton only** hides video everywhere; live recordings then keep no video.
- Model files are downloaded from Hugging Face, Google and jsDelivr and cached by the browser. Settings are kept in the browser's local storage.

## 8. Troubleshooting

| Problem | What to do |
|---|---|
| "No person detected" or many gaps | Whole body in frame, better light, camera further back; check the coverage figure under Data quality |
| Wrong person analysed | Analyze → camera view → choose "Worker to assess"; for photos, crop to the worker |
| Odd forward-bending angles from a front view | Film from the side, add a second camera, or calibrate the neutral posture |
| Distances look too large or small | Enter the worker's height |
| RTMW download asks every time | Private windows or a nearly full disk prevent storing the model |
| AI narrative not offered | It needs a laptop/desktop browser with WebGPU (current Chrome or Edge) |
| Video will not load | Use MP4 (H.264) or WebM |
