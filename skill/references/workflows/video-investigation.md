---
name: video-investigation
description: Investigate recordings through adaptive contact sheets, individual frames, cut candidates, transcription, music and sound evidence.
---

# Adaptive video investigation

Use for understanding content, finding events, reviewing edits, comparing continuity,
extracting quotes, or studying motion, music and sound. Choose evidence for the question.

1. Define what would answer the request. Inspect duration and streams with
   `prepare_video_inspection`, then `get_video_inspection`. Preparation is asynchronous;
   wait before polling again. Reuse the inspection ID, never repeatedly download.
2. Build a broad visual map with `inspect_video` kind `frames`. Start with 12 sparse
   frames across the recording, then use additional ranges when the question requires
   coverage. Read the returned IMAGE blocks. Write hypotheses, uncertainty and source
   timestamps. A sheet is a navigation aid, not continuous viewing.
3. Narrow promising or ambiguous intervals. Sample more densely, then request kind
   `frame` with exactly one timestamp for details. Use kind `cuts` in windows up to
   120 seconds when transitions matter. Cuts are candidates from an 8 fps proxy;
   verify nearby full frames. Sparse sampling can miss brief actions or cuts.
4. For motion, continuity, text over time or audiovisual alignment, extract kind
   `clip` and call `analyze_video_evidence` focus `video` with a specific question.
   The interval alone is analyzed. Keep original source offset and clip-relative
   timestamps separate. Convert returned times by adding source_offset_seconds.
5. For speech, extract kind `audio`, then `transcribe_video_evidence` for word timings,
   speakers and SRT. Source times are supplied on every word; SRT remains clip-relative.
   Verify unclear words before quoting. To cover all speech in a long recording, use
   explicit consecutive windows with slight overlap, merge by source times and
   deduplicate overlap. Do not silently transcribe hours when only one event is needed.
6. For music or sound design, use kind `audio_levels` for measured levels/quiet times,
   then audio evidence plus `analyze_video_evidence` focus `music` or `sound` for
   instrumentation, rhythm, mood, sound effects, ambience and speech overlap. Volume
   measurements do not establish genre, exact BPM, song identity or artist. Request
   stems only if source separation helps the user's task and spending is authorized.
7. Revise hypotheses when evidence contradicts them. Stop when the question is answered
   with sufficient evidence. Save findings in project notes: source_version, inspection
   ID, question, observed timestamps/ranges, evidence IDs, transcript excerpts, remaining
   uncertainty and sampled versus continuously analyzed coverage. Generated evidence
   is not automatically a verified observation. Preserve the distinction after compaction.

Free CPU tools: preparation, status, frames, cut candidates, audio/clip extraction and
level measurements. Paid tools: evidence analysis and transcription. Follow Act's
existing plan/spend gate. Each paid evidence call is an explicit step; identical
successful calls reuse receipts. Do not retry a paid call reported as uncertain.
For transcription plans set model `elevenlabs/scribe-v2-srt` and duration equal to the
extracted interval; estimates round up to minutes. Model understanding bills usage.

Limits: source 2 GB and 24 hours, source snapshot two hours, two snapshots per user,
four per host, 12 frames per call, 120 seconds per decoded interval, 60 evidence
requests and 100 MB derivatives per snapshot. A three-hour recording is supported
within the source byte limit; many original high-bitrate recordings require a proxy
created/uploaded through the approved media workflow. Never download via an unrestricted
shell URL or run a full-length decode on the Act host. A one-off short source or
YouTube page can still use `analyze_video`; do not claim that route proves full coverage.
Cancel unused snapshots with `cancel_video_inspection`. Preparation and extraction
stop; a provider request already accepted can still finish and incur credits.

Example: a 3-hour recording with a missing graphic. Start sparse, discover candidate
chapter ranges, inspect those more densely, read individual frames where the graphic
appears, then verify appearance/disappearance with nearby clip evidence. Analyze audio
only if needed. Report verified windows and any unexamined gaps; do not say you watched
all three hours. The same reasoning applies to lectures, screen recordings, podcasts,
films, generated clips and event footage.
