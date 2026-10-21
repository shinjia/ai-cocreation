<?php
// Tables and charts use the existing fixed-model conversation/version workflow.
// The native artifact is authoritative. Legacy items are generated here, never
// accepted from the model as a substitute for independent rows/cells or TSV.
class ArtifactModule extends TitleModule {
    private $type;
    public function __construct($model,$type) {
        ensure(artifactType($type),'MODULE_UNAVAILABLE','此原生作品模組尚未提供。',409);
        parent::__construct($model);$this->type=$type;
    }
    protected function moduleType() { return $this->type; }
    protected function moduleLabel() { return $this->type==='table'?'表格':'圖表'; }
    protected function context($project) {
        $data=parent::context($project);unset($data['versions']);$data['contentType']=$this->type;$data['versionIndex']=array();
        foreach($project['versions'] as $version)$data['versionIndex'][]=array('id'=>$version['id'],'title'=>field($version,'title'),'major'=>field($version,'major'),'minor'=>field($version,'minor'),'source'=>field($version,'source'));
        return $data; // Full artifacts are supplied only for explicitly selected sources.
    }
    protected function briefInstructions() {
        $fixed=$this->type==='table'?'{"id":"document","label":"表格內容"}':'{"id":"document","label":"圖表來源"}';
        $instructions='這是原生'.$this->moduleLabel().'創作，items 固定只有一項 '.$fixed.'，不能把資料欄位、數列或資料列拆成創作項目。先釐清用途、讀者、必須呈現的資訊及必要限制即可；未知非關鍵細節不應阻礙進行。';
        if($this->type==='chart')$instructions.='圖表以流程圖與節點連線圖為主要用途，預設 flowchart；先釐清使用者實際要表達的流程、節點和關係，不要求流程圖提供統計數字。流程已清楚即可 ready，不用額外追問圖型或統計資料。使用者明確需要統計呈現時才選 bar、line、pie，此時需有已提供或明確選定來源中的實際數據；缺少必要數據時維持 exploring 並問一個必要問題，不以範例數字冒充真實資料。可討論視覺及直接修改文字來源，不宣稱支援完整 Mermaid 語法，亦不宣稱已連接、驗證或自動匯入圖坊；這是供使用者手動複製的來源文字。';
        return $instructions;
    }
    protected function artifactInstructions() {
        $shared='只回傳完整原生 artifact，不能用文字段落、HTML、圖片網址、Markdown 或占位文字代替。完整 artifact JSON 最多60000個 UTF8 位元組；若超出本次完整輸出容量，不得截斷或以省略文字假稱完整。不得捏造數據、事實、引文或來源，數字必須來自使用者提供的材料或明確選取的來源；不足時先釐清。';
        if($this->type==='table')return $shared.' 表格 artifact 精確包含 kind=table、caption、columns、rows。caption 最多600個 UTF8 位元組；columns 為1至12個 {id,label}，label 不得空白且最多120個 UTF8 位元組；rows 為1至100個 {id,cells}，每列 cells 的字串數必須等於欄數，每格最多2000個 UTF8 位元組，可為空字串。欄與列 id 各自唯一，必須以英數開頭，僅含英數、- 或 _，最多64字元。同一欄列的 id 必須沿用，不因排序或措辭修改而重編號；只有真正新增欄列才產生新 id。未要求修改的儲存格連同前後空白逐字保留。所有儲存格僅是文字，公式不會執行；不要聲稱計算引擎或外部連動已完成。';
        return $shared.' 圖表 artifact 精確包含 kind=chart、chartType、title、xLabel、yLabel、sourceText。chartType 預設 flowchart，另可為 bar、line 或 pie；title 最多600個 UTF8 位元組；xLabel、yLabel 各最多120個 UTF8 位元組，在流程圖為空字串且不作座標軸。sourceText 最多12000個 UTF8 位元組。流程圖 sourceText 是受限安全 Mermaid 子集：首個有效行為 flowchart TD 或 flowchart LR，也接受 graph 及 TB（等同 TD）。其後每行僅一個節點宣告或連線；節點 A["文字"] 為矩形、B{"判斷"} 為菱形、C("開始") 為圓角，一般純文字可不加外層雙引號，但含中括號、大括號、小括號或分號時必須使用一組外層雙引號，不能把其他節點或指令混入標籤。節點 id 為英文字母開頭，只含英數與底線，最多40字元，不可用 end、subgraph、click、style、classDef、class、direction、linkStyle、flowchart、graph 等保留字，忽略大小寫。1至40個節點，每個 id 只宣告一次。連線僅 A --> B 或 A -->|是| B，最多80條；端點都必須獨立宣告，不可邊連線邊宣告節點，也不可串接 A --> B --> C。相同起點、終點、標籤不可重複；可有循環或自我連線。節點文字非空且最多240個 UTF8 位元組；連線標籤最多120個 UTF8 位元組，可加一組外層雙引號；內文不可含控制字元、雙引號、反引號、反斜線、尖括號、&、#、|、網址或連結，不解碼 HTML entities 或 JSON escapes。可用空白行、一般 %% 註解和行尾單一分號；禁止 %%{ 初始化指令、subgraph、click、style、classDef、HTML、Markdown、圖片、URL、任意屬性或執行程式。不捏造未提供的流程步驟或假稱範例就是使用者流程；沿用有相同意義的節點 id，只依本次要求修改節點、文字與關係。不能稱為完整 Mermaid 引擎或保證圖坊匯入。只有 bar、line、pie 的 sourceText 使用真實 TSV，非 Markdown：第一列為分類標頭加1至5個不重複的數列標頭，其後1至24列資料，每列與標頭欄數一致，分類名稱不重複；每個標頭及分類名稱非空且最多120個 UTF8 位元組，不含換行或內嵌 Tab。數值為無前後空白的十進位字串，可正負號或 .5，不可科學記號、1.、NaN、Infinity、公式或千位逗號；絕對值最多1兆。pie 恰好一個數列，所有數值非負且總和大於零。不得為改視覺偷偷更換資料。TSV 只可供使用者手動複製，不宣稱已驗證圖坊相容格式或完成自動匯入。';
    }
    protected function candidateProperties() {
        return array('artifact'=>artifactSchema($this->type),'rationale'=>array('type'=>'string'),'goalText'=>array('type'=>'string'),'changeSummary'=>array('type'=>'string'));
    }
    protected function candidateResult($candidate,$label) {
        $artifact=validateArtifact($candidate['artifact'],$this->type);
        return array('artifact'=>$artifact,'items'=>artifactItems($artifact),'rationale'=>textValue($candidate['rationale'],1200,$label.'說明'),
            'goalText'=>userTextValue($candidate['goalText'],6000,$label.'目標'),'changeSummary'=>userTextValue($candidate['changeSummary'],1200,$label.'變更摘要'));
    }
    protected function runGenerate($project,$instruction,$model) {
        validateModuleItemDefinitions($project['brief']['items'],$this->type);
        $data=$this->context($project);$data['variationInstruction']=$instruction;
        $props=array('candidates'=>array('type'=>'array','minItems'=>1,'maxItems'=>1,'items'=>$this->schema($this->candidateProperties())));
        $v=$this->ask($model,'使用者已確認 creativeGoal，明確要求本次生成。恰好產生1個可直接審閱的完整候選，不要為湊多個方案犧牲完整性。variationInstruction 只在已確認方向內提供變化，衝突時優先已確認方向並說明。忠實依照材料和 pinnedReferences，不把建議數據當成事實。rationale 說明與主軸的對應及取捨，最多350中文字；goalText 以完整一段保存此候選自己的目標，最多1200中文字；changeSummary 說明採納的要求，最多350中文字，初次生成不捏造修改歷史。這只是待審閱候選，不採用、不定稿、不改正式版。'.$this->artifactInstructions(),$data,$this->schema($props),24000);
        return array($this->candidateResult($v['candidates'][0],'候選'));
    }
    protected function sourceSnapshot($source) {
        $artifact=validateArtifact(field($source,'artifact'),$this->type);
        $source['artifact']=$artifact;$source['items']=artifactItems($artifact);$source['contentType']=$this->type;
        return $source;
    }
    protected function runRefine($project,$source,$text,$model,$targetItemIds=null) {
        ensure($targetItemIds===null||$targetItemIds===array(),'TARGET_ITEMS_INVALID','表格與圖表以完整作品為修訂單位，不接受文章段落範圍。',409);
        $source=$this->sourceSnapshot($source);
        $data=$this->context($project);$data['sourceVersion']=$this->creativeVersions(array($source))[0];$data['latestUserMessage']=$text;
        $props=$this->strings(array('reply','question','rationale','goalText','changeSummary'));
        $props['outcome']=array('type'=>'string','enum'=>array('revision','clarification'));$props['artifact']=artifactSchema($this->type);$props['choices']=$this->choicesSchema();
        // A strict provider schema cannot use a partial/empty artifact for
        // clarification. Require the exact source echo, verify it, then discard
        // it. No echoed artifact or metadata becomes a version or a goal edit.
        $v=$this->ask($model,'這是指定版本的持續修訂，不是初次構思。sourceVersion 是唯一修改起點，可能是候選或正式版，不要求先採用。latestUserMessage 是本次要求，歷史只作脈絡，不重做舊要求。要求清楚就 outcome=revision，實際回傳完整 artifact，不只口頭描述或差異；未要求內容保持原樣。只在使用者明確要求時增刪欄列或資料；沿用未刪除欄列的穩定 id。revision 的 question 必須為空字串、choices 為空陣列；reply 簡短說明提供待審閱修訂，不宣稱已採用、定稿或覆寫正式版。goalText 以完整一段保存新版本目標，最多1200中文字；sourceVersion.goalAndRationale 存在時是使用者保存的最新目標與修改意見，優先於舊 goalText、goalSnapshot 或共用 creativeGoal；沒有合併紀錄才讀 goalText，舊版才讀 goalSnapshot.summary，只依本次明確要求更新目標。rationale 與 changeSummary 各最多350中文字，交代實際差異及取捨。reply 最多350中文字。若只是評價、閒聊、無需改變或缺少必要數據，outcome=clarification；artifact 必須逐字回傳 sourceVersion.artifact，不得回傳空物件或偷偷修改；伺服器會驗證相同後捨棄，作品不變。此時 rationale、goalText、changeSummary 都為空字串，reply 不可聲稱已修改。需要釐清時 question 只問一個最必要問題，最多100中文字；可直接回答就留空，不強迫追問。revision 必須有作品內容或本版目標的實質改變；只改目標時 artifact 原樣回傳。choices 一般為空陣列；只有 clarification 問題適合單選時提供2至6個不同實際答案，各含唯一 id、label、value；id 為英數短鍵可含 - 或 _、最多64字元；label 最多120個 UTF8 位元組，value 最多1000個 UTF8 位元組，忠實對應名稱且不夾帶指令。'.$this->artifactInstructions(),$data,$this->schema($props),24000);
        $reply=textValue($v['reply'],1200,'修訂回覆');$question=textValue($v['question'],600,'釐清問題',true);
        $rationale=textValue($v['rationale'],1200,'修訂說明',true);$goalText=userTextValue($v['goalText'],6000,'本版目標',true);$changeSummary=userTextValue($v['changeSummary'],1200,'討論變更整理',true);
        $choices=validateDialogueChoices($v['choices'],$question);$artifact=validateArtifact($v['artifact'],$this->type);
        if($v['outcome']==='clarification'){
            ensure(jsonEncode($artifact)===jsonEncode($source['artifact']),'MODEL_CLARIFICATION_ARTIFACT','AI 將討論與作品修改混在一起，原作品不變且未保存此回覆。',502);
            // Providers may fill explanatory metadata even for clarification.
            // It is bounded above, then discarded, never stored as a goal edit.
            $this->rejectsCompletedEditClaim($reply."\n".$question);
            return array('outcome'=>'clarification','reply'=>'此回覆僅供討論，作品內容與正式版都尚未變更。'."\n\n".$this->dialogueText($reply,$question),'items'=>array(),'rationale'=>'','question'=>$question,'choices'=>$choices);
        }
        ensure($question===''&&$choices===array()&&$rationale!==''&&$goalText!==''&&$changeSummary!=='','MODEL_OUTPUT_INVALID','實際修訂必須有完整作品與說明，不可同時要求尚未回答的問題。',502);
        $combinedChanged=versionHasCombinedOverride($source)&&versionGoalAndRationale(array('goalText'=>$goalText,'changeSummary'=>$changeSummary,'rationale'=>$rationale))!==$source['goalAndRationale'];
        ensure(jsonEncode($artifact)!==jsonEncode($source['artifact'])||$goalText!==versionGoalText($source)||$combinedChanged,'MODEL_NO_REVISION','AI 回傳與來源相同的作品和目標，沒有建立假修訂。原版本保留，未自動重試。',502);
        return array('outcome'=>'revision','reply'=>$reply,'artifact'=>$artifact,'items'=>artifactItems($artifact),'rationale'=>$rationale,'goalText'=>$goalText,'changeSummary'=>$changeSummary,'question'=>'','choices'=>array());
    }
    protected function runFuse($project,$versions,$question,$model) {
        ensure(is_array($versions)&&count($versions)>=2&&count($versions)<=5,'FUSION_VERSIONS_INVALID','請選擇 2 至 5 個版本進行融合。',409);
        $sources=array();$ids=array();
        foreach($versions as $version){$id=field($version,'id');ensure(is_string($id)&&!in_array($id,$ids,true),'FUSION_VERSIONS_INVALID','融合來源版本不可重複或缺少識別碼。',409);$ids[]=$id;$sources[]=$this->sourceSnapshot($version);}
        $data=array('goalBasis'=>'version_snapshots','contentType'=>$this->type,'creativeGoal'=>null,'goalApprovedAt'=>null,
            'selectedVersions'=>$this->creativeVersions($sources),'officialVersionId'=>$project['officialVersionId'],'question'=>$question,
            'pinnedReferences'=>$project['references'],'projectTitle'=>$project['title'],'projectDescription'=>$project['description'],
            'creativeItemTitle'=>$project['activeItem']['title'],'creativeItemDescription'=>$project['activeItem']['description'],'dialogue'=>$this->dialogue($project));
        $v=$this->ask($model,'使用者明確要求將 selectedVersions 的2至5個選定來源融合成恰好1個完整新候選，不是比較報告、不選唯一優勝、不採用或覆寫正式版。逐版理解完整 artifact 與各版自己的目標；goalAndRationale 存在時優先於舊 goalText、goalSnapshot、changeSummary、rationale，缺漏就誠實標示，不捏造。不可用目前共用專案目標覆蓋各版目標。依 question 整合各版優點；目標衝突時依本次明確選擇，否則可相容整合並具體交代取捨，不假稱矛盾條件同時達成。只使用選定版本與已提供材料，保留未變內容及可對應欄列的穩定 id，禁止冒充來源、假造數據、把不同統計口徑數值任意相加，或改動未選版本。相同 id 在不同來源代表不同欄列時，僅對真正不同的新增欄列建立新 id 並交代。回傳完整作品，不只差異或縮略文字。作品需真正整合，不能照抄其中一版卻宣稱融合。rationale 說明從哪些版本吸收哪些特色及取捨，最多350中文字；goalText 以完整一段保存新融合版本自己的目標，最多1200中文字；changeSummary 整理本次實際整合，最多350中文字。'.$this->artifactInstructions(),$data,$this->schema($this->candidateProperties()),24000);
        $result=$this->candidateResult($v,'融合');
        foreach($sources as $source)ensure(jsonEncode($result['artifact'])!==jsonEncode($source['artifact']),'MODEL_NO_REVISION','AI 只複製其中一個來源，沒有形成新融合作品；未保存假候選，也未自動重試。',502);
        return $result;
    }
}
