/** Local composition exports. The caller alone authorizes private PNG reads.
 * JSON/TXT do not contain pixels or a project backup. HTML contains only fixed
 * styles, escaped literal text and verified, pinned PNG data URLs; no scripts.
 */
import {cloneComposition,compositionPlainText,COMPOSITION_STYLES} from './composition.js';
import {validateImageArtifact} from './image.js';
import {parseImageHeader,IMAGE_UPLOAD_LIMITS} from './image-upload.js';

export const MAX_COMPOSITION_EXPORT_BYTES=20*1024*1024;
const fail=(condition,message)=>{if(!condition)throw new Error(message);};
const clone=value=>JSON.parse(JSON.stringify(value));
const NOTICE='僅含這份圖文排版的可編輯文字、版型與固定圖片引用識別碼；未包含 PNG 圖片、引用來源完整版本或其他專案私人資料，不是完整專案備份。';
const TEXT_NOTICE='純文字匯出，不含 PNG 圖片像素、視覺排版或完整專案私人資料，不是完整專案備份。';
const HTML_NOTICE='此檔案包含已驗證的固定 PNG 圖片與圖文排版，不是完整專案備份。海報版型可延展，不保證固定印刷尺寸或單頁列印。';
const escape=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/\r/g,'&#13;');

export function exportComposition(value,format){
  const artifact=cloneComposition(value);
  fail(format==='json'||format==='txt','圖文排版同步匯出只支援 JSON 或 TXT；含圖 HTML 必須先驗證並讀取固定圖片。');
  return format==='json'
    ?{filename:artifact.kind+'-metadata-only.json',mime:'application/json;charset=utf-8',text:JSON.stringify({notice:NOTICE,artifact},null,2)+'\n'}
    :{filename:artifact.kind+'-text-only.txt',mime:'text/plain;charset=utf-8',text:TEXT_NOTICE+'\n\n'+compositionPlainText(artifact)};
}

function resolveImages(artifact,references){
  fail(Array.isArray(references),'固定圖片引用必須是清單。');
  const index=new Map(),duplicates=new Set();
  for(const reference of references){
    if(!reference||typeof reference.id!=='string')continue;
    if(index.has(reference.id))duplicates.add(reference.id);
    else index.set(reference.id,reference);
  }
  const images=new Map(),jobs=new Map();let embeddedBytes=0;
  for(const block of artifact.blocks){
    const id=block.imageRefId;if(!id)continue;
    fail(!duplicates.has(id),'固定圖片引用 '+id+' 重複且不明確，未匯出或替換圖片。');
    const reference=index.get(id),snapshot=reference?.versionSnapshot;
    fail(reference&&typeof reference.targetItemId==='string'&&reference.targetItemId.trim()!==''&&typeof reference.versionId==='string'&&reference.versionId.trim()!==''&&snapshot?.contentType==='image','找不到有效的固定圖片引用 '+id+'，未匯出或替換圖片。');
    // Exact source identity is required; a missing or different snapshot ID
    // must never be read as the pinned version named by the reference.
    fail(snapshot.id===reference.versionId,'固定圖片引用與保存的版本識別碼不符，未匯出。');
    const error=validateImageArtifact(snapshot.artifact);fail(!error,'固定圖片引用無效：'+error);
    const image=clone(snapshot.artifact),asset=image.asset;
    fail(asset.byteLength<=IMAGE_UPLOAD_LIMITS.maxOutputBytes,'固定 PNG 圖片超過 4 MiB，未匯出。');
    // Each occurrence is embedded in the HTML. Count those bytes even when
    // network-free verification and the parent-owned read can be deduplicated.
    embeddedBytes+=asset.byteLength;
    fail(embeddedBytes<=MAX_COMPOSITION_EXPORT_BYTES,'圖文 HTML 內嵌圖片合計超過 20 MiB（依各區塊實際內嵌次數計算），未讀取、未匯出且未省略圖片。');
    const key=JSON.stringify([reference.targetItemId,reference.versionId,asset.id]);
    if(jobs.has(key))fail(JSON.stringify(jobs.get(key).image)===JSON.stringify(image),'同一固定圖片版本的中繼資料互相衝突，未匯出。');
    else jobs.set(key,{image,reference:{...reference,versionSnapshot:{...snapshot,artifact:clone(image)}},dataUrl:null});
    images.set(id,jobs.get(key));
  }
  return {images,jobs};
}

function base64(bytes){
  // Encode bounded slices without a giant spread call or any Node dependency.
  fail(typeof globalThis.btoa==='function','此環境沒有安全的本機 PNG 編碼功能，未匯出。');
  const chunks=[];
  // A multiple of three permits concatenating independently encoded chunks.
  for(let offset=0;offset<bytes.length;offset+=24576)chunks.push(globalThis.btoa(String.fromCharCode(...bytes.subarray(offset,offset+24576))));
  return chunks.join('');
}

function renderHtml(artifact,images){
  const illustrated=artifact.kind==='illustrated';
  const media=(id,caption)=>{
    const entry=images.get(id),image=entry.image,asset=image.asset;
    fail(typeof entry.dataUrl==='string'&&entry.dataUrl.startsWith('data:image/png;base64,'),'固定 PNG 尚未完成驗證，未匯出。');
    return '<figure class="composition-media"><figure class="artifact-image-preview"><div class="image-preview-frame"><img class="image-preview-image" src="'+entry.dataUrl+'" alt="'+escape(image.alt)+'" width="'+asset.width+'" height="'+asset.height+'"></div><figcaption class="image-preview-caption"><h4 class="image-preview-title">'+escape(image.title)+'</h4><p class="image-preview-origin">來源：外部上傳圖片（不是 AI 生圖）</p><p class="image-preview-attribution">來源註記：'+escape(image.attribution||'尚未填寫')+'</p></figcaption></figure>'+(caption!==''?'<figcaption class="composition-caption">'+escape(caption)+'</figcaption>':'')+'</figure>';
  };
  const sections=artifact.blocks.map(block=>{
    let content;
    if(illustrated){
      content=(block.imageRefId?media(block.imageRefId,block.caption):'')+'<div class="composition-copy">'+(block.heading!==''?'<h2 class="composition-heading">'+escape(block.heading)+'</h2>':'')+'<p class="composition-body">'+escape(block.body)+'</p>'+(!block.imageRefId&&block.caption!==''?'<p class="composition-caption">'+escape(block.caption)+'</p>':'')+'</div>';
    }else content=block.type==='image'?media(block.imageRefId,block.text):block.type==='headline'?'<h2 class="composition-headline">'+escape(block.text)+'</h2>':'<p class="composition-body">'+escape(block.text)+'</p>';
    return '<section class="composition-block '+(illustrated?'composition-layout-'+block.layout:'composition-align-'+block.alignment)+'">'+content+'</section>';
  }).join('\n');
  // This policy is defense in depth. Authored content never supplies markup,
  // CSS, resource URLs or a download filename, even when opened without CSP.
  const policy="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
  return '<!doctype html>\n<html lang="zh-Hant"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+escape(policy)+'"><meta name="viewport" content="width=device-width, initial-scale=1"><title>'+escape(artifact.title)+'</title><style>'+COMPOSITION_STYLES+'</style></head><body>\n<article class="artifact-preview composition-preview composition-'+artifact.kind+' composition-theme-'+artifact.theme+(!illustrated?' composition-poster-'+artifact.format:'')+'" aria-label="'+escape(artifact.title)+'"><h1 class="composition-title">'+escape(artifact.title)+'</h1>\n'+sections+'\n</article><footer><p>'+HTML_NOTICE+'</p></footer>\n</body></html>\n';
}

export async function exportCompositionHtml(value,{references=[],loadImage,isCurrent=()=>true}={}){
  fail(typeof isCurrent==='function','圖文匯出缺少有效的狀態檢查。');
  const current=()=>fail(isCurrent()===true,'圖文匯出已失效或取消，未建立下載檔案。');
  // Check on rejection as well as success; a cancelled private read must not
  // turn into a downloadable partial document or initiate another read.
  const wait=async operation=>{current();try{return await operation();}finally{current();}};
  current();
  const artifact=cloneComposition(value),{images,jobs}=resolveImages(artifact,references);
  if(jobs.size){
    fail(typeof loadImage==='function','未提供已授權的私人 PNG 讀取方式，未匯出。');
    fail(typeof globalThis.Blob==='function','此環境無法驗證本機 PNG Blob，未匯出。');
    fail(typeof globalThis.crypto?.subtle?.digest==='function','此環境不支援安全的 SHA256 圖片驗證，未匯出。');
  }
  for(const job of jobs.values()){
    const asset=job.image.asset;
    // Pass a separate copy: caller mutations, including an asynchronous
    // loader changing its argument, cannot change the pinned verification.
    const reference={...job.reference,versionSnapshot:{...job.reference.versionSnapshot,artifact:clone(job.image)}};
    const blob=await wait(()=>loadImage(reference));current();
    fail(blob instanceof globalThis.Blob&&blob.type==='image/png'&&blob.size===asset.byteLength&&blob.size>0&&blob.size<=IMAGE_UPLOAD_LIMITS.maxOutputBytes,'固定圖片讀取結果必須是大小相符且不超過 4 MiB 的 PNG Blob，未匯出。');
    const buffer=await wait(()=>blob.arrayBuffer());current();
    fail(buffer instanceof ArrayBuffer&&buffer.byteLength===asset.byteLength,'固定 PNG 圖片實際位元組長度與保存資料不符，未匯出。');
    const bytes=new Uint8Array(buffer),header=parseImageHeader(bytes);
    fail(header.mime==='image/png'&&header.width===asset.width&&header.height===asset.height,'固定 PNG 圖片格式或尺寸與保存資料不符，未匯出。');
    const digest=await wait(()=>globalThis.crypto.subtle.digest('SHA-256',bytes));current();
    const hash=Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
    fail(hash===asset.sha256,'固定 PNG 圖片 SHA256 與保存資料不符，未匯出或替換圖片。');
    job.dataUrl='data:image/png;base64,'+base64(bytes);current();
  }
  current();const text=renderHtml(artifact,images);current();
  return {filename:artifact.kind+'.html',mime:'text/html;charset=utf-8',text};
}
