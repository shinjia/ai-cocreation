<?php
/**
 * Bounded, one-attempt OpenAI Images transport for PHP 7.4.
 * Official JSON edit contract: images:[{image_url:"data:image/png;base64,..."}]
 * https://developers.openai.com/api/reference/resources/images/methods/edit
 * ImagesResponse does not promise a model field. Never invent actualModel.
 * https://raw.githubusercontent.com/openai/openai-python/main/src/openai/types/images_response.py
 *
 * The caller owns source authorization, the operation journal and full PNG
 * normalization before saving. This adapter never reads URLs/files or saves a
 * result. An invalid/oversized result can still have incurred provider charges.
 */
class OpenAIImageAdapter
{
    const MAX_RESPONSE_BYTES=6291456; // 6 MiB: 4 MiB PNG base64 + bounded metadata.
    const MAX_PNG_BYTES=4194304;
    const MAX_BASE64_BYTES=5592408;
    const MAX_REQUEST_BYTES=18000000;
    const MAX_HEADER_BYTES=32768;
    private $keyProvider;
    private $timeout;
    private $transport;

    public function __construct($keyProvider,$timeout=120000,$testTransport=null)
    {
        ensure(is_callable($keyProvider)&&is_int($timeout)&&$timeout>=1000&&$timeout<=180000&&($testTransport===null||is_callable($testTransport)),
            'IMAGE_GENERATION_INPUT_INVALID','圖片生成連線設定不正確，尚未傳送。',409);
        $this->keyProvider=$keyProvider;$this->timeout=$timeout;$this->transport=$testTransport;
    }

    public function generate($model,$prompt,$images=array(),$options=array())
    {
        ensure(function_exists('imageGenerationModelSupported')&&imageGenerationModelSupported('openai',$model),
            'IMAGE_MODEL_UNSUPPORTED','固定圖片模型不在程式支援範圍內；沒有自行替換模型，尚未傳送。',409);
        try{$prompt=userTextValue($prompt,32000,'圖片生成指示');}
        catch(AppError $error){throw new AppError('IMAGE_GENERATION_INPUT_INVALID',$error->getMessage().' 尚未傳送。',409);}
        ensure(function_exists('imageGenerationOptions'),'IMAGE_GENERATION_OPTIONS_INVALID','缺少固定圖片生成參數，尚未傳送。',409);
        $fixed=imageGenerationOptions();
        ensure(is_array($options),'IMAGE_GENERATION_OPTIONS_INVALID','圖片生成參數必須維持固定設定，尚未傳送。',409);
        foreach($options as $name=>$value)ensure(array_key_exists($name,$fixed)&&$value===$fixed[$name],
            'IMAGE_GENERATION_OPTIONS_INVALID','圖片生成只接受單張、1024×1024、低品質、不透明 PNG 的固定設定，尚未傳送。',409);
        $images=prepareModelImageInputs($images);$total=0;
        foreach($images as $image)$total+=strlen($image['bytes']);
        // Include request/base64/cURL copies, response/JSON/decoded-PNG copies
        // full worst-case PNG normalizer buffers and allocator slack (96 MiB),
        // even with no input images. Never raise configured memory limits.
        ensure(function_exists('pngUploadEnsureMemory'),'IMAGE_GENERATION_RESOURCE_LIMIT','缺少安全圖片記憶體檢查，尚未生成或傳送。',503);
        try{pngUploadEnsureMemory(8*$total+100663296);}
        catch(AppError $error){throw new AppError('IMAGE_GENERATION_RESOURCE_LIMIT','伺服器目前沒有足夠或可確認的安全記憶體生成圖片，尚未傳送；請減少圖片輸入或請管理者檢查記憶體，不要關閉限制。',503);}

        $payload=array_merge(array('model'=>$model,'prompt'=>$prompt),$fixed);
        $url='https://api.openai.com/v1/images/generations';
        if($images!==array()){
            $url='https://api.openai.com/v1/images/edits';$payload['images']=array();
            foreach($images as $image)$payload['images'][]=array('image_url'=>'data:image/png;base64,'.base64_encode($image['bytes']));
        }
        $encoded=jsonEncode($payload);
        ensure(strlen($encoded)<=self::MAX_REQUEST_BYTES,'IMAGE_GENERATION_INPUT_INVALID','本次圖片要求超過安全傳送上限，尚未傳送。',409);
        $response=$this->request($url,$payload,$encoded);
        return $this->decode($response);
    }

    private function uncertain($code,$message)
    {
        return new AppError($code,$message.' 結果未確認，可能已產生費用；沒有自動重試，原有版本不變。請先確認狀態，再由你決定是否重新生成。',502);
    }

    private function request($url,$payload,$encoded)
    {
        // Constructor-only fixture. It runs before a key lookup or cURL setup.
        // ($url,$payload) -> ['status'=>int,'body'=>JSON string,'headers'=>array].
        if($this->transport!==null){
            try{return call_user_func($this->transport,$url,$payload);}
            catch(Throwable $error){throw $this->uncertain('OPENAI_IMAGE_CONNECTION','圖片服務連線逾時、中斷或未能取得完整回應。');}
        }
        ensure(extension_loaded('curl'),'CURL_REQUIRED','伺服器需要啟用 PHP cURL，尚未傳送圖片生成要求。',503);
        $key=validateApiKey(call_user_func($this->keyProvider));
        $curl=curl_init($url);
        ensure($curl!==false,'CURL_REQUIRED','無法初始化安全圖片連線，尚未傳送。',503);
        $body='';$tooLarge=false;$headers=array();$headerBytes=0;$headerTooLarge=false;$requestIdSeen=false;
        $configured=curl_setopt_array($curl,array(
            CURLOPT_FOLLOWLOCATION=>false,CURLOPT_MAXREDIRS=>0,CURLOPT_PROXY=>'',CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,
            CURLOPT_CONNECTTIMEOUT_MS=>10000,CURLOPT_TIMEOUT_MS=>$this->timeout,
            CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,
            CURLOPT_POST=>true,CURLOPT_HTTPHEADER=>array('Accept: application/json','Content-Type: application/json','Authorization: Bearer '.$key),
            CURLOPT_POSTFIELDS=>$encoded,
            CURLOPT_WRITEFUNCTION=>function($handle,$chunk)use(&$body,&$tooLarge){
                if(strlen($chunk)>self::MAX_RESPONSE_BYTES-strlen($body)){$tooLarge=true;return 0;}
                $body.=$chunk;return strlen($chunk);
            },
            CURLOPT_HEADERFUNCTION=>function($handle,$line)use(&$headers,&$headerBytes,&$headerTooLarge,&$requestIdSeen){
                $headerBytes+=strlen($line);
                if($headerBytes>self::MAX_HEADER_BYTES){$headerTooLarge=true;return 0;}
                // Discard interim (e.g. 100 Continue) request IDs, not headers'
                // cumulative byte limit. Ambiguous duplicate IDs are omitted.
                if(stripos($line,'HTTP/')===0){$headers=array();$requestIdSeen=false;}
                elseif(stripos($line,'x-request-id:')===0){
                    $headers['x-request-id']=$requestIdSeen?null:trim(substr($line,13));$requestIdSeen=true;
                }
                return strlen($line);
            }
        ));
        unset($key);
        if(!$configured){curl_close($curl);throw new AppError('CURL_REQUIRED','無法設定安全圖片連線，尚未傳送；請檢查 PHP cURL 與 CA 憑證，不要關閉 TLS 驗證。',503);}
        // Exactly one paid request. No retry loop, redirect, fallback, or claim
        // that a client request ID provides provider-side idempotency.
        $ok=curl_exec($curl);$status=(int)curl_getinfo($curl,CURLINFO_HTTP_CODE);curl_close($curl);
        if($tooLarge||$headerTooLarge)throw $this->uncertain('IMAGE_GENERATION_RESPONSE_TOO_LARGE','圖片服務回應超過本程式安全上限，已停止接收。');
        if($ok===false)throw $this->uncertain('OPENAI_IMAGE_CONNECTION','圖片服務連線逾時、中斷或未能取得完整回應；請檢查網路與 CA 憑證，不要關閉 TLS 驗證。');
        return array('status'=>$status,'body'=>$body,'headers'=>$headers);
    }

    private function decode($response)
    {
        if(!is_array($response)||!is_int(field($response,'status'))||!is_string(field($response,'body')))
            throw $this->uncertain('OPENAI_IMAGE_CONNECTION','圖片服務未提供可確認的完整 HTTP 回應。');
        $status=$response['status'];$body=$response['body'];
        if(strlen($body)>self::MAX_RESPONSE_BYTES)throw $this->uncertain('IMAGE_GENERATION_RESPONSE_TOO_LARGE','圖片服務回應超過本程式安全上限。');
        if($status<200||$status>=300){
            if($status<400||$status>=500)throw $this->uncertain('OPENAI_IMAGE_HTTP_UNKNOWN','圖片服務未完成可確認的回應（HTTP '.($status>=100&&$status<=599?$status:0).'）。');
            throw $this->uncertain('OPENAI_IMAGE_HTTP_ERROR','OpenAI HTTP '.$status.'：'.$this->safeErrorHint($status,$body));
        }
        $data=$this->boundedJson($body);
        if($data===null)throw $this->uncertain('IMAGE_GENERATION_OUTPUT_INVALID','圖片服務回應不是安全上限內的可驗證 JSON。');
        $entries=field($data,'data');
        if(!plain($data)||field($data,'error')!==null||!is_array($entries)||array_keys($entries)!==array(0)||!plain($entries[0]))
            throw $this->uncertain('IMAGE_GENERATION_OUTPUT_INVALID','圖片服務必須回傳且只回傳一張圖片。');
        $encoded=field($entries[0],'b64_json');
        if(!is_string($encoded)||$encoded===''||strlen($encoded)>self::MAX_BASE64_BYTES||strlen($encoded)%4!==0)
            throw $this->uncertain('IMAGE_GENERATION_OUTPUT_INVALID','圖片服務未提供安全上限內的完整 base64 圖片；不會改用網址下載。');
        // PHP strict decoding alone accepts whitespace. Require canonical
        // alphabet/padding as well, without a multi-megabyte regex backtrack.
        $digits=strspn($encoded,'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/');$padding=strlen($encoded)-$digits;
        if($padding>2||substr($encoded,$digits)!==str_repeat('=',$padding))
            throw $this->uncertain('IMAGE_GENERATION_OUTPUT_INVALID','圖片服務的 base64 圖片格式不正確。');
        $bytes=base64_decode($encoded,true);
        if(!is_string($bytes)||strlen($bytes)<57||strlen($bytes)>self::MAX_PNG_BYTES||base64_encode($bytes)!==$encoded)
            throw $this->uncertain('IMAGE_GENERATION_OUTPUT_INVALID','圖片服務回傳的圖片無效或超過4 MiB上限。');
        // Envelope and requested dimensions only. The caller MUST perform full
        // normalizeUploadedPng() validation before transactional persistence.
        if(substr($bytes,0,8)!=="\x89PNG\r\n\x1a\n"||substr($bytes,8,8)!=="\x00\x00\x00\x0dIHDR"||substr($bytes,16,8)!==pack('NN',1024,1024)||substr($bytes,-12)!=="\x00\x00\x00\x00IEND\xae\x42\x60\x82")
            throw $this->uncertain('IMAGE_GENERATION_OUTPUT_INVALID','圖片服務沒有回傳指定的完整1024×1024 PNG，未儲存為有效圖片。');

        $headers=field($response,'headers',array());$requestId=null;
        if(is_array($headers)&&count($headers)<=32){
            $seen=false;
            foreach($headers as $name=>$value)if(is_string($name)&&strtolower($name)==='x-request-id'){
                $requestId=$seen?null:$this->safeIdentifier($value,128);$seen=true;
            }
        }
        $model=$this->safeIdentifier(field($data,'model'),160,true);
        $created=field($data,'created');if(!is_int($created)||$created<0||$created>4102444800)$created=null;
        $revised=field($entries[0],'revised_prompt');
        if(!is_string($revised)||strlen($revised)>32000||trim($revised)===''||!preg_match('//u',$revised)||preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/',$revised)||strpos($revised,'sk-')!==false)$revised=null;
        $usage=null;$candidate=field($data,'usage');
        if(plain($candidate)){$nodes=0;$valid=true;$candidate=$this->safeUsage($candidate,0,$nodes,$valid);if($valid&&strlen(jsonEncode($candidate))<=8192)$usage=$candidate;}
        return array('bytes'=>$bytes,'actualModel'=>$model,'providerRequestId'=>$requestId,'providerCreatedAt'=>$created,'revisedPrompt'=>$revised,'usage'=>$usage);
    }

    private function safeIdentifier($value,$maximum,$model=false)
    {
        if(!is_string($value)||strlen($value)<1||strlen($value)>$maximum||strpos($value,'sk-')!==false)return null;
        return preg_match($model?'/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/D':'/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/D',$value)===1?$value:null;
    }

    private function boundedJson($body)
    {
        // A 6 MiB JSON array of tiny objects can consume far more memory than
        // a 6 MiB base64 string. Bound structure BEFORE json_decode allocates it.
        // strcspn skips large string spans without duplicating the PNG payload.
        $length=strlen($body);$offset=0;$outside=0;$strings=0;
        while($offset<$length){
            if($body[$offset]!=='"'){$outside++;if($outside>65536)return null;$offset++;continue;}
            $strings++;if($strings>512)return null;$offset++;
            while(true){
                $offset+=strcspn($body,"\"\\",$offset);
                if($offset>=$length)return null;
                if($body[$offset]==='\\'){$offset+=2;if($offset>=$length)return null;continue;}
                $offset++;break;
            }
        }
        try{return json_decode($body,false,32,JSON_THROW_ON_ERROR);}catch(Throwable $error){return null;}
    }

    private function safeUsage($value,$depth,&$nodes,&$valid)
    {
        $nodes++;
        if($depth>4||$nodes>128){$valid=false;return null;}
        if(is_int($value)&&$value>=0&&$value<=9007199254740991)return $value;
        if(!plain($value)){$valid=false;return null;}
        $properties=get_object_vars($value);
        if(count($properties)>32){$valid=false;return null;}
        $out=array();
        foreach($properties as $name=>$child){
            if(!is_string($name)||strlen($name)>64||preg_match('/^[a-z][a-z0-9_]*$/D',$name)!==1){$valid=false;return null;}
            $out[$name]=$this->safeUsage($child,$depth+1,$nodes,$valid);
            if(!$valid)return null;
        }
        return $out;
    }

    private function safeErrorHint($status,$body)
    {
        // Never display arbitrary error.message, error.code, request text, keys,
        // raw responses or exception messages. Only known static hints survive.
        $error=$this->boundedJson($body);$code=field(field($error,'error'),'code');
        if(in_array($code,array('moderation_blocked','image_generation_user_error'),true))return '內容或圖片輸入未通過服務檢查，請調整指示或來源圖片。';
        if(in_array($code,array('insufficient_quota','credit_balance_exhausted','project_spend_limit_exceeded','organization_spend_limit_exceeded','organization_usage_limit_exceeded'),true))return '帳戶額度或專案用量上限不足，請檢查 OpenAI 用量與帳務。';
        $hints=array(400=>'圖片模型或參數不相容，請檢查固定圖片模型與輸入。',401=>'API Key 無效或已失效，請使用設定中的密碼欄更新。',403=>'此金鑰或專案沒有所需權限，請檢查官方帳號設定。',404=>'找不到固定圖片模型，或此帳號無權使用。',413=>'圖片輸入超過服務可接受的大小。',429=>'達到速率或帳戶額度限制，請檢查 OpenAI 用量與帳務。');
        return isset($hints[$status])?$hints[$status]:'服務未接受這次圖片要求。';
    }
}
