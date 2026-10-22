'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { registerGenerateTools } = require('../src/tools/generate');
function harness() {
  const tools = new Map(), requests = [];
  const stop = new Error('STOP_BEFORE_PAID_SUBMISSION');
  const client = { apiBase: `test-${Math.random()}`, get: async () => ({ models: [] }),
    post: async (url, body) => { requests.push({url,body}); throw stop; } };
  registerGenerateTools({ tool(name,description,schema,handler) {tools.set(name,{schema,handler});} },client,{asyncGenerations:true});
  return { tools, requests, stop };
}
test('Kling4 native frame controls forward without introducing unsupported provider fields',async()=>{
  const {tools,requests,stop}=harness();
  const tool=tools.get('generate_video_from_image');
  assert.ok(tool.schema.last_frame_url && tool.schema.keyframe_images);
  assert.equal(tool.schema.multi_prompt,undefined);
  const frames=['https://media.example.com/mid.png'];
  await assert.rejects(tool.handler({image_url:'https://media.example.com/first.png',prompt:'Camera moves',model:'kling/v4/text-to-video',
    last_frame_url:'https://media.example.com/last.png',keyframe_images:frames}),error=>error===stop);
  assert.deepEqual(requests[0].body.keyframe_images,frames);
  assert.equal(requests[0].body.last_frame_url,'https://media.example.com/last.png');
});
test('Kling4 reference and video-edit tools preserve an explicit false sound flag',async()=>{
  for(const [name,args]of [
    ['generate_elements',{prompt:'@Video1 moves',model:'kling/v4/reference-to-video',reference_videos:['https://media.example.com/a.mp4']}],
    ['generate_video_from_video',{prompt:'Change lighting',model:'kling/v4/video-edit',source_video:'https://media.example.com/a.mp4'}],
  ]) {
    const {tools,requests,stop}=harness();
    await assert.rejects(tools.get(name).handler({...args,keep_original_sound:false}),error=>error===stop);
    assert.equal(requests[0].body.keep_original_sound,false);
  }
});
