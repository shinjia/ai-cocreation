<?php
/**
 * Native PHP 7.4+ pure policy fixtures. Run: php tests/image-generation.php
 * UNEXECUTED in the authoring environment because PHP is unavailable.
 * Node source/independent policy checks and lexer checks do not execute PHP.
 * No provider calls, credentials, database, files, real images or state writes.
 */
require_once dirname(__DIR__).'/app/validation.php';
require_once dirname(__DIR__).'/app/versioning.php';
require_once dirname(__DIR__).'/app/artifacts.php';
require_once dirname(__DIR__).'/app/image-generation.php';

$imageGenerationChecks=0;
function imageGenerationCheck($ok,$label) {
    global $imageGenerationChecks;
    if(!$ok)throw new RuntimeException('FAIL '.$label);
    $imageGenerationChecks++;echo 'PASS '.$label."\n";
}
function imageGenerationReject($call,$label,$code=null,$status=null) {
    $error=null;try{$call();}catch(AppError $caught){$error=$caught;}
    imageGenerationCheck($error instanceof AppError&&($code===null||$error->errorCode===$code)&&($status===null||$error->status===$status),$label);
}
function imageGenerationBindingFixture($model='gpt-image-2') {
    return array('memberId'=>str_repeat('a',32),'memberNickname'=>'圖片夥伴','provider'=>'openai','model'=>$model,'ollamaUrl'=>'http://127.0.0.1:11434','boundAt'=>'2026-10-21T00:00:00+00:00');
}
function imageGenerationRequestFixture($mode='generate',$count=0) {
    $ids=array();for($i=0;$i<$count;$i++)$ids[]=str_pad(dechex($i+1),32,'0',STR_PAD_LEFT);
    return array('mode'=>$mode,'sourceVersionIds'=>$ids,'references'=>array(),'instruction'=>'以原先方向做調整','title'=>"  海報草圖 <文字>\r\n ",'alt'=>"像素描述 🐻\n",'goalAndRationale'=>"  本版目標與修改意見\r\n保留完整文字  ");
}

$expected=array('gpt-image-2','gpt-image-2-2026-04-21','gpt-image-2.5-sunburst','gpt-image-2.5-sunburst-2026-09-08','gpt-image-2.5-flare','gpt-image-2.5-flare-2026-09-08');
imageGenerationCheck(imageGenerationModels()===$expected&&count(array_unique(imageGenerationModels()))===6,'supported IDs are exact application policy, not fetched account inventory');
foreach($expected as $model){
    $binding=imageGenerationBindingFixture($model);
    imageGenerationCheck(imageGenerationModelSupported('openai',$model)&&!imageGenerationModelSupported('ollama',$model),'strict OpenAI support '.$model);
    imageGenerationCheck(validateProjectImageBinding($binding)===$binding,'binding preserves exact selected ID '.$model);
    $disclosure=imageGenerationModelDisclosure($model);$mutable=preg_match('/-\d{4}-\d{2}-\d{2}$/D',$model)!==1;
    imageGenerationCheck($disclosure['model']===$model&&$disclosure['mutableAlias']===$mutable&&$disclosure['kind']===($mutable?'mutable_alias':'dated_id'),'disclosure distinguishes aliases from dated IDs '.$model);
    imageGenerationCheck(strpos($disclosure['disclosure'],'不是帳號可用模型清單')!==false,'disclosure never claims account availability '.$model);
}
foreach(array('gpt-image-1','gpt-image-1-mini','gpt-image-1.5','chatgpt-image-latest','dall-e-2','dall-e-3','gpt-4.1','gpt-image-2-latest','gpt-image-2-2026-04-22','GPT-IMAGE-2',' gpt-image-2','',null,0,false,array()) as $model){
    imageGenerationCheck(!imageGenerationModelSupported('openai',$model),'unknown, retired, conversational or non-string model is unsupported');
    imageGenerationReject(function()use($model){imageGenerationModelDisclosure($model);},'unsupported disclosure cannot invent a replacement','IMAGE_MODEL_UNSUPPORTED',409);
}
foreach(array('gpt-image-1','gpt-image-1-mini','gpt-image-1.5','chatgpt-image-latest','dall-e-2','dall-e-3','gpt-4.1','gpt-image-2-latest') as $model){
    imageGenerationReject(function()use($model){validateProjectImageBinding(imageGenerationBindingFixture($model));},'new binding excludes '.$model,'IMAGE_MODEL_UNSUPPORTED',409);
}
$binding=imageGenerationBindingFixture();$binding['provider']='ollama';
imageGenerationReject(function()use($binding){validateProjectImageBinding($binding);},'Ollama is not a hidden generation fallback','IMAGE_MODEL_UNSUPPORTED',409);
foreach(array('memberId','memberNickname','provider','model','ollamaUrl','boundAt') as $key){
    $binding=imageGenerationBindingFixture();unset($binding[$key]);
    imageGenerationReject(function()use($binding){validateProjectImageBinding($binding);},'missing exact binding field '.$key,'PROJECT_MODEL_INVALID',409);
}
$binding=imageGenerationBindingFixture();$binding['quality']='high';
imageGenerationReject(function()use($binding){validateProjectImageBinding($binding);},'extra binding field rejected by existing validator','PROJECT_MODEL_INVALID',409);
$binding=imageGenerationBindingFixture();unset($binding['model']);$binding['replacement']='gpt-image-2';
imageGenerationReject(function()use($binding){validateProjectImageBinding($binding);},'six fields with wrong key do not become a binding','PROJECT_MODEL_INVALID',409);
foreach(array('memberId'=>str_repeat('A',32),'boundAt'=>'not a date','memberNickname'=>'','model'=>'') as $key=>$bad){
    $binding=imageGenerationBindingFixture();$binding[$key]=$bad;
    imageGenerationReject(function()use($binding){validateProjectImageBinding($binding);},'existing binding validation retained '.$key);
}

$options=array('n'=>1,'size'=>'1024x1024','quality'=>'low','output_format'=>'png','background'=>'opaque','moderation'=>'auto','stream'=>false);
imageGenerationCheck(imageGenerationOptions()===$options,'exact one-image fixed low-quality PNG options');
$copy=imageGenerationOptions();$copy['quality']='high';$copy['n']=10;
imageGenerationCheck(imageGenerationOptions()===$options,'returned option copy cannot change subsequent policy');

$fixture=imageGenerationRequestFixture();$original=$fixture;
imageGenerationCheck(validateImageGenerationRequest($fixture)===$fixture&&$fixture===$original,'canonical request preserves literal artifact text and combined note without mutation');
foreach(array(array('generate',0),array('revise',1),array('fuse',2),array('fuse',3),array('fuse',4),array('fuse',5)) as $case){
    $request=imageGenerationRequestFixture($case[0],$case[1]);
    imageGenerationCheck(validateImageGenerationRequest($request)===$request,'valid mode and source count '.$case[0].' '.$case[1]);
}
$minimal=array('mode'=>'generate','title'=>'測試');$clean=validateImageGenerationRequest($minimal);
imageGenerationCheck($clean===array('mode'=>'generate','sourceVersionIds'=>array(),'references'=>array(),'instruction'=>'','title'=>'測試','alt'=>'','goalAndRationale'=>''),'generate optional fields normalize to explicit empty fields for application goal derivation');
foreach(array(''," \t\r\n",'　') as $blank){
    $request=$fixture;$request['goalAndRationale']=$blank;
    imageGenerationCheck(validateImageGenerationRequest($request)['goalAndRationale']==='','blank note is an explicit application derivation marker');
}
$request=$fixture;$request['instruction']=" \t保留文字\r\n ";
imageGenerationCheck(validateImageGenerationRequest($request)['instruction']==='保留文字','instruction uses existing userTextValue trimming');
foreach(array('palette','composition','style','general') as $role){
    $request=$fixture;$request['references']=array(array('role'=>$role,'referenceId'=>str_repeat('b',32)));
    imageGenerationCheck(validateImageGenerationRequest($request)['references']===array(array('referenceId'=>str_repeat('b',32),'role'=>$role)),'canonical exact reference role '.$role);
}
$request=$fixture;for($i=0;$i<5;$i++)$request['references'][]=array('referenceId'=>str_pad(dechex($i+10),32,'0',STR_PAD_LEFT),'role'=>'general');
imageGenerationCheck(count(validateImageGenerationRequest($request)['references'])===5,'five explicit reference selections are allowed');
$withTransport=array_merge($fixture,array('action'=>'generate_image','id'=>str_repeat('c',32),'itemId'=>str_repeat('d',32),'revision'=>1,'consent'=>true,'approvedModel'=>'not a selected model','n'=>9,'quality'=>'high','size'=>'auto','background'=>'transparent','output_format'=>'webp','moderation'=>'low','stream'=>true,'url'=>'https://example.invalid/image.png','bytes'=>'not pixels','key'=>'not credentials','model'=>'dall-e-3','aiBinding'=>imageGenerationBindingFixture()));
imageGenerationCheck(validateImageGenerationRequest($withTransport)===$fixture,'transport metadata, client options, pixels, model and credential fields never pass through');
imageGenerationCheck(imageGenerationOptions()===$options,'ignored client options cannot override the fixed one-image policy');

foreach(array(null,false,1,'generate',new stdClass()) as $bad)imageGenerationReject(function()use($bad){validateImageGenerationRequest($bad);},'invalid root type','IMAGE_GENERATION_INPUT');
foreach(array(null,false,1,'','edit','Generate',array()) as $bad){$request=$fixture;$request['mode']=$bad;imageGenerationReject(function()use($request){validateImageGenerationRequest($request);},'mode is explicit and exact','IMAGE_GENERATION_INPUT');}
foreach(array(array('generate',1),array('revise',0),array('revise',2),array('fuse',0),array('fuse',1),array('fuse',6)) as $case){$request=imageGenerationRequestFixture($case[0],$case[1]);imageGenerationReject(function()use($request){validateImageGenerationRequest($request);},'invalid mode source count '.$case[0].' '.$case[1],'IMAGE_GENERATION_INPUT');}
foreach(array(null,false,'',new stdClass(),array(1=>str_repeat('a',32)),array('id'=>str_repeat('a',32))) as $bad){$request=imageGenerationRequestFixture('revise',1);$request['sourceVersionIds']=$bad;imageGenerationReject(function()use($request){validateImageGenerationRequest($request);},'sources must be a dense array','IMAGE_GENERATION_INPUT');}
foreach(array(str_repeat('A',32),str_repeat('a',31),str_repeat('a',32)."\n",null,1,array()) as $bad){$request=imageGenerationRequestFixture('revise',1);$request['sourceVersionIds']=array($bad);imageGenerationReject(function()use($request){validateImageGenerationRequest($request);},'source ID must be exact lowercase 32 hex','INVALID_ID');}
$request=imageGenerationRequestFixture('fuse',2);$request['sourceVersionIds'][1]=$request['sourceVersionIds'][0];
imageGenerationReject(function()use($request){validateImageGenerationRequest($request);},'duplicate source versions rejected','IMAGE_GENERATION_INPUT');
foreach(array(null,false,'',new stdClass(),array(1=>array('referenceId'=>str_repeat('a',32),'role'=>'style'))) as $bad){$request=$fixture;$request['references']=$bad;imageGenerationReject(function()use($request){validateImageGenerationRequest($request);},'references must be a dense array','IMAGE_GENERATION_INPUT');}
$request=$fixture;for($i=0;$i<6;$i++)$request['references'][]=array('referenceId'=>str_pad(dechex($i+10),32,'0',STR_PAD_LEFT),'role'=>'general');
imageGenerationReject(function()use($request){validateImageGenerationRequest($request);},'six references rejected','IMAGE_GENERATION_INPUT');
foreach(array(null,array(),array('referenceId'=>str_repeat('a',32)),array('role'=>'style'),array('referenceId'=>str_repeat('a',32),'role'=>'style','url'=>'https://example.invalid'),array('id'=>str_repeat('a',32),'role'=>'style')) as $bad){$request=$fixture;$request['references']=array($bad);imageGenerationReject(function()use($request){validateImageGenerationRequest($request);},'reference exact object fields required','IMAGE_GENERATION_INPUT');}
foreach(array('Palette','pixel','',null,false,array()) as $bad){$request=$fixture;$request['references']=array(array('referenceId'=>str_repeat('a',32),'role'=>$bad));imageGenerationReject(function()use($request){validateImageGenerationRequest($request);},'reference role must be exact','IMAGE_GENERATION_INPUT');}
$request=$fixture;$request['references']=array(array('referenceId'=>str_repeat('a',32),'role'=>'style'),array('referenceId'=>str_repeat('a',32),'role'=>'palette'));
imageGenerationReject(function()use($request){validateImageGenerationRequest($request);},'duplicate reference ID rejected even with different role','IMAGE_GENERATION_INPUT');
$request=$fixture;$request['references']=array(array('referenceId'=>str_repeat('A',32),'role'=>'general'));
imageGenerationReject(function()use($request){validateImageGenerationRequest($request);},'reference ID uses strict saved ID format','INVALID_ID');

foreach(array('revise','fuse') as $mode){
    foreach(array(''," \t\n",'　') as $blank){$request=imageGenerationRequestFixture($mode,$mode==='revise'?1:2);$request['instruction']=$blank;imageGenerationReject(function()use($request){validateImageGenerationRequest($request);},'revision and fusion require explicit nonblank instruction');}
    $request=imageGenerationRequestFixture($mode,$mode==='revise'?1:2);unset($request['instruction']);imageGenerationReject(function()use($request){validateImageGenerationRequest($request);},'revision and fusion require instruction field');
}
foreach(array('instruction'=>4000,'title'=>600,'alt'=>3000,'goalAndRationale'=>12000) as $key=>$maximum){
    $request=$fixture;$request[$key]=str_repeat('x',$maximum);imageGenerationCheck(validateImageGenerationRequest($request)[$key]===$request[$key],$key.' exact byte boundary');
    $request[$key].='x';imageGenerationReject(function()use($request){validateImageGenerationRequest($request);},$key.' over byte boundary');
    $request=$fixture;$request[$key]=str_repeat('字',(int)floor($maximum/3));imageGenerationCheck(validateImageGenerationRequest($request)[$key]===$request[$key],$key.' UTF8 byte boundary');
    $request[$key].='字';imageGenerationReject(function()use($request){validateImageGenerationRequest($request);},$key.' over UTF8 byte boundary');
    foreach(array(null,false,1,array(),"\xff","x\0y") as $bad){$request=$fixture;$request[$key]=$bad;imageGenerationReject(function()use($request){validateImageGenerationRequest($request);},$key.' invalid text type or encoding');}
    $request=$fixture;$request[$key]='sk-'.str_repeat('x',20);imageGenerationReject(function()use($request){validateImageGenerationRequest($request);},$key.' existing secret guard','SECRET_IN_TEXT');
}
foreach(array(''," \t\n",'　') as $blank){$request=$fixture;$request['title']=$blank;imageGenerationReject(function()use($request){validateImageGenerationRequest($request);},'title cannot be blank','ARTIFACT_INVALID');}
$request=$fixture;unset($request['title']);imageGenerationReject(function()use($request){validateImageGenerationRequest($request);},'title must be provided','ARTIFACT_INVALID');
$request=$fixture;$request['goalAndRationale']=str_repeat(' ',12001);imageGenerationReject(function()use($request){validateImageGenerationRequest($request);},'blank note still enforces raw byte limit','INVALID_INPUT');
$request=$fixture;$request['goalAndRationale']=' '.str_repeat('x',11999).' ';imageGenerationReject(function()use($request){validateImageGenerationRequest($request);},'preserved note whitespace counts toward byte limit','INVALID_INPUT');
$request=imageGenerationRequestFixture('revise',1);$request['references']=array(array('referenceId'=>str_repeat('f',32),'role'=>'general'));
imageGenerationCheck(validateImageGenerationRequest($request)===$request,'syntactically valid IDs prove no ownership, existence, consent or pixel access');

foreach(array(
    '{"action":"generate_image"}',
    '{"action":"generate_image","sourceVersionIds":[],"references":[]}',
    '{"action":"generate_image","sourceVersionIds":["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],"references":[{"referenceId":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","role":"style"}]}',
    '{"action":"generate_image","references":[{"role":"palette","referenceId":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}]}',
    '{"action":"generate_image","sourceVersionIds":[null],"references":[{"referenceId":null,"role":null}]}'
) as $json){$raw=json_decode($json,false,32,JSON_THROW_ON_ERROR);$before=jsonEncode($raw);imageGenerationCheck(validateImageGenerationJsonShape($raw)===$raw&&jsonEncode($raw)===$before,'raw JSON guard accepts actual arrays and exact plain reference objects without mutation');}
foreach(array(
    '{"action":"generate_image","sourceVersionIds":{}}',
    '{"action":"generate_image","sourceVersionIds":{"0":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}',
    '{"action":"generate_image","sourceVersionIds":null}',
    '{"action":"generate_image","sourceVersionIds":""}',
    '{"action":"generate_image","sourceVersionIds":false}',
    '{"action":"generate_image","references":{}}',
    '{"action":"generate_image","references":{"0":{"referenceId":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","role":"style"}}}',
    '{"action":"generate_image","references":null}',
    '{"action":"generate_image","references":""}',
    '{"action":"generate_image","references":false}',
    '{"action":"generate_image","references":[[]]}',
    '{"action":"generate_image","references":[["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","style"]]}',
    '{"action":"generate_image","references":[{}]}',
    '{"action":"generate_image","references":[null]}',
    '{"action":"generate_image","references":["style"]}',
    '{"action":"generate_image","references":[{"referenceId":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}]}',
    '{"action":"generate_image","references":[{"id":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","role":"style"}]}',
    '{"action":"generate_image","references":[{"referenceId":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","role":"style","extra":true}]}'
) as $json){$raw=json_decode($json,false,32,JSON_THROW_ON_ERROR);imageGenerationReject(function()use($raw){validateImageGenerationJsonShape($raw);},'raw JSON object cannot masquerade as array and reference arrays cannot masquerade as objects','IMAGE_GENERATION_INPUT');}
foreach(array('{"action":"snapshot","references":{}}','{"references":{}}','[]','null') as $json){$raw=json_decode($json,false,32,JSON_THROW_ON_ERROR);imageGenerationCheck(validateImageGenerationJsonShape($raw)===$raw,'raw JSON guard leaves unrelated actions unchanged');}
imageGenerationReject(function(){validateImageGenerationJsonShape(array('action'=>'generate_image'));},'raw generation root must be plain stdClass not associative array','IMAGE_GENERATION_INPUT');
$raw=(object)array('action'=>'generate_image','references'=>array(new ArrayObject(array('referenceId'=>str_repeat('a',32),'role'=>'style'))));
imageGenerationReject(function()use($raw){validateImageGenerationJsonShape($raw);},'raw reference must be plain stdClass not another object class','IMAGE_GENERATION_INPUT');
$json='{"action":"generate_image","mode":"generate","title":"測試","sourceVersionIds":{},"references":{}}';
$associative=json_decode($json,true,32,JSON_THROW_ON_ERROR);
imageGenerationCheck(validateImageGenerationRequest($associative)['sourceVersionIds']===array(),'associative decoding alone loses empty object and array distinction');
imageGenerationReject(function()use($json){validateImageGenerationJsonShape(json_decode($json,false,32,JSON_THROW_ON_ERROR));},'raw guard rejects empty objects before canonical validator can mistake them for empty arrays','IMAGE_GENERATION_INPUT');
$json='{"action":"generate_image","mode":"generate","title":"測試","sourceVersionIds":[],"references":[{"referenceId":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","role":"style"}]}';
$raw=json_decode($json,false,32,JSON_THROW_ON_ERROR);validateImageGenerationJsonShape($raw);$canonical=validateImageGenerationRequest(json_decode($json,true,32,JSON_THROW_ON_ERROR));
imageGenerationCheck($canonical['references']===array(array('referenceId'=>str_repeat('b',32),'role'=>'style')),'raw shape guard and associative semantic validator compose without changing payload');

echo 'TOTAL '.$imageGenerationChecks." native image-generation policy fixtures passed. No IO or model calls.\n";
