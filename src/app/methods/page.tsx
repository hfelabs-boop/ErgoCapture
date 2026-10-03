import type { ReactNode } from "react";

export const metadata = { title: "Methods — ErgoCapture" };

function S({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

const T = ({ head, rows }: { head: string[]; rows: ReactNode[][] }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-slate-500">
          {head.map((h) => (
            <th key={h} className="py-1.5 pr-3 font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-slate-100 align-top">
            {r.map((c, j) => (
              <td key={j} className="py-1.5 pr-3">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default function Methods() {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <h1 className="text-2xl font-semibold">Methods, confidence and limitations</h1>

      <S id="capture" title="1. Capture">
        <T
          head={["Setup", "Use", "Notes"]}
          rows={[
            ["Single phone / webcam", "Screening", "Side view at hip height, whole body in frame, 3–5 m away. Frontal views make forward bending depend on depth estimation (lower confidence)."],
            ["2–4 phones", "Accurate assessment", "Place cameras ~90° apart. Synchronise with a clap or the flash+beep on the Sync page; offsets are detected from audio or brightness."],
            ["Network (IP) camera", "Fixed workstations", "Any stream the browser can play (MP4, HLS, WebM) with CORS enabled; enter the URL on the Live page."],
            ["Depth camera / wearables", "Validation, hard cases", "Import their 3D joint output through the pose file format below."],
          ]}
        />
        <p>
          Enter the worker&apos;s height: it converts the skeleton to real distances used by NIOSH, reach and anthropometry. On the Live page, <b>Calibrate neutral posture</b>{" "}
          records 2.5 s of upright standing to learn the true vertical (correcting a tilted camera), the neutral neck angle and shoulder height.
        </p>
      </S>

      <S id="pipeline" title="2. Processing pipeline">
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            <b>Detection and tracking.</b> Up to 4 people per frame are detected; an IoU tracker keeps a stable identity for each worker.
          </li>
          <li>
            <b>2D + 3D pose</b>, from the engine chosen on the Analyze or Live page (table below). Every engine&apos;s output is mapped onto one 33-point layout in image
            coordinates and metric, hip-centred 3D, so all analysis modules work the same whichever engine produced the data.
          </li>
          <li>
            <b>Multi-camera fusion.</b> Views are time-aligned and every joint angle is fused by confidence-weighted averaging; disagreement between views lowers confidence.
          </li>
          <li>
            <b>Smoothing and gap filling.</b> A forward–backward One-Euro filter removes jitter; occlusions up to 0.6 s are interpolated and flagged.
          </li>
          <li>
            <b>Joint angles.</b> Trunk flexion, side bend and twist; neck flexion, side bend and twist (relative to the trunk); upper-arm flexion, abduction and elevation;
            shoulder raise; elbow and wrist flexion, wrist deviation; knee flexion; hand height, horizontal hand distance, asymmetry angle, reach ratio.
          </li>
          <li>
            <b>Confidence.</b> Every angle carries a reliability (below).
          </li>
        </ol>
      </S>

      <S id="engines" title="2b. Pose engines">
        <T
          head={["Engine", "Runs", "Keypoints", "Download", "Licence", "Best for"]}
          rows={[
            [
              <b key="r">RTMW3D-X (default)</b>,
              "Browser (WebGPU or multi-threaded WebAssembly)",
              "133 whole-body: body, feet, face, all finger joints; per-keypoint scores",
              "≈ 190 MB once, then cached",
              "Apache-2.0",
              "Recorded video on a laptop/desktop; reliable wrist angles",
            ],
            ["MediaPipe Pose", "Browser (GPU)", "33, coarse hands", "6–30 MB", "Apache-2.0", "Live coaching on phones; fastest"],
            [
              "SAM 3D Body Lite (InstantHMR)",
              "Browser",
              "70 (MHR mesh fit), no per-keypoint scores",
              "≈ 80 MB",
              "SAM License (Meta)",
              "Occlusion and unusual postures; community distillation, not independently validated",
            ],
            ["SAM 3D Body", "Your GPU server", "70 (MHR mesh fit)", "server side", "SAM License (Meta)", "Most robust; video is uploaded to your server"],
          ]}
        />
        <p>
          <b>Choosing and downloading.</b> Laptops and desktops start with RTMW; phones, tablets and slow or data-saver connections start with MediaPipe. Before RTMW&apos;s
          one-time ≈ 190 MB download the app asks first (with the option to use MediaPipe instead), shows download progress, and stores the model in the browser so later
          runs start without downloading. A private window or a nearly full disk may prevent storing it; the dialog warns when that is likely.
        </p>
        <p>
          <b>RTMW metric scale.</b> RTMW3D returns x and y in image pixels and z as metric depth. The app finds the metres-per-pixel factor that makes the visible limb
          and trunk segments match a body of the worker&apos;s height (entered in task settings, default 1.70 m), then builds metric 3D coordinates. Entering the worker&apos;s
          height therefore improves RTMW&apos;s angles as well as all distances.
        </p>
        <p>
          <b>Confidence per engine.</b> RTMW scores are rescaled onto a visibility-like 0–1 range; MediaPipe visibilities are used as is; mesh-fitting engines (InstantHMR,
          SAM 3D Body) give 0.85 to keypoints inside the frame and 0.4 outside, because they report no per-keypoint score. Engines with finger joints raise wrist-angle
          reliability from 0.6 to 0.9. Person detection for the browser engines uses EfficientDet-Lite0 (Apache-2.0); the AGPL-licensed YOLO detectors are not used.
        </p>
      </S>

      <S id="modules" title="3. Analysis modules">
        <T
          head={["Module", "Implementation", "Manual inputs"]}
          rows={[
            ["RULA", "Full tables A/B/C per side, worse side reported; muscle-use from detected static holds and repetition.", "Force/load pattern, arm support"],
            ["REBA", "Full tables A/B/C; activity score from static holds (> 1 min), repetition (> 4/min) and rapid large changes.", "Load, coupling, shock"],
            ["OWAS", "4-digit posture code per frame and action category table; frequency distribution per body part.", "Load"],
            ["NIOSH lifting equation", "Lifts/lowers detected from hand trajectories; H, V, D, A measured at origin and destination; FM table with interpolation; RWL and LI.", "Load, coupling, hours/day"],
            ["Strain Index", "Efforts/min from cycle counting, duty cycle from active-hand time, posture from 75th-percentile wrist angles.", "Intensity, speed"],
            ["OCRA checklist", "Screening-level: actions/min from hand-movement peaks (or cycle time × actions per cycle), posture points from time fractions, stereotypy from cycle time.", "Recovery, force, grip, additional"],
            ["ISO 11226 / EN 1005-4", "Static holds (≥ 4 s within ±5°) evaluated against acceptable zones and linearised maximum holding-time curves; EN 1005-4 movement-frequency limits.", "Trunk/arm support"],
            ["Reach & workspace", "Time in primary / secondary / maximum / beyond reach zones, above shoulder and below knuckle height.", "—"],
            ["Anthropometric fit", "Segment lengths from the skeleton, standing heights from population proportions; Grandjean work-surface ranges.", "Surface height, work type, control distance"],
            ["Activity segmentation", "Rule-based labels (lifting, lowering, walking/carrying, overhead, bending, squatting, reaching, seated, static).", "—"],
            ["Repetition counting", "Prominence-based peak detection on joint-angle and hand-height signals.", "—"],
            ["Time in posture", "Share of time each joint spends in each risk band; body heatmap.", "—"],
          ]}
        />
      </S>

      <S id="narrative" title="3b. Narrative report">
        <p>
          <b>Standard narrative.</b> Written by the app directly from the computed results: overview, working postures, highest-risk moments, assessment results,
          recommendations, and confidence. It is instant, works on every device, and contains only numbers from the analysis.
        </p>
        <p>
          <b>AI narrative (optional, laptops/desktops with WebGPU).</b> Two open models from Hugging Face run in a background worker in the browser; nothing is uploaded.
          SmolVLM2-500M (Apache-2.0) describes the worst moments and one typical frame of the video; Qwen3-1.7B (Apache-2.0) rewrites the standard narrative and those
          descriptions as a report. It is told to use only the given facts, and any sentence containing a number that is not in the measured results is removed. The
          models (≈ 1.8 GB) download once after confirmation and are cached. It is turned off on phones and tablets and in browsers without WebGPU; in skeleton-only mode
          the video is not used. Wording can still be imprecise, so the report marks it as AI-written and you choose which narrative goes into Print, PDF and Word.
        </p>
      </S>

      <S id="confidence" title="4. How confidence is computed">
        <p>Every angle gets a reliability between 0 and 1:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>the lowest visibility of the keypoints it uses (occlusion, out-of-frame, gap-filled frames are penalised);</li>
          <li>× a camera-view factor: sagittal angles (forward bending, arm flexion) are best seen from the side, frontal-plane angles (side bend, abduction) from the front, twist is always hard from a single horizontal camera;</li>
          <li>× 0.6 for wrists, which rely on coarse hand points.</li>
        </ul>
        <p>
          Each score is then re-computed 10–24 times with every angle perturbed by its estimated error (2–14° depending on reliability, more for twist). The share of re-scores
          landing on the same risk level is the <b>stability</b>. Score confidence = stability × (0.4 + 0.6 × mean input reliability). A posture far from any threshold stays
          confident even with noisy angles; one sitting on a threshold does not. Levels: high ≥ 75%, medium ≥ 50%, low below.
        </p>
      </S>

      <S id="tiers" title="5. Deployment tiers and privacy">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <b>On-device (this web app).</b> RTMW, MediaPipe and InstantHMR run in the browser (WebGPU when available, otherwise multi-threaded WebAssembly). Nothing is
            uploaded; models are downloaded once and cached by the browser.
          </li>
          <li>
            <b>Workstation / server tier: SAM 3D Body.</b> Meta&apos;s SAM 3D Body recovers a full 3D body mesh (Momentum Human Rig) with all finger joints from each frame. It
            is more robust to occlusion, side views and unusual postures, and real knuckle positions make wrist angles reliable (they get 0.9 instead of 0.6 reliability). It
            needs a CUDA GPU: run the ready-made server in <code>server/sam3d_body</code> (Docker), then pick <b>SAM 3D Body</b> as the pose engine on the Analyze page, or
            convert videos with its command-line tool and open the resulting <code>.pose.json</code> files.
          </li>
          <li>
            <b>Other server-tier models.</b> RTMW, Sapiens, SMPL-X fitting or calibrated multi-view triangulation (Pose2Sim) can feed their 3D joints through the pose file
            format; all analysis modules then apply unchanged.
          </li>
          <li>
            <b>Offline / on-premise.</b> The app is a static site; it can be self-hosted on an internal server. Pose model and runtime files are fetched from Google&apos;s and
            jsDelivr&apos;s CDNs by default and can be mirrored internally.
          </li>
          <li>
            <b>Privacy.</b> Face blurring is on by default in playback and report images. &quot;Skeleton only&quot; hides video everywhere and live recordings then keep no video.
            Sessions can be exported as skeleton-only JSON.
          </li>
        </ul>
      </S>

      <S id="format" title="6. Pose file format (import from other pipelines)">
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{`{
  "format": "blazepose33" | "coco17" | "h36m17" | "mhr70",
  "fps": 30,
  "units": "m" | "mm",           // default "m"
  "yUp": true,                    // true when +y points up (most 3D lifters / mocap)
  "width": 1920, "height": 1080,  // optional, for 2D overlay
  "label": "Pose2Sim triangulation",
  "frames": [
    { "t": 0.0,
      "keypoints3d": [[x, y, z, confidence], ...],   // metric 3D
      "keypoints2d": [[u, v, confidence], ...] }      // optional, pixels or 0..1
  ]
}`}</pre>
        <p>
          <code>mhr70</code> is SAM 3D Body&apos;s 70-keypoint Momentum Human Rig output (camera frame, metres, y down). COCO-17 and Human3.6M-17 skeletons are mapped onto the 33-point layout; missing hand points are placed along the forearm (wrist angles then read neutral with low
          confidence). ErgoCapture session files (&quot;Skeleton-only session&quot; export) can also be re-opened.
        </p>
      </S>

      <S id="validation" title="7. Validation plan">
        <ul className="list-disc space-y-1 pl-5">
          <li>Record the same tasks with ErgoCapture and a reference system (optical motion capture such as Vicon, or an inertial suit such as Xsens).</li>
          <li>Report angle error per joint (RMSE, bias, Bland–Altman) and score agreement with an expert rater (weighted kappa, % exact / ±1 agreement).</li>
          <li>Test each setup separately — 1 phone, 2 phones, 4 phones, depth camera — and publish which setup is adequate for which method.</li>
          <li>Tune the confidence model (error σ per angle and view) on the validation data. The per-frame CSV export includes every angle and confidence for this purpose.</li>
        </ul>
      </S>

      <S id="limits" title="8. Known limitations">
        <ul className="list-disc space-y-1 pl-5">
          <li>Load weight, grip quality and exertion intensity cannot be seen by a camera and must be entered.</li>
          <li>Forearm rotation (RULA wrist twist) is not observable from body keypoints and is assumed mid-range.</li>
          <li>Wrist and hand angles use coarse hand points: treat wrist sub-scores and the Strain Index posture multiplier as indicative.</li>
          <li>Single-camera twist is estimated from monocular depth and is less reliable than bending angles.</li>
          <li>Activity segmentation is rule-based. Learned action recognition belongs to the server tier.</li>
          <li>Holding-time limits in the ISO 11226 module are linear approximations of the standard&apos;s curves; OCRA is implemented as a screening checklist.</li>
          <li>
            Licensing: RTMW3D-X and MediaPipe Pose (both Apache-2.0) run on-device and allow commercial use; InstantHMR inherits the SAM License from SAM 3D Body. SAM 3D Body is under Meta&apos;s SAM License, which permits commercial use
            subject to its terms; its checkpoints are gated on Hugging Face. Some other server-tier models (Sapiens, SMPL-X, several 3D lifters) carry non-commercial
            licences; check before deploying them.
          </li>
          <li>SAM 3D Body gives no per-keypoint confidence: keypoints inside the frame get 0.9 visibility, ones projected outside it 0.4.</li>
        </ul>
      </S>
    </div>
  );
}
