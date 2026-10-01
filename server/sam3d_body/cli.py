"""Command line: python cli.py work.mp4 --fps 10 --out work.pose.json

Open the resulting file on ErgoCapture's Analyze page ("Add video / session").
"""

import argparse
import json
import sys

from ergocapture_sam3d import load_estimator, process_video


def main() -> None:
    ap = argparse.ArgumentParser(description="SAM 3D Body → ErgoCapture pose file")
    ap.add_argument("videos", nargs="+", help="one file per camera view")
    ap.add_argument("--fps", type=float, default=10.0, help="frames analysed per second (default 10)")
    ap.add_argument("--model", default="facebook/sam-3d-body-dinov3", help="Hugging Face repo id")
    ap.add_argument("--detector", default="vitdet", choices=["vitdet", "sam3"])
    ap.add_argument("--fov", default="", help='field-of-view estimator, e.g. "moge2" (optional)')
    ap.add_argument("--out", help="output path (single video only); default <video>.pose.json")
    args = ap.parse_args()
    if args.out and len(args.videos) > 1:
        sys.exit("--out only works with one video")

    est = load_estimator(args.model, args.detector, args.fov)
    source = f"SAM 3D Body ({args.model.rsplit('-', 1)[-1]})"
    for video in args.videos:
        def progress(p: float, v: str = video) -> None:
            print(f"\r{v}: {p * 100:5.1f}%", end="", file=sys.stderr, flush=True)

        result = process_video(video, est, fps=args.fps, source=source, on_progress=progress)
        out = args.out or video.rsplit(".", 1)[0] + ".pose.json"
        with open(out, "w") as f:
            json.dump(result, f, separators=(",", ":"))
        found = sum(1 for fr in result["frames"] if fr["keypoints3d"])
        print(f"\n{out}: worker found in {found}/{len(result['frames'])} frames", file=sys.stderr)


if __name__ == "__main__":
    main()
