/** AI 共創室: local PHP-backed UI. No key or project content is written to browser storage. */
export const DEFAULT_MODEL = 'gpt-5.4-mini';
export const MODULES = [
  {id:'titles',label:'標題名稱',enabled:true},
  {id:'article',label:'文章',enabled:false},
  {id:'poster',label:'海報設計',enabled:false},
  {id:'webpage',label:'網頁設計',enabled:false},
  {id:'interactive',label:'互動程式',enabled:false}
];
const CREATIVE = new Set(['discuss','summarize','approve_goal','generate','snapshot','promote','compare']);
export const LIFECYCLE_LABELS = {created:'已建立',in_progress:'討論中',finalized:'已定稿'};
export function canCreate(project) { return !!project && project.lifecycle !== 'finalized' && project.projectLifecycle !== 'finalized' && !project.activeItem?.archived && (!('creativeItems' in project) || project.activeItem?.type==='titles'); }
const PAID = new Set(['discuss','summarize','generate','compare']);
const ACTION_LABELS = {discuss:'繼續討論',summarize:'整理目標',generate:'產生候選標題',compare:'比較選定版本'};
export function createRequestId(provider = globalThis.crypto) {
  if (!provider || !provider.getRandomValues) throw new Error('瀏覽器無法建立安全請求識別碼，請使用新版瀏覽器或 localhost。');
  return Array.from(provider.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2,'0')).join('');
}
export function versionItems(version) {
  if(Array.isArray(version?.items))return version.items.map(item=>({...item}));
  return version?.title?[{id:'legacy-title',label:'中文名稱',content:version.title}]:[];
}
export function validItems(items) {
  if(!Array.isArray(items) || items.length<1 || items.length>12)return false;
  const bytes=value=>new TextEncoder().encode(value).length;
  return new Set(items.map(item=>item.id)).size===items.length && new Set(items.map(item=>typeof item.label==='string'?item.label.trim():item.label)).size===items.length && items.every(item=>typeof item.id==='string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(item.id) && typeof item.label==='string' && item.label.trim() && bytes(item.label)<=120 && typeof item.content==='string' && item.content.trim() && bytes(item.content)<=6000) && items.reduce((total,item)=>total+bytes(item.content),0)<=24000;
}
export function canSummarize(project) { return canCreate(project) && project.messages.filter(m => m.role === 'student' && (!m.kind || m.kind==='discussion')).length >= 3; }
export function canGenerate(project) { return !!(canCreate(project) && project.goalApprovedAt && ['ready','work'].includes(project.phase)); }
export function canSnapshot(project) { return !!(canCreate(project) && (project.goalApprovedAt || project.versions?.some(v=>v.id===project.officialVersionId))); }
export function newestPendingRevision(project) {
  if(!project?.officialVersionId)return null;
  const adopted=new Set((project.messages || []).filter(m=>['promotion','promote'].includes(m.kind)).flatMap(m=>m.versionIds || []));
  return [...project.versions].reverse().find(v=>v.source==='revision' && v.basedOnVersionId===project.officialVersionId && v.id!==project.officialVersionId && !adopted.has(v.id)) || null;
}
export function revisionChanges(base,version) {
  const before=versionItems(base),after=versionItems(version),ids=[...new Set([...before,...after].map(item=>item.id))];
  return ids.map(id=>{const from=before.find(item=>item.id===id),to=after.find(item=>item.id===id);return {id,before:from,after:to,kind:!from?'added':!to?'removed':from.label!==to.label || from.content!==to.content?'changed':'unchanged'};});
}
export function versionSourceLabel(version,demo=false) { return version.source==='revision'?(demo?'腳本修改版':'AI 討論修改版'):version.source==='generated'?(demo?'腳本候選':'AI 候選'):'手動保存'; }
export function validComparison(ids, project) {
  return Array.isArray(ids) && ids.length >= 2 && ids.length <= 5 && new Set(ids).size === ids.length && ids.every(id => project?.versions.some(v => v.id === id));
}
export function provenanceLabel(value) {
  if(!value)return '模型來源未記錄';
  if(value.provider==='scripted')return '固定腳本 · 非 AI';
  const provider=value.provider==='ollama'?'Ollama':value.provider==='openai'?'OpenAI':value.provider;
  return `${provider} · ${value.requestedModel}${!value.actualModel?'（實際模型未回報）':value.actualModel!==value.requestedModel?`（實際：${value.actualModel}）`:''}`;
}
export function versionLabel(version) { return version ? `V${version.number}` : '未指定'; }
export function exportProject(project) {
  // An explicit allowlist prevents accidentally exporting connection/session fields.
  const {id,title,description,lifecycle,projectLifecycle,activeItemId,creativeItems,projectFinalizedAt,projectFinalizations,module,phase,revision,messages,brief,goalApprovedAt,versions,officialVersionId,finalizedVersionId,finalizedAt,finalizations,comparisons} = project;
  return {format:'ai-cocreation-project',formatVersion:1,exportedAt:new Date().toISOString(),project:{id,title,description,lifecycle,projectLifecycle,activeItemId,creativeItems,projectFinalizedAt,projectFinalizations,module,phase,revision,messages,brief,goalApprovedAt,versions,officialVersionId,finalizedVersionId,finalizedAt,finalizations,comparisons}};
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
    if (!response.ok || data.error) {
      const detail = typeof data.error === 'string' ? data.error : data.error?.message;
      throw new ApiError(detail || data.message || '操作未完成，請稍後檢查。',response.status,data,PAID.has(action) && response.status >= 500);
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
  let state=null,project=null,busy=false,error='',toastTimer=null,uncertain=null,selectedComparison=null,quickChoice=null;
  const selected=new Set(),drafts=new Map();
  const draft=()=> {
    const id=project?`${project.id}:${project.activeItemId || 'default'}`:'_empty';
    if(!drafts.has(id)) drafts.set(id,{chat:'',items:[{id:createRequestId(),label:'中文名稱',content:''}],rationale:'',basedOnVersionId:null,dirty:false,instruction:'',question:''});
    return drafts.get(id);
  };
  function flash(message) {
    document.getElementById('app-toast')?.remove();clearTimeout(toastTimer);
    const node=el('div','toast',message,{id:'app-toast',role:'status'});document.body.append(node);
    toastTimer=setTimeout(()=>node.remove(),5200);
  }
  function applyProject(p) {
    project=p;
    const ids=new Set(p.versions.map(v=>v.id));
    [...selected].forEach(id=>{if(!ids.has(id))selected.delete(id);});
    const item={id:p.id,title:p.title,description:p.description,lifecycle:p.projectLifecycle || p.lifecycle,module:p.module,phase:p.phase,updatedAt:new Date().toISOString()};
    state.projects=[item,...state.projects.filter(x=>x.id!==p.id)];
    if(selectedComparison && !p.comparisons.some(c=>c.id===selectedComparison))selectedComparison=null;
  }
  function showDialog({title,body,confirmLabel='確認',danger=false,form=null}) {
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
        close(true);
      },danger?'danger':'primary'));
      append(content,actions);dialog.append(content);document.body.append(dialog);
      dialog.addEventListener('cancel',event=>{event.preventDefault();close(false);},{once:true});
      dialog.showModal();
      if(form)form.querySelector('input,textarea')?.focus();
      else actions.querySelector('button')?.focus();
    });
  }
  async function consent(action,ids=[],prior=null) {
    const consentState=prior?{...state,provider:prior.approvedProvider,model:prior.approvedModel}:state;
    const body=el('div');
    if(demo) {
      append(body,el('p','',`這是「${ACTION_LABELS[action]}」的腳本示範，不是真實 AI。`),el('p','privacy-note','不連線、不使用金鑰、不產生 API 費用。回覆使用固定腳本，不會理解或推論你的文字。正式版的修改示範只支援明確指定第一項的新文字，其餘項目會原樣保留。'));
    } else if(consentState.provider==='ollama') {
      append(body,el('p','',`即將透過 Ollama 使用 ${consentState.model} ${ACTION_LABELS[action]}。`),el('p','',`專案名稱與說明、目前創作項目名稱與說明，以及此項目的討論、目標、相關版本與固定引用，將傳送到你指定的本機服務 ${state.ollamaUrl || 'http://127.0.0.1:11434'}。`),el('p','privacy-note','本程式不會直接呼叫 OpenAI。Ollama 服務是否另外連接雲端、代理服務或產生費用，取決於你的部署設定，請自行確認。取消不會送出，草稿仍會保留。'));
      if(action==='generate')body.append(el('p','','這次生成只會新增候選，不會取代現有候選、正式版或定稿紀錄。'));
    } else {
      append(body,el('p','',`即將使用 ${consentState.model || DEFAULT_MODEL} ${ACTION_LABELS[action]}。`));
      const scope=action==='compare' ? `目前創作項目的討論、目標與固定引用，以及選定的 ${ids.length} 個版本` : '目前創作項目的討論文字、目標、相關版本與你加入的固定引用內容';
      append(body,el('p','',`專案名稱與說明、目前創作項目名稱與說明，以及${scope}會傳送至 OpenAI。請勿輸入個資、機密或尚未取得使用許可的內容。`),el('p','privacy-note','這次操作會使用你的 OpenAI API 帳戶，可能產生費用。實際金額依模型、輸入與輸出用量計算，此處無法提供確切費用。取消不會送出，草稿會保留。'));
      if(action==='generate')body.append(el('p','','目標確認不等於同意生成。只有按下本次確認，才會產生新候選；現有候選與正式版都會保留。'));
    }
    if(action==='discuss' && project?.officialVersionId)body.append(el('p','privacy-note','這次討論可能以目前正式版為基礎，新增一份完整的待審修改版；資訊不足時只會追問。正式版不會自動變更或定稿，必須由你閱讀後明確採用。尚未採用的修改不會自動帶入下一次討論。'));
    return showDialog({title:demo?'執行腳本示範？':consentState.provider==='ollama'?'確認本次 Ollama 呼叫':'確認本次 OpenAI 呼叫',body,confirmLabel:demo?'執行示範':'同意傳送並執行'});
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
      if(paid && !demo && state.provider!=='ollama' && !state.keyPresent) {busy=false;render();await keySettings();return false;}
      if(paid) {
        if(!await consent(action,payload.versionIds || [],options.retry?uncertain.payload:null))return false;
        if(options.retry) body={...uncertain.payload};
        else {body={...body,consent:true,approvedProvider:state.provider || 'openai',approvedModel:state.model || DEFAULT_MODEL,approvedSettingsRevision:state.settingsRevision,requestId:createRequestId()};if(state.provider!=='ollama')body.approvedKeyRevision=state.keyRevision;}
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
      if(paid && e.uncertain) uncertain={action,payload:body,checked:false};
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
    const input=el('input','',null,{id:'project-name',maxlength:'80',required:true,placeholder:'例如：校園影像展主標題'});
    const description=el('textarea','',null,{id:'project-description',maxlength:'4000',rows:'4',placeholder:'這次創作的背景、用途或想完成的事…'});
    if(edit){input.value=project.title;description.value=project.description || '';}
    append(form,field('專案名稱（不是創作內容）',input),field('專案說明',description),el('p','privacy-note',edit?'修改專案名稱或說明後，各創作項目都需要重新整理並確認目標。已有的對話、版本與定稿紀錄都會保留。':'每個專案分開保存對話、候選、正式版與比較。建立專案不會呼叫 AI。專案說明會作為後續 AI 討論的背景。'));
    if(!await showDialog({title:edit?'編輯專案資料':'建立新的創作專案',form,confirmLabel:edit?'保存專案資料':'建立專案'}))return;
    const payload={title:input.value.trim(),description:description.value.trim()};
    if(edit){payload.id=project.id;payload.revision=project.revision;}
    if(await mutate(edit?'edit_project':'new',payload,edit?'專案資料已保存。':'新專案已建立，先從一個問題開始。')){if(!edit){selected.clear();selectedComparison=null;}render();}
  }
  const newProject=()=>projectMetadata(false);
  async function finalizeProject() {
    const version=project.versions.find(v=>v.id===project.officialVersionId);
    if(!version)return;
    if(await showDialog({title:'將這個創作項目定稿？',body:[`將創作項目「${project.activeItem?.title || project.title}」以 ${versionLabel(version)}「${version.title}」的整組 ${versionItems(version).length} 個項目結案定稿。`,'定稿後可以查看與匯出所有紀錄，不能繼續修改作品。需要再創作時，可明確選擇重新開啟討論，原定稿紀錄仍完整保留。'],confirmLabel:'確認結案定稿'}))await mutate('finalize',{id:project.id,revision:project.revision},'這個創作項目已定稿。完整紀錄仍可隨時開啟。');
  }
  async function reopenProject() {
    if(await showDialog({title:'重新開啟這個創作項目的討論？',body:['原本的定稿、版本與對話都會保留。重新開啟後可以繼續討論、編輯與比較，不會自動改動正式版。'],confirmLabel:'重新開啟討論'}))await mutate('reopen',{id:project.id,revision:project.revision},'創作項目已重新開啟，原定稿紀錄仍保留。');
  }
  async function keySettings() {
    if(demo){flash('腳本示範不需要 API 金鑰，也不會建立 OpenAI 或 Ollama 連線。');return;}
    if(busy || uncertain)return;
    const form=el('form');form.addEventListener('submit',e=>e.preventDefault());
    const provider=el('select','',null,{id:'ai-provider'});
    append(provider,el('option','','OpenAI API（雲端，可能產生費用）',{value:'openai'}),el('option','','Ollama（指定的本機服務）',{value:'ollama'}));provider.value=state.provider || 'openai';
    const key=el('input','',null,{id:'api-key',type:'password',autocomplete:'off',spellcheck:'false',autocapitalize:'none',placeholder:state.keyPresent?'已有金鑰；留空即可沿用':'貼上你的 OpenAI API 金鑰'});
    const model=el('input','',null,{id:'api-model',maxlength:'120',required:true,autocomplete:'off',spellcheck:'false'});model.value=state.model || DEFAULT_MODEL;
    const url=el('input','',null,{id:'ollama-url',maxlength:'200',autocomplete:'off',spellcheck:'false'});url.value=state.ollamaUrl || 'http://127.0.0.1:11434';
    const openai=el('div'),ollama=el('div');
    append(openai,field('OpenAI API 金鑰',key),el('p','privacy-note','金鑰最多可使用 30 分鐘；到期後於下次請求清理，建議用完立即清除。金鑰暫存在這個安裝網站的伺服器，不會寫入專案、匯出檔或瀏覽器儲存空間。請只在你信任的本機 localhost 網站貼上。'));
    if(state.keyPresent)append(openai,el('p','',state.keyExpiresAt?`目前金鑰可使用至 ${formatDate(state.keyExpiresAt)}；到期後於下次請求清理。`:'目前工作階段已有金鑰。'),button('清除目前伺服器金鑰',async()=>{key.value='';form.closest('dialog').dispatchEvent(new Event('cancel',{cancelable:true}));await mutate('clear_key',{},'目前工作階段的金鑰已清除。');},'danger small'));
    append(ollama,el('p','privacy-note','Ollama 服務必須從安裝 PHP 的同一台主機之本機位址存取，並先備妥模型。localhost 指安裝主機，不一定是瀏覽器所在電腦。模型運算是否外連或另行收費，取決於你自己的 Ollama 部署。'));
    const advanced=el('details','settings-details');
    const urlField=field('Ollama 服務網址',url);
    const catalog=addModelCatalog(model,provider.value,'settings-model-catalog');
    append(advanced,el('summary','','模型與進階設定'),field('模型名稱',model),catalog,urlField,el('p','composer-hint','Ollama 僅支援本機 http 位址：localhost、127.0.0.1 或 [::1]，連接埠 1024–65535，不可加路徑。'));
    const toggle=()=>{const local=provider.value==='ollama';openai.hidden=local;ollama.hidden=!local;urlField.hidden=!local;url.disabled=!local;key.disabled=local;};
    provider.addEventListener('change',()=>{model.value=provider.value===(state.provider || 'openai')?state.model || DEFAULT_MODEL:provider.value==='ollama'?'qwen3:8b':DEFAULT_MODEL;key.value='';const replacement=addModelCatalog(model,provider.value,'settings-model-catalog');form.querySelector('#settings-model-catalog')?.replaceWith(replacement);toggle();});toggle();
    append(form,el('p','','先選擇 AI 來源。保存設定不會執行生成；每次討論、整理、生成與比較都會另外請你確認。'),field('AI 來源',provider),openai,ollama,advanced);
    const approved=await showDialog({title:'AI 系統設定',form,confirmLabel:'保存設定，不執行 AI'});
    if(!approved){key.value='';return;}
    let secret=key.value;key.value='';
    const selectedProvider=provider.value,selectedModel=model.value.trim(),selectedUrl=url.value.trim();
    const ok=await mutate('save_settings',{provider:selectedProvider,model:selectedModel,ollamaUrl:selectedUrl},'AI 來源設定已保存，尚未呼叫模型。');
    if(ok && selectedProvider==='openai' && secret){const operation=mutate('set_key',{key:secret,model:selectedModel},'金鑰已暫存。可按「測試連線」檢查模型是否可用。');secret='';await operation;}
    secret='';
  }
  async function testConnection() {
    if(demo){flash('這是離線腳本示範，沒有可測試的真實連線。');return;}
    if(state.provider!=='ollama' && !state.keyPresent){flash('請先到系統設定貼上金鑰。');await keySettings();return;}
    const payload={approvedProvider:state.provider || 'openai',approvedModel:state.model || DEFAULT_MODEL,approvedSettingsRevision:state.settingsRevision};
    if(state.provider!=='ollama')payload.approvedKeyRevision=state.keyRevision;
    await mutate('test_connection',payload);
  }
  async function switchNextModel() {
    if(!quickChoice || busy)return;
    const ok=await mutate('save_settings',{provider:quickChoice.provider,model:quickChoice.model.trim(),ollamaUrl:state.ollamaUrl || 'http://127.0.0.1:11434'},'下一次 AI 操作將使用新設定；之前的回覆來源不變。');
    if(ok){quickChoice=null;render();}
  }
  function addModelCatalog(input,provider,id) {
    const list=el('datalist','',null,{id});
    const names=state.modelCatalog?.[provider] || [provider==='ollama'?'qwen3:8b':DEFAULT_MODEL];
    [...new Set(names)].forEach(name=>list.append(el('option','',null,{value:name})));
    input.setAttribute('list',id);return list;
  }
  async function sendDiscussion() {
    const d=draft(),text=d.chat.trim();if(!text)return;
    if(new TextEncoder().encode(text).length>4000){flash('這段想法超過 4,000 位元組，請分成較短的段落再送出。草稿仍保留。');return;}
    const officialVersionId=project.officialVersionId || null;let revisionVersionId=null;
    if(await mutate('discuss',{id:project.id,revision:project.revision,text,officialVersionId},result=>{
      revisionVersionId=result.revisionVersionId || null;
      return revisionVersionId?'新的修改版已保存，請閱讀完整內容與差異，再決定是否採用。正式版尚未變更。':officialVersionId?'討論已保存；這次沒有新增修改版，正式內容維持不變。':'討論已保存。';
    })){d.chat='';render();if(revisionVersionId)document.getElementById('revision-review')?.scrollIntoView({behavior:'smooth',block:'start'});}
  }
  async function summarizeGoal() {
    await mutate('summarize',{id:project.id,revision:project.revision},'目標整理完成，請先閱讀再確認。');
  }
  async function approveGoal() {
    if(await showDialog({title:'這就是這次的創作目標嗎？',body:[project.brief?.summary || '請確認工作區中的目標內容。','確認後不會自動產生標題。你仍可補充方向，再另外決定是否呼叫 AI 產生候選。'],confirmLabel:'確認目標，不生成'}))
      await mutate('approve_goal',{id:project.id,revision:project.revision},'目標已確認。你可以另外選擇產生候選。');
  }
  async function generate() {
    await mutate('generate',{id:project.id,revision:project.revision,instruction:draft().instruction.trim()},'新候選已加入，原本的版本與正式版都保留。');
  }
  async function editVersion(version) {
    if(!canCreate(project))return;
    const d=draft();
    if(d.dirty && !await showDialog({title:'改用這個版本繼續編輯？',body:['目前工作區有尚未保存的修改。改用另一個版本會替換這份編輯草稿；已保存的所有版本都不受影響。'],confirmLabel:'替換編輯草稿'}))return;
    d.items=versionItems(version);d.rationale=version.rationale || '';d.basedOnVersionId=version.id;d.dirty=false;
    render();document.getElementById('editor-title')?.focus();
  }
  async function saveSnapshot() {
    const d=draft();
    const ok=await mutate('snapshot',{id:project.id,revision:project.revision,items:d.items.map(item=>({id:item.id,label:item.label.trim(),content:item.content.trim()})),rationale:d.rationale.trim(),basedOnVersionId:d.basedOnVersionId},'已另存新版本。原版本沒有被修改。');
    if(ok){d.basedOnVersionId=project.versions[project.versions.length-1]?.id || d.basedOnVersionId;d.dirty=false;render();}
  }
  async function promote(version,adoptingRevision=false) {
    if(busy)return;
    const prior=project.versions.find(v=>v.id===project.officialVersionId);
    const body=[`將 ${versionLabel(version)}「${version.title}」的全部 ${versionItems(version).length} 個項目一起設為正式版。`,prior?`原正式版 ${versionLabel(prior)} 仍會保留為候選，不會刪除或覆寫任何版本。`:'只有你能決定正式版。AI 比較不會自動替你選定。'];
    if(await showDialog({title:adoptingRevision?'採用這次修改為正式版？':'指定這整組版本為正式版？',body,confirmLabel:adoptingRevision?'確認採用這次修改':'設為正式版'}))await mutate('promote',{id:project.id,revision:project.revision,versionId:version.id},`${versionLabel(version)} 已設為正式版。你仍可在對話中繼續修改。`);
  }
  async function compare() {
    const ids=[...selected];if(!validComparison(ids,project))return;
    if(await mutate('compare',{id:project.id,revision:project.revision,versionIds:ids,question:draft().question.trim()},'比較意見已保存；沒有自動改動正式版。')){selectedComparison=project.comparisons[project.comparisons.length-1]?.id;render();document.getElementById('comparison-section')?.scrollIntoView({behavior:'smooth',block:'center'});}
  }
  function choose(id,value) {
    if(value && selected.size>=5){flash('一次最多比較 5 個版本。');render();return;}
    if(value)selected.add(id);else selected.delete(id);render();
  }
  function selection(version) {
    const label=el('label','selection-label');
    const check=el('input','',null,{type:'checkbox',checked:selected.has(version.id),'aria-label':`選取 ${versionLabel(version)} ${version.title} 加入比較`,disabled:busy});
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
    const brand=el('div','brand');append(brand,el('div','brand-mark','✳',{'aria-hidden':'true'}),append(el('div'),el('div','brand-name','AI 共創室'),el('div','brand-sub','THINK TOGETHER, CREATE FURTHER')));
    const actions=el('div','header-actions');
    const connection=el('p','connection');append(connection,el('span',`status-dot ${state.provider==='ollama' || state.keyPresent?'connected':''}`),el('span','',demo?'無連線 · 無費用':state.provider==='ollama'?`Ollama · ${state.model}`:state.keyPresent?`OpenAI · ${state.model || DEFAULT_MODEL}`:'尚未設定 AI 來源'));
    append(actions,connection,button(demo?'腳本示範說明':'系統設定',keySettings,'',busy || !!uncertain));
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
      },'',busy),button('重試同一請求',()=>mutate(uncertain.action,uncertain.payload,'已確認這次操作結果。',{retry:true}),'',busy || !uncertain.checked),button('停止追查，允許新操作',async()=>{if(await showDialog({title:'停止追查這次操作？',body:['先前操作的結果仍可能未知，也可能已經產生費用。這不會取消伺服器正在處理的請求，也不會退款。','後續操作會是另一筆新請求，仍需要你另外確認；可能再次產生費用。若擔心重複，請先核對版本與對話紀錄。'],confirmLabel:'停止追查，繼續使用'})){uncertain=null;error='';render();}},'subtle',busy || !uncertain.checked));append(box,row);shell.append(box);
    }
  }
  async function creativeItemMetadata(edit=false) {
    if(busy || uncertain)return;
    const current=project.activeItem;
    const form=el('form');form.addEventListener('submit',e=>e.preventDefault());
    const type=el('select','',null,{id:'creative-item-type',disabled:edit});
    MODULES.forEach(m=>type.append(el('option','',`${m.label}${m.enabled?'':'（尚未實作，僅可規劃）'}`,{value:m.id})));
    const name=el('input','',null,{id:'creative-item-name',maxlength:'80',required:true,placeholder:'例如：活動整組名稱、主視覺海報'});
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
    if(item.type==='titles' && !item.archived){
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
    const sources=(project.creativeItems || []).filter(i=>i.id!==project.activeItemId && i.versions?.length);
    if(!sources.length){flash('其他創作項目還沒有可引用的版本。請先在其他項目保存成果。');return;}
    const form=el('form');form.addEventListener('submit',e=>e.preventDefault());
    const source=el('select','',null,{id:'reference-source'}),version=el('select','',null,{id:'reference-version'}),preview=el('div','reference-preview');
    sources.forEach(item=>source.append(el('option','',item.title,{value:item.id})));
    function updateVersions(){const item=sources.find(i=>i.id===source.value);version.replaceChildren();item.versions.forEach(v=>version.append(el('option','',`${versionLabel(v)} · ${v.title}${item.officialVersionId===v.id?'（正式版）':''}`,{value:v.id})));updatePreview();}
    function updatePreview(){const item=sources.find(i=>i.id===source.value),v=item.versions.find(v=>v.id===version.value);preview.replaceChildren(renderBundle(v));}
    source.addEventListener('change',updateVersions);version.addEventListener('change',updatePreview);updateVersions();
    append(form,field('來源創作項目',source),field('指定來源版本',version),preview,el('p','privacy-note','會複製這個版本的完整項目，作為目前創作項目的固定參考。來源之後更新不會自動改變這份引用；下一次 AI 操作時，這些引用內容也會一併傳送。'));
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
  function renderQuickSwitch() {
    const section=el('div','quick-switch');
    append(section,el('p','field-label','下一次 AI 操作使用'));
    const choice=quickChoice || {provider:state.provider || 'openai',model:state.model || DEFAULT_MODEL};
    const row=el('div','quick-switch-row');
    const provider=el('select','',null,{id:'quick-provider','aria-label':'下一次操作的 AI 來源',disabled:busy || !!uncertain});
    append(provider,el('option','','OpenAI',{value:'openai'}),el('option','','Ollama',{value:'ollama'}));provider.value=choice.provider;
    const model=el('input','',null,{id:'quick-model','aria-label':'下一次操作的模型',maxlength:'120',disabled:busy || !!uncertain});model.value=choice.model;
    let catalog=addModelCatalog(model,choice.provider,'quick-model-catalog');
    provider.addEventListener('change',()=>{quickChoice={provider:provider.value,model:(state.modelCatalog?.[provider.value] || [provider.value==='ollama'?'qwen3:8b':DEFAULT_MODEL])[0]};model.value=quickChoice.model;const next=addModelCatalog(model,provider.value,'quick-model-catalog');catalog.replaceWith(next);catalog=next;});
    model.addEventListener('input',()=>{quickChoice={provider:provider.value,model:model.value};});
    append(row,provider,model,button('套用',switchNextModel,'small',busy || !!uncertain));append(section,row,catalog,el('p','composer-hint','切換只影響下一次呼叫，歷史回覆會保留原模型標記。套用不會執行 AI。'));return section;
  }
  function renderConversation() {
    const panel=el('aside','panel dialogue-panel',null,{'aria-labelledby':'dialogue-heading'});
    append(panel,append(el('div','panel-heading dialogue-head'),append(el('div'),el('p','step-label','01 釐清想法'),el('h2','','和 AI 慢慢聊',{id:'dialogue-heading'}),el('p','panel-subtitle','一次想清楚一件事，對話都留在這裡。')),el('span','badge',`${project.messages.length} 則紀錄`)));
    if(!demo)panel.append(renderQuickSwitch());
    const list=el('div','conversation',null,{id:'conversation',role:'log','aria-label':'完整討論紀錄','aria-live':'polite','aria-relevant':'additions',tabindex:'0'});
    if(!project.messages.length)append(list,append(el('div','chat-entry'),el('p','chat-role',demo?'腳本引導':'創作起點'),el('p','chat-text','這次的標題要用在哪裡？\n可以先說用途，不需要一次把所有事情想好。')));
    project.messages.forEach(message=>{
      const card=el('article',`chat-entry ${message.role}`,null,{id:`message-${message.id}`});
      const role=message.role==='student'?'你':message.role==='system'?'共創紀錄':demo?'腳本示範':'AI 共創夥伴';
      append(card,append(el('div','chat-meta'),el('span','chat-role',role),el('time','',formatDate(message.at),{datetime:message.at})),el('p','chat-text',message.text));
      if(message.role==='assistant')card.append(el('p','model-provenance',provenanceLabel(message.provenance)));
      if(message.versionIds?.length || message.comparisonId) {
        const links=el('div','chat-links');
        message.versionIds?.forEach(id=>{const v=project.versions.find(v=>v.id===id);if(v)links.append(button(`查看 ${versionLabel(v)}`,()=>document.getElementById(`version-${id}`)?.scrollIntoView({behavior:'smooth',block:'center'}),'small'));});
        if(message.comparisonId)links.append(button('查看比較',()=>{selectedComparison=message.comparisonId;render();document.getElementById('comparison-section')?.scrollIntoView({behavior:'smooth',block:'center'});},'small'));
        card.append(links);
      }
      list.append(card);
    });panel.append(list);
    const form=el('form','chat-composer');form.addEventListener('submit',e=>{e.preventDefault();sendDiscussion();});
    const input=el('textarea','',null,{id:'chat-input',maxlength:'6000',rows:'3',placeholder:project.officialVersionId?'告訴 AI 要修改正式版的哪一項、怎麼改，其他項目會保留…':'寫下你的想法，或回應上一個問題…',disabled:busy || !canCreate(project)});input.value=draft().chat;
    input.addEventListener('input',()=>{draft().chat=input.value;const send=document.getElementById('send-chat');if(send)send.disabled=busy || !canCreate(project) || !input.value.trim() || !!uncertain;});
    const studentTurns=project.messages.filter(m=>m.role==='student' && (!m.kind || m.kind==='discussion')).length;
    append(form,el('label','field-label',project.officialVersionId?'針對正式版繼續修改或討論':'你的想法',{for:'chat-input'}),input,el('p','composer-hint',!canCreate(project)?'目前項目為唯讀，對話完整保留。請先還原封存或重新開啟定稿項目。':project.officialVersionId?'以目前正式版為基礎。明確修改會另存完整修改版，先看差異，再按「採用這次修改」；若只是追問，內容不會改變。':project.goalApprovedAt?'繼續討論會重新開放目標確認，不會刪除現有版本。':studentTurns<3?`先聊清楚用途、對象與重點，再整理目標（目前 ${studentTurns}/3 次回應）。`:'想法準備好了嗎？可以請 AI 整理目標，不會直接生成標題。'));
    if(demo && project.officialVersionId)form.append(el('p','composer-hint','固定修改示範格式：請把第一項內容改為「你的新名稱」。只逐字替換第一項，不是真實 AI；其他輸入只會得到追問，不會改寫。'));
    if(newestPendingRevision(project))form.append(el('p','composer-hint pending-revision-hint','有一份修改尚未採用。要接著修改這次結果，請先採用；未採用時，下次仍以目前正式版為起點。'));
    const actions=el('div','composer-actions');
    const send=button(busy?'處理中…':'送出想法 ↗',sendDiscussion,'primary',busy || !canCreate(project) || !draft().chat.trim() || !!uncertain);send.id='send-chat';
    append(actions,button('整理目前目標',summarizeGoal,'small',busy || !canSummarize(project) || !!uncertain),send);append(form,actions);panel.append(form);return panel;
  }
  function renderGoal() {
    const box=el('section','panel goal-panel',null,{'aria-labelledby':'goal-heading'});
    append(box,append(el('div','goal-title'),append(el('div'),el('p','step-label','02 對齊方向'),el('h2','','這次，我們想做到什麼？',{id:'goal-heading'})),el('span',`badge ${project.goalApprovedAt?'':'pending'}`,project.goalApprovedAt?'目標已確認':project.brief?'待你確認':'討論進行中')));
    if(!project.brief) {
      append(box,el('p','goal-intro',project.officialVersionId?'目前已有正式版，可以直接在對話中提出修改，或手動編輯另存。要產生全新候選，仍需先整理並確認目標。':'先在左側聊聊用途、讀者與想傳達的重點。整理後，你會在這裡看到一份清楚的目標。確認之前，AI 不會開始生成標題。'),el('p','goal-intro','不用調整任何風格滑桿，直接用自己的話說明就好。'));
    } else {
      append(box,el('p','goal-summary',project.brief.summary));
      const grid=el('dl','brief-grid');
      [['purpose','使用情境'],['audience','主要對象'],['message','核心訊息'],['tone','文字語氣'],['constraints','需要注意']].forEach(([key,label])=>append(grid,append(el('div','brief-item'),el('dt','',label),el('dd','',readable(project.brief[key])))));
      box.append(grid);
      if(project.brief.items?.length){const agreed=el('div','agreed-items');append(agreed,el('span','field-label','這次同意創作的項目'));project.brief.items.forEach(item=>agreed.append(el('span','badge',item.label)));box.append(agreed);}
      if(project.phase==='discussion')box.append(el('p','composer-hint',project.officialVersionId?'這份目標尚待重新確認，但不影響針對現有正式版繼續修改或另存。要產生全新候選、比較或定稿，仍需整理並確認目標。':'你補充了新的想法。這是上一份目標，請先重新整理，再確認新的方向。'));
      const footer=el('div','goal-footer');
      append(footer,el('p','goal-note',project.goalApprovedAt?'目標確認與 AI 生成是兩個獨立步驟。新候選會加進來，不會取代正式版。':project.officialVersionId?'可直接修改現有正式版。只有全新候選、比較或定稿，仍需要整理並確認目標。':'覺得不準確？回到對話補充，再請 AI 重新整理。'),button(project.goalApprovedAt?'已確認目標':'確認這份目標',approveGoal,project.goalApprovedAt?'':'primary',busy || !!uncertain || !!project.goalApprovedAt || !canCreate(project) || project.phase!=='summary'));box.append(footer);
    }
    const controls=el('div','generation-control');
    const instruction=el('input','',null,{id:'generate-instruction',maxlength:'1000',placeholder:'這一輪想補充的方向（可留空）',disabled:busy || !canGenerate(project)});instruction.value=draft().instruction;instruction.addEventListener('input',()=>{draft().instruction=instruction.value;});
    append(controls,field('下一輪候選，可另外加一點方向',instruction),button(project.versions.length?'再產生一組候選 ↗':'產生第一組候選 ↗',generate,'primary wide',busy || !!uncertain || !canGenerate(project)));box.append(controls);return box;
  }
  function renderRevisionReview() {
    const version=newestPendingRevision(project);if(!version)return null;
    const base=project.versions.find(v=>v.id===version.basedOnVersionId),changes=revisionChanges(base,version),changed=changes.filter(item=>item.kind!=='unchanged');
    const section=el('section','panel revision-review',null,{id:'revision-review','aria-labelledby':'revision-heading'});
    append(section,append(el('div','work-heading'),append(el('div'),el('p','step-label','最新修改 · 等你決定'),el('h2','','先看這次修改，再決定是否採用',{id:'revision-heading'})),el('span','badge pending','待審閱，尚未採用')));
    const card=el('article','revision-full-bundle',null,{id:`version-${version.id}`});
    append(card,el('p','revision-lineage',`${versionLabel(base)} 正式版 → ${versionLabel(version)} ${versionSourceLabel(version,demo)}`),el('p','composer-hint',`目前正式版仍是 ${versionLabel(base)}。以下是修改後的完整 ${versionItems(version).length} 項，不只是文字建議。`),el('p','pending-revision-hint','要接著修改這次結果，請先採用；未採用時，下次仍以目前正式版為起點。舊的待審版本也會留在候選與版本歷程。'),renderBundle(version),el('p','version-rationale',version.rationale || '本次修改依據已保留在來源對話。'),el('p','model-provenance',provenanceLabel(version.provenance)));
    const diff=el('div','revision-diff');append(diff,el('h3','',`本次差異 · ${changed.length} 項有變動，${changes.length-changed.length} 項維持不變`));
    changed.forEach(change=>{
      const row=el('div','revision-diff-item',null,{'data-item-id':change.id});
      append(row,el('p','field-label',`${change.after?.label || change.before?.label} · ${change.kind==='added'?'新增':change.kind==='removed'?'移除':'修改'}`));
      const columns=el('div','revision-diff-columns');
      [['修改前',change.before],['修改後',change.after]].forEach(([label,item])=>append(columns,append(el('div'),el('p','diff-side-label',label),el('p','diff-content',item?`${item.label}\n${item.content}`:'（沒有這個項目）'))));
      append(row,columns);diff.append(row);
    });
    if(!changed.length)diff.append(el('p','composer-hint','這份版本沒有可見的內容差異，請查看來源對話確認原因。'));
    append(card,diff,append(el('div','card-actions'),button('採用這次修改',()=>promote(version,true),'primary',busy || !!uncertain || !canCreate(project)),button('先手動調整這一版',()=>editVersion(version),'small',busy || !!uncertain || !canCreate(project)),selection(version),linkMessage(version.messageId,'查看修改對話')));
    if(!canCreate(project))card.append(el('p','composer-hint','目前為唯讀，請先重新開啟或還原項目，才能採用這份修改。'));
    append(section,card);return section;
  }
  function renderVersions() {
    const section=el('section','',null,{'aria-labelledby':'versions-heading'});
    append(section,append(el('div','work-heading'),append(el('div'),el('p','step-label','03 留住每組可能'),append(el('h2','',null,{id:'versions-heading'}),document.createTextNode('候選與正式版'),el('span','counter',`${project.versions.length} 個版本`))),el('span','badge','保存後不覆寫')));
    const official=project.versions.find(v=>v.id===project.officialVersionId);
    if(official) {
      const card=el('article','official-card',null,{id:`version-${official.id}`});
      append(card,append(el('div','official-top'),el('span','badge official',`正式版 · ${versionLabel(official)}`),selection(official)),renderBundle(official,true),el('p','official-meta',official.rationale),official.provenance?el('p','model-provenance',provenanceLabel(official.provenance)):null,el('p','composer-hint','想請 AI 改內容：在對話中提出具體修改，閱讀新修改版後再採用。想自己改：按「手動編輯這一版」，修改後另存。兩種方式都會保留原版。'),append(el('div','card-actions'),button('請 AI 繼續修改',()=>{document.getElementById('chat-input')?.focus();document.getElementById('chat-input')?.scrollIntoView({behavior:'smooth',block:'center'});},'primary small',busy || !!uncertain || !canCreate(project)),button('手動編輯這一版',()=>editVersion(official),'subtle small',busy || !!uncertain || !canCreate(project)),linkMessage(official.messageId)));
      section.append(card);append(section,el('p','section-label','保留的候選'));
    }
    const pending=newestPendingRevision(project),candidates=project.versions.filter(v=>v.id!==project.officialVersionId && v.id!==pending?.id);
    if(!project.versions.length) {
      append(section,append(el('div','empty-state'),el('div','empty-symbol','✧',{'aria-hidden':'true'}),el('h3','','好標題，從清楚的目標開始'),el('p','','目標確認後，另行按下「產生候選」。所有候選都會留在這裡，也可以保存自己寫的版本。')));
    } else if(!candidates.length)append(section,el('p','composer-hint',pending?'最新待審修改版在上方，正式版尚未變更。':'目前只有正式版。你仍可繼續討論修改、產生其他候選，或把編輯成果保存成新版本。'));
    const grid=el('div','candidate-grid');
    candidates.forEach(version=> {
      const card=el('article',`version-card ${selected.has(version.id)?'selected':''}`,null,{id:`version-${version.id}`});
      append(card,append(el('div','version-top'),el('span','',`${versionLabel(version)} · ${versionSourceLabel(version,demo)}`),selection(version)),renderBundle(version),el('p','version-rationale',version.rationale || '尚無補充說明'));
      const base=project.versions.find(v=>v.id===version.basedOnVersionId);
      append(card,el('p','version-source',`${base?`延續 ${versionLabel(base)} · `:'獨立起點 · '}${formatDate(version.createdAt)}`),['generated','revision'].includes(version.source)?el('p','model-provenance',provenanceLabel(version.provenance)):null,append(el('div','card-actions'),button('編輯',()=>editVersion(version),'small',busy || !canCreate(project)),button('設為正式版',()=>promote(version),'subtle small',busy || !!uncertain || !canCreate(project))));
      grid.append(card);
    });section.append(grid);
    if(project.versions.length>=2) {
      const toolbar=el('div','compare-toolbar');
      const prompt=el('div');append(prompt,el('p','',`已選 ${selected.size} 個版本`),el('small','','候選與正式版可以一起比較（2–5 個）'));
      const question=el('input','',null,{id:'compare-question',maxlength:'1000','aria-label':'本次比較想特別注意什麼',placeholder:'比較想特別注意什麼？（可留空）',disabled:busy});question.value=draft().question;question.addEventListener('input',()=>{draft().question=question.value;});
      append(toolbar,prompt,question,button('請 AI 提供比較意見 ↗',compare,'',busy || !!uncertain || !canGenerate(project) || !validComparison([...selected],project)));section.append(toolbar);
    }
    return section;
  }
  function renderBundle(version,official=false) {
    const bundle=el('div',`naming-bundle ${official?'official-bundle':''}`);
    versionItems(version).forEach((item,index)=>{
      const entry=el('div','bundle-item');
      append(entry,el('p','bundle-item-label',item.label),el(index===0?'h3':'p',index===0?(official?'official-title':'version-title'):'bundle-item-content',item.content));bundle.append(entry);
    });return bundle;
  }
  function renderEditor() {
    const d=draft(),base=project.versions.find(v=>v.id===d.basedOnVersionId);
    const section=el('section','panel editor-panel',null,{'aria-labelledby':'editor-heading'});
    append(section,append(el('div','work-heading'),append(el('div'),el('p','step-label','04 加入你的判斷'),el('h2','','整組名稱的編輯工作區',{id:'editor-heading'})),el('span','badge',d.dirty?'尚未保存':'自由修改')));
    append(section,el('p','editor-provenance',base?`延續 ${versionLabel(base)}。儲存會另建一整組新版本，不會修改來源。`:'每個版本是一整組項目。可以只有一個名稱，也可以加入 Slogan、短文或自己定義的項目。'));
    const update=()=>{d.dirty=true;const save=document.getElementById('save-snapshot');if(save)save.disabled=busy || !!uncertain || !validItems(d.items) || !canSnapshot(project);const status=document.getElementById('draft-status');if(status)status.textContent='草稿尚未保存。重新整理頁面會遺失草稿。';};
    const items=el('div','editor-items');
    d.items.forEach((item,index)=>{
      const row=el('div','editor-item');
      const heading=el('div','editor-item-heading');
      const label=el('input','',null,{id:`item-label-${item.id}`,maxlength:'40','aria-label':`第 ${index+1} 項的名稱`,placeholder:'項目名稱，例如：作品簡介',disabled:busy || !canCreate(project)});label.value=item.label;
      label.addEventListener('input',()=>{item.label=label.value;update();});
      append(heading,el('span','item-number',String(index+1).padStart(2,'0')),label,button('移除',()=>{d.items.splice(index,1);d.dirty=true;render();},'subtle small',busy || !canCreate(project) || d.items.length===1));
      const text=el('textarea','editor-item-content',null,{id:index===0?'editor-title':`item-content-${item.id}`,maxlength:'6000',rows:index===0?'2':'3','aria-label':`${item.label || `第 ${index+1} 項`}的內容`,placeholder:'寫下這個項目的內容…',disabled:busy || !canCreate(project)});text.value=item.content;text.addEventListener('input',()=>{item.content=text.value;update();});
      append(row,heading,text);items.append(row);
    });section.append(items);
    const add=el('div','add-item-row');
    const preset=el('select','',null,{id:'new-item-type','aria-label':'要加入的項目類型',disabled:busy || !canCreate(project) || d.items.length>=12});
    ['自訂項目','中文名稱','英文名稱','Slogan','說明短文'].forEach(label=>preset.append(el('option','',label,{value:label})));
    append(add,preset,button('＋ 新增項目',()=>{const label=preset.value==='自訂項目'?'':preset.value;d.items.push({id:createRequestId(),label,content:''});d.dirty=true;render();const added=d.items[d.items.length-1];document.getElementById(label?`item-content-${added.id}`:`item-label-${added.id}`)?.focus();},'small',busy || !canCreate(project) || d.items.length>=12),el('span','composer-hint',`${d.items.length}/12 項`));section.append(add);
    append(section,el('p','composer-hint','項目類型不限以上範例。也可以先在對話中請 AI 提議適合的項目，再整理與確認目標。保存時，每個保留項目都需有名稱與內容；每項內容最多約 2,000 個中文字。'));
    const rationale=el('textarea','editor-note',null,{id:'editor-rationale',maxlength:'2000',rows:'2',placeholder:'你為什麼這樣改？這組項目如何彼此呼應？（可留空）',disabled:busy || !canCreate(project)});rationale.value=d.rationale;rationale.addEventListener('input',()=>{d.rationale=rationale.value;update();});
    section.append(field('修改想法',rationale));
    const save=button('整組另存為新版本',saveSnapshot,'dark',busy || !!uncertain || !validItems(d.items) || !canSnapshot(project));save.id='save-snapshot';
    append(section,append(el('div','editor-footer'),el('p','save-state',!canCreate(project)?'目前項目為唯讀。還原或重新開啟後才能修改作品。':!canSnapshot(project)?'先確認創作目標，才能保存新版本。':d.dirty?'草稿尚未保存。重新整理頁面會遺失草稿。':'按下另存才會建立整組版本，不會自動升為正式版。',{id:'draft-status'}),save));return section;
  }
  function renderComparison() {
    if(!project.comparisons.length)return null;
    const comparison=project.comparisons.find(c=>c.id===selectedComparison) || project.comparisons[project.comparisons.length-1];
    const section=el('section','panel comparison-panel',null,{id:'comparison-section','aria-labelledby':'comparison-heading'});
    const heading=el('div','work-heading');append(heading,append(el('div'),el('p','step-label','05 看見差異'),el('h2','','比較意見，不是替你決定',{id:'comparison-heading'})),el('span','badge',`${comparison.versionIds.length} 個版本`));section.append(heading);
    if(project.comparisons.length>1) {
      const select=el('select','',null,{'aria-label':'選擇過往比較',id:'comparison-select'});
      project.comparisons.forEach((c,index)=>{const option=el('option','',`比較 ${index+1} · ${c.versionIds.map(id=>versionLabel(project.versions.find(v=>v.id===id))).join(' / ')} · ${formatDate(c.createdAt)}`,{value:c.id});option.selected=c.id===comparison.id;select.append(option);});
      select.addEventListener('change',()=>{selectedComparison=select.value;render();});section.append(select);
    }
    append(section,el('p','comparison-intro',comparison.summary));
    const grid=el('div','comparison-grid');
    comparison.items.forEach(item=> {
      const version=project.versions.find(v=>v.id===item.versionId);
      const card=el('article','comparison-item');append(card,el('h3','',`${versionLabel(version)} · ${version?.title || '版本'}`));
      [['fit','目標契合'],['strength','優點'],['tradeoff','取捨'],['suggestion','修改方向']].forEach(([key,label])=>append(card,append(el('p'),el('strong','',`${label}　`),document.createTextNode(readable(item[key])))));
      if(version)append(card,button('帶回工作區修改',()=>editVersion(version),'subtle small',busy || !canCreate(project)));grid.append(card);
    });section.append(grid);
    append(section,el('p','model-provenance',provenanceLabel(comparison.provenance)),el('p','comparison-foot','這份意見對照當時的目標與已保存版本；之後的修改不會改寫這次比較。'),linkMessage(comparison.messageId,'查看這次比較的對話紀錄'));
    const details=el('details','comparison-foot');append(details,el('summary','','查看比較當時的目標'),el('p','',readable(comparison.goalSnapshot?.summary)));section.append(details);return section;
  }
  function renderHistory() {
    if(!project.versions.length)return null;
    const section=el('details','panel history-panel');append(section,el('summary','',`完整版本歷程 · ${project.versions.length} 個不可覆寫的版本`));
    const list=el('ol','history-list');
    project.versions.forEach(version=> {
      const base=project.versions.find(v=>v.id===version.basedOnVersionId),li=el('li','history-row');
      const info=el('div');append(info,el('p','',`${versionLabel(version)} · ${version.title}${version.id===project.officialVersionId?'（目前正式版）':''}`),el('small','',`${base?`${versionLabel(base)} → ${versionLabel(version)}`:'獨立起點'} · ${versionSourceLabel(version,demo)} · ${formatDate(version.createdAt)}`));
      const goal=el('details');append(goal,el('summary','','當時的目標與完整項目'),el('p','',readable(version.goalSnapshot?.summary)),renderBundle(version),version.provenance?el('p','model-provenance',provenanceLabel(version.provenance)):null);info.append(goal);append(li,info,linkMessage(version.messageId,'來源對話'));list.append(li);
    });section.append(list);return section;
  }
  function downloadProject() {
    if(!project)return;
    const blob=new Blob([JSON.stringify(exportProject(project),null,2)],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=el('a','',null,{href:url,download:`共創室-${project.title.replace(/[\\/:*?"<>|]/g,'_').slice(0,60)}.json`});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function render() {
    if(!state)return;
    const active=document.activeElement;
    const focus=active?.id?{id:active.id,start:active.selectionStart,end:active.selectionEnd}:null;
    const oldList=document.getElementById('conversation');
    const scroll=oldList?{top:oldList.scrollTop,count:oldList.querySelectorAll('article').length,atBottom:oldList.scrollHeight-oldList.scrollTop-oldList.clientHeight<60}:null;
    const shell=el('div','app-shell');renderHeader(shell);
    if(project){shell.append(renderProjectOverview());shell.append(renderCreativeItems());const activeHeader=renderActiveItemHeader();if(activeHeader)shell.append(activeHeader);}
    if(!project) {
      append(shell,append(el('main','empty-state',null,{id:'workspace'}),el('div','empty-symbol','✳'),el('h2','','把一個想法，變成一組可能。'),el('p','','先建立專案，讓每段討論、每個版本都有自己的位置。'),button('建立第一個專案',newProject,'primary',busy)));
    } else if(project.creativeItems && !project.activeItem) {
      append(shell,append(el('main','empty-state',null,{id:'workspace'}),el('h2','','先選擇一個創作項目'),el('p','','一個專案可以包含多個創作項目，各自留下討論與版本。'),button('新增第一個創作項目',()=>creativeItemMetadata(false),'primary',busy || project.projectLifecycle==='finalized')));
    } else if(project.activeItem && project.activeItem.type!=='titles') {
      append(shell,append(el('main','placeholder-workspace',null,{id:'workspace'}),append(el('section','empty-state'),el('h2','',project.activeItem.archived?'這個規劃項目已封存':'這個類型尚未實作'),el('p','','目前只保存項目規劃與引用。尚未提供 AI 對話、生成、比較或定稿功能，不會假裝產生文章、圖片或網站。')),renderReferences()));
    } else {
      const main=el('main','workspace-layout',null,{id:'workspace','aria-busy':String(busy)});
      const work=el('div','work-column');append(work,renderRevisionReview(),renderReferences(),renderGoal(),renderVersions(),renderEditor(),renderComparison(),renderHistory());append(main,renderConversation(),work);shell.append(main);
    }
    const footer=el('footer','footer');append(footer,el('p','',demo?'SCRIPTED DEMO · 示範內容只在本頁記憶體，重整即重設。':'專案保存在這個安裝網站的 SQLite 資料庫；編輯草稿需按「另存為新版本」才會保存。'));
    if(project)append(footer,button('匯出此專案 JSON',downloadProject,'subtle small',busy));shell.append(footer);
    root.replaceChildren(shell);
    const newList=document.getElementById('conversation');
    if(newList){if(!scroll || (project.messages.length>scroll.count && scroll.atBottom))newList.scrollTop=newList.scrollHeight;else newList.scrollTop=scroll.top;}
    if(focus){const next=document.getElementById(focus.id);if(next && !next.disabled){next.focus({preventScroll:true});if(typeof next.setSelectionRange==='function' && focus.start!==null){try{next.setSelectionRange(focus.start,focus.end);}catch(_){}}}}
  }
  async function boot() {
    try {await refresh({keepProject:false});render();}
    catch(e){const box=el('main','panel load-error');append(box,el('h1','','共創室還沒準備好'),el('p','',e.message),button('重新讀取',boot,'primary'),el('p','composer-hint','請確認已完成網頁安裝，並從 public/index.php 開啟。'));root.replaceChildren(box);}
  }
  globalThis.addEventListener('beforeunload',event=> {
    if([...drafts.values()].some(d=>d.dirty || d.chat.trim()) || busy || uncertain){event.preventDefault();event.returnValue='';}
  });
  await boot();
  return {reload:async()=>{await refresh();render();},getProject:()=>project};
}
if(typeof document!=='undefined' && document.body?.dataset.appMode==='live')createTitleApp();
