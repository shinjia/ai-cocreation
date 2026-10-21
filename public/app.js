import {isArtifactType,defaultArtifact,validateArtifact,artifactItems,cloneArtifact,renderArtifact,renderArtifactEditor,exportArtifact} from './artifacts.js?v=20261021-version11';
/** AI共創工作室: local PHP-backed UI. No key or project content is written to browser storage. */
export const DEFAULT_MODEL = 'gpt-5.4-mini';
export const MODULES = [
  {id:'titles',label:'標題名稱',enabled:true},
  {id:'short_text',label:'短文',enabled:true},
  {id:'article',label:'長篇文章',enabled:true},
  {id:'illustrated',label:'圖文',enabled:false},
  {id:'table',label:'表格',enabled:true},
  {id:'chart',label:'圖表',enabled:true},
  {id:'mindmap',label:'心智圖',enabled:true},
  {id:'vector',label:'向量圖形',enabled:true},
  {id:'image',label:'圖片創作',enabled:false},
  {id:'poster',label:'海報設計',enabled:false},
  {id:'webpage',label:'網頁',enabled:false},
  {id:'interactive',label:'互動視覺程式',enabled:false}
];
const CREATIVE = new Set(['discuss','summarize','approve_goal','confirm_generate','generate','fuse','snapshot','promote','compare','archive_version','restore_version']);
export const LIFECYCLE_LABELS = {created:'已建立',in_progress:'討論中',finalized:'已定稿'};
export function contentType(project) { return project?.activeItem?.type || project?.module || 'titles'; }
export function canCreate(project) { return !!project && project.lifecycle !== 'finalized' && project.projectLifecycle !== 'finalized' && !project.activeItem?.archived && (!('creativeItems' in project) || MODULES.some(module=>module.id===project.activeItem?.type && module.enabled)); }
const PAID = new Set(['discuss','summarize','confirm_generate','generate','compare','fuse']);
export function memberRosterError(members) {
  if(!Array.isArray(members) || members.length>20)return '最多可保存 20 位 AI 成員。';
  const names=new Set();
  for(const member of members){
    const name=String(member.nickname || '').trim();
    if(!name)return '請為每位 AI 成員填寫稱呼。';
    if(new TextEncoder().encode(name).length>120)return 'AI 成員稱呼超過 120 位元組（約 40 個中文字），請縮短後再保存。';
    if(names.has(name))return 'AI 成員稱呼不可重複，請使用不同的名稱。';names.add(name);
  }
  return '';
}
export function enabledMembers(state) { return (state?.members || []).filter(member=>member.enabled); }
export function activeMember(state) { return enabledMembers(state).find(member=>member.id===(state?.memberId || state?.activeMemberId)) || null; }
export function projectMember(state,project) {
  const binding=project?.aiBinding;if(!binding)return null;
  const member=enabledMembers(state).find(value=>value.id===binding.memberId);
  if(!member || member.provider!==binding.provider || member.model!==binding.model || (member.ollamaUrl || '')!==(binding.ollamaUrl || ''))return null;
  return {...member,nickname:binding.memberNickname || member.nickname};
}
export function aiSetupReason(state,demo=false,project=undefined) {
  if(!state?.usageConsent)return '請先到「AI 系統設定」閱讀傳送範圍與費用說明，勾選同意後保存。';
  if(project!==undefined && !project?.aiBinding)return '請先為這個專案一次選定 AI 模型。選定後，專案內不再逐句切換。';
  const member=project===undefined?activeMember(state):projectMember(state,project);
  if(!member)return project?.aiBinding?'此專案綁定的 AI 成員已停用或模型設定已變更。請到系統設定恢復原成員與模型；不會自動改用其他模型。':'尚未選擇可用的 AI 成員。請先在系統設定啟用成員。';
  if(!demo && member.provider==='openai' && !state.keyPresent)return 'OpenAI 金鑰尚未設定或已到期。請到「AI 系統設定」重新提供金鑰。';
  return '';
}
export function createRequestId(provider = globalThis.crypto) {
  if (!provider || !provider.getRandomValues) throw new Error('瀏覽器無法建立安全請求識別碼，請使用新版瀏覽器或 localhost。');
  return Array.from(provider.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2,'0')).join('');
}
export function versionItems(version) {
  if(Array.isArray(version?.items))return version.items.map(item=>({...item}));
  return version?.title?[{id:'legacy-title',label:'中文名稱',content:version.title}]:[];
}
export function officialItemTitle(items) {
  const values=Array.isArray(items)?items:[],label=item=>String(item?.label || '').replace(/\s+/gu,'').toLowerCase();
  const primary=new Set(['中文名稱','中文標題','中文名','主標題','主要名稱','正式名稱']),generic=new Set(['名稱','標題','title','name']);
  const main=values.find(item=>primary.has(label(item))) || values.find(item=>generic.has(label(item))) || values[0];
  const name=String(main?.content || '').replace(/\s+/gu,' ').trim(),points=Array.from(name);
  return points.length>59?points.slice(0,59).join('')+'…':name;
}
export function validItems(items,type='titles') {
  if(!['titles','short_text','article','table','chart','mindmap','vector'].includes(type))return false;
  const max=isArtifactType(type)?1:type==='short_text'?1:type==='article'?80:12,limit=isArtifactType(type)?60000:type==='short_text'?12000:6000,total=isArtifactType(type)?60000:type==='short_text'?12000:type==='article'?120000:24000;
  if(!Array.isArray(items) || items.length<1 || items.length>max)return false;
  if(isArtifactType(type) && (items.length!==1 || items[0].id!=='document' || items[0].label!==(type==='table'?'表格內容':type==='mindmap'?'心智圖來源':type==='vector'?'向量圖形來源':'圖表來源')))return false;
  if(type==='short_text' && (items[0].id!=='body' || items[0].label!=='全文'))return false;
  const bytes=value=>new TextEncoder().encode(value).length;
  return new Set(items.map(item=>item.id)).size===items.length && new Set(items.map(item=>typeof item.label==='string'?item.label.trim():item.label)).size===items.length && items.every(item=>typeof item.id==='string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(item.id) && typeof item.label==='string' && item.label.trim() && bytes(item.label)<=120 && typeof item.content==='string' && item.content.trim() && bytes(item.content)<=limit) && items.reduce((sum,item)=>sum+bytes(item.content),0)<=total;
}
export function contentItemsError(items,type='titles') {
  if(validItems(items,type))return '';
  const max=isArtifactType(type)?1:type==='article'?80:type==='short_text'?1:12,limit=isArtifactType(type)?60000:type==='short_text'?12000:6000,total=isArtifactType(type)?60000:type==='article'?120000:type==='short_text'?12000:24000;
  if(!Array.isArray(items) || !items.length || items.length>max)return `請保留 1–${max} 個完整內容欄位。`;
  if(type==='short_text' && (items.length!==1 || items[0].id!=='body' || items[0].label!=='全文'))return '短文需完整保存在「全文」欄位。';
  if(items.some(item=>typeof item.label!=='string' || !item.label.trim() || typeof item.content!=='string' || !item.content.trim()))return '請填妥每個保留欄位的名稱與內容。';
  if(new Set(items.map(item=>item.label.trim())).size!==items.length)return '段落或內容欄位名稱不可重複。';
  const oversized=items.find(item=>new TextEncoder().encode(item.content).length>limit);
  if(oversized)return `「${oversized.label}」超過 ${limit.toLocaleString('en-US')} 位元組，請縮短後再保存；不會自動截斷。`;
  if(items.reduce((sum,item)=>sum+new TextEncoder().encode(item.content).length,0)>total)return `完整內容超過 ${total.toLocaleString('en-US')} 位元組，請縮短後再保存。`;
  return '內容欄位名稱或識別碼不符格式，請檢查後再保存。';
}
export function canSummarize(project) { return canCreate(project) && project.messages.some(message=>message.role==='student' && (!message.kind || message.kind==='discussion')); }
export function canConfirmGenerate(project) { return !!(canCreate(project) && project.brief && project.phase==='summary' && Number.isInteger(project.summaryRevision) && project.summaryRevision<=project.revision); }
export function canGenerate(project) { return !!(canCreate(project) && project.goalApprovedAt && ['ready','work'].includes(project.phase)); }
export function canSnapshot(project,baseVersionId=null) { return !!(canCreate(project) && (project.goalApprovedAt || project.versions?.some(v=>v.id===project.officialVersionId || (v.id===baseVersionId && !isArchivedVersion(project,v.id))))); }
export function refinementNodeError(project,baseVersionId,targetNodeId) {
  if(contentType(project)!=='mindmap' || !baseVersionId)return '';
  const source=project.versions?.find(version=>version.id===baseVersionId);
  return source?.artifact?.nodes?.some(node=>node.id===targetNodeId)?'':'請選擇來源版本中已加入圖形的節點，再討論待選子分支。';
}
export function refinementRangeError(project,baseVersionId,targetItemIds=[]) {
  if(!baseVersionId)return '';
  const base=project?.versions?.find(version=>version.id===baseVersionId);
  if(!base || isArchivedVersion(project,baseVersionId))return '請選擇未封存的來源版本。';
  if(contentType(project)==='article' && (!Array.isArray(targetItemIds) || !targetItemIds.length || new Set(targetItemIds).size!==targetItemIds.length || targetItemIds.some(id=>!versionItems(base).some(item=>item.id===id))))return '請明確勾選這次要修改的段落。未選段落會保持原文，不會自動修改全文。';
  return '';
}
// Only structured, saved questions become buttons. Never infer answers from prose.
export function discussionChoices(message) {
  const bytes=value=>new TextEncoder().encode(value).length,choices=message?.choices;
  if(message?.role!=='assistant' || !['discussion','clarification'].includes(message.kind) || typeof message.question!=='string' || !message.question.trim() || bytes(message.question)>600 || !Array.isArray(choices) || choices.length<2 || choices.length>6)return [];
  if(!choices.every(choice=>choice && typeof choice.id==='string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(choice.id) && typeof choice.label==='string' && choice.label.trim() && bytes(choice.label)<=120 && typeof choice.value==='string' && choice.value.trim() && bytes(choice.value)<=1000))return [];
  if(choices.some(choice=>[choice.id,choice.label,choice.value].some(value=>value.includes('\0') || /\bsk-[a-zA-Z0-9_-]{16,}\b/.test(value))))return [];
  if(new Set(choices.map(choice=>choice.id)).size!==choices.length || new Set(choices.map(choice=>choice.value)).size!==choices.length)return [];
  return choices;
}
export function currentChoiceQuestion(project,message,{baseVersionId=project?.officialVersionId || null,targetItemIds=[],targetNodeId=null}={}) {
  const context=message?.choiceContext,last=project?.messages?.at(-1);
  return !!(message?.id && last?.id===message.id && discussionChoices(message).length && context && typeof project.activeItemId==='string' && context.itemId===project.activeItemId && context.officialVersionId===project.officialVersionId && Number.isInteger(project.sharedContextRevision) && context.sharedContextRevision===project.sharedContextRevision && typeof context.itemTitle==='string' && context.itemTitle===project.activeItem?.title && typeof context.itemDescription==='string' && context.itemDescription===project.activeItem?.description && Object.hasOwn(context,'baseVersionId') && context.baseVersionId===baseVersionId && Array.isArray(context.targetItemIds) && JSON.stringify([...context.targetItemIds].sort())===JSON.stringify([...targetItemIds].sort()) && (contentType(project)!=='mindmap' || !baseVersionId || context.targetNodeId===targetNodeId));
}
export function newestPendingRevision(project) {
  if(!project?.versions?.length)return null;
  const adopted=new Set((project.messages || []).filter(m=>['promotion','promote'].includes(m.kind)).flatMap(m=>m.versionIds || []));
  return [...project.versions].reverse().find(v=>v.source==='revision' && v.id!==project.officialVersionId && !isArchivedVersion(project,v.id) && !adopted.has(v.id)) || null;
}
export function revisionChanges(base,version) {
  const before=versionItems(base),after=versionItems(version),ids=[...new Set([...before,...after].map(item=>item.id))];
  return ids.map(id=>{const from=before.find(item=>item.id===id),to=after.find(item=>item.id===id);return {id,before:from,after:to,kind:!from?'added':!to?'removed':from.label!==to.label || from.content!==to.content?'changed':'unchanged'};});
}
export function versionSourceLabel(version,demo=false) { return version.source==='fusion'?(demo?'腳本融合候選':'AI 融合候選'):version.source==='revision'?(demo?'腳本修改版':'AI 討論修改版'):version.source==='generated'?(demo?'腳本候選':'AI 候選'):'手動保存'; }
export function isArchivedVersion(project,id) { return (project?.archivedVersionIds || project?.activeItem?.archivedVersionIds || []).includes(id); }
export function validComparison(ids, project) {
  return Array.isArray(ids) && ids.length >= 2 && ids.length <= 5 && new Set(ids).size === ids.length && ids.every(id => project?.versions.some(v => v.id === id) && !isArchivedVersion(project,id));
}
export function comparisonQuestionError(question='') { return new TextEncoder().encode(question.trim()).length>2000?'比較重點超過 2,000 位元組（約 666 個中文字），請縮短後再送出。':''; }
export function comparisonDisabledReason(project,ids,{busy=false,uncertain=false,question=''}={}) {
  if(busy)return '正在處理上一個操作，完成後即可比較。';
  if(uncertain)return '請先檢查上次操作的結果，再開始新的比較。';
  if(!canCreate(project))return '目前為唯讀。請先還原或重新開啟專案與創作項目。';
  if(!validComparison(ids,project))return ids.length<2?'請勾選至少 2 個未封存版本，最多可選 5 個。':'請選擇 2–5 個不同且未封存的版本。';
  return comparisonQuestionError(question);
}
export const COMPARISON_SNAPSHOT_NOTE='本次依每個選取版本各自保存的目標、討論變更與修改意見比較，不以目前共用目標統一評分；不會替你確認目標。';
export function comparisonUsesSnapshots() { return true; }
export function versionGoalText(version) { return typeof version?.goalText==='string'?version.goalText:version?.goalSnapshot?.summary || ''; }
export function versionGoalAndRationale(version) {
  if(typeof version?.goalAndRationale==='string')return version.goalAndRationale;
  const seen=new Set(),parts=[];
  for(const [label,value] of [['本版目標',versionGoalText(version)],['討論與變更摘要',version?.changeSummary],['修改意見',version?.rationale]]){
    if(typeof value!=='string' || !value.trim() || seen.has(value))continue;
    seen.add(value);parts.push(`${label}：\n${value}`);
  }
  return parts.join('\n\n');
}
export function combinedMetadataError(value='') {
  if(typeof value!=='string' || !value.trim())return '請填寫本版目標與修改意見。不會自動套用目前共用目標。';
  if(new TextEncoder().encode(value).length>12000)return '本版目標與修改意見超過 12,000 位元組（約 4,000 個中文字），請縮短後再保存。';
  return '';
}
export function snapshotMetadataError(goalText='',rationale='') {
  if(!goalText.trim())return '請填寫本版目標。來源未保存目標時，請自行補充，不會自動套用共用目標。';
  if(new TextEncoder().encode(goalText.trim()).length>6000)return '本版目標超過 6,000 位元組（約 2,000 個中文字），請縮短後再保存。';
  if(new TextEncoder().encode(rationale.trim()).length>2000)return '自行修改的意見超過 2,000 位元組（約 666 個中文字），請縮短後再保存。';
  return '';
}
export function provenanceLabel(value) {
  if(!value)return '模型來源未記錄';
  const nickname=value.memberNickname?`${value.memberNickname} · `:'';
  if(value.provider==='scripted')return `${nickname}固定腳本 · 非 AI`;
  const provider=value.provider==='ollama'?'Ollama':value.provider==='openai'?'OpenAI':value.provider;
  return `${nickname}${provider} · ${value.requestedModel}${!value.actualModel?'（實際模型未回報）':value.actualModel!==value.requestedModel?`（實際：${value.actualModel}）`:''}`;
}
export function versionCoordinates(version) {
  return {major:Number.isInteger(version?.major) && version.major>0?version.major:Number(version?.number) || 1,minor:Number.isInteger(version?.minor) && version.minor>=0?version.minor:0};
}
export function versionLabel(version) { if(!version)return '未指定';const {major,minor}=versionCoordinates(version);return `V${major}${minor?`.${minor}`:''}`; }
export function nextVersionCoordinates(project,mode='major',base=null) {
  const versions=(project?.versions || []).map(versionCoordinates);
  if(mode==='minor') {
    if(!base)return null;
    const {major}=versionCoordinates(base);
    return {major,minor:Math.max(0,...versions.filter(v=>v.major===major).map(v=>v.minor))+1};
  }
  return {major:Math.max(0,...versions.map(v=>v.major))+1,minor:0};
}
export function exportProject(project) {
  // An explicit allowlist prevents accidentally exporting connection/session fields.
  const {id,title,description,lifecycle,projectLifecycle,aiBinding,activeItemId,creativeItems,projectFinalizedAt,projectFinalizations,module,phase,revision,messages,brief,goalApprovedAt,versions,archivedVersionIds,officialVersionId,finalizedVersionId,finalizedAt,finalizations,comparisons} = project;
  return {format:'ai-cocreation-project',formatVersion:1,exportedAt:new Date().toISOString(),project:{id,title,description,lifecycle,projectLifecycle,aiBinding,activeItemId,creativeItems,projectFinalizedAt,projectFinalizations,module,phase,revision,messages,brief,goalApprovedAt,versions,archivedVersionIds,officialVersionId,finalizedVersionId,finalizedAt,finalizations,comparisons}};
}
export class ApiError extends Error {
  constructor(message,status=0,data=null,uncertain=false) { super(message);this.name='ApiError';this.status=status;this.data=data;this.uncertain=uncertain; }
}
export function createApiAdapter(base = './api.php') {
  let csrf = '';
  async function request(action,payload=null) {
    let response;
    const url = new URL(base,globalThis.location.href);
    url.searchParams.set('action',action);
    const options = {credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json'}};
    if (payload && action === 'project') url.searchParams.set('id',payload.id);
    else if (payload) { options.method='POST';options.headers['Content-Type']='application/json';options.headers['X-CSRF-Token']=csrf;options.body=JSON.stringify({...payload,action}); }
    try { response = await fetch(url,options); }
    catch (_) { throw new ApiError('無法確認伺服器是否完成操作。請先檢查最新狀態，不要重複提交。',0,null,!!payload); }
    let data;
    try { data = await response.json(); }
    catch (_) { throw new ApiError('伺服器回應格式不正確，無法確認操作結果。',response.status,null,!!payload); }
    if (!data || typeof data!=='object' || Array.isArray(data)) throw new ApiError('伺服器回應格式不正確，無法確認操作結果。',response.status,null,!!payload);
    if (!response.ok || data.error) {
      const detail = typeof data.error === 'string' ? data.error : data.error?.message;
      // Only the server's explicit rejected outcome confirms nothing was saved.
      // Network failures, unknown outcomes and older 5xx responses stay uncertain.
      const outcome=data.error?.operationOutcome;
      const ambiguous=outcome==='unknown' || (outcome!=='rejected' && response.status>=500);
      throw new ApiError(detail || data.message || '操作未完成，請稍後檢查。',response.status,data,PAID.has(action) && ambiguous);
    }
    if (data.csrf) csrf=data.csrf;
    return data;
  }
  return {request};
}
function el(tag,className='',text=null,attrs={}) {
  const node=document.createElement(tag);
  if (className) node.className=className;
  if (text !== null) node.textContent=String(text);
  for (const [name,value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (name === 'checked' || name === 'disabled') node[name]=!!value;
    else node.setAttribute(name,String(value));
  }
  return node;
}
function append(parent,...children) { children.flat().forEach(child => {if(child) parent.append(child);});return parent; }
function button(text,handler,style='',disabled=false) {
  const b=el('button',`button ${style}`.trim(),text,{type:'button',disabled});
  b.addEventListener('click',handler);return b;
}
function field(label,input) { const wrap=el('div','field');append(wrap,el('label','field-label',label,{for:input.id}),input);return wrap; }
export function formatDate(value) {
  const timestamp=typeof value==='number'?value*1000:value;
  try { return new Intl.DateTimeFormat('zh-TW',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(timestamp)); }
  catch (_) { return ''; }
}
function readable(value) { return Array.isArray(value) ? value.join('、') : typeof value === 'object' && value ? JSON.stringify(value) : String(value || '尚未指定'); }
export async function createTitleApp({root=document.getElementById('app'),adapter=createApiAdapter(),demo=false}={}) {
  let state=null,project=null,busy=false,error='',toastTimer=null,uncertain=null,selectedComparison=null,comparisonError='',settingsDraft=null;
  const selected=new Set(),drafts=new Map(),officialViews=new Map(),treeViews=new Map();
  const draft=()=> {
    const id=project?`${project.id}:${project.activeItemId || 'default'}`:'_empty';
    if(!drafts.has(id)) {
      const official=project?.versions.find(v=>v.id===project.officialVersionId);
      drafts.set(id,{chat:'',artifact:isArtifactType(contentType(project))?cloneArtifact(official?.artifact || defaultArtifact(contentType(project))):null,items:official?versionItems(official):[{id:contentType(project)==='short_text'?'body':createRequestId(),label:contentType(project)==='short_text'?'全文':contentType(project)==='article'?'第 1 段':'中文名稱',content:''}],goalAndRationale:official?versionGoalAndRationale(official):project?.goalApprovedAt?project.brief?.summary || '':'',metadataEdited:false,basedOnVersionId:official?.id || null,dirty:false,instruction:'',question:'',fusionQuestion:'',targetItemIds:[],targetNodeId:official?.artifact?.rootId || null,artifactUi:{},artifactPending:false});
    }
    const saved=drafts.get(id);
    if(!saved.basedOnVersionId && !saved.metadataEdited && !saved.goalAndRationale && project?.goalApprovedAt)saved.goalAndRationale=project.brief?.summary || '';
    return saved;
  };
  function flash(message) {
    document.getElementById('app-toast')?.remove();clearTimeout(toastTimer);
    const node=el('div','toast',message,{id:'app-toast',role:'status'});document.body.append(node);
    toastTimer=setTimeout(()=>node.remove(),5200);
  }
  function applyProject(p) {
    project=p;comparisonError='';
    const ids=new Set(p.versions.filter(v=>!isArchivedVersion(p,v.id)).map(v=>v.id));
    [...selected].forEach(id=>{if(!ids.has(id))selected.delete(id);});
    const item={id:p.id,title:p.title,description:p.description,lifecycle:p.projectLifecycle || p.lifecycle,module:p.module,phase:p.phase,updatedAt:new Date().toISOString()};
    state.projects=[item,...state.projects.filter(x=>x.id!==p.id)];
    if(selectedComparison && !p.comparisons.some(c=>c.id===selectedComparison))selectedComparison=null;
  }
  function showDialog({title,body,confirmLabel='確認',danger=false,form=null,validate=null}) {
    return new Promise(resolve=> {
      const previous=document.activeElement;
      const dialog=el('dialog','modal',null,{'aria-labelledby':'dialog-title'});
      const content=el('div','modal-content');
      append(content,el('h2','',title,{id:'dialog-title'}));
      if(Array.isArray(body)) body.forEach(t=>content.append(el('p','',t)));
      else if(body) content.append(body);
      if(form)content.append(form);
      const actions=el('div','modal-actions');
      const close=(answer)=>{dialog.close();dialog.remove();previous?.focus();resolve(answer);};
      append(actions,button('取消',()=>close(false)),button(confirmLabel,()=>{
        if(form && !form.checkValidity()){form.querySelectorAll('details').forEach(d=>d.open=true);form.reportValidity();return;}
        if(validate && !validate())return;
        close(true);
      },danger?'danger':'primary'));
      append(content,actions);dialog.append(content);document.body.append(dialog);
      dialog.addEventListener('cancel',event=>{event.preventDefault();close(false);},{once:true});
      dialog.showModal();
      if(form)form.querySelector('input,textarea')?.focus();
      else actions.querySelector('button')?.focus();
    });
  }
  async function refresh({keepProject=true}={}) {
    const fresh=await adapter.request('state');state={...fresh,projects:fresh.projects || []};
    if(keepProject && project) applyProject((await adapter.request('project',{id:project.id})).project);
    else if(state.projects.length) applyProject((await adapter.request('project',{id:state.projects[0].id})).project);
  }
  async function mutate(action,payload={},success='',options={}) {
    if(busy)return false;
    if(CREATIVE.has(action) && !canCreate(project)){flash('目前創作項目不可修改，請確認類型已開放，且專案與項目都已開啟討論。');return false;}
    if(uncertain && !options.retry) {flash('請先檢查上次未確認的操作。');return false;}
    busy=true;error='';render();
    let body={...payload};
    if(project?.activeItemId && (CREATIVE.has(action) || ['finalize','reopen','attach_reference','remove_reference','edit_item','archive_item','restore_item'].includes(action)))body.itemId=project.activeItemId;
    const paid=PAID.has(action);
    try {
      if(paid) {
        const setup=aiSetupReason(state,demo,project);if(setup){error=setup;return false;}
        if(options.retry) body={...uncertain.payload};
        else {const member=projectMember(state,project);body={...body,consent:true,approvedMemberId:member.id,approvedProvider:member.provider,approvedModel:member.model,approvedSettingsRevision:state.settingsRevision,requestId:createRequestId()};if(member.provider==='openai')body.approvedKeyRevision=state.keyRevision;}
      }
      const result=await adapter.request(action,body);
      if(result.project)applyProject(result.project);
      else state={...state,...result};
      uncertain=null;
      if(result.connection)flash(result.connection.message || (result.connection.ok?'連線檢查通過。':'連線檢查未通過。'));
      else if(success){const message=typeof success==='function'?success(result):success;if(message)flash(message);}
      return true;
    } catch (e) {
      error=e.message || '操作未完成。';
      if(paid && e.status>=500 && e.data?.error?.operationOutcome==='rejected')error+=' 本次服務可能已計費；沒有自動重試，再次送出會是新請求。';
      if(paid && e.uncertain) uncertain={action,payload:body,checked:false};
      else if(paid && options.retry && e.data?.error?.operationOutcome==='rejected')uncertain=null;
      if(e.status===409) {
        try {await refresh();error+=' 已載入伺服器最新版本，你尚未送出的草稿仍保留。';}catch(_){/* preserve the original conflict */}
      }
      return false;
    } finally {busy=false;render();}
  }
  async function loadProject(id) {
    if(busy || id===project?.id)return;
    if(uncertain){flash('請先檢查上次操作，再切換專案。');render();return;}
    busy=true;error='';render();
    try {applyProject((await adapter.request('project',{id})).project);selected.clear();selectedComparison=null;}
    catch(e){error=e.message;}
    finally{busy=false;render();}
  }
  async function projectMetadata(edit=false) {
    if(busy || uncertain)return;
    const form=el('form');form.addEventListener('submit',e=>e.preventDefault());
    const input=el('input','',null,{id:'project-name',maxlength:'80',required:true,placeholder:'例如：社區影像展主標題'});
    const description=el('textarea','',null,{id:'project-description',maxlength:'4000',rows:'4',placeholder:'這次創作的背景、用途或想完成的事…'});
    const memberSelect=el('select','',null,{id:'project-member',required:!edit && enabledMembers(state).length>0,disabled:edit || !enabledMembers(state).length});
    memberSelect.append(el('option','',enabledMembers(state).length?'請選定這個專案的 AI 成員':'尚無已啟用成員，建立後先完成 AI 設定',{value:''}));
    enabledMembers(state).forEach(member=>memberSelect.append(el('option','',`${member.nickname} · ${member.provider==='openai'?'OpenAI':'Ollama'} · ${member.model}`,{value:member.id})));
    if(edit){input.value=project.title;description.value=project.description || '';}
    append(form,field('專案名稱（不是創作內容）',input),field('專案說明',description),el('p','privacy-note',edit?'修改專案名稱或說明後，各創作項目都需要重新整理並確認目標。已有的對話、版本與定稿紀錄都會保留。':'每個專案分開保存對話、候選、正式版與比較。建立專案不會呼叫 AI。專案說明會作為後續 AI 討論的背景。'));
    if(!edit)append(form,field('專案固定 AI 模型',memberSelect),el('p','privacy-note','一次選好，這個專案的所有創作項目都使用同一模型。之後不在對話間切換；建立專案不會呼叫 AI。'));
    if(!await showDialog({title:edit?'編輯專案資料':'建立新的創作專案',form,confirmLabel:edit?'保存專案資料':'建立專案'}))return;
    const payload={title:input.value.trim(),description:description.value.trim()};
    if(edit){payload.id=project.id;payload.revision=project.revision;}else if(memberSelect.value){payload.memberId=memberSelect.value;payload.expectedSettingsRevision=state.settingsRevision;}
    if(await mutate(edit?'edit_project':'new',payload,edit?'專案資料已保存。':'新專案已建立，先從一個問題開始。')){if(!edit){selected.clear();selectedComparison=null;}render();}
  }
  const newProject=()=>projectMetadata(false);
  async function finalizeProject() {
    const version=project.versions.find(v=>v.id===project.officialVersionId);
    if(!version)return;
    if(await showDialog({title:'將這個創作項目定稿？',body:[`將創作項目「${project.activeItem?.title || project.title}」以 ${versionLabel(version)}「${version.title}」的全部 ${versionItems(version).length} 項內容結案定稿。`,'定稿後可以查看與匯出所有紀錄，不能繼續修改作品。需要再創作時，可明確選擇重新開啟討論，原定稿紀錄仍完整保留。'],confirmLabel:'確認結案定稿'}))await mutate('finalize',{id:project.id,revision:project.revision},'這個創作項目已定稿。完整紀錄仍可隨時開啟。');
  }
  async function reopenProject() {
    if(await showDialog({title:'重新開啟這個創作項目的討論？',body:['原本的定稿、版本與對話都會保留。重新開啟後可以繼續討論、編輯與比較，不會自動改動正式版。'],confirmLabel:'重新開啟討論'}))await mutate('reopen',{id:project.id,revision:project.revision},'創作項目已重新開啟，原定稿紀錄仍保留。');
  }
  async function keySettings() {
    if(busy || uncertain)return;
    const form=el('form','ai-settings-form');form.addEventListener('submit',e=>e.preventDefault());
    const roster=(settingsDraft?.members || state.members || []).map(member=>({...member}));
    const openedRevision=settingsDraft?.expectedSettingsRevision ?? state.settingsRevision;
    if(!roster.length)roster.push({id:createRequestId(),nickname:'共創夥伴',enabled:false,provider:state.provider==='ollama'?'ollama':'openai',model:state.model || '',ollamaUrl:state.ollamaUrl || 'http://127.0.0.1:11434'});
    let selectedMemberId=settingsDraft?settingsDraft.activeMemberId:activeMember(state)?.id || null;
    const usage=el('input','',null,{id:'ai-usage-consent',type:'checkbox',checked:settingsDraft?settingsDraft.usageConsent:!!state.usageConsent});
    const destinations=el('ul','member-destinations');
    const active=el('select','',null,{id:'settings-active-member','aria-label':'系統連線測試成員，不變更專案模型'});
    const list=el('div','member-settings-list');
    const updateDestinations=()=>{
      destinations.replaceChildren(...roster.filter(member=>member.enabled).map(member=>el('li','',`${member.nickname || '未命名成員'}：${member.provider==='openai'?'OpenAI API':`Ollama ${member.ollamaUrl || '（未填位址）'}`} · ${member.model || '（未填模型）'}${member.enabled?'':' · 未勾選'}`)));
      if(!roster.some(member=>member.enabled && member.id===selectedMemberId))selectedMemberId=null;
      active.replaceChildren(el('option','','尚未選擇（不會自動替換）',{value:''}),...roster.filter(member=>member.enabled).map(member=>el('option','',`${member.nickname} · ${member.provider} · ${member.model}`,{value:member.id})));
      active.value=selectedMemberId || '';
    };
    active.addEventListener('change',()=>{selectedMemberId=active.value || null;});
    const key=el('input','',null,{id:'api-key',type:'password',autocomplete:'off',spellcheck:'false',autocapitalize:'none',disabled:demo,placeholder:demo?'腳本示範不接受或保存金鑰':state.keyPresent?'已有暫存金鑰；留空即可沿用':'貼上你的 OpenAI API 金鑰'});
    const keyStatus=el('p','composer-hint',demo?'示範永遠不連線，也不會使用金鑰。':state.keyPresent?state.keyExpiresAt?`目前金鑰可使用至 ${formatDate(state.keyExpiresAt)}。`:'目前工作階段已有暫存金鑰。':'尚未設定金鑰。OpenAI 模型清單需要已保存的有效金鑰。',{id:'key-settings-status',role:'status'});
    const storeKey=async()=>{
      if(demo)return false;let secret=key.value;key.value='';if(!secret.trim()){keyStatus.textContent='請先提供金鑰。';return false;}
      const operation=mutate('set_key',{key:secret,model:roster.find(member=>member.id===selectedMemberId)?.model || state.model || DEFAULT_MODEL},'金鑰已暫存；未執行 AI。');secret='';const ok=await operation;keyStatus.textContent=ok?'金鑰已暫存，可按「讀取模型清單」。':error || '金鑰未保存，請檢查設定。';return ok;
    };
    if(settingsDraft){
      append(form,el('p','notice error',openedRevision!==state.settingsRevision?'另一個分頁已更新 AI 設定。你的設定草稿仍保留，但不能覆寫較新的設定。請先重新載入最新設定，再重新調整。':'上次保存沒有完成，你的成員設定草稿仍保留。',{role:'status'}),button('重新載入最新設定',async()=>{
        if(!await showDialog({title:'放棄目前的設定草稿？',body:['將重新載入伺服器的最新 AI 成員設定。尚未保存的設定草稿會被放棄，專案討論與作品不受影響。'],confirmLabel:'放棄草稿並重新載入'}))return;
        settingsDraft=null;key.value='';form.closest('dialog')?.dispatchEvent(new Event('cancel',{cancelable:true}));await refresh();render();await keySettings();
      },'small'));
    }
    append(form,el('p','',demo?'離線腳本設定示範：可練習建立與啟用成員，但不連線、不取得真實模型清單，也不執行 AI。':'這裡管理可供新專案選用的 AI 成員。每個專案開始時一次選好模型；變更中央設定不會把既有專案改綁其他模型。'),field('OpenAI API 金鑰（本次工作階段的 OpenAI 成員共用）',key),keyStatus);
    if(!demo)append(form,button('暫存金鑰以讀取清單',storeKey,'small'),el('p','privacy-note','金鑰最多可使用 30 分鐘，到期後需重新提供。只暫存在這個安裝網站的伺服器，不會寫入成員、專案、匯出檔或瀏覽器儲存空間。請只在你信任的本機 localhost 網站貼上。'));
    if(state.keyPresent && !demo)form.append(button('清除目前伺服器金鑰',async()=>{key.value='';const ok=await mutate('clear_key',{},'暫存金鑰已清除。');keyStatus.textContent=ok?'金鑰已清除。':error;},'danger small'));
    const renderRoster=()=>{
      list.replaceChildren();
      roster.forEach((member,index)=>{
        const card=el('section','member-settings-card',null,{'data-member-id':member.id});
        const enabled=el('input','',null,{id:`member-enabled-${member.id}`,type:'checkbox',checked:member.enabled});
        const heading=append(el('label','member-enabled-label'),enabled,el('strong','',`勾選使用成員 ${index+1}`));
        enabled.addEventListener('change',()=>{if(enabled.checked && !member.enabled)usage.checked=false;member.enabled=enabled.checked;updateDestinations();});
        const nickname=el('input','',null,{id:`member-nickname-${member.id}`,maxlength:'60',required:true,placeholder:'例如：小光、阿哲'});nickname.value=member.nickname;nickname.addEventListener('input',()=>{member.nickname=nickname.value;updateDestinations();});
        const provider=el('select','',null,{id:`member-provider-${member.id}`});append(provider,el('option','','OpenAI API（雲端，另計 API 費用）',{value:'openai'}),el('option','','Ollama（指定的本機服務）',{value:'ollama'}));provider.value=member.provider;
        const model=el('input','',null,{id:`member-model-${member.id}`,maxlength:'120',required:true,autocomplete:'off',spellcheck:'false',placeholder:'手動輸入模型名稱，或明確讀取清單'});model.value=member.model;
        const url=el('input','',null,{id:`member-url-${member.id}`,maxlength:'200',autocomplete:'off',spellcheck:'false'});url.value=member.ollamaUrl || 'http://127.0.0.1:11434';
        const urlField=field('Ollama 服務網址（PHP 安裝主機的本機位址）',url);urlField.hidden=member.provider!=='ollama';
        const models=el('select','',null,{id:`member-model-list-${member.id}`,'aria-label':`${member.nickname} 查得的模型`,disabled:true});models.append(el('option','','尚未讀取，沒有預設可用清單',{value:''}));
        const status=el('p','model-list-status','不會自動讀取。模型清單僅是服務回報的名稱，不保證支援本程式的推論格式。',{id:`member-model-status-${member.id}`,role:'status'});
        let querySerial=0;
        const resetModels=()=>{querySerial++;models.replaceChildren(el('option','','設定已變更，請重新讀取清單',{value:''}));models.disabled=true;status.textContent='尚未查詢這個服務。可手動輸入模型名稱；模型清單不保證推論相容。';usage.checked=false;updateDestinations();};
        provider.addEventListener('change',()=>{member.provider=provider.value;member.model='';model.value='';urlField.hidden=member.provider!=='ollama';resetModels();});
        model.addEventListener('input',()=>{member.model=model.value;usage.checked=false;updateDestinations();});
        url.addEventListener('input',()=>{member.ollamaUrl=url.value;resetModels();});
        models.addEventListener('change',()=>{if(models.value){member.model=models.value;model.value=models.value;usage.checked=false;updateDestinations();}});
        const read=button('讀取模型清單',async()=>{
          if(demo){status.textContent='腳本示範不會讀取真實模型清單。可練習手動填寫，所有回覆仍是固定腳本。';return;}
          const token=++querySerial,providerAtRequest=member.provider,urlAtRequest=member.ollamaUrl;read.disabled=true;status.textContent='正在讀取服務的模型名稱，不會傳送專案內容或執行推論…';
          try{const result=await adapter.request('list_models',{provider:providerAtRequest,ollamaUrl:urlAtRequest});if(token!==querySerial)return;
            if(!Array.isArray(result.models) || result.models.some(name=>typeof name!=='string'))throw new Error('服務回傳的模型清單格式不正確。');
            models.replaceChildren(el('option','','選擇服務回報的模型名稱',{value:''}),...result.models.map(name=>el('option','',name,{value:name})));models.disabled=!result.models.length;
            status.textContent=`${result.message || `服務回報 ${result.models.length} 個模型。`}${result.fetchedAt?` 查詢時間：${formatDate(result.fetchedAt)}。`:''} 清單不保證推論相容；仍可手動填寫模型。`;
          }catch(e){if(token!==querySerial)return;models.replaceChildren(el('option','','讀取失敗，請手動輸入或稍後重試',{value:''}));models.disabled=true;status.textContent=`${e.message || '模型清單讀取失敗。'} 可手動輸入模型名稱；沒有以示範清單代替。`;
          }finally{read.disabled=false;}
        },'small');
        append(card,heading,field('擬人名稱',nickname),field('使用方法',provider),field('模型名稱（可手動輸入）',model),urlField,append(el('div','model-list-controls'),read,models),status,el('p','composer-hint','取消勾選只會停用，不刪除成員或任何歷史回覆。'));
        list.append(card);
      });updateDestinations();
    };
    append(form,list);renderRoster();
    const add=button('＋ 新增 AI 成員',()=>{if(roster.length>=20)return;roster.push({id:createRequestId(),nickname:`共創夥伴 ${roster.length+1}`,enabled:false,provider:'openai',model:'',ollamaUrl:'http://127.0.0.1:11434'});usage.checked=false;renderRoster();add.disabled=roster.length>=20;},'small',roster.length>=20);
    append(form,add,el('p','composer-hint','最多 20 位成員。停用或變更既有專案綁定成員的模型／位址，會暫停該專案的 AI 操作，直到恢復原設定；不會自動換模型。'),field('系統連線測試成員（不變更專案模型）',active));
    const disclosure=el('section','usage-disclosure');append(disclosure,el('h3','','一次設定，之後由你按下操作就執行'),el('p','',demo?'此頁是固定腳本示範，不會將內容傳出或產生費用。正式系統需同意下列範圍：':'以下是已勾選成員的服務、位址與模型；未勾選成員不會收到內容：'),destinations,el('p','','只有你主動按下送出討論、整理方向、確認生成、比較或融合版本時，才會把專案名稱與說明、目前創作項目的資料、討論、版本目標、作品內容、修改意見及固定引用，傳送給該專案綁定成員的服務。'),el('p','','OpenAI API 費用由你的 API 帳戶另行計費，不包含在 ChatGPT 訂閱中；金額依模型與用量而定。Ollama 使用 PHP 主機的本機服務，該服務仍可能連接雲端、轉送資料或另行收費，取決於你的部署。'),el('p','','不會背景呼叫、不會同時呼叫多個成員，也不會在失敗時自動換模型。勾選後不再逐次彈出詢問；更換服務、位址或模型時需重新確認這份設定。'),append(el('label','usage-consent-label'),usage,el('span','','我同意依上述範圍使用這些成員；之後我主動按下 AI 操作時直接執行，不再逐次詢問。')));
    const validation=el('p','settings-validation','',{id:'member-settings-error',role:'alert'});append(form,disclosure,validation);
    const approved=await showDialog({title:demo?'AI 系統設定 · 離線腳本示範':'完整 AI 系統設定',form,confirmLabel:'保存成員與使用設定',validate:()=>{const reason=memberRosterError(roster);validation.textContent=reason;if(reason){validation.scrollIntoView({behavior:'smooth',block:'center'});return false;}return true;}});
    if(!approved){key.value='';return;}
    let secret=key.value;key.value='';
    const members=roster.map(member=>({id:member.id,nickname:member.nickname.trim(),enabled:!!member.enabled,provider:member.provider,model:member.model.trim(),ollamaUrl:member.ollamaUrl.trim()}));
    settingsDraft={members,activeMemberId:selectedMemberId,usageConsent:usage.checked,expectedSettingsRevision:openedRevision};
    if(openedRevision!==state.settingsRevision){secret='';error='AI 設定已變更，設定草稿仍保留。請重新載入最新設定後再調整，避免覆寫另一個分頁。';render();return;}
    const ok=await mutate('save_members',{...settingsDraft},'AI 成員設定已保存，尚未執行 AI。');
    if(ok)settingsDraft=null;
    if(ok && secret && !demo){const operation=mutate('set_key',{key:secret,model:activeMember(state)?.model || state.model || DEFAULT_MODEL},'金鑰已暫存；可以開始使用已選取的 AI 成員。');secret='';await operation;}secret='';
  }
  async function testConnection() {
    if(demo){flash('離線腳本示範不會建立真實連線。');return;}
    const member=activeMember(state);if(!member || aiSetupReason(state,demo)){error=aiSetupReason(state,demo);render();return;}
    const payload={approvedMemberId:member.id,approvedProvider:member.provider,approvedModel:member.model,approvedSettingsRevision:state.settingsRevision};if(member.provider==='openai')payload.approvedKeyRevision=state.keyRevision;
    await mutate('test_connection',payload);
  }
  async function submitDiscussion(text,{choiceAnswer=null,clearDraft=false}={}) {
    const d=draft();if(!text)return;
    if(new TextEncoder().encode(text).length>4000){flash('這段想法超過 4,000 位元組，請分成較短的段落再送出。草稿仍保留。');return;}
    const officialVersionId=project.officialVersionId || null,baseVersionId=d.basedOnVersionId || officialVersionId,rangeError=refinementRangeError(project,baseVersionId,d.targetItemIds) || refinementNodeError(project,baseVersionId,d.targetNodeId);let revisionVersionId=null;
    if(rangeError){flash(rangeError);return;}
    const payload={id:project.id,revision:project.revision,text,officialVersionId};
    if(baseVersionId){payload.baseVersionId=baseVersionId;if(contentType(project)==='article')payload.targetItemIds=[...d.targetItemIds];if(contentType(project)==='mindmap')payload.targetNodeId=d.targetNodeId;}
    if(choiceAnswer)payload.choiceAnswer=choiceAnswer;
    if(await mutate('discuss',payload,result=>{
      revisionVersionId=result.revisionVersionId || null;
      return revisionVersionId?'新的修改版已保存。你可以繼續修改候選，或閱讀差異後採用；正式版尚未變更。':result.project?.phase==='summary'?'主軸已整理好。閱讀後按「確認方向並生成候選」，或繼續補充想法。':baseVersionId?'討論已保存；這次沒有新增修改版，正式內容維持不變。':'討論已保存。';
    })){if(clearDraft)d.chat='';render();if(revisionVersionId)document.getElementById('revision-review')?.scrollIntoView({behavior:'smooth',block:'start'});}
  }
  async function sendDiscussion() {
    await submitDiscussion(draft().chat.trim(),{clearDraft:true});
  }
  function choiceDisabledReason(message) {
    if(busy)return '正在處理上一個操作，請稍候。輸入中的草稿會保留。';
    if(uncertain)return '請先檢查上次操作的結果，再回應選項。輸入中的草稿會保留。';
    if(!canCreate(project))return '目前項目為唯讀，這些選項僅供查看。';
    if(!currentChoiceQuestion(project,message,{baseVersionId:draft().basedOnVersionId || project.officialVersionId || null,targetItemIds:contentType(project)==='article'?draft().targetItemIds:[],targetNodeId:draft().targetNodeId}))return '這題已不是目前可回應的問題，選項僅供紀錄查看。';
    return refinementRangeError(project,draft().basedOnVersionId || project.officialVersionId,draft().targetItemIds) || refinementNodeError(project,draft().basedOnVersionId || project.officialVersionId,draft().targetNodeId) || aiSetupReason(state,demo,project);
  }
  async function answerChoice(projectId,messageId,choiceId) {
    const message=project?.messages?.at(-1);
    if(project?.id!==projectId || message?.id!==messageId || choiceDisabledReason(message))return;
    const choice=discussionChoices(message).find(option=>option.id===choiceId);if(!choice)return;
    // Do not write into the composer, even temporarily: a choice is a separate explicit reply.
    await submitDiscussion(choice.value,{choiceAnswer:{questionMessageId:message.id,choiceId:choice.id}});
  }
  async function summarizeGoal() {
    await mutate('summarize',{id:project.id,revision:project.revision},'目標整理完成，請先閱讀再確認。');
  }
  async function generate() {
    if(!canConfirmGenerate(project) && !canGenerate(project))return;
    await mutate(canConfirmGenerate(project)?'confirm_generate':'generate',{id:project.id,revision:project.revision,instruction:draft().instruction.trim()},'新候選已加入。只執行這次生成，原本版本與正式版都保留。');
  }
  async function editVersion(version,{focus='editor-title'}={}) {
    if(!canCreate(project) || isArchivedVersion(project,version.id)){flash('請先還原這個版本，再帶入工作區編輯。');return;}
    const d=draft();
    if(d.dirty && !await showDialog({title:'改用這個版本繼續編輯？',body:['目前工作區有尚未保存的修改。改用另一個版本會替換這份編輯草稿；已保存的所有版本都不受影響。'],confirmLabel:'替換編輯草稿'})){render();return;}
    d.artifact=isArtifactType(contentType(project))?cloneArtifact(version.artifact || defaultArtifact(contentType(project))):null;d.items=versionItems(version);d.goalAndRationale=versionGoalAndRationale(version);d.metadataEdited=false;d.basedOnVersionId=version.id;d.targetItemIds=[];d.targetNodeId=version.artifact?.rootId || null;d.artifactUi={};d.artifactPending=false;d.dirty=false;
    render();if(focus){document.getElementById(focus)?.focus();document.getElementById(focus)?.scrollIntoView({behavior:'smooth',block:'center'});}
  }
  async function saveSnapshot(versionMode='major') {
    const d=draft(),base=project.versions.find(v=>v.id===d.basedOnVersionId);
    if(['mindmap','vector'].includes(contentType(project)) && d.artifactPending){flash('請先套用或放棄尚未套用的欄位文字，再保存完整版本。');return;}
    if(combinedMetadataError(d.goalAndRationale)){flash(combinedMetadataError(d.goalAndRationale));return;}
    const typed=isArtifactType(contentType(project)),contentError=typed?validateArtifact(d.artifact,contentType(project)):contentItemsError(d.items,contentType(project));
    if(!canSnapshot(project,d.basedOnVersionId) || contentError){flash(contentError || '請先確認目標或選擇既有來源版本。');return;}
    if((versionMode==='minor' && !base) || (base && isArchivedVersion(project,base.id))){flash('請先選擇一個未封存的來源版本，或還原原本的來源。');return;}
    const target=versionLabel(nextVersionCoordinates(project,versionMode,base));
    const ok=await mutate('snapshot',{id:project.id,revision:project.revision,...(typed?{artifact:cloneArtifact(d.artifact)}:{items:d.items.map(item=>({id:item.id,label:item.label.trim(),content:contentType(project)==='titles'?item.content.trim():item.content}))}),goalAndRationale:d.goalAndRationale,basedOnVersionId:d.basedOnVersionId,versionMode},`已保存 ${target}。原版本沒有被修改，也沒有自動變更正式版。`);
    if(ok){d.basedOnVersionId=project.versions[project.versions.length-1]?.id || d.basedOnVersionId;d.artifactUi={};d.artifactPending=false;d.dirty=false;render();}
  }
  async function archiveVersion(version,restore=false) {
    if(busy || !canCreate(project))return;
    if(!restore && version.id===project.officialVersionId){flash('目前正式版不能封存。請先指定另一個正式版。');return;}
    if(await showDialog({title:restore?`還原 ${versionLabel(version)}？`:`封存 ${versionLabel(version)}？`,body:[restore?'還原後可重新編輯、選為正式版或加入比較，原內容與歷史完全不變。':'封存不會刪除這個版本。內容、來源對話與過往比較都會保留；還原前不能編輯、設為正式版或加入新的比較。'],confirmLabel:restore?'還原版本':'確認封存版本'}))await mutate(restore?'restore_version':'archive_version',{id:project.id,revision:project.revision,versionId:version.id},restore?`${versionLabel(version)} 已還原。`:`${versionLabel(version)} 已封存，隨時可以還原。`);
  }
  async function promote(version,adoptingRevision=false) {
    if(busy)return;
    if(isArchivedVersion(project,version.id)){flash('請先還原這個版本，再設為正式版。');return;}
    const prior=project.versions.find(v=>v.id===project.officialVersionId);
    const body=[contentType(project)==='mindmap'?`將 ${versionLabel(version)}「${version.title}」的完整快照設為正式版；待選建議仍待勾選，不會自動加入心智圖。`:`將 ${versionLabel(version)}「${version.title}」的全部 ${versionItems(version).length} 個項目一起設為正式版。`,prior?`原正式版 ${versionLabel(prior)} 仍會保留為候選，不會刪除或覆寫任何版本。`:'只有你能決定正式版。AI 比較不會自動替你選定。'];
    if(contentType(project)==='titles')body.push(`創作項目會同步更名為「${officialItemTitle(versionItems(version))}」，專案名稱不變。`);
    if(await showDialog({title:adoptingRevision?'採用這次修改為正式版？':'指定這個版本為正式版？',body,confirmLabel:adoptingRevision?'確認採用這次修改':'設為正式版'}))await mutate('promote',{id:project.id,revision:project.revision,versionId:version.id},`${versionLabel(version)} 已設為正式版。你仍可在對話中繼續修改。`);
  }
  async function compare() {
    const ids=[...selected],reason=comparisonDisabledReason(project,ids,{busy,uncertain:!!uncertain,question:draft().question}) || aiSetupReason(state,demo,project);if(reason){comparisonError=reason;render();document.getElementById('comparison-status')?.scrollIntoView({behavior:'smooth',block:'center'});return;}
    comparisonError='';
    if(await mutate('compare',{id:project.id,revision:project.revision,versionIds:ids,question:draft().question.trim()},'比較意見已保存；沒有自動改動正式版。')){selectedComparison=project.comparisons[project.comparisons.length-1]?.id;render();document.getElementById('comparison-section')?.scrollIntoView({behavior:'smooth',block:'center'});}
    else if(error){comparisonError=error;render();document.getElementById('comparison-status')?.scrollIntoView({behavior:'smooth',block:'center'});document.getElementById('compare-question')?.focus();}
  }
  async function fuse(ids=[...selected]) {
    const reason=comparisonDisabledReason(project,ids,{busy,uncertain:!!uncertain,question:draft().fusionQuestion}) || aiSetupReason(state,demo,project);
    if(reason){flash(reason);return;}
    if(await mutate('fuse',{id:project.id,revision:project.revision,versionIds:ids,question:draft().fusionQuestion.trim()},'融合已保存成一個新的大版本候選。來源版本與正式版都沒有變更。')){revealVersion(project.versions.at(-1)?.id);}
  }
  function choose(id,value) {
    if(value && isArchivedVersion(project,id)){flash('已封存版本需先還原，才能加入比較。');render();return;}
    if(value && selected.size>=5){flash('一次最多比較 5 個版本。');render();return;}
    if(value)selected.add(id);else selected.delete(id);render();
  }
  function selection(version) {
    const label=el('label','selection-label');
    const check=el('input','',null,{type:'checkbox',checked:selected.has(version.id),'aria-label':`選取 ${versionLabel(version)} ${version.title} 加入比較`,disabled:busy || isArchivedVersion(project,version.id)});
    check.addEventListener('change',()=>choose(version.id,check.checked));append(label,check,el('span','','加入比較'));return label;
  }
  function linkMessage(messageId,label='查看討論') {
    return button(label,()=>{
      const target=document.getElementById(`message-${messageId}`);if(!target)return;
      target.scrollIntoView({behavior:'smooth',block:'center'});target.classList.add('highlight');setTimeout(()=>target.classList.remove('highlight'),2500);
    },'subtle small');
  }
  function renderHeader(shell) {
    const header=el('header','masthead');
    const brand=el('div','brand');append(brand,el('div','brand-mark','✳',{'aria-hidden':'true'}),append(el('div'),el('div','brand-name','AI共創工作室'),el('div','brand-sub','THINK TOGETHER, CREATE FURTHER')));
    const actions=el('div','header-actions');
    const connection=el('p','connection');append(connection,el('span',`status-dot ${!aiSetupReason(state,demo,project)?'connected':''}`),el('span','',demo?'無連線 · 無費用':project?.aiBinding?`${project.aiBinding.memberNickname} · ${project.aiBinding.model}`:'請為專案選定模型'));
    append(actions,connection,button(demo?'AI 系統設定（示範）':'系統設定',keySettings,'',busy || !!uncertain));
    if(!demo)append(actions,button('測試連線',testConnection,'subtle small',busy || !!uncertain),el('a','button subtle','先看示範',{href:'./demo.html',target:'_blank',rel:'noopener'}));
    append(header,brand,actions);shell.append(header);
    const nav=el('div','module-nav',null,{'aria-label':'創作項目支援狀態'});
    append(nav,el('span','module capability-label','專案裡可以安排：'));
    MODULES.forEach(module=>{const tag=el('span',`module ${module.enabled?'active':''}`,module.label);if(!module.enabled)tag.append(el('span','soon','尚未實作'));nav.append(tag);});shell.append(nav);
    const intro=el('section','page-intro');
    append(intro,append(el('div'),el('p','eyebrow','PROJECT / CREATIVE WORKSPACE'),el('h1','','一個專案，把所有創意串起來。'),el('p','intro-copy','先建立專案，再安排創作項目。各自討論與定稿，需要時引用彼此的成果。')));
    const switcher=el('div','project-switcher');
    const select=el('select','',null,{id:'project-select','aria-label':'切換創作專案',disabled:busy || !!uncertain || !state.projects.length});
    if(!state.projects.length)append(select,el('option','','還沒有創作專案',{value:''}));
    else state.projects.forEach(p=>{const o=el('option','',`${p.title} · ${LIFECYCLE_LABELS[p.lifecycle] || '已建立'}`,{value:p.id});o.selected=p.id===project?.id;select.append(o);});
    select.addEventListener('change',()=>loadProject(select.value));append(switcher,select,button('＋ 新的共創',newProject,'',busy || !!uncertain));append(intro,switcher);shell.append(intro);
    if(demo) {
      const note=el('div','notice demo');append(note,append(el('div'),el('strong','','腳本示範，不是真實 AI'),el('p','','所有回覆事先寫好。完全不呼叫 API、不需要金鑰；重新整理即重設，正式系統才會保存在伺服器。')),button('從空白專案體驗',newProject,'small',busy));shell.append(note);
    }
    if(error)append(shell,append(el('div','notice error',null,{role:'alert'}),el('p','',error),button('關閉提示',()=>{error='';render();},'subtle small')));
    if(uncertain) {
      const box=el('div','notice uncertain',null,{role:'status'});
      append(box,el('strong','','上次操作結果尚未確認'),el('p','','為避免重複計費，沒有自動重試。請先檢查伺服器上的最新紀錄；如需重試，將沿用同一個請求識別碼。'));
      const row=el('div','notice-actions');
      append(row,button('檢查最新狀態',async()=>{
        if(busy)return;busy=true;render();
        try {await refresh();uncertain.checked=true;flash('最新紀錄已載入。請先確認討論和版本是否已新增。');}catch(e){error=e.message;}
        finally{busy=false;render();}
      },'',busy),button('重試同一請求',()=>mutate(uncertain.action,uncertain.payload,'已確認這次操作結果。',{retry:true}),'',busy || !uncertain.checked),button('停止追查，允許新操作',async()=>{if(await showDialog({title:'停止追查這次操作？',body:['先前操作的結果仍可能未知，也可能已經產生費用。這不會取消伺服器正在處理的請求，也不會退款。','後續操作會是另一筆新請求，仍需由你主動按下操作按鈕；可能再次產生費用。若擔心重複，請先核對版本與對話紀錄。'],confirmLabel:'停止追查，繼續使用'})){uncertain=null;error='';render();}},'subtle',busy || !uncertain.checked));append(box,row);shell.append(box);
    }
  }
  async function creativeItemMetadata(edit=false) {
    if(busy || uncertain)return;
    const current=project.activeItem;
    const form=el('form');form.addEventListener('submit',e=>e.preventDefault());
    const type=el('select','',null,{id:'creative-item-type',disabled:edit});
    MODULES.forEach(m=>type.append(el('option','',`${m.label}${m.enabled?'':'（尚未實作，僅可規劃）'}`,{value:m.id})));
    const name=el('input','',null,{id:'creative-item-name',maxlength:'80',required:true,placeholder:'例如：活動命名、主視覺海報'});
    const description=el('textarea','',null,{id:'creative-item-description',maxlength:'4000',rows:'3',placeholder:'這個創作項目要完成什麼？'});
    if(edit){type.value=current.type;name.value=current.title;description.value=current.description || '';}
    append(form,field('創作項目類型',type),field('創作項目名稱',name),field('這個項目的說明',description),el('p','privacy-note','每個創作項目都有自己的討論、目標與版本。尚未實作的類型只能保存規劃與引用，不能呼叫 AI 生成內容。'));
    if(!await showDialog({title:edit?'編輯創作項目':'在專案中新增創作項目',form,confirmLabel:edit?'保存項目資料':'新增創作項目'}))return;
    if(await mutate(edit?'edit_item':'create_item',{id:project.id,revision:project.revision,type:type.value,title:name.value.trim(),description:description.value.trim()},edit?'項目資料已保存。':'創作項目已加入這個專案。')){selected.clear();selectedComparison=null;render();}
  }
  async function selectCreativeItem(itemId) {
    if(itemId===project.activeItemId || busy)return;
    if(await mutate('select_item',{id:project.id,revision:project.revision,itemId},'')){selected.clear();selectedComparison=null;render();}
  }
  async function finalizeWholeProject() {
    if(await showDialog({title:'將整個專案結案定稿？',body:[`「${project.title}」的所有創作項目都必須先定稿。`,'結案後，所有項目的討論與版本都會完整保留。這不會替你挑選任何版本。'],confirmLabel:'確認整個專案結案'}))await mutate('finalize_project',{id:project.id,revision:project.revision},'整個專案已結案定稿。');
  }
  async function reopenWholeProject() {
    if(await showDialog({title:'重新開啟整個專案？',body:['所有定稿紀錄都會保留。需要繼續修改的個別創作項目，仍需另外重新開啟。'],confirmLabel:'重新開啟專案'}))await mutate('reopen_project',{id:project.id,revision:project.revision},'專案已重新開啟，既有定稿仍保留。');
  }
  function renderProjectOverview() {
    const section=el('section','project-overview',null,{'aria-labelledby':'project-heading'});
    const info=el('div','project-info');append(info,el('p','eyebrow','專案'),el('h2','',project.title,{id:'project-heading'}),el('p','project-description',project.description || '尚未填寫專案說明，可以隨時補充背景與用途。'));
    const actions=el('div','project-actions');const lifecycle=project.projectLifecycle || project.lifecycle;
    append(actions,el('span',`badge ${lifecycle==='finalized'?'official':''}`,LIFECYCLE_LABELS[lifecycle] || '已建立'),button('編輯專案',()=>projectMetadata(true),'small',busy || !!uncertain || project.projectLifecycle==='finalized'));
    if(project.creativeItems){
      if(lifecycle==='finalized')actions.append(button('重新開啟專案',reopenWholeProject,'small',busy || !!uncertain));
      else actions.append(button('整個專案結案',finalizeWholeProject,'dark small',busy || !!uncertain || !project.creativeItems.length || project.creativeItems.filter(i=>!i.archived).some(i=>i.lifecycle!=='finalized' || !i.goalApprovedAt || (project.sharedContextRevision!==undefined && i.contextRevision!==project.sharedContextRevision))));
    }
    if(project.projectFinalizations?.length){const history=el('details','finalization-history');append(history,el('summary','',`專案結案紀錄 · ${project.projectFinalizations.length} 次`));project.projectFinalizations.forEach(f=>{const row=el('details');append(row,el('summary','',`${formatDate(f.at)} · ${f.items?.length || 0} 個定稿項目`));f.items?.forEach(i=>append(row,el('p','',`${i.itemTitle} · ${versionLabel(i.versionSnapshot)} · ${i.versionSnapshot?.title || ''}`),renderBundle(i.versionSnapshot)));history.append(row);});info.append(history);}
    append(section,info,actions);return section;
  }
  function renderCreativeItems() {
    if(!project.creativeItems)return el('span');
    const section=el('section','creative-items-panel',null,{'aria-labelledby':'creative-items-heading'});
    append(section,append(el('div','work-heading'),el('h2','','專案中的創作項目',{id:'creative-items-heading'}),button('＋ 新增創作項目',()=>creativeItemMetadata(false),'small',busy || !!uncertain || project.projectLifecycle==='finalized')));
    const list=el('div','creative-item-list');
    project.creativeItems.forEach(item=>{
      const type=MODULES.find(m=>m.id===item.type);
      const card=button('',()=>selectCreativeItem(item.id),`creative-item-tab ${item.id===project.activeItemId?'selected':''}`,busy || !!uncertain);
      card.setAttribute('aria-pressed',String(item.id===project.activeItemId));
      append(card,el('span','item-type-label',`${type?.label || item.type}${type?.enabled?'':' · 尚未實作'}`),el('strong','',item.title),el('span','item-status',item.archived?'已封存':LIFECYCLE_LABELS[item.lifecycle] || '已建立'));list.append(card);
    });section.append(list);
    if(!project.creativeItems.length)section.append(el('p','composer-hint','這個專案還沒有創作項目。先新增一個「標題名稱」，或為其他類型保存規劃。'));
    return section;
  }
  function renderActiveItemHeader() {
    if(!project.activeItem)return null;
    const item=project.activeItem,section=el('section','active-item-header');
    const info=el('div');append(info,el('p','eyebrow',`目前創作項目 / ${MODULES.find(m=>m.id===item.type)?.label || item.type}`),el('h2','',item.title),el('p','project-description',item.description || '這個項目還沒有補充說明。'));
    const actions=el('div','project-actions');append(actions,el('span',`badge ${project.lifecycle==='finalized'?'official':''}`,LIFECYCLE_LABELS[project.lifecycle] || '已建立'),button('編輯項目',()=>creativeItemMetadata(true),'small',busy || !!uncertain || item.archived || project.lifecycle==='finalized' || project.projectLifecycle==='finalized'));
    if(MODULES.some(module=>module.id===item.type && module.enabled) && !item.archived){
      if(project.lifecycle==='finalized')actions.append(button('重新開啟此項目',reopenProject,'small',busy || !!uncertain || project.projectLifecycle==='finalized'));
      else actions.append(button('此項目定稿',finalizeProject,'dark small',busy || !!uncertain || !project.officialVersionId || !project.goalApprovedAt || project.projectLifecycle==='finalized'));
    }
    actions.append(button(item.archived?'還原項目':'封存項目',async()=>{if(await showDialog({title:item.archived?'還原這個創作項目？':'封存這個創作項目？',body:[item.archived?'還原後會重新列入整個專案的結案檢查。所有原有紀錄不變。':'封存可隨時還原，不會刪除內容。封存項目不列入專案結案檢查，適合暫不執行的規劃項目。'],confirmLabel:item.archived?'還原項目':'確認封存'}))await mutate(item.archived?'restore_item':'archive_item',{id:project.id,revision:project.revision},item.archived?'項目已還原。':'項目已封存，所有紀錄仍保留。');},'subtle small',busy || !!uncertain || project.projectLifecycle==='finalized' || (!item.archived && project.creativeItems.filter(i=>!i.archived).length<=1)));
    append(section,info,actions);
    if(item.archived)info.append(el('p','composer-hint','這個項目已封存，只能查看。還原後才能繼續使用。'));
    else if(project.projectLifecycle==='finalized')info.append(el('p','composer-hint','專案已結案。要繼續修改，請先「重新開啟專案」，再「重新開啟此項目」。原定稿紀錄都會保留。'));
    else if(project.lifecycle==='finalized')info.append(el('p','composer-hint','這個項目已定稿。請先按「重新開啟此項目」，就能在對話中修改正式版；原定稿快照會保留。'));
    if(project.finalizations?.length){const details=el('details','finalization-history');append(details,el('summary','',`這個項目的定稿紀錄 · ${project.finalizations.length} 次`));project.finalizations.forEach(f=>{const v=f.versionSnapshot || project.versions.find(v=>v.id===f.versionId);append(details,el('p','',`${formatDate(f.at)} · ${versionLabel(v)} · ${v?.title || '已保存的定稿'}`));});info.append(details);}
    return section;
  }
  async function attachReference() {
    const sources=(project.creativeItems || []).filter(i=>i.id!==project.activeItemId).map(item=>({...item,versions:(item.versions || []).filter(version=>!isArchivedVersion(item,version.id))})).filter(item=>item.versions.length);
    if(!sources.length){flash('其他創作項目沒有可引用的未封存版本。請先保存成果，或到來源項目還原版本；既有固定引用不受影響。');return;}
    const form=el('form');form.addEventListener('submit',e=>e.preventDefault());
    const source=el('select','',null,{id:'reference-source'}),version=el('select','',null,{id:'reference-version'}),preview=el('div','reference-preview');
    sources.forEach(item=>source.append(el('option','',item.title,{value:item.id})));
    function updateVersions(){const item=sources.find(i=>i.id===source.value);version.replaceChildren();item.versions.forEach(v=>version.append(el('option','',`${versionLabel(v)} · ${v.title}${item.officialVersionId===v.id?'（正式版）':''}`,{value:v.id})));updatePreview();}
    function updatePreview(){const item=sources.find(i=>i.id===source.value),v=item.versions.find(v=>v.id===version.value);preview.replaceChildren(renderBundle(v));}
    source.addEventListener('change',updateVersions);version.addEventListener('change',updatePreview);updateVersions();
    append(form,field('來源創作項目',source),field('指定來源版本',version),preview,el('p','privacy-note','只列出未封存版本；沒有可用版本的來源不會列出，請先到來源項目還原。既有固定引用不受封存影響。會複製這個版本的完整項目，作為目前創作項目的固定參考。來源之後更新不會自動改變這份引用；下一次 AI 操作時，這些引用內容也會一併傳送。'));
    if(await showDialog({title:'引用同專案的其他成果',form,confirmLabel:'保存這份固定引用'}))await mutate('attach_reference',{id:project.id,revision:project.revision,targetItemId:source.value,versionId:version.value},'已保存固定引用，來源之後的修改不會自動套用。');
  }
  function renderReferences() {
    if(!project.activeItem)return null;
    const section=el('section','references-panel');
    append(section,append(el('div','work-heading'),el('h3','','引用其他創作項目的成果'),button('＋ 加入引用',attachReference,'small',busy || !!uncertain || project.activeItem.archived || project.lifecycle==='finalized' || project.projectLifecycle==='finalized')));
    const references=project.activeItem.references || [];
    if(!references.length)append(section,el('p','composer-hint','同一專案的名稱、文章或設計可以互相引用。引用的是明確選定的版本，不會隨來源自動改寫。'));
    references.forEach(reference=>{
      const source=project.creativeItems.find(i=>i.id===reference.targetItemId);const version=reference.versionSnapshot || reference.snapshot;
      const card=el('details','reference-card');append(card,el('summary','',`${reference.targetItemTitle || reference.sourceItemTitle || source?.title || '來源項目'} · ${versionLabel(version)} · 固定引用`));
      if(version)card.append(renderBundle(version));else card.append(el('p','',reference.versionId || '已保存的來源版本'));
      card.append(button('移除此引用',async()=>{if(await showDialog({title:'移除這份固定引用？',body:['只會從目前創作項目移除這份引用，不影響來源項目或任何版本。需要重新整理並確認目前目標後才能繼續生成。'],confirmLabel:'移除引用'}))await mutate('remove_reference',{id:project.id,revision:project.revision,referenceId:reference.id},'引用已移除，來源版本不變。');},'subtle small',busy || !!uncertain || project.activeItem.archived || project.lifecycle==='finalized' || project.projectLifecycle==='finalized'));
      section.append(card);
    });return section;
  }
  function renderProjectModel() {
    const section=el('div','project-model'),binding=project.aiBinding;
    if(binding){
      append(section,el('p','field-label','專案固定模型'),el('p','fixed-model',`${binding.memberNickname} · ${binding.provider==='ollama'?'Ollama':'OpenAI'} · ${binding.model}`),el('p','composer-hint','此專案所有項目共用這個模型，不在對話間切換。歷史來源完整保留。'));
    }else{
      const select=el('select','',null,{id:'bind-project-member','aria-label':'為這個專案一次選定 AI 模型',disabled:busy || !!uncertain || !enabledMembers(state).length});
      select.append(el('option','','請選定專案模型',{value:''}));
      enabledMembers(state).forEach(member=>select.append(el('option','',`${member.nickname} · ${member.provider} · ${member.model}`,{value:member.id})));
      append(section,field('舊專案需先一次選定 AI 模型',select),button('選定模型，開始共創',async()=>{if(!select.value){flash('請先選擇這個專案的 AI 成員。');return;}await mutate('bind_project_model',{id:project.id,revision:project.revision,memberId:select.value,expectedSettingsRevision:state.settingsRevision},'此專案模型已固定，原有討論與版本都保留。');},'small',busy || !!uncertain || !enabledMembers(state).length || project.projectLifecycle==='finalized'));
    }
    append(section,el('p','ai-setup-status',aiSetupReason(state,demo,project) || (demo?'固定腳本示範，非真實 AI。':'傳送範圍已同意。只有按下操作按鈕才會執行 AI。'),{id:'ai-setup-status',role:'status'}),button('AI 系統設定',keySettings,'subtle small',busy || !!uncertain));return section;
  }
  function discussionBlocked() { return busy || !canCreate(project) || !!uncertain || !!aiSetupReason(state,demo,project) || !!refinementRangeError(project,draft().basedOnVersionId || project.officialVersionId,draft().targetItemIds) || !!refinementNodeError(project,draft().basedOnVersionId || project.officialVersionId,draft().targetNodeId); }
  function revealVersion(id) {
    let node=document.getElementById(`version-${id}`) || document.getElementById(`tree-version-${id}`);
    for(let parent=node?.parentNode;parent;parent=parent.parentNode)if(parent.tagName==='DETAILS')parent.open=true;
    node?.scrollIntoView({behavior:'smooth',block:'center'});
  }
  function renderConversation() {
    const panel=el('aside','panel dialogue-panel',null,{'aria-labelledby':'dialogue-heading'});
    append(panel,append(el('div','panel-heading dialogue-head'),append(el('div'),el('p','step-label','01 對談'),el('h2','','與 AI 一起釐清方向',{id:'dialogue-heading'}),el('p','panel-subtitle','一次想清楚一件事，對話都留在這裡。')),el('span','badge',`${project.messages.length} 則紀錄`)));
    panel.append(renderProjectModel());
    const list=el('div','conversation',null,{id:'conversation',role:'log','aria-label':'完整討論紀錄','aria-live':'polite','aria-relevant':'additions',tabindex:'0'});
    if(!project.messages.length)append(list,append(el('div','chat-entry'),el('p','chat-role',demo?'腳本引導':'創作起點'),el('p','chat-text','這次的作品要用在哪裡、給誰看？\n可以先說用途。方向足夠時，我會主動整理，讓你決定是否生成。')));
    project.messages.forEach(message=>{
      const card=el('article',`chat-entry ${message.role}`,null,{id:`message-${message.id}`});
      const role=message.role==='student'?'你':message.role==='system'?'共創紀錄':demo?'腳本示範':'AI 共創夥伴';
      append(card,append(el('div','chat-meta'),el('span','chat-role',role),el('time','',formatDate(message.at),{datetime:message.at})),el('p','chat-text',message.text));
      if(message.role==='assistant')card.append(el('p','model-provenance',provenanceLabel(message.provenance)));
      const choices=discussionChoices(message);
      if(choices.length){
        const disabledReason=choiceDisabledReason(message),projectId=project.id,hintId=`choice-hint-${message.id}`;
        const group=el('div','discussion-choices',null,{role:'group','aria-label':message.question,'aria-describedby':hintId});
        group.append(el('p','choice-question',message.question));
        choices.forEach(choice=>{
          const answer=button('',()=>answerChoice(projectId,message.id,choice.id),'choice-answer',!!disabledReason);
          answer.setAttribute('data-choice-id',choice.id);answer.setAttribute('aria-describedby',hintId);
          answer.append(el('span','choice-label',choice.label));
          if(choice.label!==choice.value)answer.append(el('span','choice-value',choice.value));
          group.append(answer);
        });
        group.append(el('p','choice-hint',disabledReason || `按一下即送出單一選項，由目前成員「${projectMember(state,project)?.nickname || ''}」回應；輸入中的草稿會保留，也可以自行打字回答。`,{id:hintId}));card.append(group);
      }
      if(message.role==='student' && message.choiceAnswer?.questionMessageId && project.messages.some(m=>m.id===message.choiceAnswer.questionMessageId)){
        const link=el('a','choice-history-link','查看回應的問題',{href:`#message-${encodeURIComponent(message.choiceAnswer.questionMessageId)}`});card.append(link);
      }
      if(message.versionIds?.length || message.comparisonId) {
        const links=el('div','chat-links');
        message.versionIds?.forEach(id=>{const v=project.versions.find(v=>v.id===id);if(v)links.append(button(`查看 ${versionLabel(v)}`,()=>revealVersion(id),'small'));});
        if(message.comparisonId)links.append(button('查看比較',()=>{selectedComparison=message.comparisonId;render();document.getElementById('comparison-section')?.scrollIntoView({behavior:'smooth',block:'center'});},'small'));
        card.append(links);
      }
      list.append(card);
    });panel.append(list);
    const form=el('form','chat-composer');form.addEventListener('submit',e=>{e.preventDefault();sendDiscussion();});
    const input=el('textarea','',null,{id:'chat-input',maxlength:'6000',rows:'3',placeholder:draft().basedOnVersionId?'描述對所選來源版本的修改，未選段落保持原文…':'寫下你的想法，或回應上一個問題…',disabled:busy || !canCreate(project)});input.value=draft().chat;
    input.addEventListener('input',()=>{draft().chat=input.value;const send=document.getElementById('send-chat');if(send)send.disabled=discussionBlocked() || !input.value.trim();});
    const source=project.versions.find(version=>version.id===(draft().basedOnVersionId || project.officialVersionId));
    append(form,el('label','field-label',source?`以 ${versionLabel(source)} 為來源繼續討論`:'你的想法',{for:'chat-input'}),input,el('p','composer-hint',!canCreate(project)?'目前項目為唯讀，對話完整保留。請先還原或重新開啟。':source?'明確修改會另存完整的小版本，不會自動採用。可直接選擇候選作為來源，不必先設為正式版。':project.phase==='summary'?'方向已準備好，可以確認並生成；你也可以繼續輸入補充，不會自動開始生成。':'方向足夠時，AI 會主動整理。你也可以隨時按「整理目前方向」，不必固定聊滿幾次。'));
    if(source)append(form,el('p','composer-hint',`目前修改來源：${versionLabel(source)}${source.id===project.officialVersionId?' · 正式版':' · 候選'}。在下方工作區的來源選單或版本樹可更換。`),button('選擇來源與修改範圍',()=>{document.getElementById('editor-source')?.focus();document.getElementById('editor-source')?.scrollIntoView({behavior:'smooth',block:'center'});},'subtle small',busy));
    if(source && contentType(project)==='mindmap'){
      const select=el('select','',null,{id:'mindmap-discussion-node',disabled:busy || !!uncertain || !canCreate(project)});
      select.append(el('option','','請選擇已加入圖形的節點',{value:''}));
      (source.artifact?.nodes || []).forEach(node=>select.append(el('option','',node.label,{value:node.id})));select.value=draft().targetNodeId || '';
      select.addEventListener('change',()=>{draft().targetNodeId=select.value || null;render();});
      append(form,el('label','field-label','這次為哪個節點探索子分支？',{for:select.id}),select,el('p','composer-hint','AI 只提供待選子分支，不直接加入圖形。節點名稱、說明及位置可在下方工作區編輯；本次討論以已保存來源為準。'));
    }
    const rangeReason=refinementRangeError(project,source?.id,draft().targetItemIds);if(rangeReason)form.append(el('p','composer-hint range-warning',rangeReason,{role:'status'}));
    if(demo && source && isArtifactType(contentType(project)))form.append(el('p','composer-hint',contentType(project)==='vector'?'固定腳本：標題改為「晨光書屋｜探索版（虛構示範）」。或：將「晨光」的填色改為「#ef8354」。只做明確字串修改，不是真實 AI。':contentType(project)==='mindmap'?'固定腳本：請提供這個節點的子分支示範。只提供事先寫好的虛構建議，不是真實 AI；須勾選並另存才入圖。':contentType(project)==='table'?'固定腳本：請把表格說明改為「新說明」。只逐字替換說明；列與欄的其他修改請用工作區編輯，不是真實 AI。':'固定腳本：請把圖表標題改為「新標題」。只逐字替換標題；流程或數據請用來源文字編輯，不是真實 AI。'));
    if(demo && source && !isArtifactType(contentType(project)))form.append(el('p','composer-hint',contentType(project)==='article'?'固定修改示範：先勾選段落，再輸入「請把選取段落改為「你的新文字」」。僅逐字替換，不是真實 AI。':contentType(project)==='short_text'?'固定修改示範：請把全文改為「你的新文字」。僅逐字替換，不是真實 AI。':'固定修改示範：請把第一項內容改為「你的新文字」，或請把本版目標改為「你的新目標」。僅逐字替換，不是真實 AI。'));
    const actions=el('div','composer-actions');
    const send=button(busy?'處理中…':'送出想法 ↗',sendDiscussion,'primary',discussionBlocked() || !draft().chat.trim());send.id='send-chat';
    append(actions,button('整理目前方向',summarizeGoal,'small',busy || !canSummarize(project) || !!uncertain || !!aiSetupReason(state,demo,project)),send);append(form,actions);panel.append(form);return panel;
  }
  function renderGoal() {
    const box=el('section','panel goal-panel',null,{'aria-labelledby':'goal-heading'}),ready=canConfirmGenerate(project),approved=canGenerate(project);
    append(box,append(el('div','goal-title'),append(el('div'),el('p','step-label','02 主軸與方向'),el('h2','','這次要完成的方向',{id:'goal-heading'})),el('span',`badge ${ready?'pending':''}`,ready?'方向已備妥':project.goalApprovedAt?'方向已確認':'討論進行中')));
    if(!project.brief)box.append(el('p','goal-intro','先談用途、對象與核心重點。AI 判斷方向足夠後，會主動在這裡整理，等待你確認並生成，不會一直追問或自動生成。'));
    else {
      box.append(el('p','goal-summary',project.brief.summary));
      if(contentType(project)!=='titles'){
        const details=el('details','direction-details');append(details,el('summary','','查看內容範圍與限制'));
        const grid=el('dl','brief-grid');[['purpose','使用情境'],['audience','主要對象'],['message','核心訊息'],['tone','文字語氣'],['constraints','需要注意']].forEach(([key,label])=>append(grid,append(el('div','brief-item'),el('dt','',label),el('dd','',readable(project.brief[key])))));
        append(details,grid);if(project.brief.items?.length)details.append(el('p','composer-hint',`內容範圍：${project.brief.items.map(item=>item.label).join('、')}`));box.append(details);
      }
      box.append(el('p','goal-note',ready?'主軸已足夠，可以進行下一步。若想再討論，直接輸入即可；只有按下按鈕才會生成。':approved?'新候選會另外保存，不會取代正式版。各版的目標、意見與來源也各自保留。':'這是上次整理的方向。請繼續補充或重新整理，確認最新內容後再生成。'));
    }
    const controls=el('div','generation-control'),instruction=el('input','',null,{id:'generate-instruction',maxlength:'1000',placeholder:'這一輪想補充的方向（可留空）',disabled:busy || (!ready && !approved)});
    instruction.value=draft().instruction;instruction.addEventListener('input',()=>{draft().instruction=instruction.value;});
    const generateButton=button(ready?'確認方向並生成候選 ↗':project.versions.length?'再產生一組候選 ↗':'確認方向並生成候選 ↗',generate,'primary wide',busy || !!uncertain || (!ready && !approved) || !!aiSetupReason(state,demo,project));generateButton.id='confirm-generate';
    append(controls,field('生成前可補充的方向',instruction),generateButton,el('p','composer-hint',demo?'按一下僅執行一次固定腳本示範，不是真實 AI。':'按一下會確認目前方向並執行一次生成，依固定模型計費。不會自動連續生成。'));
    if(aiSetupReason(state,demo,project))controls.append(el('p','ai-setup-status',aiSetupReason(state,demo,project)));box.append(controls);return box;
  }
  function renderRevisionReview() {
    const version=newestPendingRevision(project);if(!version)return null;
    const base=project.versions.find(v=>v.id===version.basedOnVersionId),changes=revisionChanges(base,version),changed=changes.filter(item=>item.kind!=='unchanged'),goalChanged=versionGoalText(base)!==versionGoalText(version);
    const section=el('section','panel revision-review',null,{id:'revision-review','aria-labelledby':'revision-heading'});
    append(section,append(el('div','work-heading'),append(el('div'),el('p','step-label','最新修改 · 等你決定'),el('h2','','先看這次修改，再決定是否採用',{id:'revision-heading'})),el('span','badge pending','待審閱，尚未採用')));
    const card=el('article','revision-full-bundle',null,{id:`revision-version-${version.id}`});
    append(card,el('p','revision-lineage',`${versionLabel(base)} 來源版 → ${versionLabel(version)} ${versionSourceLabel(version,demo)}`),el('p','composer-hint',`正式版${project.officialVersionId?`仍是 ${versionLabel(project.versions.find(v=>v.id===project.officialVersionId))}`:"尚未指定"}。以下是修改後的完整 ${versionItems(version).length} 項。`),el('p','pending-revision-hint','可直接以這個候選繼續修改，不必先採用。來源與所有修改版都會保留在版本樹。'),renderBundle(version),renderVersionContext(version),el('p','model-provenance',provenanceLabel(version.provenance)));
    const diff=el('div','revision-diff');append(diff,el('h3','',`本次差異 · ${changed.length} 項有變動，${changes.length-changed.length} 項維持不變${goalChanged?'；本版目標有更新':''}`));
    changed.forEach(change=>{
      const row=el('div','revision-diff-item',null,{'data-item-id':change.id});
      append(row,el('p','field-label',`${change.after?.label || change.before?.label} · ${change.kind==='added'?'新增':change.kind==='removed'?'移除':'修改'}`));
      const columns=el('div','revision-diff-columns');
      [['修改前',change.before],['修改後',change.after]].forEach(([label,item])=>append(columns,append(el('div'),el('p','diff-side-label',label),el('p','diff-content',item?`${item.label}\n${item.content}`:'（沒有這個項目）'))));
      append(row,columns);diff.append(row);
    });
    if(goalChanged){
      const row=el('div','revision-diff-item goal-diff');append(row,el('p','field-label','本版目標 · 修改'));
      const columns=el('div','revision-diff-columns');
      [['修改前的目標',base],['修改後的目標',version]].forEach(([label,value])=>append(columns,append(el('div'),el('p','diff-side-label',label),el('p','diff-content',versionGoalText(value) || '（未保存目標文字）'))));append(row,columns);diff.append(row);
    }
    if(!changed.length && !goalChanged)diff.append(el('p','composer-hint','這份版本沒有可見的內容或目標差異，請查看來源對話確認原因。'));
    append(card,diff,append(el('div','card-actions'),button('採用這次修改',()=>promote(version,true),'primary',busy || !!uncertain || !canCreate(project)),button('請 AI 修改這一版',()=>editVersion(version,{focus:'chat-input'}),'small',busy || !!uncertain || !canCreate(project)),button('先手動調整這一版',()=>editVersion(version),'small',busy || !!uncertain || !canCreate(project)),selection(version),linkMessage(version.messageId,'查看修改對話')));
    if(!canCreate(project))card.append(el('p','composer-hint','目前為唯讀，請先重新開啟或還原項目，才能採用這份修改。'));
    append(section,card);return section;
  }
  function comparisonReadyNote() { return aiSetupReason(state,demo,project) || (demo?'可以執行固定腳本示範，不是真實 AI 評估。':`按下比較將直接由「${projectMember(state,project)?.nickname || ''}」執行，使用已同意的傳送範圍。`); }
  function renderOfficial() {
    const section=el('section','official-overview',null,{id:'official-section','aria-labelledby':'official-heading'});
    const official=project.versions.find(v=>v.id===project.officialVersionId);
    const status=project.activeItem?.archived?'已封存 · 唯讀':project.lifecycle==='finalized'?'已定稿':official?'討論中 · 可繼續修改':'尚未指定正式版';
    append(section,append(el('div','work-heading'),append(el('div'),el('h2','','正式版',{id:'official-heading'}),el('p','panel-subtitle','目前採用的完整內容。修改來源可以另外選擇；候選不會自動取代正式版。')),el('span','badge official-status',status,{id:'official-status'})));
    if(!official){
      append(section,append(el('div','official-empty'),el('h3','','目前尚未指定正式版'),el('p','',project.versions.length?'從下方候選選擇「設為正式版」後，這裡會顯示目前採用的內容與版本。':'先與 AI 討論並產生候選，或保存自己的版本，再明確選為正式版。')));return section;
    }
    section.setAttribute('data-view-key',`${project.id}:${project.activeItemId}:${official.id}`);
    const card=el('article','official-card',null,{id:`version-${official.id}`});
    const content=append(el('div','official-content',null,{id:'official-content',role:'region','aria-label':'目前正式版完整創作內容',tabindex:'0'}),renderBundle(official,true));
    const context=el('details','official-details',null,{id:'official-details'});append(context,el('summary','','本版目標、修改意見與模型來源'),renderVersionContext(official),official.provenance?el('p','model-provenance',provenanceLabel(official.provenance)):null);
    append(card,append(el('div','official-top'),el('span','badge official',`正式版 · ${versionLabel(official)}`),selection(official)),content,context);
    if(newestPendingRevision(project))card.append(el('p','pending-revision-hint','有待審閱的修改，尚未取代目前正式版。請在下方查看差異，再決定是否採用。'));
    append(card,el('p','composer-hint','想請 AI 改內容：在對話中提出具體修改，閱讀新修改版後再採用。想自己改：按「手動編輯這一版」，修改後另存。兩種方式都會保留原版。'),append(el('div','card-actions'),button('請 AI 繼續修改',()=>editVersion(official,{focus:'chat-input'}),'primary small',busy || !!uncertain || !canCreate(project)),button('手動編輯這一版',()=>editVersion(official),'subtle small',busy || !!uncertain || !canCreate(project)),linkMessage(official.messageId)));
    section.append(card);return section;
  }
  function renderVersions() {
    const section=el('section','versions-section',null,{'aria-labelledby':'versions-heading'});
    append(section,append(el('div','work-heading'),append(el('div'),el('p','step-label','03 候選'),append(el('h2','',null,{id:'versions-heading'}),document.createTextNode('候選與版本樹'),el('span','counter',`${project.versions.length} 個版本`))),el('span','badge','保存後不覆寫')));
    if(!project.versions.length)append(section,append(el('div','empty-state'),el('div','empty-symbol','✧',{'aria-hidden':'true'}),el('h3','','方向清楚，就能開始創作'),el('p','','閱讀主軸後按「確認方向並生成候選」。所有候選都會保留，只有你可以指定正式版。')));
    const tree=el('div','version-tree',null,{id:'version-tree','aria-label':'依大版本分組的完整版本歷程'}),groups=new Map(),pending=newestPendingRevision(project);
    project.versions.forEach(version=>{const {major}=versionCoordinates(version);if(!groups.has(major))groups.set(major,[]);groups.get(major).push(version);});
    [...groups].sort(([a],[b])=>b-a).forEach(([major,versions])=>{
      const group=el('details','version-major',null,{id:`version-major-${major}`,'data-tree-key':`${project.id}:${project.activeItemId}:major:${major}`});
      group.open=major===Math.max(...groups.keys()) || versions.some(version=>version.id===project.officialVersionId);
      append(group,el('summary','version-major-heading',`V${major} · ${versions.length} 個版本${versions.some(version=>version.id===project.officialVersionId)?' · 包含正式版':''}`));
      versions.sort((a,b)=>versionCoordinates(a).minor-versionCoordinates(b).minor).forEach(version=>{
        const official=version.id===project.officialVersionId,archived=isArchivedVersion(project,version.id),base=project.versions.find(v=>v.id===version.basedOnVersionId),minor=versionCoordinates(version).minor;
        const node=el('article',`version-card tree-version ${minor?'minor-version':''} ${archived?'archived-version':''} ${selected.has(version.id)?'selected':''}`,null,{id:`${official?'tree-version':'version'}-${version.id}`});
        const heading=el('div','version-top');append(heading,el('strong','',versionLabel(version)),el('span',`badge ${official?'official':archived?'archived':'pending'}`,official?'正式版':archived?'已封存':'候選'),el('span','',versionSourceLabel(version,demo)),archived?null:selection(version));node.append(heading);
        const fusion=(version.fusionSourceVersionIds || []).map(id=>versionLabel(project.versions.find(v=>v.id===id))).join('、');
        append(node,el('p','version-lineage',fusion?`融合來源：${fusion}`:base?`實際來源：${versionLabel(base)} → ${versionLabel(version)}`:'獨立大版本起點'),el('p','version-source',`${version.title || versionItems(version)[0]?.content || ''} · ${formatDate(version.createdAt)}`));
        if(version.id===pending?.id)node.append(el('p','composer-hint','最新修改候選，尚未採用。可直接選為下一次微調來源。'));
        const details=el('details','version-content-details',null,{'data-tree-key':`${project.id}:${project.activeItemId}:content:${version.id}`});
        append(details,el('summary','',official?'查看正式版內容與來源紀錄':'查看完整內容與來源紀錄'),renderBundle(version),renderVersionContext(version),version.provenance?el('p','model-provenance',provenanceLabel(version.provenance)):null);node.append(details);
        const actions=el('div','card-actions');
        if(archived)actions.append(button('還原版本',()=>archiveVersion(version,true),'small',busy || !!uncertain || !canCreate(project)));
        else append(actions,button('以此版繼續微調',()=>editVersion(version,{focus:'chat-input'}),'small',busy || !!uncertain || !canCreate(project)),button('編輯',()=>editVersion(version),'subtle small',busy || !!uncertain || !canCreate(project)),official?button('查看頂端正式版',()=>document.getElementById('official-section')?.scrollIntoView({behavior:'smooth',block:'start'}),'subtle small'):button('設為正式版',()=>promote(version),'subtle small',busy || !!uncertain || !canCreate(project)),official?null:button('封存',()=>archiveVersion(version),'subtle small',busy || !!uncertain || !canCreate(project)));
        append(actions,linkMessage(version.messageId,'來源對話'));node.append(actions);group.append(node);
      });tree.append(group);
    });section.append(tree);
    if(project.versions.length>=2) {
      const toolbar=el('div','compare-toolbar'),prompt=el('div');append(prompt,el('p','',`已選 ${selected.size} 個版本`),el('small','','比較與融合是獨立操作，都需選 2–5 個未封存版本。'));
      const question=el('input','',null,{id:'compare-question',maxlength:'2000','aria-label':'本次比較想特別注意什麼','aria-describedby':'comparison-status',placeholder:'比較重點（最多 2,000 位元組，可留空）',disabled:busy});question.value=draft().question;
      question.addEventListener('input',()=>{draft().question=question.value;comparisonError='';const reason=comparisonDisabledReason(project,[...selected],{busy,uncertain:!!uncertain,question:question.value}) || aiSetupReason(state,demo,project),status=document.getElementById('comparison-status'),submit=document.getElementById('compare-versions');if(submit)submit.disabled=!!reason;if(status){status.textContent=reason || comparisonReadyNote();status.className=`comparison-status ${reason?'blocked':''}`;}question.setAttribute('aria-invalid',comparisonQuestionError(question.value)?'true':'false');});
      const reason=comparisonDisabledReason(project,[...selected],{busy,uncertain:!!uncertain,question:draft().question}) || aiSetupReason(state,demo,project);
      const compareButton=button(demo?'執行腳本比較示範 ↗':'請 AI 提供比較意見 ↗',compare,'',!!reason);compareButton.id='compare-versions';compareButton.setAttribute('aria-describedby','comparison-status');
      append(toolbar,prompt,el('p','comparison-basis-note',COMPARISON_SNAPSHOT_NOTE),question,compareButton,el('p',`comparison-status ${reason || comparisonError?'blocked':''}`,[...new Set([comparisonError,reason].filter(Boolean))].join(' ') || comparisonReadyNote(),{id:'comparison-status',role:'status'}));
      const fusionBox=el('div','fusion-controls');const fusionQuestion=el('input','',null,{id:'fuse-question',maxlength:'2000','aria-label':'融合方向','aria-describedby':'fusion-status',placeholder:'想保留哪些優點、如何融合（可留空）',disabled:busy});fusionQuestion.value=draft().fusionQuestion;
      const fusionReason=()=>comparisonDisabledReason(project,[...selected],{busy,uncertain:!!uncertain,question:draft().fusionQuestion}) || aiSetupReason(state,demo,project);
      const fuseButton=button('融合所選版本為新候選 ↗',()=>fuse(),'primary',!!fusionReason());fuseButton.id='fuse-versions';fuseButton.setAttribute('aria-describedby','fusion-status');
      fusionQuestion.addEventListener('input',()=>{draft().fusionQuestion=fusionQuestion.value;const reason=fusionReason();fuseButton.disabled=!!reason;const status=document.getElementById('fusion-status');if(status)status.textContent=reason || '此按鈕另行呼叫 AI，建立一個新的大版本候選；不會直接採用。';fusionQuestion.setAttribute('aria-invalid',comparisonQuestionError(fusionQuestion.value)?'true':'false');});
      append(fusionBox,field('獨立融合，不等於比較或採用',fusionQuestion),fuseButton,el('p','composer-hint',fusionReason() || (demo?'僅示範固定腳本組合，不代表真實 AI 融合效果。':'此按鈕另行呼叫 AI，建立一個新的大版本候選；不會直接採用。'),{id:'fusion-status',role:'status'}));append(toolbar,fusionBox);section.append(toolbar);
    }
    return section;
  }
  function renderVersionContext(version) {
    const context=el('section','version-context',null,{'aria-label':`${versionLabel(version)} 的目標與變更紀錄`});
    const source=version?.goalSource==='user'?'自行修正':version?.goalSource==='ai'?(demo?'固定腳本整理':'AI 整理'):'來源未記錄';
    append(context,el('p','context-label',`本版目標與修改意見 · ${source}`),el('p','context-copy',versionGoalAndRationale(version) || '此版本未保存目標與修改意見。'));
    if(typeof version?.goalAndRationale!=='string')append(context,el('p','context-copy context-missing','依舊版保存的目標、變更摘要與修改意見合併呈現，原始紀錄未改寫。'));
    if(version?.discussionMessageIds?.length)append(context,el('p','context-label',`已關聯 ${version.discussionMessageIds.length} 則討論`));
    else append(context,el('p','context-copy context-missing','未記錄獨立的討論關聯；仍可查看既有來源對話。'));
    return context;
  }
  function downloadArtifact(version,format) {
    try {const file=exportArtifact(version.artifact,format),url=URL.createObjectURL(new Blob([file.text],{type:file.mime}));const link=el('a','',null,{href:url,download:`${versionLabel(version)}-${file.filename}`});document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){flash(e.message || '匯出未完成，原版本沒有改動。');}
  }
  function renderBundle(version,official=false) {
    if(isArtifactType(version?.contentType || contentType(project))){
      const wrap=el('div','artifact-bundle');
      if(!version?.artifact){wrap.append(el('p','empty-small','此版本缺少結構化作品資料，無法安全預覽；沒有補造內容。'));return wrap;}
      try{wrap.append(renderArtifact(version.artifact,{document}));}catch(e){wrap.append(el('p','inline-error',e.message || '結構化作品無法預覽。'));return wrap;}
      const tools=el('div','artifact-downloads');
      const sourceFormat=version.artifact.chartType==='flowchart'?'mmd':'tsv';
      for(const format of version.artifact.kind==='table'?['csv','tsv']:['mindmap','vector'].includes(version.artifact.kind)?['svg','json','txt']:['svg',sourceFormat])tools.append(button(`匯出 ${format.toUpperCase()}`,()=>downloadArtifact(version,format),'subtle small',false));
      if(version.artifact.kind==='chart')tools.append(button('複製文字來源',async()=>{try{if(!navigator.clipboard?.writeText)throw new Error(`此瀏覽器無法直接複製，請匯出 ${sourceFormat.toUpperCase()} 後自行複製文字。`);await navigator.clipboard.writeText(exportArtifact(version.artifact,sourceFormat).text);flash('已複製本版文字來源；外部工具的匯入規格需自行核對，不會自動同步。');}catch(e){flash(e.message || `複製未完成，請改用 ${sourceFormat.toUpperCase()} 匯出。`);}},'subtle small',false));
      append(wrap,tools,el('p','composer-hint','匯出與複製都只處理這個已保存版本，不呼叫 AI、不改正式版。'+(version.artifact.kind==='vector'?'SVG 保留幾何圖形與文字物件，可在支援 SVG 的工具繼續編輯；形坊的匯入規格尚未驗證，不會自動連動。':version.artifact.kind==='mindmap'?'待選分支不會畫進作品；完整 JSON 同時保留待選建議與已加入節點。':version.artifact.chartType==='flowchart'?'流程圖支援受限 Mermaid 文字語法；外部工具的相容性尚未驗證。':'試算表文字匯出會為可能的公式文字加前置單引號；完整原始文字仍保存在專案 JSON。')));return wrap;
    }
    const bundle=el('div',`naming-bundle ${official?'official-bundle':''} ${(version?.contentType || contentType(project))==='titles'?'':'text-content-bundle'}`);
    versionItems(version).forEach((item,index)=>{
      const entry=el('div',`bundle-item content-tone-${index%4}`,null,{'data-item-id':item.id});
      append(entry,el('p','bundle-item-label',`作品內容 · ${item.label}`),el(index===0?'h3':'p',index===0?(official?'official-title':'version-title'):'bundle-item-content',item.content));bundle.append(entry);
    });return bundle;
  }
  function renderEditor() {
    const d=draft(),base=project.versions.find(v=>v.id===d.basedOnVersionId),type=contentType(project);
    const section=el('section',`panel editor-panel ${type!=='titles'?'text-editor-panel':''}`,null,{'aria-labelledby':'editor-heading'});
    append(section,append(el('div','work-heading'),append(el('div'),el('p','step-label','版本微調工作區'),el('h2','','編輯創作內容',{id:'editor-heading'})),el('span','badge',d.dirty?'尚未保存':'自由修改')));
    append(section,el('p','editor-provenance',base?`延續 ${versionLabel(base)}。儲存會另建一份完整的新版本，不會修改來源。`:type==='vector'?'可編輯幾何圖形、文字、色彩與圖層順序，明確另存才建立新版本。':type==='mindmap'?'編輯已加入節點、整理階層和待選建議，明確另存才會建立新版本。':isArtifactType(type)?'編輯完整結構化作品。列、欄、資料來源與預覽會一起保存成新版本。':type==='short_text'?'每個版本完整保存一篇短文。':type==='article'?'每段都有固定識別碼；AI 僅修改你勾選的段落，其餘段落原文保留。':'每個版本保存名稱、Slogan 與既有自訂內容的完整一組欄位。'));
    const source=el('select','',null,{id:'editor-source','aria-label':'選擇 AI 與手動微調的來源版本',disabled:busy || !!uncertain || !canCreate(project)});
    source.append(el('option','',project.officialVersionId?'未指定手動來源（AI 仍以目前正式版為起點）':'未指定來源（先討論方向／手動只可另存大版本）',{value:''}));
    project.versions.forEach(version=>{if(isArchivedVersion(project,version.id) && version.id!==d.basedOnVersionId)return;const option=el('option','',`${versionLabel(version)}${version.id===project.officialVersionId?' · 目前正式版':''}${isArchivedVersion(project,version.id)?' · 已封存，需先還原':''} · ${version.title}`,{value:version.id,disabled:isArchivedVersion(project,version.id)});option.selected=version.id===d.basedOnVersionId;source.append(option);});
    source.value=d.basedOnVersionId || '';
    source.addEventListener('change',async()=>{const chosen=project.versions.find(v=>v.id===source.value);if(chosen)await editVersion(chosen,{focus:'editor-source'});else{d.basedOnVersionId=null;d.targetItemIds=[];d.targetNodeId=null;render();}});
    append(section,field('工作來源版本（AI／手動微調共用）',source),el('p','composer-hint','候選不必先採用，也能直接微調。AI 修改固定另存小版本；手動修改可另存大版或小版，兩種都不覆寫來源。'));
    if(type==='article' && base){
      const range=el('fieldset','refinement-range',null,{'aria-describedby':'refinement-range-note'});append(range,el('legend','','這次請 AI 修改哪些段落？'));
      versionItems(base).forEach(item=>{const label=el('label','range-choice'),check=el('input','',null,{id:`refine-target-${item.id}`,type:'checkbox',checked:d.targetItemIds.includes(item.id),disabled:busy || !!uncertain || !canCreate(project) || isArchivedVersion(project,base.id)});check.addEventListener('change',()=>{if(check.checked){if(!d.targetItemIds.includes(item.id))d.targetItemIds.push(item.id);}else d.targetItemIds=d.targetItemIds.filter(id=>id!==item.id);render();});append(label,check,el('span','',item.label));range.append(label);});
      append(range,el('p','composer-hint',`已選 ${d.targetItemIds.length} 段。沒有預設全選；未選段落保持原文。這個範圍只控制 AI 微調，下方手動欄位仍是完整版本。`,{id:'refinement-range-note'}));section.append(range);
    }
    if(base)append(section,button('回到對談提出修改',()=>{document.getElementById('chat-input')?.focus();document.getElementById('chat-input')?.scrollIntoView({behavior:'smooth',block:'center'});},'subtle small',busy || !canCreate(project)));
    const contentError=()=>['mindmap','vector'].includes(type) && d.artifactPending?'請先套用或放棄尚未套用的欄位文字，再保存完整版本。':isArtifactType(type)?validateArtifact(d.artifact,type):contentItemsError(d.items,type);
    const blocked=()=>busy || !!uncertain || !!combinedMetadataError(d.goalAndRationale) || !!contentError() || !canSnapshot(project,d.basedOnVersionId) || (!!base && isArchivedVersion(project,base.id));
    const update=()=>{d.dirty=true;const save=document.getElementById('save-snapshot'),minor=document.getElementById('save-minor');if(save)save.disabled=blocked();if(minor)minor.disabled=blocked() || !base;const status=document.getElementById('draft-status');if(status)status.textContent=combinedMetadataError(d.goalAndRationale) || contentError() || '草稿尚未保存。重新整理頁面會遺失草稿。';};
    if(isArtifactType(type)){
      section.append(renderArtifactEditor(d.artifact,{document,disabled:busy || !!uncertain || !canCreate(project),idPrefix:'artifact-editor',uiState:d.artifactUi,onPendingChange:pending=>{const changed=d.artifactPending!==pending;d.artifactPending=pending;if(changed)update();},onChange:value=>{d.artifact=cloneArtifact(value);if(!validateArtifact(d.artifact,type))d.items=artifactItems(d.artifact);update();}}));
      section.append(el('p','composer-hint',type==='vector'?'向量由獨立圖形物件組成，可選取並修改位置、尺寸、色彩、文字及圖層順序。套用至草稿後仍須明確另存；目前不支援任意 SVG 匯入、曲線或外部圖片。':type==='mindmap'?'AI 提供的分支預設不加入圖中。選取節點可編輯或整理；勾選想要的建議再加入草稿，最後明確另存新版本。':type==='table'?'表格是獨立的列、欄、儲存格資料；每次保存保留完整結構，不把它當一般文字欄位。':'圖表由下方文字資料即時預覽。可修改來源，再保存完整新版本；不自動同步任何外部工具，圖坊的匯入規格尚未核對。'));
    }else{
    const items=el('div','editor-items');
    d.items.forEach((item,index)=>{
      const row=el('div',`editor-item content-tone-${index%4}`);
      const heading=el('div','editor-item-heading');
      row.append(el('p','bundle-item-label',type==='article'?`作品內容 · 段落 ${index+1}`:type==='short_text'?'作品內容 · 全文':`作品內容 · 內容欄位 ${index+1}`));
      const label=el('input','',null,{id:`item-label-${item.id}`,maxlength:'40','aria-label':type==='article'?`第 ${index+1} 段的名稱`:`第 ${index+1} 個內容欄位的名稱`,placeholder:type==='article'?'段落名稱':'內容欄位名稱，例如：作品簡介',disabled:busy || !canCreate(project) || type==='short_text'});label.value=item.label;
      label.addEventListener('input',()=>{item.label=label.value;update();});
      append(heading,el('span','item-number',String(index+1).padStart(2,'0')),label,button(type==='article'?'移除段落':'移除',()=>{d.items.splice(index,1);d.dirty=true;render();},'subtle small',busy || !canCreate(project) || d.items.length===1 || type==='short_text'));
      const text=el('textarea','editor-item-content',null,{id:index===0?'editor-title':`item-content-${item.id}`,maxlength:type==='short_text'?'12000':'6000',rows:type==='short_text'?'12':type==='article'?'7':index===0?'2':'3','aria-label':`${item.label || `第 ${index+1} 項`}的內容`,placeholder:type==='short_text'?'在這裡編輯完整短文…':type==='article'?'在這裡編輯這一段…':'寫下這個內容欄位的文字…',disabled:busy || !canCreate(project)});text.value=item.content;text.addEventListener('input',()=>{item.content=text.value;update();});
      append(row,heading,text);items.append(row);
    });section.append(items);
    if(type==='article')append(section,button('＋ 新增段落',()=>{let number=d.items.length+1;const name=()=>type==='article'?`第 ${number} 段`:`自訂內容 ${number}`;while(d.items.some(item=>item.label.trim()===name()))number++;d.items.push({id:createRequestId(),label:name(),content:''});d.dirty=true;render();},'small',busy || !!uncertain || !canCreate(project) || d.items.length>=(type==='article'?80:12)));
    append(section,el('p','composer-hint',type==='short_text'?'短文固定保存「全文」一欄，最多 12,000 位元組，超過時請先縮短；不會自動截斷。':type==='article'?'下方是完整文章的手動編輯：可改文字、段落名稱或新增／移除段落，另存後才成為新版本。現有段落保留識別碼，新增段落取得新識別碼。AI 微調則只改上方勾選範圍。最多 80 段，每段 6,000、整篇 120,000 位元組，不會自動截斷。':'所有現有欄位與自訂內容會保存到新版本，每欄最多 6,000 位元組、合計 24,000 位元組。'));

    }

    const metadata=el('textarea','editor-note',null,{id:'editor-goal',maxlength:'12000',rows:'4',placeholder:'這個版本想達成什麼？你修改了哪些地方、為什麼？可在同一欄自由整理。',disabled:busy || !canCreate(project)});metadata.value=d.goalAndRationale;metadata.addEventListener('input',()=>{d.goalAndRationale=metadata.value;d.metadataEdited=true;update();});
    append(section,field('本版目標與修改意見',metadata),el('p','composer-hint','從所選來源版本帶入，舊版目標、變更摘要與修改意見會完整合併，不重複相同文字。另存後隨本版保存，不改動來源或套用目前共用目標；最多 12,000 位元組。'));
    const save=button(`另存新版本 ${versionLabel(nextVersionCoordinates(project))}`,()=>saveSnapshot('major'),'dark',blocked());save.id='save-snapshot';
    const minor=button(`另存小修改 ${base?versionLabel(nextVersionCoordinates(project,'minor',base)):'V?.?'}`,()=>saveSnapshot('minor'),'',blocked() || !base);minor.id='save-minor';minor.setAttribute('aria-describedby','minor-version-hint');
    append(section,el('p','composer-hint',base?isArchivedVersion(project,base.id)?'編輯來源已封存。草稿仍保留，請先還原來源或改選其他版本。':`小修改將從 ${versionLabel(base)} 另存為 ${versionLabel(nextVersionCoordinates(project,'minor',base))}；不會修改來源或目前正式版。`:'請先選擇來源版本，才能另存小修改。',{id:'minor-version-hint'}));
    append(section,append(el('div','editor-footer'),el('p','save-state',combinedMetadataError(d.goalAndRationale) || contentError() || (!canCreate(project)?'目前項目為唯讀。還原或重新開啟後才能修改作品。':!canSnapshot(project,d.basedOnVersionId)?'先確認創作目標，才能保存新版本。':d.dirty?'草稿尚未保存。重新整理頁面會遺失草稿。':'按下另存才會建立完整版本，不會自動升為正式版。'),{id:'draft-status',role:'status'}),append(el('div','editor-save-actions'),save,minor)));return section;
  }
  function renderComparison() {
    if(!project.comparisons.length)return null;
    const comparison=project.comparisons.find(c=>c.id===selectedComparison) || project.comparisons[project.comparisons.length-1];
    const section=el('section','panel comparison-panel',null,{id:'comparison-section','aria-labelledby':'comparison-heading'});
    const heading=el('div','work-heading');append(heading,append(el('div'),el('p','step-label','獨立比較'),el('h2','','比較意見，不是替你決定',{id:'comparison-heading'})),el('span','badge',`${comparison.versionIds.length} 個版本`));section.append(heading);
    if(project.comparisons.length>1) {
      const select=el('select','',null,{'aria-label':'選擇過往比較',id:'comparison-select'});
      project.comparisons.forEach((c,index)=>{const option=el('option','',`比較 ${index+1} · ${c.versionIds.map(id=>versionLabel(project.versions.find(v=>v.id===id))).join(' / ')} · ${formatDate(c.createdAt)}`,{value:c.id});option.selected=c.id===comparison.id;select.append(option);});
      select.addEventListener('change',()=>{selectedComparison=select.value;render();});section.append(select);
    }
    if(comparison.goalBasis==='version_snapshots')append(section,el('p','privacy-note',COMPARISON_SNAPSHOT_NOTE));
    append(section,el('p','comparison-intro',comparison.summary));
    const grid=el('div','comparison-grid');
    comparison.items.forEach(item=> {
      const version=project.versions.find(v=>v.id===item.versionId);
      const card=el('article','comparison-item');append(card,el('h3','',`${versionLabel(version)} · ${version?.title || '版本'}`));
      [['fit',comparison.goalBasis==='version_snapshots'?'本版目標契合':'目標契合'],['strength','優點'],['tradeoff','取捨'],['suggestion','修改方向']].forEach(([key,label])=>append(card,append(el('p'),el('strong','',`${label}　`),document.createTextNode(readable(item[key])))));
      if(version?.artifact)card.append(renderBundle(version));
      if(version)append(card,button('選此版繼續微調',()=>editVersion(version,{focus:'chat-input'}),'subtle small',busy || !!uncertain || !canCreate(project) || isArchivedVersion(project,version.id)));
      if(version && isArchivedVersion(project,version.id))card.append(el('p','composer-hint','此版本已封存。比較紀錄仍保留，請先還原版本才能編輯。'));grid.append(card);
    });section.append(grid);
    append(section,el('p','model-provenance',provenanceLabel(comparison.provenance)),el('p','comparison-foot','這份意見對照當時的目標與已保存版本；之後的修改不會改寫這次比較。'),linkMessage(comparison.messageId,'查看這次比較的對話紀錄'));
    const details=el('details','comparison-foot');append(details,el('summary','',comparison.goalBasis==='version_snapshots'?'查看各版本保存的目標與修改意見':'查看比較當時的目標'));
    if(comparison.goalBasis==='version_snapshots'){
      append(details,el('p','',COMPARISON_SNAPSHOT_NOTE));
      (comparison.versionGoalSnapshots || []).forEach(entry=>{
        const label=versionLabel(project.versions.find(v=>v.id===entry.versionId));
        append(details,el('p','context-label',`${label} 的本版目標與修改意見`),el('p','context-copy',versionGoalAndRationale(entry) || '此版本未保存目標與修改意見。'));
      });
    }else details.append(el('p','',readable(comparison.goalSnapshot?.summary)));
    section.append(details);
    const useSources=button('將這組版本選入融合區',()=>{selected.clear();comparison.versionIds.forEach(id=>selected.add(id));render();document.getElementById('fuse-question')?.focus();document.getElementById('fuse-question')?.scrollIntoView({behavior:'smooth',block:'center'});},'small',busy || !!uncertain || !validComparison(comparison.versionIds,project) || !canCreate(project));
    append(section,useSources,el('p','composer-hint','比較只提供意見。可選一個版本繼續微調，或到融合區另外按下生成新候選；不會自動融合或採用。'));return section;
  }
  function downloadProject() {
    if(!project)return;
    const blob=new Blob([JSON.stringify(exportProject(project),null,2)],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=el('a','',null,{href:url,download:`AI共創工作室-${project.title.replace(/[\\/:*?"<>|]/g,'_').slice(0,60)}.json`});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function render() {
    if(!state)return;
    const active=document.activeElement;
    const focus=active?.id?{id:active.id,start:active.selectionStart,end:active.selectionEnd}:null;
    const oldOfficial=document.getElementById('official-section'),oldOfficialKey=oldOfficial?.getAttribute('data-view-key');
    if(oldOfficialKey)officialViews.set(oldOfficialKey,{scrollTop:document.getElementById('official-content')?.scrollTop || 0,open:!!document.getElementById('official-details')?.open});
    root.querySelectorAll('details').forEach(node=>{const key=node.getAttribute('data-tree-key');if(key)treeViews.set(key,!!node.open);});
    const oldList=document.getElementById('conversation');
    const scroll=oldList?{top:oldList.scrollTop,count:oldList.querySelectorAll('article').length,atBottom:oldList.scrollHeight-oldList.scrollTop-oldList.clientHeight<60}:null;
    const shell=el('div','app-shell');renderHeader(shell);
    if(project){shell.append(renderProjectOverview());shell.append(renderCreativeItems());const activeHeader=renderActiveItemHeader();if(activeHeader)shell.append(activeHeader);}
    if(!project) {
      append(shell,append(el('main','empty-state',null,{id:'workspace'}),el('div','empty-symbol','✳'),el('h2','','把一個想法，變成一組可能。'),el('p','','先建立專案，讓每段討論、每個版本都有自己的位置。'),button('建立第一個專案',newProject,'primary',busy)));
    } else if(project.creativeItems && !project.activeItem) {
      append(shell,append(el('main','empty-state',null,{id:'workspace'}),el('h2','','先選擇一個創作項目'),el('p','','一個專案可以包含多個創作項目，各自留下討論與版本。'),button('新增第一個創作項目',()=>creativeItemMetadata(false),'primary',busy || project.projectLifecycle==='finalized')));
    } else if(project.activeItem && !MODULES.some(module=>module.id===project.activeItem.type && module.enabled)) {
      append(shell,append(el('main','placeholder-workspace',null,{id:'workspace'}),append(el('section','empty-state'),el('h2','',project.activeItem.archived?'這個規劃項目已封存':'這個類型尚未實作'),el('p','','目前只保存項目規劃與引用。尚未提供此類型的 AI 對話、生成、比較或定稿功能，不會假裝已能產生這類成果。')),renderReferences()));
    } else {
      const main=el('main','item-workspace',null,{id:'workspace','aria-busy':String(busy)}),layout=el('div','workspace-layout');
      const work=el('div','work-column');append(work,renderRevisionReview(),renderReferences(),renderGoal(),renderVersions(),renderEditor(),renderComparison());append(layout,renderConversation(),work);append(main,renderOfficial(),layout);shell.append(main);
    }
    const footer=el('footer','footer');append(footer,el('p','',demo?'SCRIPTED DEMO · 示範內容只在本頁記憶體，重整即重設。':'專案保存在這個安裝網站的 SQLite 資料庫；編輯草稿需按「另存為新版本」才會保存。'));
    if(project)append(footer,button('匯出此專案 JSON',downloadProject,'subtle small',busy));shell.append(footer);
    root.replaceChildren(shell);
    root.querySelectorAll('details').forEach(node=>{const key=node.getAttribute('data-tree-key');if(key && treeViews.has(key))node.open=treeViews.get(key);});
    const officialState=officialViews.get(document.getElementById('official-section')?.getAttribute('data-view-key'));
    if(officialState){const content=document.getElementById('official-content'),details=document.getElementById('official-details');if(details)details.open=officialState.open;if(content)content.scrollTop=officialState.scrollTop;}
    const newList=document.getElementById('conversation');
    if(newList){if(!scroll || (project.messages.length>scroll.count && scroll.atBottom))newList.scrollTop=newList.scrollHeight;else newList.scrollTop=scroll.top;}
    if(focus){const next=document.getElementById(focus.id);if(next && !next.disabled){next.focus({preventScroll:true});if(typeof next.setSelectionRange==='function' && focus.start!==null){try{next.setSelectionRange(focus.start,focus.end);}catch(_){}}}}
  }
  async function boot() {
    try {await refresh({keepProject:false});render();}
    catch(e){const box=el('main','panel load-error');append(box,el('h1','','AI共創工作室還沒準備好'),el('p','',e.message),button('重新讀取',boot,'primary'),el('p','composer-hint','請確認已完成網頁安裝，並從 public/index.php 開啟。'));root.replaceChildren(box);}
  }
  globalThis.addEventListener('beforeunload',event=> {
    if([...drafts.values()].some(d=>d.dirty || d.chat.trim()) || busy || uncertain){event.preventDefault();event.returnValue='';}
  });
  await boot();
  return {reload:async()=>{await refresh();render();},getProject:()=>project};
}
if(typeof document!=='undefined' && document.body?.dataset.appMode==='live')createTitleApp();
