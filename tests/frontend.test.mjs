import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {memberRosterError,enabledMembers,activeMember,aiSetupReason,formatDate,createApiAdapter,createTitleApp,createRequestId,canGenerate,canSummarize,canCreate,canSnapshot,newestPendingRevision,revisionChanges,versionSourceLabel,versionLabel,versionCoordinates,nextVersionCoordinates,isArchivedVersion,comparisonDisabledReason,comparisonQuestionError,versionGoalText,versionGoalAndRationale,combinedMetadataError,officialItemTitle,snapshotMetadataError,comparisonUsesSnapshots,COMPARISON_SNAPSHOT_NOTE,validComparison,validItems,versionItems,provenanceLabel,exportProject} from '../public/app.js';
import {createDemoAdapter} from '../public/demo.js';
const item=(id='name',label='中文名稱',content='讓日常，被看見')=>({id,label,content});
async function call(api,action,p,extra={}){return (await api.request(action,{id:p.id,itemId:p.activeItemId,revision:p.revision,...extra})).project;}
async function readyProject(api){
 let p=(await api.request('new',{title:'測試專案',description:'社區影展'})).project;
 for(const text of ['海報','居民與創作者','日常故事'])p=await call(api,'discuss',p,{text,consent:true});
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
 const view=await readFile(new URL('../app/view.html',import.meta.url),'utf8');assert.match(view,/src="\.\/app\.js\?v=20261021-version4"/);assert.match(view,/href="\.\/styles\.css\?v=20261021-version4"/);assert.match(html,/demo\.js\?v=20261021-version4/);assert.match(demo,/app\.js\?v=20261021-version4/);
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

test('real renderer DOM fixture preserves drafts on item switch and cancels setup without sending',async()=>{
 const originalDocument=globalThis.document,originalListener=globalThis.addEventListener,originalSetTimeout=globalThis.setTimeout;
 const {doc,root}=fixtureDocument();globalThis.document=doc;globalThis.addEventListener=()=>{};globalThis.setTimeout=(handler,delay,...args)=>{const timer=originalSetTimeout(handler,delay,...args);timer.unref?.();return timer;};
 try{
  const source=createDemoAdapter();const calls=[];const adapter={async request(action,payload){calls.push({action,payload});return source.request(action,payload);}};
  await createTitleApp({root,adapter,demo:true});assert.equal(doc.body.querySelectorAll('.creative-item-tab').length,2);assert.equal(doc.body.querySelectorAll('.version-card').length,3);assert.ok(root.textContent.includes('腳本示範，不是真實 AI'));
  await fixtureFill(doc,'editor-title','還沒保存的創作草稿');const tabs=doc.body.querySelectorAll('.creative-item-tab');void tabs[1].dispatchEvent('click');await settle();assert.equal(doc.body.querySelectorAll('.conversation').length,0);assert.ok(root.textContent.includes('這個類型尚未實作'));
  void doc.body.querySelectorAll('.creative-item-tab')[0].dispatchEvent('click');await settle();assert.equal(doc.getElementById('editor-title').value,'還沒保存的創作草稿');
  const before=calls.length;await fixtureClick(doc,'AI 系統設定（示範）');assert.ok(doc.body.querySelector('dialog').open);await fixtureClick(doc,'取消');assert.equal(calls.length,before);assert.equal(doc.getElementById('editor-title').value,'還沒保存的創作草稿');
  await fixtureClick(doc,'＋ 新增創作項目');await fixtureFill(doc,'creative-item-name','第二個命名項目');await fixtureFill(doc,'creative-item-description','獨立任務');await fixtureClick(doc,'新增創作項目');assert.equal(doc.body.querySelectorAll('.creative-item-tab').length,3);assert.equal(doc.body.querySelectorAll('.version-card').length,0);assert.equal(doc.getElementById('editor-title').value,'');
  assert.ok(!calls.some(c=>['discuss','summarize','generate','compare'].includes(c.action)));
 }finally{globalThis.document=originalDocument;globalThis.addEventListener=originalListener;globalThis.setTimeout=originalSetTimeout;}
});
test('real settings DOM fixture saves roster, switches next-call member and clears key before adapter request',async()=>{
 const originals={document:globalThis.document,addEventListener:globalThis.addEventListener,setTimeout:globalThis.setTimeout};const {doc,root}=fixtureDocument();globalThis.document=doc;globalThis.addEventListener=()=>{};globalThis.setTimeout=(handler,delay,...args)=>{const timer=originals.setTimeout(handler,delay,...args);timer.unref?.();return timer;};
 try{
  const source=createDemoAdapter(),calls=[];let keyInput=null,keyPresent=false;
  const adapter={async request(action,payload){calls.push({action,payload});if(action==='set_key'){assert.equal(keyInput.value,'');keyPresent=true;return {...await source.request('state'),keyPresent:true,keyRevision:1};}const result=await source.request(action,payload);return action==='state'?{...result,keyPresent}:result;}};
  await createTitleApp({root,adapter,demo:false});const history=root.querySelectorAll('.chat-entry').map(node=>node.textContent),first=(await source.request('state')).members[0];
  await fixtureClick(doc,'系統設定');await fixtureFill(doc,`member-nickname-${first.id}`,'小光改名');await fixtureFill(doc,`member-model-${first.id}`,'local-custom-model');doc.getElementById('ai-usage-consent').checked=true;keyInput=doc.getElementById('api-key');await fixtureFill(doc,'api-key','TEST-ONLY-NOT-A-REAL-KEY');await fixtureClick(doc,'保存成員與使用設定');await settle();
  const state=await source.request('state');assert.equal(state.members[0].nickname,'小光改名');assert.equal(state.members[0].model,'local-custom-model');assert.equal(keyInput.value,'');assert.equal(keyPresent,true);assert.deepEqual(root.querySelectorAll('.chat-entry').map(node=>node.textContent),history);assert.ok(root.querySelectorAll('.model-provenance').some(node=>node.textContent.includes('小光（固定腳本）')));
  assert.deepEqual(calls.filter(call=>!['state','project'].includes(call.action)).map(call=>call.action),['save_members','set_key']);assert.ok(!calls.some(call=>['discuss','summarize','generate','compare','list_models'].includes(call.action)));
 }finally{Object.assign(globalThis,originals);}
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
  return {ok:true,status:200,json:async()=>action==='state'?{...data,csrf:'fixture-csrf',provider:'ollama',model:'固定腳本',keyPresent:false}:data.csrf?{...data,csrf:'fixture-csrf'}:data};
 };
 try{
  await createTitleApp({root,adapter:createApiAdapter(),demo:false});
  const candidate=doc.getElementById(`version-${original.id}`);void candidate.querySelectorAll('button').find(b=>b.textContent==='設為正式版').dispatchEvent('click');await settle();await fixtureDialogClick(doc,'設為正式版');
  assert.equal(savedProject.officialVersionId,original.id);assert.equal(doc.body.querySelector('.official-card').textContent.includes('原始自訂名稱'),true);
  assert.ok(doc.body.querySelector('.official-card').textContent.includes('手動編輯這一版'));assert.ok(doc.body.querySelector('.official-card').textContent.includes('請 AI 繼續修改'));
  const approval=savedProject.goalApprovedAt;
  await fixtureFill(doc,'chat-input','請把第一項內容改為「第一輪明確修改」');await fixtureClick(doc,'送出想法 ↗');assert.equal(doc.body.querySelector('dialog'),null);await settle();
  assert.equal(calls.filter(call=>call.action==='discuss').length,1);assert.match(doc.getElementById('revision-review').textContent,/正式版仍是/);
  const first=structuredClone(savedProject.versions.at(-1));assert.equal(first.source,'revision');assert.equal(first.basedOnVersionId,original.id);assert.equal(savedProject.officialVersionId,original.id);assert.equal(savedProject.goalApprovedAt,approval);
  const request=calls.find(c=>c.action==='discuss').payload;assert.equal(request.officialVersionId,original.id);assert.equal(request.consent,true);assert.equal(request.approvedProvider,'ollama');assert.equal(request.approvedModel,'固定腳本');assert.equal(request.approvedSettingsRevision,0);assert.match(request.requestId,/^[a-f0-9]{32}$/);
  let panel=doc.getElementById('revision-review');assert.ok(panel);assert.equal(panel.querySelectorAll('.bundle-item').length,4);assert.match(panel.textContent,/第一輪明確修改/);assert.match(panel.textContent,/原始自訂名稱/);assert.match(panel.textContent,/1 項有變動，3 項維持不變/);assert.match(panel.textContent,/固定腳本 · 非 AI/);assert.match(panel.textContent,/未採用時，下次仍以目前正式版為起點/);
  custom.slice(1).forEach(field=>assert.ok(panel.textContent.includes(field.content)));assert.equal(doc.body.querySelectorAll('#version-'+first.id).length,1);assert.match(doc.body.querySelector('.official-card').textContent,/原始自訂名稱/);assert.equal(doc.getElementById('chat-input').value,'');
  await fixtureClick(doc,'採用這次修改');await fixtureDialogClick(doc,'取消');assert.equal(savedProject.officialVersionId,original.id);
  await fixtureClick(doc,'採用這次修改');await fixtureDialogClick(doc,'確認採用這次修改');assert.equal(savedProject.officialVersionId,first.id);assert.equal(doc.getElementById('revision-review'),null);assert.match(doc.body.querySelector('.official-card').textContent,/第一輪明確修改/);
  await fixtureFill(doc,'chat-input','請把第一項內容改為「第二輪接續修改」');await fixtureClick(doc,'送出想法 ↗');assert.equal(doc.body.querySelector('dialog'),null);await settle();const second=structuredClone(savedProject.versions.at(-1));
  assert.equal(second.basedOnVersionId,first.id);assert.equal(savedProject.officialVersionId,first.id);assert.deepEqual(second.items.slice(1),custom.slice(1));assert.deepEqual(savedProject.versions.find(v=>v.id===original.id),original);assert.deepEqual(savedProject.versions.find(v=>v.id===first.id),first);
  panel=doc.getElementById('revision-review');assert.match(panel.textContent,/第一輪明確修改/);assert.match(panel.textContent,/第二輪接續修改/);assert.ok(root.querySelectorAll('.history-row').some(n=>n.textContent.includes('AI 討論修改版') && n.textContent.includes('固定腳本 · 非 AI')));
  const count=savedProject.versions.length;await fixtureFill(doc,'chat-input','還有什麼想法？');await fixtureClick(doc,'送出想法 ↗');assert.equal(doc.body.querySelector('dialog'),null);await settle();assert.equal(savedProject.versions.length,count);assert.match(doc.getElementById('app-toast').textContent,/這次沒有新增修改版/);assert.equal(savedProject.officialVersionId,first.id);assert.ok(doc.getElementById('revision-review'));
  // Reload bootstraps the pending review from saved data, rather than transient UI state.
  await createTitleApp({root,adapter:createApiAdapter(),demo:false});assert.match(doc.getElementById('revision-review').textContent,/第二輪接續修改/);
  await fixtureClick(doc,'採用這次修改');await fixtureDialogClick(doc,'確認採用這次修改');await fixtureClick(doc,'此項目定稿');await fixtureDialogClick(doc,'確認結案定稿');
  const finalized=structuredClone(savedProject.finalizations[0]);assert.equal(doc.getElementById('chat-input').disabled,true);assert.match(root.textContent,/請先按「重新開啟此項目」/);
  await fixtureClick(doc,'重新開啟此項目');await fixtureDialogClick(doc,'重新開啟討論');assert.equal(doc.getElementById('chat-input').disabled,false);
  await fixtureFill(doc,'chat-input','請把第一項內容改為「定稿後重新開啟再修改」');await fixtureClick(doc,'送出想法 ↗');assert.equal(doc.body.querySelector('dialog'),null);await settle();assert.equal(savedProject.versions.at(-1).basedOnVersionId,second.id);assert.deepEqual(savedProject.finalizations[0],finalized);
 }finally{Object.assign(globalThis,originals);}
});

test('real renderer does not block official manual edits or discussion when old goal approval is null',async()=>{
 const originals={document:globalThis.document,addEventListener:globalThis.addEventListener,setTimeout:globalThis.setTimeout};
 const {doc,root}=fixtureDocument();globalThis.document=doc;globalThis.addEventListener=()=>{};globalThis.setTimeout=(handler,delay,...args)=>{const timer=originals.setTimeout(handler,delay,...args);timer.unref?.();return timer;};
 try{
  const source=createDemoAdapter();let p=(await source.request('project',{id:(await source.request('state')).projects[0].id})).project;
  p=await call(source,'edit_project',p,{title:p.title,description:'重現尚未確認目標的舊專案'});
  await createTitleApp({root,adapter:source,demo:true});assert.equal(fixtureButton(doc,'再產生一組候選 ↗').disabled,true);assert.match(root.textContent,/不影響針對現有正式版繼續修改或另存/);
  await fixtureClick(doc,'手動編輯這一版');assert.equal(doc.getElementById('save-snapshot').disabled,false);await fixtureFill(doc,'editor-title','手動修改仍可保存');assert.equal(doc.getElementById('save-snapshot').disabled,false);await fixtureClick(doc,doc.getElementById('save-snapshot').textContent);assert.match(root.textContent,/手動修改仍可保存/);
  await fixtureFill(doc,'chat-input','請把第一項內容改為「舊專案也能繼續討論修改」');await fixtureClick(doc,'送出想法 ↗');assert.equal(doc.body.querySelector('dialog'),null);await settle();assert.match(doc.getElementById('revision-review').textContent,/舊專案也能繼續討論修改/);assert.equal(fixtureButton(doc,'此項目定稿').disabled,true);
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

test('two-level numbering reads legacy snapshots and allocates major and minor branches without collisions',()=>{
 const legacy={id:'legacy',number:5};const minor={id:'minor',number:6,major:5,minor:2};const p={versions:[legacy,minor,{id:'later',number:7,major:6,minor:0}],archivedVersionIds:['minor']};
 assert.equal(versionLabel(legacy),'V5');assert.equal(versionLabel(minor),'V5.2');assert.deepEqual(versionCoordinates(legacy),{major:5,minor:0});
 assert.deepEqual(nextVersionCoordinates(p),{major:7,minor:0});assert.deepEqual(nextVersionCoordinates(p,'minor',legacy),{major:5,minor:3});assert.equal(nextVersionCoordinates(p,'minor'),null);assert.deepEqual(legacy,{id:'legacy',number:5});
});

test('comparison guards explain selection, lifecycle, uncertainty and UTF-8 limits without requiring goal approval',()=>{
 const p={lifecycle:'in_progress',phase:'discussion',goalApprovedAt:null,versions:Array.from({length:6},(_,i)=>({id:`v${i}`})),archivedVersionIds:['v5']};
 assert.equal(comparisonDisabledReason(p,['v0','v1']), '');assert.equal(comparisonUsesSnapshots(p),true);
 assert.match(comparisonDisabledReason(p,[]),/至少 2/);assert.match(comparisonDisabledReason(p,['v0','v0']),/不同/);assert.match(comparisonDisabledReason(p,['v0','v5']),/未封存/);assert.match(comparisonDisabledReason(p,['v0','v1'],{busy:true}),/處理/);assert.match(comparisonDisabledReason(p,['v0','v1'],{uncertain:true}),/上次/);
 assert.match(comparisonDisabledReason({...p,lifecycle:'finalized'},['v0','v1']),/唯讀/);assert.equal(comparisonQuestionError('中'.repeat(666)), '');assert.match(comparisonQuestionError('中'.repeat(667)),/2,000/);assert.equal(comparisonQuestionError('a'.repeat(2000)),'');
 assert.match(comparisonDisabledReason(p,['v0','v1'],{question:'中'.repeat(667)}),/位元組/);
});

test('demo minor snapshots and AI-script revisions retain major lineage; archives never mutate historical versions',async()=>{
 const api=createDemoAdapter();let p=(await api.request('project',{id:(await api.request('state')).projects[0].id})).project;
 const base=structuredClone(p.versions.find(v=>v.id===p.officialVersionId)),originals=structuredClone(p.versions),priorComparison=structuredClone(p.comparisons);
 assert.equal(versionLabel(base),'V4');
 p=await call(api,'snapshot',p,{items:base.items,basedOnVersionId:base.id,versionMode:'minor'});const small=structuredClone(p.versions.at(-1));assert.equal(versionLabel(small),'V4.1');assert.equal(small.number,5);assert.equal(small.basedOnVersionId,base.id);assert.deepEqual(small.items,base.items);
 p=await call(api,'archive_version',p,{versionId:small.id});assert.deepEqual(p.versions.slice(0,-1),originals);assert.deepEqual(p.versions.at(-1),small);assert.ok(p.archivedVersionIds.includes(small.id));assert.deepEqual(p.comparisons,priorComparison);
 await assert.rejects(call(api,'promote',p,{versionId:small.id}));await assert.rejects(call(api,'compare',p,{versionIds:[base.id,small.id],consent:true}));await assert.rejects(call(api,'snapshot',p,{items:base.items,basedOnVersionId:small.id,versionMode:'minor'}));await assert.rejects(call(api,'archive_version',p,{versionId:base.id}));
 p=await call(api,'snapshot',p,{items:base.items,basedOnVersionId:base.id,versionMode:'minor'});assert.equal(versionLabel(p.versions.at(-1)),'V4.2');
 p=await call(api,'snapshot',p,{items:base.items,basedOnVersionId:base.id,versionMode:'major'});assert.equal(versionLabel(p.versions.at(-1)),'V5');
 p=await call(api,'discuss',p,{text:'請把第一項內容改為「明確的小修改」',consent:true});assert.equal(versionLabel(p.versions.at(-1)),'V4.3');assert.equal(p.officialVersionId,base.id);
 p=await call(api,'restore_version',p,{versionId:small.id});assert.equal(isArchivedVersion(p,small.id),false);assert.deepEqual(p.versions.find(v=>v.id===small.id),small);assert.deepEqual(p.versions.slice(0,originals.length),originals);
 const exported=exportProject(p);assert.deepEqual(exported.project.archivedVersionIds,p.archivedVersionIds);assert.deepEqual(exported.project.creativeItems[0].archivedVersionIds,p.archivedVersionIds);
 await assert.rejects(call(api,'snapshot',p,{items:base.items,versionMode:'minor'}));await assert.rejects(call(api,'snapshot',p,{items:base.items,versionMode:'bad'}));
});

test('demo comparisons preserve historical goal basis after metadata invalidates approval',async()=>{
 const api=createDemoAdapter();let p=(await api.request('project',{id:(await api.request('state')).projects[0].id})).project;
 const versions=structuredClone(p.versions),prior=structuredClone(p.comparisons),official=p.officialVersionId;
 p=await call(api,'edit_project',p,{title:p.title,description:'重新確認前比較舊版本'});assert.equal(p.goalApprovedAt,null);
 p=await call(api,'compare',p,{versionIds:[official,p.versions[0].id],question:'比較朗讀時的節奏',consent:true});const comparison=p.comparisons.at(-1);
 assert.equal(comparison.goalBasis,'version_snapshots');assert.equal(comparison.goalSnapshot,null);assert.deepEqual(comparison.versionGoalSnapshots,comparison.versionIds.map(versionId=>{const v=versions.find(v=>v.id===versionId);return {versionId,goalSnapshot:v.goalSnapshot,goalText:v.goalText,goalAndRationale:versionGoalAndRationale(v),goalSource:v.goalSource,changeSummary:v.changeSummary,rationale:v.rationale,discussionMessageIds:v.discussionMessageIds};}));assert.equal(p.goalApprovedAt,null);assert.equal(p.officialVersionId,official);assert.deepEqual(p.versions,versions);assert.deepEqual(p.comparisons.slice(0,-1),prior);assert.match(p.messages.at(-1).text,/不會替你確認目標/);
 await assert.rejects(call(api,'generate',p,{consent:true}));await assert.rejects(call(api,'finalize',p));
});

async function withLiveFixture(run,{invalidateGoal=false}={}){
 const originals={document:globalThis.document,addEventListener:globalThis.addEventListener,setTimeout:globalThis.setTimeout,fetch:globalThis.fetch,location:globalThis.location};
 const {doc,root}=fixtureDocument();globalThis.document=doc;globalThis.addEventListener=()=>{};globalThis.location={href:'http://localhost/ai-cocreation-series-php74/public/'};
 globalThis.setTimeout=(handler,delay,...args)=>{const timer=originals.setTimeout(handler,delay,...args);timer.unref?.();return timer;};
 const source=createDemoAdapter(),calls=[];let savedProject=(await source.request('project',{id:(await source.request('state')).projects[0].id})).project;
 if(invalidateGoal)savedProject=await call(source,'edit_project',savedProject,{title:savedProject.title,description:'目標尚未重新確認的測試專案'});
 let failure=null;
 globalThis.fetch=async(url,options)=>{
  const action=new URL(url).searchParams.get('action');let payload={};
  if(options.method==='POST'){payload=JSON.parse(options.body);assert.equal(payload.action,action);assert.equal(options.headers['X-CSRF-Token'],'fixture-csrf');if(!['save_members','select_member','select_item','list_models','set_key','clear_key'].includes(action))assert.equal(payload.itemId,savedProject.activeItemId);}
  else if(action==='project')payload={id:new URL(url).searchParams.get('id')};
  calls.push({action,payload});
  if(failure && action===failure.action){const f=failure;failure=null;return {ok:false,status:f.status,json:async()=>({error:f.message})};}
  try{const data=await source.request(action,payload);if(data.project)savedProject=data.project;return {ok:true,status:200,json:async()=>action==='state'?{...data,csrf:'fixture-csrf',provider:'ollama',model:'固定腳本',keyPresent:false}:data.csrf?{...data,csrf:'fixture-csrf'}:data};}
  catch(error){return {ok:false,status:error.status || 400,json:async()=>({error:error.message})};}
 };
 try{const app=await createTitleApp({root,adapter:createApiAdapter(),demo:false});await run({doc,root,source,calls,app,get project(){return savedProject;},failNext(action,message,status=400){failure={action,message,status};}});}finally{Object.assign(globalThis,originals);}
}
async function fixtureVersionSelect(doc,id,checked=true){const box=doc.getElementById(`version-${id}`).querySelector('input');assert.ok(box);assert.equal(box.disabled,false);box.checked=checked;await box.dispatchEvent('change');}
async function fixtureCardClick(doc,id,text){const target=doc.getElementById(`version-${id}`).querySelectorAll('button').find(b=>b.textContent===text);assert.ok(target);assert.equal(target.disabled,false);void target.dispatchEvent('click');await settle();}

test('real renderer and fetch boundary save complete major/minor versions with computed labels and selected lineage',async()=>{
 await withLiveFixture(async context=>{
  const {doc,root,calls}=context,original=structuredClone(context.project.versions.find(v=>v.id===context.project.officialVersionId));
  assert.equal(doc.getElementById('save-snapshot').textContent,'另存新版本 V5');assert.equal(doc.getElementById('save-minor').textContent,'另存小修改 V4.1');assert.equal(doc.getElementById('editor-source').value,original.id);
  assert.equal(doc.getElementById('new-item-type'),null);assert.equal(root.querySelectorAll('.add-item-row').length,0);assert.ok(!root.querySelectorAll('button').some(b=>b.textContent==='＋ 新增項目'));assert.ok(root.querySelectorAll('button').some(b=>b.textContent==='＋ 新增創作項目'));
  assert.equal(root.querySelector('.editor-items').querySelectorAll('.editor-item').length,4);assert.match(root.querySelector('.editor-items').textContent,/內容欄位/);assert.match(root.querySelector('.official-card').querySelector('.bundle-item-label').textContent,/作品內容/);
  await fixtureFill(doc,'editor-title','整組大改的新名稱');await fixtureClick(doc,'另存新版本 V5');const major=structuredClone(context.project.versions.at(-1));assert.equal(versionLabel(major),'V5');assert.equal(major.basedOnVersionId,original.id);assert.deepEqual(major.items.slice(1),original.items.slice(1));assert.equal(major.items[0].id,original.items[0].id);assert.deepEqual(context.project.versions.find(v=>v.id===original.id),original);assert.equal(context.project.officialVersionId,original.id);
  assert.equal(doc.getElementById('save-snapshot').textContent,'另存新版本 V6');assert.equal(doc.getElementById('save-minor').textContent,'另存小修改 V5.1');
  await fixtureFill(doc,'editor-title','大改後的小修改');await fixtureClick(doc,'另存小修改 V5.1');const small=structuredClone(context.project.versions.at(-1));assert.equal(versionLabel(small),'V5.1');assert.equal(small.basedOnVersionId,major.id);assert.deepEqual(small.items.slice(1),original.items.slice(1));assert.deepEqual(context.project.versions.find(v=>v.id===major.id),major);
  let source=doc.getElementById('editor-source');source.value=original.id;await source.dispatchEvent('change');assert.equal(doc.getElementById('save-minor').textContent,'另存小修改 V4.1');assert.equal(doc.getElementById('editor-title').value,original.items[0].content);
  await fixtureFill(doc,'editor-title','不可在切換時遺失的草稿');source=doc.getElementById('editor-source');source.value=major.id;void source.dispatchEvent('change');await settle();await fixtureDialogClick(doc,'取消');assert.equal(doc.getElementById('editor-source').value,original.id);assert.equal(doc.getElementById('editor-title').value,'不可在切換時遺失的草稿');
  await fixtureClick(doc,'另存小修改 V4.1');assert.equal(versionLabel(context.project.versions.at(-1)),'V4.1');assert.equal(context.project.versions.at(-1).basedOnVersionId,original.id);
  assert.deepEqual(calls.filter(c=>c.action==='snapshot').map(c=>c.payload.versionMode),['major','minor','minor']);calls.filter(c=>c.action==='snapshot').forEach(c=>{assert.equal(c.payload.items.length,4);assert.equal(c.payload.action,'snapshot');assert.ok(c.payload.basedOnVersionId);});
 });
});

test('real renderer and fetch boundary archive/restore candidates without deleting content or comparison history',async()=>{
 await withLiveFixture(async context=>{
  const {doc,root,calls}=context,candidate=structuredClone(context.project.versions[0]),official=context.project.officialVersionId,history=structuredClone(context.project.comparisons),originalVersions=structuredClone(context.project.versions);
  await fixtureVersionSelect(doc,candidate.id);await fixtureVersionSelect(doc,official);assert.equal(doc.getElementById('compare-versions').disabled,false);
  await fixtureCardClick(doc,candidate.id,'編輯');assert.equal(doc.getElementById('editor-source').value,candidate.id);
  await fixtureCardClick(doc,candidate.id,'封存');await fixtureDialogClick(doc,'取消');assert.equal(context.project.archivedVersionIds.length,0);assert.equal(calls.filter(c=>c.action==='archive_version').length,0);
  await fixtureCardClick(doc,candidate.id,'封存');await fixtureDialogClick(doc,'確認封存版本');assert.ok(context.project.archivedVersionIds.includes(candidate.id));assert.deepEqual(context.project.versions,originalVersions);assert.deepEqual(context.project.comparisons,history);assert.equal(context.project.officialVersionId,official);
  const card=doc.getElementById(`version-${candidate.id}`);assert.ok(card.className.includes('archived-version'));assert.equal(card.querySelector('input'),null);assert.ok(!card.querySelectorAll('button').some(b=>['編輯','設為正式版','封存'].includes(b.textContent)));assert.match(root.textContent,/已選 1 個版本/);assert.equal(doc.getElementById('save-minor').disabled,true);assert.equal(doc.getElementById('save-snapshot').disabled,true);assert.match(doc.getElementById('minor-version-hint').textContent,/來源已封存/);
  assert.ok(root.querySelectorAll('.history-row').some(row=>row.textContent.includes('已封存，可還原')));assert.ok(!doc.getElementById(`version-${official}`).querySelectorAll('button').some(b=>b.textContent==='封存'));
  await fixtureCardClick(doc,candidate.id,'還原版本');await fixtureDialogClick(doc,'還原版本');assert.equal(context.project.archivedVersionIds.length,0);assert.deepEqual(context.project.versions,originalVersions);assert.deepEqual(context.project.comparisons,history);assert.equal(doc.getElementById('save-minor').disabled,false);assert.ok(doc.getElementById(`version-${candidate.id}`).querySelectorAll('button').some(b=>b.textContent==='編輯'));
  await fixtureVersionSelect(doc,candidate.id);assert.equal(doc.getElementById('compare-versions').disabled,false);assert.deepEqual(calls.filter(c=>['archive_version','restore_version'].includes(c.action)).map(c=>[c.action,c.payload.versionId]),[['archive_version',candidate.id],['restore_version',candidate.id]]);
 });
});

test('real renderer and fetch boundary compare with null goal approval, handle UTF-8/error and display historical basis',async()=>{
 await withLiveFixture(async context=>{
  const {doc,root,calls}=context,original=structuredClone(context.project.versions),official=context.project.officialVersionId;
  assert.equal(context.project.goalApprovedAt,null);assert.equal(doc.getElementById('compare-versions').disabled,true);assert.match(doc.getElementById('comparison-status').textContent,/至少 2/);assert.ok(root.textContent.includes(COMPARISON_SNAPSHOT_NOTE));assert.equal(fixtureButton(doc,'再產生一組候選 ↗').disabled,true);
  const beforeNoop=calls.length;void doc.getElementById('compare-versions').dispatchEvent('click');await settle();assert.equal(calls.length,beforeNoop);assert.match(doc.getElementById('comparison-status').textContent,/至少 2/);
  await fixtureVersionSelect(doc,official);await fixtureVersionSelect(doc,original[0].id);assert.equal(doc.getElementById('compare-versions').disabled,false);
  await fixtureFill(doc,'compare-question','中'.repeat(667));assert.equal(doc.getElementById('compare-versions').disabled,true);assert.match(doc.getElementById('comparison-status').textContent,/2,000 位元組/);assert.equal(doc.getElementById('compare-question').getAttribute('aria-invalid'),'true');
  const beforeInvalid=calls.length;void doc.getElementById('compare-versions').dispatchEvent('click');await settle();assert.equal(calls.length,beforeInvalid);assert.equal(doc.body.querySelector('dialog'),null);
  await fixtureFill(doc,'compare-question','比較名稱的朗讀節奏');assert.equal(doc.getElementById('compare-versions').disabled,false);assert.ok(root.textContent.includes(COMPARISON_SNAPSHOT_NOTE));assert.equal(calls.filter(c=>c.action==='compare').length,0);assert.equal(doc.getElementById('compare-question').value,'比較名稱的朗讀節奏');
  context.failNext('compare','比較服務暫時拒絕這次請求，請調整比較重點。');await fixtureClick(doc,'請 AI 提供比較意見 ↗');assert.equal(doc.body.querySelector('dialog'),null);await settle();assert.match(doc.getElementById('comparison-status').textContent,/比較服務暫時拒絕/);assert.equal(doc.activeElement.id,'compare-question');assert.equal(context.project.comparisons.length,1);assert.equal(doc.getElementById('compare-versions').disabled,false);
  await fixtureFill(doc,'compare-question','比較名稱的可讀性');await fixtureClick(doc,'請 AI 提供比較意見 ↗');assert.equal(doc.body.querySelector('dialog'),null);await settle();const result=context.project.comparisons.at(-1);assert.equal(result.goalBasis,'version_snapshots');assert.equal(result.goalSnapshot,null);assert.equal(result.versionGoalSnapshots.length,2);assert.equal(context.project.goalApprovedAt,null);assert.equal(context.project.officialVersionId,official);assert.deepEqual(context.project.versions,original);assert.ok(doc.getElementById('comparison-section').textContent.includes(COMPARISON_SNAPSHOT_NOTE));assert.match(doc.getElementById('comparison-section').textContent,/查看各版本保存的目標/);assert.equal(fixtureButton(doc,'此項目定稿').disabled,true);
  const submitted=calls.filter(c=>c.action==='compare').at(-1).payload;assert.deepEqual(submitted.versionIds,[official,original[0].id]);assert.equal(submitted.question,'比較名稱的可讀性');assert.equal(submitted.consent,true);assert.equal(submitted.approvedProvider,'ollama');assert.equal(submitted.approvedSettingsRevision,0);assert.match(submitted.requestId,/^[a-f0-9]{32}$/);
 },{invalidateGoal:true});
});

test('real renderer enforces maximum five selected versions and supports a five-version comparison',async()=>{
 await withLiveFixture(async context=>{
  const {doc,calls}=context;
  await fixtureClick(doc,'另存新版本 V5');await fixtureClick(doc,'另存新版本 V6');const versions=context.project.versions;
  for(const version of versions.slice(0,5))await fixtureVersionSelect(doc,version.id);
  assert.equal(doc.getElementById('compare-versions').disabled,false);await fixtureVersionSelect(doc,versions[5].id);assert.match(doc.getElementById('app-toast').textContent,/最多比較 5/);assert.equal(doc.getElementById(`version-${versions[5].id}`).querySelector('input').checked,false);
  await fixtureClick(doc,'請 AI 提供比較意見 ↗');assert.equal(doc.body.querySelector('dialog'),null);await settle();assert.equal(calls.filter(c=>c.action==='compare').at(-1).payload.versionIds.length,5);assert.equal(context.project.comparisons.at(-1).items.length,5);assert.equal(context.project.comparisons.at(-1).goalBasis,'version_snapshots');
 });
});

test('version goals and comments validate independently and preserve explicit legacy absence',()=>{
 assert.equal(versionGoalText({goalText:'本版專屬目標',goalSnapshot:{summary:'舊摘要'}}),'本版專屬目標');assert.equal(versionGoalText({goalSnapshot:{summary:'舊版保存目標'}}),'舊版保存目標');assert.equal(versionGoalText({}), '');assert.equal(versionGoalText({goalText:'',goalSnapshot:{summary:'不得偷偷套用'}}),'');
 assert.match(snapshotMetadataError(''),/請填寫本版目標/);assert.match(snapshotMetadataError('中'.repeat(2001)),/6,000/);assert.match(snapshotMetadataError('有效目標','中'.repeat(667)),/2,000/);assert.equal(snapshotMetadataError('中'.repeat(2000),'中'.repeat(666)),'');
});

test('one merged metadata input saves immutable exact text, survives repeated edit/save and compares selected snapshots',async()=>{
 await withLiveFixture(async context=>{
  const {doc,root,calls}=context,official=structuredClone(context.project.versions.find(v=>v.id===context.project.officialVersionId)),commonGoal=context.project.brief.summary;
  assert.equal(doc.getElementById('editor-goal').value,versionGoalAndRationale(official));assert.equal(doc.getElementById('editor-rationale'),null);assert.equal(root.querySelector('.editor-panel').querySelectorAll('.editor-note').length,1);assert.match(root.querySelector('.editor-panel').textContent,/04 選擇與微調/);assert.doesNotMatch(root.querySelector('.editor-panel').textContent,/04 加入你的判斷/);assert.ok(root.querySelectorAll('label').some(label=>label.textContent==='本版目標與修改意見' && label.getAttribute('for')==='editor-goal'));
  await fixtureFill(doc,'editor-goal','');assert.equal(doc.getElementById('save-snapshot').disabled,true);assert.equal(doc.getElementById('save-minor').disabled,true);assert.match(doc.getElementById('draft-status').textContent,/請填寫本版目標與修改意見/);
  await fixtureFill(doc,'editor-goal','中'.repeat(4001));assert.match(doc.getElementById('draft-status').textContent,/12,000/);assert.equal(doc.getElementById('save-minor').disabled,true);
  const combined='  本版改以第一次參加影展的觀眾為對象，名稱要更容易朗讀。\n\n修改意見：保留原本整組作品，使用自己的完整說明。'+ '意'.repeat(450)+'  \n';
  await fixtureFill(doc,'editor-goal',combined);assert.equal(doc.getElementById('save-minor').disabled,false);await fixtureClick(doc,'另存小修改 V4.1');const minor=structuredClone(context.project.versions.at(-1));
  assert.equal(minor.goalAndRationale,combined);assert.equal(minor.goalText,official.goalText);assert.equal(minor.rationale,official.rationale);assert.equal(minor.changeSummary,official.changeSummary);assert.deepEqual(minor.items,official.items);assert.equal(context.project.officialVersionId,official.id);assert.deepEqual(context.project.versions.find(v=>v.id===official.id),official);assert.equal(context.project.brief.summary,commonGoal);
  const body=calls.filter(c=>c.action==='snapshot').at(-1).payload;assert.equal(body.goalAndRationale,combined);assert.equal(body.goalText,undefined);assert.equal(body.rationale,undefined);assert.equal(body.versionMode,'minor');assert.ok(doc.getElementById(`version-${minor.id}`).textContent.includes(combined));
  await fixtureSelect(doc,'editor-source',minor.id);assert.equal(doc.getElementById('editor-goal').value,combined);await fixtureClick(doc,'另存小修改 V4.2');const repeated=structuredClone(context.project.versions.at(-1));assert.equal(repeated.goalAndRationale,combined);await fixtureSelect(doc,'editor-source',repeated.id);assert.equal(doc.getElementById('editor-goal').value,combined);assert.deepEqual(context.project.versions.find(v=>v.id===minor.id),minor);
  await fixtureVersionSelect(doc,official.id);await fixtureVersionSelect(doc,minor.id);await fixtureClick(doc,'請 AI 提供比較意見 ↗');assert.equal(doc.body.querySelector('dialog'),null);await settle();
  const comparison=structuredClone(context.project.comparisons.at(-1));assert.equal(comparison.goalBasis,'version_snapshots');assert.equal(comparison.goalSnapshot,null);assert.deepEqual(comparison.versionGoalSnapshots.map(v=>v.goalAndRationale),[versionGoalAndRationale(official),combined]);assert.ok(doc.getElementById('comparison-section').textContent.includes(combined));assert.ok(doc.getElementById('comparison-section').textContent.includes(versionGoalAndRationale(official)));
  await fixtureFill(doc,'editor-goal','後續另一個版本的目標與另一輪修正意見');await fixtureClick(doc,'另存新版本 V5');assert.deepEqual(context.project.comparisons.at(-1),comparison);assert.deepEqual(context.project.versions.find(v=>v.id===minor.id),minor);assert.ok(root.querySelectorAll('.history-row').some(row=>row.textContent.includes(combined)));
 });
});

test('real renderer reviews and adopts goal-only AI-script revisions without discarding unchanged bundle content',async()=>{
 await withLiveFixture(async context=>{
  const {doc}=context,official=structuredClone(context.project.versions.find(v=>v.id===context.project.officialVersionId)),goal='只修改目標：讓第一次走進影展的長輩也能理解。';
  await fixtureFill(doc,'chat-input',`請把本版目標改為「${goal}」`);await fixtureClick(doc,'送出想法 ↗');assert.equal(doc.body.querySelector('dialog'),null);await settle();
  const revision=structuredClone(context.project.versions.at(-1));assert.equal(revision.source,'revision');assert.equal(revision.goalText,goal);assert.equal(revision.goalSource,'ai');assert.deepEqual(revision.items,official.items);assert.equal(revision.basedOnVersionId,official.id);assert.equal(versionLabel(revision),'V4.1');assert.equal(context.project.officialVersionId,official.id);assert.deepEqual(context.project.versions.find(v=>v.id===official.id),official);
  const panel=doc.getElementById('revision-review');assert.match(panel.textContent,/0 項有變動，4 項維持不變；本版目標有更新/);assert.equal(panel.querySelectorAll('.goal-diff').length,1);assert.ok(panel.textContent.includes(official.goalText));assert.ok(panel.textContent.includes(goal));assert.ok(!panel.textContent.includes('沒有可見的內容或目標差異'));assert.ok(panel.textContent.includes('固定腳本'));
  await fixtureClick(doc,'採用這次修改');await fixtureDialogClick(doc,'確認採用這次修改');assert.equal(context.project.officialVersionId,revision.id);assert.equal(doc.getElementById('revision-review'),null);assert.ok(doc.body.querySelector('.official-card').textContent.includes(goal));assert.deepEqual(context.project.versions.find(v=>v.id===official.id),official);
 });
});

test('legacy renderer labels old goal/rationale and never substitutes common goal for a source without one',async()=>{
 const originals={document:globalThis.document,addEventListener:globalThis.addEventListener,setTimeout:globalThis.setTimeout};const {doc,root}=fixtureDocument();globalThis.document=doc;globalThis.addEventListener=()=>{};globalThis.setTimeout=(handler,delay,...args)=>{const timer=originals.setTimeout(handler,delay,...args);timer.unref?.();return timer;};
 try{
  const api=createDemoAdapter(),state=await api.request('state'),p=(await api.request('project',{id:state.projects[0].id})).project;const official=p.versions.find(v=>v.id===p.officialVersionId);
  p.versions.forEach(version=>{delete version.goalAndRationale;delete version.goalText;delete version.goalSource;delete version.changeSummary;delete version.discussionMessageIds;});official.goalSnapshot=null;
  const adapter={async request(action){if(action==='state')return state;if(action==='project')return {project:p};throw new Error('Legacy read-only fixture must not send any mutation');}};
  await createTitleApp({root,adapter,demo:true});assert.equal(doc.getElementById('editor-goal').value,`修改意見：\n${official.rationale}`);assert.equal(doc.getElementById('save-snapshot').disabled,false);assert.match(doc.body.querySelector('.official-card').textContent,/舊版保存的目標、變更摘要與修改意見合併呈現/);assert.ok(doc.body.querySelector('.official-card').textContent.includes(official.rationale));assert.ok(!doc.getElementById('editor-goal').value.includes(p.brief.summary));
  const candidate=p.versions[0];await fixtureCardClick(doc,candidate.id,'編輯');assert.equal(doc.getElementById('editor-goal').value,versionGoalAndRationale(candidate));assert.ok(doc.getElementById('editor-goal').value.includes(candidate.goalSnapshot.summary));assert.notEqual(doc.getElementById('editor-goal').value,p.brief.summary);assert.match(doc.getElementById(`version-${candidate.id}`).textContent,/舊版保存的目標/);assert.equal(doc.getElementById('save-minor').disabled,false);
 }finally{Object.assign(globalThis,originals);}
});

test('artwork colors retain strong readable contrast and non-color content labels',async()=>{
 const css=await readFile(new URL('../public/styles.css',import.meta.url),'utf8');
 const luminance=hex=>{const c=hex.match(/[a-f0-9]{2}/gi).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
 const contrast=(foreground,background)=>{const a=luminance(foreground),b=luminance(background);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
 const tones=[...css.matchAll(/--content-bg:(#[a-f0-9]{6})/g)].map(m=>m[1]);assert.equal(tones.length,4);assert.equal(new Set(tones).size,4);
 for(const tone of tones){assert.ok(contrast('#172b30',tone)>=4.5,`artwork contrast on ${tone}`);assert.ok(contrast('#334d49',tone)>=4.5,`label contrast on ${tone}`);}
 assert.match(css,/font-size:21px;line-height:1\.65;font-weight:800;color:#172b30/);assert.match(css,/\.context-copy\{font-size:12px;line-height:1\.85;font-weight:400/);
});

test('AI member helpers never fall back to another enabled member and provenance uses immutable nickname snapshots',()=>{
 const members=[{id:'a',nickname:'小光',enabled:true,provider:'ollama',model:'local-a'},{id:'b',nickname:'阿哲',enabled:false,provider:'openai',model:'cloud-b'}],state={members,activeMemberId:'b',memberId:null,usageConsent:true,keyPresent:false};
 assert.deepEqual(enabledMembers(state),[members[0]]);assert.equal(activeMember(state),null);assert.match(aiSetupReason(state),/尚未選擇/);assert.match(aiSetupReason({...state,usageConsent:false}),/勾選同意/);assert.equal(activeMember({...state,activeMemberId:'a'}),members[0]);assert.equal(aiSetupReason({...state,activeMemberId:'a'}),'');
 assert.match(aiSetupReason({members:[{...members[1],enabled:true}],activeMemberId:'b',usageConsent:true}),/金鑰.*到期/);
 const provenance={provider:'openai',requestedModel:'model-a',actualModel:'model-a',memberId:'a',memberNickname:'當時的小光'};assert.match(provenanceLabel(provenance),/^當時的小光 · OpenAI · model-a/);members[0].nickname='後來的名稱';assert.match(provenanceLabel(provenance),/^當時的小光/);assert.equal(provenanceLabel({provider:'openai',requestedModel:'old-model',actualModel:'old-model'}),'OpenAI · old-model');
});

async function withMemberFixture(run,{usageConsent=true,provider='ollama',secondProvider='ollama',keyPresent=false,modelResponse=null}={}){
 const originals={document:globalThis.document,addEventListener:globalThis.addEventListener,setTimeout:globalThis.setTimeout,fetch:globalThis.fetch,location:globalThis.location};const {doc,root}=fixtureDocument();globalThis.document=doc;globalThis.addEventListener=()=>{};globalThis.location={href:'http://localhost/ai-cocreation-series-php74/public/'};globalThis.setTimeout=(handler,delay,...args)=>{const timer=originals.setTimeout(handler,delay,...args);timer.unref?.();return timer;};
 const source=createDemoAdapter(),initial=await source.request('state'),first=initial.members[0].id,second='22222222222222222222222222222222',disabled='33333333333333333333333333333333';
 await source.request('save_members',{members:[{...initial.members[0],nickname:'小光',provider,model:'fixture-first'},{id:second,nickname:'阿哲',enabled:true,provider:secondProvider,model:'fixture-second',ollamaUrl:'http://127.0.0.1:11434'},{id:disabled,nickname:'尚未上班',enabled:false,provider:'openai',model:'fixture-disabled',ollamaUrl:'http://127.0.0.1:11434'}],activeMemberId:first,usageConsent,expectedSettingsRevision:initial.settingsRevision});
 let project=(await source.request('project',{id:initial.projects[0].id})).project,modelResult=modelResponse,hold=null,release=null,key=keyPresent,keyRevision=keyPresent?7:0,discussionFailure=null;const calls=[];
 globalThis.fetch=async(url,options)=>{
  const action=new URL(url).searchParams.get('action');let payload={};if(options.method==='POST'){payload=JSON.parse(options.body);assert.equal(payload.action,action);assert.equal(options.headers['X-CSRF-Token'],'member-fixture-csrf');}else if(action==='project')payload={id:new URL(url).searchParams.get('id')};calls.push({action,payload});
  if(action==='discuss' && hold)await hold;
  if(action==='discuss' && discussionFailure){
   if(discussionFailure.network)throw new TypeError('fixture network interruption');
   return {ok:false,status:discussionFailure.status || 502,json:async()=>{if(discussionFailure.malformed)throw new SyntaxError('fixture invalid JSON');return discussionFailure.body;}};
  }
  if(action==='list_models')return modelResult?.error?{ok:false,status:400,json:async()=>({error:modelResult.error})}:{ok:true,status:200,json:async()=>({...modelResult,provider:payload.provider})};
  if(action==='set_key'){assert.equal(doc.getElementById('api-key')?.value || '','');key=true;keyRevision=1;return {ok:true,status:200,json:async()=>({...await source.request('state'),keyPresent:true,keyRevision})};}
  try{const result=await source.request(action,payload);if(result.project)project=result.project;return {ok:true,status:200,json:async()=>action==='state' || result.csrf?{...result,keyPresent:key,keyRevision,csrf:'member-fixture-csrf'}:result};}catch(error){return {ok:false,status:error.status || 400,json:async()=>({error:error.message})};}
 };
 try{const app=await createTitleApp({root,adapter:createApiAdapter(),demo:false});await run({doc,root,calls,source,app,first,second,disabled,get project(){return project;},get state(){return source.request('state');},setModelResponse(value){modelResult=value;},setDiscussionFailure(value){discussionFailure=value;},holdDiscussion(){hold=new Promise(resolve=>{release=resolve;});},releaseDiscussion(){hold=null;release?.();}});}finally{release?.();Object.assign(globalThis,originals);}
}
async function fixtureCheck(doc,id,checked){const input=doc.getElementById(id);assert.ok(input,`checkbox exists: ${id}`);input.checked=checked;await input.dispatchEvent('change');}
async function fixtureSelect(doc,id,value){const select=doc.getElementById(id);assert.ok(select,`select exists: ${id}`);select.value=value;await select.dispatchEvent('change');await settle();}

test('one explicit setup opt-in enables multiple deliberate AI actions without per-request dialogs',async()=>{
 await withMemberFixture(async context=>{
  const {doc,root,calls,first}=context;await fixtureFill(doc,'chat-input','請把第一項內容改為「設定完成後直接討論」');assert.equal(doc.getElementById('send-chat').disabled,true);assert.match(doc.getElementById('ai-setup-status').textContent,/勾選同意/);assert.ok(!calls.some(call=>call.action==='list_models'));
  await fixtureClick(doc,'系統設定');const dialog=doc.body.querySelector('dialog');assert.match(dialog.textContent,/OpenAI API 費用/);assert.match(dialog.textContent,/不包含在 ChatGPT 訂閱/);assert.match(dialog.textContent,/不會背景呼叫/);assert.match(dialog.textContent,/轉送資料/);assert.match(dialog.textContent,/固定引用/);assert.equal(doc.getElementById('ai-usage-consent').checked,false);assert.ok(dialog.querySelector('.member-destinations').textContent.includes('fixture-first'));assert.ok(!dialog.querySelector('.member-destinations').textContent.includes('fixture-disabled'));
  await fixtureCheck(doc,'ai-usage-consent',true);await fixtureClick(doc,'保存成員與使用設定');assert.equal(doc.body.querySelector('dialog'),null);assert.equal(calls.filter(call=>call.action==='save_members').length,1);const saved=calls.find(call=>call.action==='save_members').payload;assert.equal(saved.expectedSettingsRevision,1);assert.equal(saved.usageConsent,true);assert.equal(saved.activeMemberId,first);assert.ok(!calls.some(call=>['discuss','generate','compare'].includes(call.action)));
  await fixtureClick(doc,'送出想法 ↗');assert.equal(doc.body.querySelector('dialog'),null);await fixtureFill(doc,'chat-input','請把第一項內容改為「第二次也不再詢問」');await fixtureClick(doc,'送出想法 ↗');assert.equal(doc.body.querySelector('dialog'),null);
  await fixtureClick(doc,'再產生一組候選 ↗');assert.equal(doc.body.querySelector('dialog'),null);await fixtureVersionSelect(doc,context.project.officialVersionId);await fixtureVersionSelect(doc,context.project.versions[0].id);await fixtureClick(doc,'請 AI 提供比較意見 ↗');assert.equal(doc.body.querySelector('dialog'),null);
  const paid=calls.filter(call=>['discuss','generate','compare'].includes(call.action));assert.deepEqual(paid.map(call=>call.action),['discuss','discuss','generate','compare']);paid.forEach(call=>{assert.equal(call.payload.approvedMemberId,first);assert.equal(call.payload.approvedModel,'fixture-first');assert.equal(call.payload.approvedSettingsRevision,2);assert.equal(call.payload.consent,true);});assert.match(root.textContent,/不再逐次詢問/);
 },{usageConsent:false});
});

test('enabled-only member dropdown switches once, preserves drafts/history and never auto-selects after disabling active member',async()=>{
 await withMemberFixture(async context=>{
  const {doc,root,calls,first,second,disabled}=context,history=root.querySelectorAll('.chat-entry').map(node=>node.textContent);assert.deepEqual(doc.getElementById('discussion-member').querySelectorAll('option').map(option=>option.value),['',first,second]);assert.ok(!doc.getElementById('discussion-member').textContent.includes('尚未上班'));
  await fixtureFill(doc,'chat-input','切換時必須保留的討論草稿');await fixtureFill(doc,'editor-title','切換時必須保留的作品草稿');await fixtureSelect(doc,'discussion-member',second);assert.equal(calls.filter(call=>call.action==='select_member').length,1);assert.equal(calls.find(call=>call.action==='select_member').payload.expectedSettingsRevision,1);assert.equal(doc.getElementById('chat-input').value,'切換時必須保留的討論草稿');assert.equal(doc.getElementById('editor-title').value,'切換時必須保留的作品草稿');assert.deepEqual(root.querySelectorAll('.chat-entry').map(node=>node.textContent),history);assert.ok(!calls.some(call=>['discuss','generate','compare','list_models'].includes(call.action)));
  await fixtureClick(doc,'系統設定');await fixtureCheck(doc,`member-enabled-${second}`,false);assert.equal(doc.getElementById('settings-active-member').value,'');await fixtureClick(doc,'保存成員與使用設定');const state=await context.state;assert.equal(state.activeMemberId,null);assert.equal(state.memberId,null);assert.equal(doc.getElementById('discussion-member').value,'');assert.deepEqual(doc.getElementById('discussion-member').querySelectorAll('option').map(option=>option.value),['',first]);assert.equal(doc.getElementById('send-chat').disabled,true);assert.match(doc.getElementById('ai-setup-status').textContent,/尚未選擇/);assert.equal(state.members.length,3);assert.ok(state.members.some(member=>member.id===disabled));assert.deepEqual(root.querySelectorAll('.chat-entry').map(node=>node.textContent),history);
  await fixtureSelect(doc,'discussion-member',first);assert.equal(doc.getElementById('send-chat').disabled,false);assert.equal(doc.getElementById('chat-input').value,'切換時必須保留的討論草稿');
 });
});

test('member renaming and disabling never relabel saved AI replies or version provenance',async()=>{
 await withMemberFixture(async context=>{
  const {doc,root,first}=context;await fixtureFill(doc,'chat-input','請把第一項內容改為「保留成員歷史」');await fixtureClick(doc,'送出想法 ↗');const reply=structuredClone(context.project.messages.at(-1)),version=structuredClone(context.project.versions.at(-1));assert.equal(reply.provenance.memberNickname,'小光');assert.equal(reply.provenance.memberId,first);
  await fixtureClick(doc,'系統設定');await fixtureFill(doc,`member-nickname-${first}`,'已改名的小明');await fixtureCheck(doc,`member-enabled-${first}`,false);await fixtureClick(doc,'保存成員與使用設定');assert.deepEqual(context.project.messages.find(message=>message.id===reply.id),reply);assert.deepEqual(context.project.versions.find(candidate=>candidate.id===version.id),version);assert.match(doc.getElementById(`message-${reply.id}`).textContent,/小光 · 固定腳本 · 非 AI/);assert.ok(!doc.getElementById(`message-${reply.id}`).textContent.includes('已改名的小明'));assert.ok(root.querySelectorAll('.model-provenance').some(node=>node.textContent.includes('小光 · 固定腳本')));
 });
});

test('model-list metadata is explicit-only, uses exact fetched names, shows errors and keeps manual fallback without inference',async()=>{
 await withMemberFixture(async context=>{
  const {doc,calls,first}=context;await fixtureClick(doc,'系統設定');assert.equal(calls.filter(call=>call.action==='list_models').length,0);const list=doc.getElementById(`member-model-list-${first}`);assert.deepEqual(list.querySelectorAll('option').map(option=>option.value),['']);assert.match(doc.getElementById(`member-model-status-${first}`).textContent,/不保證/);
  const card=doc.body.querySelectorAll('.member-settings-card').find(node=>node.getAttribute('data-member-id')===first);const read=card.querySelectorAll('button').find(button=>button.textContent==='讀取模型清單');void read.dispatchEvent('click');await settle();assert.deepEqual(calls.filter(call=>call.action==='list_models').map(call=>call.payload),[{action:'list_models',provider:'ollama',ollamaUrl:'http://127.0.0.1:11434'}]);assert.deepEqual(list.querySelectorAll('option').map(option=>option.value),['','listed-z','listed-a']);assert.match(doc.getElementById(`member-model-status-${first}`).textContent,/清單不保證推論相容/);assert.ok(!list.textContent.includes('qwen3:8b'));
  await fixtureSelect(doc,`member-model-list-${first}`,'listed-a');assert.equal(doc.getElementById(`member-model-${first}`).value,'listed-a');assert.equal(doc.getElementById('ai-usage-consent').checked,false);
  context.setModelResponse({error:'Ollama 模型清單無法讀取：服務未啟動。'});void read.dispatchEvent('click');await settle();assert.match(doc.getElementById(`member-model-status-${first}`).textContent,/服務未啟動/);assert.match(doc.getElementById(`member-model-status-${first}`).textContent,/手動輸入/);assert.equal(list.disabled,true);assert.deepEqual(list.querySelectorAll('option').map(option=>option.value),['']);
  await fixtureFill(doc,`member-model-${first}`,'my-manual-model');assert.equal(doc.getElementById(`member-model-${first}`).value,'my-manual-model');assert.ok(!calls.some(call=>['discuss','summarize','generate','compare','test_connection'].includes(call.action)));await fixtureDialogClick(doc,'取消');assert.equal(calls.filter(call=>call.action==='save_members').length,0);
 },{modelResponse:{models:['listed-z','listed-a'],message:'服務實際回報兩個名稱。',fetchedAt:'2026-10-21T08:00:00Z'}});
});

test('in-flight calls bind their member ID/model snapshot and block accidental selector races',async()=>{
 await withMemberFixture(async context=>{
  const {doc,calls,first,second}=context;context.holdDiscussion();await fixtureFill(doc,'chat-input','請把第一項內容改為「成員綁定測試」');await fixtureClick(doc,'送出想法 ↗');const request=calls.find(call=>call.action==='discuss');assert.equal(request.payload.approvedMemberId,first);assert.equal(request.payload.approvedModel,'fixture-first');assert.equal(doc.getElementById('discussion-member').disabled,true);assert.equal(doc.body.querySelector('dialog'),null);
  await fixtureSelect(doc,'discussion-member',second);assert.equal(calls.filter(call=>call.action==='select_member').length,0);context.releaseDiscussion();await settle();await settle();assert.equal(context.project.messages.at(-1).provenance.memberId,first);assert.equal(context.project.messages.at(-1).provenance.memberNickname,'小光');assert.equal(doc.getElementById('discussion-member').value,first);
  await fixtureSelect(doc,'discussion-member',second);await fixtureFill(doc,'chat-input','請把第一項內容改為「下一位接續但不丟失上下文」');await fixtureClick(doc,'送出想法 ↗');assert.equal(calls.filter(call=>call.action==='discuss').at(-1).payload.approvedMemberId,second);assert.equal(context.project.messages.at(-1).provenance.memberNickname,'阿哲');assert.equal(context.project.versions.at(-1).basedOnVersionId,context.project.officialVersionId);
 });
});

test('stale settings keep local draft and cannot overwrite a newer roster revision',async()=>{
 await withMemberFixture(async context=>{
  const {doc,calls,source,first,app}=context;await fixtureClick(doc,'系統設定');await fixtureFill(doc,`member-nickname-${first}`,'尚未保存的小光草稿');const current=await source.request('state');await source.request('save_members',{members:current.members.map(member=>member.id===first?{...member,nickname:'另一分頁的新名稱'}:member),activeMemberId:current.activeMemberId,usageConsent:true,expectedSettingsRevision:current.settingsRevision});
  await fixtureClick(doc,'保存成員與使用設定');assert.match(doc.body.textContent,/設定已更新|設定已變更/);assert.equal((await source.request('state')).members[0].nickname,'另一分頁的新名稱');await fixtureClick(doc,'系統設定');assert.equal(doc.getElementById(`member-nickname-${first}`).value,'尚未保存的小光草稿');assert.match(doc.body.querySelector('dialog').textContent,/不能覆寫/);const before=calls.filter(call=>call.action==='save_members').length;await fixtureClick(doc,'保存成員與使用設定');assert.equal(calls.filter(call=>call.action==='save_members').length,before);assert.equal((await source.request('state')).members[0].nickname,'另一分頁的新名稱');await app.reload();
 });
});

test('missing or expired OpenAI keys block inference with actionable setup text, without a fallback member',async()=>{
 await withMemberFixture(async context=>{
  const {doc,calls,first}=context;await fixtureFill(doc,'chat-input','不應送出');assert.equal(doc.getElementById('send-chat').disabled,true);assert.match(doc.getElementById('ai-setup-status').textContent,/金鑰.*到期/);assert.equal(doc.getElementById('discussion-member').value,first);void doc.getElementById('send-chat').dispatchEvent('click');await settle();assert.ok(!calls.some(call=>call.action==='discuss'));assert.equal(doc.body.querySelector('dialog'),null);await fixtureClick(doc,'系統設定');assert.ok(doc.getElementById('api-key'));assert.match(doc.body.querySelector('dialog').textContent,/30 分鐘/);await fixtureDialogClick(doc,'取消');
 },{provider:'openai',keyPresent:false});
});

test('member nickname limits use UTF-8 bytes and invalid settings stay open with all drafts intact',async()=>{
 assert.match(memberRosterError([{nickname:'中'.repeat(41)}]),/120 位元組/);assert.equal(memberRosterError([{nickname:'中'.repeat(40)}]),'');assert.match(memberRosterError([{nickname:'同名'},{nickname:' 同名 '}]),/不可重複/);assert.match(memberRosterError(Array.from({length:21},(_,index)=>({nickname:`成員${index}`}))),/20/);
 await withMemberFixture(async context=>{
  const {doc,calls,first}=context;await fixtureClick(doc,'系統設定');await fixtureFill(doc,`member-nickname-${first}`,'中'.repeat(41));await fixtureClick(doc,'保存成員與使用設定');assert.ok(doc.body.querySelector('dialog'));assert.match(doc.getElementById('member-settings-error').textContent,/120 位元組/);assert.equal(doc.getElementById(`member-nickname-${first}`).value,'中'.repeat(41));assert.equal(calls.filter(call=>call.action==='save_members').length,0);
  await fixtureFill(doc,`member-nickname-${first}`,'阿哲');await fixtureClick(doc,'保存成員與使用設定');assert.match(doc.getElementById('member-settings-error').textContent,/不可重複/);assert.equal(calls.filter(call=>call.action==='save_members').length,0);await fixtureDialogClick(doc,'取消');
 });
});

test('new AI members receive stable secure IDs, remain disabled until checked and respect the 20-member cap',async()=>{
 await withMemberFixture(async context=>{
  const {doc,source,app,calls,first}=context;await fixtureClick(doc,'系統設定');await fixtureClick(doc,'＋ 新增 AI 成員');let cards=doc.body.querySelectorAll('.member-settings-card');assert.equal(cards.length,4);const newId=cards.at(-1).getAttribute('data-member-id');assert.match(newId,/^[a-f0-9]{32}$/);assert.notEqual(newId,first);assert.equal(doc.getElementById(`member-enabled-${newId}`).checked,false);assert.equal(doc.getElementById(`member-model-${newId}`).value,'');
  await fixtureFill(doc,`member-nickname-${newId}`,'新夥伴');await fixtureFill(doc,`member-model-${newId}`,'manual-new-model');await fixtureCheck(doc,`member-enabled-${newId}`,true);assert.equal(doc.getElementById('ai-usage-consent').checked,false);await fixtureCheck(doc,'ai-usage-consent',true);await fixtureClick(doc,'保存成員與使用設定');assert.ok((await context.state).members.some(member=>member.id===newId && member.nickname==='新夥伴'));assert.ok(doc.getElementById('discussion-member').querySelectorAll('option').some(option=>option.value===newId));assert.ok(!calls.some(call=>['list_models','discuss','generate','compare'].includes(call.action)));
  const state=await source.request('state'),members=[...state.members];while(members.length<20)members.push({id:(members.length+100).toString(16).padStart(32,'0'),nickname:`額外成員${members.length}`,enabled:false,provider:'ollama',model:'explicit-fixture-model',ollamaUrl:'http://127.0.0.1:11434'});await source.request('save_members',{members,activeMemberId:state.activeMemberId,usageConsent:true,expectedSettingsRevision:state.settingsRevision});await app.reload();await fixtureClick(doc,'系統設定');assert.equal(doc.body.querySelectorAll('.member-settings-card').length,20);assert.equal(fixtureButton(doc,'＋ 新增 AI 成員').disabled,true);await fixtureDialogClick(doc,'取消');
 });
});

test('clearing the discussion selector sends explicit null with revision and does not choose a fallback',async()=>{
 await withMemberFixture(async context=>{
  const {doc,calls}=context;await fixtureSelect(doc,'discussion-member','');const request=calls.find(call=>call.action==='select_member');assert.equal(request.payload.memberId,null);assert.equal(request.payload.expectedSettingsRevision,1);assert.equal((await context.state).activeMemberId,null);assert.equal(doc.getElementById('discussion-member').value,'');assert.match(doc.getElementById('ai-setup-status').textContent,/尚未選擇/);assert.ok(!calls.some(call=>['discuss','generate','compare'].includes(call.action)));
 });
});


test('reference picker excludes archived versions and empty sources while retaining pinned archived snapshots',async()=>{
 await withLiveFixture(async context=>{
  const {doc,root,source,app,calls}=context;let p=context.project;const sourceId=p.activeItemId,targetId=p.creativeItems[1].id,archived=structuredClone(p.versions[0]);
  p=await call(source,'select_item',p,{itemId:targetId});p=await call(source,'attach_reference',p,{targetItemId:sourceId,versionId:archived.id});const pinned=structuredClone(p.activeItem.references);
  p=await call(source,'select_item',p,{itemId:sourceId});p=await call(source,'archive_version',p,{versionId:archived.id});
  p=await call(source,'create_item',p,{type:'titles',title:'只有封存版本的來源',description:'不應出現在來源選單'});const excludedId=p.activeItemId;
  for(const text of ['海報','居民與創作者','日常故事'])p=await call(source,'discuss',p,{text,consent:true});p=await call(source,'summarize',p,{consent:true});p=await call(source,'approve_goal',p);
  p=await call(source,'snapshot',p,{items:[item()],goalText:'只有封存版本的測試',rationale:'測試來源資格'});p=await call(source,'archive_version',p,{versionId:p.versions[0].id});
  p=await call(source,'select_item',p,{itemId:targetId});await app.reload();assert.deepEqual(context.project.activeItem.references,pinned);const originalCards=root.querySelectorAll('.reference-card').map(card=>card.textContent);assert.ok(originalCards.some(text=>text.includes(archived.title)));
  await fixtureClick(doc,'＋ 加入引用');assert.deepEqual(doc.getElementById('reference-source').querySelectorAll('option').map(option=>option.value),[sourceId]);assert.ok(!doc.getElementById('reference-source').textContent.includes('只有封存版本的來源'));assert.ok(!doc.getElementById('reference-source').querySelectorAll('option').some(option=>option.value===excludedId));
  assert.deepEqual(doc.getElementById('reference-version').querySelectorAll('option').map(option=>option.value),p.creativeItems.find(candidate=>candidate.id===sourceId).versions.filter(version=>version.id!==archived.id).map(version=>version.id));assert.match(doc.body.querySelector('dialog').textContent,/既有固定引用不受封存影響/);await fixtureDialogClick(doc,'取消');assert.deepEqual(root.querySelectorAll('.reference-card').map(card=>card.textContent),originalCards);assert.deepEqual(context.project.activeItem.references,pinned);assert.ok(!calls.some(request=>request.action==='attach_reference'));
  await assert.rejects(call(source,'attach_reference',p,{targetItemId:sourceId,versionId:archived.id}),/來源版本已封存/);
 });
});

test('member selector is in the composer directly before its label, after the complete history',async()=>{
 await withMemberFixture(async({doc,root,calls})=>{
  const panel=root.querySelector('.dialogue-panel'),history=doc.getElementById('conversation'),composer=root.querySelector('.chat-composer'),selector=root.querySelector('.quick-switch');
  assert.equal(selector.parentNode,composer);assert.equal(composer.children[0],selector);
  assert.equal(composer.children[1].tagName,'LABEL');assert.equal(composer.children[1].getAttribute('for'),'chat-input');assert.equal(composer.children[1].textContent,'針對正式版繼續修改或討論');
  assert.ok(panel.children.indexOf(history)<panel.children.indexOf(composer));assert.equal(history.querySelector('.quick-switch'),null);assert.equal(root.querySelectorAll('#discussion-member').length,1);
  assert.ok(history.querySelectorAll('.chat-entry').length>3);assert.match(selector.textContent,/下一次操作使用這位 AI 成員/);assert.deepEqual(calls.map(c=>c.action),['state','project']);
 });
});

test('UI defaults and seeded demo use general-audience creative examples, without altering legacy role storage',async()=>{
 const inappropriate=/學生|作業|課程|校園|學校|老師|教師|同學|教學|教室/;
 for(const path of ['../public/app.js','../public/demo.js','../public/styles.css'])assert.doesNotMatch(await readFile(new URL(path,import.meta.url),'utf8'),inappropriate);
 const source=createDemoAdapter(),state=await source.request('state'),project=(await source.request('project',{id:state.projects[0].id})).project;
 assert.match(project.title,/社區影像展/);assert.match(project.brief.audience,/居民與創作者/);assert.doesNotMatch(JSON.stringify(project),inappropriate);assert.ok(project.messages.some(message=>message.role==='student'));
 let created=await readyProject(source);created=await call(source,'generate',created,{consent:true});assert.doesNotMatch(JSON.stringify(created.brief)+JSON.stringify(created.versions),inappropriate);
 await withMemberFixture(async({doc,root})=>{
  assert.doesNotMatch(root.textContent,inappropriate);await fixtureClick(doc,'＋ 新的共創');assert.match(doc.getElementById('project-name').getAttribute('placeholder'),/社區影像展/);await fixtureDialogClick(doc,'取消');
 });
});

test('existing user-authored school content stays intact while its stored student role displays as you',async()=>{
 const originals={document:globalThis.document,addEventListener:globalThis.addEventListener,setTimeout:globalThis.setTimeout};const {doc,root}=fixtureDocument();globalThis.document=doc;globalThis.addEventListener=()=>{};globalThis.setTimeout=(handler,delay,...args)=>{const timer=originals.setTimeout(handler,delay,...args);timer.unref?.();return timer;};
 try{
  const source=createDemoAdapter(),state=await source.request('state'),project=(await source.request('project',{id:state.projects[0].id})).project;
  project.title='使用者原有的校園專案';project.description='這是我自行保存的課程資料，不應自動改名。';const message=project.messages.find(message=>message.role==='student');message.text='學生自己寫的原始文字仍需完整保留。';
  const original=structuredClone(project),adapter={async request(action){if(action==='state')return state;if(action==='project')return {project};throw new Error('Read-only preservation fixture');}};
  await createTitleApp({root,adapter,demo:true});assert.deepEqual(project,original);assert.match(root.textContent,/使用者原有的校園專案/);assert.match(root.textContent,/學生自己寫的原始文字/);assert.equal(doc.getElementById(`message-${message.id}`).querySelector('.chat-role').textContent,'你');assert.deepEqual(exportProject(project).project.messages,original.messages);
 }finally{Object.assign(globalThis,originals);}
});

test('actual renderer and fetch requests switch Ollama to OpenAI and back with exact approved snapshots and preserved context',async()=>{
 await withMemberFixture(async context=>{
  const {doc,root,calls,first,second}=context,original=structuredClone(context.project),history=root.querySelectorAll('.chat-entry').map(node=>node.textContent);
  await fixtureFill(doc,'chat-input','請把第一項內容改為「跨供應者的第一輪」');await fixtureFill(doc,'editor-title','尚未保存的整組草稿');await fixtureFill(doc,'editor-goal','尚未保存的本版目標與修改意見');
  await fixtureSelect(doc,'discussion-member',second);
  assert.deepEqual(context.project,original);assert.deepEqual(root.querySelectorAll('.chat-entry').map(node=>node.textContent),history);assert.equal(doc.getElementById('chat-input').value,'請把第一項內容改為「跨供應者的第一輪」');assert.equal(doc.getElementById('editor-title').value,'尚未保存的整組草稿');assert.equal(doc.getElementById('editor-goal').value,'尚未保存的本版目標與修改意見');assert.equal(doc.getElementById('editor-rationale'),null);
  assert.deepEqual(calls.filter(c=>c.action==='select_member').map(c=>c.payload),[{memberId:second,expectedSettingsRevision:1,action:'select_member'}]);assert.ok(!calls.some(c=>['discuss','summarize','generate','compare','list_models'].includes(c.action)));
  await fixtureClick(doc,'送出想法 ↗');assert.equal(doc.body.querySelector('dialog'),null);let paid=calls.filter(c=>c.action==='discuss'),body=paid[0].payload;
  assert.equal(body.approvedMemberId,second);assert.equal(body.approvedProvider,'openai');assert.equal(body.approvedModel,'fixture-second');assert.equal(body.approvedSettingsRevision,2);assert.equal(body.approvedKeyRevision,7);assert.equal(body.id,original.id);assert.equal(body.itemId,original.activeItemId);assert.equal(body.revision,original.revision);assert.equal(body.officialVersionId,original.officialVersionId);assert.match(body.requestId,/^[a-f0-9]{32}$/);
  assert.deepEqual(context.project.versions.slice(0,original.versions.length),original.versions);assert.deepEqual(context.project.messages.slice(0,original.messages.length),original.messages);const firstReply=structuredClone(context.project.messages.at(-1));assert.equal(firstReply.provenance.memberId,second);assert.equal(firstReply.provenance.memberNickname,'阿哲');
  const beforeSecond=structuredClone(context.project);await fixtureSelect(doc,'discussion-member',first);assert.deepEqual(context.project,beforeSecond);assert.equal(doc.getElementById('editor-title').value,'尚未保存的整組草稿');
  await fixtureFill(doc,'chat-input','請把第一項內容改為「跨供應者的第二輪」');await fixtureClick(doc,'送出想法 ↗');paid=calls.filter(c=>c.action==='discuss');body=paid[1].payload;
  assert.equal(body.approvedMemberId,first);assert.equal(body.approvedProvider,'ollama');assert.equal(body.approvedModel,'fixture-first');assert.equal(body.approvedSettingsRevision,3);assert.equal(body.approvedKeyRevision,undefined);assert.equal(body.revision,beforeSecond.revision);assert.equal(body.officialVersionId,original.officialVersionId);assert.notEqual(body.requestId,paid[0].payload.requestId);
  assert.deepEqual(context.project.messages.find(message=>message.id===firstReply.id),firstReply);assert.deepEqual(context.project.versions.slice(0,beforeSecond.versions.length),beforeSecond.versions);assert.equal(context.project.versions.at(-1).basedOnVersionId,original.officialVersionId);assert.equal(context.project.officialVersionId,original.officialVersionId);assert.equal(doc.getElementById('discussion-member').value,first);assert.equal(calls.filter(c=>c.action==='select_member').at(-1).payload.expectedSettingsRevision,2);
 },{secondProvider:'openai',keyPresent:true});
});

test('known invalid model output is rejected, not an unknown operation, and allows a deliberate member change without losing drafts',async()=>{
 await withMemberFixture(async context=>{
  const {doc,root,calls,second}=context,original=structuredClone(context.project),text='這段修改要求需保留，讓我自行決定下一步';
  context.setDiscussionFailure({status:502,body:{error:{code:'MODEL_OUTPUT_INVALID',message:'AI 釐清回覆不得假裝修改作品，且每次只能問一個問題。本次未保存結果；模型端可能已產生費用。',operationOutcome:'rejected'}}});
  await fixtureFill(doc,'chat-input',text);await fixtureFill(doc,'editor-title','拒絕回覆時仍保留的草稿');await fixtureClick(doc,'送出想法 ↗');
  assert.match(root.querySelector('.error').textContent,/AI 釐清回覆不得假裝修改作品/);assert.match(root.querySelector('.error').textContent,/可能已產生費用/);assert.equal(root.querySelector('.uncertain'),null);assert.equal(doc.getElementById('discussion-member').disabled,false);assert.equal(doc.getElementById('send-chat').disabled,false);assert.equal(doc.getElementById('chat-input').value,text);assert.equal(doc.getElementById('editor-title').value,'拒絕回覆時仍保留的草稿');assert.deepEqual(context.project,original);assert.equal(calls.filter(c=>c.action==='discuss').length,1);
  await fixtureSelect(doc,'discussion-member',second);assert.equal(doc.getElementById('chat-input').value,text);assert.deepEqual(context.project,original);assert.equal(calls.filter(c=>c.action==='discuss').length,1);context.setDiscussionFailure(null);
  await fixtureFill(doc,'chat-input','請把第一項內容改為「自行選擇另一位成員後再送出」');await fixtureClick(doc,'送出想法 ↗');const requests=calls.filter(c=>c.action==='discuss');assert.equal(requests.length,2);assert.equal(requests[1].payload.approvedMemberId,second);assert.equal(requests[1].payload.approvedProvider,'openai');assert.equal(requests[1].payload.approvedSettingsRevision,2);assert.notEqual(requests[1].payload.requestId,requests[0].payload.requestId);assert.deepEqual(context.project.versions.slice(0,original.versions.length),original.versions);
 },{secondProvider:'openai',keyPresent:true});
});

test('timeouts, network loss, malformed JSON and old unclassified 5xx remain uncertain without automatic retry',async()=>{
 const failures=[
  {status:502,body:{error:{code:'MODEL_TIMEOUT',message:'模型逾時，結果未知。',operationOutcome:'unknown'}}},
  {status:503,body:{error:'舊版伺服器暫時無法回應。'}},
  {status:502,body:{error:{code:'MODEL_OUTPUT_INVALID',message:'舊版伺服器沒有結果標記。'}}},
  {network:true},
  {status:504,malformed:true},
  {status:503,body:null}
 ];
 for(const failure of failures)await withMemberFixture(async context=>{
  const {doc,root,calls}=context,original=structuredClone(context.project);context.setDiscussionFailure(failure);
  await fixtureFill(doc,'chat-input','結果未知時保留原稿');await fixtureClick(doc,'送出想法 ↗');assert.ok(root.querySelector('.uncertain'));assert.match(root.textContent,/上次操作結果尚未確認/);assert.equal(doc.getElementById('discussion-member').disabled,true);assert.equal(doc.getElementById('send-chat').disabled,true);assert.equal(fixtureButton(doc,'重試同一請求').disabled,true);assert.equal(doc.getElementById('chat-input').value,'結果未知時保留原稿');assert.equal(calls.filter(c=>c.action==='discuss').length,1);assert.deepEqual(context.project,original);
 });
});

test('checking an unknown result and receiving explicit rejection on the same request clears only the uncertainty',async()=>{
 await withMemberFixture(async context=>{
  const {doc,root,calls,first}=context,original=structuredClone(context.project);context.setDiscussionFailure({network:true});await fixtureFill(doc,'chat-input','檢查後仍需保留的原始要求');await fixtureClick(doc,'送出想法 ↗');const request=structuredClone(calls.find(c=>c.action==='discuss').payload);
  await fixtureClick(doc,'檢查最新狀態');assert.ok(root.querySelector('.uncertain'));assert.equal(fixtureButton(doc,'重試同一請求').disabled,false);assert.equal(calls.filter(c=>c.action==='discuss').length,1);
  context.setDiscussionFailure({status:502,body:{error:{code:'MODEL_OUTPUT_INVALID',message:'已確認這次回覆未保存。',operationOutcome:'rejected'}}});await fixtureClick(doc,'重試同一請求');
  assert.equal(calls.filter(c=>c.action==='discuss').length,2);assert.deepEqual(calls.filter(c=>c.action==='discuss')[1].payload,request);assert.equal(request.approvedMemberId,first);assert.equal(root.querySelector('.uncertain'),null);assert.match(root.querySelector('.error').textContent,/已確認這次回覆未保存/);assert.equal(doc.getElementById('discussion-member').disabled,false);assert.equal(doc.getElementById('chat-input').value,'檢查後仍需保留的原始要求');assert.deepEqual(context.project,original);
 });
});

test('combined version metadata prefers stored text verbatim and joins unique legacy values without loss',()=>{
 const legacy={goalText:'保留原本目標\n與第二行',goalSnapshot:{summary:'不得替換成這段'},changeSummary:'這是不同的討論變更',rationale:'這是另外保存的修改意見'},original=structuredClone(legacy);
 assert.equal(versionGoalAndRationale(legacy),'本版目標：\n保留原本目標\n與第二行\n\n討論與變更摘要：\n這是不同的討論變更\n\n修改意見：\n這是另外保存的修改意見');assert.deepEqual(legacy,original);
 assert.equal(versionGoalAndRationale({goalText:'相同文字',changeSummary:'相同文字',rationale:'相同文字'}),'本版目標：\n相同文字');
 assert.equal(versionGoalAndRationale({goalSnapshot:{summary:'舊摘要'},changeSummary:'同一份意見',rationale:'同一份意見'}),'本版目標：\n舊摘要\n\n討論與變更摘要：\n同一份意見');
 assert.equal(versionGoalAndRationale({goalText:'',goalSnapshot:{summary:'不應補回'},rationale:'保留意見'}),'修改意見：\n保留意見');
 for(const value of ['','  已經合併的原文\n保留換行與空白  '])assert.equal(versionGoalAndRationale({...legacy,goalAndRationale:value}),value);
 const long={goalText:'目'.repeat(2000),changeSummary:'變'.repeat(666),rationale:'意'.repeat(666)},joined=versionGoalAndRationale(long);Object.values(long).forEach(value=>assert.ok(joined.includes(value)));assert.equal(combinedMetadataError(joined),'');
 assert.match(combinedMetadataError(' '),/請填寫本版目標與修改意見/);assert.equal(combinedMetadataError('中'.repeat(4000)),'');assert.match(combinedMetadataError('中'.repeat(4001)),/12,000/);assert.match(combinedMetadataError(null),/請填寫/);
});

test('explicit empty stored combined metadata does not fall back to old text or common goal',async()=>{
 const originals={document:globalThis.document,addEventListener:globalThis.addEventListener,setTimeout:globalThis.setTimeout};const {doc,root}=fixtureDocument();globalThis.document=doc;globalThis.addEventListener=()=>{};globalThis.setTimeout=(handler,delay,...args)=>{const timer=originals.setTimeout(handler,delay,...args);timer.unref?.();return timer;};
 try{
  const source=createDemoAdapter(),state=await source.request('state'),project=(await source.request('project',{id:state.projects[0].id})).project,official=project.versions.find(v=>v.id===project.officialVersionId);official.goalAndRationale='';const original=structuredClone(project);
  await createTitleApp({root,demo:true,adapter:{async request(action){if(action==='state')return state;if(action==='project')return {project};throw new Error('Read-only fixture');}}});
  assert.equal(doc.getElementById('editor-goal').value,'');assert.equal(doc.getElementById('editor-rationale'),null);assert.equal(doc.getElementById('save-snapshot').disabled,true);assert.equal(doc.getElementById('save-minor').disabled,true);assert.match(doc.getElementById('draft-status').textContent,/請填寫本版目標與修改意見/);assert.deepEqual(project,original);
 }finally{Object.assign(globalThis,originals);}
});

test('adopted item names prefer explicit main labels, then generic names, without altering full content',()=>{
 const fields=[item('en','英文名稱','English First'),item('generic','Name','Generic Name'),item('zh','中文 名稱','  採用的中文\n 名稱  '),item('other','主標題','另一個主標題')],original=structuredClone(fields);
 assert.equal(officialItemTitle(fields),'採用的中文 名稱');assert.deepEqual(fields,original);assert.equal(officialItemTitle(fields.slice(0,2)),'Generic Name');assert.equal(officialItemTitle([item('x','副標題','無明確主名稱時的第一項')]),'無明確主名稱時的第一項');assert.equal(officialItemTitle([item('x',' TITLE ','Generic Title')]),'Generic Title');assert.equal(officialItemTitle([]),'');
 const long='😀'.repeat(70),result=officialItemTitle([item('x','主標題',long)]);assert.equal(result,'😀'.repeat(59)+'…');assert.equal(new TextEncoder().encode(result).length,239);assert.equal(officialItemTitle([item('x','中文名','字'.repeat(59))]),'字'.repeat(59));
});

test('explicit promotion immediately renames only its creative item; pending changes and switching preserve names and history',async()=>{
 await withLiveFixture(async context=>{
  const {doc,root,calls}=context,initial=structuredClone(context.project),itemId=initial.activeItemId,projectTitle=initial.title,initialItemName=initial.activeItem.title,other=structuredClone(initial.creativeItems[1]);
  const selectedName=()=>root.querySelectorAll('.creative-item-tab').find(node=>node.getAttribute('aria-pressed')==='true').querySelector('strong').textContent;
  assert.equal(selectedName(),initialItemName);await fixtureClick(doc,'再產生一組候選 ↗');assert.equal(context.project.activeItem.title,initialItemName);assert.equal(selectedName(),initialItemName);
  await fixtureFill(doc,'editor-title','正式採用後才更新的名稱');await fixtureClick(doc,doc.getElementById('save-minor').textContent);const candidate=structuredClone(context.project.versions.at(-1));assert.equal(context.project.activeItem.title,initialItemName);assert.equal(context.project.title,projectTitle);
  await fixtureCardClick(doc,candidate.id,'設為正式版');assert.match(doc.body.querySelector('dialog').textContent,/創作項目會同步更名為「正式採用後才更新的名稱」，專案名稱不變/);await fixtureDialogClick(doc,'取消');assert.equal(context.project.activeItem.title,initialItemName);assert.equal(calls.filter(call=>call.action==='promote').length,0);
  await fixtureCardClick(doc,candidate.id,'設為正式版');await fixtureDialogClick(doc,'設為正式版');assert.equal(context.project.activeItem.title,'正式採用後才更新的名稱');assert.equal(selectedName(),'正式採用後才更新的名稱');assert.equal(root.querySelector('.active-item-header').querySelector('h2').textContent,'正式採用後才更新的名稱');assert.equal(context.project.title,projectTitle);assert.deepEqual(context.project.creativeItems.find(i=>i.id===other.id),other);assert.deepEqual(context.project.versions.find(v=>v.id===candidate.id),candidate);
  await fixtureFill(doc,'chat-input','請把第一項內容改為「採用第二次修改後的名稱」');await fixtureClick(doc,'送出想法 ↗');const revision=structuredClone(context.project.versions.at(-1));assert.equal(revision.source,'revision');assert.equal(context.project.activeItem.title,'正式採用後才更新的名稱');assert.equal(selectedName(),'正式採用後才更新的名稱');
  await fixtureClick(doc,'採用這次修改');await fixtureDialogClick(doc,'確認採用這次修改');assert.equal(context.project.activeItem.title,'採用第二次修改後的名稱');assert.equal(selectedName(),'採用第二次修改後的名稱');assert.equal(root.querySelector('.active-item-header').querySelector('h2').textContent,'採用第二次修改後的名稱');assert.equal(context.project.title,projectTitle);assert.deepEqual(context.project.versions.find(v=>v.id===revision.id),revision);assert.deepEqual(context.project.versions.find(v=>v.id===candidate.id),candidate);
  const switched=root.querySelectorAll('.creative-item-tab')[1];void switched.dispatchEvent('click');await settle();assert.equal(context.project.activeItemId,other.id);assert.equal(context.project.activeItem.title,other.title);void root.querySelectorAll('.creative-item-tab')[0].dispatchEvent('click');await settle();assert.equal(context.project.activeItemId,itemId);assert.equal(selectedName(),'採用第二次修改後的名稱');assert.equal(context.project.title,projectTitle);assert.deepEqual(context.project.versions.find(v=>v.id===revision.id),revision);assert.deepEqual(context.project.versions.slice(0,initial.versions.length),initial.versions);
 });
});

test('demo promotion chooses the Chinese main title even when an English item is listed first',async()=>{
 const api=createDemoAdapter();let project=(await api.request('project',{id:(await api.request('state')).projects[0].id})).project;const title=project.title,oldName=project.activeItem.title,fields=[item('en','英文名稱','Do Not Rename To English'),item('note','宣傳短句','不是項目名稱'),item('zh','中文名稱','中文主名稱優先')];
 project=await call(api,'snapshot',project,{items:fields,basedOnVersionId:project.officialVersionId,goalAndRationale:'這個測試只在採用正式版時更新項目名稱。'});const version=structuredClone(project.versions.at(-1));assert.equal(project.activeItem.title,oldName);project=await call(api,'promote',project,{versionId:version.id});assert.equal(project.activeItem.title,'中文主名稱優先');assert.equal(project.title,title);assert.deepEqual(project.versions.find(v=>v.id===version.id),version);assert.deepEqual(project.versions.find(v=>v.id===version.id).items,fields);
});

test('workspace terminology describes creative content and dynamic version saving naturally',async()=>{
 await withLiveFixture(async({doc,root})=>{
  assert.equal(doc.getElementById('editor-heading').textContent,'編輯創作內容');assert.equal(doc.getElementById('save-snapshot').textContent,'另存新版本 V5');assert.equal(doc.getElementById('save-minor').textContent,'另存小修改 V4.1');assert.doesNotMatch(root.textContent,/整組名稱|整組另存|指定小修改/);
 });
 for(const path of ['../public/app.js','../public/demo.js'])assert.doesNotMatch(await readFile(new URL(path,import.meta.url),'utf8'),/整組/);
});
