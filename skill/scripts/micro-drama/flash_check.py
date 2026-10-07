"""Find one-frame flashes and too-short shots in a cut. Exit code 1 if anything is found.
usage: python flash_check.py <video> [min_shot_s=1.2]"""
import sys

import numpy as np

from media import frame_diffs, probe

video = sys.argv[1]
min_shot = float(sys.argv[2]) if len(sys.argv) > 2 else 1.2
fps = probe(video)["fps"]
d = frame_diffs(video, fps)
cuts = [int(i) for i in np.where(d > 18)[0] if i > 0]
bad = 0
for a, b in zip(cuts, cuts[1:]):
    if (b - a) / fps < min_shot:
        print(f"short shot {a / fps:.3f}-{b / fps:.3f}s ({b - a} frames)")
        bad += 1
print(f"{len(cuts)} cuts checked, {bad} problems")
sys.exit(1 if bad else 0)
