"""Pace report: find dead air (no speech, little motion) in a joined episode. Candidates only - a human or the
agent judges each one against the script beat (keep a look that lands, cut a stare that re-establishes nothing).

usage: python pace_report.py <joined.mp4> <words.srt> [out.json]
words.srt = one-word-per-cue SRT from Kolbo transcribe_audio (word_by_word_srt_url).
Writes proposed keep-segments [[start, end], ...]; a piece whose removed gap has no real shot change gets
[start, end, 1.5, 0.2] (1.5x punch-in so the jump reads as a new angle).
"""
import json
import sys

import numpy as np

from media import frame_diffs, probe, shot_changes, srt_words

STEP = 1 / 8      # analysis resolution (s)
MAX_DEAD = 0.6    # dead air longer than this is a trim candidate
LEAD_IN = 0.25    # keep before a line
HOLD = 0.45       # keep after a line (the reaction beat)
MIN_PIECE = 0.5


def main(video, srt, out=None):
    dur = probe(video)["duration"]
    n = int(dur / STEP)
    t = np.arange(n) * STEP
    m = frame_diffs(video, 1 / STEP)[:n]
    m = np.pad(m, (0, n - len(m)))
    shots = shot_changes(video)
    for c in shots:  # a hard cut is a spike, not action
        m[max(int(c / STEP) - 1, 0):int(c / STEP) + 2] = 0
    on = max(4.0, float(np.percentile(m, 70)))
    keep = np.zeros(n, bool)
    for _, a, b in srt_words(srt):
        keep[(t >= a - LEAD_IN) & (t < b + HOLD)] = True
    keep |= np.convolve(m > on, np.ones(4), "same") > 0
    keep[t < 0.5] = True          # hook frame
    keep[t > dur - 1.0] = True    # cliff hold
    i = 0
    while i < n:                  # short gaps are breath, keep them
        if keep[i]:
            i += 1
            continue
        j = i
        while j < n and not keep[j]:
            j += 1
        if (j - i) * STEP <= MAX_DEAD:
            keep[i:j] = True
        i = j
    segs, i = [], 0
    while i < n:
        if not keep[i]:
            i += 1
            continue
        j = i
        while j < n and keep[j]:
            j += 1
        s, e = round(float(t[i]), 3), round(min(float(t[j - 1]) + STEP, dur), 3)
        if e - s >= MIN_PIECE:
            segs.append([s, e])
        i = j
    for k in range(1, len(segs)):
        a, b = segs[k - 1][1], segs[k][0]
        if not any(a - 0.1 <= c <= b + 0.1 for c in shots) and len(segs[k - 1]) == 2:
            segs[k] += [1.5, 0.2]
    new = sum(s[1] - s[0] for s in segs)
    print(f"{video}: {dur:.1f}s -> {new:.1f}s ({len(segs) - 1} trim candidates)")
    for k in range(1, len(segs)):
        a, b = segs[k - 1][1], segs[k][0]
        print(f"  trim {a:6.2f}-{b:6.2f} ({b - a:.2f}s){'  + 1.5x punch-in' if len(segs[k]) > 2 else ''}")
    if out:
        json.dump(segs, open(out, "w"), indent=1)


if __name__ == "__main__":
    main(*sys.argv[1:4])
