/** Local composition exports. The caller alone authorizes private PNG reads.
 * JSON/TXT do not contain pixels or a project backup. HTML contains only fixed
 * styles, escaped literal text and verified, pinned PNG data URLs; no scripts.
 */
import {cloneComposition,compositionPlainText,COMPOSITION_STYLES} from './composition.js';
import {preparePrivateImageExport,MAX_PRIVATE_IMAGE_EXPORT_BYTES} from './private-image-export.js';

export const MAX_COMPOSITION_EXPORT_BYTES=MAX_PRIVATE_IMAGE_EXPORT_BYTES;
const fail=(condition,message)=>{if(!condition)throw new Error(message);};
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
  current();const artifact=cloneComposition(value);
  const images=await preparePrivateImageExport(artifact.blocks.map(block=>block.imageRefId),{references,loadImage,isCurrent});
  current();const text=renderHtml(artifact,images);current();
  return {filename:artifact.kind+'.html',mime:'text/html;charset=utf-8',text};
}
