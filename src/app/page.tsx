import Link from "next/link";

const MODES = [
  {
    href: "/live",
    title: "Live coaching",
    text: "Point a phone or webcam at the worker. Colour-coded skeleton and running RULA/REBA in real time; record to get the full report.",
    tag: "Single camera · real time",
  },
  {
    href: "/analyze",
    title: "Analyze recordings",
    text: "Upload 1–4 videos of the same task from different angles. Synchronise by clap or flash, fuse the views, and score every frame.",
    tag: "1–4 cameras · most accurate",
  },
  {
    href: "/analyze?demo=1",
    title: "Try the demo",
    text: "A 60-second synthetic pick-and-place job: floor-to-shelf lifts, overhead work and repetitive reaching.",
    tag: "No camera needed",
  },
  {
    href: "/sync",
    title: "Multi-phone sync",
    text: "Flash + beep screen that every phone records, so recordings can be aligned automatically.",
    tag: "Setup tool",
  },
];

const METHODS = [
  ["RULA", "Upper body, seated or desk work"],
  ["REBA", "Whole body, unpredictable tasks"],
  ["OWAS", "Posture frequency over a shift"],
  ["NIOSH lifting equation", "Recommended weight limit and lifting index for each detected lift"],
  ["OCRA checklist & Strain Index", "Repetitive hand and arm work"],
  ["ISO 11226 / EN 1005-4", "Static posture holding times and movement frequency"],
  ["Reach zones", "Primary / secondary / maximum reach, overhead and low work"],
  ["Anthropometric fit", "Body dimensions vs. work-surface height and control distances"],
];

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="rounded-2xl bg-gradient-to-br from-slate-900 to-sky-900 px-6 py-10 text-white sm:px-10">
        <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">Ergonomic risk assessment from any camera</h1>
        <p className="mt-3 max-w-2xl text-slate-300">
          Record a worker with a phone, webcam or network camera. ErgoCapture estimates 3D body posture in your browser, scores it on eight standard ergonomic methods,
          and tells you how confident it is in every score.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/analyze?demo=1" className="rounded-lg bg-sky-500 px-4 py-2 font-medium text-white hover:bg-sky-400">
            Open the demo
          </Link>
          <Link href="/live" className="rounded-lg bg-white/10 px-4 py-2 font-medium text-white hover:bg-white/20">
            Start live camera
          </Link>
        </div>
        <p className="mt-4 text-xs text-slate-400">Video never leaves this device. Faces are blurred by default; sessions can be saved as skeletons only.</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {MODES.map((m) => (
          <Link key={m.href} href={m.href} className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-sky-400 hover:shadow">
            <div className="text-xs font-medium text-sky-700">{m.tag}</div>
            <h2 className="mt-1 font-semibold group-hover:text-sky-700">{m.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{m.text}</p>
          </Link>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-lg font-semibold">Analysis modules</h2>
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {METHODS.map(([k, v]) => (
              <li key={k} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
                <span className="font-medium">{k}</span>
                <span className="text-right text-slate-500">{v}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-lg font-semibold">How it works</h2>
          <ol className="space-y-3 text-sm text-slate-600">
            <li>
              <b className="text-slate-800">1. Capture.</b> One camera for screening; two to four synchronised cameras for accurate assessment. Side view at hip height works
              best for a single camera.
            </li>
            <li>
              <b className="text-slate-800">2. Pose.</b> Every person is detected and tracked; whole-body keypoints including finger joints (RTMW by default, or MediaPipe / SAM 3D Body) are estimated in 2D and metric 3D, then smoothed and
              gap-filled.
            </li>
            <li>
              <b className="text-slate-800">3. Angles.</b> Trunk bend, side bend and twist; neck; upper arm, elbow and wrist; knees; hand height, reach and lift geometry —
              each with a reliability score.
            </li>
            <li>
              <b className="text-slate-800">4. Scores.</b> All modules run on every frame and over time: repetitions, static holds, activities and time in each risk band.
            </li>
            <li>
              <b className="text-slate-800">5. Output.</b> Timeline with bookmarks at the worst moments, body heatmap, PDF/Word report and CSV of every angle and score.
            </li>
          </ol>
          <Link href="/methods" className="mt-4 inline-block text-sm font-medium text-sky-700 hover:underline">
            Methods, confidence model and limitations →
          </Link>
        </div>
      </section>
    </div>
  );
}
