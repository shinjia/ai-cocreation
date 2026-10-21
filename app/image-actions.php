<?php
// Image bytes never enter project JSON, prompts, histories, logs or exports.
// All media reads are authorized through an exact owned saved item/version.
trait CocreationImageActions {
    private $imageInputSnapshots=array();
    private function mediaStore() { return new MediaStore($this->store->db); }
    private function imageBindingHash($p) { return hash('sha256',jsonEncode(validateProjectAiBinding(field($p,'aiBinding')))); }
    private function imageConsentRequired($p) {
        $consent=field($p,'imageAnalysisConsent');
        ensure(is_array($consent)&&field($consent,'bindingHash')===$this->imageBindingHash($p),'IMAGE_ANALYSIS_OPT_IN','請先在圖片工作區確認一次圖片傳送範圍；上傳本機圖片不會自動交給 AI。',409);
    }
    private function grantImageAnalysis($input) {
        $p=$this->project(field($input,'id'));$this->revision($p,$input);$this->activeInput($p,$input);
        ensure($p['projectLifecycle']!=='finalized'&&$p['lifecycle']!=='finalized'&&!$p['activeItem']['archived'],'PROJECT_CLOSED','請先重新開啟或還原目前項目。',409);
        ensure($p['module']==='image','IMAGE_ITEM_REQUIRED','請從圖片工作區確認圖片分析範圍。');
        $this->projectConnection($p); // Verify the fixed destination, but never retrieve a key or make a call.
        $p['imageAnalysisConsent']=array('bindingHash'=>$this->imageBindingHash($p),'acceptedAt'=>nowIso());
        $p['messages'][]=$this->message('student','我同意之後明確按下圖片討論或比較時，將選取圖片的實際內容、固定圖片引用與專案文字送至本專案固定的 AI 服務分析。此確認不會立即呼叫 AI；圖片生成使用另一個已明確綁定的圖片模型與獨立按鈕。','image_analysis_consent');
        return $this->save($p);
    }
    private function imageAssetDescriptor($metadata) { unset($metadata['createdAt']);return $metadata; }
    private function resolveImageAsset($p,$itemId,$artifact) {
        $artifact=validateImageArtifact($artifact);$record=$this->mediaStore()->read($this->owner,$p['id'],$artifact['asset']['id'],$itemId);
        ensure($this->imageAssetDescriptor($record['metadata'])===$artifact['asset'],'MEDIA_DESCRIPTOR_MISMATCH','版本的圖片來源與已保存檔案不一致，未使用或覆寫圖片。',409);return $record;
    }
    public function readImageVersion($input) {
        $raw=$this->normalizeRaw($this->store->project(field($input,'id'),$this->owner));
        $item=$raw['creativeItems'][$this->locateItem($raw,field($input,'itemId'))];$version=$this->version($item,field($input,'versionId'));
        ensure(field($version,'contentType')==='image'&&isset($version['artifact']),'MEDIA_NOT_FOUND','此版本沒有可讀取的圖片。',404);
        return $this->resolveImageAsset($raw,$item['id'],$version['artifact']);
    }
    public function uploadImage($input,$bytes) {
        // Normalize before acquiring the SQLite write reservation.
        ensure(is_array($input)&&field($input,'action')==='upload_image','INVALID_INPUT','圖片保存請求格式不正確。');
        $id=validId(field($input,'id'));$itemId=validId(field($input,'itemId'));$requestId=field($input,'requestId');
        ensure(is_string($requestId)&&preg_match('/^[a-zA-Z0-9-]{20,64}$/D',$requestId),'REQUEST_ID_REQUIRED','請重新建立有效的圖片保存請求。');
        $mode=field($input,'versionMode','major');ensure(in_array($mode,array('major','minor'),true),'VERSION_MODE','請選擇新版本或小修改。');
        $baseId=field($input,'basedOnVersionId');if($baseId!==null)validId($baseId);ensure($mode!=='minor'||$baseId!==null,'VERSION_BASE_REQUIRED','小修改需要明確的來源版本。');
        $title=artifactText(field($input,'title'),600,'圖片名稱',false);$alt=artifactText(field($input,'alt',''),3000,'圖片說明');$attribution=artifactText(field($input,'attribution',''),2000,'外部來源說明');
        $note=validateCombinedVersionNote(field($input,'goalAndRationale',''));
        $metadata=array('id'=>$id,'itemId'=>$itemId,'revision'=>field($input,'revision'),'versionMode'=>$mode,'basedOnVersionId'=>$baseId,'title'=>$title,'alt'=>$alt,'attribution'=>$attribution,'goalAndRationale'=>$note);
        ensure(is_string($bytes)&&strlen($bytes)<=4194304,'PNG_TOO_LARGE','圖片須先在瀏覽器轉為不超過 4 MiB 的 PNG。',413);
        $fingerprint=hash('sha256',jsonEncode($metadata).hash('sha256',$bytes));
        // Owner/project existence is checked before allocating decode memory.
        $this->store->project($id,$this->owner);$normalized=normalizeUploadedPng($bytes);$media=$this->mediaStore();
        return $media->transaction(function($store)use($input,$id,$itemId,$requestId,$fingerprint,$normalized,$title,$alt,$attribution,$note,$mode,$baseId){
            $receipt=$store->lookupReceipt($this->owner,$requestId);
            if($receipt!==null){
                ensure($receipt['projectId']===$id&&$receipt['itemId']===$itemId&&hash_equals($receipt['fingerprint'],$fingerprint),'REQUEST_ID_CONFLICT','這個圖片保存編號已用於不同內容，沒有再新增圖片。',409);
                $p=$this->project($id);return array('project'=>$p,'uploadedVersionId'=>$receipt['versionId'],'replayed'=>true);
            }
            $p=$this->project($id);$this->revision($p,$input);$this->activeInput($p,$input);
            ensure($p['module']==='image','IMAGE_ITEM_REQUIRED','請先選擇圖片創作項目。');
            ensure($p['projectLifecycle']!=='finalized'&&$p['lifecycle']!=='finalized'&&!$p['activeItem']['archived'],'PROJECT_CLOSED','請先重新開啟或還原圖片項目，再保存新版本。',409);
            ensure(count($p['messages'])<400&&count($p['versions'])<60,'VERSION_LIMIT','此項目已達版本或對話上限，沒有保存圖片。',409);
            if($baseId!==null){$this->version($p,$baseId);ensure(!versionArchived($p,$baseId),'VERSION_ARCHIVED','請先還原來源版本，再新增圖片修改版。',409);}
            $asset=$this->imageAssetDescriptor($store->insert($this->owner,$id,$itemId,$normalized));
            $artifact=validateImageArtifact(array('kind'=>'image','title'=>$title,'alt'=>$alt,'attribution'=>$attribution,'asset'=>$asset));
            $message=$this->message('student','我明確上傳外部圖片並保存為新版本。這不是 AI 生成圖片，沒有呼叫 AI；原圖檔案未被改寫。','external_upload');
            $versionId=$this->appendVersion($p,imageArtifactItems($artifact),'外部圖片上傳','external_upload',$baseId,$message['id'],null,$mode,array('artifact'=>$artifact,'goalText'=>'','changeSummary'=>'外部圖片上傳；來源說明由使用者提供，未自動查證。','goalAndRationale'=>$note));
            $p['versions'][count($p['versions'])-1]['goalSource']='user';$message['versionIds']=array($versionId);$p['messages'][]=$message;$p['lifecycle']='in_progress';$p['phase']='work';
            $result=$this->save($p);$store->recordReceipt($this->owner,$requestId,$id,$itemId,$fingerprint,$versionId);$result['uploadedVersionId']=$versionId;return $result;
        });
    }
    private function prepareImageInputs($p,$module,$versions,$includeReferences=true) {
        $images=array();$snapshots=array();$seen=array();$bytes=0;
        $add=function($itemId,$version,$label)use($p,&$images,&$snapshots,&$seen,&$bytes){
            if(field($version,'contentType')!=='image'||!isset($version['artifact']))return;
            $asset=validateImageArtifact($version['artifact'])['asset'];$snapshot=array('itemId'=>$itemId,'versionId'=>$version['id'],'assetId'=>$asset['id'],'sha256'=>$asset['sha256'],'label'=>$label);$snapshots[]=$snapshot;
            if(isset($seen[$asset['id']])){$images[$seen[$asset['id']]]['label'].='；亦為 '.$version['id'].' / '.versionLabel($version);return;}$seen[$asset['id']]=count($images);
            ensure(count($images)<5&&$bytes+$asset['byteLength']<=12582912,'IMAGE_INPUT_LIMIT','一次圖片分析最多 5 張不同圖片、合計 12 MiB；請減少選取版本或圖片引用。尚未呼叫 AI。',409);
            $record=$this->resolveImageAsset($p,$itemId,$version['artifact']);$bytes+=$asset['byteLength'];$images[]=array('label'=>$label,'bytes'=>$record['bytes'],'assetId'=>$asset['id'],'sha256'=>$asset['sha256']);
        };
        foreach($versions as $version)$add($p['activeItemId'],$version,'選取版本 '.$version['id'].' / '.versionLabel($version));
        if($includeReferences)foreach($p['references'] as $reference){
            $target=$p['creativeItems'][$this->locateItem($p,$reference['targetItemId'])];$saved=$this->version($target,$reference['versionId']);
            // Never substitute a newer official version for a pinned reference.
            if(field($saved,'contentType')==='image')$add($target['id'],$saved,'固定引用 '.$target['id'].' / '.$saved['id'].' / '.versionLabel($saved));
        }
        if(count($images))$this->imageConsentRequired($p);
        $module->setImageInputs($images);$this->imageInputSnapshots=$snapshots;
    }
}
