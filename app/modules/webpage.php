<?php
// The fixed project text/structured model creates native page sections, not
// arbitrary executable code. Shared workflows own versioning and adoption.
class WebpageModule extends TitleModule {
    protected function moduleType() { return 'webpage'; }
    protected function moduleLabel() { return '網頁'; }
    protected function referencePool($project,$sources=array()) {
        // The application verifies same-project ownership and persisted assets.
        // An injected validated pool is authoritative, never expanded by model data.
        $groups=array();
        if(array_key_exists('compositionReferencePool',$project))$groups[]=$project['compositionReferencePool'];
        else {foreach($sources as $source)$groups[]=field($source,'referencesSnapshot',array());$groups[]=field($project,'references',array());}
        $out=array();$byId=array();$images=array();
        foreach($groups as $group){
            ensure(is_array($group)&&($group===array()||array_keys($group)===range(0,count($group)-1)),'COMPOSITION_REFERENCE_INVALID','固定引用清單格式不正確，尚未呼叫 AI。',409);
            foreach($group as $ref){
                ensure(is_array($ref),'COMPOSITION_REFERENCE_INVALID','固定引用格式不正確，尚未呼叫 AI。',409);
                $id=field($ref,'id');$snapshot=field($ref,'versionSnapshot');
                $isImage=field($snapshot,'contentType')==='image'||field($ref,'contentType')==='image'||field(field($snapshot,'artifact',array()),'kind')==='image';
                if($isImage){
                    ensure(field($snapshot,'contentType')==='image','COMPOSITION_REFERENCE_INVALID','圖片引用必須明確標示完整圖片版本，未傳送資產內容或呼叫 AI。',409);
                    ensure(is_string($id)&&preg_match('/^[a-f0-9]{32}$/D',$id)&&is_array($snapshot),'COMPOSITION_REFERENCE_INVALID','圖片固定引用缺少完整版本快照。',409);
                    foreach(array('targetItemId','versionId') as $key)ensure(is_string(field($ref,$key))&&preg_match('/^[a-f0-9]{32}$/D',$ref[$key]),'COMPOSITION_REFERENCE_INVALID','圖片固定引用來源識別碼不正確。',409);
                    ensure(field($snapshot,'id')===$ref['versionId'],'COMPOSITION_REFERENCE_INVALID','圖片固定引用的版本與快照不一致。',409);
                    if(isset($project['id']))ensure(field($ref,'projectId')===$project['id'],'COMPOSITION_REFERENCE_INVALID','圖片固定引用必須屬於目前專案。',409);
                    try{$artifact=validateImageArtifact(field($snapshot,'artifact'));}catch(AppError $error){throw new AppError('COMPOSITION_REFERENCE_INVALID','固定圖片中繼資料不完整，尚未呼叫 AI。',409);}
                    $identity=$ref['targetItemId'].':'.$ref['versionId'];
                    ensure(!isset($images[$identity])||$images[$identity]===$artifact,'COMPOSITION_REFERENCE_CONFLICT','同一固定圖片版本對應不同中繼資料，未替換圖片或呼叫 AI。',409);$images[$identity]=$artifact;
                }
                // Preserve legacy text-only reference shapes without granting them
                // image authority. Full image access is always checked above.
                if(is_string($id)&&isset($byId[$id])){
                    $prior=$out[$byId[$id]];
                    ensure(field($prior,'targetItemId')===field($ref,'targetItemId')&&field($prior,'versionId')===field($ref,'versionId')&&jsonEncode(field($prior,'versionSnapshot'))===jsonEncode($snapshot),'COMPOSITION_REFERENCE_CONFLICT','同一固定引用對應不同快照，未替換來源或呼叫 AI。',409);continue;
                }
                ensure(count($out)<256,'CONTEXT_LIMIT','完整固定引用超過單次安全上限，未截斷或呼叫 AI。',409);
                if(is_string($id))$byId[$id]=count($out);$out[]=$ref;
            }
        }
        return $out;
    }
    protected function imageReferenceMap($references) {
        $out=array();foreach($references as $ref)if(field(field($ref,'versionSnapshot',array()),'contentType')==='image')$out[$ref['id']]=$ref;return $out;
    }
    protected function modelReferences($references) {
        $out=array();foreach($references as $ref){
            $entry=array_intersect_key($ref,array_flip(array('id','projectId','targetItemId','targetItemTitle','versionId','pinnedAt')));$source=field($ref,'versionSnapshot');
            if(field($source,'contentType')==='image'){
                // Allowlist metadata only: no asset IDs, paths, URLs, bytes,
                // transport payloads or nested source/attachment snapshots.
                $artifact=validateImageArtifact($source['artifact']);
                $entry['versionSnapshot']=array('id'=>$source['id'],'contentType'=>'image','title'=>$artifact['title'],'alt'=>$artifact['alt'],'attribution'=>$artifact['attribution'],
                    'width'=>$artifact['asset']['width'],'height'=>$artifact['asset']['height'],'mime'=>$artifact['asset']['mime'],'pixelsProvided'=>false);
            }elseif(is_array($source))$entry['versionSnapshot']=$this->creativeVersions(array($source))[0];
            else $entry+=array_intersect_key($ref,array_flip(array('contentType','items','title')));
            $out[]=$entry;
        }
        return $out;
    }
    protected function imageMetadata($references) {
        $out=array();foreach($this->modelReferences($references) as $ref)if(field(field($ref,'versionSnapshot',array()),'contentType')==='image')$out[]=$ref;return $out;
    }
    protected function context($project) {
        $references=$this->referencePool($project);$safeProject=$project;$safeProject['references']=$this->modelReferences($references);
        $data=parent::context($safeProject);unset($data['versions']);$data['contentType']='webpage';$data['versionIndex']=array();
        foreach($project['versions'] as $version)$data['versionIndex'][]=array('id'=>$version['id'],'title'=>field($version,'title'),'major'=>field($version,'major'),'minor'=>field($version,'minor'),'source'=>field($version,'source'));
        $data['availableImageReferences']=$this->imageMetadata($references);$data['imagePixelsProvided']=false;return $data;
    }
    protected function ask($model,$instructions,$data,$schema,$maxOutputTokens=6000) {
        $value=parent::ask($model,'這是原生網頁結構與固定圖片引用編排；只有文字和圖片中繼資料，沒有傳送或觀看圖片像素，也不生成或修改圖片像素。'.$instructions,$data,$schema,$maxOutputTokens);
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
            $generationText=preg_replace('/(?:未|沒有|並未|尚未|不曾|不能|無法|不會|不).{0,8}?(?:生成|產生|繪製|修改|重繪).{0,8}?(?:圖片|照片|像素|影像)/u','',$text);
            $generationText=preg_replace('/\bI\s+(?:have\s+not|haven.t|did\s+not|didn.t|cannot|can.t|do\s+not)\s+(?:generated?|created?|edited?|modified?|modify|create|edit)\s+(?:the\s+|an?\s+)?(?:image|photo|pixels)\b/iu','',$generationText);
            ensure(!preg_match('/(?:(?:我(?:已經|已|確實|親自)?|已經|已|實際|親自)[ \t]*(?:生成|產生|繪製|修改|重繪).{0,8}(?:圖片|照片|像素|影像)(?!的?(?:中繼資料|標題|替代文字|說明|描述|來源註記|尺寸|引用|排列|位置|區塊|圖說))|\bI\s+(?:have\s+)?(?:generated|created|edited|modified)\s+(?:the\s+|an?\s+)?(?:image|photo|pixels)\b(?!\s+(?:metadata|title|alt\s+text|description|dimensions|reference|layout|section|caption)))/iu',$generationText),'MODEL_PIXEL_CLAIM','模型宣稱生成或修改圖片像素，本次僅允許固定引用編排，未保存或自動重試。',502);
            $text=preg_replace('/(?:未|沒有|並未|尚未|不曾|不能|無法).{0,8}?(?:看過|看見|看到|檢視|觀察|分析).{0,10}?(?:圖片|照片|像素|影像)/u','',$text);
            $text=preg_replace('/\bI\s+(?:have\s+not|haven.t|did\s+not|didn.t|cannot|can.t)\s+(?:viewed|seen|inspected|view|see|inspect|visually\s+analy[sz]ed?)\s+(?:the\s+)?(?:image|photo|pixels)\b/iu','',$text);
            ensure(!preg_match('/(?:(?:我(?:已經|已|確實|親自)?|已經|已|實際|親自)[ \t]*(?:看過|看見|看到|檢視|觀察|視覺分析).{0,10}(?:圖片|照片|像素|影像)(?!的?(?:中繼資料|標題|替代文字|說明|描述|來源註記|尺寸))|(?:從|在)(?:這張|該|此)?(?:圖片|照片|影像)(?:中|裡|內).{0,8}(?:看見|看到|可見)|\bI\s+(?:have\s+)?(?:viewed|seen|inspected|visually\s+analy[sz]ed)\s+(?:the\s+)?(?:image|photo|pixels)\b(?!\s+(?:metadata|title|alt\s+text|description|dimensions)))/iu',$text),'MODEL_PIXEL_CLAIM','模型宣稱檢視未提供的圖片像素，未保存這份回覆；不會自動重試。',502);
        }
    }
    protected function artifactWithReferences($value,$references,$source=false) {
        $artifact=validateWebpageArtifact($value);$map=$this->imageReferenceMap($references);
        foreach(webpageImageReferenceIds($artifact) as $id)ensure(isset($map[$id]),$source?'COMPOSITION_REFERENCE_MISSING':'MODEL_IMAGE_REFERENCE_INVALID',$source?'來源網頁的固定圖片引用已缺漏；不會自行換圖或呼叫 AI。':'AI 使用未明確釘選的圖片引用，未保存作品或自動重試。',$source?409:502);
        return $artifact;
    }
    protected function usedReferences($artifact,$references) {
        $ids=webpageImageReferenceIds($artifact);$out=array();foreach($references as $ref)if(in_array(field($ref,'id'),$ids,true))$out[]=$ref;return $out;
    }
    protected function contentFingerprint($artifact,$references) {
        // Two pins of the exact same saved image are aliases, not a visual edit.
        $map=$this->imageReferenceMap($references);$aliases=array();
        foreach($map as $id=>$ref){$key=$ref['targetItemId'].':'.$ref['versionId'];if(!isset($aliases[$key]))$aliases[$key]=$id;}
        foreach($artifact['sections'] as &$section)if($section['type']==='image'){$ref=$map[$section['entries'][0]['id']];$section['entries'][0]['id']=$aliases[$ref['targetItemId'].':'.$ref['versionId']];}unset($section);
        return webpageContentFingerprint($artifact);
    }
    protected function selectedData($project,$sources,$question,$references) {
        return array('goalBasis'=>'version_snapshots','contentType'=>'webpage','creativeGoal'=>null,'goalApprovedAt'=>null,
            'selectedVersions'=>$this->creativeVersions($sources),'officialVersionId'=>$project['officialVersionId'],'question'=>$question,
            'pinnedReferences'=>$this->modelReferences($references),'availableImageReferences'=>$this->imageMetadata($references),'imagePixelsProvided'=>false,
            'projectTitle'=>$project['title'],'projectDescription'=>$project['description'],'creativeItemTitle'=>$project['activeItem']['title'],
            'creativeItemDescription'=>$project['activeItem']['description'],'dialogue'=>$this->dialogue($project));
    }
    protected function selectedSources($versions,$references,$action) {
        $code=$action==='fusion'?'FUSION_VERSIONS_INVALID':'COMPARISON_SELECTION';
        ensure(is_array($versions)&&count($versions)>=2&&count($versions)<=5&&array_keys($versions)===range(0,count($versions)-1),$code,'請選擇2至5個不同來源版本。',409);
        $sources=array();$ids=array();foreach($versions as $version){$id=field($version,'id');ensure(is_string($id)&&preg_match('/^[a-f0-9]{32}$/D',$id)&&!in_array($id,$ids,true),$code,'來源版本不可重複或缺少識別碼。',409);$ids[]=$id;$sources[]=$this->sourceSnapshot($version,$references);}return $sources;
    }
    protected function briefInstructions() {
        return '這是原生結構化單頁網頁創作，先和使用者確認三部分：視覺風格、內容結構、操作功能與限制。沿用七欄 brief：tone=視覺風格、message=內容結構、constraints=操作功能與限制；purpose=用途、audience=受眾、summary=三部分的綜合方向。items 固定只有一項 {"id":"document","label":"網頁來源"}，不能把區塊、卡片或問答拆成不同創作項目。足以建立可行網頁就 ready，不要求填完問卷、不反覆追問非關鍵細節；尚未指定的內容要誠實標示，合理建議須明說是建議，不能視為使用者已同意。ready 只表示可以請使用者確認三部分，不代表已確認或已生成。視覺風格使用 paper（明亮紙感）、midnight（深色）、meadow（清新綠色）三種固定主題，不提供任意色碼、CSS 或外部字型。內容結構支援 hero、text、cards、faq、cta、image 原生區塊，可調整順序、文字、卡片與問答。操作功能只支援頁內導覽與原生 FAQ 展開／收合；沒有註冊、登入、付款、表單送出、資料庫、外部連結、外部圖片、任意程式或自動部署。使用者要求不支援的功能時先如實說明並確認是否改成可支援的頁內展示，不能假稱完成。可選擇引用同專案已明確釘選的圖文等固定版本作為脈絡；沒有釘選就不要自行抓取，同專案來源變更不會自動連動。image 區塊只可使用 availableImageReferences 提供的固定圖片引用，可來自已明確釘選圖片或同專案圖文／海報固定版本中的已驗證圖片；沒有可用圖片則做純文字網頁並如實說明。模型只有圖片標題、替代文字、來源註記與尺寸等中繼資料，沒有圖片像素，不宣稱看過、生成或修改圖片。沿用專案固定的文字／結構化模型，不另行呼叫圖片模型或外部服務。';
    }
    protected function artifactInstructions() {
        return '只回傳完整原生 artifact，精確含 kind=webpage、title、theme、navigation、sections，沒有 schemaVersion。不能以 HTML、CSS、JavaScript、Markdown、圖片或網址代替結構。title 不可空白，最多600個 UTF8 位元組；theme 只能是 paper、midnight、meadow；navigation 必須是 true 或 false 布林值。sections 為1至20個區塊，順序就是顯示順序。每個區塊精確含 id、type、eyebrow、heading、body、entries、actionLabel、actionTarget，不省略或增加欄位。區塊 id 英數開頭，只含英數、- 或 _，最多64字元且全頁唯一；既有區塊與卡片或問答沿用穩定 id，只有新內容才新增 id。type 只能是 hero、text、cards、faq、cta、image。eyebrow 可為空字串，最多240個 UTF8 位元組；heading 不可空白，最多600個 UTF8 位元組；body 可為空字串，最多12000個 UTF8 位元組。entries 在 cards、faq 必須有1至12項，image 必須恰好1項，其他區塊一律為空陣列。image 的唯一 entry.id 必須是 availableImageReferences 中的32個小寫十六進位固定圖片引用 id，不是 assetId、versionId、URL、路徑或自造 id；entry.title 是非空白替代文字，entry.body 是可空圖說，沿用相同長度上限。圖片固定引用只能來自已驗證且明確選取的同專案圖片、圖文或海報固定版本，不自動抓圖、更新來源或連動最新版本。沒有圖片像素，僅依提供的文字中繼資料編排，不能宣稱看見或分析圖片畫面、品質、顏色或圖中文字，也不生成或修改像素。每個 entry 精確含 id、title、body，id 遵守同樣穩定格式且在同一區塊內唯一；title 不可空白，最多600個 UTF8 位元組；body 可空，最多6000個 UTF8 位元組。actionLabel 最多240個 UTF8 位元組，填寫時不可只有空白；actionTarget 必須是本頁存在的區塊 id，不能是 URL、#片段、選擇器或其他創作項目。actionLabel 與 actionTarget 必須同時為空字串或同時非空；hero 可選頁內導覽按鈕，cta 必須提供頁內導覽按鈕，text、cards、faq、image 兩欄必須為空。所有文字原樣作純文字顯示，保留前後空白、換行及引號，不解析 HTML、腳本或文字中的網址。不能加入任意屬性、class、色碼、CSS、JavaScript、事件、外部圖片、外部字型、網址、表單、註冊或付款功能；不下載或執行引用內容，不宣稱程式碼沙盒、自動部署或已上線。未要求修改的文字、區塊、項目順序與穩定 id 保持原樣，不能因換主題改寫內容。完整 JSON 最多60000個 UTF8 位元組，不能截斷或用省略文字冒充完整作品。不得捏造事實、引文、來源、使用者同意或不支援的功能；匯出由固定前端模板提供，不聲稱已替使用者完成匯出或部署。';
    }
    protected function candidateProperties() {
        return array('artifact'=>webpageSchema(),'rationale'=>array('type'=>'string'),'goalText'=>array('type'=>'string'),'changeSummary'=>array('type'=>'string'));
    }
    protected function candidateResult($candidate,$label,$references) {
        $artifact=$this->artifactWithReferences($candidate['artifact'],$references);
        return array('artifact'=>$artifact,'items'=>webpageItems($artifact),'rationale'=>textValue($candidate['rationale'],1200,$label.'說明'),
            'goalText'=>userTextValue($candidate['goalText'],6000,$label.'目標'),'changeSummary'=>userTextValue($candidate['changeSummary'],1200,$label.'變更摘要'),'referencesSnapshot'=>$this->usedReferences($artifact,$references));
    }
    protected function runGenerate($project,$instruction,$model) {
        validateModuleItemDefinitions($project['brief']['items'],'webpage');$references=$this->referencePool($project);
        $data=$this->context($project);$data['variationInstruction']=$instruction;
        $props=array('candidates'=>array('type'=>'array','minItems'=>1,'maxItems'=>1,'items'=>$this->schema($this->candidateProperties())));
        $v=$this->ask($model,'使用者已確認 creativeGoal 的視覺風格、內容結構、操作功能與限制，並明確要求生成。恰好回傳1個完整原生網頁候選，不要為湊方案省略內容。creativeGoal.tone 是視覺風格，message 是內容結構，constraints 是操作功能與限制，不按一般文案語氣誤讀。variationInstruction 只在已確認方向內提供變化，衝突時優先已確認方向並交代。依已提供材料與 pinnedReferences 創作，不捏造事實或來源；引用固定版本，不自動連動其他創作項目。rationale 說明風格、結構與操作功能的對應及取捨，最多350中文字；goalText 完整保存此候選自己的三部分目標，最多1200中文字；changeSummary 如實說明初次候選採納的要求，不捏造修改或採用歷史，最多350中文字。這只是待審閱候選，不採用、不定稿、不改正式版、不部署。'.$this->artifactInstructions(),$data,$this->schema($props),24000);
        return array($this->candidateResult($v['candidates'][0],'候選',$references));
    }
    protected function sourceSnapshot($source,$references) {
        ensure(field($source,'contentType','webpage')==='webpage','COMPOSITION_SOURCE_INVALID','來源版本不是原生網頁，尚未呼叫 AI。',409);
        $artifact=$this->artifactWithReferences(field($source,'artifact'),$references,true);
        $source['artifact']=$artifact;$source['items']=webpageItems($artifact);$source['contentType']='webpage';return $source;
    }
    protected function runRefine($project,$source,$text,$model,$targetItemIds=null) {
        ensure($targetItemIds===null||$targetItemIds===array(),'TARGET_ITEMS_INVALID','網頁以完整作品為修訂單位，不接受文章段落範圍。',409);
        $references=$this->referencePool($project,array($source));$source=$this->sourceSnapshot($source,$references);
        $data=$this->context($project);$data['pinnedReferences']=$this->modelReferences($references);$data['availableImageReferences']=$this->imageMetadata($references);$data['sourceVersion']=$this->creativeVersions(array($source))[0];$data['latestUserMessage']=$text;
        $props=$this->strings(array('reply','question','rationale','goalText','changeSummary'));
        $props['outcome']=array('type'=>'string','enum'=>array('revision','clarification'));$props['artifact']=webpageSchema();$props['choices']=$this->choicesSchema();
        $v=$this->ask($model,'這是指定版本的網頁持續修訂，不是初次構思。sourceVersion 是唯一修改起點，可以是未採用候選或正式版，不要求先採用。latestUserMessage 是本次要求，歷史只作脈絡，不重做舊要求。要求清楚就 outcome=revision，實際回傳完整 artifact，不能只說已改或只給差異；未要求內容、文字、區塊、卡片或問答、相對順序與穩定 id 保持原樣，只依本次要求修改風格、結構、內容或支援的操作功能。availableImageReferences 保留來源作品的歷史固定圖片，不能因目前引用已移除或來源出現新版就換圖，未要求的固定圖片引用、替代文字與圖說保持原樣。revision 的 question 為空字串、choices 為空陣列；reply 說明提供待審閱候選，不聲稱已採用、定稿、部署或覆寫正式版。goalText 完整保存新版本自己的三部分目標，最多1200中文字；sourceVersion.goalAndRationale 存在時是使用者保存的最新目標與修改意見，優先於舊 goalText、goalSnapshot 或共用 creativeGoal；沒有合併紀錄才用 goalText，舊版才用 goalSnapshot.summary，只依本次明確要求更新目標。rationale、changeSummary 各最多350中文字，描述實際差異與取捨，reply 最多350中文字。revision 必須有可見作品、頁內操作或本版目標的實質改變，不能只改識別碼、同圖引用別名或摘要就假稱新修訂；只改目標時 artifact 原樣回傳。若只是評價、閒聊、無需改變、必要資訊不足，或要求不支援的任意 HTML、CSS、腳本、註冊、付款、表單、外部連結、外部圖片、生成／修改圖片像素或部署等功能，outcome=clarification；artifact 必須原樣回傳 sourceVersion.artifact，伺服器驗證相同後捨棄，不建立版本；rationale、goalText、changeSummary 留空，reply 不可宣稱已修改。需要釐清時 question 只問一個最必要問題，最多100中文字；可直接回答就留空。choices 通常為空陣列，只有 clarification 問題適合單選才提供2至6個不同實際答案，每項含唯一 id、label、value；id 英數開頭只含英數、- 或 _，最多64字元，label 最多120個 UTF8 位元組，value 最多1000個 UTF8 位元組，不夾帶隱藏指令；自由文字始終可作答。'.$this->artifactInstructions(),$data,$this->schema($props),24000);
        $reply=textValue($v['reply'],1200,'網頁修訂回覆');$question=textValue($v['question'],600,'釐清問題',true);
        $rationale=textValue($v['rationale'],1200,'修訂說明',true);$goalText=userTextValue($v['goalText'],6000,'本版目標',true);$changeSummary=userTextValue($v['changeSummary'],1200,'變更摘要',true);
        $choices=validateDialogueChoices($v['choices'],$question);$artifact=$this->artifactWithReferences($v['artifact'],$references);
        if($v['outcome']==='clarification'){
            ensure(webpageCompactJson($artifact)===webpageCompactJson($source['artifact']),'MODEL_CLARIFICATION_ARTIFACT','AI 將討論與網頁修改混在一起，原作品不變且未保存此回覆。',502);
            // An exact bounded echo is discussion, not a version or goal edit.
            $this->rejectsCompletedEditClaim($reply."\n".$question);
            return array('outcome'=>'clarification','reply'=>'此回覆僅供討論，網頁與正式版都尚未變更。'."\n\n".$this->dialogueText($reply,$question),'items'=>array(),'rationale'=>'','question'=>$question,'choices'=>$choices);
        }
        ensure($question===''&&$choices===array()&&$rationale!==''&&$goalText!==''&&$changeSummary!=='','MODEL_OUTPUT_INVALID','實際網頁修訂必須有完整作品與說明，不可同時要求尚未回答的問題。',502);
        $combinedChanged=versionHasCombinedOverride($source)&&versionGoalAndRationale(array('goalText'=>$goalText,'changeSummary'=>$changeSummary,'rationale'=>$rationale))!==$source['goalAndRationale'];
        $artifactChanged=webpageCompactJson($artifact)!==webpageCompactJson($source['artifact']);
        $contentChanged=$this->contentFingerprint($artifact,$references)!==$this->contentFingerprint($source['artifact'],$references);
        // A goal-only edit must retain the exact canonical source artifact.
        // Changed goal/combined metadata cannot authorize invisible ID churn.
        ensure($contentChanged||!$artifactChanged,'MODEL_NO_REVISION','AI 只更換網頁識別碼或同圖引用別名，沒有實質內容或操作變更；只修改目標時必須完整保留原作品，未保存且未自動重試。',502);
        ensure($contentChanged||$goalText!==versionGoalText($source)||$combinedChanged,'MODEL_NO_REVISION','AI 回傳相同網頁內容、操作與本版目標，沒有建立假修訂；原版本保留，未自動重試。',502);
        $revisionReply=$artifactChanged?'已提供完整網頁修訂候選。':'此候選僅更新本版目標，完整網頁保持原樣。';
        $revisionReply.='請審閱後再決定是否採用；尚未採用、定稿或取代正式版，也沒有部署。';
        return array('outcome'=>'revision','reply'=>$revisionReply,'artifact'=>$artifact,'items'=>webpageItems($artifact),'rationale'=>$rationale,'goalText'=>$goalText,'changeSummary'=>$changeSummary,'question'=>'','choices'=>array(),'referencesSnapshot'=>$this->usedReferences($artifact,$references));
    }
    protected function runFuse($project,$versions,$question,$model) {
        ensure(is_array($versions)&&count($versions)>=2&&count($versions)<=5&&array_keys($versions)===range(0,count($versions)-1),'FUSION_VERSIONS_INVALID','請選擇2至5個不同來源版本。',409);
        $references=$this->referencePool($project,$versions);$sources=$this->selectedSources($versions,$references,'fusion');$data=$this->selectedData($project,$sources,$question,$references);
        $v=$this->ask($model,'使用者明確要求融合 selectedVersions 的2至5個選定網頁來源，產生恰好1個完整待審閱新候選，不是比較報告、不選唯一優勝、不採用或覆寫正式版。逐版理解完整 artifact 與各版自己的目標；goalAndRationale 存在時優先於舊 goalText、goalSnapshot、changeSummary、rationale，缺漏如實標示，不捏造。不能用目前共用專案目標覆蓋各版目標。依 question 整合各版的視覺風格、內容結構與可支援的操作功能；目標衝突時依本次明確選擇，否則整合相容部分並具體交代取捨，不假稱矛盾條件同時達成。只使用選定來源與已提供材料，不修改未選版本；pinnedReferences 是固定引用，不自動連動。availableImageReferences 包含選定來源各自保留的歷史固定圖片，只是引用編排，不是圖片像素融合，不宣稱視覺檢查過圖片。保留未變區塊、卡片或問答與可對應的穩定 id；相同 id 在不同來源指不同內容時，僅為真正不同的新內容建立新 id 並交代，不任意全頁重編號；頁內導覽目標必須連到正確的保留或新增區塊。回傳完整作品，不能照抄其中一版假稱融合，也不能只改識別碼、同圖引用別名、版本名稱或摘要就假稱已整合。rationale 說明從哪些版本吸收哪些特色與取捨，最多350中文字；goalText 保存新融合版本自己的完整三部分目標，最多1200中文字；changeSummary 如實說明本次實際整合，最多350中文字。不宣稱已匯出、上線、部署、連動外部網站或新增不支援的操作功能。'.$this->artifactInstructions(),$data,$this->schema($this->candidateProperties()),24000);
        $result=$this->candidateResult($v,'融合',$references);$content=$this->contentFingerprint($result['artifact'],$references);
        foreach($sources as $source)ensure($content!==$this->contentFingerprint($source['artifact'],$references),'MODEL_NO_REVISION','AI 只複製其中一個來源或更改識別碼，沒有形成新融合網頁；未保存假候選，也未自動重試。',502);
        return $result;
    }
    protected function runCompare($project,$versions,$question,$model) {
        ensure(is_array($versions)&&array_keys($versions)===range(0,count($versions)-1)&&count($versions)>=2&&count($versions)<=5,'COMPARISON_SELECTION','請選擇2至5個不同來源版本。',409);
        $references=$this->referencePool($project,$versions);$sources=$this->selectedSources($versions,$references,'comparison');$data=$this->selectedData($project,$sources,$question,$references);
        $item=$this->schema($this->strings(array('versionId','fit','strength','tradeoff','suggestion')));$item['properties']['versionId']['enum']=array_column($sources,'id');
        $props=array('items'=>array('type'=>'array','minItems'=>count($sources),'maxItems'=>count($sources),'items'=>$item),'summary'=>array('type'=>'string'));
        $v=$this->ask($model,'只比較 selectedVersions 中每一版完整原生網頁、區塊、頁內操作、替代文字、圖說與已知圖片中繼資料，逐版保留原 versionId。模型沒有圖片像素，不能視覺評估圖片的畫面、品質、顏色或圖中文字，也不能臆測實際印製或排版渲染結果；可以比較已提供的原生結構與風格設定。每版以自己的 goalAndRationale 為主要目標依據，沒有合併紀錄才用 goalText，舊版才讀 goalSnapshot.summary，再結合 question；不以目前共用目標統一評分，不用舊分欄覆蓋合併紀錄。缺漏或不同目標如實說明，不捏造歷史。每項 fit 說明符合自己目標程度、strength 具體優點、tradeoff 取捨、suggestion 可考慮的修改，各120中文字內。summary 最多250中文字，讓使用者依各版目標判斷，不指定唯一冠軍、不打總分、不修改或融合作品、不更新引用、不採用或定稿。',$data,$this->schema($props),6000);
        $expected=array_column($sources,'id');$seen=array();$out=array();
        foreach($v['items'] as $row){$id=$row['versionId'];ensure(in_array($id,$expected,true)&&!in_array($id,$seen,true),'MODEL_OUTPUT_INVALID','AI 比較了未選取或重複版本，未保存。',502);$seen[]=$id;$entry=array('versionId'=>$id);foreach(array('fit','strength','tradeoff','suggestion') as $key)$entry[$key]=textValue($row[$key],1000,'比較說明');$out[]=$entry;}
        return array('items'=>$out,'summary'=>'此比較僅依原生網頁、文字與圖片中繼資料，沒有檢視圖片像素。'."\n\n".textValue($v['summary'],2000,'比較綜合建議'));
    }
}
