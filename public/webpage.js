/** Native structured webpages. Fixed templates and explicitly pinned images only.
 * Authored text never supplies markup, code or private-image URLs. */
import {createImagePreview,validateImageArtifact} from './image.js';
import {preparePrivateImageExport,MAX_PRIVATE_IMAGE_EXPORT_BYTES} from './private-image-export.js';
const TYPES=['hero','text','cards','faq','cta','image'];
const TYPE_NAMES=new Map([['hero','首頁主視覺'],['text','文字說明'],['cards','資訊卡片'],['faq','常見問答'],['cta','行動呼籲'],['image','固定圖片']]);
const THEMES=new Map([['paper','紙感淺色'],['midnight','午夜深色'],['meadow','草地綠色']]);
const SECTION_KEYS=['id','type','eyebrow','heading','body','entries','actionLabel','actionTarget'];
const SECTION_FIELDS=SECTION_KEYS.filter(key=>key!=='id'&&key!=='type');
const DOCUMENT_FIELDS=['title','theme','navigation'];
const bytes=value=>new TextEncoder().encode(value).length;
const fail=(condition,message)=>{if(!condition)throw new Error(message);};
let idSequence=0,instanceSequence=0;
function validUnicode(value){for(let i=0;i<value.length;i++){const code=value.charCodeAt(i);if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))return false;}else if(code>=0xdc00&&code<=0xdfff)return false;}return true;}
function object(value,keys,name){
  fail(value!==null&&typeof value==='object'&&!Array.isArray(value),name+'必須是完整物件。');
  fail(JSON.stringify(Object.keys(value).sort())===JSON.stringify([...keys].sort())&&Reflect.ownKeys(value).length===keys.length,name+'缺少欄位或包含未支援的欄位。');
}
function list(value,min,max,name){fail(Array.isArray(value)&&value.length>=min&&value.length<=max&&Object.keys(value).length===value.length&&Reflect.ownKeys(value).length===value.length+1&&Object.keys(value).every((key,index)=>key===String(index)),name+'的數量或清單格式不正確。');}
function text(value,max,name,empty=true){
  fail(typeof value==='string'&&validUnicode(value)&&!value.includes('\0'),name+'必須是有效 UTF8 文字。');
  fail(bytes(value)<=max&&(empty||value.trim()!==''),name+'空白或超過長度上限。');
  fail(!/\bsk-[a-zA-Z0-9_-]{16,}\b/.test(value),'請勿在對話或作品欄位貼入 API Key；請只使用 API 設定中的密碼欄。');return value;
}
function stableId(value,name='內容區塊識別碼'){fail(typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$(?![\s\S])/.test(value),name+'必須是最多64字元的穩定英數識別碼，可包含 - 或 _。');return text(value,64,name,false);}
function canonicalJson(value){
  if(typeof value==='string')return JSON.stringify(value).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  if(typeof value==='boolean')return value?'true':'false';
  if(Array.isArray(value))return '['+value.map(canonicalJson).join(',')+']';
  return '{'+Object.entries(value).map(([key,item])=>JSON.stringify(key)+':'+canonicalJson(item)).join(',')+'}';
}
function checkedWebpage(value){
  object(value,['kind','title','theme','navigation','sections'],'網頁作品');fail(value.kind==='webpage','網頁作品類型欄位不正確。');
  const title=text(value.title,600,'網頁標題',false);fail(THEMES.has(value.theme),'網頁風格只支援 paper、midnight 或 meadow。');
  fail(typeof value.navigation==='boolean','網頁導覽必須是布林值。');list(value.sections,1,20,'內容區塊');const ids=new Set();
  const sections=value.sections.map(section=>{
    object(section,SECTION_KEYS,'內容區塊');const id=stableId(section.id);fail(!ids.has(id),'內容區塊識別碼不可重複。');ids.add(id);
    fail(TYPES.includes(section.type),'內容區塊類型只支援 hero、text、cards、faq、cta 或 image。');
    const type=section.type,eyebrow=text(section.eyebrow,240,'內容區塊眉標'),heading=text(section.heading,600,'內容區塊標題',false),body=text(section.body,12000,'內容區塊內文');
    const hasEntries=type==='cards'||type==='faq';list(section.entries,type==='image'?1:hasEntries?1:0,type==='image'?1:hasEntries?12:0,type==='image'?'圖片條目（只支援一個固定引用）':'卡片或問答條目');const entryIds=new Set();
    const entries=section.entries.map(entry=>{object(entry,['id','title','body'],'卡片或問答條目');const entryId=stableId(entry.id,'條目識別碼');if(type==='image')fail(/^[a-f0-9]{32}$(?![\s\S])/.test(entryId),'圖片引用識別碼必須是32個小寫十六進位字元。');fail(!entryIds.has(entryId),'同一內容區塊的條目識別碼不可重複。');entryIds.add(entryId);return {id:entryId,title:text(entry.title,600,'條目標題',false),body:text(entry.body,6000,'條目內文')};});
    const actionLabel=text(section.actionLabel,240,'行動按鈕文字'),actionTarget=section.actionTarget;
    fail(typeof actionTarget==='string','行動目標必須是內容區塊識別碼或空字串。');if(actionTarget!=='')stableId(actionTarget,'行動目標');
    if(type==='hero'||type==='cta'){
      fail((actionLabel===''&&actionTarget==='')||(actionLabel.trim()!==''&&actionTarget!==''),'行動按鈕文字與目標必須同時留空或同時填寫。');
      if(type==='cta')fail(actionLabel.trim()!==''&&actionTarget!=='','行動呼籲內容區塊必須有按鈕文字與目標。');
    }else fail(actionLabel===''&&actionTarget==='','只有 hero 或 cta 內容區塊可以設定行動按鈕。');
    return {id,type,eyebrow,heading,body,entries,actionLabel,actionTarget};
  });
  sections.forEach(section=>fail(section.actionTarget===''||ids.has(section.actionTarget),'行動目標必須指向目前網頁內存在的內容區塊。'));
  const out={kind:'webpage',title,theme:value.theme,navigation:value.navigation,sections};fail(bytes(canonicalJson(out))<=60000,'完整網頁作品超過60000個 UTF8 位元組，未保存且未截斷內容。');return out;
}
export function defaultWebpageEntry(id='entry_1'){return {id,title:'條目標題',body:'在這裡填寫內容。'};}
export function defaultWebpageSection(type='text',id='section_1',actionTarget=''){
  fail(TYPES.includes(type),'不支援的內容區塊類型。');return {id,type,eyebrow:'',heading:TYPE_NAMES.get(type),body:'在這裡填寫內容。',entries:type==='image'?[{id:'',title:'圖片替代文字',body:''}]:type==='cards'||type==='faq'?[defaultWebpageEntry()]:[],actionLabel:type==='cta'?'返回內容':'',actionTarget:type==='cta'?(actionTarget||id):''};
}
export function defaultWebpage(){return {kind:'webpage',title:'網頁作品',theme:'paper',navigation:true,sections:[{...defaultWebpageSection('hero','welcome'),heading:'讓想法成為一頁清楚的網頁',actionLabel:'了解更多',actionTarget:'details'},defaultWebpageSection('text','details')]};}
export function validateWebpage(value){try{checkedWebpage(value);return '';}catch(error){return error.message;}}
export function cloneWebpage(value){return checkedWebpage(value);}
export function webpageCompactJson(value){return canonicalJson(checkedWebpage(value));}
export function webpageImageReferenceIds(value){return [...new Set(checkedWebpage(value).sections.filter(section=>section.type==='image').map(section=>section.entries[0].id))];}
export function webpageItems(value){return [{id:'document',label:'網頁來源',content:webpageCompactJson(value)}];}
function mutate(value,operation){const next=checkedWebpage(value);operation(next);return checkedWebpage(next);}
function sectionIndex(value,id){const index=value.sections.findIndex(section=>section.id===id);fail(index>=0,'找不到指定內容區塊。');return index;}
function freshId(existing,prefix){let id;do{id=prefix+'_'+(globalThis.crypto?.randomUUID?.()||'local_'+(++idSequence));}while(existing.has(id));return id;}
export function updateWebpageDocument(value,fields){object(fields,DOCUMENT_FIELDS,'網頁設定修改');return mutate(value,next=>Object.assign(next,fields));}
export function updateWebpageSection(value,id,fields){object(fields,SECTION_FIELDS,'內容區塊修改');return mutate(value,next=>Object.assign(next.sections[sectionIndex(next,id)],fields));}
export function addWebpageSection(value,type='text',imageReferenceId=''){return mutate(value,next=>{const section=defaultWebpageSection(type,freshId(new Set(next.sections.map(section=>section.id)),'section'),next.sections[0].id);if(type==='image')section.entries[0].id=imageReferenceId;next.sections.push(section);});}
export function removeWebpageSection(value,id){return mutate(value,next=>{const index=sectionIndex(next,id);fail(next.sections.length>1,'網頁至少須保留一個內容區塊。');fail(!next.sections.some(section=>section.id!==id&&section.actionTarget===id),'此內容區塊仍是其他行動按鈕的目標，請先修改那些按鈕的目標再移除。');next.sections.splice(index,1);});}
export function reorderWebpageSection(value,id,index){return mutate(value,next=>{fail(Number.isInteger(index)&&index>=0&&index<next.sections.length,'內容區塊位置必須是清單範圍內的整數。');next.sections.splice(index,0,next.sections.splice(sectionIndex(next,id),1)[0]);});}
export function addWebpageEntry(value,id){return mutate(value,next=>{const section=next.sections[sectionIndex(next,id)];fail(['cards','faq'].includes(section.type),'此內容區塊不支援條目。');section.entries.push(defaultWebpageEntry(freshId(new Set(section.entries.map(entry=>entry.id)),'entry')));});}
export function updateWebpageEntry(value,sectionId,id,fields){object(fields,['title','body'],'條目修改');return mutate(value,next=>{const section=next.sections[sectionIndex(next,sectionId)],entry=section.entries.find(entry=>entry.id===id);fail(!!entry,'找不到指定條目。');Object.assign(entry,fields);});}
export function removeWebpageEntry(value,sectionId,id){return mutate(value,next=>{const entries=next.sections[sectionIndex(next,sectionId)].entries,index=entries.findIndex(entry=>entry.id===id);fail(index>=0,'找不到指定條目。');entries.splice(index,1);});}
export function reorderWebpageEntry(value,sectionId,id,index){return mutate(value,next=>{const entries=next.sections[sectionIndex(next,sectionId)].entries,from=entries.findIndex(entry=>entry.id===id);fail(from>=0,'找不到指定條目。');fail(Number.isInteger(index)&&index>=0&&index<entries.length,'條目位置必須是清單範圍內的整數。');entries.splice(index,0,entries.splice(from,1)[0]);});}

// App-owned CSS is shared with the standalone export. Every selector is scoped;
// no authored style/class values, fonts, imports, URL() or remote assets.
export const WEBPAGE_STYLES=`
.webpage-preview{--wp-bg:#fffdf7;--wp-panel:#ffffff;--wp-ink:#182a36;--wp-muted:#475569;--wp-accent:#174d73;--wp-accent-ink:#ffffff;--wp-border:#9baab5;box-sizing:border-box;background:var(--wp-bg);color:var(--wp-ink);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.65;max-width:100%;margin:0 auto;padding:clamp(1rem,4vw,3rem);overflow-wrap:anywhere;isolation:isolate}
.webpage-preview.webpage-theme-midnight{--wp-bg:#12202e;--wp-panel:#1c3044;--wp-ink:#f2f6ff;--wp-muted:#c2d1e1;--wp-accent:#b7dcff;--wp-accent-ink:#102336;--wp-border:#8babc6}
.webpage-preview.webpage-theme-meadow{--wp-bg:#f5fff4;--wp-panel:#ffffff;--wp-ink:#173e29;--wp-muted:#375b43;--wp-accent:#245f3c;--wp-accent-ink:#ffffff;--wp-border:#789783}
.webpage-preview *{box-sizing:border-box}
.webpage-preview .webpage-header,.webpage-preview .webpage-content{max-width:68rem;margin-inline:auto}
.webpage-preview .webpage-title{color:var(--wp-ink);font-size:clamp(1.6rem,5vw,2.6rem);line-height:1.25;margin:0 0 1rem;white-space:pre-wrap}
.webpage-preview .webpage-nav{display:flex;flex-wrap:wrap;gap:.6rem 1.2rem;border-bottom:1px solid var(--wp-border);padding:0 0 1.2rem;margin-bottom:1rem}
.webpage-preview .webpage-nav a{color:var(--wp-ink);text-decoration:underline;text-underline-offset:.2em;white-space:pre-wrap;max-width:100%}
.webpage-preview .webpage-section{padding:2rem 0;border-bottom:1px solid var(--wp-border);scroll-margin-top:1rem;min-width:0}
.webpage-preview .webpage-section:last-child{border-bottom:0}
.webpage-preview .webpage-section-hero{padding-block:clamp(2rem,7vw,5rem)}
.webpage-preview .webpage-section-cta{border:1px solid var(--wp-border);border-radius:1rem;padding:clamp(1rem,4vw,2.5rem);margin-block:2rem;background:var(--wp-panel)}
.webpage-preview .webpage-eyebrow{font-weight:700;color:var(--wp-muted);margin:0 0 .5rem;white-space:pre-wrap}
.webpage-preview .webpage-heading{color:var(--wp-ink);font-size:clamp(1.35rem,4vw,2rem);line-height:1.3;margin:0 0 1rem;white-space:pre-wrap}
.webpage-preview .webpage-body,.webpage-preview .webpage-entry-body{white-space:pre-wrap;color:var(--wp-ink);margin:0 0 1rem}
.webpage-preview .webpage-cards{list-style:none;padding:0;margin:1rem 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr));gap:1rem}
.webpage-preview .webpage-card{border:1px solid var(--wp-border);border-radius:.75rem;background:var(--wp-panel);padding:1.25rem;min-width:0}
.webpage-preview .webpage-entry-title{font-size:1.15rem;line-height:1.4;margin:0 0 .75rem;white-space:pre-wrap;color:var(--wp-ink)}
.webpage-preview .webpage-faq{border:1px solid var(--wp-border);border-radius:.6rem;background:var(--wp-panel);margin-block:.75rem;padding:1rem}
.webpage-preview .webpage-faq summary{cursor:pointer;font-weight:700;white-space:pre-wrap;color:var(--wp-ink)}
.webpage-preview .webpage-faq .webpage-entry-body{margin:1rem 0 0}
.webpage-preview .webpage-action{display:inline-block;background:var(--wp-accent);color:var(--wp-accent-ink);padding:.75rem 1.25rem;border:2px solid var(--wp-accent);border-radius:.5rem;font-weight:700;line-height:1.5;text-decoration:underline;white-space:pre-wrap;max-width:100%}
.webpage-preview .webpage-image{margin:1rem 0;min-width:0}
.webpage-preview .artifact-image-preview{margin:0;border:1px solid var(--wp-border);border-radius:.75rem;padding:1rem;background:var(--wp-panel);color:var(--wp-ink)}
.webpage-preview .image-preview-frame{text-align:center;max-width:100%;overflow:hidden}
.webpage-preview .image-preview-image{display:block;max-width:100%;height:auto;margin:0 auto}
.webpage-preview .image-preview-caption{color:var(--wp-muted);background:var(--wp-panel);white-space:pre-wrap}
.webpage-preview .image-preview-origin{color:var(--wp-muted)}
.webpage-preview .image-preview-title{color:var(--wp-ink);margin:.75rem 0 .25rem;white-space:pre-wrap}
.webpage-preview .image-preview-caption p{margin:.25rem 0}
.webpage-preview .webpage-image-caption{margin:.75rem 0;color:var(--wp-ink);white-space:pre-wrap}
.webpage-preview .webpage-image-missing,.webpage-preview .image-preview-status{color:var(--wp-ink);white-space:pre-wrap}
.webpage-preview a:focus-visible,.webpage-preview summary:focus-visible,.webpage-preview .webpage-section:focus{outline:3px solid var(--wp-ink);outline-offset:4px}
@media(max-width:36rem){.webpage-preview{padding:1rem}.webpage-preview .webpage-nav{flex-direction:column;gap:.65rem}.webpage-preview .webpage-section{padding-block:1.5rem}.webpage-preview .webpage-cards{grid-template-columns:1fr}}
@media(prefers-reduced-motion:reduce){.webpage-preview,.webpage-preview *{scroll-behavior:auto}}
`;
const spec=(tag,attrs={},value=null,children=[])=>({tag,attrs,value,children});
function webpageSpec(artifact,prefix,imageSpec){
  const ids=new Map(artifact.sections.map((section,index)=>[section.id,prefix+'-section-'+(index+1)]));
  const header=[spec('h1',{class:'webpage-title'},artifact.title)];
  if(artifact.navigation)header.push(spec('nav',{class:'webpage-nav','aria-label':'網頁內容導覽'},null,artifact.sections.map(section=>spec('a',{href:'#'+ids.get(section.id)},section.heading))));
  const sections=artifact.sections.map(section=>{
    const headingId=ids.get(section.id)+'-heading',children=[];
    if(section.eyebrow!=='')children.push(spec('p',{class:'webpage-eyebrow'},section.eyebrow));
    children.push(spec('h2',{id:headingId,class:'webpage-heading'},section.heading));if(section.body!=='')children.push(spec('p',{class:'webpage-body'},section.body));
    if(section.type==='cards')children.push(spec('ul',{class:'webpage-cards'},null,section.entries.map(entry=>spec('li',{class:'webpage-card'},null,[spec('h3',{class:'webpage-entry-title'},entry.title),spec('p',{class:'webpage-entry-body'},entry.body)]))));
    if(section.type==='image'){const entry=section.entries[0],figure=spec('figure',{class:'webpage-image'},null,[]);if(imageSpec)figure.children.push(imageSpec(entry));else figure.pinnedImage=entry;if(entry.body!=='')figure.children.push(spec('figcaption',{class:'webpage-image-caption'},entry.body));children.push(figure);}
    if(section.type==='faq')section.entries.forEach(entry=>children.push(spec('details',{class:'webpage-faq'},null,[spec('summary',{},entry.title),spec('p',{class:'webpage-entry-body'},entry.body)])));
    if(section.actionLabel!=='')children.push(spec('a',{class:'webpage-action',href:'#'+ids.get(section.actionTarget)},section.actionLabel));
    return spec('section',{id:ids.get(section.id),class:'webpage-section webpage-section-'+section.type,'aria-labelledby':headingId,tabindex:'-1'},null,children);
  });
  return spec('article',{class:'webpage-preview webpage-theme-'+artifact.theme,'aria-label':artifact.title},null,[spec('header',{class:'webpage-header'},null,header),spec('div',{class:'webpage-content'},null,sections)]);
}
function element(document,tag,className='',value=null){const node=document.createElement(tag);if(className)node.className=className;if(value!==null)node.textContent=value;return node;}
function attr(node,name,value){node.setAttribute(name,String(value));return node;}
function renderSpec(document,node,ids,anchors,renderImage){const out=element(document,node.tag);Object.entries(node.attrs).forEach(([name,value])=>attr(out,name,value));if(node.attrs.id)ids.set(node.attrs.id,out);if(node.tag==='a')anchors.push(out);if(node.value!==null)out.textContent=node.value;if(node.pinnedImage)out.append(renderImage(node.pinnedImage));node.children.forEach(child=>out.append(renderSpec(document,child,ids,anchors,renderImage)));return out;}
// Caller-supplied pins, not arbitrary user-authored image locations. Capture
// identities and metadata before deferred loading; duplicate IDs fail closed.
function pinnedWebpageImages(references){
  const images=new Map(),seen=new Set();
  for(const reference of Array.isArray(references)?references:[]){
    if(!reference||typeof reference.id!=='string'||!/^[a-f0-9]{32}$(?![\s\S])/.test(reference.id))continue;
    if(seen.has(reference.id)){images.delete(reference.id);continue;}seen.add(reference.id);
    const snapshot=reference.versionSnapshot;
    if(typeof reference.targetItemId!=='string'||!reference.targetItemId.trim()||typeof reference.versionId!=='string'||!reference.versionId.trim()||snapshot?.id!==reference.versionId||snapshot.contentType!=='image'||validateImageArtifact(snapshot.artifact))continue;
    images.set(reference.id,copyPin(reference));
  }
  return images;
}
function copyPin(reference){return JSON.parse(JSON.stringify(reference));}
export function validateWebpageImageReferences(value,references=[]){
  try{const ids=webpageImageReferenceIds(value);fail(Array.isArray(references),'固定圖片引用必須是清單。');const images=pinnedWebpageImages(references);for(const id of ids)fail(images.has(id),'找不到有效且唯一的固定圖片引用 '+id+'；未儲存或替換圖片。');return '';}catch(error){return error.message;}
}
export function renderWebpage(value,{document=globalThis.document,compact=false,idPrefix='webpage-preview',references=[],loadImage}={}){
  const previews=[];let disposed=false;
  const dispose=()=>{if(disposed)return;disposed=true;previews.forEach(preview=>preview.disposeImagePreview?.());};
  const error=validateWebpage(value);if(error){const root=element(document,'section','artifact-preview webpage-preview');root.append(element(document,'p','artifact-error',error));root.disposeImagePreview=dispose;return root;}
  const images=pinnedWebpageImages(references);
  const media=entry=>{
    const reference=images.get(entry.id);
    if(!reference)return element(document,'p','webpage-image-missing','找不到固定圖片引用 '+entry.id+'；未替換成其他圖片。');
    // Only the display alt is overridden. The authorized loader receives the
    // original pinned artifact unchanged, never the custom display metadata.
    const preview=createImagePreview(document,{...reference.versionSnapshot.artifact,alt:entry.title},{loadImage:typeof loadImage==='function'?()=>disposed?null:loadImage(copyPin(reference)):undefined});
    previews.push(preview);return preview;
  };
  const prefix=String(idPrefix).replace(/[^a-zA-Z0-9_-]/g,'_')+'-'+(++instanceSequence),ids=new Map(),anchors=[],root=renderSpec(document,webpageSpec(checkedWebpage(value),prefix),ids,anchors,media);
  root.disposeImagePreview=dispose;root.className+=' artifact-preview'+(compact?' compact':'');anchors.forEach(anchor=>anchor.addEventListener('click',event=>{if(disposed)return;const target=ids.get(anchor.getAttribute('href').slice(1));if(!target)return;event.preventDefault?.();target.scrollIntoView?.({block:'start',behavior:'auto'});target.focus?.({preventScroll:true});}));return root;
}
function documentDraft(value){return {title:value.title,theme:value.theme,navigation:value.navigation};}
function sectionDraft(section){return {eyebrow:section.eyebrow,heading:section.heading,body:section.body,entries:section.entries.map(entry=>({...entry})),actionLabel:section.actionLabel,actionTarget:section.actionTarget};}
export function renderWebpageEditor(value,{document=globalThis.document,disabled=false,onChange=()=>{},idPrefix='webpage',uiState={},onPendingChange=()=>{},references=[],loadImage}={}){
  uiState.disposeWebpageEditor?.();const images=pinnedWebpageImages(references);let disposed=false,livePreview=null;
  let state=checkedWebpage(value),selected=state.sections.some(section=>section.id===uiState.selectedSectionId)?uiState.selectedSectionId:state.sections[0].id,revision=0;
  const drafts=uiState.fieldDrafts instanceof Map?uiState.fieldDrafts:new Map();uiState.fieldDrafts=drafts;uiState.selectedSectionId=selected;const token={};uiState.editorToken=token;
  const history=uiState.lastArtifact===canonicalJson(state)&&Array.isArray(uiState.undoHistory)?uiState.undoHistory.slice(-20).filter(entry=>entry&&validateWebpage(entry.artifact)==='').map(entry=>({artifact:checkedWebpage(entry.artifact),selected:entry.selected})):[];
  const remember=()=>{uiState.lastArtifact=canonicalJson(state);uiState.undoHistory=history.map(entry=>({artifact:checkedWebpage(entry.artifact),selected:entry.selected}));};remember();
  const prefix=String(idPrefix).replace(/[^a-zA-Z0-9_-]/g,'_')+'-'+(++instanceSequence),root=element(document,'div','artifact-editor artifact-webpage-editor'),workspace=element(document,'div','webpage-editor-workspace'),preview=element(document,'div','artifact-live-preview');
  const error=element(document,'p','artifact-error'),pendingStatus=element(document,'p','editor-note webpage-pending-status');error.id=prefix+'-error';attr(error,'role','status');attr(error,'aria-live','polite');
  root.append(element(document,'p','editor-note','欄位請明確套用至草稿，再使用外層按鈕另存完整版本。提供固定風格、內容區塊、頁內導覽與原生 FAQ 展開；所有文字（包括網址）只作純文字。引用資料只作本次參考，不會自動連動。圖片只使用明確固定引用的既有 PNG，不接受外部圖片網址，也不會 AI 生圖。不支援任意腳本、自訂 HTML/CSS、表單提交、登入、付款、API 或部署。HTML 匯出須驗證固定圖片後才建立無腳本獨立檔；含圖 JSON／TXT 只有文字與引用資料，不含圖片像素且不是完整備份。此處為原生預覽，未代表實際瀏覽器相容性測試。'),error,pendingStatus,workspace,preview);
  root.disposeImagePreview=()=>{if(disposed)return;disposed=true;livePreview?.disposeImagePreview?.();if(uiState.editorToken===token)delete uiState.editorToken;if(uiState.disposeWebpageEditor===root.disposeImagePreview)delete uiState.disposeWebpageEditor;};uiState.disposeWebpageEditor=root.disposeImagePreview;
  let draw,lastPending=null,guarded=[];const different=(a,b)=>JSON.stringify(a)!==JSON.stringify(b);
  const pendingIds=()=>[...drafts].filter(([id,draft])=>{const section=state.sections.find(section=>section.id===id);return !section||different(draft,sectionDraft(section));}).map(([id])=>id);
  const documentPending=()=>!!uiState.documentDraft&&different(uiState.documentDraft,documentDraft(state));const hasPending=()=>documentPending()||pendingIds().length>0;
  const notify=()=>{if(uiState.editorToken!==token)return;const ids=pendingIds(),pending=documentPending()||ids.length>0;pendingStatus.textContent=(documentPending()?'網頁設定欄位尚未套用。':'')+(ids.length?'內容區塊欄位尚未套用：'+ids.map(id=>state.sections.find(section=>section.id===id)?.heading||id).join('、')+'。':'');guarded.forEach(({control,blocked})=>control.disabled=disabled||pending||blocked());if(pending!==lastPending){lastPending=pending;onPendingChange(pending);}};
  const message=value=>{error.textContent=value;};const emit=()=>{try{onChange(checkedWebpage(state));}catch(failure){message('草稿已更新，但外層接收失敗；尚未保存版本。'+(failure?.message?' '+failure.message:''));}};
  const commit=(operation,after=()=>{})=>{
    if(disposed||disabled||uiState.editorToken!==token)return false;let next;try{next=checkedWebpage(operation());}catch(failure){message(failure.message);return false;}
    if(canonicalJson(next)===canonicalJson(state)){after();revision++;draw();message('沒有內容變更，尚未建立或保存任何版本。');return false;}
    history.push({artifact:checkedWebpage(state),selected});if(history.length>20)history.shift();state=next;after();revision++;
    if(!state.sections.some(section=>section.id===selected))selected=state.sections[0].id;uiState.selectedSectionId=selected;remember();draw();message('草稿已更新，尚未另存版本。');emit();return true;
  };
  draw=()=>{
    workspace.replaceChildren();guarded=[];const current=state.sections[sectionIndex(state,selected)],drawRevision=revision,alive=()=>!disposed&&!disabled&&drawRevision===revision&&uiState.editorToken===token;
    const button=(label,handler,blocked=false)=>{const node=element(document,'button','button small',label);node.type='button';node.disabled=disabled||blocked;node.addEventListener('click',()=>{if(!node.disabled&&alive())handler();});return node;};
    const guardedButton=(label,handler,blocked=()=>false)=>{const control=button(label,()=>{if(!hasPending())handler();});guarded.push({control,blocked});return control;};
    // All authored strings may contain newlines. Text inputs sanitize them;
    // use compact textareas and retain untouched source strings in raw drafts.
    const field=(labelText,key,value,multiline=false)=>{const wrap=element(document,'div','field'),label=element(document,'label','field-label',labelText),input=element(document,'textarea');input.id=prefix+'-'+key;input.value=value;input.disabled=disabled;input.rows=multiline?4:2;attr(label,'for',input.id);attr(input,'aria-describedby',error.id);wrap.append(label,input);return {wrap,input};};
    const choose=(labelText,key,options,value)=>{const wrap=element(document,'div','field'),label=element(document,'label','field-label',labelText),input=element(document,'select');input.id=prefix+'-'+key;input.disabled=disabled;attr(label,'for',input.id);attr(input,'aria-describedby',error.id);options.forEach(option=>{const child=element(document,'option','',option.label);child.value=option.id;child.selected=option.id===value;input.append(child);});input.value=value;wrap.append(label,input);return {wrap,input};};
    const select=id=>{if(!alive()||!state.sections.some(section=>section.id===id))return;selected=id;uiState.selectedSectionId=id;revision++;draw();message('已選取內容區塊；沒有呼叫 AI 或修改作品。');};
    const doc=uiState.documentDraft||documentDraft(state);workspace.append(element(document,'h4','','網頁風格與設定'));
    const docTitle=field('網頁標題','document-title',doc.title);docTitle.input.addEventListener('input',()=>{if(!alive())return;uiState.documentDraft={...(uiState.documentDraft||documentDraft(state)),title:docTitle.input.value};notify();});workspace.append(docTitle.wrap);
    const theme=choose('網頁風格','document-theme',[...THEMES].map(([id,label])=>({id,label})),doc.theme);theme.input.addEventListener('change',()=>{if(!alive())return;uiState.documentDraft={...(uiState.documentDraft||documentDraft(state)),theme:theme.input.value};notify();});workspace.append(theme.wrap);
    const navigation=choose('頁內導覽','document-navigation',[{id:'true',label:'顯示導覽'},{id:'false',label:'隱藏導覽'}],String(doc.navigation));navigation.input.addEventListener('change',()=>{if(!alive())return;const value=navigation.input.value;uiState.documentDraft={...(uiState.documentDraft||documentDraft(state)),navigation:value==='true'?true:value==='false'?false:value};notify();});workspace.append(navigation.wrap);
    workspace.append(button('套用網頁設定至草稿',()=>commit(()=>updateWebpageDocument(state,uiState.documentDraft||documentDraft(state)),()=>{delete uiState.documentDraft;})),button('放棄網頁設定欄位修改',()=>{delete uiState.documentDraft;revision++;draw();message('已還原網頁設定欄位，草稿與版本沒有改變。');}));
    const selector=choose('選取要編輯的內容區塊','selection',state.sections.map((section,index)=>({id:section.id,label:(index+1)+'．'+section.heading+'（'+TYPE_NAMES.get(section.type)+'）'})),selected);selector.input.addEventListener('change',()=>{if(!selector.input.disabled)select(selector.input.value);});workspace.append(selector.wrap,element(document,'h4','','編輯內容區塊：'+TYPE_NAMES.get(current.type)));
    const draft=drafts.get(selected)||sectionDraft(current),labels=new Map([['eyebrow','內容區塊眉標'],['heading','內容區塊標題'],['body','內容區塊內文'],['actionLabel','行動按鈕文字']]);
    const write=(key,value)=>{drafts.set(selected,{...(drafts.get(selected)||sectionDraft(current)),[key]:value});notify();};
    for(const key of ['eyebrow','heading','body',...(['hero','cta'].includes(current.type)?['actionLabel']:[])]){const entry=field(labels.get(key),'section-'+key,draft[key],key==='body');entry.input.addEventListener('input',()=>{if(alive())write(key,entry.input.value);});workspace.append(entry.wrap);}
    if(['hero','cta'].includes(current.type)){
      const target=choose('行動目標（頁內內容區塊）','section-actionTarget',[{id:'',label:'不設定目標'},...state.sections.map(section=>({id:section.id,label:section.heading+'（'+section.id+'）'}))],draft.actionTarget);
      target.input.addEventListener('change',()=>{if(alive())write('actionTarget',target.input.value);});workspace.append(target.wrap);
    }
    if(current.type==='image'){
      const entry=draft.entries[0],options=[{id:'',label:'請明確選取固定圖片'}];
      if(entry.id&&!images.has(entry.id))options.push({id:entry.id,label:'原固定圖片目前無法讀取（保留引用，不自動替換）'});
      for(const [id,reference] of images)options.push({id,label:reference.versionSnapshot.artifact.title+'（'+id+'）'});
      const picker=choose('固定圖片引用','image-reference',options,entry.id);
      picker.input.addEventListener('change',()=>{if(!alive())return;const id=picker.input.value;if(id!==''&&!images.has(id)&&id!==current.entries[0].id){message('只能選取已提供的固定圖片引用，未替換圖片。');picker.input.value=(drafts.get(selected)||sectionDraft(current)).entries[0].id;return;}const entries=(drafts.get(selected)||sectionDraft(current)).entries.map(item=>({...item}));entries[0].id=id;write('entries',entries);});workspace.append(picker.wrap);
      for(const [key,label] of [['title','圖片替代文字'],['body','圖片說明']]){const input=field(label,'image-'+key,entry[key],true);input.input.addEventListener('input',()=>{if(!alive())return;const entries=(drafts.get(selected)||sectionDraft(current)).entries.map(item=>({...item}));entries[0][key]=input.input.value;write('entries',entries);});workspace.append(input.wrap);}
      workspace.append(element(document,'p','editor-note','只有按下套用才改變草稿中的固定引用。替代文字只作用於本網頁顯示，不會改寫來源圖片；圖片說明與原始來源註記完整保留。'));
    }
    if(['cards','faq'].includes(current.type)){
      workspace.append(element(document,'h4','',current.type==='faq'?'問答條目':'卡片條目'));
      const editEntries=operation=>{const next=(drafts.get(selected)||sectionDraft(current)).entries.map(entry=>({...entry}));operation(next);write('entries',next);revision++;draw();};
      draft.entries.forEach((entry,index)=>{
        const group=element(document,'fieldset','webpage-entry-editor');group.append(element(document,'legend','', '條目 '+(index+1)));
        for(const key of ['title','body']){const control=field('條目 '+(index+1)+(key==='title'?' 標題':' 內文'),'entry-'+index+'-'+key,entry[key],key==='body');control.input.addEventListener('input',()=>{if(!alive())return;const entries=(drafts.get(selected)||sectionDraft(current)).entries.map(item=>({...item}));entries[index][key]=control.input.value;write('entries',entries);});group.append(control.wrap);}
        group.append(button('上移條目 '+(index+1),()=>editEntries(entries=>entries.splice(index-1,0,entries.splice(index,1)[0])),index===0),button('下移條目 '+(index+1),()=>editEntries(entries=>entries.splice(index+1,0,entries.splice(index,1)[0])),index===draft.entries.length-1),button('移除條目 '+(index+1),()=>editEntries(entries=>entries.splice(index,1)),draft.entries.length===1));workspace.append(group);
      });
      workspace.append(button('新增條目（尚未套用）',()=>editEntries(entries=>entries.push(defaultWebpageEntry(freshId(new Set(entries.map(entry=>entry.id)),'entry')))),draft.entries.length>=12));
    }
    workspace.append(button('套用內容區塊修改至草稿',()=>commit(()=>updateWebpageSection(state,selected,drafts.get(selected)||sectionDraft(current)),()=>drafts.delete(selected))),button('放棄此內容區塊欄位修改',()=>{drafts.delete(selected);revision++;draw();message('已還原內容區塊欄位，草稿與版本沒有改變。');}));
    const addType=choose('新增內容區塊類型','add-type',TYPES.map(type=>({id:type,label:TYPE_NAMES.get(type)})),TYPES.includes(uiState.addType)?uiState.addType:'text');addType.input.addEventListener('change',()=>{if(alive()){uiState.addType=addType.input.value;revision++;draw();}});workspace.append(addType.wrap);
    if(addType.input.value==='image'){
      const addPin=choose('新增區塊固定圖片','add-image-reference',[{id:'',label:'請明確選取固定圖片'},...[...images].map(([id,reference])=>({id,label:reference.versionSnapshot.artifact.title+'（'+id+'）'}))],images.has(uiState.addImageReferenceId)?uiState.addImageReferenceId:'');
      addPin.input.addEventListener('change',()=>{if(!alive())return;uiState.addImageReferenceId=images.has(addPin.input.value)?addPin.input.value:'';addPin.input.value=uiState.addImageReferenceId;notify();});workspace.append(addPin.wrap);
      if(!images.size)workspace.append(element(document,'p','editor-note','尚無可選的固定圖片；請先在外層明確引用本專案的圖片版本。不能使用任意網址或自動選圖。'));
    }
    workspace.append(guardedButton('新增內容區塊至草稿',()=>commit(()=>addWebpageSection(state,addType.input.value,uiState.addImageReferenceId||''),()=>{selected=state.sections.at(-1).id;}),()=>state.sections.length>=20||(addType.input.value==='image'&&!images.has(uiState.addImageReferenceId))));
    const index=sectionIndex(state,selected);workspace.append(guardedButton('上移內容區塊',()=>commit(()=>reorderWebpageSection(state,selected,index-1)),()=>index===0),guardedButton('下移內容區塊',()=>commit(()=>reorderWebpageSection(state,selected,index+1)),()=>index===state.sections.length-1),guardedButton('移除內容區塊',()=>commit(()=>removeWebpageSection(state,selected),()=>drafts.delete(selected)),()=>state.sections.length===1));
    workspace.append(guardedButton('復原上一步草稿操作',()=>{if(!history.length)return;const previous=history.pop();state=checkedWebpage(previous.artifact);selected=state.sections.some(section=>section.id===previous.selected)?previous.selected:state.sections[0].id;uiState.selectedSectionId=selected;drafts.clear();delete uiState.documentDraft;revision++;remember();draw();message('已復原草稿，尚未保存版本。');emit();},()=>!history.length));
    if([...drafts.keys()].some(id=>!state.sections.some(section=>section.id===id)))workspace.append(button('放棄已移除內容區塊的未套用欄位',()=>{for(const id of drafts.keys())if(!state.sections.some(section=>section.id===id))drafts.delete(id);revision++;draw();}));
    livePreview?.disposeImagePreview?.();livePreview=renderWebpage(state,{document,idPrefix:prefix+'-preview',references:[...images.values()],loadImage});preview.replaceChildren(livePreview);notify();
  };draw();return root;
}
function html(value){return String(value).replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character])).replace(/\r/g,'&#13;');}
function serialize(node){const opening='<'+node.tag+Object.entries(node.attrs).map(([name,value])=>' '+name+'="'+html(value)+'"').join('')+'>';return node.tag==='img'?opening:opening+(node.value===null?'':html(node.value))+node.children.map(serialize).join('')+'</'+node.tag+'>'; }
export const WEBPAGE_CSP="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; media-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'";
export function exportWebpage(value,format){
  const artifact=checkedWebpage(value);fail(['html','json','txt'].includes(format),'網頁作品只支援 HTML、JSON 或 TXT 匯出。');
  if(webpageImageReferenceIds(artifact).length){
    fail(format!=='html','含圖網頁 HTML 必須使用非同步匯出並驗證固定 PNG，未建立不完整檔案。');
    const notice='只包含這份網頁的文字、風格、結構與固定圖片引用識別碼；不包含 PNG 圖片像素、來源完整版本或私人專案資料，不是完整專案備份。';
    return format==='json'?{filename:'webpage-metadata-only.json',mime:'application/json;charset=utf-8',text:JSON.stringify({notice,artifact},null,2)+'\n'}:{filename:'webpage-text-only.txt',mime:'text/plain;charset=utf-8',text:notice+'\n\n'+canonicalJson(artifact)+'\n'};
  }
  if(format==='json'||format==='txt')return {filename:'webpage.'+format,mime:(format==='json'?'application/json':'text/plain')+';charset=utf-8',text:canonicalJson(artifact)+'\n'};
  return {filename:'webpage.html',mime:'text/html;charset=utf-8',text:'<!doctype html>\n<html lang="zh-Hant"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+html(WEBPAGE_CSP)+'"><meta name="viewport" content="width=device-width, initial-scale=1"><title>'+html(artifact.title)+'</title><style>'+WEBPAGE_STYLES+'</style></head><body>'+serialize(webpageSpec(artifact,'webpage-export'))+'</body></html>\n'};
}

export const MAX_WEBPAGE_EXPORT_BYTES=MAX_PRIVATE_IMAGE_EXPORT_BYTES;
export const WEBPAGE_IMAGE_CSP=WEBPAGE_CSP.replace("img-src 'none'","img-src data:");
export async function exportWebpageHtml(value,{references=[],loadImage,isCurrent=()=>true}={}){
  fail(typeof isCurrent==='function','網頁匯出缺少有效的狀態檢查。');
  const current=()=>fail(isCurrent()===true,'網頁匯出已失效或取消，未建立下載檔案。');
  current();const artifact=checkedWebpage(value),occurrences=artifact.sections.filter(section=>section.type==='image').map(section=>section.entries[0].id);
  if(!occurrences.length){current();return exportWebpage(artifact,'html');}
  const images=await preparePrivateImageExport(occurrences,{references,loadImage,isCurrent,context:'網頁'});current();
  const media=entry=>{
    const image=images.get(entry.id);fail(!!image&&typeof image.dataUrl==='string'&&image.dataUrl.startsWith('data:image/png;base64,'),'固定 PNG 尚未完成驗證，未匯出。');
    const artifact=image.image,asset=artifact.asset;
    return spec('figure',{class:'artifact-image-preview'},null,[spec('div',{class:'image-preview-frame'},null,[spec('img',{class:'image-preview-image',src:image.dataUrl,alt:entry.title,width:asset.width,height:asset.height})]),spec('figcaption',{class:'image-preview-caption'},null,[spec('h3',{class:'image-preview-title'},artifact.title),spec('p',{class:'image-preview-origin'},'來源：已保存的固定圖片版本'),spec('p',{class:'image-preview-attribution'},'來源註記：'+(artifact.attribution||'尚未填寫'))])]);
  };
  const text='<!doctype html>\n<html lang="zh-Hant"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+html(WEBPAGE_IMAGE_CSP)+'"><meta name="viewport" content="width=device-width, initial-scale=1"><title>'+html(artifact.title)+'</title><style>'+WEBPAGE_STYLES+'</style></head><body>'+serialize(webpageSpec(artifact,'webpage-export',media))+'<footer><p>此檔案包含已驗證的固定 PNG 圖片與網頁內容，不是完整專案備份。</p></footer></body></html>\n';
  current();return {filename:'webpage.html',mime:'text/html;charset=utf-8',text};
}
