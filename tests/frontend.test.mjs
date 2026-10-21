import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {formatDate,createApiAdapter,createTitleApp,createRequestId,canGenerate,canSummarize,canCreate,canSnapshot,newestPendingRevision,revisionChanges,versionSourceLabel,validComparison,validItems,versionItems,provenanceLabel,exportProject} from '../public/app.js';
import {createDemoAdapter} from '../public/demo.js';
const item=(id='name',label='中文名稱',content='讓日常，被看見')=>({id,label,content});
async function call(api,action,p,extra={}){return (await api.request(action,{id:p.id,itemId:p.activeItemId,revision:p.revision,...extra})).project;}
async function readyProject(api){
 let p=(await api.request('new',{title:'測試專案',description:'校園影展'})).project;
 for(const text of ['海報','同學','日常故事'])p=await call(api,'discuss',p,{text,consent:true});
 p=await call(api,'summarize',p,{consent:true});
 return call(api,'approve_goal',p);
}
test('request IDs use secure random 32-character lowercase hex',()=>{
 const a=createRequestId(webcrypto),b=createRequestId(webcrypto);assert.match(a,/^[a-f0-9]{32}$/);assert.notEqual(a,b);assert.throws(()=>createRequestId(null));
});
test('goal summary and generation are separate, lifecycle-aware gates',()=>{
 const p={messages:[{role:'student'},{role:'student'}],phase:'discussion',goalApprovedAt:null,lifecycle:'in_progress'};
 assert.equal(canSummarize(p),false);p.messages.push({role:'student'});assert.equal(canSummarize(p),true);assert.equal(canGenerate(p),false);
 p.phase='summary';assert.equal(canGenerate(p),false);p.phase='ready';p.goalApprovedAt='2026-01-01';assert.equal(canGenerate(p),true);
 p.lifecycle='finalized';assert.equal(canGenerate(p),false);assert.equal(canCreate(p),false);assert.equal(canSummarize(p),false);
});
test('comparison requires 2–5 distinct existing versions, including official',()=>{
 const p={versions:[{id:'a'},{id:'b'},{id:'c'}],officialVersionId:'a'};
 assert.equal(validComparison(['a','b'],p),true);assert.equal(validComparison(['a'],p),false);assert.equal(validComparison(['a','a'],p),false);assert.equal(validComparison(['a','missing'],p),false);
});
test('extensible items validate stable IDs, names, content, UTF-8 and limits',()=>{
 assert.equal(validItems([item()]),true);assert.equal(validItems([item('custom','任何自訂項目','內容')]),true);
 for(const invalid of [[],[item('', '名稱','內容')],[item('x','', '內容')],[item('x','名稱','')],[item(),item()],[item('a','中文名稱','一'),item('b',' 中文名稱 ','二')],[item('x','字'.repeat(41),'內容')],[item('x','名稱','字'.repeat(2001))],Array.from({length:13},(_,i)=>item('i'+i))])assert.equal(validItems(invalid),false);
 const v={items:[item()]};const copied=versionItems(v);copied[0].content='新內容';assert.notEqual(copied[0].content,v.items[0].content);
});
test('provenance labels use immutable request data and distinguish missing actual model',()=>{
 assert.equal(provenanceLabel({provider:'scripted',requestedModel:'固定腳本',actualModel:'非 AI'}),'固定腳本 · 非 AI');
 assert.match(provenanceLabel({provider:'openai',requestedModel:'model-a',actualModel:'model-b'}),/model-a.*model-b/);
 assert.match(provenanceLabel({provider:'ollama',requestedModel:'local',actualModel:null}),/實際模型未回報/);
 assert.equal(provenanceLabel(null),'模型來源未記錄');
});
test('explicit export allowlists project content, excludes keys/session/settings',()=>{
 const p={id:'p',title:'專案',description:'說明',lifecycle:'created',module:'titles',phase:'discussion',revision:1,messages:[],versions:[],comparisons:[],key:'NEVER_EXPORT',csrf:'NEVER_EXPORT',settings:{key:'NEVER_EXPORT'}};
 const serialized=JSON.stringify(exportProject(p));assert.ok(!serialized.includes('NEVER_EXPORT'));assert.match(serialized,/說明/);assert.equal(exportProject(p).formatVersion,1);
});
test('demo cannot save keys, test providers, or execute unconsented inference',async()=>{
 const api=createDemoAdapter({seed:false});let p=(await api.request('new',{title:'新專案'})).project;
 assert.equal(p.lifecycle,'created');assert.equal(p.versions.length,0);
 for(const action of ['set_key','save_settings','test_connection'])await assert.rejects(api.request(action,{}));
 await assert.rejects(call(api,'discuss',p,{text:'hello'}));
 await assert.rejects(call(api,'summarize',p,{consent:true}));
});
test('three discussions, summary, approval and generation remain separate',async()=>{
 const api=createDemoAdapter({seed:false});let p=await readyProject(api);
 assert.equal(p.phase,'ready');assert.equal(p.versions.length,0);assert.ok(p.goalApprovedAt);
 p=await call(api,'generate',p,{consent:true,requestId:'11111111111111111111111111111111'});
 assert.equal(p.versions.length,3);assert.equal(p.officialVersionId,null);assert.equal(p.lifecycle,'in_progress');
 for(const version of p.versions){assert.deepEqual(version.items.map(x=>({id:x.id,label:x.label})),p.brief.items);assert.equal(version.provenance.provider,'scripted');}
 const again=await call(api,'generate',p,{consent:true,requestId:'11111111111111111111111111111111'});assert.equal(again.versions.length,3);
});
test('whole-group snapshots, lineage, promotion and comparisons preserve originals',async()=>{
 const api=createDemoAdapter({seed:false});let p=await readyProject(api);p=await call(api,'generate',p,{consent:true});
 const original=structuredClone(p.versions[0]);const items=structuredClone(original.items);items[0].content='新的中文名稱';items.push(item('custom-intro','自訂活動簡介','一段新的說明。'));
 p=await call(api,'snapshot',p,{items,rationale:'加入新的項目',basedOnVersionId:original.id});const saved=p.versions.at(-1);
 assert.deepEqual(p.versions[0],original);assert.equal(saved.basedOnVersionId,original.id);assert.equal(saved.items.length,4);assert.equal(saved.provenance,null);
 p=await call(api,'promote',p,{versionId:saved.id});p=await call(api,'generate',p,{consent:true});assert.equal(p.officialVersionId,saved.id);
 p=await call(api,'compare',p,{versionIds:[saved.id,original.id],consent:true});assert.equal(p.officialVersionId,saved.id);assert.equal(p.lifecycle,'in_progress');assert.equal(p.comparisons.length,1);
 assert.deepEqual(p.versions[0],original);assert.deepEqual(p.comparisons[0].versionIds,[saved.id,original.id]);
});
test('finalization snapshots entire group; reopen and metadata changes preserve history',async()=>{
 const api=createDemoAdapter({seed:false});let p=await readyProject(api);p=await call(api,'generate',p,{consent:true});p=await call(api,'promote',p,{versionId:p.versions[0].id});
 p=await call(api,'finalize',p);const finalized=structuredClone(p.finalizations[0]);assert.equal(p.lifecycle,'finalized');assert.deepEqual(finalized.versionSnapshot.items,p.versions[0].items);
 await assert.rejects(call(api,'discuss',p,{text:'修改',consent:true}));await assert.rejects(call(api,'snapshot',p,{items:[item()]}));
 p=await call(api,'edit_project',p,{title:'重新命名的專案',description:'新的專案說明'});assert.equal(p.lifecycle,'finalized');assert.deepEqual(p.finalizations[0],finalized);
 p=await call(api,'reopen',p);assert.equal(p.lifecycle,'in_progress');assert.deepEqual(p.finalizations[0],finalized);assert.equal(p.goalApprovedAt,null);
});
test('projects reopen independently and returned objects cannot mutate saved history',async()=>{
 const api=createDemoAdapter();const state=await api.request('state');const first=(await api.request('project',{id:state.projects[0].id})).project;
 const saved=structuredClone(first);first.versions[0].items[0].content='should not escape';first.messages[0].text='changed';
 const second=(await api.request('new',{title:'第二個專案',description:'不同的背景'})).project;assert.equal(second.versions.length,0);assert.equal(second.description,'不同的背景');
 assert.deepEqual((await api.request('project',{id:saved.id})).project,saved);assert.equal((await api.request('state')).projects.length,2);
});
test('demo source has no networking or persistent browser storage; rendering never uses HTML injection',async()=>{
 const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');const demo=await readFile(new URL('../public/demo.js',import.meta.url),'utf8');
 assert.ok(!/localStorage|sessionStorage|indexedDB|innerHTML|outerHTML|insertAdjacentHTML/.test(app+demo));
 assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/.test(demo));
 const html=await readFile(new URL('../public/demo.html',import.meta.url),'utf8');assert.match(html,/connect-src 'none'/);assert.match(html,/腳本示範/);
 const view=await readFile(new URL('../app/view.html',import.meta.url),'utf8');assert.match(view,/src="\.\/app\.js\?v=20261021-postfix2"/);assert.match(view,/href="\.\/styles\.css\?v=20261021-postfix2"/);assert.match(html,/demo\.js\?v=20261021-postfix2/);assert.match(demo,/app\.js\?v=20261021-postfix2/);
});
test('creative items isolate discussion, draft source versions, and unavailable capabilities',async()=>{
 const api=createDemoAdapter({seed:false});let p=await readyProject(api);p=await call(api,'generate',p,{consent:true});const originalId=p.activeItemId;const original=structuredClone(p.activeItem);
 p=await call(api,'create_item',p,{type:'titles',title:'第二組名稱',description:'不同的命名任務'});assert.notEqual(p.activeItemId,originalId);assert.equal(p.versions.length,0);assert.equal(p.goalApprovedAt,null);
 await assert.rejects(api.request('discuss',{id:p.id,itemId:originalId,revision:p.revision,text:'錯誤的項目',consent:true}));
 p=await call(api,'select_item',p,{itemId:originalId});assert.deepEqual(p.activeItem,original);
 p=await call(api,'create_item',p,{type:'poster',title:'海報規劃',description:'尚未實作'});assert.equal(canCreate(p),false);
 await assert.rejects(call(api,'discuss',p,{text:'不能生成圖片',consent:true}));await assert.rejects(call(api,'snapshot',p,{items:[item()]}));await assert.rejects(call(api,'finalize',p));
});
test('cross-item references are explicit immutable whole-version copies',async()=>{
 const api=createDemoAdapter({seed:false});let p=await readyProject(api);p=await call(api,'generate',p,{consent:true});const sourceId=p.activeItemId,sourceVersion=structuredClone(p.versions[0]);
 p=await call(api,'create_item',p,{type:'poster',title:'海報規劃',description:'引用名稱'});const targetId=p.activeItemId;
 p=await call(api,'attach_reference',p,{targetItemId:sourceId,versionId:sourceVersion.id});const reference=structuredClone(p.activeItem.references[0]);assert.deepEqual(reference.versionSnapshot,sourceVersion);
 await assert.rejects(call(api,'attach_reference',p,{targetItemId:sourceId,versionId:sourceVersion.id}));
 p=await call(api,'select_item',p,{itemId:sourceId});p=await call(api,'snapshot',p,{items:[item('zh-title','中文名稱','新版本的不同名稱')],basedOnVersionId:sourceVersion.id});
 p=await call(api,'select_item',p,{itemId:targetId});assert.deepEqual(p.activeItem.references[0],reference);
 p=await call(api,'remove_reference',p,{referenceId:reference.id});assert.equal(p.activeItem.references.length,0);const source=p.creativeItems.find(i=>i.id===sourceId);assert.deepEqual(source.versions[0],sourceVersion);
});
test('archive is recoverable; project closure respects every nonarchived item',async()=>{
 const api=createDemoAdapter({seed:false});let p=await readyProject(api);p=await call(api,'generate',p,{consent:true});p=await call(api,'promote',p,{versionId:p.versions[0].id});p=await call(api,'finalize',p);const titleId=p.activeItemId;
 p=await call(api,'create_item',p,{type:'poster',title:'之後再做的海報',description:'先記下來'});const posterId=p.activeItemId;
 await assert.rejects(call(api,'finalize_project',p));p=await call(api,'archive_item',p);assert.equal(p.activeItem.archived,true);
 p=await call(api,'finalize_project',p);assert.equal(p.projectLifecycle,'finalized');assert.equal(p.projectFinalizations[0].items.length,1);const closure=structuredClone(p.projectFinalizations[0]);
 await assert.rejects(call(api,'restore_item',p));p=await call(api,'reopen_project',p);assert.equal(p.projectLifecycle,'in_progress');p=await call(api,'restore_item',p);assert.equal(p.activeItem.archived,false);assert.equal(p.activeItemId,posterId);assert.deepEqual(p.projectFinalizations[0],closure);
 p=await call(api,'select_item',p,{itemId:titleId});assert.equal(p.lifecycle,'finalized');assert.equal(p.finalizations.length,1);
});
test('summary count excludes reference and lifecycle messages from the three discussions',()=>{
 const p={lifecycle:'in_progress',messages:[{role:'student',kind:'discussion'},{role:'student',kind:'reference_added'},{role:'student',kind:'promote'}]};assert.equal(canSummarize(p),false);
});

// Minimal DOM fixture: executes the real renderer/event handlers, not layout/browser emulation.
class FixtureNode {
 constructor(tag,document,text=''){this.tagName=tag.toUpperCase();this.ownerDocument=document;this.children=[];this.parentNode=null;this.attributes={};this.listeners={};this._text=text;this.className='';this.disabled=false;this.checked=false;this.selected=false;this.hidden=false;this.open=false;this.scrollTop=0;this.clientHeight=400;this.selectionStart=0;this.selectionEnd=0;}
 get id(){return this.attributes.id || '';}set id(v){this.attributes.id=v;}
 get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}set textContent(v){this._text=String(v);this.children=[];}
 get value(){if(this._value!==undefined)return this._value;if(this.tagName==='SELECT')return (this.children.find(c=>c.selected)||this.children[0])?.value || '';return this.attributes.value || '';}
 set value(v){this._value=String(v);if(this.tagName==='SELECT')this.children.forEach(c=>{c.selected=c.value===this._value;});}
 get scrollHeight(){return this.children.length*100;}
 get classList(){return {add:value=>{if(!this.className.split(' ').includes(value))this.className+=' '+value;},remove:value=>{this.className=this.className.split(' ').filter(c=>c!==value).join(' ');}};}
 setAttribute(k,v){this.attributes[k]=String(v);if(['disabled','checked','required','hidden'].includes(k))this[k]=true;if(k==='class')this.className=String(v);}
 getAttribute(k){return this.attributes[k]??null;}
 append(...nodes){nodes.flat().forEach(node=>{if(typeof node==='string')node=this.ownerDocument.createTextNode(node);node.parentNode=this;this.children.push(node);});}
 replaceChildren(...nodes){this.children.forEach(n=>{n.parentNode=null;});this.children=[];this._text='';this.append(...nodes);}
 replaceWith(node){const parent=this.parentNode;if(!parent)return;const index=parent.children.indexOf(this);parent.children[index]=node;node.parentNode=parent;this.parentNode=null;}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);this.parentNode=null;}
 matches(selector){if(selector.startsWith('#'))return this.id===selector.slice(1);if(selector.startsWith('.'))return this.className.split(' ').includes(selector.slice(1));return this.tagName===selector.toUpperCase();}
 querySelectorAll(selector){const selectors=selector.split(',').map(v=>v.trim());const out=[];const visit=node=>node.children.forEach(child=>{if(selectors.some(s=>child.matches(s)))out.push(child);visit(child);});visit(this);return out;}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 closest(selector){let n=this;while(n){if(n.matches(selector))return n;n=n.parentNode;}return null;}
 addEventListener(type,callback){(this.listeners[type] ||= []).push(callback);}
 dispatchEvent(event){event=typeof event==='string'?{type:event,preventDefault(){}}:event;return Promise.all((this.listeners[event.type]||[]).map(callback=>callback(event)));}
 focus(){this.ownerDocument.activeElement=this;}
 setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}
 scrollIntoView(){}
 showModal(){this.open=true;}
 close(){this.open=false;}
 checkValidity(){return this.querySelectorAll('input,textarea,select').every(input=>input.disabled || !input.required || !!input.value.trim());}
 reportValidity(){return this.checkValidity();}
}
function fixtureDocument(){
 const doc={activeElement:null,createElement(tag){return new FixtureNode(tag,this);},createTextNode(text){return new FixtureNode('#text',this,text);},getElementById(id){return this.body.id===id?this.body:this.body.querySelector('#'+id);}};
 doc.body=doc.createElement('body');doc.body.dataset={appMode:'fixture'};const root=doc.createElement('div');root.id='app';doc.body.append(root);return {doc,root};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixtureButton(doc,text){const button=doc.body.querySelectorAll('button').find(b=>b.textContent===text);assert.ok(button,`button exists: ${text}`);return button;}
async function fixtureClick(doc,text){const button=fixtureButton(doc,text);assert.equal(button.disabled,false,`button enabled: ${text}`);void button.dispatchEvent('click');await settle();}
async function fixtureFill(doc,id,value){const input=doc.getElementById(id);assert.ok(input,`input exists: ${id}`);input.value=value;await input.dispatchEvent('input');}

test('real renderer DOM fixture initializes, preserves drafts on item switch, and cancels AI without sending',async()=>{
 const originalDocument=globalThis.document,originalListener=globalThis.addEventListener,originalSetTimeout=globalThis.setTimeout;
 const {doc,root}=fixtureDocument();globalThis.document=doc;globalThis.addEventListener=()=>{};globalThis.setTimeout=(handler,delay,...args)=>{const timer=originalSetTimeout(handler,delay,...args);timer.unref?.();return timer;};
 try{
  const source=createDemoAdapter();const calls=[];const adapter={async request(action,payload){calls.push({action,payload});return source.request(action,payload);}};
  await createTitleApp({root,adapter,demo:true});assert.equal(doc.body.querySelectorAll('.creative-item-tab').length,2);assert.equal(doc.body.querySelectorAll('.version-card').length,3);assert.ok(root.textContent.includes('腳本示範，不是真實 AI'));
  await fixtureFill(doc,'editor-title','還沒保存的創作草稿');const tabs=doc.body.querySelectorAll('.creative-item-tab');void tabs[1].dispatchEvent('click');await settle();assert.equal(doc.body.querySelectorAll('.conversation').length,0);assert.ok(root.textContent.includes('這個類型尚未實作'));
  void doc.body.querySelectorAll('.creative-item-tab')[0].dispatchEvent('click');await settle();assert.equal(doc.getElementById('editor-title').value,'還沒保存的創作草稿');
  const before=calls.length;await fixtureClick(doc,'再產生一組候選 ↗');assert.ok(doc.body.querySelector('dialog').open);await fixtureClick(doc,'取消');assert.equal(calls.length,before);assert.equal(doc.getElementById('editor-title').value,'還沒保存的創作草稿');
  await fixtureClick(doc,'＋ 新增創作項目');await fixtureFill(doc,'creative-item-name','第二個命名項目');await fixtureFill(doc,'creative-item-description','獨立任務');await fixtureClick(doc,'新增創作項目');assert.equal(doc.body.querySelectorAll('.creative-item-tab').length,3);assert.equal(doc.body.querySelectorAll('.version-card').length,0);assert.equal(doc.getElementById('editor-title').value,'');
  assert.ok(!calls.some(c=>['discuss','summarize','generate','compare'].includes(c.action)));
 }finally{globalThis.document=originalDocument;globalThis.addEventListener=originalListener;globalThis.setTimeout=originalSetTimeout;}
});
test('real settings DOM fixture preserves history, switches next-call model, clears key before adapter request',async()=>{
 const originalDocument=globalThis.document,originalListener=globalThis.addEventListener,originalSetTimeout=globalThis.setTimeout;
 const {doc,root}=fixtureDocument();globalThis.document=doc;globalThis.addEventListener=()=>{};globalThis.setTimeout=(handler,delay,...args)=>{const timer=originalSetTimeout(handler,delay,...args);timer.unref?.();return timer;};
 try{
  const source=createDemoAdapter(),calls=[];let settings={provider:'ollama',model:'qwen3:8b',settingsRevision:1,keyRevision:0,keyPresent:false,ollamaUrl:'http://127.0.0.1:11434',modelCatalog:{openai:['gpt-5.4-mini'],ollama:['qwen3:8b']}};
  let keyInput=null;
  const adapter={async request(action,payload){calls.push({action,payload});if(action==='state')return {...await source.request('state'),...settings};if(action==='save_settings'){settings={...settings,...payload,settingsRevision:settings.settingsRevision+1};return settings;}if(action==='set_key'){assert.equal(keyInput.value,'');settings={...settings,keyPresent:true,keyRevision:1};return settings;}return source.request(action,payload);}};
  await createTitleApp({root,adapter,demo:false});const history=root.querySelectorAll('.chat-entry').map(n=>n.textContent);
  await fixtureFill(doc,'quick-model','local-custom-model');await fixtureClick(doc,'套用');assert.equal(settings.model,'local-custom-model');assert.deepEqual(root.querySelectorAll('.chat-entry').map(n=>n.textContent),history);
  await fixtureClick(doc,'系統設定');const provider=doc.getElementById('ai-provider');provider.value='openai';await provider.dispatchEvent('change');keyInput=doc.getElementById('api-key');await fixtureFill(doc,'api-key','TEST-ONLY-NOT-A-REAL-KEY');await fixtureClick(doc,'保存設定，不執行 AI');await settle();assert.equal(settings.provider,'openai');assert.equal(settings.keyPresent,true);assert.equal(keyInput.value,'');
  assert.deepEqual(calls.filter(c=>c.action!=='state'&&c.action!=='project').map(c=>c.action),['save_settings','save_settings','set_key']);
  assert.ok(root.querySelectorAll('.model-provenance').some(n=>n.textContent==='固定腳本 · 非 AI'));assert.deepEqual(root.querySelectorAll('.chat-entry').map(n=>n.textContent),history);
 }finally{globalThis.document=originalDocument;globalThis.addEventListener=originalListener;globalThis.setTimeout=originalSetTimeout;}
});

test('key expiry accepts Unix seconds instead of displaying 1970',()=>{
 const seconds=Date.parse('2026-10-21T03:00:00Z')/1000;assert.equal(formatDate(seconds),formatDate('2026-10-21T03:00:00Z'));
});

test('live renderer creates a project through real fetch transport and reopens after bootstrap',async()=>{
 const originals={document:globalThis.document,addEventListener:globalThis.addEventListener,setTimeout:globalThis.setTimeout,fetch:globalThis.fetch,location:globalThis.location};
 const {doc,root}=fixtureDocument();globalThis.document=doc;globalThis.addEventListener=()=>{};globalThis.location={href:'http://localhost/ai-cocreation-series-php74/public/'};
 globalThis.setTimeout=(handler,delay,...args)=>{const timer=originals.setTimeout(handler,delay,...args);timer.unref?.();return timer;};
 const source=createDemoAdapter({seed:false}),calls=[];
 globalThis.fetch=async(url,options)=>{
  const parsed=new URL(url);let action=parsed.searchParams.get('action'),payload=null;
  if(options.method==='POST'){
   payload=JSON.parse(options.body);
   assert.equal(typeof payload.action,'string','PHP requires body.action');
   assert.equal(payload.action,action);assert.equal(options.headers['Content-Type'],'application/json');assert.equal(options.headers['X-CSRF-Token'],'fixture-csrf');
   action=payload.action;
  }else if(action==='project')payload={id:parsed.searchParams.get('id')};
  calls.push({action,payload,method:options.method||'GET'});
  const data=await source.request(action,payload);
  return {ok:true,status:200,json:async()=>action==='state'?{...data,csrf:'fixture-csrf'}:data};
 };
 try{
  await createTitleApp({root,adapter:createApiAdapter(),demo:false});
  await fixtureClick(doc,'建立第一個專案');await fixtureFill(doc,'project-name','修補驗證專案');await fixtureFill(doc,'project-description','新增後立即進入工作區');await fixtureClick(doc,'建立專案');await settle();
  assert.ok(root.textContent.includes('修補驗證專案'));assert.equal(doc.body.querySelectorAll('.creative-item-tab').length,1);
  assert.equal(root.textContent.includes('請求格式不正確。'),false);assert.deepEqual(calls.map(c=>c.action),['state','new']);assert.equal(calls[1].payload.action,'new');
  // A fresh adapter simulates reopening: state supplies CSRF then project uses GET.
  await createTitleApp({root,adapter:createApiAdapter(),demo:false});
  assert.ok(root.textContent.includes('修補驗證專案'));assert.deepEqual(calls.slice(-2).map(c=>({action:c.action,method:c.method})),[{action:'state',method:'GET'},{action:'project',method:'GET'}]);
  assert.ok(!calls.some(c=>['discuss','summarize','generate','compare','set_key'].includes(c.action)));
 }finally{Object.assign(globalThis,originals);}
});

test('revision helpers track the newest unadopted branch and diff by stable item IDs',()=>{
 const base={id:'base',number:1,items:[item('custom','自訂項目','原文'),item('keep','保留','不可變動'),item('remove','舊項目','舊文')]};
 const revised={id:'next',number:2,source:'revision',basedOnVersionId:'base',items:[item('custom','自訂項目','新文'),item('keep','保留','不可變動'),item('added','新項目','新文')]};
 const p={lifecycle:'in_progress',officialVersionId:'base',goalApprovedAt:null,versions:[base,revised],messages:[]};
 assert.equal(canSnapshot(p),true);assert.equal(canGenerate(p),false);assert.equal(newestPendingRevision(p),revised);
 assert.deepEqual(revisionChanges(base,revised).map(c=>[c.id,c.kind]),[['custom','changed'],['keep','unchanged'],['remove','removed'],['added','added']]);
 assert.equal(versionSourceLabel(revised),'AI 討論修改版');assert.equal(versionSourceLabel(revised,true),'腳本修改版');
 p.messages.push({kind:'promote',versionIds:['next']});assert.equal(newestPendingRevision(p),null);
 p.versions.push({...revised,id:'later',number:3});assert.equal(newestPendingRevision(p).id,'later');
 p.officialVersionId='later';assert.equal(newestPendingRevision(p),null);p.lifecycle='finalized';assert.equal(canSnapshot(p),false);
 assert.equal(canSnapshot({lifecycle:'in_progress',versions:[],officialVersionId:'missing'}),false);
});

test('demo discussion refines official full bundles repeatedly only after explicit adoption',async()=>{
 const api=createDemoAdapter({seed:false});let p=await readyProject(api);p=await call(api,'generate',p,{consent:true});
 const custom=[item('custom-title','自訂作品名稱','專屬原名稱'),item('en-title','英文名稱','Keep My Custom English'),item('tagline','獨特標語','不要改動我的標語。'),item('custom-short','策展短文','只屬於這份專案的長篇內容。')];
 p=await call(api,'snapshot',p,{items:custom,basedOnVersionId:p.versions[0].id});const original=structuredClone(p.versions.at(-1));
 p=await call(api,'promote',p,{versionId:original.id});const approval=p.goalApprovedAt,history=structuredClone(p.versions),messages=structuredClone(p.messages);
 const payload={id:p.id,itemId:p.activeItemId,revision:p.revision,officialVersionId:p.officialVersionId,text:'請把第一項內容改為「第一輪的新名稱」',consent:true,requestId:'revision-fixture-1'};
 const result=await api.request('discuss',payload);p=result.project;const revision=p.versions.at(-1);
 assert.equal(result.revisionVersionId,revision.id);assert.equal(revision.source,'revision');assert.equal(revision.basedOnVersionId,original.id);assert.equal(revision.items[0].content,'第一輪的新名稱');assert.equal(revision.items[0].id,custom[0].id);assert.equal(revision.items[0].label,custom[0].label);assert.deepEqual(revision.items.slice(1),custom.slice(1));
 assert.equal(p.officialVersionId,original.id);assert.equal(p.goalApprovedAt,approval);assert.deepEqual(p.versions.slice(0,-1),history);assert.deepEqual(p.messages.slice(0,messages.length),messages);assert.equal(revision.provenance.provider,'scripted');
 const linked=p.messages.find(m=>m.id===revision.messageId);assert.equal(linked.kind,'revision');assert.deepEqual(linked.versionIds,[revision.id]);assert.deepEqual(linked.provenance,revision.provenance);
 const replay=await api.request('discuss',payload);assert.equal(replay.revisionVersionId,revision.id);assert.deepEqual(replay.project,p);
 p=await call(api,'promote',p,{versionId:revision.id});assert.equal(newestPendingRevision(p),null);
 p=await call(api,'discuss',p,{text:'請把第一項內容改為「第二輪的新名稱」',consent:true});const second=p.versions.at(-1);
 assert.equal(second.basedOnVersionId,revision.id);assert.equal(p.officialVersionId,revision.id);assert.equal(second.items[0].content,'第二輪的新名稱');assert.deepEqual(second.items.slice(1),custom.slice(1));assert.deepEqual(p.versions.find(v=>v.id===revision.id),revision);assert.deepEqual(p.versions.find(v=>v.id===original.id),original);
 // Without adopting the second revision, a third request still uses the current official.
 p=await call(api,'discuss',p,{text:'請把第一項內容改為「尚未採用時的新分支」',consent:true});assert.equal(p.versions.at(-1).basedOnVersionId,revision.id);assert.equal(p.officialVersionId,revision.id);assert.equal(newestPendingRevision(p).id,p.versions.at(-1).id);
});

test('vague questions and no-op demo changes ask for clarification without fake revisions or goal resets',async()=>{
 const api=createDemoAdapter();let p=(await api.request('project',{id:(await api.request('state')).projects[0].id})).project;
 const versions=structuredClone(p.versions),official=p.officialVersionId,approval=p.goalApprovedAt,phase=p.phase;
 for(const text of ['這個方向你覺得如何？','修改一下',`請把第一項內容改為「${p.versions.find(v=>v.id===official).items[0].content}」`]){
  const result=await api.request('discuss',{id:p.id,itemId:p.activeItemId,revision:p.revision,text,consent:true});p=result.project;
  assert.equal(result.revisionVersionId,undefined);assert.deepEqual(p.versions,versions);assert.equal(p.officialVersionId,official);assert.equal(p.goalApprovedAt,approval);assert.equal(p.phase,phase);assert.equal(p.messages.at(-1).kind,'clarification');assert.match(p.messages.at(-1).text,/沒有新增修改版/);assert.equal(p.messages.at(-1).versionIds,undefined);
 }
});

test('existing official can be revised and manually saved with legacy null approval while finalize guards remain',async()=>{
 const api=createDemoAdapter();let p=(await api.request('project',{id:(await api.request('state')).projects[0].id})).project;
 const original=structuredClone(p.versions.find(v=>v.id===p.officialVersionId));
 p=await call(api,'edit_project',p,{title:p.title,description:'舊版流程留下未確認目標的情境'});assert.equal(p.goalApprovedAt,null);assert.equal(canGenerate(p),false);assert.equal(canSnapshot(p),true);
 p=await call(api,'discuss',p,{text:'請把第一項內容改為「仍能繼續修改」',consent:true});assert.equal(p.versions.at(-1).source,'revision');assert.equal(p.versions.at(-1).basedOnVersionId,original.id);assert.equal(p.goalApprovedAt,null);
 p=await call(api,'snapshot',p,{items:original.items,basedOnVersionId:original.id});assert.equal(p.versions.at(-1).source,'snapshot');await assert.rejects(call(api,'finalize',p));await assert.rejects(call(api,'generate',p,{consent:true}));
 assert.deepEqual(p.versions.find(v=>v.id===original.id),original);
});

test('finalized official blocks discussion until reopened and new revisions preserve finalization snapshot',async()=>{
 const api=createDemoAdapter();let p=(await api.request('project',{id:(await api.request('state')).projects[0].id})).project;
 p=await call(api,'finalize',p);const original=structuredClone(p.finalizations[0]);
 await assert.rejects(call(api,'discuss',p,{text:'請把第一項內容改為「定稿後修改」',consent:true}));
 p=await call(api,'reopen',p);p=await call(api,'discuss',p,{text:'請把第一項內容改為「重新開啟後修改」',consent:true});assert.equal(p.lifecycle,'in_progress');assert.equal(p.versions.at(-1).source,'revision');assert.deepEqual(p.finalizations[0],original);assert.equal(p.officialVersionId,original.versionId);
});

async function fixtureDialogClick(doc,text){
 const dialog=doc.body.querySelector('dialog');assert.ok(dialog,`dialog exists for ${text}`);
 const target=dialog.querySelectorAll('button').find(b=>b.textContent===text);assert.ok(target,`dialog button exists: ${text}`);assert.equal(target.disabled,false);void target.dispatchEvent('click');await settle();
}

test('real renderer plus real fetch adapter promotes, revises, reviews and adopts whole bundles repeatedly',async()=>{
 const originals={document:globalThis.document,addEventListener:globalThis.addEventListener,setTimeout:globalThis.setTimeout,fetch:globalThis.fetch,location:globalThis.location};
 const {doc,root}=fixtureDocument();globalThis.document=doc;globalThis.addEventListener=()=>{};globalThis.location={href:'http://localhost/ai-cocreation-series-php74/public/'};
 globalThis.setTimeout=(handler,delay,...args)=>{const timer=originals.setTimeout(handler,delay,...args);timer.unref?.();return timer;};
 const source=createDemoAdapter({seed:false}),calls=[];let savedProject=await readyProject(source);savedProject=await call(source,'generate',savedProject,{consent:true});
 const custom=[item('own-name','專屬名稱','原始自訂名稱'),item('own-en','外文名稱','Keep This English'),item('own-note','策展短文','不得遺失的自訂短文與細節。'),item('own-fifth','特殊欄位','自己的內容，不可被通用樣板取代。')];
 savedProject=await call(source,'snapshot',savedProject,{items:custom,basedOnVersionId:savedProject.versions[0].id});const original=structuredClone(savedProject.versions.at(-1));
 globalThis.fetch=async(url,options)=>{
  const parsed=new URL(url);const action=parsed.searchParams.get('action');let payload={};
  if(options.method==='POST'){payload=JSON.parse(options.body);assert.equal(payload.action,action);assert.equal(options.headers['X-CSRF-Token'],'fixture-csrf');}
  else if(action==='project')payload={id:parsed.searchParams.get('id')};
  calls.push({action,payload});const data=await source.request(action,payload);if(data.project)savedProject=data.project;
  return {ok:true,status:200,json:async()=>action==='state'?{...data,csrf:'fixture-csrf',provider:'ollama',model:'fixture-local-model',settingsRevision:7,keyPresent:false}:data};
 };
 try{
  await createTitleApp({root,adapter:createApiAdapter(),demo:false});
  const candidate=doc.getElementById(`version-${original.id}`);void candidate.querySelectorAll('button').find(b=>b.textContent==='設為正式版').dispatchEvent('click');await settle();await fixtureDialogClick(doc,'設為正式版');
  assert.equal(savedProject.officialVersionId,original.id);assert.equal(doc.body.querySelector('.official-card').textContent.includes('原始自訂名稱'),true);
  assert.ok(doc.body.querySelector('.official-card').textContent.includes('手動編輯這一版'));assert.ok(doc.body.querySelector('.official-card').textContent.includes('請 AI 繼續修改'));
  const approval=savedProject.goalApprovedAt;
  await fixtureFill(doc,'chat-input','請把第一項內容改為「第一輪明確修改」');await fixtureClick(doc,'送出想法 ↗');
  assert.match(doc.body.querySelector('dialog').textContent,/新增一份完整的待審修改版/);assert.match(doc.body.querySelector('dialog').textContent,/不會自動變更或定稿/);
  const beforeCalls=calls.length;await fixtureDialogClick(doc,'取消');assert.equal(calls.length,beforeCalls);assert.equal(doc.getElementById('chat-input').value,'請把第一項內容改為「第一輪明確修改」');
  await fixtureClick(doc,'送出想法 ↗');await fixtureDialogClick(doc,'同意傳送並執行');
  const first=structuredClone(savedProject.versions.at(-1));assert.equal(first.source,'revision');assert.equal(first.basedOnVersionId,original.id);assert.equal(savedProject.officialVersionId,original.id);assert.equal(savedProject.goalApprovedAt,approval);
  const request=calls.find(c=>c.action==='discuss').payload;assert.equal(request.officialVersionId,original.id);assert.equal(request.consent,true);assert.equal(request.approvedProvider,'ollama');assert.equal(request.approvedModel,'fixture-local-model');assert.equal(request.approvedSettingsRevision,7);assert.match(request.requestId,/^[a-f0-9]{32}$/);
  let panel=doc.getElementById('revision-review');assert.ok(panel);assert.equal(panel.querySelectorAll('.bundle-item').length,4);assert.match(panel.textContent,/第一輪明確修改/);assert.match(panel.textContent,/原始自訂名稱/);assert.match(panel.textContent,/1 項有變動，3 項維持不變/);assert.match(panel.textContent,/固定腳本 · 非 AI/);assert.match(panel.textContent,/未採用時，下次仍以目前正式版為起點/);
  custom.slice(1).forEach(field=>assert.ok(panel.textContent.includes(field.content)));assert.equal(doc.body.querySelectorAll('#version-'+first.id).length,1);assert.match(doc.body.querySelector('.official-card').textContent,/原始自訂名稱/);assert.equal(doc.getElementById('chat-input').value,'');
  await fixtureClick(doc,'採用這次修改');await fixtureDialogClick(doc,'取消');assert.equal(savedProject.officialVersionId,original.id);
  await fixtureClick(doc,'採用這次修改');await fixtureDialogClick(doc,'確認採用這次修改');assert.equal(savedProject.officialVersionId,first.id);assert.equal(doc.getElementById('revision-review'),null);assert.match(doc.body.querySelector('.official-card').textContent,/第一輪明確修改/);
  await fixtureFill(doc,'chat-input','請把第一項內容改為「第二輪接續修改」');await fixtureClick(doc,'送出想法 ↗');await fixtureDialogClick(doc,'同意傳送並執行');const second=structuredClone(savedProject.versions.at(-1));
  assert.equal(second.basedOnVersionId,first.id);assert.equal(savedProject.officialVersionId,first.id);assert.deepEqual(second.items.slice(1),custom.slice(1));assert.deepEqual(savedProject.versions.find(v=>v.id===original.id),original);assert.deepEqual(savedProject.versions.find(v=>v.id===first.id),first);
  panel=doc.getElementById('revision-review');assert.match(panel.textContent,/第一輪明確修改/);assert.match(panel.textContent,/第二輪接續修改/);assert.ok(root.querySelectorAll('.history-row').some(n=>n.textContent.includes('AI 討論修改版') && n.textContent.includes('固定腳本 · 非 AI')));
  const count=savedProject.versions.length;await fixtureFill(doc,'chat-input','還有什麼想法？');await fixtureClick(doc,'送出想法 ↗');await fixtureDialogClick(doc,'同意傳送並執行');assert.equal(savedProject.versions.length,count);assert.match(doc.getElementById('app-toast').textContent,/這次沒有新增修改版/);assert.equal(savedProject.officialVersionId,first.id);assert.ok(doc.getElementById('revision-review'));
  // Reload bootstraps the pending review from saved data, rather than transient UI state.
  await createTitleApp({root,adapter:createApiAdapter(),demo:false});assert.match(doc.getElementById('revision-review').textContent,/第二輪接續修改/);
  await fixtureClick(doc,'採用這次修改');await fixtureDialogClick(doc,'確認採用這次修改');await fixtureClick(doc,'此項目定稿');await fixtureDialogClick(doc,'確認結案定稿');
  const finalized=structuredClone(savedProject.finalizations[0]);assert.equal(doc.getElementById('chat-input').disabled,true);assert.match(root.textContent,/請先按「重新開啟此項目」/);
  await fixtureClick(doc,'重新開啟此項目');await fixtureDialogClick(doc,'重新開啟討論');assert.equal(doc.getElementById('chat-input').disabled,false);
  await fixtureFill(doc,'chat-input','請把第一項內容改為「定稿後重新開啟再修改」');await fixtureClick(doc,'送出想法 ↗');await fixtureDialogClick(doc,'同意傳送並執行');assert.equal(savedProject.versions.at(-1).basedOnVersionId,second.id);assert.deepEqual(savedProject.finalizations[0],finalized);
 }finally{Object.assign(globalThis,originals);}
});

test('real renderer does not block official manual edits or discussion when old goal approval is null',async()=>{
 const originals={document:globalThis.document,addEventListener:globalThis.addEventListener,setTimeout:globalThis.setTimeout};
 const {doc,root}=fixtureDocument();globalThis.document=doc;globalThis.addEventListener=()=>{};globalThis.setTimeout=(handler,delay,...args)=>{const timer=originals.setTimeout(handler,delay,...args);timer.unref?.();return timer;};
 try{
  const source=createDemoAdapter();let p=(await source.request('project',{id:(await source.request('state')).projects[0].id})).project;
  p=await call(source,'edit_project',p,{title:p.title,description:'重現尚未確認目標的舊專案'});
  await createTitleApp({root,adapter:source,demo:true});assert.equal(fixtureButton(doc,'再產生一組候選 ↗').disabled,true);assert.match(root.textContent,/不影響針對現有正式版繼續修改或另存/);
  await fixtureClick(doc,'手動編輯這一版');assert.equal(doc.getElementById('save-snapshot').disabled,false);await fixtureFill(doc,'editor-title','手動修改仍可保存');assert.equal(doc.getElementById('save-snapshot').disabled,false);await fixtureClick(doc,'整組另存為新版本');assert.match(root.textContent,/手動修改仍可保存/);
  await fixtureFill(doc,'chat-input','請把第一項內容改為「舊專案也能繼續討論修改」');await fixtureClick(doc,'送出想法 ↗');await fixtureDialogClick(doc,'執行示範');assert.match(doc.getElementById('revision-review').textContent,/舊專案也能繼續討論修改/);assert.equal(fixtureButton(doc,'此項目定稿').disabled,true);
 }finally{Object.assign(globalThis,originals);}
});

test('live PHP promotion history does not resurrect an already-adopted revision after selecting its old base',()=>{
 const a={id:'official-a',number:1,source:'generated',items:[item()]};
 const b={id:'revision-b',number:2,source:'revision',basedOnVersionId:a.id,items:[item('name','中文名稱','修改後內容')]};
 const p={officialVersionId:a.id,versions:[a,b],messages:[{kind:'promotion',versionIds:[a.id]}]};assert.equal(newestPendingRevision(p),b);
 p.officialVersionId=b.id;p.messages.push({kind:'promotion',versionIds:[b.id]});assert.equal(newestPendingRevision(p),null);
 p.officialVersionId=a.id;p.messages.push({kind:'promotion',versionIds:[a.id]});assert.equal(newestPendingRevision(p),null);
 const fresh={...b,id:'revision-c',number:3};p.versions.push(fresh);assert.equal(newestPendingRevision(p),fresh);
 p.messages.push({kind:'promote',versionIds:[fresh.id]});assert.equal(newestPendingRevision(p),null);
});
