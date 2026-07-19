# Voice / Text-to-Speech (`generate_speech`) — full style & option reference

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
| `model` | string | From `list_models type="text_to_speech"`. Default `eleven_v3`. Usually inferred from the voice — only needed to force a specific engine. |
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
| `style` | 0–1 | 0.5 | Style exaggeration — higher is more expressive/dramatic. |
| `use_speaker_boost` | bool | true | Speaker-clarity boost. |

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
