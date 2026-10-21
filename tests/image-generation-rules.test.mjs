// Executed Node source contracts and independent policy examples ONLY.
// These tests do not execute or transpile PHP and are not PHP runtime proof.
// Native fixtures: php tests/image-generation.php (UNEXECUTED here).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const source=read('app/image-generation.php');
const fixture=read('tests/image-generation.php');
const expectedModels=[
  'gpt-image-2',
  'gpt-image-2-2026-04-21','gpt-image-2.5-sunburst',
  'gpt-image-2.5-sunburst-2026-09-08','gpt-image-2.5-flare',
  'gpt-image-2.5-flare-2026-09-08'
];
const section=name=>{
  const start=source.indexOf('function '+name+'(');
  assert.notEqual(start,-1,'missing helper '+name);
  const end=source.indexOf('\nfunction ',start+1);
  return source.slice(start,end===-1?undefined:end);
};
const includes=(text,...needles)=>{
  for(const needle of needles)assert.ok(text.includes(needle),'missing source contract '+needle);
};
const ordered=(text,...needles)=>{
  let last=-1;
  for(const needle of needles){const next=text.indexOf(needle,last+1);assert.ok(next>last,'missing/out-of-order '+needle);last=next;}
};

test('supported IDs are an explicit exact policy, never fetched account inventory or a default',()=>{
  const models=section('imageGenerationModels');
  assert.deepEqual([...models.matchAll(/'(gpt-image-[^']+)'/g)].map(match=>match[1]),expectedModels);
  assert.equal(new Set(expectedModels).size,expectedModels.length);
  assert.doesNotMatch(models,/gpt-image-1|chatgpt-image-latest|dall-e|default|selected|listModels|curl_|https:/);
  includes(source,'NOT the models','explicitly fetches metadata or enters an ID','nothing here selects a default');
  const support=section('imageGenerationModelSupported');
  includes(support,"$provider==='openai'",'is_string($model)','in_array($model,imageGenerationModels(),true)');
  assert.doesNotMatch(support,/strtolower|trim\(|preg_match|strpos|str_replace/);
});

test('image binding wraps and preserves the existing exact six-field binding',()=>{
  const binding=section('validateProjectImageBinding');
  ordered(binding,'$binding=validateProjectAiBinding($value)',"imageGenerationModelSupported($binding['provider'],$binding['model'])",'return $binding');
  includes(binding,"'IMAGE_MODEL_UNSUPPORTED'",',409)');
  assert.doesNotMatch(binding,/array_merge|\$binding\[[^\]]+\]\s*=|imageGenerationModels\(\)\[|newId|time\(/);
  const validation=read('app/validation.php');
  includes(validation,'function validateProjectAiBinding($value)',"count($value)===6","array('memberId','memberNickname','provider','model','ollamaUrl','boundAt')");
});

test('model disclosures distinguish mutable aliases without rewriting or promising account availability',()=>{
  const disclosure=section('imageGenerationModelDisclosure');
  includes(disclosure,"imageGenerationModelSupported('openai',$model)",'$mutable=preg_match(',"'model'=>$model","'mutable_alias':'dated_id'","'mutableAlias'=>$mutable",'固定此 ID 不代表固定底層版本','不是帳號可用模型清單','帳號權限與服務回應');
  assert.doesNotMatch(disclosure,/\$model\s*=|str_replace|array_shift|imageGenerationModels\(\)\[/);
  const dated=expectedModels.filter(model=>/-\d{4}-\d{2}-\d{2}$/.test(model));
  assert.deepEqual(dated,['gpt-image-2-2026-04-21','gpt-image-2.5-sunburst-2026-09-08','gpt-image-2.5-flare-2026-09-08']);
  assert.equal(expectedModels.filter(model=>!dated.includes(model)).length,3);
});

test('fixed options are one low-quality opaque 1024 PNG, with no input argument or quality choice',()=>{
  const options=section('imageGenerationOptions');
  includes(options,'function imageGenerationOptions()',"return array('n'=>1,'size'=>'1024x1024','quality'=>'low','output_format'=>'png','background'=>'opaque','moderation'=>'auto','stream'=>false);");
  assert.doesNotMatch(options,/\$input|\$_|array_merge|\b(?:auto|high|medium)'\s*=>/);
});

test('request validates explicit modes, dense source lists, exact IDs and duplicate rejection',()=>{
  const request=section('validateImageGenerationRequest');
  includes(request,'ensure(is_array($input)',"in_array($mode,array('generate','revise','fuse'),true)","array_key_exists('sourceVersionIds',$input)","array_keys($ids)===range(0,count($ids)-1)");
  includes(request,"($mode==='generate'&&$count===0)","($mode==='revise'&&$count===1)","($mode==='fuse'&&$count>=2&&$count<=5)");
  ordered(request,'foreach($ids as $id)validId($id)','count(array_unique($ids,SORT_STRING))===$count');
  assert.doesNotMatch(request,/array_values\(\$ids\)|array_unique\(\$ids[^;]*return|strtolower\(\$id/);
});

test('raw JSON guard preserves array/object distinctions only for generate_image',()=>{
  const guard=section('validateImageGenerationJsonShape');
  ordered(guard,"if(field($rawInput,'action')!=='generate_image')return $rawInput",'ensure(plain($rawInput)',"foreach(array('sourceVersionIds','references') as $key)",'property_exists($rawInput,$key)','ensure(is_array($rawInput->$key)');
  ordered(guard,"if(property_exists($rawInput,'references'))foreach($rawInput->references as $reference)",'ensure(plain($reference)','$fields=get_object_vars($reference)','count($fields)===2',"array_key_exists('referenceId',$fields)","array_key_exists('role',$fields)",'return $rawInput');
  const code=guard.replace(/\/\/[^\n]*/g,'');
  assert.doesNotMatch(code,/isset\(|\(array\)|array_values\(|json_decode\(|json_encode\(/);
  assert.doesNotMatch(guard,/\$rawInput\s*=|\$rawInput->\w+\s*=|\$reference->\w+\s*=/);
  includes(guard,'Values, dense indexes, counts, IDs and roles are checked later');
});

test('independent JSON-shape examples reject empty objects where real arrays are required',()=>{
  const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
  const valid=value=>{
    if(value?.action!=='generate_image')return true;
    if(!plain(value))return false;
    for(const key of ['sourceVersionIds','references'])if(Object.hasOwn(value,key)&&!Array.isArray(value[key]))return false;
    return !Object.hasOwn(value,'references')||value.references.every(reference=>plain(reference)&&Object.keys(reference).length===2&&Object.hasOwn(reference,'referenceId')&&Object.hasOwn(reference,'role'));
  };
  for(const json of [
    '{"action":"generate_image"}',
    '{"action":"generate_image","sourceVersionIds":[],"references":[]}',
    '{"action":"generate_image","references":[{"referenceId":"id","role":"style"}]}',
    '{"action":"generate_image","references":[{"referenceId":null,"role":null}]}',
    '{"action":"other","references":{}}'
  ])assert.equal(valid(JSON.parse(json)),true,json);
  for(const json of [
    '{"action":"generate_image","sourceVersionIds":{}}',
    '{"action":"generate_image","sourceVersionIds":{"0":"id"}}',
    '{"action":"generate_image","sourceVersionIds":null}',
    '{"action":"generate_image","references":{}}',
    '{"action":"generate_image","references":null}',
    '{"action":"generate_image","references":[[]]}',
    '{"action":"generate_image","references":[["id","style"]]}',
    '{"action":"generate_image","references":[{}]}',
    '{"action":"generate_image","references":[null]}',
    '{"action":"generate_image","references":[{"id":"id","role":"style"}]}',
    '{"action":"generate_image","references":[{"referenceId":"id","role":"style","extra":true}]}'
  ])assert.equal(valid(JSON.parse(json)),false,json);
});

test('references are explicit role-bearing dense selections, not arbitrary assets or URLs',()=>{
  const request=section('validateImageGenerationRequest');
  includes(request,"array_key_exists('references',$input)",'array_keys($references)===range(0,count($references)-1)','count($references)<=5','count($reference)===2',"array_key_exists('referenceId',$reference)","array_key_exists('role',$reference)","validId($reference['referenceId'])");
  includes(request,"in_array($role,array('palette','composition','style','general'),true)","!in_array($id,$seen,true)","array('referenceId'=>$id,'role'=>$role)");
  assert.doesNotMatch(request,/\['(?:assetId|url|bytes|path|versionSnapshot)'\]/);
});

test('creative text uses shared secret guards, raw artifact preservation and optional goal derivation',()=>{
  const request=section('validateImageGenerationRequest');
  includes(request,"userTextValue(array_key_exists('instruction',$input)?$input['instruction']:'',4000,'圖片生成指示',$mode==='generate')","$mode==='generate'||artifactTrim($instruction)!==''","artifactText(field($input,'title'),600,'圖片標題',false)","artifactText(array_key_exists('alt',$input)?$input['alt']:'',3000,'圖片替代文字')");
  ordered(request,"userTextValue($note,12000,'本版目標與修改意見',true)",'ensure(strlen($note)<=12000',"artifactTrim($note)===''?'':validateCombinedVersionNote($note)");
  includes(request,'derive the already-confirmed goal before','not that a generated saved version may lack');
});

test('return whitelist excludes transport metadata, model overrides, credentials, pixels and options',()=>{
  const request=section('validateImageGenerationRequest');
  const expression=request.match(/return array\(([^\n]+)\);\s*\}/);
  assert.ok(expression,'single explicit canonical request return');
  const keys=[...expression[1].matchAll(/'([^']+)'\s*=>/g)].map(match=>match[1]);
  assert.deepEqual(keys,['mode','sourceVersionIds','references','instruction','title','alt','goalAndRationale']);
  assert.doesNotMatch(request,/array_merge|return \$input|\$input\s*\+=|imageGenerationOptions\(/);
  assert.doesNotMatch(expression[1],/quality|size|stream|model|binding|credential|url|bytes|requestId|consent|approved/);
});

test('policy helper contains no network, credential retrieval, state or ownership lookup',()=>{
  const code=source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
  assert.doesNotMatch(code,/\b(?:curl_\w+|file_get_contents|file_put_contents|fopen|fwrite|unlink|mkdir|random_bytes|session_start|getenv|putenv|serialize|unserialize)\s*\(/);
  assert.doesNotMatch(code,/\$_(?:SESSION|GET|POST|ENV|SERVER|COOKIE)|\bnew\s+(?:PDO|Store|MediaStore|OpenAIAdapter|SessionKeyVault)|->(?:read|write|save|request|generate|version|project|lookupReceipt)\(/);
  assert.doesNotMatch(code,/\?->|\bmatch\s*\(|\benum\s+|\breadonly\s+/);
  includes(source,'Shape validation never establishes version/reference ownership or pixel access.');
});

test('independent source-count policy exercises every boundary, without executing PHP',()=>{
  const allows=(mode,count)=>(mode==='generate'&&count===0)||(mode==='revise'&&count===1)||(mode==='fuse'&&count>=2&&count<=5);
  const expected={generate:[0],revise:[1],fuse:[2,3,4,5],edit:[]};
  for(const [mode,accepted] of Object.entries(expected))for(let count=0;count<=6;count++)assert.equal(allows(mode,count),accepted.includes(count),`${mode} ${count}`);
});

test('independent identifier/role/text policy examples make exact-match and UTF8 bounds explicit',()=>{
  const id=value=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value)&&value.length===32;
  for(const value of ['a'.repeat(32),'0123456789abcdef'.repeat(2)])assert.equal(id(value),true);
  for(const value of ['A'.repeat(32),'a'.repeat(31),'a'.repeat(32)+'\n','g'.repeat(32),null,1,[]])assert.equal(id(value),false);
  const roles=['palette','composition','style','general'];
  for(const role of ['Palette','pixel','url','',null])assert.equal(roles.includes(role),false);
  for(const maximum of [600,3000,4000,12000]){
    const text='字'.repeat(Math.floor(maximum/3));
    assert.ok(Buffer.byteLength(text)<=maximum);
    assert.ok(Buffer.byteLength(text+'字')>maximum);
  }
});

test('native fixtures explicitly disclose unexecuted PHP and cover shape, aliases, options and preservation',()=>{
  includes(fixture,'UNEXECUTED in the authoring environment because PHP is unavailable','Node source/independent policy checks and lexer checks do not execute PHP',"require_once dirname(__DIR__).'/app/image-generation.php'",'No provider calls, credentials, database, files, real images or state writes.');
  for(const label of [
    'supported IDs are exact application policy, not fetched account inventory',
    'binding preserves exact selected ID',
    'disclosure distinguishes aliases from dated IDs',
    'six fields with wrong key do not become a binding',
    'exact one-image fixed low-quality PNG options',
    'returned option copy cannot change subsequent policy',
    'canonical request preserves literal artifact text and combined note without mutation',
    'transport metadata, client options, pixels, model and credential fields never pass through',
    'duplicate source versions rejected',
    'duplicate reference ID rejected even with different role',
    'revision and fusion require explicit nonblank instruction',
    'over UTF8 byte boundary',
    'existing secret guard',
    'blank note still enforces raw byte limit',
    'syntactically valid IDs prove no ownership, existence, consent or pixel access',
    'raw JSON object cannot masquerade as array and reference arrays cannot masquerade as objects',
    'raw reference must be plain stdClass not another object class',
    'raw guard rejects empty objects before canonical validator can mistake them for empty arrays',
    'raw shape guard and associative semantic validator compose without changing payload'
  ])assert.ok(fixture.includes(label),label);
  assert.doesNotMatch(fixture,/curl_|new (?:PDO|Store|MediaStore|OpenAIAdapter)|file_put_contents|file_get_contents|set_key/);
});
