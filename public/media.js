/** Same-origin, session-bound image transport. No public asset URLs or AI calls. */
export class MediaError extends Error {
  constructor(message,status=0,data=null,uncertain=false){super(message);this.name='MediaError';this.status=status;this.data=data;this.uncertain=uncertain;}
}
export function createMediaAdapter({base='./media.php',getCsrf=()=>'',fetchImpl=(...args)=>globalThis.fetch(...args),location=globalThis.location}={}) {
  function target(){
    const url=new URL(base,location.href);
    if(url.origin!==new URL(location.href).origin)throw new MediaError('圖片只能傳送到目前安裝網站。');
    url.search='';url.hash='';return url;
  }
  async function send(body,headers,mutating){
    let response;
    try{response=await fetchImpl(target(),{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'X-CSRF-Token':getCsrf(),...headers},body});}
    catch(error){if(error instanceof MediaError)throw error;throw new MediaError(mutating?'無法確認圖片是否已保存。請先檢查最新紀錄，再沿用同一請求重試；本次上傳不呼叫 AI。':'無法讀取私人圖片，請稍後重試。',0,null,mutating);}
    if(!response.ok){
      let data=null;try{data=await response.json();}catch(_){}
      const outcome=data?.error?.operationOutcome;
      throw new MediaError(typeof data?.error==='string'?data.error:data?.error?.message || '圖片操作未完成。',response.status,data,mutating && outcome!=='rejected' && (outcome==='unknown'||response.status>=500));
    }
    return response;
  }
  return {
    async uploadImage(payload,blob){
      if(!blob || blob.type!=='image/png' || !blob.size || blob.size>4194304)throw new MediaError('請先在本機製作有效的 PNG 副本。');
      const form=new FormData();form.append('action','upload_image');form.append('payload',JSON.stringify(payload));form.append('image',blob,'normalized.png');
      const response=await send(form,{Accept:'application/json'},true);
      let data;try{data=await response.json();}catch(_){throw new MediaError('伺服器回應不完整，圖片保存結果尚未確認；不會自動重試。',response.status,null,true);}
      if(!data || !data.project || typeof data.project!=='object' || data.project.id!==payload.id || !Array.isArray(data.project.versions) || !Array.isArray(data.project.comparisons) || typeof data.uploadedVersionId!=='string')throw new MediaError('伺服器未回傳完整圖片版本，請先檢查最新紀錄。',response.status,data,true);
      return data;
    },
    async readImage({id,itemId,versionId}){
      const response=await send(JSON.stringify({action:'read_image',id,itemId,versionId}),{'Content-Type':'application/json',Accept:'image/png'},false);
      if((response.headers?.get('Content-Type') || '').split(';')[0].trim().toLowerCase()!=='image/png')throw new MediaError('私人圖片回應不是 PNG，未建立預覽。',response.status);
      const contentLength=response.headers?.get('Content-Length');if(contentLength && /^\d+$/.test(contentLength) && Number(contentLength)>4194304)throw new MediaError('私人圖片超過 4 MiB，未建立預覽或下載。',response.status);
      const blob=await response.blob();if(blob.type!=='image/png' || !blob.size || blob.size>4194304)throw new MediaError('私人圖片回應不完整，未建立預覽。',response.status);
      return blob;
    }
  };
}
