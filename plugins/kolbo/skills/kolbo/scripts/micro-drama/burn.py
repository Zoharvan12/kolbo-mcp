"""Burn captions (and an optional hook) into a finished cut with libass. Audio is copied untouched.

usage:
  python burn.py social <in.mp4> <words.srt> <out.mp4> [--hook "Line one|Line two"] [--hook-dy 0] [--font NAME] [--fontsdir DIR]
  python burn.py film   <in.mp4> <words.srt> <out.mp4> [--font NAME] [--fontsdir DIR]

words.srt = one-word-per-cue SRT from Kolbo transcribe_audio (word_by_word_srt_url) of THIS file, corrected
against the script's words (keep the timings, fix only mishears).
social: word-pop captions, max 3 words per line, the spoken word in yellow, each word one frame early, sitting
        just above the bottom 35% platform UI band; hook = two lines in a white box for exactly 0-3 s, at the waist,
        right above the captions. All text stays inside the centre 82% so the right-side buttons never cover it.
film:   plain subtitles for the full episode page - max 4 words per row, 2 rows, low in frame, soft shadow.
Also writes <out>.ass next to the output for inspection.
"""
import argparse
import os
import subprocess

from media import probe, srt_words

YELLOW, WHITE, BLACK = "&H003DE2FF", "&H00FFFFFF", "&H00000000"


def ts(t):
    t = max(t, 0)
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"


def lines_of(words, max_words, pause=0.6):
    out, cur = [], []
    for w in words:
        if cur and (len(cur) >= max_words or w[1] - cur[-1][2] > pause or cur[-1][0][-1:] in ",.?!"):
            out.append(cur)
            cur = []
        cur.append(w)
    return out + ([cur] if cur else [])


def build(mode, video, srt, hook, hook_dy, font):
    info = probe(video)
    W, H, frame = info["w"], info["h"], 1 / info["fps"]
    margin = int(W * 0.09)
    cap_y = int(H * 0.65) - int(H * 0.02)            # just above the bottom 35% UI band
    words = srt_words(srt)
    head = (f"[Script Info]\nScriptType: v4.00+\nPlayResX: {W}\nPlayResY: {H}\nWrapStyle: 2\n\n[V4+ Styles]\n"
            "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
            "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, "
            "MarginR, MarginV, Encoding\n")
    ev = "\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    if mode == "film":
        size = int(W * 0.063)
        head += (f"Style: Sub,{font},{size},{WHITE},{WHITE},{BLACK},&H80000000,0,0,0,0,100,100,0,0,1,1.5,2,2,"
                 f"{margin},{margin},{int(H * 0.08)},1\n")
        for ln in lines_of(words, 8):
            text = " ".join(w[0] for w in ln)
            parts = text.split()
            if len(parts) > 4:
                text = " ".join(parts[:len(parts) // 2 + len(parts) % 2]) + "\\N" + " ".join(parts[len(parts) // 2 + len(parts) % 2:])
            ev += f"Dialogue: 0,{ts(ln[0][1] - frame)},{ts(ln[-1][2] + 0.2)},Sub,,0,0,0,,{text}\n"
        return head + ev
    cap = int(W * 0.07)
    head += (f"Style: Cap,{font},{cap},{WHITE},{WHITE},{BLACK},&H00000000,1,0,0,0,100,100,0,0,1,{cap * 0.12:.1f},0,2,"
             f"{margin},{margin},{H - cap_y},1\n")
    head += (f"Style: Hook,{font},10,{BLACK},{BLACK},{BLACK},{BLACK},1,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1\n"
             f"Style: Box,{font},10,{WHITE},{WHITE},{WHITE},{WHITE},0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1\n")
    caps = []
    for ln in lines_of(words, 3):
        for k, (w, a, b) in enumerate(ln):
            end = ln[k + 1][1] if k + 1 < len(ln) else b + 0.15
            text = " ".join(("{\\c" + YELLOW + "}" + x + "{\\c" + WHITE + "}") if j == k else x
                            for j, (x, _, _) in enumerate(ln))
            caps.append([a - frame, end - frame, text])
    for k in range(len(caps) - 1):  # never two caption states on screen at once (libass stacks them)
        caps[k][1] = max(min(caps[k][1], caps[k + 1][0]), caps[k][0] + frame)
    for a, b, text in caps:
        ev += f"Dialogue: 1,{ts(a)},{ts(b)},Cap,,0,0,0,,{text}\n"
    if hook:
        lines = hook.split("|")
        # ponytail: box width estimated at 0.6 x font size per character (bold sans); measure with a font
        # library if a hook font renders much wider.
        size = min(W * 0.068, (W * 0.82 - W * 0.07) / (0.6 * max(len(x) for x in lines)))
        pad, r = size * 0.5, size * 0.45
        bw = 0.6 * size * max(len(x) for x in lines) + 2 * pad
        bh = size * 1.2 * len(lines) + 2 * pad
        bottom = cap_y - cap * 1.3 - hook_dy           # sits right above the caption line
        x0, y0 = (W - bw) / 2, bottom - bh
        path = (f"m {r:.0f} 0 l {bw - r:.0f} 0 b {bw - .45 * r:.0f} 0 {bw:.0f} {.45 * r:.0f} {bw:.0f} {r:.0f} "
                f"l {bw:.0f} {bh - r:.0f} b {bw:.0f} {bh - .45 * r:.0f} {bw - .45 * r:.0f} {bh:.0f} {bw - r:.0f} {bh:.0f} "
                f"l {r:.0f} {bh:.0f} b {.45 * r:.0f} {bh:.0f} 0 {bh - .45 * r:.0f} 0 {bh - r:.0f} "
                f"l 0 {r:.0f} b 0 {.45 * r:.0f} {.45 * r:.0f} 0 {r:.0f} 0")
        ev += f"Dialogue: 2,{ts(0)},{ts(3.0)},Box,,0,0,0,,{{\\an7\\pos({x0:.0f},{y0:.0f})\\p1}}{path}{{\\p0}}\n"
        ev += (f"Dialogue: 3,{ts(0)},{ts(3.0)},Hook,,0,0,0,,{{\\an5\\pos({W / 2:.0f},{y0 + bh / 2:.0f})\\fs{size:.0f}}}"
               + "\\N".join(lines) + "\n")
    return head + ev


def main():
    p = argparse.ArgumentParser()
    p.add_argument("mode", choices=["social", "film"])
    p.add_argument("video")
    p.add_argument("srt")
    p.add_argument("out")
    p.add_argument("--hook", default="")
    p.add_argument("--hook-dy", type=int, default=0, help="move the hook down by N pixels if it covers a face or body")
    p.add_argument("--font", default="Montserrat ExtraBold")
    p.add_argument("--fontsdir", default="")
    a = p.parse_args()
    ass = os.path.abspath(a.out) + ".ass"
    open(ass, "w", encoding="utf-8").write(build(a.mode, a.video, a.srt, a.hook, a.hook_dy, a.font))
    # libass path escaping is fragile on Windows: run from the .ass folder with a bare file name.
    flt = f"subtitles={os.path.basename(ass)}" + (f":fontsdir={a.fontsdir}" if a.fontsdir else "")
    tmp = os.path.abspath(a.out) + ".part.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", os.path.abspath(a.video), "-vf", flt, "-c:v", "libx264",
                    "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart",
                    tmp], check=True, cwd=os.path.dirname(ass))
    os.replace(tmp, os.path.abspath(a.out))
    print("->", a.out)


if __name__ == "__main__":
    main()
