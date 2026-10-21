<?php
class CocreationApp {
    private $store; private $config; private $owner; private $vault; private $model;
    public function __construct($store,$config,$owner,$adapter=null) {
        $this->store=$store;$this->config=$config;$this->owner=$owner;$this->vault=new SessionKeyVault($config['data_dir']);$this->model=$adapter;
    }
    private function connection() { return $this->store->connection($this->config['openai_model'],$this->owner); }
    private function adapter($connection) {
        if($this->model!==null)return $this->model;
        if($connection['provider']==='ollama')return new OllamaAdapter($connection['ollamaUrl'],$this->config['model_timeout_ms']);
        $vault=$this->vault;$owner=$this->owner;return new OpenAIAdapter(function()use($vault,$owner){return $vault->get($owner);},$this->config['model_timeout_ms']);
    }
    private function provenance($connection,$adapter,$requestedAt) { return array('provider'=>$connection['provider'],'requestedModel'=>$connection['model'],'actualModel'=>$adapter->actualModel(),'requestedAt'=>$requestedAt); }
    private function checkApproval($input,$connection,$needsConsent=true) {
        if($needsConsent)ensure(field($input,'consent')===true,'CONSENT_REQUIRED','請先確認這次會將專案文字傳給所選 AI 服務；OpenAI 會另外計費。',409);
        ensure(field($input,'approvedProvider')===$connection['provider']&&field($input,'approvedSettingsRevision')===$connection['settingsRevision'],'SETTINGS_CHANGED','AI 服務或連線設定已變更。請重新整理設定並確認此次目的地；不會自動轉用另一個服務。',409);
        ensure(field($input,'approvedModel')===$connection['model'],'MODEL_CHANGED','模型設定已改變。請重新整理並確認此次模型。',409);
        if($connection['provider']==='openai'){
            $status=$this->vault->status($this->owner);ensure($status['keyPresent'],'API_KEY_REQUIRED','本次 OpenAI 金鑰已清除或到期，請重新貼入後確認。',409);
            ensure(field($input,'approvedKeyRevision')===$status['keyRevision'],'KEY_CHANGED','金鑰設定已改變，請重新確認本次呼叫，避免使用另一個 API 帳戶。',409);
        }
    }
    public function status() { return array_merge($this->connection(),$this->vault->status($this->owner),array('modelCatalog'=>$this->store->modelCatalog($this->owner))); }
    public function state() { return array_merge($this->status(),array('csrf'=>$_SESSION['csrf'],'projects'=>$this->store->listProjects($this->owner),'modules'=>moduleRegistry())); }
    private function itemKeys() { return array('phase','lifecycle','brief','goalApprovedAt','summaryRevision','versions','officialVersionId','comparisons','messages','finalizedVersionId','finalizedAt','finalizations','references','contextRevision'); }
    private function newItem($type,$title,$description) {
        $supported=array_column(moduleRegistry(),'enabled','id');ensure(isset($supported[$type]),'ITEM_TYPE','未知創作項目類型。');
        return array('id'=>newId(),'type'=>$type,'title'=>userTextValue($title,240,'創作項目名稱'),'description'=>userTextValue($description,4000,'項目說明',true),'enabled'=>$supported[$type],'archived'=>false,'phase'=>'discussion','lifecycle'=>'created','brief'=>null,'goalApprovedAt'=>null,'summaryRevision'=>null,'versions'=>array(),'officialVersionId'=>null,'comparisons'=>array(),'messages'=>array($this->message('system',$supported[$type]?'先不用一次想完。這個創作項目要替什麼內容命名？':'此項目目前只有規劃位置，可填寫說明、加入其他項目的版本引用；尚未提供 AI 生成。','welcome')),'finalizedVersionId'=>null,'finalizedAt'=>null,'finalizations'=>array(),'references'=>array(),'contextRevision'=>0,'createdAt'=>nowIso());
    }
    private function view($raw) {
        ensure(isset($raw['creativeItems'],$raw['activeItemId'],$raw['sharedContextRevision']),'DATA_SCHEMA_UNSUPPORTED','這不是本版的專案資料格式。請使用新的私有資料夾；不要覆寫既有其他系統的資料。',409);
        $selected=null;
        foreach($raw['creativeItems'] as &$item){
            if($item['contextRevision']!==$raw['sharedContextRevision']){$item['goalApprovedAt']=null;$item['summaryRevision']=null;$item['phase']='discussion';$item['sharedContextChanged']=true;}else unset($item['sharedContextChanged']);
            if($item['id']===$raw['activeItemId'])$selected=$item;
        }unset($item);
        ensure($selected!==null,'ITEM_NOT_FOUND','找不到目前創作項目。',404);$out=$raw;
        foreach($this->itemKeys() as $key)$out[$key]=$selected[$key];$out['module']=$selected['type'];$out['activeItem']=$selected;
        if(isset($selected['sharedContextChanged']))$out['sharedContextChanged']=true;
        return $out;
    }
    public function project($id) { return $this->view($this->store->project($id,$this->owner)); }
    private function saveRaw($raw) { $raw['revision']++;return array('project'=>$this->view($this->store->save($raw,$this->owner))); }
    private function locateItem($raw,$id) { validId($id);foreach($raw['creativeItems'] as $index=>$item)if($item['id']===$id)return $index;throw new AppError('ITEM_NOT_FOUND','找不到這個專案的創作項目。',404); }
    private function activeInput($p,$input) { ensure(field($input,'itemId')===$p['activeItemId'],'ACTIVE_ITEM_CHANGED','目前創作項目已切換，請重新開啟要處理的項目；未改動其他項目。',409); }
    private function pinnedVersion($version) {
        // Preserve the complete source content and direct provenance, not exponentially
        // nested copies of every prior source's sources. Lineage ids remain available.
        if(isset($version['referencesSnapshot']))foreach($version['referencesSnapshot'] as &$ref){$source=field($ref,'versionSnapshot',array());unset($ref['versionSnapshot']);$ref['sourceProvenance']=field($source,'provenance');}unset($ref);
        return $version;
    }
    private function reserveStorage($p,$bytes) { $raw=$this->store->project($p['id'],$this->owner);ensure(strlen(jsonEncode($raw))+$bytes<=2000000,'PROJECT_LIMIT','此專案接近儲存上限，無法安全保存本次完整結果。沒有呼叫AI；請先匯出，再建立新專案延續。',409); }
    private function shellAction($action,$input) {
        $raw=$this->store->project(field($input,'id'),$this->owner);$this->revision($raw,$input);
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
                    ensure(count($item['references'])<12,'REFERENCE_LIMIT','每個項目最多12筆固定版本引用。',409);$target=$raw['creativeItems'][$this->locateItem($raw,field($input,'targetItemId'))];ensure($target['id']!==$item['id'],'REFERENCE_SELF','請選取同專案的其他創作項目。');$version=$this->version($target,field($input,'versionId'));
                    foreach($item['references'] as $ref)ensure(!($ref['targetItemId']===$target['id']&&$ref['versionId']===$version['id']),'REFERENCE_DUPLICATE','已引用這個固定版本。',409);
                    $ref=array('id'=>newId(),'projectId'=>$raw['id'],'targetItemId'=>$target['id'],'targetItemTitle'=>$target['title'],'versionId'=>$version['id'],'versionSnapshot'=>$this->pinnedVersion($version),'pinnedAt'=>nowIso());$item['references'][]=$ref;$item['messages'][]=$this->message('student','我明確引用「'.$target['title'].'」V'.$version['number'].'的固定快照。來源後續改版不會自動替換此引用。','reference_added',array('referenceId'=>$ref['id']));
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
    private function studentTurns($project) { return count(array_filter($project['messages'],function($m){return $m['role']==='student'&&$m['kind']==='discussion';})); }
    private function version($project,$id) { validId($id);foreach($project['versions'] as $version)if($version['id']===$id)return $version;throw new AppError('VERSION_NOT_FOUND','找不到此作品的版本。',404); }
    private function goalRequired($project) { ensure($project['brief']!==null&&$project['goalApprovedAt']!==null&&in_array($project['phase'],array('ready','work'),true),'GOAL_APPROVAL_REQUIRED','請先整理並確認目前創作目標；新對話後需重新確認，已有版本會完整保留。',409); }
    private function appendVersion(&$project,$items,$rationale,$source,$basedOn,$messageId,$provenance=null) {
        ensure(count($project['versions'])<60,'VERSION_LIMIT','此作品已達60個版本，請匯出保存後建立新作品。',409);
        $v=array('id'=>newId(),'number'=>count($project['versions'])+1,'title'=>bundleDisplayTitle($items),'items'=>$items,'rationale'=>$rationale,'source'=>$source,'basedOnVersionId'=>$basedOn,'goalSnapshot'=>$project['brief'],'referencesSnapshot'=>$project['references'],'projectContextSnapshot'=>array('title'=>$project['title'],'description'=>$project['description'],'revision'=>$project['sharedContextRevision']),'provenance'=>$provenance,'messageId'=>$messageId,'createdAt'=>nowIso());
        $project['versions'][]=$v;return $v['id'];
    }
    public function action($input) {
        $action=field($input,'action');$paid=in_array($action,array('discuss','summarize','generate','compare'),true);
        if(!$paid)return $this->execute($action,$input);
        $connection=$this->connection();$this->checkApproval($input,$connection);
        $requestId=field($input,'requestId');$fingerprint=hash('sha256',jsonEncode($input));
        $previous=$this->store->requestStart($this->owner,$requestId,$action,$fingerprint);
        if($previous!==null)return array('project'=>$this->project($previous['projectId']));
        try {
            $result=$this->execute($action,$input);
            $this->store->requestFinish($this->owner,$requestId,array('projectId'=>$result['project']['id']),true);
            return $result;
        } catch(Throwable $e) {$this->store->requestFinish($this->owner,$requestId,null,false);throw $e;}
    }
    private function execute($action,$input) {
        if($action==='save_settings') {
            $connection=validateConnection($input);$this->store->setConnection($connection,$this->owner);$this->store->rememberModel($connection['provider'],$connection['model'],$this->owner);return $this->status();
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
            $raw=array('schemaVersion'=>1,'id'=>newId(),'title'=>userTextValue(field($input,'title','我的共創專案'),240,'專案名稱'),'description'=>userTextValue(field($input,'description',''),4000,'專案說明',true),'projectLifecycle'=>'created','projectFinalizations'=>array(),'revision'=>0,'sharedContextRevision'=>0,'activeItemId'=>$item['id'],'creativeItems'=>array($item),'createdAt'=>nowIso());
            return array('project'=>$this->view($this->store->save($raw,$this->owner)));
        }
        if(in_array($action,array('create_item','select_item','edit_item','archive_item','restore_item','attach_reference','remove_reference','finalize_project','reopen_project'),true))return $this->shellAction($action,$input);
        ensure(in_array($action,array('edit_project','finalize','reopen','discuss','summarize','approve_goal','generate','snapshot','promote','compare'),true),'UNKNOWN_ACTION','未知操作。',404);
        $p=$this->project(field($input,'id'));$this->revision($p,$input);ensure($p['projectLifecycle']!=='finalized','PROJECT_CLOSED','專案已結案，請先重新開啟專案。',409);$connection=$this->connection();$adapter=$this->adapter($connection);$model=$connection['model'];$requestedAt=nowIso();
        if($action==='edit_project') {
            $description=userTextValue(field($input,'description',''),4000,'專案說明',true);$title=userTextValue(field($input,'title'),240,'專案名稱');$changed=$description!==$p['description']||$title!==$p['title'];
            if($changed&&$p['brief']!==null){$p['goalApprovedAt']=null;$p['summaryRevision']=null;$p['phase']='discussion';$p['messages'][]=$this->message('system','專案名稱或說明已更新。既有版本保留；下次產生候選前請重新整理並確認創作目標。','project_edit');}
            if($changed)$p['sharedContextRevision']++;$p['description']=$description;$p['title']=$title;return $this->save($p);
        }
        $this->activeInput($p,$input);ensure(!$p['activeItem']['archived'],'ITEM_ARCHIVED','請先還原封存項目。',409);ensure($p['activeItem']['enabled'],'CAPABILITY_UNAVAILABLE','這個創作類型目前只提供規劃及固定版本引用，尚未實作 AI 生成與定稿。',409);$module=moduleAdapter($p['module'],$adapter);
        if($action==='reopen') {
            ensure($p['lifecycle']==='finalized','PROJECT_NOT_FINALIZED','此專案尚未定稿，不必重新開啟。',409);
            $p['lifecycle']='in_progress';$p['finalizedVersionId']=null;$p['finalizedAt']=null;
            $p['messages'][]=$this->message('student','我重新開啟討論；先前的定稿快照、正式版與所有歷程完整保留。','reopen');return $this->save($p);
        }
        ensure($p['lifecycle']!=='finalized','PROJECT_FINALIZED','此專案已定稿。請先按「重新開啟討論」，原定稿快照會保留。',409);
        if($action==='finalize') {
            $this->goalRequired($p);ensure($p['officialVersionId']!==null,'OFFICIAL_REQUIRED','請先選一組候選升為正式版，再結案定稿。',409);
            $v=$this->version($p,$p['officialVersionId']);$p['lifecycle']='finalized';$p['finalizedVersionId']=$v['id'];$p['finalizedAt']=nowIso();
            $message=$this->message('student','我將正式版 V'.$v['number'].'「'.$v['title'].'」結案定稿。','finalization',array('versionIds'=>array($v['id'])));
            $p['finalizations'][]=array('versionId'=>$v['id'],'versionSnapshot'=>$v,'acceptedGoalSnapshot'=>$p['brief'],'sharedContextRevision'=>$p['sharedContextRevision'],'at'=>$p['finalizedAt'],'messageId'=>$message['id']);$p['messages'][]=$message;return $this->save($p);
        }
        $p['lifecycle']='in_progress';
        if(in_array($action,array('discuss','summarize','generate','compare'),true))$this->reserveStorage($p,inferenceGrowthBudget($p,$action));
        ensure(count($p['messages'])<400,'DIALOGUE_LIMIT','此作品對話已達上限，請匯出完整紀錄後開啟新作品。',409);
        if($action==='discuss') {
            ensure($this->studentTurns($p)<60,'DIALOGUE_LIMIT','此作品已有60輪討論，請匯出後開啟新作品。',409);
            $text=userTextValue(field($input,'text'),4000,'你的想法');
            if($p['officialVersionId']!==null){
                // Promotion is a working baseline, never an implicit finalization.
                // Legacy discussions may have cleared approval: editing an existing
                // official bundle still works, without inventing new goal approval.
                ensure(count($p['versions'])<60,'VERSION_LIMIT','此項目已達60個版本，請匯出保存後延續新項目；本次未呼叫AI。',409);
                $official=$this->version($p,$p['officialVersionId']);$result=$module->refine($p,$official,$text,$model);$provenance=$this->provenance($connection,$adapter,$requestedAt);
                $p['messages'][]=$this->message('student',$text,'discussion',array('basedOnVersionId'=>$official['id']));
                $message=$this->message('assistant',$result['reply'],$result['outcome']==='revision'?'revision':'clarification',array('basedOnVersionId'=>$official['id'],'provenance'=>$provenance,'referencesSnapshot'=>$p['references']));
                if($result['outcome']==='revision'){
                    $id=$this->appendVersion($p,$result['items'],$result['rationale'],'revision',$official['id'],$message['id'],$provenance);
                    $p['versions'][count($p['versions'])-1]['revisionInstruction']=$text;$message['versionIds']=array($id);$message['text'].=' 已新增可審閱的完整修訂版，尚未取代正式版；請查看右側差異，再決定是否採用。';$p['phase']='work';
                    $p['messages'][]=$message;$saved=$this->save($p);$saved['revisionVersionId']=$id;return $saved;
                }
                $p['messages'][]=$message;return $this->save($p);
            }
            $reply=$module->discuss($p,$text,$model);
            $p['messages'][]=$this->message('student',$text,'discussion');$p['messages'][]=$this->message('assistant',$reply,'discussion',array('provenance'=>$this->provenance($connection,$adapter,$requestedAt),'referencesSnapshot'=>$p['references']));
            $p['phase']='discussion';$p['goalApprovedAt']=null;$p['summaryRevision']=null;return $this->save($p);
        }
        if($action==='summarize') {
            ensure($this->studentTurns($p)>=3,'MORE_DISCUSSION','至少交流三次，再一起整理目標。先把想法談清楚，不急著產生標題。',409);
            $p['brief']=$module->summarize($p,$model);$p['contextRevision']=$p['sharedContextRevision'];$p['goalApprovedAt']=null;$p['phase']='summary';$p['summaryRevision']=$p['revision']+1;
            $p['messages'][]=$this->message('assistant','我把目前對話整理成右側的創作目標草案。請確認它是不是你的意思；還有不同之處就繼續聊。','goal_summary',array('goalSnapshot'=>$p['brief'],'provenance'=>$this->provenance($connection,$adapter,$requestedAt),'referencesSnapshot'=>$p['references']));return $this->save($p);
        }
        if($action==='approve_goal') {
            ensure($p['phase']==='summary'&&$p['brief']!==null&&is_int($p['summaryRevision']),'SUMMARY_REQUIRED','請先整理最新目標，再按確認。',409);
            $p['goalApprovedAt']=nowIso();$p['phase']=count($p['versions'])?'work':'ready';
            $p['messages'][]=$this->message('student','我確認這份創作目標；產生候選仍需由我另按按鈕。','goal_approval',array('goalSnapshot'=>$p['brief']));return $this->save($p);
        }
        if($action==='generate') {
            $this->goalRequired($p);ensure(count($p['versions'])<=55,'VERSION_LIMIT','候選空間不足5個，請匯出後開啟新作品。',409);
            $instruction=userTextValue(field($input,'instruction',''),2000,'候選方向',true);
            $candidates=$module->generate($p,$instruction,$model);
            $p['messages'][]=$this->message('student',$instruction===''?'請依已確認目標產生一組候選組。':'請依已確認目標產生候選；這次方向：'.$instruction,'generation_request');
            $message=$this->message('assistant','新增了 '.count($candidates).' 組候選。正式版沒有變動；你可以比較、手動修改保存，或自己決定升為正式版。','generation',array('provenance'=>$this->provenance($connection,$adapter,$requestedAt),'referencesSnapshot'=>$p['references']));$ids=array();
            foreach($candidates as $candidate)$ids[]=$this->appendVersion($p,$candidate['items'],$candidate['rationale'],'generated',null,$message['id'],$this->provenance($connection,$adapter,$requestedAt));
            $message['versionIds']=$ids;$p['messages'][]=$message;$p['phase']='work';return $this->save($p);
        }
        if($action==='snapshot') {
            if($p['officialVersionId']===null)$this->goalRequired($p);$basedOn=field($input,'basedOnVersionId');if($basedOn!==null)$this->version($p,$basedOn);
            $items=validateContentItems(field($input,'items'));$rationale=userTextValue(field($input,'rationale',''),2000,'保存說明',true);
            $message=$this->message('student','手動保存一個新候選版本，沒有覆寫原版或正式版。','snapshot');
            $id=$this->appendVersion($p,$items,$rationale,'snapshot',$basedOn,$message['id']);$message['versionIds']=array($id);$p['messages'][]=$message;$p['phase']='work';return $this->save($p);
        }
        if($action==='promote') {
            $v=$this->version($p,field($input,'versionId'));ensure($p['officialVersionId']!==$v['id'],'ALREADY_OFFICIAL','這個版本已是正式版。',409);
            $old=$p['officialVersionId'];$p['officialVersionId']=$v['id'];
            $p['messages'][]=$this->message('student','我選擇 V'.$v['number'].'「'.$v['title'].'」作為正式版。其他版本完整保留。','promotion',array('versionIds'=>array($v['id']),'previousOfficialVersionId'=>$old));return $this->save($p);
        }
        $this->goalRequired($p);ensure(count($p['comparisons'])<60,'COMPARISON_LIMIT','比較紀錄已達60筆，請匯出後開啟新作品。',409);
        $ids=field($input,'versionIds');ensure(is_array($ids)&&count($ids)>=2&&count($ids)<=5,'COMPARISON_SELECTION','請選取2至5個不同版本，可包含正式版與候選。');
        foreach($ids as $id)validId($id);ensure(count(array_unique($ids,SORT_STRING))===count($ids),'COMPARISON_SELECTION','不可重複選取同一版本。');
        $versions=array();foreach($ids as $id)$versions[]=$this->version($p,$id);$question=userTextValue(field($input,'question',''),2000,'比較重點',true);
        $result=$module->compare($p,$versions,$question,$model);$message=$this->message('assistant',$result['summary'],'comparison',array('provenance'=>$this->provenance($connection,$adapter,$requestedAt),'referencesSnapshot'=>$p['references']));$id=newId();
        $comparison=array('id'=>$id,'versionIds'=>$ids,'goalSnapshot'=>$p['brief'],'question'=>$question,'referencesSnapshot'=>$p['references'],'provenance'=>$this->provenance($connection,$adapter,$requestedAt),'items'=>$result['items'],'summary'=>$result['summary'],'messageId'=>$message['id'],'createdAt'=>nowIso());
        $p['messages'][]=$this->message('student','請比較選取的版本，給我依創作目標判斷的建議。'.($question===''?'':' 比較重點：'.$question),'comparison_request',array('versionIds'=>$ids));
        $message['comparisonId']=$id;$message['versionIds']=$ids;$p['messages'][]=$message;$p['comparisons'][]=$comparison;return $this->save($p);
    }
}
