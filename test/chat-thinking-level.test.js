const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),vm=require('vm'),path=require('path'),{createRequire}=require('module');
function load(file,stubs){const filename=path.resolve(__dirname,'../src/tools',file),real=createRequire(filename),module={exports:{}};vm.runInNewContext(fs.readFileSync(filename,'utf8'),{require:id=>stubs[id]||real(id),module,exports:module.exports,console,process,URL},{filename});return module.exports;}
function chat(){const calls=[],tools={};const server={tool:(name,description,schema,handler)=>tools[name]={schema,handler}};
 const client={post:async(path,body)=>{calls.push({path,body});return {message_id:'id'};}};
 const shared={pollOrTimedOut:async()=>({result:{result:{content:'ok'}}}),creditFields:()=>({}),projectIdField:require('zod').z.string().optional()};
 load('chat.js',{'./_shared':shared,'../apps':{canonicalModelId:async(client,id)=>id}}).registerChatTools(server,client);return {calls,tool:tools.chat_send_message};}
test('optional thinking arg forwards unchanged and legacy calls omit it',async()=>{
 const {calls,tool}=chat();assert.equal(tool.schema.thinking_level.safeParse(undefined).success,true);assert.equal(tool.schema.thinking_level.safeParse({effort:'high'}).success,false);
 await tool.handler({message:'test',model:'model',thinking_level:' HIGH '});assert.equal(calls[0].path,'/v1/chat');assert.equal(calls[0].body.thinking_level,' HIGH ');
 await tool.handler({message:'legacy',model:'model'});assert.equal('thinking_level' in calls[1].body,false);
});
test('text discovery includes exact server levels and default',async()=>{
 const tools={};const server={tool:(name,description,schema,handler)=>tools[name]=handler};
 const client={get:async()=>({models:[{id:'model',identifier:'model',name:'Model',types:['text'],summary:'Balanced',haveThinking:true,thinkingLevels:[{id:'low',label:'Low'},{id:'max',label:'Max'}],thinkingDefault:'low'}]})};
 const apps={UI:{catalog:'catalog'},uiResult:(ui,text,data)=>({text,data}),appsEnabled:()=>false,resolveAvatarUrl:x=>x};
 load('models.js',{'../apps':apps}).registerModelTools(server,client);
 const r=await tools.list_models({type:'text'});assert.match(r.text,/thinking_level: low\/max \(default low\)/);
});
