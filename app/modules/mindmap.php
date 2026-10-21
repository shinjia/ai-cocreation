<?php
// The shared workflow owns version snapshots, provenance and explicit adoption.
// This module never accepts an AI proposal into the user's tree automatically.
class MindmapModule extends TitleModule {
    protected function moduleType() { return 'mindmap'; }
    protected function moduleLabel() { return '心智圖'; }
    protected function context($project) {
        $data=parent::context($project);unset($data['versions']);$data['contentType']='mindmap';$data['versionIndex']=array();
        foreach($project['versions'] as $version)$data['versionIndex'][]=array('id'=>$version['id'],'title'=>field($version,'title'),'major'=>field($version,'major'),'minor'=>field($version,'minor'),'source'=>field($version,'source'));
        return $data;
    }
    protected function briefInstructions() {
        return '這是主題起步的原生心智圖，items 固定只有一項 {"id":"document","label":"心智圖來源"}。只要已有可探索的主題，就足以 directionStatus=ready；用途、讀者、語氣或限制未指定時可保持未知，不要求先收斂範圍、決定唯一主軸或填滿問卷。第一次生成只提出待選分支，勾選後才入圖；使用者也可自行輸入分支，繼續探索不必先選唯一方向。缺少主題時只問一個必要問題；有主題後不要用更多問題拖延開始。';
    }
    protected function artifactInstructions() {
        return '只回傳完整原生 artifact，精確包含 kind=mindmap、rootId、nodes、proposals，不可用段落、Markdown、HTML、圖片或省略文字代替。nodes 為1至80個已加入節點，proposals 為0至24個尚未加入心智圖的待選分支；每項精確含 id、parentId、label、description。所有 id 在兩份清單中唯一，英數開頭，僅含英數、- 或 _，最多64字元；沿用既有節點 id，不能重新編號。恰好一個根節點 parentId 為空字串且 id 等於 rootId，其餘 parentId 必須是 nodes 中既有節點；所有 nodes 連通且無循環。每個 proposal 的 parentId 都必須指向 nodes，不能指向另一個 proposal。label 不可空白，最多240個 UTF8 位元組；description 可空，最多2000個 UTF8 位元組。保留未改文字的前後空白與換行；完整 JSON 最多60000個 UTF8 位元組，不截斷。proposals 是可選建議，不是事實、已同意內容或已入圖節點，只有使用者勾選並加入草稿後才入圖。不得捏造材料、引文、來源或使用者同意；可以提出清楚標為建議的探索角度。維持可繼續探索和自由輸入，不過早收斂。';
    }
    protected function candidateProperties() {
        return array('artifact'=>mindmapSchema(),'rationale'=>array('type'=>'string'),'goalText'=>array('type'=>'string'),'changeSummary'=>array('type'=>'string'));
    }
    protected function candidateResult($candidate,$label) {
        $artifact=validateMindmapArtifact($candidate['artifact']);
        return array('artifact'=>$artifact,'items'=>mindmapItems($artifact),'rationale'=>textValue($candidate['rationale'],1200,$label.'說明'),
            'goalText'=>userTextValue($candidate['goalText'],6000,$label.'目標'),'changeSummary'=>userTextValue($candidate['changeSummary'],1200,$label.'變更摘要'));
    }
    protected function runGenerate($project,$instruction,$model) {
        validateModuleItemDefinitions($project['brief']['items'],'mindmap');
        $data=$this->context($project);$data['variationInstruction']=$instruction;
        $props=array('candidates'=>array('type'=>'array','minItems'=>1,'maxItems'=>1,'items'=>$this->schema($this->candidateProperties())));
        $v=$this->ask($model,'使用者已確認主題並要求生成。恰好回傳1個完整心智圖候選：nodes 只能有主題根節點，從已確認 creativeGoal 與材料命名；提出2至12個可供勾選的主要分支，全部放在 proposals 且 parentId 等於 rootId，絕不自動加入 nodes。不同探索角度可以並列，不強迫選唯一方向，不以建議冒充使用者已選。variationInstruction 只在已確認主題內提供變化。rationale 說明探索角度與取捨，並明說待選分支須勾選後才入圖，最多350中文字；goalText 完整保存此候選自己的目標，最多1200中文字；changeSummary 如實說明初次提出待選分支，不捏造修改或採用歷史，最多350中文字。這只是待審閱候選，不採用、不定稿、不改正式版。'.$this->artifactInstructions(),$data,$this->schema($props),24000);
        $result=$this->candidateResult($v['candidates'][0],'候選');$artifact=$result['artifact'];
        ensure(count($artifact['nodes'])===1&&count($artifact['proposals'])>=2&&count($artifact['proposals'])<=12,'MODEL_MINDMAP_GENERATION','AI 初次心智圖只能包含主題根節點與2至12個待選分支，未保存自動入圖的結果。',502);
        foreach($artifact['proposals'] as $proposal)ensure($proposal['parentId']===$artifact['rootId'],'MODEL_MINDMAP_GENERATION','初次待選分支必須全部屬於主題根節點。',502);
        // A deterministic notice cannot be omitted by a provider response. Its
        // bytes count toward the same stored rationale limit; never truncate.
        $notice="待選分支尚未加入心智圖，勾選並加入草稿後才入圖。\n\n";
        ensure(strlen($notice)+strlen($result['rationale'])<=1200,'MODEL_OUTPUT_INVALID','候選說明超過完整保存上限，未截斷或保存此結果。',502);
        $result['rationale']=$notice.$result['rationale'];
        return array($result);
    }
    protected function sourceSnapshot($source) {
        $artifact=validateMindmapArtifact(field($source,'artifact'));
        $source['artifact']=$artifact;$source['items']=mindmapItems($artifact);$source['contentType']='mindmap';return $source;
    }
    protected function pendingFor($artifact,$nodeId,$matching) {
        $out=array();foreach($artifact['proposals'] as $proposal)if(($proposal['parentId']===$nodeId)===$matching)$out[]=$proposal;return $out;
    }
    protected function runRefine($project,$source,$text,$model,$targetItemIds=null) {
        ensure($targetItemIds===null||$targetItemIds===array(),'TARGET_ITEMS_INVALID','心智圖以節點及完整作品為單位，不接受文章段落範圍。',409);
        $source=$this->sourceSnapshot($source);$targetId=field($project,'mindmapTargetNodeId');
        ensure(is_string($targetId)&&mindmapNode($source['artifact'],$targetId)!==null,'MINDMAP_TARGET_INVALID','請從本次來源版本選擇一個已加入心智圖的節點，再提出子分支要求。',409);
        $data=$this->context($project);$data['sourceVersion']=$this->creativeVersions(array($source))[0];$data['latestUserMessage']=$text;$data['mindmapTargetNodeId']=$targetId;$data['selectedNode']=mindmapNode($source['artifact'],$targetId);
        $props=$this->strings(array('reply','question','rationale','goalText','changeSummary'));
        $props['outcome']=array('type'=>'string','enum'=>array('revision','clarification'));$props['artifact']=mindmapSchema();$props['choices']=$this->choicesSchema();
        $v=$this->ask($model,'這是指定版本的心智圖子分支探索。sourceVersion 是唯一來源，無須先採用。mindmapTargetNodeId 是使用者明確選定的既有節點；本次只能為此節點提出2至12個待選子分支並取代此節點原有的待選集合，或依明確要求只更新本版目標。rootId 與 nodes 包含清單順序、id、parentId、label、description 必須逐字原樣保留，不能新增、改名、移動、合併或刪除任何已入圖節點。其他父節點的 proposals 包括相對順序、文字、id 必須全部原樣保留；全圖待選分支總數最多24個，容量不足就 clarification，不能刪除其他待選分支騰位置。若使用者要求改名、說明、移動或合併既有節點，先用 clarification 說明可在手動編輯區操作，不假稱 AI 已改動。新的子分支只放 proposals，不能因討論文字、選項或過去意見自動加入 nodes。要求清楚時 outcome=revision，回傳完整 artifact；reply 說明提供待選分支，明說勾選後才入圖，不宣稱已修改、採用或定稿已入圖內容。revision 的 question 為空字串、choices 為空陣列。goalText 完整保存此版本自己的目標，最多1200中文字；sourceVersion.goalAndRationale 若存在是使用者保存的最新目標與修改意見，優先於舊 goalText、goalSnapshot 或共用 creativeGoal；只有本次明確要求才能更改目標。rationale 與 changeSummary 各最多350中文字，描述實際待選變化，reply 最多350中文字。revision 必須有待選分支或本版目標的實質改變，不能只重排待選分支或改版本摘要就假稱新探索；只改目標時 artifact 完整原樣回傳。若只是詢問評價、閒聊、無需改變、改動已入圖內容或缺少必要資訊，outcome=clarification；artifact 必須逐字回傳 sourceVersion.artifact，伺服器驗證相同後捨棄，不建立版本；rationale、goalText、changeSummary 留空，reply 不可宣稱已修改。需要釐清時 question 只問一個最必要問題，最多100中文字；可直接回答則留空，不強迫收斂。choices 通常為空陣列；只有 clarification 的問題適合單選時提供2至6個不同實際答案，各含唯一 id、label、value；id 為英數短鍵可含 - 或 _、最多64字元；label 最多120個 UTF8 位元組，value 最多1000個 UTF8 位元組。自由文字始終可作答，對話 choices 絕不等於勾選入圖。'.$this->artifactInstructions(),$data,$this->schema($props),24000);
        $reply=textValue($v['reply'],1200,'心智圖探索回覆');$question=textValue($v['question'],600,'釐清問題',true);
        $rationale=textValue($v['rationale'],1200,'探索說明',true);$goalText=userTextValue($v['goalText'],6000,'本版目標',true);$changeSummary=userTextValue($v['changeSummary'],1200,'探索變更整理',true);
        $choices=validateDialogueChoices($v['choices'],$question);$artifact=validateMindmapArtifact($v['artifact']);
        if($v['outcome']==='clarification'){
            ensure($artifact===$source['artifact'],'MODEL_CLARIFICATION_ARTIFACT','AI 將討論與心智圖修改混在一起，原作品不變且未保存此回覆。',502);
            // Metadata has been bounded above, then discarded with the echo.
            $this->rejectsCompletedEditClaim($reply."\n".$question);
            return array('outcome'=>'clarification','reply'=>'此回覆僅供討論，心智圖與正式版都尚未變更。'."\n\n".$this->dialogueText($reply,$question),'items'=>array(),'rationale'=>'','question'=>$question,'choices'=>$choices);
        }
        ensure($question===''&&$choices===array()&&$rationale!==''&&$goalText!==''&&$changeSummary!=='','MODEL_OUTPUT_INVALID','實際探索修訂必須有完整作品與說明，不可同時要求尚未回答的問題。',502);
        ensure($artifact['rootId']===$source['artifact']['rootId']&&mindmapNodesEqual($artifact['nodes'],$source['artifact']['nodes']),'MODEL_MINDMAP_ACCEPTED_CHANGED','AI 不可自動修改已加入的心智圖節點，未保存此結果。',502);
        ensure($this->pendingFor($artifact,$targetId,false)===$this->pendingFor($source['artifact'],$targetId,false),'MODEL_MINDMAP_PENDING_CHANGED','AI 不可修改其他節點的待選分支，未保存此結果。',502);
        $pending=$this->pendingFor($artifact,$targetId,true);$previous=$this->pendingFor($source['artifact'],$targetId,true);
        // Ignore proposal list order when deciding whether exploration changed.
        $pendingById=array();foreach($pending as $entry)$pendingById[$entry['id']]=$entry;ksort($pendingById,SORT_STRING);
        $previousById=array();foreach($previous as $entry)$previousById[$entry['id']]=$entry;ksort($previousById,SORT_STRING);
        $pendingChanged=$pendingById!==$previousById;
        ensure(!$pendingChanged||(count($pending)>=2&&count($pending)<=12),'MODEL_MINDMAP_PENDING_COUNT','新的子分支集合必須包含2至12個待選分支，未保存此結果。',502);
        // A manually edited combined note is authoritative and cannot be
        // losslessly split. A deliberate return to legacy goalText is a real
        // goal revision when that authoritative combined note has changed.
        $combinedChanged=versionHasCombinedOverride($source)&&versionGoalAndRationale(array('goalText'=>$goalText,'changeSummary'=>$changeSummary,'rationale'=>$rationale))!==$source['goalAndRationale'];
        $goalChanged=$goalText!==versionGoalText($source)||$combinedChanged;
        ensure($pendingChanged||$goalChanged,'MODEL_NO_REVISION','AI 回傳相同的待選分支與本版目標，沒有建立假修訂；原版本保留且未自動重試。',502);
        // The provider reply was bounded above, but is not authoritative about
        // completed edits. Use a factual server reply instead: truthful edits
        // to pending proposals are allowed, accepted-tree claims never leak.
        $revisionReply=$pendingChanged?'已更新所選節點的待選子分支；勾選並加入草稿後才入圖。':'此候選僅更新本版目標，完整心智圖與待選分支保持原樣。';
        $revisionReply.='已加入的節點保持不變；這仍是待審閱候選，未採用或取代正式版。';
        return array('outcome'=>'revision','reply'=>$revisionReply,
            'artifact'=>$artifact,'items'=>mindmapItems($artifact),'rationale'=>$rationale,'goalText'=>$goalText,'changeSummary'=>$changeSummary,'question'=>'','choices'=>array());
    }
    protected function runFuse($project,$versions,$question,$model) {
        ensure(is_array($versions)&&count($versions)>=2&&count($versions)<=5,'FUSION_VERSIONS_INVALID','請選擇 2 至 5 個版本進行融合。',409);
        $sources=array();$ids=array();$accepted=array();
        foreach($versions as $version){
            $id=field($version,'id');ensure(is_string($id)&&!in_array($id,$ids,true),'FUSION_VERSIONS_INVALID','融合來源版本不可重複或缺少識別碼。',409);$ids[]=$id;
            $source=$this->sourceSnapshot($version);$sources[]=$source;
            foreach($source['artifact']['nodes'] as $node)$accepted[]=array('id'=>$node['id'],'label'=>$node['label'],'description'=>$node['description']);
        }
        $data=array('goalBasis'=>'version_snapshots','contentType'=>'mindmap','creativeGoal'=>null,'goalApprovedAt'=>null,
            'selectedVersions'=>$this->creativeVersions($sources),'officialVersionId'=>$project['officialVersionId'],'question'=>$question,
            'pinnedReferences'=>$project['references'],'projectTitle'=>$project['title'],'projectDescription'=>$project['description'],
            'creativeItemTitle'=>$project['activeItem']['title'],'creativeItemDescription'=>$project['activeItem']['description'],'dialogue'=>$this->dialogue($project));
        $v=$this->ask($model,'使用者明確要求融合 selectedVersions 的2至5個心智圖來源，產生恰好1個完整待審閱候選，不是比較報告、不選唯一優勝、不採用或覆寫正式版。逐版理解完整 artifact 與該版目標；goalAndRationale 存在時優先於舊 goalText、goalSnapshot、changeSummary、rationale，缺漏誠實標示，不捏造。不能用目前共用專案目標覆蓋各版目標。依 question 整合可相容的探索方向，衝突時交代取捨，不過早強迫收斂。融合 nodes 中每個節點的 id、label、description 三欄必須完整相同地出現在至少一個選定來源的 nodes 中，只可重新組織 parentId 形成一棵合法樹；不能發明已加入節點、重編 id、改名、改說明，或把任何來源 proposals 當成已加入節點。需要新角度一律放 proposals，仍須使用者勾選；來源同 id 不同內容時選定其中一個完整節點，不混搭欄位。完整回傳根、全部已加入節點及待選分支。不能照抄其中一版的完整 artifact 假稱融合。rationale 說明來源版本、組織調整和待選取捨，最多350中文字；goalText 保存新融合版本自己的完整目標，最多1200中文字；changeSummary 描述本次實際整合且不聲稱已採用，最多350中文字。'.$this->artifactInstructions(),$data,$this->schema($this->candidateProperties()),24000);
        $result=$this->candidateResult($v,'融合');
        foreach($result['artifact']['nodes'] as $node){
            $identity=array('id'=>$node['id'],'label'=>$node['label'],'description'=>$node['description']);
            ensure(in_array($identity,$accepted,true),'MODEL_MINDMAP_FUSION_NODE','融合只能重組已選來源的已加入節點，不能自動加入待選或新造節點，未保存此結果。',502);
        }
        foreach($sources as $source)ensure($result['artifact']!==$source['artifact'],'MODEL_NO_REVISION','AI 只複製其中一個來源，沒有形成新融合心智圖；未保存假候選，也未自動重試。',502);
        return $result;
    }
}
