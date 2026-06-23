# Music Library (stock / production music)

The music library is Kolbo's catalog of **licensed, ready-made background tracks**. Use it to score a video, ad, or voiceover with an existing track.

> **Library vs generation.** `search_music_library` finds an existing track. `generate_music` composes a brand-new song with Suno. If the user wants "a track for my ad", reach for the library first — it's free (no credits) and instant. Use `generate_music` only when they want something original/custom.

## Tools

| Tool | Use |
|------|-----|
| `search_music_library` | Keyword search + filters (genre, mood, bpm, duration, has_stems, has_lyrics) + sort. Returns tracks with id, title, artist, duration, BPM, key, genres, moods, preview URL. |
| `analyze_script_for_music` | Turn a script/scene description into `{ query, mood, genre, keywords }`. |
| `browse_music_library` | Paginated browse with no query. |
| `get_music_library_facets` | Valid genres, moods, instruments + BPM/duration ranges. |
| `get_music_track_audio` | A track's downloadable 128 / 320 / WAV URLs. |
| `get_music_track_related` | Stems + alternate versions of a master track. |
| `get_music_track_lyrics` | Lyrics text, theme, explicit flag. |

All tools are **free** (no credits) and read-only.

## Typical flow

1. **From a script** → call `analyze_script_for_music` to derive `query` / `mood` / `genre`.
2. **Search** → `search_music_library` with that query (+ optional filters). Show the user the top matches by title + vibe; include the `preview` URL so they can listen.
3. **Pick** → once the user chooses, call `get_music_track_audio` with the track `id` to get the final downloadable URLs (offer WAV for editing, 320 for delivery).
4. Optionally `get_music_track_related` for an instrumental/stems cut, or `get_music_track_lyrics` if it's a vocal track.

## Tips

- Don't dump every field — surface title, artist, duration, BPM, mood, and the preview link.
- If a filtered search returns nothing, call `get_music_library_facets` to use exact valid genre/mood values, then retry.
- `sort` options: `duration-asc`, `duration-desc`, `bpm-asc`, `bpm-desc`, `title`. Omit for relevance order.
