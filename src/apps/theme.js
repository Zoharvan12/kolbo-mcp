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
  --card: rgba(38, 38, 38, 0.90);
  --card-solid: #262626;
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
  --radius-card: 16px;
  --radius-btn: 8px;
  --spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --smooth: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  --specular: inset 0 1px 0 rgba(255, 255, 255, 0.18);
  color-scheme: dark;
}
[data-theme="light"] {
  --bg: #f5f5f2;
  --card: rgba(255, 255, 255, 0.85);
  --card-solid: #ffffff;
  --surface: rgba(0, 0, 0, 0.02);
  --surface-2: rgba(0, 0, 0, 0.04);
  --border: rgba(0, 0, 0, 0.08);
  --border-strong: rgba(0, 0, 0, 0.14);
  --text: #0a0a0c;
  --text-muted: rgba(10, 10, 12, 0.62);
  --text-faint: rgba(10, 10, 12, 0.40);
  --brand-soft: rgba(59, 130, 246, 0.10);
  --specular: inset 0 1px 0 rgba(255, 255, 255, 0.65);
  color-scheme: light;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: transparent; }
body {
  font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
  color: var(--text);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

/* ---- Card shell ---- */
.k-card {
  background: var(--card);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25), var(--specular);
  overflow: hidden;
  animation: k-in 400ms var(--spring);
}
@keyframes k-in { from { opacity: 0; transform: translateY(6px) scale(0.985); } to { opacity: 1; transform: none; } }

.k-head {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.k-logo { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 13px; letter-spacing: -0.01em; }
.k-logo svg { display: block; }
.k-head .k-title { color: var(--text-muted); font-size: 12.5px; font-weight: 500; }
.k-head .k-spacer { flex: 1; }

.k-body { padding: 14px 16px; }
.k-prompt { color: var(--text-muted); font-size: 12.5px; margin-bottom: 10px; word-break: break-word;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

/* ---- Chips ---- */
.k-chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 12px; }
.k-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 9px; border-radius: 999px;
  background: var(--surface-2); border: 1px solid var(--border);
  box-shadow: var(--specular);
  font-size: 11px; font-weight: 500; color: var(--text-muted);
  white-space: nowrap;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  letter-spacing: 0.01em;
  animation: k-chip-in 200ms var(--spring);
}
@keyframes k-chip-in { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: none; } }
.k-chip.brand { background: var(--brand-soft); border-color: rgba(59, 130, 246, 0.3); color: var(--brand); }
.k-chip img { width: 14px; height: 14px; border-radius: 4px; object-fit: cover; }
.k-chip .k-mono-icon {
  width: 14px; height: 14px; border-radius: 4px; background: var(--brand);
  color: #fff; font-size: 9px; font-weight: 700; display: inline-flex;
  align-items: center; justify-content: center; font-family: 'Inter', sans-serif;
}
.k-ref-thumb { width: 26px; height: 26px; border-radius: 6px; object-fit: cover; border: 1px solid var(--border-strong); }

/* ---- Generating state ---- */
.k-gen-grid { display: grid; gap: 8px; }
.k-gen-grid.n1 { grid-template-columns: 1fr; }
.k-gen-grid.n2 { grid-template-columns: 1fr 1fr; }
.k-gen-grid.n3, .k-gen-grid.n4 { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
.k-skel {
  position: relative; border-radius: 10px; overflow: hidden;
  background: var(--surface-2); border: 1px solid var(--border);
  min-height: 120px;
}
.k-skel.video { aspect-ratio: 16 / 9; }
.k-skel.square { aspect-ratio: 1; }
.k-skel.portrait { aspect-ratio: 3 / 4; }
.k-skel::after {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 40%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.06) 60%, transparent 100%);
  background-size: 200% 100%;
  animation: k-sweep 1.6s ease-in-out infinite;
}
@keyframes k-sweep { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.k-gen-badge {
  position: absolute; top: 10px; left: 10px; z-index: 2;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: 999px;
  background: rgba(0, 0, 0, 0.65); backdrop-filter: blur(6px);
  border: 1px solid rgba(255, 255, 255, 0.14);
  font-size: 11px; font-weight: 600; color: #fff;
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
.k-media { position: relative; border-radius: 10px; overflow: hidden; border: 1px solid var(--border);
  background: #000; cursor: pointer; transition: transform 300ms var(--spring), box-shadow 300ms var(--smooth); }
.k-media:hover { transform: scale(1.015); box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45); }
.k-media img, .k-media video { display: block; width: 100%; height: 100%; object-fit: cover; }
.k-media.selected { outline: 2px solid var(--brand); outline-offset: 1px; }

.k-viewer { margin-bottom: 10px; }
.k-viewer img, .k-viewer video { display: block; width: 100%; max-height: 480px; object-fit: contain;
  border-radius: 12px; background: #000; border: 1px solid var(--border); }
.k-thumbs { display: flex; gap: 6px; margin: 10px 0 2px; }
.k-thumbs .k-thumb { width: 48px; height: 48px; border-radius: 8px; overflow: hidden; cursor: pointer;
  border: 2px solid transparent; opacity: 0.75; transition: all 150ms var(--smooth); flex: none; }
.k-thumbs .k-thumb:hover { opacity: 1; }
.k-thumbs .k-thumb.active { border-color: var(--brand); opacity: 1; }
.k-thumbs .k-thumb img { width: 100%; height: 100%; object-fit: cover; }

/* ---- Buttons ---- */
.k-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding-top: 12px; }
.k-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: var(--radius-btn);
  border: 1px solid var(--border); background: var(--surface-2);
  box-shadow: var(--specular);
  color: var(--text); font-size: 12px; font-weight: 600; font-family: inherit;
  cursor: pointer; transition: all 150ms var(--smooth);
  text-decoration: none; user-select: none;
}
.k-btn:hover { background: var(--border-strong); }
.k-btn:active { transform: scale(0.97); }
.k-btn.primary { background: var(--brand); border-color: var(--brand); color: #fff;
  box-shadow: 0 2px 12px rgba(59, 130, 246, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25); }
.k-btn.primary:hover { background: #2f74e8; }
.k-btn.ghost { background: transparent; box-shadow: none; border-color: transparent; color: var(--text-muted); }
.k-btn.ghost:hover { color: var(--text); background: var(--surface-2); }
.k-btn svg { width: 13px; height: 13px; }
.k-btn:disabled { opacity: 0.5; cursor: default; }

/* ---- Inline prompt input (Animate / Edit flows) ---- */
.k-prompt-row { display: none; gap: 8px; margin-top: 10px; }
.k-prompt-row.open { display: flex; animation: k-in 250ms var(--spring); }
.k-input {
  flex: 1; padding: 8px 12px; border-radius: var(--radius-btn);
  border: 1px solid var(--border-strong); background: var(--surface);
  color: var(--text); font-size: 12.5px; font-family: inherit; outline: none;
}
.k-input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-soft); }
.k-input::placeholder { color: var(--text-faint); }

/* ---- Grid widget (media / stock / presets) ---- */
.k-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
.k-cell { position: relative; border-radius: 10px; overflow: hidden; border: 1px solid var(--border);
  background: var(--surface); cursor: pointer; transition: transform 250ms var(--spring); }
.k-cell:hover { transform: translateY(-2px) scale(1.01); }
.k-cell .k-cell-media { aspect-ratio: 1; background: #000; }
.k-cell .k-cell-media img { width: 100%; height: 100%; object-fit: cover; display: block; }
.k-cell .k-cell-label { padding: 6px 8px; font-size: 11px; color: var(--text-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.k-cell .k-cell-sub { padding: 0 8px 7px; font-size: 10px; color: var(--text-faint);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ---- Audio rows ---- */
.k-audio-row { display: flex; align-items: center; gap: 10px; padding: 9px 10px;
  border-radius: 10px; border: 1px solid var(--border); background: var(--surface);
  margin-bottom: 6px; transition: background 150ms var(--smooth); }
.k-audio-row:hover { background: var(--surface-2); }
.k-audio-art { width: 40px; height: 40px; border-radius: 8px; object-fit: cover; flex: none;
  background: var(--brand-soft); }
.k-audio-meta { flex: 1; min-width: 0; }
.k-audio-title { font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.k-audio-sub { font-size: 11px; color: var(--text-faint); }
.k-play {
  width: 32px; height: 32px; border-radius: 50%; flex: none; border: 1px solid rgba(255,255,255,0.18);
  background: rgba(0,0,0,0.5); color: #fff; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  transition: all 150ms var(--smooth);
}
.k-play:hover { background: var(--brand); border-color: var(--brand); }

/* ---- Misc ---- */
.k-error { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 10px;
  background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25);
  color: #fca5a5; font-size: 12.5px; }
.k-empty { padding: 22px; text-align: center; color: var(--text-faint); font-size: 12.5px; }
.k-footer { display: flex; align-items: center; gap: 6px; padding: 8px 16px 12px;
  font-size: 10.5px; color: var(--text-faint); }
.k-footer a { color: var(--text-faint); text-decoration: none; }
.k-footer a:hover { color: var(--brand); }
.k-credits { margin-left: auto; font-family: 'JetBrains Mono', monospace; }
`;

/** Kolbo mark (simplified inline SVG, brand blue). */
const KOLBO_LOGO_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="6" fill="#3b82f6"/><path d="M7 5.5v13M7 12l6.5-6.5M7 12l7 6.5" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

module.exports = { KOLBO_CSS, KOLBO_LOGO_SVG };
