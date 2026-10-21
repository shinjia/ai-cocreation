<?php
// Developer-only PHP fixture. No key, network, external model or user data.
// Requires PHP 7.4+ and PDO SQLite; execution status is documented separately.
require_once dirname(__DIR__).'/app/bootstrap.php';
$checks=0;
function verifyRevision($ok,$label){global $checks;if(!$ok)throw new Exception('FAIL: '.$label);$checks++;echo 'PASS '.$label."\n";}
function revisionReject($fn,$expected){try{$fn();throw new Exception('Expected '.$expected);}catch(AppError $e){verifyRevision($e->errorCode===$expected,'reject '.$expected);}}
function removeRevisionFixture($dir){if(!is_dir($dir))return;foreach(scandir($dir) as $name)if($name!=='.'&&$name!=='..'){is_dir($dir.'/'.$name)?removeRevisionFixture($dir.'/'.$name):unlink($dir.'/'.$name);}rmdir($dir);}
function revisionInput($app,$p,$action,$extra=array()){$status=$app->status();return array_merge(array('action'=>$action,'id'=>$p['id'],'itemId'=>$p['activeItemId'],'revision'=>$p['revision'],'consent'=>true,'approvedMemberId'=>$status['memberId'],'approvedProvider'=>$status['provider'],'approvedSettingsRevision'=>$status['settingsRevision'],'approvedModel'=>$status['model'],'requestId'=>newId()),$extra);}
class RevisionFixtureAdapter {
 public $calls=0;public $data=null;public $mode='revision';public $actual='fixture-local-v1';
 public function actualModel(){return $this->actual;}
 public function generate($model,$messages,$schema){
  $this->calls++;$this->data=json_decode($messages[1]['content'],true);$props=$schema['properties'];$data=$this->data;
  if(isset($props['outcome'])){
   if($this->mode==='clarification')$out=array('outcome'=>'clarification','reply'=>'可以先聚焦一個方向。','question'=>'你想改哪一項？','items'=>array(),'rationale'=>'','goalText'=>'','changeSummary'=>'');
   else {$items=$data['officialVersion']['items'];if($this->mode!=='unchanged')$items[0]['content']=$data['latestStudentMessage'];if($this->mode==='missing')array_pop($items);if($this->mode==='renamed')$items[0]['label']='不應改名';$out=array('outcome'=>'revision','reply'=>'已準備一份待審閱的修訂。','question'=>'','items'=>$items,'rationale'=>'只改指定內容，其餘完整保留。','goalText'=>versionGoalText($data['officialVersion']),'changeSummary'=>'依本次討論更新指定內容，其餘不變。');}
  }elseif(isset($props['question']))$out=array('reply'=>'我了解這個方向。','question'=>'讀者最需要記住什麼？');
  elseif(isset($props['purpose']))$out=array('purpose'=>'影展命名','audience'=>'同學','message'=>'發現日常','tone'=>'溫暖','constraints'=>'不誇張','summary'=>'用清楚溫暖的名稱邀請同學參加影展。','items'=>array(array('id'=>'name','label'=>'中文名稱')));
  else{$out=array('candidates'=>array());foreach(array('日常的光','一起看見','故事之間') as $content)$out['candidates'][]=array('items'=>array(array('id'=>'name','label'=>'中文名稱','content'=>$content)),'rationale'=>'對應創作目標。','goalText'=>'邀請同學一起發現日常故事。','changeSummary'=>'初次候選，整理已確認的影展方向。');}
  return json_decode(jsonEncode($out));
 }
}
if(!extension_loaded('pdo_sqlite')){echo "NOT RUN: PHP PDO SQLite unavailable\n";exit(1);}
$dir=sys_get_temp_dir().'/cocreation-revision-'.bin2hex(random_bytes(6));mkdir($dir,0700,true);
try{
 $_SESSION=array('csrf'=>str_repeat('b',64));$owner=str_repeat('a',64);$config=validateConfig(array('app_url'=>'http://localhost/studio/public/','data_dir'=>$dir,'openai_model'=>'fixture','model_timeout_ms'=>120000));$store=new Store($dir);$model=new RevisionFixtureAdapter();$app=new CocreationApp($store,$config,$owner,$model);
 $app->action(array('action'=>'save_settings','provider'=>'ollama','model'=>'fixture-local','ollamaUrl'=>'http://127.0.0.1:11434'));
 $status=$app->status();$app->action(array('action'=>'save_members','expectedSettingsRevision'=>$status['settingsRevision'],'members'=>$status['members'],'activeMemberId'=>$status['activeMemberId'],'usageConsent'=>true));
 $p=$app->action(array('action'=>'new','title'=>'持續修訂','description'=>'測試專案脈絡'))['project'];$other=$app->action(array('action'=>'new','title'=>'另一專案'))['project'];
 for($i=0;$i<3;$i++)$p=$app->action(revisionInput($app,$p,'discuss',array('text'=>'構思'.$i)))['project'];
 $p=$app->action(revisionInput($app,$p,'summarize'))['project'];$p=$app->action(revisionInput($app,$p,'approve_goal'))['project'];$p=$app->action(revisionInput($app,$p,'generate'))['project'];
 $p=$app->action(revisionInput($app,$p,'snapshot',array('items'=>array(array('id'=>'name','label'=>'中文名稱','content'=>'原始名稱'),array('id'=>'custom','label'=>'自訂邀請語','content'=>'保留這段自訂內容')))))['project'];
 $base=end($p['versions']);$p=$app->action(revisionInput($app,$p,'promote',array('versionId'=>$base['id'])))['project'];$approval=$p['goalApprovedAt'];$baseCount=count($p['versions']);
 $request=revisionInput($app,$p,'discuss',array('text'=>'第一輪更口語的名稱'));$result=$app->action($request);$p=$result['project'];$v1=end($p['versions']);
 verifyRevision($v1['id']===$result['revisionVersionId']&&count($p['versions'])===$baseCount+1,'clear edit adds one visible revision');
 verifyRevision($v1['source']==='revision'&&$v1['basedOnVersionId']===$base['id']&&$v1['revisionInstruction']==='第一輪更口語的名稱','revision lineage and instruction');
 verifyRevision($v1['items'][0]['content']==='第一輪更口語的名稱'&&$v1['items'][1]===$base['items'][1],'actual changed content and custom item preserved');
 verifyRevision($p['officialVersionId']===$base['id']&&$p['goalApprovedAt']===$approval&&$p['lifecycle']!=='finalized','revision neither promotes nor finalizes nor resets approval');
 verifyRevision($model->data['officialVersion']['items']===$base['items']&&$model->data['projectDescription']==='測試專案脈絡','full official bundle and project context dispatched');
 $reply=end($p['messages']);verifyRevision($reply['kind']==='revision'&&$reply['versionIds']===array($v1['id'])&&$reply['id']===$v1['messageId']&&$reply['provenance']===$v1['provenance'],'immutable reply/version provenance linkage');
 $before=$model->calls;$replayed=$app->action($request)['project'];verifyRevision($model->calls===$before&&count($replayed['versions'])===count($p['versions']),'replay makes no second inference');
 $model->mode='clarification';$count=count($p['versions']);$p=$app->action(revisionInput($app,$p,'discuss',array('text'=>'你覺得呢')) )['project'];verifyRevision(count($p['versions'])===$count&&end($p['messages'])['kind']==='clarification'&&$p['goalApprovedAt']===$approval,'clarification makes no fake edit');
 $p=$app->action(revisionInput($app,$p,'promote',array('versionId'=>$v1['id'])))['project'];$model->mode='revision';$model->actual='fixture-local-v2';
 $p=$app->action(revisionInput($app,$p,'discuss',array('text'=>'再縮短的名稱')))['project'];$v2=end($p['versions']);
 verifyRevision($v2['basedOnVersionId']===$v1['id']&&$model->data['officialVersion']['items']===$v1['items'],'next turn uses adopted revision as baseline');
 verifyRevision($v2['items'][1]===$base['items'][1]&&$v2['provenance']['actualModel']==='fixture-local-v2'&&$v1['provenance']['actualModel']==='fixture-local-v1','custom fields and historical model snapshots persist');
 foreach($p['versions'] as $v)if($v['id']===$base['id'])verifyRevision($v===$base,'original version immutable');
 verifyRevision($app->project($other['id'])===$other,'other project unaffected');
 foreach(array('missing'=>'MODEL_OUTPUT_INVALID','renamed'=>'MODEL_OUTPUT_INVALID','unchanged'=>'MODEL_NO_REVISION') as $mode=>$code){$model->mode=$mode;$before=$app->project($p['id']);revisionReject(function()use($app,$p){$app->action(revisionInput($app,$p,'discuss',array('text'=>'負向回覆')));},$code);verifyRevision($app->project($p['id'])===$before,'invalid reply preserves prior state');}
 $model->mode='revision';$sourceItem=$p['activeItemId'];
 // Seed another item's historical version without invoking a provider.
 $p=$app->action(array('action'=>'create_item','id'=>$p['id'],'revision'=>$p['revision'],'type'=>'titles','title'=>'引用來源'))['project'];$referenceItem=$p['activeItemId'];$raw=$store->project($p['id'],$owner);$referenceVersion=$base;$referenceVersion['id']=newId();$raw['creativeItems'][1]['versions']=array($referenceVersion);$store->save($raw,$owner);
 $p=$app->action(array('action'=>'select_item','id'=>$p['id'],'revision'=>$p['revision'],'itemId'=>$sourceItem))['project'];$p=$app->action(array('action'=>'attach_reference','id'=>$p['id'],'revision'=>$p['revision'],'itemId'=>$sourceItem,'targetItemId'=>$referenceItem,'versionId'=>$referenceVersion['id']))['project'];verifyRevision($p['goalApprovedAt']===null,'reference context invalidates goal without destroying official');
 $p=$app->action(revisionInput($app,$p,'discuss',array('text'=>'依引用重新調整名稱')))['project'];$v3=end($p['versions']);verifyRevision($model->data['pinnedReferences']===$p['references']&&$v3['referencesSnapshot']===$p['references'],'revision includes explicit current pinned references');verifyRevision($p['goalApprovedAt']===null,'legacy or invalidated approval does not block edit or fabricate approval');
 $p=$app->action(revisionInput($app,$p,'snapshot',array('items'=>$v3['items'])))['project'];verifyRevision(end($p['versions'])['source']==='snapshot','manual save with official does not require restarting goal');
 $p=$app->action(revisionInput($app,$p,'summarize'))['project'];$p=$app->action(revisionInput($app,$p,'approve_goal'))['project'];$p=$app->action(revisionInput($app,$p,'finalize'))['project'];$history=$p['finalizations'];$before=$model->calls;
 revisionReject(function()use($app,$p){$app->action(revisionInput($app,$p,'discuss',array('text'=>'不能自動解鎖')));},'PROJECT_FINALIZED');verifyRevision($model->calls===$before,'finalized item blocks call before inference');
 $p=$app->action(revisionInput($app,$p,'reopen'))['project'];$p=$app->action(revisionInput($app,$p,'discuss',array('text'=>'重新開啟後的修訂')))['project'];verifyRevision($p['finalizations']===$history&&end($p['versions'])['source']==='revision','explicit reopen resumes editing and keeps finalization history');
 $original=$store->project($p['id'],$owner);$before=$model->calls;
 $raw=$original;while(count($raw['creativeItems'][0]['versions'])<60){$copy=$base;$copy['id']=newId();$raw['creativeItems'][0]['versions'][]=$copy;}$store->save($raw,$owner);
 revisionReject(function()use($app,$p){$app->action(revisionInput($app,$p,'discuss',array('text'=>'容量檢查')));},'VERSION_LIMIT');verifyRevision($model->calls===$before,'60-version limit before inference');$store->save($original,$owner);
 $raw=$original;$budget=inferenceGrowthBudget($p,'discuss');$raw['padding']=str_repeat('x',max(0,2000000-$budget-strlen(jsonEncode($raw))+100));$store->save($raw,$owner);
 revisionReject(function()use($app,$p){$app->action(revisionInput($app,$p,'discuss',array('text'=>'容量檢查')));},'PROJECT_LIMIT');verifyRevision($model->calls===$before,'revision storage budget before inference');$store->save($original,$owner);
 echo 'TOTAL '.$checks." revision checks passed; no keys or network.\n";
}finally{removeRevisionFixture($dir);}
