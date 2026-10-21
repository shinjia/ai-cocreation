<?php
// Developer-only fixtures: synthetic secrets and injected transport. No network calls.
require_once dirname(__DIR__).'/app/bootstrap.php';
require_once __DIR__.'/phase1-helpers.php';
$passed=0;
function check($ok,$label){global $passed;if(!$ok)throw new Exception('FAIL: '.$label);$passed++;echo "PASS $label\n";}
function rejects($fn,$code){try{$fn();throw new Exception('Expected '.$code);}catch(AppError $e){check($e->errorCode===$code,'reject '.$code);}}
function cleanup($dir){if(!is_dir($dir))return;foreach(scandir($dir) as $f)if($f!=='.'&&$f!=='..'){is_dir($dir.'/'.$f)?cleanup($dir.'/'.$f):unlink($dir.'/'.$f);}rmdir($dir);}
function enableFixtureMembers($app){$s=$app->status();$app->action(array('action'=>'save_members','expectedSettingsRevision'=>$s['settingsRevision'],'members'=>$s['members'],'activeMemberId'=>$s['activeMemberId'],'usageConsent'=>true));}
function inputFor($app,$p,$action,$extra=array()) {return fixtureProjectInput($app,$p,$action,$extra);}
$dir=sys_get_temp_dir().'/cocreation-tests-'.bin2hex(random_bytes(6));mkdir($dir,0700,true);
try {
 $config=validateConfig(array('app_url'=>'http://localhost/studio/public/','data_dir'=>$dir,'openai_model'=>'fixture-model','model_timeout_ms'=>120000));
 check(keyEntryAllowed($config,array('REMOTE_ADDR'=>'127.0.0.1')),'loopback accepted');
 check(!keyEntryAllowed($config,array('REMOTE_ADDR'=>'192.168.1.4')),'LAN rejected');
 check(!keyEntryAllowed($config,array('REMOTE_ADDR'=>'127.0.0.1','HTTP_X_FORWARDED_HOST'=>'localhost')),'proxy rejected');
 rejects(function(){validateConfig(array('app_url'=>'https://example.com/','openai_model'=>'x','model_timeout_ms'=>120000));},'LOCAL_ONLY');
 rejects(function(){userTextValue('sk-'.str_repeat('x',40),200,'title');},'SECRET_IN_TEXT');
 $owner=str_repeat('a',64);$vault=new SessionKeyVault($dir);$vault->put($owner,'sk-'.str_repeat('x',30));
 check(strpos(jsonEncode($vault->status($owner)),'sk-')===false,'status never echoes key');
 $file=$dir.'/openai-session-keys/'.$owner.'.json';$record=json_decode(file_get_contents($file),true);$record['expires']=time()-1;file_put_contents($file,jsonEncode($record));
 rejects(function()use($vault,$owner){$vault->get($owner);},'API_KEY_REQUIRED');check(!file_exists($file),'expired key removed when checked');
 $vault->put($owner,'sk-'.str_repeat('x',30));$vault->clear($owner);check(!file_exists($file),'clear physically removes key');
 $calls=0;$invalid=false;$failure=false;$captured=null;
 $adapter=new OpenAIAdapter(function(){throw new Exception('Must never retrieve a real key');},120000,function($url,$payload)use(&$calls,&$invalid,&$failure,&$captured){
  $calls++;$captured=$payload;check($url==='https://api.openai.com/v1/responses','fixed API destination');
  if($failure)throw new AppError('MODEL_TIMEOUT','Synthetic timeout',502);
  if($invalid)return (object)array('status'=>'incomplete');
  $props=$payload['text']['format']['schema']['properties'];
  if(isset($props['question']))$out=array('reply'=>'我明白你希望引起好奇。','question'=>'你最希望讀者記住什麼？');
  elseif(isset($props['purpose']))$out=array('purpose'=>'活動命名','audience'=>'大學生','message'=>'試著表達','tone'=>'清楚且有趣','constraints'=>'不要過度宣傳','summary'=>'鼓勵大學生以有趣但清楚的名字參加創作活動。','items'=>array(array('id'=>'name','label'=>'中文名稱'),array('id'=>'hook','label'=>'開場提問')));
  elseif(isset($props['candidates'])){$data=json_decode($payload['input'][1]['content'],true);$candidates=array();foreach(array('把想法說出來','一個念頭的旅行','從一句話開始') as $i=>$title){$items=array();foreach($data['creativeGoal']['items'] as $def)$items[]=array('id'=>$def['id'],'label'=>$def['label'],'content'=>$title.' '.($i+1));$candidates[]=array('items'=>$items,'rationale'=>'明確的創作邀請。','goalText'=>'本版以清楚語句邀請同學參與。','changeSummary'=>'初次候選，整理已討論的活動邀請。');}$out=array('candidates'=>$candidates);}
  else {$data=json_decode($payload['input'][1]['content'],true);$items=array();foreach($data['selectedVersions'] as $v)$items[]=array('versionId'=>$v['id'],'fit'=>'符合清楚的目標。','strength'=>'容易理解。','tradeoff'=>'意象較少。','suggestion'=>'可再加一個具體詞。');$out=array('items'=>$items,'summary'=>'直接與意象各有取捨，請依你想邀請的讀者選擇。');}
  if(isset($props['choices']))$out['choices']=array();
  $out=fixtureExploringResponse($out,$props);
  return (object)array('status'=>'completed','model'=>'fixture-model-20261021','output'=>array((object)array('type'=>'message','content'=>array((object)array('type'=>'output_text','text'=>jsonEncode($out))))));
 });
 if(!extension_loaded('pdo_sqlite')){echo "SKIP: PHP PDO SQLite unavailable\n";exit(0);}
 $_SESSION=array('csrf'=>str_repeat('b',64));$store=new Store($dir);$app=new CocreationApp($store,$config,$owner,$adapter);
 $app->action(array('action'=>'set_key','key'=>'sk-'.str_repeat('x',30),'model'=>'fixture-model'));
 enableFixtureMembers($app);
 $p=$app->action(fixtureBoundNew($app,array('title'=>'專案A','description'=>'活動標題練習')))['project'];
 check($p['lifecycle']==='created'&&$p['officialVersionId']===null&&$p['description']==='活動標題練習','new project separate metadata and lifecycle');
 $q=$app->action(fixtureBoundNew($app,array('title'=>'專案B','description'=>'不同內容')))['project'];
 rejects(function()use($app,$p){$app->action(inputFor($app,$p,'generate'));},'GOAL_APPROVAL_REQUIRED');
 check($calls===0,'generation approval gate does not spend');
 $p=$app->action(inputFor($app,$p,'summarize'))['project'];check($calls===1&&$p['phase']==='summary','manual summary has no fixed turn gate');
 for($i=0;$i<3;$i++)$p=$app->action(inputFor($app,$p,'discuss',array('text'=>'我的方向'.$i)))['project'];
 check($p['lifecycle']==='in_progress'&&count($p['versions'])===0,'dialogue only; no premature candidates');
 $p=$app->action(inputFor($app,$p,'summarize'))['project'];check($p['phase']==='summary'&&$p['goalApprovedAt']===null,'summary unapproved');
 rejects(function()use($app,$p){$app->action(inputFor($app,$p,'generate'));},'GOAL_APPROVAL_REQUIRED');
 $p=$app->action(inputFor($app,$p,'approve_goal'))['project'];$request=inputFor($app,$p,'generate');$p=$app->action($request)['project'];
 $beforeCalls=$calls;$same=$app->action($request)['project'];check($calls===$beforeCalls&&count($same['versions'])===3,'idempotent generated request');
 check($p['title']==='專案A'&&$p['officialVersionId']===null,'generation preserves metadata and official remains unset');
 $first=$p['versions'][0];$p=$app->action(inputFor($app,$p,'promote',array('versionId'=>$first['id'])))['project'];check($calls===$beforeCalls,'promotion free');
 $p=$app->action(inputFor($app,$p,'generate'))['project'];check($p['officialVersionId']===$first['id']&&count($p['versions'])===6,'new candidate batch never replaces official');
 $p=$app->action(inputFor($app,$p,'snapshot',array('items'=>array(array('id'=>'name','label'=>'中文名稱','content'=>'自己改的名稱'),array('id'=>'custom','label'=>'行動邀請','content'=>'一起把念頭變成現實')),'rationale'=>'我想更直接。','basedOnVersionId'=>$first['id'])))['project'];
 check($p['versions'][0]===$first&&count($p['versions'])===7&&$p['versions'][6]['basedOnVersionId']===$first['id'],'immutable manual snapshot with lineage');
 $ids=array($first['id'],$p['versions'][6]['id']);$p=$app->action(inputFor($app,$p,'compare',array('versionIds'=>$ids)))['project'];
 check(count($p['comparisons'])===1&&$p['comparisons'][0]['versionIds']===$ids&&$p['officialVersionId']===$first['id'],'comparison stores references and does not select winner');
 check($app->project($q['id'])===$q,'project B unchanged');
 rejects(function()use($app,$p,$ids){$app->action(inputFor($app,$p,'compare',array('versionIds'=>array($ids[0],$ids[0]))));},'COMPARISON_SELECTION');
 rejects(function()use($app,$p){$app->action(inputFor($app,$p,'compare',array('versionIds'=>array($p['versions'][0]['id'],str_repeat('f',32)))));},'VERSION_NOT_FOUND');
 $before=$p;$failure=true;$failed=inputFor($app,$p,'discuss',array('text'=>'測試逾時'));rejects(function()use($app,$failed){$app->action($failed);},'MODEL_TIMEOUT');$failure=false;
 check($app->project($p['id'])===$before,'timeout preserves complete prior state');$beforeCalls=$calls;rejects(function()use($app,$failed){$app->action($failed);},'REQUEST_ALREADY_ATTEMPTED');check($calls===$beforeCalls,'uncertain call never retried');
 $p=$app->action(inputFor($app,$p,'finalize'))['project'];check($p['lifecycle']==='finalized'&&$p['finalizedVersionId']===$first['id']&&$p['finalizations'][0]['versionSnapshot']===$first,'explicit finalization snapshot');
 rejects(function()use($app,$p){$app->action(inputFor($app,$p,'generate'));},'PROJECT_FINALIZED');
 $p=$app->action(inputFor($app,$p,'reopen'))['project'];check($p['lifecycle']==='in_progress'&&count($p['versions'])===7&&count($p['finalizations'])===1,'reopen preserves finalization history');
 $p=$app->action(inputFor($app,$p,'edit_project',array('title'=>'重新命名專案','description'=>'新描述')))['project'];check($p['goalApprovedAt']===null&&$p['phase']==='discussion'&&$p['officialVersionId']===$first['id'],'description change requires reapproval and keeps official');
 rejects(function()use($app,$p){$app->action(inputFor($app,$p,'generate'));},'GOAL_APPROVAL_REQUIRED');
 $p=$app->action(inputFor($app,$p,'summarize'))['project'];check(empty($p['sharedContextChanged'])&&empty($p['activeItem']['sharedContextChanged']),'fresh summary clears context-change projection flags');
 check($p['versions'][0]['provenance']['actualModel']==='fixture-model-20261021','immutable actual-model provenance');
 $oldProvenance=$p['versions'][0]['provenance'];$app->action(array('action'=>'save_settings','provider'=>'ollama','model'=>'fixture-local','ollamaUrl'=>'http://127.0.0.1:11434'));check($app->project($p['id'])['versions'][0]['provenance']===$oldProvenance,'switch leaves historical model attribution unchanged');$app->action(array('action'=>'save_settings','provider'=>'openai','model'=>'fixture-model','ollamaUrl'=>'http://127.0.0.1:11434'));enableFixtureMembers($app);
 $sourceItem=$p['activeItemId'];$sourceVersion=$p['versions'][0];$p=$app->action(array('action'=>'create_item','id'=>$p['id'],'revision'=>$p['revision'],'type'=>'titles','title'=>'第二個命名項目','description'=>'引用第一項目'))['project'];$secondItem=$p['activeItemId'];
 check(count($p['creativeItems'])===2&&count($p['versions'])===0&&count($p['messages'])===1,'creative items have independent workspaces');
 $p=$app->action(array('action'=>'attach_reference','id'=>$p['id'],'revision'=>$p['revision'],'itemId'=>$secondItem,'targetItemId'=>$sourceItem,'versionId'=>$sourceVersion['id']))['project'];
 check($p['references'][0]['versionSnapshot']===$sourceVersion,'cross-item reference pins full version/provenance');$pinned=$p['references'][0];
 rejects(function()use($app,$p,$sourceItem){$app->action(inputFor($app,$p,'discuss',array('text'=>'wrong item','itemId'=>$sourceItem)));},'ACTIVE_ITEM_CHANGED');
 $p=$app->action(array('action'=>'select_item','id'=>$p['id'],'revision'=>$p['revision'],'itemId'=>$sourceItem))['project'];
 check(count($p['versions'])===7&&$p['references']===array(),'select restores exact item history without reference bleed');
 $p=$app->action(array('action'=>'select_item','id'=>$p['id'],'revision'=>$p['revision'],'itemId'=>$secondItem))['project'];check($p['references'][0]===$pinned,'reference unchanged after source selection');
 $p=$app->action(array('action'=>'create_item','id'=>$p['id'],'revision'=>$p['revision'],'type'=>'poster','title'=>'海報規劃','description'=>'尚未實作'))['project'];
 rejects(function()use($app,$p){$app->action(inputFor($app,$p,'discuss',array('text'=>'draw')));},'CAPABILITY_UNAVAILABLE');
 $p=$app->action(array('action'=>'archive_item','id'=>$p['id'],'revision'=>$p['revision'],'itemId'=>$p['activeItemId']))['project'];check($p['activeItem']['archived'],'placeholder archive is recoverable');
 $p=$app->action(array('action'=>'restore_item','id'=>$p['id'],'revision'=>$p['revision'],'itemId'=>$p['activeItemId']))['project'];check(!$p['activeItem']['archived'],'placeholder restored');
 $p=$app->action(array('action'=>'select_item','id'=>$p['id'],'revision'=>$p['revision'],'itemId'=>$sourceItem))['project'];
 $other=new CocreationApp($store,$config,str_repeat('c',64),$adapter);rejects(function()use($other,$p){$other->project($p['id']);},'PROJECT_NOT_FOUND');
 rejects(function()use($app,$p){$app->action(inputFor($app,$p,'discuss',array('text'=>'x','revision'=>0)));},'STALE_REVISION');
 rejects(function()use($app,$p){$app->action(inputFor($app,$p,'discuss',array('text'=>'x','consent'=>false)));},'CONSENT_REQUIRED');
 rejects(function()use($app,$p){$app->action(inputFor($app,$p,'discuss',array('text'=>'x','approvedModel'=>'other')));},'MODEL_CHANGED');
 $originalRaw=$store->project($p['id'],$owner);$beforeCapacityCalls=$calls;
 foreach(array('discuss','summarize','generate','compare') as $capacityAction){
  $raw=$originalRaw;$budget=inferenceGrowthBudget($app->project($p['id']),$capacityAction);
  $raw['capacityFixture']=str_repeat('x',max(0,2000000-$budget-strlen(jsonEncode($raw))+100));$store->save($raw,$owner);
  rejects(function()use($app,$p,$capacityAction){$app->action(inputFor($app,$p,$capacityAction,array('text'=>'capacity fixture')));},'PROJECT_LIMIT');
  check($calls===$beforeCapacityCalls,'capacity rejected before '.$capacityAction.' inference');$store->save($originalRaw,$owner);
 }
 $bound=inputFor($app,$p,'discuss',array('text'=>'x'));$app->action(array('action'=>'set_key','key'=>'sk-'.str_repeat('y',30),'model'=>'fixture-model'));
 rejects(function()use($app,$bound){$app->action($bound);},'KEY_CHANGED');$app->action(array('action'=>'clear_key'));
 rejects(function()use($app,$p){$app->action(inputFor($app,$p,'discuss',array('text'=>'x')));},'API_KEY_REQUIRED');
 check(strpos(jsonEncode($p),'sk-')===false,'export contains no secret');check($captured['store']===false&&$captured['text']['format']['strict']===true,'strict no-store output');
 $invalid=true;rejects(function()use($adapter){$adapter->generate('fixture-model',array(),array());},'MODEL_INCOMPLETE');
 foreach(array('http://192.168.1.2:11434','http://169.254.169.254:8080','http://localhost:11434/api','http://user@localhost:11434','https://localhost:11434','http://localhost:80') as $url)rejects(function()use($url){validateOllamaUrl($url);},'OLLAMA_URL');
 check(validateOllamaUrl('http://localhost:11434/')==='http://localhost:11434','loopback URL canonicalization');
 $localPayload=null;$local=new OllamaAdapter('http://127.0.0.1:11434',120000,function($url,$payload)use(&$localPayload){$localPayload=$payload;if($payload===null)return (object)array('models'=>array((object)array('name'=>'fixture-local:latest')));return (object)array('done'=>true,'done_reason'=>'stop','model'=>'fixture-local:latest','message'=>(object)array('content'=>'{"ok":true}'));});
 check($local->checkConnection('fixture-local')['ok'],'Ollama metadata-only check');check($localPayload===null,'connection check never infers');
 $value=$local->generate('fixture-local',array(array('role'=>'system','content'=>'fixture')),array('type'=>'object','properties'=>array('ok'=>array('type'=>'boolean'))));
 check($value->ok&&$local->actualModel()==='fixture-local:latest'&&isset($localPayload['format'])&&$localPayload['stream']===false,'Ollama schema and actual model');
 check(!isset($localPayload['key'])&&!isset($localPayload['Authorization']),'no OpenAI secret in Ollama request');
 rejects(function()use($local){$local->checkConnection('missing');},'OLLAMA_MODEL_MISSING');
 rejects(function(){validateContentItems(array(array('id'=>'a','label'=>'x','content'=>'text'),array('id'=>'a','label'=>'y','content'=>'more')));},'ITEMS_INVALID');
 check(validateContentItems(array(array('id'=>'custom','label'=>'自訂項目','content'=>'任意文字')))[0]['label']==='自訂項目','custom naming component preserved');
 echo "TOTAL $passed passed; no real network or credentials\n";
} finally {cleanup($dir);}
