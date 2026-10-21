<?php
// The same fixed project text/structured model creates native geometry. There
// is no image endpoint, raster tracing, paid add-on, or external-tool import.
class VectorModule extends TitleModule {
    protected function moduleType() { return 'vector'; }
    protected function moduleLabel() { return '向量圖形'; }
    protected function context($project) {
        $data=parent::context($project);unset($data['versions']);$data['contentType']='vector';$data['versionIndex']=array();
        foreach($project['versions'] as $version)$data['versionIndex'][]=array('id'=>$version['id'],'title'=>field($version,'title'),'major'=>field($version,'major'),'minor'=>field($version,'minor'),'source'=>field($version,'source'));
        return $data;
    }
    protected function briefInstructions() {
        return '這是可編輯基本圖形的原生向量創作，items 固定只有一項 {"id":"document","label":"向量圖形來源"}，不能把圖層或物件拆成創作項目。先了解用途、需要表達的內容及必要限制；已有足夠方向就 ready，非關鍵的畫布、配色與排版未知時可提出清楚標為建議的選擇，不要求填完問卷。使用專案固定的文字／結構化模型產生矩形、橢圓、直線、多邊形、折線和文字，不會另行呼叫圖片模型或串接付費圖片服務；原本模型服務費用仍依原設定。不能生成照片、點陣插畫、追蹤點陣圖、任意 SVG 路徑或貝茲曲線。使用者需要不支援的媒材時如實說明，先確認是否改用基本向量圖形，不假裝已生成圖片。可匯出保留獨立圖形與文字的 SVG，不能宣稱所有軟體可無損匯入；使用者所稱形坊的目前名稱與匯入規格尚未驗證，不假稱已連接、驗證相容或自動匯入。';
    }
    protected function artifactInstructions() {
        return '只回傳完整原生 artifact，精確含 kind=vector、title、width、height、background、shapes，不能以 SVG/XML 字串、HTML、CSS、JavaScript、Markdown、圖片或網址代替。title 可空，最多600個 UTF8 位元組；畫布 width、height 為1至4096的整數。background、每個 fill 與 stroke 只接受六位十六進位色碼（如 #123ABC）或 none，不接受 CSS 名稱、url()、漸層、濾鏡或外部資源。shapes 為1至100個物件，清單順序就是由底至頂的繪製順序。每個物件精確含 id、type、label、x、y、width、height、fill、stroke、strokeWidth、opacity、text、fontSize、points，不省略也不增加欄位。id 英數開頭，只含英數、- 或 _，最多64字元且全圖唯一；同一物件沿用穩定 id，不重新編號，只有新物件才新增 id。label 可空，最多120個 UTF8 位元組。type 只能是 rect、ellipse、line、polygon、polyline、text。所有數值最多三位小數，超精度會拒收而不四捨五入。x、y 是有限數字，範圍-4096至8192；width、height 是有限數字，範圍-8192至8192。rect、ellipse 的寬高必須大於零，x、y 是外接框左上角；line 從 (x,y) 到 (x+width,y+height)，寬高是可負或為零的端點差量；其餘類型 width、height 都必須為零。strokeWidth 為0至100，opacity 為0至1。text 類型的 text 不可空白、最多4000個 UTF8 位元組，fontSize 為1至512；其他類型 text 必須是空字串、fontSize 必須為0。文字只作原樣純文字，不解析 HTML、腳本或連結，不下載任何字型。polygon 的 points 為3至80個頂點，polyline 為2至80個頂點，其餘類型一律為空陣列；每個頂點精確含有限數字 x、y，範圍-4096至8192，為物件本地座標，再加上物件 x、y 平移。不支援 path、貝茲曲線、圖片嵌入、外部 URL、字型指定、任意 SVG、事件屬性或程式。未要求修改的物件、文字（含前後空白及換行）、層次順序和穩定 id 保持原樣，不能因改配色偷偷改文字。完整 JSON 最多60000個 UTF8 位元組，不能截斷或用省略文字冒充完整作品。不得捏造事實、引文、來源、使用者同意或已驗證的外部相容性；這是基本可編輯向量，不是照片或點陣圖，也不保證形坊等工具的匯入效果。';
    }
    protected function candidateProperties() {
        return array('artifact'=>vectorSchema(),'rationale'=>array('type'=>'string'),'goalText'=>array('type'=>'string'),'changeSummary'=>array('type'=>'string'));
    }
    protected function candidateResult($candidate,$label) {
        $artifact=validateVectorArtifact($candidate['artifact']);
        return array('artifact'=>$artifact,'items'=>vectorItems($artifact),'rationale'=>textValue($candidate['rationale'],1200,$label.'說明'),
            'goalText'=>userTextValue($candidate['goalText'],6000,$label.'目標'),'changeSummary'=>userTextValue($candidate['changeSummary'],1200,$label.'變更摘要'));
    }
    protected function runGenerate($project,$instruction,$model) {
        validateModuleItemDefinitions($project['brief']['items'],'vector');
        $data=$this->context($project);$data['variationInstruction']=$instruction;
        $props=array('candidates'=>array('type'=>'array','minItems'=>1,'maxItems'=>1,'items'=>$this->schema($this->candidateProperties())));
        $v=$this->ask($model,'使用者已確認 creativeGoal 並明確要求生成。恰好回傳1個完整向量圖形候選，以獨立圖形與文字構成可編輯作品，不要為湊方案省略內容。variationInstruction 只在已確認方向內提供變化，衝突時優先已確認方向並交代。依已提供材料與 pinnedReferences 創作，不捏造事實或來源。rationale 說明構圖、配色與主軸的對應及取捨，最多350中文字；goalText 完整保存此候選自己的目標，最多1200中文字；changeSummary 如實說明初次候選採納的要求，不捏造修改或採用歷史，最多350中文字。這只是待審閱候選，不採用、不定稿、不改正式版。'.$this->artifactInstructions(),$data,$this->schema($props),24000);
        return array($this->candidateResult($v['candidates'][0],'候選'));
    }
    protected function sourceSnapshot($source) {
        $artifact=validateVectorArtifact(field($source,'artifact'));
        $source['artifact']=$artifact;$source['items']=vectorItems($artifact);$source['contentType']='vector';return $source;
    }
    protected function runRefine($project,$source,$text,$model,$targetItemIds=null) {
        ensure($targetItemIds===null||$targetItemIds===array(),'TARGET_ITEMS_INVALID','向量圖形以完整作品為修訂單位，不接受文章段落範圍。',409);
        $source=$this->sourceSnapshot($source);
        $data=$this->context($project);$data['sourceVersion']=$this->creativeVersions(array($source))[0];$data['latestUserMessage']=$text;
        $props=$this->strings(array('reply','question','rationale','goalText','changeSummary'));
        $props['outcome']=array('type'=>'string','enum'=>array('revision','clarification'));$props['artifact']=vectorSchema();$props['choices']=$this->choicesSchema();
        $v=$this->ask($model,'這是指定版本的向量圖形持續修訂，不是初次構思。sourceVersion 是唯一修改起點，可以是未採用候選或正式版，不要求先採用。latestUserMessage 是本次要求，歷史只作脈絡，不重做舊要求。要求清楚就 outcome=revision，實際回傳完整 artifact，不能只說已改或只給差異；未要求內容、文字、物件、相對層次與穩定 id 保持原樣，只依本次要求增刪、移動、縮放、改色或改文字。revision 的 question 為空字串、choices 為空陣列；reply 說明提供待審閱候選，不聲稱已採用、定稿或覆寫正式版。goalText 完整保存新版本自己的目標，最多1200中文字；sourceVersion.goalAndRationale 存在時是使用者保存的最新目標與修改意見，優先於舊 goalText、goalSnapshot 或共用 creativeGoal；沒有合併紀錄才用 goalText，舊版才用 goalSnapshot.summary，只依本次明確要求更新目標。rationale、changeSummary 各最多350中文字，描述實際差異與取捨，reply 最多350中文字。revision 必須有作品或本版目標的實質改變，不能只改摘要就假稱新修訂；只改目標時 artifact 原樣回傳。若只是評價、閒聊、無需改變、必要資訊不足，或要求不支援的照片、點陣、外部資源、任意路徑等功能，outcome=clarification；artifact 必須原樣回傳 sourceVersion.artifact，伺服器驗證相同後捨棄，不建立版本；rationale、goalText、changeSummary 留空，reply 不可宣稱已修改。需要釐清時 question 只問一個最必要問題，最多100中文字；可直接回答就留空。choices 通常為空陣列，只有 clarification 問題適合單選才提供2至6個不同實際答案，每項含唯一 id、label、value；id 英數開頭只含英數、- 或 _，最多64字元，label 最多120個 UTF8 位元組，value 最多1000個 UTF8 位元組，不夾帶隱藏指令；自由文字始終可作答。'.$this->artifactInstructions(),$data,$this->schema($props),24000);
        $reply=textValue($v['reply'],1200,'向量修訂回覆');$question=textValue($v['question'],600,'釐清問題',true);
        $rationale=textValue($v['rationale'],1200,'修訂說明',true);$goalText=userTextValue($v['goalText'],6000,'本版目標',true);$changeSummary=userTextValue($v['changeSummary'],1200,'變更摘要',true);
        $choices=validateDialogueChoices($v['choices'],$question);$artifact=validateVectorArtifact($v['artifact']);
        if($v['outcome']==='clarification'){
            ensure(vectorCompactJson($artifact)===vectorCompactJson($source['artifact']),'MODEL_CLARIFICATION_ARTIFACT','AI 將討論與向量修改混在一起，原作品不變且未保存此回覆。',502);
            // Bounded echoed artifact/metadata are discarded, never saved as a
            // version or a goal update. Discussion cannot claim completed edits.
            $this->rejectsCompletedEditClaim($reply."\n".$question);
            return array('outcome'=>'clarification','reply'=>'此回覆僅供討論，向量圖形與正式版都尚未變更。'."\n\n".$this->dialogueText($reply,$question),'items'=>array(),'rationale'=>'','question'=>$question,'choices'=>$choices);
        }
        ensure($question===''&&$choices===array()&&$rationale!==''&&$goalText!==''&&$changeSummary!=='','MODEL_OUTPUT_INVALID','實際向量修訂必須有完整作品與說明，不可同時要求尚未回答的問題。',502);
        $combinedChanged=versionHasCombinedOverride($source)&&versionGoalAndRationale(array('goalText'=>$goalText,'changeSummary'=>$changeSummary,'rationale'=>$rationale))!==$source['goalAndRationale'];
        $artifactChanged=vectorCompactJson($artifact)!==vectorCompactJson($source['artifact']);
        ensure($artifactChanged||$goalText!==versionGoalText($source)||$combinedChanged,'MODEL_NO_REVISION','AI 回傳相同向量作品和本版目標，沒有建立假修訂；原版本保留，未自動重試。',502);
        // The candidate is real, but adoption is owned by the shared explicit
        // user workflow. Do not forward an erroneous model adoption claim.
        $revisionReply=$artifactChanged?'已提供完整向量修訂候選。':'此候選僅更新本版目標，完整向量圖形保持原樣。';
        $revisionReply.='請審閱後再決定是否採用；尚未採用、定稿或取代正式版。';
        return array('outcome'=>'revision','reply'=>$revisionReply,'artifact'=>$artifact,'items'=>vectorItems($artifact),'rationale'=>$rationale,'goalText'=>$goalText,'changeSummary'=>$changeSummary,'question'=>'','choices'=>array());
    }
    protected function runFuse($project,$versions,$question,$model) {
        ensure(is_array($versions)&&count($versions)>=2&&count($versions)<=5,'FUSION_VERSIONS_INVALID','請選擇 2 至 5 個版本進行融合。',409);
        $sources=array();$ids=array();
        foreach($versions as $version){$id=field($version,'id');ensure(is_string($id)&&!in_array($id,$ids,true),'FUSION_VERSIONS_INVALID','融合來源版本不可重複或缺少識別碼。',409);$ids[]=$id;$sources[]=$this->sourceSnapshot($version);}
        $data=array('goalBasis'=>'version_snapshots','contentType'=>'vector','creativeGoal'=>null,'goalApprovedAt'=>null,
            'selectedVersions'=>$this->creativeVersions($sources),'officialVersionId'=>$project['officialVersionId'],'question'=>$question,
            'pinnedReferences'=>$project['references'],'projectTitle'=>$project['title'],'projectDescription'=>$project['description'],
            'creativeItemTitle'=>$project['activeItem']['title'],'creativeItemDescription'=>$project['activeItem']['description'],'dialogue'=>$this->dialogue($project));
        $v=$this->ask($model,'使用者明確要求融合 selectedVersions 的2至5個選定向量來源，產生恰好1個完整待審閱新候選，不是比較報告、不選唯一優勝、不採用或覆寫正式版。逐版理解完整 artifact 與各版自己的目標；goalAndRationale 存在時優先於舊 goalText、goalSnapshot、changeSummary、rationale，缺漏如實標示，不捏造。不能用目前共用專案目標覆蓋各版目標。依 question 整合各版的構圖、可編輯物件、文字與配色；目標衝突時依本次明確選擇，否則整合相容部分並具體交代取捨，不假稱矛盾條件同時達成。只使用選定來源與已提供材料，不修改未選版本。保留未變物件與可對應的穩定 id；相同 id 在不同來源指不同物件時，僅為真正不同的新物件建立新 id 並交代，不任意全圖重編號。回傳完整作品，不能照抄其中一版假稱融合，也不能只改標題、物件名稱或摘要就假稱已整合圖形。rationale 說明從哪些版本吸收哪些特色與取捨，最多350中文字；goalText 保存新融合版本自己的完整目標，最多1200中文字；changeSummary 如實說明本次實際整合，最多350中文字。不能宣稱已匯出、已驗證形坊相容或完成外部匯入。'.$this->artifactInstructions(),$data,$this->schema($this->candidateProperties()),24000);
        $result=$this->candidateResult($v,'融合');
        $drawing=vectorDrawingFingerprint($result['artifact']);
        foreach($sources as $source)ensure($drawing!==vectorDrawingFingerprint($source['artifact']),'MODEL_NO_REVISION','AI 只複製其中一個來源或更改名稱，沒有形成新融合向量圖形；未保存假候選，也未自動重試。',502);
        return $result;
    }
}
