/** External uploaded-image metadata only. No URL imports, upload, AI, or pixel editing. */
const ROOT_KEYS=['kind','title','alt','attribution','asset'];
const ASSET_KEYS=['id','mime','width','height','byteLength','sha256','normalization'];
const FIELDS=[['title','圖片標題'],['alt','圖片替代文字'],['attribution','圖片來源註記']];
const fail=(condition,message)=>{if(!condition)throw new Error(message);};
const bytes=value=>new TextEncoder().encode(value).length;
let instanceSequence=0;
function validUnicode(value){for(let i=0;i<value.length;i++){const code=value.charCodeAt(i);if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))return false;}else if(code>=0xdc00&&code<=0xdfff)return false;}return true;}
function object(value,keys,name){
  fail(value!==null&&typeof value==='object'&&!Array.isArray(value),name+'必須是完整物件。');
  fail(JSON.stringify(Object.keys(value).sort())===JSON.stringify([...keys].sort())&&Reflect.ownKeys(value).length===keys.length,name+'缺少欄位或包含未支援的欄位。');
}
function text(value,max,name,empty=true){
  fail(typeof value==='string'&&validUnicode(value)&&!value.includes('\0'),name+'必須是有效 UTF8 文字。');
  fail(bytes(value)<=max&&(empty||value.trim()!==''),name+'空白或超過長度上限。');
  fail(!/\bsk-[a-zA-Z0-9_-]{16,}\b/.test(value),'請勿在對話或作品欄位貼入 API Key；請只使用 API 設定中的密碼欄。');return value;
}
function canonicalJson(value){return JSON.stringify(value).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');}
function checkedImage(value){
  object(value,ROOT_KEYS,'圖片作品');fail(value.kind==='image','圖片作品類型欄位不正確。');
  const title=text(value.title,600,'圖片標題',false),alt=text(value.alt,3000,'圖片替代文字'),attribution=text(value.attribution,2000,'圖片來源註記'),asset=value.asset;
  object(asset,ASSET_KEYS,'圖片資產');
  fail(typeof asset.id==='string'&&/^[a-f0-9]{32}$(?![\s\S])/.test(asset.id),'圖片資產識別碼必須是32個小寫十六進位字元。');
  fail(asset.mime==='image/png','圖片資產格式必須是 image/png。');
  for(const dimension of ['width','height'])fail(Number.isInteger(asset[dimension])&&asset[dimension]>=1&&asset[dimension]<=2048,'圖片寬高必須是1至2048的整數。');
  fail(Number.isInteger(asset.byteLength)&&asset.byteLength>=1&&asset.byteLength<=4194304,'圖片位元組長度必須是1至4194304的整數。');
  fail(typeof asset.sha256==='string'&&/^[a-f0-9]{64}$(?![\s\S])/.test(asset.sha256),'圖片 SHA256 必須是64個小寫十六進位字元。');
  fail(asset.normalization==='png-v1','圖片正規化版本必須是 png-v1。');
  return {kind:'image',title,alt,attribution,asset:{id:asset.id,mime:'image/png',width:asset.width,height:asset.height,byteLength:asset.byteLength,sha256:asset.sha256,normalization:'png-v1'}};
}
// Shape validation is not authorization or a claim that the referenced bytes exist.
export function validateImageArtifact(value){try{checkedImage(value);return '';}catch(error){return error.message;}}
export function imageArtifactItems(value){return [{id:'document',label:'圖片來源',content:canonicalJson(checkedImage(value))}];}
export function imageArtifactFromItems(items){
  fail(Array.isArray(items)&&items.length===1&&Object.keys(items).length===1&&Reflect.ownKeys(items).length===2&&Object.keys(items)[0]==='0','圖片來源必須只有一個完整項目。');
  object(items[0],['id','label','content'],'圖片來源');fail(items[0].id==='document'&&items[0].label==='圖片來源','圖片來源必須是完整的 document 項目。');
  const content=text(items[0].content,60000,'圖片來源 JSON',false);let value;
  try{value=JSON.parse(content);}catch{throw new Error('圖片來源必須是有效的完整 JSON 物件。');}
  return checkedImage(value);
}
function element(document,tag,className='',content=null){const node=document.createElement(tag);if(className)node.className=className;if(content!==null)node.textContent=content;return node;}
function attr(node,name,value){node.setAttribute(name,String(value));return node;}

export function createImagePreview(document,value,{loadImage,onError}={}){
  const artifact=checkedImage(value),root=element(document,'figure','artifact-image-preview'),frame=element(document,'div','image-preview-frame'),caption=element(document,'figcaption','image-preview-caption');
  const status=attr(element(document,'p','image-preview-status'),'role','status');attr(status,'aria-live','polite');
  caption.append(element(document,'h4','image-preview-title',artifact.title),element(document,'p','image-preview-origin','來源：外部上傳圖片（不是 AI 生圖）'),element(document,'p','image-preview-alt','替代文字：'+(artifact.alt||'尚未填寫')),element(document,'p','image-preview-attribution','來源註記：'+(artifact.attribution||'尚未填寫')),element(document,'p','image-preview-metadata',artifact.asset.width+' × '+artifact.asset.height+' 像素；PNG；'+artifact.asset.byteLength+' 位元組'));
  root.append(frame,status,caption);
  const view=document.defaultView||globalThis,urlApi=view.URL,BlobClass=view.Blob||globalThis.Blob;
  let disposed=false,objectUrl=null,image=null,failed=false;
  const revoke=()=>{if(objectUrl!==null){const url=objectUrl;objectUrl=null;try{urlApi.revokeObjectURL(url);}catch{ /* Cleanup remains idempotent even when the host is closing. */ }}};
  root.disposeImagePreview=()=>{if(disposed)return;disposed=true;revoke();if(image){image.removeAttribute('src');frame.replaceChildren();}status.textContent='圖片預覽已關閉。';};
  const report=error=>{if(disposed||failed)return;failed=true;revoke();if(image)image.removeAttribute('src');frame.replaceChildren();status.textContent='圖片預覽無法載入；圖片中繼資料仍保留。';if(typeof onError==='function'){try{onError(error);}catch{ /* A consumer error must not create an unhandled async rejection. */ }}};
  if(typeof loadImage!=='function'){status.textContent='目前無法預覽：尚未提供已授權圖片的讀取方式。';return root;}
  if(!urlApi||typeof urlApi.createObjectURL!=='function'||typeof urlApi.revokeObjectURL!=='function'||typeof BlobClass!=='function'){status.textContent='目前環境不支援安全的本機圖片預覽。';return root;}
  status.textContent='正在讀取已保存的圖片副本…';
  // Parent-owned loading must authorize the project/item/version. Authored
  // metadata never becomes a fetch destination, CSS URL, source URL, or API call.
  Promise.resolve().then(()=>disposed?null:loadImage(checkedImage(artifact))).then(blob=>{
    if(disposed)return;
    fail(blob instanceof BlobClass&&blob.type==='image/png'&&blob.size===artifact.asset.byteLength,'圖片讀取結果必須是大小相符的 PNG Blob。');
    image=element(document,'img','image-preview-image');attr(image,'alt',artifact.alt);attr(image,'width',artifact.asset.width);attr(image,'height',artifact.asset.height);attr(image,'decoding','async');
    image.addEventListener('load',()=>{if(!disposed&&!failed)status.textContent='已顯示保存的 PNG 圖片副本。';});
    image.addEventListener('error',()=>report(new Error('保存的 PNG 圖片副本無法顯示。')));
    objectUrl=urlApi.createObjectURL(blob);
    fail(typeof objectUrl==='string'&&objectUrl.startsWith('blob:'),'圖片預覽只接受本機 Blob 來源。');
    if(disposed){revoke();return;} // Also safe if a host hook disposes synchronously.
    attr(image,'src',objectUrl);if(!disposed&&!failed)frame.append(image);
  }).catch(report);
  return root;
}

function metadataDraft(value){return {title:value.title,alt:value.alt,attribution:value.attribution};}
export function createImageEditor(document,value,{onChange=()=>{},onPendingChange=()=>{},uiState={},disabled=false,idPrefix='image'}={}){
  let state=checkedImage(value),revision=0,lastPending=null;
  const serialized=canonicalJson(state);
  // Do not transplant unsaved metadata onto a different version or image.
  if(uiState.lastImageArtifact!==serialized)delete uiState.imageFieldDraft;
  uiState.lastImageArtifact=serialized;
  const token={};uiState.imageEditorToken=token;
  const prefix=String(idPrefix).replace(/[^a-zA-Z0-9_-]/g,'_')+'-'+(++instanceSequence),root=element(document,'div','artifact-editor artifact-image-editor'),workspace=element(document,'div','image-editor-workspace');
  const status=attr(element(document,'p','artifact-error'),'role','status'),pendingStatus=element(document,'p','editor-note image-pending-status');status.id=prefix+'-status';attr(status,'aria-live','polite');
  root.append(element(document,'p','editor-note','只修改圖片標題、替代文字與來源註記。請明確套用至草稿，再另存版本；不會替換圖片、修改像素、上傳或呼叫 AI。'),element(document,'p','image-preview-origin','來源：外部上傳圖片（不是 AI 生圖）'),status,pendingStatus,workspace);
  const alive=()=>uiState.imageEditorToken===token;
  const notify=()=>{if(!alive())return;const pending=!!uiState.imageFieldDraft&&canonicalJson(uiState.imageFieldDraft)!==canonicalJson(metadataDraft(state));pendingStatus.textContent=pending?'圖片文字欄位尚未套用。':'';if(pending!==lastPending){lastPending=pending;onPendingChange(pending);}};
  const draw=()=>{
    workspace.replaceChildren();const drawRevision=revision,usable=()=>!disabled&&alive()&&drawRevision===revision,draft=uiState.imageFieldDraft||metadataDraft(state);
    for(const [key,labelText] of FIELDS){
      const wrap=element(document,'div','field'),label=element(document,'label','field-label',labelText),input=element(document,'textarea');input.id=prefix+'-'+key;input.value=draft[key];input.rows=key==='title'?2:4;input.disabled=disabled;attr(label,'for',input.id);attr(input,'aria-describedby',status.id);
      // Textareas avoid input newline sanitization. Only explicitly edited
      // fields are read back, preserving untouched CR/LF and all literal text.
      input.addEventListener('input',()=>{if(!usable())return;uiState.imageFieldDraft={...(uiState.imageFieldDraft||metadataDraft(state)),[key]:input.value};status.textContent='';notify();});wrap.append(label,input);workspace.append(wrap);
    }
    const button=(label,handler)=>{const node=element(document,'button','button small',label);node.type='button';node.disabled=disabled;node.addEventListener('click',()=>{if(usable())handler();});return node;};
    workspace.append(button('套用圖片文字至草稿',()=>{
      let next;try{next=checkedImage({...state,...(uiState.imageFieldDraft||metadataDraft(state)),asset:state.asset});}catch(error){status.textContent=error.message;return;}
      const changed=canonicalJson(next)!==canonicalJson(state);state=next;delete uiState.imageFieldDraft;uiState.lastImageArtifact=canonicalJson(state);revision++;draw();
      status.textContent=changed?'草稿已更新，尚未另存版本。':'沒有內容變更，尚未建立或保存任何版本。';
      if(changed){try{onChange(checkedImage(state));}catch(error){status.textContent='草稿已更新，但外層接收失敗；尚未保存版本。'+(error?.message?' '+error.message:'');}}
    }),button('放棄圖片文字欄位修改',()=>{delete uiState.imageFieldDraft;revision++;draw();status.textContent='已還原圖片文字欄位，草稿與版本沒有改變。';}));
    notify();
  };draw();return root;
}
