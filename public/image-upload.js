/** Local-only external-image preparation. No upload, network, AI or persistence.
 * Header checks are a bounded preflight, not a replacement for a real decoder or
 * the server's authoritative PNG validation, canonicalization and metadata strip.
 */
export const IMAGE_UPLOAD_LIMITS=Object.freeze({
  maxSourceBytes:12*1024*1024,
  maxSourceDimension:8192,
  maxSourcePixels:16777216,
  maxOutputDimension:2048,
  maxOutputBytes:4*1024*1024
});
export const IMAGE_UPLOAD_HELP_TEXT='僅接受靜態 JPEG 或 PNG，不接受 SVG、GIF、WebP 或 APNG。原檔上限 12 MiB，寬高各不超過 8192 像素，總像素不超過 16,777,216。先在瀏覽器檢查格式與尺寸，再依照片方向及你選擇的 0／90／180／270 度順時針旋轉，製作最長邊不超過 2048 像素、上限 4 MiB 的 PNG 副本，保留透明度且不放大。原檔不會被修改；副本不沿用原檔名或原始 EXIF／IPTC／XMP 中繼資料。瀏覽器副本仍須由伺服器重新驗證、正規化並移除中繼資料。本步驟只在本機處理，不會自動上傳，不呼叫 AI，也不是 AI 生圖。';

const LIMITS=IMAGE_UPLOAD_LIMITS;
const PNG_SIGNATURE=[137,80,78,71,13,10,26,10];
const fail=(condition,message)=>{if(!condition)throw new Error(message);};
const u16=(bytes,offset)=>bytes[offset]*256+bytes[offset+1];
const u32=(bytes,offset)=>bytes[offset]*16777216+bytes[offset+1]*65536+bytes[offset+2]*256+bytes[offset+3];
const crcTable=Uint32Array.from({length:256},(_,index)=>{
  let value=index;
  for(let bit=0;bit<8;bit++)value=(value&1)?0xedb88320^(value>>>1):value>>>1;
  return value>>>0;
});
function crc32(bytes,start,end){
  let crc=0xffffffff;
  for(let i=start;i<end;i++)crc=crcTable[(crc^bytes[i])&255]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
}
function dimensions(width,height){
  fail(Number.isInteger(width)&&Number.isInteger(height)&&width>=1&&height>=1,'圖片寬高必須是大於零的整數。');
  fail(width<=LIMITS.maxSourceDimension&&height<=LIMITS.maxSourceDimension,'原始圖片寬高各不得超過 8192 像素。');
  fail(width*height<=LIMITS.maxSourcePixels,'原始圖片不得超過 16,777,216 總像素。');
}
function parsePng(bytes){
  let offset=8,width=0,height=0,colorType,bitDepth,seenPalette=false,seenData=false,endedData=false,dataBytes=0;
  while(offset<bytes.length){
    fail(bytes.length-offset>=12,'PNG 區塊標頭或校驗碼遭截斷。');
    const length=u32(bytes,offset),dataStart=offset+8;
    fail(length<=bytes.length-offset-12,'PNG 區塊長度超出檔案範圍。');
    const type=String.fromCharCode(...bytes.subarray(offset+4,dataStart)),dataEnd=dataStart+length,next=dataEnd+4;
    fail(/^[A-Za-z]{4}$/.test(type)&&/[A-Z]/.test(type[2]),'PNG 區塊類型不合法。');
    fail(!['acTL','fcTL','fdAT'].includes(type),'不支援 APNG 動畫，請另存為靜態 PNG。');
    fail(crc32(bytes,offset+4,dataEnd)===u32(bytes,dataEnd),'PNG 區塊校驗碼不正確。');
    fail(offset!==8||type==='IHDR','PNG 必須以 IHDR 區塊開始。');
    if(type==='IHDR'){
      fail(offset===8&&length===13,'PNG IHDR 長度不正確或重複出現。');
      width=u32(bytes,dataStart);height=u32(bytes,dataStart+4);dimensions(width,height);
      bitDepth=bytes[dataStart+8];colorType=bytes[dataStart+9];
      const depths={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
      fail(depths[colorType]?.includes(bitDepth)&&bytes[dataStart+10]===0&&bytes[dataStart+11]===0&&bytes[dataStart+12]<=1,'PNG IHDR 色彩、位元深度或壓縮設定不合法。');
    }else if(type==='PLTE'){
      fail(!seenPalette&&!seenData&&colorType!==0&&colorType!==4&&length>0&&length<=768&&length%3===0,'PNG 調色盤格式或順序不合法。');
      fail(colorType!==3||length/3<=2**bitDepth,'PNG 調色盤超過位元深度範圍。');
      seenPalette=true;
    }else if(type==='IDAT'){
      fail(!endedData&&(colorType!==3||seenPalette),'PNG 像素區塊順序或調色盤不合法。');
      seenData=true;dataBytes+=length;
    }else if(type==='IEND'){
      fail(length===0&&seenData&&dataBytes>0,'PNG 缺少像素資料或結尾格式不合法。');
      fail(next===bytes.length,'PNG 結尾之後不可附加資料。');
      return {mime:'image/png',width,height};
    }else{
      fail(type[0]===type[0].toLowerCase(),'PNG 包含未支援的必要區塊。');
    }
    if(seenData&&type!=='IDAT')endedData=true;
    offset=next;
  }
  throw new Error('PNG 缺少完整 IEND 結尾。');
}
function parseJpeg(bytes){
  let offset=2,frame=null,inScan=false,seenScan=false;
  while(offset<bytes.length){
    let marker;
    if(inScan){
      // Walk entropy bytes without decoding. Stuffed FF and restart markers are
      // not segment boundaries; all other markers return to the bounded parser.
      while(offset<bytes.length){
        if(bytes[offset++]!==255)continue;
        while(offset<bytes.length&&bytes[offset]===255)offset++;
        fail(offset<bytes.length,'JPEG 掃描資料遭截斷。');
        const value=bytes[offset++];
        if(value===0||(value>=0xd0&&value<=0xd7))continue;
        marker=value;break;
      }
      fail(marker!==undefined,'JPEG 缺少完整影像結尾。');
      inScan=false;
    }else{
      fail(bytes[offset++]===255,'JPEG 標記格式不正確。');
      while(offset<bytes.length&&bytes[offset]===255)offset++;
      fail(offset<bytes.length,'JPEG 標記遭截斷。');
      marker=bytes[offset++];
    }
    if(marker===0xd9){
      fail(frame&&seenScan,'JPEG 缺少影像尺寸或掃描資料。');
      fail(offset===bytes.length,'JPEG 結尾之後不可附加資料。');
      return {mime:'image/jpeg',width:frame.width,height:frame.height};
    }
    fail(marker!==0&&marker!==0xd8&&marker!==0x01&&!(marker>=0xd0&&marker<=0xd7),'JPEG 標記出現在不合法的位置。');
    fail(bytes.length-offset>=2,'JPEG 區段長度遭截斷。');
    const length=u16(bytes,offset),start=offset+2,end=offset+length;
    fail(length>=2&&length<=bytes.length-offset,'JPEG 區段長度超出檔案範圍。');
    if(marker>=0xc0&&marker<=0xcf&&![0xc4,0xc8,0xcc].includes(marker)){
      fail(marker===0xc0||marker===0xc2,'僅支援 8 位元基線式或漸進式 JPEG。');
      fail(frame===null&&length>=8,'JPEG 影像尺寸區段不合法或重複。');
      const precision=bytes[start],height=u16(bytes,start+1),width=u16(bytes,start+3),count=bytes[start+5];
      fail(precision===8&&[1,3,4].includes(count)&&length===8+3*count,'JPEG 影像尺寸區段的位元深度、色彩或長度不合法。');
      dimensions(width,height);
      const componentIds=new Set();
      for(let i=0;i<count;i++){
        const base=start+6+i*3,id=bytes[base],sampling=bytes[base+1];
        fail(!componentIds.has(id)&&(sampling>>4)>=1&&(sampling>>4)<=4&&(sampling&15)>=1&&(sampling&15)<=4&&bytes[base+2]<=3,'JPEG 色彩分量不合法。');
        componentIds.add(id);
      }
      frame={width,height,marker,componentIds};
    }else if(marker===0xda){
      fail(frame&&length>=6,'JPEG 掃描資料缺少有效影像尺寸。');
      const count=bytes[start],ids=new Set();
      fail(count>=1&&count<=frame.componentIds.size&&length===6+2*count,'JPEG 掃描區段長度或色彩數量不合法。');
      for(let i=0;i<count;i++){
        const id=bytes[start+1+i*2],table=bytes[start+2+i*2];
        fail(frame.componentIds.has(id)&&!ids.has(id)&&(table>>4)<=3&&(table&15)<=3,'JPEG 掃描色彩分量不合法。');ids.add(id);
      }
      const spectralStart=bytes[end-3],spectralEnd=bytes[end-2],approximation=bytes[end-1];
      if(frame.marker===0xc0)fail(spectralStart===0&&spectralEnd===63&&approximation===0,'基線式 JPEG 掃描設定不合法。');
      else fail(spectralStart<=spectralEnd&&spectralEnd<=63&&(spectralStart!==0||spectralEnd===0)&&(spectralStart===0||count===1)&&(approximation>>4)<=13&&(approximation&15)<=13&&((approximation>>4)===0||(approximation>>4)===(approximation&15)+1),'漸進式 JPEG 掃描設定不合法。');
      inScan=true;seenScan=true;
    }else{
      fail([0xc4,0xdb,0xdd,0xfe].includes(marker)||(marker>=0xe0&&marker<=0xef),'JPEG 包含未支援的標記。');
      if(marker===0xdd)fail(length===4,'JPEG 重新啟動間隔區段長度不合法。');
    }
    offset=end;
  }
  throw new Error('JPEG 缺少完整影像結尾。');
}

/** Inspect real bytes, never a name or MIME hint. No image decoder is called.
 * Checks all bounded PNG chunks, including animation chunks after IDAT, and
 * JPEG marker/segment bounds through every scan. Pixel data is not decompressed.
 */
export function parseImageHeader(bytes){
  fail(bytes instanceof Uint8Array,'圖片內容必須是 Uint8Array。');
  fail(bytes.length>0&&bytes.length<=LIMITS.maxSourceBytes,'原始圖片必須大於零且不得超過 12 MiB。');
  if(bytes.length>=8&&PNG_SIGNATURE.every((value,index)=>bytes[index]===value))return parsePng(bytes);
  if(bytes.length>=2&&bytes[0]===255&&bytes[1]===216)return parseJpeg(bytes);
  throw new Error('僅接受具有有效檔案標記的靜態 JPEG 或 PNG。');
}

/** Prepare only; caller must obtain a separate explicit upload action.
 * Rotation is clockwise, applied AFTER the decoder's EXIF orientation.
 * Dependency injection is for tests and compatibility, not remote decoding.
 * createImageBitmap decode failures are surfaced, not retried with a fallback.
 * The local blob-URL Image fallback is used only when that API is absent.
 */
export async function normalizeImageFile(file,{
  rotation=0,document=globalThis.document,createImageBitmap=globalThis.createImageBitmap,
  Image=globalThis.Image,URL=globalThis.URL,Blob=globalThis.Blob
}={}){
  fail([0,90,180,270].includes(rotation),'旋轉角度只能是 0、90、180 或 270 度。');
  fail(file&&Number.isSafeInteger(file.size)&&file.size>0&&file.size<=LIMITS.maxSourceBytes&&typeof file.arrayBuffer==='function','請選擇不超過 12 MiB 的 JPEG 或 PNG 檔案。');
  const sourceBytes=file.size;
  let buffer;
  try{buffer=await file.arrayBuffer();}catch{throw new Error('無法讀取選取的圖片檔案。');}
  fail(buffer instanceof ArrayBuffer&&buffer.byteLength===sourceBytes,'圖片內容長度與檔案大小不符。');
  const bytes=new Uint8Array(buffer),header=parseImageHeader(bytes);
  fail(document&&typeof document.createElement==='function'&&typeof Blob==='function','此瀏覽器缺少本機圖片正規化功能。');
  const source=new Blob([bytes],{type:header.mime});
  let bitmap=null,image=null,objectUrl=null,canvas=null;
  try{
    let decoded;
    if(typeof createImageBitmap==='function'){
      try{bitmap=await createImageBitmap(source,{imageOrientation:'from-image'});}catch{throw new Error('瀏覽器無法解碼此圖片，請另存為靜態 JPEG 或 PNG 後再試。');}
      decoded=bitmap;
    }else{
      fail(typeof Image==='function'&&URL&&typeof URL.createObjectURL==='function'&&typeof URL.revokeObjectURL==='function','此瀏覽器沒有可用的本機圖片解碼器。');
      image=new Image();objectUrl=URL.createObjectURL(source);
      fail(typeof objectUrl==='string'&&objectUrl.startsWith('blob:'),'本機圖片解碼器未提供安全的暫存網址。');
      image.decoding='async';
      await new Promise((resolve,reject)=>{
        image.onload=()=>resolve();
        image.onerror=()=>reject(new Error('瀏覽器無法解碼此圖片，請另存為靜態 JPEG 或 PNG 後再試。'));
        image.src=objectUrl;
      });
      decoded={width:image.naturalWidth,height:image.naturalHeight};
    }
    fail(decoded&&Number.isInteger(decoded.width)&&Number.isInteger(decoded.height),'瀏覽器未能取得有效圖片尺寸。');
    dimensions(decoded.width,decoded.height);
    const matching=decoded.width===header.width&&decoded.height===header.height;
    const oriented=header.mime==='image/jpeg'&&decoded.width===header.height&&decoded.height===header.width;
    fail(matching||oriented,'解碼後的圖片尺寸與檔案標頭不符。');
    const scale=Math.min(1,LIMITS.maxOutputDimension/Math.max(decoded.width,decoded.height));
    const drawWidth=Math.max(1,Math.round(decoded.width*scale)),drawHeight=Math.max(1,Math.round(decoded.height*scale));
    const swapped=rotation===90||rotation===270,width=swapped?drawHeight:drawWidth,height=swapped?drawWidth:drawHeight;
    canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d',{alpha:true});
    fail(context&&typeof canvas.toBlob==='function','此瀏覽器不支援透明 PNG 畫布輸出。');
    context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
    context.translate(width/2,height/2);context.rotate(rotation*Math.PI/180);
    context.drawImage(bitmap||image,-drawWidth/2,-drawHeight/2,drawWidth,drawHeight);
    const blob=await new Promise((resolve,reject)=>{
      try{canvas.toBlob(value=>value?resolve(value):reject(new Error('瀏覽器未能產生 PNG 副本。')),'image/png');}
      catch{reject(new Error('瀏覽器未能匯出 PNG 副本。'));}
    });
    fail(blob.type==='image/png'&&Number.isSafeInteger(blob.size)&&blob.size>0,'瀏覽器未輸出有效的 PNG 副本。');
    fail(blob.size<=LIMITS.maxOutputBytes,'正規化 PNG 副本超過 4 MiB，請先縮小圖片再試。');
    return {blob,width,height,sourceMime:header.mime,sourceBytes,normalization:'browser-png-v1'};
  }finally{
    // Free all local decoder and canvas resources even on decode/draw/export failure.
    try{if(bitmap&&typeof bitmap.close==='function')bitmap.close();}finally{
      try{if(image){image.onload=null;image.onerror=null;if(typeof image.removeAttribute==='function')image.removeAttribute('src');}}finally{
        try{if(objectUrl!==null)URL.revokeObjectURL(objectUrl);}finally{
          if(canvas){canvas.width=0;canvas.height=0;}
        }
      }
    }
  }
}
