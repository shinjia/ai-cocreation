// Production app/renderer/events and private HTTP adapter under mocked DOM/fetch.
// No real browser, server/PHP, credentials, model calls or publication.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {MODULES,createTitleApp,createApiAdapter,posterDirectionParts,posterDirectionConfirmationError,webpageDirectionParts,compositionEditorReferences,validItems,imageAnalysisReason,projectHasImages,exportProject} from '../public/app.js';
import {defaultArtifact,artifactItems,validateArtifact,renderArtifact,exportArtifact,isArtifactType} from '../public/artifacts.js';
import {COMPOSITION_STYLES} from '../public/composition.js';
import {exportCompositionHtml,MAX_COMPOSITION_EXPORT_BYTES} from '../public/composition-export.js';
const clone=value=>JSON.parse(JSON.stringify(value));
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==','base64');
const REF='1'.repeat(32),SECOND='2'.repeat(32);
const image=()=>({kind:'image',title:'原始圖片',alt:'藍色的圖',attribution:'我的照片',asset:{id:'a'.repeat(32),mime:'image/png',width:1,height:1,byteLength:PNG.length,sha256:'4ff6ab670a58c14270e034e2090d9a432caa263a14e0a25785386b0c12f880b5',normalization:'png-v1'}});
const reference=(id=REF)=>({id,targetItemId:'image-'+id,versionId:'image-version-'+id,versionSnapshot:{id:'image-version-'+id,contentType:'image',artifact:image()}});
const composition=(type='illustrated',ref=REF)=>{const value=defaultArtifact(type);if(type==='illustrated'){value.blocks[0].layout='left';value.blocks[0].imageRefId=ref;value.blocks.push({id:'second_paragraph',heading:'第二段',body:'保留完整原文',layout:'text',imageRefId:'',caption:''});}else value.blocks.push({id:'picture',type:'image',text:'圖片說明',imageRefId:ref,alignment:'center'});return value;};
const version=(id='v1',type='illustrated',ref=REF)=>({id,number:1,major:1,minor:0,title:'完整排版',contentType:type,artifact:composition(type,ref),items:artifactItems(composition(type,ref)),referencesSnapshot:[reference(ref)],goalAndRationale:'保留完整內容與既有圖片',source:'generated',createdAt:'2026-10-21T12:00:00Z',messageId:'message',basedOnVersionId:null});
function projectFixture({type='illustrated',saved=true,official=true,ready=false}={}){
 const member={id:'member1',nickname:'文字夥伴',enabled:true,provider:'openai',model:'fixed-text-model',ollamaUrl:''};
 const item={id:'composition-item',type,title:'排版項目',description:'完整文字與圖片排版',enabled:true,archived:false,lifecycle:'in_progress',phase:ready?'summary':'work',versions:saved?[version('v1',type)]:[],messages:[],comparisons:[],references:[reference(SECOND)],archivedVersionIds:[],officialVersionId:saved&&official?'v1':null,brief:{summary:'以完整文字與既有圖片表達',purpose:'說明',audience:'一般讀者',tone:'輕快明亮',message:'所有資訊完整呈現',constraints:'圖片在左，文字在右'},goalApprovedAt:ready?null:'now',summaryRevision:0,contextRevision:0,finalizations:[]};
 const p={projectLifecycle:'in_progress',activeItemId:item.id,sharedContextRevision:0,revision:0,aiBinding:{memberId:member.id,memberNickname:member.nickname,provider:member.provider,model:member.model,ollamaUrl:''},creativeItems:[item],activeItem:item,module:type,...clone(item),id:'project1',title:'圖文與海報專案'};
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
 const {doc,root}=fixtureDocument();let {p,state}=projectFixture(options);const calls=[],reads=[],urls=[],revoked=[];let heldAction=null,releaseAction=null,actionPromise=null,releaseReads=null,readsPromise=null,rejectAction=null;
 URL.createObjectURL=blob=>{const url='blob:composition-'+urls.length;urls.push({url,blob});return url;};URL.revokeObjectURL=url=>revoked.push(url);doc.defaultView={URL,Blob};
 Object.assign(globalThis,{document:doc,addEventListener(){},location:{href:'http://localhost/public/index.php'},setTimeout(handler,delay,...args){const timer=originals.setTimeout(handler,delay,...args);timer.unref?.();return timer;}});
 const response=value=>({ok:true,status:200,json:async()=>clone(value)});
 globalThis.fetch=async(url,settings)=>{
  assert.equal(url.origin,'http://localhost');assert.equal(settings.credentials,'same-origin');assert.equal(settings.redirect,'error');assert.equal(settings.cache,'no-store');
  if(url.pathname.endsWith('/media.php')){
   assert.equal(settings.method,'POST');assert.equal(settings.headers['X-CSRF-Token'],'csrf-private');assert.equal(url.search,'');const body=JSON.parse(settings.body);reads.push(body);if(readsPromise)await readsPromise;
   return {ok:true,status:200,headers:new Headers({'Content-Type':'image/png','Content-Length':String(PNG.length)}),blob:async()=>new Blob([PNG],{type:'image/png'})};
  }
  assert.ok(url.pathname.endsWith('/api.php'));const action=url.searchParams.get('action'),payload=settings.body?JSON.parse(settings.body):null;calls.push({action,payload});
  if(action==='state')return response(state);if(action==='project')return response({project:p});
  if(action===heldAction&&actionPromise)await actionPromise;
  if(rejectAction?.action===action){const failure=rejectAction;rejectAction=null;return {ok:false,status:failure.status,json:async()=>({error:{message:failure.message,operationOutcome:'rejected'}})};}
  if(action==='confirm_generate'||action==='generate'||action==='snapshot'){
   const v=version('new-'+p.versions.length,p.module);v.number=v.major=p.versions.length+1;v.goalAndRationale=payload?.goalAndRationale || '產生一個完整候選';v.source=action==='snapshot'?'snapshot':'generated';v.basedOnVersionId=payload?.basedOnVersionId || null;
   if(action==='snapshot'){v.artifact=clone(payload.artifact);v.items=artifactItems(v.artifact);v.referencesSnapshot=compositionEditorReferences(p,p.versions.find(old=>old.id===v.basedOnVersionId)).filter(ref=>v.artifact.blocks.some(block=>block.imageRefId===ref.id));if(payload.versionMode==='minor'){v.major=1;v.minor=p.versions.length;}}
   p.versions.push(v);p.activeItem.versions=clone(p.versions);p.phase='work';p.goalApprovedAt='now';
  }else if(action==='discuss'){p.messages.push({id:'answer-'+p.revision,role:'assistant',kind:'clarification',text:'僅依完整文字與圖片中繼資料提供建議。'});}
  else throw new Error('Unsupported fixture action: '+action);
  p.revision++;return response({project:p});
 };
 try{const app=await createTitleApp({root,adapter:createApiAdapter(),demo:!!options.demo});await settle();await run({doc,root,app,calls,reads,urls,revoked,get project(){return p;},setProject(value){p=value;},holdAction(action){heldAction=action;actionPromise=new Promise(resolve=>releaseAction=resolve);},releaseAction(){releaseAction?.();actionPromise=null;},holdReads(){readsPromise=new Promise(resolve=>releaseReads=resolve);},releaseReads(){releaseReads?.();readsPromise=null;},reject(action,status,message='衝突'){rejectAction={action,status,message};}});}finally{releaseAction?.();releaseReads?.();Object.assign(globalThis,originals);URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;}
}
function control(root,label){const field=root.querySelectorAll('label').find(node=>node.textContent===label);assert.ok(field,'label '+label);const input=root.querySelector('#'+field.getAttribute('for'));assert.ok(input,'control '+label);return input;}
async function fillControl(root,label,value){const input=control(root,label);input.value=value;await input.dispatchEvent(input.tagName==='SELECT'?'change':'input');}
async function checkDirection(ctx,id){const input=ctx.doc.getElementById('direction-confirm-'+id);assert.ok(input);input.checked=true;await input.dispatchEvent('change');}
const mediaIdentity=ref=>({action:'read_image',id:'project1',itemId:ref.targetItemId,versionId:ref.versionId});

test('both registry slots enabled without reordering and native projections route through strict validators',()=>{
 assert.deepEqual(MODULES.map(m=>m.id),['titles','short_text','article','illustrated','table','chart','mindmap','vector','image','poster','webpage','interactive']);
 for(const type of ['illustrated','poster']){assert.equal(MODULES.find(m=>m.id===type).enabled,true);assert.equal(isArtifactType(type),true);const value=composition(type);assert.equal(validateArtifact(value,type),'');assert.equal(validItems(artifactItems(value),type),true);assert.notEqual(validateArtifact({...value,html:'<b>bad</b>'},type),'');assert.match(exportArtifact(value,'json').text,/不.*備份|不是.*備份|備份/);assert.match(exportArtifact(value,'txt').text,/圖片|像素/);}
});
test('poster direction fields are distinct in exact order while webpage names remain unchanged',()=>{
 const {p}=projectFixture({type:'poster',ready:true});assert.deepEqual(posterDirectionParts(p).map(part=>[part.id,part.label,part.text]),[['style','視覺風格',p.brief.tone],['text','完整文字內容',p.brief.message],['layout','圖文排列',p.brief.constraints]]);
 assert.equal(posterDirectionConfirmationError(p,['style','text','layout'],0),'');assert.notEqual(posterDirectionConfirmationError(p,['style','layout','text'],0),'');assert.notEqual(posterDirectionConfirmationError(p,['style','text','layout'],1),'');p.activeItem.type='webpage';assert.deepEqual(webpageDirectionParts(p).map(part=>part.label),['視覺風格','內容結構','操作功能與限制']);
});
test('poster requires all three confirmations and generates one full candidate with fixed model once',async()=>withApp(async ctx=>{
 assert.equal(ctx.doc.getElementById('confirm-generate').disabled,true);await checkDirection(ctx,'style');await checkDirection(ctx,'text');assert.equal(ctx.doc.getElementById('confirm-generate').disabled,true);await checkDirection(ctx,'layout');const generate=ctx.doc.getElementById('confirm-generate');assert.equal(generate.disabled,false);ctx.holdAction('confirm_generate');const first=generate.dispatchEvent('click');await settle();await generate.dispatchEvent('click');assert.equal(ctx.calls.filter(call=>call.action==='confirm_generate').length,1);const payload=ctx.calls.at(-1).payload;assert.deepEqual(payload.confirmedDirections,['style','text','layout']);assert.equal(payload.directionRevision,0);assert.equal(payload.approvedModel,'fixed-text-model');assert.equal(payload.approvedMemberId,'member1');assert.equal(payload.itemId,'composition-item');assert.match(payload.requestId,/^[a-f0-9]{32}$/);ctx.releaseAction();await first;await settle();assert.equal(ctx.project.versions.length,1);assert.equal(ctx.project.officialVersionId,null);assert.equal(ctx.project.versions[0].artifact.kind,'poster');assert.equal(ctx.doc.getElementById('image-analysis-heading'),null);assert.equal(imageAnalysisReason(ctx.project),'');assert.match(ctx.root.textContent,/無法視覺判斷/);
},{type:'poster',ready:true,saved:false}));
test('updated directions clear confirmations and detached checkbox or generate events cannot approve newer content',async()=>withApp(async ctx=>{
 await checkDirection(ctx,'style');await checkDirection(ctx,'text');await checkDirection(ctx,'layout');const oldGenerate=ctx.doc.getElementById('confirm-generate'),oldCheck=ctx.doc.getElementById('direction-confirm-style');const p=clone(ctx.project);p.revision=3;p.summaryRevision=3;p.brief.tone='新風格';ctx.setProject(p);await ctx.app.reload();assert.equal(ctx.doc.getElementById('direction-confirm-style').checked,false);assert.equal(ctx.doc.getElementById('confirm-generate').disabled,true);oldCheck.checked=true;await oldCheck.dispatchEvent('change');await oldGenerate.dispatchEvent('click');assert.equal(ctx.calls.some(c=>c.action==='confirm_generate'),false);assert.equal(ctx.doc.getElementById('direction-confirm-style').checked,false);
},{type:'poster',ready:true,saved:false}));
test('illustrated generation has no poster or image consent gate and never requests pixel analysis',async()=>withApp(async ctx=>{
 assert.equal(ctx.doc.getElementById('direction-confirm-style'),null);assert.equal(ctx.doc.getElementById('image-analysis-heading'),null);await fixtureClick(ctx.doc,'確認方向並生成候選 ↗');const call=ctx.calls.find(c=>c.action==='confirm_generate');assert.ok(call);assert.equal(call.payload.confirmedDirections,undefined);assert.equal(ctx.project.versions.length,1);assert.equal(ctx.reads.length,0);assert.equal(ctx.calls.some(c=>c.action==='grant_image_analysis'),false);
},{ready:true,saved:false}));
test('composition editing keeps source pins after current removal and saves an entire major snapshot',async()=>withApp(async ctx=>{
 const original=clone(ctx.project.versions[0]),editor=ctx.root.querySelector('.composition-editor');assert.deepEqual(control(editor,'固定圖片引用').children.map(option=>option.value),['',REF,SECOND]);await fillControl(editor,'段落內文','  完整修改\r\n<script>literal</script>  ');assert.equal(ctx.doc.getElementById('save-snapshot').disabled,true);assert.equal(ctx.calls.some(c=>c.action==='snapshot'),false);await fixtureClick(ctx.doc,'套用區塊修改至草稿');assert.equal(ctx.doc.getElementById('save-snapshot').disabled,false);await fixtureClick(ctx.doc,'另存新版本 V2');const payload=ctx.calls.find(c=>c.action==='snapshot').payload;assert.equal(payload.artifact.blocks.length,2);assert.equal(payload.artifact.blocks[0].body,'  完整修改\r\n<script>literal</script>  ');assert.deepEqual(payload.artifact.blocks[1],original.artifact.blocks[1]);assert.equal(payload.artifact.blocks[0].imageRefId,REF);assert.equal(payload.basedOnVersionId,'v1');assert.equal(payload.versionMode,'major');assert.deepEqual(ctx.project.versions[0],original);assert.equal(ctx.project.officialVersionId,'v1');assert.deepEqual(ctx.project.versions[1].referencesSnapshot,[reference()]);assert.equal(ctx.root.querySelector('script'),null);
}));
test('poster style/layout/text changes save a whole minor snapshot without replacing the official version',async()=>withApp(async ctx=>{
 let editor=ctx.root.querySelector('.composition-editor');await fillControl(editor,'作品風格','festival');await fillControl(editor,'海報版型','landscape');await fixtureClick(ctx.doc,'套用作品設定至草稿');editor=ctx.root.querySelector('.composition-editor');await fillControl(editor,'區塊全文或圖片說明','完整海報標題');await fixtureClick(ctx.doc,'套用區塊修改至草稿');await fixtureClick(ctx.doc,'另存小修改 V1.1');const payload=ctx.calls.find(c=>c.action==='snapshot').payload;assert.equal(payload.versionMode,'minor');assert.equal(payload.artifact.theme,'festival');assert.equal(payload.artifact.format,'landscape');assert.equal(payload.artifact.blocks[0].text,'完整海報標題');assert.equal(payload.artifact.blocks.length,3);assert.equal(ctx.project.officialVersionId,'v1');
},{type:'poster'}));
test('only official composition previews fetch; each saved candidate reads its own pinned version',async()=>withApp(async ctx=>{
 assert.deepEqual(ctx.reads,[mediaIdentity(reference())]);const p=clone(ctx.project);for(let n=2;n<=60;n++){const v=version('v'+n,'illustrated',SECOND);v.major=v.number=n;p.versions.push(v);}ctx.setProject(p);ctx.reads.length=0;await ctx.app.reload();await settle();assert.equal(ctx.root.querySelectorAll('.version-content-details').length,60);assert.deepEqual(ctx.reads,[mediaIdentity(reference())]);const card=ctx.doc.getElementById('version-v42'),load=card.querySelectorAll('button').find(b=>b.textContent==='載入此排版圖片預覽');card.querySelector('details').open=true;await settle();assert.equal(ctx.reads.length,1);await load.dispatchEvent('click');await load.dispatchEvent('click');await settle();assert.deepEqual(ctx.reads,[mediaIdentity(reference()),mediaIdentity(reference(SECOND))]);assert.equal(load.disabled,true);
}));
test('no official means no image fetching until explicit preview; missing snapshot never borrows live refs',async()=>withApp(async ctx=>{
 assert.equal(ctx.reads.length,0);const p=clone(ctx.project);p.versions[0].referencesSnapshot=[];p.activeItem.references=[reference()];ctx.setProject(p);await ctx.app.reload();await fixtureClick(ctx.doc,'載入此排版圖片預覽');assert.equal(ctx.reads.length,0);assert.match(ctx.root.textContent,/找不到固定圖片引用/);
},{official:false}));
test('source switching binds the editor to the newly selected historical pins and invalidates old edits',async()=>withApp(async ctx=>{
 const p=clone(ctx.project),second=version('v2','illustrated',SECOND);second.major=2;p.versions.push(second);p.activeItem.references=[];ctx.setProject(p);await ctx.app.reload();const staleEditor=ctx.root.querySelector('.composition-editor'),oldField=control(staleEditor,'段落內文'),oldSave=ctx.doc.getElementById('save-snapshot'),source=ctx.doc.getElementById('editor-source');source.value='v2';await source.dispatchEvent('change');let editor=ctx.root.querySelector('.composition-editor');assert.deepEqual(control(editor,'固定圖片引用').children.map(option=>option.value),['',SECOND]);oldField.value='stale';await oldField.dispatchEvent('input');await oldSave.dispatchEvent('click');assert.equal(ctx.calls.some(c=>c.action==='snapshot'),false);assert.equal(control(editor,'段落內文').value,second.artifact.blocks[0].body);const before=ctx.reads.length;await fixtureClick(ctx.doc,'載入編輯草稿圖片預覽');await settle();assert.ok(ctx.reads.slice(before).some(read=>JSON.stringify(read)===JSON.stringify(mediaIdentity(reference(SECOND)))));assert.ok(ctx.reads.length>=before+1);
}));
test('rerenders dispose requested previews; late bytes and detached load handlers cannot resurrect or refetch',async()=>withApp(async ctx=>{
 const old=ctx.root.querySelector('.tree-version').querySelectorAll('button').find(b=>b.textContent==='載入此排版圖片預覽'),before=ctx.urls.length;ctx.holdReads();await old.dispatchEvent('click');await settle();await ctx.app.reload();const count=ctx.reads.length;await old.dispatchEvent('click');assert.equal(ctx.reads.length,count);ctx.releaseReads();await settle();assert.equal(ctx.urls.length,before+1);assert.ok(ctx.revoked.includes(ctx.urls[0].url));
}));
test('busy and duplicate save handlers issue one snapshot; rejected stale save preserves the draft',async()=>withApp(async ctx=>{
 await fillControl(ctx.root.querySelector('.composition-editor'),'段落內文','待保存全文');await fixtureClick(ctx.doc,'套用區塊修改至草稿');ctx.holdAction('snapshot');const save=ctx.doc.getElementById('save-snapshot'),first=save.dispatchEvent('click');await settle();await save.dispatchEvent('click');assert.equal(ctx.calls.filter(c=>c.action==='snapshot').length,1);ctx.project.revision=7;ctx.reject('snapshot',409);ctx.releaseAction();await first;await settle();assert.equal(control(ctx.root.querySelector('.composition-editor'),'段落內文').value,'待保存全文');assert.equal(ctx.project.versions.length,1);await fixtureClick(ctx.doc,'另存新版本 V2');assert.equal(ctx.calls.filter(c=>c.action==='snapshot').at(-1).payload.revision,7);assert.equal(ctx.project.versions.length,2);
}));
test('offline demo clearly omits both composition fixtures without private reads or creative calls',async()=>{
 for(const type of ['illustrated','poster'])await withApp(async ctx=>{assert.match(ctx.root.textContent,/圖文與海報腳本示範尚未提供/);assert.equal(ctx.root.querySelector('.composition-editor'),null);assert.equal(ctx.doc.getElementById('confirm-generate'),null);assert.equal(ctx.reads.length,0);assert.deepEqual(ctx.calls.map(c=>c.action),['state','project']);},{type,demo:true});
});
test('fixed composition styles occur exactly once in application CSS',async()=>{const css=await readFile(new URL('../public/styles.css',import.meta.url),'utf8');assert.equal(css.split(COMPOSITION_STYLES.trim()).length,2);});

test('metadata exports contain literal editable data but no pixels and cannot masquerade as complete backup',()=>{
 for(const type of ['illustrated','poster']){const value=composition(type);value.title='</title><script>literal</script>';const json=exportArtifact(value,'json'),txt=exportArtifact(value,'txt');assert.deepEqual(JSON.parse(json.text).artifact,value);assert.match(json.filename,/metadata-only/);assert.match(txt.filename,/text-only/);assert.match(json.text,/不是完整專案備份/);assert.match(txt.text,/不是完整專案備份/);assert.ok(txt.text.includes(value.title));assert.doesNotMatch(json.text,/data:image|iVBOR/);assert.doesNotMatch(txt.text,/data:image|iVBOR/);assert.throws(()=>exportArtifact(value,'html'),/HTML.*驗證|HTML/);}
});
test('standalone HTML includes exact authorized PNG bytes, fixed CSS and escaped text without active resources',async()=>{
 for(const type of ['illustrated','poster']){
  const value=composition(type),malicious='</title><script src="https://evil.invalid/x">alert(1)</script><img src="https://bad.invalid/a"><a href="javascript:x">';value.title=malicious;if(type==='illustrated')value.blocks[0].body=malicious;else value.blocks[0].text=malicious;
  const ref=reference();ref.versionSnapshot.artifact.alt='" onerror="alert(1)';let calls=0;
  const file=await exportCompositionHtml(value,{references:[ref],loadImage:async pin=>{calls++;assert.deepEqual(pin,ref);return new Blob([PNG],{type:'image/png'});}});assert.equal(calls,1);assert.equal(file.mime,'text/html;charset=utf-8');assert.match(file.filename,/\.html$/);assert.equal(file.text.split(COMPOSITION_STYLES).length,2);assert.ok(file.text.includes('&lt;script src=&quot;https://evil.invalid/x&quot;&gt;'));assert.doesNotMatch(file.text,/<(?:script|link|a|form|iframe|object|embed)\b/i);assert.doesNotMatch(file.text,/<[^>]+\s(?:href|src)=['"](?:https?:|javascript:|\/\/)/i);assert.doesNotMatch(file.text,/<[^>]+\sonerror\s*=\s*["']/i);assert.match(file.text,/connect-src &#39;none&#39;/);const data=file.text.match(/src="data:image\/png;base64,([A-Za-z0-9+/=]+)"/)[1];assert.deepEqual(Buffer.from(data,'base64'),PNG);
 }
});
test('repeated image refs and exact identity aliases load once and preserve every image occurrence',async()=>{
 const value=composition(),extra={...clone(value.blocks[0]),id:'repeat'},alias=reference(SECOND);alias.targetItemId=reference().targetItemId;alias.versionId=reference().versionId;alias.versionSnapshot.id=alias.versionId;value.blocks.push(extra,{...extra,id:'alias',imageRefId:SECOND});let calls=0;const file=await exportCompositionHtml(value,{references:[reference(),alias],loadImage:async()=>{calls++;return new Blob([PNG],{type:'image/png'});}});assert.equal(calls,1);assert.equal((file.text.match(/data:image\/png;base64,/g)||[]).length,3);
});
test('HTML exporter rejects missing, ambiguous or mismatched pinned references before any private read',async()=>{
 let calls=0;for(const references of [[],[reference(),reference()],[{...reference(),versionId:'different'}],[{...reference(),versionSnapshot:{contentType:'image',artifact:image()}}],[{...reference(),versionSnapshot:{id:reference().versionId,contentType:'webpage',artifact:image()}}]])await assert.rejects(()=>exportCompositionHtml(composition(),{references,loadImage:async()=>{calls++;return new Blob([PNG],{type:'image/png'});}}));assert.equal(calls,0);
});
test('HTML exporter verifies PNG type, exact bytes, dimensions and digest rather than trusting metadata',async()=>{
 const attempts=[{blob:new Blob([PNG],{type:'text/plain'})},{blob:new Blob(['not png'],{type:'image/png'})},{blob:new Blob([Buffer.alloc(PNG.length)],{type:'image/png'})},{edit:ref=>ref.versionSnapshot.artifact.asset.width=2},{edit:ref=>ref.versionSnapshot.artifact.asset.sha256='0'.repeat(64)}];
 for(const attempt of attempts){const ref=reference();attempt.edit?.(ref);await assert.rejects(()=>exportCompositionHtml(composition(),{references:[ref],loadImage:async()=>attempt.blob || new Blob([PNG],{type:'image/png'})}));}
});
test('HTML export preflights cumulative 20 MiB embedded occurrences and never drops oversized images',async()=>{
 assert.equal(MAX_COMPOSITION_EXPORT_BYTES,20*1024*1024);const value=composition(),ref=reference();ref.versionSnapshot.artifact.asset.byteLength=4*1024*1024;value.blocks=Array.from({length:6},(_,i)=>({...value.blocks[0],id:'big_'+i}));let reads=0;await assert.rejects(()=>exportCompositionHtml(value,{references:[ref],loadImage:async()=>{reads++;}}),/20 MiB/);assert.equal(reads,0);
});
test('HTML export remains version-bound and rejects stale async completion without partial output',async()=>{
 const value=composition(),ref=reference();let current=true,resolveRead;const pending=new Promise(resolve=>resolveRead=resolve),operation=exportCompositionHtml(value,{references:[ref],loadImage:()=>pending,isCurrent:()=>current});await settle();current=false;resolveRead(new Blob([PNG],{type:'image/png'}));await assert.rejects(operation,/失效|取消/);
 let finish;const delayed=new Promise(resolve=>finish=resolve),copy=composition();const result=exportCompositionHtml(copy,{references:[reference()],loadImage:()=>delayed});copy.title='mutated';copy.blocks[0].body='mutated';finish(new Blob([PNG],{type:'image/png'}));const file=await result;assert.doesNotMatch(file.text,/mutated/);
});
test('production HTML download uses exact private adapter identity once and creates a real self-contained file',async()=>withApp(async ctx=>{
 const bundle=ctx.root.querySelector('.tree-version'),download=bundle.querySelectorAll('button').find(b=>b.textContent==='下載完整排版 HTML'),before=ctx.reads.length;ctx.holdReads();const first=download.dispatchEvent('click');await settle();await download.dispatchEvent('click');assert.equal(ctx.reads.length,before+1);assert.deepEqual(ctx.reads.at(-1),mediaIdentity(reference()));ctx.releaseReads();await first;await settle();assert.equal(ctx.doc.downloads.length,1);const file=ctx.urls.find(entry=>entry.url===ctx.doc.downloads[0].url);assert.ok(file);const html=await file.blob.text();assert.match(ctx.doc.downloads[0].filename,/V1-illustrated\.html/);assert.ok(html.includes('data:image/png;base64,'+PNG.toString('base64')));assert.doesNotMatch(html,/<script|<link|<form/i);assert.equal(download.disabled,false);assert.equal(ctx.calls.some(call=>!['state','project'].includes(call.action)),false);
}));
test('production HTML export cancels after a source/view switch and old download buttons stay inert',async()=>withApp(async ctx=>{
 const download=ctx.root.querySelector('.tree-version').querySelectorAll('button').find(b=>b.textContent==='下載完整排版 HTML');ctx.holdReads();const pending=download.dispatchEvent('click');await settle();await ctx.app.reload();const before=ctx.reads.length;await download.dispatchEvent('click');assert.equal(ctx.reads.length,before);ctx.releaseReads();await pending;await settle();assert.equal(ctx.doc.downloads.length,0);
}));
test('composition source references retain removed historical pins but reject conflicting same-ID current pins',()=>{
 const {p}=projectFixture(),source=p.versions[0],before=clone(p),refs=compositionEditorReferences(p,source);assert.deepEqual(refs,[reference(),reference(SECOND)]);refs[0].versionSnapshot.artifact.title='changed clone';assert.deepEqual(p,before);
 const current=reference();current.versionId='changed';current.versionSnapshot.id='changed';p.activeItem.references=[current];assert.throws(()=>compositionEditorReferences(p,source),/同一固定引用對應不同版本快照/);
});

test('private composition preview fails closed on a mismatched snapshot identity without requesting another version',async()=>withApp(async ctx=>{
 const p=clone(ctx.project);p.versions[0].referencesSnapshot[0].versionSnapshot.id='wrong-version';ctx.setProject(p);ctx.reads.length=0;await ctx.app.reload();await settle();assert.equal(ctx.reads.length,0);assert.match(ctx.root.textContent,/圖片預覽無法載入/);assert.equal(ctx.root.querySelector('.image-preview-image'),null);
}));
test('missing HTML image authorization produces no download and never omits the required image',async()=>withApp(async ctx=>{
 const p=clone(ctx.project);p.versions[0].referencesSnapshot=[];ctx.setProject(p);await ctx.app.reload();await fixtureClick(ctx.doc,'下載完整排版 HTML');await settle();assert.equal(ctx.doc.downloads.length,0);assert.match(ctx.doc.body.textContent,/找不到有效的固定圖片引用/);
},{official:false}));
test('parallel HTML buttons for the same immutable version deduplicate active export jobs',async()=>withApp(async ctx=>{
 const buttons=ctx.root.querySelectorAll('button').filter(b=>b.textContent==='下載完整排版 HTML');assert.equal(buttons.length,2);const before=ctx.reads.length;ctx.holdReads();const first=buttons[0].dispatchEvent('click');await settle();await buttons[1].dispatchEvent('click');assert.equal(ctx.reads.length,before+1);ctx.releaseReads();await first;await settle();assert.equal(ctx.doc.downloads.length,1);
}));
test('text-only native HTML needs no private image reader and still contains no active resources',async()=>{
 const file=await exportCompositionHtml(defaultArtifact('poster'));assert.match(file.text,/海報主標題/);assert.doesNotMatch(file.text,/<img\b|<script\b|<form\b|<a\b|<link\b/);assert.match(file.text,/不是完整專案備份/);
});

test('detached outer goal metadata cannot silently change the newly selected source snapshot',async()=>withApp(async ctx=>{
 const p=clone(ctx.project),second=version('v2','illustrated',SECOND);second.major=2;second.goalAndRationale='第二版自己的目標';p.versions.push(second);ctx.setProject(p);await ctx.app.reload();const oldGoal=ctx.doc.getElementById('editor-goal'),source=ctx.doc.getElementById('editor-source');source.value='v2';await source.dispatchEvent('change');oldGoal.value='舊欄位不可覆寫';await oldGoal.dispatchEvent('input');assert.equal(ctx.doc.getElementById('editor-goal').value,'第二版自己的目標');await fixtureClick(ctx.doc,'另存新版本 V3');assert.equal(ctx.calls.find(call=>call.action==='snapshot').payload.goalAndRationale,'第二版自己的目標');
}));
test('detached generation instruction field cannot overwrite refreshed direction inputs',async()=>withApp(async ctx=>{
 const oldInstruction=ctx.doc.getElementById('generate-instruction');await ctx.app.reload();await fixtureFill(ctx.doc,'generate-instruction','目前補充方向');oldInstruction.value='過期方向';await oldInstruction.dispatchEvent('input');await fixtureClick(ctx.doc,'確認方向並生成候選 ↗');assert.equal(ctx.calls.find(call=>call.action==='confirm_generate').payload.instruction,'目前補充方向');
},{ready:true,saved:false}));

 test('project JSON warns that referenced PNG assets are not included even without direct image versions',()=>{const {p}=projectFixture();assert.equal(p.creativeItems.every(item=>item.type!=='image'),true);assert.equal(projectHasImages(p),true);assert.match(exportProject(p).imageExportNotice,/未包含 PNG|不含 PNG/);});

test('conflicting current/source image pins disable the editor and full save without silently replacing an old pin',async()=>withApp(async ctx=>{
 const p=clone(ctx.project),changed=reference();changed.versionId='different';changed.versionSnapshot.id='different';p.activeItem.references=[changed];ctx.setProject(p);await ctx.app.reload();assert.equal(ctx.root.querySelector('.composition-editor'),null);assert.match(ctx.root.textContent,/同一固定引用對應不同版本快照/);const save=ctx.doc.getElementById('save-snapshot');assert.equal(save.disabled,true);await save.dispatchEvent('click');assert.equal(ctx.calls.some(call=>call.action==='snapshot'),false);assert.deepEqual(ctx.reads.at(-1),mediaIdentity(reference()));
}));

test('source replacement confirmation becomes inert after a newer render and preserves unsaved content',async()=>withApp(async ctx=>{
 const p=clone(ctx.project),second=version('v2','illustrated',SECOND);second.major=2;p.versions.push(second);ctx.setProject(p);await ctx.app.reload();await fillControl(ctx.root.querySelector('.composition-editor'),'段落內文','保留尚未保存的草稿');await fixtureClick(ctx.doc,'套用區塊修改至草稿');const source=ctx.doc.getElementById('editor-source');source.value='v2';const pending=source.dispatchEvent('change');await settle();assert.ok(ctx.doc.body.querySelector('dialog'));await source.dispatchEvent('change');assert.equal(ctx.doc.body.querySelectorAll('dialog').length,1);const refreshed=clone(ctx.project);refreshed.archivedVersionIds=['v2'];ctx.setProject(refreshed);await ctx.app.reload();await fixtureClick(ctx.doc,'替換編輯草稿');await pending;assert.equal(ctx.doc.getElementById('editor-source').value,'v1');assert.equal(control(ctx.root.querySelector('.composition-editor'),'段落內文').value,'保留尚未保存的草稿');assert.equal(ctx.calls.some(call=>call.action==='snapshot'),false);assert.match(ctx.doc.body.textContent,/原本尚未保存的草稿仍保留/);
}));
test('embedded image captions and status use composition theme foreground/background without changing standalone image styles',async()=>{
 const css=await readFile(new URL('../public/styles.css',import.meta.url),'utf8');assert.match(COMPOSITION_STYLES,/\.composition-preview \.artifact-image-preview,\.composition-preview \.image-preview-caption,\.composition-preview \.image-preview-status\{background:var\(--cp-bg\);color:var\(--cp-ink\)\}/);assert.match(COMPOSITION_STYLES,/\.composition-preview \.image-preview-origin\{color:var\(--cp-ink\)\}/);assert.match(css,/\.image-preview-caption,\.image-local-preview figcaption \{ padding:12px 16px; background:white;/);assert.equal(css.split(COMPOSITION_STYLES.trim()).length,2);
});
