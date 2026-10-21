<?php
/**
 * Native PHP 7.4+/PDO SQLite application integration fixtures.
 * Run: php tests/interactive-app.php
 * UNEXECUTED in the authoring environment: PHP is unavailable.
 * Node source/oracle checks are NOT PHP execution, PHP syntax verification,
 * PDO coverage, a real API call, or a browser acceptance test.
 * Real CocreationApp and Store; only model inference is injected. No keys,
 * provider connection, browser, network, or user database is used.
 */
require_once dirname(__DIR__).'/app/bootstrap.php';
require_once __DIR__.'/phase1-helpers.php';
if(!class_exists('PDO')||!in_array('sqlite',PDO::getAvailableDrivers(),true)){
    fwrite(STDERR,"UNEXECUTED: interactive-app fixtures require PHP and PDO SQLite.\n");exit(77);
}
$interactiveAppChecks=0;
function interactiveAppCheck($ok,$label) {
    global $interactiveAppChecks;if(!$ok)throw new RuntimeException('FAIL '.$label);
    $interactiveAppChecks++;echo 'PASS '.$label."\n";
}
function interactiveAppReject(callable $call,$label,$code,$status=409) {
    $error=null;try{$call();}catch(AppError $caught){$error=$caught;}
    interactiveAppCheck($error instanceof AppError&&$error->errorCode===$code&&$error->status===$status,$label);
}
function interactiveAppInput($p,$action,$extra=array()) {
    return array_merge(array('action'=>$action,'id'=>$p['id'],'itemId'=>$p['activeItemId'],'revision'=>$p['revision']),$extra);
}
function interactiveAppDirections($p) {return array('confirmedDirections'=>array('visual','animation','parameters','interaction'),'directionRevision'=>$p['summaryRevision']);}
function interactiveAppBrief() {
    return array('purpose'=>'先建議寬度與位置控制，未勾選不啟用','audience'=>'視覺展示','message'=>'白底藍色矩形與橘色圓形，保留完整畫面','tone'=>'無動畫，純靜態','constraints'=>'無滑鼠互動','summary'=>'先做完整靜態幾何畫面，參數僅提議，待使用者另行勾選。','items'=>array(array('id'=>'document','label'=>'互動程式來源')));
}
function interactiveAppArtifact() {
    $shape=array('id'=>'shape','label'=>' 藍色主體 <literal> ','type'=>'rect','x'=>40,'y'=>50,'width'=>80,'height'=>100,'fill'=>'#2244cc','stroke'=>'none','strokeWidth'=>0,'opacity'=>1,'rotation'=>0,'motion'=>'none','motionAmount'=>0,'motionSpeed'=>0,'interaction'=>'none');
    $circle=$shape;$circle['id']='circle';$circle['label']='橘色圓形';$circle['type']='ellipse';$circle['x']=250;$circle['width']=60;$circle['height']=60;$circle['fill']='#ee8833';
    return array('kind'=>'interactive','title'=>" 完整作品\n保留標題 ",'width'=>640,'height'=>360,'background'=>'#ffffff','animation'=>false,'duration'=>10,'layers'=>array($shape,$circle),'parameters'=>array(
        array('id'=>'size','label'=>'主體寬度','layerId'=>'shape','target'=>'width','min'=>20,'max'=>200,'step'=>10,'value'=>80,'previousValue'=>80,'selected'=>false),
        array('id'=>'position','label'=>'水平位置','layerId'=>'shape','target'=>'x','min'=>0,'max'=>300,'step'=>10,'value'=>40,'previousValue'=>40,'selected'=>false)
    ));
}
function interactiveAppCandidate($artifact,$goal) {return array('artifact'=>$artifact,'rationale'=>'只改本次要求，其餘完整保留。','goalText'=>$goal,'changeSummary'=>'保存本次實際的完整候選。');}
function interactiveAppRevision($artifact,$goal) {return array_merge(array('outcome'=>'revision','reply'=>'提供完整修訂候選供審閱。','question'=>'','choices'=>array()),interactiveAppCandidate($artifact,$goal));}
function interactiveAppVersion($p,$id) {foreach($p['versions'] as $v)if($v['id']===$id)return $v;throw new RuntimeException('Missing fixture version.');}
function interactiveAppSaved($store,$p,$owner) {return jsonEncode($store->project($p['id'],$owner));}
function interactiveAppClean($directory) {
    foreach(scandir($directory) as $name)if($name!=='.'&&$name!=='..'){$path=$directory.'/'.$name;if(is_dir($path)&&!is_link($path))interactiveAppClean($path);else unlink($path);}rmdir($directory);
}
class InteractiveAppFixtureAdapter {
    public $calls=array();public $responses=array();
    public function actualModel() {return 'fixture-interactive-actual';}
    public function generate($model,$messages,$schema,$maxOutputTokens=6000,$images=array()) {
        $data=json_decode($messages[count($messages)-1]['content'],true,128,JSON_THROW_ON_ERROR);
        $this->calls[]=array('model'=>$model,'messages'=>$messages,'data'=>$data,'schema'=>$schema,'budget'=>$maxOutputTokens,'images'=>$images);
        if(!$this->responses)throw new RuntimeException('Unexpected inference: no queued fixture response.');
        return json_decode(jsonEncode(array_shift($this->responses)));
    }
}
$directory=sys_get_temp_dir().'/cocreation-interactive-app-'.bin2hex(random_bytes(8));
if(!mkdir($directory,0700,true))throw new RuntimeException('Cannot create disposable fixture directory.');
try {
    $config=validateConfig(array('app_url'=>'http://localhost/studio/public/','data_dir'=>$directory,'openai_model'=>'fixed-interactive-text-model','model_timeout_ms'=>120000));
    $store=new Store($directory);$owner=str_repeat('a',64);$memberId=str_repeat('c',32);
    $store->setMemberRoster(array(array('id'=>$memberId,'nickname'=>'固定程式測試夥伴','enabled'=>true,'provider'=>'ollama','model'=>'fixed-interactive-text-model','ollamaUrl'=>'http://127.0.0.1:11434')),$memberId,true,$owner);
    $adapter=new InteractiveAppFixtureAdapter();$app=new CocreationApp($store,$config,$owner,$adapter);
    interactiveAppCheck($store->db instanceof PDO&&$store->db->getAttribute(PDO::ATTR_DRIVER_NAME)==='sqlite','real temporary PDO SQLite store, not a persistence mock');
    // Rejected means no valid result saved, NOT that a provider charged nothing.
    foreach(array('MODEL_PARAMETER_STATE','MODEL_PIXEL_CLAIM','MODEL_IMAGE_REFERENCE_INVALID') as $code){
        $error=new AppError($code,'Injected invalid model output',502);$response=errorResponse($error);
        interactiveAppCheck(operationOutcome($error)==='rejected'&&$response['error']['operationOutcome']==='rejected'&&$response['error']['code']===$code,'known invalid model output is rejected, provider may still charge '.$code);
    }
    foreach(array(new AppError('UPSTREAM_TRANSPORT','Injected transport uncertainty',502),new AppError('REQUEST_ALREADY_ATTEMPTED','Injected prior-attempt uncertainty',409),new RuntimeException('Injected unknown failure')) as $error)interactiveAppCheck(operationOutcome($error)==='unknown'&&errorResponse($error)['error']['operationOutcome']==='unknown','transport prior attempt and generic failures remain unknown');
    $registry=moduleRegistry();
    interactiveAppCheck(array_column($registry,'id')===array('titles','short_text','article','illustrated','table','chart','mindmap','vector','image','poster','webpage','interactive')&&count($registry)===12,'all twelve established registry IDs and order remain intact');
    $p=$app->action(fixtureBoundNew($app,array('title'=>'不隨作品改名的專案','description'=>'互動視覺整合測試')))['project'];$untouchedTitleItem=$p['activeItem'];
    $p=$app->action(interactiveAppInput($p,'create_item',array('type'=>'interactive','title'=>'我的視覺項目','description'=>'獨立完整作品')))['project'];
    interactiveAppCheck($p['activeItem']['enabled']===true&&moduleAdapter('interactive',$adapter) instanceof InteractiveModule,'interactive native module is enabled and dispatched');
    interactiveAppCheck(count($adapter->calls)===0,'creating project and interactive item makes zero model calls');
    interactiveAppReject(function()use($app,$p){$app->action(fixtureProjectInput($app,$p,'generate'));},'generation before approved goal fails without inference','GOAL_APPROVAL_REQUIRED');
    interactiveAppCheck(count($adapter->calls)===0,'unapproved generation did not infer');
    $adapter->responses[]=array('reply'=>'主軸已足夠，可以確認方向並生成。','question'=>'','choices'=>array(),'directionStatus'=>'ready','direction'=>interactiveAppBrief());
    $p=$app->action(fixtureProjectInput($app,$p,'discuss',array('text'=>'做藍色矩形和橘色圓形，靜態、無互動，先提出可選控制。')))['project'];
    interactiveAppCheck($p['phase']==='summary'&&$p['summaryRevision']===$p['revision']&&$p['goalApprovedAt']===null&&$p['versions']===array(),'ready discussion is not direction approval or generation');
    $validDirections=interactiveAppDirections($p);$invalidDirections=array(array(),array('confirmedDirections'=>array()),array('confirmedDirections'=>array('visual','animation','parameters'),'directionRevision'=>$p['summaryRevision']),array('confirmedDirections'=>array('animation','visual','parameters','interaction'),'directionRevision'=>$p['summaryRevision']),array('confirmedDirections'=>array('visual','animation','parameters','interaction','interaction'),'directionRevision'=>$p['summaryRevision']),array('confirmedDirections'=>array('style','content','functions'),'directionRevision'=>$p['summaryRevision']),array_merge($validDirections,array('directionRevision'=>$p['summaryRevision']-1)),array_merge($validDirections,array('directionRevision'=>(string)$p['summaryRevision'])),array_merge($validDirections,array('directionRevision'=>$p['summaryRevision']+0.5)));
    foreach(array('approve_goal','confirm_generate') as $action)foreach($invalidDirections as $invalid){
        $before=interactiveAppSaved($store,$p,$owner);$calls=count($adapter->calls);$input=$action==='approve_goal'?interactiveAppInput($p,$action,$invalid):fixtureProjectInput($app,$p,$action,$invalid);
        interactiveAppReject(function()use($app,$input){$app->action($input);},'exact four directions and current integer summary revision are required '.$action,'DIRECTION_CONFIRMATION_REQUIRED');
        interactiveAppCheck(count($adapter->calls)===$calls&&interactiveAppSaved($store,$p,$owner)===$before,'invalid confirmation makes no model call or project mutation '.$action);
    }
    // Also exercise the guard with a persisted legacy/inconsistent empty visual.
    $raw=$store->project($p['id'],$owner);$emptyRaw=$raw;foreach($emptyRaw['creativeItems'] as &$item)if($item['id']===$p['activeItemId'])$item['brief']['message']='   ';unset($item);$store->save($emptyRaw,$owner);
    $empty=$app->project($p['id']);$before=interactiveAppSaved($store,$empty,$owner);$calls=count($adapter->calls);
    interactiveAppReject(function()use($app,$empty){$app->action(fixtureProjectInput($app,$empty,'confirm_generate',interactiveAppDirections($empty)));},'empty visual direction is rejected even when four boxes are confirmed','DIRECTION_CONFIRMATION_REQUIRED');
    interactiveAppCheck(count($adapter->calls)===$calls&&interactiveAppSaved($store,$empty,$owner)===$before,'empty visual failure has no inference or project mutation');$store->save($raw,$owner);$p=$app->project($p['id']);
    $calls=count($adapter->calls);$p=$app->action(interactiveAppInput($p,'approve_goal',interactiveAppDirections($p)))['project'];$approval=end($p['messages']);
    interactiveAppCheck(count($adapter->calls)===$calls&&$p['versions']===array(),'separate four-part approval does not generate');
    interactiveAppCheck($approval['directionConfirmation']===array('summaryRevision'=>$p['summaryRevision'],'visual'=>$p['brief']['message'],'animation'=>$p['brief']['tone'],'parameters'=>$p['brief']['purpose'],'interaction'=>$p['brief']['constraints']),'approval stores exact current four-part summary snapshot');
    $artifact=interactiveAppArtifact();
    foreach(array('selected','previousValue') as $field){
        $bad=$artifact;$bad['parameters'][0][$field]=$field==='selected'?true:70;$adapter->responses[]=array('candidates'=>array(interactiveAppCandidate($bad,'不應保存')));$before=interactiveAppSaved($store,$p,$owner);$calls=count($adapter->calls);
        interactiveAppReject(function()use($app,$p){$app->action(fixtureProjectInput($app,$p,'generate'));},'new AI parameters must be unselected with equal current and previous '.$field,'MODEL_PARAMETER_STATE',502);
        interactiveAppCheck(count($adapter->calls)===$calls+1&&interactiveAppSaved($store,$p,$owner)===$before,'bad generation is not saved or automatically retried '.$field);
    }
    $adapter->responses[]=array('candidates'=>array(interactiveAppCandidate($artifact,'原始候選自己的靜態目標')));$calls=count($adapter->calls);
    $p=$app->action(fixtureProjectInput($app,$p,'generate'))['project'];$original=$p['versions'][0];
    interactiveAppCheck(count($adapter->calls)===$calls+1&&count($p['versions'])===1&&$original['artifact']===$artifact&&$original['items']===interactiveItems($artifact),'generation saves exactly one complete native artifact');
    interactiveAppCheck($original['artifact']['animation']===false&&array_column($original['artifact']['layers'],'interaction')===array('none','none')&&array_column($original['artifact']['parameters'],'selected')===array(false,false),'static animation false and interaction none are valid; all proposed parameters start unselected');
    interactiveAppCheck($p['officialVersionId']===null&&$original['source']==='generated'&&$original['basedOnVersionId']===null&&$original['major']===1&&$original['minor']===0,'generation does not adopt and starts a major version');
    interactiveAppCheck($original['provenance']['requestedModel']==='fixed-interactive-text-model'&&$original['provenance']['actualModel']==='fixture-interactive-actual'&&$original['goalSnapshot']['summary']===$original['goalText'],'generated source provenance and own goal snapshot are saved');
    $stale=$p;$manualArtifact=$artifact;$manualArtifact['parameters'][0]['selected']=true;$manualArtifact['parameters'][0]['value']=120;$manualArtifact['parameters'][0]['previousValue']=80;$calls=count($adapter->calls);$manualNote=" 使用者完整目標\n只啟用寬度，保留本次前後值 ";
    $p=$app->action(interactiveAppInput($p,'snapshot',array('artifact'=>$manualArtifact,'basedOnVersionId'=>$original['id'],'versionMode'=>'minor','goalAndRationale'=>$manualNote)))['project'];$manual=end($p['versions']);
    interactiveAppCheck(count($adapter->calls)===$calls&&$manual['artifact']===$manualArtifact&&$manual['items']===interactiveItems($manualArtifact),'manual selection saves complete artifact with selected current and previous values without inference');
    interactiveAppCheck($manual['source']==='snapshot'&&$manual['basedOnVersionId']===$original['id']&&$manual['provenance']===null&&$manual['goalAndRationale']===$manualNote&&$manual['major']===1&&$manual['minor']===1,'manual source lineage and literal combined goal note are preserved');
    interactiveAppReject(function()use($app,$stale,$manual){$app->action(interactiveAppInput($stale,'promote',array('versionId'=>$manual['id'])));},'stale project revision cannot silently adopt a candidate','STALE_REVISION');
    $beforeVersions=$p['versions'];$p=$app->action(interactiveAppInput($p,'promote',array('versionId'=>$manual['id'])))['project'];
    interactiveAppCheck(count($adapter->calls)===$calls&&$p['officialVersionId']===$manual['id']&&$p['versions']===$beforeVersions&&$p['lifecycle']!=='finalized','explicit adoption changes only official pointer, not parameter selection or snapshots');
    // Every malformed response still constitutes exactly one attempted inference.
    foreach(array('selection','previous','unselected','binding','remove') as $fault){
        $bad=$manualArtifact;
        if($fault==='selection')$bad['parameters'][0]['selected']=false;
        elseif($fault==='previous'){$bad['parameters'][0]['value']=140;$bad['parameters'][0]['previousValue']=80;}
        elseif($fault==='unselected'){$bad['parameters'][1]['value']=50;$bad['parameters'][1]['previousValue']=40;}
        elseif($fault==='binding')$bad['parameters'][0]['target']='height';
        else array_shift($bad['parameters']);
        $adapter->responses[]=interactiveAppRevision($bad,'不應保存的控制狀態');$before=interactiveAppSaved($store,$p,$owner);$calls=count($adapter->calls);
        interactiveAppReject(function()use($app,$p){$app->action(fixtureProjectInput($app,$p,'discuss',array('text'=>'將已勾選的主體寬度改成140，其餘不變。')));},'AI control guard rejects '.$fault,'MODEL_PARAMETER_STATE',502);
        interactiveAppCheck(count($adapter->calls)===$calls+1&&interactiveAppSaved($store,$p,$owner)===$before,'rejected control change leaves all saved snapshots and official unchanged '.$fault);
    }
    $refinedArtifact=$manualArtifact;$refinedArtifact['parameters'][0]['value']=140;$refinedArtifact['parameters'][0]['previousValue']=120;
    $adapter->responses[]=interactiveAppRevision($refinedArtifact,'正式版修訂自己的目標：寬度140');$beforeVersions=$p['versions'];
    $p=$app->action(fixtureProjectInput($app,$p,'discuss',array('text'=>'將已勾選的主體寬度改成140，其餘不變。')))['project'];$refined=end($p['versions']);$call=end($adapter->calls);
    interactiveAppCheck($refined['artifact']===$refinedArtifact&&$refined['basedOnVersionId']===$manual['id']&&$refined['source']==='revision'&&$refined['major']===1&&$refined['minor']===2,'default official refinement creates a complete new minor with guarded previous value');
    interactiveAppCheck($call['data']['sourceVersion']['id']===$manual['id']&&$call['data']['sourceVersion']['artifact']===$manualArtifact&&$call['data']['sourceVersion']['goalAndRationale']===$manualNote,'refinement receives exact official source and authoritative user goal note');
    interactiveAppCheck(array_slice($p['versions'],0,count($beforeVersions))===$beforeVersions&&$p['officialVersionId']===$manual['id'],'official refinement does not overwrite old versions or auto-adopt');
    $candidateArtifact=$refinedArtifact;$candidateArtifact['parameters'][0]['value']=160;$candidateArtifact['parameters'][0]['previousValue']=140;$adapter->responses[]=interactiveAppRevision($candidateArtifact,'候選接續自己的目標：寬度160');
    $p=$app->action(fixtureProjectInput($app,$p,'discuss',array('baseVersionId'=>$refined['id'],'text'=>'從這個候選接續，把已勾選寬度改成160。')))['project'];$candidate=end($p['versions']);$call=end($adapter->calls);
    interactiveAppCheck($candidate['basedOnVersionId']===$refined['id']&&$candidate['artifact']===$candidateArtifact&&$candidate['minor']===3&&$call['data']['sourceVersion']['id']===$refined['id']&&$p['officialVersionId']===$manual['id'],'unadopted candidate can be an explicit refinement source');
    $p=$app->action(interactiveAppInput($p,'promote',array('versionId'=>$candidate['id'])))['project'];$continuedArtifact=$candidateArtifact;$continuedArtifact['parameters'][0]['value']=180;$continuedArtifact['parameters'][0]['previousValue']=160;$adapter->responses[]=interactiveAppRevision($continuedArtifact,'採用後繼續自己的目標：寬度180');
    $p=$app->action(fixtureProjectInput($app,$p,'discuss',array('text'=>'採用後繼續，將已勾選寬度改成180。')))['project'];$continued=end($p['versions']);
    interactiveAppCheck($continued['basedOnVersionId']===$candidate['id']&&$continued['artifact']===$continuedArtifact&&$continued['minor']===4&&$p['officialVersionId']===$candidate['id'],'adopt then continue uses new official source and still creates only a candidate');
    foreach(array($original,$manual,$refined,$candidate) as $source)interactiveAppCheck(interactiveAppVersion($p,$source['id'])===$source,'earlier source provenance goal and full artifact snapshots stay immutable '.$source['id']);
    $adapter->responses[]=array('outcome'=>'clarification','reply'=>'目前維持靜態畫面，控制僅有你勾選的寬度。','question'=>'','choices'=>array(),'artifact'=>$continuedArtifact,'rationale'=>'','goalText'=>'','changeSummary'=>'');$beforeVersions=$p['versions'];
    $p=$app->action(fixtureProjectInput($app,$p,'discuss',array('baseVersionId'=>$continued['id'],'text'=>'說明目前控制即可，不要修改。')))['project'];
    interactiveAppCheck($p['versions']===$beforeVersions&&$p['officialVersionId']===$candidate['id'],'clarification does not create or adopt a version');
    // Change the shared context so comparisons cannot inherit current approval.
    $p=$app->action(interactiveAppInput($p,'edit_project',array('title'=>$p['title'],'description'=>'新的共用脈絡，不可覆蓋各版自己的目標')))['project'];
    foreach(array(1,6) as $count){$ids=array_fill(0,$count,$original['id']);$before=interactiveAppSaved($store,$p,$owner);$calls=count($adapter->calls);interactiveAppReject(function()use($app,$p,$ids){$app->action(fixtureProjectInput($app,$p,'compare',array('versionIds'=>$ids)));},'comparison rejects invalid source count '.$count,'COMPARISON_SELECTION',400);interactiveAppCheck(count($adapter->calls)===$calls&&interactiveAppSaved($store,$p,$owner)===$before,'invalid count comparison has no inference or mutation '.$count);}
    $ids=array($original['id'],$original['id']);$calls=count($adapter->calls);interactiveAppReject(function()use($app,$p,$ids){$app->action(fixtureProjectInput($app,$p,'compare',array('versionIds'=>$ids)));},'comparison rejects duplicate selected source','COMPARISON_SELECTION',400);interactiveAppCheck(count($adapter->calls)===$calls,'duplicate comparison is rejected before inference');
    foreach(array(2,3,4,5) as $count){
        $selected=array_slice($p['versions'],0,$count);$ids=array_column($selected,'id');$response=array('items'=>array(),'summary'=>'各版依自己的目標作取捨，不指定唯一冠軍。');foreach($selected as $source)$response['items'][]=array('versionId'=>$source['id'],'fit'=>'依本版自己的目標','strength'=>'完整保留形狀','tradeoff'=>'控制設定不同','suggestion'=>'由使用者自行決定');$adapter->responses[]=$response;$beforeVersions=$p['versions'];$calls=count($adapter->calls);
        $p=$app->action(fixtureProjectInput($app,$p,'compare',array('versionIds'=>$ids,'question'=>'逐版依自己的目標比較，不代為採用。')))['project'];$comparison=end($p['comparisons']);$call=end($adapter->calls);
        interactiveAppCheck(count($adapter->calls)===$calls+1&&$comparison['versionIds']===$ids&&$comparison['goalBasis']==='version_snapshots'&&$comparison['goalSnapshot']===null&&$call['data']['creativeGoal']===null&&$call['data']['goalApprovedAt']===null,'comparison accepts selected count and uses own version goals '.$count);
        $expectedGoals=array();foreach($selected as $index=>$source){$expectedGoals[]=versionComparisonSnapshot($source);interactiveAppCheck($call['data']['selectedVersions'][$index]['artifact']===$source['artifact']&&$call['data']['selectedVersions'][$index]['goalAndRationale']===$source['goalAndRationale'],'comparison receives full source and own goal '.$count.'-'.$index);}
        interactiveAppCheck($comparison['versionGoalSnapshots']===$expectedGoals&&$p['versions']===$beforeVersions&&$p['officialVersionId']===$candidate['id']&&$p['goalApprovedAt']===null,'comparison neither adopts nor mutates versions or shared approval '.$count);
    }
    $before=interactiveAppSaved($store,$p,$owner);$calls=count($adapter->calls);$conflicting=array($original['id'],$manual['id']);
    interactiveAppReject(function()use($app,$p,$conflicting){$app->action(fixtureProjectInput($app,$p,'fuse',array('versionIds'=>$conflicting,'question'=>'融合兩版，保留控制。')));},'fusion rejects conflicting parameter selection and values before model call','INTERACTIVE_PARAMETER_CONFLICT');
    interactiveAppCheck(count($adapter->calls)===$calls&&interactiveAppSaved($store,$p,$owner)===$before,'conflicting fusion has no inference or saved mutation');
    $compatibleArtifact=$continuedArtifact;$compatibleArtifact['layers'][1]['fill']='#33aa66';$calls=count($adapter->calls);
    $p=$app->action(interactiveAppInput($p,'snapshot',array('artifact'=>$compatibleArtifact,'basedOnVersionId'=>$continued['id'],'versionMode'=>'major','goalAndRationale'=>'保留相同控制狀態，以綠色輔助圖形作融合來源。')))['project'];$compatible=end($p['versions']);
    interactiveAppCheck(count($adapter->calls)===$calls,'preparing compatible manual fusion source does not call model');
    $fusedArtifact=$compatibleArtifact;$fusedArtifact['layers'][1]['y']=120;$fusedArtifact['background']='#fff4dd';$adapter->responses[]=interactiveAppCandidate($fusedArtifact,'融合版自己的目標：保留使用者控制並調整畫面層次');$beforeVersions=$p['versions'];$ids=array($continued['id'],$compatible['id']);
    $result=$app->action(fixtureProjectInput($app,$p,'fuse',array('versionIds'=>$ids,'question'=>'明確融合這兩版，保留既有控制，融合配色與畫面層次。')));$p=$result['project'];$fused=end($p['versions']);$call=end($adapter->calls);
    interactiveAppCheck(count($adapter->calls)===$calls+1&&$fused['id']===$result['fusionVersionId']&&$fused['source']==='fusion'&&$fused['artifact']===$fusedArtifact&&$fused['basedOnVersionId']===null&&$fused['minor']===0,'explicit compatible fusion creates exactly one full major candidate');
    interactiveAppCheck($fused['fusionSourceVersionIds']===$ids&&$fused['fusionSourceSnapshots']===array($continued,$compatible)&&array_column($call['data']['selectedVersions'],'id')===$ids&&$call['data']['creativeGoal']===null,'fusion stores complete exact selected source snapshots and own goals');
    interactiveAppCheck(array_slice($p['versions'],0,count($beforeVersions))===$beforeVersions&&$p['officialVersionId']===$candidate['id']&&$fused['artifact']['parameters']===$continuedArtifact['parameters'],'fusion preserves old snapshots official pointer and user selected control state');
    // Separate one-click confirmation path, with a newly refreshed summary.
    $q=$app->action(fixtureBoundNew($app,array('title'=>'一次確認生成')))['project'];$q=$app->action(interactiveAppInput($q,'create_item',array('type'=>'interactive','title'=>'純靜態作品','description'=>'')))['project'];
    $adapter->responses[]=interactiveAppBrief();$q=$app->action(fixtureProjectInput($app,$q,'summarize'))['project'];$oldDirections=interactiveAppDirections($q);$adapter->responses[]=interactiveAppBrief();$q=$app->action(fixtureProjectInput($app,$q,'summarize'))['project'];$calls=count($adapter->calls);
    interactiveAppReject(function()use($app,$q,$oldDirections){$app->action(fixtureProjectInput($app,$q,'confirm_generate',$oldDirections));},'refreshed summary invalidates earlier four-part confirmation','DIRECTION_CONFIRMATION_REQUIRED');interactiveAppCheck(count($adapter->calls)===$calls,'stale summary confirmation is rejected before model');
    $noParameters=$artifact;$noParameters['title']='';$noParameters['parameters']=array();$adapter->responses[]=array('candidates'=>array(interactiveAppCandidate($noParameters,'無動畫無互動也無參數的完整靜態目標')));$q=$app->action(fixtureProjectInput($app,$q,'confirm_generate',interactiveAppDirections($q)))['project'];
    interactiveAppCheck(count($q['versions'])===1&&$q['versions'][0]['artifact']===$noParameters&&$q['officialVersionId']===null,'confirm_generate accepts a static complete program with no optional parameters');
    interactiveAppCheck($q['versions'][0]['title']==='互動視覺程式'&&$q['versions'][0]['artifact']['title']==='','empty interactive display title uses registry label without rewriting artifact');
    $confirmations=array_values(array_filter($q['messages'],function($message){return $message['kind']==='goal_approval';}));interactiveAppCheck(count($confirmations)===1&&$confirmations[0]['directionConfirmation']['summaryRevision']===$q['summaryRevision'],'confirm_generate pins the exact current four-part approval once');
    foreach($adapter->calls as $call)interactiveAppCheck($call['model']==='fixed-interactive-text-model'&&$call['images']===array()&&field($call['data'],'imagePixelsProvided')===false,'every inference uses fixed text adapter without pixels');
    $saved=$app->project($p['id']);interactiveAppCheck($saved['versions']===$p['versions']&&$store->project($p['id'],$owner)['creativeItems'][0]===$untouchedTitleItem&&$saved['title']==='不隨作品改名的專案','reload preserves all full snapshots and untouched sibling item and project title');
    interactiveAppCheck($adapter->responses===array(),'all queued fake responses consumed exactly once');
    echo 'PASS '.$interactiveAppChecks." native interactive application checks\n";
} finally {unset($app,$store);interactiveAppClean($directory);}
