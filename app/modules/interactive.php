<?php
/** Fixed text-model adapter for bounded declarative interactive visuals.
 * The model supplies data, never executable p5.js/HTML, pixels or asset URLs.
 * Preview/export and explicit parameter selection belong to the application.
 */
class InteractiveModule extends TitleModule {
    protected function moduleType() { return 'interactive'; }
    protected function moduleLabel() { return '互動視覺程式'; }
    protected function itemLimit() { return 1; }
    protected function briefInstructions() {
        return '這是安全原生互動視覺程式，先確認四部分，依序為畫面視覺、動畫效果、參數設定說明、互動表現。沿用精確七欄 brief：message=畫面視覺、tone=動畫效果、purpose=參數設定說明、constraints=互動表現、audience=用途與觀眾、summary=四部分綜合方向，items 固定一項 {"id":"document","label":"互動程式來源"}，不拆分圖層或控制項。畫面視覺是必要方向；動畫、互動都可明確為無，參數可為無或待建議，不強迫加動畫或互動。只要必要視覺資訊足夠就 ready，不要求問卷或固定輪數；ready 只表示可以請使用者確認方向，不表示已確認或已生成。未知非必要事項誠實標示，提議須明說是建議。使用既有固定文字／結構化模型，不呼叫圖片服務。支援矩形、橢圓、直線和有界動畫、滑鼠互動，不是任意程式開發；使用安全宣告式資料與原生 Canvas 預覽，可由受信任的應用程式產生 p5.js 匯出，不會執行模型 JavaScript。AI 只提出可選參數，新參數一律未勾選，只有使用者在參數介面勾選才啟用控制項；作品採用與參數勾選是不同動作。圖片固定引用只有文字中繼資料，沒有看見圖片像素，也不能描述或聲稱分析圖片畫面。';
    }
    protected function artifactInstructions() {
        return '只回傳完整宣告式 artifact，精確含 kind=interactive、title、width、height、background、animation、duration、layers、parameters。沒有 schemaVersion、code、HTML、JavaScript、p5.js 原始碼、URL、外部資源或圖片位元組。title 最多600個 UTF8 位元組；width、height 為1至2048整數；background、fill、stroke 只接受 #rrggbb 六位十六進位色碼或 none；animation 是布林值，duration 為1至60整數秒。layers 為1至40項，順序是由底至頂；每層精確含 id、label、type、x、y、width、height、fill、stroke、strokeWidth、opacity、rotation、motion、motionAmount、motionSpeed、interaction。type 只能 rect、ellipse、line；x、y 為-4096至4096；rect、ellipse 寬高為0.001至4096，line 寬高是端點差量，可為-4096至4096。strokeWidth 為0至64、opacity 為0至1、rotation 為-360至360度；motion 只能 none、orbit、wave、pulse、spin；motionAmount 為0至512、motionSpeed 為0至10；interaction 只能 none、pointer、hover。所有數字最多三位小數，不自動四捨五入。parameters 為0至24項，每項精確含 id、label、layerId、target、min、max、step、value、previousValue、selected。id 英數開頭只含英數、- 或 _，最多64字元，各清單內唯一；label 最多120個 UTF8 位元組，所有文字原樣純文字顯示，不解析程式。layerId 必須對應存在圖層，每個 layerId/target 配對唯一；target 只能 x、y、width、height、strokeWidth、opacity、rotation、motionAmount、motionSpeed。min/max 須符合目標屬性範圍且 max>min；step 為0.001至8192，範圍須可整除 step 且最多10000間隔；value、previousValue 在範圍內且對齊步進。selected 必須為布林值。新參數一律 selected=false、previousValue=value，不論使用者是否口頭要求啟用，仍須由使用者在介面勾選；未勾選參數只作提議，不覆蓋圖層字面值。已有參數不能更改 selected，保留穩定 id 與 layerId/target。未勾選既有參數的 value、previousValue 必須原樣保留。已勾選參數只在 latestUserMessage 或 question 明確要求時修改 value；修改時 previousValue 必須等於來源 value；value 未變時 previousValue 原樣保留。不可刪除已勾選參數或其圖層，不可默默改控制目標，需要這樣調整時請使用者先在介面取消勾選。未要求的圖層、文字、順序、動畫、互動及參數設定完整保留，只有真正新內容新增 id。完整 artifact JSON 最多60000個 UTF8 位元組，不截斷、省略或以差異取代。這是完整可審閱資料候選，不宣稱已採用、定稿、執行、匯出、部署、連接外部服務或看過未提供的圖片像素。';
    }
    protected function modelReferences($references) {
        ensure(is_array($references)&&($references===array()||array_keys($references)===range(0,count($references)-1)),'INTERACTIVE_REFERENCE_INVALID','固定引用清單不正確，尚未呼叫 AI。',409);
        $out=array();foreach($references as $reference){
            $source=field($reference,'versionSnapshot');ensure(is_array($reference)&&is_array($source),'INTERACTIVE_REFERENCE_INVALID','固定引用缺少版本快照，尚未呼叫 AI。',409);
            $entry=array_intersect_key($reference,array_flip(array('id','projectId','targetItemId','targetItemTitle','versionId','pinnedAt')));
            if(field($source,'contentType')==='image'){
                try{$artifact=validateImageArtifact(field($source,'artifact'));}catch(AppError $error){throw new AppError('INTERACTIVE_REFERENCE_INVALID','固定圖片引用的中繼資料不完整，尚未呼叫 AI。',409);}
                $entry['versionSnapshot']=array('id'=>field($source,'id'),'contentType'=>'image','title'=>$artifact['title'],'alt'=>$artifact['alt'],'attribution'=>$artifact['attribution'],'width'=>$artifact['asset']['width'],'height'=>$artifact['asset']['height'],'mime'=>$artifact['asset']['mime'],'pixelsProvided'=>false);
            }else $entry['versionSnapshot']=$this->creativeVersions(array($source))[0];
            $out[]=$entry;
        }return $out;
    }
    protected function context($project) {
        $safeProject=$project;$safeProject['references']=$this->modelReferences($project['references']);$data=parent::context($safeProject);
        unset($data['versions']);$data['contentType']='interactive';$data['imagePixelsProvided']=false;$data['versionIndex']=array();
        foreach($project['versions'] as $version)$data['versionIndex'][]=array_intersect_key($version,array_flip(array('id','title','major','minor','source')));return $data;
    }
    protected function ask($model,$instructions,$data,$schema,$maxOutputTokens=6000) {
        $value=parent::ask($model,'本次只有安全宣告式資料與文字中繼資料；沒有傳送、觀看或分析圖片像素，沒有執行模型程式。'.$instructions,$data,$schema,$maxOutputTokens);
        ensure(strlen(jsonEncode($value))<=90000,'MODEL_OUTPUT_INVALID','模型完整回覆超過安全上限，未截斷、保存或自動重試。',502);
        $this->rejectsPixelInspectionClaim($value);return $value;
    }
    protected function rejectsPixelInspectionClaim($value) {
        // Bounded contradiction check for commentary, not literal artwork text.
        foreach($value as $key=>$part){
            if($key==='artifact'||$key==='direction')continue;
            if(is_array($part)){$this->rejectsPixelInspectionClaim($part);continue;}
            if(!is_string($part)||!in_array($key,array('reply','question','rationale','goalText','changeSummary','summary','fit','strength','tradeoff','suggestion'),true))continue;
            $text=$this->unquotedText($part);
            $text=preg_replace('/(?:未|沒有|並未|尚未|不曾|不能|無法).{0,8}?(?:看過|看見|看到|檢視|觀察|分析).{0,10}?(?:圖片|照片|像素|影像)/u','',$text);
            $text=preg_replace('/\bI\s+(?:have\s+not|haven.t|did\s+not|didn.t|cannot|can.t)\s+(?:viewed|seen|inspected|view|see|inspect|visually\s+analy[sz]ed?)\s+(?:the\s+)?(?:image|photo|pixels)\b/iu','',$text);
            ensure(!preg_match('/(?:(?:我(?:已經|已|確實|親自)?|已經|已|實際|親自)[ \t]*(?:看過|看見|看到|檢視|觀察|視覺分析).{0,10}(?:圖片|照片|像素|影像)(?!的?(?:中繼資料|標題|替代文字|說明|描述|來源註記|尺寸))|\bI\s+(?:have\s+)?(?:viewed|seen|inspected|visually\s+analy[sz]ed)\s+(?:the\s+)?(?:image|photo|pixels)\b(?!\s+(?:metadata|title|alt\s+text|description|dimensions)))/iu',$text),'MODEL_PIXEL_CLAIM','模型宣稱檢視未提供的圖片像素，未保存或自動重試。',502);
        }
    }
    protected function sourceSnapshot($source) {
        ensure(field($source,'contentType','interactive')==='interactive','INTERACTIVE_SOURCE_INVALID','來源不是互動視覺版本，尚未呼叫 AI。',409);
        try{$artifact=validateInteractiveArtifact(field($source,'artifact'));}catch(AppError $error){throw new AppError('INTERACTIVE_SOURCE_INVALID','來源互動視覺資料不完整，尚未呼叫 AI。',409);}
        $source['artifact']=$artifact;$source['items']=interactiveItems($artifact);$source['contentType']='interactive';return $source;
    }
    protected function parameterSources($sources) {
        $known=array();$bindings=array();foreach($sources as $source)foreach($source['artifact']['parameters'] as $parameter){
            $id=$parameter['id'];$binding=$parameter['layerId'].':'.$parameter['target'];
            if(isset($known[$id]))foreach(array('layerId','target','min','max','step','selected','value','previousValue') as $key)ensure($known[$id][$key]===$parameter[$key],'INTERACTIVE_PARAMETER_CONFLICT','選取來源對同一參數有不同定義或控制狀態，請先手動統一，未呼叫 AI。',409);
            ensure(!isset($bindings[$binding])||$bindings[$binding]===$id,'INTERACTIVE_PARAMETER_CONFLICT','同一控制目標在選取來源中有不同參數識別碼，請先手動統一，未呼叫 AI。',409);
            $known[$id]=$parameter;$bindings[$binding]=$id;
        }return $known;
    }
    protected function validateParameterState($artifact,$known) {
        $next=array();$bindings=array();foreach($known as $prior)$bindings[$prior['layerId'].':'.$prior['target']]=$prior['id'];
        foreach($artifact['parameters'] as $parameter){
            $id=$parameter['id'];$next[$id]=$parameter;$binding=$parameter['layerId'].':'.$parameter['target'];
            ensure(!isset($bindings[$binding])||$bindings[$binding]===$id,'MODEL_PARAMETER_STATE','AI 更換既有參數識別碼，未保存候選。',502);
            if(!isset($known[$id])){ensure($parameter['selected']===false&&$parameter['previousValue']===$parameter['value'],'MODEL_PARAMETER_STATE','AI 新參數必須未勾選且目前值等於前次值，未保存候選。',502);continue;}
            $prior=$known[$id];ensure($parameter['selected']===$prior['selected']&&$parameter['layerId']===$prior['layerId']&&$parameter['target']===$prior['target'],'MODEL_PARAMETER_STATE','AI 不能替使用者勾選、取消勾選或更換既有參數控制目標，未保存候選。',502);
            if(!$prior['selected'])ensure($parameter['value']===$prior['value']&&$parameter['previousValue']===$prior['previousValue'],'MODEL_PARAMETER_STATE','未勾選參數的既有值與前次值不能由 AI 改動，未保存候選。',502);
            else ensure($parameter['previousValue']===($parameter['value']===$prior['value']?$prior['previousValue']:$prior['value']),'MODEL_PARAMETER_STATE','已勾選參數必須準確保留前次值，未保存候選。',502);
        }
        foreach($known as $id=>$prior)if($prior['selected'])ensure(isset($next[$id]),'MODEL_PARAMETER_STATE','AI 不可刪除已勾選控制項，請先由使用者取消勾選，未保存候選。',502);
    }
    protected function contentFingerprint($artifact) {
        // Unlike a fusion drawing fingerprint, proposals/labels are meaningful
        // editor content. Only identity churn and equivalent hex case disappear.
        $value=validateInteractiveArtifact($artifact);$ids=array();foreach($value['layers'] as $index=>&$layer){$ids[$layer['id']]='layer_'.$index;$layer['id']='layer_'.$index;$layer['fill']=strtolower($layer['fill']);$layer['stroke']=strtolower($layer['stroke']);}unset($layer);
        foreach($value['parameters'] as $index=>&$parameter){$parameter['id']='parameter_'.$index;$parameter['layerId']=$ids[$parameter['layerId']];}unset($parameter);
        $value['background']=strtolower($value['background']);return interactiveCompactJson($value);
    }
    protected function candidateProperties() {
        return array('artifact'=>interactiveSchema(),'rationale'=>array('type'=>'string'),'goalText'=>array('type'=>'string'),'changeSummary'=>array('type'=>'string'));
    }
    protected function candidateResult($candidate,$label,$known=array()) {
        $artifact=validateInteractiveArtifact($candidate['artifact']);$this->validateParameterState($artifact,$known);
        return array('artifact'=>$artifact,'items'=>interactiveItems($artifact),'rationale'=>textValue($candidate['rationale'],1200,$label.'說明'),'goalText'=>userTextValue($candidate['goalText'],6000,$label.'目標'),'changeSummary'=>userTextValue($candidate['changeSummary'],1200,$label.'變更摘要'));
    }
    protected function runGenerate($project,$instruction,$model) {
        validateModuleItemDefinitions($project['brief']['items'],'interactive');$data=$this->context($project);$data['variationInstruction']=$instruction;
        $props=array('candidates'=>array('type'=>'array','minItems'=>1,'maxItems'=>1,'items'=>$this->schema($this->candidateProperties())));
        $v=$this->ask($model,'使用者已確認 creativeGoal 並明確要求生成，恰好回傳1個完整互動視覺候選，不為湊方案省略內容。message 是畫面視覺，tone 是動畫效果，purpose 是參數設定說明，constraints 是互動表現，不能按一般文案欄位誤讀。variationInstruction 只在已確認方向內變化；無動畫或無互動都是有效需求，不自行加入。只依已提供材料，不捏造事實或來源。新參數全為未勾選提議；不假稱已啟用或已採用。rationale 說明視覺、動畫、參數與互動取捨，最多350中文字；goalText 完整保存自己的目標，最多1200中文字；changeSummary 如實說明初次候選採納的要求，最多350中文字，不捏造修改歷史。'.$this->artifactInstructions(),$data,$this->schema($props),24000);
        return array($this->candidateResult($v['candidates'][0],'候選'));
    }
    protected function runRefine($project,$source,$text,$model,$targetItemIds=null) {
        ensure($targetItemIds===null||$targetItemIds===array(),'TARGET_ITEMS_INVALID','互動視覺以完整作品修訂，不接受文章段落範圍。',409);
        $source=$this->sourceSnapshot($source);$known=$this->parameterSources(array($source));$data=$this->context($project);$data['sourceVersion']=$this->creativeVersions(array($source))[0];$data['sourceReferencesSnapshot']=$this->modelReferences(field($source,'referencesSnapshot',array()));$data['latestUserMessage']=$text;
        $props=$this->strings(array('reply','question','rationale','goalText','changeSummary'));$props['outcome']=array('type'=>'string','enum'=>array('revision','clarification'));$props['artifact']=interactiveSchema();$props['choices']=$this->choicesSchema();
        $v=$this->ask($model,'這是指定 sourceVersion 的持續修訂，不是重新構思；sourceVersion 是唯一修改起點，可是尚未採用候選或正式版，不要求先採用。latestUserMessage 是本次要求，歷史只作脈絡，不重做舊要求。要求清楚就 outcome=revision，回傳完整 artifact，不能只口頭說已改或只給差異。未要求的內容、穩定 id、控制狀態、值與前次值保持原樣。sourceVersion.goalAndRationale 存在時優先於舊 goalText、goalSnapshot、rationale；沒有合併紀錄才用 goalText，舊版才用 goalSnapshot.summary。不能用共用 creativeGoal 覆蓋本版目標，只依本次明確要求改動。revision 的 question 為空、choices=[]，rationale、changeSummary 各最多350中文字，goalText 完整保存本版目標最多1200中文字。必須有作品、參數提議或本版目標的實質變化，不能只改 id、摘要或歷史假稱修改；只改目標時 artifact 原樣保留。只有參數提議變更時如實說明尚未勾選、畫面未因此改變。若評價、閒聊、無需改動、必要資訊不足或要求不支援的程式、外部資源、刪除已勾選控制項，outcome=clarification，artifact 原樣回傳 sourceVersion.artifact，驗證後捨棄，不建立版本；rationale、goalText、changeSummary 留空，reply 不可聲稱已修改。需要釐清時只問一個最必要問題，可直接回答則 question 留空；choices 通常為空，單選必要時提供2至6個唯一 id、label、value 的實際答案，id 最多64字元、label 最多120個 UTF8 位元組、value 最多1000個 UTF8 位元組，不夾帶隱藏指令。reply 最多350中文字，僅說提供待審閱候選，不宣稱已採用。'.$this->artifactInstructions(),$data,$this->schema($props),24000);
        $reply=textValue($v['reply'],1200,'互動修訂回覆');$question=textValue($v['question'],600,'釐清問題',true);$rationale=textValue($v['rationale'],1200,'修訂說明',true);$goalText=userTextValue($v['goalText'],6000,'本版目標',true);$changeSummary=userTextValue($v['changeSummary'],1200,'變更摘要',true);$choices=validateDialogueChoices($v['choices'],$question);$artifact=validateInteractiveArtifact($v['artifact']);
        if($v['outcome']==='clarification'){
            ensure(interactiveCompactJson($artifact)===interactiveCompactJson($source['artifact']),'MODEL_CLARIFICATION_ARTIFACT','AI 將討論與作品修改混在一起，未保存回覆或版本。',502);$this->rejectsCompletedEditClaim($reply."\n".$question);
            return array('outcome'=>'clarification','reply'=>'此回覆僅供討論，作品、參數控制與正式版都尚未變更。'."\n\n".$this->dialogueText($reply,$question),'items'=>array(),'rationale'=>'','question'=>$question,'choices'=>$choices);
        }
        ensure($question===''&&$choices===array()&&$rationale!==''&&$goalText!==''&&$changeSummary!=='','MODEL_OUTPUT_INVALID','互動修訂必須有完整作品與說明，不可同時要求尚未回答的問題。',502);$this->validateParameterState($artifact,$known);
        $combinedChanged=versionHasCombinedOverride($source)&&versionGoalAndRationale(array('goalText'=>$goalText,'changeSummary'=>$changeSummary,'rationale'=>$rationale))!==$source['goalAndRationale'];$artifactChanged=interactiveCompactJson($artifact)!==interactiveCompactJson($source['artifact']);$contentChanged=$this->contentFingerprint($artifact)!==$this->contentFingerprint($source['artifact']);
        ensure($contentChanged||!$artifactChanged,'MODEL_NO_REVISION','AI 只更換識別碼或等值色碼，未保存假修訂；只改目標時必須原樣保留完整作品。',502);
        ensure($contentChanged||$goalText!==versionGoalText($source)||$combinedChanged,'MODEL_NO_REVISION','AI 回傳相同作品與本版目標，未保存假修訂或自動重試。',502);
        $drawingChanged=interactiveDrawingFingerprint($artifact)!==interactiveDrawingFingerprint($source['artifact']);$revisionReply=!$artifactChanged?'此候選僅更新本版目標，完整作品保持原樣。':($drawingChanged?'已提供完整互動視覺修訂候選。':'已提供作品說明或參數提議修訂候選，畫面與行為沒有因此改變；新參數尚未勾選。');$revisionReply.='請審閱後再決定是否採用；尚未採用、定稿、取代正式版或代為勾選參數。';
        return array('outcome'=>'revision','reply'=>$revisionReply,'artifact'=>$artifact,'items'=>interactiveItems($artifact),'rationale'=>$rationale,'goalText'=>$goalText,'changeSummary'=>$changeSummary,'question'=>'','choices'=>array());
    }
    protected function selectedSources($versions,$action) {
        $code=$action==='fusion'?'FUSION_VERSIONS_INVALID':'COMPARISON_SELECTION';ensure(is_array($versions)&&array_keys($versions)===range(0,count($versions)-1)&&count($versions)>=2&&count($versions)<=5,$code,'請選擇2至5個不同互動視覺版本。',409);
        $sources=array();$ids=array();foreach($versions as $version){$id=field($version,'id');ensure(is_string($id)&&preg_match('/^[a-f0-9]{32}$/D',$id)&&!in_array($id,$ids,true),$code,'來源版本識別碼不正確或重複。',409);$ids[]=$id;$sources[]=$this->sourceSnapshot($version);}return $sources;
    }
    protected function selectedData($project,$sources,$question) {
        $sourceReferences=array();foreach($sources as $source)$sourceReferences[]=array('versionId'=>$source['id'],'referencesSnapshot'=>$this->modelReferences(field($source,'referencesSnapshot',array())));
        return array('goalBasis'=>'version_snapshots','contentType'=>'interactive','creativeGoal'=>null,'goalApprovedAt'=>null,'selectedVersions'=>$this->creativeVersions($sources),'officialVersionId'=>$project['officialVersionId'],'question'=>$question,'pinnedReferences'=>$this->modelReferences($project['references']),'sourceReferencesSnapshots'=>$sourceReferences,'imagePixelsProvided'=>false,'projectTitle'=>$project['title'],'projectDescription'=>$project['description'],'creativeItemTitle'=>$project['activeItem']['title'],'creativeItemDescription'=>$project['activeItem']['description'],'dialogue'=>$this->dialogue($project));
    }
    protected function runFuse($project,$versions,$question,$model) {
        $sources=$this->selectedSources($versions,'fusion');$known=$this->parameterSources($sources);$data=$this->selectedData($project,$sources,$question);
        $v=$this->ask($model,'使用者明確要求融合 selectedVersions 的2至5個來源，產生恰好1個完整新候選，不是比較報告、不選唯一優勝、不採用或覆寫正式版。逐版理解完整作品與自己的目標，goalAndRationale 存在時優先，沒有合併紀錄才用 goalText，舊版才用 goalSnapshot.summary，缺漏如實說明。不能用目前共用目標覆蓋各版目標。依 question 整合視覺、動畫與互動；目標衝突依本次明確要求，否則整合相容部分並說明取捨，不假稱矛盾同時達成。只用選定來源，不修改未選版本。保留來源已勾選參數的 id、綁定及選用狀態，值僅在 question 明確要求時可改並保存正確前次值；未勾選既有參數的值不變，新參數未勾選。不能複製任一來源或只改標題、標籤、id、前次值、未勾選參數或摘要假稱融合；必須真的改變畫面或動畫互動結構。rationale 說明從哪些版整合哪些特色及取捨，最多350中文字；goalText 保存融合版完整目標，最多1200中文字；changeSummary 說明實際整合，最多350中文字。'.$this->artifactInstructions(),$data,$this->schema($this->candidateProperties()),24000);
        $result=$this->candidateResult($v,'融合',$known);$drawing=interactiveDrawingFingerprint($result['artifact']);foreach($sources as $source)ensure($drawing!==interactiveDrawingFingerprint($source['artifact']),'MODEL_NO_REVISION','AI 只複製其中一版或更改名稱、提議及識別碼，未形成新融合畫面或行為，未保存或自動重試。',502);return $result;
    }
    protected function runCompare($project,$versions,$question,$model) {
        $sources=$this->selectedSources($versions,'comparison');$data=$this->selectedData($project,$sources,$question);$item=$this->schema($this->strings(array('versionId','fit','strength','tradeoff','suggestion')));$item['properties']['versionId']['enum']=array_column($sources,'id');$props=array('items'=>array('type'=>'array','minItems'=>count($sources),'maxItems'=>count($sources),'items'=>$item),'summary'=>array('type'=>'string'));
        $v=$this->ask($model,'只比較 selectedVersions 的完整宣告式視覺、動畫、參數和互動，逐版保留 versionId。每版以自己的 goalAndRationale 為主要依據，沒有合併紀錄才用 goalText，舊版才用 goalSnapshot.summary，再結合 question；不以目前共用目標統一評分，不把正式版或較新版當成必然較好。未勾選參數是提議，不可當成已啟用的控制或實際畫面變化；已勾選才依 value 評估。缺漏或不同目標如實說明，不捏造討論歷史。模型只有原生結構與圖片中繼資料，沒有執行預覽或檢視圖片像素，不能宣稱實測動畫效能、看到圖片或驗證外部相容。每項 fit、strength、tradeoff、suggestion 各120中文字內；summary 最多250中文字，讓使用者自行判斷，不指定唯一冠軍、不打總分、不融合作品、不採用或更動參數選用。',$data,$this->schema($props),6000);
        $expected=array_column($sources,'id');$seen=array();$out=array();foreach($v['items'] as $row){$id=$row['versionId'];ensure(in_array($id,$expected,true)&&!in_array($id,$seen,true),'MODEL_OUTPUT_INVALID','AI 比較了未選取或重複版本，未保存。',502);$seen[]=$id;$entry=array('versionId'=>$id);foreach(array('fit','strength','tradeoff','suggestion') as $key)$entry[$key]=textValue($row[$key],1000,'比較說明');$out[]=$entry;}
        return array('items'=>$out,'summary'=>'此比較依原生結構與中繼資料，沒有執行預覽或檢視圖片像素。'."\n\n".textValue($v['summary'],2000,'比較綜合建議'));
    }
}
