<?php
// Standalone PHP 7.4+ fixture: php tests/response-contract.php
// Real provider adapters and TitleModule; constructor-injected transport only.
// No real credentials, network, PDO, database, session or production config.
// A lexer check does NOT execute this fixture or establish PHP runtime success.
require_once dirname(__DIR__).'/app/validation.php';
require_once dirname(__DIR__).'/app/versioning.php';
require_once dirname(__DIR__).'/app/model.php';
require_once dirname(__DIR__).'/app/ollama.php';
require_once dirname(__DIR__).'/app/artifacts.php';
require_once dirname(__DIR__).'/app/content.php';
require_once dirname(__DIR__).'/app/modules/titles.php';
require_once __DIR__.'/phase1-helpers.php';

$contractChecks=0;
$contractAttempts=0;

function contractCheck($condition,$label) {
    global $contractChecks;
    if(!$condition)throw new RuntimeException('FAIL: '.$label);
    $contractChecks++;
    echo 'PASS '.$label."\n";
}

function contractFixture() {
    $official=array(
        'id'=>str_repeat('a',32),'number'=>1,'major'=>1,'minor'=>0,
        'title'=>'日常的光','source'=>'snapshot',
        'items'=>array(
            array('id'=>'name','label'=>'中文名稱','content'=>'日常的光'),
            array('id'=>'english','label'=>'英文名稱','content'=>'Everyday Light'),
            array('id'=>'slogan','label'=>'Slogan','content'=>'一起看見日常故事'),
            array('id'=>'description','label'=>'說明短文','content'=>'以溫暖語氣邀請每位觀眾看見生活中的故事。'),
            array('id'=>'custom_invitation','label'=>'自訂邀請語','content'=>'帶著你的好奇心，一起來看。')
        ),
        'rationale'=>'保留完整命名組合與自訂邀請語。',
        'goalText'=>'以清楚、溫暖而不誇大的語氣，邀請所有感興趣的人參與。',
        'goalSnapshot'=>array('summary'=>'舊版目標不得覆蓋本版目標。'),
        'changeSummary'=>'原始正式版。','basedOnVersionId'=>null,
        'provenance'=>array('provider'=>'ollama','requestedModel'=>'historic-request','actualModel'=>'historic-actual'),
        'createdAt'=>'2026-10-20T00:00:00+00:00',
        'referencesSnapshot'=>array(array('privateHistoricalSnapshot'=>'must not be resent'))
    );
    $alternate=$official;
    $alternate['id']=str_repeat('b',32);
    $alternate['items'][0]['content']='另一個未採用候選';
    $project=array(
        'id'=>str_repeat('c',32),'title'=>'日常故事活動','description'=>'面向一般觀眾的命名專案。',
        'activeItem'=>array('title'=>'完整命名組合','description'=>'包含既有自訂項目。'),
        'references'=>array(array('itemId'=>str_repeat('d',32),'versionId'=>str_repeat('e',32),'title'=>'已固定參考')),
        'messages'=>array(
            array('id'=>str_repeat('1',32),'role'=>'student','text'=>'舊要求只供脈絡，不要重做。','kind'=>'discussion','at'=>'2026-10-20T00:00:00+00:00','referencesSnapshot'=>array('old attachment')),
            array('id'=>str_repeat('2',32),'role'=>'assistant','text'=>'已保留你的既有想法。','kind'=>'discussion','at'=>'2026-10-20T00:01:00+00:00'),
            array('id'=>str_repeat('3',32),'role'=>'user','text'=>'我希望面向所有有興趣的人。','kind'=>'discussion','at'=>'2026-10-20T00:02:00+00:00')
        ),
        // The older shared goal deliberately omits custom fields in the official bundle.
        'brief'=>array('purpose'=>'命名','audience'=>'一般觀眾','message'=>'日常故事','tone'=>'溫暖','constraints'=>'不誇大','summary'=>'與本版不同的專案共用目標。','items'=>array(array('id'=>'name','label'=>'中文名稱'))),
        'goalApprovedAt'=>'2026-10-20T00:03:00+00:00',
        'officialVersionId'=>$official['id'],'versions'=>array($official,$alternate)
    );
    return array($project,$official);
}

function contractClarification($changes=array()) {
    return array_merge(array(
        'outcome'=>'clarification','reply'=>'這組內容的語氣溫暖，名稱與邀請語也相互呼應。',
        'question'=>'你希望先討論哪一項？','choices'=>array(),'items'=>array(),
        'rationale'=>'','goalText'=>'','changeSummary'=>''
    ),$changes);
}

function contractRevision($official,$changes=array()) {
    $items=$official['items'];
    $items[0]['content']='一起看見日常';
    return array_merge(array(
        'outcome'=>'revision','reply'=>'已準備一份待你審閱的名稱修訂。','question'=>'','choices'=>array(),
        'items'=>$items,'rationale'=>'只將中文名稱改得更口語，其餘項目原文保留。',
        'goalText'=>$official['goalText'],'changeSummary'=>'縮短中文名稱，完整保留其他命名內容。'
    ),$changes);
}

function contractDiscussion($changes=array()) {
    return array_merge(array('reply'=>'這個方向可以討論。','question'=>'你希望先討論哪一項？','choices'=>array(),
        'directionStatus'=>'exploring','direction'=>fixtureEmptyDirection()),$changes);
}

function contractChoices() {
    return array(
        array('id'=>'warm','label'=>'溫暖親切','value'=>'我希望語氣溫暖親切。'),
        array('id'=>'direct','label'=>'簡潔直接','value'=>'我希望語氣簡潔直接。')
    );
}

function contractRaw($value) {
    // Preserve stdClass objects and native arrays when encoding model output.
    return jsonEncode($value);
}

function contractEnvelope($provider,$raw,$actualModel) {
    // Real adapters consume raw stdClass envelopes, then decode the model's JSON.
    if($provider==='openai')return (object)array(
        'status'=>'completed','model'=>$actualModel,
        'output'=>array((object)array('type'=>'message','content'=>array((object)array('type'=>'output_text','text'=>$raw))))
    );
    return (object)array('done'=>true,'done_reason'=>'stop','model'=>$actualModel,'message'=>(object)array('role'=>'assistant','content'=>$raw));
}

function contractAttempt($provider,$method,$raw,$label,$transportError=null) {
    global $contractAttempts;
    $contractAttempts++;
    list($project,$official)=contractFixture();
    $beforeProject=serialize($project);
    $beforeOfficial=serialize($official);
    $requested=$provider==='openai'?'fixture-openai-exact-v1':'fixture/ollama-exact:7b';
    $actual=$provider==='openai'?'fixture-openai-resolved-20261021':'fixture/ollama-resolved:7b-q4';
    $latest='本次只討論中文名稱是否夠清楚。';
    $calls=0;$captured=null;$destination=null;$keyReads=0;
    $transport=function($url,$payload)use(&$calls,&$captured,&$destination,$provider,$raw,$actual,$transportError){
        $calls++;$captured=$payload;$destination=$url;
        if($transportError!==null)throw $transportError;
        return contractEnvelope($provider,$raw,$actual);
    };
    $adapter=$provider==='openai'
        ?new OpenAIAdapter(function()use(&$keyReads){$keyReads++;throw new RuntimeException('Credential access is forbidden in this fixture.');},120000,$transport)
        :new OllamaAdapter('http://127.0.0.1:11434',120000,$transport);
    $module=new TitleModule($adapter);
    $result=null;$error=null;
    try {
        $result=$method==='discuss'
            ?$module->discuss($project,$latest,$requested)
            :$module->refine($project,$official,$latest,$requested);
    } catch(Throwable $caught) {
        $error=$caught;
    }
    $prefix=$provider.' '.$method.' '.$label;
    contractCheck($calls===1,$prefix.': exactly one transport call, no automatic retry');
    contractCheck($keyReads===0,$prefix.': no credential access');
    contractCheck($destination===($provider==='openai'?'https://api.openai.com/v1/responses':'http://127.0.0.1:11434/api/chat'),$prefix.': fixed provider destination');
    contractCheck(is_array($captured)&&$captured['model']===$requested,$prefix.': exact requested model');
    contractCheck($adapter->actualModel()===($transportError===null?$actual:null),$prefix.': exact actual model or unknown after transport failure');
    contractCheck(serialize($project)===$beforeProject&&serialize($official)===$beforeOfficial,$prefix.': no mutation of project, old history, official items or version goal');
    $messages=$provider==='openai'?$captured['input']:$captured['messages'];
    $data=json_decode($messages[1]['content'],true,64,JSON_THROW_ON_ERROR);
    $schema=$provider==='openai'?$captured['text']['format']['schema']:$captured['format'];
    contractCheck($data['latestUserMessage']===$latest&&!array_key_exists('latestStudentMessage',$data),$prefix.': latestUserMessage without legacy key');
    contractCheck($data['dialogue'][0]['role']==='user'&&$project['messages'][0]['role']==='student'&&$data['dialogue'][1]['role']==='assistant'&&$data['dialogue'][2]['role']==='user',$prefix.': legacy student mapped only in outbound context');
    contractCheck(count($data['dialogue'])===count($project['messages'])&&$data['dialogue'][0]['text']===$project['messages'][0]['text'],$prefix.': full dialogue retained');
    contractCheck(!array_key_exists('referencesSnapshot',$data['dialogue'][0])&&!array_key_exists('referencesSnapshot',$data['versions'][0]),$prefix.': stale attachment snapshots excluded only from outbound context');
    contractCheck($data['pinnedReferences']===$project['references'],$prefix.': current pinned references retained');
    contractCheck(strpos($messages[0]['content'],'任何使用者')!==false&&strpos($messages[0]['content'],'不預設身分、年齡或用途')!==false&&strpos($messages[0]['content'],'學生')===false&&strpos($messages[0]['content'],'latestStudentMessage')===false,$prefix.': general-audience prompt');
    contractCheck(count($schema['properties'])===($method==='discuss'?5:8),$prefix.': all required choice-aware response fields');
    contractCheck($schema['properties']['choices']['type']==='array'&&$schema['properties']['choices']['items']['type']==='object'&&$schema['properties']['choices']['items']['additionalProperties']===false&&$schema['properties']['choices']['items']['required']===array_keys($schema['properties']['choices']['items']['properties']),$prefix.': strict nested choice object schema');
    contractCheck($schema['type']==='object'&&$schema['additionalProperties']===false&&$schema['required']===array_keys($schema['properties']),$prefix.': strict complete root schema');
    contractCheck($captured['stream']===false,$prefix.': single non-streaming request');
    if($provider==='openai')contractCheck($captured['store']===false&&$captured['text']['format']['strict']===true,$prefix.': non-stored strict structured request');
    if($method==='discuss') {
        $directionSchema=$schema['properties']['direction'];
        contractCheck($schema['properties']['directionStatus']['enum']===array('exploring','ready')&&$directionSchema['type']==='object'&&$directionSchema['additionalProperties']===false&&count($directionSchema['properties'])===7&&$directionSchema['required']===array_keys($directionSchema['properties']),$prefix.': direction status and nested seven-field proposal are strict');
    }
    if($method==='refine') {
        contractCheck($data['officialVersion']['id']===$official['id']&&$data['officialVersion']['items']===$official['items']&&$data['officialVersion']['goalText']===$official['goalText'],$prefix.': complete official custom bundle and own goal used');
        contractCheck($schema['properties']['items']['type']==='array'&&$schema['properties']['items']['items']['additionalProperties']===false,$prefix.': nested item schema distinguishes objects and arrays');
    }
    return array('result'=>$result,'error'=>$error,'label'=>$prefix);
}

function contractAccept($attempt,$expectedOutcome=null) {
    $error=$attempt['error'];
    contractCheck($error===null,$attempt['label'].': accepted'.($error===null?'':' ('.get_class($error).': '.$error->getMessage().')'));
    if($expectedOutcome!==null)contractCheck($attempt['result']['outcome']===$expectedOutcome,$attempt['label'].': expected outcome');
    return $attempt['result'];
}

function contractNoFreeClaim($response,$label) {
    $message=$response['error']['message'];
    contractCheck(!preg_match('/(?:不會|沒有|不需|無須|未)(?:產生)?(?:計費|收費|扣款|費用)|免費|no charges?|not billed|free of charge/iu',$message),$label.': rejection does not promise no provider charges');
}

function contractReject($attempt,$code) {
    $error=$attempt['error'];
    contractCheck($error instanceof AppError&&$error->errorCode===$code,$attempt['label'].': rejected with '.$code);
    contractCheck($attempt['result']===null,$attempt['label'].': no valid result returned');
    $response=errorResponse($error);
    contractCheck($response['error']['operationOutcome']==='rejected',$attempt['label'].': operationOutcome rejected');
    contractNoFreeClaim($response,$attempt['label']);
}

list($fixtureProject,$fixtureOfficial)=contractFixture();
$accepted=array(
    'nonempty explanatory metadata'=>contractClarification(array('rationale'=>'這是討論理由，不代表修改。','goalText'=>'可考慮的方向，不是新版本目標。','changeSummary'=>'僅說明本次討論焦點。')),
    'quoted question mark plus one question'=>contractClarification(array('reply'=>'「為什麼？」這個名稱能引起好奇，也可以保留《誰在看？》的風格。','question'=>'你希望語氣更親切嗎？')),
    'trailing closing quote and punctuation'=>contractClarification(array('question'=>'你希望語氣更親切嗎？）」')),
    'courteous request without question mark'=>contractClarification(array('question'=>'請先說說你想傳達的一個重點。')),
    'evaluation with empty question'=>contractClarification(array('question'=>'')),
    'choice question'=>contractClarification(array('choices'=>contractChoices())),
    'repeated adjacent question marks count once'=>contractClarification(array('question'=>'你希望更口語嗎？？？')),
    'quoted editing words are title not edit claim'=>contractClarification(array('reply'=>'「已經修改好了。」作為名稱較像流程提示，和目前溫暖的語氣不同。','question'=>''))
);

foreach(array('openai','ollama') as $provider) {
    foreach($accepted as $label=>$value) {
        $result=contractAccept(contractAttempt($provider,'refine',contractRaw($value),$label),'clarification');
        contractCheck($result['items']===array()&&$result['rationale']===''&&!array_key_exists('goalText',$result)&&!array_key_exists('changeSummary',$result),$provider.' '.$label.': clarification metadata discarded, no revision or goal payload');
        contractCheck($result['question']===$value['question']&&$result['choices']===$value['choices'],$provider.' '.$label.': structured question and choices retained');
        contractCheck(strpos($result['reply'],'此回覆僅供討論，作品內容與正式版都尚未變更。')===0&&strpos($result['reply'],$value['reply'])!==false,$provider.' '.$label.': clear discussion-only prefix and original reply');
        if($value['question']!=='')contractCheck(strpos($result['reply'],$value['question'])!==false,$provider.' '.$label.': original question punctuation preserved');
    }

    $validRevision=contractRevision($fixtureOfficial);
    // A provider may reorder entries; the module restores the official item order.
    $validRevision['items']=array_reverse($validRevision['items']);
    $result=contractAccept(contractAttempt($provider,'refine',contractRaw($validRevision),'valid full-bundle revision'),'revision');
    contractCheck($result['question']===''&&$result['choices']===array(),$provider.': revision never exposes unresolved choices');
    contractCheck($result['items'][0]['content']==='一起看見日常'&&count($result['items'])===count($fixtureOfficial['items']),$provider.': valid revision contains actual change and complete item count');
    contractCheck(array_slice($result['items'],1)===array_slice($fixtureOfficial['items'],1),$provider.': all unedited standard and custom fields preserved in official order');
    contractCheck($result['goalText']===$fixtureOfficial['goalText']&&$result['rationale']===$validRevision['rationale']&&$result['changeSummary']===$validRevision['changeSummary'],$provider.': revision keeps own goal and supplied explanation');
    $goalOnly=contractRevision($fixtureOfficial,array('items'=>$fixtureOfficial['items'],'goalText'=>'改以更精簡的方式邀請一般觀眾。','changeSummary'=>'只更新本版目標，作品各項原文保留。'));
    $result=contractAccept(contractAttempt($provider,'refine',contractRaw($goalOnly),'goal-only genuine revision'),'revision');
    contractCheck($result['items']===$fixtureOfficial['items']&&$result['goalText']===$goalOnly['goalText'],$provider.': genuine goal-only revision preserves full custom bundle');

    $invalid=array();
    $invalid[]=array('changed clarification items',contractClarification(array('items'=>contractRevision($fixtureOfficial)['items'])),'MODEL_CLARIFICATION_ITEMS');
    $invalid[]=array('unchanged but nonempty clarification items',contractClarification(array('items'=>$fixtureOfficial['items'])),'MODEL_CLARIFICATION_ITEMS');
    $invalid[]=array('completed-edit false claim plus question',contractClarification(array('reply'=>'已經修改好了。','question'=>'你還想調整哪裡？')),'MODEL_CLARIFICATION_CLAIM');
    $invalid[]=array('completed-edit claim in question',contractClarification(array('question'=>'已經修改好了，還要調整嗎？')),'MODEL_CLARIFICATION_CLAIM');
    $invalid[]=array('multiple unquoted questions',contractClarification(array('question'=>'想更口語嗎？還是需要更正式？')),'MODEL_QUESTION_COUNT');
    $invalid[]=array('question in reply and question field',contractClarification(array('reply'=>'你喜歡這個方向嗎？','question'=>'還需要縮短嗎？')),'MODEL_QUESTION_COUNT');
    foreach(array_keys(contractClarification()) as $key) {
        $missing=contractClarification();unset($missing[$key]);
        $invalid[]=array('missing '.$key,$missing,'MODEL_OUTPUT_INVALID');
    }
    $extra=contractClarification();$extra['unexpected']='must reject';
    $invalid[]=array('extra root field',$extra,'MODEL_OUTPUT_INVALID');
    foreach(array('outcome','reply','question','rationale','goalText','changeSummary') as $key) {
        foreach(array(null,3,true,array(),new stdClass()) as $i=>$wrongType) {
            $invalid[]=array($key.' wrong type '.$i,contractClarification(array($key=>$wrongType)),'MODEL_OUTPUT_INVALID');
        }
    }
    $invalid[]=array('unknown outcome enum',contractClarification(array('outcome'=>'edited')),'MODEL_OUTPUT_INVALID');
    foreach(array(null,'',false,1,new stdClass()) as $i=>$wrongItems) {
        $invalid[]=array('items wrong type '.$i,contractClarification(array('items'=>$wrongItems)),'MODEL_OUTPUT_INVALID');
    }
    foreach(array('reply'=>1201,'question'=>601,'rationale'=>1201,'goalText'=>6001,'changeSummary'=>1201) as $key=>$length) {
        $invalid[]=array('overlong '.$key,contractClarification(array($key=>str_repeat('x',$length))),'MODEL_OUTPUT_INVALID');
    }
    foreach(array('reply','question','rationale','goalText','changeSummary') as $key) {
        $invalid[]=array('NUL in '.$key,contractClarification(array($key=>"文字\0不可接受")),'MODEL_OUTPUT_INVALID');
    }
    $invalid[]=array('unchanged revision',contractRevision($fixtureOfficial,array('items'=>$fixtureOfficial['items'])),'MODEL_NO_REVISION');
    $missingCustom=contractRevision($fixtureOfficial);array_pop($missingCustom['items']);
    $invalid[]=array('missing official custom item',$missingCustom,'MODEL_OUTPUT_INVALID');
    $renamedCustom=contractRevision($fixtureOfficial);$renamedCustom['items'][4]['label']='偷偷改名';
    $invalid[]=array('renamed official custom label',$renamedCustom,'MODEL_OUTPUT_INVALID');
    $wrongId=contractRevision($fixtureOfficial);$wrongId['items'][4]['id']='replacement_id';
    $invalid[]=array('changed official custom id',$wrongId,'MODEL_OUTPUT_INVALID');
    foreach(array('id','label','content') as $key) {
        $missingItemField=contractRevision($fixtureOfficial);unset($missingItemField['items'][4][$key]);
        $invalid[]=array('custom item missing '.$key,$missingItemField,'MODEL_OUTPUT_INVALID');
        $wrongItemField=contractRevision($fixtureOfficial);$wrongItemField['items'][4][$key]=7;
        $invalid[]=array('custom item incorrect '.$key.' type',$wrongItemField,'MODEL_OUTPUT_INVALID');
    }
    $extraItemField=contractRevision($fixtureOfficial);$extraItemField['items'][4]['unexpected']='extra';
    $invalid[]=array('custom item extra field',$extraItemField,'MODEL_OUTPUT_INVALID');
    $nestedArray=contractRevision($fixtureOfficial);$nestedArray['items'][4]=array('custom_invitation','自訂邀請語','not an object');
    $invalid[]=array('nested item array instead of object',$nestedArray,'MODEL_OUTPUT_INVALID');
    $nestedObject=contractRevision($fixtureOfficial);$nestedObject['items']=(object)$nestedObject['items'];
    $invalid[]=array('numeric-key object instead of items array',$nestedObject,'MODEL_OUTPUT_INVALID');
    $longItem=contractRevision($fixtureOfficial);$longItem['items'][4]['content']=str_repeat('x',6001);
    $invalid[]=array('overlong custom item content',$longItem,'MODEL_OUTPUT_INVALID');
    $longLabel=contractRevision($fixtureOfficial);$longLabel['items'][4]['label']=str_repeat('x',121);
    $invalid[]=array('overlong custom item label',$longLabel,'MODEL_OUTPUT_INVALID');
    $nulItem=contractRevision($fixtureOfficial);$nulItem['items'][4]['content']="文字\0不可接受";
    $invalid[]=array('NUL in custom content',$nulItem,'MODEL_OUTPUT_INVALID');
    $invalid[]=array('revision with unresolved question',contractRevision($fixtureOfficial,array('question'=>'還需要更口語嗎？')),'MODEL_OUTPUT_INVALID');
    foreach(array('rationale','goalText','changeSummary') as $key) {
        $invalid[]=array('revision empty '.$key,contractRevision($fixtureOfficial,array($key=>'')),'MODEL_OUTPUT_INVALID');
    }
    foreach($invalid as $case)contractReject(contractAttempt($provider,'refine',contractRaw($case[1]),$case[0]),$case[2]);

    // Deliberately raw malformed UTF-8 cannot be produced with jsonEncode().
    $utf8=contractRaw(contractClarification(array('reply'=>'UTF8_SENTINEL')));
    $utf8=str_replace('UTF8_SENTINEL',"\xC3\x28",$utf8);
    contractReject(contractAttempt($provider,'refine',$utf8,'malformed UTF-8 JSON text'),'MODEL_OUTPUT_INVALID');
    contractReject(contractAttempt($provider,'refine','[]','root array instead of object'),'MODEL_OUTPUT_INVALID');
    contractReject(contractAttempt($provider,'refine','{"outcome":','truncated JSON'),'MODEL_OUTPUT_INVALID');

    $discussions=array(
        'quoted title punctuation'=>contractDiscussion(array('reply'=>'「為什麼？」這個名稱保留了好奇心。','question'=>'你希望讀者記住什麼？')),
        'trailing closing punctuation'=>contractDiscussion(array('reply'=>'你想讓語氣更自然。','question'=>'你希望更口語嗎？）」')),
        'no question mark'=>contractDiscussion(array('reply'=>'你想讓語氣更自然。','question'=>'請先說說希望讀者記住的一件事。')),
        'repeated question marks'=>contractDiscussion(array('reply'=>'你想讓語氣更自然。','question'=>'你希望更口語嗎？？？')),
        'empty choices remain free text'=>contractDiscussion(),
        'choice question'=>contractDiscussion(array('choices'=>contractChoices()))
    );
    foreach($discussions as $label=>$value) {
        $result=contractAccept(contractAttempt($provider,'discuss',contractRaw($value),$label));
        contractCheck($result===array('reply'=>$value['reply']."\n\n".$value['question'],'question'=>$value['question'],'choices'=>$value['choices'],'directionStatus'=>'exploring','direction'=>null),$provider.' discussion '.$label.': combined text and structured question preserved');
    }
    $readyBrief=$fixtureProject['brief'];
    $readyValue=contractDiscussion(array('reply'=>'主軸已足夠，可確認後生成，也能繼續討論。','question'=>'','choices'=>array(),'directionStatus'=>'ready','direction'=>$readyBrief));
    $readyResult=contractAccept(contractAttempt($provider,'discuss',contractRaw($readyValue),'ready without an extra question'));
    contractCheck($readyResult['directionStatus']==='ready'&&$readyResult['direction']===$readyBrief&&$readyResult['question']===''&&$readyResult['choices']===array(),$provider.': ready exposes a validated direction only, not content candidates');
    $emptyAnswer=contractAccept(contractAttempt($provider,'discuss',contractRaw(contractDiscussion(array('question'=>''))),'exploring can answer without forced question'));
    contractCheck($emptyAnswer['question']===''&&$emptyAnswer['direction']===null,$provider.': exploring permits no-question answer without inventing readiness');
    $badDirections=array(
        array('unknown direction status',contractDiscussion(array('directionStatus'=>'almost_ready')),'MODEL_OUTPUT_INVALID'),
        array('ready unresolved question',array_merge($readyValue,array('question'=>'還要補充什麼？')),'MODEL_OUTPUT_INVALID'),
        array('ready reply still asks a question',array_merge($readyValue,array('reply'=>'你準備好了嗎？')),'MODEL_QUESTION_COUNT'),
        array('ready with empty direction',array_merge($readyValue,array('direction'=>fixtureEmptyDirection())),'MODEL_OUTPUT_INVALID'),
        array('direction wrong type',contractDiscussion(array('direction'=>array())),'MODEL_OUTPUT_INVALID'),
        array('discussion false completed-edit claim',contractDiscussion(array('reply'=>'已經修改好了。')),'MODEL_CLARIFICATION_CLAIM')
    );
    foreach(array_keys($readyBrief) as $key) {
        $missing=$readyBrief;unset($missing[$key]);
        $badDirections[]=array('direction missing '.$key,array_merge($readyValue,array('direction'=>$missing)),'MODEL_OUTPUT_INVALID');
    }
    foreach(array('尚未指定','待確認','TBD') as $placeholder) {
        $incomplete=$readyBrief;$incomplete['summary']=$placeholder;
        $badDirections[]=array('ready placeholder summary '.$placeholder,array_merge($readyValue,array('direction'=>$incomplete)),'MODEL_OUTPUT_INVALID');
    }
    $extraDirection=$readyBrief;$extraDirection['extra']='no';
    $badDirections[]=array('direction extra field',array_merge($readyValue,array('direction'=>$extraDirection)),'MODEL_OUTPUT_INVALID');
    $duplicateDefinitions=$readyBrief;$duplicateDefinitions['items'][]=$duplicateDefinitions['items'][0];
    $badDirections[]=array('direction duplicate stable id',array_merge($readyValue,array('direction'=>$duplicateDefinitions)),'MODEL_OUTPUT_INVALID');
    foreach($badDirections as $case)contractReject(contractAttempt($provider,'discuss',contractRaw($case[1]),$case[0]),$case[2]);

    $badDiscussions=array(
        array('two unquoted questions',contractDiscussion(array('question'=>'想更短嗎？還是更親切？')),'MODEL_QUESTION_COUNT'),
        array('extra field',contractDiscussion(array('extra'=>'')),'MODEL_OUTPUT_INVALID'),
        array('wrong reply type',contractDiscussion(array('reply'=>array())),'MODEL_OUTPUT_INVALID'),
        array('overlong reply',contractDiscussion(array('reply'=>str_repeat('x',601))),'MODEL_OUTPUT_INVALID'),
        array('overlong question',contractDiscussion(array('question'=>str_repeat('x',601))),'MODEL_OUTPUT_INVALID'),
        array('NUL in discussion',contractDiscussion(array('reply'=>"文字\0不可接受")),'MODEL_OUTPUT_INVALID')
    );
    foreach(array_keys(contractDiscussion()) as $key) {
        $missing=contractDiscussion();unset($missing[$key]);
        $badDiscussions[]=array('missing '.$key,$missing,'MODEL_OUTPUT_INVALID');
    }
    foreach($badDiscussions as $case)contractReject(contractAttempt($provider,'discuss',contractRaw($case[1]),$case[0]),$case[2]);

    // Choices use byte limits, exact field names and values, and stable ASCII ids.
    // Exercise both real provider adapters and both module paths for each case.
    $badChoices=array();
    foreach(array(null,'',false,1,new stdClass()) as $i=>$value)$badChoices['choice list wrong type '.$i]=$value;
    $badChoices['one choice']=array(contractChoices()[0]);
    $badChoices['seven choices']=array();
    for($i=0;$i<7;$i++)$badChoices['seven choices'][]=array('id'=>'choice'.$i,'label'=>'選項 '.$i,'value'=>'回答 '.$i);
    $badChoices['numeric-key object list']=(object)contractChoices();
    foreach(array('id','label','value') as $key) {
        $choices=contractChoices();unset($choices[0][$key]);$badChoices['missing choice '.$key]=$choices;
        foreach(array(null,7,true,array(),new stdClass()) as $i=>$wrong) {
            $choices=contractChoices();$choices[0][$key]=$wrong;$badChoices['choice '.$key.' wrong type '.$i]=$choices;
        }
        $choices=contractChoices();$choices[0][$key]='';$badChoices['empty choice '.$key]=$choices;
        $choices=contractChoices();$choices[0][$key]="bad\0value";$badChoices['NUL in choice '.$key]=$choices;
        $choices=contractChoices();$choices[0][$key]='sk-'.str_repeat('x',40);$badChoices['secret in choice '.$key]=$choices;
    }
    foreach(array('-leading','_leading','with space','非ASCII','a.b',str_repeat('a',65)) as $i=>$id) {
        $choices=contractChoices();$choices[0]['id']=$id;$badChoices['invalid choice id '.$i]=$choices;
    }
    foreach(array('label'=>str_repeat('字',41),'value'=>str_repeat('字',334)) as $key=>$value) {
        $choices=contractChoices();$choices[0][$key]=$value;$badChoices['UTF-8 byte limit '.$key]=$choices;
    }
    $choices=contractChoices();$choices[0]['extra']='no';$badChoices['extra choice field']=$choices;
    $choices=contractChoices();$choices[0]=array('warm','溫暖','回答');$badChoices['array instead of choice object']=$choices;
    $choices=contractChoices();$choices[1]['id']=$choices[0]['id'];$badChoices['duplicate choice id']=$choices;
    $choices=contractChoices();$choices[1]['value']=$choices[0]['value'];$badChoices['duplicate choice value']=$choices;
    foreach(array('discuss','refine') as $method) {
        foreach($badChoices as $label=>$choices) {
            $value=$method==='discuss'?contractDiscussion(array('choices'=>$choices)):contractClarification(array('choices'=>$choices));
            contractReject(contractAttempt($provider,$method,contractRaw($value),$label),'MODEL_OUTPUT_INVALID');
        }
        $value=$method==='discuss'?contractDiscussion(array('question'=>'','choices'=>contractChoices())):contractClarification(array('question'=>'','choices'=>contractChoices()));
        contractReject(contractAttempt($provider,$method,contractRaw($value),'choices require a nonempty question'),'MODEL_OUTPUT_INVALID');
        foreach(array('id','label','value') as $key) {
            $choices=contractChoices();$choices[0][$key]='UTF8_CHOICE_SENTINEL';
            $value=$method==='discuss'?contractDiscussion(array('choices'=>$choices)):contractClarification(array('choices'=>$choices));
            $raw=str_replace('UTF8_CHOICE_SENTINEL',"\xC3\x28",contractRaw($value));
            contractReject(contractAttempt($provider,$method,$raw,'malformed UTF-8 choice '.$key),'MODEL_OUTPUT_INVALID');
        }
        $choices=contractChoices();$choices[0]=array('id'=>'9'.str_repeat('a',61).'_-','label'=>str_repeat('字',40),'value'=>str_repeat('字',333).'a');
        $value=$method==='discuss'?contractDiscussion(array('choices'=>$choices)):contractClarification(array('choices'=>$choices));
        $result=contractAccept(contractAttempt($provider,$method,contractRaw($value),'exact choice byte boundaries'));
        contractCheck($result['choices']===$choices,$provider.' '.$method.': exact valid choice boundaries preserved');
        $choices=array();for($i=0;$i<6;$i++)$choices[]=array('id'=>'choice'.$i,'label'=>'選項 '.$i,'value'=>'回答 '.$i);
        $value=$method==='discuss'?contractDiscussion(array('choices'=>$choices)):contractClarification(array('choices'=>$choices));
        $result=contractAccept(contractAttempt($provider,$method,contractRaw($value),'six choices'));
        contractCheck($result['choices']===$choices,$provider.' '.$method.': maximum six choices accepted');
    }
    contractReject(contractAttempt($provider,'refine',contractRaw(contractRevision($fixtureOfficial,array('choices'=>contractChoices()))),'revision cannot carry choices'),'MODEL_OUTPUT_INVALID');

    $transportError=$provider==='openai'
        ?new AppError('MODEL_TIMEOUT','模擬逾時，無法確認上游是否已完成。',502)
        :new AppError('OLLAMA_CONNECTION','模擬本機連線未完成。',502);
    $attempt=contractAttempt($provider,'refine',contractRaw(contractClarification()),'transport failure',$transportError);
    contractCheck($attempt['error']===$transportError&&$attempt['result']===null,$provider.': transport error propagated without fallback result');
    contractCheck(errorResponse($attempt['error'])['error']['operationOutcome']==='unknown',$provider.': transport outcome remains unknown');
    $runtime=new RuntimeException('Synthetic runtime failure must not leak this raw text.');
    $attempt=contractAttempt($provider,'refine',contractRaw(contractClarification()),'runtime failure',$runtime);
    contractCheck($attempt['error']===$runtime&&errorResponse($runtime)['error']['operationOutcome']==='unknown',$provider.': generic runtime outcome remains unknown');
    contractCheck(strpos(errorResponse($runtime)['error']['message'],'Synthetic runtime')===false,$provider.': generic exception details not exposed');
}

foreach(array('MODEL_OUTPUT_INVALID','MODEL_NO_REVISION','MODEL_QUESTION_COUNT','MODEL_CLARIFICATION_CLAIM','MODEL_CLARIFICATION_ITEMS') as $code) {
    $response=errorResponse(new AppError($code,'此回覆未符合規格，因此未保存；沒有自動重試。',502));
    contractCheck($response['error']['code']===$code&&$response['error']['operationOutcome']==='rejected',$code.': explicit response validation rejected');
    contractNoFreeClaim($response,$code);
}
$validation=errorResponse(new AppError('INVALID_INPUT','輸入格式不正確。',400));
contractCheck($validation['error']['operationOutcome']==='rejected','preflight input validation rejected');
foreach(array(
    new AppError('MODEL_TIMEOUT','無法確認處理結果。',502),
    new AppError('OLLAMA_CONNECTION','無法確認連線結果。',502),
    new RuntimeException('unhandled runtime error'),
    new AppError('REQUEST_ALREADY_ATTEMPTED','先前請求已嘗試，不能自動重試。',409),
    new AppError('JOURNAL_WRITE_FAILED','記錄寫入未完成。',500),
    new AppError('UNKNOWN_UPSTREAM_FAILURE','無法確認上游結果。',503)
) as $error) {
    $response=errorResponse($error);
    contractCheck($response['error']['operationOutcome']==='unknown',($error instanceof AppError?$error->errorCode:'RuntimeException').': unknown remains unknown');
    contractCheck(array_keys($response)===array('error')&&array_keys($response['error'])===array('code','message','operationOutcome'),'error response keeps exact public fields');
    contractNoFreeClaim($response,'unknown error');
}

echo 'TOTAL '.$contractChecks.' response-contract checks passed across '.$contractAttempts." single-call attempts; no credentials, network or PDO.\n";

// Shared strict numeric-schema support is needed for native vector geometry.
class NumericSchemaFixture extends TitleModule {
    public function accepts($value,$schema) { $this->validateSchemaValue($value,$schema);return true; }
}
$numericFixture=new NumericSchemaFixture(null);
foreach(array(0,-0.0,0.125,4096,1.0) as $value)contractCheck($numericFixture->accepts($value,array('type'=>'number','minimum'=>-4096,'maximum'=>8192)),'finite native number accepted');
foreach(array(1,1.0,4096) as $value)contractCheck($numericFixture->accepts($value,array('type'=>'integer','minimum'=>1,'maximum'=>4096)),'mathematically integral JSON number accepted');
foreach(array('1',true,false,null,array(),(object)array(),NAN,INF,-INF,8193) as $value){$rejected=false;try{$numericFixture->accepts($value,array('type'=>'number','minimum'=>-4096,'maximum'=>8192));}catch(AppError $e){$rejected=$e->errorCode==='MODEL_OUTPUT_INVALID'&&$e->status===502;}contractCheck($rejected,'nonnumeric or nonfinite/out-of-range value rejected without coercion');}
foreach(array(0,4097,1.001,'2',true) as $value){$rejected=false;try{$numericFixture->accepts($value,array('type'=>'integer','minimum'=>1,'maximum'=>4096));}catch(AppError $e){$rejected=$e->errorCode==='MODEL_OUTPUT_INVALID';}contractCheck($rejected,'integer schema precision and limits enforced');}
echo 'TOTAL including numeric schemas: '.$contractChecks." checks; native fixture requires PHP and was not executed by a lexer.\n";
