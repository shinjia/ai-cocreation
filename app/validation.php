<?php
class AppError extends Exception {
    public $errorCode; public $status;
    public function __construct($code,$message,$status=400) { parent::__construct($message);$this->errorCode=$code;$this->status=$status; }
}
function ensure($ok,$code,$message,$status=400) { if(!$ok)throw new AppError($code,$message,$status); }
function jsonEncode($value) { return json_encode($value,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR); }
function randomToken() { return bin2hex(random_bytes(32)); }
function plain($value) { return is_object($value)&&get_class($value)==='stdClass'; }
function field($value,$key,$default=null) { return is_array($value)?(isset($value[$key])?$value[$key]:$default):(is_object($value)&&isset($value->$key)?$value->$key:$default); }
function textValue($value,$max,$name,$empty=false) {
    ensure(is_string($value)&&preg_match('//u',$value)&&strpos($value,"\0")===false,'INVALID_INPUT',$name.'必須是有效文字。');
    $value=trim($value);ensure(($empty||$value!=='')&&strlen($value)<=$max,'INVALID_INPUT',$name.'空白或過長。');return $value;
}
function modelName($value) { $value=userTextValue($value,120,'模型名稱');ensure(preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/D',$value),'INVALID_MODEL','模型名稱格式不正確。');return $value; }
function validId($value) { ensure(is_string($value)&&preg_match('/^[a-f0-9]{32}$/D',$value),'INVALID_ID','作品識別碼不正確。');return $value; }
function securityHeaders() {
    return array('Cache-Control'=>'no-store, max-age=0','Pragma'=>'no-cache','X-Content-Type-Options'=>'nosniff','X-Frame-Options'=>'DENY','Referrer-Policy'=>'no-referrer','Permissions-Policy'=>'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Content-Security-Policy'=>"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'");
}
function operationOutcome($error) {
    if(!($error instanceof AppError)||$error->errorCode==='REQUEST_ALREADY_ATTEMPTED')return 'unknown';
    // Rejected means no valid result was saved, NOT that a provider charged nothing.
    // Never classify transport errors, generic 5xx or a failed journal write as safe.
    $rejected=array('IMAGE_RESOURCE_LIMIT','PNG_RUNTIME_UNAVAILABLE','PNG_RESOURCE_LIMIT','PNG_PROCESSING_FAILED','MODEL_OUTPUT_INVALID','MODEL_NO_REVISION','MODEL_INCOMPLETE','MODEL_REFUSAL','MODEL_FAILED','MODEL_RESPONSE_TOO_LARGE','MODEL_QUESTION_COUNT','MODEL_CLARIFICATION_CLAIM','MODEL_CLARIFICATION_ITEMS','MODEL_CLARIFICATION_ARTIFACT','MODEL_MINDMAP_GENERATION','MODEL_MINDMAP_ACCEPTED_CHANGED','MODEL_MINDMAP_PENDING_CHANGED','MODEL_MINDMAP_PENDING_COUNT','MODEL_MINDMAP_FUSION_NODE','OPENAI_HTTP_ERROR','OLLAMA_HTTP_ERROR','OLLAMA_MODEL_ERROR');
    return $error->status<500||in_array($error->errorCode,$rejected,true)?'rejected':'unknown';
}
function errorResponse($error) { return array('error'=>array('code'=>$error instanceof AppError?$error->errorCode:'INTERNAL_ERROR','message'=>$error instanceof AppError?$error->getMessage():'處理未完成。請先檢查最新狀態，再檢查伺服器環境；不要直接重複提交。','operationOutcome'=>operationOutcome($error))); }
function userTextValue($value,$max,$name,$empty=false) {
    $text=textValue($value,$max,$name,$empty);
    ensure(!preg_match('/\bsk-[a-zA-Z0-9_-]{16,}\b/',$text),'SECRET_IN_TEXT','請勿在對話或作品欄位貼入 API Key；請只使用 API 設定中的密碼欄。');
    return $text;
}
function validateDialogueChoices($choices,$question) {
    ensure(is_array($choices)&&($choices===array()||array_keys($choices)===range(0,count($choices)-1)),'CHOICES_INVALID','回答選項必須是清單。');
    ensure(count($choices)===0||(count($choices)>=2&&count($choices)<=6),'CHOICES_INVALID','選擇題需提供2至6個單選答案；一般討論可不提供選項。');
    ensure($choices===array()||(is_string($question)&&trim($question)!==''),'CHOICES_INVALID','回答選項必須對應明確問題。');
    $out=array();$ids=array();$values=array();
    foreach($choices as $choice){
        ensure(is_array($choice)&&count($choice)===3,'CHOICES_INVALID','回答選項需有 id、label 和 value。');$id=field($choice,'id');
        ensure(is_string($id)&&preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/D',$id),'CHOICES_INVALID','回答選項識別碼格式不正確。');userTextValue($id,64,'回答選項識別碼');
        $label=userTextValue(field($choice,'label'),120,'回答選項名稱');$value=userTextValue(field($choice,'value'),1000,'回答選項內容');
        ensure(!in_array($id,$ids,true)&&!in_array($value,$values,true),'CHOICES_INVALID','回答選項識別碼與答案不可重複。');
        $ids[]=$id;$values[]=$value;$out[]=array('id'=>$id,'label'=>$label,'value'=>$value);
    }
    return $out;
}
function validateBrief($value) {
    ensure(is_array($value)&&count($value)===7,'MODEL_OUTPUT_INVALID','創作目標欄位不正確。',502);$out=array();
    foreach(array('purpose','audience','message','tone','constraints','summary') as $key)$out[$key]=textValue(field($value,$key),$key==='summary'?3000:1200,'創作目標');
    $out['items']=validateItemDefinitions(field($value,'items'));return $out;
}
function nowIso() { return gmdate('c'); }
function newId() { return bin2hex(random_bytes(16)); }
function providerName($value) { ensure(in_array($value,array('openai','ollama'),true),'INVALID_PROVIDER','請選擇 OpenAI API 或 Ollama。');return $value; }
function ollamaModelName($value) { $value=userTextValue($value,160,'Ollama 模型名稱');ensure(preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_.:\/-]{0,159}$/D',$value)&&strpos($value,'..')===false,'INVALID_MODEL','Ollama 模型名稱格式不正確。');return $value; }
function validateOllamaUrl($value) {
    ensure(is_string($value)&&strlen($value)<=200,'OLLAMA_URL','Ollama 網址格式不正確。');$url=parse_url(trim($value));
    ensure(is_array($url)&&isset($url['scheme'],$url['host'],$url['port'])&&$url['scheme']==='http'&&in_array(strtolower($url['host']),array('localhost','127.0.0.1','[::1]'),true)&&$url['port']>=1024&&$url['port']<=65535&&!isset($url['user'],$url['pass'])&&!isset($url['query'])&&!isset($url['fragment'])&&(!isset($url['path'])||$url['path']==='/'||$url['path']===''),'OLLAMA_URL','只接受同一台 PHP 主機的 http://127.0.0.1:11434、localhost 或 [::1]，埠號1024–65535；不可含帳密、子路徑、查詢或遠端主機。');
    // Also reject either credential component independently (isset(a,b) requires both).
    ensure(!isset($url['user'])&&!isset($url['pass']),'OLLAMA_URL','Ollama 網址不得含帳號或密碼。');
    return 'http://'.strtolower($url['host']).':'.$url['port'];
}
function validateConnection($value) {
    $provider=providerName(field($value,'provider'));$model=$provider==='openai'?modelName(field($value,'model')):ollamaModelName(field($value,'model'));
    return array('provider'=>$provider,'model'=>$model,'ollamaUrl'=>validateOllamaUrl(field($value,'ollamaUrl','http://127.0.0.1:11434')));
}
function validateProjectAiBinding($value) {
    ensure(is_array($value)&&count($value)===6,'PROJECT_MODEL_INVALID','專案模型紀錄不完整；沒有自行選用其他模型。',409);
    foreach(array('memberId','memberNickname','provider','model','ollamaUrl','boundAt') as $key)ensure(array_key_exists($key,$value),'PROJECT_MODEL_INVALID','專案模型紀錄缺少必要欄位。',409);
    $id=validId($value['memberId']);$name=userTextValue($value['memberNickname'],120,'專案 AI 稱呼');
    $at=textValue($value['boundAt'],80,'模型選定時間');ensure(strtotime($at)!==false,'PROJECT_MODEL_INVALID','專案模型選定時間無法驗證。',409);
    return array_merge(array('memberId'=>$id,'memberNickname'=>$name),validateConnection($value),array('boundAt'=>$at));
}
function validateItemDefinitions($items) {
    ensure(is_array($items)&&count($items)>=1&&count($items)<=12,'ITEMS_INVALID','每組需1至12個內容項目。');$out=array();$ids=array();$labels=array();
    foreach($items as $item) {
        ensure(is_array($item)&&count($item)===2,'ITEMS_INVALID','項目定義欄位不正確。');$id=field($item,'id');ensure(is_string($id)&&preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/D',$id),'ITEMS_INVALID','項目識別碼不正確。');
        $label=userTextValue(field($item,'label'),120,'項目名稱');ensure(!in_array($id,$ids,true)&&!in_array($label,$labels,true),'ITEMS_INVALID','項目識別碼與名稱不可重複。');$ids[]=$id;$labels[]=$label;$out[]=array('id'=>$id,'label'=>$label);
    }return $out;
}
function validateContentItems($items,$definitions=null) {
    ensure(is_array($items)&&count($items)>=1&&count($items)<=12,'ITEMS_INVALID','每組需保存1至12個有名稱和內容的項目。');$defs=array();$out=array();$bytes=0;
    foreach($items as $item){ensure(is_array($item)&&count($item)===3,'ITEMS_INVALID','每個項目需要 id、label、content。');$defs[]=array('id'=>field($item,'id'),'label'=>field($item,'label'));$text=userTextValue(field($item,'content'),6000,'項目內容');$bytes+=strlen($text);$out[]=array('id'=>field($item,'id'),'label'=>field($item,'label'),'content'=>$text);}
    $defs=validateItemDefinitions($defs);ensure($bytes<=24000,'ITEMS_INVALID','這組內容過長，請縮短後再保存。');
    foreach($out as $i=>&$row)$row['label']=$defs[$i]['label'];unset($row);
    if($definitions!==null){
        ensure(count($defs)===count($definitions),'MODEL_OUTPUT_INVALID','AI 項目數與已確認目標不符，未保存。',502);$map=array();foreach($definitions as $def)$map[$def['id']]=$def['label'];
        foreach($defs as $def)ensure(isset($map[$def['id']])&&$map[$def['id']]===$def['label'],'MODEL_OUTPUT_INVALID','AI 加入未確認或變更名稱的項目，未保存；請先在對話確認新項目。',502);
        $ordered=array();foreach($definitions as $def)foreach($out as $row)if($row['id']===$def['id'])$ordered[]=$row;return $ordered;
    }return $out;
}
function bundleDisplayTitle($items) { $chars=preg_split('//u',$items[0]['content'],-1,PREG_SPLIT_NO_EMPTY);return implode('',array_slice($chars,0,60)).(count($chars)>60?'…':''); }

// Adopted artwork names update only the creative item label, never the project.
// Prefer an explicit main/Chinese title, then a generic title, then first content.
function officialItemTitle($items) {
    $preferred=array('中文名稱','中文標題','中文名','主標題','主要名稱','正式名稱');$generic=array('名稱','標題','title','name');$chosen=null;
    foreach(array($preferred,$generic) as $labels){foreach($items as $item){$label=strtolower(preg_replace('/\s+/u','',trim($item['label'])));if(in_array($label,$labels,true)){$chosen=$item['content'];break;}}if($chosen!==null)break;}
    if($chosen===null)$chosen=$items[0]['content'];$chosen=trim(preg_replace('/\s+/u',' ',$chosen));
    $chars=preg_split('//u',$chosen,-1,PREG_SPLIT_NO_EMPTY);return implode('',array_slice($chars,0,59)).(count($chars)>59?'…':'');
}

// Worst-case stored growth before inference. JSON may escape each input byte into
// six bytes. Count EVERY reference snapshot copy, including the assistant message.
// Conservative headroom deliberately rejects near-full projects before spending.
function inferenceGrowthBudget($project,$action,$input=array()) {
    $references=strlen(jsonEncode($project['references']));$brief=strlen(jsonEncode($project['brief']));
    $context=strlen(jsonEncode(array('title'=>$project['title'],'description'=>$project['description'],'revision'=>$project['sharedContextRevision'])));
    $type=field($project,'module','titles');$long=$type==='article';$hasSource=field($input,'baseVersionId')!==null||field($project,'officialVersionId')!==null;
    if($type==='illustrated'||$type==='poster'){
        $selected=in_array($action,array('compare','fuse'),true)?field($input,'versionIds',array()):($action==='discuss'?array(field($input,'baseVersionId',field($project,'officialVersionId'))):array());
        $pool=array();foreach($project['references'] as $ref)$pool[$ref['id']]=$ref;
        if(is_array($selected))foreach($project['versions'] as $version)if(in_array($version['id'],$selected,true))foreach(field($version,'referencesSnapshot',array()) as $ref)if(!isset($pool[$ref['id']]))$pool[$ref['id']]=$ref;
        $references=strlen(jsonEncode(array_values($pool))); // Include selected historical pins before any paid call.
    }
    if($action==='fuse'){
        $selected=field($input,'versionIds',array());$sourceBytes=0;
        if(is_array($selected))foreach($project['versions'] as $version)if(in_array($version['id'],$selected,true))$sourceBytes+=strlen(jsonEncode($version));
        return 2*$references+$brief+$context+$sourceBytes+($long?1200000:600000);
    }
    if($action==='confirm_generate')$action='generate';
    if(artifactType($type)&&($action==='generate'||($action==='discuss'&&$hasSource)))return 2*$references+$brief+$context+650000;
    if($long&&$action==='discuss'&&$hasSource)return 2*$references+$brief+$context+1200000;
    if($long&&$action==='generate')return 2*$references+$brief+$context+1300000;
    if($type==='short_text'&&$action==='generate')return 4*$references+3*$brief+3*$context+1000000;
    if($action==='discuss'&&$hasSource)return 2*$references+$brief+$context+450000; // Revision + assistant, full bundle and instruction twice.
    if($long&&$action==='discuss')return $references+600000;
    if($action==='discuss')return $references+350000; // Question options, resolved answer and context binding can be escaped too.
    if($action==='summarize')return $references+400000; // New brief is stored twice.
    if($action==='generate')return 6*$references+5*$brief+5*$context+1700000;
    if($action==='compare'){$goals=array();foreach(field($project,'versions',array()) as $v)$goals[]=strlen(jsonEncode(versionComparisonSnapshot($v)));rsort($goals,SORT_NUMERIC);return 2*$references+$brief+array_sum(array_slice($goals,0,5))+180000;} // Each selected historical goal is saved separately.
    throw new AppError('UNKNOWN_ACTION','未知的容量檢查操作。');
}

// Webpage generation is gated by three explicit user confirmations bound to the
// current summary. The approval is saved in the existing immutable dialogue;
// checkbox changes alone never infer, save artwork, or contact a provider.
function webpageDirectionConfirmation($project,$input) {
    $type=field($project,'module');if($type!=='webpage'&&$type!=='poster')return null;
    $parts=field($input,'confirmedDirections');$summaryRevision=field($input,'directionRevision');$poster=$type==='poster';
    $expected=$poster?array('style','text','layout'):array('style','content','functions');
    ensure(is_array($parts)&&$parts===$expected&&is_int($summaryRevision)&&$summaryRevision===field($project,'summaryRevision'),'DIRECTION_CONFIRMATION_REQUIRED',$poster?'請分別確認目前海報的視覺風格、完整文字內容與圖文排列；方向更新後需重新確認。':'請分別確認目前網頁的視覺風格、內容結構與操作功能；方向更新後需重新確認。',409);
    ensure(is_array(field($project,'brief')),'SUMMARY_REQUIRED','請先整理目前創作方向。',409);
    return $poster?array('summaryRevision'=>$summaryRevision,'style'=>$project['brief']['tone'],'text'=>$project['brief']['message'],'layout'=>$project['brief']['constraints']):array('summaryRevision'=>$summaryRevision,'style'=>$project['brief']['tone'],'content'=>$project['brief']['message'],'functions'=>$project['brief']['constraints']);
}
