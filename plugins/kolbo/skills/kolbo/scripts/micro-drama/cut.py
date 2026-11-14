"""Build the tight cut from final clips with exact frames, L/J-cuts and smooth sound seams. Levels never change.

usage: python cut.py <cut.json>
cut.json:
{
  "out": "final/ep01-tight.mp4",
  "xfade": 0.3,
  "segments": [
    {"file": "final/ep01-part1.mp4", "start": 0.0, "end": 9.4},
    {"file": "final/ep01-part1.mp4", "start": 11.2, "end": 14.0, "lcut": 0.3},
    {"file": "final/ep01-part2.mp4", "start": 0.2, "end": 6.1, "zoom": 1.5, "y": 0.2, "flip": false, "jcut": 0}
  ]
}
- start/end: seconds on that file. In/out points within 0.15 s of a shot change are moved 1.5 frames inside the
  shot, so no frame of the neighbouring shot flashes in.
- lcut: this shot's PICTURE comes in that many seconds early over the end of the previous line (L-cut).
- jcut: this shot's SOUND starts that many seconds early under the previous picture (J-cut).
- zoom/y: punch-in (1.5 = 150%) anchored at y (0 top, 0.5 centre) for a jump inside one shot.
- flip: horizontal mirror to fix a 180-degree break. Check every one-sided detail (scar, parting, ring, text) first.
- Seams borrow `xfade` s of the incoming shot's own sound and crossfade it, so room tone never jumps.
  Contiguous segments of the same file butt-join with no borrow.
"""
import bisect
import json
import os
import subprocess
import sys

from media import frame_pts, probe, shot_changes


def snap(s, e, changes, fps):
    for c in changes:
        if abs(e - c) < 0.15:
            e = c - 1.5 / fps
        if abs(s - c) < 0.15:
            s = c + 1.5 / fps
    return s, e


def main(spec_path):
    spec = json.load(open(spec_path, encoding="utf-8"))
    base = os.path.dirname(os.path.abspath(spec_path))
    path = lambda x: x if os.path.isabs(x) else os.path.join(base, x)
    X = spec.get("xfade", 0.3)
    cache, segs = {}, []
    for raw in spec["segments"]:
        f = path(raw["file"])
        if f not in cache:
            info = probe(f)
            cache[f] = (info, shot_changes(f), frame_pts(f))
        info, changes, pts = cache[f]
        fps = info["fps"]
        s, e = snap(raw["start"], raw["end"], changes, fps)
        contiguous = bool(segs) and segs[-1]["file"] == f and abs(segs[-1]["raw_end"] - raw["start"]) < 1e-6
        if contiguous:  # one shared cut point, mid-frame, so no word repeats
            c = min(changes, key=lambda c: abs(c - raw["start"]), default=raw["start"])
            s = c - 0.5 / fps if abs(c - raw["start"]) < 0.15 else raw["start"]
            segs[-1]["end"] = s
        # Snap to real frame times so audio length == frame count (lip sync never drifts).
        k = bisect.bisect_left(pts, s - 1e-4)
        s = pts[min(k, len(pts) - 1)]
        k = bisect.bisect_left(pts, e - 1e-4)
        e = pts[max(k - 1, 0)] + 1 / fps
        segs.append({"file": f, "start": s, "end": e, "raw_end": raw["end"], "fps": fps, "w": info["w"], "h": info["h"],
                     "zoom": raw.get("zoom", 1), "y": raw.get("y", 0.5), "flip": raw.get("flip", False),
                     "lcut": round(raw.get("lcut", 0) * fps) / fps, "jcut": round(raw.get("jcut", 0) * fps) / fps,
                     "contiguous": contiguous})
    ins, fc, vl = [], "", ""
    for i, sg in enumerate(segs):
        nxt = segs[i + 1] if i + 1 < len(segs) else {"lcut": 0, "jcut": 0}
        ins += ["-i", sg["file"]]
        z = sg["zoom"]
        crop = (f",crop=iw/{z}:ih/{z}:(iw-iw/{z})/2:(ih-ih/{z})*{sg['y']},scale={sg['w']}:{sg['h']}:flags=lanczos"
                if z != 1 else "")
        fc += (f"[{i}:v]trim={sg['start'] - 0.002}:{sg['end'] - nxt['lcut'] - 0.002},setpts=PTS-STARTPTS{crop}"
               f"{',hflip' if sg['flip'] else ''},setsar=1[v{i}];")
        a0 = sg["start"] + sg["lcut"] - sg["jcut"] - (X if i and not sg["contiguous"] else 0)
        if a0 < 0:
            sys.exit(f"segment {i} needs {X + sg['jcut']:.2f}s of sound before its in-point; start it later")
        fc += f"[{i}:a]atrim={a0}:{sg['end'] - nxt['jcut']},asetpts=PTS-STARTPTS[a{i}];"
        vl += f"[v{i}]"
    fc += f"{vl}concat=n={len(segs)}:v=1:a=0[v];"
    prev = "a0"
    for i in range(1, len(segs)):
        join = "concat=n=2:v=0:a=1" if segs[i]["contiguous"] else f"acrossfade=d={X}:c1=tri:c2=tri"
        fc += f"[{prev}][a{i}]{join}[x{i}];"
        prev = f"x{i}"
    out = path(spec["out"])
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    tmp = out + ".part.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", *ins, "-filter_complex", fc.rstrip(";"), "-map", "[v]",
                    "-map", f"[{prev}]", "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", tmp], check=True)
    os.replace(tmp, out)
    t = 0.0
    for i, sg in enumerate(segs):
        nxt = segs[i + 1]["lcut"] if i + 1 < len(segs) else 0
        print(f"{t:7.2f}  {os.path.basename(sg['file'])} {sg['start']:.3f}-{sg['end'] - nxt:.3f}"
              + (f" zoom {sg['zoom']}" if sg["zoom"] != 1 else "") + (" flip" if sg["flip"] else "")
              + (f" L {sg['lcut']:.2f}" if sg["lcut"] else "") + (f" J {sg['jcut']:.2f}" if sg["jcut"] else ""))
        t += sg["end"] - nxt - sg["start"]
    print(f"total {t:.2f}s -> {out}")


if __name__ == "__main__":
    main(sys.argv[1])
