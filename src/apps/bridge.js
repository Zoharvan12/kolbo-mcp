'use strict';

/**
 * Minimal MCP Apps iframe bridge (io.modelcontextprotocol/ui, protocol 2026-01-26).
 *
 * Injected as an inline <script> into every ui://kolbo/* widget. Hand-rolled instead
 * of shipping the 337KB @modelcontextprotocol/ext-apps browser bundle — implements the
 * same JSON-RPC-over-postMessage handshake the official App class performs:
 *
 *   widget → host  request      ui/initialize { appInfo, appCapabilities, protocolVersion }
 *   widget → host  notification ui/notifications/initialized
 *   host  → widget notification ui/notifications/tool-result | tool-input | host-context-changed
 *   widget → host  request      tools/call | ui/message | ui/open-link
 *   widget → host  notification ui/notifications/size-changed
 *
 * Host-bound calls made before the handshake completes are queued (avoids the
 * hidden-iframe race documented in claude-ai-mcp#61/#149).
 *
 * Exposed global: window.kolbo
 *   .ready(fn)                 — fn(hostContext) after handshake
 *   .onToolResult(fn)          — fn(result) for ui/notifications/tool-result
 *   .onThemeChange(fn)         — fn(hostContext) on host-context-changed
 *   .callTool(name, args)      — Promise<CallToolResult>
 *   .sendMessage(text)         — append a user chat message (returns Promise)
 *   .openLink(url)             — open external URL
 *   .copyText(text)            — copy via the host clipboard (ui/copy-text)
 *   .notifySize()              — report content size to host
 */

const BRIDGE_JS = `
(function () {
  var nextId = 1;
  var pending = {};      // id -> {resolve, reject}
  var initialized = false;
  var queue = [];        // deferred host-bound sends until initialized
  var hostContext = null;
  var readyFns = [], toolResultFns = [], themeFns = [], toolInputFns = [];

  function post(msg) { window.parent.postMessage(msg, '*'); }

  function request(method, params) {
    return new Promise(function (resolve, reject) {
      var id = nextId++;
      pending[id] = { resolve: resolve, reject: reject };
      var msg = { jsonrpc: '2.0', id: id, method: method, params: params || {} };
      if (initialized || method === 'ui/initialize') post(msg);
      else queue.push(msg);
    });
  }

  function notify(method, params) {
    var msg = { jsonrpc: '2.0', method: method, params: params || {} };
    if (initialized || method === 'ui/notifications/initialized') post(msg);
    else queue.push(msg);
  }

  window.addEventListener('message', function (ev) {
    var m = ev.data;
    if (!m || m.jsonrpc !== '2.0') return;
    if (m.id != null && (m.result !== undefined || m.error !== undefined)) {
      var p = pending[m.id];
      if (!p) return;
      delete pending[m.id];
      if (m.error) p.reject(new Error(m.error.message || 'host error'));
      else p.resolve(m.result);
      return;
    }
    if (m.method === 'ui/notifications/tool-result') {
      toolResultFns.forEach(function (f) { try { f(m.params || {}); } catch (e) {} });
    } else if (m.method === 'ui/notifications/tool-input' || m.method === 'ui/notifications/tool-input-partial') {
      // Fires while the tool is still RUNNING — lets widgets show a real
      // "preparing" state instead of a blank card until the result lands.
      toolInputFns.forEach(function (f) { try { f((m.params && m.params.arguments) || {}, m.params || {}); } catch (e) {} });
    } else if (m.method === 'ui/notifications/host-context-changed') {
      hostContext = (m.params && m.params.hostContext) || m.params || hostContext;
      themeFns.forEach(function (f) { try { f(hostContext); } catch (e) {} });
    } else if (m.method === 'ui/resource-teardown' && m.id != null) {
      post({ jsonrpc: '2.0', id: m.id, result: {} });
    } else if (m.id != null) {
      // Unknown host request — respond empty so the host isn't left hanging.
      post({ jsonrpc: '2.0', id: m.id, result: {} });
    }
  });

  request('ui/initialize', {
    protocolVersion: '2026-01-26',
    appInfo: { name: 'kolbo-widget', version: '1.0.0' },
    appCapabilities: {}
  }).then(function (res) {
    hostContext = (res && res.hostContext) || null;
    notify('ui/notifications/initialized');
    initialized = true;
    queue.forEach(post);
    queue = [];
    readyFns.forEach(function (f) { try { f(hostContext); } catch (e) {} });
  }).catch(function () { /* host without apps support — widget stays static */ });

  var fsMode = false; // fullscreen: the HOST owns layout — size reports there
                      // made the inline iframe balloon over the chat composer.
  function notifySize() {
    if (fsMode) return;
    // Measure the widget card itself — documentElement.scrollHeight over-reports
    // in some hosts and leaves a huge empty iframe below the card.
    var card = document.querySelector('.k-card');
    var rect = card ? card.getBoundingClientRect() : null;
    var height = rect ? Math.ceil(rect.bottom + 8) : document.documentElement.scrollHeight;
    // Ceiling comes from the SCREEN, never window.innerHeight. Inside an iframe
    // innerHeight IS the height the host already granted, so clamping to it made
    // the request a feedback loop: once the host capped us, we could never ask
    // for more than the cap, and any content past it became an inner scrollbar
    // that no amount of growing could clear. The host clamps too, so this is
    // only a sanity ceiling.
    var ceiling = (window.screen && window.screen.availHeight) || 1200;
    height = Math.min(height, Math.max(ceiling, 500));
    notify('ui/notifications/size-changed', {
      width: document.documentElement.scrollWidth, height: height
    });
    markDraggable();
  }

  // Every image/video in a widget can be dragged straight into the host's
  // composer. <img> is natively draggable but <video> is not, and neither sets
  // a clean URL, so both get an explicit dragstart carrying text/uri-list —
  // exactly the format the composer's drop handler already reads.
  // Hooked off notifySize because that is the one thing every render path
  // already calls, so new render sites are covered without touching them.
  function markDraggable() {
    var nodes = document.querySelectorAll('img[src], video[src]');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (node.getAttribute('data-kolbo-drag')) continue;
      node.setAttribute('data-kolbo-drag', '1');
      node.setAttribute('draggable', 'true');
      node.addEventListener('dragstart', onMediaDragStart);
    }
  }

  function onMediaDragStart(e) {
    var node = e.currentTarget;
    // Strip the #t=0.05 poster fragment videos carry, or the host would attach
    // a URL the CDN answers differently.
    var url = String(node.currentSrc || node.getAttribute('src') || '').split('#')[0];
    if (!/^https?:/i.test(url) || !e.dataTransfer) return;
    e.dataTransfer.setData('text/uri-list', url);
    e.dataTransfer.setData('text/plain', url);
    e.dataTransfer.effectAllowed = 'copy';
  }

  var sizeTimer = null;
  function queueSize(delay) {
    clearTimeout(sizeTimer);
    sizeTimer = setTimeout(notifySize, delay || 120);
  }
  // With ResizeObserver present, attribute churn (class/style toggles) that
  // actually changes layout is caught by RO on the card — observing attributes
  // here would just re-fire on EVERY class/style write. Only watch attributes
  // as a fallback when RO is unavailable.
  new MutationObserver(function () { queueSize(120); })
    .observe(document.documentElement, { childList: true, subtree: true, attributes: !window.ResizeObserver });
  // DOM mutations don't fire when an <img>/<video> finishes loading and reflows
  // the card — without this the host keeps the pre-image height and the card
  // gets an inner scrollbar. ResizeObserver catches every layout change.
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(function () { queueSize(60); });
    ro.observe(document.documentElement);
    ro.observe(document.body);
    var card = document.querySelector('.k-card');
    if (card) ro.observe(card);
  }
  // Belt and suspenders: media load events bubble as capture-phase 'load'.
  document.addEventListener('load', function (e) {
    var t = e.target && e.target.tagName;
    if (t === 'IMG' || t === 'VIDEO') queueSize(60);
  }, true);
  document.addEventListener('loadedmetadata', function () { queueSize(60); }, true);

  window.kolbo = {
    ready: function (f) { if (initialized) f(hostContext); else readyFns.push(f); },
    onToolResult: function (f) { toolResultFns.push(f); },
    onToolInput: function (f) { toolInputFns.push(f); },
    onThemeChange: function (f) { themeFns.push(f); },
    callTool: function (name, args) { return request('tools/call', { name: name, arguments: args || {} }); },
    sendMessage: function (text) {
      return request('ui/message', { role: 'user', content: [{ type: 'text', text: text }] });
    },
    openLink: function (url) { return request('ui/open-link', { url: url }); },
    copyText: function (text) { return request('ui/copy-text', { text: text }); },
    // Hand a piece of this widget's media to the host's composer. Dragging it
    // out cannot work: a widget is a sandboxed cross-origin iframe, so a native
    // HTML5 drag started in here never delivers its dataTransfer to the host
    // document. Hosts that ignore this method simply do nothing.
    attachMedia: function (url) { return request('ui/attach-media', { url: url }); },
    updateModelContext: function (text) {
      return request('ui/update-model-context', { content: [{ type: 'text', text: text }] });
    },
    // Resolves with the mode the host ACTUALLY granted ('inline'|'fullscreen'|'pip').
    requestDisplayMode: function (mode) {
      return request('ui/request-display-mode', { mode: mode });
    },
    notifySize: notifySize,
    // Toggle fullscreen mode: suppresses size reports while the host owns the
    // layout, and re-syncs the inline size on exit.
    setFullscreen: function (on) {
      fsMode = !!on;
      if (!on) queueSize(60);
    },
    hostContext: function () { return hostContext; }
  };
})();
`;

module.exports = { BRIDGE_JS };
