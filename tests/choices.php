<?php
/**
 * Native PHP 7.4+ choice-button integration fixtures for real CocreationApp and
 * TitleModule. Preparation status: UNEXECUTED here because PHP is unavailable.
 * Run explicitly: php tests/choices.php
 * No API credentials, HTTP, external model, PDO, SQLite or user data. Only a
 * temporary empty vault and lock files are created by the real SessionKeyVault.
 * The in-memory Store is a persistence seam, not alternate application logic.
 */
require_once dirname(__DIR__).'/app/bootstrap.php';

$choiceChecks=0;
function choiceCheck($ok,$label) {
    global $choiceChecks;
    if(!$ok)throw new RuntimeException('FAIL: '.$label);
    $choiceChecks++;echo 'PASS '.$label."\n";
}
function choiceCleanup($dir) {
    if(!is_dir($dir))return;
    foreach(scandir($dir) as $name)if($name!=='.'&&$name!=='..') {
        $path=$dir.'/'.$name;if(is_dir($path))choiceCleanup($path);else unlink($path);
    }
    rmdir($dir);
}
function choiceInput($app,$project,$extra=array()) {
    $status=$app->status();
    return array_merge(array('action'=>'discuss','id'=>$project['id'],'itemId'=>$project['activeItemId'],
        'revision'=>$project['revision'],'consent'=>true,'approvedMemberId'=>$status['memberId'],
        'approvedProvider'=>$status['provider'],'approvedSettingsRevision'=>$status['settingsRevision'],
        'approvedModel'=>$status['model'],'requestId'=>newId()),$extra);
}
function choiceLast($values) {return $values[count($values)-1];}
function choiceList() {
    return array(array('id'=>'warm','label'=>'溫暖親切','value'=>'我希望語氣溫暖親切。'),
        array('id'=>'direct','label'=>'簡潔直接','value'=>'我希望語氣簡潔直接。'));
}
function choiceAnswerInput($app,$project,$question,$index=0,$extra=array()) {
    $choice=$question['choices'][$index];
    return choiceInput($app,$project,array_merge(array('text'=>$choice['value'],
        'choiceAnswer'=>array('questionMessageId'=>$question['id'],'choiceId'=>$choice['id'])),$extra));
}
function choiceRejectWithoutCall($app,$model,$input,$code,$label) {
    $before=$app->project($input['id']);$calls=$model->calls;$caught=null;
    try {$app->action($input);}catch(AppError $error){$caught=$error;}
    choiceCheck($caught instanceof AppError&&$caught->errorCode===$code,$label.': rejects '.$code);
    choiceCheck($model->calls===$calls,$label.': no provider call or retry');
    choiceCheck($app->project($input['id'])===$before,$label.': no dialogue version or context mutation');
    choiceCheck(errorResponse($caught)['error']['operationOutcome']==='rejected',$label.': explicit rejected outcome');
}
function choiceNewQuestion($app,$title) {
    $project=$app->action(array('action'=>'new','title'=>$title))['project'];
    return $app->action(choiceInput($app,$project,array('text'=>'希望名稱更好理解。')))['project'];
}
function choiceRawItemIndex($raw) {
    foreach($raw['creativeItems'] as $index=>$item)if($item['id']===$raw['activeItemId'])return $index;
    throw new RuntimeException('Fixture item missing.');
}

class ChoiceMemoryStore {
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
                'activeMemberId'=>$id,'settingsRevision'=>hash('sha256',$owner.'choice-roster'),
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


class ChoiceFixtureAdapter {
    public $calls=0;public $data=null;public $schema=null;public $mode='choices';public $models=array();
    public function actualModel() {return 'fixture-choice-resolved-v1';}
    public function generate($model,$messages,$schema) {
        $this->calls++;$this->models[]=$model;$this->schema=$schema;
        $this->data=json_decode($messages[1]['content'],true,128,JSON_THROW_ON_ERROR);
        $choices=$this->mode==='free_text'?array():choiceList();
        if(isset($schema['properties']['outcome'])) {
            $out=array('outcome'=>'clarification','reply'=>'可以先確認希望呈現的語氣。',
                'question'=>'你希望採用哪一種語氣？','choices'=>$choices,'items'=>array(),
                'rationale'=>'','goalText'=>'','changeSummary'=>'');
            if($this->mode==='revision') {
                $official=$this->data['officialVersion'];$items=$official['items'];$items[0]['content']='更親切的新名稱';
                $out=array('outcome'=>'revision','reply'=>'已準備一份待審閱的修訂。','question'=>'','choices'=>array(),
                    'items'=>$items,'rationale'=>'只調整名稱，其餘內容原文保留。',
                    'goalText'=>versionGoalText($official),'changeSummary'=>'讓中文名稱更親切。');
            }
        }else{
            $out=array('reply'=>'我理解你希望讀者更容易掌握方向。',
                'question'=>'你希望採用哪一種語氣？','choices'=>$choices);
        }
        return json_decode(jsonEncode($out),false,128,JSON_THROW_ON_ERROR);
    }
}

$dir=sys_get_temp_dir().'/cocreation-choices-'.bin2hex(random_bytes(6));mkdir($dir,0700,true);
try {
    $_SESSION=array('csrf'=>str_repeat('b',64));$owner=str_repeat('a',64);
    $config=validateConfig(array('app_url'=>'http://localhost/studio/public/','data_dir'=>$dir,
        'openai_model'=>'fixture-choice-local','model_timeout_ms'=>120000));
    $store=new ChoiceMemoryStore();$model=new ChoiceFixtureAdapter();$app=new CocreationApp($store,$config,$owner,$model);
    choiceCheck(!$app->status()['keyPresent'],'fixture uses no credential');

    $project=choiceNewQuestion($app,'初次選擇問答');$question=choiceLast($project['messages']);
    choiceCheck($model->calls===1&&$question['role']==='assistant'&&$question['kind']==='discussion','initial question uses one call on existing discuss path');
    choiceCheck($question['question']==='你希望採用哪一種語氣？'&&$question['choices']===choiceList(),'question and structured options are persisted exactly');
    choiceCheck($question['choiceContext']===array('itemId'=>$project['activeItemId'],'officialVersionId'=>null,'sharedContextRevision'=>$project['sharedContextRevision'],'itemTitle'=>$project['activeItem']['title'],'itemDescription'=>$project['activeItem']['description']),'initial question is bound to exact active item official and shared context');
    choiceCheck(strpos($question['text'],$question['question'])!==false&&$project['versions']===array(),'combined readable text remains and choices do not create versions');
    $input=choiceAnswerInput($app,$project,$question);$beforeMessages=$project['messages'];$calls=$model->calls;
    $project=$app->action($input)['project'];$answer=$project['messages'][count($project['messages'])-2];$next=choiceLast($project['messages']);
    choiceCheck($model->calls===$calls+1&&count($project['messages'])===count($beforeMessages)+2,'one explicit answer creates one user entry and one reply with exactly one call');
    choiceCheck($answer['text']===$question['choices'][0]['value']&&$answer['kind']==='discussion'&&in_array($answer['role'],array('user','student'),true),'selected value becomes an ordinary user discussion turn');
    choiceCheck($answer['choiceAnswer']===array('questionMessageId'=>$question['id'],'choiceId'=>'warm','label'=>'溫暖親切','value'=>'我希望語氣溫暖親切。'),'answer records question linkage and server-resolved label and value');
    choiceCheck($model->data['latestUserMessage']===$question['choices'][0]['value'],'selected value is dispatched as latestUserMessage');
    $outboundQuestion=choiceLast($model->data['dialogue']);
    choiceCheck($outboundQuestion['id']===$question['id']&&$outboundQuestion['question']===$question['question']&&$outboundQuestion['choices']===$question['choices'],'model receives original structured question rather than a guessed interpretation');
    choiceCheck($next['id']!==$question['id']&&$next['provenance']['memberId']===$app->status()['memberId']&&$next['provenance']['actualModel']==='fixture-choice-resolved-v1','new answer reply has unique identity and current member/provider provenance');
    choiceCheck(array_slice($project['messages'],0,count($beforeMessages))===$beforeMessages,'answer never rewrites original question or earlier dialogue');
    $calls=$model->calls;$replayed=$app->action($input)['project'];
    choiceCheck($model->calls===$calls&&$replayed===$project,'repeated request id returns saved project without a second inference');
    choiceRejectWithoutCall($app,$model,choiceAnswerInput($app,$project,$question),'CHOICE_STALE','already answered older question');
    $project=$app->action(choiceInput($app,$project,array('text'=>'也請保留容易理解的用詞。')))['project'];
    $outboundAnswer=null;foreach($model->data['dialogue'] as $entry)if($entry['id']===$answer['id'])$outboundAnswer=$entry;
    choiceCheck($outboundAnswer!==null&&$outboundAnswer['role']==='user'&&$outboundAnswer['choiceAnswer']===$answer['choiceAnswer'],'later model context preserves resolved choice linkage and maps legacy user role only outbound');

    // Invalid input has a new request id each time, avoiding journal conflicts.
    $project=choiceNewQuestion($app,'選擇輸入驗證');$question=choiceLast($project['messages']);
    $answerShape=array('questionMessageId'=>$question['id'],'choiceId'=>'warm');
    $badAnswers=array('null'=>null,'boolean'=>true,'string'=>'warm','empty array'=>array(),
        'missing question id'=>array('choiceId'=>'warm'),'missing choice id'=>array('questionMessageId'=>$question['id']),
        'client supplied label'=>array_merge($answerShape,array('label'=>'偽造文字')),
        'client supplied value'=>array_merge($answerShape,array('value'=>'偽造回答')),
        'nonstring question id'=>array('questionMessageId'=>3,'choiceId'=>'warm'),
        'malformed question id'=>array('questionMessageId'=>'not-an-id','choiceId'=>'warm'),
        'nonstring choice id'=>array('questionMessageId'=>$question['id'],'choiceId'=>array()),
        'invalid choice id'=>array('questionMessageId'=>$question['id'],'choiceId'=>'not an id'));
    foreach($badAnswers as $label=>$bad)choiceRejectWithoutCall($app,$model,choiceAnswerInput($app,$project,$question,0,array('choiceAnswer'=>$bad)),'CHOICE_INVALID',$label);
    choiceRejectWithoutCall($app,$model,choiceAnswerInput($app,$project,$question,0,array('text'=>'不是選項原文')),'CHOICE_INVALID','value mismatch');
    choiceRejectWithoutCall($app,$model,choiceAnswerInput($app,$project,$question,0,array('text'=>' '.$question['choices'][0]['value'].' ')),'CHOICE_INVALID','whitespace-modified value is not the exact stored value');
    choiceRejectWithoutCall($app,$model,choiceAnswerInput($app,$project,$question,0,array('choiceAnswer'=>array('questionMessageId'=>$question['id'],'choiceId'=>'forged'))),'CHOICE_INVALID','forged option id');
    choiceRejectWithoutCall($app,$model,choiceAnswerInput($app,$project,$question,0,array('choiceAnswer'=>array('questionMessageId'=>str_repeat('f',32),'choiceId'=>'warm'))),'CHOICE_STALE','forged question id');
    choiceRejectWithoutCall($app,$model,choiceAnswerInput($app,$project,$question,0,array('revision'=>$project['revision']-1)),'STALE_REVISION','existing revision guard');

    // Free-text remains possible even when the most recent question has buttons.
    $calls=$model->calls;$project=$app->action(choiceInput($app,$project,array('text'=>'我想用自己的話補充。')))['project'];
    $answer=$project['messages'][count($project['messages'])-2];
    choiceCheck($model->calls===$calls+1&&!array_key_exists('choiceAnswer',$answer),'ordinary typed answers do not acquire fabricated choice provenance');
    choiceRejectWithoutCall($app,$model,choiceAnswerInput($app,$project,$question),'CHOICE_STALE','free-text answer invalidates old choices');
    $model->mode='free_text';$project=choiceNewQuestion($app,'沒有選擇項目');$question=choiceLast($project['messages']);
    choiceCheck($question['choices']===array()&&is_string($question['question']),'empty choice array remains a free-text question');
    choiceRejectWithoutCall($app,$model,choiceInput($app,$project,array('text'=>'我希望語氣溫暖親切。','choiceAnswer'=>array('questionMessageId'=>$question['id'],'choiceId'=>'warm'))),'CHOICE_STALE','free-text question cannot be forged into choices');$model->mode='choices';

    // Shared-context change can leave the exact same last message in place.
    $project=choiceNewQuestion($app,'舊共同脈絡');$question=choiceLast($project['messages']);
    $project=$app->action(array('action'=>'edit_project','id'=>$project['id'],'revision'=>$project['revision'],
        'title'=>'新共同脈絡','description'=>'已更改說明'))['project'];
    choiceCheck(choiceLast($project['messages'])['id']===$question['id'],'shared-context fixture retains last question to isolate context check');
    choiceRejectWithoutCall($app,$model,choiceAnswerInput($app,$project,$question),'CHOICE_STALE','changed shared project context');

    foreach(array('title','description') as $field) {
        $project=choiceNewQuestion($app,'修改項目 '.$field);$question=choiceLast($project['messages']);
        $edit=array('action'=>'edit_item','id'=>$project['id'],'itemId'=>$project['activeItemId'],'revision'=>$project['revision'],
            'title'=>$project['activeItem']['title'],'description'=>$project['activeItem']['description']);
        $edit[$field]='本次修改的項目脈絡';$project=$app->action($edit)['project'];
        choiceCheck(choiceLast($project['messages'])['id']===$question['id'],'item '.$field.' edit leaves last question intact');
        choiceRejectWithoutCall($app,$model,choiceAnswerInput($app,$project,$question),'CHOICE_STALE','changed item '.$field);
    }

    $project=choiceNewQuestion($app,'項目切換');$question=choiceLast($project['messages']);$oldItem=$project['activeItemId'];
    $project=$app->action(array('action'=>'create_item','id'=>$project['id'],'revision'=>$project['revision'],'type'=>'titles','title'=>'另一項目'))['project'];
    choiceRejectWithoutCall($app,$model,choiceAnswerInput($app,$project,$question,0,array('itemId'=>$oldItem)),'ACTIVE_ITEM_CHANGED','old active-item request');
    choiceRejectWithoutCall($app,$model,choiceAnswerInput($app,$project,$question),'CHOICE_STALE','cross-item question id');

    // A malformed or migrated stored question cannot grant authority. Each case
    // restores the same fixture state and changes only the persisted target.
    $project=choiceNewQuestion($app,'儲存問題驗證');$question=choiceLast($project['messages']);$baseline=$store->project($project['id'],$owner);
    $index=choiceRawItemIndex($baseline);$last=count($baseline['creativeItems'][$index]['messages'])-1;
    $mutations=array(
        'student role'=>function(&$q){$q['role']='student';},
        'system role'=>function(&$q){$q['role']='system';},
        'revision kind'=>function(&$q){$q['kind']='revision';},
        'missing context'=>function(&$q){unset($q['choiceContext']);},
        'extra context field'=>function(&$q){$q['choiceContext']['unexpected']='no';},
        'wrong context item'=>function(&$q){$q['choiceContext']['itemId']=str_repeat('e',32);},
        'wrong context official'=>function(&$q){$q['choiceContext']['officialVersionId']=str_repeat('e',32);},
        'wrong context revision'=>function(&$q){$q['choiceContext']['sharedContextRevision']++;},
        'string context revision'=>function(&$q){$q['choiceContext']['sharedContextRevision']=(string)$q['choiceContext']['sharedContextRevision'];},
        'missing context title'=>function(&$q){unset($q['choiceContext']['itemTitle']);},
        'missing context description'=>function(&$q){unset($q['choiceContext']['itemDescription']);},
        'wrong context title'=>function(&$q){$q['choiceContext']['itemTitle']='已改變的標題';},
        'wrong context description'=>function(&$q){$q['choiceContext']['itemDescription']='已改變的說明';},
        'empty stored question'=>function(&$q){$q['question']='';},
        'missing choices'=>function(&$q){unset($q['choices']);},
        'duplicate stored choice'=>function(&$q){$q['choices'][1]=$q['choices'][0];},
        'unknown stored choice field'=>function(&$q){$q['choices'][0]['extra']='no';}
    );
    foreach($mutations as $label=>$mutate) {
        $raw=$baseline;$mutate($raw['creativeItems'][$index]['messages'][$last]);$store->save($raw,$owner);$current=$app->project($project['id']);
        choiceRejectWithoutCall($app,$model,choiceAnswerInput($app,$current,$question),'CHOICE_STALE',$label);
    }
    $store->save($baseline,$owner);
    $raw=$baseline;$raw['creativeItems'][$index]['messages'][]=array('id'=>newId(),'role'=>'system','text'=>'後續系統紀錄','kind'=>'notice','at'=>nowIso());$store->save($raw,$owner);$project=$app->project($project['id']);
    choiceRejectWithoutCall($app,$model,choiceAnswerInput($app,$project,$question),'CHOICE_STALE','only the last project message is eligible');

    // Switching the selected AI member is not a change to the artwork context.
    $project=choiceNewQuestion($app,'成員切換仍可回答');$question=choiceLast($project['messages']);$oldMember=$app->status()['memberId'];
    $status=$app->status();$members=$status['members'];$newMember=str_repeat('c',32);
    $members[]=array('id'=>$newMember,'nickname'=>'另一位測試夥伴','enabled'=>true,'provider'=>'ollama',
        'model'=>'fixture-other-local','ollamaUrl'=>'http://127.0.0.1:11434');
    $app->action(array('action'=>'save_members','expectedSettingsRevision'=>$status['settingsRevision'],
        'members'=>$members,'activeMemberId'=>$oldMember,'usageConsent'=>true));
    $status=$app->status();$app->action(array('action'=>'select_member','expectedSettingsRevision'=>$status['settingsRevision'],'memberId'=>$newMember));
    $calls=$model->calls;$project=$app->action(choiceAnswerInput($app,$project,$question,1))['project'];$reply=choiceLast($project['messages']);
    choiceCheck($model->calls===$calls+1&&$reply['provenance']['memberId']===$newMember&&$reply['provenance']['requestedModel']==='fixture-other-local','answer uses explicitly selected current member and exactly one inference');
    choiceCheck($question['provenance']['memberId']===$oldMember&&$project['messages'][count($project['messages'])-3]===$question,'switching member preserves source question provenance and immutable history');

    // Seed a complete official snapshot without extra model calls. Refinement
    // clarification choices must not fabricate a version, promotion or goal edit.
    $project=$app->action(array('action'=>'new','title'=>'正式版選擇釐清'))['project'];$raw=$store->project($project['id'],$owner);$index=choiceRawItemIndex($raw);
    $official=array('id'=>newId(),'number'=>1,'major'=>1,'minor'=>0,'title'=>'日常的光','source'=>'snapshot',
        'items'=>array(array('id'=>'name','label'=>'中文名稱','content'=>'日常的光'),array('id'=>'custom','label'=>'自訂邀請語','content'=>'一起發現日常。')),
        'rationale'=>'原始創作方向。','goalText'=>'邀請一般觀眾發現日常故事。','goalSnapshot'=>array('summary'=>'邀請一般觀眾發現日常故事。'),
        'changeSummary'=>'原始版本。','basedOnVersionId'=>null,'provenance'=>null,'createdAt'=>nowIso());
    $raw['creativeItems'][$index]['versions']=array($official);$raw['creativeItems'][$index]['officialVersionId']=$official['id'];$store->save($raw,$owner);$project=$app->project($project['id']);
    $beforeVersions=$project['versions'];$approval=$project['goalApprovedAt'];$calls=$model->calls;
    $project=$app->action(choiceInput($app,$project,array('text'=>'下一步可以先討論哪裡？')))['project'];$question=choiceLast($project['messages']);
    choiceCheck($model->calls===$calls+1&&$question['kind']==='clarification'&&$question['choices']===choiceList(),'official refinement returns clickable clarification with exactly one call');
    choiceCheck($project['versions']===$beforeVersions&&$project['officialVersionId']===$official['id']&&$project['goalApprovedAt']===$approval,'clarification changes neither versions official selection nor goal approval');
    choiceCheck($question['choiceContext']['officialVersionId']===$official['id']&&!array_key_exists('versionIds',$question),'clarification is bound to its official baseline and creates no revision link');
    $calls=$model->calls;$project=$app->action(choiceAnswerInput($app,$project,$question))['project'];$next=choiceLast($project['messages']);
    choiceCheck($model->calls===$calls+1&&$next['kind']==='clarification'&&$project['versions']===$beforeVersions,'answering refinement choices stays clarification when no edit is proposed');
    $question=$next;$original=$store->project($project['id'],$owner);$raw=$original;$index=choiceRawItemIndex($raw);
    $alternate=$official;$alternate['id']=newId();$alternate['number']=2;$alternate['major']=2;$alternate['title']='另一版本';$alternate['items'][0]['content']='另一版本';
    $raw['creativeItems'][$index]['versions'][]=$alternate;$raw['creativeItems'][$index]['officialVersionId']=$alternate['id'];$store->save($raw,$owner);$current=$app->project($project['id']);
    choiceRejectWithoutCall($app,$model,choiceAnswerInput($app,$current,$question),'CHOICE_STALE','changed official version with last question intact');
    $store->save($original,$owner);$project=$app->project($project['id']);$model->mode='revision';$calls=$model->calls;
    $result=$app->action(choiceAnswerInput($app,$project,$question));$project=$result['project'];$revision=choiceLast($project['versions']);$reply=choiceLast($project['messages']);
    choiceCheck($model->calls===$calls+1&&count($project['versions'])===count($beforeVersions)+1&&$revision['id']===$result['revisionVersionId'],'choice answer can produce a genuine revision in the same existing call');
    choiceCheck($reply['kind']==='revision'&&$reply['question']===''&&$reply['choices']===array()&&$project['officialVersionId']===$official['id'],'revision carries no unanswered buttons and never auto-promotes');
    choiceCheck($revision['items'][1]===$official['items'][1]&&$revision['basedOnVersionId']===$official['id'],'revision preserves complete custom bundle and official lineage');
    choiceCheck(glob($dir.'/openai-session-keys/*.json')===array(),'no credential files created');
    echo 'TOTAL '.$choiceChecks." choice integration checks passed; injected model and memory Store only.\n";
}finally{choiceCleanup($dir);}
