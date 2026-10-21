<?php
/**
 * Native PHP 7.4+ image-byte vision fixtures. Run: php tests/image-vision.php
 * Low-memory fixture: php -d memory_limit=32M tests/image-vision.php --memory-limit-only
 * UNEXECUTED in the authoring environment: PHP is unavailable.
 * Source contracts / Node payload oracles do not execute PHP or prove live
 * provider support. No credentials, network, paid inference or storage writes.
 */
require_once dirname(__DIR__).'/app/validation.php';
require_once dirname(__DIR__).'/app/model.php';
$imageVisionChecks=0;
function imageVisionCheck($ok,$label) {global $imageVisionChecks;if(!$ok)throw new RuntimeException('FAIL '.$label);$imageVisionChecks++;echo 'PASS '.$label."\n";}
function imageVisionReject($fn,$label,$code='IMAGE_INPUT_INVALID',$status=409) {
    $error=null;try{$fn();}catch(AppError $e){$error=$e;}
    imageVisionCheck($error instanceof AppError&&$error->errorCode===$code&&$error->status===$status,$label);
}
function imageVisionPng() {return hex2bin('89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c49444154789c63f8cfc0000003010100c9fe92ef0000000049454e44ae426082');}
function imageVisionInput($key='a',$bytes=null) {
    if($bytes===null)$bytes=imageVisionPng();
    return array('label'=>'版本 '.$key,'bytes'=>$bytes,'sha256'=>hash('sha256',$bytes),'assetId'=>str_repeat($key,32));
}
function imageVisionObject($value) {return json_decode(jsonEncode($value));}
function imageVisionBrief() {return array('purpose'=>'海報','audience'=>'社區居民','message'=>'一起看電影','tone'=>'溫暖','constraints'=>'保留清楚對比','summary'=>'使用溫暖且清楚易讀的圖片呈現社區影展。','items'=>array(array('id'=>'document','label'=>'圖片來源')));}
function imageVisionVersion($key='a') {
    $image=imageVisionInput($key);$artifact=array('kind'=>'image','title'=>'版本 '.$key,'alt'=>'測試像素','attribution'=>'使用者上傳','asset'=>array('id'=>$image['assetId'],'mime'=>'image/png','width'=>1,'height'=>1,'byteLength'=>strlen($image['bytes']),'sha256'=>$image['sha256'],'normalization'=>'png-v1'));
    return array('id'=>str_repeat($key,32),'number'=>1,'major'=>1,'minor'=>0,'title'=>'版本 '.$key,'contentType'=>'image','artifact'=>$artifact,'items'=>imageArtifactItems($artifact),'goalText'=>'來源版本自己的目標','goalAndRationale'=>'使用者保存的完整目標與修改意見','source'=>'upload','rationale'=>'手動上傳','goalSnapshot'=>imageVisionBrief(),'createdAt'=>'2026-01-01T00:00:00+00:00');
}
function imageVisionProject() {return array('title'=>'圖片測試','description'=>'圖片理解','module'=>'image','activeItem'=>array('title'=>'海報','description'=>'圖片內容'),'references'=>array(),'messages'=>array(),'brief'=>imageVisionBrief(),'goalApprovedAt'=>null,'officialVersionId'=>null,'versions'=>array(imageVisionVersion()));}
class ImageVisionFixtureAdapter {
    public $calls=array();public $response;public $failure=null;
    public function generate($model,$messages,$schema,$maxOutputTokens=6000,$images=array()) {
        $this->calls[]=array('model'=>$model,'messages'=>$messages,'schema'=>$schema,'budget'=>$maxOutputTokens,'images'=>$images);
        if($this->failure!==null)throw $this->failure;return imageVisionObject($this->response);
    }
}
imageVisionCheck(!function_exists('pngUploadEnsureMemory'),'standalone adapter fixture starts without PNG memory dependency');
imageVisionCheck(prepareModelImageInputs(array())===array(),'zero images need no PNG memory helper');
imageVisionReject(function(){prepareModelImageInputs(array(imageVisionInput()));},'missing memory helper fails closed','IMAGE_RESOURCE_LIMIT',503);
require_once dirname(__DIR__).'/app/bootstrap.php';
require_once dirname(__DIR__).'/app/modules/image.php';
if(isset($argv[1])&&$argv[1]==='--memory-limit-only'){
    imageVisionCheck(pngUploadMemoryLimitBytes(ini_get('memory_limit'))===33554432,'low-memory fixture requires explicit 32M command-line setting');
    $image=imageVisionInput('a',imageVisionSizedPng(2097152));$schema=array('type'=>'object','properties'=>array('reply'=>array('type'=>'string')),'required'=>array('reply'),'additionalProperties'=>false);
    $messages=array(array('role'=>'system','content'=>'fixture system'),array('role'=>'user','content'=>'fixture user'));
    foreach(array('openai','ollama') as $provider){
        $calls=0;$transport=function($url,$payload)use(&$calls,$provider){$calls++;return $provider==='openai'?imageVisionObject(array('status'=>'completed','output'=>array(array('type'=>'message','content'=>array(array('type'=>'output_text','text'=>'{"reply":"ok"}')))))):imageVisionObject(array('done'=>true,'message'=>array('content'=>'{"reply":"ok"}')));};
        $adapter=$provider==='openai'?new OpenAIAdapter(function(){throw new RuntimeException('No credentials allowed');},120000,$transport):new OllamaAdapter('http://127.0.0.1:11434',120000,$transport);
        imageVisionReject(function()use($adapter,$image,$schema,$messages){$adapter->generate('fixed-vision-model',$messages,$schema,6000,array($image));},$provider.' insufficient memory rejects before base64 or transport','IMAGE_RESOURCE_LIMIT',503);
        imageVisionCheck($calls===0,$provider.' insufficient memory causes zero provider calls');
        imageVisionCheck($adapter->generate('fixed-vision-model',$messages,$schema)->reply==='ok'&&$calls===1,$provider.' zero-image legacy request unaffected by low headroom');
    }
    echo 'TOTAL '.$imageVisionChecks." low-memory vision checks; memory_limit was never changed by this fixture.\n";exit;
}
$images=array(imageVisionInput('a'),imageVisionInput('b'));$before=$images;
imageVisionCheck(prepareModelImageInputs($images)===$images&&$images===$before,'pure helper retains exact bytes, identity, hash and order');
imageVisionCheck(prepareModelImageInputs(array())===array(),'empty images preserve legacy requests');
foreach(array(
    'null list'=>null,'associative list'=>array('first'=>$images[0]),'six images'=>array_fill(0,6,$images[0]),
    'record object'=>array((object)$images[0]),'extra URL field'=>array(array_merge($images[0],array('url'=>'https://example.invalid/image.png')))
) as $label=>$bad)imageVisionReject(function()use($bad){prepareModelImageInputs($bad);},'reject '.$label);
foreach(array('label','bytes','sha256','assetId') as $key){$bad=$images[0];unset($bad[$key]);imageVisionReject(function()use($bad){prepareModelImageInputs(array($bad));},'reject missing '.$key);}
foreach(array('label'=>array('',str_repeat('x',1001),"bad\0label","\xff",null),'bytes'=>array('',str_repeat('x',57),'https://example.invalid/a.png','/tmp/a.png',null),'sha256'=>array(str_repeat('0',64),str_repeat('A',64),'abc',null),'assetId'=>array(str_repeat('A',32),'../file',str_repeat('a',31),null)) as $key=>$values){
    foreach($values as $value){$bad=$images[0];$bad[$key]=$value;imageVisionReject(function()use($bad){prepareModelImageInputs(array($bad));},'reject invalid '.$key);}
}
$exact=$images[0];$exact['label']=str_repeat('中',333).'a';imageVisionCheck(prepareModelImageInputs(array($exact))[0]['label']===$exact['label'],'1000 UTF8-byte label boundary retained');
// Valid PNG framing with a large ancillary chunk tests transport byte limits,
// not upstream png-v1 normalization (which strips this chunk before storage).
function imageVisionSizedPng($size) {
    $png=imageVisionPng();$data=str_repeat('x',$size-strlen($png)-12);$type='tEXt';
    return substr($png,0,-12).pack('N',strlen($data)).$type.$data.hash('crc32b',$type.$data,true).substr($png,-12);
}
$large=imageVisionInput('a',imageVisionSizedPng(4194304));
imageVisionCheck(strlen(prepareModelImageInputs(array($large))[0]['bytes'])===4194304,'exact 4 MiB image boundary');
imageVisionCheck(count(prepareModelImageInputs(array($large,$large,$large)))===3,'exact combined 12 MiB boundary');
$tooLarge=imageVisionInput('a',imageVisionSizedPng(4194305));imageVisionReject(function()use($tooLarge){prepareModelImageInputs(array($tooLarge));},'reject image over 4 MiB');
imageVisionReject(function()use($large,$images){prepareModelImageInputs(array($large,$large,$large,$images[0]));},'reject combined images over 12 MiB','IMAGE_INPUT_LIMIT');
unset($large,$tooLarge);

$messages=array(array('role'=>'system','content'=>'system text'),array('role'=>'user','content'=>'earlier user'),array('role'=>'assistant','content'=>'earlier reply'),array('role'=>'user','content'=>"original user\n文字"),array('role'=>'assistant','content'=>'tail remains'));
$original=$messages;$oa=openAIImageMessages($messages,$images);$ol=ollamaImageMessages($messages,$images);
imageVisionCheck($messages===$original&&$oa[0]===$messages[0]&&$oa[1]===$messages[1]&&$oa[4]===$messages[4],'OpenAI only modifies last user copy');
imageVisionCheck($oa[3]['content'][0]===array('type'=>'input_text','text'=>$messages[3]['content']),'OpenAI retains exact original user text');
foreach($images as $i=>$image){imageVisionCheck($oa[3]['content'][1+2*$i]===array('type'=>'input_text','text'=>$image['label']),'OpenAI ordered label '.$i);imageVisionCheck($oa[3]['content'][2+2*$i]===array('type'=>'input_image','image_url'=>'data:image/png;base64,'.base64_encode($image['bytes'])),'OpenAI actual PNG data URL '.$i);}
imageVisionCheck($ol[3]['images']===array(base64_encode($images[0]['bytes']),base64_encode($images[1]['bytes'])),'Ollama raw base64 order without data URL');
imageVisionCheck($ol[3]['content']===$messages[3]['content']."\n\n本次圖片依序對應：\n1. ".$images[0]['label']."\n2. ".$images[1]['label']&&$ol[0]===$messages[0]&&$ol[4]===$messages[4],'Ollama retains text and labels only last user');
imageVisionCheck(openAIImageMessages($messages,array())===$messages&&ollamaImageMessages($messages,array())===$messages,'legacy text-only payloads unchanged');
$blocks=$messages;$blocks[3]['content']=array(array('type'=>'input_text','text'=>'first'),array('type'=>'input_text','text'=>'second'));imageVisionCheck(array_slice(openAIImageMessages($blocks,$images)[3]['content'],0,2)===$blocks[3]['content'],'existing OpenAI text blocks retained');
$external=$blocks;$external[3]['content'][]=array('type'=>'input_image','image_url'=>'https://example.invalid/hidden.png');imageVisionReject(function()use($external,$images){openAIImageMessages($external,$images);},'reject prebuilt image URL bypass');
$external=$messages;$external[3]['images']=array('hidden');imageVisionReject(function()use($external,$images){ollamaImageMessages($external,$images);},'reject prebuilt Ollama image bypass');
foreach(array('openAIImageMessages','ollamaImageMessages') as $fn)imageVisionReject(function()use($fn,$images){$fn(array(array('role'=>'system','content'=>'no user')),$images);},'reject missing user '.$fn);

$schema=array('type'=>'object','properties'=>array('reply'=>array('type'=>'string')),'required'=>array('reply'),'additionalProperties'=>false);
foreach(array('openai','ollama') as $provider){
    $calls=0;$payloads=array();$urls=array();$fail=false;
    $transport=function($url,$payload)use(&$calls,&$payloads,&$urls,&$fail,$provider){$calls++;$urls[]=$url;$payloads[]=$payload;if($fail)throw new AppError('MODEL_TIMEOUT','模擬逾時',502);return $provider==='openai'?imageVisionObject(array('status'=>'completed','model'=>'fixed-vision-model','output'=>array(array('type'=>'message','content'=>array(array('type'=>'output_text','text'=>'{"reply":"ok"}')))))):imageVisionObject(array('done'=>true,'model'=>'fixed-vision-model','message'=>array('content'=>'{"reply":"ok"}')));};
    $adapter=$provider==='openai'?new OpenAIAdapter(function(){throw new RuntimeException('Credential provider must not run');},120000,$transport):new OllamaAdapter('http://127.0.0.1:11434',120000,$transport);
    imageVisionCheck($adapter->generate('fixed-vision-model',$messages,$schema,6000,$images)->reply==='ok'&&$calls===1,$provider.' one image-aware call');
    $payload=$payloads[0];imageVisionCheck($payload['model']==='fixed-vision-model'&&$adapter->actualModel()==='fixed-vision-model',$provider.' fixed requested model and actual model');
    if($provider==='openai')imageVisionCheck($urls[0]==='https://api.openai.com/v1/responses'&&$payload['input']===$oa&&$payload['store']===false&&$payload['stream']===false&&$payload['text']['format']['strict']===true,$provider.' fixed endpoint and strict schema');
    else imageVisionCheck($urls[0]==='http://127.0.0.1:11434/api/chat'&&$payload['messages'][3]===$ol[3]&&$payload['format']===$schema&&$payload['stream']===false,$provider.' fixed endpoint and schema');
    $adapter->generate('fixed-vision-model',$messages,$schema);imageVisionCheck($calls===2,$provider.' legacy four-argument call remains valid');
    $fail=true;imageVisionReject(function()use($adapter,$messages,$schema,$images){$adapter->generate('fixed-vision-model',$messages,$schema,6000,$images);},$provider.' transport failure propagated once','MODEL_TIMEOUT',502);imageVisionCheck($calls===3,$provider.' no fallback or automatic retry');
    $bad=$images;$bad[0]['sha256']=str_repeat('0',64);imageVisionReject(function()use($adapter,$messages,$schema,$bad){$adapter->generate('fixed-vision-model',$messages,$schema,6000,$bad);},$provider.' invalid hash rejected before transport');imageVisionCheck($calls===3,$provider.' failed preflight makes no call');
}

$project=imageVisionProject();$source=$project['versions'][0];$adapter=new ImageVisionFixtureAdapter();$module=new ImageModule($adapter);
$emptyDirection=array('purpose'=>'','audience'=>'','message'=>'','tone'=>'','constraints'=>'','summary'=>'','items'=>array());
$adapter->response=array('reply'=>'圖片中央的主體很清楚。','question'=>'','choices'=>array(),'directionStatus'=>'exploring','direction'=>$emptyDirection);
$module->setImageInputs($images);$result=$module->discuss($project,'你看到了什麼','fixed-vision-model');
imageVisionCheck($result['direction']===null&&$adapter->calls[0]['images']===$images,'discussion forwards actual bytes with exploratory direction');
$data=json_decode($adapter->calls[0]['messages'][1]['content'],true);imageVisionCheck(count($data['imageInputs'])===2&&!isset($data['imageInputs'][0]['bytes'])&&!isset($data['versions']),'context includes image provenance metadata only and omits unselected versions');
imageVisionCheck(strpos($adapter->calls[0]['messages'][0]['content'],'不能生成或修改圖片像素')!==false,'prompt states honest discussion-only capability');
$module->discuss($project,'只討論方向','fixed-vision-model');imageVisionCheck($adapter->calls[1]['images']===array(),'image scope consumed after one request');
$adapter->response=array('reply'=>'方向已可確認，可上傳或引用圖片繼續討論，目前不能生成或修改圖片。','question'=>'','choices'=>array(),'directionStatus'=>'ready','direction'=>imageVisionBrief());
$result=$module->discuss($project,'目標明確','fixed-vision-model');imageVisionCheck($result['direction']['items']===array(array('id'=>'document','label'=>'圖片來源')),'ready discussion retains strict image brief');
$adapter->response=imageVisionBrief();$module->setImageInputs(array($images[0]));$result=$module->summarize($project,'fixed-vision-model');imageVisionCheck($result===imageVisionBrief()&&end($adapter->calls)['images']===array($images[0]),'summarize reuses strict schema and actual image bytes');
$adapter->response=array('reply'=>'可以考慮提高背景和主體的對比。','question'=>'','outcome'=>'clarification','choices'=>array());$before=jsonEncode($project);
$module->setImageInputs(array($images[0]));$result=$module->refine($project,$source,'請修改對比','fixed-vision-model');
imageVisionCheck($result['outcome']==='clarification'&&$result['items']===array()&&$result['rationale']===''&&!array_key_exists('artifact',$result)&&!array_key_exists('goalText',$result)&&!array_key_exists('changeSummary',$result)&&jsonEncode($project)===$before,'refine only clarification; image artifact, goal and versions unchanged');
$last=end($adapter->calls);$refineData=json_decode($last['messages'][1]['content'],true);imageVisionCheck($refineData['sourceVersion']['goalAndRationale']===$source['goalAndRationale'],'source version own combined goal preserved');
$adapter->response['outcome']='revision';$module->setImageInputs(array($images[0]));imageVisionReject(function()use($module,$project,$source){$module->refine($project,$source,'修改','fixed-vision-model');},'reject revision outcome','MODEL_OUTPUT_INVALID',502);
$adapter->response=array('reply'=>'已生成圖片。','question'=>'','outcome'=>'clarification','choices'=>array());$module->setImageInputs(array($images[0]));imageVisionReject(function()use($module,$project,$source){$module->refine($project,$source,'修改','fixed-vision-model');},'reject fake generated-raster claim','MODEL_CLARIFICATION_CLAIM',502);
$count=count($adapter->calls);imageVisionReject(function()use($module,$project,$source){$module->refine($project,$source,'修改','fixed-vision-model');},'missing source pixels rejected','IMAGE_INPUT_REQUIRED');imageVisionCheck(count($adapter->calls)===$count,'missing source causes zero calls');
$versions=array($source,imageVisionVersion('b'));$adapter->response=array('items'=>array(),'summary'=>'兩版適合不同方向。');foreach($versions as $version)$adapter->response['items'][]=array('versionId'=>$version['id'],'fit'=>'符合此版自己的目標','strength'=>'主體清楚','tradeoff'=>'背景對比較弱','suggestion'=>'可考慮加強對比');
$module->setImageInputs($images);$result=$module->compare($project,$versions,'各有何特色','fixed-vision-model');imageVisionCheck(count($result['items'])===2&&end($adapter->calls)['images']===$images,'compare matches every selected source to actual pixels');
$module->setImageInputs(array($images[0]));$count=count($adapter->calls);imageVisionReject(function()use($module,$project,$versions){$module->compare($project,$versions,'比較','fixed-vision-model');},'metadata-only comparison rejected','IMAGE_INPUT_REQUIRED');imageVisionCheck(count($adapter->calls)===$count,'comparison preflight makes zero calls');
foreach(array('generate','fuse') as $action){$count=count($adapter->calls);imageVisionReject(function()use($module,$project,$versions,$action){if($action==='generate')$module->generate($project,'生成','fixed-vision-model');else $module->fuse($project,$versions,'融合','fixed-vision-model');},$action.' explicitly unavailable','CAPABILITY_UNAVAILABLE');imageVisionCheck(count($adapter->calls)===$count,$action.' no model or generation call');}
$adapter->response=array('reply'=>'討論','question'=>'','choices'=>array(),'directionStatus'=>'exploring','direction'=>$emptyDirection,'extra'=>'reject');imageVisionReject(function()use($module,$project){$module->discuss($project,'討論','fixed-vision-model');},'strict extra output property rejected','MODEL_OUTPUT_INVALID',502);
$big=$project;$big['description']=str_repeat('x',600001);$count=count($adapter->calls);$module->setImageInputs($images);imageVisionReject(function()use($module,$big){$module->discuss($big,'討論','fixed-vision-model');},'full context bound rejects before model','CONTEXT_LIMIT');imageVisionCheck(count($adapter->calls)===$count,'oversized context no truncation or model call');
$adapter->response=array('reply'=>'討論','question'=>'','choices'=>array(),'directionStatus'=>'exploring','direction'=>$emptyDirection);$module->discuss($project,'討論','fixed-vision-model');imageVisionCheck(end($adapter->calls)['images']===array(),'context failure consumes image scope');
$adapter->failure=new AppError('MODEL_TIMEOUT','模擬未知結果',502);$module->setImageInputs($images);$count=count($adapter->calls);imageVisionReject(function()use($module,$project){$module->discuss($project,'討論','fixed-vision-model');},'module propagates model failure without fake result','MODEL_TIMEOUT',502);imageVisionCheck(count($adapter->calls)===$count+1,'module exact call count after model failure');
echo 'TOTAL '.$imageVisionChecks." image vision fixture checks. No real provider or PHP runtime pass is implied by Node source checks.\n";
