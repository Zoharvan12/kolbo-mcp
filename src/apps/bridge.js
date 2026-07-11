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
 *   .notifySize()              — report content size to host
 */

const BRIDGE_JS = `
(function () {
  var nextId = 1;
  var pending = {};      // id -> {resolve, reject}
  var initialized = false;
  var queue = [];        // deferred host-bound sends until initialized
  var hostContext = null;
  var readyFns = [], toolResultFns = [], themeFns = [];

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

  function notifySize() {
    // Measure the widget card itself — documentElement.scrollHeight over-reports
    // in some hosts and leaves a huge empty iframe below the card.
    var card = document.querySelector('.k-card');
    var rect = card ? card.getBoundingClientRect() : null;
    var height = rect ? Math.ceil(rect.bottom + 8) : document.documentElement.scrollHeight;
    notify('ui/notifications/size-changed', {
      width: document.documentElement.scrollWidth, height: height
    });
  }

  var sizeTimer = null;
  new MutationObserver(function () {
    clearTimeout(sizeTimer);
    sizeTimer = setTimeout(notifySize, 120);
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true });

  window.kolbo = {
    ready: function (f) { if (initialized) f(hostContext); else readyFns.push(f); },
    onToolResult: function (f) { toolResultFns.push(f); },
    onThemeChange: function (f) { themeFns.push(f); },
    callTool: function (name, args) { return request('tools/call', { name: name, arguments: args || {} }); },
    sendMessage: function (text) {
      return request('ui/message', { role: 'user', content: [{ type: 'text', text: text }] });
    },
    openLink: function (url) { return request('ui/open-link', { url: url }); },
    updateModelContext: function (text) {
      return request('ui/update-model-context', { content: [{ type: 'text', text: text }] });
    },
    notifySize: notifySize,
    hostContext: function () { return hostContext; }
  };
})();
`;

module.exports = { BRIDGE_JS };
