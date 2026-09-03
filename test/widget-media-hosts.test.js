'use strict';

// Voice thumbnails rendered as broken-image glyphs in the list_voices widget.
// Two independent causes, both pinned here.
//
// 1. The widget CSP allowlisted PRODUCTION media hosts only, while cdn.js
//    rewrites four environments. 565 of 864 production voice documents still
//    store development-bucket thumbnails, so cdn.js sent them to
//    media-dev.kolbo.ai and the host's img-src dropped every one.
// 2. Only cellHTML had an onerror fallback. Voices are the sole items that
//    render as AUDIO ROWS, which had none — so a blocked thumbnail showed the
//    browser's broken glyph there while cells degraded silently everywhere else.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { HOST_MAP } = require('../src/cdn');
const { WIDGET_CSP } = require('../src/apps');
const { mediaGridWidgetHtml } = require('../src/apps/widgets/mediaGrid');

const CODE_ONLY = (s) => s.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

test('every host cdn.js can emit is allowlisted in the widget CSP', () => {
  const allowed = new Set(WIDGET_CSP.resourceDomains);
  for (const host of new Set(HOST_MAP.flat())) {
    assert.ok(allowed.has(`https://${host}`),
      `https://${host} is reachable through cdn.js but blocked by the widget CSP`);
  }
});

test('CSP covers non-production environments, not just prod', () => {
  for (const host of ['media-dev.kolbo.ai', 'media-staging.kolbo.ai', 'media-sapir.kolbo.ai']) {
    assert.ok(WIDGET_CSP.resourceDomains.includes(`https://${host}`), `${host} missing from CSP`);
  }
});

test('audio rows fall back instead of showing a broken image', () => {
  const html = mediaGridWidgetHtml();
  const fn = CODE_ONLY(html.slice(html.indexOf('function audioRowHTML'), html.indexOf('function wire()')));
  assert.match(fn, /onerror=/, 'audio row <img> has no onerror fallback');
  // Must replace the IMG, not the row: parentNode.innerHTML here would delete
  // the title, subtitle, Use button and audio player along with the avatar.
  assert.match(fn, /this\.outerHTML=/, 'audio row fallback must swap the img itself');
  assert.doesNotMatch(fn, /parentNode\.innerHTML/, 'that would wipe the whole row');
  assert.match(fn, /k-audio-art-fallback/, 'no fallback element rendered');
});

test('every inline widget script is syntactically valid', () => {
  const dir = path.join(__dirname, '..', 'src', 'apps', 'widgets');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const mod = require(path.join(dir, f));
    const build = Object.values(mod).find((v) => typeof v === 'function');
    if (!build) continue;
    for (const [, body] of build().matchAll(/<script>([\s\S]*?)<\/script>/g)) {
      assert.doesNotThrow(() => new Function(body), `${f}: emitted script does not parse`);
    }
  }
});
