'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { generationWidgetHtml } = require('../src/apps/widgets/generation');

test('generation reference images and videos opt into the inline viewer', () => {
  const html = generationWidgetHtml();
  const context = { esc: value => value, ICONS: {} };
  vm.createContext(context);
  vm.runInContext(html.slice(html.indexOf('var REF_VIDEO_RE'), html.indexOf('function templateHTML')), context);
  const rendered = context.referenceHTML({
    reference_images: ['https://media.kolbo.ai/source.jpg'],
    reference_videos: ['https://media.kolbo.ai/motion.mp4'],
  });
  assert.equal((rendered.match(/data-peek-inline="true"/g) || []).length, 2);
  assert.ok(!rendered.includes('<a '));
});

// Execute the production click handler and lightbox with a small DOM fixture.
// Host requests are recorded so this catches accidental navigation/fullscreen.
function mountPreview({ inline, granted = 'fullscreen' }) {
  const html = generationWidgetHtml();
  const source = html.slice(html.indexOf('// In-widget lightbox'), html.indexOf('// Every inline <video controls>'));
  const nodes = new Map();
  const classes = new Set();
  const handlers = {};
  const modes = [];
  const links = [];
  function element(id) {
    const attrs = {};
    const node = {
      id, hidden: true, children: [], innerHTML: '', textContent: '',
      classList: { toggle() {} },
      setAttribute(k, v) { attrs[k] = v; },
      getAttribute(k) { return attrs[k] || null; },
      removeAttribute(k) { delete attrs[k]; },
      addEventListener() {}, querySelector() { return null; }, pause() {},
      appendChild(child) { nodes.set(child.id, child); },
    };
    return node;
  }
  for (const id of ['card', 'peek-close', 'peek-dl', 'peek-prev', 'peek-next',
    'peek-img', 'peek-video', 'peek-cap', 'peek-count', 'peek-strip', 'peek-stage']) {
    nodes.set(id, element(id));
  }
  const refs = [1, 2].map(i => {
    const node = element('ref-' + i);
    node.setAttribute('data-peek', 'https://media.kolbo.ai/ref-' + i + '.jpg');
    node.setAttribute('data-peek-kind', 'image');
    node.setAttribute('data-peek-cap', 'Reference ' + i);
    if (inline) node.setAttribute('data-peek-inline', 'true');
    node.closest = selector => selector === '[data-peek]' ? node : null;
    node.contains = () => false;
    node.parentNode = { querySelectorAll: () => refs };
    return node;
  });
  const context = {
    el: id => nodes.get(id), esc: value => value,
    ICONS: {}, downloadUrl: value => value,
    document: {
      querySelector: () => nodes.get('card'), querySelectorAll: () => [],
      createElement: () => element(''),
      documentElement: { classList: {
        add: value => classes.add(value), remove: value => classes.delete(value),
      } },
      addEventListener: (name, fn) => { handlers[name] = fn; },
    },
    window: { kolbo: {
      notifySize() {}, onThemeChange() {}, setFullscreen() {},
      requestDisplayMode: mode => { modes.push(mode); return Promise.resolve({ mode: granted }); },
      openLink: url => links.push(url),
    } },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  let prevented = false;
  let stopped = false;
  handlers.click({ target: refs[0], preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
  return { context, nodes, modes, links, prevented, stopped, classes };
}

test('reference clicks stay in the card, page through references, and close without host navigation', async () => {
  const w = mountPreview({ inline: true });
  await Promise.resolve();
  assert.equal(w.prevented, true);
  assert.equal(w.stopped, true);
  assert.equal(w.nodes.get('peek').hidden, false);
  assert.equal(w.nodes.get('peek-img').getAttribute('src'), 'https://media.kolbo.ai/ref-1.jpg');
  assert.equal(w.nodes.get('peek-count').textContent, '1 / 2');
  w.context.stepPeek(1);
  assert.equal(w.nodes.get('peek-img').getAttribute('src'), 'https://media.kolbo.ai/ref-2.jpg');
  assert.deepEqual(w.modes, []);
  assert.deepEqual(w.links, []);
  w.context.closePeek();
  assert.equal(w.nodes.get('peek').hidden, true);
  assert.equal(w.classes.has('k-peek-open'), false);
  assert.deepEqual(w.modes, []);
});

test('result previews keep fullscreen and inline fallback when the host refuses', async () => {
  for (const granted of ['fullscreen', 'inline']) {
    const w = mountPreview({ inline: false, granted });
    await Promise.resolve();
    assert.deepEqual(w.modes, ['fullscreen']);
    assert.equal(w.nodes.get('peek').hidden, false);
    assert.equal(w.classes.has('k-peek-fs'), granted === 'fullscreen');
    assert.deepEqual(w.links, []);
  }
});
