// Pure byte fixtures and injected decoder/canvas tests only. No real browser,
// image decoder, network, actual user image, server, or AI API is exercised.
import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {parseImageHeader,normalizeImageFile,IMAGE_UPLOAD_LIMITS,IMAGE_UPLOAD_HELP_TEXT} from '../public/image-upload.js';

const limits=IMAGE_UPLOAD_LIMITS;
const concat=(...parts)=>new Uint8Array(Buffer.concat(parts.map(part=>Buffer.from(part))));
const uint32=value=>Uint8Array.of((value>>>24)&255,(value>>>16)&255,(value>>>8)&255,value&255);
function crc32(bytes){
  let crc=0xffffffff;
  for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc&1)?0xedb88320^(crc>>>1):crc>>>1;}
  return (crc^0xffffffff)>>>0;
}
function chunk(type,data=new Uint8Array()){
  const content=concat(Buffer.from(type,'ascii'),data);return concat(uint32(data.length),content,uint32(crc32(content)));
}
const signature=Uint8Array.of(137,80,78,71,13,10,26,10);
function ihdr(width=3,height=2,{depth=8,color=6,compression=0,filter=0,interlace=0}={}){
  return chunk('IHDR',concat(uint32(width),uint32(height),[depth,color,compression,filter,interlace]));
}
// Valid compressed 3 x 2 RGBA scanlines, including fully transparent pixels.
const pixels=deflateSync(Uint8Array.of(0,255,0,0,255,0,255,0,0,0,0,255,128,0,0,0,0,0,255,255,255,255,20,40,60,128));
const png=(width=3,height=2,options={})=>concat(signature,ihdr(width,height,options),chunk('IDAT',pixels),chunk('IEND'));
// Actual baseline/progressive 3 x 2 RGB JPEG files, generated from a synthetic
// solid-color test image. These bytes contain no user image or identifying data.
const baseline=new Uint8Array(Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAMDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDAooormP2Q/9k=','base64'));
const progressive=new Uint8Array(Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wgARCAACAAMDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAVAQEBAAAAAAAAAAAAAAAAAAADBv/aAAwDAQACEAMQAAABngrL/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD7/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=','base64'));
const withJpeg=(original,change)=>{const bytes=original.slice();change(bytes);return bytes;};
const markerIndex=(bytes,marker)=>bytes.findIndex((byte,index)=>byte===255&&bytes[index+1]===marker);
function jpegDimensions(width,height,original=baseline){
  return withJpeg(original,bytes=>{const start=markerIndex(bytes,original===progressive?0xc2:0xc0)+5;bytes[start]=height>>8;bytes[start+1]=height&255;bytes[start+2]=width>>8;bytes[start+3]=width&255;});
}
function file(bytes=png()){
  const value=new Blob([bytes],{type:'application/not-the-real-type'});
  Object.defineProperty(value,'name',{get(){throw new Error('Original filename must never be read');}});
  return value;
}
function harness({width=3,height=2,output,decodeError,drawError,blobError,noContext=false,toBlobNull=false}={}){
  const calls=[],bitmap={width,height,close(){calls.push(['close']);}};
  const context={
    translate(...args){calls.push(['translate',...args]);},rotate(...args){calls.push(['rotate',...args]);},
    drawImage(...args){calls.push(['drawImage',...args]);if(drawError)throw drawError;}
  };
  const canvas={width:0,height:0,
    getContext(...args){calls.push(['getContext',...args]);return noContext?null:context;},
    toBlob(callback,...args){calls.push(['toBlob',...args,this.width,this.height]);if(blobError)throw blobError;callback(toBlobNull?null:output||new Blob([png()],{type:'image/png'}));}
  };
  const document={createElement(tag){calls.push(['createElement',tag]);assert.equal(tag,'canvas');return canvas;}};
  const createImageBitmap=async (...args)=>{calls.push(['decode',...args]);if(decodeError)throw decodeError;return bitmap;};
  return {calls,bitmap,context,canvas,options:{document,createImageBitmap}};
}

test('exports exact immutable limits and help text explains scope, metadata, local processing and server authority',()=>{
  assert.deepEqual(limits,{maxSourceBytes:12582912,maxSourceDimension:8192,maxSourcePixels:16777216,maxOutputDimension:2048,maxOutputBytes:4194304});
  assert.equal(Object.isFrozen(limits),true);
  for(const text of ['JPEG','PNG','SVG','GIF','WebP','APNG','12 MiB','8192','16,777,216','2048','4 MiB','原檔不會被修改','原檔名','EXIF','伺服器','不會自動上傳','不呼叫 AI','不是 AI 生圖'])assert.ok(IMAGE_UPLOAD_HELP_TEXT.includes(text),text);
});
test('real static PNG, baseline and progressive JPEG byte fixtures return only MIME and dimensions',()=>{
  assert.deepEqual(parseImageHeader(png()),{mime:'image/png',width:3,height:2});
  for(const bytes of [baseline,progressive])assert.deepEqual(parseImageHeader(bytes),{mime:'image/jpeg',width:3,height:2});
  const padded=concat([0,0],png(),[0]);assert.deepEqual(parseImageHeader(padded.subarray(2,-1)),parseImageHeader(png()));
});
test('signature checks reject unsupported formats, MIME spoofing and empty/oversized/non-byte inputs',()=>{
  for(const value of [null,undefined,{},[],new ArrayBuffer(8)])assert.throws(()=>parseImageHeader(value),/Uint8Array/);
  for(const value of [new Uint8Array(),new Uint8Array(limits.maxSourceBytes+1)])assert.throws(()=>parseImageHeader(value),/12 MiB/);
  for(const text of ['<svg xmlns="http://www.w3.org/2000/svg"/>','GIF89a','RIFF0000WEBP','not an image'])assert.throws(()=>parseImageHeader(new TextEncoder().encode(text)),/有效檔案標記/);
  const broken=png();broken[7]=0;assert.throws(()=>parseImageHeader(broken),/有效檔案標記/);
});
test('PNG dimensions reject zero, over-edge, unsigned huge and over-pixel bounds; exact bounds pass preflight',()=>{
  for(const [width,height] of [[0,2],[3,0],[8193,1],[1,8193],[0xffffffff,1],[8192,2049],[4097,4096]])assert.throws(()=>parseImageHeader(png(width,height)),/寬高|總像素/);
  for(const [width,height] of [[8192,2048],[4096,4096],[1,8192]])assert.deepEqual(parseImageHeader(png(width,height)),{mime:'image/png',width,height});
});
test('PNG verifies all chunk lengths, CRCs, IHDR fields, critical chunks, end and ordering',()=>{
  const normal=png();
  for(let length=8;length<normal.length;length++)assert.throws(()=>parseImageHeader(normal.subarray(0,length)),/PNG/);
  const wrongCrc=normal.slice();wrongCrc[29]^=1;assert.throws(()=>parseImageHeader(wrongCrc),/校驗碼/);
  const hugeChunk=normal.slice();hugeChunk.set(uint32(0xffffffff),8);assert.throws(()=>parseImageHeader(hugeChunk),/長度/);
  assert.throws(()=>parseImageHeader(concat(signature,chunk('IDAT',pixels),chunk('IEND'))),/IHDR/);
  assert.throws(()=>parseImageHeader(concat(signature,ihdr(),ihdr(),chunk('IDAT',pixels),chunk('IEND'))),/IHDR/);
  assert.throws(()=>parseImageHeader(concat(signature,chunk('IHDR',new Uint8Array(12)),chunk('IEND'))),/IHDR/);
  for(const options of [{color:1},{depth:3},{color:2,depth:4},{compression:1},{filter:1},{interlace:2}])assert.throws(()=>parseImageHeader(png(3,2,options)),/IHDR/);
  for(const type of ['ZZZZ','abca','a1Cd'])assert.throws(()=>parseImageHeader(concat(signature,ihdr(),chunk(type),chunk('IDAT',pixels),chunk('IEND'))),/必要區塊|類型/);
  assert.throws(()=>parseImageHeader(concat(signature,ihdr(),chunk('IEND'))),/像素/);
  assert.throws(()=>parseImageHeader(concat(signature,ihdr(),chunk('IDAT'),chunk('IEND'))),/像素/);
  assert.throws(()=>parseImageHeader(concat(signature,ihdr(),chunk('IDAT',pixels),chunk('IEND',[1]))),/結尾/);
  assert.throws(()=>parseImageHeader(concat(normal,[1])),/附加資料/);
  assert.throws(()=>parseImageHeader(concat(signature,ihdr(),chunk('IDAT',pixels),chunk('tEXt',[65]),chunk('IDAT',[0]),chunk('IEND'))),/順序/);
});
test('PNG scans APNG controls before/after IDAT and refuses data appended after IEND',()=>{
  for(const type of ['acTL','fcTL','fdAT']){
    for(const afterData of [false,true]){
      const middle=afterData?[chunk('IDAT',pixels),chunk(type)]:[chunk(type),chunk('IDAT',pixels)];
      assert.throws(()=>parseImageHeader(concat(signature,ihdr(),...middle,chunk('IEND'))),/APNG/);
    }
    assert.throws(()=>parseImageHeader(concat(png(),chunk(type))),/附加資料/);
  }
});
test('source PNG palette/grayscale/high-bit/interlaced headers are legal but malformed palettes fail',()=>{
  for(const options of [{depth:16},{color:0,depth:1},{color:4,depth:16},{interlace:1}])assert.equal(parseImageHeader(png(3,2,options)).mime,'image/png');
  const indexed=(parts=[])=>concat(signature,ihdr(3,2,{color:3,depth:1}),...parts,chunk('IDAT',pixels),chunk('IEND'));
  assert.equal(parseImageHeader(indexed([chunk('PLTE',[255,0,0,0,255,0])])).width,3);
  for(const parts of [[],[chunk('PLTE')],[chunk('PLTE',[1,2])],[chunk('PLTE',new Uint8Array(9))],[chunk('PLTE',[1,2,3]),chunk('PLTE',[1,2,3])]])assert.throws(()=>parseImageHeader(indexed(parts)),/調色盤/);
});
test('PNG ancillary text and EXIF are accepted only as input; parser never returns their content',()=>{
  const withMetadata=concat(signature,ihdr(),chunk('tEXt',Buffer.from('secret\0location')),chunk('eXIf',[1,2,3]),chunk('IDAT',pixels),chunk('IEND'));
  assert.deepEqual(parseImageHeader(withMetadata),{mime:'image/png',width:3,height:2});
});
test('JPEG rejects truncated segment lengths and truncated scan data instead of trusting SOF alone',()=>{
  for(let length=2;length<baseline.length;length++)assert.throws(()=>parseImageHeader(baseline.subarray(0,length)),/JPEG/);
  for(const segmentLength of [0,1,0xffff])assert.throws(()=>parseImageHeader(withJpeg(baseline,bytes=>{bytes[4]=segmentLength>>8;bytes[5]=segmentLength&255;})),/區段長度/);
  assert.throws(()=>parseImageHeader(concat(baseline,[0])),/附加資料/);
  assert.throws(()=>parseImageHeader(Uint8Array.of(255,216,255,217)),/尺寸|掃描/);
});
test('JPEG supports bounded 8-bit baseline/progressive frames only, with validated sampling and scan headers',()=>{
  const sof=markerIndex(baseline,0xc0),sos=markerIndex(baseline,0xda);
  for(const marker of [0xc1,0xc3,0xc5,0xc9,0xca])assert.throws(()=>parseImageHeader(withJpeg(baseline,bytes=>bytes[sof+1]=marker)),/8 位元/);
  for(const [position,value] of [[sof+4,12],[sof+9,0],[sof+9,2],[sof+11,0],[sof+11,0x51],[sof+12,4],[sof+13,1],[sos+4,0],[sos+5,99],[sos+6,0x40],[sos+12,1]])assert.throws(()=>parseImageHeader(withJpeg(baseline,bytes=>bytes[position]=value)),/JPEG/);
  const duplicate=concat(baseline.subarray(0,sof),baseline.subarray(sof,sof+19),baseline.subarray(sof));assert.throws(()=>parseImageHeader(duplicate),/重複/);
  assert.throws(()=>parseImageHeader(concat([255,216,255,0xd0],baseline.subarray(2))),/位置/);
  assert.throws(()=>parseImageHeader(concat([255,216,255,0xcc,0,2],baseline.subarray(2))),/未支援/);
});
test('JPEG zero, oversized dimensions and excessive pixel count fail before any decoding',()=>{
  for(const source of [baseline,progressive]){
    for(const [width,height] of [[0,2],[2,0],[8193,1],[1,8193],[65535,65535],[8192,2049]])assert.throws(()=>parseImageHeader(jpegDimensions(width,height,source)),/寬高|總像素/);
    assert.deepEqual(parseImageHeader(jpegDimensions(8192,2048,source)),{mime:'image/jpeg',width:8192,height:2048});
  }
});
test('JPEG entropy stuffing, restart markers and fill bytes do not become false SOF markers',()=>{
  const sos=markerIndex(baseline,0xda),start=sos+2+(baseline[sos+2]*256+baseline[sos+3]);
  const altered=concat(baseline.subarray(0,start),[255,0,0xc0,255,0xd0,255,255,0xd1],baseline.subarray(start));
  assert.deepEqual(parseImageHeader(altered),{mime:'image/jpeg',width:3,height:2});
});
test('all invalid inputs are refused before decoder, canvas or object URL is touched',async ()=>{
  const invalid=[png(0,2),png(8193,1),png(4097,4096),baseline.subarray(0,-1),jpegDimensions(8193,1),new TextEncoder().encode('<svg/>'),concat(signature,ihdr(),chunk('IDAT',pixels),chunk('acTL'),chunk('IEND'))];
  for(const bytes of invalid){const h=harness();await assert.rejects(normalizeImageFile(file(bytes),h.options));assert.deepEqual(h.calls,[]);}
  for(const rotation of [-90,360,'90',NaN,undefined]){
    if(rotation===undefined)continue;
    const h=harness();await assert.rejects(normalizeImageFile(file(),{...h.options,rotation}),/旋轉角度/);assert.deepEqual(h.calls,[]);
  }
});
test('preflight file size and read failures do not read or decode unbounded content',async ()=>{
  const h=harness();let reads=0;
  for(const size of [0,-1,1.5,NaN,Infinity,limits.maxSourceBytes+1])await assert.rejects(normalizeImageFile({size,arrayBuffer(){reads++;}},h.options),/12 MiB/);
  assert.equal(reads,0);assert.deepEqual(h.calls,[]);
  await assert.rejects(normalizeImageFile({size:1,async arrayBuffer(){throw new Error('disk');}},h.options),/無法讀取/);
  for(const buffer of [new ArrayBuffer(2),Uint8Array.of(1)])await assert.rejects(normalizeImageFile({size:1,async arrayBuffer(){return buffer;}},h.options),/長度/);
  assert.deepEqual(h.calls,[]);
});
test('normalization trusts byte MIME, never original name, and returns only the normalized copy contract',async ()=>{
  const original=file(),before=new Uint8Array(await original.arrayBuffer()),h=harness();
  const result=await normalizeImageFile(original,h.options);
  assert.deepEqual(Object.keys(result),['blob','width','height','sourceMime','sourceBytes','normalization']);
  assert.equal(result.blob.type,'image/png');assert.notEqual(result.blob,original);
  assert.deepEqual({...result,blob:null},{blob:null,width:3,height:2,sourceMime:'image/png',sourceBytes:before.length,normalization:'browser-png-v1'});
  assert.deepEqual(new Uint8Array(await original.arrayBuffer()),before);
  const decode=h.calls.find(([type])=>type==='decode');assert.equal(decode[1].type,'image/png');assert.notEqual(decode[1],original);assert.deepEqual(decode[2],{imageOrientation:'from-image'});
  assert.deepEqual(new Uint8Array(await decode[1].arrayBuffer()),before);
  assert.deepEqual(h.calls.find(([type])=>type==='getContext'),['getContext','2d',{alpha:true}]);
  assert.deepEqual(h.calls.find(([type])=>type==='drawImage'),['drawImage',h.bitmap,-1.5,-1,3,2]);
  assert.deepEqual(h.calls.find(([type])=>type==='toBlob'),['toBlob','image/png',3,2]);
  assert.equal(h.context.imageSmoothingEnabled,true);assert.equal(h.context.imageSmoothingQuality,'high');
  assert.equal(h.calls.filter(([type])=>type==='close').length,1);assert.equal(h.canvas.width,0);assert.equal(h.canvas.height,0);
});
test('normalization downsizes longest side with rounded aspect ratio, does not upscale, and preserves a minimum pixel',async ()=>{
  for(const [sourceWidth,sourceHeight,width,height] of [[8192,2048,2048,512],[3000,2000,2048,1365],[2048,1,2048,1],[8192,1,2048,1],[3,2,3,2]]){
    const h=harness({width:sourceWidth,height:sourceHeight}),result=await normalizeImageFile(file(png(sourceWidth,sourceHeight)),h.options);
    assert.equal(result.width,width);assert.equal(result.height,height);
    assert.deepEqual(h.calls.find(([type])=>type==='drawImage').slice(2),[-width/2,-height/2,width,height]);
  }
});
test('explicit clockwise rotations swap output dimensions but preserve draw aspect and alpha canvas',async ()=>{
  for(const rotation of [0,90,180,270]){
    const h=harness(),result=await normalizeImageFile(file(),{...h.options,rotation}),swapped=rotation===90||rotation===270;
    assert.equal(result.width,swapped?2:3);assert.equal(result.height,swapped?3:2);
    assert.deepEqual(h.calls.find(([type])=>type==='translate'),['translate',result.width/2,result.height/2]);
    assert.deepEqual(h.calls.find(([type])=>type==='rotate'),['rotate',rotation*Math.PI/180]);
    assert.deepEqual(h.calls.find(([type])=>type==='drawImage').slice(2),[-1.5,-1,3,2]);
  }
});
test('EXIF-oriented JPEG dimensions may be swapped before an additional explicit rotation',async ()=>{
  const h=harness({width:2,height:3}),result=await normalizeImageFile(file(baseline),{...h.options,rotation:90});
  assert.deepEqual([result.width,result.height,result.sourceMime],[3,2,'image/jpeg']);
  assert.deepEqual(h.calls.find(([type])=>type==='drawImage').slice(2),[-1,-1.5,2,3]);
});
test('decoder dimension mismatch, zero/noninteger dimensions and decoded size limits still close the bitmap',async ()=>{
  for(const [width,height] of [[2,3],[30,20],[0,2],[3.5,2],[8193,1],[4097,4096]]){
    const h=harness({width,height});await assert.rejects(normalizeImageFile(file(),h.options),/尺寸|寬高|總像素/);
    assert.equal(h.calls.filter(([type])=>type==='close').length,1);assert.equal(h.calls.some(([type])=>type==='createElement'),false);
  }
});
test('bitmap decode failures surface and never silently retry via Image/object URL',async ()=>{
  const h=harness({decodeError:new Error('real decoder failed')}),Image=()=>assert.fail('No decoder fallback on failure'),URL={createObjectURL(){assert.fail('No object URL fallback on failure');}};
  await assert.rejects(normalizeImageFile(file(),{...h.options,Image,URL}),/無法解碼/);
  assert.deepEqual(h.calls.map(([type])=>type),['decode']);
});
test('output size boundary is accepted but oversized/empty/non-PNG output is rejected with bitmap/canvas cleanup',async ()=>{
  const accepted=harness({output:new Blob([new Uint8Array(limits.maxOutputBytes)],{type:'image/png'})});
  assert.equal((await normalizeImageFile(file(),accepted.options)).blob.size,limits.maxOutputBytes);
  for(const output of [new Blob([new Uint8Array(limits.maxOutputBytes+1)],{type:'image/png'}),new Blob([],{type:'image/png'}),new Blob(['x'],{type:'image/jpeg'})]){
    const h=harness({output});await assert.rejects(normalizeImageFile(file(),h.options),/4 MiB|有效的 PNG/);
    assert.equal(h.calls.filter(([type])=>type==='close').length,1);assert.equal(h.canvas.width,0);assert.equal(h.canvas.height,0);
  }
});
test('canvas/context/draw/export failures release bitmap and canvas without hidden format fallback',async ()=>{
  for(const options of [{noContext:true},{drawError:new Error('draw failed')},{blobError:new Error('export failed')},{toBlobNull:true}]){
    const h=harness(options);await assert.rejects(normalizeImageFile(file(),h.options),/畫布|draw failed|PNG 副本/);
    assert.equal(h.calls.filter(([type])=>type==='close').length,1);assert.equal(h.canvas.width,0);assert.equal(h.canvas.height,0);
  }
  const h=harness();h.options.document.createElement=()=>{throw new Error('canvas failed');};await assert.rejects(normalizeImageFile(file(),h.options),/canvas failed/);assert.equal(h.calls.at(-1)[0],'close');
});
function fallbackHarness({loadError=false,sourceError=false,width=3,height=2,objectUrl='blob:local-fixture',...canvasOptions}={}){
  const h=harness(canvasOptions),images=[],urls=[];
  class Image{
    constructor(){images.push(this);this.naturalWidth=width;this.naturalHeight=height;}
    set src(value){urls.push(['src',value]);if(sourceError)throw new Error('src failed');queueMicrotask(()=>loadError?this.onerror():this.onload());}
    removeAttribute(name){urls.push(['remove',name]);}
  }
  const URL={createObjectURL(source){urls.push(['create',source]);return objectUrl;},revokeObjectURL(value){urls.push(['revoke',value]);}};
  return {...h,images,urls,options:{...h.options,createImageBitmap:undefined,Image,URL}};
}
test('Image fallback only uses a fresh local blob URL and revokes it with cleared handlers after success',async ()=>{
  const h=fallbackHarness(),result=await normalizeImageFile(file(),h.options);
  assert.equal(result.width,3);assert.equal(h.calls.some(([type])=>type==='decode'),false);
  assert.deepEqual(h.urls.map(([type])=>type),['create','src','remove','revoke']);
  assert.equal(h.urls[0][1].type,'image/png');assert.equal(h.urls[1][1],'blob:local-fixture');assert.equal(h.urls.at(-1)[1],'blob:local-fixture');
  assert.equal(h.images[0].onload,null);assert.equal(h.images[0].onerror,null);assert.equal(h.images[0].decoding,'async');
  assert.equal(h.calls.find(([type])=>type==='drawImage')[1],h.images[0]);assert.equal(h.canvas.width,0);
});
test('Image fallback revokes URL on load/draw/export/size/source-set errors and rejects nonlocal URL before assigning src',async ()=>{
  for(const options of [{loadError:true},{sourceError:true},{drawError:new Error('draw failed')},{toBlobNull:true},{width:8193},{objectUrl:'https://example.invalid/image.png'}]){
    const h=fallbackHarness(options);await assert.rejects(normalizeImageFile(file(),h.options));
    assert.equal(h.urls.filter(([type])=>type==='revoke').length,1);assert.equal(h.images[0].onload,null);assert.equal(h.images[0].onerror,null);
    if(options.objectUrl)assert.equal(h.urls.some(([type])=>type==='src'),false);
    assert.equal(h.canvas.width,0);assert.equal(h.canvas.height,0);
  }
});
test('missing local APIs fail clearly after safe header validation',async ()=>{
  const h=harness();await assert.rejects(normalizeImageFile(file(),{...h.options,document:null}),/正規化功能/);
  await assert.rejects(normalizeImageFile(file(),{...h.options,Blob:null}),/正規化功能/);
  await assert.rejects(normalizeImageFile(file(),{...h.options,createImageBitmap:null,Image:null}),/解碼器/);
});
test('module contains no network, upload, storage, filename access, or AI client calls',async ()=>{
  const source=await readFile(new URL('../public/image-upload.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB)\s*[.(]/);
  assert.doesNotMatch(source,/\bfile\s*\.\s*(?:name|type)\b|\/api\b|api\.openai\.com/);
});
