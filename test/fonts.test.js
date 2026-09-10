'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { registerFontTools } = require('../src/tools/fonts');
const { z } = require('zod');
const path = require('node:path');
function setup(client = {}, options = {}) {
  const tools = {};
  registerFontTools({ tool: (name, description, schema, handler) => tools[name] = {schema, handler} }, client, options);
  return tools;
}
test('remote upload cannot read server-local files', async () => {
  await assert.rejects(setup().upload_font.handler({file_path:path.resolve(__filename)}), /server-local file access is disabled/);
});
test('embedded servers default to denying local file access, even without remote options', async () => {
  const { createServer } = require('../src');
  const server = createServer({apiKey:'test-only',apps:false});
  await assert.rejects(server._registeredTools.upload_font.handler({file_path:path.resolve(__filename)}), /server-local file access is disabled/);
});
test('local multipart serializes bytes with the production client contract', async () => {
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kolbo-font-test-'));
  const file = path.join(dir, 'font.otf');
  try {
    await fs.copyFile(__filename, file);
    let called = false;
    const tools = setup({postMultipart: async (route, form) => {
      called = true;
      assert.equal(route, '/v1/fonts');
      const body = form.getBuffer().toString();
      assert.ok(body.includes('filename="font.otf"'));
      assert.ok(body.includes(await fs.readFile(file, 'utf8')));
      assert.ok(body.includes('name="language"'));
      return {data:{id:'a'.repeat(24),status:'processing'}};
    }}, {allowLocalFiles:true});
    await tools.upload_font.handler({file_path:file,language:'he'});
    assert.ok(called);
    await assert.rejects(tools.upload_font.handler({file_path:__filename}), /OTF/);
  } finally { await fs.unlink(file).catch(() => {}); await fs.rmdir(dir); }
});
test('library operations use dedicated routes and reject malformed IDs', async () => {
  const calls = [];
  const client = Object.fromEntries(['get','patch','delete','post'].map(method => [method, async (...args) => {calls.push([method,...args]); return {data:{}};}]));
  const tools = setup(client);
  const id = 'a'.repeat(24);
  await tools.get_font.handler({font_id:id});
  await tools.get_font_upload_status.handler({upload_id:id});
  await tools.rename_font.handler({font_id:id,name:'My Font'});
  await tools.delete_font.handler({font_id:id});
  await tools.create_font_upload_ticket.handler({});
  assert.deepEqual(calls.map(c => c[1]), ['/v1/fonts/'+id,'/v1/fonts/uploads/'+id,'/v1/fonts/'+id,'/v1/fonts/'+id,'/v1/fonts/upload-tickets']);
  assert.equal(z.object(tools.get_font.schema).safeParse({font_id:'../other'}).success,false);
  await tools.list_fonts.handler({source:'global',search:'Noto',limit:12});
  const listUrl = new URL(calls.at(-1)[1], 'https://example.test');
  assert.equal(listUrl.pathname, '/v1/fonts');
  assert.equal(listUrl.searchParams.get('source'), 'global');
  assert.equal(z.object(tools.list_fonts.schema).safeParse({source:'another-account'}).success,false);
});
test('image, edit, batch and Director payloads retain selected family IDs', async () => {
  const { registerGenerateTools } = require('../src/tools/generate');
  const tools = {};
  const calls = [];
  const client = {
    request: async () => ({models:[]}),
    post: async (route, body) => {calls.push({route,body}); return {generation_id:'a'.repeat(24),session_id:'b'.repeat(24)};},
  };
  registerGenerateTools({tool:(name, description, schema, handler)=>tools[name]={schema,handler}}, client, {asyncGenerations:true});
  const font_ids = ['c'.repeat(24)];
  for (const name of ['generate_image','generate_image_edit','generate_creative_director']) {
    assert.equal(tools[name].schema.font_ids.safeParse(font_ids).success,true);
    assert.equal(tools[name].schema.font_ids.safeParse(Array(4).fill(font_ids[0])).success,false);
    await tools[name].handler({prompt:'Exact copy',font_ids,source_images:['https://media.kolbo.ai/image.png'],workflow_type:'image'});
  }
  for (const name of ['generate_image','generate_image_edit']) {
    await tools[name].handler({prompts:['One','Two'],font_ids,source_images:['https://media.kolbo.ai/image.png']});
  }
  assert.equal(calls.length,7);
  for (const call of calls) assert.deepEqual(call.body.font_ids,font_ids);
});
