// Mocked DOM, local normalization, and HTTP transport only. No browser or AI calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {MODULES,createTitleApp,createApiAdapter,ApiError,canGenerate,canConfirmGenerate,canSnapshot,versionSourceLabel,validItems,exportProject,imageAnalysisReason,IMAGE_GENERATION_UNAVAILABLE} from '../public/app.js';
import {createMediaAdapter,MediaError} from '../public/media.js';
import {defaultArtifact,artifactItems} from '../public/artifacts.js';
const clone=value=>JSON.parse(JSON.stringify(value));
const artifact=()=>({kind:'image',title:'自己的圖片',alt:'藍色形狀',attribution:'自攝',asset:{id:'a'.repeat(32),mime:'image/png',width:20,height:10,byteLength:3,sha256:'b'.repeat(64),normalization:'png-v1'}});
const version=(id='v1')=>({id,number:1,major:1,minor:0,title:'自己的圖片',contentType:'image',artifact:artifact(),items:artifactItems(artifact()),goalAndRationale:'目標是練習構圖',goalSource:'user',source:'external_upload',createdAt:'2026-10-21T12:00:00Z',messageId:'upload-record',basedOnVersionId:null});
function projectFixture({saved=false,consent=false}={}){
 const member={id:'member1',nickname:'視覺夥伴',enabled:true,provider:'openai',model:'vision-test',ollamaUrl:''};
 const item={id:'image-item',type:'image',title:'圖片項目',description:'練習構圖',enabled:true,archived:false,lifecycle:'in_progress',phase:'discussion',versions:saved?[version()]:[],messages:[],comparisons:[],references:[],archivedVersionIds:[],officialVersionId:saved?'v1':null,brief:null,goalApprovedAt:null,summaryRevision:null,contextRevision:0,finalizations:[]};
 const p={id:'project1',title:'私人圖片專案',description:'測試',projectLifecycle:'in_progress',activeItemId:item.id,sharedContextRevision:0,revision:0,aiBinding:{memberId:member.id,memberNickname:member.nickname,provider:member.provider,model:member.model,ollamaUrl:''},creativeItems:[item],activeItem:item,module:'image',imageAnalysisConsent:consent?{bindingHash:'hash',acceptedAt:'2026-10-21T12:00:00Z'}:null,...clone(item)};p.id='project1';p.title='私人圖片專案';
 return {p,state:{projects:[{id:p.id,title:p.title,lifecycle:p.projectLifecycle}],members:[member],activeMemberId:member.id,usageConsent:true,keyPresent:false,settingsRevision:1,keyRevision:1}};
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
 click(){this.clicked=true;return this.dispatchEvent('click');}
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

async function withApp(run,{saved=false,consent=false,keyPresent=false,demo=false,normalizer=null}={}){
 const originals={document:globalThis.document,addEventListener:globalThis.addEventListener,setTimeout:globalThis.setTimeout,location:globalThis.location};
 const {doc,root}=fixtureDocument();let {p,state}=projectFixture({saved,consent});state.keyPresent=keyPresent;
 const urls=[],revoked=[];doc.defaultView={URL:{createObjectURL(blob){const url='blob:fixture-'+urls.length;urls.push({url,blob});return url;},revokeObjectURL(url){revoked.push(url);}},Blob};
 globalThis.document=doc;globalThis.addEventListener=()=>{};globalThis.location={href:'http://localhost/public/index.php'};globalThis.setTimeout=(handler,delay,...args)=>{const timer=originals.setTimeout(handler,delay,...args);timer.unref?.();return timer;};
 const calls=[],uploads=[],reads=[],normalized=[],sourceFile={name:'SECRET-original-filename.jpg',type:'image/jpeg',size:100};let discussionFailure=null,uploadFailure=null,hold=null,resolveHold=null,readHold=null,resolveReadHold=null;
 const adapter={async request(action,payload){calls.push({action,payload:clone(payload || null)});if(action==='state')return clone(state);if(action==='project')return {project:clone(p)};if(action==='grant_image_analysis'){p.imageAnalysisConsent={bindingHash:'hash',acceptedAt:'now'};p.revision++;return {project:clone(p)};}if(action==='select_item'){const item=p.creativeItems.find(i=>i.id===payload.itemId);for(const key of ['phase','lifecycle','brief','goalApprovedAt','summaryRevision','versions','archivedVersionIds','officialVersionId','comparisons','messages','finalizations','references','contextRevision'])p[key]=clone(item[key] ?? null);p.activeItemId=item.id;p.activeItem=item;p.module=item.type;p.revision++;return {project:clone(p)};}if(action==='snapshot'){const v=version('snapshot-'+p.versions.length);v.artifact=clone(payload.artifact);v.items=artifactItems(v.artifact);v.goalAndRationale=payload.goalAndRationale;v.basedOnVersionId=payload.basedOnVersionId;v.source='snapshot';p.versions.push(v);p.activeItem.versions=clone(p.versions);p.revision++;return {project:clone(p)};}if(action==='approve_goal'){p.goalApprovedAt='now';p.phase='ready';p.revision++;return {project:clone(p)};}if(action==='discuss'){if(discussionFailure){const error=discussionFailure;discussionFailure=null;throw error;}p.messages.push({id:'discussion',role:'assistant',kind:'clarification',text:'看圖文字建議'});p.revision++;return {project:clone(p)};}if(action==='compare'){p.revision++;return {project:clone(p)};}throw new Error('Unsupported fixture action: '+action);},
  async uploadImage(payload,blob){uploads.push({payload:clone(payload),blob});if(hold)await hold;if(uploadFailure){const error=uploadFailure;uploadFailure=null;throw error;}const v=version('uploaded-'+uploads.length);v.title=payload.title;v.artifact.title=payload.title;v.artifact.alt=payload.alt;v.artifact.attribution=payload.attribution;v.goalAndRationale=payload.goalAndRationale;v.items=artifactItems(v.artifact);p.versions.push(v);p.activeItem.versions=clone(p.versions);p.creativeItems[0].versions=clone(p.versions);p.revision++;return {project:clone(p),uploadedVersionId:v.id};},
  async readImage(identity){reads.push(clone(identity));if(readHold)await readHold;return new Blob(['png'],{type:'image/png'});}
 };
 const normalizeImage=normalizer || (async(file,options)=>{normalized.push({file,rotation:options.rotation});return {blob:new Blob(['png'],{type:'image/png'}),width:20,height:10};});
 try{const app=await createTitleApp({root,adapter,demo,normalizeImage});await settle();await run({doc,root,app,calls,uploads,reads,normalized,urls,revoked,sourceFile,get project(){return p;},get state(){return state;},setProject(value){p=value;},failDiscussion(error){discussionFailure=error;},failUpload(error){uploadFailure=error;},holdUpload(){hold=new Promise(resolve=>{resolveHold=resolve;});},releaseUpload(){resolveHold?.();hold=null;},holdReads(){readHold=new Promise(resolve=>{resolveReadHold=resolve;});},releaseReads(){resolveReadHold?.();readHold=null;}});}finally{resolveReadHold?.();resolveHold?.();Object.assign(globalThis,originals);}
}
async function selectFile(ctx){const input=ctx.doc.getElementById('image-upload-file');assert.ok(input);assert.equal(input.disabled,false);input.files=[ctx.sourceFile];await input.dispatchEvent('change');await settle();}
async function fillUpload(ctx){await fixtureFill(ctx.doc,'image-upload-title','構圖測試');await fixtureFill(ctx.doc,'image-upload-alt','藍色幾何形狀');await fixtureFill(ctx.doc,'image-upload-attribution','我的作品');await fixtureFill(ctx.doc,'image-upload-goalAndRationale','比較配色與重心，保留原始內容。');}

test('image registry enables external upload but never image generation, fake defaults or source-free metadata snapshots',()=>{
 assert.equal(MODULES.find(m=>m.id==='image').enabled,true);assert.equal(defaultArtifact('image'),null);
 const {p}=projectFixture();p.phase='summary';p.brief={summary:'方向'};p.summaryRevision=0;p.goalApprovedAt='now';assert.equal(canConfirmGenerate(p),false);p.phase='ready';assert.equal(canGenerate(p),false);assert.equal(canSnapshot(p),false);
 assert.equal(validItems(artifactItems(artifact()),'image'),true);assert.equal(versionSourceLabel(version()),'外部上傳 · 非 AI');assert.match(IMAGE_GENERATION_UNAVAILABLE,/尚未開放/);
 const saved=projectFixture({saved:true}).p;assert.equal(canSnapshot(saved,'v1'),true);assert.match(exportProject(saved).imageExportNotice,/未包含 PNG|不含 PNG/);assert.equal(exportProject(p).imageExportNotice,undefined);
});
test('private transport uses POST, CSRF, same-origin cookies and generic filename without original name',async()=>{
 const calls=[],blob=new Blob(['png'],{type:'image/png'}),payload={id:'p',itemId:'i',revision:0,requestId:'a'.repeat(32),title:'作品',alt:'',attribution:'',goalAndRationale:'目標',versionMode:'major',basedOnVersionId:null};
 const media=createMediaAdapter({location:{href:'https://studio.example/public/index.php'},getCsrf:()=> 'csrf-private',fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,status:200,json:async()=>({project:{id:'p',versions:[],comparisons:[]},uploadedVersionId:'v'})};}});
 const result=await media.uploadImage(payload,blob);assert.equal(result.uploadedVersionId,'v');const {url,options}=calls[0];assert.equal(url.href,'https://studio.example/public/media.php');assert.equal(options.method,'POST');assert.equal(options.credentials,'same-origin');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.equal(options.headers['X-CSRF-Token'],'csrf-private');assert.equal(options.headers['Content-Type'],undefined);assert.equal(options.body.get('action'),'upload_image');assert.deepEqual(JSON.parse(options.body.get('payload')),payload);assert.equal(options.body.get('image').name,'normalized.png');
 assert.deepEqual([...options.body.keys()],['action','payload','image']);
});
test('private image reads contain only version ownership identifiers in JSON, never URL asset paths',async()=>{
 let request;const media=createMediaAdapter({location:{href:'https://studio.example/public/'},getCsrf:()=> 'token',fetchImpl:async(url,options)=>{request={url,options};return {ok:true,status:200,headers:new Headers({'Content-Type':'image/png'}),blob:async()=>new Blob(['png'],{type:'image/png'})};}});
 const blob=await media.readImage({id:'private-project',itemId:'source-item',versionId:'v1',assetUrl:'https://bad.example/private'});assert.equal(blob.type,'image/png');assert.equal(request.url.search,'');assert.equal(request.url.href.includes('private-project'),false);assert.deepEqual(JSON.parse(request.options.body),{action:'read_image',id:'private-project',itemId:'source-item',versionId:'v1'});assert.equal(request.options.headers['X-CSRF-Token'],'token');
});
test('media transport rejects cross-origin routes and wrong media responses, and marks uncertain saves without retries',async()=>{
 let calls=0;const cross=createMediaAdapter({base:'https://other.example/media.php',location:{href:'https://studio.example/'},fetchImpl:async()=>{calls++;}});await assert.rejects(()=>cross.readImage({id:'p',itemId:'i',versionId:'v'}),/目前安裝網站/);assert.equal(calls,0);
 const local={location:{href:'https://studio.example/'}};
 const wrong=createMediaAdapter({...local,fetchImpl:async()=>({ok:true,status:200,headers:new Headers({'Content-Type':'text/html'})})});await assert.rejects(()=>wrong.readImage({}),/不是 PNG/);
 const failed=createMediaAdapter({...local,fetchImpl:async()=>{calls++;throw new Error('network');}});await assert.rejects(()=>failed.uploadImage({},new Blob(['png'],{type:'image/png'})),error=>error.uncertain && /不呼叫 AI/.test(error.message));assert.equal(calls,1);
 const rejected=createMediaAdapter({...local,fetchImpl:async()=>({ok:false,status:500,json:async()=>({error:{message:'Rejected',operationOutcome:'rejected'}})})});await assert.rejects(()=>rejected.uploadImage({},new Blob(['png'],{type:'image/png'})),error=>error.uncertain===false);
});
test('API adapter shares the state CSRF with its private image methods',async()=>{
 const originals={location:globalThis.location,fetch:globalThis.fetch};globalThis.location={href:'http://localhost/public/index.php'};const calls=[];
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return url.pathname.endsWith('api.php')?{ok:true,status:200,json:async()=>({csrf:'shared-token'})}:{ok:true,status:200,headers:new Headers({'Content-Type':'image/png'}),blob:async()=>new Blob(['png'],{type:'image/png'})};};
 try{const api=createApiAdapter();await api.request('state');await api.readImage({id:'p',itemId:'i',versionId:'v'});assert.equal(calls[1].options.headers['X-CSRF-Token'],'shared-token');assert.equal(calls[1].url.search,'');}finally{Object.assign(globalThis,originals);}
});
test('empty image workspace offers key-free local upload, no invented asset, and disabled generation',async()=>withApp(async ctx=>{
 assert.equal(ctx.doc.getElementById('image-upload-file').disabled,false);assert.equal(ctx.doc.getElementById('confirm-generate').disabled,true);assert.equal(ctx.root.querySelectorAll('.artifact-image-preview').length,0);assert.equal(ctx.doc.getElementById('save-snapshot').disabled,true);assert.match(ctx.root.textContent,/沒有圖片來源|還沒有圖片來源/);assert.equal(ctx.uploads.length,0);assert.equal(ctx.reads.length,0);assert.deepEqual(ctx.calls.map(c=>c.action),['state','project']);
}));
test('local selection normalizes only in browser, retains metadata through rotation, blocks navigation and cancels safely',async()=>withApp(async ctx=>{
 await selectFile(ctx);assert.equal(ctx.normalized.length,1);assert.equal(ctx.uploads.length,0);assert.equal(ctx.calls.length,2);assert.equal(ctx.doc.getElementById('project-select').disabled,true);assert.equal(ctx.doc.getElementById('save-image-upload').disabled,true);
 await fillUpload(ctx);const rotation=ctx.doc.getElementById('image-upload-rotation');rotation.value='90';await rotation.dispatchEvent('change');await settle();assert.equal(ctx.normalized[1].rotation,90);assert.equal(ctx.doc.getElementById('image-upload-title').value,'構圖測試');assert.equal(ctx.doc.getElementById('image-upload-goalAndRationale').value,'比較配色與重心，保留原始內容。');assert.equal(ctx.uploads.length,0);assert.equal(ctx.root.textContent.includes(ctx.sourceFile.name),false);
 await fixtureClick(ctx.doc,'取消本機圖片副本');assert.ok(ctx.doc.getElementById('image-upload-file'));assert.equal(ctx.doc.getElementById('project-select').disabled,false);assert.equal(ctx.uploads.length,0);
}));
test('explicit save uploads normalized PNG only once despite double click and preserves typed fields',async()=>withApp(async ctx=>{
 await selectFile(ctx);await fillUpload(ctx);ctx.holdUpload();const save=ctx.doc.getElementById('save-image-upload');const first=save.dispatchEvent('click');await settle();await save.dispatchEvent('click');assert.equal(ctx.uploads.length,1);assert.equal(ctx.uploads[0].blob.type,'image/png');assert.equal(ctx.uploads[0].payload.title,'構圖測試');assert.equal(ctx.uploads[0].payload.goalAndRationale,'比較配色與重心，保留原始內容。');assert.match(ctx.uploads[0].payload.requestId,/^[a-f0-9]{32}$/);assert.equal(JSON.stringify(ctx.uploads[0].payload).includes(ctx.sourceFile.name),false);assert.equal(ctx.calls.filter(c=>['discuss','generate','confirm_generate','fuse'].includes(c.action)).length,0);
 ctx.releaseUpload();await first;await settle();assert.equal(ctx.project.versions.length,1);assert.ok(ctx.doc.getElementById('image-upload-file'));assert.equal(ctx.doc.getElementById('editor-goal').value,'比較配色與重心，保留原始內容。');assert.match(ctx.root.textContent,/外部上傳 · 非 AI/);
}));
test('upload uncertainty has no AI fee claim and safely reuses identical request and blob after explicit status check',async()=>withApp(async ctx=>{
 await selectFile(ctx);await fillUpload(ctx);ctx.failUpload(new MediaError('圖片保存狀態未知',0,null,true));await fixtureClick(ctx.doc,'保存圖片為新大版本');const notice=ctx.root.querySelector('.uncertain');assert.match(notice.textContent,/不產生 AI 費用/);assert.doesNotMatch(notice.textContent,/重複計費|可能再次產生費用/);assert.equal(fixtureButton(ctx.doc,'重試同一請求').disabled,true);assert.equal(ctx.doc.getElementById('image-upload-title').value,'構圖測試');
 await fixtureClick(ctx.doc,'檢查最新狀態');await fixtureClick(ctx.doc,'重試同一請求');assert.equal(ctx.uploads.length,2);assert.deepEqual(ctx.uploads[1].payload,ctx.uploads[0].payload);assert.equal(ctx.uploads[1].blob,ctx.uploads[0].blob);assert.equal(ctx.root.querySelector('.uncertain'),null);assert.equal(ctx.project.versions.length,1);
}));
test('rejected stale upload refresh keeps local image metadata and retries with a new request ID',async()=>withApp(async ctx=>{
 await selectFile(ctx);await fillUpload(ctx);ctx.failUpload(new MediaError('版本衝突',409,{error:{operationOutcome:'rejected'}},false));ctx.project.revision=4;await fixtureClick(ctx.doc,'保存圖片為新大版本');assert.equal(ctx.doc.getElementById('image-upload-title').value,'構圖測試');assert.equal(ctx.doc.getElementById('image-upload-goalAndRationale').value,'比較配色與重心，保留原始內容。');assert.equal(ctx.root.querySelector('.uncertain'),null);
 await fixtureClick(ctx.doc,'保存圖片為新大版本');assert.notEqual(ctx.uploads[0].payload.requestId,ctx.uploads[1].payload.requestId);assert.equal(ctx.uploads[1].payload.revision,4);
}));
test('one-time image disclosure grants consent without API key or AI call, and then follows normal setup gate',async()=>withApp(async ctx=>{
 assert.match(imageAnalysisReason(ctx.project),/同意/);await fixtureClick(ctx.doc,'我同意此固定模型接收圖片分析資料');assert.equal(ctx.calls.at(-1).action,'grant_image_analysis');assert.equal(imageAnalysisReason(ctx.project),'');assert.equal(ctx.uploads.length,0);assert.equal(ctx.calls.some(c=>c.action==='discuss'),false);await fixtureFill(ctx.doc,'chat-input','請分析重心');assert.equal(ctx.doc.getElementById('send-chat').disabled,true);
}));
test('image analysis sends through fixed model without a second dialog and never claims pixel revision',async()=>withApp(async ctx=>{
 await fixtureFill(ctx.doc,'chat-input','請分析重心');await fixtureClick(ctx.doc,'送出想法 ↗');assert.equal(ctx.calls.at(-1).action,'discuss');assert.equal(ctx.calls.at(-1).payload.approvedModel,'vision-test');assert.equal(ctx.calls.at(-1).payload.baseVersionId,'v1');assert.equal(ctx.root.querySelectorAll('dialog').length,0);assert.equal(ctx.project.versions.length,1);assert.match(ctx.root.textContent,/不會修改像素/);assert.equal(ctx.doc.getElementById('confirm-generate').disabled,true);
},{saved:true,consent:true,keyPresent:true}));
test('saved image preview uses private source identities, cleans up URLs on rerender and warns metadata export is incomplete',async()=>withApp(async ctx=>{
 assert.equal(ctx.reads.length,1);assert.ok(ctx.reads.every(identity=>identity.id==='project1' && identity.itemId==='image-item' && identity.versionId==='v1'));assert.equal(ctx.urls.length,1);const oldUrls=ctx.urls.map(value=>value.url);await ctx.app.reload();await settle();assert.ok(oldUrls.every(url=>ctx.revoked.includes(url)));assert.match(ctx.root.textContent,/JSON 僅.*中繼資料/);assert.equal(fixtureButton(ctx.doc,'下載本版 PNG').disabled,false);
},{saved:true}));
test('pinned image references read the source item/version, not the active text item',async()=>withApp(async ctx=>{
 const p=clone(ctx.project),source=clone(p.creativeItems[0]);const textItem={...clone(source),id:'text-item',type:'titles',title:'標題項目',versions:[],officialVersionId:null,references:[{id:'ref',targetItemId:'image-item',versionId:'v1',versionSnapshot:version()}]};p.creativeItems=[source,textItem];p.activeItem=textItem;p.activeItemId=textItem.id;p.module='titles';for(const key of ['versions','officialVersionId','references'])p[key]=textItem[key];ctx.setProject(p);ctx.reads.length=0;await ctx.app.reload();await settle();assert.equal(ctx.reads.length,0);await fixtureClick(ctx.doc,'載入此圖片預覽');assert.equal(ctx.reads.length,1);assert.ok(ctx.reads.every(identity=>identity.itemId==='image-item' && identity.versionId==='v1'));assert.match(ctx.root.textContent,/只收到固定圖片的中繼資料/);assert.equal(ctx.doc.getElementById('image-analysis-heading'),null);assert.equal(imageAnalysisReason(p),'');
},{saved:true}));
test('image demo remains unavailable with no private reads, uploads or normalization',async()=>withApp(async ctx=>{
 assert.match(ctx.root.textContent,/圖片腳本示範尚未提供/);assert.equal(ctx.doc.getElementById('image-upload-file'),null);assert.equal(ctx.uploads.length,0);assert.equal(ctx.reads.length,0);assert.equal(ctx.normalized.length,0);
},{saved:true,demo:true}));
test('cross-tab active-item conflict preserves original upload and requires explicit server-side return',async()=>withApp(async ctx=>{
 await selectFile(ctx);await fillUpload(ctx);const p=clone(ctx.project),other={...clone(p.creativeItems[0]),id:'other-item',type:'titles',title:'其他項目'};p.creativeItems.push(other);p.activeItem=other;p.activeItemId=other.id;p.module='titles';p.revision=8;ctx.setProject(p);ctx.failUpload(new MediaError('目前項目已變更',409,{error:{operationOutcome:'rejected'}},false));
 await fixtureClick(ctx.doc,'保存圖片為新大版本');assert.equal(ctx.app.getProject().activeItemId,'other-item');assert.ok(ctx.root.querySelector('.image-upload-return'));assert.equal(ctx.doc.getElementById('image-upload-title'),null);assert.equal(ctx.calls.some(call=>call.action==='select_item'),false);
 await fixtureClick(ctx.doc,'回到原圖片項目繼續上傳');assert.equal(ctx.calls.at(-1).action,'select_item');assert.deepEqual(ctx.calls.at(-1).payload,{id:'project1',revision:8,itemId:'image-item'});assert.equal(ctx.doc.getElementById('image-upload-title').value,'構圖測試');assert.equal(ctx.doc.getElementById('image-upload-goalAndRationale').value,'比較配色與重心，保留原始內容。');assert.equal(ctx.app.getProject().activeItemId,'image-item');
 await fixtureClick(ctx.doc,'保存圖片為新大版本');assert.equal(ctx.uploads.at(-1).payload.itemId,'image-item');assert.equal(ctx.uploads.at(-1).payload.revision,9);
}));
test('pending image metadata must be explicitly applied before snapshot and never changes the saved asset',async()=>withApp(async ctx=>{
 const original=clone(ctx.project.versions[0].artifact),editor=ctx.root.querySelector('.artifact-image-editor'),title=editor.querySelectorAll('textarea')[0];title.value='文字名稱調整';await title.dispatchEvent('input');assert.equal(ctx.doc.getElementById('save-snapshot').disabled,true);assert.equal(ctx.calls.some(c=>c.action==='snapshot'),false);
 await fixtureClick(ctx.doc,'套用圖片文字至草稿');assert.equal(ctx.doc.getElementById('save-snapshot').disabled,false);await fixtureClick(ctx.doc,'另存新版本 V2');const call=ctx.calls.find(c=>c.action==='snapshot');assert.ok(call);assert.equal(call.payload.artifact.title,'文字名稱調整');assert.deepEqual(call.payload.artifact.asset,original.asset);assert.equal(call.payload.basedOnVersionId,'v1');assert.deepEqual(ctx.project.versions[0].artifact,original);assert.equal(ctx.uploads.length,0);
},{saved:true}));
test('selected image versions allow comparison only after consent, while fusion remains unavailable',async()=>withApp(async ctx=>{
 const p=clone(ctx.project),second=version('v2');second.major=2;second.number=2;p.versions.push(second);p.activeItem.versions=clone(p.versions);p.creativeItems[0].versions=clone(p.versions);ctx.setProject(p);await ctx.app.reload();
 const choices=ctx.root.querySelectorAll('input').filter(input=>(input.getAttribute('aria-label') || '').startsWith('選取 '));choices[0].checked=true;await choices[0].dispatchEvent('change');const v2=ctx.root.querySelectorAll('input').find(input=>(input.getAttribute('aria-label') || '').startsWith('選取 V2'));v2.checked=true;await v2.dispatchEvent('change');assert.equal(ctx.doc.getElementById('compare-versions').disabled,true);assert.equal(ctx.doc.getElementById('fuse-versions').disabled,true);
 await fixtureClick(ctx.doc,'我同意此固定模型接收圖片分析資料');assert.equal(ctx.doc.getElementById('compare-versions').disabled,false);assert.equal(ctx.doc.getElementById('fuse-versions').disabled,true);await fixtureClick(ctx.doc,'請 AI 提供比較意見 ↗');assert.equal(ctx.calls.at(-1).action,'compare');assert.deepEqual(ctx.calls.at(-1).payload.versionIds,['v1','v2']);assert.equal(ctx.calls.some(c=>c.action==='fuse'),false);
},{saved:true,keyPresent:true}));
test('cancelled normalization cannot restore a discarded local image or overwrite new metadata',async()=>{
 let finish;const pending=new Promise(resolve=>{finish=resolve;});await withApp(async ctx=>{
 const input=ctx.doc.getElementById('image-upload-file');input.files=[ctx.sourceFile];await input.dispatchEvent('change');assert.match(ctx.doc.getElementById('image-upload-status').textContent,/正在本機/);await fixtureClick(ctx.doc,'取消本機圖片副本');finish({blob:new Blob(['png'],{type:'image/png'}),width:20,height:10});await settle();assert.ok(ctx.doc.getElementById('image-upload-file'));assert.equal(ctx.doc.getElementById('save-image-upload'),null);assert.equal(ctx.uploads.length,0);
 },{normalizer:()=>pending});
});
test('malformed successful upload response is uncertain rather than permission to duplicate save',async()=>{
 const media=createMediaAdapter({location:{href:'https://studio.example/'},fetchImpl:async()=>({ok:true,status:200,json:async()=>({project:{id:'wrong'},uploadedVersionId:'v'})})});await assert.rejects(()=>media.uploadImage({id:'correct'},new Blob(['png'],{type:'image/png'})),error=>error.uncertain===true);
});
test('detached upload controls cannot start, save, or replace a later pending draft',async()=>withApp(async ctx=>{
 const oldFile=ctx.doc.getElementById('image-upload-file');await ctx.app.reload();oldFile.files=[ctx.sourceFile];await oldFile.dispatchEvent('change');await settle();assert.equal(ctx.normalized.length,0);
 await selectFile(ctx);await fillUpload(ctx);const oldSave=ctx.doc.getElementById('save-image-upload');await fixtureClick(ctx.doc,'取消本機圖片副本');await selectFile(ctx);await fillUpload(ctx);await oldSave.dispatchEvent('click');await settle();assert.equal(ctx.uploads.length,0);assert.ok(ctx.doc.getElementById('save-image-upload'));
}));
test('image goal approval is explicit and never bundled with unavailable generation or AI calls',async()=>withApp(async ctx=>{
 const p=clone(ctx.project);p.brief={summary:'以藍色建立視覺重心'};p.phase='summary';p.summaryRevision=p.revision;ctx.setProject(p);await ctx.app.reload();assert.equal(ctx.doc.getElementById('approve-image-goal').disabled,false);assert.equal(ctx.doc.getElementById('confirm-generate').disabled,true);
 await fixtureClick(ctx.doc,'確認圖片方向（不生成圖片）');assert.equal(ctx.calls.at(-1).action,'approve_goal');assert.equal(ctx.calls.some(call=>['confirm_generate','generate','discuss'].includes(call.action)),false);assert.equal(ctx.project.goalApprovedAt,'now');
}));
test('private image transport bounds both uploads and downloads to 4 MiB and rejects oversized headers before reading bytes',async()=>{
 const huge=new Blob([new Uint8Array(4194305)],{type:'image/png'});let sent=0,read=0;
 const media=createMediaAdapter({location:{href:'https://studio.example/'},fetchImpl:async()=>{sent++;return {ok:true,status:200,headers:new Headers({'Content-Type':'image/png','Content-Length':'4194305'}),blob:async()=>{read++;return huge;}};}});
 await assert.rejects(()=>media.uploadImage({id:'p'},huge),/有效的 PNG/);assert.equal(sent,0);await assert.rejects(()=>media.readImage({id:'p',itemId:'i',versionId:'v'}),/超過 4 MiB/);assert.equal(read,0);
 const hiddenSize=createMediaAdapter({location:{href:'https://studio.example/'},fetchImpl:async()=>({ok:true,status:200,headers:new Headers({'Content-Type':'image/png'}),blob:async()=>huge})});await assert.rejects(()=>hiddenSize.readImage({id:'p',itemId:'i',versionId:'v'}),/不完整/);
});
test('sixty collapsed image versions load only the top official PNG until one exact preview is requested',async()=>withApp(async ctx=>{
 const p=clone(ctx.project);p.versions=Array.from({length:60},(_,index)=>{const v=version('v'+(index+1));v.major=index+1;v.number=index+1;return v;});p.activeItem.versions=clone(p.versions);p.creativeItems[0].versions=clone(p.versions);ctx.setProject(p);ctx.reads.length=0;await ctx.app.reload();await settle();
 assert.equal(ctx.root.querySelectorAll('.version-content-details').length,60);assert.ok(ctx.root.querySelectorAll('.version-content-details').every(details=>!details.open));assert.deepEqual(ctx.reads,[{id:'project1',itemId:'image-item',versionId:'v1'}]);
 const target=ctx.doc.getElementById('version-v42'),load=target.querySelectorAll('button').find(node=>node.textContent==='載入此圖片預覽');assert.ok(load);target.querySelector('.version-content-details').open=true;target.closest('details').open=true;await settle();assert.equal(ctx.reads.length,1,'opening details alone must not fetch PNG bytes');await load.dispatchEvent('click');await load.dispatchEvent('click');await settle();assert.equal(ctx.reads.length,2);assert.deepEqual(ctx.reads[1],{id:'project1',itemId:'image-item',versionId:'v42'});assert.equal(load.disabled,true);assert.equal(ctx.calls.some(call=>['discuss','generate','compare'].includes(call.action)),false);
},{saved:true}));
test('requested lazy preview ignores late bytes after rerender and stale load controls never refetch',async()=>withApp(async ctx=>{
 const lazy=ctx.root.querySelector('.tree-version').querySelectorAll('button').find(node=>node.textContent==='載入此圖片預覽');const before=ctx.urls.length;ctx.holdReads();await lazy.dispatchEvent('click');await settle();assert.equal(ctx.reads.length,2);
 await ctx.app.reload();await settle();const afterReloadReads=ctx.reads.length;await lazy.dispatchEvent('click');assert.equal(ctx.reads.length,afterReloadReads);ctx.releaseReads();await settle();assert.equal(ctx.urls.length,before+1,'only the newly mounted official preview may create a URL');assert.equal(ctx.root.querySelectorAll('.image-preview-image').length,1);
},{saved:true}));
test('image history with no official version reads zero PNGs until explicitly requested',async()=>withApp(async ctx=>{
 const p=clone(ctx.project);p.officialVersionId=null;p.activeItem.officialVersionId=null;p.creativeItems[0].officialVersionId=null;ctx.setProject(p);ctx.reads.length=0;await ctx.app.reload();await settle();assert.equal(ctx.reads.length,0);await fixtureClick(ctx.doc,'載入此圖片預覽');assert.deepEqual(ctx.reads,[{id:'project1',itemId:'image-item',versionId:'v1'}]);
},{saved:true}));
test('comparison duplicates and project-finalization image snapshots remain lazy beside the top official preview',async()=>withApp(async ctx=>{
 const p=clone(ctx.project),second=version('v2');second.major=2;p.versions.push(second);p.activeItem.versions=clone(p.versions);p.creativeItems[0].versions=clone(p.versions);p.comparisons=[{id:'comparison1',versionIds:['v1','v2'],summary:'固定測試比較',items:[{versionId:'v1',fit:'一',strength:'一',tradeoff:'一',suggestion:'一'},{versionId:'v2',fit:'二',strength:'二',tradeoff:'二',suggestion:'二'}],createdAt:'2026-10-21T12:00:00Z',goalBasis:'version_snapshots',versionGoalSnapshots:[]}];p.projectFinalizations=[{at:'2026-10-21T12:00:00Z',items:[{itemId:'image-item',itemTitle:'歷史圖片',versionSnapshot:version()}]}];ctx.setProject(p);ctx.reads.length=0;await ctx.app.reload();await settle();assert.deepEqual(ctx.reads,[{id:'project1',itemId:'image-item',versionId:'v1'}]);assert.equal(ctx.root.querySelectorAll('.comparison-item').length,2);assert.ok(ctx.root.querySelectorAll('button').filter(button=>button.textContent==='載入此圖片預覽').length>=5);
},{saved:true}));
test('image preflight resource rejection is known uncalled and never claims possible AI fees or uncertainty',async()=>withApp(async ctx=>{
 ctx.failDiscussion(new ApiError('尚未傳送圖片；請縮小圖片後再試。',503,{error:{code:'IMAGE_RESOURCE_LIMIT',operationOutcome:'rejected'}},false));await fixtureFill(ctx.doc,'chat-input','請分析重心');await fixtureClick(ctx.doc,'送出想法 ↗');const error=ctx.root.querySelector('.error');assert.match(error.textContent,/尚未傳送圖片.*請縮小圖片/);assert.doesNotMatch(error.textContent,/可能已計費|可能再次產生費用/);assert.equal(ctx.root.querySelector('.uncertain'),null);assert.equal(ctx.calls.filter(call=>call.action==='discuss').length,1);assert.equal(ctx.doc.getElementById('chat-input').value,'請分析重心');
},{saved:true,consent:true,keyPresent:true}));
test('other rejected upstream 503 errors retain conservative possible-fee wording',async()=>withApp(async ctx=>{
 ctx.failDiscussion(new ApiError('上游服務失敗。',503,{error:{code:'OPENAI_HTTP_ERROR',operationOutcome:'rejected'}},false));await fixtureFill(ctx.doc,'chat-input','請分析重心');await fixtureClick(ctx.doc,'送出想法 ↗');assert.match(ctx.root.querySelector('.error').textContent,/可能已計費/);assert.equal(ctx.root.querySelector('.uncertain'),null);
},{saved:true,consent:true,keyPresent:true}));
