<?php
/**
 * Native illustrated/poster composition with the project's fixed text model.
 * Image references are immutable pins, never generated pixels or remote URLs.
 * The application must resolve ownership and stored media before saving a result;
 * referencesSnapshot below is evidence to preserve, not proof of media access.
 */
class CompositionModule extends TitleModule {
    private $type;
    public function __construct($model,$type) {
        ensure(in_array($type,array('illustrated','poster'),true),'MODULE_UNAVAILABLE','此原生排版類型未提供。',409);
        parent::__construct($model);$this->type=$type;
    }
    protected function moduleType() { return $this->type; }
    protected function moduleLabel() { return $this->type==='poster'?'海報設計':'圖文'; }
    protected function itemLimit() { return 1; }
    protected function briefInstructions() {
        $items=$this->type==='poster'?'海報來源':'圖文來源';
        $specific=$this->type==='poster'
            ?'海報先確認三部分：視覺風格、完整文字內容、圖文排列。七欄 brief 中 tone=視覺風格、message=完整文字內容、constraints=圖文排列；purpose=用途、audience=受眾、summary=三部分的綜合方向。ready 只表示可以請使用者確認三部分，不代表已確認或已生成。海報支援 portrait、square、landscape 畫幅，paper、night、festival 主題，以及 headline、text、image 區塊和 left、center、right 對齊。'
            :'圖文依用途、受眾、完整文字、視覺風格與必要排列限制整理七欄 brief。支援 paper、night、meadow 主題，以完整段落搭配 text、above、left、right 的原生排列。';
        return $specific.' items 固定只有一項 {"id":"document","label":"'.$items.'"}，不能把區塊拆成獨立創作項目，不使用中文名稱、英文名稱或 Slogan 等命名固定欄位。已有足夠方向就 ready，不要求填完問卷、不反覆追問非關鍵細節；未知內容誠實標示，合理建議須明說是建議，不假稱使用者已同意。這是原生可編輯文字與既有圖片的排版，不是 AI 點陣圖片生成；沿用專案固定的文字／結構化模型，不切換模型或外部圖片服務。只能引用同專案使用者已明確釘選的固定圖片版本，不自動抓圖、附加引用、更新來源或替換圖片。沒有可用圖片時可生成純文字排版，但必須誠實說明沒有圖片，不放假圖片、假網址或占位資產。模型只收到圖片標題、替代文字、來源註記與尺寸等中繼資料，沒有圖片像素，不能宣稱看見或分析過圖片內容。';
    }
    protected function artifactInstructions() {
        $specific=$this->type==='poster'
            ?'artifact 精確含 kind=poster、title、format、theme、blocks。format 只能是 portrait、square、landscape；theme 只能是 paper、night、festival。blocks 為2至16項，至少一個 headline 與另一個 text 或 image 區塊。每個 block 精確含 id、type、text、imageRefId、alignment。type 只能是 headline、text、image；alignment 只能是 left、center、right。headline、text 的 text 必須非空白，最多2000個 UTF8 位元組，imageRefId 必須是空字串；image 必須有有效 imageRefId，text 可為空或最多600個 UTF8 位元組的圖說。'
            :'artifact 精確含 kind=illustrated、title、theme、blocks。theme 只能是 paper、night、meadow。blocks 為1至24項；每個 block 精確含 id、heading、body、layout、imageRefId、caption。heading 與 caption 可空，各最多600個 UTF8 位元組；body 必須非空白，最多12000個 UTF8 位元組。layout 只能是 text、above、left、right；text 的 imageRefId 必須是空字串，其他排列必須有有效 imageRefId。';
        return '只回傳完整原生 artifact，不回傳 HTML、CSS、JavaScript、SVG、Markdown、圖片位元組或網址代替結構，沒有 schemaVersion。'.$specific.' title 必須非空白，最多600個 UTF8 位元組。每個 block 的 id 英數開頭，只含英數、- 或 _，最多64字元，整份唯一；保留既有穩定 id，只有真正的新區塊才新增。imageRefId 只能是 availableImageReferences 中的32個小寫十六進位 id，不是 assetId、versionId、URL、檔案路徑或新造的識別碼。引用指向已釘選固定版本；不能更新引用、偷偷換成同來源較新圖片、捏造資產或自行附加其他圖片。需要沒有提供的圖片時，先討論必要缺漏，或在明確可接受時使用純文字排版並說明沒有圖片；不可把待補說明當成已存在的圖片。模型沒有收到圖片像素，只能依提供的文字中繼資料安排圖片，不宣稱已視覺檢查畫面、色彩、品質或圖中文字。所有文字原樣作純文字顯示，保留前後空白、引號與換行，不執行文字中的程式或網址。未要求的文字、圖說、區塊、順序、對齊、穩定 id 與圖片固定引用保持原樣，不能因換主題而改寫內容或換圖。完整 artifact JSON 最多60000個 UTF8 位元組，不截斷、不省略。不得捏造事實、引文、來源、使用者同意、生成的圖片或外部相容性；不宣稱已匯出、印製、上線、部署、採用或定稿。';
    }
    protected function referencePool($project,$sources=array()) {
        // Historical pins remain usable only as explicit selected-source evidence.
        // The same pin id must never silently acquire a different fixed snapshot.
        $groups=array();foreach($sources as $source)$groups[]=field($source,'referencesSnapshot',array());$groups[]=field($project,'references',array());
        $out=array();$byId=array();
        foreach($groups as $group){
            ensure(is_array($group)&&($group===array()||array_keys($group)===range(0,count($group)-1)),'COMPOSITION_REFERENCE_INVALID','圖片引用清單格式不正確，尚未呼叫 AI。',409);
            foreach($group as $ref){
                $id=field($ref,'id');$snapshot=field($ref,'versionSnapshot');
                ensure(is_array($ref)&&is_string($id)&&preg_match('/^[a-f0-9]{32}$/D',$id)&&is_array($snapshot),'COMPOSITION_REFERENCE_INVALID','固定引用缺少可驗證的識別碼或版本快照。',409);
                foreach(array('targetItemId','versionId') as $key)ensure(is_string(field($ref,$key))&&preg_match('/^[a-f0-9]{32}$/D',$ref[$key]),'COMPOSITION_REFERENCE_INVALID','固定引用來源識別碼不正確。',409);
                ensure(field($snapshot,'id')===$ref['versionId'],'COMPOSITION_REFERENCE_INVALID','固定引用的版本與快照不一致。',409);
                if(field($snapshot,'contentType')==='image'){
                    try{validateImageArtifact(field($snapshot,'artifact'));}catch(AppError $error){throw new AppError('COMPOSITION_REFERENCE_INVALID','固定圖片引用的中繼資料不完整，尚未呼叫 AI。',409);}
                }
                if(isset($byId[$id])){
                    $prior=$out[$byId[$id]];
                    ensure($prior['targetItemId']===$ref['targetItemId']&&$prior['versionId']===$ref['versionId']&&jsonEncode($prior['versionSnapshot'])===jsonEncode($snapshot),'COMPOSITION_REFERENCE_CONFLICT','同一固定引用對應不同快照，未替換來源或呼叫 AI。',409);
                    continue;
                }
                ensure(count($out)<256,'CONTEXT_LIMIT','完整固定引用超過單次安全上限，未截斷或呼叫 AI。',409);
                $byId[$id]=count($out);$out[]=$ref;
            }
        }
        return $out;
    }
    protected function imageReferenceMap($references) {
        $out=array();foreach($references as $ref)if(field($ref['versionSnapshot'],'contentType')==='image')$out[$ref['id']]=$ref;return $out;
    }
    protected function modelReferences($references) {
        $out=array();foreach($references as $ref){
            $entry=array_intersect_key($ref,array_flip(array('id','projectId','targetItemId','targetItemTitle','versionId','pinnedAt')));
            $source=$ref['versionSnapshot'];
            if(field($source,'contentType')==='image'){
                // Explicit allowlist: never forward raw bytes, data URIs, paths,
                // nested attachments, transport payloads, or signed media URLs.
                $artifact=validateImageArtifact($source['artifact']);
                $entry['versionSnapshot']=array('id'=>$source['id'],'contentType'=>'image','title'=>$artifact['title'],'alt'=>$artifact['alt'],'attribution'=>$artifact['attribution'],
                    'width'=>$artifact['asset']['width'],'height'=>$artifact['asset']['height'],'mime'=>$artifact['asset']['mime'],'pixelsProvided'=>false);
            }else $entry['versionSnapshot']=$this->creativeVersions(array($source))[0];
            $out[]=$entry;
        }
        return $out;
    }
    protected function imageMetadata($references) {
        $out=array();foreach($this->modelReferences($references) as $ref)if(field($ref['versionSnapshot'],'contentType')==='image')$out[]=$ref;return $out;
    }
    protected function context($project) {
        $references=$this->referencePool($project);$safeProject=$project;$safeProject['references']=$this->modelReferences($references);
        $data=parent::context($safeProject);unset($data['versions']);$data['contentType']=$this->type;$data['versionIndex']=array();
        foreach($project['versions'] as $version)$data['versionIndex'][]=array_intersect_key($version,array_flip(array('id','title','major','minor','source')));
        $data['availableImageReferences']=$this->imageMetadata($references);$data['imagePixelsProvided']=false;return $data;
    }
    protected function ask($model,$instructions,$data,$schema,$maxOutputTokens=6000) {
        $value=parent::ask($model,'本次是原生'.$this->moduleLabel().'排版；只有文字與圖片中繼資料，沒有傳送或觀看圖片像素。不可聲稱視覺評估過圖片，也不生成或修改圖片像素。'.$instructions,$data,$schema,$maxOutputTokens);
        ensure(strlen(jsonEncode($value))<=90000,'MODEL_OUTPUT_INVALID','模型完整回覆超過安全上限，未截斷、保存或自動重試。',502);$this->rejectsPixelInspectionClaim($value);return $value;
    }
    protected function rejectsPixelInspectionClaim($value) {
        // A bounded contradiction guard, not a guarantee of semantic truth.
        // Inspect model commentary only, never rewrite literal artwork text.
        foreach($value as $key=>$part){
            if($key==='artifact'||$key==='direction')continue;
            if(is_array($part)){$this->rejectsPixelInspectionClaim($part);continue;}
            if(!is_string($part)||!in_array($key,array('reply','question','rationale','changeSummary','summary','fit','strength','tradeoff','suggestion'),true))continue;
            $text=$this->unquotedText($part);
            $text=preg_replace('/(?:未|沒有|並未|尚未|不曾|不能|無法).{0,8}?(?:看過|看見|看到|檢視|觀察|分析).{0,10}?(?:圖片|照片|像素|影像)/u','',$text);
            $text=preg_replace('/\bI\s+(?:have\s+not|haven.t|did\s+not|didn.t|cannot|can.t)\s+(?:viewed|seen|inspected|view|see|inspect|visually\s+analy[sz]ed?)\s+(?:the\s+)?(?:image|photo|pixels)\b/iu','',$text);
            ensure(!preg_match('/(?:(?:我(?:已經|已|確實|親自)?|已經|已|實際|親自)[ \t]*(?:看過|看見|看到|檢視|觀察|視覺分析).{0,10}(?:圖片|照片|像素|影像)(?!的?(?:中繼資料|標題|替代文字|說明|描述|來源註記|尺寸))|(?:從|在)(?:這張|該|此)?(?:圖片|照片|影像)(?:中|裡|內).{0,8}(?:看見|看到|可見)|\bI\s+(?:have\s+)?(?:viewed|seen|inspected|visually\s+analy[sz]ed)\s+(?:the\s+)?(?:image|photo|pixels)\b(?!\s+(?:metadata|title|alt\s+text|description|dimensions)))/iu',$text),'MODEL_PIXEL_CLAIM','模型宣稱檢視未提供的圖片像素，未保存這份回覆；不會自動重試。',502);
        }
    }
    protected function artifactWithReferences($value,$references,$source=false) {
        $artifact=validateCompositionArtifact($value,$this->type);$map=$this->imageReferenceMap($references);
        foreach($artifact['blocks'] as $block)if($block['imageRefId']!=='')ensure(isset($map[$block['imageRefId']]),$source?'COMPOSITION_REFERENCE_MISSING':'MODEL_IMAGE_REFERENCE_INVALID',$source?'來源作品的固定圖片引用已缺漏；不會自行換圖或呼叫 AI。':'AI 使用未明確釘選的圖片引用，未保存作品或自動重試。',$source?409:502);
        return $artifact;
    }
    protected function usedReferences($artifact,$references) {
        $ids=array_column($artifact['blocks'],'imageRefId');$out=array();foreach($references as $ref)if(in_array($ref['id'],$ids,true))$out[]=$ref;return $out;
    }
    protected function contentFingerprint($artifact,$references) {
        // Alias pins of the exact same fixed image version are not a visible edit.
        // Block ids are ignored by the canonical composition fingerprint.
        $map=$this->imageReferenceMap($references);$aliases=array();
        foreach($map as $id=>$ref){$key=$ref['targetItemId'].':'.$ref['versionId'];if(!isset($aliases[$key]))$aliases[$key]=$id;}
        foreach($artifact['blocks'] as &$block)if($block['imageRefId']!==''){$ref=$map[$block['imageRefId']];$block['imageRefId']=$aliases[$ref['targetItemId'].':'.$ref['versionId']];}unset($block);
        return compositionContentFingerprint($artifact,$this->type);
    }
    protected function candidateProperties() {
        return array('artifact'=>compositionSchema($this->type),'rationale'=>array('type'=>'string'),'goalText'=>array('type'=>'string'),'changeSummary'=>array('type'=>'string'));
    }
    protected function candidateResult($candidate,$label,$references) {
        $artifact=$this->artifactWithReferences($candidate['artifact'],$references);
        return array('artifact'=>$artifact,'items'=>compositionItems($artifact,$this->type),'rationale'=>textValue($candidate['rationale'],1200,$label.'說明'),
            'goalText'=>userTextValue($candidate['goalText'],6000,$label.'目標'),'changeSummary'=>userTextValue($candidate['changeSummary'],1200,$label.'變更摘要'),
            'referencesSnapshot'=>$this->usedReferences($artifact,$references));
    }
    protected function runGenerate($project,$instruction,$model) {
        validateModuleItemDefinitions($project['brief']['items'],$this->type);$references=$this->referencePool($project);
        $data=$this->context($project);$data['variationInstruction']=$instruction;
        $props=array('candidates'=>array('type'=>'array','minItems'=>1,'maxItems'=>1,'items'=>$this->schema($this->candidateProperties())));
        $v=$this->ask($model,'使用者已確認 creativeGoal 並明確要求生成。恰好回傳1個完整原生排版候選，不為湊方案省略內容。海報的已確認 tone 是視覺風格、message 是完整文字內容、constraints 是圖文排列，不按一般文案欄位誤讀。variationInstruction 僅作已確認方向內的變化，衝突時優先已確認方向並交代。只使用明確提供材料與固定引用，不捏造內容或圖片；沒有圖片時可作純文字排版並如實說明。rationale 說明風格、完整文字與排列取捨，最多350中文字；goalText 完整保存本候選自己的目標，最多1200中文字；changeSummary 如實說明初次候選採納的要求，不捏造修改或採用歷史，最多350中文字。這只是待審閱候選，不採用、不定稿、不改正式版。'.$this->artifactInstructions(),$data,$this->schema($props),24000);
        return array($this->candidateResult($v['candidates'][0],'候選',$references));
    }
    protected function sourceSnapshot($source,$references) {
        ensure(field($source,'contentType',$this->type)===$this->type,'COMPOSITION_SOURCE_INVALID','來源版本不是相同排版類型，尚未呼叫 AI。',409);
        $artifact=$this->artifactWithReferences(field($source,'artifact'),$references,true);
        $source['artifact']=$artifact;$source['items']=compositionItems($artifact,$this->type);$source['contentType']=$this->type;return $source;
    }
    protected function selectedData($project,$sources,$question,$references) {
        return array('goalBasis'=>'version_snapshots','contentType'=>$this->type,'creativeGoal'=>null,'goalApprovedAt'=>null,'selectedVersions'=>$this->creativeVersions($sources),
            'officialVersionId'=>$project['officialVersionId'],'question'=>$question,'pinnedReferences'=>$this->modelReferences($references),
            'availableImageReferences'=>$this->imageMetadata($references),'imagePixelsProvided'=>false,'projectTitle'=>$project['title'],'projectDescription'=>$project['description'],
            'creativeItemTitle'=>$project['activeItem']['title'],'creativeItemDescription'=>$project['activeItem']['description'],'dialogue'=>$this->dialogue($project));
    }
    protected function selectedSources($versions,$references,$action) {
        ensure(is_array($versions)&&count($versions)>=2&&count($versions)<=5,$action==='fusion'?'FUSION_VERSIONS_INVALID':'COMPARISON_SELECTION','請選擇2至5個不同版本。',409);
        $sources=array();$ids=array();foreach($versions as $version){$id=field($version,'id');ensure(is_string($id)&&preg_match('/^[a-f0-9]{32}$/D',$id)&&!in_array($id,$ids,true),$action==='fusion'?'FUSION_VERSIONS_INVALID':'COMPARISON_SELECTION','來源版本不可重複或缺少識別碼。',409);$ids[]=$id;$sources[]=$this->sourceSnapshot($version,$references);}return $sources;
    }
    protected function runRefine($project,$source,$text,$model,$targetItemIds=null) {
        ensure($targetItemIds===null||$targetItemIds===array(),'TARGET_ITEMS_INVALID','原生排版以完整作品修訂，不接受文章段落範圍。',409);
        $references=$this->referencePool($project,array($source));$source=$this->sourceSnapshot($source,$references);
        $data=$this->context($project);$data['pinnedReferences']=$this->modelReferences($references);$data['availableImageReferences']=$this->imageMetadata($references);
        $data['sourceVersion']=$this->creativeVersions(array($source))[0];$data['latestUserMessage']=$text;
        $props=$this->strings(array('reply','question','rationale','goalText','changeSummary'));$props['outcome']=array('type'=>'string','enum'=>array('revision','clarification'));$props['artifact']=compositionSchema($this->type);$props['choices']=$this->choicesSchema();
        $v=$this->ask($model,'這是指定 sourceVersion 的原生排版持續修訂，不是初次構思。sourceVersion 是唯一修改起點，可以是未採用候選或正式版，不要求先採用。latestUserMessage 是本次要求，歷史只作脈絡，不重做舊要求。要求清楚就 outcome=revision，回傳完整 artifact，不能只口頭說已改或只給差異；未要求的完整文字、圖說、圖片固定引用、區塊、順序與穩定 id 保持原樣。availableImageReferences 包含來源版本原有的歷史固定圖片，不能因目前引用清單已變更就換圖。revision 的 question 為空、choices=[]；reply 最多350中文字，僅說提供待審閱候選。goalText 完整保存新版本自己的目標，最多1200中文字；sourceVersion.goalAndRationale 存在時是使用者保存的最新目標與修改意見，優先於舊 goalText、goalSnapshot 或共用 creativeGoal；沒有合併紀錄才用 goalText，舊版才用 goalSnapshot.summary。只依本次明確要求更新目標。rationale 與 changeSummary 各最多350中文字，描述實際差異與取捨。revision 必須有排版、文字、固定圖片選擇或本版目標的實質改變，不能只改識別碼、同圖的引用別名或摘要；只改目標時 artifact 原樣回傳。若只是評價、閒聊、無需變更、必要資訊不足，或要求生成／修改圖片像素、任意程式、外部圖片或不支援排版，outcome=clarification；artifact 必須原樣回傳 sourceVersion.artifact，伺服器驗證相同後捨棄，不建立版本；rationale、goalText、changeSummary 留空，reply 不可宣稱已修改。需要釐清時 question 只問一個最必要問題，最多100中文字；能直接回答則留空。choices 通常為空；僅在 clarification 問題適合單選時提供2至6項，每項含唯一 id、label、value，id 為最多64字元英數短鍵，可含 - 或 _；label 最多120 UTF8位元組，value 最多1000 UTF8位元組，不同 value 忠實對應標籤且不含隱藏指令。自由文字始終可作答。'.$this->artifactInstructions(),$data,$this->schema($props),24000);
        $reply=textValue($v['reply'],1200,'排版修訂回覆');$question=textValue($v['question'],600,'釐清問題',true);$rationale=textValue($v['rationale'],1200,'修訂說明',true);
        $goalText=userTextValue($v['goalText'],6000,'本版目標',true);$changeSummary=userTextValue($v['changeSummary'],1200,'變更摘要',true);$choices=validateDialogueChoices($v['choices'],$question);
        $artifact=$this->artifactWithReferences($v['artifact'],$references);
        if($v['outcome']==='clarification'){
            ensure(compositionCompactJson($artifact,$this->type)===compositionCompactJson($source['artifact'],$this->type),'MODEL_CLARIFICATION_ARTIFACT','AI 將討論與排版修改混在一起，作品不變且未保存此回覆。',502);
            $this->rejectsCompletedEditClaim($reply."\n".$question);
            return array('outcome'=>'clarification','reply'=>'此回覆僅供討論，作品與正式版都尚未變更；沒有檢視或修改圖片像素。'."\n\n".$this->dialogueText($reply,$question),'items'=>array(),'rationale'=>'','question'=>$question,'choices'=>$choices);
        }
        ensure($question===''&&$choices===array()&&$rationale!==''&&$goalText!==''&&$changeSummary!=='','MODEL_OUTPUT_INVALID','實際排版修訂需有完整作品與說明，不可同時要求尚未回答的問題。',502);
        $combinedChanged=versionHasCombinedOverride($source)&&versionGoalAndRationale(array('goalText'=>$goalText,'changeSummary'=>$changeSummary,'rationale'=>$rationale))!==$source['goalAndRationale'];
        $artifactChanged=compositionCompactJson($artifact,$this->type)!==compositionCompactJson($source['artifact'],$this->type);
        $contentChanged=$this->contentFingerprint($artifact,$references)!==$this->contentFingerprint($source['artifact'],$references);
        ensure($contentChanged||!$artifactChanged,'MODEL_NO_REVISION','AI 只更換識別碼或同圖引用別名；只改目標時必須完整保留原作品，未保存假修訂或自動重試。',502);
        ensure($contentChanged||$goalText!==versionGoalText($source)||$combinedChanged,'MODEL_NO_REVISION','AI 回傳相同排版內容和本版目標，未建立假修訂或自動重試。',502);
        $revisionReply=$artifactChanged?'已提供完整原生排版修訂候選。':'此候選僅更新本版目標，完整排版保持原樣。';
        $revisionReply.='請審閱後再決定是否採用；尚未採用、定稿或取代正式版，也沒有生成、檢視或修改圖片像素。';
        return array('outcome'=>'revision','reply'=>$revisionReply,'artifact'=>$artifact,'items'=>compositionItems($artifact,$this->type),'rationale'=>$rationale,'goalText'=>$goalText,'changeSummary'=>$changeSummary,'question'=>'','choices'=>array(),'referencesSnapshot'=>$this->usedReferences($artifact,$references));
    }
    protected function runFuse($project,$versions,$question,$model) {
        ensure(is_array($versions)&&array_keys($versions)===range(0,count($versions)-1)&&count($versions)>=2&&count($versions)<=5,'FUSION_VERSIONS_INVALID','請選擇2至5個不同來源版本。',409);
        $references=$this->referencePool($project,$versions);$sources=$this->selectedSources($versions,$references,'fusion');$data=$this->selectedData($project,$sources,$question,$references);
        $v=$this->ask($model,'使用者明確要求融合 selectedVersions 的2至5個選定排版來源，產生恰好1個完整新候選，不是比較報告、不選唯一優勝、不採用或覆寫正式版。逐版理解完整 artifact 與各版自己的目標；goalAndRationale 存在時優先於舊 goalText、goalSnapshot、changeSummary、rationale，缺漏如實說明，不捏造。不能用目前共用專案目標覆蓋各版目標。依 question 整合各版的視覺風格、完整文字與圖文排列；目標衝突時依本次明確選擇，否則整合相容部分並具體交代取捨，不假稱矛盾條件同時達成。只使用選定來源與已提供材料，不修改未選版本；availableImageReferences 包括各來源的歷史固定圖片，仍是原版本，不自動更新圖片。保留未變區塊、文字、圖片固定引用、相對順序及可對應的穩定 id；同 id 在不同來源指不同內容時，僅為真正不同的新區塊建立新 id 並交代，不任意全頁重編號。回傳完整作品，不能照抄其中一版假稱融合，也不能只改識別碼、同圖的引用別名或摘要假稱新內容。rationale 說明從哪些版本吸收哪些特色與取捨，最多350中文字；goalText 保存新融合版自己的完整目標，最多1200中文字；changeSummary 如實說明實際整合，最多350中文字。這是文字與排版的融合，不是圖片像素融合，不宣稱視覺檢查過任何圖片。'.$this->artifactInstructions(),$data,$this->schema($this->candidateProperties()),24000);
        $result=$this->candidateResult($v,'融合',$references);$content=$this->contentFingerprint($result['artifact'],$references);
        foreach($sources as $source)ensure($content!==$this->contentFingerprint($source['artifact'],$references),'MODEL_NO_REVISION','AI 只複製其中一個來源或更改識別碼，沒有形成新融合排版，未保存或自動重試。',502);return $result;
    }
    protected function runCompare($project,$versions,$question,$model) {
        ensure(is_array($versions)&&array_keys($versions)===range(0,count($versions)-1)&&count($versions)>=2&&count($versions)<=5,'COMPARISON_SELECTION','請選擇2至5個不同來源版本。',409);
        $references=$this->referencePool($project,$versions);$sources=$this->selectedSources($versions,$references,'comparison');$data=$this->selectedData($project,$sources,$question,$references);
        $item=$this->schema($this->strings(array('versionId','fit','strength','tradeoff','suggestion')));$item['properties']['versionId']['enum']=array_column($sources,'id');
        $props=array('items'=>array('type'=>'array','minItems'=>count($sources),'maxItems'=>count($sources),'items'=>$item),'summary'=>array('type'=>'string'));
        $v=$this->ask($model,'只比較 selectedVersions 中每一版完整原生排版、文字、圖說與已知圖片中繼資料，逐版保留原 versionId。模型沒有圖片像素，不能視覺評估圖片的畫面、品質、顏色或圖中文字，也不能臆測實際印製或排版渲染結果；可以比較已提供的原生結構與風格設定。每版以自己的 goalAndRationale 為主要目標依據，沒有合併紀錄才用 goalText，舊版才讀 goalSnapshot.summary，再結合 question；不以目前共用目標統一評分，不用舊分欄覆蓋合併紀錄。缺漏或不同目標如實說明，不捏造歷史。每項 fit 說明符合自己目標程度、strength 具體優點、tradeoff 取捨、suggestion 可考慮的修改，各120中文字內。summary 最多250中文字，讓使用者依各版目標判斷，不指定唯一冠軍、不打總分、不修改或融合作品、不更新引用、不採用或定稿。',$data,$this->schema($props),6000);
        $expected=array_column($sources,'id');$seen=array();$out=array();
        foreach($v['items'] as $row){$id=$row['versionId'];ensure(in_array($id,$expected,true)&&!in_array($id,$seen,true),'MODEL_OUTPUT_INVALID','AI 比較了未選取或重複版本，未保存。',502);$seen[]=$id;$entry=array('versionId'=>$id);foreach(array('fit','strength','tradeoff','suggestion') as $key)$entry[$key]=textValue($row[$key],1000,'比較說明');$out[]=$entry;}
        return array('items'=>$out,'summary'=>'此比較僅依原生排版、文字與圖片中繼資料，沒有檢視圖片像素。'."\n\n".textValue($v['summary'],2000,'比較綜合建議'));
    }
}
