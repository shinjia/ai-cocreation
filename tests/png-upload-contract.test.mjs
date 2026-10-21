// Executed source contracts and independent Node golden-PNG oracles ONLY.
// These checks DO NOT run PHP or establish PHP 7.4/runtime/HTTP/upload behavior.
// Native adversarial fixtures: php tests/png-upload.php (currently UNEXECUTED).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {deflateSync, inflateSync, constants as zlibConstants} from 'node:zlib';

const read = file => readFile(new URL('../' + file, import.meta.url), 'utf8');
const source = await read('app/png-upload.php');
const fixtures = await read('tests/png-upload.php');
const body = (start, end) => source.slice(source.indexOf(start), end ? source.indexOf(end, source.indexOf(start) + start.length) : undefined);

test('PNG source contract exposes one isolated normalizer with no IO, GD, model, or external decoder', () => {
  assert.match(source, /function normalizeUploadedPng\(\$bytes\)/);
  assert.doesNotMatch(source, /\b(?:file_get_contents|file_put_contents|fopen|readfile|glob|scandir|curl_init|exec|shell_exec|system|passthru|popen|proc_open|eval|unserialize|imagecreatefromstring|imagepng|getimagesize|move_uploaded_file)\s*\(/);
  assert.doesNotMatch(source, /\$_(?:FILES|POST|GET|SERVER)|base64_decode|new (?:PDO|Responses|Ollama)|https?:\/\//);
  assert.doesNotMatch(source, /\b(?:echo|print|var_dump|print_r)\b/);
  assert.ok(source.includes('Callers provide ensure() and AppError from validation.php'));
});

test('PNG source contract bounds input, dimensions, pixels, IDAT aggregation and every chunk', () => {
  assert.ok(source.includes('$maximumBytes=4194304;$maximumSide=2048;$maximumPixels=4194304;$maximumChunks=1024'));
  assert.ok(source.includes('ensure(is_string($bytes)'));
  assert.ok(source.includes('$total>=1&&$total<=$maximumBytes'));
  assert.ok(source.includes('$chunkCount<=$maximumChunks'));
  assert.ok(source.includes('$total-$offset>=12'));
  assert.ok(source.includes('is_int($length)&&$length>=0&&$length<=$total-$offset-12'));
  assert.ok(source.indexOf('$length<=$total-$offset-12') < source.indexOf('$data=substr('));
  assert.ok(source.includes('$width>=1&&$height>=1&&$width<=$maximumSide&&$height<=$maximumSide'));
  assert.ok(source.includes('$width*$height<=$maximumPixels'));
  assert.ok(source.includes('$length<=$maximumBytes-strlen($idat)'));
});

test('PNG source contract checks signature, ASCII/reserved chunk bits and CRC before interpreting all chunks', () => {
  assert.ok(source.includes('substr($bytes,0,8)==="\\x89PNG\\r\\n\\x1a\\n"'));
  assert.ok(source.includes("preg_match('/^[A-Za-z]{4}$/D',$type)===1"));
  assert.ok(source.includes('ord($type[2])>=65&&ord($type[2])<=90'));
  assert.ok(source.includes("hash_equals(hash('crc32b',$type.$data,true),$crc)"));
  assert.ok(source.indexOf("hash_equals(hash('crc32b'") < source.indexOf("if($type==='IHDR')"));
  assert.ok(source.includes("$chunkCount!==1||$type==='IHDR'"));
  assert.ok(source.includes('$chunkCount===1&&$ihdr===null&&$length===13'));
});

test('PNG source contract restricts IHDR to non-interlaced RGB/RGBA8 and preserves alpha semantics', () => {
  assert.ok(source.includes("unpack('Nwidth/Nheight/Cdepth/Ccolor/Ccompression/Cfilter/Cinterlace',$data)"));
  assert.ok(source.includes("$header['depth']===8&&($header['color']===2||$header['color']===6)&&$header['compression']===0&&$header['filter']===0&&$header['interlace']===0"));
  assert.ok(source.includes("$channels=$header['color']===6?4:3"));
  assert.ok(source.includes("!in_array($type,array('acTL','fcTL','fdAT'),true)"));
  assert.ok(source.includes("ensure($type!=='tRNS'"));
  assert.ok(source.includes("ensure((ord($type[0])&32)!==0"));
  assert.ok(source.includes('PLTE is'));
});

test('PNG source contract requires contiguous IDAT and a final empty IEND without trailing bytes', () => {
  assert.ok(source.includes('$seenIdat=false;$idatEnded=false;$seenIend=false'));
  assert.ok(source.includes("if($type==='IDAT') {\n                ensure(!$idatEnded"));
  assert.ok(source.includes('$seenIdat=true;$idat.=$data'));
  assert.ok(source.includes('if($seenIdat)$idatEnded=true'));
  assert.ok(source.includes('$seenIdat&&$length===0&&$offset===$total'));
  assert.ok(source.includes('$seenIend&&$seenIdat&&$ihdr!==null&&$offset===$total'));
});

test('PNG source contract refuses unavailable zlib or insufficient memory before decoding, without raising limits', () => {
  assert.ok(source.includes("function_exists('zlib_decode')&&function_exists('gzcompress')"));
  assert.ok(source.includes("pngUploadMemoryLimitBytes(ini_get('memory_limit'))"));
  assert.ok(source.includes('memory_get_usage(true)'));
  assert.ok(source.includes('$used<=$limit&&$needed<=$limit-$used'));
  assert.ok(source.includes('pngUploadEnsureMemory(6*$total+8388608)'));
  assert.ok(source.includes('pngUploadEnsureMemory(6*$expectedRowBytes+6*strlen($idat)+16777216)'));
  assert.ok(source.indexOf('pngUploadEnsureMemory(6*$total') < source.indexOf('while($offset<$total)'));
  assert.ok(source.indexOf('pngUploadEnsureMemory(6*$expectedRowBytes') < source.indexOf('@zlib_decode('));
  const memoryParser=body('function pngUploadMemoryLimitBytes(', 'function pngUploadEnsureMemory(');
  assert.ok(memoryParser.includes("if($setting==='-1')return null"));
  assert.ok(memoryParser.includes("/^([0-9]+)([KMG]?)$/iD"));
  assert.ok(memoryParser.includes('$bytes<(float)PHP_INT_MAX'));
  assert.doesNotMatch(source, /ini_set\s*\(|set_time_limit\s*\(/);
});

test('PNG source contract validates zlib wrapper then exactly bounds scanline decode and filters', () => {
  assert.ok(source.includes('strlen($idat)>=6'));
  assert.ok(source.includes('($cmf&15)===8&&($cmf>>4)<=7&&(($cmf<<8)+$flg)%31===0&&($flg&32)===0'));
  assert.ok(source.includes('$rowBytes=$width*$channels+1;$expectedRowBytes=$rowBytes*$height'));
  assert.equal((source.match(/@zlib_decode\(/g)||[]).length, 1);
  assert.ok(source.includes('$scanlines=@zlib_decode($idat,$expectedRowBytes)'));
  assert.ok(source.includes('is_string($scanlines)&&strlen($scanlines)===$expectedRowBytes'));
  assert.ok(source.includes('for($row=0;$row<$height;$row++)'));
  assert.ok(source.includes('ord($scanlines[$row*$rowBytes])<=4'));
  assert.ok(source.indexOf('ord($scanlines[$row*$rowBytes])<=4') < source.indexOf('@gzcompress('));
});

test('PNG source contract rebuilds fresh CRC and a single IDAT, bounds canonical output and binds its hash', () => {
  const chunk=body('function pngUploadChunk(', 'function normalizeUploadedPng(');
  assert.ok(chunk.includes("pack('N',strlen($data)).$type.$data.hash('crc32b',$type.$data,true)"));
  assert.ok(source.includes('$compressed=@gzcompress($scanlines,6)'));
  assert.ok(source.includes('strlen($compressed)<=$maximumBytes-57'));
  assert.ok(source.includes("pngUploadChunk('IHDR',$ihdr).pngUploadChunk('IDAT',$compressed).pngUploadChunk('IEND','')"));
  assert.ok(source.includes('strlen($canonical)<=$maximumBytes'));
  assert.ok(source.includes("return array('bytes'=>$canonical,'mime'=>'image/png','width'=>$width,'height'=>$height,'byteLength'=>strlen($canonical),'sha256'=>hash('sha256',$canonical),'normalization'=>'png-v1')"));
  assert.ok(source.indexOf('strlen($compressed)<=$maximumBytes-57') < source.indexOf('$canonical='));
  assert.ok(source.includes('not a claim that the source zlib stream was canonical'));
});

test('PNG source contract exposes only fixed redacted errors and native fixtures remain explicitly unexecuted', () => {
  assert.match(source, /catch\(AppError \$error\) \{\s*throw \$error;\s*\} catch\(Throwable \$error\)/);
  assert.doesNotMatch(source, /\$error->(?:getMessage|getTraceAsString)|error_log\s*\(/);
  assert.ok(source.includes("throw new AppError('PNG_PROCESSING_FAILED'"));
  assert.ok(fixtures.includes('UNEXECUTED in the authoring environment: PHP is unavailable'));
  assert.ok(fixtures.includes("require_once dirname(__DIR__).'/app/validation.php'"));
  assert.ok(fixtures.includes("require_once dirname(__DIR__).'/app/png-upload.php'"));
  for(const phrase of ['filtered scanline identity preserves pixels','RGBA alpha byte preserved','all five valid PNG filters retained exactly','compressed trailing garbage is not preserved','additional compressed stream is not preserved','reject ancillary CRC','reject noncontiguous IDAT','reject 1025 chunks','reject inflate bomb','reject canonical output over 4 MiB even when source fits','accept exact 4 MiB source','reject insufficient memory'])assert.ok(fixtures.includes(phrase),phrase);
  assert.doesNotMatch(fixtures, /curl_|new PDO|ResponsesClient|ini_set\s*\(/);
});

// Independent binary oracle used only for golden fixtures and their pixel data.
// It is deliberately not a JavaScript substitute for running normalizeUploadedPng.
const crcTable=Uint32Array.from({length:256}, (_, n)=>{for(let bit=0;bit<8;bit++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const crc32=bytes=>{let value=0xffffffff;for(const byte of bytes)value=crcTable[(value^byte)&255]^(value>>>8);return (value^0xffffffff)>>>0;};
const signature=Buffer.from('89504e470d0a1a0a','hex');
function chunk(type, data) {const name=Buffer.from(type,'ascii'),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([length,name,data,crc]);}
function readChunks(bytes) {
  assert.deepEqual(bytes.subarray(0,8),signature);
  const chunks=[];let offset=8;
  while(offset<bytes.length){assert.ok(bytes.length-offset>=12);const length=bytes.readUInt32BE(offset);assert.ok(length<=bytes.length-offset-12);const type=bytes.toString('ascii',offset+4,offset+8),data=bytes.subarray(offset+8,offset+8+length);assert.equal(bytes.readUInt32BE(offset+8+length),crc32(bytes.subarray(offset+4,offset+8+length)));chunks.push({type,data});offset+=12+length;}
  assert.equal(offset,bytes.length);return chunks;
}
const goldenSection=fixtures.split('// GOLDEN_PNG_FIXTURES_BEGIN')[1].split('// GOLDEN_PNG_FIXTURES_END')[0];
const golden=Object.fromEntries([...goldenSection.matchAll(/'([a-z]+)'=>hex2bin\('([0-9a-f]+)'\)/g)].map(([,name,hex])=>[name,Buffer.from(hex,'hex')]));
function oracleNormalize(bytes) {
  const chunks=readChunks(bytes),header=chunks.find(c=>c.type==='IHDR').data,raw=inflateSync(Buffer.concat(chunks.filter(c=>c.type==='IDAT').map(c=>c.data)));
  return Buffer.concat([signature,chunk('IHDR',header),chunk('IDAT',deflateSync(raw,{level:6})),chunk('IEND',Buffer.alloc(0))]);
}
function paeth(a,b,c) {const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
function unfilter(raw,width,height,channels) {
  const stride=width*channels,pixels=Buffer.alloc(stride*height);
  assert.equal(raw.length,(stride+1)*height);
  for(let row=0;row<height;row++){
    const filter=raw[row*(stride+1)];assert.ok(filter<=4);
    for(let x=0;x<stride;x++){const index=row*stride+x,left=x>=channels?pixels[index-channels]:0,above=row?pixels[index-stride]:0,upperLeft=row&&x>=channels?pixels[index-stride-channels]:0;const prediction=[0,left,above,Math.floor((left+above)/2),paeth(left,above,upperLeft)][filter];pixels[index]=(raw[row*(stride+1)+1+x]+prediction)&255;}
  }
  return pixels;
}

test('Node golden oracle validates actual PNG framing/CRC, RGB samples and semitransparent RGBA', () => {
  assert.deepEqual(Object.keys(golden),['rgb','rgba','filters']);
  assert.equal(crc32(Buffer.from('IEND')),0xae426082);
  for(const [name,bytes] of Object.entries(golden)){
    const chunks=readChunks(bytes);assert.deepEqual(chunks.map(c=>c.type),['IHDR','IDAT','IEND']);
    const header=chunks[0].data,width=header.readUInt32BE(),height=header.readUInt32BE(4),channels=header[9]===6?4:3;
    assert.equal(header.length,13);assert.equal(header[8],8);assert.deepEqual([...header.subarray(10)],[0,0,0]);
    const pixels=unfilter(inflateSync(chunks[1].data),width,height,channels);
    if(name==='rgb')assert.equal(pixels.toString('hex'),'ff0000');
    if(name==='rgba')assert.equal(pixels.toString('hex'),'ff000080');
    assert.deepEqual(oracleNormalize(bytes),bytes);
  }
});

test('Node golden oracle reconstructs all five PNG filters to the independently specified RGBA raster', () => {
  const chunks=readChunks(golden.filters),raw=inflateSync(chunks[1].data);
  assert.equal(raw.toString('hex'),'0013385d82a7ccf116013b6085aa94949494022828282828282828035a6c7f915ededede042828282828282894');
  assert.deepEqual(Array.from({length:5},(_,row)=>raw[row*9]),[0,1,2,3,4]);
  assert.equal(unfilter(raw,2,5,4).toString('hex'),'13385d82a7ccf1163b6085aacff4193e6388add2f71c41668bb0d5fa1f44698eb3d8fd22476c91b6');
});

test('Node golden oracle proves fresh recompression strips ancillary and compressed-tail payloads without changing scanlines', () => {
  const [header,data]=readChunks(golden.rgba),secret=Buffer.from('fixture-secret-marker');
  const padded=Buffer.concat([signature,chunk('IHDR',header.data),chunk('eXIf',secret),chunk('iCCP',Buffer.concat([Buffer.from('profile\0\0'),deflateSync(secret)])),chunk('IDAT',data.data.subarray(0,3)),chunk('IDAT',Buffer.concat([data.data.subarray(3),secret,deflateSync(secret)])),chunk('tEXt',secret),chunk('IEND',Buffer.alloc(0))]);
  assert.ok(padded.includes(secret));
  const clean=oracleNormalize(padded);assert.deepEqual(clean,golden.rgba);assert.equal(clean.includes(secret),false);
  assert.equal(createHash('sha256').update(clean).digest('hex').length,64);
});

test('Node zlib oracle proves the inflated-row bound and malformed-checksum golden cases are meaningful', () => {
  const [,data]=readChunks(golden.rgb);
  assert.equal(inflateSync(data.data,{maxOutputLength:4}).length,4);
  assert.throws(()=>inflateSync(deflateSync(Buffer.alloc(1048576)),{maxOutputLength:4}));
  const corrupt=Buffer.from(data.data);corrupt[corrupt.length-1]^=1;assert.throws(()=>inflateSync(corrupt));
  const corruptPng=Buffer.from(golden.rgb);corruptPng[29]^=1;assert.throws(()=>readChunks(corruptPng));
});

test('Node zlib oracle proves a valid <=4 MiB source can exceed the canonical output cap', () => {
  const width=2048,height=1000,rowBytes=8193,raw=Buffer.alloc(rowBytes*height);
  for(let offset=0,counter=0;offset<raw.length;offset+=32,counter++){const block=createHash('sha256').update(String(counter)).digest();block.copy(raw,offset,0,Math.min(block.length,raw.length-offset));}
  for(let index=0;index<raw.length;index++)raw[index]&=15;
  for(let row=0;row<height;row++)raw[row*rowBytes]=0;
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  const optimized=deflateSync(raw,{level:9,strategy:zlibConstants.Z_HUFFMAN_ONLY});
  const input=Buffer.concat([signature,chunk('IHDR',header),chunk('IDAT',optimized),chunk('IEND',Buffer.alloc(0))]);
  assert.ok(input.length<=4194304,`source ${input.length}`);
  assert.ok(deflateSync(raw,{level:6}).length+57>4194304,'canonical must be rejected after recompression');
  assert.deepEqual(inflateSync(optimized),raw);
});
