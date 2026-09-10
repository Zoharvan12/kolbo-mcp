'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { registerMediaTools } = require('../src/tools/media');
const vm = require('node:vm');
const { mediaGridWidgetHtml } = require('../src/apps/widgets/mediaGrid');

test('list_media preserves every row in large pages for text and widget consumers', async () => {
  let list;
  const calls = [];
  registerMediaTools({ tool(name, ...args) { if (name === 'list_media') list = args.at(-1); } }, {
    async get(url) {
      calls.push(url);
      const page = Number(new URL(url, 'https://example.test').searchParams.get('page') || 1);
      return {
        media: Array.from({ length: 200 }, (_, i) => ({
          id: String((page - 1) * 200 + i), filename: `asset-${i}`, media_type: 'image',
          url: `https://media.kolbo.ai/${'long-path/'.repeat(35)}${i}.png`, project_id: 'project',
        })),
        pagination: { page, page_size: 200, total_items: 400, total_pages: 2, has_next: page < 2 },
      };
    },
  });
  const seen = [];
  for (const page of [1, 2]) {
    const result = await list({ page, page_size: 200, project_id: 'project', category: 'ai' });
    const text = JSON.parse(result.content[0].text);
    assert.equal(text.count, 200);
    assert.equal(text._truncated?.omitted_from_this_page || 0, 0);
    assert.equal(result.structuredContent.items.length, 200);
    assert.equal(result.structuredContent.page_size, 200);
    assert.deepEqual(text.items.map(x => x.id), result.structuredContent.items.map(x => x.id));
    seen.push(...text.items.map(x => x.id));
  }
  assert.equal(new Set(seen).size, 400);
  assert.match(calls[1], /project_id=project/);
  assert.match(calls[1], /page=2/);
});

test('widget reaches page three when later pages omit totals and stops on has_next false', async () => {
  let list;
  registerMediaTools({ tool(name, ...args) { if (name === 'list_media') list = args.at(-1); } }, {
    async get(url) {
      const page = Number(new URL(url, 'https://example.test').searchParams.get('page') || 1);
      return {
        media: [{ id: String(page), filename: `page-${page}`, media_type: 'image' }],
        // Only page 1 knows the total; the rest report -1 (unknown) and lean on has_next.
        pagination: { page, page_size: 1, total_items: page === 1 ? 3 : -1, has_next: page < 3 },
      };
    },
  });

  const elements = {};
  const context = {
    state: null,
    page: 0,
    el: id => elements[id] ||= { style: {}, textContent: '', innerHTML: '', classList: { add() {}, remove() {} } },
    // The grid's own renderers are exercised by scripts/check-widget-render.js;
    // here they are stubbed so the assertions are about PAGING, not markup.
    tileHTML: item => item.id,
    audioRowHTML: item => item.id,
    wire() {},
    ICONS: { chevronLeft: '<', chevronRight: '>' },
    structured: res => res.structuredContent,
    window: { kolbo: { notifySize() {}, callTool: (_, args) => list(args) } },
  };
  vm.createContext(context);

  // Pull the paging half of the widget out of the HTML: the page-size/count/
  // hasMore helpers plus boot/render/pagerHTML, then fetchNextPage.
  const html = mediaGridWidgetHtml();
  vm.runInContext(html.slice(html.indexOf('function isAudio(item)'), html.indexOf('function tileHTML')), context);
  vm.runInContext(html.slice(html.indexOf('function fetchNextPage(btn)'), html.indexOf('function useItem')), context);

  context.boot((await list({ page: 1, page_size: 1 })).structuredContent);
  assert.equal(context.state.total, 3);
  assert.match(elements.stage.innerHTML, /id="page-next"/);
  assert.doesNotMatch(elements.stage.innerHTML, /id="page-next"[^>]*disabled/);

  for (const page of [2, 3]) {
    context.fetchNextPage({ disabled: false, innerHTML: '', textContent: 'Next' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(context.state.page, page);
    assert.equal(context.state.items.length, page);
    // total_items: -1 on later pages must not overwrite the total page 1 gave us.
    assert.equal(context.state.total, 3);
  }

  // has_next:false on the last page retires the control instead of leaving a
  // Next that still looks like it has pages behind it.
  assert.equal(context.state.has_next, false);
  assert.doesNotMatch(elements.stage.innerHTML, /id="page-next"(?![^>]*disabled)/);
});
