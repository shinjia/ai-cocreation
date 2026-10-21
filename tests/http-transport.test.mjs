import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createApiAdapter,ApiError} from '../public/app.js';

// These tests run the REAL browser transport and capture the exact serialized
// fetch envelope. The receiver checks the same envelope contract as api.php;
// it is NOT PHP, a network server, a real credential, or an AI provider.
const csrf='fixture-csrf-token';
function fixture(t,handler){
 const originalFetch=globalThis.fetch,originalLocation=globalThis.location;
 globalThis.location={href:'http://localhost/ai-cocreation-series-php74/public/'};
 globalThis.fetch=handler;
 t.after(()=>{globalThis.fetch=originalFetch;globalThis.location=originalLocation;});
}
function response(data,status=200){return {ok:status>=200&&status<300,status,json:async()=>data};}
function phpEnvelopeContract(options){
 const input=JSON.parse(options.body);
 if(!input || Array.isArray(input) || typeof input!=='object' || typeof input.action!=='string')return response({error:{code:'INVALID_INPUT',message:'請求格式不正確。'}},400);
 return response({accepted:input});
}
test('real fetch transport creates project with required body action, CSRF and JSON content type',async t=>{
 const requests=[];fixture(t,async(url,options)=>{
   requests.push({url:new URL(url),options});
   return options.method==='POST'?phpEnvelopeContract(options):response({csrf,projects:[]});
 });
 const api=createApiAdapter();await api.request('state');
 const payload={title:'校園影展命名',description:'新增專案，不使用 AI'};
 const result=await api.request('new',payload);
 assert.deepEqual(result.accepted,{...payload,action:'new'});
 assert.deepEqual(payload,{title:'校園影展命名',description:'新增專案，不使用 AI'});
 const {url,options}=requests[1];assert.equal(url.searchParams.get('action'),'new');
 assert.equal(options.method,'POST');assert.equal(options.headers['Content-Type'],'application/json');
 assert.equal(options.headers['X-CSRF-Token'],csrf);assert.equal(options.credentials,'same-origin');
 assert.equal(options.cache,'no-store');assert.equal(options.redirect,'error');
});
test('every mutation route serializes authoritative action alongside unchanged payload',async t=>{
 fixture(t,async(url,options)=>options.method==='POST'?phpEnvelopeContract(options):response({csrf}));
 const api=createApiAdapter();await api.request('state');
 const actions=['new','edit_project','create_item','select_item','edit_item','archive_item','restore_item','attach_reference','remove_reference','finalize_project','reopen_project','discuss','summarize','approve_goal','generate','snapshot','promote','archive_version','restore_version','compare','finalize','reopen','save_settings','save_members','select_member','list_models','set_key','clear_key','test_connection'];
 for(const action of actions){
   const payload={id:'project-fixture',itemId:'item-fixture',revision:2,text:'測試文字',requestId:'test-request',consent:true};
   const result=await api.request(action,payload);
   assert.deepEqual(result.accepted,{...payload,action},action);
 }
 assert.equal((await api.request('clear_key',{})).accepted.action,'clear_key');
 assert.equal((await api.request('new',{action:'generate',title:'request argument wins'})).accepted.action,'new');
});
test('initial state and subsequent project reopen remain GET with query ID, no body or credentials in URL',async t=>{
 const calls=[];fixture(t,async(url,options)=>{calls.push({url:new URL(url),options});return response({csrf,project:{id:'p1'}});});
 const api=createApiAdapter();await api.request('state');await api.request('project',{id:'p1',irrelevant:'not-in-url'});
 for(const {options} of calls){assert.equal(options.method,undefined);assert.equal(options.body,undefined);assert.equal(options.headers['Content-Type'],undefined);}
 assert.equal(calls[0].url.searchParams.get('action'),'state');assert.equal(calls[1].url.searchParams.get('action'),'project');
 assert.equal(calls[1].url.searchParams.get('id'),'p1');assert.equal(calls[1].url.searchParams.has('irrelevant'),false);
});
test('missing action control reproduces exact PHP rejection and adapter surfaces 400 without retry',async t=>{
 assert.equal((await phpEnvelopeContract({body:JSON.stringify({title:'no action'})}).json()).error.message,'請求格式不正確。');
 let count=0;fixture(t,async()=>{count++;return response({error:{code:'INVALID_INPUT',message:'請求格式不正確。'}},400);});
 await assert.rejects(createApiAdapter().request('new',{title:'fixture'}),e=>e instanceof ApiError&&e.message==='請求格式不正確。'&&e.status===400&&e.uncertain===false);
 assert.equal(count,1);
});
test('maximum valid whole-bundle metadata survives bounded JSON transport even with escaped text',async t=>{
 fixture(t,async(url,options)=>options.method==='POST'?phpEnvelopeContract(options):response({csrf}));
 const source=await readFile(new URL('../public/api.php',import.meta.url),'utf8');
 const cap=Number(source.match(/strlen\(\$raw\)<=(\d+)/)[1]);assert.equal(cap,262144);
 const api=createApiAdapter();await api.request('state');
 const payload={id:'a'.repeat(32),itemId:'b'.repeat(32),revision:7,basedOnVersionId:'c'.repeat(32),versionMode:'minor',goalText:'\u0001'.repeat(6000),rationale:'\u0001'.repeat(2000),items:Array.from({length:12},(_,i)=>({id:String(i).padStart(64,'x'),label:String(i).padStart(120,'\u0001'),content:'\u0001'.repeat(2000)}))};
 const result=await api.request('snapshot',payload),bytes=Buffer.byteLength(JSON.stringify(result.accepted));
 assert.ok(bytes>32768);assert.ok(bytes<=cap);assert.deepEqual(result.accepted.items,payload.items);assert.equal(result.accepted.action,'snapshot');
});
