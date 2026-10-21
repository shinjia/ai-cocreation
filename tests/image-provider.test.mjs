// Executed Node source contracts and independent algorithm oracles ONLY.
// These tests do not execute PHP, cURL/TLS, the app transaction, or OpenAI.
// Native PHP fixtures are deliberately marked UNEXECUTED in this environment.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
const read=file=>readFile(new URL('../'+file,import.meta.url),'utf8');
const source=await read('app/image-provider.php'),fixture=await read('tests/image-provider.php'),model=await read('app/model.php'),policy=await read('app/image-generation.php');
const section=(start,end)=>source.slice(source.indexOf(start),end?source.indexOf(end,source.indexOf(start)+start.length):undefined);
const generate=section('public function generate(','private function uncertain('),request=section('private function request(','private function decode('),decode=section('private function decode(','private function safeIdentifier(');

test('new image transport uses stable constructor/generate and six-key return contracts',()=>{
  assert.ok(source.includes('class OpenAIImageAdapter'));
  assert.ok(source.includes('public function __construct($keyProvider,$timeout=120000,$testTransport=null)'));
  assert.ok(source.includes('public function generate($model,$prompt,$images=array(),$options=array())'));
  assert.ok(decode.includes("array('bytes'=>$bytes,'actualModel'=>$model,'providerRequestId'=>$requestId,'providerCreatedAt'=>$created,'revisedPrompt'=>$revised,'usage'=>$usage)"));
  assert.ok(source.includes('$timeout>=1000&&$timeout<=180000'));
  assert.ok(generate.includes("imageGenerationModelSupported('openai',$model)"));
  assert.ok(generate.includes('$fixed=imageGenerationOptions()'));
  assert.ok(generate.includes('array_key_exists($name,$fixed)&&$value===$fixed[$name]'));
  assert.ok(generate.includes("userTextValue($prompt,32000,'圖片生成指示')"));
  assert.doesNotMatch(generate,/\/v1\/responses|->actualModel\(/);
});

test('generation and edits use exact official JSON endpoints with real bytes only',()=>{
  assert.ok(generate.includes("$url='https://api.openai.com/v1/images/generations'"));
  assert.ok(generate.includes("$url='https://api.openai.com/v1/images/edits'"));
  assert.ok(generate.includes("$payload['images'][]=array('image_url'=>'data:image/png;base64,'.base64_encode($image['bytes']))"));
  assert.ok(generate.includes("array_merge(array('model'=>$model,'prompt'=>$prompt),$fixed)"));
  assert.ok(generate.indexOf('prepareModelImageInputs($images)')<generate.indexOf('base64_encode('));
  assert.ok(policy.includes("array('n'=>1,'size'=>'1024x1024','quality'=>'low','output_format'=>'png','background'=>'opaque','moderation'=>'auto','stream'=>false)"));
  assert.doesNotMatch(source,/'(?:response_format|input_fidelity|file_id|style)'\s*=>/);
  assert.doesNotMatch(source,/\b(?:file_get_contents|file_put_contents|fopen|readfile|tempnam|tmpfile|move_uploaded_file|error_log|var_dump|print_r|exec|shell_exec|unserialize|eval)\s*\(/);
  for(const invariant of ['count($images)<=5','$total<=12582912','strlen($bytes)<=4194304',"hash_equals($sha,hash('sha256',$bytes))"])assert.ok(model.includes(invariant),invariant);
});

test('output memory and request size are checked before transport and not bypassed',()=>{
  assert.ok(generate.includes('pngUploadEnsureMemory(8*$total+100663296)'));
  assert.ok(generate.indexOf('pngUploadEnsureMemory(')<generate.indexOf('base64_encode('));
  assert.ok(generate.indexOf('strlen($encoded)<=self::MAX_REQUEST_BYTES')<generate.indexOf('$this->request('));
  for(const constant of ['MAX_RESPONSE_BYTES=6291456','MAX_PNG_BYTES=4194304','MAX_BASE64_BYTES=5592408','MAX_REQUEST_BYTES=18000000','MAX_HEADER_BYTES=32768'])assert.ok(source.includes(constant),constant);
  assert.ok(request.includes('strlen($chunk)>self::MAX_RESPONSE_BYTES-strlen($body)'));
  assert.ok(request.includes('$headerBytes>self::MAX_HEADER_BYTES'));
  assert.doesNotMatch(source,/ini_set\s*\(|set_time_limit\s*\(/);
});

test('constructor fixture injection precedes credential/network work and cannot set endpoint',()=>{
  assert.ok(request.indexOf('if($this->transport!==null)')<request.indexOf('call_user_func($this->keyProvider)'));
  assert.ok(request.indexOf('if($this->transport!==null)')<request.indexOf('curl_init('));
  assert.ok(request.includes('call_user_func($this->transport,$url,$payload)'));
  assert.equal((generate.match(/\$this->request\(/g)||[]).length,1);
  assert.equal((request.match(/curl_exec\(/g)||[]).length,1);
  assert.doesNotMatch(request,/\b(?:while|for)\s*\(|sleep\s*\(|Idempotency-Key|X-Client-Request-Id/);
  for(const setting of ['CURLOPT_FOLLOWLOCATION=>false','CURLOPT_MAXREDIRS=>0',"CURLOPT_PROXY=>''",'CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS','CURLOPT_CONNECTTIMEOUT_MS=>10000','CURLOPT_TIMEOUT_MS=>$this->timeout','CURLOPT_SSL_VERIFYPEER=>true','CURLOPT_SSL_VERIFYHOST=>2'])assert.ok(request.includes(setting),setting);
  assert.doesNotMatch(source,/\$_(?:GET|POST|REQUEST|ENV|SERVER)|getenv\s*\(/);
});

test('response is bounded before JSON allocation and accepts exactly one canonical base64 PNG',()=>{
  assert.ok(decode.indexOf('strlen($body)>self::MAX_RESPONSE_BYTES')<decode.indexOf('$this->boundedJson($body)'));
  assert.ok(decode.includes('array_keys($entries)!==array(0)'));
  assert.ok(decode.includes("$encoded=field($entries[0],'b64_json')"));
  assert.ok(decode.includes("strspn($encoded,'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/')"));
  assert.ok(decode.includes('strlen($encoded)%4!==0'));
  assert.ok(decode.includes("substr($encoded,$digits)!==str_repeat('=',$padding)"));
  assert.ok(decode.includes('base64_decode($encoded,true)'));
  assert.ok(decode.includes('base64_encode($bytes)!==$encoded'));
  assert.ok(decode.includes("substr($bytes,16,8)!==pack('NN',1024,1024)"));
  assert.doesNotMatch(decode,/field\([^\n]*,'url'|curl_|https?:\/\//);
  const bounded=section('private function boundedJson(','private function safeUsage(');
  for(const limit of ['$outside>65536','$strings>512','json_decode($body,false,32,JSON_THROW_ON_ERROR)','strcspn($body'])assert.ok(bounded.includes(limit),limit);
  assert.ok(source.includes('normalizeUploadedPng() validation before transactional persistence'));
  assert.doesNotMatch(source,/\bnormalizeUploadedPng\s*\(\s*\$/);
});

test('returned provenance is optional, bounded and never copied from requested model',()=>{
  assert.ok(decode.includes("$model=$this->safeIdentifier(field($data,'model'),160,true)"));
  assert.doesNotMatch(decode,/actualModel[^\n]*(?:requested|payload)|field\([^\n]*,'model',\$model\)/);
  for(const invariant of ['count($headers)<=32',"$requestId=$seen?null:$this->safeIdentifier($value,128)",'$created>4102444800','strlen($revised)>32000',"strpos($revised,'sk-')!==false",'strlen(jsonEncode($candidate))<=8192'])assert.ok(decode.includes(invariant),invariant);
  const usage=section('private function safeUsage(','private function safeErrorHint(');
  for(const invariant of ['$depth>4','$nodes>128','count($properties)>32','strlen($name)>64','is_int($value)&&$value>=0'])assert.ok(usage.includes(invariant),invariant);
  assert.ok(request.includes('$headers[\'x-request-id\']=$requestIdSeen?null:trim(substr($line,13))'));
});

test('possibly charged failures are safe, explicit and never automatically retried',()=>{
  const errors=section('private function uncertain(','private function request(');
  for(const phrase of ['可能已產生費用','沒有自動重試','原有版本不變','再由你決定是否重新生成'])assert.ok(errors.includes(phrase),phrase);
  assert.ok(decode.includes("if($status<400||$status>=500)throw $this->uncertain('OPENAI_IMAGE_HTTP_UNKNOWN'"));
  assert.ok(request.includes("if($ok===false)throw $this->uncertain('OPENAI_IMAGE_CONNECTION'"));
  assert.doesNotMatch(source,/curl_error\s*\(/); // No upstream cURL diagnostic text.
  const hints=section('private function safeErrorHint(');
  for(const code of ['moderation_blocked','image_generation_user_error','insufficient_quota','credit_balance_exhausted','project_spend_limit_exceeded','organization_spend_limit_exceeded','organization_usage_limit_exceeded'])assert.ok(hints.includes(code),code);
  assert.doesNotMatch(hints,/field\([^\n]*,'message'|\$code\s*\.|\.\s*\$code/);
  assert.doesNotMatch(request,/\$error->getMessage\(/);
});

test('native fixtures clearly disclose no PHP execution and cover key adversarial cases',()=>{
  assert.ok(fixture.includes('UNEXECUTED in the authoring environment: PHP is unavailable'));
  for(const phrase of ['missing memory helper fails before transmission','zero-input generation reserves output memory before transport','one fixture call and zero credential calls','generation endpoint and exact fixed JSON payload','edit sends real PNG bytes in JSON images data URLs','reject URL input fields before any request','reject private path input before any request','reject source hash mismatch before any request','exact 32000-byte prompt boundary','without invented model','ambiguous duplicate request IDs omitted','non-image array is bounded before allocation','caller rejects corrupted PNG CRC after provider attempt','quota error is not generic retryable rate limit','network and 5xx remain unknown with zero retries','transport exception never triggers paid retry','all constructor fixture paths avoid credentials'])assert.ok(fixture.includes(phrase),phrase);
  assert.doesNotMatch(fixture,/curl_|new PDO|file_put_contents|file_get_contents|ini_set\s*\(/);
});

// Independent algorithm oracles. These intentionally mirror the security
// boundary without implying that PHP syntax, runtime behavior or TLS was tested.
const PNG_CAP=4194304,B64_CAP=5592408,RESPONSE_CAP=6291456;
function pngEnvelope(extra=0,width=1024,height=1024){
  const head=Buffer.from('89504e470d0a1a0a0000000d494844520000040000000400080200000000000000','hex');
  head.writeUInt32BE(width,16);head.writeUInt32BE(height,20);
  return Buffer.concat([head,Buffer.alloc(Math.max(12,extra)),Buffer.from('0000000049454e44ae426082','hex')]);
}
function canonicalPng(encoded){
  assert.equal(typeof encoded,'string');assert.ok(encoded.length>0&&encoded.length<=B64_CAP&&encoded.length%4===0);
  assert.match(encoded,/^[A-Za-z0-9+/]*={0,2}$/);
  const bytes=Buffer.from(encoded,'base64');assert.ok(bytes.length>=57&&bytes.length<=PNG_CAP);assert.equal(bytes.toString('base64'),encoded);
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(bytes.subarray(8,16).toString('hex'),'0000000d49484452');
  assert.equal(bytes.readUInt32BE(16),1024);assert.equal(bytes.readUInt32BE(20),1024);assert.equal(bytes.subarray(-12).toString('hex'),'0000000049454e44ae426082');return bytes;
}
function boundedJson(body){
  assert.ok(Buffer.byteLength(body)<=RESPONSE_CAP);let outside=0,strings=0;
  for(let i=0;i<body.length;){
    if(body[i]!=='"'){assert.ok(++outside<=65536);i++;continue;}
    assert.ok(++strings<=512);i++;
    for(;;){assert.ok(i<body.length);if(body[i]==='\\'){i+=2;continue;}if(body[i]==='"'){i++;break;}i++;}
  }
  return JSON.parse(body);
}
function oracleResponse(body){const data=boundedJson(body);assert.ok(data&&typeof data==='object'&&!Array.isArray(data));assert.ok(!data.error);assert.ok(Array.isArray(data.data)&&data.data.length===1);return canonicalPng(data.data[0].b64_json);}

test('independent base64 oracle rejects whitespace, URL fallback, noncanonical padding and wrong PNG framing',()=>{
  const png=pngEnvelope();assert.deepEqual(canonicalPng(png.toString('base64')),png);
  const bad=['','AA','AB==','A===','AAAA-A==',png.toString('base64')+'\n','data:image/png;base64,'+png.toString('base64'),Buffer.from('not PNG').toString('base64'),pngEnvelope(0,1,1).toString('base64'),png.subarray(0,-12).toString('base64')];
  for(const value of bad)assert.throws(()=>canonicalPng(value));
  assert.throws(()=>oracleResponse(JSON.stringify({data:[{url:'https://example.invalid/never-fetch'}]})));
  assert.throws(()=>oracleResponse(JSON.stringify({data:[{b64_json:png.toString('base64')},{b64_json:png.toString('base64')}]})));
});

test('independent size oracle fits exact 4 MiB PNG within 6 MiB response and rejects one byte over',()=>{
  const png=pngEnvelope(PNG_CAP-45);assert.equal(png.length,PNG_CAP);
  const body=JSON.stringify({created:1792612800,data:[{b64_json:png.toString('base64')} ]});assert.ok(Buffer.byteLength(body)<RESPONSE_CAP);
  assert.deepEqual(oracleResponse(body),png);
  assert.throws(()=>canonicalPng(pngEnvelope(PNG_CAP-44).toString('base64')));
  assert.throws(()=>oracleResponse(' '.repeat(RESPONSE_CAP+1)));
});

test('independent structural oracle rejects JSON object/array bombs before parse while preserving escaped strings',()=>{
  const encoded=pngEnvelope().toString('base64');
  assert.throws(()=>boundedJson('{"data":[{"b64_json":"'+encoded+'"}],"bomb":['+'{},'.repeat(30000)+'{}]}'));
  assert.throws(()=>boundedJson(JSON.stringify(Object.fromEntries(Array.from({length:513},(_,i)=>['key'+i,1])))));
  const sample={data:[{b64_json:encoded,revised_prompt:'A "tree" \\ and a newline\n繁體中文'}]};assert.deepEqual(boundedJson(JSON.stringify(sample)),sample);
  assert.throws(()=>boundedJson('{"unterminated":"text\\'));
});

test('independent payload oracle sends only chosen bytes and bounded immutable generation options',()=>{
  const images=[pngEnvelope(),pngEnvelope(32)];const options={n:1,size:'1024x1024',quality:'low',output_format:'png',background:'opaque',moderation:'auto',stream:false};
  const payload={model:'gpt-image-2.5-sunburst-2026-09-08',prompt:'依序融合兩張來源',...options,images:images.map(bytes=>({image_url:'data:image/png;base64,'+bytes.toString('base64')}))};
  for(let i=0;i<images.length;i++)assert.deepEqual(Buffer.from(payload.images[i].image_url.split(',')[1],'base64'),images[i]);
  assert.ok(!('image' in payload)&&!('response_format' in payload)&&!('input_fidelity' in payload));
  assert.ok(Buffer.byteLength(JSON.stringify(payload))<18000000);
  // A real synthetic 1024x1024 pixel stream can be compact; output size is
  // nevertheless not guaranteed by a size/quality request or this oracle.
  assert.ok(deflateSync(Buffer.alloc((1024*3+1)*1024)).length<4194304);
});
