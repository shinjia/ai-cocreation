<?php
// Developer-only PHP 7.4+ fixtures. No real key, network, inference or downloads.
// Run: php tests/members.php. Native execution must not be inferred from source checks.
require_once dirname(__DIR__).'/app/validation.php';
require_once dirname(__DIR__).'/app/members.php';
require_once dirname(__DIR__).'/app/store.php';
require_once dirname(__DIR__).'/app/model.php';
require_once dirname(__DIR__).'/app/ollama.php';
$memberChecks=0;
function verifyMember($ok,$label){global $memberChecks;if(!$ok)throw new Exception('FAIL: '.$label);$memberChecks++;echo 'PASS '.$label."\n";}
function rejectMember($fn,$code){try{$fn();throw new Exception('Expected '.$code);}catch(AppError $e){verifyMember($e->errorCode===$code,'reject '.$code);}}
function fixtureMember($id,$nickname,$enabled=true,$provider='openai') {return array('id'=>$id,'nickname'=>$nickname,'enabled'=>$enabled,'provider'=>$provider,'model'=>$provider==='openai'?'fixture-openai':'fixture-local:latest','ollamaUrl'=>'http://127.0.0.1:11434');}
function removeMemberFixture($dir){if(!is_dir($dir))return;foreach(scandir($dir) as $name)if($name!=='.'&&$name!=='..'){is_dir($dir.'/'.$name)?removeMemberFixture($dir.'/'.$name):unlink($dir.'/'.$name);}rmdir($dir);}

$a=fixtureMember(str_repeat('a',32),'小光');$b=fixtureMember(str_repeat('b',32),'小墨',true,'ollama');$off=fixtureMember(str_repeat('c',32),'休息中',false);
$validated=validateMemberRosterInput(array($a,$b,$off),$a['id'],true);
verifyMember($validated['members'][0]===$a&&$validated['activeMemberId']===$a['id'],'stable allowlisted member fields');
verifyMember(validateMemberRosterInput(array(),null,false)['members']===array(),'empty roster is explicitly supported');
verifyMember(validateMemberRosterInput(array($off),null,false)['activeMemberId']===null,'zero enabled members never gain an implicit selection');
verifyMember(validateMemberRosterInput(array($a),null,true)['activeMemberId']===null,'enabled member with explicit null selection remains unselected');
rejectMember(function()use($a){validateMemberRosterInput(array($a,$a),$a['id'],false);},'MEMBER_DUPLICATE');
$sameName=$b;$sameName['nickname']=' 小光 ';rejectMember(function()use($a,$sameName){validateMemberRosterInput(array($a,$sameName),$a['id'],true);},'MEMBER_DUPLICATE');
foreach(array('key','apiKey','api_key','credential','headers') as $extra){$bad=$a;$bad[$extra]='must-not-save';rejectMember(function()use($bad){validateMemberRosterInput(array($bad),$bad['id'],true);},'MEMBER_FIELDS_INVALID');}
$bad=$a;unset($bad['ollamaUrl']);$bad['key']='must-not-save';rejectMember(function()use($bad){validateMemberRosterInput(array($bad),$bad['id'],true);},'MEMBER_FIELDS_INVALID');
$bad=$a;$bad['enabled']=1;rejectMember(function()use($bad){validateMemberRosterInput(array($bad),$bad['id'],true);},'MEMBER_INVALID');
$bad=$a;$bad['id']='not-an-id';rejectMember(function()use($bad){validateMemberRosterInput(array($bad),null,true);},'MEMBER_INVALID');
$bad=$a;$bad['nickname']=str_repeat('字',41);rejectMember(function()use($bad){validateMemberRosterInput(array($bad),$bad['id'],true);},'INVALID_INPUT');
$bad=$a;$bad['provider']='unknown';rejectMember(function()use($bad){validateMemberRosterInput(array($bad),$bad['id'],true);},'INVALID_PROVIDER');
$bad=$b;$bad['ollamaUrl']='http://example.invalid:11434';rejectMember(function()use($bad){validateMemberRosterInput(array($bad),$bad['id'],true);},'OLLAMA_URL');
$bad=$b;$bad['model']='../../model';rejectMember(function()use($bad){validateMemberRosterInput(array($bad),$bad['id'],true);},'INVALID_MODEL');
rejectMember(function()use($a){validateMemberRosterInput(array($a),$a['id'],'true');},'CONSENT_REQUIRED');
rejectMember(function()use($a){validateMemberRosterInput(array($a),str_repeat('d',32),false);},'MEMBER_NOT_FOUND');
rejectMember(function()use($off){validateMemberRosterInput(array($off),$off['id'],false);},'MEMBER_DISABLED');
rejectMember(function()use($a){validateMemberRosterInput(array_fill(0,21,$a),null,false);},'MEMBERS_INVALID');
rejectMember(function()use($a){validateMemberRosterInput(array('named'=>$a),null,false);},'MEMBERS_INVALID');

$keyReads=0;$openaiCalls=array();$openaiData=(object)array('data'=>array((object)array('id'=>'fixture-z'),(object)array('id'=>'fixture-a'),(object)array('id'=>'fixture-a')));
$openai=new OpenAIAdapter(function()use(&$keyReads){$keyReads++;throw new Exception('Metadata fixture must not retrieve a key');},120000,function($url,$payload)use(&$openaiCalls,&$openaiData){$openaiCalls[]=array($url,$payload);return $openaiData;});
$listed=$openai->listModels();verifyMember($listed['models']===array('fixture-a','fixture-z')&&$listed['provider']==='openai'&&is_string($listed['fetchedAt']),'OpenAI lists validated distinct metadata IDs only');
verifyMember($keyReads===0&&$openaiCalls===array(array('https://api.openai.com/v1/models',null)),'OpenAI listing is fixed metadata GET fixture, with no key lookup or Responses payload');
verifyMember(strpos($listed['message'],'不代表')!==false&&strpos($listed['message'],'Responses')!==false,'OpenAI listing states compatibility is not guaranteed');
$openaiData=(object)array('data'=>array());verifyMember($openai->listModels()['models']===array(),'empty OpenAI inventory stays empty');
foreach(array((object)array(),(object)array('data'=>array((object)array('id'=>' invalid '))),(object)array('data'=>array_fill(0,1001,(object)array('id'=>'fixture')))) as $bad){$openaiData=$bad;rejectMember(function()use($openai){$openai->listModels();},'MODEL_CATALOG_INVALID');}
$openaiData=(object)array('id'=>'fixture-a');verifyMember($openai->checkConnection('fixture-a')['ok']===true&&$keyReads===0,'connection metadata fixture retains key-free constructor injection');
verifyMember(end($openaiCalls)===array('https://api.openai.com/v1/models/fixture-a',null),'connection inspection uses model metadata endpoint only');

$ollamaCalls=array();$ollamaData=(object)array('models'=>array((object)array('name'=>'fixture-local:latest'),(object)array('name'=>'team/fixture:1')));
$ollama=new OllamaAdapter('http://localhost:11434',120000,function($url,$payload)use(&$ollamaCalls,&$ollamaData){$ollamaCalls[]=array($url,$payload);return $ollamaData;});
$listed=$ollama->listModels();verifyMember($listed['models']===array('fixture-local:latest','team/fixture:1')&&$listed['provider']==='ollama','Ollama lists only reported installed names');
verifyMember($ollamaCalls===array(array('http://localhost:11434/api/tags',null)),'Ollama inventory makes tags metadata request only');
verifyMember($ollama->checkConnection('fixture-local')['ok']===true,'Ollama connection check preserves latest alias handling');
rejectMember(function()use($ollama){$ollama->checkConnection('absent');},'OLLAMA_MODEL_MISSING');
verifyMember(strpos($listed['message'],'不保證')!==false,'Ollama compatibility warning is present');
$ollamaData=(object)array('models'=>array());verifyMember($ollama->listModels()['models']===array(),'empty Ollama inventory stays empty without defaults or download');
foreach(array((object)array(),(object)array('models'=>array((object)array('name'=>'../bad'))),(object)array('models'=>array_fill(0,1001,(object)array('name'=>'fixture:latest')))) as $bad){$ollamaData=$bad;rejectMember(function()use($ollama){$ollama->listModels();},'OLLAMA_TAGS_INVALID');}
rejectMember(function(){new OllamaAdapter('https://example.invalid:11434');},'OLLAMA_URL');

if(!extension_loaded('pdo_sqlite')){
    echo "NOT RUN: Store integration fixtures require PHP PDO SQLite. Validation and injected metadata checks above are independent.\n";
}else{
    $dir=sys_get_temp_dir().'/cocreation-members-'.bin2hex(random_bytes(6));mkdir($dir,0700,true);
    try{
        $store=new Store($dir);$ownerA=str_repeat('1',64);$ownerB=str_repeat('2',64);
        $legacy=$store->setConnection(array('provider'=>'ollama','model'=>'legacy-fixture:1','ollamaUrl'=>'http://localhost:11434'),$ownerA);
        $migrated=$store->memberRoster('default-fixture',$ownerA);$member=$migrated['members'][0];
        verifyMember(count($migrated['members'])===1&&$member['nickname']==='原有設定'&&$member['enabled']===true&&$member['model']==='legacy-fixture:1'&&$member['provider']==='ollama','existing connection migrates without changing its service or model');
        verifyMember($migrated['usageConsent']===false&&$migrated['consentAt']===null&&$migrated['activeMemberId']===$member['id'],'migration never invents consent');
        verifyMember($member['id']===substr(hash('sha256','member-migration-v1:'.$ownerA),0,32)&&preg_match('/^[a-f0-9]{64}$/D',$migrated['settingsRevision']),'migration IDs and revision are deterministic valid identifiers');
        verifyMember($store->connection('default-fixture',$ownerA)===$legacy,'legacy connection remains unchanged for compatibility');
        $reopened=new Store($dir);verifyMember($reopened->memberRoster('other-default',$ownerA)===$migrated,'first-read migration is persisted and stable across reopen/default changes');
        $other=$store->memberRoster('default-fixture',$ownerB);verifyMember($other['members'][0]['id']!==$member['id']&&$other['members'][0]['provider']==='openai','rosters and migration identifiers are owner scoped');
        verifyMember($store->modelCatalog($ownerA)===array('openai'=>array(),'ollama'=>array()),'recent model history has no invented model inventory');
        $saved=$store->setMemberRoster(array($a,$b,$off),$a['id'],true,$ownerA);
        verifyMember($saved['usageConsent']===true&&is_string($saved['consentAt'])&&$saved['settingsRevision']!==$migrated['settingsRevision'],'explicit save records consent and new settings revision');
        verifyMember($store->memberRoster('default-fixture',$ownerA)===$saved,'validated roster reloads exactly');
        $selected=$store->selectMember($b['id'],'default-fixture',$ownerA);
        verifyMember($selected['activeMemberId']===$b['id']&&$selected['members']===$saved['members']&&$selected['usageConsent']===$saved['usageConsent']&&$selected['consentAt']===$saved['consentAt']&&$selected['settingsRevision']!==$saved['settingsRevision'],'selection changes only active ID and revision, preserving consent time');
        rejectMember(function()use($store,$off,$ownerA){$store->selectMember($off['id'],'default-fixture',$ownerA);},'MEMBER_DISABLED');
        rejectMember(function()use($store,$ownerA){$store->selectMember(str_repeat('d',32),'default-fixture',$ownerA);},'MEMBER_NOT_FOUND');
        verifyMember($store->memberRoster('default-fixture',$ownerA)===$selected,'invalid selection does not silently switch or mutate the roster');
        rejectMember(function()use($store,$a,$ownerA,$saved){$store->setMemberRoster(array($a),$a['id'],true,$ownerA,$saved['settingsRevision']);},'SETTINGS_CHANGED');
        rejectMember(function()use($store,$a,$ownerA,$saved){$store->selectMember($a['id'],'default-fixture',$ownerA,$saved['settingsRevision']);},'SETTINGS_CHANGED');
        verifyMember($store->memberRoster('default-fixture',$ownerA)===$selected,'stale save and stale selection never overwrite newer settings');
        $unselected=$store->selectMember(null,'default-fixture',$ownerA,$selected['settingsRevision']);
        verifyMember($unselected['activeMemberId']===null&&$unselected['members']===$selected['members']&&$unselected['usageConsent']===$selected['usageConsent'],'explicit null selection clears active member without fallback or losing consent');
        $bad=$a;$bad['apiKey']='must-not-save';rejectMember(function()use($store,$bad,$ownerA){$store->setMemberRoster(array($bad),$bad['id'],true,$ownerA);},'MEMBER_FIELDS_INVALID');
        $raw=$store->db->query('SELECT value FROM settings')->fetchAll(PDO::FETCH_COLUMN);verifyMember(strpos(implode('', $raw),'must-not-save')===false,'unapproved credential field is never persisted');
        $cleared=$store->setMemberRoster(array(),null,false,$ownerA);verifyMember($store->memberRoster('default-fixture',$ownerA)===$cleared&&$cleared['members']===array()&&$cleared['activeMemberId']===null&&$cleared['consentAt']===null,'explicit empty roster is retained, never remigrated or auto-selected');
        verifyMember($store->memberRoster('default-fixture',$ownerB)===$other,'owner B is unaffected by owner A saves and selection');
    }finally{$store=null;$reopened=null;removeMemberFixture($dir);}
}
echo 'PASS '.$memberChecks." member and metadata fixture assertions; only explicitly printed checks were run.\n";
