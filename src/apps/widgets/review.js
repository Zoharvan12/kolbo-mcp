'use strict';

/**
 * Kolbo Review card — watch a cut and leave timestamped notes without leaving
 * the chat. Mounted by create_review_asset / get_review_asset /
 * add_review_version / list_review_assets. Payload: { widget:'review',
 * assets[] | asset, active_asset_id?, comments? }. Every write goes through the
 * existing review tools via window.kolbo.callTool, so the card never invents
 * an endpoint. Voice memos and drawings stay in the app ("Open in Kolbo").
 *
 * SCRIPT is a template literal: never use backticks or ${ inside it, and
 * never write a backslash-quote (it collapses and ships a syntax error).
 */

const { widgetPage } = require('../html');

const BODY = `
<style>
[hidden] { display: none !important; }
/* Wraps, never scrolls: a scroll strip inside a host iframe showed a stray
   vertical scrollbar and clipped the names. */
.rv-strip { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.rv-thumb { flex: 0 0 auto; width: 76px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface-2);
  padding: 4px; cursor: pointer; font: inherit; font-size: 11px; line-height: 1.3; color: var(--text-muted); text-align: center; display: block; }
.rv-thumb.on { border-color: var(--brand); color: var(--text); }
.rv-thumb .rv-sw { position: relative; display: block; height: 54px; border-radius: 8px; overflow: hidden; background: var(--panel); }
.rv-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.rv-thumb .rv-n { position: absolute; top: 3px; right: 3px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px;
  background: var(--brand); color: #fff; font-size: 10px; line-height: 16px; }
.rv-thumb .rv-dot, .rv-chip-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
.rv-thumb .rv-dot { position: absolute; top: 5px; left: 5px; box-shadow: 0 0 0 1px rgba(0,0,0,.4); }
.rv-thumb .rv-name { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 3px; }

.rv-body { display: grid; grid-template-columns: 1fr; gap: 12px; }
.rv-body.portrait { grid-template-columns: minmax(180px, 240px) 1fr; }
@media (max-width: 560px) { .rv-body.portrait { grid-template-columns: 1fr; } .rv-body.portrait .rv-player { max-width: 260px; width: 100%; margin: 0 auto; } }
.rv-player { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.rv-stage { position: relative; aspect-ratio: 16 / 9; border-radius: 16px; overflow: hidden; background: #000; border: 1px solid var(--border); cursor: pointer; }
.rv-stage video, .rv-stage img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: block; }
.rv-play { position: absolute; inset: 0; margin: auto; width: 48px; height: 48px; border-radius: 50%; background: rgba(0,0,0,.5);
  display: grid; place-items: center; color: #fff; font-size: 20px; transition: opacity 200ms var(--smooth); pointer-events: none; }
.rv-stage.playing .rv-play { opacity: 0; }
.rv-pin { position: absolute; top: 8px; left: 8px; right: 8px; padding: 4px 9px; border-radius: 10px; background: rgba(0,0,0,.6); color: #fff;
  font-size: 11.5px; opacity: 0; transition: opacity 250ms; pointer-events: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: fit-content; max-width: calc(100% - 16px); }
.rv-pin.show { opacity: 1; }
.rv-scrub { position: relative; height: 24px; cursor: pointer; touch-action: none; }
.rv-track, .rv-fill { position: absolute; left: 0; top: 11px; height: 4px; border-radius: 2px; }
.rv-track { right: 0; background: var(--border-strong); }
.rv-fill { background: var(--brand); width: 0; }
.rv-hd { position: absolute; top: 6px; left: 0; width: 14px; height: 14px; margin-left: -7px; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.5); }
.rv-mk { position: absolute; top: 0; width: 10px; height: 10px; margin-left: -5px; border-radius: 50%; border: 2px solid var(--card-solid, #161619); cursor: pointer; }
.rv-mk-range { position: absolute; top: 12px; height: 4px; border-radius: 2px; opacity: .55; pointer-events: none; }
.rv-time { display: flex; justify-content: space-between; color: var(--text-faint); font-size: 11px; font-variant-numeric: tabular-nums; }

.rv-notes { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.rv-compose { background: var(--surface-2); border: 1px solid var(--border); border-radius: 14px; padding: 8px 10px; }
.rv-compose textarea { width: 100%; resize: none; min-height: 44px; background: transparent; border: 0; outline: 0; color: var(--text); font: inherit; font-size: 13px; }
.rv-crow { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.rv-tc { font-variant-numeric: tabular-nums; padding: 2px 8px; border-radius: 999px; background: var(--brand-soft); color: var(--brand);
  font: inherit; font-size: 11.5px; font-weight: 600; cursor: pointer; border: 0; }
.rv-ghost { background: transparent; border: 1px solid var(--border); color: var(--text-muted); border-radius: 999px; padding: 3px 9px;
  font: inherit; font-size: 11.5px; cursor: pointer; display: inline-flex; gap: 5px; align-items: center; }
.rv-ghost.on { border-color: var(--brand); color: var(--brand); }
.rv-ghost:hover { color: var(--text); }
.rv-post { margin-left: auto; height: 30px; padding: 0 14px; font-size: 12.5px; }
.rv-post:disabled { opacity: .45; cursor: default; }
.rv-filter { display: flex; gap: 6px; }
.rv-list { display: flex; flex-direction: column; gap: 6px; max-height: 340px; overflow-y: auto; padding-right: 2px; }
.rv-note { display: grid; grid-template-columns: 26px 1fr; gap: 8px; padding: 9px 10px; border-radius: 14px; border: 1px solid var(--border); background: var(--surface); }
.rv-note.active { border-color: var(--brand); }
.rv-note.resolved { opacity: .55; }
.rv-note.resolved .rv-nb { text-decoration: line-through; }
.rv-av { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-size: 10.5px; font-weight: 700; color: #fff; overflow: hidden; }
.rv-av img { width: 100%; height: 100%; object-fit: cover; }
.rv-nh { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); min-width: 0; }
.rv-nh b { color: var(--text); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rv-tag { font-size: 10px; padding: 1px 6px; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--border); }
.rv-res { margin-left: auto; flex: 0 0 auto; width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--border-strong);
  background: transparent; color: var(--text-faint); cursor: pointer; display: grid; place-items: center; font-size: 12px; }
.rv-note.resolved .rv-res { background: var(--success); border-color: var(--success); color: #fff; }
.rv-nb { margin-top: 2px; font-size: 13px; white-space: pre-wrap; word-break: break-word; user-select: text; -webkit-user-select: text; }
.rv-extra { margin-top: 3px; font-size: 11.5px; color: var(--text-faint); }
.rv-reply { margin-top: 6px; padding-left: 9px; border-left: 2px solid var(--border-strong); font-size: 12.5px; color: var(--text-muted); white-space: pre-wrap; word-break: break-word; }
.rv-reply b { color: var(--text); font-weight: 600; }
.rv-nf { margin-top: 4px; font-size: 11.5px; }
.rv-nf button { background: none; border: 0; padding: 0; color: var(--text-faint); font: inherit; cursor: pointer; }
.rv-nf button:hover { color: var(--text); }
.rv-empty { color: var(--text-faint); font-size: 12.5px; padding: 12px 4px; }
.rv-menu { position: relative; }
.rv-pop { position: absolute; bottom: 42px; left: 0; background: var(--card-solid, #161619); border: 1px solid var(--border-strong); border-radius: 12px;
  padding: 4px; min-width: 190px; z-index: 5; box-shadow: 0 10px 30px rgba(0,0,0,.35); }
.rv-pop button { display: flex; width: 100%; gap: 8px; align-items: center; padding: 7px 10px; border-radius: 8px; background: none; border: 0;
  color: var(--text); font: inherit; font-size: 12.5px; cursor: pointer; text-align: left; }
.rv-pop button:hover { background: var(--surface-2); }
.rv-spacer { flex: 1; }
.rv-msg { margin-top: 8px; font-size: 12px; color: var(--text-muted); min-height: 0; }
.rv-msg.err { color: var(--error); }
</style>
<div class="k-card">
  <div class="k-head"><span class="k-title" id="title">Kolbo Review</span><span class="k-logo" id="logo"></span></div>
  <div class="k-body" aria-live="polite">
    <div id="loading" class="k-skel" style="min-height:0;height:180px" aria-label="Loading review"></div>
    <div id="main" hidden>
      <div class="k-chips" id="chips"></div>
      <div class="rv-strip" id="strip" hidden></div>
      <div class="rv-body" id="rvBody">
        <div class="rv-player">
          <div class="rv-stage" id="stage">
            <video id="vid" playsinline preload="metadata"></video>
            <img id="img" alt="" hidden>
            <div class="rv-pin" id="pin"></div>
            <div class="rv-play" id="playIc"></div>
          </div>
          <div id="timeline">
            <div class="rv-scrub" id="scrub"><div class="rv-track"></div><div class="rv-fill" id="fill"></div><div id="markers"></div><div class="rv-hd" id="hd"></div></div>
            <div class="rv-time"><span id="cur">0:00</span><span id="tot"></span></div>
          </div>
        </div>
        <div class="rv-notes">
          <div class="rv-compose">
            <textarea id="ta" rows="2" placeholder="Leave a note on this moment..."></textarea>
            <div class="rv-crow">
              <button type="button" class="rv-tc" id="tcBtn" title="Jump back to this moment"></button>
              <button type="button" class="rv-ghost" id="rangeBtn" title="Mark a range instead of a point"></button>
              <button type="button" class="rv-ghost" id="cancelReply" hidden></button>
              <button type="button" class="k-btn primary rv-post" id="post" disabled>Post note</button>
            </div>
          </div>
          <div class="rv-filter" id="filter">
            <button type="button" class="rv-ghost on" data-f="open">Open</button>
            <button type="button" class="rv-ghost" data-f="all">All</button>
            <button type="button" class="rv-ghost" data-f="resolved">Resolved</button>
          </div>
          <div class="rv-list" id="list"></div>
        </div>
      </div>
      <div class="k-actions">
        <div class="rv-menu"><button type="button" class="k-btn" id="statusBtn"></button><div class="rv-pop" id="statusPop" hidden></div></div>
        <button type="button" class="k-btn" id="shareBtn"></button>
        <button type="button" class="k-btn" id="agentBtn"></button>
        <span class="rv-spacer"></span>
        <button type="button" class="k-btn ghost" id="openBtn"></button>
      </div>
      <div class="rv-msg" id="msg"></div>
    </div>
    <div id="error" class="k-error" hidden>Review unavailable. Ask the agent to try again.</div>
  </div>
</div>`;

const SCRIPT = `
var STATUS = {
  in_progress: ['In progress', '#a1a1aa'],
  needs_review: ['Needs review', '#f59e0b'],
  changes_requested: ['Changes requested', '#ef4444'],
  approved: ['Approved', '#22c55e']
};
var PALETTE = ['#3b82f6', '#8b5cf6', '#0ea5e9', '#ec4899', '#14b8a6', '#f97316', '#6366f1'];
var RANGE_ICON = '<svg class="k-ic" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6v12M20 6v12M4 12h16"/></svg>';
var S = { assets: [], ai: 0, comments: {}, loading: {}, filter: 'open', range: false, replyTo: null, t: 0, dur: 0, playing: false, busy: false };

el('logo').innerHTML = KOLBO_LOGO + '<span>Kolbo</span>';
el('rangeBtn').innerHTML = RANGE_ICON + ' Range';
el('statusBtn').innerHTML = ICONS.edit + ' Set status';
el('shareBtn').innerHTML = ICONS.copy + ' Share with client';
el('agentBtn').innerHTML = ICONS.sparkle + ' Send notes to agent';
el('openBtn').innerHTML = ICONS.open + ' Open in Kolbo';
el('playIc').innerHTML = ICONS.play;

function fmt(s) { s = Math.max(0, Number(s) || 0); var m = Math.floor(s / 60); return m + ':' + String(Math.floor(s - m * 60)).padStart(2, '0'); }
function A() { return S.assets[S.ai]; }
function version(a) { var v = (a && a.versions) || []; return v[a.current_version_index] || v[v.length - 1] || {}; }
function kindOf(v) { var t = String(v.media_type || '').toLowerCase(); if (t) return t; return /\\.(png|jpe?g|webp|gif)(\\?|$)/i.test(v.url || '') ? 'image' : 'video'; }
function msg(text, err) { var m = el('msg'); m.textContent = text || ''; m.className = 'rv-msg' + (err ? ' err' : ''); window.kolbo.notifySize(); }
function hue(key) { var h = 0; key = String(key || ''); for (var i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0; return PALETTE[h % PALETTE.length]; }
function who(c) {
  if (c.author_kind === 'guest') return { name: (c.guest_author && c.guest_author.name) || 'Guest', tag: (c.guest_author && c.guest_author.role_label) || 'Guest', key: 'g:' + ((c.guest_author && c.guest_author.name) || '') };
  var a = c.author && typeof c.author === 'object' ? c.author : {};
  var name = [a.first_name, a.last_name].filter(Boolean).join(' ') || 'You';
  return { name: name, avatar: a.avatar_url, key: 'u:' + (a.id || name) };
}
function initials(n) { return String(n).split(/\\s+/).filter(Boolean).slice(0, 2).map(function (p) { return p[0]; }).join('').toUpperCase() || '?'; }
function topNotes(list) { return (list || []).filter(function (c) { return !c.parent_note_id; }); }
function openCount(id) { var l = S.comments[id]; return l ? topNotes(l).filter(function (c) { return !c.resolved; }).length : null; }
function call(name, args) {
  return Promise.resolve(window.kolbo.callTool(name, args)).then(function (res) {
    var sc = structured(res);
    if ((res && res.isError) || (sc && sc.success === false)) throw new Error((sc && (sc.error || sc.message)) || 'Request failed');
    return sc || {};
  });
}

function loadComments(id, force) {
  if (!id || S.loading[id] || (S.comments[id] && !force)) return;
  S.loading[id] = true;
  call('list_review_comments', { asset_id: id }).then(function (sc) {
    S.comments[id] = sc.comments || [];
  }).catch(function (e) {
    S.comments[id] = []; // ponytail: no auto-retry; renderNotes re-calls loadComments, so a failure left unset looped forever
    if (id === A().id) msg('Could not load notes: ' + e.message, true);
  })
    .then(function () { S.loading[id] = false; if (A() && A().id === id) renderNotes(); renderStrip(); });
}

function renderStrip() {
  var strip = el('strip');
  strip.hidden = S.assets.length < 2;
  if (strip.hidden) return;
  strip.innerHTML = S.assets.map(function (a, i) {
    var v = version(a); var st = STATUS[a.review_status] || STATUS.in_progress; var n = openCount(a.id);
    var thumb = v.thumbnail_url || a.cover_url || (kindOf(v) === 'image' ? v.url : '');
    return '<button type="button" class="rv-thumb' + (i === S.ai ? ' on' : '') + '" data-i="' + i + '" title="' + esc(a.name) + '">' +
      '<span class="rv-sw">' + (thumb ? '<img src="' + esc(thumb) + '" alt="">' : '') +
      '<span class="rv-dot" style="background:' + st[1] + '"></span>' + (n ? '<span class="rv-n">' + n + '</span>' : '') + '</span>' +
      '<span class="rv-name">' + esc(a.name) + '</span></button>';
  }).join('');
}

function renderHead() {
  var a = A(); var v = version(a); var st = STATUS[a.review_status] || STATUS.in_progress;
  el('title').textContent = a.name || 'Kolbo Review';
  var n = openCount(a.id);
  el('chips').innerHTML = (v.label ? '<span class="k-chip">' + esc(v.label) + '</span>' : '') +
    (S.dur ? '<span class="k-chip">' + fmt(S.dur) + '</span>' : '') +
    '<span class="k-chip"><span class="rv-chip-dot" style="background:' + st[1] + '"></span>' + st[0] + '</span>' +
    (n == null ? '' : '<span class="k-chip">' + n + ' open note' + (n === 1 ? '' : 's') + '</span>');
  el('openBtn').hidden = !a.open_url;
}

function loadMedia() {
  var v = version(A()); var vid = el('vid'); var img = el('img');
  var isImg = kindOf(v) === 'image';
  setPlaying(false); S.t = 0; S.dur = 0;
  el('rvBody').classList.remove('portrait'); el('stage').style.aspectRatio = '';
  img.hidden = !isImg; vid.hidden = isImg; el('playIc').hidden = isImg; el('timeline').hidden = isImg; el('tcBtn').hidden = isImg; el('rangeBtn').hidden = isImg;
  if (isImg) {
    vid.removeAttribute('src');
    img.onload = function () { fitStage(img.naturalWidth, img.naturalHeight); };
    img.src = v.url || '';
  } else {
    img.removeAttribute('src');
    if (vid.getAttribute('src') !== v.url) { vid.src = v.url || ''; }
  }
  renderTime();
}
function fitStage(w, h) {
  if (!w || !h) return;
  el('stage').style.aspectRatio = w + ' / ' + h;
  el('rvBody').classList.toggle('portrait', h > w * 1.05);
  window.kolbo.notifySize();
}

function renderMarkers() {
  var list = topNotes(S.comments[A().id]).filter(function (c) { return !c.resolved && c.time_start != null; });
  if (!S.dur) { el('markers').innerHTML = ''; return; }
  el('markers').innerHTML = list.map(function (c) {
    var w = who(c); var col = hue(w.key); var l = Math.min(100, (c.time_start / S.dur) * 100);
    var range = c.time_end != null && c.time_end > c.time_start
      ? '<div class="rv-mk-range" style="left:' + l + '%;width:' + Math.min(100 - l, ((c.time_end - c.time_start) / S.dur) * 100) + '%;background:' + col + '"></div>' : '';
    return range + '<div class="rv-mk" data-seek="' + c.time_start + '" style="left:' + l + '%;background:' + col + '" title="' + fmt(c.time_start) + ' ' + esc(w.name) + '"></div>';
  }).join('');
}

function noteHtml(c, replies) {
  var w = who(c); var col = hue(w.key);
  var tc = c.time_start != null ? '<button type="button" class="rv-tc" data-seek="' + c.time_start + '">' + fmt(c.time_start) + (c.time_end != null && c.time_end > c.time_start ? '-' + fmt(c.time_end) : '') + '</button>' : '';
  var extra = [];
  if (c.voice_memo) extra.push('Voice note' + (c.voice_memo.transcript ? ': ' + esc(c.voice_memo.transcript) : ''));
  if (c.annotations && c.annotations.length) extra.push('Drawing on frame (open in Kolbo)');
  if (c.attachments && c.attachments.length) extra.push(c.attachments.length + ' attachment' + (c.attachments.length === 1 ? '' : 's'));
  return '<div class="rv-note' + (c.resolved ? ' resolved' : '') + '" data-id="' + esc(c.id) + '">' +
    '<div class="rv-av" style="background:' + col + '">' + (w.avatar ? '<img src="' + esc(w.avatar) + '" alt="">' : esc(initials(w.name))) + '</div>' +
    '<div style="min-width:0"><div class="rv-nh"><b>' + esc(w.name) + '</b>' + tc + (w.tag ? '<span class="rv-tag">' + esc(w.tag) + '</span>' : '') +
    '<button type="button" class="rv-res" data-res="' + esc(c.id) + '" title="' + (c.resolved ? 'Reopen' : 'Resolve') + '" aria-label="' + (c.resolved ? 'Reopen' : 'Resolve') + '">' + ICONS.check + '</button></div>' +
    (c.body ? '<div class="rv-nb">' + esc(c.body) + '</div>' : '') +
    (extra.length ? '<div class="rv-extra">' + extra.join(' · ') + '</div>' : '') +
    replies.map(function (r) { return '<div class="rv-reply"><b>' + esc(who(r).name) + '</b> ' + esc(r.body) + '</div>'; }).join('') +
    '<div class="rv-nf"><button type="button" data-reply="' + esc(c.id) + '">Reply</button></div></div></div>';
}

function renderNotes() {
  var a = A(); var all = S.comments[a.id];
  renderHead(); renderMarkers();
  if (!all) { el('list').innerHTML = '<div class="k-skel" style="min-height:0;height:60px"></div>'; loadComments(a.id); window.kolbo.notifySize(); return; }
  var byParent = {};
  all.forEach(function (c) { if (c.parent_note_id) (byParent[c.parent_note_id] = byParent[c.parent_note_id] || []).push(c); });
  var top = topNotes(all).filter(function (c) { return S.filter === 'all' || (S.filter === 'resolved' ? c.resolved : !c.resolved); });
  top.sort(function (x, y) { return (x.time_start == null ? 1e9 : x.time_start) - (y.time_start == null ? 1e9 : y.time_start); });
  el('list').innerHTML = top.length ? top.map(function (c) { return noteHtml(c, byParent[c.id] || []); }).join('')
    : '<div class="rv-empty">' + (S.filter === 'resolved' ? 'No resolved notes.' : (S.filter === 'open' && all.length ? 'All notes resolved.' : 'No notes yet. Pause on a moment and leave one.')) + '</div>';
  renderTime();
  window.kolbo.notifySize();
}

function renderTime() {
  var p = S.dur ? Math.min(1, S.t / S.dur) : 0;
  el('fill').style.width = p * 100 + '%'; el('hd').style.left = p * 100 + '%';
  el('cur').textContent = fmt(S.t); el('tot').textContent = S.dur ? fmt(S.dur) : '';
  el('tcBtn').textContent = '@ ' + fmt(S.t) + (S.range ? '-' + fmt(Math.min(S.dur || S.t + 3, S.t + 3)) : '');
  var list = topNotes(S.comments[A().id]);
  var near = null;
  for (var i = 0; i < list.length; i++) { var c = list[i]; if (!c.resolved && c.time_start != null && Math.abs(c.time_start - S.t) < 0.6) { near = c; break; } }
  el('pin').textContent = near ? who(near).name + ': ' + (near.body || '') : '';
  el('pin').classList.toggle('show', !!near && !!near.body);
  Array.prototype.forEach.call(el('list').querySelectorAll('.rv-note'), function (n) { n.classList.toggle('active', !!near && n.getAttribute('data-id') === near.id); });
}

function setPlaying(on) {
  var vid = el('vid');
  if (on && vid.hidden) return;
  S.playing = on;
  el('stage').classList.toggle('playing', on);
  el('playIc').innerHTML = on ? ICONS.pause : ICONS.play;
  if (on) { var p = vid.play(); if (p && p.catch) p.catch(function () { setPlaying(false); }); tick(); }
  else if (vid.pause) vid.pause();
}
function tick() { if (!S.playing) return; S.t = el('vid').currentTime || 0; renderTime(); requestAnimationFrame(tick); }
function seek(s) {
  s = Math.max(0, Math.min(S.dur || s, Number(s) || 0));
  S.t = s; try { el('vid').currentTime = s; } catch (e) {}
  renderTime();
}

function selectAsset(i) {
  if (i === S.ai || !S.assets[i]) return;
  S.ai = i; S.replyTo = null; syncCompose(); msg('');
  renderStrip(); loadMedia(); renderNotes();
}

function syncCompose() {
  var ta = el('ta');
  ta.placeholder = S.replyTo ? 'Reply...' : 'Leave a note on this moment...';
  el('cancelReply').hidden = !S.replyTo;
  el('cancelReply').innerHTML = ICONS.x + ' Cancel reply';
  el('tcBtn').style.display = S.replyTo ? 'none' : '';
  el('rangeBtn').style.display = S.replyTo ? 'none' : '';
  el('post').textContent = S.replyTo ? 'Reply' : 'Post note';
  el('post').disabled = S.busy || !ta.value.trim();
}

function post() {
  var body = el('ta').value.trim(); var a = A();
  if (!body || S.busy) return;
  S.busy = true; syncCompose(); setPlaying(false);
  var p;
  if (S.replyTo) p = call('reply_review_comment', { note_id: S.replyTo, body: body });
  else {
    var args = { asset_id: a.id, body: body };
    if (!el('vid').hidden) {
      args.time_start = Math.round(S.t * 100) / 100;
      if (S.range) args.time_end = Math.round(Math.min(S.dur || S.t + 3, S.t + 3) * 100) / 100;
    }
    p = call('create_review_comment', args);
  }
  p.then(function (sc) {
    var c = sc.comment;
    if (c) {
      if (S.replyTo && !c.parent_note_id) c.parent_note_id = S.replyTo;
      (S.comments[a.id] = S.comments[a.id] || []).push(c);
    } else loadComments(a.id, true);
    el('ta').value = ''; S.replyTo = null;
    if (S.filter === 'resolved') setFilter('open');
    msg(''); renderNotes(); renderStrip();
  }).catch(function (e) { msg('Note not saved: ' + e.message, true); })
    .then(function () { S.busy = false; syncCompose(); });
}

function toggleResolve(id) {
  var a = A(); var c = (S.comments[a.id] || []).filter(function (x) { return x.id === id; })[0];
  if (!c) return;
  var next = !c.resolved; c.resolved = next; renderNotes(); renderStrip();
  call(next ? 'resolve_review_comment' : 'unresolve_review_comment', { note_id: id })
    .catch(function (e) { c.resolved = !next; renderNotes(); renderStrip(); msg('Could not update the note: ' + e.message, true); });
}

function setFilter(f) {
  S.filter = f;
  Array.prototype.forEach.call(el('filter').querySelectorAll('[data-f]'), function (b) { b.classList.toggle('on', b.getAttribute('data-f') === f); });
}

function setStatus(st) {
  var a = A(); var prev = a.review_status;
  el('statusPop').hidden = true;
  a.review_status = st; renderHead(); renderStrip();
  call('set_review_status', { asset_id: a.id, review_status: st }).then(function (sc) {
    if (sc.asset && sc.asset.review_status) a.review_status = sc.asset.review_status;
    renderHead(); renderStrip();
  }).catch(function (e) { a.review_status = prev; renderHead(); renderStrip(); msg('Status not changed: ' + e.message, true); });
}

function share() {
  var a = A(); var btn = el('shareBtn');
  btn.disabled = true; msg('Getting a client link...');
  call('list_review_share_links', { target_type: 'asset', target_id: a.id }).then(function (sc) {
    var now = Date.now();
    var live = (sc.share_links || []).filter(function (l) { return !l.revoked && l.share_url && (!l.expires_at || Date.parse(l.expires_at) > now); })[0];
    return live || call('create_review_share_link', { target_type: 'asset', target_id: a.id }).then(function (r) { return r.share_link; });
  }).then(function (link) {
    if (!link || !link.share_url) throw new Error('no link returned');
    return writeClipboard(link.share_url).then(function (ok) {
      msg(ok ? 'Client link copied. Guests can watch and comment without a Kolbo account.' : 'Client link: ' + link.share_url);
    });
  }).catch(function (e) { msg('Could not create a client link: ' + e.message, true); })
    .then(function () { btn.disabled = false; });
}

function sendToAgent() {
  var a = A(); var n = openCount(a.id);
  window.kolbo.sendMessage('Apply the ' + (n ? n + ' ' : '') + 'open Kolbo Review notes on "' + a.name + '" (review asset ' + a.id + '). Read them with list_review_comments, fix the cut against their timecodes, then upload the new cut with add_review_version and resolve each note you addressed.');
  msg('Sent to the agent.');
}

el('vid').addEventListener('loadedmetadata', function () {
  var v = el('vid'); S.dur = isFinite(v.duration) ? v.duration : 0;
  fitStage(v.videoWidth, v.videoHeight); renderHead(); renderMarkers(); renderTime();
});
el('vid').addEventListener('timeupdate', function () { if (!S.playing) return; S.t = el('vid').currentTime || 0; renderTime(); });
el('vid').addEventListener('ended', function () { setPlaying(false); });
el('stage').onclick = function () { setPlaying(!S.playing); };
el('scrub').addEventListener('pointerdown', function (e) {
  var mk = e.target.closest && e.target.closest('[data-seek]');
  if (mk) { seek(+mk.getAttribute('data-seek')); return; }
  var sc = el('scrub'), r = sc.getBoundingClientRect();
  function at(ev) { seek(((ev.clientX - r.left) / r.width) * S.dur); }
  at(e);
  try { sc.setPointerCapture(e.pointerId); } catch (x) {}
  function move(ev) { at(ev); }
  function up() { sc.removeEventListener('pointermove', move); sc.removeEventListener('pointerup', up); sc.removeEventListener('pointercancel', up); }
  sc.addEventListener('pointermove', move);
  sc.addEventListener('pointerup', up);
  sc.addEventListener('pointercancel', up);
});
el('strip').onclick = function (e) { var b = e.target.closest('[data-i]'); if (b) selectAsset(+b.getAttribute('data-i')); };
el('ta').oninput = syncCompose;
el('ta').onfocus = function () { setPlaying(false); };
el('ta').onkeydown = function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); post(); } };
el('tcBtn').onclick = function () { seek(S.t); };
el('rangeBtn').onclick = function () { S.range = !S.range; el('rangeBtn').classList.toggle('on', S.range); renderTime(); };
el('cancelReply').onclick = function () { S.replyTo = null; syncCompose(); };
el('post').onclick = post;
el('list').onclick = function (e) {
  var s = e.target.closest('[data-seek]'); if (s) { seek(+s.getAttribute('data-seek')); return; }
  var r = e.target.closest('[data-res]'); if (r) { toggleResolve(r.getAttribute('data-res')); return; }
  var rp = e.target.closest('[data-reply]'); if (rp) { S.replyTo = rp.getAttribute('data-reply'); syncCompose(); el('ta').focus(); }
};
el('filter').onclick = function (e) { var b = e.target.closest('[data-f]'); if (b) { setFilter(b.getAttribute('data-f')); renderNotes(); } };
el('statusPop').innerHTML = Object.keys(STATUS).map(function (k) { return '<button type="button" data-s="' + k + '"><span class="rv-chip-dot" style="background:' + STATUS[k][1] + '"></span>' + STATUS[k][0] + '</button>'; }).join('');
el('statusBtn').onclick = function (e) { e.stopPropagation(); el('statusPop').hidden = !el('statusPop').hidden; window.kolbo.notifySize(); };
el('statusPop').onclick = function (e) { var b = e.target.closest('[data-s]'); if (b) setStatus(b.getAttribute('data-s')); };
document.addEventListener('click', function (e) { if (!e.target.closest || !e.target.closest('.rv-menu')) el('statusPop').hidden = true; });
el('shareBtn').onclick = share;
el('agentBtn').onclick = sendToAgent;
el('openBtn').onclick = function () { if (A().open_url) window.kolbo.openLink(A().open_url); };
el('logo').onclick = function () { window.kolbo.openLink((A() && A().open_url) || 'https://app.kolbo.ai/review'); };

function render(result) {
  var sc = (result && result.structuredContent) || structured(result);
  var assets = sc && (Array.isArray(sc.assets) ? sc.assets : (sc.asset ? [sc.asset] : []));
  assets = (assets || []).filter(function (a) { return a && a.id; });
  el('loading').hidden = true;
  if (!assets.length || (result && result.isError)) { el('main').hidden = true; el('error').hidden = false; window.kolbo.notifySize(); return; }
  el('error').hidden = true; el('main').hidden = false;
  var prev = A() && A().id;
  S.assets = assets;
  var want = prev || sc.active_asset_id;
  var idx = 0; for (var i = 0; i < assets.length; i++) if (assets[i].id === want) idx = i;
  S.ai = idx;
  if (Array.isArray(sc.comments) && assets[idx]) S.comments[assets[idx].id] = sc.comments;
  renderStrip(); loadMedia(); renderNotes(); syncCompose();
}
window.kolbo.onToolResult(render);
window.kolbo.ready(function (ctx) {
  if (ctx && ctx.toolInfo && ctx.toolInfo.result) render(ctx.toolInfo.result);
});
`;

function reviewWidgetHtml() {
  return widgetPage({ title: 'Kolbo Review', body: BODY, script: SCRIPT });
}

module.exports = { reviewWidgetHtml };
