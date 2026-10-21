<?php
// Pure in-memory boundary. Ownership and full PNG normalization are performed
// by the caller before these bytes reach a model. Never resolve URLs or paths.
function prepareModelImageInputs($images) {
    ensure(is_array($images)&&($images===array()||array_keys($images)===range(0,count($images)-1))&&count($images)<=5,'IMAGE_INPUT_INVALID','圖片輸入必須是最多5張的有序清單。',409);
    $out=array();$total=0;
    foreach($images as $image){
        ensure(is_array($image)&&count($image)===4,'IMAGE_INPUT_INVALID','圖片輸入欄位不正確。',409);
        foreach(array('label','bytes','sha256','assetId') as $key)ensure(array_key_exists($key,$image),'IMAGE_INPUT_INVALID','圖片輸入缺少必要欄位。',409);
        $label=$image['label'];$bytes=$image['bytes'];$sha=$image['sha256'];$assetId=$image['assetId'];
        ensure(is_string($label)&&preg_match('//u',$label)&&trim($label)!==''&&strlen($label)<=1000&&strpos($label,"\0")===false,'IMAGE_INPUT_INVALID','圖片標籤必須是安全上限內的有效文字。',409);
        ensure(is_string($bytes)&&strlen($bytes)>=57&&strlen($bytes)<=4194304,'IMAGE_INPUT_INVALID','單張圖片必須是4 MiB以內的PNG位元組。',409);
        // Envelope check is not a substitute for normalizeUploadedPng().
        ensure(substr($bytes,0,8)==="\x89PNG\r\n\x1a\n"&&substr($bytes,8,8)==="\x00\x00\x00\x0dIHDR"&&substr($bytes,-12)==="\x00\x00\x00\x00IEND\xae\x42\x60\x82",'IMAGE_INPUT_INVALID','圖片不是已正規化的PNG資料。',409);
        ensure(is_string($sha)&&preg_match('/^[a-f0-9]{64}$/D',$sha)&&hash_equals($sha,hash('sha256',$bytes)),'IMAGE_INPUT_INVALID','圖片完整性驗證失敗，尚未傳送。',409);
        ensure(is_string($assetId)&&preg_match('/^[a-f0-9]{32}$/D',$assetId),'IMAGE_INPUT_INVALID','圖片識別碼格式不正確。',409);
        $total+=strlen($bytes);ensure($total<=12582912,'IMAGE_INPUT_LIMIT','本次圖片合計不得超過12 MiB，尚未傳送。',409);
        $out[]=array('label'=>$label,'bytes'=>$bytes,'sha256'=>$sha,'assetId'=>$assetId);
    }
    if($total>0){
        // Reserve raw/base64/JSON/cURL copies plus slack before either provider
        // encodes a byte. Never raise memory_limit or guess missing headroom.
        ensure(function_exists('pngUploadEnsureMemory'),'IMAGE_RESOURCE_LIMIT','伺服器缺少安全圖片記憶體檢查，尚未編碼或傳送圖片。請確認圖片處理元件已載入，不要關閉記憶體限制。',503);
        try{pngUploadEnsureMemory(8*$total+16777216);}
        catch(AppError $error){throw new AppError('IMAGE_RESOURCE_LIMIT','伺服器目前沒有足夠或可確認的安全記憶體編碼與傳送圖片；請縮小圖片或減少本次選取張數後再試，不要關閉記憶體限制。',503);}
    }
    return $out;
}
function modelImageLastUserIndex($messages) {
    ensure(is_array($messages)&&count($messages)>0&&array_keys($messages)===range(0,count($messages)-1),'IMAGE_INPUT_INVALID','圖片必須附在有效的使用者訊息。',409);
    for($index=count($messages)-1;$index>=0;$index--)if(is_array($messages[$index])&&field($messages[$index],'role')==='user')return $index;
    throw new AppError('IMAGE_INPUT_INVALID','找不到可附上圖片的使用者訊息。',409);
}
function openAIImageMessages($messages,$images) {
    $images=prepareModelImageInputs($images);if($images===array())return $messages;
    $index=modelImageLastUserIndex($messages);$content=field($messages[$index],'content');
    if(is_string($content))$content=array(array('type'=>'input_text','text'=>$content));
    ensure(is_array($content)&&count($content)>0&&array_keys($content)===range(0,count($content)-1),'IMAGE_INPUT_INVALID','圖片訊息缺少原始文字。',409);
    foreach($content as $part)ensure(is_array($part)&&count($part)===2&&field($part,'type')==='input_text'&&is_string(field($part,'text')),'IMAGE_INPUT_INVALID','圖片必須透過經驗證的位元組輸入，不接受網址或既有圖片欄位。',409);
    foreach($images as $image){
        $content[]=array('type'=>'input_text','text'=>$image['label']);
        $content[]=array('type'=>'input_image','image_url'=>'data:image/png;base64,'.base64_encode($image['bytes']));
    }
    $messages[$index]['content']=$content;return $messages;
}
function ollamaImageMessages($messages,$images) {
    $images=prepareModelImageInputs($images);if($images===array())return $messages;
    $index=modelImageLastUserIndex($messages);$content=field($messages[$index],'content');
    ensure(is_string($content)&&!array_key_exists('images',$messages[$index]),'IMAGE_INPUT_INVALID','圖片必須附在原始使用者文字，不能夾帶未驗證的圖片。',409);
    $labels=array();$encoded=array();
    foreach($images as $position=>$image){$labels[]=($position+1).'. '.$image['label'];$encoded[]=base64_encode($image['bytes']);}
    $messages[$index]['content']=$content."\n\n本次圖片依序對應：\n".implode("\n",$labels);
    $messages[$index]['images']=$encoded;return $messages;
}
class OpenAIAdapter
{
    private $keyProvider;
    private $actualModel=null;
    private $timeout;
    private $transport;
    public function __construct($keyProvider,$timeout=120000,$testTransport=null)
    {
        $this->keyProvider=$keyProvider;$this->timeout=$timeout;$this->transport=$testTransport;
    }
    public function request($payload)
    {
        // Fixtures are constructor-only; no HTTP setting can override the destination.
        $url='https://api.openai.com/v1/responses';
        if($this->transport!==null)return call_user_func($this->transport,$url,$payload);
        $key=validateApiKey(call_user_func($this->keyProvider));
        ensure(extension_loaded('curl'),'CURL_REQUIRED','伺服器需要啟用 PHP cURL。',503);
        $curl=curl_init($url);$body='';$tooLarge=false;
        curl_setopt_array($curl,array(CURLOPT_FOLLOWLOCATION=>false,CURLOPT_MAXREDIRS=>0,CURLOPT_PROXY=>'',CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,CURLOPT_CONNECTTIMEOUT_MS=>10000,CURLOPT_TIMEOUT_MS=>$this->timeout,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_POST=>true,CURLOPT_HTTPHEADER=>array('Accept: application/json','Content-Type: application/json','Authorization: Bearer '.$key),CURLOPT_POSTFIELDS=>jsonEncode($payload),CURLOPT_WRITEFUNCTION=>function($handle,$chunk)use(&$body,&$tooLarge){if(strlen($body)+strlen($chunk)>2000000){$tooLarge=true;return 0;}$body.=$chunk;return strlen($chunk);}));
        unset($key);
        $ok=curl_exec($curl);$code=curl_errno($curl);$status=(int)curl_getinfo($curl,CURLINFO_HTTP_CODE);curl_close($curl);
        ensure(!$tooLarge,'MODEL_RESPONSE_TOO_LARGE','OpenAI 回應過大，已停止。',502);
        if($ok===false)throw new AppError($code===CURLE_OPERATION_TIMEDOUT?'MODEL_TIMEOUT':'MODEL_UNAVAILABLE',$code===CURLE_OPERATION_TIMEDOUT?'OpenAI 回應逾時，無法確認是否已處理或計費。沒有自動重試；請先保留原文。':'無法安全連線 OpenAI。請檢查 PHP cURL、CA 憑證與網路；不要關閉憑證驗證。',502);
        if($status<200||$status>=300){
            $hints=array(400=>'模型、圖片輸入或結構化輸出參數不相容，請核對選定模型是否支援本次輸入。',401=>'API Key 無效或已失效，請清除後重新貼入。',403=>'此 API Key 或專案沒有使用權限。',404=>'找不到指定模型或此專案無權使用。',429=>'達到速率或帳戶額度限制，請查看 OpenAI 專案用量／帳務。');
            throw new AppError('OPENAI_HTTP_ERROR','OpenAI HTTP '.$status.'：'.(isset($hints[$status])?$hints[$status]:'上游服務未完成請求，請稍後由你決定是否重試。').' 未顯示上游原始回應，以免洩漏金鑰或使用者文字。',502);
        }
        try{return json_decode($body,false,128,JSON_THROW_ON_ERROR);}catch(JsonException $e){throw new AppError('MODEL_OUTPUT_INVALID','OpenAI 回應不是有效 JSON。',502);}
    }
    public function generate($model,$messages,$schema,$maxOutputTokens=6000,$images=array())
    {
        ensure(is_int($maxOutputTokens)&&$maxOutputTokens>=6000&&$maxOutputTokens<=24000,'MODEL_OUTPUT_BUDGET','輸出長度設定超出允許範圍。');
        modelName($model);$this->actualModel=null;$messages=openAIImageMessages($messages,$images);
        $payload=array('model'=>$model,'input'=>$messages,'store'=>false,'stream'=>false,'max_output_tokens'=>$maxOutputTokens,'text'=>array('format'=>array('type'=>'json_schema','name'=>'title_cocreation_result','strict'=>true,'schema'=>$schema)));
        $result=$this->request($payload);
        ensure(plain($result),'MODEL_OUTPUT_INVALID','OpenAI 回應格式不正確。',502);
        if(field($result,'status')==='incomplete')throw new AppError('MODEL_INCOMPLETE','OpenAI 輸出未完成（可能達到輸出上限或內容限制），沒有儲存為有效回饋，也不會自動重試。',502);
        ensure(field($result,'status')==='completed'&&!field($result,'error'),'MODEL_FAILED','OpenAI 未完成此次生成，請保留內容後再決定是否重試。',502);
        $actual=field($result,'model');if(is_string($actual)&&preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_.:\/-]{0,159}$/D',$actual))$this->actualModel=$actual;
        $output=field($result,'output');ensure(is_array($output),'MODEL_OUTPUT_INVALID','OpenAI 回應缺少輸出內容。',502);
        $text='';
        foreach($output as $item){
            if(field($item,'type')!=='message')continue;
            $content=field($item,'content');if(!is_array($content))continue;
            foreach($content as $part){
                if(field($part,'type')==='refusal')throw new AppError('MODEL_REFUSAL','OpenAI 拒絕此次內容要求。請調整題目或文字，不會以假回饋替代。',502);
                if(field($part,'type')==='output_text'&&is_string(field($part,'text')))$text.=field($part,'text');
            }
        }
        ensure($text!=='','MODEL_OUTPUT_INVALID','OpenAI 未提供文字結果。',502);
        try{return json_decode($text,false,128,JSON_THROW_ON_ERROR);}catch(JsonException $e){throw new AppError('MODEL_OUTPUT_INVALID','OpenAI 文字未符合 JSON 格式，未保存為有效回饋。',502);}
    }
    public function actualModel() { return $this->actualModel; }
    private function metadata($url,$limit) {
        // Constructor-injected metadata fixtures never retrieve a real credential.
        if($this->transport!==null)return call_user_func($this->transport,$url,null);
        $key=validateApiKey(call_user_func($this->keyProvider));ensure(extension_loaded('curl'),'CURL_REQUIRED','請啟用 PHP cURL。',503);
        $curl=curl_init($url);$body='';$large=false;
        curl_setopt_array($curl,array(CURLOPT_HTTPGET=>true,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_MAXREDIRS=>0,CURLOPT_PROXY=>'',CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,CURLOPT_CONNECTTIMEOUT_MS=>5000,CURLOPT_TIMEOUT_MS=>15000,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_HTTPHEADER=>array('Accept: application/json','Authorization: Bearer '.$key),CURLOPT_WRITEFUNCTION=>function($handle,$chunk)use(&$body,&$large,$limit){if(strlen($body)+strlen($chunk)>$limit){$large=true;return 0;}$body.=$chunk;return strlen($chunk);}));
        unset($key);$ok=curl_exec($curl);$code=curl_errno($curl);$status=(int)curl_getinfo($curl,CURLINFO_HTTP_CODE);curl_close($curl);
        ensure(!$large,'MODEL_RESPONSE_TOO_LARGE','OpenAI 模型資訊回應過大。',502);
        if($ok===false)throw new AppError('OPENAI_CONNECTION','OpenAI 模型資訊讀取未完成（cURL '.$code.'）。請檢查網路與 CA 憑證；勿關閉 TLS 驗證。',502);
        $hints=array(401=>'金鑰無效或已過期。',403=>'金鑰沒有模型資訊讀取權限；這不一定表示無法生成，請查看專案金鑰權限。',404=>'此模型不存在或目前專案無權存取。',429=>'服務正在限制請求，請稍後手動再查。');
        if($status<200||$status>=300)throw new AppError('OPENAI_HTTP_ERROR','OpenAI HTTP '.$status.'：'.(isset($hints[$status])?$hints[$status]:'服務無法完成模型資訊讀取。').' 未顯示上游原始回應。',502);
        try{return json_decode($body,false,32,JSON_THROW_ON_ERROR);}catch(Throwable $e){throw new AppError('MODEL_OUTPUT_INVALID','OpenAI 模型資訊格式不正確。',502);}
    }
    public function listModels() {
        // Explicit metadata-only GET. No Responses request, inference or auto-fetch.
        $data=$this->metadata('https://api.openai.com/v1/models',2000000);$entries=field($data,'data');
        ensure((plain($data)||is_array($data))&&is_array($entries)&&count($entries)<=1000&&($entries===array()||array_keys($entries)===range(0,count($entries)-1)),'MODEL_CATALOG_INVALID','OpenAI 未提供有效且在安全上限內的模型清單。',502);
        $names=array();
        foreach($entries as $entry){
            try{$name=modelName(field($entry,'id'));ensure($name===field($entry,'id'),'MODEL_CATALOG_INVALID','模型名稱不可含多餘空白。',502);}catch(AppError $error){throw new AppError('MODEL_CATALOG_INVALID','OpenAI 模型清單包含無法使用的模型名稱。',502);}
            $names[]=$name;
        }
        $names=array_values(array_unique($names));sort($names,SORT_STRING);
        return array('models'=>$names,'fetchedAt'=>nowIso(),'provider'=>'openai','message'=>'已讀取此金鑰可見的模型清單，沒有執行生成。清單存取成功不代表每個模型都支援 Responses 或結構化輸出，仍須在實際使用時確認。');
    }
    public function checkConnection($model) {
        modelName($model);$data=$this->metadata('https://api.openai.com/v1/models/'.rawurlencode($model),100000);
        ensure((plain($data)||is_array($data))&&is_string(field($data,'id')),'MODEL_OUTPUT_INVALID','OpenAI 未提供有效模型資訊。',502);
        return array('ok'=>true,'message'=>'金鑰與模型資訊存取正常。只讀取模型資料，沒有生成內容或推論費用；Responses／結構化輸出仍需由你實際操作確認。');
    }
}
