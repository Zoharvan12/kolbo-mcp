# Micro-drama — edit and delivery

The edit is half the film. Build one **tight cut** per episode from the finals (or from Drafts first, then finalize only what the cut uses), get the user's approval, then make the deliverables from it: the platform episode, social cutdowns, the series trailer (after Episode 1) and key art.

## Inputs

- The episode's final clips, in script order.
- Word timings (if `transcribe_audio` is still processing after a few minutes, outside agents may use a local Whisper for QA and the rough cut, then swap in Kolbo's timings for the final captions): `transcribe_audio` on each clip (or on a quick join) with `generate_srt: true, words_per_line: 1, lines_per_subtitle: 1`; download the word-by-word SRT. Correct mishears against the script's words (keep the timings, replace only the text), and delete any word the script does not have: transcribers invent repeats over quiet stretches (a second "That's me." appeared over silent room tone, one word with zero length).
- The shot map: every shot's start/end, who is frame-left/right, where each person looks (`shot_map.py`, or one frame per shot in Kobi).

## Cut rules (every one is a QA check)

1. **Cut only at shot changes**, landing on a line end, a look or an action. Trim shot heads and tails, not middles.
2. **No slivers.** A kept shot is ≥1.5 s or it is dropped whole.
3. **Exact frames.** In/out points stay 1.5 frames inside a shot change, so no frame of the neighbour flashes in.
4. **Never cut inside an action.** End before a gesture starts or after it completes (check frames around every out-point).
5. **No same-angle jump.** If two pieces of the same angle would touch with a position change, put a reaction shot of the other character between them (≥1.5 s, reused footage is fine).
6. **180-degree line.** Each character keeps their side and looks toward the other across the cut. Mirror a breaking shot only when no one-sided detail of anyone in frame is visible (check the bible's Asymmetry line: scar, parting, ring, watch, text) and the neighbours' gaze still agrees after the flip. Otherwise use a cutaway.
7. **L-cuts on dialogue.** Where the next shot answers a line, its picture comes in 0.2-0.55 s early over the end of the line; the line finishes underneath. No word may fall in dropped audio.
8. **Silence is judged, not measured.** Keep 0.4-1.3 s pauses where something happens (a look, a gesture, the beat before a key line). Cut stares that re-establish nothing and exits after the line is done.
9. **Punch-in only for a dead middle** inside one shot: cut the dead stretch, punch in 1.5x on the rest, framed on the face.
10. **Sound seams:** about 0.3 s crossfade at every seam so room tone never jumps. Never normalize or re-level Seedance's audio.
11. **Keep the bones:** the hook frame, every script line, and the last line with its hold.

Edit QA = all eleven, plus: no flash frames, every script line once and in order (transcribe the cut), screen direction consistent, no silence over 1.5 s without a judged beat.

## Kobi: build it in the Kolbo Video Editor

Read `video-editor.md` and `get_video_editor_schema` first. One session per episode, in the series project, format from the kickoff.

- **Picture:** one `video` item per kept piece on a mixed track, laid end to end (`reorder_items`). `trimStart` / `trimEnd` are milliseconds removed from the clip's head and tail. Punch-in = item `scale` + `position` (anchored on the face). Mirror = `flipX`.
- **L-cuts and seams:** mute the video items and put each piece's sound as an `audio` item (same clip URL, its own trims) on an audio track; extend a line's audio item under the next picture for an L-cut, and give every seam a short `audioEffects` fade in/out. Never change `volume` or `gain` to "even out" levels.
- **Captions (social cutdowns):** a caption track with `caption` items built from the corrected word timings (absolute timeline ms), `captionStyle.preset: "highlight"`, max 3 words per item, the spoken word in a contrasting colour, sitting just above the bottom 35% of the frame and inside the centre 82% width.
- **Hook (social cutdowns):** a `text` item for exactly 0-3 s, two short lines, large (about 6-7% of frame width), `backgroundEnabled` with a white background, `backgroundRadius` for rounded corners and generous `backgroundPadding`, black bold text, at waist height right above the captions, never over a face.
- Read the saved session back, then `export_video_editor_session` only when the user wants the rendered file. Inspect the export (frames + a transcript) before calling it done; renderer support differs for some effects.

## Outside agents: local scripts

`scripts/micro-drama/` (Python 3, numpy, ffmpeg on PATH; run from that folder):

| Step | Command |
|---|---|
| Shot map | `python shot_map.py <clip-or-join.mp4> <out_dir>` → `shots.json` + a first/mid/last strip per shot; look at every strip |
| Pace candidates | `python pace_report.py <join.mp4> <words.srt> pace.json` → dead-air candidates to judge |
| Build the cut | `python cut.py cut.json` (segments with start/end, `lcut`, `jcut`, `zoom`, `y`, `flip`; snaps to real frames, crossfades seams, never re-levels) |
| Flash check | `python flash_check.py <tight.mp4>` → must report 0 problems |
| Platform episode | `python burn.py film <tight.mp4> <words-tight.srt> <ep.mp4>` (plain subtitles, max 4 words per row, 2 rows) or ship the clean master |
| Social cutdown | `python burn.py social <short.mp4> <words-short.srt> <short-subbed.mp4> --hook "Line one|Line two"` |

Burn at the delivery resolution: if the cut is upscaled, burn captions and hook after the upscale on the clean cut, never upscale burned text.

Re-transcribe the tight cut (and each short) before burning; word timings change after cutting. If the user wants to keep editing in the app, also build the Video Editor session.

## Two products from one tight cut

- **Platform episode** (the full episode page / series feed): the clean tight cut, plain film subtitles, no hook, no word-pop captions.
- **Social cutdowns** (built from whole shots of the tight cut, each with its own hook, captions and cover frame):
  - **D - line-open (post first):** start about 0.4 s before the most confrontational line and play on; the hook sets the situation, never repeats the line.
  - **A - full:** the whole episode with the main hook.
  - **B - cold-open:** the last line or the cliff (3-5 s) first, then the full episode.
  - **C - teaser:** 20-30 s of the 2-3 strongest beats, ending on the cliff.
  - The first frame of every short is a lead in a medium shot, facing camera-ish, eyes open; never a back or an empty room under the hook.
  - Cover = the best still of that short (tension + the lead + tells the story), a different frame per short, nothing burned in. Save it as `<short>-cover.jpg` for the platform's cover upload.
- Post caption: episode number, a tease of the next one, the call to action (e.g. "Full episode at the link in bio"). No URL or end card in the video.

## Series trailer (right after Episode 1 is approved)

20-25 s, its own identity from the bible's World + look. Release unit = trailer + Episode 1.

| Section | Length | Content |
|---|---|---|
| Hook exchange | ~3 s | the episode's opening exchange, a face with eyes open on frame 1 |
| Card 1 | 1.4 s | the premise statement ("EVERYTHING / WAS PERFECT.") |
| World beat | ~1.6 s | the series' signature moment with its object sound |
| Card 2 | 1.4 s | the crack ("EXCEPT THE / AFTERNOONS.") |
| Temptation line | ~1.6 s | ONE line that turns the story |
| Montage | 1.7-2.6 s | unused motion from the episode, alternating characters, each cut shorter |
| Button exchange | ~4.4 s | the episode's last exchange, in the score's quiet part |
| Title | ~2.25 s | the series title card on the score's big hit |
| End card | ~3 s | the creator's / brand's sign-off on the stinger |

- **Title and card lettering:** `nano-banana-pro` (or `gpt-image-2.5-*` with `font_ids` for a brand font), 16:9, "title lettering only, on pure flat black, exactly N centered lines: <text>, <lettering and material from the world>, each word exactly once, nothing else". Check spelling and stray punctuation, then key out the black.
- **Card background:** a short moving motif from the world, no people, no text (a Veo or Seedance clip, sound off).
- **Score:** `generate_music` with a structured plan: restrained intro under dialogue → build → one big hit on the first beat (title) → hush (button) → final stinger. Measure where the hit and the stinger really land before cutting; generated scores rarely follow plan timings.
- **SFX:** one world-native object sound plus one tension sound under the button (`generate_sound`).
- Cards and title never repeat a spoken line. Dialogue sits above the score; check it on a phone speaker.
- Kobi assembles it in the Video Editor (picture track, text/image cards, music and SFX tracks); outside agents can use the editor or ffmpeg.

## Key art

- **Poster (3:4) and covers:** `gpt-image-2.5-sunburst` with every character's Visual DNA tagged in the prompt and all typography in the same generation (series title in its lettering, tagline). Name the title exactly or the model swaps it. Leads face the camera, figure in frame, eyes open.
- **Banners / headers:** generate at the model's widest ratio with the poster as a source image, then fit the platform size with `edit_image` reframe / zoom-out. Never assemble key art in code; code may only crop or resize a finished image.
- QA: faces match the sheets, every word spelled right, characters clearly adult, no real-person likeness.

## Delivery report (to the user)

Files with links, credits spent against the cap, QA results per gate, known compromises, and what needs their decision. Publishing is the user's action.

Upload finished files into the series project. `upload_media` rejects large files (HTTP 413 on a 257 MB 4K minute); for those, outside agents call `create_upload_ticket` and POST the file with curl (`-F "file=@<path>;type=video/mp4" -F "project_id=<id>"`); retry a 502 after a few seconds (large uploads often succeed on the second try). Deliver at a sane bitrate (about 35 Mbit/s for 4K, 12 Mbit/s for 1080p); platforms recompress anything higher.
