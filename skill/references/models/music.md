<!-- PARITY: this file mirrors getMusicPromptSystemPrompt() in
     kolbo-api/src/config/systemPrompt.js (lines ~1259–1371).
     When that function changes, update this file in the same session. -->

# Music — Prompt Rules (Suno-led)

Load this file when the user wants AI-generated **music** — full songs, lyrics, instrumentals, jingles, scores, soundtracks, lo-fi beats, trailers, ad music. Primarily Suno; the same craft applies to other music models. For TTS / voice cloning see `models/prompt-copilot.md`. For sound effects see `generate_sound` (SKILL.md tool table).

**Kolbo MCP routing:** call `generate_music`. Suno is a model option — use `list_models({ type: "music_gen" })` to see versions. Pass `instrumental` and `duration` as separate params; pass the Style/Description text as `style` and the Lyrics as `lyrics`.

**`prompt` is REQUIRED on every Suno call, instrumental included.** Sending only `style` (+ `instrumental: true`) is rejected with `prompt is required (or pass composition_plan for ElevenLabs Music v2.5)`, even though the tool schema does not mark `prompt` as required. Measured 2026-10-21: 5 parallel instrumental calls were all rejected, with nothing charged, then succeeded when re-sent. Put a one-sentence description of the track in `prompt` and the comma-separated descriptors in `style`.

**Parallel calls: map results by `generation_id`, never by file name.** Without a `session_id`, parallel `generate_music` calls can land in one shared session (the API's daily session per project). On 2026-10-21 that also gave the files ANOTHER call's title ("House Lofi 02" and "04" saved as `House-Lofi-01-Warm-C-…mp3`); that naming bug is fixed, and each file now carries its own call's title. The session sharing is not: read each id's `urls` from `get_generation_status`, name local files yourself, and pass a `session_id` when the set must stay together.

**Wants an EXISTING track, not a new song?** ("background music", "stock music", "royalty-free track") → don't generate. Use `search_stock_media` with `mediaType: "music"` (semantic vibe query — "tense cinematic pulse", "uplifting corporate background") → `get_stock_asset` for download URLs. Free, no credits. The older `*_music_library` tools are deprecated adapters over the stock library — prefer the stock tools.

## CRITICAL Kolbo Platform Rules

- **Model version, duration, and instrumental toggle are MCP-tool params.** Don't write `v4.5`, `30 seconds`, or `instrumental: true` inside the prompt fields themselves.
- **Suno v6 is the current family**: `suno-v6` (the default music model), `suno-v6-mini`, `suno-v6-wild` — all **15 credits**. `suno-v5.5` / `suno-v5` / `suno-v4.5plus` are hidden (discontinued upstream); do not offer them.
- **Exact track length = `duration_seconds`** (clamped 5–300s on the tool). **Suno is length-controllable as of v6** — 10 seconds to 6 minutes, slider or an exact typed `m:ss`. **Auto is the default**, and on Auto Suno picks its own natural length exactly as it always did, so only pass a length when the user actually asked for one.
  - **Custom Mode only.** The provider returns a 422 if a duration arrives in Simple Mode, so length only lands alongside lyrics — the SDK/MCP path switches the request into Custom Mode automatically when `duration_seconds` is present.
  - **`suno-v6-mini` does NOT honour length.** Measured, not assumed: 20s / 30s / 60s requests all came back ~200–220s. Never promise length control on Mini. `suno-v6` and `suno-v6-wild` honour it.
  - Non-Suno length-controllable models (ElevenLabs Music, `music-v1`) still default to a ~10s track without it, so ALWAYS pass it there for jingles/beds.
- **Short lengths are style-dependent — write a sparse prompt when you need a short clip.** Suno resolves a musical phrase before it stops: a sparse ambient prompt asked for 13s returns ~13s, a dense rock prompt asked for the same 13s returns ~42s. They converge by about 30s. For a genuinely short cue, thin the instrumentation in the `style` field instead of fighting the number.
- **Suno usually returns TWO tracks, and does not always apply the requested length to both** — one can land on target while the other runs long. Check each track before delivering; the first track's length is not authoritative.
- Suno generations have **two separate input fields**: a **Style / Description** field (`style` param) and a **Lyrics** field (`lyrics` param). Output your prompt as **TWO separate fenced code blocks** so the user (and the tool call) know exactly what goes where.
- Tell the user to run the prompt multiple times — Suno output varies significantly between generations, that's a feature. Use `num_generations` if the tool supports it, or fire 2–4 parallel `generate_music` calls.

## Suno V6 extras on `generate_music`

- `variety` (whole number 0–4, higher = more varied takes) and `persona_voice_id` (an id from `list_music_personas`, sings in that saved voice) switch the request to Custom Mode. `persona_voice_id` does not mix with `singing_dna_id` / `singing_voice_id`.
- `reference_images` (≤5) / `reference_videos` (1, ≤241 s) / `reference_audios` (6 s–30 min) inspire the song from PUBLIC URLs (upload local files first). They switch to Simple Mode: `duration_seconds` is not honoured, and they cannot be combined with `variety` or `persona_voice_id`. At most 10 references in total, style and lyrics counting one each.
- Every result lists `tracks[]` with `audio_id` — keep it with the `generation_id`; every track operation below needs both.

## Suno track operations (work on a finished Kolbo track)

Each creates a NEW generation (the source is untouched), runs in the source track's session, and is priced on its own. Quote the price and get approval like any paid call. Async ones return a `generation_id`; poll it like any generation.

| Want | Tool | Credits | Notes |
|---|---|---|---|
| Sing over an instrumental / stem | `add_vocals` | 12 | Source = `generation_id` + `audio_id`, or own audio (`audio_url` + `rights_confirmed`, or an `upload_id` from `import_music_audio`). `style` = the vocal style. |
| Backing track under a vocal / a cappella | `add_instrumental` | 12 | Same sources. `tags` = accompaniment style. |
| Rewrite one part ("new second verse") | `replace_music_section` | 5 | `start`/`end` seconds: window ≥10 s and ≤50% of the track. Give `prompt` or `lyrics`. ElevenLabs tracks use `edit_music_section` instead. |
| Make it longer | `extend_music` | 15 | Continues from the end or `continue_at`. |
| Lossless file for mixing | `export_music_wav` | 1 | Returns `wav_url`; a repeat for the same track is free. |
| Visualizer video (cover art + waveform) | `make_music_video` | 5 | One video per track; a repeat returns the existing one. Optional `author` / `domain_name` overlay. |
| MIDI notes | `generate_music_midi` | 2 | Source must be a finished Suno 2- or 12-stem separation made in the Kolbo music tool (2 stems = 10 cr). `separate_audio_stems` results do NOT qualify. Returns `midi_data` (notes, not a .mid file). |
| Karaoke / word timings | `get_timed_lyrics` | 1 | Synchronous. Paid once per track, cached and free after. Instrumentals return `instrumental: true`. |
| Reuse a voice and style | `create_music_persona` → `list_music_personas` | 0 | Optional `vocal_start`/`vocal_end` (10–30 s window where the voice is clear). Then `generate_music` with `persona_voice_id`. |

## How Music Prompting Actually Works

Suno responds to **descriptive, layered prompts**, not vague ones.
- ❌ "make a pop song"
- ⚠️ "upbeat dance-pop, female vocals, glossy production, catchy chorus, summer vibe"
- ✅ "Dance-pop track, bright analog synths, female lead vocal with airy harmonies, catchy four-on-the-floor hook, 120 BPM, summer road-trip energy"

The formula: **Genre + Mood + Instrumentation + Vocal style + Tempo/BPM + Scene/era anchor**

## The Style / Description Field (`style`)

Pack these into one comma-separated descriptor line (no labels, no quotes around the whole thing — Suno reads it as a style descriptor):
- **Genre / sub-genre** — `synthwave`, `neo-soul`, `bedroom indie pop`, `drill`, `baroque trap`, `cinematic orchestral trailer`
- **Mood** — `melancholic`, `euphoric`, `tense`, `hopeful`, `hypnotic`, `nostalgic`
- **Instrumentation** — `bright analog synths`, `fingerpicked nylon guitar`, `808 sub bass`, `brushed snare`, `Rhodes electric piano`, `strings + harpsichord`, `muted brass section`
- **Vocal style** — `female lead with airy harmonies`, `whispered male falsetto`, `autotuned melodic rap`, `gospel choir backing`, `spoken-word female narrator`, `no vocals` (for instrumental)
- **Tempo / BPM** — `120 BPM`, `slow tempo 70 BPM`, `uptempo 140 BPM`
- **Era / production cue** — `80s analog warmth`, `modern polished pop production`, `lo-fi cassette tape feel`, `live-room reverb`, `bedroom production`
- **Scene anchor (optional but powerful)** — `late night highway drive`, `80s prom night`, `rainy city rooftop`, `Tokyo bullet train`

**Style cap**: keep this field to roughly **8–15 descriptors**. More starts to muddy the output.

## The Lyrics Field (`lyrics`)

Use Suno's section tags to control structure. Each tag goes on its own line, content under it:
- `[Intro]`
- `[Verse]` / `[Verse 1]` / `[Verse 2]`
- `[Pre-Chorus]`
- `[Chorus]`
- `[Bridge]`
- `[Outro]`
- `[Instrumental]` / `[Solo]`

**Production tags** (inline, in brackets — Suno follows them):
- `[Bass drop]`, `[Beat switch]`, `[Tempo change]`
- `[Whisper vocals]`, `[Falsetto]`, `[Spoken word]`, `[Gospel choir]`
- `[Flute solo]`, `[Guitar riff]`, `[808 drop]`
- `[Stop]`, `[Build up]`, `[Breakdown]`
- `- crowd noise -`, `- record scratch -` (SFX in dashes)

**Emphasis**: ALL CAPS amplifies intensity / emotion on that word or line. Use sparingly for impact moments.

**Structure templates**:
- Pop / radio: Intro → Verse → Chorus → Verse → Chorus → Bridge → Chorus → Outro
- Hip-hop: Intro → Verse → Hook → Verse → Hook → Bridge → Hook → Outro
- Cinematic / score: Intro (build) → Theme A → Theme B → Climax → Resolution
- Lo-fi / chill: Intro → Loop A → Loop B → Loop A → Outro (often no vocals)

## Power Moves

- **Mix unexpected genres** — `country + EDM`, `folk + ambient synths`, `classical + trap drums`, `baroque + 808s`. Best outputs often come from contrast.
- **Scene-based language beats sound-only language** — `late-night highway drive` does more work than `atmospheric`.
- **Tags shape structure better than prose** — don't write "then there's a chorus", write `[Chorus]`.
- **No real artist names** — Suno blocks them. Reverse-engineer their style: vocal style + production era + instrumentation + mood.
- **Lean into imperfection** — Suno's quirks often produce the best moments. Don't over-correct.
- **Generate multiple times** — same prompt produces wildly different songs. Tell the user to run 3–4 takes.

## Workflow by Use Case

### Full song with vocals
- `style`: full descriptor stack
- `lyrics`: tagged structure with lyric content
- Recommend: 2–3 generations to compare

### Instrumental / score / lo-fi beat
- `style`: descriptor stack + `instrumental`, `no vocals`
- `lyrics`: structure tags only (`[Intro]`, `[Theme A]`, `[Build]`, `[Drop]`), no lyric lines. Or leave empty and pass `instrumental: true` to the tool.

### Jingle / ad music (15–30s)
- `style`: short, punchy descriptor (`upbeat retail pop jingle, female vocal, claps, glossy production, summer energy`)
- `lyrics`: 2–4 short lines max, often just chorus
- Pass the exact `duration_seconds` (e.g. `15` or `30`). Suno v6 / v6 Wild honour it in Custom Mode (supply `lyrics`), ElevenLabs Music honours it either way, `suno-v6-mini` does not. Keep the style sparse — a dense arrangement overruns a short target.

### Cinematic trailer / score
- `style`: `cinematic orchestral trailer, swelling strings, taiko drums, hybrid choir, dramatic build, modern hybrid score`
- `lyrics`: structure tags only — `[Intro]` `[Build]` `[Drop]` `[Climax]` `[Resolution]`
- `instrumental: true`

## Output Discipline

Always output **two fenced code blocks**, clearly labeled (these map directly to `style` and `lyrics` MCP params):

```
STYLE / DESCRIPTION:
<style descriptors, comma-separated, one line>
```

```
LYRICS:
[Intro]
...
[Verse]
...
[Chorus]
...
```

When summarizing to the user, state separately:
- **Instrumental:** yes / no (the `instrumental` param)
- **Length:** Auto, or the exact `duration_seconds` you passed (10s–6min; Suno needs Custom Mode, and `suno-v6-mini` ignores it)
- **Run takes:** N generations (usually 2–4) — fire them in parallel
- **Why this works:** 1 line on the key genre / structure / instrumentation choice

If the user is in any language other than English, explanations in their language; lyric language matches what the user wants (any language works in Suno).
