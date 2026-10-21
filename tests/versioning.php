<?php
/**
 * Native PHP 7.4+ regression fixture for the real application/module code.
 * Preparation status: UNEXECUTED in the authoring environment (PHP unavailable).
 * Run explicitly: php tests/versioning.php
 * No HTTP, PDO, SQLite, real model, API key or user data is used. The Store below
 * is an in-memory persistence seam, not a replacement for application logic.
 * The real SessionKeyVault creates only a temporary empty vault and lock file.
 */
require_once dirname(__DIR__).'/app/bootstrap.php';

$versioningChecks=0;
function versioningCheck($ok,$label) {
    global $versioningChecks;
    if(!$ok)throw new Exception('FAIL: '.$label);
    $versioningChecks++;echo 'PASS '.$label."\n";
}
function versioningReject($fn,$code) {
    try {$fn();throw new Exception('Expected '.$code);}
    catch(AppError $e) {versioningCheck($e->errorCode===$code,'reject '.$code);}
}
function versioningCleanup($dir) {
    if(!is_dir($dir))return;
    foreach(scandir($dir) as $name)if($name!=='.'&&$name!=='..') {
        $path=$dir.'/'.$name;
        if(is_dir($path))versioningCleanup($path);else unlink($path);
    }
    rmdir($dir);
}
function versioningInput($app,$p,$action,$extra=array()) {
    $status=$app->status();
    return array_merge(array('action'=>$action,'id'=>$p['id'],'itemId'=>$p['activeItemId'],'revision'=>$p['revision'],
        'consent'=>true,'approvedProvider'=>$status['provider'],'approvedSettingsRevision'=>$status['settingsRevision'],
        'approvedModel'=>$status['model'],'approvedMemberId'=>field($status,'memberId',field($status,'activeMemberId')),'requestId'=>newId()),$extra);
}
function versioningById($versions,$id) {
    foreach($versions as $version)if($version['id']===$id)return $version;
    throw new Exception('Fixture version not found: '.$id);
}
function versioningItem($project,$id) {
    foreach($project['creativeItems'] as $item)if($item['id']===$id)return $item;
    throw new Exception('Fixture item not found: '.$id);
}
function versioningWithoutCoordinates($version) {unset($version['major'],$version['minor']);return $version;}
function versioningLast($values) {return $values[count($values)-1];}
function versioningCombinedFromLegacyFields($version) {
    unset($version['goalAndRationale']);
    return versionGoalAndRationale($version);
}
function versioningLegacy($number,$text) {
    return array('id'=>newId(),'number'=>$number,'title'=>$text,
        'items'=>array(array('id'=>'name','label'=>'名稱','content'=>$text)),
        'rationale'=>'保留原始意見。','source'=>'snapshot','basedOnVersionId'=>null,
        'goalSnapshot'=>array('summary'=>'舊版自己的目標。'),'messageId'=>newId(),'createdAt'=>'2026-01-01T00:00:00+00:00');
}

class VersioningMemoryStore {
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
                'activeMemberId'=>$id,'settingsRevision'=>hash('sha256',$owner.'versioning-roster'),
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

class VersioningFixtureAdapter {
    public $calls=0;public $data=null;public $schema=null;public $mode='valid';public $onDispatch=null;public $requestedModels=array();
    public function actualModel() {return 'fixture-versioning-v1';}
    public function generate($model,$messages,$schema) {
        $this->calls++;$this->schema=$schema;$this->data=json_decode($messages[1]['content'],true,128,JSON_THROW_ON_ERROR);
        $this->requestedModels[]=$model;$hook=$this->onDispatch;$this->onDispatch=null;if($hook!==null)$hook($model,$messages,$schema);
        $data=$this->data;$props=$schema['properties'];
        if(isset($props['outcome'])) {
            $official=$data['officialVersion'];$items=$official['items'];$goal=versionGoalText($official);
            if($this->mode==='goal_only')$goal='只更新本版目標：以溫暖語氣邀請第一次參加的同學。';
            elseif($this->mode!=='unchanged')$items[0]['content']=$data['latestUserMessage'];
            $out=array('outcome'=>'revision','reply'=>'已準備待審閱的完整修訂。','question'=>'','items'=>$items,
                'rationale'=>'保留其餘內容，依本次要求調整。','goalText'=>$goal,'changeSummary'=>$this->mode==='goal_only'?'只修改本版目標，內容保持原文。':'只修改本次指定名稱，其餘完整保留。');
            if($this->mode==='unchanged'&&versionHasCombinedOverride($official)) {
                $out['rationale']='只依本次要求恢復先前目標，所有作品內容保持原文。';
                $out['changeSummary']='將手動合併欄位中的新目標恢復為保留的先前目標，不修改作品文字。';
            }
            if($this->mode==='missing_goal')unset($out['goalText']);
            if($this->mode==='empty_summary')$out['changeSummary']='';
        }elseif(isset($props['purpose'])) {
            $out=array('purpose'=>'活動命名','audience'=>'大學生','message'=>'分享創作','tone'=>'清楚溫暖','constraints'=>'不誇張',
                'summary'=>'共用構思目標：邀請大學生分享創作。',
                'items'=>array(array('id'=>'name','label'=>'中文名稱'),array('id'=>'hook','label'=>'邀請語')));
        }elseif(isset($props['candidates'])) {
            $out=array('candidates'=>array());
            foreach(array('讓想法發光','把故事說出來','一起創作吧') as $i=>$title) {
                $items=array();foreach($data['creativeGoal']['items'] as $def)$items[]=array('id'=>$def['id'],'label'=>$def['label'],'content'=>$title.' '.$def['label']);
                $out['candidates'][]=array('items'=>$items,'rationale'=>'此組重視第'.($i+1).'種表達。',
                    'goalText'=>'此版獨立目標 '.($i+1).'：邀請不同創作經驗的同學參與。','changeSummary'=>'首次候選，採納第'.($i+1).'個已討論方向。');
            }
        }elseif(isset($props['question'])) {
            $out=array('reply'=>'我理解這個方向。','question'=>'你最希望讀者記住什麼？');
        }else {
            $items=array();foreach($data['selectedVersions'] as $v)$items[]=array('versionId'=>$v['id'],
                'fit'=>'依這一版保存的目標評估。','strength'=>'整組內容清楚。','tradeoff'=>'不同目標不宜共用單一排名。','suggestion'=>'可再精簡一個詞。');
            if($this->mode==='duplicate')$items[1]['versionId']=$items[0]['versionId'];
            if($this->mode==='unselected')$items[0]['versionId']=str_repeat('f',32);
            if($this->mode==='short')array_pop($items);
            if($this->mode==='extra')$items[]=$items[0];
            $out=array('items'=>$items,'summary'=>'請依各版自己的目標與取捨選擇，並非指定唯一冠軍。');
        }
        return json_decode(jsonEncode($out),false,128,JSON_THROW_ON_ERROR);
    }
}

// Legacy migration: gaps, mixed explicit labels, duplicates, stable ids and no
// fabricated metadata. Coordinates may be added; all historical fields survive.
$gap=array('versions'=>array(versioningLegacy(2,'二'),versioningLegacy(5,'五'),versioningLegacy(11,'十一')),'officialVersionId'=>null);
$gapBefore=$gap;normalizeItemVersions($gap);
versioningCheck(array_map('versionLabel',$gap['versions'])===array('V2','V5','V11'),'legacy ordinal gaps remain readable labels');
foreach($gap['versions'] as $i=>$v)versioningCheck(versioningWithoutCoordinates($v)===$gapBefore['versions'][$i],'legacy gap payload remains immutable');
$mixedVersions=array(versioningLegacy(5,'legacy collision'),versioningLegacy(6,'explicit five'),versioningLegacy(7,'explicit minor'),versioningLegacy(8,'duplicate explicit'),versioningLegacy(12,'legacy twelve'),versioningLegacy(2,'legacy two'));
$mixedVersions[1]['major']=5;$mixedVersions[1]['minor']=0;$mixedVersions[2]['major']=5;$mixedVersions[2]['minor']=9;$mixedVersions[3]['major']=5;$mixedVersions[3]['minor']=0;
$mixedVersions[3]['basedOnVersionId']=$mixedVersions[1]['id'];
$mixed=array('versions'=>$mixedVersions,'officialVersionId'=>$mixedVersions[1]['id'],
    'archivedVersionIds'=>array($mixedVersions[0]['id'],$mixedVersions[0]['id'],$mixedVersions[1]['id'],str_repeat('f',32),42),
    'references'=>array(array('versionId'=>$mixedVersions[3]['id'],'versionSnapshot'=>$mixedVersions[3])));
$before=$mixed;normalizeItemVersions($mixed);$normalized=$mixed;normalizeItemVersions($mixed);
versioningCheck($mixed===$normalized,'mixed legacy normalization is idempotent');
$labels=array_map('versionLabel',$mixed['versions']);
versioningCheck(count(array_unique($labels))===count($labels)&&$labels===array('V13','V5','V5.9','V14','V12','V2'),'mixed collisions reserve explicit coordinates before assigning new majors');
foreach($mixed['versions'] as $i=>$v)versioningCheck(versioningWithoutCoordinates($v)===versioningWithoutCoordinates($before['versions'][$i]),'mixed migration preserves id ordinal lineage content and goal');
versioningCheck($mixed['references']===$before['references']&&$mixed['archivedVersionIds']===array($mixedVersions[0]['id']),'migration preserves pins and removes duplicate unknown or official archives');
versioningCheck(!isset($mixed['versions'][0]['goalText'])&&versionGoalText($mixed['versions'][0])==='舊版自己的目標。','legacy goal uses snapshot without inventing metadata');
versioningCheck(nextVersionCoordinates($mixed['versions'],'minor',$mixed['versions'][2])===array('major'=>5,'minor'=>10),'V5.9 increments to V5.10, not floating point');
versioningReject(function(){nextVersionCoordinates(array(),'minor');},'VERSION_BASE_REQUIRED');
versioningReject(function(){nextVersionCoordinates(array(),'unsupported');},'VERSION_MODE');

// Single-input metadata compatibility. These native PHP assertions are prepared
// but UNEXECUTED in this authoring environment; do not infer a runtime pass.
$combinedLegacy=array('id'=>str_repeat('6',32),'goalText'=>'本版自己的目標。',
    'goalSnapshot'=>array('summary'=>'不能覆蓋已有 goalText 的舊摘要。'),
    'changeSummary'=>'討論後採納的變更。','rationale'=>'保留不同修改意見。');
$combinedLegacyBefore=$combinedLegacy;
$combinedExpected="本版目標：\n本版自己的目標。\n\n討論與變更摘要：\n討論後採納的變更。\n\n修改意見：\n保留不同修改意見。";
versioningCheck(versionGoalAndRationale($combinedLegacy)===$combinedExpected,'legacy distinct goal summary and comments combine in order with labels');
versioningCheck($combinedLegacy===$combinedLegacyBefore&&!array_key_exists('goalAndRationale',$combinedLegacy),'combined helper never backfills or mutates legacy records');
$equalLegacy=array('goalText'=>'完全相同的文字。','changeSummary'=>'完全相同的文字。','rationale'=>'完全相同的文字。');
versioningCheck(versionGoalAndRationale($equalLegacy)==="本版目標：\n完全相同的文字。",'legacy exact duplicate values appear only once');
$partialEqual=array('goalText'=>'不同目標。','changeSummary'=>'相同修改內容。','rationale'=>'相同修改內容。');
versioningCheck(versionGoalAndRationale($partialEqual)==="本版目標：\n不同目標。\n\n討論與變更摘要：\n相同修改內容。",'duplicate summary and rationale retain only first label');
$fallbackLegacy=array('goalSnapshot'=>array('summary'=>'只有舊快照的目標。'),'changeSummary'=>'','rationale'=>'保留舊意見。');
versioningCheck(versionGoalAndRationale($fallbackLegacy)==="本版目標：\n只有舊快照的目標。\n\n修改意見：\n保留舊意見。",'missing goalText falls back to goalSnapshot and skips empty text');
versioningCheck(versionGoalAndRationale(array())===''&&versionGoalAndRationale(array('goalText'=>'','changeSummary'=>'','rationale'=>''))==='','absent or empty legacy metadata does not fabricate labels');
$storedCombined=$combinedLegacy;$storedCombined['goalAndRationale']="  使用者自行合併的原文。\n\n保留原來換行與空白。  ";
versioningCheck(versionGoalAndRationale($storedCombined)===$storedCombined['goalAndRationale'],'stored combined string is authoritative and returned verbatim');
$storedEmpty=$combinedLegacy;$storedEmpty['goalAndRationale']='';
versioningCheck(versionGoalAndRationale($storedEmpty)==='','stored empty combined string remains authoritative rather than resurrecting old text');
$repeatedCombined=$combinedLegacy;
for($i=0;$i<4;$i++) {
    $repeatedCombined['goalAndRationale']=versionGoalAndRationale($repeatedCombined);
    versioningCheck($repeatedCombined['goalAndRationale']===$combinedExpected,'reopening combined editor does not duplicate old labels or text '.$i);
}
$combinedComparisonSnapshot=versionComparisonSnapshot($storedCombined);
versioningCheck($combinedComparisonSnapshot['goalAndRationale']===$storedCombined['goalAndRationale']&&$combinedComparisonSnapshot['goalText']===$storedCombined['goalText']&&$combinedComparisonSnapshot['rationale']===$storedCombined['rationale'],'comparison snapshot includes authoritative combined text and preserves separate historical evidence');
versioningCheck(versionComparisonSnapshot($combinedLegacy)['goalAndRationale']===null&&$combinedLegacy===$combinedLegacyBefore,'legacy comparison keeps missing stored combined evidence absent without mutating source');

$dir=sys_get_temp_dir().'/cocreation-versioning-'.bin2hex(random_bytes(6));mkdir($dir,0700,true);
try {
    $_SESSION=array('csrf'=>str_repeat('b',64));$owner=str_repeat('a',64);
    $config=validateConfig(array('app_url'=>'http://localhost/studio/public/','data_dir'=>$dir,'openai_model'=>'fixture-local','model_timeout_ms'=>120000));
    $store=new VersioningMemoryStore();$model=new VersioningFixtureAdapter();$app=new CocreationApp($store,$config,$owner,$model);
    $p=$app->action(array('action'=>'new','title'=>'版本完整回歸','description'=>'虛構測試資料'))['project'];
    $other=$app->action(array('action'=>'new','title'=>'隔離專案'))['project'];
    versioningCheck(!$app->status()['keyPresent'],'in-memory fixture uses no key');
    for($i=0;$i<3;$i++)$p=$app->action(versioningInput($app,$p,'discuss',array('text'=>'討論方向 '.$i)))['project'];
    $p=$app->action(versioningInput($app,$p,'summarize'))['project'];
    $p=$app->action(versioningInput($app,$p,'approve_goal'))['project'];
    $request=versioningInput($app,$p,'generate');$p=$app->action($request)['project'];
    versioningCheck($model->calls===5&&count($p['versions'])===3,'three discussions summary and generation use exactly five injected calls');
    versioningCheck(array_map('versionLabel',$p['versions'])===array('V1','V2','V3'),'initial batch creates sequential major versions');
    $generated=$p['versions'];$messagesById=array_column($p['messages'],null,'id');
    foreach($generated as $i=>$v) {
        versioningCheck($v['goalText']===$v['goalSnapshot']['summary']&&$v['goalText']!==$p['brief']['summary']&&$v['goalSource']==='ai'&&$v['changeSummary']!==''&&$v['basedOnVersionId']===null,'generated version keeps its own goal and same-call summary');
        versioningCheck(count($v['discussionMessageIds'])===2&&$messagesById[$v['discussionMessageIds'][0]]['kind']==='generation_request'&&$messagesById[$v['discussionMessageIds'][1]]['kind']==='generation','generated metadata points to actual request and reply');
        versioningCheck(isset($v['goalAndRationale'])&&$v['goalAndRationale']===versioningCombinedFromLegacyFields($v),'generated combined text contains same-call version goal summary and rationale');
    }
    $beforeCalls=$model->calls;$app->action($request);
    versioningCheck($model->calls===$beforeCalls,'generation replay never invokes a model twice');

    $base=$generated[1];$manualItems=$base['items'];$manualItems[0]['content']='手動改寫的名稱';
    $manualItems[]=array('id'=>'custom','label'=>'自訂補充','content'=>'這段自訂內容必須完整保留。');
    $p=$app->action(versioningInput($app,$p,'snapshot',array('basedOnVersionId'=>$base['id'],'versionMode'=>'minor','items'=>$manualItems,'goalText'=>'手動本版目標：讓第一次參加者安心。','rationale'=>'我的修改意見：語氣直接而親切。')))['project'];
    $manual=versioningLast($p['versions']);
    versioningCheck(versionLabel($manual)==='V2.1'&&$manual['basedOnVersionId']===$base['id']&&$manual['items']===$manualItems,'minor is a full snapshot with explicit lineage');
    versioningCheck($manual['goalSource']==='user'&&$manual['goalText']===$manual['goalSnapshot']['summary']&&$manual['changeSummary']===$manual['rationale']&&$manual['discussionMessageIds']!==array(),'manual goal comments and discussion references saved together');
    $p=$app->action(versioningInput($app,$p,'snapshot',array('basedOnVersionId'=>$manual['id'],'versionMode'=>'major','items'=>$manualItems,'goalText'=>'另一整組版本的獨立目標。','rationale'=>'整組方向重新整理。')))['project'];
    $major=versioningLast($p['versions']);
    versioningCheck(versionLabel($major)==='V4'&&$major['basedOnVersionId']===$manual['id']&&$major['items']===$manualItems,'major allocates next integer while preserving full bundle and lineage');
    $p=$app->action(versioningInput($app,$p,'promote',array('versionId'=>$major['id'])))['project'];
    versioningReject(function()use($app,$p,$major){$app->action(versioningInput($app,$p,'archive_version',array('versionId'=>$major['id'])));},'OFFICIAL_ARCHIVE');
    $p=$app->action(versioningInput($app,$p,'snapshot',array('basedOnVersionId'=>$major['id'],'versionMode'=>'major','items'=>$manualItems,'goalText'=>'第五整組方向。','rationale'=>'建立小修改序列的來源。')))['project'];
    $fifth=versioningLast($p['versions']);
    for($i=1;$i<=9;$i++) {
        $p=$app->action(versioningInput($app,$p,'snapshot',array('basedOnVersionId'=>$fifth['id'],'versionMode'=>'minor','items'=>$manualItems,'goalText'=>'第五組第'.$i.'次小修改目標。','rationale'=>'小修改 '.$i)))['project'];
        versioningCheck(versionLabel(versioningLast($p['versions']))==='V5.'.$i,'minor sequence '.$i.' uses integer coordinates');
    }
    $ninth=versioningLast($p['versions']);$immutableVersions=$p['versions'];
    $p=$app->action(versioningInput($app,$p,'archive_version',array('versionId'=>$ninth['id'])))['project'];
    versioningCheck($p['versions']===$immutableVersions&&versionArchived($p,$ninth['id']),'archive changes item metadata, never version payload');
    foreach(array('promote','snapshot','compare') as $blockedAction) {
        $extra=$blockedAction==='snapshot'?array('basedOnVersionId'=>$ninth['id'],'versionMode'=>'minor','items'=>$manualItems):($blockedAction==='compare'?array('versionIds'=>array($major['id'],$ninth['id'])):array('versionId'=>$ninth['id']));
        $before=$app->project($p['id']);
        versioningReject(function()use($app,$p,$blockedAction,$extra){$app->action(versioningInput($app,$p,$blockedAction,$extra));},'VERSION_ARCHIVED');
        versioningCheck($app->project($p['id'])===$before&&$model->calls===$beforeCalls,'archived '.$blockedAction.' is atomic and free');
    }
    $p=$app->action(versioningInput($app,$p,'snapshot',array('basedOnVersionId'=>$fifth['id'],'versionMode'=>'minor','items'=>$manualItems,'rationale'=>'封存不重用編號。')))['project'];
    $tenth=versioningLast($p['versions']);
    versioningCheck(versionLabel($tenth)==='V5.10'&&$tenth['number']>$ninth['number'],'archived V5.9 remains reserved when creating V5.10');
    $p=$app->action(versioningInput($app,$p,'restore_version',array('versionId'=>$ninth['id'])))['project'];
    versioningCheck(!versionArchived($p,$ninth['id'])&&versioningById($p['versions'],$ninth['id'])===$ninth,'restore retains original id coordinates and all snapshots');
    $p=$app->action(versioningInput($app,$p,'promote',array('versionId'=>$ninth['id'])))['project'];
    $p=$app->action(versioningInput($app,$p,'snapshot',array('basedOnVersionId'=>$ninth['id'],'versionMode'=>'minor','items'=>$manualItems,'rationale'=>'還原後可另存。')))['project'];
    versioningCheck(versionLabel(versioningLast($p['versions']))==='V5.11','restored version can be promoted and used as a minor baseline');
    $p=$app->action(versioningInput($app,$p,'promote',array('versionId'=>$major['id'])))['project'];
    versioningCheck($model->calls===$beforeCalls,'all manual version archive restore and adoption operations are free');

    // Null global approval must not block per-version refinement or comparison.
    $p=$app->action(versioningInput($app,$p,'edit_item',array('title'=>'更新項目說明','description'=>'本版目標不隨此處改寫。')))['project'];
    versioningCheck($p['goalApprovedAt']===null,'shared item edit invalidates global approval only');
    $oldVersions=$p['versions'];$model->mode='goal_only';$request=versioningInput($app,$p,'discuss',array('text'=>'只調整本版創作目標，不修改文字。'));
    $result=$app->action($request);$p=$result['project'];$goalRevision=versioningLast($p['versions']);
    versioningCheck($model->calls===$beforeCalls+1&&count($model->schema['properties'])===7&&isset($model->schema['properties']['goalText'],$model->schema['properties']['changeSummary']),'refine uses exactly one seven-field model response');
    versioningCheck($goalRevision['items']===$major['items']&&$goalRevision['goalText']!==$major['goalText']&&$goalRevision['goalSnapshot']['summary']===$goalRevision['goalText']&&$goalRevision['changeSummary']==='只修改本版目標，內容保持原文。','goal-only refinement saves an authentic full revision');
    versioningCheck(isset($goalRevision['goalAndRationale'])&&$goalRevision['goalAndRationale']===versioningCombinedFromLegacyFields($goalRevision),'AI revision stores combined text from this response without another inference');
    versioningCheck(versionLabel($goalRevision)==='V4.1'&&$goalRevision['basedOnVersionId']===$major['id']&&$p['officialVersionId']===$major['id']&&$p['goalApprovedAt']===null,'goal-only revision is minor, does not adopt or fabricate approval');
    versioningCheck($model->data['officialVersion']['goalText']===$major['goalText']&&array_slice($p['versions'],0,count($oldVersions))===$oldVersions,'revision uses official own goal and keeps every previous version immutable');
    $reply=versioningLast($p['messages']);$student=$p['messages'][count($p['messages'])-2];
    versioningCheck($goalRevision['discussionMessageIds']===array($student['id'],$reply['id'])&&$goalRevision['messageId']===$reply['id']&&$goalRevision['id']===$result['revisionVersionId'],'revision metadata links exact triggering discussion and response');
    $calls=$model->calls;$app->action($request);versioningCheck($model->calls===$calls,'revision replay has no extra model call');
    $p=$app->action(versioningInput($app,$p,'promote',array('versionId'=>$goalRevision['id'])))['project'];
    $model->mode='valid';$p=$app->action(versioningInput($app,$p,'discuss',array('text'=>'採用後繼續調整的名稱')))['project'];$continued=versioningLast($p['versions']);
    versioningCheck($continued['basedOnVersionId']===$goalRevision['id']&&$continued['goalText']===$goalRevision['goalText']&&$model->data['officialVersion']['items']===$goalRevision['items']&&$model->data['officialVersion']['goalText']===$goalRevision['goalText'],'adopt then continue uses adopted full bundle and its goal');
    versioningCheck($continued['items'][2]===$manualItems[2]&&$continued['goalSource']==='ai'&&$p['officialVersionId']===$goalRevision['id']&&$p['goalApprovedAt']===null,'continuing preserves custom field and does not auto-promote or approve');
    foreach(array('missing_goal'=>'MODEL_OUTPUT_INVALID','empty_summary'=>'MODEL_OUTPUT_INVALID','unchanged'=>'MODEL_NO_REVISION') as $mode=>$code) {
        $model->mode=$mode;$before=$app->project($p['id']);$calls=$model->calls;
        versioningReject(function()use($app,$p){$app->action(versioningInput($app,$p,'discuss',array('text'=>'無效模型測試')));},$code);
        versioningCheck($app->project($p['id'])===$before&&$model->calls===$calls+1,'invalid refinement '.$mode.' is atomic with no retry');
    }
    $model->mode='valid';
    foreach($generated as $v)versioningCheck(versioningById($p['versions'],$v['id'])===$v,'manual goals comments and revisions never change generated history');
    versioningCheck(versioningById($p['versions'],$manual['id'])===$manual,'manual goal snapshot and comments remain immutable');

    // A real app read and subsequent save migrate a legacy version in place.
    $raw=$store->project($p['id'],$owner);$legacy=versioningLegacy(30,'沒有新欄位的歷史作品');
    unset($legacy['goalSnapshot']);$raw['creativeItems'][0]['versions'][]=$legacy;$store->save($raw,$owner);$p=$app->project($p['id']);
    $legacyView=versioningById($p['versions'],$legacy['id']);
    versioningCheck(versionLabel($legacyView)==='V30'&&versioningWithoutCoordinates($legacyView)===$legacy,'application read normalizes legacy coordinates without fabricating goal or comments');
    $selected=array($generated[0]['id'],$manual['id'],$goalRevision['id'],$ninth['id'],$legacy['id']);
    $official=$p['officialVersionId'];$versionsBeforeCompare=$p['versions'];
    for($size=2;$size<=5;$size++) {
        $ids=array_slice($selected,0,$size);$calls=$model->calls;
        $p=$app->action(versioningInput($app,$p,'compare',array('versionIds'=>$ids,'question'=>'請按各版自己的目標比較。')))['project'];
        $comparison=versioningLast($p['comparisons']);$schema=$model->schema['properties']['items'];
        versioningCheck($model->calls===$calls+1&&$schema['minItems']===$size&&$schema['maxItems']===$size&&$schema['items']['properties']['versionId']['enum']===$ids,'compare '.$size.' binds exact item count and selected id enum');
        versioningCheck($model->data['goalBasis']==='version_snapshots'&&$model->data['creativeGoal']===null&&$model->data['goalApprovedAt']===null&&!isset($model->data['versions'])&&array_column($model->data['selectedVersions'],'id')===$ids,'compare '.$size.' transmits only selected bundles and no global scoring goal');
        $expected=array();foreach($ids as $id)$expected[]=versionComparisonSnapshot(versioningById($p['versions'],$id));
        versioningCheck($comparison['goalBasis']==='version_snapshots'&&$comparison['goalSnapshot']===null&&$comparison['versionGoalSnapshots']===$expected&&$comparison['versionIds']===$ids,'compare '.$size.' saves exact immutable per-version goal comment and discussion evidence');
        versioningCheck($p['officialVersionId']===$official&&$p['goalApprovedAt']===null&&$p['versions']===$versionsBeforeCompare,'compare '.$size.' neither mutates versions nor changes official or approval');
    }
    versioningCheck(in_array($ninth['id'],versioningLast($p['comparisons'])['versionIds'],true),'restored archived version is eligible for comparison again');
    $legacyComparison=versioningLast(versioningLast($p['comparisons'])['versionGoalSnapshots']);
    versioningCheck($legacyComparison['versionId']===$legacy['id']&&$legacyComparison['goalText']===null&&$legacyComparison['goalSnapshot']===null&&$legacyComparison['changeSummary']===null,'legacy absent evidence remains absent in comparison snapshots');
    foreach(array(array($selected[0]),array_merge($selected,array($continued['id'])),array($selected[0],$selected[0])) as $invalidIds) {
        $calls=$model->calls;$before=$app->project($p['id']);
        versioningReject(function()use($app,$p,$invalidIds){$app->action(versioningInput($app,$p,'compare',array('versionIds'=>$invalidIds)));},'COMPARISON_SELECTION');
        versioningCheck($model->calls===$calls&&$app->project($p['id'])===$before,'invalid selection rejected before model and without project changes');
    }
    foreach(array('duplicate','unselected','short','extra') as $mode) {
        $model->mode=$mode;$before=$app->project($p['id']);$calls=$model->calls;$bad=versioningInput($app,$p,'compare',array('versionIds'=>array_slice($selected,0,2)));
        versioningReject(function()use($app,$bad){$app->action($bad);},'MODEL_OUTPUT_INVALID');
        versioningCheck($app->project($p['id'])===$before&&$model->calls===$calls+1,'provider '.$mode.' comparison rejected atomically with one call');
        versioningReject(function()use($app,$bad){$app->action($bad);},'REQUEST_ALREADY_ATTEMPTED');
        versioningCheck($model->calls===$calls+1,'invalid provider '.$mode.' cannot silently retry');
    }
    $model->mode='valid';$sourceItem=$p['activeItemId'];$sourceBefore=versioningItem($p,$sourceItem);$calls=$model->calls;
    $p=$app->action(versioningInput($app,$p,'create_item',array('type'=>'titles','title'=>'引用接收項目','description'=>'固定引用，不跟著來源改動。')))['project'];$targetItem=$p['activeItemId'];
    $p=$app->action(versioningInput($app,$p,'attach_reference',array('targetItemId'=>$sourceItem,'versionId'=>$manual['id'])))['project'];
    $targetBefore=versioningItem($p,$targetItem);$pinned=$p['references'][0];
    versioningCheck($pinned['versionSnapshot']===$manual&&versioningItem($p,$sourceItem)===$sourceBefore,'reference pins full goal comment and provenance without modifying source item');
    foreach(array('promote','compare','snapshot') as $crossAction) {
        $extra=$crossAction==='compare'?array('versionIds'=>array($manual['id'],$major['id'])):($crossAction==='snapshot'?array('basedOnVersionId'=>$manual['id'],'versionMode'=>'minor','items'=>$manualItems):array('versionId'=>$manual['id']));
        // Snapshot on an unapproved empty item first enforces its own goal gate.
        $code=$crossAction==='snapshot'?'GOAL_APPROVAL_REQUIRED':'VERSION_NOT_FOUND';
        $before=$app->project($p['id']);
        versioningReject(function()use($app,$p,$crossAction,$extra){$app->action(versioningInput($app,$p,$crossAction,$extra));},$code);
        versioningCheck($app->project($p['id'])===$before&&$model->calls===$calls,'cross-item '.$crossAction.' cannot borrow another item version');
    }
    $p=$app->action(versioningInput($app,$p,'select_item',array('itemId'=>$sourceItem)))['project'];
    $p=$app->action(versioningInput($app,$p,'archive_version',array('versionId'=>$manual['id'])))['project'];
    versioningCheck(versioningItem($p,$targetItem)===$targetBefore&&versioningItem($p,$targetItem)['references'][0]===$pinned,'source archive leaves receiving item and already-pinned snapshot unchanged');
    $p=$app->action(versioningInput($app,$p,'snapshot',array('basedOnVersionId'=>$major['id'],'versionMode'=>'major','items'=>$manualItems,'goalText'=>'在舊資料後新增整組方向。','rationale'=>'確認封存與舊資料不會重用整組編號。')))['project'];
    versioningCheck(versionLabel(versioningLast($p['versions']))==='V31'&&versioningItem($p,$targetItem)===$targetBefore,'new major includes legacy and archived coordinates without cross-item mutation');

    // Recovery remains possible at the exact 400-message cap, without deletion.
    $raw=$store->project($p['id'],$owner);$index=0;
    foreach($raw['creativeItems'] as $i=>$item)if($item['id']===$sourceItem)$index=$i;
    while(count($raw['creativeItems'][$index]['messages'])<400)$raw['creativeItems'][$index]['messages'][]=array('id'=>newId(),'role'=>'system','kind'=>'fixture','text'=>'容量測試。','at'=>'2026-01-01T00:00:00+00:00');
    $store->save($raw,$owner);$p=$app->project($p['id']);$cappedMessages=$p['messages'];$cappedVersions=$p['versions'];$cappedComparisons=$p['comparisons'];
    $p=$app->action(versioningInput($app,$p,'restore_version',array('versionId'=>$manual['id'])))['project'];
    versioningCheck(count($p['messages'])===400&&$p['messages']===$cappedMessages&&!versionArchived($p,$manual['id']),'restore at message cap succeeds without appending or deleting dialogue');
    versioningCheck($p['versions']===$cappedVersions&&$p['comparisons']===$cappedComparisons&&versioningItem($p,$targetItem)===$targetBefore&&versioningById($p['versions'],$manual['id'])===$manual,'restore at cap preserves version comparison and cross-item evidence');
    versioningCheck($model->calls===$calls&&$app->project($other['id'])===$other,'local archive restore and reference work never calls model or changes other project');
    // End-to-end member actions use the real app and roster validators. The
    // in-memory seam checks revision tokens, not SQLite locking/concurrency.
    $priorProject=$app->project($p['id']);$memberModel=new VersioningFixtureAdapter();
    $memberApp=new CocreationApp($store,$config,$owner,$memberModel);
    $memberProject=$memberApp->action(array('action'=>'new','title'=>'AI 成員端到端測試','description'=>'只有虛構資料與注入模型。'))['project'];
    $memberStatus=$memberApp->status();$members=$memberStatus['members'];$memberA=$members[0]['id'];$memberB=str_repeat('e',32);
    $members[0]['nickname']='甲夥伴';$members[0]['model']='fixture-alpha';
    $members[]=array('id'=>$memberB,'nickname'=>'乙夥伴','enabled'=>false,'provider'=>'ollama','model'=>'fixture-beta','ollamaUrl'=>'http://127.0.0.1:11434');
    $saveRoster=array('action'=>'save_members','members'=>$members,'activeMemberId'=>$memberA,'usageConsent'=>true);
    versioningReject(function()use($memberApp,$saveRoster){$memberApp->action($saveRoster);},'SETTINGS_CHANGED');
    versioningReject(function()use($memberApp,$memberA){$memberApp->action(array('action'=>'select_member','memberId'=>$memberA));},'SETTINGS_CHANGED');
    versioningCheck($memberApp->status()===$memberStatus&&$memberModel->calls===0,'save_members and select_member require a settings lease without mutation or inference');
    $staleRevision=$memberStatus['settingsRevision'];$saveRoster['expectedSettingsRevision']=$staleRevision;
    $memberStatus=$memberApp->action($saveRoster);
    versioningCheck($memberStatus['memberId']===$memberA&&$memberStatus['activeMemberId']===$memberA&&$memberStatus['memberNickname']==='甲夥伴'&&$memberStatus['settingsRevision']!==$staleRevision,'saving roster preserves stable member id and advances settings revision');
    versioningReject(function()use($memberApp,$saveRoster){$memberApp->action($saveRoster);},'SETTINGS_CHANGED');
    versioningReject(function()use($memberApp,$memberA,$staleRevision){$memberApp->action(array('action'=>'select_member','memberId'=>$memberA,'expectedSettingsRevision'=>$staleRevision));},'SETTINGS_CHANGED');
    // The persistence seam also rejects an obsolete token supplied after the
    // app lease check. Real SQLite compare-and-swap is tested separately.
    versioningReject(function()use($store,$members,$memberA,$owner,$staleRevision){$store->setMemberRoster($members,$memberA,true,$owner,$staleRevision);},'SETTINGS_CHANGED');
    versioningReject(function()use($store,$memberA,$owner,$staleRevision){$store->selectMember($memberA,'fixture-local',$owner,$staleRevision);},'SETTINGS_CHANGED');
    versioningCheck($memberApp->status()===$memberStatus&&$memberApp->project($p['id'])===$priorProject,'stale saves and selections cannot replace settings or relabel prior project history');
    versioningReject(function()use($memberApp,$memberB,$memberStatus){$memberApp->action(array('action'=>'select_member','memberId'=>$memberB,'expectedSettingsRevision'=>$memberStatus['settingsRevision']));},'MEMBER_DISABLED');
    versioningReject(function()use($memberApp,$members,$memberB,$memberStatus){$memberApp->action(array('action'=>'save_members','members'=>$members,'activeMemberId'=>$memberB,'usageConsent'=>true,'expectedSettingsRevision'=>$memberStatus['settingsRevision']));},'MEMBER_DISABLED');
    versioningCheck($memberApp->status()===$memberStatus&&$memberModel->calls===0,'disabled selection and disabled active roster are rejected atomically');
    $memberStatus=$memberApp->action(array('action'=>'select_member','memberId'=>null,'expectedSettingsRevision'=>$memberStatus['settingsRevision']));
    versioningCheck($memberStatus['activeMemberId']===null&&$memberStatus['memberId']===null&&$memberStatus['memberNickname']===null&&$memberStatus['members']===$members,'explicit null clears selection without choosing another enabled member');
    versioningReject(function()use($memberApp,$memberProject){$memberApp->action(versioningInput($memberApp,$memberProject,'discuss',array('text'=>'未選成員不應送出。')));},'AI_MEMBER_REQUIRED');
    versioningCheck($memberModel->calls===0&&$memberApp->project($memberProject['id'])===$memberProject,'null member has no default-provider fallback or project mutation');
    $memberStatus=$memberApp->action(array('action'=>'select_member','memberId'=>$memberA,'expectedSettingsRevision'=>$memberStatus['settingsRevision']));
    versioningReject(function()use($memberApp,$memberProject,$memberB){$memberApp->action(versioningInput($memberApp,$memberProject,'discuss',array('text'=>'錯誤成員不得送出。','approvedMemberId'=>$memberB)));},'MEMBER_CHANGED');
    $memberStatus=$memberApp->action(array('action'=>'save_members','members'=>$members,'activeMemberId'=>$memberA,'usageConsent'=>false,'expectedSettingsRevision'=>$memberStatus['settingsRevision']));
    versioningCheck($memberStatus['usageConsent']===false&&$memberStatus['consentAt']===null,'revoked usage consent is stored explicitly with no consent timestamp');
    versioningReject(function()use($memberApp,$memberProject){$memberApp->action(versioningInput($memberApp,$memberProject,'discuss',array('text'=>'未同意不得呼叫。')));},'AI_USAGE_OPT_IN');
    versioningCheck($memberModel->calls===0&&$memberApp->project($memberProject['id'])===$memberProject,'member mismatch and usageConsent false fail before adapter invocation');
    $members[1]['enabled']=true;
    $memberStatus=$memberApp->action(array('action'=>'save_members','members'=>$members,'activeMemberId'=>$memberA,'usageConsent'=>true,'expectedSettingsRevision'=>$memberStatus['settingsRevision']));
    $oldPaidInput=versioningInput($memberApp,$memberProject,'discuss',array('text'=>'此請求綁定甲夥伴。'));
    $selectionConsentAt=$memberStatus['consentAt'];$memberStatus=$memberApp->action(array('action'=>'select_member','memberId'=>$memberB,'expectedSettingsRevision'=>$memberStatus['settingsRevision']));
    versioningCheck($memberStatus['memberId']===$memberB&&$memberStatus['usageConsent']===true&&$memberStatus['consentAt']===$selectionConsentAt,'explicit selection chooses only the requested enabled member and preserves consent');
    versioningReject(function()use($memberApp,$oldPaidInput){$memberApp->action($oldPaidInput);},'MEMBER_CHANGED');
    $memberStatus=$memberApp->action(array('action'=>'select_member','memberId'=>$memberA,'expectedSettingsRevision'=>$memberStatus['settingsRevision']));
    versioningReject(function()use($memberApp,$oldPaidInput){$memberApp->action($oldPaidInput);},'SETTINGS_CHANGED');
    versioningCheck($memberModel->calls===0,'switching away and back cannot revive a stale paid settings approval');

    for($i=0;$i<3;$i++)$memberProject=$memberApp->action(versioningInput($memberApp,$memberProject,'discuss',array('text'=>'成員討論 '.$i)))['project'];
    $memberProject=$memberApp->action(versioningInput($memberApp,$memberProject,'summarize'))['project'];
    $memberProject=$memberApp->action(versioningInput($memberApp,$memberProject,'approve_goal'))['project'];
    $memberModel->onDispatch=function($requestedModel,$messages,$schema)use($memberApp,$members,$memberA,$memberB) {
        versioningCheck($requestedModel==='fixture-alpha'&&isset($schema['properties']['candidates']),'generation dispatched to the previously approved member model');
        $during=$memberApp->status();$edited=$members;$edited[0]['nickname']='已改名的甲';$edited[0]['enabled']=false;
        $memberApp->action(array('action'=>'save_members','members'=>$edited,'activeMemberId'=>$memberB,'usageConsent'=>true,'expectedSettingsRevision'=>$during['settingsRevision']));
    };
    $memberProject=$memberApp->action(versioningInput($memberApp,$memberProject,'generate'))['project'];
    $memberStatus=$memberApp->status();$generationReply=versioningLast($memberProject['messages']);$memberVersions=$memberProject['versions'];
    versioningCheck($memberModel->calls===5&&$memberStatus['memberId']===$memberB&&$memberStatus['members'][0]['id']===$memberA&&$memberStatus['members'][0]['nickname']==='已改名的甲'&&$memberStatus['members'][0]['enabled']===false,'injected dispatch hook really renamed and disabled original member without an extra model call');
    versioningCheck($generationReply['provenance']['memberId']===$memberA&&$generationReply['provenance']['memberNickname']==='甲夥伴'&&$generationReply['provenance']['requestedModel']==='fixture-alpha','reply provenance keeps dispatched member identity after an in-flight roster edit');
    foreach($memberVersions as $v)versioningCheck($v['provenance']===$generationReply['provenance']&&$v['provenance']['memberId']===$memberA,'generated version retains exact dispatch provenance, not newly active member');
    versioningCheck($memberApp->project($p['id'])===$priorProject,'same-id rename and disable leave all existing content and metadata unchanged');
    $memberProject=$memberApp->action(versioningInput($memberApp,$memberProject,'promote',array('versionId'=>$memberVersions[0]['id'])))['project'];
    $memberHistory=$memberProject;$members=$memberStatus['members'];$members[0]['nickname']='重新啟用的甲';$members[0]['enabled']=true;$members[0]['model']='fixture-gamma';
    $memberStatus=$memberApp->action(array('action'=>'save_members','members'=>$members,'activeMemberId'=>$memberA,'usageConsent'=>true,'expectedSettingsRevision'=>$memberStatus['settingsRevision']));
    versioningCheck($memberApp->project($memberProject['id'])===$memberHistory,'later same-id rename re-enable and model edit do not rewrite saved reply or version provenance');

    // A deterministic race between approval and execute additionally proves the
    // paid action freezes its validated connection, not just its output label.
    $approvedPaidInput=versioningInput($memberApp,$memberProject,'discuss',array('text'=>'保留派送時的成員身分。'));
    $store->onRequestStart=function()use($memberApp,$members,$memberB) {
        $during=$memberApp->status();$edited=$members;$edited[0]['nickname']='送出後再次改名';$edited[0]['model']='fixture-delta';$edited[0]['enabled']=false;
        $memberApp->action(array('action'=>'save_members','members'=>$edited,'activeMemberId'=>$memberB,'usageConsent'=>true,'expectedSettingsRevision'=>$during['settingsRevision']));
    };
    $memberProject=$memberApp->action($approvedPaidInput)['project'];$frozenRevision=versioningLast($memberProject['versions']);$frozenReply=versioningLast($memberProject['messages']);
    versioningCheck($memberModel->calls===6&&versioningLast($memberModel->requestedModels)==='fixture-gamma'&&$memberApp->status()['memberId']===$memberB,'approval-to-execute race still invokes the originally approved model exactly once');
    versioningCheck($frozenRevision['provenance']['memberId']===$memberA&&$frozenRevision['provenance']['memberNickname']==='重新啟用的甲'&&$frozenRevision['provenance']['requestedModel']==='fixture-gamma'&&$frozenReply['provenance']===$frozenRevision['provenance'],'revision and response both retain frozen approved member identity and model');
    versioningCheck(array_slice($memberProject['versions'],0,count($memberVersions))===$memberVersions&&array_slice($memberProject['messages'],0,count($memberHistory['messages']))===$memberHistory['messages'],'subsequent roster edits and refinement preserve all prior content and provenance snapshots');
    versioningCheck($memberApp->project($p['id'])===$priorProject&&$memberApp->project($other['id'])===$other,'member end-to-end fixture does not mutate earlier versioning or isolated projects');

    // Isolated single-input save/edit cycle and official-title synchronization.
    // Its own store and model leave every earlier numbering/call-count assertion intact.
    $mergedStore=new VersioningMemoryStore();$mergedModel=new VersioningFixtureAdapter();
    $mergedApp=new CocreationApp($mergedStore,$config,$owner,$mergedModel);
    $mergedProject=$mergedApp->action(array('action'=>'new','title'=>'合併欄位隔離專案','description'=>'專案名稱與說明不得因採用版本而改動。'))['project'];
    $mergedOuterTitle=$mergedProject['title'];$mergedOuterDescription=$mergedProject['description'];
    $mergedInitialItemTitle=$mergedProject['activeItem']['title'];$mergedItemDescription=$mergedProject['activeItem']['description'];
    for($i=0;$i<3;$i++)$mergedProject=$mergedApp->action(versioningInput($mergedApp,$mergedProject,'discuss',array('text'=>'合併欄位討論 '.$i)))['project'];
    $mergedProject=$mergedApp->action(versioningInput($mergedApp,$mergedProject,'summarize'))['project'];
    $mergedProject=$mergedApp->action(versioningInput($mergedApp,$mergedProject,'approve_goal'))['project'];
    $mergedProject=$mergedApp->action(versioningInput($mergedApp,$mergedProject,'generate'))['project'];
    $mergedSeed=$mergedProject['versions'][0];$mergedItems=$mergedSeed['items'];
    $mergedItems[0]['content']='合併欄位正式名稱';
    $mergedItems[]=array('id'=>'custom_merged','label'=>'自訂完整補充','content'=>'不可因合併輸入框而遺失的內容。');
    $mergedProject=$mergedApp->action(versioningInput($mergedApp,$mergedProject,'snapshot',array('basedOnVersionId'=>$mergedSeed['id'],'versionMode'=>'major','items'=>$mergedItems,'goalText'=>'舊格式單獨保存的目標。','rationale'=>'舊格式單獨保存的修改意見。')))['project'];
    $mergedLegacy=versioningLast($mergedProject['versions']);
    versioningCheck($mergedLegacy['goalText']==='舊格式單獨保存的目標。'&&$mergedLegacy['rationale']==='舊格式單獨保存的修改意見。'&&$mergedLegacy['goalAndRationale']===versioningCombinedFromLegacyFields($mergedLegacy),'old snapshot payload still saves separate fields and derives new combined field');
    $combinedUserText="\n  改為邀請所有有興趣的人參加。\n\n我的修改意見：少一點口號，多一點具體邀請。\t  \n";
    $mergedCalls=$mergedModel->calls;
    $mergedProject=$mergedApp->action(versioningInput($mergedApp,$mergedProject,'snapshot',array('basedOnVersionId'=>$mergedLegacy['id'],'versionMode'=>'major','items'=>$mergedItems,'goalAndRationale'=>$combinedUserText)))['project'];
    $mergedMajor=versioningLast($mergedProject['versions']);
    versioningCheck(versionLabel($mergedMajor)==='V5'&&$mergedMajor['basedOnVersionId']===$mergedLegacy['id']&&$mergedMajor['goalAndRationale']===$combinedUserText&&$mergedMajor['items']===$mergedItems,'single combined input creates immutable major snapshot with full custom bundle');
    foreach(array('goalText','goalSnapshot','changeSummary','rationale') as $key)versioningCheck($mergedMajor[$key]===$mergedLegacy[$key],'combined save retains historical separate metadata '.$key.' without trying to split new prose');
    versioningCheck(versionGoalAndRationale($mergedMajor)===$combinedUserText&&versioningById($mergedProject['versions'],$mergedLegacy['id'])===$mergedLegacy,'saved combined text is authoritative and old snapshot stays immutable');
    versioningCheck(versioningById($mergedApp->project($mergedProject['id'])['versions'],$mergedMajor['id'])['goalAndRationale']===$combinedUserText&&versionGoalAndRationale($mergedMajor)===$combinedUserText&&trim($combinedUserText)!==$combinedUserText,'combined snapshot storage and editor round-trip preserve exact leading trailing and internal whitespace');
    $combinedEditedText=versionGoalAndRationale($mergedMajor)."\n\n補充：保留自訂項目與原本的語氣。";
    $mergedMinorItems=$mergedMajor['items'];$mergedMinorItems[0]['content']='尚未採用的小修改名稱';
    $mergedProject=$mergedApp->action(versioningInput($mergedApp,$mergedProject,'snapshot',array('basedOnVersionId'=>$mergedMajor['id'],'versionMode'=>'minor','items'=>$mergedMinorItems,'goalAndRationale'=>$combinedEditedText)))['project'];
    $mergedMinor=versioningLast($mergedProject['versions']);
    versioningCheck(versionLabel($mergedMinor)==='V5.1'&&$mergedMinor['goalAndRationale']===$combinedEditedText&&$mergedMinor['items']===$mergedMinorItems,'single combined input saves full minor snapshot with expected coordinates');
    $mergedProject=$mergedApp->action(versioningInput($mergedApp,$mergedProject,'snapshot',array('basedOnVersionId'=>$mergedMinor['id'],'versionMode'=>'minor','items'=>$mergedMinor['items'],'goalAndRationale'=>versionGoalAndRationale($mergedMinor))))['project'];
    $mergedRepeat=versioningLast($mergedProject['versions']);
    versioningCheck(versionLabel($mergedRepeat)==='V5.2'&&versionGoalAndRationale($mergedRepeat)===$combinedEditedText&&$mergedRepeat['goalAndRationale']===$mergedMinor['goalAndRationale'],'snapshot then reopen and save does not duplicate merged legacy fields');
    versioningCheck($mergedProject['activeItem']['title']===$mergedInitialItemTitle&&$mergedProject['officialVersionId']===null&&$mergedModel->calls===$mergedCalls,'creating major or minor candidates does not rename item or invoke a model');

    $maxCombined=str_repeat('字',4000);
    versioningCheck(strlen($maxCombined)===12000,'combined-field boundary is 12000 UTF-8 bytes, not characters');
    $mergedProject=$mergedApp->action(versioningInput($mergedApp,$mergedProject,'snapshot',array('basedOnVersionId'=>$mergedMajor['id'],'versionMode'=>'minor','items'=>$mergedItems,'goalAndRationale'=>$maxCombined)))['project'];
    versioningCheck(versioningLast($mergedProject['versions'])['goalAndRationale']===$maxCombined,'exact 12000-byte combined value is accepted unchanged');
    foreach(array(str_repeat('x',12001),str_repeat('字',4001),'',array(),"不可\0保存","\xC3\x28") as $invalidCombined) {
        $beforeMerged=$mergedApp->project($mergedProject['id']);
        versioningReject(function()use($mergedApp,$mergedProject,$mergedMajor,$mergedItems,$invalidCombined){$mergedApp->action(versioningInput($mergedApp,$mergedProject,'snapshot',array('basedOnVersionId'=>$mergedMajor['id'],'versionMode'=>'minor','items'=>$mergedItems,'goalAndRationale'=>$invalidCombined)));},'INVALID_INPUT');
        versioningCheck($mergedApp->project($mergedProject['id'])===$beforeMerged&&$mergedModel->calls===$mergedCalls,'invalid combined input is atomic and makes no model call');
    }

    $mergedVersionsBeforeCompare=$mergedProject['versions'];
    $mergedProject=$mergedApp->action(versioningInput($mergedApp,$mergedProject,'compare',array('versionIds'=>array($mergedMajor['id'],$mergedMinor['id']),'question'=>'以各版合併保存的目標與修改意見比較。')))['project'];
    $mergedComparison=versioningLast($mergedProject['comparisons']);
    versioningCheck($mergedModel->calls===$mergedCalls+1&&array_column($mergedModel->data['selectedVersions'],'goalAndRationale')===array($combinedUserText,$combinedEditedText),'comparison dispatch includes exact selected combined text in one injected call');
    versioningCheck(array_column($mergedComparison['versionGoalSnapshots'],'goalAndRationale')===array($combinedUserText,$combinedEditedText)&&$mergedProject['versions']===$mergedVersionsBeforeCompare,'comparison stores combined evidence without rewriting selected versions');
    $mergedBeforePromote=$mergedProject;$mergedCalls=$mergedModel->calls;
    $mergedProject=$mergedApp->action(versioningInput($mergedApp,$mergedProject,'promote',array('versionId'=>$mergedMajor['id'])))['project'];
    versioningCheck($mergedProject['officialVersionId']===$mergedMajor['id']&&$mergedProject['activeItem']['title']==='合併欄位正式名稱'&&versioningItem($mergedProject,$mergedProject['activeItemId'])['title']==='合併欄位正式名稱','adopting official version immediately updates active item and item list title');
    versioningCheck($mergedProject['title']===$mergedOuterTitle&&$mergedProject['description']===$mergedOuterDescription&&$mergedProject['activeItem']['description']===$mergedItemDescription,'official adoption never renames project or rewrites project and item descriptions');
    versioningCheck($mergedProject['versions']===$mergedBeforePromote['versions']&&$mergedProject['references']===$mergedBeforePromote['references']&&$mergedProject['goalApprovedAt']===$mergedBeforePromote['goalApprovedAt']&&$mergedModel->calls===$mergedCalls,'title synchronization changes no version snapshot reference approval or model-call count');
    // The manual combined note is goal B; its untouched compatibility field is
    // still goal A. Returning to A is a real metadata revision, not a no-op.
    versioningCheck(versionHasCombinedOverride($mergedMajor)&&!versionHasCombinedOverride($mergedLegacy),'manual combined override is distinguished from lossless legacy composition');
    $mergedBeforeRevert=$mergedProject;$mergedRevertCalls=$mergedModel->calls;$mergedModel->mode='unchanged';
    $mergedProject=$mergedApp->action(versioningInput($mergedApp,$mergedProject,'discuss',array('text'=>'只把本版目標恢復成舊格式單獨保存的目標，所有作品文字維持原樣。')))['project'];
    $mergedGoalRevert=versioningLast($mergedProject['versions']);$mergedModel->mode='valid';
    versioningCheck($mergedModel->calls===$mergedRevertCalls+1&&count($mergedProject['versions'])===count($mergedBeforeRevert['versions'])+1,'goal-only revert from combined override creates one revision with exactly one injected call');
    versioningCheck($mergedGoalRevert['items']===$mergedMajor['items']&&$mergedGoalRevert['goalText']===$mergedMajor['goalText']&&$mergedGoalRevert['goalAndRationale']!==$mergedMajor['goalAndRationale']&&$mergedGoalRevert['goalAndRationale']===versioningCombinedFromLegacyFields($mergedGoalRevert),'unchanged items and legacy goal A do not hide a genuine change from authoritative combined goal B');
    versioningCheck($mergedGoalRevert['changeSummary']==='將手動合併欄位中的新目標恢復為保留的先前目標，不修改作品文字。'&&$mergedProject['officialVersionId']===$mergedMajor['id']&&$mergedProject['activeItem']['title']==='合併欄位正式名稱'&&array_slice($mergedProject['versions'],0,count($mergedBeforeRevert['versions']))===$mergedBeforeRevert['versions'],'goal revert keeps explicit same-call explanation without adoption title changes or history rewrite');
    $mergedCalls=$mergedModel->calls;
    $mergedProject=$mergedApp->action(versioningInput($mergedApp,$mergedProject,'discuss',array('text'=>'正式版之後的新名稱')))['project'];
    $mergedRevision=versioningLast($mergedProject['versions']);
    versioningCheck($mergedModel->calls===$mergedCalls+1&&$mergedModel->data['officialVersion']['goalAndRationale']===$combinedUserText&&$mergedModel->data['officialVersion']['goalText']===$mergedMajor['goalText'],'refinement includes authoritative combined official text and untouched compatibility goal');
    versioningCheck($mergedRevision['goalAndRationale']===versioningCombinedFromLegacyFields($mergedRevision)&&$mergedRevision['items'][2]===$mergedItems[2],'same-call AI revision stores merged metadata and preserves custom item');
    versioningCheck($mergedProject['activeItem']['title']==='合併欄位正式名稱'&&$mergedProject['officialVersionId']===$mergedMajor['id'],'new revision candidate alone does not rename the adopted item');
    $mergedBeforeSecondPromote=$mergedProject;$mergedCalls=$mergedModel->calls;
    $mergedProject=$mergedApp->action(versioningInput($mergedApp,$mergedProject,'promote',array('versionId'=>$mergedRevision['id'])))['project'];
    versioningCheck($mergedProject['activeItem']['title']==='正式版之後的新名稱'&&$mergedProject['officialVersionId']===$mergedRevision['id'],'adopting later revision updates the item title again immediately');
    versioningCheck($mergedProject['title']===$mergedOuterTitle&&$mergedProject['description']===$mergedOuterDescription&&$mergedProject['versions']===$mergedBeforeSecondPromote['versions']&&$mergedModel->calls===$mergedCalls,'later promotion retains project identity all old snapshots and zero additional inference');
    foreach(array($mergedLegacy,$mergedMajor,$mergedMinor,$mergedRepeat) as $oldMerged)versioningCheck(versioningById($mergedProject['versions'],$oldMerged['id'])===$oldMerged,'combined edit compare refine and promote leave every prior snapshot immutable');

    $nameChoices=array(array('id'=>'english','label'=>'英文名稱','content'=>'English First'),array('id'=>'custom','label'=>'自訂名稱','content'=>'Generic Middle'),array('id'=>'main','label'=>'中文名稱','content'=>"  正式\n名稱\t範例  "));
    versioningCheck(officialItemTitle($nameChoices)==='正式 名稱 範例','official title prefers explicit Chinese label and collapses whitespace');
    versioningCheck(officialItemTitle(array(array('id'=>'other','label'=>'補充','content'=>'First Content'),array('id'=>'name','label'=>'名稱','content'=>'Generic Name')))==='Generic Name','official title chooses generic name before first-content fallback');
    versioningCheck(officialItemTitle(array(array('id'=>'custom','label'=>'自訂補充','content'=>'第一項的內容')))==='第一項的內容','official title falls back to first content when no name item exists');
    versioningCheck(officialItemTitle(array(array('id'=>'name','label'=>'中文名稱','content'=>str_repeat('字',61))))===str_repeat('字',59).'…','official title truncates by Unicode code points to 59 plus ellipsis');
    versioningCheck($mergedApp->project($mergedProject['id'])['title']===$mergedOuterTitle&&$memberApp->project($p['id'])===$priorProject,'isolated merged scenario leaves earlier projects and outer project title unchanged');
    versioningCheck(glob($dir.'/openai-session-keys/*.json')===array(),'fixture created no credential files');
    echo 'TOTAL '.$versioningChecks." versioning checks passed; injected model, in-memory Store, no HTTP/PDO/SQLite/key/user data.\n";
} finally {versioningCleanup($dir);}
