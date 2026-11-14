# Voice acting: the user's performance in a character's voice

Founder rule (2026-11-05): when the acting matters, the best voice is often a real
performance converted into the character's voice. Voice-to-voice (speech-to-speech) keeps
the exact words, timing, pauses and emotion of the take and changes only the timbre.

**Proven 2026-11-05 (telenovela, founder: "works great"):** one person performed all four
characters in one Hebrew take; each line was split by the script and converted into its
character's cloned voice. Recommend this FIRST for Hebrew dialogue and any line where acting
matters; TTS is the fallback when the user cannot record. Split by the script lines, never by
the transcriber's speaker labels (one performer = meaningless Speaker 1/2).

## Tool status

- `change_voice` (MCP): `audio_url` + `visual_dna_id` (the DNA's own voice) or
  `target_audio_url` (any voice sample). **Not released yet** (branch `kobi/change-voice`
  in kolbo-mcp). Until it ships, use the in-app Audio Studio → Speech to Speech, or the SDK
  route `POST /api/v1/audio/voice-change` once kolbo-api deploys it (poll
  `/v1/generate/:id/status`, type `voice_change`).
- Kobi (in-app agent) has `change_voice` built in on the same route.
- Billing: model `replicate_voices`, per **started minute** of source audio, per call
  (1-minute minimum). Ten 5-second calls cost ten minutes; one joined 50-second clip costs one.

## Three voice routes (offer them in plain words)

1. **Quick draft**: `generate_speech` with voice `dna_<DNA id>` (Cartesia; Hebrew is
   latinized automatically). Fast and cheap; the acting is the model's.
2. **You act it**: the user records the lines, `change_voice` turns each take into the
   character's voice. Best when the acting matters.
3. **Designed voice + your acting**: design the character's voice first (ElevenLabs Voice
   Design, in the character's language; in Kobi `design_character_voice`), then
   `change_voice` the user's take onto it. For a new character whose voice must be invented.

## Teleprompter for route 2

Give the script as one numbered line per row, speaker first, a short acting note in
brackets:

```
1. MAYA [quietly, hurt]: You knew. The whole time.
2. ROI [too fast, guilty]: It's not what you think.
```

Tell the user: quiet room, phone close to the mouth, one take per line with a short pause
between lines. One recording per character is easiest; a whole scene also works.

## Any audio file the user sends

1. `transcribe_audio` with word timings (`words_per_line: 1`, read `word_by_word_srt_url`).
2. Map the words to the script lines and speakers. Ask only when a speaker is truly unclear.
3. Cut each line with ffmpeg (or `trim_video`): 0.1 s of air before and after, never inside a
   word.
4. Join one character's lines into one clip with 0.5 s silence between them, run
   `change_voice` once with that character's `visual_dna_id`, and cut the result back at the
   same offsets (saves the per-minute billing).
5. `upload_media` the pieces.
6. Use each piece where it belongs:
   - `generate_elements` on `wan3.0-elements` with the line as `@AudioN`, padded to the
     whole-second clip length (see `talking-avatar-wan3.md` for the take rules), or
   - `generate_lipsync` onto an existing shot (Sync-3 animates only that speaker).

A take where the user is the character goes in as is, with no conversion.

## Rules

- The user hears the converted lines and approves before any paid video uses them.
- Never re-judge the user's acting, and never transcribe a converted or generated take to
  "check" it. The user listens; that is the check.
- One recording = one voice. A recording with two speakers is cut per speaker first.
