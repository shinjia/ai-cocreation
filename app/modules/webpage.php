<?php
// The fixed project text/structured model creates native page sections, not
// arbitrary executable code. Shared workflows own versioning and adoption.
class WebpageModule extends TitleModule {
    protected function moduleType() { return 'webpage'; }
    protected function moduleLabel() { return '網頁'; }
    protected function context($project) {
        $data=parent::context($project);unset($data['versions']);$data['contentType']='webpage';$data['versionIndex']=array();
        foreach($project['versions'] as $version)$data['versionIndex'][]=array('id'=>$version['id'],'title'=>field($version,'title'),'major'=>field($version,'major'),'minor'=>field($version,'minor'),'source'=>field($version,'source'));
        return $data;
    }
    protected function briefInstructions() {
        return '這是原生結構化單頁網頁創作，先和使用者確認三部分：視覺風格、內容結構、操作功能與限制。沿用七欄 brief：tone=視覺風格、message=內容結構、constraints=操作功能與限制；purpose=用途、audience=受眾、summary=三部分的綜合方向。items 固定只有一項 {"id":"document","label":"網頁來源"}，不能把區塊、卡片或問答拆成不同創作項目。足以建立可行網頁就 ready，不要求填完問卷、不反覆追問非關鍵細節；尚未指定的內容要誠實標示，合理建議須明說是建議，不能視為使用者已同意。ready 只表示可以請使用者確認三部分，不代表已確認或已生成。視覺風格使用 paper（明亮紙感）、midnight（深色）、meadow（清新綠色）三種固定主題，不提供任意色碼、CSS 或外部字型。內容結構支援 hero、text、cards、faq、cta 原生區塊，可調整順序、文字、卡片與問答。操作功能只支援頁內導覽與原生 FAQ 展開／收合；沒有註冊、登入、付款、表單送出、資料庫、外部連結、外部圖片、任意程式或自動部署。使用者要求不支援的功能時先如實說明並確認是否改成可支援的頁內展示，不能假稱完成。可選擇引用同專案已明確釘選的圖文等固定版本作為脈絡；沒有釘選就不要自行抓取，同專案來源變更不會自動連動。引用圖文不等於可嵌入外部圖片，僅採用已提供且適合純文字網頁的內容，不假裝看過未提供的圖片。沿用專案固定的文字／結構化模型，不另行呼叫圖片模型或外部服務。';
    }
    protected function artifactInstructions() {
        return '只回傳完整原生 artifact，精確含 kind=webpage、title、theme、navigation、sections，沒有 schemaVersion。不能以 HTML、CSS、JavaScript、Markdown、圖片或網址代替結構。title 不可空白，最多600個 UTF8 位元組；theme 只能是 paper、midnight、meadow；navigation 必須是 true 或 false 布林值。sections 為1至20個區塊，順序就是顯示順序。每個區塊精確含 id、type、eyebrow、heading、body、entries、actionLabel、actionTarget，不省略或增加欄位。區塊 id 英數開頭，只含英數、- 或 _，最多64字元且全頁唯一；既有區塊與卡片或問答沿用穩定 id，只有新內容才新增 id。type 只能是 hero、text、cards、faq、cta。eyebrow 可為空字串，最多240個 UTF8 位元組；heading 不可空白，最多600個 UTF8 位元組；body 可為空字串，最多12000個 UTF8 位元組。entries 在 cards、faq 必須有1至12項，其他區塊一律為空陣列。每個 entry 精確含 id、title、body，id 遵守同樣穩定格式且在同一區塊內唯一；title 不可空白，最多600個 UTF8 位元組；body 可空，最多6000個 UTF8 位元組。actionLabel 最多240個 UTF8 位元組，填寫時不可只有空白；actionTarget 必須是本頁存在的區塊 id，不能是 URL、#片段、選擇器或其他創作項目。actionLabel 與 actionTarget 必須同時為空字串或同時非空；hero 可選頁內導覽按鈕，cta 必須提供頁內導覽按鈕，text、cards、faq 兩欄必須為空。所有文字原樣作純文字顯示，保留前後空白、換行及引號，不解析 HTML、腳本或文字中的網址。不能加入任意屬性、class、色碼、CSS、JavaScript、事件、外部圖片、外部字型、網址、表單、註冊或付款功能；不下載或執行引用內容，不宣稱程式碼沙盒、自動部署或已上線。未要求修改的文字、區塊、項目順序與穩定 id 保持原樣，不能因換主題改寫內容。完整 JSON 最多60000個 UTF8 位元組，不能截斷或用省略文字冒充完整作品。不得捏造事實、引文、來源、使用者同意或不支援的功能；匯出由固定前端模板提供，不聲稱已替使用者完成匯出或部署。';
    }
    protected function candidateProperties() {
        return array('artifact'=>webpageSchema(),'rationale'=>array('type'=>'string'),'goalText'=>array('type'=>'string'),'changeSummary'=>array('type'=>'string'));
    }
    protected function candidateResult($candidate,$label) {
        $artifact=validateWebpageArtifact($candidate['artifact']);
        return array('artifact'=>$artifact,'items'=>webpageItems($artifact),'rationale'=>textValue($candidate['rationale'],1200,$label.'說明'),
            'goalText'=>userTextValue($candidate['goalText'],6000,$label.'目標'),'changeSummary'=>userTextValue($candidate['changeSummary'],1200,$label.'變更摘要'));
    }
    protected function runGenerate($project,$instruction,$model) {
        validateModuleItemDefinitions($project['brief']['items'],'webpage');
        $data=$this->context($project);$data['variationInstruction']=$instruction;
        $props=array('candidates'=>array('type'=>'array','minItems'=>1,'maxItems'=>1,'items'=>$this->schema($this->candidateProperties())));
        $v=$this->ask($model,'使用者已確認 creativeGoal 的視覺風格、內容結構、操作功能與限制，並明確要求生成。恰好回傳1個完整原生網頁候選，不要為湊方案省略內容。creativeGoal.tone 是視覺風格，message 是內容結構，constraints 是操作功能與限制，不按一般文案語氣誤讀。variationInstruction 只在已確認方向內提供變化，衝突時優先已確認方向並交代。依已提供材料與 pinnedReferences 創作，不捏造事實或來源；引用固定版本，不自動連動其他創作項目。rationale 說明風格、結構與操作功能的對應及取捨，最多350中文字；goalText 完整保存此候選自己的三部分目標，最多1200中文字；changeSummary 如實說明初次候選採納的要求，不捏造修改或採用歷史，最多350中文字。這只是待審閱候選，不採用、不定稿、不改正式版、不部署。'.$this->artifactInstructions(),$data,$this->schema($props),24000);
        return array($this->candidateResult($v['candidates'][0],'候選'));
    }
    protected function sourceSnapshot($source) {
        $artifact=validateWebpageArtifact(field($source,'artifact'));
        $source['artifact']=$artifact;$source['items']=webpageItems($artifact);$source['contentType']='webpage';return $source;
    }
    protected function runRefine($project,$source,$text,$model,$targetItemIds=null) {
        ensure($targetItemIds===null||$targetItemIds===array(),'TARGET_ITEMS_INVALID','網頁以完整作品為修訂單位，不接受文章段落範圍。',409);
        $source=$this->sourceSnapshot($source);
        $data=$this->context($project);$data['sourceVersion']=$this->creativeVersions(array($source))[0];$data['latestUserMessage']=$text;
        $props=$this->strings(array('reply','question','rationale','goalText','changeSummary'));
        $props['outcome']=array('type'=>'string','enum'=>array('revision','clarification'));$props['artifact']=webpageSchema();$props['choices']=$this->choicesSchema();
        $v=$this->ask($model,'這是指定版本的網頁持續修訂，不是初次構思。sourceVersion 是唯一修改起點，可以是未採用候選或正式版，不要求先採用。latestUserMessage 是本次要求，歷史只作脈絡，不重做舊要求。要求清楚就 outcome=revision，實際回傳完整 artifact，不能只說已改或只給差異；未要求內容、文字、區塊、卡片或問答、相對順序與穩定 id 保持原樣，只依本次要求修改風格、結構、內容或支援的操作功能。revision 的 question 為空字串、choices 為空陣列；reply 說明提供待審閱候選，不聲稱已採用、定稿、部署或覆寫正式版。goalText 完整保存新版本自己的三部分目標，最多1200中文字；sourceVersion.goalAndRationale 存在時是使用者保存的最新目標與修改意見，優先於舊 goalText、goalSnapshot 或共用 creativeGoal；沒有合併紀錄才用 goalText，舊版才用 goalSnapshot.summary，只依本次明確要求更新目標。rationale、changeSummary 各最多350中文字，描述實際差異與取捨，reply 最多350中文字。revision 必須有可見作品、頁內操作或本版目標的實質改變，不能只改識別碼或摘要就假稱新修訂；只改目標時 artifact 原樣回傳。若只是評價、閒聊、無需改變、必要資訊不足，或要求不支援的任意 HTML、CSS、腳本、註冊、付款、表單、外部連結、圖片或部署等功能，outcome=clarification；artifact 必須原樣回傳 sourceVersion.artifact，伺服器驗證相同後捨棄，不建立版本；rationale、goalText、changeSummary 留空，reply 不可宣稱已修改。需要釐清時 question 只問一個最必要問題，最多100中文字；可直接回答就留空。choices 通常為空陣列，只有 clarification 問題適合單選才提供2至6個不同實際答案，每項含唯一 id、label、value；id 英數開頭只含英數、- 或 _，最多64字元，label 最多120個 UTF8 位元組，value 最多1000個 UTF8 位元組，不夾帶隱藏指令；自由文字始終可作答。'.$this->artifactInstructions(),$data,$this->schema($props),24000);
        $reply=textValue($v['reply'],1200,'網頁修訂回覆');$question=textValue($v['question'],600,'釐清問題',true);
        $rationale=textValue($v['rationale'],1200,'修訂說明',true);$goalText=userTextValue($v['goalText'],6000,'本版目標',true);$changeSummary=userTextValue($v['changeSummary'],1200,'變更摘要',true);
        $choices=validateDialogueChoices($v['choices'],$question);$artifact=validateWebpageArtifact($v['artifact']);
        if($v['outcome']==='clarification'){
            ensure(webpageCompactJson($artifact)===webpageCompactJson($source['artifact']),'MODEL_CLARIFICATION_ARTIFACT','AI 將討論與網頁修改混在一起，原作品不變且未保存此回覆。',502);
            // An exact bounded echo is discussion, not a version or goal edit.
            $this->rejectsCompletedEditClaim($reply."\n".$question);
            return array('outcome'=>'clarification','reply'=>'此回覆僅供討論，網頁與正式版都尚未變更。'."\n\n".$this->dialogueText($reply,$question),'items'=>array(),'rationale'=>'','question'=>$question,'choices'=>$choices);
        }
        ensure($question===''&&$choices===array()&&$rationale!==''&&$goalText!==''&&$changeSummary!=='','MODEL_OUTPUT_INVALID','實際網頁修訂必須有完整作品與說明，不可同時要求尚未回答的問題。',502);
        $combinedChanged=versionHasCombinedOverride($source)&&versionGoalAndRationale(array('goalText'=>$goalText,'changeSummary'=>$changeSummary,'rationale'=>$rationale))!==$source['goalAndRationale'];
        $artifactChanged=webpageCompactJson($artifact)!==webpageCompactJson($source['artifact']);
        $contentChanged=webpageContentFingerprint($artifact)!==webpageContentFingerprint($source['artifact']);
        // A goal-only edit must retain the exact canonical source artifact.
        // Changed goal/combined metadata cannot authorize invisible ID churn.
        ensure($contentChanged||!$artifactChanged,'MODEL_NO_REVISION','AI 只更換網頁識別碼，沒有實質內容或操作變更；只修改目標時必須完整保留原作品，未保存且未自動重試。',502);
        ensure($contentChanged||$goalText!==versionGoalText($source)||$combinedChanged,'MODEL_NO_REVISION','AI 回傳相同網頁內容、操作與本版目標，沒有建立假修訂；原版本保留，未自動重試。',502);
        $revisionReply=$artifactChanged?'已提供完整網頁修訂候選。':'此候選僅更新本版目標，完整網頁保持原樣。';
        $revisionReply.='請審閱後再決定是否採用；尚未採用、定稿或取代正式版，也沒有部署。';
        return array('outcome'=>'revision','reply'=>$revisionReply,'artifact'=>$artifact,'items'=>webpageItems($artifact),'rationale'=>$rationale,'goalText'=>$goalText,'changeSummary'=>$changeSummary,'question'=>'','choices'=>array());
    }
    protected function runFuse($project,$versions,$question,$model) {
        ensure(is_array($versions)&&count($versions)>=2&&count($versions)<=5,'FUSION_VERSIONS_INVALID','請選擇 2 至 5 個版本進行融合。',409);
        $sources=array();$ids=array();
        foreach($versions as $version){$id=field($version,'id');ensure(is_string($id)&&!in_array($id,$ids,true),'FUSION_VERSIONS_INVALID','融合來源版本不可重複或缺少識別碼。',409);$ids[]=$id;$sources[]=$this->sourceSnapshot($version);}
        $data=array('goalBasis'=>'version_snapshots','contentType'=>'webpage','creativeGoal'=>null,'goalApprovedAt'=>null,
            'selectedVersions'=>$this->creativeVersions($sources),'officialVersionId'=>$project['officialVersionId'],'question'=>$question,
            'pinnedReferences'=>$project['references'],'projectTitle'=>$project['title'],'projectDescription'=>$project['description'],
            'creativeItemTitle'=>$project['activeItem']['title'],'creativeItemDescription'=>$project['activeItem']['description'],'dialogue'=>$this->dialogue($project));
        $v=$this->ask($model,'使用者明確要求融合 selectedVersions 的2至5個選定網頁來源，產生恰好1個完整待審閱新候選，不是比較報告、不選唯一優勝、不採用或覆寫正式版。逐版理解完整 artifact 與各版自己的目標；goalAndRationale 存在時優先於舊 goalText、goalSnapshot、changeSummary、rationale，缺漏如實標示，不捏造。不能用目前共用專案目標覆蓋各版目標。依 question 整合各版的視覺風格、內容結構與可支援的操作功能；目標衝突時依本次明確選擇，否則整合相容部分並具體交代取捨，不假稱矛盾條件同時達成。只使用選定來源與已提供材料，不修改未選版本；pinnedReferences 是固定引用，不自動連動。保留未變區塊、卡片或問答與可對應的穩定 id；相同 id 在不同來源指不同內容時，僅為真正不同的新內容建立新 id 並交代，不任意全頁重編號；頁內導覽目標必須連到正確的保留或新增區塊。回傳完整作品，不能照抄其中一版假稱融合，也不能只改識別碼、版本名稱或摘要就假稱已整合。rationale 說明從哪些版本吸收哪些特色與取捨，最多350中文字；goalText 保存新融合版本自己的完整三部分目標，最多1200中文字；changeSummary 如實說明本次實際整合，最多350中文字。不宣稱已匯出、上線、部署、連動外部網站或新增不支援的操作功能。'.$this->artifactInstructions(),$data,$this->schema($this->candidateProperties()),24000);
        $result=$this->candidateResult($v,'融合');$content=webpageContentFingerprint($result['artifact']);
        foreach($sources as $source)ensure($content!==webpageContentFingerprint($source['artifact']),'MODEL_NO_REVISION','AI 只複製其中一個來源或更改識別碼，沒有形成新融合網頁；未保存假候選，也未自動重試。',502);
        return $result;
    }
}
