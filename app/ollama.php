<?php
class OllamaAdapter {
    private $base; private $timeout; private $transport; private $actualModel=null;
    public function __construct($url,$timeout=120000,$testTransport=null) { $this->base=validateOllamaUrl($url);$this->timeout=$timeout;$this->transport=$testTransport; }
    public function request($path,$payload=null) {
        ensure(in_array($path,array('/api/chat','/api/tags'),true),'OLLAMA_PATH','不支援此 Ollama 操作。');
        $url=$this->base.$path;if($this->transport!==null)return call_user_func($this->transport,$url,$payload);
        ensure(extension_loaded('curl'),'CURL_REQUIRED','請在 PHP 啟用 cURL。',503);$curl=curl_init($url);$body='';$tooLarge=false;
        $options=array(CURLOPT_FOLLOWLOCATION=>false,CURLOPT_MAXREDIRS=>0,CURLOPT_PROXY=>'',CURLOPT_PROTOCOLS=>CURLPROTO_HTTP,CURLOPT_CONNECTTIMEOUT_MS=>5000,CURLOPT_TIMEOUT_MS=>$payload===null?10000:$this->timeout,CURLOPT_HTTPHEADER=>array('Accept: application/json','Content-Type: application/json'),CURLOPT_WRITEFUNCTION=>function($handle,$chunk)use(&$body,&$tooLarge){if(strlen($body)+strlen($chunk)>2000000){$tooLarge=true;return 0;}$body.=$chunk;return strlen($chunk);});
        // Pin localhost to loopback instead of trusting DNS or system proxy settings.
        if(parse_url($this->base,PHP_URL_HOST)==='localhost')$options[CURLOPT_RESOLVE]=array('localhost:'.parse_url($this->base,PHP_URL_PORT).':127.0.0.1');
        if($payload!==null){$options[CURLOPT_POST]=true;$options[CURLOPT_POSTFIELDS]=jsonEncode($payload);}
        curl_setopt_array($curl,$options);$ok=curl_exec($curl);$code=curl_errno($curl);$status=(int)curl_getinfo($curl,CURLINFO_HTTP_CODE);curl_close($curl);
        ensure(!$tooLarge,'MODEL_RESPONSE_TOO_LARGE','Ollama 回應超過安全上限，已停止。',502);
        if($ok===false){$messages=array(CURLE_COULDNT_CONNECT=>'無法連到本機 Ollama。請確認 Ollama 已啟動，且服務埠號正確。',CURLE_OPERATION_TIMEDOUT=>'Ollama 回應逾時。模型可能正在載入或主機記憶體不足；沒有自動重試。');throw new AppError('OLLAMA_CONNECTION',isset($messages[$code])?$messages[$code]:'Ollama 連線未完成（cURL '.$code.'）；請檢查本機服務設定。',502);}
        if($status<200||$status>=300){$hints=array(400=>'模型或格式參數不相容。請更新 Ollama 並確認模型支援結構化輸出。',404=>'找不到 API 路徑或指定模型。請先用連線檢查核對已安裝的模型名稱。',500=>'Ollama 無法載入或執行模型；請查看 Ollama 程式中的記憶體／模型錯誤。',503=>'本機模型服務忙碌或尚未就緒。');throw new AppError('OLLAMA_HTTP_ERROR','Ollama HTTP '.$status.'：'.(isset($hints[$status])?$hints[$status]:'服務未完成要求。').' 未回傳原始內容，避免洩漏使用者資料。',502);}
        try{$data=json_decode($body,false,128,JSON_THROW_ON_ERROR);}catch(Throwable $e){throw new AppError('MODEL_OUTPUT_INVALID','Ollama 回應不是有效 JSON。請確認埠號上的服務確實是 Ollama。',502);}
        ensure(plain($data),'MODEL_OUTPUT_INVALID','Ollama 回應格式不正確。',502);ensure(!field($data,'error'),'OLLAMA_MODEL_ERROR','Ollama 回報模型錯誤。請確認模型已安裝、可載入且支援結構化輸出。',502);return $data;
    }
    public function generate($model,$messages,$schema) {
        ollamaModelName($model);$this->actualModel=null;
        $messages[0]['content'].=' 回傳單一有效 JSON 物件，符合此 JSON Schema：'.jsonEncode($schema);
        $payload=array('model'=>$model,'messages'=>$messages,'format'=>$schema,'stream'=>false,'options'=>array('temperature'=>0.6,'num_predict'=>6000));
        $result=$this->request('/api/chat',$payload);
        ensure(plain($result)&&field($result,'done')===true,'MODEL_INCOMPLETE','Ollama 尚未完成回覆；未保存不完整內容，也不自動重試。',502);
        ensure(field($result,'done_reason')!=='length','MODEL_INCOMPLETE','Ollama 輸出達上限，沒有保存截斷內容。',502);
        $actual=field($result,'model');if(is_string($actual)&&preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_.:\/-]{0,159}$/D',$actual))$this->actualModel=$actual;
        $message=field($result,'message');$text=field($message,'content');ensure(is_string($text)&&$text!==''&&strlen($text)<=100000,'MODEL_OUTPUT_INVALID','Ollama 沒有有效的文字回覆。',502);
        try{$value=json_decode($text,false,64,JSON_THROW_ON_ERROR);}catch(Throwable $e){throw new AppError('MODEL_OUTPUT_INVALID','Ollama 未遵守 JSON 結構；未用固定文字替代，請嘗試更適合的模型。',502);}
        ensure(plain($value),'MODEL_OUTPUT_INVALID','Ollama 輸出必須為 JSON 物件。',502);return $value;
    }
    public function actualModel() { return $this->actualModel; }
    private function installedModelNames($data) {
        $entries=field($data,'models');
        ensure((plain($data)||is_array($data))&&is_array($entries)&&count($entries)<=1000&&($entries===array()||array_keys($entries)===range(0,count($entries)-1)),'OLLAMA_TAGS_INVALID','服務有回應，但不是安全上限內的 Ollama 模型清單。',502);
        $names=array();
        foreach($entries as $entry){
            try{$name=ollamaModelName(field($entry,'name'));ensure($name===field($entry,'name'),'OLLAMA_TAGS_INVALID','模型名稱不可含多餘空白。',502);}catch(AppError $error){throw new AppError('OLLAMA_TAGS_INVALID','Ollama 模型清單包含無法使用的模型名稱。',502);}
            $names[]=$name;
        }
        $names=array_values(array_unique($names));sort($names,SORT_STRING);return $names;
    }
    public function listModels() {
        // GET /api/tags only: never start chat, download, pull or infer a model.
        $names=$this->installedModelNames($this->request('/api/tags'));
        return array('models'=>$names,'fetchedAt'=>nowIso(),'provider'=>'ollama','message'=>'已讀取此 PHP 主機上 Ollama 已安裝的模型清單，沒有執行推論或下載模型。列在清單中不保證支援結構化輸出，也不代表具備 OpenAI Responses 相容性，仍須實際操作驗收。');
    }
    public function checkConnection($model) {
        ollamaModelName($model);$names=$this->installedModelNames($this->request('/api/tags'));
        $found=in_array($model,$names,true)||strpos($model,':')===false&&in_array($model.':latest',$names,true);
        ensure($found,'OLLAMA_MODEL_MISSING','已連到 Ollama，但尚未找到設定的模型。請先在 Ollama 安裝該模型，或將設定改成已安裝的完整名稱。此檢查不會下載模型。',409);
        return array('ok'=>true,'message'=>'已連到本機 Ollama，且找到模型。只讀取模型清單，沒有執行推論；結構化回覆品質仍需實際操作驗收。');
    }
}
