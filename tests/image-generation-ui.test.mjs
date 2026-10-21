// Actual API adapter + DOM event integration. All HTTP is mocked; no credentials or paid API calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createTitleApp,createApiAdapter,exportProject,versionSourceLabel} from '../public/app.js';
import {artifactItems} from '../public/artifacts.js';
import {chatMembers,imageMembers,projectImageMember,imageGenerationSetupReason,imageGenerationPayloadError,currentImageGenerationReferences,IMAGE_GENERATION_MODELS,IMAGE_GENERATION_NOTICE} from '../public/image-generation.js';
const clone=value=>structuredClone(value);
const id=n=>n.toString(16).padStart(32,'0');
const artifact=(n=1)=>({kind:'image',title:'圖片 '+n,alt:'藍色形狀',attribution:'已保存來源',asset:{id:id(n),mime:'image/png',width:20,height:10,byteLength:3,sha256:'b'.repeat(64),normalization:'png-v1'}});
const version=(n=1)=>({id:id(n),number:n,major:n,minor:0,title:'圖片 '+n,contentType:'image',artifact:artifact(n),items:artifactItems(artifact(n)),goalAndRationale:'原版構圖目標 '+n,goalSource:'user',source:'external_upload',createdAt:'2026-10-21T12:00:00Z',messageId:id(n+500),basedOnVersionId:null});
function fixture({bound=true,approved=true,saved=2,empty=false,keyPresent=true}={}){
 const chat={id:id(101),nickname:'固定對談',enabled:true,provider:'openai',model:'chat-vision-fixture',ollamaUrl:''},image={id:id(102),nickname:'固定圖片',enabled:true,provider:'openai',model:IMAGE_GENERATION_MODELS[0],ollamaUrl:''},other={...chat,id:id(103),nickname:'另一個對談',model:'other-chat'};
 const binding=m=>({memberId:m.id,memberNickname:m.nickname,provider:m.provider,model:m.model,ollamaUrl:m.ollamaUrl,boundAt:'now'});
 const item={id:id(200),type:'image',title:'圖片創作項目',description:'構圖練習',enabled:true,archived:false,lifecycle:'in_progress',phase:approved?'ready':'summary',versions:Array.from({length:saved},(_,n)=>version(n+1)),messages:[],comparisons:[],references:[{id:id(301),targetItemId:id(201),versionId:id(3),versionSnapshot:version(3)},{id:id(302),targetItemId:id(201),versionId:id(4),versionSnapshot:version(4)}],archivedVersionIds:[],officialVersionId:saved?id(1):null,brief:{summary:'藍色構圖',purpose:'練習',audience:'自己',message:'形狀',tone:'簡潔',constraints:'清楚'},goalApprovedAt:approved?'now':null,summaryRevision:0,contextRevision:0,finalizations:[]};
 const p={...clone(item),id:id(1000),title:'共創圖片專案',description:'私人內容',projectLifecycle:'in_progress',activeItemId:item.id,sharedContextRevision:0,revision:0,aiBinding:binding(chat),imageBinding:bound?binding(image):null,imageGenerationConsent:bound?{bindingHash:'saved-hash',acceptedAt:'now'}:null,imageAnalysisConsent:{bindingHash:'chat-hash',acceptedAt:'now'},creativeItems:[item],activeItem:item,module:'image'};
 return {p,state:{projects:empty?[]:[{id:p.id,title:p.title,lifecycle:p.projectLifecycle}],csrf:'fixture-csrf',members:[chat,image,other],imageGenerationModels:[...IMAGE_GENERATION_MODELS],activeMemberId:other.id,usageConsent:true,keyPresent,settingsRevision:7,keyRevision:4},chat,image,other};
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

async function fill(ctx,key,value){await fixtureFill(ctx.doc,'image-generation-'+key,value);}
async function choose(ctx,key,value){const input=ctx.doc.getElementById(key);assert.ok(input,key);input.value=value;await input.dispatchEvent('change');await settle();}
async function check(ctx,key,checked=true){const input=ctx.doc.getElementById(key);assert.ok(input,key);input.checked=checked;await input.dispatchEvent('change');await settle();}
async function clickId(ctx,id){const button=ctx.doc.getElementById(id);assert.ok(button,id);assert.equal(button.disabled,false,id+' enabled');void button.dispatchEvent('click');await settle();}
async function fillGeneration(ctx){await fill(ctx,'instruction','保留構圖，調整藍色層次');await fill(ctx,'title','新的圖片候選');await fill(ctx,'alt','藍色幾何圖形');await fill(ctx,'goalAndRationale','強化主體，並保留來源的留白。');}
async function selectVersion(ctx,n){const input=ctx.root.querySelectorAll('input').find(node=>(node.getAttribute('aria-label') || '').startsWith('選取 V'+n+' '));assert.ok(input);input.checked=true;await input.dispatchEvent('change');await settle();}
async function withApp(run,options={}){
 const originals={document:globalThis.document,addEventListener:globalThis.addEventListener,setTimeout:globalThis.setTimeout,location:globalThis.location,fetch:globalThis.fetch};
 const {doc,root}=fixtureDocument();const data=fixture(options);let {p,state}=data;let failure=null,hold=null,release=null;const calls=[],paid=[],events={};
 doc.defaultView={Blob,URL:{createObjectURL(){return 'blob:fixture';},revokeObjectURL(){}}};globalThis.document=doc;globalThis.location={href:'https://studio.example/public/index.php'};globalThis.addEventListener=(name,handler)=>{events[name]=handler;};globalThis.setTimeout=(handler,delay,...args)=>{const timer=originals.setTimeout(handler,delay,...args);timer.unref?.();return timer;};
 globalThis.fetch=async(url,request)=>{
  const action=url.searchParams.get('action');if(url.pathname.endsWith('media.php'))return {ok:true,status:200,headers:new Headers({'Content-Type':'image/png'}),blob:async()=>new Blob(['png'],{type:'image/png'})};
  const payload=request.body?JSON.parse(request.body):null;calls.push({action,payload:clone(payload),request});
  if(payload){assert.equal(request.method,'POST');assert.equal(request.credentials,'same-origin');assert.equal(request.cache,'no-store');assert.equal(request.redirect,'error');assert.equal(request.headers['X-CSRF-Token'],'fixture-csrf');assert.equal(payload.action,action);}
  const response=body=>({ok:true,status:200,json:async()=>clone(body)});
  if(action==='state')return response(state);if(action==='project')return response({project:p});
  if(action==='new'){
   const selected=state.members.find(m=>m.id===payload.memberId);if(selected)p.aiBinding={...p.aiBinding,memberId:selected.id,memberNickname:selected.nickname,provider:selected.provider,model:selected.model};
   const image=state.members.find(m=>m.id===payload.imageMemberId);p.imageBinding=image?{memberId:image.id,memberNickname:image.nickname,provider:image.provider,model:image.model,ollamaUrl:'',boundAt:'now'}:null;p.imageGenerationConsent=image?{bindingHash:'new',acceptedAt:'now'}:null;return response({project:p});
  }
  if(action==='bind_project_image_model'){const image=state.members.find(m=>m.id===payload.imageMemberId);p.imageBinding={memberId:image.id,memberNickname:image.nickname,provider:image.provider,model:image.model,ollamaUrl:'',boundAt:'now'};p.imageGenerationConsent={bindingHash:'legacy',acceptedAt:'now'};p.revision++;return response({project:p});}
  if(action==='approve_goal'){p.goalApprovedAt='now';p.phase='ready';p.activeItem.goalApprovedAt='now';p.revision++;return response({project:p});}
  if(action==='generate_image'){
   paid.push(clone(payload));if(hold)await hold;
   if(failure){const next=failure;failure=null;if(next.network)throw new TypeError('mock network drop');if(next.success)return response(next.success);return {ok:false,status:next.status || 502,json:async()=>clone(next.body)};}
   const existing=[...p.versions,...p.creativeItems.flatMap(item=>item.versions || [])].find(v=>v.generationMetadata?.requestId===payload.requestId);if(existing)return response({project:p,generatedVersionId:existing.id});
   const n=p.versions.length+10,v=version(n);v.source='image_'+(payload.mode==='generate'?'generated':payload.mode==='revise'?'revision':'fusion');v.title=payload.title;v.artifact.title=payload.title;v.goalAndRationale=payload.goalAndRationale;v.provenance={provider:'openai',requestedModel:payload.approvedModel,actualModel:null,memberNickname:p.imageBinding.memberNickname};v.generationMetadata={requestId:payload.requestId};
   if(payload.mode==='revise'){v.basedOnVersionId=payload.sourceVersionIds[0];v.major=p.versions.find(source=>source.id===v.basedOnVersionId)?.major || 1;v.minor=1;}if(payload.mode==='fuse')v.fusionSourceVersionIds=payload.sourceVersionIds;
   p.versions.push(v);p.activeItem.versions=clone(p.versions);p.creativeItems.find(item=>item.id===p.activeItemId).versions=clone(p.versions);p.revision++;return response({project:p,generatedVersionId:v.id});
  }
  if(action==='discuss'){p.messages.push({id:id(999),kind:'discussion',role:'assistant',text:'只有看圖文字建議'});p.revision++;return response({project:p});}
  throw new Error('Unexpected mock action '+action);
 };
 try{const app=await createTitleApp({root,adapter:createApiAdapter()});await settle();await run({doc,root,app,calls,paid,events,...data,get project(){return p;},get state(){return state;},fail(next){failure=next;},hold(){hold=new Promise(resolve=>{release=resolve;});},release(){release?.();hold=null;}});}finally{release?.();Object.assign(globalThis,originals);}
}

test('model choices distinguish supported image-only IDs from chat without inventing account members',()=>{
 const {p,state,image}=fixture();state.members.push({...image,id:'disabled',enabled:false},{...image,id:'ollama',provider:'ollama'},{...image,id:'old',model:'gpt-image-1'},{...image,id:'retired',model:'dall-e-3'},{...image,id:'chatgpt-image',model:'chatgpt-image-latest'});
 assert.deepEqual(chatMembers(state).map(m=>m.model),['chat-vision-fixture','other-chat','gpt-image-2']);assert.deepEqual(imageMembers(state).map(m=>m.id),[image.id]);assert.deepEqual(imageMembers({...state,imageGenerationModels:[]}),[]);assert.equal(chatMembers({members:[{...image,provider:'ollama'}]}).length,1);assert.deepEqual(imageMembers({imageGenerationModels:IMAGE_GENERATION_MODELS,members:[]}),[]);
 assert.equal(projectImageMember(state,p).model,IMAGE_GENERATION_MODELS[0]);state.members[1].nickname='後來改的名字';assert.equal(projectImageMember(state,p).nickname,'固定圖片');
 for(const change of [{enabled:false},{provider:'ollama'},{model:IMAGE_GENERATION_MODELS[1]},{ollamaUrl:'http://localhost:11434'}]){const changed=clone(state);Object.assign(changed.members[1],change);assert.equal(projectImageMember(changed,p),null);assert.match(imageGenerationSetupReason(changed,p),/不會自動改用/);}
 assert.match(IMAGE_GENERATION_NOTICE,/另外計費/);assert.match(IMAGE_GENERATION_NOTICE,/已計費但未成功保存/);assert.match(IMAGE_GENERATION_NOTICE,/不自動重試/);
});
test('strict request helper rejects implicit sources, unselected current-reference substitution and oversized text',()=>{
 const {p}=fixture(),payload={mode:'generate',sourceVersionIds:[],references:[],instruction:'',title:'新圖',alt:'',goalAndRationale:'目標'};
 assert.equal(imageGenerationPayloadError(p,payload),'');assert.match(imageGenerationPayloadError(p,{...payload,mode:'revise'}),/明確選擇/);assert.match(imageGenerationPayloadError(p,{...payload,mode:'fuse',sourceVersionIds:[id(1)]}),/2–5/);assert.match(imageGenerationPayloadError(p,{...payload,mode:'revise',sourceVersionIds:[id(1)]}),/圖片指示/);
 assert.match(imageGenerationPayloadError(p,{...payload,title:'中'.repeat(201)}),/600/);assert.match(imageGenerationPayloadError(p,{...payload,title:'\ud800'}),/不合法文字/);assert.match(imageGenerationPayloadError(p,{...payload,instruction:'x'.repeat(4001)}),/4,000/);assert.match(imageGenerationPayloadError(p,{...payload,references:[{referenceId:'missing',role:'general'}]}),/引用/);assert.match(imageGenerationPayloadError(p,{...payload,references:[{referenceId:id(301),role:'pixels'}]}),/引用/);
 p.activeItem.references.push(clone(p.activeItem.references[0]));assert.equal(currentImageGenerationReferences(p).some(ref=>ref.id===id(301)),false);
});
test('new-project setup never defaults an image model, filters chat choices and requires explicit image consent',async()=>withApp(async ctx=>{
 await fixtureClick(ctx.doc,'建立第一個專案');await fixtureFill(ctx.doc,'project-name','雙模型專案');const chat=ctx.doc.getElementById('project-member'),image=ctx.doc.getElementById('project-image-member');assert.equal(chat.value,'');assert.equal(image.value,'');assert.equal(chat.children.some(option=>option.value===ctx.image.id),false);assert.equal(image.children.some(option=>option.value===ctx.chat.id),false);
 await choose(ctx,'project-member',ctx.chat.id);await choose(ctx,'project-image-member',ctx.image.id);await fixtureClick(ctx.doc,'建立專案');assert.equal(ctx.calls.some(call=>call.action==='new'),false);assert.equal(ctx.doc.getElementById('project-image-consent').checked,false);
 await check(ctx,'project-image-consent');await fixtureClick(ctx.doc,'建立專案');const saved=ctx.calls.find(call=>call.action==='new').payload;assert.equal(saved.memberId,ctx.chat.id);assert.equal(saved.imageMemberId,ctx.image.id);assert.equal(saved.imageUsageConsent,true);assert.equal(saved.expectedSettingsRevision,7);assert.equal(ctx.paid.length,0);assert.equal(ctx.doc.body.querySelectorAll('dialog').length,0);
},{empty:true,bound:false}));
test('new project permits no image binding and sends no inferred image choice or paid call',async()=>withApp(async ctx=>{
 await fixtureClick(ctx.doc,'建立第一個專案');await fixtureFill(ctx.doc,'project-name','只有對談');await choose(ctx,'project-member',ctx.chat.id);await fixtureClick(ctx.doc,'建立專案');const payload=ctx.calls.find(call=>call.action==='new').payload;assert.equal(payload.imageMemberId,null);assert.equal(payload.imageUsageConsent,false);assert.equal(ctx.paid.length,0);
},{empty:true,bound:false}));
test('legacy image binding is an explicit one-time nonpaid action that preserves fixed chat and historical identity',async()=>withApp(async ctx=>{
 const original=clone(ctx.project.aiBinding);assert.equal(ctx.doc.getElementById('bind-project-image-member').value,'');assert.equal(ctx.doc.getElementById('bind-project-image-model').disabled,true);
 await choose(ctx,'bind-project-image-member',ctx.image.id);await check(ctx,'bind-project-image-consent');await clickId(ctx,'bind-project-image-model');const payload=ctx.calls.find(c=>c.action==='bind_project_image_model').payload;assert.equal(payload.imageMemberId,ctx.image.id);assert.equal(payload.imageUsageConsent,true);assert.equal(payload.expectedSettingsRevision,7);assert.deepEqual(ctx.project.aiBinding,original);assert.equal(ctx.paid.length,0);assert.equal(ctx.doc.getElementById('bind-project-image-member'),null);assert.equal(ctx.doc.getElementById('generate-image').disabled,true);
},{bound:false,keyPresent:false}));
test('explicit goal approval does not generate; a later click spends through fixed image binding only',async()=>withApp(async ctx=>{
 await fillGeneration(ctx);assert.equal(ctx.doc.getElementById('generate-image').disabled,true);assert.equal(ctx.paid.length,0);await clickId(ctx,'approve-image-goal');assert.equal(ctx.paid.length,0);assert.equal(ctx.doc.getElementById('generate-image').disabled,false);
 await check(ctx,'image-generation-reference-'+id(301));await choose(ctx,'image-generation-role-'+id(301),'palette');const official=ctx.project.officialVersionId;await clickId(ctx,'generate-image');assert.equal(ctx.paid.length,1);const payload=ctx.paid[0];assert.equal(payload.mode,'generate');assert.deepEqual(payload.sourceVersionIds,[]);assert.deepEqual(payload.references,[{referenceId:id(301),role:'palette'}]);assert.equal(payload.approvedMemberId,ctx.image.id);assert.equal(payload.approvedProvider,'openai');assert.equal(payload.approvedModel,IMAGE_GENERATION_MODELS[0]);assert.equal(payload.approvedSettingsRevision,7);assert.equal(payload.approvedKeyRevision,4);assert.equal(payload.consent,true);assert.equal(payload.revision,1);assert.match(payload.requestId,/^[a-f0-9]{32}$/);assert.equal(payload.itemId,id(200));assert.equal(ctx.project.officialVersionId,official);assert.equal(ctx.project.projectLifecycle,'in_progress');assert.equal(ctx.doc.body.querySelectorAll('dialog').length,0);assert.equal(ctx.project.versions.at(-1).source,'image_generated');assert.match(ctx.root.textContent,/AI 圖片生成候選/);assert.match(ctx.root.textContent,/實際模型未回報/);assert.equal(ctx.root.querySelectorAll('.image-preview-origin').filter(node=>node.textContent.includes('AI 圖片生成')).length,1);
 const exported=exportProject(ctx.project).project;assert.deepEqual(exported.imageBinding,ctx.project.imageBinding);assert.deepEqual(exported.imageGenerationConsent,ctx.project.imageGenerationConsent);assert.equal(exported.keyRevision,undefined);
},{approved:false}));
test('revise and fuse use only explicit saved sources, require instructions and do not restart goal approval',async()=>withApp(async ctx=>{
 await fillGeneration(ctx);await choose(ctx,'image-generation-source',id(2));await fill(ctx,'instruction','');assert.equal(ctx.doc.getElementById('revise-image').disabled,true);await fill(ctx,'instruction','保留構圖但變更配色');assert.equal(ctx.doc.getElementById('revise-image').disabled,false);await clickId(ctx,'revise-image');assert.equal(ctx.paid[0].mode,'revise');assert.deepEqual(ctx.paid[0].sourceVersionIds,[id(2)]);assert.deepEqual(ctx.paid[0].references,[]);assert.equal(ctx.project.goalApprovedAt,null);
 await selectVersion(ctx,1);await selectVersion(ctx,2);await clickId(ctx,'fuse-image');assert.equal(ctx.paid[1].mode,'fuse');assert.deepEqual(ctx.paid[1].sourceVersionIds,[id(1),id(2)]);assert.equal(ctx.calls.some(c=>['approve_goal','fuse','generate','confirm_generate'].includes(c.action)),false);assert.equal(ctx.project.officialVersionId,id(1));assert.match(versionSourceLabel(ctx.project.versions.at(-1)),/AI 圖片融合候選/);
},{approved:false}));
test('local form changes make no paid call, preserve fields across reload and stale references block instead of substitute',async()=>withApp(async ctx=>{
 await fillGeneration(ctx);await check(ctx,'image-generation-reference-'+id(301));assert.equal(ctx.paid.length,0);ctx.project.activeItem.references=ctx.project.activeItem.references.filter(ref=>ref.id!==id(301));await ctx.app.reload();assert.equal(ctx.doc.getElementById('image-generation-title').value,'新的圖片候選');assert.equal(ctx.doc.getElementById('generate-image').disabled,true);assert.match(ctx.root.textContent,/先前選取的引用已移除/);await fixtureClick(ctx.doc,'清除本次圖片參考選取');assert.equal(ctx.doc.getElementById('generate-image').disabled,false);await clickId(ctx,'generate-image');assert.deepEqual(ctx.paid[0].references,[]);
}));
test('manual metadata and unsent chat drafts block pixel calls without losing either draft',async()=>withApp(async ctx=>{
 await fillGeneration(ctx);await fixtureFill(ctx.doc,'chat-input','尚未送出的對談');assert.equal(ctx.doc.getElementById('generate-image').disabled,true);await ctx.doc.getElementById('generate-image').dispatchEvent('click');assert.equal(ctx.paid.length,0);await fixtureFill(ctx.doc,'chat-input','');assert.equal(ctx.doc.getElementById('generate-image').disabled,false);
 const editor=ctx.root.querySelector('.artifact-image-editor'),title=editor.querySelectorAll('textarea')[0];title.value='尚未保存的標題';await title.dispatchEvent('input');assert.equal(ctx.doc.getElementById('generate-image').disabled,true);await ctx.doc.getElementById('generate-image').dispatchEvent('click');assert.equal(ctx.paid.length,0);assert.equal(ctx.doc.getElementById('image-generation-title').value,'新的圖片候選');assert.equal(title.value,'尚未保存的標題');
}));
test('busy and detached image controls cannot duplicate or later execute a paid request',async()=>withApp(async ctx=>{
 await fillGeneration(ctx);const old=ctx.doc.getElementById('generate-image');await ctx.app.reload();await old.dispatchEvent('click');assert.equal(ctx.paid.length,0);ctx.hold();const button=ctx.doc.getElementById('generate-image');const running=button.dispatchEvent('click');await settle();assert.equal(ctx.paid.length,1);await button.dispatchEvent('click');assert.equal(ctx.paid.length,1);assert.equal(ctx.doc.getElementById('revise-image').disabled,true);ctx.release();await running;await settle();assert.equal(ctx.paid.length,1);
}));
for(const [name,failure] of [['network',{network:true}],['unknown outcome',{body:{error:{message:'保存結果未知',operationOutcome:'unknown'}}}],['malformed success',{success:{project:{id:id(1000)},generatedVersionId:id(999)}}]])test('image '+name+' stays blocked with zero auto retry; explicit status check reuses exact paid envelope',async()=>withApp(async ctx=>{
 await fillGeneration(ctx);ctx.fail(failure);await clickId(ctx,'generate-image');assert.equal(ctx.paid.length,1);assert.ok(ctx.root.querySelector('.uncertain'));assert.equal(ctx.doc.getElementById('generate-image').disabled,true);assert.equal(fixtureButton(ctx.doc,'重試同一請求').disabled,true);await settle();assert.equal(ctx.paid.length,1);
 await fixtureClick(ctx.doc,'檢查最新狀態');await fixtureClick(ctx.doc,'重試同一請求');assert.equal(ctx.paid.length,2);assert.deepEqual(ctx.paid[1],ctx.paid[0]);assert.equal(ctx.root.querySelector('.uncertain'),null);assert.equal(ctx.project.versions.filter(v=>v.source==='image_generated').length,1);
}));
test('known stale approval rejection refreshes revisions and preserves draft but never retries automatically',async()=>withApp(async ctx=>{
 await fillGeneration(ctx);ctx.state.settingsRevision=8;ctx.state.keyRevision=5;ctx.project.revision=4;ctx.fail({status:409,body:{error:{message:'設定版本已變更',operationOutcome:'rejected'}}});await clickId(ctx,'generate-image');assert.equal(ctx.paid.length,1);assert.equal(ctx.root.querySelector('.uncertain'),null);assert.equal(ctx.doc.getElementById('image-generation-title').value,'新的圖片候選');await clickId(ctx,'generate-image');assert.equal(ctx.paid.length,2);assert.equal(ctx.paid[1].approvedSettingsRevision,8);assert.equal(ctx.paid[1].approvedKeyRevision,5);assert.equal(ctx.paid[1].revision,4);assert.notEqual(ctx.paid[1].requestId,ctx.paid[0].requestId);
}));
test('fixed member changes and disabled key block without falling back to global active or chat model',async()=>withApp(async ctx=>{
 await fillGeneration(ctx);ctx.state.members[1].model=IMAGE_GENERATION_MODELS[1];await ctx.app.reload();assert.equal(ctx.doc.getElementById('generate-image').disabled,true);assert.match(ctx.root.textContent,/不會自動改用其他模型/);assert.match(ctx.root.querySelector('.fixed-image-model').textContent,/gpt-image-2$/);assert.equal(ctx.doc.getElementById('image-generation-title').value,'新的圖片候選');await ctx.doc.getElementById('generate-image').dispatchEvent('click');assert.equal(ctx.paid.length,0);
 ctx.state.members[1].model=IMAGE_GENERATION_MODELS[0];ctx.state.keyPresent=false;await ctx.app.reload();assert.equal(ctx.doc.getElementById('generate-image').disabled,true);ctx.state.keyPresent=true;await ctx.app.reload();assert.equal(ctx.doc.getElementById('generate-image').disabled,false);
}));
test('image analysis remains on fixed chat binding, never invokes pixels or substitutes image model',async()=>withApp(async ctx=>{
 await fixtureFill(ctx.doc,'chat-input','分析圖片重心');await fixtureClick(ctx.doc,'送出想法 ↗');const call=ctx.calls.find(c=>c.action==='discuss');assert.equal(call.payload.approvedMemberId,ctx.chat.id);assert.equal(call.payload.approvedModel,'chat-vision-fixture');assert.equal(ctx.paid.length,0);
}));
test('committed same-ID receipt recovers original item after cross-tab switch, finalization, expired key and changed roster',async()=>withApp(async ctx=>{
 await fillGeneration(ctx);ctx.fail({network:true});await clickId(ctx,'generate-image');const request=clone(ctx.paid[0]),originalId=ctx.project.activeItemId;
 // The provider/save completed but the response was lost; another tab moved the
 // active item and finalized the project before the owner checked the receipt.
 const saved=version(90);saved.source='image_generated';saved.generationMetadata={requestId:request.requestId};ctx.project.versions.push(saved);ctx.project.creativeItems[0].versions=clone(ctx.project.versions);ctx.project.creativeItems[0].lifecycle='finalized';
 const next={...clone(ctx.project.creativeItems[0]),id:id(250),type:'titles',title:'另一項目',versions:[],officialVersionId:null,references:[],lifecycle:'finalized'};ctx.project.creativeItems.push(next);ctx.project.activeItem=next;ctx.project.activeItemId=next.id;ctx.project.versions=[];ctx.project.officialVersionId=null;ctx.project.module='titles';ctx.project.lifecycle='finalized';ctx.project.projectLifecycle='finalized';ctx.state.keyPresent=false;ctx.state.keyRevision=99;ctx.state.members=[];ctx.state.settingsRevision=99;
 await fixtureClick(ctx.doc,'檢查最新狀態');assert.equal(fixtureButton(ctx.doc,'重試同一請求').disabled,false);await fixtureClick(ctx.doc,'重試同一請求');assert.equal(ctx.root.querySelector('.uncertain'),null);assert.deepEqual(ctx.paid[1],request);assert.equal(ctx.project.activeItemId,next.id);assert.equal(ctx.project.creativeItems.find(item=>item.id===originalId).versions.filter(v=>v.generationMetadata?.requestId===request.requestId).length,1);assert.equal(ctx.project.versions.length,0);
}));
test('archived source or five-reference ceiling prevents unapproved pixels and preserves explicit choices',async()=>withApp(async ctx=>{
 await fillGeneration(ctx);await choose(ctx,'image-generation-source',id(2));ctx.project.archivedVersionIds=[id(2)];ctx.project.activeItem.archivedVersionIds=[id(2)];await ctx.app.reload();assert.equal(ctx.doc.getElementById('revise-image').disabled,true);await ctx.doc.getElementById('revise-image').dispatchEvent('click');assert.equal(ctx.paid.length,0);
 ctx.project.activeItem.references=Array.from({length:6},(_,n)=>({id:id(350+n),targetItemId:id(201),versionId:id(3+n),versionSnapshot:version(3+n)}));await ctx.app.reload();for(let n=0;n<5;n++)await check(ctx,'image-generation-reference-'+id(350+n));await check(ctx,'image-generation-reference-'+id(355));assert.equal(ctx.doc.getElementById('image-generation-reference-'+id(355)).checked,false);await clickId(ctx,'generate-image');assert.equal(ctx.paid[0].references.length,5);assert.deepEqual(ctx.paid[0].sourceVersionIds,[]);
}));
test('optional combined goal stays blank in requests so server derives approved or source-owned goals without retyping',async()=>withApp(async ctx=>{
 await fill(ctx,'title','沿用來源目標');await fill(ctx,'instruction','保留來源的留白，改成暖色');assert.equal(ctx.doc.getElementById('image-generation-goalAndRationale').value,'');assert.equal(ctx.doc.getElementById('generate-image').disabled,false);await clickId(ctx,'generate-image');assert.equal(ctx.paid[0].goalAndRationale,'');
 ctx.project.goalApprovedAt=null;await ctx.app.reload();await choose(ctx,'image-generation-source',id(2));assert.equal(ctx.doc.getElementById('revise-image').disabled,false);await clickId(ctx,'revise-image');assert.equal(ctx.paid[1].goalAndRationale,'');assert.deepEqual(ctx.paid[1].sourceVersionIds,[id(2)]);assert.equal(ctx.calls.some(c=>c.action==='approve_goal'),false);assert.match(ctx.root.textContent,/所選來源版本各自保存的目標/);
}));

for(const code of ['IMAGE_GENERATION_RESOURCE_LIMIT','PNG_RUNTIME_UNAVAILABLE','PNG_RESOURCE_LIMIT'])test('known uncalled image preflight '+code+' preserves accurate no-transmission warning without invented charges',async()=>withApp(async ctx=>{
 await fillGeneration(ctx);ctx.fail({status:503,body:{error:{code,message:'尚未傳送圖片；伺服器資源或 PNG 功能不足。',operationOutcome:'rejected'}}});await clickId(ctx,'generate-image');assert.equal(ctx.paid.length,1);assert.equal(ctx.root.querySelector('.uncertain'),null);assert.match(ctx.root.querySelector('.error').textContent,/尚未傳送圖片/);assert.doesNotMatch(ctx.root.querySelector('.error').textContent,/可能已計費|可能再次產生費用/);assert.equal(ctx.doc.getElementById('image-generation-title').value,'新的圖片候選');await settle();assert.equal(ctx.paid.length,1);
}));
