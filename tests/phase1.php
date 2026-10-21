<?php
/**
 * Native PHP 7.4+ phase-one workflow fixtures for the real app and modules.
 * Run: php tests/phase1.php
 * UNEXECUTED in the authoring environment: PHP is unavailable. A lexer-only
 * check is not PHP syntax, runtime, SQLite, HTTP or live provider verification.
 * No real keys, network, external model, PDO, SQLite or user data are used.
 * An in-memory Store is only the persistence seam; all business rules are real.
 */
require_once dirname(__DIR__).'/app/bootstrap.php';
require_once __DIR__.'/phase1-helpers.php';

$phase1Checks=0;
function phase1Check($ok,$label) {
    global $phase1Checks;
    if(!$ok)throw new RuntimeException('FAIL: '.$label);
    $phase1Checks++;echo 'PASS '.$label."\n";
}
function phase1Last($items) {return $items[count($items)-1];}
function phase1Reject($app,$adapter,$input,$code,$label,$expectedCalls=0) {
    $before=$app->project($input['id']);$calls=$adapter->calls;$error=null;
    try{$app->action($input);}catch(AppError $caught){$error=$caught;}
    phase1Check($error instanceof AppError&&$error->errorCode===$code,$label.': '.$code);
    phase1Check($adapter->calls===$calls+$expectedCalls,$label.': exact provider call count');
    phase1Check($app->project($input['id'])===$before,$label.': complete persisted project unchanged');
    return $error;
}
function phase1Cleanup($dir) {
    if(!is_dir($dir))return;
    foreach(scandir($dir) as $name)if($name!=='.'&&$name!=='..') {
        $path=$dir.'/'.$name;if(is_dir($path))phase1Cleanup($path);else unlink($path);
    }
    rmdir($dir);
}
function phase1Roster($app,$members,$activeId,$consent=true) {
    $status=$app->status();
    return $app->action(array('action'=>'save_members','members'=>$members,'activeMemberId'=>$activeId,
        'usageConsent'=>$consent,'expectedSettingsRevision'=>$status['settingsRevision']));
}
function phase1Definitions($type) {
    if($type==='short_text')return array(array('id'=>'body','label'=>'全文'));
    if($type==='article')return array(array('id'=>'opening','label'=>'開場'),array('id'=>'evidence','label'=>'主體'),array('id'=>'ending','label'=>'結語'));
    return array(array('id'=>'name','label'=>'中文名稱'),array('id'=>'custom','label'=>'自訂邀請語'));
}
function phase1Brief($type) {
    return array('purpose'=>'活動創作','audience'=>'一般讀者','message'=>'發現日常故事','tone'=>'清楚溫暖',
        'constraints'=>'不捏造事實','summary'=>'以清楚溫暖的文字邀請一般讀者發現日常故事。','items'=>phase1Definitions($type));
}

class Phase1MemoryStore {
    private $projects=array();private $connections=array();private $requests=array();private $rosters=array();
    public $onRequestStart=null;
    public function listProjects($owner) {
        $out=array();foreach(field($this->projects,$owner,array()) as $project)$out[]=$project;return $out;
    }
    public function project($id,$owner) {
        validId($id);ensure(isset($this->projects[$owner][$id]),'PROJECT_NOT_FOUND','Fixture project not found.',404);
        return $this->projects[$owner][$id];
    }
    public function save($project,$owner) {
        $project['updatedAt']=nowIso();$json=jsonEncode($project);
        ensure(strlen($json)<=2000000,'PROJECT_LIMIT','Fixture project too large.',409);
        // Round-trip matches Store's plain persisted value semantics, without PDO.
        $this->projects[$owner][$project['id']]=json_decode($json,true,128,JSON_THROW_ON_ERROR);
        return $this->projects[$owner][$project['id']];
    }
    public function connection($default,$owner) {
        if(isset($this->connections[$owner]))return $this->connections[$owner];
        $out=array('provider'=>'ollama','model'=>$default,'ollamaUrl'=>'http://127.0.0.1:11434');
        $out['settingsRevision']=hash('sha256',$owner.jsonEncode($out));return $out;
    }
    public function memberRoster($default,$owner) {
        if(!isset($this->rosters[$owner])) {
            $id=str_repeat('d',32);
            // Explicit fixture setup, not production migration or implied consent.
            $this->rosters[$owner]=array('members'=>array(array('id'=>$id,'nickname'=>'測試夥伴','enabled'=>true,
                'provider'=>'ollama','model'=>$default,'ollamaUrl'=>'http://127.0.0.1:11434')),
                'activeMemberId'=>$id,'settingsRevision'=>hash('sha256',$owner.'phase1-roster'),
                'usageConsent'=>true,'consentAt'=>'2026-01-01T00:00:00+00:00');
        }
        return validateStoredMemberRoster($this->rosters[$owner]);
    }
    public function setMemberRoster($members,$activeMemberId,$usageConsent,$owner,$expectedRevision=null) {
        $input=validateMemberRosterInput($members,$activeMemberId,$usageConsent);
        if($expectedRevision!==null)ensure(isset($this->rosters[$owner])&&$this->rosters[$owner]['settingsRevision']===$expectedRevision,'SETTINGS_CHANGED','Fixture roster lease changed.',409);
        $out=array('members'=>$input['members'],'activeMemberId'=>$input['activeMemberId'],'settingsRevision'=>randomToken(),
            'usageConsent'=>$input['usageConsent'],'consentAt'=>$input['usageConsent']?nowIso():null);
        $this->rosters[$owner]=validateStoredMemberRoster($out);return $this->rosters[$owner];
    }
    public function selectMember($id,$default,$owner,$expectedRevision=null) {
        ensure($id===null||(is_string($id)&&preg_match('/^[a-f0-9]{32}$/D',$id)),'MEMBER_INVALID','Fixture member id invalid.');
        $out=$this->memberRoster($default,$owner);
        ensure($expectedRevision===null||$expectedRevision===$out['settingsRevision'],'SETTINGS_CHANGED','Fixture selection lease changed.',409);
        $found=$id===null;
        foreach($out['members'] as $member)if($member['id']===$id) {
            ensure($member['enabled'],'MEMBER_DISABLED','Fixture member disabled.',409);$found=true;break;
        }
        ensure($found,'MEMBER_NOT_FOUND','Fixture member not found.',404);
        $out['activeMemberId']=$id;$out['settingsRevision']=randomToken();$this->rosters[$owner]=$out;return $out;
    }
    public function setConnection($values,$owner) {
        $out=validateConnection($values);$out['settingsRevision']=randomToken();
        $this->connections[$owner]=$out;return $out;
    }
    public function modelCatalog($owner) {return array('openai'=>array(),'ollama'=>array('fixture-local'));}
    public function rememberModel($provider,$model,$owner) {}
    public function requestStart($owner,$id,$action,$fingerprint) {
        ensure(is_string($id)&&preg_match('/^[a-zA-Z0-9-]{20,64}$/D',$id),'REQUEST_ID_REQUIRED','Fixture request id required.');
        $key=$owner.':'.$id;
        if(isset($this->requests[$key])) {
            $old=$this->requests[$key];
            ensure($old['action']===$action&&hash_equals($old['fingerprint'],$fingerprint),'REQUEST_ID_CONFLICT','Fixture request conflict.',409);
            ensure($old['status']==='completed','REQUEST_ALREADY_ATTEMPTED','Fixture request cannot be retried.',409);
            return $old['response'];
        }
        $this->requests[$key]=array('action'=>$action,'fingerprint'=>$fingerprint,'status'=>'running','response'=>null);
        $hook=$this->onRequestStart;$this->onRequestStart=null;if($hook!==null)$hook();return null;
    }
    public function requestFinish($owner,$id,$response,$success) {
        $key=$owner.':'.$id;$this->requests[$key]['status']=$success?'completed':'failed';$this->requests[$key]['response']=$success?$response:null;
    }
}

class Phase1FixtureAdapter {
    public $calls=0;public $data=null;public $schema=null;public $history=array();
    public $type='titles';public $mode='exploring';public $fail=false;public $onDispatch=null;
    public function actualModel() {return 'fixture-exact-resolved-v1';}
    public function generate($model,$messages,$schema,$maxOutputTokens=6000) {
        $this->calls++;$this->schema=$schema;
        $this->data=json_decode($messages[1]['content'],true,128,JSON_THROW_ON_ERROR);
        $this->history[]=array('model'=>$model,'data'=>$this->data,'schema'=>$schema,'messages'=>$messages,'maxOutputTokens'=>$maxOutputTokens);
        $hook=$this->onDispatch;$this->onDispatch=null;if($hook!==null)$hook();
        if($this->fail)throw new AppError('MODEL_TIMEOUT','Synthetic uncertain provider timeout.',502);
        $data=$this->data;$props=$schema['properties'];
        if(isset($props['directionStatus'])) {
            $ready=$this->mode==='ready';
            $out=array('reply'=>$ready?'創作方向已足夠，可確認後再產生候選。':'我理解你想讓內容更清楚。',
                'question'=>$ready?'':'你最想傳達哪一個重點？','choices'=>array(),
                'directionStatus'=>$ready?'ready':'exploring','direction'=>$ready?phase1Brief($this->type):fixtureEmptyDirection());
            if($this->mode==='invalid_ready'){$out['directionStatus']='ready';$out['question']='';}
        }elseif(isset($props['outcome'])) {
            $base=field($data,'sourceVersion',field($data,'baseVersion',field($data,'officialVersion')));
            $items=$base['items'];
            if($this->type==='article') {
                $ids=$data['targetItemIds'];
                $items=array_values(array_filter($items,function($item)use($ids){return in_array($item['id'],$ids,true);}));
            }
            $items[0]['content']=$this->mode==='article_whitespace'?" \n".$data['latestUserMessage']."\n\t":$data['latestUserMessage'];
            $out=array('outcome'=>'revision','reply'=>'這是可供審閱的新候選修訂。','question'=>'','choices'=>array(),
                'items'=>$items,'rationale'=>'只更新指定內容，其餘完整保留。','goalText'=>versionGoalText($base),
                'changeSummary'=>'依本次要求更新指定內容，不改動其他內容。');
            if($this->mode==='clarification')$out=array('outcome'=>'clarification','reply'=>'可以先選定想調整的語氣。',
                'question'=>'你希望語氣更溫暖或更直接？','choices'=>array(
                    array('id'=>'warm','label'=>'更溫暖','value'=>'請讓選取內容更溫暖。'),
                    array('id'=>'direct','label'=>'更直接','value'=>'請讓選取內容更直接。')),
                'items'=>array(),'rationale'=>'','goalText'=>'','changeSummary'=>'');
            elseif($this->mode==='outside_target')$out['items'][]=$base['items'][0];
            elseif($this->mode==='missing_target')array_pop($out['items']);
            elseif($this->mode==='renamed_target')$out['items'][0]['label']='未經同意的改名';
            elseif($this->mode==='oversize_edit')$out['items'][0]['content']=str_repeat('x',6001);
        }elseif(isset($props['candidates'])) {
            $out=array('candidates'=>array());
            $count=$this->type==='article'?1:3;if($this->mode==='extra_candidates')$count++;
            for($i=1;$i<=$count;$i++) {
                $items=array();foreach($data['creativeGoal']['items'] as $definition)$items[]=array(
                    'id'=>$definition['id'],'label'=>$definition['label'],'content'=>($this->type==='article'?" \n":'').'候選 '.$i.' 的'.$definition['label'].'內容。'.($this->type==='article'?"\n\t":''));
                $out['candidates'][]=array('items'=>$items,'rationale'=>'清楚呈現本候選的完整方向。',
                    'goalText'=>'候選 '.$i.' 自己的目標：邀請讀者發現日常故事。','changeSummary'=>'本次確認方向後首次建立候選。');
            }
        }elseif(isset($props['purpose']))$out=phase1Brief($this->type);
        elseif(isset($props['goalText'])) {
            $items=$data['selectedVersions'][0]['items'];$items[0]['content']='融合候選：'.$data['question'];
            $out=array('items'=>$items,'rationale'=>'整合所選版本的不同優點，保留其完整內容。',
                'goalText'=>'融合目標：'.versionGoalText($data['selectedVersions'][0]),'changeSummary'=>'融合所選固定版本，未替換正式版。');
            if($this->mode==='invalid_fusion')unset($out['goalText']);
        }else{
            $items=array();foreach($data['selectedVersions'] as $version)$items[]=array('versionId'=>$version['id'],
                'fit'=>'依本版目標評估。','strength'=>'表達清楚。','tradeoff'=>'各自取向不同。','suggestion'=>'保留主要訊息。');
            $out=array('items'=>$items,'summary'=>'各版適合不同方向，請自行決定。');
        }
        return json_decode(jsonEncode($out),false,128,JSON_THROW_ON_ERROR);
    }
}

$dir=sys_get_temp_dir().'/cocreation-phase1-'.bin2hex(random_bytes(6));mkdir($dir,0700,true);
try {
    $_SESSION=array('csrf'=>str_repeat('b',64));$owner=str_repeat('a',64);
    $config=validateConfig(array('app_url'=>'http://localhost/studio/public/','data_dir'=>$dir,
        'openai_model'=>'fixture-alpha','model_timeout_ms'=>120000));
    $store=new Phase1MemoryStore();$model=new Phase1FixtureAdapter();$app=new CocreationApp($store,$config,$owner,$model);
    phase1Check(!$app->status()['keyPresent'],'fixture never supplies a credential');
    $registry=moduleRegistry();
    phase1Check(array_column($registry,'id')===array('titles','short_text','article','illustrated','table','chart','mindmap','vector','image','poster','webpage','interactive'),'all twelve stable module ids in exact order');
    phase1Check(array_column(array_values(array_filter($registry,function($item){return $item['enabled'];})),'id')===array('titles','short_text','article','illustrated','table','chart','mindmap','vector','image','poster','webpage','interactive'),'only implemented text and typed artifact modules are enabled');

    $shortBoundary=array(array('id'=>'body','label'=>'全文','content'=>str_repeat('x',12000)));
    phase1Check(validateModuleContentItems($shortBoundary,'short_text')===$shortBoundary,'short full body accepts exact 12000-byte limit without truncation');
    $articleBoundary=array();for($i=1;$i<=20;$i++)$articleBoundary[]=array('id'=>'p'.$i,'label'=>'段落 '.$i,'content'=>str_repeat('x',6000));
    phase1Check(validateModuleContentItems($articleBoundary,'article')===$articleBoundary,'article full snapshot accepts exact 120000-byte limit');
    $invalidContent=array(
        array('short wrong id',array(array('id'=>'name','label'=>'全文','content'=>'文字')),'short_text','ITEMS_INVALID'),
        array('short wrong label',array(array('id'=>'body','label'=>'正文','content'=>'文字')),'short_text','ITEMS_INVALID'),
        array('short multiple bodies',array($shortBoundary[0],$shortBoundary[0]),'short_text','ITEMS_INVALID'),
        array('short too long',array(array('id'=>'body','label'=>'全文','content'=>str_repeat('x',12001))),'short_text','INVALID_INPUT'),
        array('article too many paragraphs',array_fill(0,81,array('id'=>'p1','label'=>'段落','content'=>'x')),'article','ITEMS_INVALID'),
        array('article too long',array_merge($articleBoundary,array(array('id'=>'p21','label'=>'段落 21','content'=>'x'))),'article','ITEMS_INVALID')
    );
    foreach($invalidContent as $case){$error=null;try{validateModuleContentItems($case[1],$case[2]);}catch(AppError $caught){$error=$caught;}phase1Check($error instanceof AppError&&$error->errorCode===$case[3],$case[0].' rejected without a model call');}
    phase1Check($model->calls===0,'content boundary checks never invoke inference');

    // New project selection is explicit. Read-time legacy compatibility does not bind.
    $legacy=$app->action(array('action'=>'new','title'=>'未綁定資料保留'))['project'];
    phase1Check($legacy['aiBinding']===null&&$model->calls===0,'missing project member never silently uses the global default');
    $legacyRaw=$store->project($legacy['id'],$owner);unset($legacyRaw['aiBinding']);$legacyRaw['legacyExtension']=array('preserve'=>'未知舊欄位不可刪除。');$legacyRaw['creativeItems'][0]['messages'][]=array('id'=>newId(),'role'=>'system','kind'=>'historic_notice','text'=>'舊資料原始紀錄。','at'=>'2026-01-01T00:00:00+00:00','legacyMetadata'=>array('keep'=>true));$store->save($legacyRaw,$owner);
    $rawBefore=$store->project($legacy['id'],$owner);$legacy=$app->project($legacy['id']);
    phase1Check($legacy['aiBinding']===null&&$store->project($legacy['id'],$owner)===$rawBefore,'legacy read projects null binding without rewriting persisted history');
    phase1Reject($app,$model,fixtureProjectInput($app,$legacy,'discuss',array('text'=>'不得自動派送。')),'PROJECT_MODEL_REQUIRED','legacy AI action needs explicit binding');
    $status=$app->status();$memberA=$status['memberId'];$members=$status['members'];$memberB=str_repeat('e',32);
    $members[0]['nickname']='甲創作夥伴';
    $members[]=array('id'=>$memberB,'nickname'=>'乙創作夥伴','enabled'=>true,'provider'=>'ollama','model'=>'fixture-beta','ollamaUrl'=>'http://localhost:11435');
    $status=phase1Roster($app,$members,$memberA);
    $beforeNew=$store->listProjects($owner);$newError=null;try{$app->action(array('action'=>'new','title'=>'未批准設定版本','memberId'=>$memberA));}catch(AppError $caught){$newError=$caught;}
    phase1Check($newError instanceof AppError&&$newError->errorCode==='SETTINGS_CHANGED'&&$store->listProjects($owner)===$beforeNew&&$model->calls===0,'new explicit binding requires a current settings lease and rejects atomically');
    $bind=array('action'=>'bind_project_model','id'=>$legacy['id'],'revision'=>$legacy['revision'],
        'memberId'=>$memberA,'expectedSettingsRevision'=>$status['settingsRevision']);
    phase1Reject($app,$model,array_merge($bind,array('expectedSettingsRevision'=>'obsolete')),'SETTINGS_CHANGED','legacy bind settings lease');
    phase1Reject($app,$model,array_merge($bind,array('revision'=>$legacy['revision']+1)),'STALE_REVISION','legacy bind project lease');
    $legacy=$app->action($bind)['project'];$frozen=$legacy['aiBinding'];
    phase1Check($legacy['legacyExtension']===$rawBefore['legacyExtension']&&$legacy['messages']===$rawBefore['creativeItems'][0]['messages'],'one-time binding preserves all legacy dialogue metadata and unknown extensions');
    phase1Check(array_keys($frozen)===array('memberId','memberNickname','provider','model','ollamaUrl','boundAt')&&
        $frozen['memberId']===$memberA&&$frozen['memberNickname']==='甲創作夥伴'&&$frozen['provider']==='ollama'&&
        $frozen['model']==='fixture-alpha'&&$frozen['ollamaUrl']==='http://127.0.0.1:11434'&&is_string($frozen['boundAt']),
        'one-time binding records exact identity provider model URL and timestamp');
    phase1Reject($app,$model,array_merge($bind,array('revision'=>$legacy['revision'],'memberId'=>$memberB)),'PROJECT_MODEL_BOUND','rebinding is forbidden');
    $p=$app->action(fixtureBoundNew($app,array('title'=>'固定模型專案')))['project'];
    phase1Check($p['aiBinding']['memberId']===$memberA&&$model->calls===0,'new project binds explicit member without inference');
    $oldInput=fixtureProjectInput($app,$p,'discuss',array('text'=>'此請求只准甲模型。'));
    $status=$app->action(array('action'=>'select_member','memberId'=>$memberB,'expectedSettingsRevision'=>$status['settingsRevision']));
    phase1Reject($app,$model,$oldInput,'SETTINGS_CHANGED','global selection invalidates old settings approval');
    $p=$app->action(fixtureProjectInput($app,$p,'discuss',array('text'=>'現在明確繼續原模型。')))['project'];$firstReply=phase1Last($p['messages']);
    phase1Check(phase1Last($model->history)['model']==='fixture-alpha'&&$firstReply['provenance']['memberId']===$memberA&&$p['aiBinding']['memberId']===$memberA,'fresh approval keeps fixed project model despite another global default');
    $members[0]['nickname']='中央已改名';$status=phase1Roster($app,$members,$memberB);
    $p=$app->action(fixtureProjectInput($app,$p,'discuss',array('text'=>'繼續討論。')))['project'];$renamedReply=phase1Last($p['messages']);
    phase1Check($p['messages'][2]===$firstReply&&$renamedReply['provenance']['memberNickname']==='甲創作夥伴'&&$p['aiBinding']['memberNickname']==='甲創作夥伴','central rename never relabels binding old replies or future fixed-identity provenance');
    foreach(array('provider'=>'openai','model'=>'fixture-changed','ollamaUrl'=>'http://localhost:11434') as $field=>$value) {
        $edited=$members;$edited[0][$field]=$value;phase1Roster($app,$edited,$memberB);
        phase1Reject($app,$model,fixtureProjectInput($app,$p,'discuss',array('text'=>'禁止改派。')),'PROJECT_MODEL_CHANGED','changed frozen '.$field.' has no fallback');
        phase1Roster($app,$members,$memberB);
    }
    $edited=$members;$edited[0]['enabled']=false;phase1Roster($app,$edited,$memberB);
    phase1Reject($app,$model,fixtureProjectInput($app,$p,'discuss',array('text'=>'停用時不得改派。')),'MEMBER_DISABLED','disabled bound member never falls back');
    phase1Roster($app,array($members[1]),$memberB);
    phase1Reject($app,$model,fixtureProjectInput($app,$p,'discuss',array('text'=>'刪除時不得改派。')),'MEMBER_NOT_FOUND','missing bound member never falls back');
    phase1Roster($app,$members,$memberB);
    phase1Reject($app,$model,fixtureProjectInput($app,$p,'discuss',array('text'=>'不可逐句換人。','approvedMemberId'=>$memberB)),'MEMBER_CHANGED','per-message member override rejected');

    // Readiness follows validated model direction, not a fixed count of turns.
    $exploring=$app->action(fixtureBoundNew($app,array('title'=>'輪次不代表就緒')))['project'];$model->mode='exploring';
    for($i=0;$i<4;$i++)$exploring=$app->action(fixtureProjectInput($app,$exploring,'discuss',array('text'=>'仍需釐清 '.$i)))['project'];
    phase1Check($exploring['phase']==='discussion'&&$exploring['goalApprovedAt']===null&&$exploring['versions']===array(),'four exploratory turns neither force readiness nor generate content');
    $ready=$app->action(fixtureBoundNew($app,array('title'=>'第一輪即可就緒')))['project'];$model->mode='ready';$calls=$model->calls;
    $ready=$app->action(fixtureProjectInput($app,$ready,'discuss',array('text'=>'用途讀者語氣限制均已清楚。')))['project'];$readyReply=phase1Last($ready['messages']);
    phase1Check($model->calls===$calls+1&&$ready['phase']==='summary'&&$ready['summaryRevision']===$ready['revision']&&$ready['brief']===phase1Brief('titles'),'one sufficiently informed turn prepares current validated direction');
    phase1Check($ready['goalApprovedAt']===null&&$ready['versions']===array()&&$readyReply['question']===''&&$readyReply['choices']===array()&&$readyReply['goalSnapshot']===$ready['brief'],'ready proposal is not approval or generation and asks no forced extra question');
    $readyHistory=$ready['messages'];$staleConfirm=fixtureProjectInput($app,$ready,'confirm_generate');
    phase1Reject($app,$model,array_merge($staleConfirm,array('revision'=>$ready['revision']-1,'requestId'=>newId())),'STALE_REVISION','stale confirmation rejected before generation');
    $model->mode='exploring';$calls=$model->calls;
    $ready=$app->action(fixtureProjectInput($app,$ready,'discuss',array('text'=>'先繼續討論，不生成。')))['project'];
    phase1Check($model->calls===$calls+1&&$ready['phase']==='discussion'&&$ready['summaryRevision']===null&&$ready['goalApprovedAt']===null&&$ready['versions']===array(),'continuing free text invalidates proposal and makes only a discussion call');
    phase1Check(array_slice($ready['messages'],0,count($readyHistory))===$readyHistory,'continuing discussion preserves previous ready proposal snapshot verbatim');
    phase1Reject($app,$model,$staleConfirm,'STALE_REVISION','prior ready confirmation remains stale after discussion');
    phase1Reject($app,$model,fixtureProjectInput($app,$ready,'confirm_generate'),'SUMMARY_REQUIRED','cannot confirm an invalidated proposal');
    $model->mode='invalid_ready';
    phase1Reject($app,$model,fixtureProjectInput($app,$ready,'discuss',array('text'=>'空白方向不得視為就緒。')),'MODEL_OUTPUT_INVALID','invalid model readiness rejected atomically',1);
    $model->mode='ready';$ready=$app->action(fixtureProjectInput($app,$ready,'discuss',array('text'=>'現在方向已完整。')))['project'];
    $calls=$model->calls;$request=fixtureProjectInput($app,$ready,'confirm_generate');
    $ready=$app->action($request)['project'];$generated=$ready['versions'];
    phase1Check($model->calls===$calls+1&&count($generated)===3&&$ready['goalApprovedAt']!==null&&$ready['phase']==='work','one explicit confirm_generate makes one provider call and saves approved candidate batch');
    phase1Check($ready['officialVersionId']===null&&array_map('versionLabel',$generated)===array('V1','V2','V3'),'confirmed generation creates candidates only without auto-adoption');
    $replay=$app->action($request)['project'];
    phase1Check($model->calls===$calls+1&&$replay===$ready,'confirm_generate request replay never repeats the paid call or creates duplicate versions');
    foreach($generated as $version)phase1Check($version['provenance']['memberId']===$ready['aiBinding']['memberId']&&$version['provenance']['requestedModel']===$ready['aiBinding']['model']&&$version['provenance']['actualModel']==='fixture-exact-resolved-v1','generated candidate records fixed requested and resolved model snapshot');
    $manual=$app->action(fixtureBoundNew($app,array('title'=>'手動整理沒有三輪門檻')))['project'];$calls=$model->calls;
    $manual=$app->action(fixtureProjectInput($app,$manual,'summarize'))['project'];
    phase1Check($model->calls===$calls+1&&$manual['phase']==='summary'&&$manual['versions']===array(),'manual summarize allowed immediately and still does not generate');
    $failed=fixtureProjectInput($app,$manual,'confirm_generate');$model->fail=true;
    $failure=phase1Reject($app,$model,$failed,'MODEL_TIMEOUT','generation timeout leaves approval proposal and full project untouched',1);$model->fail=false;
    phase1Check(errorResponse($failure)['error']['operationOutcome']==='unknown','uncertain generation outcome remains unknown, not a promised free rejection');
    phase1Reject($app,$model,$failed,'REQUEST_ALREADY_ATTEMPTED','uncertain confirmation cannot be retried automatically');

    // Explicit candidate refinement works before there is any official version.
    $base=$generated[1];$model->mode='revision';$calls=$model->calls;$beforeVersions=$ready['versions'];
    $ready=$app->action(fixtureProjectInput($app,$ready,'discuss',array('baseVersionId'=>$base['id'],'text'=>'把第二組名稱改得更親切。')))['project'];$minor=phase1Last($ready['versions']);
    phase1Check($model->calls===$calls+1&&versionLabel($minor)==='V2.1'&&$minor['basedOnVersionId']===$base['id']&&$minor['source']==='revision','explicit unadopted candidate creates one minor on the chosen branch');
    phase1Check($ready['officialVersionId']===null&&$minor['goalText']===$base['goalText']&&$minor['items'][1]===$base['items'][1]&&array_slice($ready['versions'],0,count($beforeVersions))===$beforeVersions,'candidate refinement preserves its own goal custom field and all immutable sources without adoption');
    $sentBase=field($model->data,'baseVersion',field($model->data,'officialVersion'));
    phase1Check($sentBase['id']===$base['id']&&$sentBase['items']===$base['items']&&$sentBase['goalText']===$base['goalText'],'model receives exact explicitly selected candidate with complete items and own goal');
    $ready=$app->action(fixtureProjectInput($app,$ready,'promote',array('versionId'=>$generated[0]['id'])))['project'];
    $ready=$app->action(fixtureProjectInput($app,$ready,'discuss',array('baseVersionId'=>$generated[2]['id'],'text'=>'只改第三組，不改正式版。')))['project'];$thirdMinor=phase1Last($ready['versions']);
    phase1Check($thirdMinor['basedOnVersionId']===$generated[2]['id']&&$ready['officialVersionId']===$generated[0]['id']&&$thirdMinor['goalText']===$generated[2]['goalText'],'explicit candidate overrides official fallback without changing the official selection');
    $ready=$app->action(fixtureProjectInput($app,$ready,'discuss',array('text'=>'沒有另選版本時修訂正式版。')))['project'];$officialMinor=phase1Last($ready['versions']);
    phase1Check($officialMinor['basedOnVersionId']===$generated[0]['id']&&$officialMinor['goalText']===$generated[0]['goalText'],'omitted base keeps compatible official fallback');
    phase1Reject($app,$model,fixtureProjectInput($app,$ready,'discuss',array('baseVersionId'=>str_repeat('f',32),'text'=>'不可使用不存在的版本。')),'VERSION_NOT_FOUND','unknown selected refinement source');
    $ready=$app->action(fixtureProjectInput($app,$ready,'archive_version',array('versionId'=>$base['id'])))['project'];
    phase1Reject($app,$model,fixtureProjectInput($app,$ready,'discuss',array('baseVersionId'=>$base['id'],'text'=>'不得修訂已封存版本。')),'VERSION_ARCHIVED','archived selected refinement source');
    $ready=$app->action(fixtureProjectInput($app,$ready,'restore_version',array('versionId'=>$base['id'])))['project'];

    // Fusion is a separate deliberate inference that preserves selected evidence.
    $fusionSources=array($generated[0],$minor);$ids=array_column($fusionSources,'id');
    $beforeFusion=$ready;$calls=$model->calls;$model->mode='revision';
    $fusionRequest=fixtureProjectInput($app,$ready,'fuse',array('versionIds'=>$ids,'question'=>'保留第一組清楚與第二組親切。'));
    $fusionResult=$app->action($fusionRequest);$ready=$fusionResult['project'];$fusion=phase1Last($ready['versions']);
    phase1Check($fusionResult['fusionVersionId']===$fusion['id'],'fusion response identifies its new complete candidate');
    phase1Check($model->calls===$calls+1&&count($ready['versions'])===count($beforeFusion['versions'])+1&&$fusion['source']==='fusion'&&$fusion['minor']===0&&$fusion['major']===4&&$fusion['basedOnVersionId']===null,'fusion makes exactly one new major candidate from one call');
    phase1Check($fusion['fusionSourceVersionIds']===$ids&&$ready['officialVersionId']===$beforeFusion['officialVersionId']&&array_slice($ready['versions'],0,count($beforeFusion['versions']))===$beforeFusion['versions'],'fusion preserves explicit source ids official choice and every prior version');
    $sentSources=$model->data['selectedVersions'];
    foreach($fusionSources as $index=>$source)phase1Check($sentSources[$index]['id']===$source['id']&&$sentSources[$index]['items']===$source['items']&&$sentSources[$index]['goalText']===$source['goalText']&&$sentSources[$index]['goalAndRationale']===$source['goalAndRationale'],'fusion dispatch includes each selected full content own goal and combined note');
    phase1Check($fusion['fusionSourceSnapshots']===$fusionSources,'fusion persists complete selected version snapshots including each own goal and provenance');
    $fusionMessage=phase1Last($ready['messages']);phase1Check($fusionMessage['sourceVersionIds']===$ids&&$fusionMessage['versionIds']===array($fusion['id'])&&$fusionMessage['provenance']===$fusion['provenance'],'fusion message links input sources new candidate and identical provenance');
    $app->action($fusionRequest);phase1Check($model->calls===$calls+1,'fusion replay does not make another inference');
    foreach(array(array($ids[0]),array($ids[0],$ids[0]),array_fill(0,6,$ids[0])) as $badIds)phase1Reject($app,$model,fixtureProjectInput($app,$ready,'fuse',array('versionIds'=>$badIds)),'COMPARISON_SELECTION','fusion requires two through five distinct sources');
    phase1Reject($app,$model,fixtureProjectInput($app,$ready,'fuse',array('versionIds'=>array($ids[0],str_repeat('f',32)))),'VERSION_NOT_FOUND','fusion rejects missing source');
    $model->mode='invalid_fusion';
    phase1Reject($app,$model,fixtureProjectInput($app,$ready,'fuse',array('versionIds'=>$ids)),'MODEL_OUTPUT_INVALID','invalid fusion is atomic',1);$model->mode='revision';

    // Short text is one complete body, not a title bundle with hidden omissions.
    $model->type='short_text';$model->mode='ready';
    $short=$app->action(fixtureBoundNew($app,array('title'=>'短文完整快照')))['project'];
    $short=$app->action(fixtureProjectInput($app,$short,'create_item',array('type'=>'short_text','title'=>'邀請短文','description'=>'單篇完整文字。')))['project'];
    $short=$app->action(fixtureProjectInput($app,$short,'discuss',array('text'=>'寫一篇溫暖清楚的完整短文。')))['project'];$calls=$model->calls;
    $model->mode='extra_candidates';phase1Reject($app,$model,fixtureProjectInput($app,$short,'confirm_generate'),'MODEL_OUTPUT_INVALID','short generator rejects a fourth candidate atomically',1);$model->mode='ready';$calls=$model->calls;
    $short=$app->action(fixtureProjectInput($app,$short,'confirm_generate'))['project'];
    phase1Check($model->calls===$calls+1&&count($short['versions'])===3&&$short['brief']['items']===array(array('id'=>'body','label'=>'全文')),'short text confirms once and generates exactly three single-body candidates');
    $shortBase=$short['versions'][1];$model->mode='revision';$shortText="第一段保留完整意思。\n\n第二段讓邀請更清楚。";
    $short=$app->action(fixtureProjectInput($app,$short,'discuss',array('baseVersionId'=>$shortBase['id'],'text'=>$shortText)))['project'];$shortMinor=phase1Last($short['versions']);
    phase1Check($shortMinor['basedOnVersionId']===$shortBase['id']&&$shortMinor['items']===array(array('id'=>'body','label'=>'全文','content'=>$shortText))&&$shortMinor['goalText']===$shortBase['goalText']&&$short['officialVersionId']===null,'short refinement writes one complete immutable body snapshot from chosen candidate without adoption');
    phase1Check($short['versions'][1]===$shortBase,'short source candidate remains byte-identical');
    $shortManual=array(array('id'=>'body','label'=>'全文','content'=>str_repeat('完整短文。',600)));
    $short=$app->action(fixtureProjectInput($app,$short,'snapshot',array('basedOnVersionId'=>$shortMinor['id'],'versionMode'=>'minor','items'=>$shortManual,'goalText'=>$shortMinor['goalText'],'rationale'=>'完整短文手動修訂。')))['project'];
    phase1Check(phase1Last($short['versions'])['items']===$shortManual,'short manual snapshot preserves full body beyond title per-field limit');

    // Long-form edits select paragraphs, but every saved version is a full snapshot.
    $model->type='article';$model->mode='ready';
    $article=$app->action(fixtureBoundNew($app,array('title'=>'長篇逐段修訂')))['project'];
    $article=$app->action(fixtureProjectInput($app,$article,'create_item',array('type'=>'article','title'=>'影展介紹文章','description'=>'三段固定段落。')))['project'];
    $article=$app->action(fixtureProjectInput($app,$article,'discuss',array('text'=>'開場主體結語三段都需要。')))['project'];$calls=$model->calls;
    $model->mode='extra_candidates';phase1Reject($app,$model,fixtureProjectInput($app,$article,'confirm_generate'),'MODEL_OUTPUT_INVALID','article generator rejects incomplete multi-candidate output atomically',1);$model->mode='ready';$calls=$model->calls;
    $article=$app->action(fixtureProjectInput($app,$article,'confirm_generate'))['project'];$articleBase=$article['versions'][0];
    phase1Check($model->calls===$calls+1&&count($article['versions'])===1&&array_column($articleBase['items'],'id')===array('opening','evidence','ending'),'article produces one complete ordered candidate with stable paragraph IDs');
    $model->mode='revision';
    foreach(array(null,array()) as $target)phase1Reject($app,$model,fixtureProjectInput($app,$article,'discuss',array('baseVersionId'=>$articleBase['id'],'targetItemIds'=>$target,'text'=>'不可默認改全部段落。')),'TARGET_ITEMS_REQUIRED','article refinement requires an explicit range');
    foreach(array('evidence',array('evidence','evidence'),array('unknown'),array('named'=>'evidence')) as $target)phase1Reject($app,$model,fixtureProjectInput($app,$article,'discuss',array('baseVersionId'=>$articleBase['id'],'targetItemIds'=>$target,'text'=>'範圍格式錯誤。')),'TARGET_ITEMS_INVALID','article selected range must be distinct stable ids');
    $model->mode='article_whitespace';$articleBefore=$article;$calls=$model->calls;$paragraphText="主體替換內容，保留完整資訊。\n同一段內的換行也要保留。";
    $article=$app->action(fixtureProjectInput($app,$article,'discuss',array('baseVersionId'=>$articleBase['id'],'targetItemIds'=>array('evidence'),'text'=>$paragraphText)))['project'];$articleMinor=phase1Last($article['versions']);
    $expectedItems=$articleBase['items'];$expectedItems[1]['content']=" \n".$paragraphText."\n\t";
    phase1Check($model->calls===$calls+1&&$articleMinor['items']===$expectedItems&&count($articleMinor['items'])===3,'selected article edit merges into a complete three-paragraph immutable snapshot');
    phase1Check($articleMinor['items'][0]===$articleBase['items'][0]&&$articleMinor['items'][2]===$articleBase['items'][2]&&$article['versions'][0]===$articleBase&&$article['officialVersionId']===null,'untouched paragraphs and source version remain byte-identical with no auto-adoption');
    phase1Check(versionLabel($articleMinor)==='V1.1'&&$articleMinor['basedOnVersionId']===$articleBase['id']&&$articleMinor['goalText']===$articleBase['goalText'],'article minor carries explicit source lineage and source-specific goal');
    phase1Check($model->data['sourceVersion']['items']===$articleBase['items']&&$model->data['sourceVersion']['goalText']===$articleBase['goalText']&&$model->data['targetItemIds']===array('evidence'),'provider receives full source context but exact selected paragraph range');
    phase1Check($model->schema['properties']['items']['items']['properties']['id']['enum']===array('evidence'),'provider structured schema restricts edited item IDs to selected paragraphs');
    phase1Check(substr($articleBase['items'][0]['content'],0,2)===" \n"&&substr($articleBase['items'][2]['content'],-2)==="\n\t"&&$articleMinor['items'][1]['content']===" \n".$paragraphText."\n\t",'article validation preserves leading trailing and internal whitespace byte-for-byte');
    phase1Check(phase1Last($model->history)['maxOutputTokens']===24000,'article targeted output explicitly requests the bounded extended output budget');
    foreach(array('outside_target','missing_target','renamed_target','oversize_edit') as $mode) {
        $model->mode=$mode;
        phase1Reject($app,$model,fixtureProjectInput($app,$article,'discuss',array('baseVersionId'=>$articleBase['id'],'targetItemIds'=>array('evidence'),'text'=>'只可以更新主體。')),'MODEL_OUTPUT_INVALID','invalid article '.$mode.' never changes any saved paragraph',1);
    }
    $model->mode='revision';$calls=$model->calls;
    $article=$app->action(fixtureProjectInput($app,$article,'discuss',array('baseVersionId'=>$articleMinor['id'],'targetItemIds'=>array('ending','opening'),'text'=>'明確修改首尾段落。')))['project'];$twoParagraphs=phase1Last($article['versions']);
    phase1Check($model->calls===$calls+1&&array_column($twoParagraphs['items'],'id')===array('opening','evidence','ending')&&$twoParagraphs['items'][1]===$articleMinor['items'][1],'multiple selected IDs may arrive unordered but merged full snapshot preserves original order and unselected paragraph');

    // Choice answers are tied to their exact candidate and paragraph selection.
    $model->mode='clarification';
    $article=$app->action(fixtureProjectInput($app,$article,'discuss',array('baseVersionId'=>$articleMinor['id'],'targetItemIds'=>array('evidence'),'text'=>'請先問我語氣。')))['project'];$question=phase1Last($article['messages']);
    phase1Check($question['kind']==='clarification'&&$question['choiceContext']['baseVersionId']===$articleMinor['id']&&$question['choiceContext']['targetItemIds']===array('evidence'),'clarification binds exact selected candidate and paragraph IDs');
    $answer=array('text'=>$question['choices'][0]['value'],'choiceAnswer'=>array('questionMessageId'=>$question['id'],'choiceId'=>$question['choices'][0]['id']),
        'baseVersionId'=>$articleMinor['id'],'targetItemIds'=>array('evidence'));
    phase1Reject($app,$model,fixtureProjectInput($app,$article,'discuss',array_merge($answer,array('baseVersionId'=>$articleBase['id']))),'CHOICE_STALE','choice cannot switch source candidate');
    phase1Reject($app,$model,fixtureProjectInput($app,$article,'discuss',array_merge($answer,array('targetItemIds'=>array('ending')))),'CHOICE_STALE','choice cannot switch selected paragraphs');
    $model->mode='revision';$article=$app->action(fixtureProjectInput($app,$article,'discuss',$answer))['project'];$answered=phase1Last($article['versions']);
    phase1Check($answered['basedOnVersionId']===$articleMinor['id']&&$answered['items'][0]===$articleMinor['items'][0]&&$answered['items'][2]===$articleMinor['items'][2],'matching choice changes only its authorized paragraph in full snapshot');

    // This direct module fixture isolates per-document output capacity from storage reserve.
    $capacitySource=$articleBase;$capacitySource['items']=array();
    for($i=0;$i<20;$i++)$capacitySource['items'][]=array('id'=>'cap_'.$i,'label'=>'容量段落 '.$i,'content'=>str_repeat('x',6000));
    $model->mode='revision';$capacityModule=new TextModule($model,'article');
    $capacityResult=$capacityModule->refine($article,$capacitySource,'本次僅修改指定段落。','fixture-local',array('cap_0'));
    phase1Check($model->data['selectedOutputByteLimit']===6000,'near-limit article sends remaining full-document capacity before inference');
    phase1Check(count($capacityResult['items'])===20&&array_slice($capacityResult['items'],1)===array_slice($capacitySource['items'],1),'capacity-limited patch keeps all untouched paragraphs in complete result');

    // Cross-item source isolation applies equally to explicit refinement and fusion.
    $sourceItem=$article['activeItemId'];$article=$app->action(fixtureProjectInput($app,$article,'create_item',array('type'=>'article','title'=>'另一文章')))['project'];
    phase1Reject($app,$model,fixtureProjectInput($app,$article,'discuss',array('baseVersionId'=>$articleBase['id'],'targetItemIds'=>array('evidence'),'text'=>'不得引用其他項目為修改起點。')),'VERSION_NOT_FOUND','explicit refinement cannot borrow another item source');
    phase1Reject($app,$model,fixtureProjectInput($app,$article,'fuse',array('versionIds'=>array($articleBase['id'],$articleMinor['id']))),'VERSION_NOT_FOUND','fusion cannot borrow another item versions');
    $article=$app->action(fixtureProjectInput($app,$article,'select_item',array('itemId'=>$sourceItem)))['project'];
    phase1Check($article['versions'][0]===$articleBase&&$article['versions'][1]===$articleMinor,'switching workspace restores all original complete article snapshots');

    // Larger complete manual documents remain intact; unsafe AI ranges fail early.
    $largeItems=array();for($i=1;$i<=8;$i++)$largeItems[]=array('id'=>'large_'.$i,'label'=>'長段落 '.$i,'content'=>str_repeat((string)$i,5000));
    $article=$app->action(fixtureProjectInput($app,$article,'snapshot',array('basedOnVersionId'=>$articleBase['id'],'versionMode'=>'major','items'=>$largeItems,'goalText'=>'完整長文目標。','rationale'=>'全文人工整理。')))['project'];$largeVersion=phase1Last($article['versions']);
    phase1Check($largeVersion['items']===$largeItems&&strlen(implode('',array_column($largeVersion['items'],'content')))===40000,'manual article keeps complete document above title bundle limit without truncation');
    phase1Reject($app,$model,fixtureProjectInput($app,$article,'discuss',array('baseVersionId'=>$largeVersion['id'],'targetItemIds'=>array('large_1','large_2','large_3','large_4','large_5'),'text'=>'請先縮小範圍。')),'REFINEMENT_RANGE_TOO_LARGE','oversized selected originals rejected before inference');
    phase1Reject($app,$model,fixtureProjectInput($app,$article,'fuse',array('versionIds'=>array($largeVersion['id'],$articleBase['id']))),'FUSION_CONTENT_TOO_LARGE','oversized article fusion rejected before inference');
    $article=$app->action(fixtureProjectInput($app,$article,'archive_version',array('versionId'=>$articleMinor['id'])))['project'];
    phase1Reject($app,$model,fixtureProjectInput($app,$article,'fuse',array('versionIds'=>array($articleMinor['id'],$articleBase['id']))),'VERSION_ARCHIVED','article fusion refuses archived source');
    phase1Check($largeVersion['items']===$largeItems&&$app->project($legacy['id'])['aiBinding']===$frozen,'negative size and archive checks leave full documents and unrelated fixed binding unchanged');

    echo 'TOTAL '.$phase1Checks." phase-one checks passed; no real keys, network, PDO or SQLite.\n";
} finally {phase1Cleanup($dir);}
