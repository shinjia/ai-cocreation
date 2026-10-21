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
    'Content-Security-Policy'=>"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'");
}
function errorResponse($error) { return array('error'=>array('code'=>$error instanceof AppError?$error->errorCode:'INTERNAL_ERROR','message'=>$error instanceof AppError?$error->getMessage():'處理未完成。原有作品保留，請檢查伺服器環境或稍後手動重試。')); }
function userTextValue($value,$max,$name,$empty=false) {
    $text=textValue($value,$max,$name,$empty);
    ensure(!preg_match('/\bsk-[a-zA-Z0-9_-]{16,}\b/',$text),'SECRET_IN_TEXT','請勿在對話或作品欄位貼入 API Key；請只使用 API 設定中的密碼欄。');
    return $text;
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

// Worst-case stored growth before inference. JSON may escape each input byte into
// six bytes. Count EVERY reference snapshot copy, including the assistant message.
// Conservative headroom deliberately rejects near-full projects before spending.
function inferenceGrowthBudget($project,$action) {
    $references=strlen(jsonEncode($project['references']));$brief=strlen(jsonEncode($project['brief']));
    $context=strlen(jsonEncode(array('title'=>$project['title'],'description'=>$project['description'],'revision'=>$project['sharedContextRevision'])));
    if($action==='discuss'&&field($project,'officialVersionId')!==null)return 2*$references+$brief+$context+350000; // Revision + assistant, full bundle and instruction twice.
    if($action==='discuss')return $references+50000;
    if($action==='summarize')return $references+150000; // New brief is stored twice.
    if($action==='generate')return 6*$references+5*$brief+5*$context+1400000;
    if($action==='compare'){$goals=array();foreach(field($project,'versions',array()) as $v)$goals[]=strlen(jsonEncode(versionComparisonSnapshot($v)));rsort($goals,SORT_NUMERIC);return 2*$references+$brief+array_sum(array_slice($goals,0,5))+180000;} // Each selected historical goal is saved separately.
    throw new AppError('UNKNOWN_ACTION','未知的容量檢查操作。');
}
