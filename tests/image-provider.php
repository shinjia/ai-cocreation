<?php
/**
 * Native PHP 7.4+ fixture: php tests/image-provider.php
 * Low memory: php -d memory_limit=32M tests/image-provider.php --memory-limit-only
 * Normalizer headroom: php -d memory_limit=80M tests/image-provider.php --memory-limit-only
 * UNEXECUTED in the authoring environment: PHP is unavailable.
 * Node source/algorithm checks do not run PHP, cURL, TLS or live providers.
 * Constructor-only transports never retrieve credentials or use a network.
 */
require_once dirname(__DIR__).'/app/validation.php';
require_once dirname(__DIR__).'/app/model.php';
require_once dirname(__DIR__).'/app/image-generation.php';
require_once dirname(__DIR__).'/app/image-provider.php';
$imageProviderChecks=0;$imageProviderKeyCalls=0;$imageProviderCalls=array();$imageProviderResponse=null;
function imageProviderCheck($ok,$label) {global $imageProviderChecks;if(!$ok)throw new RuntimeException('FAIL '.$label);$imageProviderChecks++;echo 'PASS '.$label."\n";}
function imageProviderReject($fn,$label,$code,$status=502) {
    $error=null;try{$fn();}catch(AppError $e){$error=$e;}
    imageProviderCheck($error instanceof AppError&&$error->errorCode===$code&&$error->status===$status,$label);return $error;
}
function imageProviderKey() {global $imageProviderKeyCalls;$imageProviderKeyCalls++;throw new RuntimeException('Credential lookup forbidden');}
function imageProviderTransport($url,$payload) {global $imageProviderCalls,$imageProviderResponse;$imageProviderCalls[]=array('url'=>$url,'payload'=>$payload);if($imageProviderResponse instanceof Throwable)throw $imageProviderResponse;return $imageProviderResponse;}
function imageProviderChunk($type,$data) {return pack('N',strlen($data)).$type.$data.hash('crc32b',$type.$data,true);}
function imageProviderPng($width=1024,$height=1024) {
    return "\x89PNG\r\n\x1a\n".imageProviderChunk('IHDR',pack('NNCCCCC',$width,$height,8,2,0,0,0)).imageProviderChunk('IDAT',gzcompress(str_repeat("\0",($width*3+1)*$height),6)).imageProviderChunk('IEND','');
}
function imageProviderInput($key='a') {$bytes=imageProviderPng(1,1);return array('label'=>'來源 '.$key,'bytes'=>$bytes,'sha256'=>hash('sha256',$bytes),'assetId'=>str_repeat($key,32));}
function imageProviderEnvelope($body,$status=200,$headers=array('x-request-id'=>'req_fixture_123')) {return array('status'=>$status,'body'=>is_string($body)?$body:jsonEncode($body),'headers'=>$headers);}
function imageProviderResult($bytes,$extra=array(),$entryExtra=array()) {return array_merge(array('created'=>1792612800,'data'=>array(array_merge(array('b64_json'=>base64_encode($bytes)),$entryExtra))),$extra);}

$adapter=new OpenAIImageAdapter('imageProviderKey',120000,'imageProviderTransport');$model='gpt-image-2.5-sunburst-2026-09-08';
imageProviderCheck(!function_exists('pngUploadEnsureMemory'),'standalone fixture starts without memory helper');
imageProviderReject(function()use($adapter,$model){$adapter->generate($model,'畫一棵樹');},'missing memory helper fails before transmission','IMAGE_GENERATION_RESOURCE_LIMIT',503);
imageProviderCheck(count($imageProviderCalls)===0&&$imageProviderKeyCalls===0,'missing helper makes no transport or credential call');
require_once dirname(__DIR__).'/app/png-upload.php';
if(isset($argv[1])&&$argv[1]==='--memory-limit-only'){
    imageProviderCheck(in_array(pngUploadMemoryLimitBytes(ini_get('memory_limit')),array(33554432,83886080),true),'low-memory fixture requires explicit 32M or 80M setting');
    imageProviderReject(function()use($adapter,$model){$adapter->generate($model,'只生成一張圖');},'zero-input generation reserves output memory before transport','IMAGE_GENERATION_RESOURCE_LIMIT',503);
    imageProviderCheck(count($imageProviderCalls)===0&&$imageProviderKeyCalls===0,'low-memory failure makes zero provider calls');
    echo 'TOTAL '.$imageProviderChecks." low-memory image-provider checks; memory limit was not changed.\n";exit;
}

$png=imageProviderPng();$imageProviderResponse=imageProviderEnvelope(imageProviderResult($png));
$result=$adapter->generate($model,'畫一棵樹');
imageProviderCheck(array_keys($result)===array('bytes','actualModel','providerRequestId','providerCreatedAt','revisedPrompt','usage'),'stable six-key return contract');
imageProviderCheck($result['bytes']===$png&&$result['actualModel']===null&&$result['providerRequestId']==='req_fixture_123'&&$result['providerCreatedAt']===1792612800&&$result['revisedPrompt']===null&&$result['usage']===null,'exact bytes and reported metadata without invented model');
imageProviderCheck(count($imageProviderCalls)===1&&$imageProviderKeyCalls===0,'one fixture call and zero credential calls');
$request=$imageProviderCalls[0];
imageProviderCheck($request['url']==='https://api.openai.com/v1/images/generations'&&$request['payload']===array_merge(array('model'=>$model,'prompt'=>'畫一棵樹'),imageGenerationOptions()),'generation endpoint and exact fixed JSON payload');
imageProviderCheck(!isset($request['payload']['response_format'])&&!isset($request['payload']['input_fidelity'])&&!isset($request['payload']['style'])&&!isset($request['payload']['images']),'no old-model parameters or phantom image inputs');
imageProviderCheck(normalizeUploadedPng($result['bytes'])['width']===1024,'caller full normalization accepts synthetic PNG');
$large=substr($png,0,-12).imageProviderChunk('tEXt',str_repeat('x',4194304-strlen($png)-12)).substr($png,-12);
$imageProviderResponse=imageProviderEnvelope(imageProviderResult($large));$result=$adapter->generate($model,'測試上限');
imageProviderCheck(strlen($result['bytes'])===4194304&&$result['bytes']===$large,'exact 4 MiB generated PNG boundary fits response cap');
unset($large,$result);$imageProviderResponse=imageProviderEnvelope(imageProviderResult($png));

$images=array(imageProviderInput('a'),imageProviderInput('b'));$original=$images;
$result=$adapter->generate($model,'依照兩張來源圖修改',$images,imageGenerationOptions());$request=end($imageProviderCalls);
imageProviderCheck($request['url']==='https://api.openai.com/v1/images/edits'&&$images===$original,'edit endpoint preserves immutable ordered source inputs');
imageProviderCheck($request['payload']['images']===array(array('image_url'=>'data:image/png;base64,'.base64_encode($images[0]['bytes'])),array('image_url'=>'data:image/png;base64,'.base64_encode($images[1]['bytes']))),'edit sends real PNG bytes in JSON images data URLs');
imageProviderCheck(!isset($request['payload']['image'])&&!isset($request['payload']['file_id'])&&$request['payload']['model']===$model,'no multipart or file upload fallback and exact requested model');
$five=array(imageProviderInput('a'),imageProviderInput('b'),imageProviderInput('c'),imageProviderInput('d'),imageProviderInput('e'));$adapter->generate($model,'五張參考',$five);
imageProviderCheck(count(end($imageProviderCalls)['payload']['images'])===5,'five validated ordered images reach edit transport once');

$before=count($imageProviderCalls);
foreach(array('gpt-4o','gpt-image-2-not-verified','chatgpt-image-latest','gpt-image-1','',null) as $bad)imageProviderReject(function()use($adapter,$bad){$adapter->generate($bad,'畫一棵樹');},'reject unsupported model without fallback','IMAGE_MODEL_UNSUPPORTED',409);
foreach(array('',null,"\xff",str_repeat('x',32001),"bad\0text",'sk-'.str_repeat('x',30)) as $bad)imageProviderReject(function()use($adapter,$model,$bad){$adapter->generate($model,$bad);},'reject unsafe or oversized prompt','IMAGE_GENERATION_INPUT_INVALID',409);
foreach(array(null,false,array('n'=>2),array('n'=>'1'),array('size'=>'auto'),array('quality'=>'high'),array('output_format'=>'jpeg'),array('background'=>'transparent'),array('stream'=>true),array('url'=>'https://example.invalid/'),array('model'=>'gpt-image-2'),array('response_format'=>'url')) as $bad)imageProviderReject(function()use($adapter,$model,$bad){$adapter->generate($model,'生成',array(),$bad);},'reject client option override','IMAGE_GENERATION_OPTIONS_INVALID',409);
foreach(array(999,180001,120000.0,'120000') as $bad)imageProviderReject(function()use($bad){new OpenAIImageAdapter('imageProviderKey',$bad,'imageProviderTransport');},'constructor preserves existing timeout cap','IMAGE_GENERATION_INPUT_INVALID',409);
imageProviderReject(function()use($adapter,$model,$images){$bad=$images;$bad[0]['url']='https://example.invalid/private.png';$adapter->generate($model,'生成',$bad);},'reject URL input fields before any request','IMAGE_INPUT_INVALID',409);
imageProviderReject(function()use($adapter,$model,$images){$bad=$images;$bad[0]['bytes']='/private/image.png';$adapter->generate($model,'生成',$bad);},'reject private path input before any request','IMAGE_INPUT_INVALID',409);
imageProviderReject(function()use($adapter,$model,$images){$bad=$images;$bad[0]['sha256']=str_repeat('0',64);$adapter->generate($model,'生成',$bad);},'reject source hash mismatch before any request','IMAGE_INPUT_INVALID',409);
imageProviderReject(function()use($adapter,$model,$images){$adapter->generate($model,'生成',array_fill(0,6,$images[0]));},'reject more than five input images','IMAGE_INPUT_INVALID',409);
imageProviderCheck(count($imageProviderCalls)===$before&&$imageProviderKeyCalls===0,'all failed preflights preserve zero extra calls');
$adapter->generate($model,str_repeat('x',32000),array(),array('n'=>1));imageProviderCheck(strlen(end($imageProviderCalls)['payload']['prompt'])===32000,'exact 32000-byte prompt boundary and unchanged options accepted');

$imageProviderResponse=imageProviderEnvelope(imageProviderResult($png,array('model'=>'gpt-image-2.5-sunburst-2026-09-08','usage'=>array('input_tokens'=>100,'output_tokens'=>50,'total_tokens'=>150,'input_tokens_details'=>array('text_tokens'=>60,'image_tokens'=>40))),array('revised_prompt'=>'A clean tree illustration.','url'=>'https://example.invalid/never-follow')));
$result=$adapter->generate($model,'畫一棵樹');
imageProviderCheck($result['actualModel']==='gpt-image-2.5-sunburst-2026-09-08'&&$result['usage']['input_tokens_details']['image_tokens']===40&&$result['revisedPrompt']==='A clean tree illustration.','actual provider model and bounded numeric usage retained only when returned');
imageProviderCheck($result['bytes']===$png,'valid b64 wins without ever following optional response URL');
foreach(array("req_a\r\nsecret: value",str_repeat('r',129),'sk-'.str_repeat('x',30),array('req_a')) as $id){$imageProviderResponse=imageProviderEnvelope(imageProviderResult($png),200,array('x-request-id'=>$id));imageProviderCheck($adapter->generate($model,'生成')['providerRequestId']===null,'unsafe request identifier omitted');}
$imageProviderResponse=imageProviderEnvelope(imageProviderResult($png),200,array('X-Request-Id'=>'req_upper'));imageProviderCheck($adapter->generate($model,'生成')['providerRequestId']==='req_upper','request ID header lookup is case insensitive');
$imageProviderResponse=imageProviderEnvelope(imageProviderResult($png),200,array('x-request-id'=>'req_one','X-Request-Id'=>'req_two'));imageProviderCheck($adapter->generate($model,'生成')['providerRequestId']===null,'ambiguous duplicate request IDs omitted');
foreach(array('sk-'.str_repeat('x',30),"model\nname",str_repeat('x',161),'') as $reported){$imageProviderResponse=imageProviderEnvelope(imageProviderResult($png,array('model'=>$reported)));imageProviderCheck($adapter->generate($model,'生成')['actualModel']===null,'unsafe reported model omitted without requested-model fallback');}
foreach(array('1792612800',-1,4102444801,1792612800.5) as $created){$imageProviderResponse=imageProviderEnvelope(imageProviderResult($png,array('created'=>$created)));imageProviderCheck($adapter->generate($model,'生成')['providerCreatedAt']===null,'invalid provider time omitted');}
foreach(array('sk-'.str_repeat('x',30),str_repeat('x',32001),"bad\0text") as $revised){$imageProviderResponse=imageProviderEnvelope(imageProviderResult($png,array(),array('revised_prompt'=>$revised)));imageProviderCheck($adapter->generate($model,'生成')['revisedPrompt']===null,'unsafe revised prompt omitted');}
foreach(array(array('input_tokens'=>'raw-secret'),array('input_tokens'=>-1),array('input_tokens'=>true),array('bad-key'=>2),array('a'=>array('b'=>array('c'=>array('d'=>array('e'=>1)))))) as $usage){$imageProviderResponse=imageProviderEnvelope(imageProviderResult($png,array('usage'=>$usage)));imageProviderCheck($adapter->generate($model,'生成')['usage']===null,'unsafe usage metadata omitted');}

$badResponses=array(
    'invalid JSON'=>'not JSON',
    'top-level array'=>array(),
    'missing image'=>array('data'=>array()),
    'two images'=>array('data'=>array(array('b64_json'=>base64_encode($png)),array('b64_json'=>base64_encode($png)))),
    'object not ordered list'=>array('data'=>array('first'=>array('b64_json'=>base64_encode($png)))),
    'URL only'=>array('data'=>array(array('url'=>'https://example.invalid/private.png'))),
    'error on success status'=>array('error'=>array('message'=>'must not be disclosed'),'data'=>array(array('b64_json'=>base64_encode($png))))
);
foreach(array('',base64_encode($png)."\n",'data:image/png;base64,'.base64_encode($png),'AAAA-A==','AB==','A===',base64_encode('not a png'),base64_encode(imageProviderPng(1,1)),base64_encode(substr($png,0,-12)),base64_encode(str_repeat('x',4194305))) as $i=>$encoded)$badResponses['bad base64/png '.$i]=array('data'=>array(array('b64_json'=>$encoded)));
foreach($badResponses as $label=>$body){
    $imageProviderResponse=imageProviderEnvelope($body);$before=count($imageProviderCalls);
    $error=imageProviderReject(function()use($adapter,$model){$adapter->generate($model,'生成');},'reject '.$label,'IMAGE_GENERATION_OUTPUT_INVALID');
    imageProviderCheck(count($imageProviderCalls)===$before+1&&strpos($error->getMessage(),'可能已產生費用')!==false&&strpos($error->getMessage(),'原有版本不變')!==false,'invalid output warns about charges and never retries');
}
$imageProviderResponse=imageProviderEnvelope(str_repeat('x',OpenAIImageAdapter::MAX_RESPONSE_BYTES+1));$before=count($imageProviderCalls);
$error=imageProviderReject(function()use($adapter,$model){$adapter->generate($model,'生成');},'reject oversized response body','IMAGE_GENERATION_RESPONSE_TOO_LARGE');
imageProviderCheck(count($imageProviderCalls)===$before+1&&strpos($error->getMessage(),'可能已產生費用')!==false,'oversized response cannot be mistaken for free failure');
$imageProviderResponse=imageProviderEnvelope('{"data":[{"b64_json":"'.base64_encode($png).'"}],"bomb":['.str_repeat('{},',30000).'{}]}');
imageProviderReject(function()use($adapter,$model){$adapter->generate($model,'生成');},'non-image array is bounded before allocation','IMAGE_GENERATION_OUTPUT_INVALID');

// Envelope success is NOT a full PNG validation claim. The caller must reject
// invalid chunk CRCs before saving, without changing original versions.
$corrupt=$png;$corrupt[29]=chr(ord($corrupt[29])^1);$imageProviderResponse=imageProviderEnvelope(imageProviderResult($corrupt));$result=$adapter->generate($model,'生成');
imageProviderCheck($result['bytes']===$corrupt,'adapter deliberately does not replace caller full PNG normalization');
imageProviderReject(function()use($result){normalizeUploadedPng($result['bytes']);},'caller rejects corrupted PNG CRC after provider attempt','PNG_INVALID',400);

$redacted='upstream-private-text-'.str_repeat('x',20);
foreach(array(400,401,403,404,413,429,499) as $status){
    $imageProviderResponse=imageProviderEnvelope(array('error'=>array('code'=>$redacted,'message'=>$redacted)), $status);$before=count($imageProviderCalls);
    $error=imageProviderReject(function()use($adapter,$model){$adapter->generate($model,'生成');},'redacted HTTP '.$status,'OPENAI_IMAGE_HTTP_ERROR');
    imageProviderCheck(strpos($error->getMessage(),$redacted)===false&&strpos($error->getMessage(),'可能已產生費用')!==false&&count($imageProviderCalls)===$before+1,'HTTP errors hide upstream content and do not retry');
}
foreach(array('credit_balance_exhausted','project_spend_limit_exceeded','organization_spend_limit_exceeded','organization_usage_limit_exceeded','insufficient_quota') as $code){$imageProviderResponse=imageProviderEnvelope(array('error'=>array('code'=>$code,'message'=>$redacted)),429);$error=imageProviderReject(function()use($adapter,$model){$adapter->generate($model,'生成');},'quota error is not generic retryable rate limit','OPENAI_IMAGE_HTTP_ERROR');imageProviderCheck(strpos($error->getMessage(),'帳戶額度或專案用量上限不足')!==false,'safe quota explanation');}
foreach(array('moderation_blocked','image_generation_user_error') as $code){$imageProviderResponse=imageProviderEnvelope(array('error'=>array('code'=>$code,'message'=>$redacted)),400);$error=imageProviderReject(function()use($adapter,$model){$adapter->generate($model,'生成');},'blocked input receives static explanation','OPENAI_IMAGE_HTTP_ERROR');imageProviderCheck(strpos($error->getMessage(),'調整指示或來源圖片')!==false,'safe input explanation');}
foreach(array(0,302,500,502,503,599) as $status){
    $imageProviderResponse=imageProviderEnvelope(array('error'=>array('message'=>$redacted)),$status);$before=count($imageProviderCalls);
    $error=imageProviderReject(function()use($adapter,$model){$adapter->generate($model,'生成');},'uncertain HTTP '.$status,'OPENAI_IMAGE_HTTP_UNKNOWN');
    imageProviderCheck(operationOutcome($error)==='unknown'&&strpos($error->getMessage(),$redacted)===false&&count($imageProviderCalls)===$before+1,'network and 5xx remain unknown with zero retries');
}
foreach(array(new RuntimeException($redacted),new AppError('MODEL_TIMEOUT',$redacted,502),null,array('status'=>'200','body'=>'{}'),array('status'=>200,'body'=>array())) as $response){
    $imageProviderResponse=$response;$before=count($imageProviderCalls);$error=imageProviderReject(function()use($adapter,$model){$adapter->generate($model,'生成');},'incomplete fixture transport is redacted and uncertain','OPENAI_IMAGE_CONNECTION');
    imageProviderCheck(operationOutcome($error)==='unknown'&&strpos($error->getMessage(),$redacted)===false&&count($imageProviderCalls)===$before+1,'transport exception never triggers paid retry');
}
imageProviderCheck($imageProviderKeyCalls===0,'all constructor fixture paths avoid credentials');
echo 'TOTAL '.$imageProviderChecks." image-provider fixture checks; no real credentials or provider requests.\n";
