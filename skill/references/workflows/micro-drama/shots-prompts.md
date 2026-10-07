# Micro-drama — shots and Seedance 2.5 prompts

One prompt per part, compiled as the Locked Intro in `models/seedance25.md` (read it and `models/seedance.md` first). Acting and blocking depth: `filmmaking/acting-direction.md`, `filmmaking/blocking-continuity.md`. This file adds what micro-drama parts need.

## Before writing a part

**Character brief per person in the part** (one line each, goes into CAST):
- Who: age, origin, one life fact that colours how they move.
- Just before: what happened a minute ago.
- Wants from the other person in this part: one verb, and what they hide.
The shot list then describes behaviour that follows from it (fixes a sleeve that doesn't need fixing, looks at his hands before his face, starts a line, stops, says it), never state words.

**Banned words in video prompts:** real, realistic, natural acting, not robotic, emotional, sensual, sultry, intimate (as a delivery note). Replace each with what the body or voice does.

## Blocking

1. Look at the location frame first. Name only what is in it, where it is (frame left / centre / right, foreground / back). Anything not in it gets an explicit place relative to what is ("the front door is behind the camera").
2. `[LOCATION]` carries a **FLOOR PLAN** (fixed positions of furniture and entrances) and an **AXIS** (who stands where, facing which way) for the whole part.
3. Every shot opens with **start positions**; the start of shot N is the end of shot N-1. Movement says from where to where.
4. **Eye-lines have targets** on the floor plan, off one side of the camera ("toward Dana, far left of frame"). If the target is behind or in line with the camera, the eyes land in the lens. A line spoken TO someone is shot over that person's shoulder. Nobody looks into the lens, ever.
5. **Entrances:** put the camera on the character's side of the door (inside the cab, behind her shoulder; the door opens and reveals the room). A camera already inside shows the result, not the reveal.
6. **Prop state before action:** pre-set it ("the bottle is already open, its cap beside it") and describe visible physics. Never chain "opens and pours" in one beat.
7. **Carried props** appear in every shot's blocking. Props stay where the last part left them.
8. **Movement at human pace:** calm walk ≈ 1 m/s, pick up / put down ≈ 1.5 s, turn ≈ 1 s. Budget each move in the part's timing.
9. **One continuous moment per part.** No time or place jump inside a part; exits and new rooms get their own part, with a cause.
10. Lying or seated characters: place the camera relative to the FACE.

## Coverage (default)

- Regular drama coverage: eye-level mediums, medium close-ups, over-the-shoulders, two-shots staged in depth (never two profiles across the narrow frame), one wide for movement or geography. 35-50 mm feel.
- Vertical framing: tightest default is MCU chest-up; one close-up per part for the key beat. Face fully in frame on any speaking or reacting shot.
- Camera: "shoulder-mounted handheld operated by a real person, gentle organic sway, small natural reframes; never shaky, never locked off".
- Lens and grade: vertical cannot be anamorphic. "Vintage spherical cinema lenses, round creamy bokeh, gentle halation around practicals, shallow depth of field" + the bible's grade word for word in every prompt.
- 2-3 shots per 13 s of slow action; dialogue-driven parts can carry more. Cuts are motivated by dialogue (speaker or listener reaction), never to show a new action.
- Whoever makes a sound (breath, laugh, gasp) is on screen when it happens. Every close shot has one visible change (eyes, breath, a swallow).

## Write for the edit

- Gestures complete inside one shot.
- Consecutive shots change angle or size (no same-angle neighbours).
- Each shot holds about 0.5 s after its last line.
- Plan one listener reaction shot for every key line (cutaway and L-cut material).
- End each part on an explicit final frame; the next part's first shot starts from it (CONTINUITY line).

## Audio block (Seedance generates the whole soundtrack natively)

```
[AUDIO - GENERATE THE WHOLE SOUNDTRACK NATIVELY]
@Audio1 is ONLY <NAME A>'s voice identity; never speak the words heard in it. @Audio2 is ONLY <NAME B>'s voice identity.
Dialogue in this order, each spoken once, no other words:
1. ~0.6s NAME A, <what she is doing / wants>, with her <accent>: "<line>"
2. ~3.1s NAME B, <...>, with his <accent>: "<line>"
Breathing soft and natural only. Room tone: <space>. Foley: <each named move and prop touch>.
No music. No musical score. No stingers, no whooshes.
```

- Name each speaker's accent in CAST and in every one of their lines; the voice sample alone does not hold it.
- The part ends about 1 s after its last line. Between lines 0.5-1.2 s; one longer beat (≤2 s) only where a line must land.
- AVOID adds: speaking the words of the reference audio, loud breathing, music.
- Music is added in the edit only if the user asks (a montage beat can run on a track; see `edit-deliver.md`).

## The call

`generate_elements` (or the tool the core skill routes to) with `model: "seedance-2-5"`, `draft: true`, `duration` = the part's length (4-30 s), `aspect_ratio` from the kickoff, `multi_shots: true`, `enhance_prompt: false`, `reference_images` = [character sheets for the looks in this scene, location frame, prop sheets], `reference_audio_urls` = [voice samples of the speaking characters], Visual DNA ids if used, `project_id`. Tag every reference inside the prompt per the Kolbo prompt conventions; an untagged reference is ignored. AVOID always includes: face morphing, outfit/hair/jewelry changes, extra people, crossing the axis, lips moving on the listener, looking into the camera, text, subtitles, logos, flat video look, oversaturated color.

## Prompt QA gate (before submitting)

- Every character has a brief; no banned words.
- Every prop is named one way everywhere (a "cordless phone" with a "phone cord" made Seedance pick a corded phone).
- The first line or hook action lands inside the first 2 s (pre-set the prop in hand rather than spending 2 s on a reach).
- FLOOR PLAN + AXIS present; furniture named only if it is in the location frame or placed relative to it; each shot's start = previous end.
- Every eye-line has a target off one side; lines to someone shot over that person's shoulder.
- Wardrobe in CAST matches the sheet's front panel; no CAST sentence contradicts a reference image.
- Timecodes sum to `duration`; Total lines and Multishot header present (`models/seedance25.md`).
- Audio block lists lines in order with accents; timeline ends ≤1 s after the last line; "No music" present unless requested.
- No famous names or IP; all ages 21+.
