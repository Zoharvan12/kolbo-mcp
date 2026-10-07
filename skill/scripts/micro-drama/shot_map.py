"""Shot map: list every shot of a joined episode and save one contact sheet (first / middle / last frame per shot).

usage: python shot_map.py <joined.mp4> <out_dir>
Writes <out_dir>/shots.json ([{n, start, end}]) and <out_dir>/shot-NN.jpg strips. Look at every strip and note,
per shot: who is frame-left / frame-right, where each person looks, shot size. That is the shot map the cut uses.
"""
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

from media import probe, shot_changes


def main(video, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    info = probe(video)
    edges = [0.0] + shot_changes(video) + [info["duration"]]
    shots = [{"n": i + 1, "start": round(a, 3), "end": round(b, 3)} for i, (a, b) in enumerate(zip(edges, edges[1:]))]

    def strip(s):
        a, b = s["start"], s["end"]
        times = [a + 0.05, (a + b) / 2, max(b - 0.08, a + 0.05)]
        inputs = sum((["-ss", f"{t:.3f}", "-i", video] for t in times), [])
        subprocess.run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex",
                        "".join(f"[{i}:v]scale=270:-2,trim=end_frame=1[s{i}];" for i in range(3)) + "[s0][s1][s2]hstack=3",
                        "-frames:v", "1", os.path.join(out_dir, f"shot-{s['n']:02d}.jpg")], check=True)

    with ThreadPoolExecutor(os.cpu_count()) as pool:
        list(pool.map(strip, shots))
    json.dump(shots, open(os.path.join(out_dir, "shots.json"), "w"), indent=1)
    for s in shots:
        print(f"shot {s['n']:2d}  {s['start']:7.2f}-{s['end']:7.2f}  ({s['end'] - s['start']:.2f}s)")


if __name__ == "__main__":
    main(*sys.argv[1:3])
