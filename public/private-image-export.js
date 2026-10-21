/** Shared fail-closed private PNG verification for local static exports.
 * No URLs, fetches, credentials, persistence or authorization decisions here.
 * Caller supplies exact pinned references and an already-authorized Blob reader.
 */
import {validateImageArtifact} from './image.js';
import {parseImageHeader,IMAGE_UPLOAD_LIMITS} from './image-upload.js';
export const MAX_PRIVATE_IMAGE_EXPORT_BYTES=20*1024*1024;
const fail=(condition,message)=>{if(!condition)throw new Error(message);};
const clone=value=>JSON.parse(JSON.stringify(value));

function resolveImages(referenceIds,references,context){
  fail(Array.isArray(references),'固定圖片引用必須是清單。');
  const index=new Map(),duplicates=new Set();
  for(const reference of references){
    if(!reference||typeof reference.id!=='string')continue;
    if(index.has(reference.id))duplicates.add(reference.id);
    else index.set(reference.id,reference);
  }
  const images=new Map(),jobs=new Map();let embeddedBytes=0;
  for(const id of referenceIds){
    if(!id)continue;
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
    fail(embeddedBytes<=MAX_PRIVATE_IMAGE_EXPORT_BYTES,context+' HTML 內嵌圖片合計超過 20 MiB（依各區塊實際內嵌次數計算），未讀取、未匯出且未省略圖片。');
    const key=JSON.stringify([reference.targetItemId,reference.versionId,asset.id]);
    if(jobs.has(key))fail(JSON.stringify(jobs.get(key).image)===JSON.stringify(image),'同一固定圖片版本的中繼資料互相衝突，未匯出。');
    else jobs.set(key,{image,reference:clone({...reference,versionSnapshot:{...snapshot,artifact:image}}),dataUrl:null});
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

export async function preparePrivateImageExport(referenceIds,{references=[],loadImage,isCurrent=()=>true,context='圖文'}={}){
  fail(typeof isCurrent==='function',context+'匯出缺少有效的狀態檢查。');
  const current=()=>fail(isCurrent()===true,context+'匯出已失效或取消，未建立下載檔案。');
  // Check on rejection as well as success; a cancelled private read must not
  // turn into a downloadable partial document or initiate another read.
  const wait=async operation=>{current();try{return await operation();}finally{current();}};
  current();
  const {images,jobs}=resolveImages(referenceIds,references,context);
  if(jobs.size){
    fail(typeof loadImage==='function','未提供已授權的私人 PNG 讀取方式，未匯出。');
    fail(typeof globalThis.Blob==='function','此環境無法驗證本機 PNG Blob，未匯出。');
    fail(typeof globalThis.crypto?.subtle?.digest==='function','此環境不支援安全的 SHA256 圖片驗證，未匯出。');
  }
  for(const job of jobs.values()){
    const asset=job.image.asset;
    // Pass a separate copy: caller mutations, including an asynchronous
    // loader changing its argument, cannot change the pinned verification.
    const reference=clone(job.reference);
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
  current();return images;
}
