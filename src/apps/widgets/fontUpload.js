'use strict';
const { widgetPage } = require('../html');
function fontUploadWidgetHtml() {
  return widgetPage({ title: 'My Fonts', body: '<div class="k-card"><div class="k-head">Upload to My Fonts</div><div class="k-body"><p>One OTF, TTF or WOFF2 file · up to 5 MiB</p><input id="font" type="file" accept=".otf,.ttf,.woff2" aria-label="Choose font"><button id="external" type="button">Open browser upload</button><p id="status" role="status"></p></div></div>', script: `
var state;
window.kolbo.onToolResult(function(result) { state = result.structuredContent || structured(result); });
function endpoint() {
  if (!state) throw new Error('Waiting for upload ticket.');
  var url = new URL(state.upload_url);
  if (url.protocol !== 'https:' || !['api.kolbo.ai','upload-api.kolbo.ai'].includes(url.host) || url.pathname !== '/api/v1/fonts/ticket-upload' || url.search || url.hash || url.username || url.password) throw new Error('Unsupported font upload endpoint. Use a shell upload ticket instead.');
  if (!Number.isFinite(Date.parse(state.expires_at)) || Date.now() >= Date.parse(state.expires_at)) throw new Error('Ticket expired. Open a new font upload card.');
  if (!/^[A-Za-z0-9_-]{43}$/.test(state.token)) throw new Error('Invalid upload ticket. Open a new card.');
  return url;
}
el('external').onclick = async function() {
  try {
    var url = endpoint();
    url.pathname = '/api/v1/fonts/upload-ui';
    url.hash = 'ticket=' + encodeURIComponent(state.token);
    await window.kolbo.openLink(url.href);
    el('font').disabled = true;
    this.disabled = true;
    el('status').textContent = 'After uploading in the browser, return with the preparation ID shown there.';
  } catch(error) { el('status').textContent = error.message; }
};
el('font').onchange = async function() {
  var file = this.files[0];
  if (!file || !state) return;
  if (!/\\.(otf|ttf|woff2)$/i.test(file.name) || file.size > 5242880 || !file.size) { el('status').textContent = 'Choose a font up to 5 MiB.'; return; }
  this.disabled = true;
  el('external').disabled = true;
  el('status').textContent = 'Uploading font…';
  try {
    var url = endpoint();
    var body = new FormData(); body.append('file', file);
    var response = await fetch(url.href, {method:'POST',headers:{Authorization:'Bearer '+state.token},body:body,credentials:'omit',redirect:'error',signal:AbortSignal.timeout(65000)});
    var result = await response.json();
    if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Upload failed. Open a new font upload card to retry.');
    el('status').textContent = 'Uploaded. Preparing font…';
    await window.kolbo.updateModelContext('Font uploaded to My Fonts. Poll get_font_upload_status before generating: '+JSON.stringify(result.data));
  } catch(error) { el('status').textContent = error.message; }
  window.kolbo.notifySize();
};` });
}
module.exports = { fontUploadWidgetHtml };
