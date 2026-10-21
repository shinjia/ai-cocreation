// Production JavaScript + minimal DOM fixture + scripted adapter/mocked fetch only.
// No real browser layout, PHP server, model API, or paid inference runs in this file.
import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {MODULES,contentType,contentItemsError,projectMember,canConfirmGenerate,refinementRangeError,discussionChoices,currentChoiceQuestion,memberRosterError,enabledMembers,activeMember,aiSetupReason,formatDate,createApiAdapter,createTitleApp,createRequestId,canGenerate,canSummarize,canCreate,canSnapshot,newestPendingRevision,revisionChanges,versionSourceLabel,versionLabel,versionCoordinates,nextVersionCoordinates,isArchivedVersion,comparisonDisabledReason,comparisonQuestionError,versionGoalText,versionGoalAndRationale,combinedMetadataError,officialItemTitle,snapshotMetadataError,comparisonUsesSnapshots,COMPARISON_SNAPSHOT_NOTE,validComparison,validItems,versionItems,provenanceLabel,exportProject} from '../public/app.js';
import {createDemoAdapter} from '../public/demo.js';
const item=(id='name',label='中文名稱',content='讓日常，被看見')=>({id,label,content});
async function call(api,action,p,extra={}){return (await api.request(action,{id:p.id,itemId:p.activeItemId,revision:p.revision,...extra})).project;}
async function boundProject(api,extra={}){
 const settings=await api.request('state');
 return (await api.request('new',{title:'測試專案',description:'社區影展',memberId:settings.activeMemberId,expectedSettingsRevision:settings.settingsRevision,...extra})).project;
}
async function readyProject(api){
 let p=await boundProject(api);
 p=await call(api,'discuss',p,{text:'社區影展海報，邀請居民與創作者一起看見日常故事。',consent:true});
 assert.equal(canConfirmGenerate(p),true);assert.equal(p.versions.length,0);
 // Keep compatibility-path coverage; deliberate confirm_generate has separate tests.
 return call(api,'approve_goal',p);
}
test('request IDs use secure random 32-character lowercase hex',()=>{
 const a=createRequestId(webcrypto),b=createRequestId(webcrypto);assert.match(a,/^[a-f0-9]{32}$/);assert.notEqual(a,b);assert.throws(()=>createRequestId(null));
});
test('goal summary and generation are separate, lifecycle-aware gates',()=>{
 const p={messages:[{role:'student'},{role:'student'}],phase:'discussion',goalApprovedAt:null,lifecycle:'in_progress'};
 assert.equal(canSummarize(p),true);p.messages.push({role:'student'});assert.equal(canSummarize(p),true);assert.equal(canGenerate(p),false);
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
test('one sufficient discussion permits direction confirmation while compatibility generation remains explicit',async()=>{
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
 const view=await readFile(new URL('../app/view.html',import.meta.url),'utf8');assert.match(view,/src="\.\/app\.js\?v=20261021-version12"/);assert.match(view,/href="\.\/styles\.css\?v=20261021-version12"/);assert.match(html,/demo\.js\?v=20261021-version12/);assert.match(demo,/app\.js\?v=20261021-version12/);
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
test('manual direction summary requires discussion content, never an arbitrary three-turn count',()=>{
 const p={lifecycle:'in_progress',messages:[{role:'student',kind:'reference_added'},{role:'student',kind:'promote'}]};assert.equal(canSummarize(p),false);p.messages.push({role:'student',kind:'discussion'});assert.equal(canSummarize(p),true);
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
 const doc={activeElement:null,createElement(tag){return new FixtureNode(tag,this);},createElementNS(ns,tag){const node=new FixtureNode(tag,this);node.namespaceURI=ns;return node;},createTextNode(text){return new FixtureNode('#text',this,text);},getElementById(id){return this.body.id===id?this.body:this.body.querySelector('#'+id);}};
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
  await createTitleApp({root,adapter,demo:true});assert.equal(doc.body.querySelectorAll('.creative-item-tab').length,2);assert.equal(doc.body.querySelectorAll('.tree-version').length,4);assert.ok(root.textContent.includes('腳本示範，不是真實 AI'));
  await fixtureFill(doc,'editor-title','還沒保存的創作草稿');const tabs=doc.body.querySelectorAll('.creative-item-tab');void tabs[1].dispatchEvent('click');await settle();assert.equal(doc.body.querySelectorAll('.conversation').length,0);assert.ok(root.textContent.includes('這個類型尚未實作'));
  void doc.body.querySelectorAll('.creative-item-tab')[0].dispatchEvent('click');await settle();assert.equal(doc.getElementById('editor-title').value,'還沒保存的創作草稿');
  const before=calls.length;await fixtureClick(doc,'AI 系統設定（示範）');assert.ok(doc.body.querySelector('dialog').open);await fixtureClick(doc,'取消');assert.equal(calls.length,before);assert.equal(doc.getElementById('editor-title').value,'還沒保存的創作草稿');
  await fixtureClick(doc,'＋ 新增創作項目');await fixtureFill(doc,'creative-item-name','第二個命名項目');await fixtureFill(doc,'creative-item-description','獨立任務');await fixtureClick(doc,'新增創作項目');assert.equal(doc.body.querySelectorAll('.creative-item-tab').length,3);assert.equal(doc.body.querySelectorAll('.tree-version').length,0);assert.equal(doc.getElementById('editor-title').value,'');
  assert.ok(!calls.some(c=>['discuss','summarize','generate','compare'].includes(c.action)));
 }finally{globalThis.document=originalDocument;globalThis.addEventListener=originalListener;globalThis.setTimeout=originalSetTimeout;}
});
test('real settings DOM fixture saves roster without rebinding projects and clears key before adapter request',async()=>{
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

test('renderer plus mocked fetch transport creates a project through real fetch transport and reopens after bootstrap',async()=>{
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
  await fixtureClick(doc,'建立第一個專案');await fixtureFill(doc,'project-name','修補驗證專案');await fixtureFill(doc,'project-description','新增後立即進入工作區');assert.equal(doc.getElementById('project-member').value,'');assert.equal(doc.getElementById('project-member').required,true);await fixtureClick(doc,'建立專案');assert.equal(calls.filter(call=>call.action==='new').length,0);await fixtureSelect(doc,'project-member',(await source.request('state')).activeMemberId);await fixtureClick(doc,'建立專案');await settle();
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
  let panel=doc.getElementById('revision-review');assert.ok(panel);assert.equal(panel.querySelectorAll('.bundle-item').length,4);assert.match(panel.textContent,/第一輪明確修改/);assert.match(panel.textContent,/原始自訂名稱/);assert.match(panel.textContent,/1 項有變動，3 項維持不變/);assert.match(panel.textContent,/固定腳本 · 非 AI/);assert.match(panel.textContent,/來源|起點/);
  custom.slice(1).forEach(field=>assert.ok(panel.textContent.includes(field.content)));assert.equal(doc.body.querySelectorAll('#version-'+first.id).length,1);assert.match(doc.body.querySelector('.official-card').textContent,/原始自訂名稱/);assert.equal(doc.getElementById('chat-input').value,'');
  await fixtureClick(doc,'採用這次修改');await fixtureDialogClick(doc,'取消');assert.equal(savedProject.officialVersionId,original.id);
  await fixtureClick(doc,'採用這次修改');await fixtureDialogClick(doc,'確認採用這次修改');assert.equal(savedProject.officialVersionId,first.id);assert.equal(doc.getElementById('revision-review'),null);assert.match(doc.body.querySelector('.official-card').textContent,/第一輪明確修改/);
  await fixtureFill(doc,'chat-input','請把第一項內容改為「第二輪接續修改」');await fixtureClick(doc,'送出想法 ↗');assert.equal(doc.body.querySelector('dialog'),null);await settle();const second=structuredClone(savedProject.versions.at(-1));
  assert.equal(second.basedOnVersionId,first.id);assert.equal(savedProject.officialVersionId,first.id);assert.deepEqual(second.items.slice(1),custom.slice(1));assert.deepEqual(savedProject.versions.find(v=>v.id===original.id),original);assert.deepEqual(savedProject.versions.find(v=>v.id===first.id),first);
  panel=doc.getElementById('revision-review');assert.match(panel.textContent,/第一輪明確修改/);assert.match(panel.textContent,/第二輪接續修改/);assert.ok(root.querySelectorAll('.tree-version').some(n=>n.textContent.includes('AI 討論修改版') && n.textContent.includes('固定腳本 · 非 AI')));
  const count=savedProject.versions.length;await fixtureFill(doc,'chat-input','還有什麼想法？');await fixtureClick(doc,'送出想法 ↗');assert.equal(doc.body.querySelector('dialog'),null);await settle();assert.equal(savedProject.versions.length,count);assert.match(doc.getElementById('app-toast').textContent,/這次沒有新增修改版/);assert.equal(savedProject.officialVersionId,first.id);assert.ok(doc.getElementById('revision-review'));
  // Reload bootstraps the pending review from saved data, rather than transient UI state.
  await createTitleApp({root,adapter:createApiAdapter(),demo:false});assert.match(doc.getElementById('revision-review').textContent,/第二輪接續修改/);
  await fixtureClick(doc,'採用這次修改');await fixtureDialogClick(doc,'確認採用這次修改');await fixtureClick(doc,'此項目定稿');await fixtureDialogClick(doc,'確認結案定稿');
  const finalized=structuredClone(savedProject.finalizations[0]);assert.equal(doc.getElementById('chat-input').disabled,true);assert.match(root.textContent,/請先按「重新開啟此項目」/);
  await fixtureClick(doc,'重新開啟此項目');await fixtureDialogClick(doc,'重新開啟討論');assert.equal(doc.getElementById('chat-input').disabled,false);
  await fixtureSelect(doc,'editor-source',second.id);await fixtureFill(doc,'chat-input','請把第一項內容改為「定稿後重新開啟再修改」');await fixtureClick(doc,'送出想法 ↗');assert.equal(doc.body.querySelector('dialog'),null);await settle();assert.equal(savedProject.versions.at(-1).basedOnVersionId,second.id);assert.deepEqual(savedProject.finalizations[0],finalized);
 }finally{Object.assign(globalThis,originals);}
});

test('real renderer does not block official manual edits or discussion when old goal approval is null',async()=>{
 const originals={document:globalThis.document,addEventListener:globalThis.addEventListener,setTimeout:globalThis.setTimeout};
 const {doc,root}=fixtureDocument();globalThis.document=doc;globalThis.addEventListener=()=>{};globalThis.setTimeout=(handler,delay,...args)=>{const timer=originals.setTimeout(handler,delay,...args);timer.unref?.();return timer;};
 try{
  const source=createDemoAdapter();let p=(await source.request('project',{id:(await source.request('state')).projects[0].id})).project;
  p=await call(source,'edit_project',p,{title:p.title,description:'重現尚未確認目標的舊專案'});
  await createTitleApp({root,adapter:source,demo:true});assert.equal(fixtureButton(doc,'再產生一組候選 ↗').disabled,true);assert.match(root.textContent,/繼續修改|另存/);
  await fixtureClick(doc,'手動編輯這一版');assert.equal(doc.getElementById('save-snapshot').disabled,false);await fixtureFill(doc,'editor-title','手動修改仍可保存');assert.equal(doc.getElementById('save-snapshot').disabled,false);await fixtureClick(doc,doc.getElementById('save-snapshot').textContent);assert.match(root.textContent,/手動修改仍可保存/);
  await fixtureFill(doc,'chat-input','請把第一項內容改為「舊專案也能繼續討論修改」');await fixtureClick(doc,'送出想法 ↗');assert.equal(doc.body.querySelector('dialog'),null);await settle();assert.match(doc.getElementById('revision-review').textContent,/舊專案也能繼續討論修改/);assert.equal(fixtureButton(doc,'此項目定稿').disabled,true);
 }finally{Object.assign(globalThis,originals);}
});

test('persisted promotion history does not resurrect an already-adopted revision after selecting its old base',()=>{
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
  if(options.method==='POST'){payload=JSON.parse(options.body);assert.equal(payload.action,action);assert.equal(options.headers['X-CSRF-Token'],'fixture-csrf');if(!['save_members','select_member','select_item','list_models','set_key','clear_key','bind_project_model'].includes(action))assert.equal(payload.itemId,savedProject.activeItemId);}
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
  assert.ok(root.querySelectorAll('.tree-version').some(row=>row.textContent.includes('已封存') && row.textContent.includes('還原版本')));assert.ok(!doc.getElementById(`version-${official}`).querySelectorAll('button').some(b=>b.textContent==='封存'));
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
  assert.equal(doc.getElementById('editor-goal').value,versionGoalAndRationale(official));assert.equal(doc.getElementById('editor-rationale'),null);assert.equal(root.querySelector('.editor-panel').querySelectorAll('.editor-note').length,1);assert.match(root.querySelector('.editor-panel').textContent,/版本微調工作區/);assert.doesNotMatch(root.querySelector('.editor-panel').textContent,/04 加入你的判斷/);assert.ok(root.querySelectorAll('label').some(label=>label.textContent==='本版目標與修改意見' && label.getAttribute('for')==='editor-goal'));
  await fixtureFill(doc,'editor-goal','');assert.equal(doc.getElementById('save-snapshot').disabled,true);assert.equal(doc.getElementById('save-minor').disabled,true);assert.match(doc.getElementById('draft-status').textContent,/請填寫本版目標與修改意見/);
  await fixtureFill(doc,'editor-goal','中'.repeat(4001));assert.match(doc.getElementById('draft-status').textContent,/12,000/);assert.equal(doc.getElementById('save-minor').disabled,true);
  const combined='  本版改以第一次參加影展的觀眾為對象，名稱要更容易朗讀。\n\n修改意見：保留原本整組作品，使用自己的完整說明。'+ '意'.repeat(450)+'  \n';
  await fixtureFill(doc,'editor-goal',combined);assert.equal(doc.getElementById('save-minor').disabled,false);await fixtureClick(doc,'另存小修改 V4.1');const minor=structuredClone(context.project.versions.at(-1));
  assert.equal(minor.goalAndRationale,combined);assert.equal(minor.goalText,official.goalText);assert.equal(minor.rationale,official.rationale);assert.equal(minor.changeSummary,official.changeSummary);assert.deepEqual(minor.items,official.items);assert.equal(context.project.officialVersionId,official.id);assert.deepEqual(context.project.versions.find(v=>v.id===official.id),official);assert.equal(context.project.brief.summary,commonGoal);
  const body=calls.filter(c=>c.action==='snapshot').at(-1).payload;assert.equal(body.goalAndRationale,combined);assert.equal(body.goalText,undefined);assert.equal(body.rationale,undefined);assert.equal(body.versionMode,'minor');assert.ok(doc.getElementById(`version-${minor.id}`).textContent.includes(combined));
  await fixtureSelect(doc,'editor-source',minor.id);assert.equal(doc.getElementById('editor-goal').value,combined);await fixtureClick(doc,'另存小修改 V4.2');const repeated=structuredClone(context.project.versions.at(-1));assert.equal(repeated.goalAndRationale,combined);await fixtureSelect(doc,'editor-source',repeated.id);assert.equal(doc.getElementById('editor-goal').value,combined);assert.deepEqual(context.project.versions.find(v=>v.id===minor.id),minor);
  await fixtureVersionSelect(doc,official.id);await fixtureVersionSelect(doc,minor.id);await fixtureClick(doc,'請 AI 提供比較意見 ↗');assert.equal(doc.body.querySelector('dialog'),null);await settle();
  const comparison=structuredClone(context.project.comparisons.at(-1));assert.equal(comparison.goalBasis,'version_snapshots');assert.equal(comparison.goalSnapshot,null);assert.deepEqual(comparison.versionGoalSnapshots.map(v=>v.goalAndRationale),[versionGoalAndRationale(official),combined]);assert.ok(doc.getElementById('comparison-section').textContent.includes(combined));assert.ok(doc.getElementById('comparison-section').textContent.includes(versionGoalAndRationale(official)));
  await fixtureFill(doc,'editor-goal','後續另一個版本的目標與另一輪修正意見');await fixtureClick(doc,'另存新版本 V5');assert.deepEqual(context.project.comparisons.at(-1),comparison);assert.deepEqual(context.project.versions.find(v=>v.id===minor.id),minor);assert.ok(root.querySelectorAll('.tree-version').some(row=>row.textContent.includes(combined)));
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
 const source=createDemoAdapter({seed:false}),initial=await source.request('state'),first=initial.members[0].id,second='22222222222222222222222222222222',disabled='33333333333333333333333333333333';
 await source.request('save_members',{members:[{...initial.members[0],nickname:'小光',provider,model:'fixture-first'},{id:second,nickname:'阿哲',enabled:true,provider:secondProvider,model:'fixture-second',ollamaUrl:'http://127.0.0.1:11434'},{id:disabled,nickname:'尚未上班',enabled:false,provider:'openai',model:'fixture-disabled',ollamaUrl:'http://127.0.0.1:11434'}],activeMemberId:first,usageConsent:true,expectedSettingsRevision:initial.settingsRevision});
 let project=await readyProject(source);project=await call(source,'generate',project,{consent:true});
 project=await call(source,'snapshot',project,{items:[...project.versions[0].items,item('curatorial-note','策展短文','完整保留的示範短文。')],basedOnVersionId:project.versions[0].id});project=await call(source,'promote',project,{versionId:project.versions.at(-1).id});
 if(!usageConsent){const current=await source.request('state');await source.request('save_members',{members:current.members,activeMemberId:first,usageConsent:false,expectedSettingsRevision:current.settingsRevision});}
 let modelResult=modelResponse,hold=null,release=null,key=keyPresent,keyRevision=keyPresent?7:0,discussionFailure=null;const calls=[];
 globalThis.fetch=async(url,options)=>{
  const action=new URL(url).searchParams.get('action');let payload={};if(options.method==='POST'){payload=JSON.parse(options.body);assert.equal(payload.action,action);assert.equal(options.headers['X-CSRF-Token'],'member-fixture-csrf');}else if(action==='project')payload={id:new URL(url).searchParams.get('id')};calls.push({action,payload});
  if(action==='discuss' && hold)await hold;
  if(action==='discuss' && discussionFailure){
   if(discussionFailure.network)throw new TypeError('fixture network interruption');
   return {ok:false,status:discussionFailure.status || 502,json:async()=>{if(discussionFailure.malformed)throw new SyntaxError('fixture invalid JSON');return discussionFailure.body;}};
  }
  if(action==='list_models')return modelResult?.error?{ok:false,status:400,json:async()=>({error:modelResult.error})}:{ok:true,status:200,json:async()=>({...modelResult,provider:payload.provider})};
  if(action==='set_key'){assert.equal(doc.getElementById('api-key')?.value || '','');key=true;keyRevision=1;return {ok:true,status:200,json:async()=>({...await source.request('state'),keyPresent:true,keyRevision})};}
  try{const forwarded={...payload};if(forwarded.approvedKeyRevision!==undefined)forwarded.approvedKeyRevision=(await source.request('state')).keyRevision;const result=await source.request(action,forwarded);if(result.project)project=result.project;return {ok:true,status:200,json:async()=>action==='state' || result.csrf?{...result,keyPresent:key,keyRevision,csrf:'member-fixture-csrf'}:result};}catch(error){return {ok:false,status:error.status || 400,json:async()=>({error:error.message})};}
 };
 try{const app=await createTitleApp({root,adapter:createApiAdapter(),demo:false});await run({doc,root,calls,source,app,first,second,disabled,get project(){return project;},get state(){return source.request('state');},setModelResponse(value){modelResult=value;},setDiscussionFailure(value){discussionFailure=value;},holdDiscussion(){hold=new Promise(resolve=>{release=resolve;});},releaseDiscussion(){hold=null;release?.();}});}finally{release?.();Object.assign(globalThis,originals);}
}
async function fixtureCheck(doc,id,checked){const input=doc.getElementById(id);assert.ok(input,`checkbox exists: ${id}`);input.checked=checked;await input.dispatchEvent('change');}
async function fixtureSelect(doc,id,value){const select=doc.getElementById(id);assert.ok(select,`select exists: ${id}`);select.value=value;await select.dispatchEvent('change');await settle();}

test('one explicit setup opt-in enables multiple deliberate AI actions without per-request dialogs',async()=>{
 await withMemberFixture(async context=>{
  const {doc,root,calls,first}=context;await fixtureFill(doc,'chat-input','請把第一項內容改為「設定完成後直接討論」');assert.equal(doc.getElementById('send-chat').disabled,true);assert.match(doc.getElementById('ai-setup-status').textContent,/勾選同意/);assert.ok(!calls.some(call=>call.action==='list_models'));
  await fixtureClick(doc,'系統設定');const dialog=doc.body.querySelector('dialog');assert.match(dialog.textContent,/OpenAI API 費用/);assert.match(dialog.textContent,/不包含在 ChatGPT 訂閱/);assert.match(dialog.textContent,/不會背景呼叫/);assert.match(dialog.textContent,/轉送資料/);assert.match(dialog.textContent,/固定引用/);assert.equal(doc.getElementById('ai-usage-consent').checked,false);assert.ok(dialog.querySelector('.member-destinations').textContent.includes('fixture-first'));assert.ok(!dialog.querySelector('.member-destinations').textContent.includes('fixture-disabled'));
  await fixtureCheck(doc,'ai-usage-consent',true);await fixtureClick(doc,'保存成員與使用設定');assert.equal(doc.body.querySelector('dialog'),null);assert.equal(calls.filter(call=>call.action==='save_members').length,1);const saved=calls.find(call=>call.action==='save_members').payload;assert.equal(saved.expectedSettingsRevision,2);assert.equal(saved.usageConsent,true);assert.equal(saved.activeMemberId,first);assert.ok(!calls.some(call=>['discuss','generate','compare'].includes(call.action)));
  await fixtureClick(doc,'送出想法 ↗');assert.equal(doc.body.querySelector('dialog'),null);await fixtureFill(doc,'chat-input','請把第一項內容改為「第二次也不再詢問」');await fixtureClick(doc,'送出想法 ↗');assert.equal(doc.body.querySelector('dialog'),null);
  await fixtureClick(doc,'再產生一組候選 ↗');assert.equal(doc.body.querySelector('dialog'),null);await fixtureVersionSelect(doc,context.project.officialVersionId);await fixtureVersionSelect(doc,context.project.versions[0].id);await fixtureClick(doc,'請 AI 提供比較意見 ↗');assert.equal(doc.body.querySelector('dialog'),null);
  const paid=calls.filter(call=>['discuss','generate','compare'].includes(call.action));assert.deepEqual(paid.map(call=>call.action),['discuss','discuss','generate','compare']);paid.forEach(call=>{assert.equal(call.payload.approvedMemberId,first);assert.equal(call.payload.approvedModel,'fixture-first');assert.equal(call.payload.approvedSettingsRevision,3);assert.equal(call.payload.consent,true);});assert.match(root.textContent,/只有按下操作按鈕才會執行 AI/);
 },{usageConsent:false});
});

test('project model is fixed; global selection changes and disabling never reroute or lose drafts',async()=>{
 await withMemberFixture(async context=>{
  const {doc,root,calls,first,second,source,app}=context,history=root.querySelectorAll('.chat-entry').map(node=>node.textContent),binding=structuredClone(context.project.aiBinding);
  assert.equal(doc.getElementById('discussion-member'),null);assert.match(root.querySelector('.fixed-model').textContent,/小光.*fixture-first/);
  await fixtureFill(doc,'chat-input','切換全域預設時必須保留的討論草稿');await fixtureFill(doc,'editor-title','仍屬於固定模型專案的作品草稿');
  let settings=await source.request('state');await source.request('select_member',{memberId:second,expectedSettingsRevision:settings.settingsRevision});await app.reload();
  assert.deepEqual(context.project.aiBinding,binding);assert.equal(doc.getElementById('chat-input').value,'切換全域預設時必須保留的討論草稿');assert.equal(doc.getElementById('editor-title').value,'仍屬於固定模型專案的作品草稿');assert.deepEqual(root.querySelectorAll('.chat-entry').map(node=>node.textContent),history);
  await fixtureClick(doc,'系統設定');await fixtureCheck(doc,`member-enabled-${first}`,false);await fixtureClick(doc,'保存成員與使用設定');
  assert.equal(doc.getElementById('send-chat').disabled,true);assert.match(doc.getElementById('ai-setup-status').textContent,/停用|變更/);assert.deepEqual(context.project.aiBinding,binding);assert.equal((await source.request('state')).activeMemberId,second);assert.ok(!calls.some(call=>['discuss','generate','compare','list_models','select_member'].includes(call.action)));
  await fixtureClick(doc,'系統設定');await fixtureCheck(doc,`member-enabled-${first}`,true);await fixtureCheck(doc,'ai-usage-consent',true);await fixtureClick(doc,'保存成員與使用設定');assert.equal(doc.getElementById('send-chat').disabled,false);assert.deepEqual(context.project.aiBinding,binding);
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

test('in-flight calls retain their fixed project member and block duplicate requests without a model selector',async()=>{
 await withMemberFixture(async context=>{
  const {doc,calls,first}=context;context.holdDiscussion();await fixtureFill(doc,'chat-input','請把第一項內容改為「專案綁定測試」');await fixtureClick(doc,'送出想法 ↗');
  const request=calls.find(call=>call.action==='discuss');assert.equal(request.payload.approvedMemberId,first);assert.equal(request.payload.approvedModel,'fixture-first');assert.equal(doc.getElementById('discussion-member'),null);assert.equal(doc.getElementById('send-chat').disabled,true);
  void doc.getElementById('send-chat').dispatchEvent('click');await settle();assert.equal(calls.filter(call=>call.action==='discuss').length,1);context.releaseDiscussion();await settle();await settle();
  assert.equal(context.project.messages.at(-1).provenance.memberId,first);assert.equal(context.project.messages.at(-1).provenance.memberNickname,'小光');await fixtureFill(doc,'chat-input','下一次明確修改');assert.equal(doc.getElementById('send-chat').disabled,false);assert.ok(!calls.some(call=>call.action==='select_member'));
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
  const {doc,calls,first}=context;await fixtureFill(doc,'chat-input','不應送出');assert.equal(doc.getElementById('send-chat').disabled,true);assert.match(doc.getElementById('ai-setup-status').textContent,/金鑰.*到期/);assert.equal(context.project.aiBinding.memberId,first);assert.equal(doc.getElementById('discussion-member'),null);void doc.getElementById('send-chat').dispatchEvent('click');await settle();assert.ok(!calls.some(call=>call.action==='discuss'));assert.equal(doc.body.querySelector('dialog'),null);await fixtureClick(doc,'系統設定');assert.ok(doc.getElementById('api-key'));assert.match(doc.body.querySelector('dialog').textContent,/30 分鐘/);await fixtureDialogClick(doc,'取消');
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
  await fixtureFill(doc,`member-nickname-${newId}`,'新夥伴');await fixtureFill(doc,`member-model-${newId}`,'manual-new-model');await fixtureCheck(doc,`member-enabled-${newId}`,true);assert.equal(doc.getElementById('ai-usage-consent').checked,false);await fixtureCheck(doc,'ai-usage-consent',true);await fixtureClick(doc,'保存成員與使用設定');assert.ok((await context.state).members.some(member=>member.id===newId && member.nickname==='新夥伴'));assert.equal(doc.getElementById('discussion-member'),null);assert.equal(context.project.aiBinding.memberId,first);assert.ok(!calls.some(call=>['list_models','discuss','generate','compare'].includes(call.action)));
  const state=await source.request('state'),members=[...state.members];while(members.length<20)members.push({id:(members.length+100).toString(16).padStart(32,'0'),nickname:`額外成員${members.length}`,enabled:false,provider:'ollama',model:'explicit-fixture-model',ollamaUrl:'http://127.0.0.1:11434'});await source.request('save_members',{members,activeMemberId:state.activeMemberId,usageConsent:true,expectedSettingsRevision:state.settingsRevision});await app.reload();await fixtureClick(doc,'系統設定');assert.equal(doc.body.querySelectorAll('.member-settings-card').length,20);assert.equal(fixtureButton(doc,'＋ 新增 AI 成員').disabled,true);await fixtureDialogClick(doc,'取消');
 });
});

test('clearing the global default cannot unbind an existing project or choose a fallback',async()=>{
 await withMemberFixture(async context=>{
  const {doc,calls,source,app,first}=context,binding=structuredClone(context.project.aiBinding),settings=await source.request('state');
  await source.request('select_member',{memberId:null,expectedSettingsRevision:settings.settingsRevision});await app.reload();assert.equal((await source.request('state')).activeMemberId,null);assert.deepEqual(context.project.aiBinding,binding);assert.equal(doc.getElementById('discussion-member'),null);
  await fixtureFill(doc,'chat-input','請把第一項內容改為「不依賴全域預設」');assert.equal(doc.getElementById('send-chat').disabled,false);await fixtureClick(doc,'送出想法 ↗');assert.equal(calls.filter(call=>call.action==='discuss').at(-1).payload.approvedMemberId,first);assert.equal(context.project.messages.at(-1).provenance.memberId,first);
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

test('dialogue panel shows one fixed project model above the log and composer, with no quick switch',async()=>{
 await withMemberFixture(async({doc,root,calls})=>{
  const panel=root.querySelector('.dialogue-panel'),history=doc.getElementById('conversation'),composer=root.querySelector('.chat-composer'),model=root.querySelector('.project-model');
  assert.equal(panel.getAttribute('aria-labelledby'),'dialogue-heading');assert.equal(doc.getElementById('dialogue-heading').textContent,'與 AI 一起釐清方向');assert.equal(model.parentNode,panel);assert.ok(panel.children.indexOf(model)<panel.children.indexOf(history));assert.ok(panel.children.indexOf(history)<panel.children.indexOf(composer));
  assert.equal(doc.getElementById('discussion-member'),null);assert.equal(root.querySelector('.quick-switch'),null);assert.equal(root.querySelectorAll('.fixed-model').length,1);assert.equal(root.querySelectorAll('#ai-setup-status').length,1);assert.equal(history.getAttribute('role'),'log');assert.equal(doc.getElementById('ai-setup-status').getAttribute('role'),'status');
  assert.equal(composer.children[0].getAttribute('for'),'chat-input');assert.match(model.textContent,/此專案所有項目共用這個模型/);await fixtureFill(doc,'chat-input','保留輸入中的想法');await fixtureClick(doc,'AI 系統設定');await fixtureDialogClick(doc,'取消');assert.equal(doc.getElementById('chat-input').value,'保留輸入中的想法');assert.deepEqual(calls.map(call=>call.action),['state','project']);
 });
});

test('UI defaults and seeded demo use general-audience creative examples, without altering legacy role storage',async()=>{
 const inappropriate=/學生|作業|課程|校園|學校|老師|教師|同學|教學|教室/;
 for(const path of ['../public/app.js','../public/styles.css'])assert.doesNotMatch(await readFile(new URL(path,import.meta.url),'utf8'),inappropriate);
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

test('mocked fetch approvals stay on the bound provider after global defaults change, preserving context and drafts',async()=>{
 await withMemberFixture(async context=>{
  const {doc,root,calls,source,app,first,second}=context,original=structuredClone(context.project),history=root.querySelectorAll('.chat-entry').map(node=>node.textContent);
  await fixtureFill(doc,'chat-input','請把第一項內容改為「固定供應者的第一輪」');await fixtureFill(doc,'editor-title','尚未保存的完整草稿');await fixtureFill(doc,'editor-goal','尚未保存的本版目標與修改意見');
  let settings=await source.request('state');await source.request('select_member',{memberId:second,expectedSettingsRevision:settings.settingsRevision});await app.reload();assert.deepEqual(context.project,original);assert.deepEqual(root.querySelectorAll('.chat-entry').map(node=>node.textContent),history);assert.equal(doc.getElementById('editor-title').value,'尚未保存的完整草稿');assert.equal(doc.getElementById('editor-goal').value,'尚未保存的本版目標與修改意見');assert.equal(doc.getElementById('discussion-member'),null);
  await fixtureClick(doc,'送出想法 ↗');let paid=calls.filter(call=>call.action==='discuss'),body=paid[0].payload;
  assert.equal(body.approvedMemberId,first);assert.equal(body.approvedProvider,'ollama');assert.equal(body.approvedModel,'fixture-first');assert.equal(body.approvedSettingsRevision,2);assert.equal(body.approvedKeyRevision,undefined);assert.equal(body.id,original.id);assert.equal(body.itemId,original.activeItemId);assert.equal(body.revision,original.revision);assert.equal(body.baseVersionId,original.officialVersionId);assert.match(body.requestId,/^[a-f0-9]{32}$/);
  assert.deepEqual(context.project.versions.slice(0,original.versions.length),original.versions);assert.deepEqual(context.project.messages.slice(0,original.messages.length),original.messages);const firstReply=structuredClone(context.project.messages.at(-1));assert.equal(firstReply.provenance.memberId,first);
  const beforeSecond=structuredClone(context.project);settings=await source.request('state');await source.request('select_member',{memberId:first,expectedSettingsRevision:settings.settingsRevision});await app.reload();await fixtureFill(doc,'chat-input','請把第一項內容改為「固定供應者的第二輪」');await fixtureClick(doc,'送出想法 ↗');paid=calls.filter(call=>call.action==='discuss');body=paid[1].payload;
  assert.equal(body.approvedMemberId,first);assert.equal(body.approvedSettingsRevision,3);assert.equal(body.revision,beforeSecond.revision);assert.notEqual(body.requestId,paid[0].payload.requestId);assert.deepEqual(context.project.messages.find(message=>message.id===firstReply.id),firstReply);assert.deepEqual(context.project.versions.slice(0,beforeSecond.versions.length),beforeSecond.versions);assert.equal(context.project.officialVersionId,original.officialVersionId);assert.ok(!calls.some(call=>call.action==='select_member'));
 },{secondProvider:'openai',keyPresent:true});
});

test('known invalid model output remains rejected and permits deliberate retry on the same fixed model with drafts intact',async()=>{
 await withMemberFixture(async context=>{
  const {doc,root,calls,first}=context,original=structuredClone(context.project),text='這段修改要求需保留，讓我自行決定下一步';
  context.setDiscussionFailure({status:502,body:{error:{code:'MODEL_OUTPUT_INVALID',message:'AI 釐清回覆不得假裝修改作品，且每次只能問一個問題。本次未保存結果；模型端可能已產生費用。',operationOutcome:'rejected'}}});
  await fixtureFill(doc,'chat-input',text);await fixtureFill(doc,'editor-title','拒絕回覆時仍保留的草稿');await fixtureClick(doc,'送出想法 ↗');
  assert.match(root.querySelector('.error').textContent,/AI 釐清回覆不得假裝修改作品/);assert.match(root.querySelector('.error').textContent,/可能已產生費用/);assert.equal(root.querySelector('.uncertain'),null);assert.equal(doc.getElementById('discussion-member'),null);assert.equal(doc.getElementById('send-chat').disabled,false);assert.equal(doc.getElementById('chat-input').value,text);assert.equal(doc.getElementById('editor-title').value,'拒絕回覆時仍保留的草稿');assert.deepEqual(context.project,original);assert.equal(calls.filter(call=>call.action==='discuss').length,1);
  context.setDiscussionFailure(null);await fixtureFill(doc,'chat-input','請把第一項內容改為「自行調整要求後再送出」');await fixtureClick(doc,'送出想法 ↗');const requests=calls.filter(call=>call.action==='discuss');assert.equal(requests.length,2);assert.equal(requests[1].payload.approvedMemberId,first);assert.equal(requests[1].payload.approvedProvider,'ollama');assert.equal(requests[1].payload.approvedSettingsRevision,1);assert.notEqual(requests[1].payload.requestId,requests[0].payload.requestId);assert.deepEqual(context.project.versions.slice(0,original.versions.length),original.versions);
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
  await fixtureFill(doc,'chat-input','結果未知時保留原稿');await fixtureClick(doc,'送出想法 ↗');assert.ok(root.querySelector('.uncertain'));assert.match(root.textContent,/上次操作結果尚未確認/);assert.equal(doc.getElementById('discussion-member'),null);assert.equal(doc.getElementById('send-chat').disabled,true);assert.equal(fixtureButton(doc,'重試同一請求').disabled,true);assert.equal(doc.getElementById('chat-input').value,'結果未知時保留原稿');assert.equal(calls.filter(c=>c.action==='discuss').length,1);assert.deepEqual(context.project,original);
 });
});

test('checking an unknown result and receiving explicit rejection on the same request clears only the uncertainty',async()=>{
 await withMemberFixture(async context=>{
  const {doc,root,calls,first}=context,original=structuredClone(context.project);context.setDiscussionFailure({network:true});await fixtureFill(doc,'chat-input','檢查後仍需保留的原始要求');await fixtureClick(doc,'送出想法 ↗');const request=structuredClone(calls.find(c=>c.action==='discuss').payload);
  await fixtureClick(doc,'檢查最新狀態');assert.ok(root.querySelector('.uncertain'));assert.equal(fixtureButton(doc,'重試同一請求').disabled,false);assert.equal(calls.filter(c=>c.action==='discuss').length,1);
  context.setDiscussionFailure({status:502,body:{error:{code:'MODEL_OUTPUT_INVALID',message:'已確認這次回覆未保存。',operationOutcome:'rejected'}}});await fixtureClick(doc,'重試同一請求');
  assert.equal(calls.filter(c=>c.action==='discuss').length,2);assert.deepEqual(calls.filter(c=>c.action==='discuss')[1].payload,request);assert.equal(request.approvedMemberId,first);assert.equal(root.querySelector('.uncertain'),null);assert.match(root.querySelector('.error').textContent,/已確認這次回覆未保存/);assert.equal(doc.getElementById('discussion-member'),null);assert.equal(doc.getElementById('chat-input').value,'檢查後仍需保留的原始要求');assert.deepEqual(context.project,original);
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

test('official snapshot leads the current item workspace in the same desktop and mobile logical order',async()=>{
 await withLiveFixture(async({doc,root,project,calls})=>{
  const main=doc.getElementById('workspace'),overview=doc.getElementById('official-section'),layout=root.querySelector('.workspace-layout'),card=root.querySelector('.official-card'),official=project.versions.find(v=>v.id===project.officialVersionId);
  assert.equal(main.className,'item-workspace');assert.deepEqual(main.children,[overview,layout]);assert.equal(layout.children[0],root.querySelector('.dialogue-panel'));assert.equal(layout.children[1],root.querySelector('.work-column'));
  const shell=main.parentNode;assert.ok(shell.children.indexOf(root.querySelector('.creative-items-panel'))<shell.children.indexOf(main));assert.ok(shell.children.indexOf(root.querySelector('.active-item-header'))<shell.children.indexOf(main));
  assert.equal(overview.getAttribute('aria-labelledby'),'official-heading');assert.equal(doc.getElementById('official-heading').textContent,'正式版');assert.equal(card.parentNode,overview);assert.equal(root.querySelectorAll('.official-card').length,1);assert.equal(root.querySelectorAll('#version-'+official.id).length,1);assert.equal(layout.querySelector('.official-card'),null);
  assert.match(card.textContent,new RegExp(versionLabel(official)));assert.match(doc.getElementById('official-status').textContent,/討論中/);for(const field of official.items)assert.ok(card.textContent.includes(field.content));
  const content=doc.getElementById('official-content');assert.equal(content.getAttribute('tabindex'),'0');assert.equal(content.getAttribute('role'),'region');assert.equal(content.getAttribute('aria-label'),'目前正式版完整創作內容');
  assert.equal(!!doc.getElementById('official-details').open,false);assert.ok(card.querySelector('input'));assert.ok(card.querySelectorAll('button').some(b=>b.textContent==='請 AI 繼續修改'));assert.ok(card.querySelectorAll('button').some(b=>b.textContent==='手動編輯這一版'));
  assert.equal(doc.getElementById('discussion-member'),null);assert.match(layout.children[0].textContent,/專案固定/);assert.deepEqual(calls.map(c=>c.action),['state','project']);
 });
 const css=await readFile(new URL('../public/styles.css',import.meta.url),'utf8');assert.match(css,/\.official-content\{max-height:22rem;overflow:auto/);assert.match(css,/\.official-content:focus-visible\{outline:/);assert.match(css,/@media\(max-width:760px\)\{\.official-overview/);assert.match(css,/@media print\{\.official-content\{max-height:none;overflow:visible\}/);
 for(const block of css.matchAll(/\.(?:item-workspace|official-overview|official-content)[^{]*\{([^}]*)\}/g))assert.doesNotMatch(block[1],/position\s*:\s*(?:fixed|sticky)|\border\s*:/);
});

test('official reading state survives tree and checkbox rerenders, but a newly adopted version starts fresh',async()=>{
 await withMemberFixture(async context=>{
  const {doc,root,calls,second}=context,official=context.project.versions.find(v=>v.id===context.project.officialVersionId),candidate=context.project.versions.find(v=>v.id!==official.id),original=structuredClone(context.project.versions);
  doc.getElementById('official-content').scrollTop=120;doc.getElementById('official-details').open=true;await fixtureVersionSelect(doc,candidate.id);
  assert.equal(doc.getElementById('official-content').scrollTop,120);assert.equal(doc.getElementById('official-details').open,true);await fixtureVersionSelect(doc,official.id);assert.equal(doc.getElementById('official-content').scrollTop,120);assert.equal(doc.getElementById('official-details').open,true);
  await fixtureCardClick(doc,candidate.id,'設為正式版');await fixtureDialogClick(doc,'取消');assert.equal(doc.getElementById('official-content').scrollTop,120);assert.equal(doc.getElementById('official-details').open,true);assert.equal(context.project.officialVersionId,official.id);
  await fixtureCardClick(doc,candidate.id,'設為正式版');await fixtureDialogClick(doc,'設為正式版');assert.equal(context.project.officialVersionId,candidate.id);assert.equal(doc.getElementById('official-content').scrollTop,0);assert.equal(!!doc.getElementById('official-details').open,false);assert.equal(root.querySelectorAll('.official-card').length,1);assert.equal(root.querySelectorAll('#version-'+candidate.id).length,1);assert.deepEqual(context.project.versions,original);assert.ok(!calls.some(c=>['discuss','generate','compare'].includes(c.action)));
 });
});

test('top official area explicitly stays empty until a candidate is adopted',async()=>{
 await withLiveFixture(async context=>{
  const {doc,root,source,app}=context;let p=await call(source,'create_item',context.project,{type:'titles',title:'尚未採用的項目',description:'保留這份說明'});await app.reload();
  assert.equal(doc.getElementById('workspace').children[0],doc.getElementById('official-section'));assert.equal(root.querySelector('.official-card'),null);assert.match(doc.getElementById('official-section').textContent,/目前尚未指定正式版/);assert.match(doc.getElementById('official-status').textContent,/尚未指定/);
  for(const text of ['活動命名','一般觀眾','溫暖邀請'])p=await call(source,'discuss',p,{text,consent:true});p=await call(source,'summarize',p,{consent:true});p=await call(source,'approve_goal',p);p=await call(source,'generate',p,{consent:true});await app.reload();
  assert.equal(p.officialVersionId,null);assert.equal(root.querySelector('.official-card'),null);assert.match(doc.getElementById('official-section').textContent,/從下方候選選擇/);assert.equal(root.querySelectorAll('.tree-version').length,p.versions.length);assert.equal(root.querySelector('.candidate-grid'),null);assert.equal(context.project.activeItem.title,'尚未採用的項目');
 });
});

test('top official status distinguishes pending changes and finalized or archived work without changing snapshots',async()=>{
 await withLiveFixture(async context=>{
  const {doc,root,source,app}=context;let p=context.project;const original=structuredClone(p.versions.find(v=>v.id===p.officialVersionId));
  p=await call(source,'discuss',p,{text:'請把第一項內容改為「尚未採用的新名稱」',consent:true});await app.reload();assert.match(doc.getElementById('official-section').textContent,/有待審閱的修改，尚未取代目前正式版/);assert.equal(root.querySelector('.official-card').id,'version-'+original.id);assert.ok(root.querySelector('.official-card').textContent.includes(original.items[0].content));
  p=await call(source,'finalize',p);await app.reload();assert.equal(doc.getElementById('official-status').textContent,'已定稿');assert.equal(fixtureButton(doc,'請 AI 繼續修改').disabled,true);
  p=await call(source,'reopen',p);await app.reload();assert.match(doc.getElementById('official-status').textContent,/討論中/);p=await call(source,'archive_item',p);await app.reload();assert.equal(doc.getElementById('official-status').textContent,'已封存 · 唯讀');assert.deepEqual(context.project.versions.find(v=>v.id===original.id),original);assert.equal(root.querySelectorAll('.official-card').length,1);
 });
});

// Choice tests exercise the production renderer, event handlers and JSON fetch boundary.
async function withChoiceFixture(run,{refinement=false,decorateProject=null}={}){
 const originals={document:globalThis.document,addEventListener:globalThis.addEventListener,setTimeout:globalThis.setTimeout,fetch:globalThis.fetch,location:globalThis.location};
 const {doc,root}=fixtureDocument();globalThis.document=doc;globalThis.addEventListener=()=>{};globalThis.location={href:'http://localhost/ai-cocreation-series-php74/public/'};
 globalThis.setTimeout=(handler,delay,...args)=>{const timer=originals.setTimeout(handler,delay,...args);timer.unref?.();return timer;};
 const source=createDemoAdapter({seed:refinement}),calls=[];
 let p=refinement?(await source.request('project',{id:(await source.request('state')).projects[0].id})).project:await boundProject(source,{title:'選項回覆測試',description:'保存每一次選擇與文字草稿'});
 p=await call(source,'discuss',p,{text:refinement?'想修改，但還沒決定內容。':'我想替社區影展命名。',consent:true,officialVersionId:p.officialVersionId});
 let savedProject=p,beforeDiscuss=null;
 globalThis.fetch=async(url,options)=>{
  const action=new URL(url).searchParams.get('action');let payload={};
  if(options.method==='POST'){
   payload=JSON.parse(options.body);assert.equal(payload.action,action);assert.equal(options.headers['X-CSRF-Token'],'choice-csrf');
   if(action==='discuss'){assert.equal(payload.itemId,savedProject.activeItemId);assert.match(payload.requestId,/^[a-f0-9]{32}$/);}
  }else if(action==='project')payload={id:new URL(url).searchParams.get('id')};
  calls.push({action,payload});
  if(action==='discuss' && beforeDiscuss)await beforeDiscuss(payload);
  try{
   const forwarded={...payload};if(forwarded.approvedKeyRevision!==undefined)forwarded.approvedKeyRevision=(await source.request('state')).keyRevision;const data=await source.request(action,forwarded);
   if(data.project){savedProject=data.project;if(decorateProject)decorateProject(data.project);}
   return {ok:true,status:200,json:async()=>action==='state'||data.csrf?{...data,csrf:'choice-csrf',keyPresent:true,keyRevision:9}:data};
  }catch(error){return {ok:false,status:error.status || 400,json:async()=>({error:{message:error.message,operationOutcome:'rejected'}})};}
 };
 try{
  const app=await createTitleApp({root,adapter:createApiAdapter(),demo:false});
  await run({doc,root,source,app,calls,get project(){return savedProject;},beforeDiscuss(callback){beforeDiscuss=callback;}});
 }finally{Object.assign(globalThis,originals);}
}
function choiceButtons(doc,messageId=null){return (messageId?doc.getElementById(`message-${messageId}`):doc.body).querySelectorAll('.choice-answer');}

test('only bounded structured discussion questions expose choices, with strict persisted context',()=>{
 const message={id:'q',role:'assistant',kind:'discussion',question:'希望先看哪個方向？',choices:[{id:'a',label:'方向甲',value:'我想先看方向甲。'},{id:'b',label:'方向乙',value:'我想先看方向乙。'}],choiceContext:{itemId:'item',officialVersionId:null,sharedContextRevision:0,itemTitle:'名稱',itemDescription:'',baseVersionId:null,targetItemIds:[]}};
 const project={activeItemId:'item',activeItem:{title:'名稱',description:''},officialVersionId:null,sharedContextRevision:0,messages:[message]};
 assert.equal(discussionChoices(message).length,2);assert.equal(currentChoiceQuestion(project,message),true);
 for(const key of ['id','label','value']){const secret=structuredClone(message);secret.choices[0][key]='sk-'+'exampleONLYnotARealCredential';assert.equal(discussionChoices(secret).length,0,`secret-shaped ${key} is not rendered or submitted`);const nul=structuredClone(message);nul.choices[0][key]='invalid\0text';assert.equal(discussionChoices(nul).length,0,`NUL in ${key}`);}
 for(const change of [{role:'student'},{kind:'revision'},{kind:'generated'},{kind:undefined},{question:''},{question:'字'.repeat(201)},{choices:[]},{choices:[message.choices[0]]},{choices:Array(7).fill(message.choices[0])},{choices:[message.choices[0],message.choices[0]]},{choices:[message.choices[0],{...message.choices[1],value:message.choices[0].value}]},{choices:[message.choices[0],{...message.choices[1],label:'字'.repeat(41)}]},{choices:[message.choices[0],{...message.choices[1],value:'字'.repeat(334)}]},{choices:[message.choices[0],{...message.choices[1],id:'invalid id'}]}])assert.equal(discussionChoices({...message,...change}).length,0,JSON.stringify(change));
 for(const change of [{activeItemId:'other'},{officialVersionId:'new'},{sharedContextRevision:1},{sharedContextRevision:'0'},{activeItem:{title:'改名',description:''}},{activeItem:{title:'名稱',description:'改說明'}},{messages:[message,{id:'later',role:'system'}]}])assert.equal(currentChoiceQuestion({...project,...change},message),false,JSON.stringify(change));
 for(const missing of ['choiceContext','itemTitle','itemDescription']){const legacy=structuredClone(message);if(missing==='choiceContext')delete legacy.choiceContext;else delete legacy.choiceContext[missing];assert.equal(currentChoiceQuestion({...project,messages:[legacy]},legacy),false);}
});

test('choice click uses one bound fetch call, preserves exact typed draft throughout busy and retains linked normal history',async()=>{
 await withChoiceFixture(async context=>{
  const {doc,root,app,calls}=context,question=structuredClone(context.project.messages.at(-1));
  assert.equal(choiceButtons(doc).length,3);assert.ok(choiceButtons(doc).every(b=>!b.disabled));assert.deepEqual(calls.map(c=>c.action),['state','project']);
  assert.match(doc.getElementById(`choice-hint-${question.id}`).textContent,/目前成員「小光（固定腳本）」.*草稿會保留/);
  const first=choiceButtons(doc,question.id)[0],draftText='  我的想法還沒打完\n請保留所有空白。  ';
  assert.equal(first.querySelector('.choice-label').textContent,question.choices[0].label);assert.equal(first.querySelector('.choice-value').textContent,question.choices[0].value);
  await fixtureFill(doc,'chat-input',draftText);
  let release;context.beforeDiscuss(()=>new Promise(resolve=>{release=resolve;}));
  const operation=first.dispatchEvent('click');void first.dispatchEvent('click');await settle();
  assert.equal(calls.filter(c=>c.action==='discuss').length,1);assert.equal(doc.getElementById('chat-input').value,draftText);assert.ok(choiceButtons(doc).every(b=>b.disabled));assert.equal(doc.body.querySelector('dialog'),null);
  const request=calls.find(c=>c.action==='discuss').payload;
  assert.equal(request.text,question.choices[0].value);assert.deepEqual(request.choiceAnswer,{questionMessageId:question.id,choiceId:question.choices[0].id});assert.equal(request.revision,context.project.revision);assert.equal(request.officialVersionId,null);assert.equal(request.consent,true);assert.equal(request.approvedMemberId,'11111111111111111111111111111111');assert.equal(request.approvedProvider,'ollama');assert.equal(request.approvedSettingsRevision,0);
  release();await operation;await settle();
  assert.equal(doc.getElementById('chat-input').value,draftText);assert.equal(calls.filter(c=>c.action==='discuss').length,1);assert.ok(choiceButtons(doc,question.id).every(b=>b.disabled));assert.equal(choiceButtons(doc,context.project.messages.at(-1).id).length,2);
  const student=context.project.messages.at(-2);assert.equal(student.role,'student');assert.equal(student.text,question.choices[0].value);assert.deepEqual(student.choiceAnswer,{questionMessageId:question.id,choiceId:question.choices[0].id,label:question.choices[0].label,value:question.choices[0].value});
  assert.equal(doc.getElementById(`message-${student.id}`).querySelector('.choice-history-link').getAttribute('href'),`#message-${question.id}`);assert.ok(root.textContent.includes('固定腳本 · 非 AI'));
  await first.dispatchEvent('click');assert.equal(calls.filter(c=>c.action==='discuss').length,1,'detached stale button cannot submit');
  await app.reload();assert.equal(doc.getElementById('chat-input').value,draftText);assert.ok(choiceButtons(doc,question.id).every(b=>b.disabled));assert.equal(calls.filter(c=>c.action==='discuss').length,1,'reload does not auto-answer');
 });
});

test('the fixed project member, not a changed global default, handles a saved explicit choice',async()=>{
 await withChoiceFixture(async context=>{
  const {source,app,doc,calls}=context,question=structuredClone(context.project.messages.at(-1)),binding=structuredClone(context.project.aiBinding),settings=await source.request('state'),second={id:'22222222222222222222222222222222',nickname:'新的雲端成員',enabled:true,provider:'openai',model:'choice-model',ollamaUrl:'http://127.0.0.1:11434'};
  await source.request('save_members',{members:[...settings.members,second],activeMemberId:second.id,usageConsent:true,expectedSettingsRevision:settings.settingsRevision});await app.reload();await fixtureFill(doc,'chat-input','換全域預設後仍要保留這段草稿');
  assert.equal(doc.getElementById('discussion-member'),null);assert.deepEqual(context.project.aiBinding,binding);assert.match(doc.getElementById(`message-${question.id}`).querySelector('.model-provenance').textContent,/小光/);await choiceButtons(doc,question.id)[1].dispatchEvent('click');await settle();
  const request=calls.find(call=>call.action==='discuss').payload;assert.equal(request.approvedMemberId,binding.memberId);assert.equal(request.approvedProvider,'ollama');assert.equal(request.approvedModel,binding.model);assert.equal(request.approvedSettingsRevision,1);assert.equal(request.approvedKeyRevision,undefined);assert.equal(doc.getElementById('chat-input').value,'換全域預設後仍要保留這段草稿');assert.equal(context.project.messages.at(-1).provenance.memberId,binding.memberId);assert.equal(doc.body.querySelector('dialog'),null);
 });
});

test('refinement clarification choices produce a reviewable minor revision without replacing official or draft',async()=>{
 await withChoiceFixture(async context=>{
  const {doc,calls}=context,question=structuredClone(context.project.messages.at(-1)),official=structuredClone(context.project.versions.find(v=>v.id===context.project.officialVersionId)),before=context.project.versions.length;
  assert.equal(question.kind,'clarification');assert.equal(question.choiceContext.officialVersionId,official.id);assert.equal(choiceButtons(doc).length,2);assert.equal(calls.filter(c=>c.action==='discuss').length,0);
  await fixtureFill(doc,'chat-input','這段是我尚未送出的另一個修改方向。');await choiceButtons(doc,question.id)[0].dispatchEvent('click');await settle();
  assert.equal(calls.filter(c=>c.action==='discuss').length,1);assert.equal(calls.find(c=>c.action==='discuss').payload.officialVersionId,official.id);assert.equal(context.project.officialVersionId,official.id);assert.equal(context.project.versions.length,before+1);
  const next=context.project.versions.at(-1);assert.equal(next.source,'revision');assert.equal(next.basedOnVersionId,official.id);assert.equal(next.items[0].content,'一起，看見日常');assert.deepEqual(next.items.slice(1),official.items.slice(1));assert.deepEqual(context.project.versions.find(v=>v.id===official.id),official);assert.equal(next.provenance.provider,'scripted');assert.ok(doc.getElementById('revision-review'));assert.equal(doc.getElementById('chat-input').value,'這段是我尚未送出的另一個修改方向。');assert.ok(choiceButtons(doc,question.id).every(b=>b.disabled));assert.equal(doc.body.querySelector('dialog'),null);
 },{refinement:true});
});

test('legacy prose and empty choices invent no buttons; legacy structured choices without binding are nonactionable',async()=>{
 for(const variant of ['prose','empty','missing-question','missing-context','missing-title','missing-description']){
  await withChoiceFixture(async({doc,calls,project})=>{
   const buttons=choiceButtons(doc),expected=variant.startsWith('missing-') && variant!=='missing-question'?3:0;assert.equal(buttons.length,expected,variant);
   assert.ok(buttons.every(b=>b.disabled));for(const button of buttons)await button.dispatchEvent('click');assert.equal(calls.filter(c=>c.action==='discuss').length,0);assert.ok(doc.getElementById(`message-${project.messages.at(-1).id}`).textContent.length);
  },{decorateProject:project=>{const q=project.messages.at(-1);if(variant==='prose'){delete q.choices;delete q.question;q.text='請選擇：A. 社區居民 B. 影像創作者';}else if(variant==='empty')q.choices=[];else if(variant==='missing-question')delete q.question;else if(variant==='missing-context')delete q.choiceContext;else if(variant==='missing-title')delete q.choiceContext.itemTitle;else delete q.choiceContext.itemDescription;}});
 }
});

test('historical choice labels, questions and different answer values render as text, never HTML',async()=>{
 const label='<img src=x onerror=alert(1)>',value='<script>alert("answer")</script>',question='<svg onload=alert(2)> 請選擇';
 await withChoiceFixture(async({doc,root,calls})=>{
  const buttons=choiceButtons(doc);assert.equal(buttons[0].querySelector('.choice-label').textContent,label);assert.equal(buttons[0].querySelector('.choice-value').textContent,value);assert.equal(buttons[1].querySelector('.choice-value'),null,'identical label and value are not duplicated');assert.equal(root.querySelector('.choice-question').textContent,question);assert.equal(root.querySelector('img'),null);assert.equal(root.querySelector('script'),null);assert.equal(root.querySelector('svg'),null);assert.equal(calls.filter(c=>c.action==='discuss').length,0);
 },{decorateProject:project=>{const q=project.messages.at(-1);q.question=question;q.choices=[{id:'xss-label',label,value},{id:'same',label:'完整相同文字',value:'完整相同文字'}];}});
});

test('only the actual last question in matching active context can submit, including readonly and setup guards',async()=>{
 for(const variant of ['later-system','later-user','other-item','new-official','shared-edit','item-title-edit','item-description-edit','finalized','project-finalized','archived']){
  await withChoiceFixture(async({doc,calls})=>{const buttons=choiceButtons(doc);assert.equal(buttons.length,3,variant);assert.ok(buttons.every(b=>b.disabled),variant);for(const button of buttons)await button.dispatchEvent('click');assert.equal(calls.filter(c=>c.action==='discuss').length,0,variant);},
   {decorateProject:project=>{const q=project.messages.at(-1);if(variant==='later-system'||variant==='later-user')project.messages.push({id:'later',role:variant==='later-system'?'system':'student',kind:'discussion',text:'已有後續紀錄',at:q.at});else if(variant==='other-item')q.choiceContext.itemId='another-item';else if(variant==='new-official')q.choiceContext.officialVersionId='old-official';else if(variant==='shared-edit')project.sharedContextRevision++;else if(variant==='item-title-edit')project.activeItem.title+='改名';else if(variant==='item-description-edit')project.activeItem.description+='改說明';else if(variant==='finalized')project.lifecycle='finalized';else if(variant==='project-finalized')project.projectLifecycle='finalized';else project.activeItem.archived=true;}});
 }
 await withChoiceFixture(async({doc,source,app,calls})=>{const settings=await source.request('state');await source.request('save_members',{members:settings.members.map(member=>({...member,enabled:false})),activeMemberId:null,usageConsent:true,expectedSettingsRevision:settings.settingsRevision});await app.reload();assert.ok(choiceButtons(doc).every(b=>b.disabled));assert.match(doc.body.querySelector('.choice-hint').textContent,/停用|變更/);await choiceButtons(doc)[0].dispatchEvent('click');assert.equal(calls.filter(c=>c.action==='discuss').length,0);});
});

test('uncertain choice outcome locks repeat clicks and keeps typed draft without auto-retry',async()=>{
 await withChoiceFixture(async context=>{
  const {doc,calls}=context;await fixtureFill(doc,'chat-input','網路中斷也要保留草稿');context.beforeDiscuss(()=>{throw new Error('simulated network loss');});
  const original=choiceButtons(doc)[0];await original.dispatchEvent('click');await settle();assert.equal(calls.filter(c=>c.action==='discuss').length,1);assert.equal(doc.getElementById('chat-input').value,'網路中斷也要保留草稿');assert.ok(choiceButtons(doc).every(b=>b.disabled));assert.match(doc.body.querySelector('.choice-hint').textContent,/先檢查上次操作/);
  await original.dispatchEvent('click');await choiceButtons(doc)[1].dispatchEvent('click');assert.equal(calls.filter(c=>c.action==='discuss').length,1);assert.equal(doc.body.querySelector('dialog'),null);
 });
});

test('stale revision rejection refreshes latest discussion, keeps draft and never resends old choice',async()=>{
 await withChoiceFixture(async context=>{
  const {source,doc,calls}=context,oldQuestion=structuredClone(context.project.messages.at(-1));await fixtureFill(doc,'chat-input','發生衝突時仍保留這段');
  await call(source,'discuss',context.project,{text:'另一個分頁已經回答了。',consent:true,officialVersionId:null});
  await choiceButtons(doc,oldQuestion.id)[0].dispatchEvent('click');await settle();assert.equal(calls.filter(c=>c.action==='discuss').length,1);assert.equal(doc.getElementById('chat-input').value,'發生衝突時仍保留這段');assert.ok(choiceButtons(doc,oldQuestion.id).every(b=>b.disabled));assert.equal(context.project.messages.some(m=>m.choiceAnswer?.questionMessageId===oldQuestion.id),false);assert.match(doc.body.textContent,/已載入伺服器最新版本/);
 });
});

test('demo refuses tampered and stale choice references without changing history, while typed answers still work',async()=>{
 const api=createDemoAdapter({seed:false});let p=await boundProject(api,{title:'驗證選項',description:''});p=await call(api,'discuss',p,{text:'開始',consent:true});const q=structuredClone(p.messages.at(-1)),saved=structuredClone(p);
 for(const choiceAnswer of [null,[],q.id,{questionMessageId:q.id},{choiceId:q.choices[0].id},{questionMessageId:q.id,choiceId:4},{questionMessageId:q.id,choiceId:q.choices[0].id,extra:'not allowed'}]){
  await assert.rejects(call(api,'discuss',p,{consent:true,officialVersionId:null,text:q.choices[0].value,choiceAnswer}),error=>error.status===400);assert.deepEqual((await api.request('project',{id:p.id})).project,saved);
 }
 for(const extra of [{choiceAnswer:{questionMessageId:q.id,choiceId:'missing'},text:q.choices[0].value},{choiceAnswer:{questionMessageId:'missing',choiceId:q.choices[0].id},text:q.choices[0].value},{choiceAnswer:{questionMessageId:q.id,choiceId:q.choices[0].id},text:'偷偷換掉送出文字'},{choiceAnswer:{questionMessageId:q.id,choiceId:q.choices[0].id},text:q.choices[0].value,officialVersionId:'stale'}]){
  await assert.rejects(call(api,'discuss',p,{consent:true,officialVersionId:null,...extra}));assert.deepEqual((await api.request('project',{id:p.id})).project,saved);
 }
 p=await call(api,'discuss',p,{consent:true,officialVersionId:null,text:q.choices[0].value,choiceAnswer:{questionMessageId:q.id,choiceId:q.choices[0].id}});assert.equal(p.messages.at(-2).choiceAnswer.value,q.choices[0].value);
 await assert.rejects(call(api,'discuss',p,{consent:true,officialVersionId:null,text:q.choices[0].value,choiceAnswer:{questionMessageId:q.id,choiceId:q.choices[0].id}}));
 p=await call(api,'discuss',p,{consent:true,text:'我想自己輸入不同的答案。'});assert.equal(p.messages.at(-2).text,'我想自己輸入不同的答案。');assert.equal(p.messages.at(-2).choiceAnswer,undefined);assert.equal(p.versions.length,0);
});

// Phase-one workflow regressions. These are scripted data + DOM/mock-fetch tests,
// not real browser, PHP HTTP integration, provider responses, or paid AI calls.
async function generatedItem(api,project,type){
 let p=await call(api,'create_item',project,{type,title:`${type} 測試`,description:'社區影展，為居民與創作者介紹日常故事。'});
 p=await call(api,'discuss',p,{text:'清楚溫暖的活動介紹。',consent:true});assert.equal(canConfirmGenerate(p),true);
 return call(api,'confirm_generate',p,{consent:true});
}

test('module registry preserves all twelve ordered choices and honestly enables three text modules and five structured artifacts',async()=>{
 const registry=[['titles','標題名稱'],['short_text','短文'],['article','長篇文章'],['illustrated','圖文'],['table','表格'],['chart','圖表'],['mindmap','心智圖'],['vector','向量圖形'],['image','圖片創作'],['poster','海報設計'],['webpage','網頁'],['interactive','互動視覺程式']];
 assert.deepEqual(MODULES.map(({id,label})=>[id,label]),registry);assert.deepEqual(MODULES.filter(module=>module.enabled).map(module=>module.id),['titles','short_text','article','table','chart','mindmap','vector','webpage']);
 const api=createDemoAdapter({seed:false});let p=await boundProject(api);
 for(const [type] of registry){p=await call(api,'create_item',p,{type,title:`規劃 ${type}`});assert.equal(contentType(p),type);assert.equal(canCreate(p),['titles','short_text','article','table','chart','mindmap','vector','webpage'].includes(type));if(!canCreate(p)){const saved=structuredClone(p);for(const action of ['discuss','confirm_generate','fuse','snapshot'])await assert.rejects(call(api,action,p,{text:'不要假裝已實作',consent:true,items:[item()]}));assert.deepEqual((await api.request('project',{id:p.id})).project,saved);}}
});

test('module content validation distinguishes full short text and bounded stable paragraphs without truncation',()=>{
 assert.equal(validItems([item('body','全文','中'.repeat(4000))],'short_text'),true);assert.equal(validItems([item('body','全文','中'.repeat(4001))],'short_text'),false);
 for(const fields of [[item()],[item('body','短文','完整內容')],[item('body','全文','內容'),item('extra','其他','內容')]])assert.equal(validItems(fields,'short_text'),false);
 const paragraphs=Array.from({length:80},(_,index)=>item(`paragraph-${index+1}`,`第 ${index+1} 段`,'中'.repeat(500)));
 assert.equal(validItems(paragraphs,'article'),true);assert.equal(validItems([...paragraphs,item('extra','額外','內容')],'article'),false);assert.equal(validItems(paragraphs.map((field,index)=>({...field,content:field.content+(index===0?'中':'')})),'article'),false);
 assert.equal(validItems([item('p1','第一段','中'.repeat(2000))],'article'),true);assert.equal(validItems([item('p1','第一段','中'.repeat(2001))],'article'),false);assert.equal(validItems([item()],'image'),false);
});

test('project model helpers require the frozen enabled member, exact provider/model/endpoint, and no global fallback',()=>{
 const a={id:'a',nickname:'已改名',enabled:true,provider:'ollama',model:'model-a',ollamaUrl:'http://127.0.0.1:11434'},b={id:'b',nickname:'第二位',enabled:true,provider:'openai',model:'model-b'};
 const state={members:[a,b],activeMemberId:'b',usageConsent:true,keyPresent:true},project={aiBinding:{memberId:'a',memberNickname:'建立時的名字',provider:a.provider,model:a.model,ollamaUrl:a.ollamaUrl}};
 assert.equal(projectMember(state,project).id,'a');assert.equal(projectMember(state,project).nickname,'建立時的名字');assert.equal(aiSetupReason(state,false,project),'');assert.equal(projectMember(state,{aiBinding:null}),null);assert.match(aiSetupReason(state,false,{aiBinding:null}),/一次選定/);
 for(const override of [{enabled:false},{model:'changed'},{provider:'openai'},{ollamaUrl:'http://localhost:11434'}]){const changed={...state,members:[{...a,...override},b]};assert.equal(projectMember(changed,project),null);assert.match(aiSetupReason(changed,false,project),/不會自動改用/);}
 assert.equal(projectMember({...state,members:[b]},project),null);assert.deepEqual(project.aiBinding,{memberId:'a',memberNickname:'建立時的名字',provider:a.provider,model:a.model,ollamaUrl:a.ollamaUrl});
});

test('unbound legacy projects require one explicit binding; no creation fallback, rebind, or silent model drift',async()=>{
 const api=createDemoAdapter({seed:false}),settings=await api.request('state');let p=(await api.request('new',{title:'尚未選模型'})).project;
 assert.equal(p.aiBinding,null);const saved=structuredClone(p);await assert.rejects(call(api,'discuss',p,{text:'不可自動採用預設',consent:true}),error=>error.data?.error?.code==='PROJECT_MODEL_REQUIRED');assert.deepEqual((await api.request('project',{id:p.id})).project,saved);
 await assert.rejects(call(api,'bind_project_model',p,{memberId:settings.activeMemberId,expectedSettingsRevision:99}),error=>error.data?.error?.code==='STALE_SETTINGS');
 p=await call(api,'bind_project_model',p,{memberId:settings.activeMemberId,expectedSettingsRevision:settings.settingsRevision});const binding=structuredClone(p.aiBinding);assert.equal(binding.memberId,settings.activeMemberId);assert.deepEqual(p.messages,saved.messages);assert.deepEqual(p.versions,saved.versions);
 await assert.rejects(call(api,'bind_project_model',p,{memberId:settings.activeMemberId,expectedSettingsRevision:settings.settingsRevision}),error=>error.data?.error?.code==='PROJECT_MODEL_ALREADY_BOUND');
 let current=await api.request('state');await api.request('save_members',{members:current.members.map(member=>({...member,model:'changed-model'})),activeMemberId:current.activeMemberId,usageConsent:true,expectedSettingsRevision:current.settingsRevision});
 await assert.rejects(call(api,'discuss',p,{text:'不能改用新模型',consent:true}),error=>error.data?.error?.code==='PROJECT_MODEL_CHANGED');assert.deepEqual((await api.request('project',{id:p.id})).project.aiBinding,binding);
 current=await api.request('state');await api.request('save_members',{members:current.members.map(member=>({...member,model:binding.model,enabled:false})),activeMemberId:null,usageConsent:true,expectedSettingsRevision:current.settingsRevision});await assert.rejects(call(api,'discuss',p,{text:'不能改用別人',consent:true}),error=>error.data?.error?.code==='MEMBER_DISABLED');
});

test('scripted readiness is content-based, permits early summarizing, and never generates until current confirmation',async()=>{
 const api=createDemoAdapter({seed:false});let p=await boundProject(api,{description:''});
 for(const text of ['還沒想好','再想一下','繼續思考','還不確定']){p=await call(api,'discuss',p,{text,consent:true});assert.equal(p.messages.at(-1).directionStatus,'exploring');assert.equal(p.brief,null);assert.equal(p.versions.length,0);assert.equal(canConfirmGenerate(p),false);}
 assert.equal(canSummarize(p),true);const before=structuredClone(p);await assert.rejects(call(api,'confirm_generate',p,{consent:true}));assert.deepEqual((await api.request('project',{id:p.id})).project,before);
 p=await call(api,'discuss',p,{text:'社區影展海報，邀請居民與創作者看見日常故事。',consent:true});assert.equal(p.messages.at(-1).directionStatus,'ready');assert.equal(p.messages.at(-1).question,'');assert.deepEqual(p.messages.at(-1).choices,[]);assert.equal(p.summaryRevision,p.revision);assert.equal(canConfirmGenerate(p),true);assert.equal(p.goalApprovedAt,null);assert.equal(p.versions.length,0);
 const old=structuredClone(p);p=await call(api,'discuss',p,{text:'另外希望更溫暖。',consent:true});assert.equal(p.versions.length,0);assert.equal(p.goalApprovedAt,null);assert.ok(p.summaryRevision>old.summaryRevision);await assert.rejects(call(api,'confirm_generate',old,{consent:true}));
 const request={id:p.id,itemId:p.activeItemId,revision:p.revision,consent:true,requestId:'cccccccccccccccccccccccccccccccc'};p=(await api.request('confirm_generate',request)).project;assert.equal(p.versions.length,3);assert.equal(p.officialVersionId,null);assert.ok(p.goalApprovedAt);assert.equal(canConfirmGenerate(p),false);assert.deepEqual((await api.request('confirm_generate',request)).project,p);assert.equal(p.messages.filter(message=>message.kind==='generation').length,1);
});

test('confirm-generate gate accepts intact earlier direction but rejects future, missing, string markers and readonly state',()=>{
 const p={lifecycle:'in_progress',phase:'summary',revision:7,summaryRevision:7,brief:{summary:'完整方向'},messages:[]};assert.equal(canConfirmGenerate(p),true);assert.equal(canConfirmGenerate({...p,summaryRevision:6}),true);
 for(const override of [{summaryRevision:8},{summaryRevision:'7'},{summaryRevision:null},{brief:null},{phase:'discussion'},{goalApprovedAt:'past',phase:'work'},{lifecycle:'finalized'},{projectLifecycle:'finalized'},{activeItem:{archived:true}}])assert.equal(canConfirmGenerate({...p,...override}),false,JSON.stringify(override));
});

test('renderer provides one deliberate current-direction generation and allows more discussion before it',async()=>{
 await withLiveFixture(async context=>{
  const {source,app,doc,root,calls}=context;await call(source,'create_item',context.project,{type:'titles',title:'先討論再生成',description:''});await app.reload();const before=calls.length;
  assert.equal(doc.getElementById('confirm-generate').disabled,true);await fixtureFill(doc,'chat-input','社區影展海報，邀請居民與創作者看見日常故事。');await fixtureClick(doc,'送出想法 ↗');
  assert.equal(context.project.phase,'summary');assert.equal(context.project.versions.length,0);assert.equal(doc.getElementById('confirm-generate').disabled,false);assert.equal(root.querySelector('.goal-panel').querySelectorAll('.goal-summary').length,1);assert.equal(root.querySelector('.goal-panel').querySelector('.brief-grid'),null);assert.ok(!calls.slice(before).some(call=>['confirm_generate','generate','approve_goal'].includes(call.action)));
  await fixtureFill(doc,'chat-input','希望語氣再更親近。');await fixtureClick(doc,'送出想法 ↗');assert.equal(context.project.versions.length,0);const currentRevision=context.project.revision;
  await fixtureClick(doc,'確認方向並生成候選 ↗');assert.equal(context.project.versions.length,3);assert.equal(context.project.officialVersionId,null);const generated=calls.slice(before).filter(call=>['confirm_generate','generate','approve_goal'].includes(call.action));assert.equal(generated.length,1);assert.equal(generated[0].action,'confirm_generate');assert.equal(generated[0].payload.revision,currentRevision);assert.equal(generated[0].payload.approvedMemberId,context.project.aiBinding.memberId);assert.equal(doc.body.querySelector('dialog'),null);
 });
});

test('candidate refinement creates exact-source minor versions before adoption and rejects archived or foreign sources',async()=>{
 const api=createDemoAdapter({seed:false});let p=await readyProject(api);p=await call(api,'generate',p,{consent:true});const source=structuredClone(p.versions[1]),history=structuredClone(p.versions);assert.equal(p.officialVersionId,null);
 p=await call(api,'edit_project',p,{title:p.title,description:'重新討論背景，但仍可微調明確選取的候選。'});assert.equal(p.goalApprovedAt,null);assert.equal(canSnapshot(p),false);assert.equal(canSnapshot(p,source.id),true);
 p=await call(api,'discuss',p,{baseVersionId:source.id,text:'請把第一項內容改為「候選直接微調」',consent:true});const revision=structuredClone(p.versions.at(-1));assert.equal(revision.basedOnVersionId,source.id);assert.equal(revision.major,source.major);assert.equal(revision.minor,1);assert.equal(p.officialVersionId,null);assert.deepEqual(p.versions.slice(0,-1),history);assert.deepEqual(revision.items.slice(1),source.items.slice(1));
 p=await call(api,'discuss',p,{baseVersionId:revision.id,text:'請把第一項內容改為「候選繼續第二輪」',consent:true});assert.equal(p.versions.at(-1).basedOnVersionId,revision.id);assert.equal(p.versions.at(-1).minor,2);assert.equal(p.officialVersionId,null);assert.deepEqual(p.versions.find(version=>version.id===revision.id),revision);
 p=await call(api,'archive_version',p,{versionId:source.id});const saved=structuredClone(p);await assert.rejects(call(api,'discuss',p,{baseVersionId:source.id,text:'請把第一項內容改為「不可修改已封存來源」',consent:true}));assert.deepEqual((await api.request('project',{id:p.id})).project,saved);
 p=await call(api,'create_item',p,{type:'titles',title:'其他項目'});await assert.rejects(call(api,'discuss',p,{baseVersionId:revision.id,text:'請把第一項內容改為「不可跨項目來源」',consent:true}));
});

test('renderer uses the same explicit candidate source for AI and manual work without adopting it',async()=>{
 await withLiveFixture(async context=>{
  const {doc,source,app,calls}=context;let p=await call(source,'create_item',context.project,{type:'titles',title:'候選來源'});p=await call(source,'discuss',p,{text:'社區影展海報，邀請居民與創作者看見日常故事。',consent:true});p=await call(source,'confirm_generate',p,{consent:true});await app.reload();const base=structuredClone(p.versions[1]);
  await fixtureCardClick(doc,base.id,'以此版繼續微調');assert.equal(doc.getElementById('editor-source').value,base.id);assert.equal(doc.getElementById('editor-title').value,base.items[0].content);await fixtureFill(doc,'chat-input','請把第一項內容改為「從候選直接延伸」');await fixtureClick(doc,'送出想法 ↗');const request=calls.filter(call=>call.action==='discuss').at(-1).payload,revision=context.project.versions.at(-1);
  assert.equal(request.baseVersionId,base.id);assert.equal(request.officialVersionId,null);assert.equal(revision.basedOnVersionId,base.id);assert.equal(context.project.officialVersionId,null);assert.deepEqual(context.project.versions.find(version=>version.id===base.id),base);assert.ok(doc.getElementById('revision-review'));assert.equal(doc.getElementById('editor-source').value,base.id);assert.equal(doc.getElementById('save-minor').disabled,false);
 });
});

test('article refinement requires an explicit valid range and merges only selected paragraphs into a complete immutable snapshot',async()=>{
 const api=createDemoAdapter({seed:false});let p=await generatedItem(api,await boundProject(api),'article');const base=structuredClone(p.versions[0]);assert.equal(p.versions.length,1);assert.equal(base.items.length,3);assert.equal(validItems(base.items,'article'),true);
 for(const targets of [undefined,[],['missing'],[base.items[0].id,base.items[0].id]]){const saved=structuredClone(p);assert.match(refinementRangeError(p,base.id,targets),/勾選/);await assert.rejects(call(api,'discuss',p,{baseVersionId:base.id,targetItemIds:targets,text:'請把選取段落改為「只改指定段落」',consent:true}));assert.deepEqual((await api.request('project',{id:p.id})).project,saved);}
 const targets=[base.items[1].id];assert.equal(refinementRangeError(p,base.id,targets),'');p=await call(api,'discuss',p,{baseVersionId:base.id,targetItemIds:targets,text:'請把選取段落改為「只改指定段落」',consent:true});const changed=p.versions.at(-1);assert.equal(changed.items.length,base.items.length);assert.deepEqual(changed.items[0],base.items[0]);assert.deepEqual(changed.items[2],base.items[2]);assert.deepEqual(changed.items[1],{...base.items[1],content:'只改指定段落'});assert.deepEqual(changed.targetItemIds,targets);assert.equal(changed.basedOnVersionId,base.id);assert.deepEqual(p.versions[0],base);assert.equal(p.officialVersionId,null);
 const invalid=base.items.map((field,index)=>index===1?{...field,id:base.items[0].id}:field);await assert.rejects(call(api,'snapshot',p,{items:invalid,basedOnVersionId:base.id,goalAndRationale:'完整文章不能有重複段落識別碼。'}));
 const manual=[{...changed.items[0],label:'手動修改的段落名稱'},changed.items[2],item('new-paragraph','手動新增段落','手動可以明確調整文章結構。')];p=await call(api,'snapshot',p,{items:manual,basedOnVersionId:changed.id,goalAndRationale:'手動移除一段、新增一段並重新命名。'});assert.deepEqual(p.versions.at(-1).items,manual);assert.deepEqual(p.versions.find(version=>version.id===changed.id),changed);assert.deepEqual(p.versions[0],base);
});

test('article renderer starts with no selected range, preserves choice scope, and sends selected stable IDs only',async()=>{
 await withLiveFixture(async context=>{
  const {doc,root,source,app,calls}=context;const p=await generatedItem(source,context.project,'article'),base=structuredClone(p.versions[0]);await app.reload();await fixtureCardClick(doc,base.id,'以此版繼續微調');
  assert.equal(root.querySelectorAll('.refinement-range').length,1);for(const field of base.items)assert.equal(doc.getElementById(`refine-target-${field.id}`).checked,false);await fixtureFill(doc,'chat-input','請把選取段落改為「指定的段落新內容」');assert.equal(doc.getElementById('send-chat').disabled,true);const before=calls.filter(call=>call.action==='discuss').length;void doc.getElementById('send-chat').dispatchEvent('click');await settle();assert.equal(calls.filter(call=>call.action==='discuss').length,before);
  await fixtureCheck(doc,`refine-target-${base.items[1].id}`,true);assert.equal(doc.getElementById('send-chat').disabled,false);assert.equal(doc.getElementById('chat-input').value,'請把選取段落改為「指定的段落新內容」');await fixtureClick(doc,'送出想法 ↗');const request=calls.filter(call=>call.action==='discuss').at(-1).payload,revision=context.project.versions.at(-1);
  assert.equal(request.baseVersionId,base.id);assert.deepEqual(request.targetItemIds,[base.items[1].id]);assert.deepEqual(revision.items[0],base.items[0]);assert.deepEqual(revision.items[2],base.items[2]);assert.equal(revision.items[1].content,'指定的段落新內容');assert.equal(doc.getElementById('editor-source').value,base.id);assert.equal(context.project.officialVersionId,null);
  await fixtureFill(doc,'chat-input','想修改，但還沒決定。');await fixtureClick(doc,'送出想法 ↗');const question=context.project.messages.at(-1);assert.ok(choiceButtons(doc,question.id).every(button=>!button.disabled));await fixtureCheck(doc,`refine-target-${base.items[0].id}`,true);assert.ok(choiceButtons(doc,question.id).every(button=>button.disabled));assert.equal(currentChoiceQuestion(context.project,question,{baseVersionId:base.id,targetItemIds:[base.items[1].id]}),true);assert.equal(currentChoiceQuestion(context.project,question,{baseVersionId:revision.id,targetItemIds:[base.items[1].id]}),false);
  await fixtureSelect(doc,'editor-source',revision.id);assert.ok(choiceButtons(doc,question.id).every(button=>button.disabled));for(const field of revision.items)assert.equal(doc.getElementById(`item-label-${field.id}`).disabled,false);assert.equal(fixtureButton(doc,'＋ 新增段落').disabled,false);
  await fixtureFill(doc,`item-label-${revision.items[1].id}`,'手動重新命名');await fixtureFill(doc,`item-content-${revision.items[1].id}`,'手動編輯也保存完整的穩定段落。');await fixtureClick(doc,'＋ 新增段落');const addedRow=root.querySelectorAll('.editor-item').at(-1),addedId=addedRow.querySelector('input').id.slice('item-label-'.length);await fixtureFill(doc,`item-content-${addedId}`,'這是明確手動新增的段落。');await fixtureClick(doc,doc.getElementById('save-minor').textContent);const manual=context.project.versions.at(-1);assert.equal(manual.source,'snapshot');assert.equal(manual.basedOnVersionId,revision.id);assert.deepEqual(manual.items.slice(0,3).map(({id})=>id),revision.items.map(({id})=>id));assert.deepEqual(manual.items[0],revision.items[0]);assert.deepEqual(manual.items[2],revision.items[2]);assert.equal(manual.items[1].content,'手動編輯也保存完整的穩定段落。');assert.equal(manual.items[1].label,'手動重新命名');assert.equal(manual.items[3].id,addedId);assert.equal(manual.items[3].content,'這是明確手動新增的段落。');assert.deepEqual(context.project.versions.find(version=>version.id===revision.id),revision);
 });
});

test('short text remains exactly one full-body field for generation, revision, and manual snapshots',async()=>{
 const api=createDemoAdapter({seed:false});let p=await generatedItem(api,await boundProject(api),'short_text');assert.equal(p.versions.length,3);p.versions.forEach(version=>assert.equal(validItems(version.items,'short_text'),true));const base=structuredClone(p.versions[0]);
 p=await call(api,'discuss',p,{baseVersionId:base.id,text:'請把全文改為「一篇完整而清楚的短文。」',consent:true});const revision=p.versions.at(-1);assert.deepEqual(revision.items,[item('body','全文','一篇完整而清楚的短文。')]);assert.equal(revision.basedOnVersionId,base.id);assert.deepEqual(p.versions[0],base);assert.equal(p.officialVersionId,null);
 for(const items of [[item('wrong','全文','內容')],[item('body','全文','中'.repeat(4001))],[...revision.items,item('extra','第二欄','不能新增')]])await assert.rejects(call(api,'snapshot',p,{basedOnVersionId:revision.id,items,goalAndRationale:'短文完整快照。'}));
});

test('fusion creates one independent major candidate with immutable source snapshots and never compares or adopts automatically',async()=>{
 const api=createDemoAdapter();let p=(await api.request('project',{id:(await api.request('state')).projects[0].id})).project;const original=structuredClone(p),ids=[p.officialVersionId,p.versions[0].id],request={id:p.id,itemId:p.activeItemId,revision:p.revision,versionIds:ids,question:'保留清楚的名稱與溫暖的短句。',consent:true,requestId:'ffffffffffffffffffffffffffffffff'};
 const result=await api.request('fuse',request);p=result.project;const fusion=p.versions.at(-1);assert.equal(result.fusionVersionId,fusion.id);assert.equal(fusion.source,'fusion');assert.equal(fusion.major,5);assert.equal(fusion.minor,0);assert.equal(fusion.basedOnVersionId,null);assert.deepEqual(fusion.fusionSourceVersionIds,ids);assert.deepEqual(fusion.fusionSourceSnapshots,ids.map(id=>original.versions.find(version=>version.id===id)));assert.equal(p.versions.length,original.versions.length+1);assert.deepEqual(p.versions.slice(0,-1),original.versions);assert.deepEqual(p.comparisons,original.comparisons);assert.equal(p.officialVersionId,original.officialVersionId);assert.deepEqual((await api.request('fuse',request)).project,p);assert.match(versionSourceLabel(fusion),/融合/);
 const saved=structuredClone(p);for(const versionIds of [[],[ids[0]],[ids[0],ids[0]],[ids[0],'missing'],Array(6).fill(ids[0])])await assert.rejects(call(api,'fuse',p,{versionIds,consent:true}));assert.deepEqual((await api.request('project',{id:p.id})).project,saved);
 p=await call(api,'archive_version',p,{versionId:ids[1]});await assert.rejects(call(api,'fuse',p,{versionIds:ids,consent:true}));assert.deepEqual(p.versions.find(version=>version.id===fusion.id),fusion);
});

test('compare and fusion controls have independent drafts, errors, deliberate requests, and visible source lineage',async()=>{
 await withLiveFixture(async context=>{
  const {doc,root,calls}=context,original=structuredClone(context.project),ids=[original.officialVersionId,original.versions[0].id];assert.equal(doc.getElementById('fuse-versions').disabled,true);
  for(const id of ids)await fixtureVersionSelect(doc,id);await fixtureFill(doc,'compare-question','比較但不融合');await fixtureFill(doc,'fuse-question','中'.repeat(667));assert.equal(doc.getElementById('fuse-versions').disabled,true);assert.equal(doc.getElementById('compare-versions').disabled,false);assert.match(doc.getElementById('fusion-status').textContent,/2,000/);
  await fixtureFill(doc,'fuse-question','保留第一版名稱與另一版的短句');await fixtureClick(doc,'請 AI 提供比較意見 ↗');assert.equal(context.project.versions.length,original.versions.length);assert.equal(calls.filter(call=>call.action==='fuse').length,0);const comparisons=structuredClone(context.project.comparisons);
  await fixtureClick(doc,'融合所選版本為新候選 ↗');const fusion=context.project.versions.at(-1),request=calls.filter(call=>call.action==='fuse').at(-1).payload;assert.equal(fusion.source,'fusion');assert.deepEqual(request.versionIds,ids);assert.equal(request.question,'保留第一版名稱與另一版的短句');assert.equal(request.approvedMemberId,context.project.aiBinding.memberId);assert.equal(context.project.officialVersionId,original.officialVersionId);assert.deepEqual(context.project.comparisons,comparisons);assert.equal(calls.filter(call=>call.action==='compare').length,1);assert.equal(calls.filter(call=>call.action==='fuse').length,1);assert.equal(doc.getElementById('compare-question').value,'比較但不融合');assert.match(doc.getElementById(`version-${fusion.id}`).querySelector('.version-lineage').textContent,/融合來源：V4、V1/);assert.equal(root.querySelectorAll('.editor-panel').length,1);
 });
});

test('collapsible version tree groups actual minor lineage and preserves folds without duplicate DOM IDs or bottom history',async()=>{
 await withLiveFixture(async context=>{
  const {doc,root,source,app}=context;let p=context.project;const base=p.versions[0];p=await call(source,'discuss',p,{baseVersionId:base.id,text:'請把第一項內容改為「候選的一次修改」',consent:true});const first=p.versions.at(-1);p=await call(source,'discuss',p,{baseVersionId:first.id,text:'請把第一項內容改為「從小修改再出發」',consent:true});const second=p.versions.at(-1);await app.reload();
  const group=doc.getElementById(`version-major-${base.major}`);assert.equal(group.tagName,'DETAILS');assert.equal(group.querySelectorAll('.tree-version').length,3);assert.equal(group.querySelectorAll('.minor-version').length,2);assert.match(doc.getElementById(`version-${second.id}`).querySelector('.version-lineage').textContent,new RegExp(`實際來源：${versionLabel(first).replace('.','\\.')} → ${versionLabel(second).replace('.','\\.')}`));
  group.open=true;await fixtureVersionSelect(doc,base.id);assert.equal(doc.getElementById(group.id).open,true);doc.getElementById(group.id).open=false;await fixtureVersionSelect(doc,second.id);assert.equal(doc.getElementById(group.id).open,false);assert.equal(root.querySelector('.candidate-grid'),null);assert.equal(root.querySelector('.history-row'),null);assert.equal(root.querySelectorAll('.tree-version').length,p.versions.length);assert.equal(root.querySelectorAll('.official-card').length,1);
  const ids=[];const collect=node=>{if(node.id)ids.push(node.id);node.children.forEach(collect);};collect(root);assert.equal(new Set(ids).size,ids.length);assert.equal(doc.getElementById(`tree-version-${p.officialVersionId}`).querySelector('.badge').textContent,'正式版');assert.match(doc.getElementById(`version-${second.id}`).querySelector('.badge').textContent,/候選/);
 });
});

test('legacy one-time setup is explicit in the renderer and preserves all project history',async()=>{
 await withLiveFixture(async context=>{
  const {source,app,doc,calls}=context;const unbound=(await source.request('new',{title:'舊資料尚未選模型'})).project;await app.reload();await fixtureSelect(doc,'project-select',unbound.id);assert.equal(context.project.id,unbound.id);assert.equal(context.project.aiBinding,null);assert.equal(doc.getElementById('bind-project-member').value,'');assert.equal(doc.getElementById('discussion-member'),null);await fixtureFill(doc,'chat-input','綁定前保留的想法');assert.equal(doc.getElementById('send-chat').disabled,true);
  await fixtureClick(doc,'選定模型，開始共創');assert.equal(calls.filter(call=>call.action==='bind_project_model').length,0);await fixtureSelect(doc,'bind-project-member',(await source.request('state')).activeMemberId);await fixtureClick(doc,'選定模型，開始共創');const request=calls.filter(call=>call.action==='bind_project_model').at(-1).payload;assert.equal(request.expectedSettingsRevision,0);assert.equal(request.revision,unbound.revision);assert.deepEqual(context.project.messages,unbound.messages);assert.deepEqual(context.project.versions,unbound.versions);assert.equal(doc.getElementById('bind-project-member'),null);assert.equal(doc.getElementById('chat-input').value,'綁定前保留的想法');assert.equal(doc.getElementById('send-chat').disabled,false);assert.equal(calls.filter(call=>['discuss','generate','confirm_generate'].includes(call.action)).length,0);
 });
});

test('switching creative items away and back retains an intact ready direction without repeating discussion',async()=>{
 await withLiveFixture(async context=>{
  const {source,app,doc,calls}=context,originalItem=context.project.activeItemId;let p=await call(source,'create_item',context.project,{type:'titles',title:'切換後繼續生成'});const readyItem=p.activeItemId;p=await call(source,'discuss',p,{text:'社區影展海報，邀請居民與創作者看見日常故事。',consent:true});const summaryRevision=p.summaryRevision,brief=structuredClone(p.brief);
  p=await call(source,'select_item',p,{itemId:originalItem});p=await call(source,'select_item',p,{itemId:readyItem});await app.reload();assert.ok(p.revision>summaryRevision);assert.equal(p.summaryRevision,summaryRevision);assert.deepEqual(p.brief,brief);assert.equal(canConfirmGenerate(p),true);assert.equal(doc.getElementById('confirm-generate').disabled,false);
  await fixtureClick(doc,'確認方向並生成候選 ↗');assert.equal(context.project.versions.length,3);assert.equal(calls.filter(call=>call.action==='confirm_generate').length,1);assert.equal(calls.filter(call=>call.action==='discuss').length,0);
 });
});

test('confirm_generate and fuse transport failures remain unknown without auto retries or false completion',async()=>{
 for(const action of ['confirm_generate','fuse'])await withLiveFixture(async context=>{
  const {source,app,doc,root,calls}=context;
  if(action==='confirm_generate'){let p=await call(source,'create_item',context.project,{type:'titles',title:'不確定結果測試'});p=await call(source,'discuss',p,{text:'社區影展海報，邀請居民與創作者看見日常故事。',consent:true});await app.reload();}
  else{await fixtureVersionSelect(doc,context.project.officialVersionId);await fixtureVersionSelect(doc,context.project.versions[0].id);await fixtureFill(doc,'fuse-question','需要保留的融合方向');}
  await fixtureFill(doc,'chat-input','這段未送出的想法不能遺失');const saved=structuredClone(context.project);context.failNext(action,'模擬上游無法回應，結果尚未確認。',502);await fixtureClick(doc,action==='fuse'?'融合所選版本為新候選 ↗':'確認方向並生成候選 ↗');
  assert.ok(root.querySelector('.uncertain'));assert.equal(calls.filter(call=>call.action===action).length,1);assert.deepEqual(context.project,saved);assert.equal(doc.getElementById('chat-input').value,'這段未送出的想法不能遺失');assert.equal(fixtureButton(doc,'重試同一請求').disabled,true);assert.equal(doc.getElementById(action==='fuse'?'fuse-versions':'confirm-generate').disabled,true);if(action==='fuse')assert.equal(doc.getElementById('fuse-question').value,'需要保留的融合方向');
  void doc.getElementById(action==='fuse'?'fuse-versions':'confirm-generate').dispatchEvent('click');await settle();assert.equal(calls.filter(call=>call.action===action).length,1);assert.deepEqual(context.project,saved);
 });
});

test('new paid transport actions classify network, malformed, and explicit rejected outcomes consistently',async()=>{
 const originals={fetch:globalThis.fetch,location:globalThis.location};globalThis.location={href:'http://localhost/fixture/'};
 try{
  for(const action of ['confirm_generate','fuse'])for(const scenario of ['network','malformed','unknown','rejected']){
   let calls=0;globalThis.fetch=async()=>{calls++;if(scenario==='network')throw new TypeError('mock network loss');return {ok:false,status:502,json:async()=>{if(scenario==='malformed')throw new SyntaxError('mock malformed JSON');return {error:{code:'MODEL_OUTPUT_INVALID',message:'模擬結果',operationOutcome:scenario}};}};};
   await assert.rejects(createApiAdapter().request(action,{id:'p',itemId:'i',revision:1,requestId:'0123456789abcdef0123456789abcdef'}),error=>error.uncertain===(scenario!=='rejected'));assert.equal(calls,1);
  }
 }finally{Object.assign(globalThis,originals);}
});

test('content validation errors identify UTF-8 limits and duplicate labels without silently truncating',()=>{
 assert.equal(contentItemsError([item('body','全文','短文')],'short_text'),'');assert.match(contentItemsError([item('body','全文','  ')],'short_text'),/請填妥/);assert.match(contentItemsError([item('body','全文','中'.repeat(4001))],'short_text'),/全文.*12,000.*不會自動截斷/);assert.match(contentItemsError([item('p','第一段','中'.repeat(2001))],'article'),/第一段.*6,000/);
 assert.match(contentItemsError([item('a','同名','一'),item('b',' 同名 ','二')],'article'),/名稱不可重複/);assert.match(contentItemsError(Array.from({length:21},(_,index)=>item(`p${index}`,`段落${index}`,'中'.repeat(2000))),'article'),/120,000/);assert.match(contentItemsError([item('body','其他標籤','短文')],'short_text'),/全文/);
});

test('short-text renderer exposes one full body, reports overflow, and never submits truncated contents',async()=>{
 await withLiveFixture(async context=>{
  const {doc,root,source,app,calls}=context,p=await generatedItem(source,context.project,'short_text'),base=structuredClone(p.versions[0]);await app.reload();await fixtureCardClick(doc,base.id,'編輯');assert.equal(root.querySelectorAll('.editor-item').length,1);assert.equal(doc.getElementById('item-label-body').value,'全文');assert.equal(doc.getElementById('item-label-body').disabled,true);assert.ok(!root.querySelectorAll('button').some(button=>['＋ 新增內容欄位','＋ 新增段落'].includes(button.textContent)));
  const text='中'.repeat(4001);await fixtureFill(doc,'editor-title',text);assert.equal(doc.getElementById('editor-title').value,text);assert.equal(doc.getElementById('save-snapshot').disabled,true);assert.match(doc.getElementById('draft-status').textContent,/12,000.*不會自動截斷/);const before=calls.filter(call=>call.action==='snapshot').length;void doc.getElementById('save-snapshot').dispatchEvent('click');await settle();assert.equal(calls.filter(call=>call.action==='snapshot').length,before);assert.deepEqual(context.project.versions[0],base);
  const valid='中'.repeat(4000);await fixtureFill(doc,'editor-title',valid);await fixtureClick(doc,doc.getElementById('save-minor').textContent);assert.deepEqual(context.project.versions.at(-1).items,[item('body','全文',valid)]);assert.deepEqual(context.project.versions[0],base);assert.equal(context.project.officialVersionId,null);
 });
});

test('article manual editor blocks oversized paragraph snapshots and keeps every original byte for correction',async()=>{
 await withLiveFixture(async context=>{
  const {doc,source,app,calls}=context,p=await generatedItem(source,context.project,'article'),base=structuredClone(p.versions[0]);await app.reload();await fixtureCardClick(doc,base.id,'編輯');const oversized='中'.repeat(2001);
  await fixtureFill(doc,'editor-title',oversized);assert.equal(doc.getElementById('editor-title').value,oversized);assert.equal(doc.getElementById('save-minor').disabled,true);assert.equal(doc.getElementById('save-snapshot').disabled,true);assert.match(doc.getElementById('draft-status').textContent,/開場.*6,000.*不會自動截斷/);const before=calls.filter(call=>call.action==='snapshot').length;void doc.getElementById('save-minor').dispatchEvent('click');await settle();assert.equal(calls.filter(call=>call.action==='snapshot').length,before);assert.deepEqual(context.project.versions[0],base);
  await fixtureFill(doc,'editor-title','中'.repeat(2000));assert.equal(doc.getElementById('save-minor').disabled,false);await fixtureClick(doc,doc.getElementById('save-minor').textContent);const saved=context.project.versions.at(-1);assert.equal(saved.items[0].content,'中'.repeat(2000));assert.equal(saved.items[0].id,base.items[0].id);assert.deepEqual(saved.items.slice(1),base.items.slice(1));assert.deepEqual(context.project.versions[0],base);
 });
});

test('short-text and article promotion preserve user-authored item names and do not promise title renaming',async()=>{
 for(const type of ['short_text','article'])await withLiveFixture(async context=>{
  const {source,app,doc,root,calls}=context;const p=await generatedItem(source,context.project,type),name=p.activeItem.title,description=p.activeItem.description,projectTitle=p.title,candidate=structuredClone(p.versions[0]);await app.reload();
  await fixtureCardClick(doc,candidate.id,'設為正式版');assert.doesNotMatch(doc.body.querySelector('dialog').textContent,/同步更名|創作項目會.*更名/);await fixtureDialogClick(doc,'取消');assert.equal(context.project.officialVersionId,null);assert.equal(context.project.activeItem.title,name);assert.equal(calls.filter(call=>call.action==='promote').length,0);
  await fixtureCardClick(doc,candidate.id,'設為正式版');await fixtureDialogClick(doc,'設為正式版');assert.equal(context.project.officialVersionId,candidate.id);assert.equal(context.project.activeItem.title,name);assert.equal(context.project.activeItem.description,description);assert.equal(context.project.title,projectTitle);assert.deepEqual(context.project.versions.find(version=>version.id===candidate.id),candidate);assert.ok(root.querySelector('.active-item-header').textContent.includes(name));assert.equal(calls.filter(call=>call.action==='promote').length,1);
 });
});

test('repeated fusion and cross-item pins preserve direct content and lineage without recursively nesting source snapshots',async()=>{
 const api=createDemoAdapter();let p=(await api.request('project',{id:(await api.request('state')).projects[0].id})).project;
 p=await call(api,'fuse',p,{versionIds:[p.versions[0].id,p.versions[1].id],consent:true});const first=structuredClone(p.versions.at(-1)),sourceItem=p.activeItemId;
 p=await call(api,'fuse',p,{versionIds:[first.id,p.versions[2].id],consent:true});const second=p.versions.at(-1),pinned=second.fusionSourceSnapshots[0];
 assert.deepEqual(pinned.items,first.items);assert.deepEqual(pinned.provenance,first.provenance);assert.deepEqual(pinned.fusionSourceVersionIds,first.fusionSourceVersionIds);assert.equal(Object.hasOwn(pinned,'fusionSourceSnapshots'),false);assert.deepEqual(p.versions.find(version=>version.id===first.id),first);
 p=await call(api,'create_item',p,{type:'poster',title:'引用融合版本的規劃'});p=await call(api,'attach_reference',p,{targetItemId:sourceItem,versionId:first.id});const reference=p.activeItem.references[0].versionSnapshot;
 assert.deepEqual(reference.items,first.items);assert.deepEqual(reference.fusionSourceVersionIds,first.fusionSourceVersionIds);assert.equal(Object.hasOwn(reference,'fusionSourceSnapshots'),false);assert.deepEqual(p.creativeItems.find(item=>item.id===sourceItem).versions.find(version=>version.id===first.id),first);
});

test('metadata-only text snapshots preserve paragraph and full-body whitespace through real renderer and mocked JSON transport',async()=>{
 for(const type of ['short_text','article'])await withLiveFixture(async context=>{
  const {source,app,doc,calls}=context;let p=await generatedItem(source,context.project,type),generated=p.versions[0];
  const items=generated.items.map((field,index)=>({...field,content:`  \n\t${field.content}\n\n保留第 ${index+1} 段的縮排與換行。\t\n  `}));
  p=await call(source,'snapshot',p,{items,basedOnVersionId:generated.id,versionMode:'minor',goalAndRationale:'保留完整文字與所有前後空白。'});const base=structuredClone(p.versions.at(-1));
  await app.reload();await fixtureCardClick(doc,base.id,'編輯');assert.equal(doc.getElementById('editor-title').value,items[0].content);
  await fixtureFill(doc,'editor-goal','只改這個版本的備註，不改任何內容與空白。');await fixtureClick(doc,doc.getElementById('save-minor').textContent);
  const payload=calls.filter(call=>call.action==='snapshot').at(-1).payload,saved=context.project.versions.at(-1);
  assert.deepEqual(payload.items,items);assert.deepEqual(saved.items,items);assert.equal(payload.basedOnVersionId,base.id);assert.equal(saved.basedOnVersionId,base.id);assert.equal(saved.goalAndRationale,'只改這個版本的備註，不改任何內容與空白。');assert.deepEqual(context.project.versions.find(version=>version.id===base.id),base);
  await fixtureFill(doc,'editor-goal','第二次只改備註。');await fixtureClick(doc,doc.getElementById('save-snapshot').textContent);assert.deepEqual(calls.filter(call=>call.action==='snapshot').at(-1).payload.items,items);assert.deepEqual(context.project.versions.at(-1).items,items);
 });
});

test('title editing retains every existing custom field without a redundant add-field control',async()=>{
 await withLiveFixture(async({doc,root,project})=>{
  const original=project.versions.find(version=>version.id===project.officialVersionId);assert.ok(original.items.some(field=>field.id==='curatorial-note'));assert.equal(root.querySelectorAll('.editor-item').length,original.items.length);assert.ok(doc.getElementById('item-content-curatorial-note'));assert.equal(doc.getElementById('item-content-curatorial-note').value,original.items.find(field=>field.id==='curatorial-note').content);
  assert.ok(!root.querySelectorAll('button').some(button=>button.textContent==='＋ 新增內容欄位' || button.textContent==='＋ 新增段落'));
 });
});

async function artifactWorkspace(context,type){
 const {source,app,doc}=context;
 await call(source,'create_item',context.project,{type,title:type==='table'?'活動時段工作表':'參觀資料圖',description:'固定腳本整合測試'});await app.reload();
 await fixtureFill(doc,'chat-input',type==='table'?'請使用虛構活動時段示範。':'請使用虛構參觀人次示範。');await fixtureClick(doc,'送出想法 ↗');
 assert.equal(context.project.versions.length,0);assert.equal(context.project.phase,'summary');
 await fixtureClick(doc,'確認方向並生成候選 ↗');assert.equal(context.project.versions.length,1);
 const base=structuredClone(context.project.versions[0]);await fixtureCardClick(doc,base.id,'編輯');return base;
}
function artifactInput(doc,suffix){const node=doc.body.querySelector('.artifact-editor').querySelectorAll('input,textarea,select').find(input=>input.id.endsWith('-'+suffix));assert.ok(node,'artifact field '+suffix);return node;}
async function artifactFill(doc,suffix,value){const node=artifactInput(doc,suffix);node.value=value;await node.dispatchEvent('input');}

test('table renderer edits real columns rows cells and saves complete typed artifact through fetch without touching source',async()=>{
 await withLiveFixture(async context=>{
  const {doc,calls,root}=context,base=await artifactWorkspace(context,'table'),projectTitle=context.project.title;
  assert.equal(root.querySelectorAll('.editor-panel').length,1);assert.equal(root.querySelector('.editor-items'),null);
  const editor=root.querySelector('.artifact-editor'),cell=editor.querySelector('.artifact-cell-input');cell.value='  <img src=x onerror=alert(1)>\n原文  ';await cell.dispatchEvent('input');
  const oldColumns=base.artifact.columns.map(c=>c.id),oldRows=base.artifact.rows.map(r=>r.id);await fixtureClick(doc,'新增欄位');await fixtureClick(doc,'新增資料列');
  await fixtureClick(doc,'另存小修改 V1.1');const saved=context.project.versions.at(-1),request=calls.filter(c=>c.action==='snapshot').at(-1).payload;
  assert.equal(request.items,undefined);assert.equal(request.action,'snapshot');assert.deepEqual(request.artifact,saved.artifact);assert.equal(saved.artifact.rows[0].cells[0],cell.value);
  assert.deepEqual(saved.artifact.columns.slice(0,-1).map(c=>c.id),oldColumns);assert.deepEqual(saved.artifact.rows.slice(0,-1).map(r=>r.id),oldRows);
  assert.equal(saved.artifact.columns.length,base.artifact.columns.length+1);assert.equal(saved.artifact.rows.length,base.artifact.rows.length+1);
  assert.deepEqual(context.project.versions[0],base);assert.equal(saved.basedOnVersionId,base.id);assert.equal(context.project.title,projectTitle);assert.equal(context.project.officialVersionId,null);
  assert.equal(root.querySelectorAll('img,script').length,0);assert.ok(root.textContent.includes('<img src=x onerror=alert(1)>'));assert.ok(root.querySelector('.artifact-data-table'));assert.equal(context.project.aiBinding.memberId,calls.find(c=>c.action==='confirm_generate').payload.approvedMemberId);
 });
});

test('chart source editor preserves invalid drafts then saves data-driven SVG as a new immutable version',async()=>{
 await withLiveFixture(async context=>{
  const {doc,root,calls}=context,base=await artifactWorkspace(context,'chart');
  await artifactFill(doc,'sourceText','類別\t人數\n甲\t=1');assert.equal(doc.getElementById('save-snapshot').disabled,true);assert.match(root.querySelector('.artifact-editor').textContent,/十進位/);
  assert.equal(artifactInput(doc,'sourceText').value,'類別\t人數\n甲\t=1');assert.equal(calls.filter(c=>c.action==='snapshot').length,0);
  const source='類別\t人數\n甲\t2\n乙\t5';await artifactFill(doc,'sourceText',source);
  const type=artifactInput(doc,'chartType');type.value='line';await type.dispatchEvent('change');assert.ok(root.querySelector('.artifact-live-preview').querySelector('svg'));assert.ok(root.querySelector('.artifact-live-preview').querySelector('polyline'));
  await fixtureClick(doc,'另存新版本 V2');const next=context.project.versions.at(-1),payload=calls.filter(c=>c.action==='snapshot').at(-1).payload;
  assert.equal(next.artifact.sourceText,source);assert.equal(next.artifact.chartType,'line');assert.deepEqual(payload.artifact,next.artifact);assert.deepEqual(context.project.versions[0],base);assert.equal(next.minor,0);assert.equal(next.basedOnVersionId,base.id);
  assert.ok(root.querySelectorAll('button').some(b=>b.textContent==='匯出 SVG'));assert.ok(root.querySelectorAll('button').some(b=>b.textContent==='複製文字來源'));
 });
});

test('artifact candidate refinement promotes full reviewed artifact and keeps project and item metadata unchanged',async()=>{
 for(const type of ['table','chart'])await withLiveFixture(async context=>{
  const {doc,calls,root}=context,base=await artifactWorkspace(context,type),projectTitle=context.project.title,itemTitle=context.project.activeItem.title;
  const text=type==='table'?'請把表格說明改為「新版時段說明」':'請把圖表標題改為「新版參觀資料」';
  await fixtureFill(doc,'chat-input',text);await fixtureClick(doc,'送出想法 ↗');const revision=structuredClone(context.project.versions.at(-1));
  assert.equal(revision.source,'revision');assert.equal(revision.minor,1);assert.equal(revision.basedOnVersionId,base.id);assert.equal(context.project.officialVersionId,null);
  assert.ok(doc.getElementById('revision-review').querySelector('.artifact-preview'));assert.equal(calls.filter(c=>c.action==='discuss').at(-1).payload.baseVersionId,base.id);
  await fixtureClick(doc,'採用這次修改');await fixtureClick(doc,'確認採用這次修改');
  assert.equal(context.project.officialVersionId,revision.id);assert.deepEqual(context.project.versions.at(-1),revision);assert.deepEqual(context.project.versions[0],base);
  assert.equal(context.project.title,projectTitle);assert.equal(context.project.activeItem.title,itemTitle);assert.ok(root.querySelector('.official-card').querySelector('.artifact-preview'));
 });
});

test('artifact comparison renders the exact selected data without generating or relabeling versions',async()=>{
 await withLiveFixture(async context=>{
  const {doc,root,calls}=context,base=await artifactWorkspace(context,'chart');await artifactFill(doc,'title','另一個圖表標題');await fixtureFill(doc,'editor-goal','本版優先看分類差異，不推斷因果。');await fixtureClick(doc,'另存新版本 V2');
  const versions=structuredClone(context.project.versions),other=versions.at(-1);await fixtureVersionSelect(doc,base.id);await fixtureVersionSelect(doc,other.id);await fixtureClick(doc,'請 AI 提供比較意見 ↗');
  const comparison=context.project.comparisons.at(-1),section=doc.getElementById('comparison-section');assert.equal(section.querySelectorAll('svg').length,2);assert.equal(section.querySelectorAll('.artifact-data-table').length,2);
  assert.deepEqual(comparison.versionIds,[base.id,other.id]);assert.deepEqual(context.project.versions,versions);assert.equal(calls.filter(c=>c.action==='compare').length,1);assert.equal(calls.filter(c=>c.action==='fuse').length,0);assert.ok(root.textContent.includes('本版優先看分類差異'));
 });
});

test('artifact exports and pinned references retain native structure independently of later manual snapshots',async()=>{
 const source=createDemoAdapter({seed:false});let p=await boundProject(source);p=await call(source,'create_item',p,{type:'table',title:'引用表格'});
 p=await call(source,'discuss',p,{text:'請使用虛構活動時段示範。',consent:true});p=await call(source,'confirm_generate',p,{consent:true});const base=structuredClone(p.versions[0]),sourceItem=p.activeItemId;
 p=await call(source,'create_item',p,{type:'titles',title:'引用名稱'});p=await call(source,'attach_reference',p,{targetItemId:sourceItem,versionId:base.id});const pinned=structuredClone(p.references[0]);assert.deepEqual(pinned.versionSnapshot.artifact,base.artifact);
 const exported=exportProject(p);assert.deepEqual(exported.project.creativeItems.find(item=>item.id===sourceItem).versions[0].artifact,base.artifact);
 p=await call(source,'select_item',p,{itemId:sourceItem});const edited=structuredClone(base.artifact);edited.caption='來源後續版本';p=await call(source,'snapshot',p,{artifact:edited,basedOnVersionId:base.id,versionMode:'minor',goalAndRationale:'保留原資料，只修改說明。'});
 assert.deepEqual(p.versions[0],base);p=await call(source,'select_item',p,{itemId:p.creativeItems.find(item=>item.type==='titles'&&item.title==='引用名稱').id});assert.deepEqual(p.references[0],pinned);
});

test('flowchart choice generates only after confirmation then edits native source through the actual fetch boundary',async()=>{
 await withLiveFixture(async context=>{
  const {source,app,doc,root,calls}=context;await call(source,'create_item',context.project,{type:'chart',title:'創作流程'});await app.reload();
  assert.equal(artifactInput(doc,'chartType').value,'flowchart');assert.match(artifactInput(doc,'sourceText').value,/flowchart TD/);
  await fixtureFill(doc,'chat-input','請使用流程圖示範。');await fixtureClick(doc,'送出想法 ↗');assert.equal(context.project.versions.length,0);assert.equal(context.project.phase,'summary');
  await fixtureClick(doc,'確認方向並生成候選 ↗');const base=structuredClone(context.project.versions[0]);assert.equal(base.artifact.chartType,'flowchart');assert.match(base.artifact.sourceText,/Review -->/);assert.match(context.project.messages.at(-1).text,/虛構.*流程/);await fixtureCardClick(doc,base.id,'編輯');
  const unsafe='flowchart TD\nA[foo]; click A call evil(); X[bar]';await artifactFill(doc,'sourceText',unsafe);assert.equal(doc.getElementById('save-minor').disabled,true);assert.equal(artifactInput(doc,'sourceText').value,unsafe);assert.equal(calls.filter(call=>call.action==='snapshot').length,0);
  const sourceText='flowchart LR\nStart("開始")\nCheck{"確認方向？"}\nReady["建立候選"]\nStart --> Check\nCheck -->|未確認| Start\nCheck -->|確認| Ready';await artifactFill(doc,'sourceText',sourceText);assert.equal(doc.getElementById('save-minor').disabled,false);assert.ok(root.querySelector('.artifact-live-preview').querySelector('svg'));
  await fixtureClick(doc,'另存小修改 V1.1');const saved=context.project.versions.at(-1),request=calls.filter(call=>call.action==='snapshot').at(-1).payload;assert.equal(request.action,'snapshot');assert.equal(request.artifact.sourceText,sourceText);assert.equal(request.items,undefined);assert.equal(saved.basedOnVersionId,base.id);assert.equal(saved.artifact.chartType,'flowchart');assert.equal(saved.artifact.sourceText,sourceText);assert.deepEqual(context.project.versions[0],base);assert.equal(context.project.officialVersionId,null);assert.ok(root.querySelectorAll('button').some(button=>button.textContent==='匯出 MMD'));
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator'),copies=[];Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async text=>copies.push(text)}}});
  try{const card=doc.getElementById('version-'+saved.id),copy=card.querySelectorAll('button').find(button=>button.textContent==='複製文字來源');assert.ok(copy);const count=calls.length;await copy.dispatchEvent('click');await settle();assert.deepEqual(copies,[sourceText]);assert.equal(calls.length,count);}finally{if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;}
 });
});

test('flowchart mode switching preserves the complete draft, never translating or replacing source silently',async()=>{
 await withLiveFixture(async context=>{
  const {source,app,doc,calls}=context;await call(source,'create_item',context.project,{type:'chart',title:'流程與資料選型'});await app.reload();const original=artifactInput(doc,'sourceText').value;
  let select=artifactInput(doc,'chartType');select.value='bar';await select.dispatchEvent('change');assert.equal(artifactInput(doc,'sourceText').value,original);assert.equal(doc.getElementById('save-snapshot').disabled,true);
  select=artifactInput(doc,'chartType');select.value='flowchart';await select.dispatchEvent('change');assert.equal(artifactInput(doc,'sourceText').value,original);assert.ok(doc.body.querySelector('.artifact-live-preview').querySelector('svg'));assert.equal(calls.filter(call=>['snapshot','discuss','generate','confirm_generate'].includes(call.action)).length,0);
 });
});

test('flowchart comparison and explicit fusion keep native source snapshots, lineage and the fixed member',async()=>{
 await withLiveFixture(async context=>{
  const {source,app,doc,calls}=context;let p=await call(source,'create_item',context.project,{type:'chart',title:'流程融合'});p=await call(source,'discuss',p,{text:'請使用流程圖示範。',consent:true});p=await call(source,'confirm_generate',p,{consent:true});const base=structuredClone(p.versions[0]),a=structuredClone(base.artifact),b=structuredClone(base.artifact);a.sourceText+='\nFinish["交付"]\nDraft --> Finish';b.sourceText+='\nArchive["留存紀錄"]\nDraft --> Archive';
  p=await call(source,'snapshot',p,{artifact:a,basedOnVersionId:base.id,versionMode:'minor',goalAndRationale:'加上明確交付步驟。'});const first=structuredClone(p.versions.at(-1));p=await call(source,'snapshot',p,{artifact:b,basedOnVersionId:base.id,versionMode:'minor',goalAndRationale:'加上紀錄留存步驟。'});const second=structuredClone(p.versions.at(-1));await app.reload();await fixtureVersionSelect(doc,first.id);await fixtureVersionSelect(doc,second.id);await fixtureClick(doc,'請 AI 提供比較意見 ↗');assert.equal(context.project.versions.length,3);assert.equal(doc.getElementById('comparison-section').querySelectorAll('svg').length,2);
  await fixtureFill(doc,'fuse-question','保留完整節點，合併兩版已明確提供的連線。');await fixtureClick(doc,'融合所選版本為新候選 ↗');const fused=context.project.versions.at(-1),request=calls.filter(call=>call.action==='fuse').at(-1).payload;
  assert.equal(context.project.versions.length,4);assert.equal(fused.source,'fusion');assert.equal(fused.minor,0);assert.match(fused.artifact.sourceText,/Finish\["交付"\]/);assert.match(fused.artifact.sourceText,/Archive\["留存紀錄"\]/);assert.deepEqual(fused.fusionSourceVersionIds,[first.id,second.id]);assert.deepEqual(fused.fusionSourceSnapshots.map(v=>v.artifact),[first.artifact,second.artifact]);assert.deepEqual(context.project.versions.slice(0,3),[base,first,second]);assert.equal(context.project.officialVersionId,null);assert.equal(request.approvedMemberId,context.project.aiBinding.memberId);assert.equal(calls.filter(call=>call.action==='fuse').length,1);
 });
});

test('scripted artifact fusion rejects a union already present in any selected source instead of minting a fake revision',async()=>{
 for(const kind of ['table','bar','flowchart']){
  const source=createDemoAdapter({seed:false});let p=await boundProject(source);p=await call(source,'create_item',p,{type:kind==='table'?'table':'chart',title:'拒絕假融合'});p=await call(source,'discuss',p,{text:kind==='table'?'請使用虛構活動時段示範。':kind==='bar'?'請使用虛構參觀人次示範。':'請使用流程圖示範。',consent:true});p=await call(source,'confirm_generate',p,{consent:true});const base=p.versions[0],artifact=structuredClone(base.artifact);
  if(kind==='table')artifact.rows.push({id:'extra_row',cells:artifact.columns.map((column,index)=>'新增 '+index)});
  else if(kind==='bar')artifact.sourceText=artifact.sourceText.replace(/\n$/,'')+'\n新增分類\t20';
  else artifact.sourceText+='\nFinish["結束"]\nDraft --> Finish';
  p=await call(source,'snapshot',p,{artifact,basedOnVersionId:base.id,versionMode:'minor',goalAndRationale:'來源本身已包含全部資料，無新整合。'});const before=structuredClone(p),ids=[base.id,p.versions.at(-1).id];
  await assert.rejects(call(source,'fuse',p,{versionIds:ids,question:'不要僅複製任何來源。',consent:true}),/未變動|已包含|已完整存在|沒有.*新|沒有.*融合|沒有可新增/);const after=(await source.request('project',{id:p.id})).project;assert.deepEqual(after,before);
 }
});

async function mindmapWorkspace(context){
 const {source,app,doc}=context;await call(source,'create_item',context.project,{type:'mindmap',title:'自由探索心智圖'});await app.reload();
 await fixtureFill(doc,'chat-input','請使用心智圖示範。');await fixtureClick(doc,'送出想法 ↗');assert.equal(context.project.versions.length,0);assert.equal(context.project.phase,'summary');
 await fixtureClick(doc,'確認方向並生成候選 ↗');const base=structuredClone(context.project.versions[0]);assert.equal(base.artifact.nodes.length,1);assert.equal(base.artifact.proposals.length,3);assert.equal(context.project.officialVersionId,null);await fixtureCardClick(doc,base.id,'編輯');return base;
}
async function mindmapCheck(doc,id){const check=artifactInput(doc,'proposal-'+id);check.checked=true;await check.dispatchEvent('change');}

test('mindmap native pending acceptance saves only explicitly checked branches through real renderer and fetch',async()=>{
 await withLiveFixture(async context=>{
  const {doc,root,calls}=context,base=await mindmapWorkspace(context),projectTitle=context.project.title,itemTitle=context.project.activeItem.title;
  assert.equal(root.querySelector('.artifact-live-preview').querySelectorAll('svg').length,1);assert.equal(root.querySelectorAll('input').filter(input=>input.id.includes('-proposal-')&&input.checked).length,0);
  await mindmapCheck(doc,base.artifact.proposals[0].id);await mindmapCheck(doc,base.artifact.proposals[1].id);await fixtureClick(doc,'將勾選分支加入草稿');
  assert.equal(context.project.versions.length,1);assert.equal(calls.filter(c=>c.action==='snapshot').length,0);await fixtureFill(doc,'editor-goal','先保留兩條探索路線，不急著選結論。');await fixtureClick(doc,'另存小修改 V1.1');
  const saved=structuredClone(context.project.versions.at(-1)),payload=calls.filter(c=>c.action==='snapshot').at(-1).payload;assert.equal(saved.artifact.nodes.length,3);assert.equal(saved.artifact.proposals.length,1);assert.deepEqual(payload.artifact,saved.artifact);assert.equal(payload.items,undefined);assert.equal(saved.basedOnVersionId,base.id);assert.deepEqual(context.project.versions[0],base);assert.match(saved.goalAndRationale,/兩條探索/);
  await fixtureCardClick(doc,saved.id,'設為正式版');assert.match(doc.body.querySelector('dialog').textContent,/待選建議仍待勾選/);await fixtureDialogClick(doc,'設為正式版');assert.equal(context.project.officialVersionId,saved.id);assert.equal(context.project.title,projectTitle);assert.equal(context.project.activeItem.title,itemTitle);assert.deepEqual(context.project.versions.at(-1),saved);assert.ok(root.querySelectorAll('button').some(b=>b.textContent==='匯出 JSON'));
 });
});

test('mindmap selected saved node gets reviewable pending-only revision and continuing adoption preserves provenance',async()=>{
 await withLiveFixture(async context=>{
  const {doc,calls}=context,base=await mindmapWorkspace(context);await mindmapCheck(doc,base.artifact.proposals[0].id);await fixtureClick(doc,'將勾選分支加入草稿');await fixtureClick(doc,'另存小修改 V1.1');const saved=structuredClone(context.project.versions.at(-1)),target=saved.artifact.nodes[1].id;
  await fixtureSelect(doc,'mindmap-discussion-node',target);await fixtureFill(doc,'chat-input','請提供這個節點的子分支示範。');await fixtureClick(doc,'送出想法 ↗');
  const revision=structuredClone(context.project.versions.at(-1)),payload=calls.filter(c=>c.action==='discuss').at(-1).payload;assert.equal(revision.source,'revision');assert.equal(revision.basedOnVersionId,saved.id);assert.equal(revision.targetNodeId,target);assert.deepEqual(revision.artifact.nodes,saved.artifact.nodes);assert.equal(revision.artifact.proposals.filter(p=>p.parentId===target).length,3);assert.deepEqual(revision.artifact.proposals.filter(p=>p.parentId!==target),saved.artifact.proposals);assert.equal(payload.targetNodeId,target);assert.equal(payload.baseVersionId,saved.id);assert.equal(payload.approvedMemberId,context.project.aiBinding.memberId);assert.equal(context.project.officialVersionId,null);assert.match(doc.getElementById('revision-review').textContent,/待選分支/);
  await fixtureClick(doc,'採用這次修改');await fixtureDialogClick(doc,'確認採用這次修改');assert.equal(context.project.officialVersionId,revision.id);assert.deepEqual(context.project.versions.find(v=>v.id===saved.id),saved);
  await fixtureSelect(doc,'editor-source',revision.id);let selected=artifactInput(doc,'selection');selected.value=target;await selected.dispatchEvent('change');await mindmapCheck(doc,revision.artifact.proposals.find(p=>p.parentId===target).id);await fixtureClick(doc,'將勾選分支加入草稿');await fixtureClick(doc,'另存小修改 V1.3');const next=context.project.versions.at(-1);assert.equal(next.artifact.nodes.length,3);assert.equal(next.basedOnVersionId,revision.id);assert.deepEqual(context.project.versions.find(v=>v.id===revision.id),revision);assert.equal(context.project.officialVersionId,revision.id);
 });
});

test('mindmap raw node and child drafts survive outer reload and AI response, block incomplete saves, and escape malicious text',async()=>{
 await withLiveFixture(async context=>{
  const {doc,app,root,calls}=context,base=await mindmapWorkspace(context);const label='  <img src=x onerror=evil()>\n保留名稱  ',description='  第一行\n\n第二行  ';await artifactFill(doc,'label',label);await artifactFill(doc,'description',description);await artifactFill(doc,'child-label','尚未加入的自填分支');assert.equal(doc.getElementById('save-minor').disabled,true);assert.match(doc.getElementById('draft-status').textContent,/套用或放棄/);
  const old=artifactInput(doc,'label');await app.reload();assert.equal(artifactInput(doc,'label').value,label);assert.equal(artifactInput(doc,'child-label').value,'尚未加入的自填分支');old.value='stale';await old.dispatchEvent('input');assert.equal(artifactInput(doc,'label').value,label);
  await fixtureFill(doc,'chat-input','我想再探索，還沒決定方向。');await fixtureClick(doc,'送出想法 ↗');assert.equal(context.project.versions.length,1);assert.equal(artifactInput(doc,'label').value,label);assert.equal(artifactInput(doc,'description').value,description);assert.equal(artifactInput(doc,'child-label').value,'尚未加入的自填分支');assert.equal(doc.getElementById('save-minor').disabled,true);
  await fixtureClick(doc,'套用節點修改至草稿');assert.equal(doc.getElementById('save-minor').disabled,true);await fixtureClick(doc,'放棄自填子節點');assert.equal(doc.getElementById('save-minor').disabled,false);await fixtureClick(doc,'另存小修改 V1.1');assert.equal(context.project.versions.at(-1).artifact.nodes[0].label,label);assert.equal(context.project.versions.at(-1).artifact.nodes[0].description,description);assert.deepEqual(context.project.versions[0],base);assert.equal(root.querySelectorAll('img,script').length,0);assert.equal(calls.filter(c=>c.action==='snapshot').length,1);
 });
});

test('mindmap choices are node-scoped and a deliberate choice uses saved-source context without clearing typed draft',async()=>{
 await withLiveFixture(async context=>{
  const {doc,calls}=context,base=await mindmapWorkspace(context);await mindmapCheck(doc,base.artifact.proposals[0].id);await fixtureClick(doc,'將勾選分支加入草稿');await fixtureClick(doc,'另存小修改 V1.1');const source=context.project.versions.at(-1);
  await fixtureFill(doc,'chat-input','想繼續探索');await fixtureClick(doc,'送出想法 ↗');const q=context.project.messages.at(-1);assert.equal(choiceButtons(doc,q.id).length,2);assert.ok(choiceButtons(doc,q.id).every(b=>!b.disabled));await fixtureSelect(doc,'mindmap-discussion-node',source.artifact.nodes[1].id);assert.ok(choiceButtons(doc,q.id).every(b=>b.disabled));await fixtureSelect(doc,'mindmap-discussion-node',source.artifact.rootId);assert.ok(choiceButtons(doc,q.id).every(b=>!b.disabled));
  await fixtureFill(doc,'chat-input','保留我的自由文字草稿');void choiceButtons(doc,q.id)[0].dispatchEvent('click');await settle();const payload=calls.filter(c=>c.action==='discuss').at(-1).payload;assert.equal(payload.choiceAnswer.questionMessageId,q.id);assert.equal(payload.targetNodeId,source.artifact.rootId);assert.equal(payload.baseVersionId,source.id);assert.equal(payload.approvedMemberId,context.project.aiBinding.memberId);assert.equal(doc.getElementById('chat-input').value,'保留我的自由文字草稿');assert.deepEqual(context.project.versions.at(-1).artifact.nodes,source.artifact.nodes);
 });
});

test('mindmap manual split branches compare and fuse explicitly without accepting remaining proposals or overwriting sources',async()=>{
 await withLiveFixture(async context=>{
  const {doc,calls}=context,base=await mindmapWorkspace(context);await mindmapCheck(doc,base.artifact.proposals[0].id);await fixtureClick(doc,'將勾選分支加入草稿');await fixtureFill(doc,'editor-goal','只探索地方聲音。保留完整人工意見。');await fixtureClick(doc,'另存小修改 V1.1');const one=structuredClone(context.project.versions.at(-1));
  await fixtureCardClick(doc,base.id,'編輯');await mindmapCheck(doc,base.artifact.proposals[1].id);await fixtureClick(doc,'將勾選分支加入草稿');await fixtureFill(doc,'editor-goal','只探索人物觀點。第二版人工目標。');await fixtureClick(doc,'另存小修改 V1.2');const two=structuredClone(context.project.versions.at(-1));await fixtureVersionSelect(doc,one.id);await fixtureVersionSelect(doc,two.id);await fixtureClick(doc,'請 AI 提供比較意見 ↗');assert.equal(context.project.versions.length,3);assert.equal(doc.getElementById('comparison-section').querySelectorAll('.mindmap-preview').length,2);
  await fixtureClick(doc,'融合所選版本為新候選 ↗');const fused=context.project.versions.at(-1);assert.equal(fused.source,'fusion');assert.equal(fused.major,2);assert.equal(fused.minor,0);assert.equal(fused.artifact.nodes.length,3);assert.equal(fused.artifact.proposals.length,1);assert.match(fused.goalAndRationale,/只探索地方聲音。保留完整人工意見。/);assert.match(fused.goalAndRationale,/只探索人物觀點。第二版人工目標。/);assert.deepEqual(fused.fusionSourceVersionIds,[one.id,two.id]);assert.deepEqual(context.project.versions.find(v=>v.id===one.id),one);assert.deepEqual(context.project.versions.find(v=>v.id===two.id),two);assert.equal(context.project.officialVersionId,null);assert.equal(calls.filter(c=>c.action==='fuse').length,1);
 });
});

test('mindmap custom child and merge are explicit draft edits, lossless and saved only as a full new snapshot',async()=>{
 await withLiveFixture(async context=>{
  const {doc,calls}=context,base=await mindmapWorkspace(context);await mindmapCheck(doc,base.artifact.proposals[0].id);await mindmapCheck(doc,base.artifact.proposals[1].id);await fixtureClick(doc,'將勾選分支加入草稿');let selected=artifactInput(doc,'selection');selected.value=base.artifact.proposals[0].id;await selected.dispatchEvent('change');await artifactFill(doc,'child-label','新的觀察');await artifactFill(doc,'child-description','  保留完整細節\n與空白  ');await fixtureClick(doc,'將自填子節點加入草稿');assert.equal(calls.filter(c=>c.action==='snapshot').length,0);
  let merge=artifactInput(doc,'merge');merge.value=base.artifact.proposals[1].id;await merge.dispatchEvent('change');await fixtureClick(doc,'合併節點至草稿');await fixtureClick(doc,'另存小修改 V1.1');const saved=context.project.versions.at(-1),target=base.artifact.proposals[1].id;assert.equal(saved.artifact.nodes.length,3);assert.ok(!saved.artifact.nodes.some(n=>n.id===base.artifact.proposals[0].id));assert.match(saved.artifact.nodes.find(n=>n.id===target).description,/生活場景/);assert.equal(saved.artifact.nodes.find(n=>n.label==='新的觀察').parentId,target);assert.equal(saved.artifact.nodes.find(n=>n.label==='新的觀察').description,'  保留完整細節\n與空白  ');assert.deepEqual(context.project.versions[0],base);assert.equal(calls.filter(c=>c.action==='snapshot').length,1);
 });
});

test('mindmap transport rejects pending or stale target nodes and over-budget combined fusion metadata without side effects',async()=>{
 const api=createDemoAdapter({seed:false});let p=await boundProject(api);p=await call(api,'create_item',p,{type:'mindmap',title:'探索'});p=await call(api,'discuss',p,{text:'心智圖示範',consent:true});p=await call(api,'confirm_generate',p,{consent:true});const base=structuredClone(p.versions[0]);
 for(const targetNodeId of [undefined,'missing',base.artifact.proposals[0].id,123]){const before=structuredClone(p);await assert.rejects(call(api,'discuss',p,{text:'請提供這個節點的子分支示範。',baseVersionId:base.id,targetNodeId,consent:true}),e=>e.status===409);p=(await api.request('project',{id:p.id})).project;assert.deepEqual(p,before);}
 const {acceptMindmapProposals}=await import('../public/mindmap.js');const first=acceptMindmapProposals(base.artifact,[base.artifact.proposals[0].id]),second=acceptMindmapProposals(base.artifact,[base.artifact.proposals[1].id]);p=await call(api,'snapshot',p,{artifact:first,basedOnVersionId:base.id,versionMode:'minor',goalAndRationale:'甲'.repeat(2100)});const one=p.versions.at(-1);p=await call(api,'snapshot',p,{artifact:second,basedOnVersionId:base.id,versionMode:'minor',goalAndRationale:'乙'.repeat(2100)});const two=p.versions.at(-1),before=structuredClone(p);await assert.rejects(call(api,'fuse',p,{versionIds:[one.id,two.id],consent:true}),/12,000/);p=(await api.request('project',{id:p.id})).project;assert.deepEqual(p,before);
});

async function vectorWorkspace(context){
 const {source,app,doc}=context;await call(source,'create_item',context.project,{type:'vector',title:'幾何識別設計'});await app.reload();await fixtureFill(doc,'chat-input','請使用向量圖形示範。');await fixtureClick(doc,'送出想法 ↗');assert.equal(context.project.versions.length,0);assert.equal(context.project.phase,'summary');await fixtureClick(doc,'確認方向並生成候選 ↗');const base=structuredClone(context.project.versions[0]);assert.equal(base.artifact.kind,'vector');assert.equal(base.artifact.shapes.length,5);await fixtureCardClick(doc,base.id,'編輯');return base;
}

test('vector editor validates native numeric drafts and saves full geometry via real fetch without replacing source',async()=>{
 await withLiveFixture(async context=>{
  const {doc,root,calls}=context,base=await vectorWorkspace(context);assert.equal(root.querySelectorAll('.artifact-vector-editor').length,1);assert.ok(root.querySelector('.artifact-live-preview').querySelector('ellipse'));assert.equal(root.querySelector('.artifact-live-preview').querySelector('image'),null);
  await artifactFill(doc,'shape-x','1e3');await fixtureClick(doc,'套用圖形修改至草稿');assert.equal(doc.getElementById('save-minor').disabled,true);assert.equal(artifactInput(doc,'shape-x').value,'1e3');assert.equal(calls.filter(c=>c.action==='snapshot').length,0);
  await artifactFill(doc,'shape-x','12.345');await artifactFill(doc,'shape-fill','#126a58');await fixtureClick(doc,'套用圖形修改至草稿');assert.equal(doc.getElementById('save-minor').disabled,false);await fixtureFill(doc,'editor-goal','保留書屋意象，調整晨光位置與填色。');await fixtureClick(doc,'另存小修改 V1.1');const saved=context.project.versions.at(-1),payload=calls.filter(c=>c.action==='snapshot').at(-1).payload;assert.equal(saved.artifact.shapes[0].x,12.345);assert.equal(saved.artifact.shapes[0].fill,'#126a58');assert.deepEqual(saved.artifact.shapes.slice(1),base.artifact.shapes.slice(1));assert.deepEqual(payload.artifact,saved.artifact);assert.equal(payload.items,undefined);assert.deepEqual(context.project.versions[0],base);assert.equal(saved.basedOnVersionId,base.id);assert.equal(context.project.officialVersionId,null);assert.ok(root.querySelectorAll('button').some(b=>b.textContent==='匯出 SVG'));assert.ok(root.querySelectorAll('button').some(b=>b.textContent==='匯出 JSON'));
 });
});

test('vector ongoing AI-style scripted refinement stays visible and adopting a later revision preserves full object history',async()=>{
 await withLiveFixture(async context=>{
  const {doc,calls}=context,base=await vectorWorkspace(context),projectTitle=context.project.title,itemTitle=context.project.activeItem.title;await fixtureCardClick(doc,base.id,'設為正式版');await fixtureDialogClick(doc,'設為正式版');
  await fixtureFill(doc,'chat-input','標題改為「新的書屋標記」。');await fixtureClick(doc,'送出想法 ↗');const revision=structuredClone(context.project.versions.at(-1));assert.equal(revision.source,'revision');assert.equal(revision.artifact.title,'新的書屋標記');assert.deepEqual(revision.artifact.shapes,base.artifact.shapes);assert.equal(context.project.officialVersionId,base.id);assert.ok(doc.getElementById('revision-review').querySelector('.vector-preview'));await fixtureClick(doc,'採用這次修改');await fixtureDialogClick(doc,'確認採用這次修改');assert.equal(context.project.officialVersionId,revision.id);
  await fixtureSelect(doc,'editor-source',revision.id);await fixtureFill(doc,'chat-input','將「晨光」的填色改為「#ef8354」。');await fixtureClick(doc,'送出想法 ↗');const next=context.project.versions.at(-1);assert.equal(next.basedOnVersionId,revision.id);assert.equal(next.artifact.shapes[0].fill,'#ef8354');assert.deepEqual(next.artifact.shapes.slice(1),revision.artifact.shapes.slice(1));assert.deepEqual(context.project.versions.find(v=>v.id===revision.id),revision);assert.deepEqual(context.project.versions[0],base);assert.equal(context.project.title,projectTitle);assert.equal(context.project.activeItem.title,itemTitle);assert.equal(calls.filter(c=>c.action==='discuss').at(-1).payload.approvedMemberId,context.project.aiBinding.memberId);
 });
});

test('vector raw document and shape drafts survive reload and clarification, while invalid paint remains inert and unsaved',async()=>{
 await withLiveFixture(async context=>{
  const {doc,app,root,calls}=context,base=await vectorWorkspace(context);await artifactFill(doc,'document-title','尚未套用的畫布');await artifactFill(doc,'shape-fill','url(javascript:evil())');const old=artifactInput(doc,'shape-fill');assert.equal(doc.getElementById('save-minor').disabled,true);await app.reload();assert.equal(artifactInput(doc,'document-title').value,'尚未套用的畫布');assert.equal(artifactInput(doc,'shape-fill').value,'url(javascript:evil())');old.value='#ffffff';await old.dispatchEvent('input');assert.equal(artifactInput(doc,'shape-fill').value,'url(javascript:evil())');
  await fixtureFill(doc,'chat-input','這些方向怎麼想？');await fixtureClick(doc,'送出想法 ↗');assert.equal(context.project.versions.length,1);assert.equal(artifactInput(doc,'shape-fill').value,'url(javascript:evil())');assert.equal(artifactInput(doc,'document-title').value,'尚未套用的畫布');assert.ok(choiceButtons(doc,context.project.messages.at(-1).id).length===2);await fixtureClick(doc,'放棄此圖形欄位修改');await fixtureClick(doc,'套用畫布修改至草稿');assert.equal(doc.getElementById('save-minor').disabled,false);await fixtureClick(doc,'另存小修改 V1.1');assert.equal(context.project.versions.at(-1).artifact.title,'尚未套用的畫布');assert.deepEqual(context.project.versions[0],base);assert.equal(root.querySelectorAll('script,image,foreignObject').length,0);assert.equal(calls.filter(c=>c.action==='snapshot').length,1);
 });
});

test('vector shape addition ordering undo and literal text stay native and explicit through full snapshot transport',async()=>{
 await withLiveFixture(async context=>{
  const {doc,root,calls}=context,base=await vectorWorkspace(context);let add=artifactInput(doc,'add-type');add.value='text';await add.dispatchEvent('change');await fixtureClick(doc,'新增圖形至草稿');await artifactFill(doc,'shape-text','  <script>alert(1)</script>\n完整文字  ');await fixtureClick(doc,'套用圖形修改至草稿');await fixtureClick(doc,'向後移一層');await fixtureClick(doc,'復原上一步草稿操作');await fixtureClick(doc,'另存新版本 V2');const saved=context.project.versions.at(-1);assert.equal(saved.artifact.shapes.length,6);assert.equal(saved.artifact.shapes.at(-1).type,'text');assert.equal(saved.artifact.shapes.at(-1).text,'  <script>alert(1)</script>\n完整文字  ');assert.deepEqual(saved.artifact.shapes.slice(0,-1),base.artifact.shapes);assert.equal(new Set(saved.artifact.shapes.map(s=>s.id)).size,6);assert.equal(root.querySelectorAll('script').length,0);assert.deepEqual(context.project.versions[0],base);assert.equal(calls.filter(c=>c.action==='snapshot').length,1);
 });
});

test('vector comparison and explicit fusion preserve ordered compatible objects and authoritative per-version notes',async()=>{
 await withLiveFixture(async context=>{
  const {doc,calls}=context,base=await vectorWorkspace(context);await fixtureClick(doc,'新增圖形至草稿');await artifactFill(doc,'shape-x','10');await fixtureClick(doc,'套用圖形修改至草稿');await fixtureFill(doc,'editor-goal','新增左側標記，保留書屋主題。');await fixtureClick(doc,'另存小修改 V1.1');const one=structuredClone(context.project.versions.at(-1));await fixtureCardClick(doc,base.id,'編輯');await fixtureClick(doc,'新增圖形至草稿');await artifactFill(doc,'shape-x','500');await fixtureClick(doc,'套用圖形修改至草稿');await fixtureFill(doc,'editor-goal','新增右側標記，給雙側觀察空間。');await fixtureClick(doc,'另存小修改 V1.2');const two=structuredClone(context.project.versions.at(-1));await fixtureVersionSelect(doc,one.id);await fixtureVersionSelect(doc,two.id);await fixtureClick(doc,'請 AI 提供比較意見 ↗');assert.equal(context.project.versions.length,3);assert.equal(doc.getElementById('comparison-section').querySelectorAll('.vector-preview').length,2);await fixtureClick(doc,'融合所選版本為新候選 ↗');const fused=context.project.versions.at(-1);assert.equal(fused.source,'fusion');assert.equal(fused.artifact.shapes.length,7);assert.deepEqual(fused.artifact.shapes.slice(0,6),one.artifact.shapes);assert.deepEqual(fused.artifact.shapes.at(-1),two.artifact.shapes.at(-1));assert.match(fused.goalAndRationale,/新增左側標記/);assert.match(fused.goalAndRationale,/新增右側標記/);assert.equal(context.project.officialVersionId,null);assert.deepEqual(context.project.versions.find(v=>v.id===one.id),one);assert.deepEqual(context.project.versions.find(v=>v.id===two.id),two);assert.equal(calls.filter(c=>c.action==='fuse').length,1);
 });
});

test('vector deliberate reply buttons validate saved question before one request and preserve typed free-text draft',async()=>{
 await withLiveFixture(async context=>{
  const {doc,calls}=context,base=await vectorWorkspace(context);await fixtureFill(doc,'chat-input','先聊聊有哪些可能');await fixtureClick(doc,'送出想法 ↗');const question=context.project.messages.at(-1);assert.equal(question.kind,'clarification');assert.equal(context.project.versions.length,1);assert.equal(choiceButtons(doc,question.id).length,2);await fixtureFill(doc,'chat-input','尚未送出的其他想法');const n=calls.filter(c=>c.action==='discuss').length;void choiceButtons(doc,question.id)[0].dispatchEvent('click');await settle();const payload=calls.filter(c=>c.action==='discuss').at(-1).payload;assert.equal(calls.filter(c=>c.action==='discuss').length,n+1);assert.equal(payload.baseVersionId,base.id);assert.equal(payload.choiceAnswer.questionMessageId,question.id);assert.equal(payload.approvedMemberId,context.project.aiBinding.memberId);assert.equal(doc.getElementById('chat-input').value,'尚未送出的其他想法');assert.equal(context.project.versions.at(-1).source,'revision');assert.ok(choiceButtons(doc,question.id).every(b=>b.disabled));assert.deepEqual(context.project.versions[0],base);
 });
});

test('vector saved references finalization and export preserve native geometry despite later source changes',async()=>{
 const api=createDemoAdapter({seed:false});let p=await boundProject(api);p=await call(api,'create_item',p,{type:'vector',title:'向量來源'});p=await call(api,'discuss',p,{text:'向量示範',consent:true});p=await call(api,'confirm_generate',p,{consent:true});const base=structuredClone(p.versions[0]),sourceItem=p.activeItemId;p=await call(api,'promote',p,{versionId:base.id});p=await call(api,'finalize',p);assert.deepEqual(p.finalizations[0].versionSnapshot.artifact,base.artifact);p=await call(api,'reopen',p);const finalization=structuredClone(p.finalizations[0]);p=await call(api,'create_item',p,{type:'titles',title:'向量引用'});const targetItem=p.activeItemId;p=await call(api,'attach_reference',p,{targetItemId:sourceItem,versionId:base.id});const reference=structuredClone(p.references[0]);assert.deepEqual(reference.versionSnapshot.artifact,base.artifact);p=await call(api,'select_item',p,{itemId:sourceItem});p=await call(api,'discuss',p,{text:'標題改為「第二份向量版本」。',baseVersionId:base.id,consent:true});assert.equal(p.versions.length,2);assert.deepEqual(p.finalizations[0],finalization);assert.deepEqual(p.versions[0],base);p=await call(api,'select_item',p,{itemId:targetItem});assert.deepEqual(p.references[0],reference);assert.deepEqual(exportProject(p).project.creativeItems.find(item=>item.id===sourceItem).versions[0].artifact,base.artifact);
});

async function webpageDirectionCheck(doc,key,checked=true){const input=doc.getElementById('direction-confirm-'+key);assert.ok(input);assert.equal(input.disabled,false);input.checked=checked;await input.dispatchEvent('change');}
async function webpageWorkspace(context){
 const {source,app,doc}=context;await call(source,'create_item',context.project,{type:'webpage',title:'網站介紹頁'});await app.reload();await fixtureFill(doc,'chat-input','請使用網頁示範。');await fixtureClick(doc,'送出想法 ↗');assert.equal(context.project.phase,'summary');assert.equal(context.project.versions.length,0);assert.equal(doc.getElementById('confirm-generate').disabled,true);for(const key of ['style','content','functions'])await webpageDirectionCheck(doc,key);await fixtureClick(doc,'確認方向並生成候選 ↗');const base=structuredClone(context.project.versions[0]);assert.equal(base.artifact.kind,'webpage');await fixtureCardClick(doc,base.id,'編輯');return base;
}

test('webpage requires three separate current-direction checks then sends one explicit actual fetch and immutable approval',async()=>{
 await withLiveFixture(async context=>{
  const {source,app,doc,calls}=context;await call(source,'create_item',context.project,{type:'webpage',title:'介紹頁'});await app.reload();await fixtureFill(doc,'chat-input','請使用網頁示範。');await fixtureClick(doc,'送出想法 ↗');const summary=structuredClone(context.project.brief),revision=context.project.summaryRevision,count=calls.length;
  assert.equal(context.project.versions.length,0);assert.equal(doc.getElementById('confirm-generate').disabled,true);assert.equal(doc.body.querySelectorAll('.direction-part').length,3);
  await webpageDirectionCheck(doc,'functions');await webpageDirectionCheck(doc,'style');assert.equal(calls.length,count);assert.equal(doc.getElementById('confirm-generate').disabled,true);await app.reload();assert.equal(doc.getElementById('direction-confirm-style').checked,true);await webpageDirectionCheck(doc,'content');assert.equal(doc.getElementById('confirm-generate').disabled,false);await fixtureClick(doc,'確認方向並生成候選 ↗');
  const sent=calls.filter(c=>c.action==='confirm_generate');assert.equal(sent.length,1);assert.equal(sent[0].payload.action,'confirm_generate');assert.deepEqual(sent[0].payload.confirmedDirections,['style','content','functions']);assert.equal(sent[0].payload.directionRevision,revision);assert.equal(sent[0].payload.approvedMemberId,context.project.aiBinding.memberId);assert.equal(context.project.versions.length,1);assert.deepEqual(context.project.messages.find(m=>m.directionConfirmation).directionConfirmation,{summaryRevision:revision,style:summary.tone,content:summary.message,functions:summary.constraints});assert.ok(context.project.versions[0].provenance);assert.equal(context.project.officialVersionId,null);
 });
});

test('webpage new discussion clears old direction checks and stale checkbox cannot approve a new summary',async()=>{
 await withLiveFixture(async context=>{
  const {source,app,doc,calls}=context;await call(source,'create_item',context.project,{type:'webpage',title:'網頁'});await app.reload();await fixtureFill(doc,'chat-input','請使用網頁示範。');await fixtureClick(doc,'送出想法 ↗');await webpageDirectionCheck(doc,'style');const stale=doc.getElementById('direction-confirm-content'),before=context.project.summaryRevision;await fixtureFill(doc,'chat-input','請重新整理網頁示範。');await fixtureClick(doc,'送出想法 ↗');assert.notEqual(context.project.summaryRevision,before);assert.equal(doc.getElementById('direction-confirm-style').checked,false);stale.checked=true;await stale.dispatchEvent('change');assert.equal(doc.getElementById('direction-confirm-content').checked,false);assert.equal(doc.getElementById('confirm-generate').disabled,true);assert.equal(calls.filter(c=>c.action==='confirm_generate').length,0);
 });
});

test('webpage transport rejects absent partial duplicate and stale approvals without versions or dialogue side effects',async()=>{
 const api=createDemoAdapter({seed:false});let p=await boundProject(api);p=await call(api,'create_item',p,{type:'webpage',title:'網站'});p=await call(api,'discuss',p,{text:'網頁示範',consent:true});const before=structuredClone(p);
 for(const extra of [{},{confirmedDirections:['style','content'],directionRevision:p.summaryRevision},{confirmedDirections:['style','style','functions'],directionRevision:p.summaryRevision},{confirmedDirections:['style','content','functions'],directionRevision:p.summaryRevision-1},{confirmedDirections:['style','content','functions'],directionRevision:String(p.summaryRevision)}]){await assert.rejects(call(api,'confirm_generate',p,{...extra,consent:true}),/分別確認/);assert.deepEqual((await api.request('project',{id:p.id})).project,before);}
});

test('webpage raw fields survive reload and require explicit apply before full major snapshot via actual transport',async()=>{
 await withLiveFixture(async context=>{
  const {app,doc,root,calls}=context,base=await webpageWorkspace(context),literal='  <script>alert(1)</script>\nhttps://not-loaded.invalid/  ';await artifactFill(doc,'section-body',literal);await app.reload();assert.equal(artifactInput(doc,'section-body').value,literal);assert.equal(doc.getElementById('save-snapshot').disabled,true);await fixtureClick(doc,'套用內容區塊修改至草稿');await artifactFill(doc,'document-title','新的頁面標題');await fixtureClick(doc,'套用網頁設定至草稿');await fixtureFill(doc,'editor-goal','保留主軸，補上原樣文字與新版標題。');await fixtureClick(doc,'另存新版本 V2');const saved=context.project.versions.at(-1);assert.equal(saved.artifact.sections[0].body,literal);assert.equal(saved.artifact.title,'新的頁面標題');assert.deepEqual(saved.artifact.sections.slice(1),base.artifact.sections.slice(1));assert.deepEqual(context.project.versions[0],base);assert.equal(root.querySelectorAll('script').length,0);const sent=calls.filter(c=>c.action==='snapshot').at(-1).payload;assert.equal(sent.action,'snapshot');assert.deepEqual(sent.artifact,saved.artifact);assert.match(saved.goalAndRationale,/保留主軸/);
 });
});

test('webpage official can be repeatedly revised as reviewable candidates while fixed member and prior full page remain intact',async()=>{
 await withLiveFixture(async context=>{
  const {doc,calls}=context,base=await webpageWorkspace(context),projectTitle=context.project.title;await fixtureCardClick(doc,base.id,'設為正式版');await fixtureDialogClick(doc,'設為正式版');await fixtureFill(doc,'chat-input','標題改為「社區故事日｜新版」。');await fixtureClick(doc,'送出想法 ↗');let revision=structuredClone(context.project.versions.at(-1));assert.equal(revision.artifact.title,'社區故事日｜新版');assert.equal(revision.basedOnVersionId,base.id);assert.equal(context.project.officialVersionId,base.id);assert.deepEqual(revision.artifact.sections,base.artifact.sections);assert.equal(doc.getElementById('revision-review').querySelectorAll('.webpage-preview').length,1);await fixtureCardClick(doc,revision.id,'設為正式版');await fixtureDialogClick(doc,'設為正式版');await fixtureSelect(doc,'editor-source',revision.id);await fixtureFill(doc,'chat-input','視覺主題改為「midnight」。');await fixtureClick(doc,'送出想法 ↗');const later=context.project.versions.at(-1);assert.equal(later.artifact.theme,'midnight');assert.equal(later.basedOnVersionId,revision.id);assert.equal(context.project.officialVersionId,revision.id);assert.deepEqual(context.project.versions.find(v=>v.id===base.id),base);assert.deepEqual(context.project.versions.find(v=>v.id===revision.id),revision);assert.equal(later.provenance.memberId,base.provenance.memberId);assert.equal(context.project.title,projectTitle);assert.equal(calls.filter(c=>c.action==='discuss').length,3);
 });
});

test('webpage selected full pages compare then explicitly fuse distinct sections with own goals and no implicit adoption',async()=>{
 await withLiveFixture(async context=>{
  const {doc,calls}=context,base=await webpageWorkspace(context);await fixtureClick(doc,'新增內容區塊至草稿');await artifactFill(doc,'section-heading','甲區塊');await fixtureClick(doc,'套用內容區塊修改至草稿');await fixtureFill(doc,'editor-goal','加入甲方向');await fixtureClick(doc,'另存小修改 V1.1');const one=structuredClone(context.project.versions.at(-1));await fixtureCardClick(doc,base.id,'編輯');await fixtureClick(doc,'新增內容區塊至草稿');await artifactFill(doc,'section-heading','乙區塊');await fixtureClick(doc,'套用內容區塊修改至草稿');await fixtureFill(doc,'editor-goal','加入乙方向');await fixtureClick(doc,'另存小修改 V1.2');const two=structuredClone(context.project.versions.at(-1));await fixtureVersionSelect(doc,one.id);await fixtureVersionSelect(doc,two.id);await fixtureClick(doc,'請 AI 提供比較意見 ↗');assert.equal(doc.getElementById('comparison-section').querySelectorAll('.webpage-preview').length,2);assert.equal(context.project.versions.length,3);
  await fixtureClick(doc,'融合所選版本為新候選 ↗');assert.equal(context.project.versions.length,4);const fused=context.project.versions.at(-1);assert.equal(fused.source,'fusion');assert.equal(fused.artifact.sections.length,base.artifact.sections.length+2);assert.deepEqual(fused.artifact.sections.slice(0,-1),one.artifact.sections);assert.deepEqual(fused.artifact.sections.at(-1),two.artifact.sections.at(-1));assert.match(fused.goalAndRationale,/加入甲方向/);assert.match(fused.goalAndRationale,/加入乙方向/);assert.equal(context.project.officialVersionId,null);assert.deepEqual(context.project.versions.find(v=>v.id===one.id),one);assert.deepEqual(context.project.versions.find(v=>v.id===two.id),two);assert.equal(calls.filter(c=>c.action==='fuse').length,1);
 });
});

test('webpage stale editor nodes cannot mutate a newly selected source or another item after uiState replacement',async()=>{
 await withLiveFixture(async context=>{
  const {doc,source,app}=context,base=await webpageWorkspace(context);await artifactFill(doc,'document-title','第二版標題');await fixtureClick(doc,'套用網頁設定至草稿');await fixtureClick(doc,'另存新版本 V2');const second=structuredClone(context.project.versions.at(-1)),staleInput=artifactInput(doc,'document-title'),staleApply=fixtureButton(doc,'套用網頁設定至草稿');await fixtureSelect(doc,'editor-source',base.id);staleInput.value='STALE OVERWRITE';await staleInput.dispatchEvent('input');await staleApply.dispatchEvent('click');assert.equal(artifactInput(doc,'document-title').value,base.artifact.title);await fixtureClick(doc,'另存新版本 V3');assert.equal(context.project.versions.at(-1).artifact.title,base.artifact.title);assert.equal(context.project.versions.at(-1).basedOnVersionId,base.id);assert.deepEqual(context.project.versions.find(v=>v.id===second.id),second);
  const abandonedInput=artifactInput(doc,'section-body'),abandonedApply=fixtureButton(doc,'套用內容區塊修改至草稿'),itemId=context.project.activeItemId;await call(source,'create_item',context.project,{type:'titles',title:'另一創作項目'});await app.reload();abandonedInput.value='跨項目偷改';await abandonedInput.dispatchEvent('input');await abandonedApply.dispatchEvent('click');await call(source,'select_item',context.project,{itemId});await app.reload();assert.notEqual(artifactInput(doc,'section-body').value,'跨項目偷改');assert.equal(context.project.versions.at(-1).artifact.title,base.artifact.title);
 });
});
