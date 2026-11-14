# Voice / Text-to-Speech (`generate_speech`) — full style & option reference


**Hebrew voices (founder, 2026-11-02, HARD):** Cartesia Hebrew voices (`cartesia_sonic_3_5`, `he-IL`) are the default: the most natural Hebrew. ElevenLabs V3/V4 (`eleven_v3` / `eleven_v4`) when the delivery needs directing (tags, emotion). Gemini voices are also good. DeepDub is no longer a pick for Hebrew; its controls below stay for other languages and existing projects only. `eleven_multilingual_v2` fails on Hebrew.

`generate_speech` turns text into spoken audio. Every voice belongs to a
**provider** (ElevenLabs, DeepDub, MiniMax, Google/Gemini, OpenAI, Zonos). Each
provider exposes its own expressive controls. You may pass any control on any
call — **the engine silently ignores controls that don't apply to the chosen
voice's provider**, so you never need to branch on provider yourself.

## Pick the voice first
Call `list_voices` (filter by `provider`, `language`, `gender`) and pass the
returned `voice_id` — or a display name like `"Rachel"`. Cloned/custom voices
resolve by name too. The voice determines the provider, which determines which
controls below take effect.

## Core params (all providers)
| Param | Type | Notes |
|---|---|---|
| `text` | string (required) | The words to speak. |
| `voice` | string | Voice id or display name. Default `"Rachel"`. |
| `model` | string | From `list_models type="text_to_speech"`. Default `eleven_v4`. Usually inferred from the voice — only needed to force a specific engine. |
| `turbo` | bool | ElevenLabs V4 voices only: faster, **half the credits**, slightly less expressive. Rejected (`TURBO_UNSUPPORTED`) for any other voice, including clones made before V4. `model: "eleven_v4_turbo"` is accepted as an alias. |
| `language` | string | BCP-47 code, e.g. `"en-US"`, `"he-IL"`, `"es-ES"`. |
| `speaking_speed` | number | `0.5` (slow) – `2.0` (fast). Default `1.0`. Applies to ElevenLabs / OpenAI / Google. |
| `project_id` | string | Scope into a project (see Projects rules). |

## Expressive style / emotion (provider-specific)
| Param | Provider(s) | Values / notes |
|---|---|---|
| `style_instructions` | **Google / Gemini** | Free-form natural-language direction, e.g. `"whisper conspiratorially, slightly amused"`, `"excited sports announcer"`. Max 500 chars. |
| `selected_style` | **DeepDub**, MiniMax | Preset style. DeepDub: `reading`, `conversational`, `angry`, `breathy`, `panic`, `amused`, `sad`, `whisper`, `singing`, `shout`, `scream`, `mumbling`, `excited`. |
| `emotion` | **MiniMax** | `happy`, `sad`, `angry`, `fearful`, `disgusted`, `surprised`, `calm`, `fluent`, `whisper`. |

## ElevenLabs voice settings
| Param | Range | Default | Effect |
|---|---|---|---|
| `similarity_boost` | 0–1 | 0.75 | Higher hews closer to the source voice. |
| `style` | 0–1 | 0.5 | Style exaggeration (V2/V3 only — V4 ignores it). |
| `use_speaker_boost` | bool | true | Speaker-clarity boost (V2/V3 only). |

## ElevenLabs V4 (default since 2026-10-01)
Every stock ElevenLabs voice and every clone/character voice created from 2026-10-01
runs on **Eleven v4**; older clones stay on v3 until migrated. V4 takes up to
10,000 characters, 90+ languages including Hebrew, and is the most faithful cloner.
When a clone speaks a language other than its source recording, V4 speaks it with a
native accent (deliberate ElevenLabs behaviour, not a bug).

Direct V4 with **inline audio tags in `text`** — always English, even inside Hebrew:
- Emotion/delivery: `[excited]` `[sarcastic]` `[nervously]` `[whispers]` `[shouting]` `[softly]` `[deadpan]`
- Reactions: `[laughs]` `[chuckles]` `[sighs]` `[clears throat]` `[inhales deeply]`
- Pacing: `[pause]` `[short pause]` `[long pause]`, ellipses (`...`), CAPS for emphasis
- Free-form direction (V4 follows these best): `[Low, steady voice, restrained urgency]`
- **SSML (`<break time=…/>`) is ignored** — use the pause tags instead.
- Tags must describe the VOICE. V4 also renders sound effects, so a tag that reads like a sound cue (`[door slams]`) becomes one.

## DeepDub controls
| Param | Range | Default | Effect |
|---|---|---|---|
| `variance` | 0–1 | 0.2 | More variation / takes. |
| `tempo` | 0–2 | 1.0 | Pacing multiplier. |
| `promptBoost` | bool | true | Higher fidelity to the text. |
| `seed` | int | — | Reproducibility (same seed + inputs → same output). Also honored by Zonos. |
| `accentControl` | object | — | `{ accentBaseLocale, accentLocale, accentRatio }` — blend an accent. Provide BOTH `accentBaseLocale` (e.g. `"en-US"`) and `accentLocale` (e.g. `"en-GB"`); `accentRatio` 0–1 (default 0.5). |
| `voiceTitle` | string | — | Display title for a custom/cloned voice. |

## MiniMax fine controls
| Param | Range | Default | Effect |
|---|---|---|---|
| `minimax_pitch` | −12 … 12 | 0 | Pitch shift. |
| `minimax_vol` | 0–10 | 1 | Volume. |
| `minimax_intensity` | — | — | Voice intensity. |
| `minimax_timbre` | — | — | Voice timbre. |

## Examples
Neutral ElevenLabs read:
```
generate_speech(text="Welcome to Kolbo.", voice="Rachel")
```
Whispered, conspiratorial Gemini delivery:
```
generate_speech(text="Meet me at midnight.", voice="Kore",
                style_instructions="whisper conspiratorially, slow and breathy")
```
Angry DeepDub take, faster:
```
generate_speech(text="Get out of my house!", voice="<deepdub voice>",
                selected_style="angry", tempo=1.2)
```
Excited MiniMax with pitch/volume tweaks:
```
generate_speech(text="We won the championship!", voice="<minimax voice>",
                emotion="happy", minimax_pitch=3, minimax_vol=6)
```
British-accented DeepDub blend:
```
generate_speech(text="Good evening.", voice="<deepdub voice>",
                accentControl={ accentBaseLocale: "en-US", accentLocale: "en-GB", accentRatio: 0.7 })
```

## Credits
~5 credits per 100 characters for most TTS models (Zonos ~3; voice design/clone
~30 flat). Charged only on success. Use `check_credits` once per conversation.


# Eleven v3 performance direction audit

Verified 2026-09-26. Applies to multilingual dubbing and Eleven v3 speech (V4 accepts the same tags — see the V4 section above). Tags are natural-language performance cues, not a published exhaustive API enum. Provider acceptance does not prove that a cue was performed.




| Family | Official examples | Product treatment |
| --- | --- | --- |
| Emotion | angry, sad, happily, sorrowful, excited, curious, worried, annoyed | Choose only the scene's emotion |
| Delivery | shouts, shouting, whispers, whispering, softly, booming | Separate from emotion; no contradictory loud/quiet cues |
| Pace | rushed, slowly, drawn out, slows down, deliberate, rapid-fire | Optional; measure actual duration afterward |
| Character style | dramatic, sarcastically, matter-of-fact, whiny | Audition before extending the product vocabulary |
| Reactions | laughs, sighs, gasps, clears throat, crying | Can add audible events; exclude from exact-dialogue defaults |
| Timing and emphasis | pause, breathes, emphasized, stress on next word | Not sample-accurate timing; unsuitable as a replacement for alignment |
| Accent/persona | French accent, pirate voice | Excluded from automatic dubbing to preserve locale and character |
| Effects | gunshot, explosion, clapping | Keep separate from dialogue stems |

Sources: [Audio Tags 101](https://elevenlabs.io/blog/v3-audiotags), [character performance](https://elevenlabs.io/blog/eleven-v3-character-direction), [delivery control](https://elevenlabs.io/blog/eleven-v3-audio-tags-precision-delivery-control-for-ai-speech).

## Direction rules

1. Listen to source acting and retain user intent. A facial expression alone cannot establish vocal intensity.
2. Choose emotion, delivery and optionally pace independently. `[angry] [shouts]` targets angry projection; `[angry]` can remain quiet. Do not apply shouting to every angry character.
3. Keep canonical dialogue immutable. Tags live in a separate field. Preserve speaker bindings, language and locale. Hebrew uses minimal disambiguating niqqud, not phonetic respelling or full pointing.
4. Design voices capable of the intended range. Do not force every voice to be calm/conversational. A clean recording is compatible with strong projection.
5. Natural stability 0.5 remains the default. Creative 0 is used for the user-approved screaming delivery; other cues retain the configured default. It increases variation and is not a universal quality improvement. Robust 1 is less responsive to direction. Do not raise volume and call it screaming.
6. Compare raw takes before EQ, mixing or time stretching. Check words, pronunciation, intensity, artifacts and measured timing separately. ASR correctness does not prove good acting.
7. `[screaming]` was accepted by the user for the Hebrew scream audition and is now available for true screaming, with Creative stability 0. It remains an empirically tested cue, not a guarantee across voices or languages. Ordinary anger and raised speech should use other cues.
8. Generate only authorized variants. Persist requests and receipts; never automatically retry uncertain paid calls. Tags do not guarantee exact duration or frame-accurate synchronization.

[Voice choice, stability and v3 limitations](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices). The API accepts tags in `text`; `seed` offers best-effort reproducibility only. [API reference](https://elevenlabs.io/docs/api-reference/text-to-speech/convert).

