'use strict';

/**
 * Kolbo Liquid Glass design system for MCP App widgets.
 * Tokens extracted from kolbo-map (tailwind.config + index.css + liquid-glass.css):
 * dark bg #0F0F0F, card #262626/90 + blur, brand #3b82f6, text #F5F5F2, Inter,
 * specular top-edge highlight, spring easing cubic-bezier(.34,1.56,.64,1),
 * skeleton-sweep shimmer, liquid-press buttons.
 */

const KOLBO_CSS = `
:root {
  --bg: #0f0f0f;
  /* A translucent lift, not a fixed colour: every host paints its own dark grey
     behind the iframe (claude.ai, ChatGPT, Codex, Kolbo Code all differ), and a
     fixed near-black card read as a hole cut into the chat. */
  --card: rgba(255, 255, 255, 0.04);
  --card-solid: #161619;
  --panel: rgba(255, 255, 255, 0.035);
  --surface: rgba(255, 255, 255, 0.03);
  --surface-2: rgba(255, 255, 255, 0.06);
  --border: rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.14);
  --text: #f5f5f2;
  --text-muted: rgba(245, 245, 242, 0.62);
  --text-faint: rgba(245, 245, 242, 0.40);
  --brand: #3b82f6;
  --brand-soft: rgba(59, 130, 246, 0.16);
  --success: #22c55e;
  --error: #ef4444;
  --warning: #f59e0b;
  --radius-card: 24px;
  --radius-btn: 10px;
  --spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --smooth: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  --specular: inset 0 1px 0 rgba(255, 255, 255, 0.18);
  /* "light dark" on the ROOT, never a fixed scheme. When an iframe's root
     scheme differs from the host frame's, the browser paints an OPAQUE canvas
     behind the page: a fixed "dark" here drew a dark square around every card
     in hosts whose frame is light/normal (Codex). "light dark" adopts the host
     frame's scheme, so the canvas stays transparent everywhere. The card
     carries the real theme for its native controls below. */
  color-scheme: light dark;
}
[data-theme="light"] {
  --bg: #f5f5f2;
  --card: rgba(255, 255, 255, 0.85);
  --card-solid: #ffffff;
  --panel: rgba(0, 0, 0, 0.035);
  --surface: rgba(0, 0, 0, 0.02);
  --surface-2: rgba(0, 0, 0, 0.04);
  --border: rgba(0, 0, 0, 0.08);
  --border-strong: rgba(0, 0, 0, 0.14);
  --text: #0a0a0c;
  --text-muted: rgba(10, 10, 12, 0.62);
  --text-faint: rgba(10, 10, 12, 0.40);
  --brand-soft: rgba(59, 130, 246, 0.10);
  --specular: inset 0 1px 0 rgba(255, 255, 255, 0.65);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: transparent; }
.k-card { color-scheme: dark; }
[data-theme="light"] .k-card { color-scheme: light; }
body {
  font-family: 'Poppins', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
  color: var(--text);
  font-size: 13px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

/* ---- Card shell ---- */
.k-card {
  position: relative;
  background: var(--card);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  /* No drop shadow: on a dark host it only adds a muddy halo. */
  box-shadow: var(--specular);
  overflow: hidden;
  animation: k-in 400ms var(--spring);
}
@keyframes k-in { from { opacity: 0; transform: translateY(6px) scale(0.985); } to { opacity: 1; transform: none; } }

.k-head {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 14px 10px;
}
/* The mark sits at the far right and the card is named by what it shows:
   the brand word next to the title was chrome, not information. */
.k-logo { order: 99; margin-left: auto; display: flex; align-items: center; cursor: pointer; opacity: 0.9; }
.k-logo:hover { opacity: 1; }
.k-logo > span { display: none; }
.k-logo svg { display: block; }
.k-head .k-title { color: var(--text); font-size: 13px; font-weight: 650; letter-spacing: -0.01em; }
.k-head .k-spacer { flex: 1; }

.k-body { padding: 0 12px 12px; }
.k-prompt { color: var(--text-muted); font-size: 12px; margin: 0 2px 2px; word-break: break-word;
  display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;
  user-select: text; -webkit-user-select: text; cursor: text; }
.k-prompt.expanded { -webkit-line-clamp: unset; white-space: pre-wrap; }
.k-text-tools { display: flex; gap: 2px; justify-content: flex-end; margin: -2px 0 6px; }
/* The prompt's Copy / Expand sit on the prompt's own line, not a row of their own. */
#prompt { padding-right: 132px; }
#prompt + .k-text-tools { margin: -24px 0 8px; }
.k-text-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 8px; border: 0; border-radius: 8px;
  background: transparent; color: var(--text-faint);
  font-size: 11px; font-weight: 600; font-family: inherit;
  cursor: pointer;
}
.k-text-btn:hover { color: var(--text); background: var(--surface-2); }
.k-text-btn svg { width: 12px; height: 12px; }
/* @VisualDNA / #Moodboard mentions are load-bearing prompt syntax, not prose —
   the server resolves them to the actual asset. Mark them so a glance at the
   prompt shows which references it pulls in. */
.k-mention {
  display: inline; padding: 1px 5px; border-radius: 8px;
  background: var(--brand-soft); color: var(--brand);
  font-size: 0.94em; font-weight: 500;
}
/* Single-line media caption (scene / batch prompt under the viewer) */
.k-caption { font-size: 11px; color: var(--text-faint); margin: 2px 2px 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  user-select: text; -webkit-user-select: text; cursor: text; }
.k-caption.expanded { white-space: normal; word-break: break-word; }
.k-caption + .k-text-tools { margin: 0 2px 6px; justify-content: flex-start; }

/* ---- Chips ---- */
.k-chips { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin: 0 0 10px; }
.k-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 8px; border-radius: 999px;
  background: var(--surface-2); border: 0;
  font-size: 12px; font-weight: 500; color: var(--text-muted);
  white-space: nowrap;
  /* UI font, not a code font: tags are labels people read ("7 images",
     "Seedance 2.5"), and monospace made the whole row look like a log line. */
  font-variant-numeric: tabular-nums;
  animation: k-chip-in 200ms var(--spring);
}
@keyframes k-chip-in { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: none; } }
.k-chip.brand { background: var(--brand-soft); color: var(--brand); }
.k-chip img { width: 14px; height: 14px; border-radius: 8px; object-fit: cover; }
.k-chip .k-mono-icon {
  width: 14px; height: 14px; border-radius: 8px; background: var(--brand);
  color: #fff; font-size: 11px; font-weight: 700; display: inline-flex;
  align-items: center; justify-content: center; font-family: inherit;
}
.k-chip img.k-voice-thumb { width: 18px; height: 18px; border-radius: 999px; margin-left: -3px; }
.k-ref-thumb { width: 26px; height: 26px; border-radius: 8px; object-fit: cover; border: 1px solid var(--border-strong); }
.k-input-section { flex-basis: 100%; min-width: 0; margin-top: 6px; }
.k-input-label { display: block; color: var(--muted); font-size: 11px; margin-bottom: 6px; }
.k-input-media { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.k-input-media .k-ref-thumb { width: 40px; height: 40px; object-fit: contain; background: var(--panel); }
.k-ref-audio { display: flex; flex-direction: column; gap: 6px; max-width: 100%; font-size: 11px; }
.k-ref-audio audio { width: 240px; max-width: 100%; height: 32px; }
.k-template { display: flex; align-items: center; gap: 12px; font-size: 12px; }
.k-template-thumb, .k-template-placeholder { width: 104px; height: 80px; border-radius: 8px; object-fit: contain; background: var(--panel); border: 1px solid var(--border-strong); }
.k-template-placeholder { display: flex; align-items: center; justify-content: center; color: var(--muted); }
.k-peek-hit { cursor: zoom-in; }
.k-peek {
  position: absolute; inset: 0; z-index: 20;
  display: flex; flex-direction: column;
  background: #0b0b0d;
}
.k-peek[hidden] { display: none !important; }
/* An inline lightbox needs room: a short card (one list row, a 3-tile grid)
   used to clip the media to a sliver. The card grows while it is open and
   notifySize() asks the host for the height. */
html.k-peek-open .k-card { min-height: 460px; }
.k-peek-bar { flex: none; display: flex; align-items: center; gap: 8px; padding: 8px 8px 8px 14px; min-height: 44px; }
.k-peek-cap { flex: 1; min-width: 0; font-size: 12px; color: rgba(255,255,255,0.78);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.k-peek-count { flex: none; font-size: 12px; color: rgba(255,255,255,0.55); font-variant-numeric: tabular-nums; }
.k-peek-btn {
  flex: none; width: 32px; height: 32px; border: 1px solid rgba(255,255,255,0.14); border-radius: 999px;
  background: rgba(255,255,255,0.08); color: #fff; cursor: pointer; font-size: 15px;
  display: inline-flex; align-items: center; justify-content: center;
}
.k-peek-btn:hover { background: var(--brand); border-color: var(--brand); }
/* min-height:0 + max 100% on BOTH axes: the media is contained in whatever box
   the lightbox has, never cropped and never overflowing it. */
.k-peek-stage { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 0 12px 12px; }
.k-peek-stage img, .k-peek-stage video {
  display: none; max-width: 100%; max-height: 100%; width: auto; height: auto;
  object-fit: contain; border-radius: 8px; background: #000;
}
.k-peek-stage img[src], .k-peek-stage video[src] { display: block; }
.k-peek-stage video[src] { width: 100%; height: 100%; }
.k-peek-nav {
  position: absolute; top: 50%; transform: translateY(-50%); z-index: 2;
  width: 40px; height: 40px; border: 1px solid rgba(255,255,255,0.14); border-radius: 999px;
  background: rgba(0,0,0,0.55); color: #fff; cursor: pointer; font-size: 20px;
  display: inline-flex; align-items: center; justify-content: center;
}
.k-peek-nav[hidden] { display: none; }
.k-peek-strip { flex: none; display: flex; gap: 6px; padding: 0 12px 12px;
  overflow-x: auto; scrollbar-width: none; }
.k-peek-strip > :first-child { margin-left: auto; }
.k-peek-strip > :last-child { margin-right: auto; }
.k-peek-strip[hidden] { display: none; }
.k-peek-strip::-webkit-scrollbar { display: none; }
.k-peek-thumb { flex: none; width: 44px; height: 44px; padding: 0; border-radius: 8px; overflow: hidden; cursor: pointer;
  border: 2px solid transparent; background: #1c1c20; color: #fff; opacity: 0.55;
  display: inline-flex; align-items: center; justify-content: center;
  transition: opacity 150ms var(--smooth), border-color 150ms var(--smooth); }
.k-peek-thumb:hover { opacity: 0.9; }
.k-peek-thumb.on { border-color: var(--brand); opacity: 1; }
.k-peek-thumb img, .k-peek-thumb video { width: 100%; height: 100%; object-fit: cover; display: block; pointer-events: none; }
.k-peek-nav:hover { background: var(--brand); border-color: var(--brand); }
.k-peek-nav.prev { left: 10px; }
.k-peek-nav.next { right: 10px; }
/* Host granted fullscreen: the lightbox owns the whole viewport, not the card. */
html.k-peek-fs, html.k-peek-fs body { height: 100%; overflow: hidden; }
html.k-peek-fs .k-peek { position: fixed; inset: 0; z-index: 50; }
/* backdrop-filter (and any transform) makes the card the containing block for
   position:fixed descendants, so a GRANTED fullscreen still showed the lightbox
   card-sized. Drop them while the lightbox owns the viewport. */
html.k-peek-fs .k-card { min-height: 0; backdrop-filter: none; -webkit-backdrop-filter: none; transform: none; animation: none; }
/* One video skin for every inline <video> (tiles, scenes, grids): centre play
   button + a bottom bar. The bar shows on hover/focus and always on touch. */
.k-vui { position: absolute; inset: 0; z-index: 3; pointer-events: none; }
.k-vplay { position: absolute; left: 50%; top: 50%; width: 48px; height: 48px; margin: -24px 0 0 -24px; border: 0; border-radius: 50%;
  background: rgba(0, 0, 0, 0.55); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0;
  pointer-events: auto; transition: opacity 150ms var(--smooth), transform 150ms var(--smooth); }
.k-vplay svg { width: 20px; height: 20px; }
.k-vplay:hover { background: var(--brand); transform: scale(1.06); }
.k-vui.playing .k-vplay { opacity: 0; }
.k-vui.playing:hover .k-vplay, .k-vui.playing .k-vplay:focus-visible { opacity: 1; }
.k-vbar { position: absolute; left: 0; right: 0; bottom: 0; display: flex; align-items: center; gap: 8px; padding: 22px 10px 8px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.7), transparent); color: #fff; pointer-events: auto;
  opacity: 0; transition: opacity 150ms var(--smooth); }
.k-vui:hover .k-vbar, .k-vui:focus-within .k-vbar { opacity: 1; }
@media (hover: none) { .k-vbar { opacity: 1; } }
.k-vtrack { position: relative; flex: 1; min-width: 0; height: 4px; border-radius: 999px; background: rgba(255, 255, 255, 0.3); cursor: pointer; touch-action: none; }
.k-vtrack::before { content: ''; position: absolute; left: 0; right: 0; top: -10px; bottom: -10px; }
.k-vfill { position: absolute; left: 0; top: 0; bottom: 0; width: 0; border-radius: 999px; background: var(--brand); }
.k-vhead { position: absolute; top: 50%; left: 0; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%;
  background: #fff; box-shadow: 0 0 0 2px var(--brand); }
.k-vtime { font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.k-vmute, .k-vexp { width: 26px; height: 26px; border: 0; border-radius: 50%; background: transparent; color: #fff; padding: 0; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; flex: none; }
.k-vmute:hover, .k-vexp:hover { background: rgba(255, 255, 255, 0.2); }
.k-vmute svg, .k-vexp svg { width: 14px; height: 14px; }
/* Undecodable video (10/12-bit HEVC): the dead player is replaced by a note. */
video[data-unplayable] { display: none !important; }
video[data-unplayable] ~ .k-vui { display: none; }
.k-vnote { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  width: 100%; min-height: 160px; padding: 18px 16px; border-radius: 12px; text-align: center;
  background: rgba(255, 255, 255, 0.05); }
.k-vnote-t { font-size: 13px; font-weight: 600; color: var(--text); }
.k-vnote-s { font-size: 12px; color: var(--text-muted); max-width: 360px; margin-bottom: 4px; }
.k-peek-stage .k-vnote { max-width: 440px; color: #fff; }
.k-peek-stage .k-vnote-t { color: #fff; }
.k-peek-stage .k-vnote-s { color: rgba(255, 255, 255, 0.7); }
/* Recent Chromium still draws the native button despite controlslist. */
video::-webkit-media-controls-fullscreen-button { display: none !important; }
/* ---- Plans / upgrade card ---- */
.k-plan-toggle { display: inline-flex; gap: 2px; padding: 3px; margin-bottom: 12px;
  background: var(--surface-2); border: 1px solid var(--border); border-radius: 999px; }
.k-toggle-btn { border: 0; border-radius: 999px; padding: 5px 14px; cursor: pointer;
  background: transparent; color: var(--text-muted); font-family: inherit; font-size: 12px; font-weight: 600; }
.k-toggle-btn.active { background: var(--brand); color: #fff; }
.k-plan-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
.k-plan { display: flex; flex-direction: column; gap: 7px; padding: 14px;
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--specular); }
.k-plan.current { border-color: var(--brand); }
.k-plan-top { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.k-plan-name { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
.k-plan-badge { padding: 2px 7px; border-radius: 999px; background: var(--brand-soft); color: var(--brand);
  font-size: 11px; font-weight: 700; }
.k-plan-badge.current { background: var(--surface-2); color: var(--text-faint); }
.k-plan-credits { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--text-muted); }
.k-plan-pricing { display: flex; align-items: baseline; gap: 6px; margin-top: 2px; }
.k-plan-price { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
.k-plan-was { font-size: 13px; color: var(--text-faint); text-decoration: line-through; }
.k-plan-note { font-size: 11px; color: var(--text-faint); }
.k-plan .k-btn { margin-top: auto; justify-content: center; }
.k-pack-head { margin: 14px 0 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em;
  text-transform: uppercase; color: var(--text-faint); }
.k-pack-row { margin-bottom: 6px; }
/* Visual DNA chips: the character's face, so you can see WHICH DNA is locked in. */
.k-dna-face { width: 18px; height: 18px; border-radius: 999px; object-fit: cover; margin-left: -3px; background: var(--border-strong); }
.k-dna-stack .k-dna-stack-item { display: inline-flex; }
.k-dna-stack .k-dna-stack-item + .k-dna-stack-item .k-dna-face { margin-left: -9px; }
.k-dna-stack .k-dna-face { box-shadow: 0 0 0 1.5px var(--card-solid); }
.k-dna-stack { cursor: default; }
/* DNA = a set: reference sheet + stills, overlapped like a hand of cards. */
.k-dna-fan { display: inline-flex; align-items: center; margin-left: -3px; }
.k-dna-still { width: 22px; height: 28px; border-radius: 8px; object-fit: cover; cursor: zoom-in;
  background: var(--border-strong); box-shadow: 0 0 0 1.5px var(--card-solid);
  transition: transform 160ms var(--smooth); }
.k-dna-still + .k-dna-still { margin-left: -9px; }
.k-dna-still:hover { transform: translateY(-2px) scale(1.08); position: relative; z-index: 1; }
.k-mention-face { width: 14px; height: 14px; border-radius: 8px; object-fit: cover;
  vertical-align: -3px; margin-right: 4px; }

/* ---- Generation card: media first, specs and prompt as a caption ----
   Layout borrowed from the Higgsfield audit: one canvas, a status pill on it,
   flat spec row, two-line prompt. Order is CSS-only so every state keeps its
   existing markup. No Kolbo mark / link inside the card: it was a way to leave
   the chat by accident. */
.k-card.k-gen { border-radius: 24px; }
.k-gen .k-logo { display: none; }
.k-gen .k-title { display: none; }
.k-gen .k-head { padding: 12px 14px 0; }
.k-gen:has(#stage > .k-gen-grid.n1) .k-head { position: absolute; z-index: 3; top: 22px; left: 22px; padding: 0; pointer-events: none; }
.k-gen .k-body { display: flex; flex-direction: column; padding-top: 12px; }
.k-gen #stage { order: 1; }
.k-gen #chips { order: 2; margin: 12px 2px 6px; gap: 6px 14px; }
.k-gen #prompt { order: 3; margin-top: 2px; font-size: 13px; line-height: 1.5; -webkit-line-clamp: 2; }
.k-gen #prompt + .k-text-tools { order: 3; }
.k-gen #prompt-row { order: 4; }
.k-gen #actions { order: 5; }
.k-gen #phase-chip { background: var(--surface-2); border: 1px solid var(--border); color: var(--brand);
  padding: 7px 14px; font-size: 13px; font-weight: 600; gap: 8px; }
.k-gen .k-chip { background: none; padding: 0; font-size: 12px; font-weight: 600; color: var(--text);
  animation: none; }
.k-gen #chips > .k-chip + .k-chip::before { content: ''; width: 3px; height: 3px; border-radius: 50%;
  background: var(--text-faint); margin-right: 8px; }
/* Template + references live IN the spec row (no rows of their own): the template
   as a thumbnail + name, references pushed to the right edge as a thumb strip. */
.k-gen #chips { align-items: center; }
.k-gen .k-input-section { flex-basis: auto; margin: 0; display: inline-flex; align-items: center; }
.k-gen .k-input-label { display: none; }
.k-gen .k-input-media { flex-wrap: nowrap; gap: 4px; }
.k-gen .k-input-media .k-ref-thumb { width: 30px; height: 30px; border-radius: 8px; }
.k-gen .k-input-media .k-ref-thumb + .k-ref-thumb { margin-left: -2px; }
.k-gen .k-template { gap: 8px; font-size: 12px; font-weight: 600; color: var(--text); }
.k-gen .k-template-thumb, .k-gen .k-template-placeholder { width: 30px; height: 30px; border-radius: 8px; object-fit: cover; }
.k-gen #chips > .k-input-section:last-child { margin-left: auto; }
.k-gen #stage:empty { min-height: 240px; }
/* Finished media sits in the SAME fixed canvas the generating state used, so the
   card keeps its height from "Generating" to done and a portrait video floats
   centred with the canvas glow on both sides (no black bars). */
.k-gen #stage > .k-viewer { padding: 0; aspect-ratio: var(--k-ar, 1.6); max-height: 440px; align-items: center; border-radius: 20px;
  background: radial-gradient(120% 80% at 50% -10%, rgba(59, 130, 246, 0.16), transparent 70%), var(--panel); }
.k-gen #stage > .k-viewer img, .k-gen #stage > .k-viewer video { max-height: 100%; height: 100%; width: auto; max-width: 100%;
  object-fit: contain; border-radius: 0; background: transparent; }
.k-gen #stage > .k-viewer video { width: 100%; }
/* Video player bar: thick track, white playhead, big readable time. */
.k-player { display: flex; align-items: center; gap: 10px; margin-top: 8px; padding: 6px 10px; border-radius: 18px; background: var(--panel); }
.k-pbtn { width: 34px; height: 34px; border: 0; border-radius: 50%; background: transparent; color: var(--text);
  display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; flex: none; }
.k-pbtn:hover { background: var(--surface-2); }
.k-pbtn:focus-visible, .k-track:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
.k-pbtn svg { width: 18px; height: 18px; }
.k-track { position: relative; flex: 1; min-width: 0; height: 6px; border-radius: 999px; background: var(--border-strong);
  cursor: pointer; touch-action: none; margin: 0 6px; }
.k-track::before { content: ''; position: absolute; left: 0; right: 0; top: -12px; bottom: -12px; }
.k-track-fill { position: absolute; left: 0; top: 0; bottom: 0; width: 0; border-radius: 999px; background: var(--brand); }
.k-track-head { position: absolute; top: 50%; left: 0; width: 12px; height: 12px; margin: -6px 0 0 -6px; border-radius: 50%;
  background: #fff; box-shadow: 0 0 0 2px var(--brand), 0 1px 4px rgba(0, 0, 0, 0.35); transition: transform 120ms var(--smooth); }
.k-track:hover .k-track-head, .k-track.drag .k-track-head { transform: scale(1.2); }
.k-ptime { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--text); white-space: nowrap; }
.k-viewer:has(video[data-unplayable]) + .k-player { display: none; }
.k-info-btn[aria-pressed="true"] { background: var(--brand-soft); color: var(--brand); }
/* Generating (single result): text sits ON the canvas. The stage spans every row of
   a grid; chips / prompt / tools take the bottom rows, over a fade. */
.k-gen:has(#stage > .k-gen-grid.n1) .k-body { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: 1fr auto auto auto auto auto; }
.k-gen:has(#stage > .k-gen-grid.n1) #stage { grid-row: 1 / 5; grid-column: 1; position: relative; }
.k-gen:has(#stage > .k-gen-grid.n1) #stage::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 62%;
  border-radius: 0 0 20px 20px; pointer-events: none;
  background: linear-gradient(to bottom, transparent, rgba(8, 8, 9, 0.78)); }
.k-gen:has(#stage > .k-gen-grid.n1) #chips { grid-row: 2; grid-column: 1; z-index: 2; padding: 0 18px; margin: 0 0 4px; }
.k-gen:has(#stage > .k-gen-grid.n1) #prompt { grid-row: 3; grid-column: 1; z-index: 2; margin: 0; padding: 0 18px; color: rgba(255, 255, 255, 0.82); }
.k-gen:has(#stage > .k-gen-grid.n1) #prompt + .k-text-tools { grid-row: 4; grid-column: 1; z-index: 2; margin: 0; padding: 0 12px 12px; justify-content: flex-start; }
.k-gen:has(#stage > .k-gen-grid.n1) #chips .k-chip { color: #fff; }
.k-gen:has(#stage > .k-gen-grid.n1) #prompt + .k-text-tools .k-text-btn { color: rgba(255, 255, 255, 0.65); }
.k-gen:has(#stage > .k-gen-grid.n1) #prompt + .k-text-tools .k-text-btn:hover { color: #fff; background: rgba(255, 255, 255, 0.12); }
.k-gen:has(#stage > .k-gen-grid.n1) #actions { grid-row: 5; }
.k-gen:has(#stage > .k-gen-grid.n1) #prompt-row { grid-row: 6; }
/* Failed: same canvas, red glow. */
.k-gen #stage > .k-error { min-height: 220px; align-items: flex-end; border-radius: 20px;
  background: radial-gradient(120% 80% at 50% -10%, rgba(239, 68, 68, 0.18), transparent 70%), var(--panel); }
/* The empty canvas is the loading state: blue glow from the top edge, no boxes. */
.k-gen #stage > .k-gen-grid.n1 { padding: 0; aspect-ratio: var(--k-ar, 1.7778); max-height: 440px; border-radius: 20px; overflow: hidden;
  background: radial-gradient(120% 80% at 50% -10%, rgba(59, 130, 246, 0.28), transparent 70%), #17171a; }
.k-gen #stage > .k-gen-grid.n1 > div { background: none; height: 100%; width: 100%; min-height: 0; max-height: none; aspect-ratio: auto; border-radius: 20px; }

/* ---- Generating state ---- */
.k-gen-grid { display: grid; gap: 8px; }
.k-gen-grid.n1 { grid-template-columns: 1fr; }
.k-gen-grid.n2 { grid-template-columns: 1fr 1fr; }
.k-gen-grid.n3, .k-gen-grid.n4 { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
.k-skel {
  position: relative; border-radius: 12px; overflow: hidden;
  background: var(--surface-2);
  min-height: 120px; max-height: 300px;
  /* width:100% is load-bearing, not cosmetic. Without a definite width the
     aspect-ratio transfers the OTHER way: a 16/9 cell in a 196px auto-fill
     column wants 110px of height, min-height:120px clamps it up, and the ratio
     then back-computes the WIDTH as 120*16/9 = 213px. The item overflows its
     196px track and lands on top of the next tile — which is exactly what a
     3-up video grid looked like. Pinning the width makes the ratio size the
     height only, and min-height just letterboxes a slightly tall cell. */
  width: 100%;
}
.k-skel.video { aspect-ratio: 16 / 9; }
.k-skel.square { aspect-ratio: 1; }
.k-skel.portrait { aspect-ratio: 3 / 4; }
.k-skel::after {
  content: ''; position: absolute; inset: 0;
  /* The shimmer covers the WHOLE cell and outlives the skeleton — .k-skel.done
     only clears its paint, not its box. A pseudo-element hit-tests as its
     originating element, so every click on a finished cell landed on the cell
     instead of the media inside it: image cells still worked (their handler is
     ON the cell), but a <video>'s native controls never saw a single event —
     play, scrub, volume and fullscreen were all dead. It is decoration; it must
     never take a click. */
  pointer-events: none;
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 40%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.06) 60%, transparent 100%);
  background-size: 200% 100%;
  animation: k-sweep 1.6s ease-in-out infinite;
}
@keyframes k-sweep { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
/* Batch grid: per-cell prompt caption + a cell that already finished */
/* bottom: 0 puts this exactly where a <video> draws its control bar, so it has
   to be click-through too — the caption is a label, not a target. The full text
   stays reachable: the title tooltip moved onto the cell. */
.k-skel-cap { position: absolute; left: 0; right: 0; bottom: 0; z-index: 2; pointer-events: none;
  padding: 12px 8px 6px; font-size: 11px; color: #fff;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.65));
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.k-skel.done::after { animation: none; background: none; }
.k-cell-fill { width: 100%; height: 100%; object-fit: contain; display: block; background: var(--panel); }
.k-gen-badge {
  position: absolute; top: 10px; left: 10px; z-index: 2; pointer-events: none;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: 999px;
  background: rgba(0, 0, 0, 0.65); /* no backdrop-filter: nested blur over the
    animating k-sweep skeleton forced per-frame backdrop re-sampling on phones;
    0.65 black over the shimmer reads identically without it */
  border: 1px solid rgba(255, 255, 255, 0.14);
  font-size: 11px; font-weight: 600; color: #fff; text-transform: capitalize;
}
.k-spin {
  width: 12px; height: 12px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.25); border-top-color: var(--brand);
  animation: k-rot 0.8s linear infinite;
}
@keyframes k-rot { to { transform: rotate(360deg); } }

.k-progress { position: relative; height: 3px; border-radius: 2px; overflow: hidden;
  background: var(--surface-2); margin-top: 12px; }
.k-progress > i { position: absolute; inset: 0 auto 0 0; width: 0%; border-radius: 2px;
  background: linear-gradient(90deg, var(--brand), #60a5fa);
  transition: width 600ms var(--smooth); }
.k-status-line { display: flex; align-items: center; justify-content: space-between;
  margin-top: 8px; font-size: 11px; color: var(--text-faint); }

/* ---- Results ---- */
.k-media { position: relative; border-radius: 12px; overflow: hidden; border: 1px solid var(--border);
  background: #000; cursor: pointer; transition: transform 300ms var(--spring), box-shadow 300ms var(--smooth); }
.k-media:hover { transform: scale(1.015); box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45); }
.k-media img, .k-media video { display: block; width: 100%; height: 100%; object-fit: contain; }
.k-media.selected { outline: 2px solid var(--brand); outline-offset: 1px; }

/* ---- Per-item hover download button (multi-image grids, CD scenes, viewer) ---- */
.k-dl {
  position: absolute; top: 8px; right: 8px; z-index: 3;
  width: 30px; height: 30px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.18);
  background: rgba(0, 0, 0, 0.62); color: #fff; font-size: 13px; line-height: 1;
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer; opacity: 0; transition: opacity 150ms var(--smooth), background 150ms var(--smooth);
}
.k-media:hover .k-dl, .k-viewer:hover .k-dl, .k-skel:hover .k-dl, .k-dl:focus-visible { opacity: 1; }
/* Same contract as .k-tile-acts: on a touch host there is no hover, and the
   hover-only Download / Attach buttons were simply invisible. */
@media (hover: none) { .k-dl { opacity: 1; } }
.k-dl:hover { background: var(--brand); border-color: var(--brand); }
.k-viewer { position: relative; }

/* Keep the whole completed card under the host's iframe height cap (~800px):
   header + prompt + chips + viewer + thumbs + actions + footer must all fit,
   or claude.ai adds an inner scrollbar. Click the image to expand in-Claude. */
/* Media sits in an inset panel. The image is sized to itself (width:auto) so a
   portrait result no longer floats in a wide black letterbox. */
.k-viewer { margin-bottom: 0; padding: 8px; border-radius: 20px; background: var(--panel);
  display: flex; justify-content: center; }
.k-viewer img, .k-viewer video { display: block; max-width: 100%;
  /* Fixed px, no vh: vh inside an iframe is the height the host granted, so a
     vh-based cap grew as the iframe grew and the card chased its own tail. */
  max-height: 400px; object-fit: contain;
  border-radius: 12px; cursor: zoom-in; }
.k-viewer img { width: auto; height: auto; }
.k-viewer video { width: 100%; background: #000; cursor: default; }
#stage > .k-gen-grid, #stage > .k-grid { padding: 8px; border-radius: 20px; background: var(--panel); }

.k-expand-hint { display: none; }
.k-thumbs { display: flex; gap: 6px; margin: 8px 0 0; justify-content: center; }
.k-thumbs .k-thumb { width: 44px; height: 44px; border-radius: 9px; overflow: hidden; cursor: pointer;
  border: 2px solid transparent; opacity: 0.6; transition: all 150ms var(--smooth); flex: none; }
.k-thumbs .k-thumb:hover { opacity: 1; }
.k-thumbs .k-thumb.active { border-color: var(--brand); opacity: 1; }
.k-thumbs .k-thumb img { width: 100%; height: 100%; object-fit: cover; }

/* ---- Buttons ---- */
.k-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding-top: 10px; }
.k-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  height: 36px; padding: 0 16px; border-radius: 999px;
  border: 1px solid var(--border); background: var(--surface-2);
  color: var(--text); font-size: 13px; font-weight: 600; font-family: inherit; line-height: 1;
  cursor: pointer; transition: background 150ms var(--smooth), transform 150ms var(--smooth), color 150ms var(--smooth);
  text-decoration: none; user-select: none; white-space: nowrap;
}
.k-btn:hover { background: var(--border-strong); }
.k-btn:active { transform: scale(0.97); }
.k-btn:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
.k-btn.primary { background: var(--brand); border-color: var(--brand); color: #fff; }
.k-btn.primary:hover { background: #2f74e8; border-color: #2f74e8; }
.k-btn.ghost { background: transparent; border-color: transparent; color: var(--text-muted); }
.k-btn.ghost:hover { color: var(--text); background: var(--surface-2); }
.k-btn.danger { background: var(--error); border-color: var(--error); color: #fff; }
.k-btn.danger:hover { background: #dc2626; border-color: #dc2626; }
.k-btn.icon, .k-info-btn { width: 36px; padding: 0; }
.k-stop-ask { color: var(--text-muted); font-size: 13px; font-weight: 500; margin-right: 4px; }
.k-btn svg { width: 16px; height: 16px; flex: none; }
/* Inline SVG icons (replace emoji) — align with text, inherit color, never shrink. */
.k-ic { width: 1em; height: 1em; vertical-align: -0.14em; flex: none; }
.k-btn:disabled { opacity: 0.5; cursor: default; }

/* ---- Inline prompt input (Animate / Edit flows) ---- */
.k-prompt-row { display: none; gap: 8px; margin-top: 10px; }
.k-prompt-row.open { display: flex; animation: k-in 250ms var(--spring); }
.k-input {
  flex: 1; padding: 8px 12px; border-radius: var(--radius-btn);
  border: 1px solid var(--border-strong); background: var(--surface);
  color: var(--text); font-size: 12px; font-family: inherit; outline: none;
}
.k-input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-soft); }
.k-input::placeholder { color: var(--text-faint); }

/* ---- Paged media grid (library / stock / presets / DNAs / moodboards) ----
   Media-first tiles: the artwork IS the row. A title rides a gradient scrim
   INSIDE the tile instead of a text block under it, so a page of results reads
   as a contact sheet rather than a list of captions. No backdrop-filter on the
   scrim for the same reason .k-gen-badge has none — a dozen blurred strips over
   a dozen images forces a per-frame backdrop re-sample on phones. */
.k-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
/* Narrow hosts (Kolbo Code sidebar, phone): step down instead of shrinking
   tiles below a thumbnail worth looking at. The 520px block further down wins
   under 520 and takes it to 2. */
@media (max-width: 620px) { .k-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.k-tile { position: relative; aspect-ratio: 1; border-radius: 12px; overflow: hidden;
  background: var(--panel); cursor: pointer; }
.k-tile img, .k-tile video { display: block; width: 100%; height: 100%; object-fit: contain;
  transition: transform 350ms var(--smooth), filter 200ms var(--smooth); }
.k-tile:hover img { filter: brightness(1.06); }
.k-tile-fb { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: var(--text-faint); font-size: 24px; }
.k-tile-cap { position: absolute; left: 0; right: 0; bottom: 0; z-index: 2; pointer-events: none;
  padding: 20px 8px 7px; background: linear-gradient(transparent, rgba(0, 0, 0, 0.78));
  opacity: 0; transition: opacity 150ms var(--smooth); }
.k-tile:hover .k-tile-cap, .k-tile:focus-within .k-tile-cap { opacity: 1; }
@media (hover: none) { .k-tile-cap { opacity: 1; } }
.k-tile-t { font-size: 11px; font-weight: 600; color: #fff;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.k-tile-s { font-size: 11px; color: rgba(255, 255, 255, 0.66);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* Hover actions, revealed on pointer devices and always-on where there is no
   hover — a touch host must never hide the only Use affordance. */
.k-tile-acts { position: absolute; top: 6px; right: 6px; z-index: 3; display: flex; gap: 4px;
  opacity: 0; transition: opacity 150ms var(--smooth); }
.k-tile:hover .k-tile-acts, .k-tile:focus-within .k-tile-acts { opacity: 1; }
@media (hover: none) { .k-tile-acts { opacity: 1; } }
.k-tile-act { width: 26px; height: 26px; padding: 0; border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.18); background: rgba(0, 0, 0, 0.62); color: #fff;
  display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
  transition: background 150ms var(--smooth); }
.k-tile-act:hover { background: var(--brand); border-color: var(--brand); }
.k-tile-play { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 2;
  width: 46px; height: 38px; border-radius: 12px; border: 0; background: rgba(40, 44, 50, 0.62); font-size: 15px; }

/* ---- Pager (media grid + list) ----
   A page of results at a fixed card height, instead of a card that grows a row
   every time you ask for more. Forward past the last loaded page still goes
   through the server's page_tool + next_args contract. */
.k-pager { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 12px; }
.k-pager-btn { width: 28px; height: 28px; padding: 0; border-radius: 8px;
  border: 1px solid var(--border); background: var(--surface-2); color: var(--text);
  box-shadow: var(--specular); display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background 150ms var(--smooth); }
.k-pager-btn:hover:not(:disabled) { background: var(--border-strong); }
.k-pager-btn:disabled { opacity: 0.3; cursor: default; }
.k-dots { display: flex; align-items: center; gap: 6px; }
.k-dot { width: 7px; height: 7px; padding: 0; border: 0; border-radius: 999px; cursor: pointer;
  background: var(--text); opacity: 0.28;
  transition: width 220ms var(--spring), opacity 150ms var(--smooth); }
.k-dot:hover { opacity: 0.6; }
.k-dot.on { width: 22px; opacity: 0.95; cursor: default; }
.k-dot.ghost { cursor: default; opacity: 0.14; }
.k-pager-label { font-size: 11px; color: var(--text-faint);
  font-variant-numeric: tabular-nums; min-width: 58px; text-align: center; }

/* ---- Audio rows ---- */
.k-audio-row { display: flex; align-items: center; gap: 10px; padding: 9px 10px;
  border-radius: 12px; background: var(--panel);
  margin-bottom: 6px; transition: background 150ms var(--smooth); }
.k-audio-row:hover { background: var(--surface-2); }
.k-audio-art { width: 40px; height: 40px; border-radius: 8px; object-fit: cover; flex: none;
  background: var(--brand-soft); }
/* Stand-in when a voice/track has no artwork, or has one the host refuses to
   load — a blank tile and the browser's broken-image glyph both read as "this
   row is broken" rather than "this one has no picture". */
.k-audio-art-fallback { display: flex; align-items: center; justify-content: center;
  color: var(--brand); font-size: 18px; }
.k-audio-meta { flex: 1; min-width: 0; }
.k-audio-title { font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.k-audio-sub { font-size: 11px; color: var(--text-faint);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.k-generated-audio {
  display: grid; grid-template-columns: 40px minmax(0, 1fr) auto;
  align-items: center; gap: 7px 10px;
}
.k-generated-audio .k-audio-placeholder {
  display: flex; align-items: center; justify-content: center; color: var(--brand);
}
.k-generated-audio .k-audio-placeholder svg { width: 19px; height: 19px; }
.k-generated-audio .k-audio-download { white-space: nowrap; }
.k-generated-audio .k-audio-player {
  grid-column: 2 / -1; display: block; width: 100%; min-width: 0; height: 34px;
}
@media (max-width: 520px) {
  .k-generated-audio { grid-template-columns: 36px minmax(0, 1fr); }
  .k-generated-audio .k-audio-art { width: 36px; height: 36px; }
  .k-generated-audio .k-btn { grid-column: 2; justify-self: start; }
  .k-generated-audio .k-audio-player { grid-column: 1 / -1; }
  /* Touch-friendly MCP App layout (Claude iOS/Android iframe). */
  .k-head { padding: 10px 12px; gap: 8px; }
  .k-body { padding: 0 10px 10px; }
  .k-footer { padding: 0 12px 10px; }
  .k-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .k-tile-act { width: 30px; height: 30px; }
  .k-pager-btn { width: 34px; height: 34px; }
  .k-actions { flex-direction: column; align-items: stretch; }
  .k-actions .k-btn { width: 100%; min-height: 44px; justify-content: center; }
  .k-btn { min-height: 40px; padding: 10px 14px; }
  .k-title { font-size: 13px; }
  .k-prompt-row { flex-wrap: wrap; }
  .k-prompt-row .k-input { min-width: 0; flex: 1 1 100%; }
  .k-prompt-row .k-btn { flex: 1 1 auto; }
  .k-text-btn { min-height: 32px; padding: 6px 10px; }
}
.k-play {
  width: 32px; height: 32px; border-radius: 50%; flex: none; border: 1px solid rgba(255,255,255,0.18);
  background: rgba(0,0,0,0.5); color: #fff; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  transition: all 150ms var(--smooth);
}
.k-play:hover { background: var(--brand); border-color: var(--brand); }

/* ---- Misc ---- */
.k-error { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 12px;
  background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25);
  color: #fca5a5; font-size: 12px; }
.k-empty { padding: 22px; text-align: center; color: var(--text-faint); font-size: 12px; }
.k-footer { display: flex; align-items: center; gap: 6px; padding: 0 14px 10px;
  font-size: 11px; color: var(--text-faint); }
.k-footer > span:not(.k-credits) { display: none; }
.k-footer:not(:has(.k-credits:not(:empty))) { display: none; }
.k-footer a { color: var(--text-faint); text-decoration: none; }
.k-footer a:hover { color: var(--brand); }
.k-credits { margin-left: auto; font-variant-numeric: tabular-nums; }
/* Project mosaic: the latest images, 2 x 2, where a project has no cover. */
.k-mosaic { width: 44px; height: 44px; border-radius: 12px; overflow: hidden; flex: none; display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--border-strong); }
.k-mosaic img { width: 100%; height: 100%; object-fit: cover; display: block; }
/* Audio: play button, waveform, time. Played part of the wave is Kolbo blue. */
.k-wave { display: flex; align-items: center; gap: 10px; width: 100%; min-width: 0; }
.k-wave-play { width: 34px; height: 34px; border: 0; border-radius: 50%; background: var(--brand); color: #fff; flex: none; padding: 0;
  display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.k-wave-play:hover { background: #2f74e8; }
.k-wave-play svg { width: 16px; height: 16px; }
.k-wave-bars { position: relative; flex: 1; min-width: 0; height: 36px; display: flex; align-items: center; gap: 2px; cursor: pointer; touch-action: none; }
.k-wave-bars i { flex: 1; min-width: 1px; border-radius: 2px; background: color-mix(in srgb, var(--text) 24%, transparent); transition: background 80ms linear; }
.k-wave-bars i.on { background: var(--brand); }
.k-wave-time { font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--text-muted); white-space: nowrap; }
/* The status pill sits at the left of the header on every card; on a canvas it is dark glass. */
.k-gen .k-spacer { display: none; }
.k-gen:has(#stage > .k-gen-grid.n1) #phase-chip { background: rgba(0, 0, 0, 0.45); border-color: rgba(255, 255, 255, 0.14); color: #7fb0ff; }
.k-gen #phase-chip[data-bad="1"] { color: var(--error); }
.k-gen:has(#stage > .k-gen-grid.n1) #phase-chip[data-bad="1"] { color: #ff9c9c; }
/* Everything written ON the dark canvas reads light, whatever the host theme. */
.k-gen:has(#stage > .k-gen-grid.n1) :is(#chips, #prompt, .k-text-tools) {
  --text: #f5f5f2; --text-muted: rgba(245, 245, 242, 0.72); --text-faint: rgba(245, 245, 242, 0.5);
  --surface-2: rgba(255, 255, 255, 0.12); --panel: rgba(255, 255, 255, 0.08);
  --border: rgba(255, 255, 255, 0.16); --border-strong: rgba(255, 255, 255, 0.26); }
/* Batch tiles are media canvases too: dark in both themes, light text. */
.k-gen .k-gen-grid .k-skel { background: #17171a; }
.k-gen .k-skel .k-vnote { --text: #f5f5f2; --text-muted: rgba(245, 245, 242, 0.72); background: rgba(255, 255, 255, 0.06); }
.k-gen .k-skel .k-vnote-s { color: rgba(245, 245, 242, 0.72); }
/* Failed: dark canvas, red glow, light red message. */
.k-gen #stage > .k-error { background: radial-gradient(120% 80% at 50% -10%, rgba(239, 68, 68, 0.28), transparent 70%), #17171a;
  border: 0; color: #ff9c9c; font-weight: 500; }
/* Waveforms use the full row; reference-audio stays compact. */
.k-generated-audio > .k-wave, .k-audio-row > .k-wave { grid-column: 1 / -1; flex: 1 1 100%; width: 100%; }
.k-ref-audio .k-wave { width: 240px; max-width: 100%; }
/* Batch grids: two even columns, every tile the same shape, whatever loaded. */
.k-gen-grid.n2, .k-gen-grid.n3, .k-gen-grid.n4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.k-gen .k-gen-grid:not(.n1) > div { aspect-ratio: var(--k-ar, 1.3333); min-height: 0; max-height: none; height: auto; }
.k-tile-cap.always { opacity: 1; }
/* Tiles: media letterboxes onto the card's own tone, never black bars. */
.k-skel video.k-cell-fill, .k-skel img.k-cell-fill { background: var(--panel); }
.k-vnote .k-btn.primary { background: var(--surface-2); border-color: var(--border-strong); color: var(--text); }
.k-vnote .k-btn.primary:hover { background: var(--border-strong); }
`;

/**
 * Kolbo mark — the real app icon from the CDN (the host CSP allows it), with
 * the simplified inline SVG only as the onerror fallback.
 */
const KOLBO_LOGO_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="6" fill="#3b82f6"/><path d="M7 5.5v13M7 12l6.5-6.5M7 12l7 6.5" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const KOLBO_LOGO_IMG = `<img src="https://kolbo-general-media.fra1.cdn.digitaloceanspaces.com/models_icons/kolbo-ai.png" alt="Kolbo" style="width:18px;height:18px;border-radius:5px;display:block" onerror="this.outerHTML=KOLBO_LOGO_FALLBACK">`;

module.exports = { KOLBO_CSS, KOLBO_LOGO_SVG, KOLBO_LOGO_IMG };
