"""Shared ffmpeg helpers for the micro-drama edit scripts. Needs ffmpeg/ffprobe on PATH and numpy."""
import json
import subprocess

import numpy as np


def probe(video):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                                   "stream=width,height,avg_frame_rate:format=duration", "-of", "json", video])
    d = json.loads(out)
    s = d["streams"][0]
    num, den = s["avg_frame_rate"].split("/")
    return {"w": s["width"], "h": s["height"], "fps": float(num) / float(den or 1),
            "duration": float(d["format"]["duration"])}


def frame_pts(video):
    """Real presentation time of every video frame, sorted."""
    out = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                                   "packet=pts_time", "-of", "csv=p=0", video], text=True)
    return sorted(float(x) for x in out.split() if x and x != "N/A")


def gray_frames(video, fps):
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", video, "-vf",
                                   f"fps={fps},scale=90:160,format=gray", "-f", "rawvideo", "-"])
    return np.frombuffer(raw, np.uint8).reshape(-1, 160, 90).astype(np.int16)


def frame_diffs(video, fps):
    f = gray_frames(video, fps)
    return np.concatenate([[0], np.abs(np.diff(f, axis=0)).mean(axis=(1, 2))])


def shot_changes(video, threshold=18):
    """Time of the first frame of every new shot (hard cuts only)."""
    fps = probe(video)["fps"]
    d = frame_diffs(video, fps)
    return [round(i / fps, 4) for i in np.where(d > threshold)[0] if i > 0]


def srt_words(path):
    """[(word, start, end)] from a one-word-per-cue SRT (Kolbo transcribe_audio word_by_word_srt_url)."""
    def sec(t):
        h, m, s = t.replace(",", ".").split(":")
        return int(h) * 3600 + int(m) * 60 + float(s)
    words = []
    for block in open(path, encoding="utf-8").read().strip().split("\n\n"):
        lines = block.strip().splitlines()
        if len(lines) >= 3 and "-->" in lines[1]:
            a, b = (x.strip() for x in lines[1].split("-->"))
            words.append((" ".join(lines[2:]).strip(), sec(a), sec(b)))
    return words
