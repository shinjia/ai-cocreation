// Production app/renderer/events and private HTTP adapter under mocked DOM/fetch.
// No real browser, server/PHP, credentials, model calls or publication.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTitleApp,createApiAdapter,webpageEditorReferences,webpageImageReferenceError,projectHasImages,exportProject} from '../public/app.js';
import {defaultArtifact,artifactItems,validateArtifact,renderArtifact,exportArtifact,isArtifactType} from '../public/artifacts.js';
import {WEBPAGE_STYLES,defaultWebpageSection,webpageImageReferenceIds} from '../public/webpage.js';
const clone=value=>JSON.parse(JSON.stringify(value));
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==','base64');
const REF='1'.repeat(32),SECOND='2'.repeat(32),DERIVED='3'.repeat(32),UNSELECTED='4'.repeat(32),SOURCE='5'.repeat(32);
const image=()=>({kind:'image',title:'原始圖片',alt:'藍色的圖',attribution:'我的照片',asset:{id:'a'.repeat(32),mime:'image/png',width:1,height:1,byteLength:PNG.length,sha256:'4ff6ab670a58c14270e034e2090d9a432caa263a14e0a25785386b0c12f880b5',normalization:'png-v1'}});
const reference=(id=REF)=>({id,targetItemId:'image-'+id,versionId:'image-version-'+id,versionSnapshot:{id:'image-version-'+id,contentType:'image',artifact:image()}});
const webpage=(ref=REF)=>({kind:'webpage',title:'固定圖片網頁',theme:'midnight',navigation:true,sections:[{...defaultWebpageSection('image','picture'),heading:'歷史固定圖片',body:'完整文字',entries:[{id:ref,title:'本網頁自己的替代文字',body:'此圖片的說明'}]},{...defaultWebpageSection('faq','questions'),entries:[{id:'answer',title:'這是自動同步嗎？',body:'不會自動連動來源的新版本。'}]}]});
const version=(id='v1',ref=REF)=>({id,number:1,major:1,minor:0,title:'完整網頁',contentType:'webpage',artifact:webpage(ref),items:artifactItems(webpage(ref)),referencesSnapshot:[reference(ref)],goalAndRationale:'保留完整內容與既有圖片',source:'generated',createdAt:'2026-10-21T12:00:00Z',messageId:'message',basedOnVersionId:null});
const derivedReference=()=>({...reference(DERIVED),viaReferences:[{referenceId:SOURCE,targetItemId:'illustrated-source',versionId:'illustrated-v1'}]});
function projectFixture({saved=true,official=true,ready=false,textOnly=false}={}){
 const member={id:'member1',nickname:'文字夥伴',enabled:true,provider:'openai',model:'fixed-text-model',ollamaUrl:''};
 const savedVersion=version();if(textOnly){savedVersion.artifact=defaultArtifact('webpage');savedVersion.items=artifactItems(savedVersion.artifact);savedVersion.referencesSnapshot=[];}
 const sourceArtifact=defaultArtifact('illustrated');sourceArtifact.blocks[0].imageRefId=DERIVED;sourceArtifact.blocks[0].layout='above';
 const sourceReference={id:SOURCE,targetItemId:'illustrated-source',versionId:'illustrated-v1',versionSnapshot:{id:'illustrated-v1',contentType:'illustrated',artifact:sourceArtifact,referencesSnapshot:[reference(DERIVED)]}};
 const item={id:'webpage-item',type:'webpage',title:'網頁項目',description:'完整網頁與固定圖片',enabled:true,archived:false,lifecycle:'in_progress',phase:ready?'summary':'work',versions:saved?[savedVersion]:[],messages:[],comparisons:[],references:[reference(SECOND),sourceReference],archivedVersionIds:[],officialVersionId:saved&&official?'v1':null,brief:{summary:'完整說明既有圖片',purpose:'說明',audience:'一般讀者',tone:'輕快明亮',message:'所有資訊完整呈現',constraints:'圖片僅用固定版本'},goalApprovedAt:ready?null:'now',summaryRevision:0,contextRevision:0,finalizations:[]};
 const unselected={id:reference(UNSELECTED).targetItemId,type:'image',title:'未選取的圖片',versions:[reference(UNSELECTED).versionSnapshot],references:[],officialVersionId:reference(UNSELECTED).versionId};
 const newer={id:'illustrated-source',type:'illustrated',title:'圖文來源',versions:[sourceReference.versionSnapshot,{...clone(sourceReference.versionSnapshot),id:'latest-illustrated',referencesSnapshot:[reference(UNSELECTED)]}],references:[reference(UNSELECTED)],officialVersionId:'latest-illustrated'};
 const p={projectLifecycle:'in_progress',activeItemId:item.id,sharedContextRevision:0,revision:0,aiBinding:{memberId:member.id,memberNickname:member.nickname,provider:member.provider,model:member.model,ollamaUrl:''},creativeItems:[item,newer,unselected],activeItem:item,module:'webpage',...clone(item),id:'project1',title:'固定圖片網頁專案',availableImageReferences:[reference(SECOND),derivedReference()],availableImageReferencesError:''};
 return {p,state:{csrf:'csrf-private',projects:[{id:p.id,title:p.title,lifecycle:p.projectLifecycle}],members:[member],activeMemberId:member.id,usageConsent:true,keyPresent:true,settingsRevision:1,keyRevision:1}};
}
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
 removeAttribute(k){delete this.attributes[k];}
 click(){this.clicked=true;if(this.tagName==='A'&&this.getAttribute('download'))this.ownerDocument.downloads.push({filename:this.getAttribute('download'),url:this.getAttribute('href')});return this.dispatchEvent('click');}
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
 const doc={activeElement:null,downloads:[],createElement(tag){return new FixtureNode(tag,this);},createElementNS(ns,tag){const node=new FixtureNode(tag,this);node.namespaceURI=ns;return node;},createTextNode(text){return new FixtureNode('#text',this,text);},getElementById(id){return this.body.id===id?this.body:this.body.querySelector('#'+id);}};
 doc.body=doc.createElement('body');doc.body.dataset={appMode:'fixture'};const root=doc.createElement('div');root.id='app';doc.body.append(root);return {doc,root};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixtureButton(doc,text){const button=doc.body.querySelectorAll('button').find(b=>b.textContent===text);assert.ok(button,`button exists: ${text}`);return button;}
async function fixtureClick(doc,text){const button=fixtureButton(doc,text);assert.equal(button.disabled,false,`button enabled: ${text}`);void button.dispatchEvent('click');await settle();}
async function fixtureFill(doc,id,value){const input=doc.getElementById(id);assert.ok(input,`input exists: ${id}`);input.value=value;await input.dispatchEvent('input');}

async function withApp(run,options={}){
 const originals={document:globalThis.document,addEventListener:globalThis.addEventListener,setTimeout:globalThis.setTimeout,location:globalThis.location,fetch:globalThis.fetch},oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;
 const {doc,root}=fixtureDocument();let {p,state}=projectFixture(options);const calls=[],reads=[],urls=[],revoked=[],events=new Map();let mediaResult={bytes:PNG,type:'image/png',status:200},heldAction=null,releaseAction=null,actionPromise=null,releaseReads=null,readsPromise=null,rejectAction=null;
 URL.createObjectURL=blob=>{const url='blob:webpage-'+urls.length;urls.push({url,blob});return url;};URL.revokeObjectURL=url=>revoked.push(url);doc.defaultView={URL,Blob};
 Object.assign(globalThis,{document:doc,addEventListener(type,callback){if(!events.has(type))events.set(type,[]);events.get(type).push(callback);},location:{href:'http://localhost/public/index.php'},setTimeout(handler,delay,...args){const timer=originals.setTimeout(handler,delay,...args);timer.unref?.();return timer;}});
 const response=value=>({ok:true,status:200,json:async()=>clone(value)});
 globalThis.fetch=async(url,settings)=>{
  assert.equal(url.origin,'http://localhost');assert.equal(settings.credentials,'same-origin');assert.equal(settings.redirect,'error');assert.equal(settings.cache,'no-store');
  if(url.pathname.endsWith('/media.php')){
   assert.equal(settings.method,'POST');assert.equal(settings.headers['X-CSRF-Token'],'csrf-private');assert.equal(url.search,'');const body=JSON.parse(settings.body);reads.push(body);if(readsPromise)await readsPromise;
   return {ok:mediaResult.status===200,status:mediaResult.status,json:async()=>({error:'固定私人圖片不存在'}),headers:new Headers({'Content-Type':mediaResult.type,'Content-Length':String(mediaResult.bytes.length)}),blob:async()=>new Blob([mediaResult.bytes],{type:mediaResult.type})};
  }
  assert.ok(url.pathname.endsWith('/api.php'));const action=url.searchParams.get('action'),payload=settings.body?JSON.parse(settings.body):null;calls.push({action,payload});
  if(action==='state')return response(state);if(action==='project')return response({project:p});
  if(action===heldAction&&actionPromise)await actionPromise;
  if(rejectAction?.action===action){const failure=rejectAction;rejectAction=null;return {ok:false,status:failure.status,json:async()=>({error:{message:failure.message,operationOutcome:'rejected'}})};}
  if(action==='confirm_generate'||action==='generate'||action==='snapshot'){
   const v=version('new-'+p.versions.length);v.number=v.major=p.versions.length+1;v.goalAndRationale=payload?.goalAndRationale || '產生一個完整候選';v.source=action==='snapshot'?'snapshot':'generated';v.basedOnVersionId=payload?.basedOnVersionId || null;
   if(action==='snapshot'){v.artifact=clone(payload.artifact);v.items=artifactItems(v.artifact);v.referencesSnapshot=webpageEditorReferences(p,p.versions.find(old=>old.id===v.basedOnVersionId)).filter(ref=>webpageImageReferenceIds(v.artifact).includes(ref.id));if(payload.versionMode==='minor'){v.major=1;v.minor=p.versions.length;}}
   p.versions.push(v);p.activeItem.versions=clone(p.versions);p.phase='work';p.goalApprovedAt='now';
  }else if(action==='discuss'){p.messages.push({id:'answer-'+p.revision,role:'assistant',kind:'clarification',text:'僅依完整文字與圖片中繼資料提供建議。'});}
  else throw new Error('Unsupported fixture action: '+action);
  p.revision++;return response({project:p});
 };
 try{const app=await createTitleApp({root,adapter:createApiAdapter(),demo:!!options.demo});await settle();await run({doc,root,app,calls,reads,urls,revoked,get project(){return p;},setProject(value){p=value;},mediaResponse(value){mediaResult={...mediaResult,...value};},dispatchWindow(type){return Promise.all((events.get(type)||[]).map(callback=>callback()));},holdAction(action){heldAction=action;actionPromise=new Promise(resolve=>releaseAction=resolve);},releaseAction(){releaseAction?.();actionPromise=null;},holdReads(){readsPromise=new Promise(resolve=>releaseReads=resolve);},releaseReads(){releaseReads?.();readsPromise=null;},reject(action,status,message='衝突'){rejectAction={action,status,message};}});}finally{releaseAction?.();releaseReads?.();Object.assign(globalThis,originals);URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;}
}
function control(root,label){const field=root.querySelectorAll('label').find(node=>node.textContent===label);assert.ok(field,'label '+label);const input=root.querySelector('#'+field.getAttribute('for'));assert.ok(input,'control '+label);return input;}
async function fillControl(root,label,value){const input=control(root,label);input.value=value;await input.dispatchEvent(input.tagName==='SELECT'?'change':'input');}
const mediaIdentity=ref=>({action:'read_image',id:'project1',itemId:ref.targetItemId,versionId:ref.versionId});

test('image picker exposes historical pins and server-resolved explicit direct/derived pins, never unselected or latest official sources',async()=>withApp(async ctx=>{
 const editor=ctx.root.querySelector('.artifact-webpage-editor'),picker=control(editor,'固定圖片引用');assert.deepEqual(picker.children.map(option=>option.value),['',REF,SECOND,DERIVED]);assert.equal(picker.value,REF);assert.ok(!picker.children.some(option=>option.value===UNSELECTED));assert.equal(ctx.root.querySelectorAll('.artifact-webpage-editor').length,1);assert.match(ctx.root.textContent,/不接收圖片像素/);assert.equal(ctx.calls.some(call=>!['state','project'].includes(call.action)),false);
}));
test('only official webpages read images automatically; candidates and editor stay lazy and exact-version bound',async()=>withApp(async ctx=>{
 assert.deepEqual(ctx.reads,[mediaIdentity(reference())]);const historical=ctx.root.querySelector('.tree-version'),load=historical.querySelectorAll('button').find(button=>button.textContent==='載入此網頁圖片預覽');assert.ok(load);await load.dispatchEvent('click');await settle();assert.deepEqual(ctx.reads,[mediaIdentity(reference()),mediaIdentity(reference())]);await fixtureClick(ctx.doc,'載入編輯草稿圖片預覽');await settle();assert.ok(ctx.reads.every(read=>read.versionId===reference().versionId));assert.equal(ctx.calls.some(call=>!['state','project'].includes(call.action)),false);
}));
test('no official webpage means no pixel fetch before an explicit private preview',async()=>withApp(async ctx=>{
 assert.equal(ctx.reads.length,0);await fixtureClick(ctx.doc,'載入此網頁圖片預覽');assert.deepEqual(ctx.reads,[mediaIdentity(reference())]);assert.equal(ctx.root.querySelector('.image-preview-image').getAttribute('alt'),'本網頁自己的替代文字');
},{official:false}));
test('editing full webpage metadata preserves historical pins after current references are removed',async()=>withApp(async ctx=>{
 const p=clone(ctx.project);p.activeItem.references=[];p.availableImageReferences=[];ctx.setProject(p);await ctx.app.reload();const original=clone(ctx.project.versions[0]),editor=ctx.root.querySelector('.artifact-webpage-editor');assert.deepEqual(control(editor,'固定圖片引用').children.map(option=>option.value),['',REF]);await fillControl(editor,'圖片說明','  保存完整說明\r\n<script>literal</script>  ');assert.equal(ctx.doc.getElementById('save-snapshot').disabled,true);await fixtureClick(ctx.doc,'套用內容區塊修改至草稿');assert.equal(ctx.doc.getElementById('save-snapshot').disabled,false);await fixtureClick(ctx.doc,'另存新版本 V2');const payload=ctx.calls.find(call=>call.action==='snapshot').payload;assert.equal(payload.artifact.sections[0].entries[0].body,'  保存完整說明\r\n<script>literal</script>  ');assert.deepEqual(payload.artifact.sections[1],original.artifact.sections[1]);assert.equal(payload.basedOnVersionId,'v1');assert.equal(payload.versionMode,'major');assert.equal(payload.referencesSnapshot,undefined);assert.equal(payload.availableImageReferences,undefined);assert.deepEqual(ctx.project.versions[0],original);assert.deepEqual(ctx.project.versions[1].referencesSnapshot,[reference()]);assert.equal(ctx.project.officialVersionId,'v1');assert.equal(ctx.calls.filter(call=>!['state','project','snapshot'].includes(call.action)).length,0);
}));
test('explicitly selecting a derived image creates a whole minor version preserving exact provenance without sending pixels',async()=>withApp(async ctx=>{
 const before=clone(ctx.project.versions[0]),editor=ctx.root.querySelector('.artifact-webpage-editor');await fillControl(editor,'固定圖片引用',DERIVED);await fillControl(editor,'圖片替代文字','本頁專用替代文字');await fixtureClick(ctx.doc,'套用內容區塊修改至草稿');await fixtureClick(ctx.doc,'另存小修改 V1.1');const payload=ctx.calls.find(call=>call.action==='snapshot').payload;assert.equal(payload.versionMode,'minor');assert.equal(payload.artifact.sections[0].entries[0].id,DERIVED);assert.equal(payload.artifact.sections[0].entries[0].title,'本頁專用替代文字');assert.deepEqual(ctx.project.versions[1].referencesSnapshot,[derivedReference()]);assert.deepEqual(ctx.project.versions[0],before);assert.equal(ctx.project.officialVersionId,'v1');assert.doesNotMatch(JSON.stringify(payload),/data:image|base64|csrf-private|iVBOR/);assert.equal(ctx.calls.some(call=>call.action==='grant_image_analysis'),false);
}));
test('new image blocks require an explicit selected pin and do not save or read pixels while editing',async()=>withApp(async ctx=>{
 const editor=ctx.root.querySelector('.artifact-webpage-editor'),before=ctx.reads.length;await fillControl(editor,'新增內容區塊類型','image');assert.equal(fixtureButton(ctx.doc,'新增內容區塊至草稿').disabled,true);assert.equal(control(editor,'新增區塊固定圖片').value,'');await fillControl(editor,'新增區塊固定圖片',DERIVED);await fixtureClick(ctx.doc,'新增內容區塊至草稿');assert.equal(control(editor,'固定圖片引用').value,DERIVED);assert.equal(ctx.reads.length,before);assert.equal(ctx.calls.some(call=>call.action==='snapshot'),false);await fixtureClick(ctx.doc,'另存新版本 V2');assert.equal(ctx.calls.find(call=>call.action==='snapshot').payload.artifact.sections.at(-1).entries[0].id,DERIVED);
},{textOnly:true}));
test('missing historical pins neither borrow current image metadata nor permit a save or complete HTML',async()=>withApp(async ctx=>{
 const p=clone(ctx.project);p.versions[0].referencesSnapshot=[];ctx.setProject(p);await ctx.app.reload();const source=ctx.doc.getElementById('editor-source');source.value='v1';await source.dispatchEvent('change');assert.match(ctx.root.textContent,/找不到固定圖片引用/);assert.equal(ctx.doc.getElementById('save-snapshot').disabled,true);assert.equal(ctx.reads.length,0);await ctx.doc.getElementById('save-snapshot').dispatchEvent('click');await fixtureClick(ctx.doc,'下載完整網頁 HTML');await settle();assert.equal(ctx.doc.downloads.length,0);assert.equal(ctx.reads.length,0);assert.equal(ctx.calls.some(call=>call.action==='snapshot'),false);
},{official:false}));
test('malicious snapshot identity and duplicate pins fail closed before preview/export fetch or save',async()=>{
 for(const change of [v=>v.referencesSnapshot[0].versionSnapshot.id='different',v=>v.referencesSnapshot[0].targetItemId='',v=>v.referencesSnapshot.push(clone(v.referencesSnapshot[0])),v=>v.referencesSnapshot[0].versionSnapshot.artifact.url='https://evil.invalid/pixel'])await withApp(async ctx=>{
  const p=clone(ctx.project);change(p.versions[0]);ctx.setProject(p);await ctx.app.reload();assert.equal(ctx.reads.length,0);assert.equal(ctx.root.querySelector('.image-preview-image'),null);await fixtureClick(ctx.doc,'下載完整網頁 HTML');await settle();assert.equal(ctx.doc.downloads.length,0);assert.equal(ctx.reads.length,0);
 },{official:false});
});
test('conflicting current and source pin identities block editor/save rather than silently replacing an image',async()=>withApp(async ctx=>{
 const p=clone(ctx.project),conflict=reference();conflict.versionId='newest-version';conflict.versionSnapshot.id='newest-version';p.availableImageReferences.push(conflict);ctx.setProject(p);await ctx.app.reload();assert.equal(ctx.root.querySelector('.artifact-webpage-editor'),null);assert.match(ctx.root.textContent,/同一固定引用對應不同版本快照/);assert.equal(ctx.doc.getElementById('save-snapshot').disabled,true);await ctx.doc.getElementById('save-snapshot').dispatchEvent('click');assert.equal(ctx.calls.some(call=>call.action==='snapshot'),false);assert.ok(ctx.reads.every(read=>read.versionId===reference().versionId));
}));
test('server source-resolution error is surfaced and blocks editor/save without falling back to creativeItems',async()=>withApp(async ctx=>{
 const p=clone(ctx.project);p.availableImageReferencesError='已選圖文的固定圖片來源不屬於這個專案。';p.availableImageReferences=[];ctx.setProject(p);await ctx.app.reload();assert.match(ctx.root.textContent,/已選圖文的固定圖片來源不屬於這個專案/);assert.equal(ctx.root.querySelector('.artifact-webpage-editor'),null);assert.equal(ctx.doc.getElementById('save-snapshot').disabled,true);assert.deepEqual(ctx.reads,[]);await ctx.doc.getElementById('save-snapshot').dispatchEvent('click');assert.equal(ctx.calls.some(call=>call.action==='snapshot'),false);
},{official:false}));
test('rerender disposes images, prevents detached buttons from fetching, and ignores late private responses',async()=>withApp(async ctx=>{
 const load=fixtureButton(ctx.doc,'載入此網頁圖片預覽');ctx.holdReads();await load.dispatchEvent('click');await settle();assert.equal(ctx.reads.length,1);await ctx.app.reload();await load.dispatchEvent('click');assert.equal(ctx.reads.length,1);ctx.releaseReads();await settle();assert.equal(ctx.urls.length,0);assert.equal(ctx.root.querySelector('.image-preview-image'),null);await fixtureClick(ctx.doc,'載入此網頁圖片預覽');await settle();assert.equal(ctx.urls.length,1);await ctx.app.reload();assert.ok(ctx.revoked.includes(ctx.urls[0].url));
},{official:false}));
test('source changes invalidate detached editor fields and save handlers while selecting exact historical pins',async()=>withApp(async ctx=>{
 const oldEditor=ctx.root.querySelector('.artifact-webpage-editor'),oldField=control(oldEditor,'圖片說明'),oldSave=ctx.doc.getElementById('save-snapshot');const p=clone(ctx.project),second=version('v2',SECOND);second.major=2;p.versions.push(second);ctx.setProject(p);await ctx.app.reload();const source=ctx.doc.getElementById('editor-source');source.value='v2';await source.dispatchEvent('change');oldField.value='過期不可保存';await oldField.dispatchEvent('input');await oldSave.dispatchEvent('click');const editor=ctx.root.querySelector('.artifact-webpage-editor');assert.equal(control(editor,'固定圖片引用').value,SECOND);assert.equal(control(editor,'圖片說明').value,second.artifact.sections[0].entries[0].body);assert.equal(ctx.calls.some(call=>call.action==='snapshot'),false);assert.ok(!control(editor,'固定圖片引用').children.some(option=>option.value===REF));
}));
test('busy repeated save emits one full snapshot; rejected revision preserves the unsaved image caption for retry',async()=>withApp(async ctx=>{
 await fillControl(ctx.root.querySelector('.artifact-webpage-editor'),'圖片說明','保留待保存的說明');await fixtureClick(ctx.doc,'套用內容區塊修改至草稿');ctx.holdAction('snapshot');const save=ctx.doc.getElementById('save-snapshot'),first=save.dispatchEvent('click');await settle();await save.dispatchEvent('click');assert.equal(ctx.calls.filter(call=>call.action==='snapshot').length,1);ctx.project.revision=7;ctx.reject('snapshot',409);ctx.releaseAction();await first;await settle();assert.equal(control(ctx.root.querySelector('.artifact-webpage-editor'),'圖片說明').value,'保留待保存的說明');assert.equal(ctx.project.versions.length,1);await fixtureClick(ctx.doc,'另存新版本 V2');assert.equal(ctx.calls.filter(call=>call.action==='snapshot').at(-1).payload.revision,7);assert.equal(ctx.project.versions.length,2);
}));
test('production HTML export embeds verified exact private PNG bytes once and keeps navigation/FAQ without active resources',async()=>withApp(async ctx=>{
 const download=fixtureButton(ctx.doc,'下載完整網頁 HTML');ctx.holdReads();const pending=download.dispatchEvent('click');await settle();await download.dispatchEvent('click');assert.deepEqual(ctx.reads,[mediaIdentity(reference())]);ctx.releaseReads();await pending;await settle();assert.equal(ctx.doc.downloads.length,1);const file=ctx.urls.find(entry=>entry.url===ctx.doc.downloads[0].url),html=await file.blob.text();assert.match(ctx.doc.downloads[0].filename,/V1-webpage\.html$/);assert.ok(html.includes('data:image/png;base64,'+PNG.toString('base64')));assert.match(html,/<details/);assert.match(html,/<a[^>]*href="#webpage-export-/);assert.doesNotMatch(html,/<script|<link|<form|<iframe|<object|<embed/i);assert.doesNotMatch(html,/<[^>]+\s(?:href|src)=["'](?:https?:|\/\/|javascript:)/i);assert.match(html,/connect-src &#39;none&#39;/);assert.equal(download.disabled,false);assert.equal(ctx.calls.some(call=>!['state','project'].includes(call.action)),false);
},{official:false}));
test('parallel HTML buttons for one immutable webpage deduplicate one in-flight private download',async()=>withApp(async ctx=>{
 const buttons=ctx.root.querySelectorAll('button').filter(button=>button.textContent==='下載完整網頁 HTML');assert.equal(buttons.length,2);const before=ctx.reads.length;ctx.holdReads();const first=buttons[0].dispatchEvent('click');await settle();await buttons[1].dispatchEvent('click');assert.equal(ctx.reads.length,before+1);ctx.releaseReads();await first;assert.equal(ctx.doc.downloads.length,1);
}));
test('async HTML export is canceled by rerender without a partial download and stale buttons cannot restart',async()=>withApp(async ctx=>{
 const download=fixtureButton(ctx.doc,'下載完整網頁 HTML');ctx.holdReads();const pending=download.dispatchEvent('click');await settle();await ctx.app.reload();await download.dispatchEvent('click');assert.equal(ctx.reads.length,1);ctx.releaseReads();await pending;assert.equal(ctx.doc.downloads.length,0);
},{official:false}));
test('pagehide invalidates pending exports and disposes active preview blob URLs',async()=>withApp(async ctx=>{
 const before=ctx.urls.slice();assert.equal(before.length,1);const download=fixtureButton(ctx.doc,'下載完整網頁 HTML');ctx.holdReads();const pending=download.dispatchEvent('click');await settle();await ctx.dispatchWindow('pagehide');ctx.releaseReads();await pending;assert.equal(ctx.doc.downloads.length,0);assert.ok(before.every(entry=>ctx.revoked.includes(entry.url)));const reads=ctx.reads.length;await download.dispatchEvent('click');assert.equal(ctx.reads.length,reads);
}));
test('missing or corrupt private bytes never create a partial HTML file and never switch to another image',async()=>{
 for(const response of [{status:404},{type:'text/html'},{bytes:Buffer.from(PNG).fill(0,35,45)}])await withApp(async ctx=>{
  ctx.mediaResponse(response);await fixtureButton(ctx.doc,'下載完整網頁 HTML').dispatchEvent('click');await settle();assert.equal(ctx.doc.downloads.length,0);assert.deepEqual(ctx.reads,[mediaIdentity(reference())]);assert.match(ctx.doc.body.textContent,/固定私人圖片不存在|不是 PNG|SHA256|圖片/);
 },{official:false});
});
test('production metadata downloads never read pixels and visibly warn they are not complete backups',async()=>withApp(async ctx=>{
 const bundle=ctx.root.querySelector('.tree-version');for(const label of ['匯出網頁中繼資料 JSON','匯出文字 TXT'])await bundle.querySelectorAll('button').find(button=>button.textContent===label).dispatchEvent('click');assert.equal(ctx.reads.length,0);assert.equal(ctx.doc.downloads.length,2);for(const download of ctx.doc.downloads){const text=await ctx.urls.find(entry=>entry.url===download.url).blob.text();assert.match(text,/不是完整專案備份/);assert.ok(text.includes(REF));assert.doesNotMatch(text,/data:image|iVBOR|csrf-private/);}
},{official:false}));
test('literal malicious image alt/caption are escaped in native preview and exported HTML without external fetches',async()=>withApp(async ctx=>{
 const attack='"><script src="https://evil.invalid/a">alert(1)</script><img src="https://evil.invalid/b" onerror="bad">',editor=ctx.root.querySelector('.artifact-webpage-editor');await fillControl(editor,'圖片替代文字',attack);await fillControl(editor,'圖片說明',attack);await fixtureClick(ctx.doc,'套用內容區塊修改至草稿');assert.equal(editor.querySelector('script'),null);await fixtureClick(ctx.doc,'另存新版本 V2');const bundle=ctx.doc.getElementById('version-new-1');const download=bundle.querySelectorAll('button').find(button=>button.textContent==='下載完整網頁 HTML');await download.dispatchEvent('click');const file=ctx.urls.find(entry=>entry.url===ctx.doc.downloads[0].url),html=await file.blob.text();assert.ok(html.includes('&lt;script src=&quot;https://evil.invalid/a&quot;&gt;'));assert.doesNotMatch(html,/<script|<img[^>]+\ssrc=["']https:/i);assert.ok(ctx.reads.every(read=>read.itemId===reference().targetItemId));
}));
test('text-only legacy webpage HTML remains downloadable without any private reader, including offline demo',async()=>withApp(async ctx=>{
 await fixtureButton(ctx.doc,'下載完整網頁 HTML').dispatchEvent('click');assert.equal(ctx.doc.downloads.length,1);assert.equal(ctx.reads.length,0);const file=ctx.urls.find(entry=>entry.url===ctx.doc.downloads[0].url),html=await file.blob.text();assert.match(html,/讓想法成為一頁清楚的網頁/);assert.doesNotMatch(html,/<img|data:image/);
},{official:false,textOnly:true,demo:true}));
test('export warning detects webpage image sections even if no image item or references remain',()=>{
 const p={...projectFixture().p,creativeItems:[],activeItem:{type:'webpage'},references:[],versions:[{artifact:webpage(),referencesSnapshot:[]}]};assert.equal(projectHasImages(p),true);assert.match(exportProject(p).imageExportNotice,/未包含 PNG/);
});
test('webpage current reference merge never expands creativeItems and rejects explicit source-resolution errors',()=>{
 const {p}=projectFixture(),saved=p.versions[0],before=clone(p);const references=webpageEditorReferences(p,saved);assert.deepEqual(references,[reference(),reference(SECOND),derivedReference()]);references[0].versionSnapshot.artifact.title='mutated';assert.deepEqual(p,before);delete p.availableImageReferences;const fallback=webpageEditorReferences(p,saved);assert.ok(!fallback.some(pin=>pin.id===DERIVED));assert.ok(!fallback.some(pin=>pin.id===UNSELECTED));p.availableImageReferencesError='來源不完整';assert.throws(()=>webpageEditorReferences(p,saved),/來源不完整/);assert.notEqual(webpageImageReferenceError(webpage(),[]),'');
});
test('application stylesheet embeds complete scoped webpage styles exactly once',async()=>{
 const css=await readFile(new URL('../public/styles.css',import.meta.url),'utf8');assert.equal(css.split(WEBPAGE_STYLES.trim()).length,2);assert.match(WEBPAGE_STYLES,/\.webpage-preview \.image-preview-caption/);assert.match(WEBPAGE_STYLES,/background:var\(--wp-bg\)/);
});
