<?php
class CocreationApp {
    use CocreationImageActions;
    private $store; private $config; private $owner; private $vault; private $model;
    public function __construct($store,$config,$owner,$adapter=null) {
        $this->store=$store;$this->config=$config;$this->owner=$owner;$this->vault=new SessionKeyVault($config['data_dir']);$this->model=$adapter;
    }
    private function connection($roster=null) {
        if($roster===null)$roster=$this->store->memberRoster($this->config['openai_model'],$this->owner);$member=null;
        foreach($roster['members'] as $candidate)if($candidate['id']===$roster['activeMemberId']&&$candidate['enabled'])$member=$candidate;
        $connection=$member===null?$this->store->connection($this->config['openai_model'],$this->owner):validateConnection($member);
        return array_merge($connection,array('settingsRevision'=>$roster['settingsRevision'],'memberId'=>$member===null?null:$member['id'],'memberNickname'=>$member===null?null:$member['nickname'],'usageConsent'=>$roster['usageConsent']));
    }
    private function bindingFromInput($input) {
        $roster=$this->settingsLease($input);$id=field($input,'memberId');validId($id);$member=null;
        foreach($roster['members'] as $candidate)if($candidate['id']===$id)$member=$candidate;
        ensure($member!==null,'MEMBER_NOT_FOUND','找不到要為專案選定的 AI 成員。',404);ensure($member['enabled'],'MEMBER_DISABLED','請先在系統設定啟用這位 AI 成員。',409);
        return array_merge(array('memberId'=>$member['id'],'memberNickname'=>$member['nickname']),validateConnection($member),array('boundAt'=>nowIso()));
    }
    private function projectConnection($project) {
        $binding=field($project,'aiBinding');ensure(is_array($binding),'PROJECT_MODEL_REQUIRED','請先為這個專案選定 AI 模型；選定後在此專案固定使用，不會逐句切換。',409);
        $binding=validateProjectAiBinding($binding);$roster=$this->store->memberRoster($this->config['openai_model'],$this->owner);$member=null;
        foreach($roster['members'] as $candidate)if($candidate['id']===$binding['memberId'])$member=$candidate;
        ensure($member!==null,'MEMBER_NOT_FOUND','此專案固定的 AI 成員已不在設定中；請還原原成員設定，不會改用其他模型。',404);
        ensure($member['enabled'],'MEMBER_DISABLED','此專案固定的 AI 成員已停用；請在系統設定重新啟用原成員。',409);
        foreach(array('provider','model','ollamaUrl') as $key)ensure($member[$key]===$binding[$key],'PROJECT_MODEL_CHANGED','中央設定已更動此專案固定的模型或目的地。請還原原設定；若需要其他模型，請另建專案，不會偷偷切換。',409);
        return array_merge(validateConnection($binding),array('memberId'=>$binding['memberId'],'memberNickname'=>$binding['memberNickname'],'settingsRevision'=>$roster['settingsRevision'],'usageConsent'=>$roster['usageConsent']));
    }
    private function adapter($connection) {
        if($this->model!==null)return $this->model;
        if($connection['provider']==='ollama')return new OllamaAdapter($connection['ollamaUrl'],$this->config['model_timeout_ms']);
        $vault=$this->vault;$owner=$this->owner;return new OpenAIAdapter(function()use($vault,$owner){return $vault->get($owner);},$this->config['model_timeout_ms']);
    }
    private function provenance($connection,$adapter,$requestedAt) { $out=array('memberId'=>$connection['memberId'],'memberNickname'=>$connection['memberNickname'],'provider'=>$connection['provider'],'requestedModel'=>$connection['model'],'actualModel'=>$adapter->actualModel(),'requestedAt'=>$requestedAt);if(count($this->imageInputSnapshots)){$out['inputMode']='image_bytes';$out['imageInputs']=$this->imageInputSnapshots;}return $out; }
    private function checkApproval($input,$connection,$needsConsent=true) {
        ensure($connection['memberId']!==null,'AI_MEMBER_REQUIRED','請先在系統設定勾選並選取一位 AI 成員。',409);
        ensure(field($input,'approvedMemberId')===$connection['memberId'],'MEMBER_CHANGED','所選 AI 成員已變更，請檢查目前選擇後再送出；沒有自動換人。',409);
        if($needsConsent)ensure($connection['usageConsent']===true,'AI_USAGE_OPT_IN','請先在系統設定閱讀並勾選資料傳送與費用說明；之後明確按送出即可使用，不會逐次詢問。',409);
        if($needsConsent)ensure(field($input,'consent')===true,'CONSENT_REQUIRED','請使用畫面上的明確送出按鈕呼叫已啟用的 AI 成員。',409);
        ensure(field($input,'approvedProvider')===$connection['provider']&&field($input,'approvedSettingsRevision')===$connection['settingsRevision'],'SETTINGS_CHANGED','AI 服務或連線設定已變更。請重新整理設定並確認此次目的地；不會自動轉用另一個服務。',409);
        ensure(field($input,'approvedModel')===$connection['model'],'MODEL_CHANGED','模型設定已改變。請重新整理並確認此次模型。',409);
        if($connection['provider']==='openai'){
            $status=$this->vault->status($this->owner);ensure($status['keyPresent'],'API_KEY_REQUIRED','本次 OpenAI 金鑰已清除或到期，請重新貼入後確認。',409);
            ensure(field($input,'approvedKeyRevision')===$status['keyRevision'],'KEY_CHANGED','金鑰設定已改變，請重新確認本次呼叫，避免使用另一個 API 帳戶。',409);
        }
    }
    public function status() { $roster=$this->store->memberRoster($this->config['openai_model'],$this->owner);return array_merge($this->connection($roster),$this->vault->status($this->owner),array('members'=>$roster['members'],'activeMemberId'=>$roster['activeMemberId'],'usageConsent'=>$roster['usageConsent'],'consentAt'=>$roster['consentAt'],'modelCatalog'=>$this->store->modelCatalog($this->owner))); }
    public function state() { return array_merge($this->status(),array('csrf'=>$_SESSION['csrf'],'projects'=>$this->store->listProjects($this->owner),'modules'=>moduleRegistry())); }
    private function itemKeys() { return array('phase','lifecycle','brief','goalApprovedAt','summaryRevision','versions','archivedVersionIds','officialVersionId','comparisons','messages','finalizedVersionId','finalizedAt','finalizations','references','contextRevision'); }
    private function newItem($type,$title,$description) {
        $supported=array_column(moduleRegistry(),'enabled','id');ensure(isset($supported[$type]),'ITEM_TYPE','未知創作項目類型。');
        return array('id'=>newId(),'type'=>$type,'title'=>userTextValue($title,240,'創作項目名稱'),'description'=>userTextValue($description,4000,'項目說明',true),'enabled'=>$supported[$type],'archived'=>false,'phase'=>'discussion','lifecycle'=>'created','brief'=>null,'goalApprovedAt'=>null,'summaryRevision'=>null,'versions'=>array(),'archivedVersionIds'=>array(),'officialVersionId'=>null,'comparisons'=>array(),'messages'=>array($this->message('system',$supported[$type]?($type==='image'?'可以先上傳外部圖片保存版本，再選定版本討論或比較配色、構圖與風格。上傳不呼叫 AI；本階段尚未開放圖片生成或像素修改。':($type==='webpage'?'這個網頁要介紹什麼？我們會依序確認視覺風格、內容結構與操作功能；目前支援頁內導覽及可展開問答，不含外部圖片、表單送出或自訂程式。':($type==='short_text'?'這篇短文想傳達什麼，準備給誰閱讀？':($type==='article'?'這篇文章的核心主題與用途是什麼？':($type==='table'?'這份表格要整理什麼資料，需要哪些欄位？':($type==='chart'?'這張流程圖想表達什麼流程？可以先說起點、主要步驟與判斷關係；若需要統計圖，也可以明確提出並提供資料。':($type==='mindmap'?'先從一個主題開始，這張心智圖想探索什麼？AI 只提出待選分支，由你勾選後才加入圖中。':($type==='vector'?'這張向量作品要表達什麼？可以先談視覺、用途與必要文字；目前支援可編輯幾何圖形與文字，不含點陣影像或任意 SVG 匯入。':'先不用一次想完。這個創作項目要替什麼內容命名？')))))))):'此項目目前只有規劃位置，可填寫說明、加入其他項目的版本引用；尚未提供 AI 生成。','welcome')),'finalizedVersionId'=>null,'finalizedAt'=>null,'finalizations'=>array(),'references'=>array(),'contextRevision'=>0,'createdAt'=>nowIso());
    }
    private function view($raw) {
        ensure(isset($raw['creativeItems'],$raw['activeItemId'],$raw['sharedContextRevision']),'DATA_SCHEMA_UNSUPPORTED','這不是本版的專案資料格式。請使用新的私有資料夾；不要覆寫既有其他系統的資料。',409);
        $raw=$this->normalizeRaw($raw);$selected=null;
        foreach($raw['creativeItems'] as &$item){
            if($item['contextRevision']!==$raw['sharedContextRevision']){$item['goalApprovedAt']=null;$item['summaryRevision']=null;$item['phase']='discussion';$item['sharedContextChanged']=true;}else unset($item['sharedContextChanged']);
            if($item['id']===$raw['activeItemId'])$selected=$item;
        }unset($item);
        ensure($selected!==null,'ITEM_NOT_FOUND','找不到目前創作項目。',404);$out=$raw;
        foreach($this->itemKeys() as $key)$out[$key]=$selected[$key];$out['module']=$selected['type'];$out['activeItem']=$selected;
        if(isset($selected['sharedContextChanged']))$out['sharedContextChanged']=true;
        return $out;
    }
    private function normalizeRaw($raw) {
        if(!array_key_exists('imageAnalysisConsent',$raw))$raw['imageAnalysisConsent']=null;
        if(!array_key_exists('aiBinding',$raw))$raw['aiBinding']=null; // No inferred model for existing projects.
        if($raw['aiBinding']!==null)$raw['aiBinding']=validateProjectAiBinding($raw['aiBinding']);
        $capabilities=array_column(moduleRegistry(),'enabled','id');
        foreach($raw['creativeItems'] as &$item){normalizeItemVersions($item);$item['enabled']=isset($capabilities[$item['type']])&&$capabilities[$item['type']];}unset($item);return $raw;
    }
    public function project($id) { return $this->view($this->store->project($id,$this->owner)); }
    private function saveRaw($raw) { $raw['revision']++;return array('project'=>$this->view($this->store->save($raw,$this->owner))); }
    private function locateItem($raw,$id) { validId($id);foreach($raw['creativeItems'] as $index=>$item)if($item['id']===$id)return $index;throw new AppError('ITEM_NOT_FOUND','找不到這個專案的創作項目。',404); }
    private function activeInput($p,$input) { ensure(field($input,'itemId')===$p['activeItemId'],'ACTIVE_ITEM_CHANGED','目前創作項目已切換，請重新開啟要處理的項目；未改動其他項目。',409); }
    private function pinnedVersion($version) {
        // Preserve the complete source content and direct provenance, not exponentially
        // nested copies of every prior source's sources. Lineage ids remain available.
        unset($version['fusionSourceSnapshots']); // Direct content and fusionSourceVersionIds remain; never recursively copy ancestors.
        if(isset($version['referencesSnapshot']))foreach($version['referencesSnapshot'] as &$ref){$source=field($ref,'versionSnapshot',array());unset($ref['versionSnapshot']);$ref['sourceProvenance']=field($source,'provenance');}unset($ref);
        return $version;
    }
    private function reserveStorage($p,$bytes) { $raw=$this->normalizeRaw($this->store->project($p['id'],$this->owner));ensure(strlen(jsonEncode($raw))+$bytes<=2000000,'PROJECT_LIMIT','此專案接近儲存上限，無法安全保存本次完整結果。沒有呼叫AI；請先匯出，再建立新專案延續。',409); }
    private function shellAction($action,$input) {
        $raw=$this->normalizeRaw($this->store->project(field($input,'id'),$this->owner));$this->revision($raw,$input);
        if($action==='select_item'){$this->locateItem($raw,field($input,'itemId'));$raw['activeItemId']=$input['itemId'];return $this->saveRaw($raw);}
        if($action==='reopen_project'){ensure($raw['projectLifecycle']==='finalized','PROJECT_NOT_FINALIZED','專案目前尚未結案。',409);$raw['projectLifecycle']='in_progress';return $this->saveRaw($raw);}
        ensure($raw['projectLifecycle']!=='finalized','PROJECT_CLOSED','專案已結案，請先重新開啟專案；舊定稿快照保留。',409);
        if($action==='finalize_project'){
            $snapshots=array();foreach($raw['creativeItems'] as $item)if(!$item['archived']){ensure($item['lifecycle']==='finalized'&&$item['officialVersionId']!==null&&$item['contextRevision']===$raw['sharedContextRevision']&&$item['goalApprovedAt']!==null,'ITEMS_UNFINISHED','所有未封存項目都必須先明確定稿，才可結案專案。尚未實作的規劃項目可先封存，紀錄仍會保留。',409);$snapshots[]=array('itemId'=>$item['id'],'itemTitle'=>$item['title'],'versionSnapshot'=>$this->version($item,$item['finalizedVersionId']));}
            ensure(count($snapshots)>0,'ITEMS_UNFINISHED','至少需要一個已定稿項目。',409);$raw['projectFinalizations'][]=array('at'=>nowIso(),'title'=>$raw['title'],'description'=>$raw['description'],'items'=>$snapshots);$raw['projectLifecycle']='finalized';return $this->saveRaw($raw);
        }
        if($action==='create_item'){
            ensure(count($raw['creativeItems'])<30,'ITEM_LIMIT','每個專案最多30個創作項目（含封存）。',409);$item=$this->newItem(field($input,'type'),field($input,'title'),field($input,'description',''));$item['contextRevision']=$raw['sharedContextRevision'];$raw['creativeItems'][]=$item;$raw['activeItemId']=$item['id'];$raw['projectLifecycle']='in_progress';return $this->saveRaw($raw);
        }
        $this->activeInput($raw,$input);$index=$this->locateItem($raw,field($input,'itemId'));$item=$raw['creativeItems'][$index];
        if($action==='archive_item'||$action==='restore_item'){
            if($action==='archive_item'){ensure(count(array_filter($raw['creativeItems'],function($i){return !$i['archived'];}))>1,'LAST_ITEM','請保留至少一個未封存創作項目。',409);$item['archived']=true;}else{$item['archived']=false;}
        }else{
            ensure(!$item['archived'],'ITEM_ARCHIVED','請先還原封存項目後再編輯。',409);
            if($action==='edit_item'){ensure($item['lifecycle']!=='finalized','PROJECT_FINALIZED','此創作項目已定稿，請先重新開啟討論再編輯名稱或說明。',409);$title=userTextValue(field($input,'title'),240,'創作項目名稱');$description=userTextValue(field($input,'description',''),4000,'項目說明',true);if($description!==$item['description']||$title!==$item['title']){$item['goalApprovedAt']=null;$item['summaryRevision']=null;$item['phase']='discussion';}$item['description']=$description;$item['title']=$title;}
            else{
                ensure($item['lifecycle']!=='finalized','PROJECT_FINALIZED','此創作項目已定稿，請先重新開啟討論，再更動引用。',409);
                if($action==='attach_reference'){
                    ensure(count($item['references'])<12,'REFERENCE_LIMIT','每個項目最多12筆固定版本引用。',409);$target=$raw['creativeItems'][$this->locateItem($raw,field($input,'targetItemId'))];ensure($target['id']!==$item['id'],'REFERENCE_SELF','請選取同專案的其他創作項目。');$version=$this->version($target,field($input,'versionId'));ensure(!versionArchived($target,$version['id']),'VERSION_ARCHIVED','請先還原這個封存版本，再建立新的引用。',409);
                    foreach($item['references'] as $ref)ensure(!($ref['targetItemId']===$target['id']&&$ref['versionId']===$version['id']),'REFERENCE_DUPLICATE','已引用這個固定版本。',409);
                    $ref=array('id'=>newId(),'projectId'=>$raw['id'],'targetItemId'=>$target['id'],'targetItemTitle'=>$target['title'],'versionId'=>$version['id'],'versionSnapshot'=>$this->pinnedVersion($version),'pinnedAt'=>nowIso());$item['references'][]=$ref;$item['messages'][]=$this->message('student','我明確引用「'.$target['title'].'」'.versionLabel($version).'的固定快照。來源後續改版不會自動替換此引用。','reference_added',array('referenceId'=>$ref['id']));
                }elseif($action==='remove_reference'){$refId=validId(field($input,'referenceId'));$before=count($item['references']);$item['references']=array_values(array_filter($item['references'],function($ref)use($refId){return $ref['id']!==$refId;}));ensure(count($item['references'])<$before,'REFERENCE_NOT_FOUND','找不到此引用。',404);$item['messages'][]=$this->message('student','我移除了一筆引用；原始項目與版本未被修改。','reference_removed',array('referenceId'=>$refId));}
                else throw new AppError('UNKNOWN_ACTION','未知操作。',404);
                $item['goalApprovedAt']=null;$item['summaryRevision']=null;$item['phase']='discussion';
            }
        }
        $raw['creativeItems'][$index]=$item;$raw['projectLifecycle']='in_progress';return $this->saveRaw($raw);
    }
    private function revision($project,$input) { ensure(isset($input['revision'])&&is_int($input['revision'])&&$input['revision']===$project['revision'],'STALE_REVISION','另一個分頁已更新作品。請重新開啟作品後再操作；目前草稿保留，不會覆蓋較新的內容。',409); }
    private function save($project) {
        $index=$this->locateItem($project,$project['activeItemId']);foreach($this->itemKeys() as $key)$project['creativeItems'][$index][$key]=$project[$key];
        foreach($project['creativeItems'] as &$item)unset($item['sharedContextChanged']);unset($item);
        foreach($this->itemKeys() as $key)unset($project[$key]);unset($project['activeItem'],$project['module'],$project['sharedContextChanged']);$project['projectLifecycle']='in_progress';return $this->saveRaw($project);
    }
    private function message($role,$text,$kind,$extra=array()) { return array_merge(array('id'=>newId(),'role'=>$role,'text'=>$text,'kind'=>$kind,'at'=>nowIso()),$extra); }
    private function refinementSelection($project,$input) {
        $id=field($input,'baseVersionId',$project['officialVersionId']);$base=$id===null?null:$this->version($project,$id);
        if($base!==null)ensure(!versionArchived($project,$id),'VERSION_ARCHIVED','請先還原這個版本，再以它為修改起點。',409);
        $targets=field($input,'targetItemIds',array());ensure(is_array($targets)&&($targets===array()||array_keys($targets)===range(0,count($targets)-1)),'TARGET_ITEMS_INVALID','修改範圍必須是段落識別碼清單。',409);
        if($project['module']==='article'&&$base!==null){
            ensure(count($targets)>0,'TARGET_ITEMS_REQUIRED','請先選擇這一版要修改的段落或條文；會參考全文但只更動選取範圍。',409);
            $known=array_column($base['items'],'id');foreach($targets as $target)ensure(is_string($target)&&in_array($target,$known,true),'TARGET_ITEMS_INVALID','修改範圍包含不屬於這個版本的段落。',409);
            ensure(count(array_unique($targets,SORT_STRING))===count($targets),'TARGET_ITEMS_INVALID','修改範圍不可重複。',409);sort($targets,SORT_STRING);
        }else ensure($targets===array(),'TARGET_ITEMS_INVALID','這個創作類型或階段不接受段落範圍。',409);
        $nodeId=field($input,'targetNodeId');
        if($project['module']==='mindmap'&&$base!==null){
            $artifact=validateMindmapArtifact(field($base,'artifact'));
            ensure(is_string($nodeId)&&mindmapNode($artifact,$nodeId)!==null,'TARGET_NODE_INVALID','請選擇來源版本中已加入心智圖的節點；待選建議尚不能作為子分支起點。',409);
        }else ensure($nodeId===null,'TARGET_NODE_INVALID','這個創作類型或階段不接受心智圖節點範圍。',409);
        return array('base'=>$base,'targetItemIds'=>$targets,'targetNodeId'=>$nodeId);
    }
    private function choiceContext($project,$selection) {
        $context=array('itemId'=>$project['activeItemId'],'officialVersionId'=>$project['officialVersionId'],'sharedContextRevision'=>$project['sharedContextRevision'],'itemTitle'=>$project['activeItem']['title'],'itemDescription'=>$project['activeItem']['description'],'baseVersionId'=>$selection['base']===null?null:$selection['base']['id'],'targetItemIds'=>$selection['targetItemIds']);
        if($project['module']==='mindmap'&&$selection['base']!==null)$context['targetNodeId']=$selection['targetNodeId'];
        return $context;
    }
    private function questionMetadata($project,$result,$selection) {
        $extra=array('question'=>$result['question'],'choices'=>$result['choices']);
        if($result['choices']!==array())$extra['choiceContext']=$this->choiceContext($project,$selection);
        return $extra;
    }
    private function resolveChoiceAnswer($project,$input,$selection) {
        if(!array_key_exists('choiceAnswer',$input))return array();
        $answer=$input['choiceAnswer'];$questionId=field($answer,'questionMessageId');$choiceId=field($answer,'choiceId');
        ensure(is_array($answer)&&count($answer)===2&&is_string($questionId)&&preg_match('/^[a-f0-9]{32}$/D',$questionId)&&is_string($choiceId)&&preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/D',$choiceId),'CHOICE_INVALID','回答選項格式不正確，請重新讀取問題或改用文字回答。');
        $question=end($project['messages']);
        ensure(is_array($question)&&field($question,'id')===$questionId&&field($question,'role')==='assistant'&&in_array(field($question,'kind'),array('discussion','clarification'),true),'CHOICE_STALE','這個問題已不是目前可回答的問題。請查看最新對話；文字草稿仍保留。',409);
        $context=field($question,'choiceContext');$expected=$this->choiceContext($project,$selection);
        ensure(is_array($context)&&count($context)===count($expected),'CHOICE_STALE','這個問題缺少目前內容的綁定，請查看最新對話或用文字回答。',409);
        foreach($expected as $key=>$value)ensure(array_key_exists($key,$context)&&$context[$key]===$value,'CHOICE_STALE','創作內容或目標脈絡已改變，舊問題的選項已停用；請繼續用文字討論。',409);
        try{$choices=validateDialogueChoices(field($question,'choices'),field($question,'question'));}catch(AppError $e){throw new AppError('CHOICE_STALE','這個問題沒有可用的回答選項，請用文字回答。',409);}
        $selected=null;foreach($choices as $choice)if($choice['id']===$choiceId)$selected=$choice;
        ensure($selected!==null&&field($input,'text')===$selected['value'],'CHOICE_INVALID','送出的答案與問題選項不一致，未呼叫 AI；請重新選擇或用文字回答。');
        return array('choiceAnswer'=>array('questionMessageId'=>$questionId,'choiceId'=>$choiceId,'label'=>$selected['label'],'value'=>$selected['value']));
    }
    private function studentTurns($project) { return count(array_filter($project['messages'],function($m){return $m['role']==='student'&&$m['kind']==='discussion';})); }
    private function version($project,$id) { validId($id);foreach($project['versions'] as $version)if($version['id']===$id)return $version;throw new AppError('VERSION_NOT_FOUND','找不到此作品的版本。',404); }
    private function goalRequired($project) { ensure($project['brief']!==null&&$project['goalApprovedAt']!==null&&in_array($project['phase'],array('ready','work'),true),'GOAL_APPROVAL_REQUIRED','請先整理並確認目前創作目標；新對話後需重新確認，已有版本會完整保留。',409); }
    private function appendVersion(&$project,$items,$rationale,$source,$basedOn,$messageId,$provenance=null,$mode='major',$metadata=array()) {
        ensure(count($project['versions'])<60,'VERSION_LIMIT','此作品已達60個版本，請匯出保存後建立新作品。',409);
        $artifact=null;if(artifactType($project['module'])){$artifact=validateArtifact(field($metadata,'artifact'),$project['module']);$items=artifactItems($artifact);}
        $base=$basedOn===null?null:$this->version($project,$basedOn);$coordinates=nextVersionCoordinates($project['versions'],$mode,$base);$ordinal=0;foreach($project['versions'] as $old)$ordinal=max($ordinal,$old['number']);
        $goalText=userTextValue(field($metadata,'goalText',field($project['brief'],'summary','')),6000,'版本目標',true);$changeSummary=userTextValue(field($metadata,'changeSummary',$rationale),2000,'版本修改整理',true);
        $combined=validateCombinedVersionNote(field($metadata,'goalAndRationale',versionGoalAndRationale(array('goalText'=>$goalText,'changeSummary'=>$changeSummary,'rationale'=>$rationale))));
        $links=array($messageId);$last=end($project['messages']);if(is_array($last)&&$last['role']==='student'&&(($source==='revision'&&$last['kind']==='discussion')||($source==='generated'&&$last['kind']==='generation_request')||($source==='fusion'&&$last['kind']==='fusion_request')))array_unshift($links,$last['id']);$links=array_values(array_unique($links));
        $v=array('id'=>newId(),'number'=>$ordinal+1,'major'=>$coordinates['major'],'minor'=>$coordinates['minor'],'title'=>bundleDisplayTitle($items),'contentType'=>$project['module'],'items'=>$items,'rationale'=>$rationale,'source'=>$source,'basedOnVersionId'=>$basedOn,'goalSnapshot'=>array('summary'=>$goalText),'goalText'=>$goalText,'goalSource'=>$source==='snapshot'?'user':'ai','goalAndRationale'=>$combined,'changeSummary'=>$changeSummary,'discussionMessageIds'=>$links,'referencesSnapshot'=>$project['references'],'projectContextSnapshot'=>array('title'=>$project['title'],'description'=>$project['description'],'revision'=>$project['sharedContextRevision']),'provenance'=>$provenance,'messageId'=>$messageId,'createdAt'=>nowIso());
        if($artifact!==null){$v['artifact']=$artifact;$name=$project['module']==='table'?$artifact['caption']:($project['module']==='mindmap'?mindmapNode($artifact,$artifact['rootId'])['label']:$artifact['title']);$v['title']=trim($name)===''?($project['module']==='table'?'表格':($project['module']==='mindmap'?'心智圖':($project['module']==='vector'?'向量圖形':($project['module']==='webpage'?'網頁':'圖表')))):bundleDisplayTitle(array(array('label'=>'title','content'=>$name)));}
        $project['versions'][]=$v;return $v['id'];
    }
    public function action($input) {
        $action=field($input,'action');$paid=in_array($action,array('discuss','summarize','generate','confirm_generate','compare','fuse'),true);
        if(!$paid)return $this->execute($action,$input);
        $connection=$this->projectConnection($this->project(field($input,'id')));$this->checkApproval($input,$connection);
        $requestId=field($input,'requestId');$fingerprint=hash('sha256',jsonEncode($input));
        $previous=$this->store->requestStart($this->owner,$requestId,$action,$fingerprint);
        if($previous!==null)return array('project'=>$this->project($previous['projectId']));
        try {
            $result=$this->execute($action,$input,$connection);
            $this->store->requestFinish($this->owner,$requestId,array('projectId'=>$result['project']['id']),true);
            return $result;
        } catch(Throwable $e) {$this->store->requestFinish($this->owner,$requestId,null,false);throw $e;}
    }
    private function settingsLease($input) {
        $roster=$this->store->memberRoster($this->config['openai_model'],$this->owner);
        ensure(field($input,'expectedSettingsRevision')===$roster['settingsRevision'],'SETTINGS_CHANGED','另一個分頁已變更 AI 設定。請保留目前草稿，重新讀取設定後再操作；沒有覆寫較新的名單。',409);return $roster;
    }
    private function execute($action,$input,$requestConnection=null) {
        $this->imageInputSnapshots=array();
        if($action==='grant_image_analysis')return $this->grantImageAnalysis($input);
        if($action==='save_members') {
            $roster=$this->settingsLease($input);$this->store->setMemberRoster(field($input,'members'),field($input,'activeMemberId'),field($input,'usageConsent'),$this->owner,$roster['settingsRevision']);return $this->status();
        }
        if($action==='select_member') { $roster=$this->settingsLease($input);$this->store->selectMember(field($input,'memberId'),$this->config['openai_model'],$this->owner,$roster['settingsRevision']);return $this->status(); }
        if($action==='list_models') {
            $provider=providerName(field($input,'provider'));$url=validateOllamaUrl(field($input,'ollamaUrl','http://127.0.0.1:11434'));
            $adapter=$this->adapter(array('provider'=>$provider,'ollamaUrl'=>$url));return $adapter->listModels();
        }
        if($action==='save_settings') {
            // Backward-compatible editor route. Changed destinations invalidate the
            // one-time app opt-in; they never silently inherit a previous consent.
            $connection=validateConnection($input);$roster=$this->store->memberRoster($this->config['openai_model'],$this->owner);$found=false;
            foreach($roster['members'] as &$member)if($member['id']===$roster['activeMemberId']){$member=array_merge($member,$connection);$found=true;}unset($member);
            if(!$found){$names=array_column($roster['members'],'nickname');$n=1;$nickname='相容設定';while(in_array($nickname,$names,true)){$n++;$nickname='相容設定 '.$n;}$member=array_merge(array('id'=>newId(),'nickname'=>$nickname,'enabled'=>true),$connection);$roster['members'][]=$member;$roster['activeMemberId']=$member['id'];}
            // Validate the complete prepared roster before either compatibility write.
            validateMemberRosterInput($roster['members'],$roster['activeMemberId'],false);
            $this->store->setMemberRoster($roster['members'],$roster['activeMemberId'],false,$this->owner,$roster['settingsRevision']);$this->store->setConnection($connection,$this->owner);$this->store->rememberModel($connection['provider'],$connection['model'],$this->owner);return $this->status();
        }
        if($action==='set_key') {
            // Saving a key never changes provider or sends it to an Ollama endpoint.
            $this->vault->put($this->owner,field($input,'key'));return $this->status();
        }
        if($action==='clear_key') { $this->vault->clear($this->owner);return $this->status(); }
        if($action==='test_connection') {
            $connection=$this->connection();$this->checkApproval($input,$connection,false);$adapter=$this->adapter($connection);
            return array_merge($this->status(),array('connection'=>$adapter->checkConnection($connection['model'])));
        }
        if($action==='new') {
            ensure(count($this->store->listProjects($this->owner))<100,'PROJECT_LIMIT','此瀏覽器最多保留100份專案，請先匯出保存。',409);
            $item=$this->newItem('titles','標題名稱','');
            $binding=field($input,'memberId')===null?null:$this->bindingFromInput($input);
            $raw=array('schemaVersion'=>1,'id'=>newId(),'title'=>userTextValue(field($input,'title','我的共創專案'),240,'專案名稱'),'description'=>userTextValue(field($input,'description',''),4000,'專案說明',true),'aiBinding'=>$binding,'projectLifecycle'=>'created','projectFinalizations'=>array(),'revision'=>0,'sharedContextRevision'=>0,'activeItemId'=>$item['id'],'creativeItems'=>array($item),'createdAt'=>nowIso());
            return array('project'=>$this->view($this->store->save($raw,$this->owner)));
        }
        if($action==='bind_project_model'){
            $raw=$this->normalizeRaw($this->store->project(field($input,'id'),$this->owner));$this->revision($raw,$input);
            ensure($raw['aiBinding']===null,'PROJECT_MODEL_BOUND','這個專案已選定模型，不會在對話中切換。',409);
            ensure($raw['projectLifecycle']!=='finalized','PROJECT_CLOSED','請先重新開啟專案，再完成一次性模型選擇。',409);
            $raw['aiBinding']=$this->bindingFromInput($input);return $this->saveRaw($raw);
        }
        if(in_array($action,array('create_item','select_item','edit_item','archive_item','restore_item','attach_reference','remove_reference','finalize_project','reopen_project'),true))return $this->shellAction($action,$input);
        ensure(in_array($action,array('edit_project','finalize','reopen','discuss','summarize','approve_goal','generate','confirm_generate','snapshot','promote','archive_version','restore_version','compare','fuse'),true),'UNKNOWN_ACTION','未知操作。',404);
        $p=$this->project(field($input,'id'));$this->revision($p,$input);ensure($p['projectLifecycle']!=='finalized','PROJECT_CLOSED','專案已結案，請先重新開啟專案。',409);$connection=$requestConnection===null?$this->connection():$requestConnection;$adapter=$this->adapter($connection);$model=$connection['model'];$requestedAt=nowIso();
        if($action==='edit_project') {
            $description=userTextValue(field($input,'description',''),4000,'專案說明',true);$title=userTextValue(field($input,'title'),240,'專案名稱');$changed=$description!==$p['description']||$title!==$p['title'];
            if($changed&&$p['brief']!==null){$p['goalApprovedAt']=null;$p['summaryRevision']=null;$p['phase']='discussion';$p['messages'][]=$this->message('system','專案名稱或說明已更新。既有版本保留；下次產生候選前請重新整理並確認創作目標。','project_edit');}
            if($changed)$p['sharedContextRevision']++;$p['description']=$description;$p['title']=$title;return $this->save($p);
        }
        $this->activeInput($p,$input);ensure(!$p['activeItem']['archived'],'ITEM_ARCHIVED','請先還原封存項目。',409);ensure($p['activeItem']['enabled'],'CAPABILITY_UNAVAILABLE','這個創作類型目前只提供規劃及固定版本引用，尚未實作 AI 生成與定稿。',409);$module=moduleAdapter($p['module'],$adapter);
        if($p['module']==='image')ensure(!in_array($action,array('generate','confirm_generate','fuse'),true),'IMAGE_GENERATION_UNAVAILABLE','目前圖片功能提供外部上傳、版本保存及實際圖片分析；尚未開放 AI 生成或像素修改，沒有呼叫 AI。',409);
        if($action==='reopen') {
            ensure($p['lifecycle']==='finalized','PROJECT_NOT_FINALIZED','此專案尚未定稿，不必重新開啟。',409);
            $p['lifecycle']='in_progress';$p['finalizedVersionId']=null;$p['finalizedAt']=null;
            $p['messages'][]=$this->message('student','我重新開啟討論；先前的定稿快照、正式版與所有歷程完整保留。','reopen');return $this->save($p);
        }
        ensure($p['lifecycle']!=='finalized','PROJECT_FINALIZED','此專案已定稿。請先按「重新開啟討論」，原定稿快照會保留。',409);
        if($action==='finalize') {
            $this->goalRequired($p);ensure($p['officialVersionId']!==null,'OFFICIAL_REQUIRED','請先選一組候選升為正式版，再結案定稿。',409);
            $v=$this->version($p,$p['officialVersionId']);$p['lifecycle']='finalized';$p['finalizedVersionId']=$v['id'];$p['finalizedAt']=nowIso();
            $message=$this->message('student','我將正式版 '.versionLabel($v).'「'.$v['title'].'」結案定稿。','finalization',array('versionIds'=>array($v['id'])));
            $p['finalizations'][]=array('versionId'=>$v['id'],'versionSnapshot'=>$v,'acceptedGoalSnapshot'=>$p['brief'],'sharedContextRevision'=>$p['sharedContextRevision'],'at'=>$p['finalizedAt'],'messageId'=>$message['id']);$p['messages'][]=$message;return $this->save($p);
        }
        $p['lifecycle']='in_progress';
        if(in_array($action,array('discuss','summarize','generate','confirm_generate','compare','fuse'),true))$this->reserveStorage($p,inferenceGrowthBudget($p,$action,$input));
        ensure($action==='restore_version'||count($p['messages'])<400,'DIALOGUE_LIMIT','此作品對話已達上限，請匯出完整紀錄後開啟新作品。',409);
        if($action==='discuss') {
            ensure($this->studentTurns($p)<60,'DIALOGUE_LIMIT','此作品已有60輪討論，請匯出後開啟新作品。',409);
            $text=userTextValue(field($input,'text'),4000,'你的想法');$selection=$this->refinementSelection($p,$input);$answerMetadata=$this->resolveChoiceAnswer($p,$input,$selection);
            if($selection['base']!==null){
                // Promotion is a working baseline, never an implicit finalization.
                // Legacy discussions may have cleared approval: editing an existing
                // official bundle still works, without inventing new goal approval.
                ensure(count($p['versions'])<60,'VERSION_LIMIT','此項目已達60個版本，請匯出保存後延續新項目；本次未呼叫AI。',409);
                $official=$selection['base'];$refinementProject=$p;if($p['module']==='mindmap')$refinementProject['mindmapTargetNodeId']=$selection['targetNodeId'];if($p['module']==='image')$this->prepareImageInputs($p,$module,array($official));$result=$module->refine($refinementProject,$official,$text,$model,$selection['targetItemIds']);$provenance=$this->provenance($connection,$adapter,$requestedAt);
                $sourceMetadata=array('basedOnVersionId'=>$official['id']);if($p['module']==='mindmap')$sourceMetadata['targetNodeId']=$selection['targetNodeId'];
                $p['messages'][]=$this->message('student',$text,'discussion',array_merge($sourceMetadata,$answerMetadata));
                $message=$this->message('assistant',$result['reply'],$result['outcome']==='revision'?'revision':'clarification',array_merge(array('basedOnVersionId'=>$official['id'],'targetItemIds'=>$selection['targetItemIds'],'provenance'=>$provenance,'referencesSnapshot'=>$p['references']),$this->questionMetadata($p,$result,$selection)));
                if($p['module']==='mindmap')$message['targetNodeId']=$selection['targetNodeId'];
                if($result['outcome']==='revision'){
                    $id=$this->appendVersion($p,$result['items'],$result['rationale'],'revision',$official['id'],$message['id'],$provenance,'minor',$result);
                    if($p['module']==='mindmap'){$message['targetNodeId']=$selection['targetNodeId'];$p['versions'][count($p['versions'])-1]['targetNodeId']=$selection['targetNodeId'];}
                    $p['versions'][count($p['versions'])-1]['revisionInstruction']=$text;$p['versions'][count($p['versions'])-1]['targetItemIds']=$selection['targetItemIds'];$message['versionIds']=array($id);$message['text'].=$p['module']==='mindmap'?' 已新增含待選分支的完整候選；已加入的圖形節點沒有改動，建議尚未入圖。請在工作區勾選想要的分支後另存版本。':' 已新增可審閱的完整修訂版，尚未取代正式版；請查看差異，再決定是否採用，或選這一版接續微調。';$p['phase']='work';
                    $p['messages'][]=$message;$saved=$this->save($p);$saved['revisionVersionId']=$id;return $saved;
                }
                $p['messages'][]=$message;return $this->save($p);
            }
            if($p['module']==='image')$this->prepareImageInputs($p,$module,array());
            $result=$module->discuss($p,$text,$model);
            $ready=$result['directionStatus']==='ready';$p['brief']=$ready?$result['direction']:null;$p['phase']=$ready?'summary':'discussion';$p['goalApprovedAt']=null;$p['summaryRevision']=$ready?$p['revision']+1:null;if($ready)$p['contextRevision']=$p['sharedContextRevision'];
            $extra=array('provenance'=>$this->provenance($connection,$adapter,$requestedAt),'referencesSnapshot'=>$p['references'],'directionStatus'=>$result['directionStatus']);if($ready)$extra['goalSnapshot']=$p['brief'];
            $p['messages'][]=$this->message('student',$text,'discussion',$answerMetadata);$p['messages'][]=$this->message('assistant',$result['reply'],'discussion',array_merge($extra,$this->questionMetadata($p,$result,$selection)));
            return $this->save($p);
        }
        if($action==='summarize') {
            if($p['module']==='image'){$source=field($input,'baseVersionId',$p['officialVersionId']);$this->prepareImageInputs($p,$module,$source===null?array():array($this->version($p,$source)));}
            $p['brief']=$module->summarize($p,$model);$p['contextRevision']=$p['sharedContextRevision'];$p['goalApprovedAt']=null;$p['phase']='summary';$p['summaryRevision']=$p['revision']+1;
            $p['messages'][]=$this->message('assistant','我把目前對話整理成右側的創作目標草案。請確認它是不是你的意思；還有不同之處就繼續聊。','goal_summary',array('goalSnapshot'=>$p['brief'],'provenance'=>$this->provenance($connection,$adapter,$requestedAt),'referencesSnapshot'=>$p['references']));return $this->save($p);
        }
        if($action==='approve_goal') {
            $directionConfirmation=webpageDirectionConfirmation($p,$input);
            ensure($p['phase']==='summary'&&$p['brief']!==null&&is_int($p['summaryRevision'])&&$p['summaryRevision']<=$p['revision'],'SUMMARY_REQUIRED','請先整理最新目標，再按確認。',409);
            $p['goalApprovedAt']=nowIso();$p['phase']=count($p['versions'])?'work':'ready';
            $p['messages'][]=$this->message('student','我確認這份創作目標；產生候選仍需由我另按按鈕。','goal_approval',array('goalSnapshot'=>$p['brief'],'directionConfirmation'=>$directionConfirmation));return $this->save($p);
        }
        if($action==='generate'||$action==='confirm_generate') {
            if($action==='confirm_generate'){
                $directionConfirmation=webpageDirectionConfirmation($p,$input);
                ensure($p['phase']==='summary'&&$p['brief']!==null&&is_int($p['summaryRevision'])&&$p['summaryRevision']<=$p['revision'],'SUMMARY_REQUIRED','方向已變更或尚未整理，請先查看目前主軸與方向，再明確確認生成。',409);
                $p['goalApprovedAt']=nowIso();$p['contextRevision']=$p['sharedContextRevision'];$p['phase']='ready';
            }
            $this->goalRequired($p);$slots=($p['module']==='article'||artifactType($p['module']))?1:($p['module']==='short_text'?3:5);ensure(count($p['versions'])<=60-$slots,'VERSION_LIMIT','本次候選的版本空間不足，請匯出後延續新作品；尚未呼叫 AI。',409);
            $instruction=userTextValue(field($input,'instruction',''),2000,'候選方向',true);
            $candidates=$module->generate($p,$instruction,$model);
            if($action==='confirm_generate')$p['messages'][]=$this->message('student','我確認目前主軸與方向，並明確要求產生候選。','goal_approval',array('goalSnapshot'=>$p['brief'],'directionConfirmation'=>$directionConfirmation));
            $p['messages'][]=$this->message('student',$instruction===''?'請依已確認目標產生一組候選組。':'請依已確認目標產生候選；這次方向：'.$instruction,'generation_request');
            $message=$this->message('assistant','新增了 '.count($candidates).' 組候選。正式版沒有變動；你可以比較、手動修改保存，或自己決定升為正式版。','generation',array('provenance'=>$this->provenance($connection,$adapter,$requestedAt),'referencesSnapshot'=>$p['references']));$ids=array();
            foreach($candidates as $candidate)$ids[]=$this->appendVersion($p,$candidate['items'],$candidate['rationale'],'generated',null,$message['id'],$this->provenance($connection,$adapter,$requestedAt),'major',$candidate);
            $message['versionIds']=$ids;$p['messages'][]=$message;$p['phase']='work';return $this->save($p);
        }
        if($action==='snapshot') {
            $basedOn=field($input,'basedOnVersionId');if($p['officialVersionId']===null&&$basedOn===null)$this->goalRequired($p);if($basedOn!==null){$this->version($p,$basedOn);ensure(!versionArchived($p,$basedOn),'VERSION_ARCHIVED','請先還原來源版本，再編輯另存。',409);}$mode=field($input,'versionMode','major');ensure(in_array($mode,array('major','minor'),true),'VERSION_MODE','請選擇另存新版本或另存小修改。');if($mode==='minor')ensure($basedOn!==null,'VERSION_BASE_REQUIRED','請選擇小修改的來源版本。');
            $artifact=artifactType($p['module'])?validateArtifact(field($input,'artifact'),$p['module']):null;$items=$artifact===null?validateModuleContentItems(field($input,'items'),$p['module']):artifactItems($artifact);$base=$basedOn===null?null:$this->version($p,$basedOn);
            if($p['module']==='image'){$this->resolveImageAsset($p,$p['activeItemId'],$artifact);ensure($base!==null&&isset($base['artifact'])&&$artifact['asset']===$base['artifact']['asset'],'IMAGE_METADATA_ONLY','手動編輯只能修改選定圖片版本的名稱、說明與來源。更換圖片請使用明確上傳，另存新版本。',409);}
            $goalDefault=$base===null?field($p['brief'],'summary',''):versionGoalText($base);
            if(array_key_exists('goalAndRationale',$input)){
                $combined=validateCombinedVersionNote($input['goalAndRationale']);
                // Do not pretend a freeform combined note can be split into goals
                // and comments. Keep legacy fields as compatibility history only.
                $goalText=$goalDefault;$rationale=$base===null?'':field($base,'rationale','');$changeSummary=$base===null?'':field($base,'changeSummary','');
                $metadata=array('goalText'=>$goalText,'changeSummary'=>$changeSummary,'goalAndRationale'=>$combined);
            }else{
                $rationale=userTextValue(field($input,'rationale',''),2000,'保存說明',true);
                $goalText=userTextValue(field($input,'goalText',$goalDefault),6000,'這個版本的創作目標');
                $metadata=array('goalText'=>$goalText,'changeSummary'=>$rationale);
            }
            if($artifact!==null)$metadata['artifact']=$artifact;
            $message=$this->message('student','手動保存一個新候選版本，包含本版目標與修改意見，沒有覆寫原版或正式版。','snapshot');
            $id=$this->appendVersion($p,$items,$rationale,'snapshot',$basedOn,$message['id'],null,$mode,$metadata);$message['versionIds']=array($id);$p['messages'][]=$message;$p['phase']='work';return $this->save($p);
        }
        if($action==='promote') {
            $v=$this->version($p,field($input,'versionId'));ensure(!versionArchived($p,$v['id']),'VERSION_ARCHIVED','請先還原這個候選版本，再採用為正式版。',409);ensure($p['officialVersionId']!==$v['id'],'ALREADY_OFFICIAL','這個版本已是正式版。',409);
            $old=$p['officialVersionId'];$p['officialVersionId']=$v['id'];$index=$this->locateItem($p,$p['activeItemId']);
            $previousItemTitle=$p['creativeItems'][$index]['title'];$itemTitle=$p['module']==='titles'?officialItemTitle($v['items']):$previousItemTitle;$p['creativeItems'][$index]['title']=$itemTitle;$p['activeItem']['title']=$itemTitle;
            $p['messages'][]=$this->message('student','我選擇 '.versionLabel($v).'「'.$v['title'].'」作為正式版。'.($p['module']==='titles'?'創作項目名稱同步更新為「'.$itemTitle.'」。':'').'其他版本完整保留。','promotion',array('versionIds'=>array($v['id']),'previousOfficialVersionId'=>$old,'previousItemTitle'=>$previousItemTitle,'itemTitle'=>$itemTitle));return $this->save($p);
        }
        if($action==='archive_version'||$action==='restore_version'){
            $v=$this->version($p,field($input,'versionId'));$archived=versionArchived($p,$v['id']);
            if($action==='archive_version'){ensure($p['officialVersionId']!==$v['id'],'OFFICIAL_ARCHIVE','正式版不可封存，請先選擇其他正式版。',409);ensure(!$archived,'VERSION_ALREADY_ARCHIVED','這個版本已封存。',409);$p['archivedVersionIds'][]=$v['id'];}
            else{ensure($archived,'VERSION_NOT_ARCHIVED','這個版本目前沒有封存。',409);$p['archivedVersionIds']=array_values(array_filter($p['archivedVersionIds'],function($id)use($v){return $id!==$v['id'];}));}
            if(count($p['messages'])<400)$p['messages'][]=$this->message('student',($action==='archive_version'?'我封存 ':'我還原 ').versionLabel($v).'；原內容、引用與版本歷史完整保留。',$action,array('versionIds'=>array($v['id'])));return $this->save($p);
        }
        if($action==='fuse'){
            ensure(count($p['versions'])<60,'VERSION_LIMIT','此項目已達版本上限，尚未呼叫 AI。',409);
            $ids=field($input,'versionIds');ensure(is_array($ids)&&count($ids)>=2&&count($ids)<=5,'COMPARISON_SELECTION','請選取2至5個不同版本，再明確要求融合。');
            foreach($ids as $id)validId($id);ensure(count(array_unique($ids,SORT_STRING))===count($ids),'COMPARISON_SELECTION','不可重複選取同一版本。');
            $versions=array();$snapshots=array();foreach($ids as $id){ensure(!versionArchived($p,$id),'VERSION_ARCHIVED','請先還原封存版本，再加入新的融合。',409);$v=$this->version($p,$id);$versions[]=$v;$snapshots[]=$this->pinnedVersion($v);}
            $question=userTextValue(field($input,'question',''),2000,'融合方向',true);$result=$module->fuse($p,$versions,$question,$model);$provenance=$this->provenance($connection,$adapter,$requestedAt);
            $p['messages'][]=$this->message('student','我明確要求把選取版本融合成新的候選；不是選出勝負，也不取代正式版。'.($question===''?'':' 融合方向：'.$question),'fusion_request',array('versionIds'=>$ids));
            $message=$this->message('assistant','已新增一個融合候選。請查看完整內容、採納與捨棄的方向；原版本和正式版保持不變。','fusion',array('sourceVersionIds'=>$ids,'provenance'=>$provenance,'referencesSnapshot'=>$p['references']));
            $id=$this->appendVersion($p,$result['items'],$result['rationale'],'fusion',null,$message['id'],$provenance,'major',$result);$index=count($p['versions'])-1;
            $p['versions'][$index]['fusionSourceVersionIds']=$ids;$p['versions'][$index]['fusionSourceSnapshots']=$snapshots;$p['versions'][$index]['fusionInstruction']=$question;
            $message['versionIds']=array($id);$p['messages'][]=$message;$p['phase']='work';$saved=$this->save($p);$saved['fusionVersionId']=$id;return $saved;
        }
        ensure(count($p['comparisons'])<60,'COMPARISON_LIMIT','比較紀錄已達60筆，請匯出後開啟新作品。',409);
        $ids=field($input,'versionIds');ensure(is_array($ids)&&count($ids)>=2&&count($ids)<=5,'COMPARISON_SELECTION','請選取2至5個不同版本，可包含正式版與候選。');
        foreach($ids as $id)validId($id);ensure(count(array_unique($ids,SORT_STRING))===count($ids),'COMPARISON_SELECTION','不可重複選取同一版本。');
        $versions=array();foreach($ids as $id){ensure(!versionArchived($p,$id),'VERSION_ARCHIVED','比較包含封存版本，請先還原或取消選取。',409);$versions[]=$this->version($p,$id);}$question=userTextValue(field($input,'question',''),2000,'比較重點',true);
        if($p['module']==='image')$this->prepareImageInputs($p,$module,$versions,false);
        $result=$module->compare($p,$versions,$question,$model);$message=$this->message('assistant',$result['summary'],'comparison',array('provenance'=>$this->provenance($connection,$adapter,$requestedAt),'referencesSnapshot'=>$p['references']));$id=newId();
        $goalSnapshots=array();foreach($versions as $v)$goalSnapshots[]=versionComparisonSnapshot($v);
        $comparison=array('id'=>$id,'versionIds'=>$ids,'goalBasis'=>'version_snapshots','goalSnapshot'=>null,'versionGoalSnapshots'=>$goalSnapshots,'question'=>$question,'referencesSnapshot'=>$p['references'],'provenance'=>$this->provenance($connection,$adapter,$requestedAt),'items'=>$result['items'],'summary'=>$result['summary'],'messageId'=>$message['id'],'createdAt'=>nowIso());
        $p['messages'][]=$this->message('student','請依各選取版本自己的目標、討論變更與修改意見比較，不以目前共用目標統一評分，也不視為重新確認目標。'.($question===''?'':' 比較重點：'.$question),'comparison_request',array('versionIds'=>$ids));
        $message['comparisonId']=$id;$message['versionIds']=$ids;$p['messages'][]=$message;$p['comparisons'][]=$comparison;return $this->save($p);
    }
}
