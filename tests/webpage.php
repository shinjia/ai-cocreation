<?php
/**
 * Native PHP 7.4+ webpage fixtures. Run: php tests/webpage.php
 * UNEXECUTED in the authoring environment: PHP is unavailable. Node source
 * contracts and lexer checks do not establish PHP syntax/runtime, HTTP, real
 * provider, browser or export behavior. Requires the webpage integration and
 * strict boolean raw-schema support in shared bootstrap/content/TitleModule.
 * Deterministic adapter only: no credentials, network, paid inference, database,
 * file mutation, external publication or arbitrary-code execution.
 */
require_once dirname(__DIR__).'/app/bootstrap.php';
require_once dirname(__DIR__).'/app/webpage.php';
require_once dirname(__DIR__).'/app/modules/webpage.php';
$webpageChecks=0;
function webpageCheck($ok,$label) {global $webpageChecks;if(!$ok)throw new RuntimeException('FAIL '.$label);$webpageChecks++;echo 'PASS '.$label."\n";}
function webpageReject($fn,$label,$code='ARTIFACT_INVALID',$status=400) {
    $error=null;try{$fn();}catch(AppError $e){$error=$e;}
    webpageCheck($error instanceof AppError&&$error->errorCode===$code&&$error->status===$status,$label);
}
function webpageFixtureSection($type='text',$id='about') {
    $section=array('id'=>$id,'type'=>$type,'eyebrow'=>'','heading'=>'在地故事','body'=>'一起閱讀與分享。','entries'=>array(),'actionLabel'=>'','actionTarget'=>'');
    if($type==='cards'||$type==='faq')$section['entries']=array(array('id'=>'entry_a','title'=>'交流時刻','body'=>'保留彼此的生活記憶。'));
    if($type==='hero'||$type==='cta'){$section['actionLabel']='閱讀介紹';$section['actionTarget']='about';}
    return $section;
}
function webpageFixture($all=false) {
    $sections=array(webpageFixtureSection());
    if($all)$sections=array(webpageFixtureSection('hero','intro'),webpageFixtureSection(),webpageFixtureSection('cards','highlights'),webpageFixtureSection('faq','questions'),webpageFixtureSection('cta','continue'));
    return array('kind'=>'webpage','title'=>'社區影展','theme'=>'paper','navigation'=>true,'sections'=>$sections);
}
function webpageFixtureBrief() {return array('purpose'=>'介紹社區影展','audience'=>'社區居民','message'=>'首屏、介紹、亮點、常見問答與頁內導覽','tone'=>'paper 明亮紙感','constraints'=>'頁內導覽與原生 FAQ 展開，沒有表單或外部連結','summary'=>'以明亮紙感呈現社區影展資訊，以清楚區塊與頁內導覽協助居民理解。','items'=>array(array('id'=>'document','label'=>'網頁來源')));}
function webpageFixtureVersion($suffix='a') {
    $artifact=webpageFixture(true);
    return array('id'=>str_repeat($suffix,32),'number'=>1,'major'=>1,'minor'=>0,'title'=>'來源 '.$suffix,'artifact'=>$artifact,'items'=>webpageItems($artifact),'contentType'=>'webpage',
        'rationale'=>'來源風格與結構說明','source'=>'manual','basedOnVersionId'=>null,'goalText'=>'以明亮紙感與頁內導覽呈現社區影展。','changeSummary'=>'原有完整快照','goalSnapshot'=>webpageFixtureBrief(),
        'discussionMessageIds'=>array('fixture_message'),'provenance'=>array('model'=>'fixed-fixture-v1'),'createdAt'=>'2026-01-01T00:00:00+00:00');
}
function webpageFixtureProject() {
    return array('title'=>'網頁原生測試','description'=>'可編輯原生單頁','module'=>'webpage','activeItem'=>array('title'=>'社區影展網頁','description'=>'固定結構網頁'),
        'references'=>array(array('id'=>'reference-fixture','versionId'=>str_repeat('c',32),'contentType'=>'short_text','items'=>array(array('id'=>'body','label'=>'全文','content'=>'使用者明確釘選的社區影展資料。')))),
        'messages'=>array(),'brief'=>webpageFixtureBrief(),'goalApprovedAt'=>'2026-01-01T00:00:00+00:00','officialVersionId'=>null,'versions'=>array(webpageFixtureVersion()));
}
function webpageFixtureRenameIds($artifact) {
    $ids=array();foreach($artifact['sections'] as $section)$ids[$section['id']]='renamed_'.$section['id'];
    foreach($artifact['sections'] as &$section){$section['id']=$ids[$section['id']];if($section['actionTarget']!=='')$section['actionTarget']=$ids[$section['actionTarget']];foreach($section['entries'] as &$entry)$entry['id']='renamed_'.$entry['id'];unset($entry);}unset($section);
    return $artifact;
}

// Exact native contract, canonical field ordering and literal text preservation.
$fixture=webpageFixture(true);webpageCheck(validateWebpageArtifact($fixture)===$fixture,'five native section types preserve complete content and internal targets');
$ordered=array_reverse($fixture,true);$ordered['sections']=array_map(function($section){$section=array_reverse($section,true);$section['entries']=array_map(function($entry){return array_reverse($entry,true);},$section['entries']);return $section;},$fixture['sections']);
webpageCheck(validateWebpageArtifact($ordered)===$fixture,'canonical root, section and entry key order');
$literal=$fixture;$literal['title']=" \t網頁\n ";$literal['sections'][0]['eyebrow']=" \t ";$literal['sections'][0]['body']="  <script>literal</script> & \"quoted\"\nhttps://example.invalid  ";$literal['sections'][2]['entries'][0]['body']="<img src=x onerror=alert(1)>\r\njavascript:literal";
webpageCheck(validateWebpageArtifact($literal)===$literal,'malicious-looking HTML and URL-looking prose remain literal plain text without whitespace loss');
$minimal=webpageFixture();$minimal['navigation']=false;$minimal['sections'][0]['body']='';webpageCheck(validateWebpageArtifact($minimal)===$minimal,'false navigation and empty optional text accepted');
foreach(array('paper','midnight','meadow') as $theme){$v=$fixture;$v['theme']=$theme;webpageCheck(validateWebpageArtifact($v)===$v,'fixed theme '.$theme);}
$hero=$fixture;$hero['sections'][0]['actionLabel']='';$hero['sections'][0]['actionTarget']='';webpageCheck(validateWebpageArtifact($hero)===$hero,'hero action is optional');
$sameEntry=$fixture;webpageCheck($sameEntry['sections'][2]['entries'][0]['id']===$sameEntry['sections'][3]['entries'][0]['id']&&validateWebpageArtifact($sameEntry)===$sameEntry,'entry IDs unique per section rather than globally');
$numeric=webpageFixture();$numeric['sections'][0]['id']='0';webpageCheck(validateWebpageArtifact($numeric)['sections'][0]['id']==='0','numeric-looking section ID remains a string');

foreach(array(
    'extra HTML root'=>function($v){$v['html']='<html/>';return $v;},'missing root field'=>function($v){unset($v['theme']);return $v;},'wrong kind'=>function($v){$v['kind']='vector';return $v;},
    'title null'=>function($v){$v['title']=null;return $v;},'title blank'=>function($v){$v['title']=" \t\n\u{3000}";return $v;},'title bytes'=>function($v){$v['title']=str_repeat('中',201);return $v;},
    'invalid UTF8'=>function($v){$v['title']="\xff";return $v;},'lone surrogate UTF8'=>function($v){$v['sections'][0]['body']="\xed\xa0\x80";return $v;},'NUL'=>function($v){$v['sections'][0]['body']="a\0b";return $v;},
    'custom theme'=>function($v){$v['theme']='#ffffff';return $v;},'theme array'=>function($v){$v['theme']=array('paper');return $v;},
    'navigation string'=>function($v){$v['navigation']='true';return $v;},'navigation integer'=>function($v){$v['navigation']=1;return $v;},'navigation null'=>function($v){$v['navigation']=null;return $v;},
    'empty sections'=>function($v){$v['sections']=array();return $v;},'associative sections'=>function($v){$v['sections']=array('intro'=>$v['sections'][0]);return $v;},'section array'=>function($v){$v['sections'][0]=array_values($v['sections'][0]);return $v;},
    'section extra class'=>function($v){$v['sections'][0]['class']='custom';return $v;},'section event'=>function($v){$v['sections'][0]['onclick']='alert(1)';return $v;},'section external image'=>function($v){$v['sections'][0]['image']='https://example.invalid';return $v;},
    'missing section field'=>function($v){unset($v['sections'][0]['body']);return $v;},'unsupported section'=>function($v){$v['sections'][0]['type']='form';return $v;},'section duplicate ID'=>function($v){$v['sections'][1]['id']=$v['sections'][0]['id'];return $v;},
    'section nonstring ID'=>function($v){$v['sections'][0]['id']=0;return $v;},'bad section ID'=>function($v){$v['sections'][0]['id']='_bad';return $v;},'long section ID'=>function($v){$v['sections'][0]['id']=str_repeat('a',65);return $v;},
    'eyebrow bytes'=>function($v){$v['sections'][0]['eyebrow']=str_repeat('中',81);return $v;},'heading blank'=>function($v){$v['sections'][0]['heading']=" \u{FEFF}";return $v;},'heading bytes'=>function($v){$v['sections'][0]['heading']=str_repeat('x',601);return $v;},'body bytes'=>function($v){$v['sections'][0]['body']=str_repeat('x',12001);return $v;},
    'empty cards'=>function($v){$v['sections'][2]['entries']=array();return $v;},'empty FAQ'=>function($v){$v['sections'][3]['entries']=array();return $v;},'entries on text'=>function($v){$v['sections'][1]['entries']=$v['sections'][2]['entries'];return $v;},'entries on hero'=>function($v){$v['sections'][0]['entries']=$v['sections'][2]['entries'];return $v;},'entries on CTA'=>function($v){$v['sections'][4]['entries']=$v['sections'][2]['entries'];return $v;},
    'entries associative'=>function($v){$v['sections'][2]['entries']=array('a'=>$v['sections'][2]['entries'][0]);return $v;},'entry extra field'=>function($v){$v['sections'][2]['entries'][0]['href']='x';return $v;},'entry missing field'=>function($v){unset($v['sections'][2]['entries'][0]['body']);return $v;},
    'entry duplicate ID'=>function($v){$v['sections'][2]['entries'][]=$v['sections'][2]['entries'][0];return $v;},'entry blank title'=>function($v){$v['sections'][2]['entries'][0]['title']=' ';return $v;},'entry title bytes'=>function($v){$v['sections'][2]['entries'][0]['title']=str_repeat('x',601);return $v;},'entry body bytes'=>function($v){$v['sections'][2]['entries'][0]['body']=str_repeat('x',6001);return $v;},
    'action label bytes'=>function($v){$v['sections'][0]['actionLabel']=str_repeat('x',241);return $v;},'action blank label'=>function($v){$v['sections'][0]['actionLabel']=' ';return $v;},'action label only'=>function($v){$v['sections'][0]['actionTarget']='';return $v;},'action target only'=>function($v){$v['sections'][0]['actionLabel']='';return $v;},
    'CTA missing action'=>function($v){$v['sections'][4]['actionLabel']='';$v['sections'][4]['actionTarget']='';return $v;},'text forbidden action'=>function($v){$v['sections'][1]['actionLabel']='Go';$v['sections'][1]['actionTarget']='intro';return $v;},'cards forbidden action'=>function($v){$v['sections'][2]['actionLabel']='Go';$v['sections'][2]['actionTarget']='intro';return $v;},'FAQ forbidden action'=>function($v){$v['sections'][3]['actionLabel']='Go';$v['sections'][3]['actionTarget']='intro';return $v;},
    'unknown target'=>function($v){$v['sections'][0]['actionTarget']='missing';return $v;},'external URL target'=>function($v){$v['sections'][0]['actionTarget']='https://example.invalid';return $v;},'script target'=>function($v){$v['sections'][0]['actionTarget']='javascript:alert(1)';return $v;},'fragment target'=>function($v){$v['sections'][0]['actionTarget']='#about';return $v;},'nonstring target'=>function($v){$v['sections'][0]['actionTarget']=0;return $v;}
) as $label=>$mutate){$bad=$mutate($fixture);webpageReject(function()use($bad){validateWebpageArtifact($bad);},$label);}
$exact=$fixture;$exact['title']=str_repeat('中',200);$exact['sections'][0]['id']=str_repeat('a',64);$exact['sections'][0]['eyebrow']=str_repeat('中',80);$exact['sections'][0]['heading']=str_repeat('x',600);$exact['sections'][0]['body']=str_repeat('x',12000);$exact['sections'][0]['actionLabel']=str_repeat('x',240);$exact['sections'][2]['entries'][0]=array('id'=>str_repeat('e',64),'title'=>str_repeat('x',600),'body'=>str_repeat('x',6000));
webpageCheck(validateWebpageArtifact($exact)===$exact,'exact UTF8 byte, stable ID and per-field bounds');
$maximum=webpageFixture();$maximum['sections']=array();for($i=0;$i<20;$i++)$maximum['sections'][]=webpageFixtureSection('text','s'.$i);
webpageCheck(count(validateWebpageArtifact($maximum)['sections'])===20,'20 sections accepted');$maximum['sections'][]=webpageFixtureSection('text','overflow');webpageReject(function()use($maximum){validateWebpageArtifact($maximum);},'21 sections rejected');
foreach(array('cards','faq') as $type){$maximum=webpageFixture();$maximum['sections']=array(webpageFixtureSection($type));$maximum['sections'][0]['entries']=array();for($i=0;$i<12;$i++)$maximum['sections'][0]['entries'][]=array('id'=>'e'.$i,'title'=>'Entry','body'=>'');webpageCheck(count(validateWebpageArtifact($maximum)['sections'][0]['entries'])===12,'12 entries accepted for '.$type);$maximum['sections'][0]['entries'][]=array('id'=>'overflow','title'=>'Entry','body'=>'');webpageReject(function()use($maximum){validateWebpageArtifact($maximum);},'13 entries rejected for '.$type);}
foreach(array('title','id','eyebrow','heading','body','actionLabel','actionTarget','entryId','entryTitle','entryBody') as $where){$bad=$fixture;$secret='sk-'.str_repeat('x',20);if($where==='title')$bad['title']=$secret;elseif(strpos($where,'entry')===0){$key=lcfirst(substr($where,5));$bad['sections'][2]['entries'][0][$key]=$secret;}else $bad['sections'][0][$where]=$secret;webpageReject(function()use($bad){validateWebpageArtifact($bad);},'shared secret guard in '.$where,'SECRET_IN_TEXT');}

// No truncation: full native source and text projection share the same cap.
$size=webpageFixture();$size['sections']=array();for($i=0;$i<5;$i++){$section=webpageFixtureSection('text','s'.$i);$section['body']='';$size['sections'][]=$section;}
$remaining=60000-strlen(webpageCompactJson($size));foreach($size['sections'] as &$section){$add=min($remaining,12000);$section['body']=str_repeat('x',$add);$remaining-=$add;}unset($section);
webpageCheck($remaining===0&&strlen(webpageCompactJson(validateWebpageArtifact($size)))===60000,'60000-byte canonical JSON boundary');
webpageCheck(strlen(webpageItems($size)[0]['content'])===60000,'60000-byte complete projection boundary');
$size['title'].='x';webpageReject(function()use($size){validateWebpageArtifact($size);},'60001-byte full artifact rejected without truncation');
$projection=webpageItems($literal);webpageCheck($projection===array(array('id'=>'document','label'=>'網頁來源','content'=>webpageCompactJson($literal))),'exact projection parity fixture with complete canonical native JSON');
$unicode=webpageFixture();$unicode['sections'][0]['body']="\u{2028}\u{2029}";webpageCheck(strpos(webpageCompactJson($unicode),'\\u2028\\u2029')!==false,'U2028 and U2029 escaped for PHP-browser projection parity');
webpageCheck(webpageCompactJson(array('on'=>true,'off'=>false,'empty'=>array()))==='{"on":true,"off":false,"empty":[]}','projection keeps strict booleans and empty lists');
$renamed=webpageFixtureRenameIds($fixture);webpageCheck(webpageContentFingerprint($renamed)===webpageContentFingerprint($fixture),'ID-only changes preserve internal target binding semantics');
$retarget=$renamed;$retarget['sections'][0]['actionTarget']='renamed_questions';webpageCheck(webpageContentFingerprint($retarget)!==webpageContentFingerprint($fixture),'retargeting internal action changes content fingerprint');
foreach(array('title','theme','navigation','order','entryTitle','entryBody','actionLabel') as $where){$changed=$fixture;if($where==='title')$changed['title']='新頁名';elseif($where==='theme')$changed['theme']='midnight';elseif($where==='navigation')$changed['navigation']=false;elseif($where==='order')$changed['sections']=array_reverse($changed['sections']);elseif($where==='entryTitle')$changed['sections'][2]['entries'][0]['title']='新卡片';elseif($where==='entryBody')$changed['sections'][2]['entries'][0]['body']='新內容';else $changed['sections'][0]['actionLabel']='閱讀';webpageCheck(webpageContentFingerprint($changed)!==webpageContentFingerprint($fixture),'fingerprint retains meaningful '.$where);}
$duplicate=$fixture;$entry=$duplicate['sections'][2]['entries'][0];$entry['id']='entry_b';$duplicate['sections'][2]['entries'][]=$entry;webpageCheck(webpageContentFingerprint($duplicate)!==webpageContentFingerprint($fixture),'fingerprint preserves duplicate entry multiplicity');

// Raw JSON object/list distinctions and strict booleans precede canonicalizing.
$schema=webpageSchema();webpageCheck($schema['properties']['navigation']['type']==='boolean'&&$schema['properties']['sections']['maxItems']===20,'schema uses strict boolean navigation and bounded sections');
$raw=json_decode(jsonEncode($fixture));artifactJsonSchemaValue($raw,$schema);webpageCheck(true,'raw JSON valid full webpage shape');
foreach(array('sections object','empty entries object','entry array','root array','missing section field','extra root','navigation string','navigation number','navigation null','unknown theme') as $mode){
    $raw=json_decode(jsonEncode($fixture));
    if($mode==='sections object')$raw->sections=(object)array('0'=>$raw->sections[0]);elseif($mode==='empty entries object')$raw->sections[0]->entries=(object)array();elseif($mode==='entry array')$raw->sections[2]->entries[0]=array('x','y','z');elseif($mode==='root array')$raw=array();elseif($mode==='missing section field')unset($raw->sections[0]->heading);elseif($mode==='extra root')$raw->html='<html/>';elseif($mode==='navigation string')$raw->navigation='true';elseif($mode==='navigation number')$raw->navigation=1;elseif($mode==='navigation null')$raw->navigation=null;else $raw->theme='custom';
    webpageReject(function()use($raw,$schema){artifactJsonSchemaValue($raw,$schema);},'raw JSON rejects '.$mode);
}

// Shared fixed-model lifecycle with deterministic full-artifact responses.
class WebpageFixtureAdapter {
    public $mode='normal';public $calls=0;public $history=array();public $raw=null;
    public function generate($model,$messages,$schema,$maxOutputTokens) {
        $this->calls++;$data=json_decode($messages[1]['content'],true,64,JSON_THROW_ON_ERROR);$this->history[]=array('model'=>$model,'messages'=>$messages,'schema'=>$schema,'maxOutputTokens'=>$maxOutputTokens,'data'=>$data);
        if($this->raw!==null)return $this->raw;$props=$schema['properties'];
        $candidate=array('artifact'=>webpageFixture(true),'rationale'=>'以明亮紙感、完整區塊與頁內導覽呈現影展。','goalText'=>'以明亮紙感與頁內導覽呈現社區影展。','changeSummary'=>'依確認方向建立完整候選。');
        if(isset($props['directionStatus'])){$ready=$this->mode!=='exploring';$empty=array('purpose'=>'','audience'=>'','message'=>'','tone'=>'','constraints'=>'','summary'=>'','items'=>array());$out=array('reply'=>$ready?'主軸已足夠，可以確認方向並生成。':'先確定網頁要介紹的主題。','question'=>$ready?'':'這個網頁要介紹什麼？','choices'=>array(),'directionStatus'=>$ready?'ready':'exploring','direction'=>$ready?webpageFixtureBrief():$empty);}
        elseif(isset($props['purpose']))$out=webpageFixtureBrief();
        elseif(isset($props['candidates'])){$out=array('candidates'=>array($candidate));if($this->mode==='extra_candidate')$out['candidates'][]=$candidate;if($this->mode==='extra_property')$out['candidates'][0]['artifact']['html']='<html/>';if($this->mode==='bad_boolean')$out['candidates'][0]['artifact']['navigation']='true';if($this->mode==='bad_target')$out['candidates'][0]['artifact']['sections'][0]['actionTarget']='missing';if($this->mode==='bad_crossfield')$out['candidates'][0]['artifact']['sections'][1]['entries']=array(array('id'=>'a','title'=>'Bad','body'=>''));}
        elseif(isset($props['outcome'])){
            $source=$data['sourceVersion'];$artifact=$source['artifact'];$artifact['theme']='meadow';
            $out=array('outcome'=>'revision','reply'=>'這裡提供調整風格後的完整待審閱候選。','question'=>'','choices'=>array(),'artifact'=>$artifact,'rationale'=>'只修改視覺主題，保留內容與操作。','goalText'=>versionGoalText($source),'changeSummary'=>'將主題改為 meadow。');
            if(in_array($this->mode,array('unchanged','metadata_only','goal_only','combined_revert'),true))$out['artifact']=$source['artifact'];
            if($this->mode==='goal_only'||$this->mode==='ids_goal_change')$out['goalText']='保留完整網頁，優先強調資訊易讀。';
            if($this->mode==='metadata_only')$out['rationale']='只是換一段說明。';
            if($this->mode==='ids_only'||$this->mode==='ids_goal_change')$out['artifact']=webpageFixtureRenameIds($source['artifact']);
            if($this->mode==='title_only'){$out['artifact']=$source['artifact'];$out['artifact']['title']='新的網頁標題';}
            if($this->mode==='revision_question')$out['question']='你要哪一種風格？';if($this->mode==='revision_claim')$out['reply']='已經採用並取代正式版。';
            if(strpos($this->mode,'clarification')===0){$out['outcome']='clarification';$out['artifact']=$source['artifact'];$out['reply']='結構清楚，也可以繼續討論。';$out['rationale']='';$out['goalText']='';$out['changeSummary']='';}
            if($this->mode==='clarification_changed')$out['artifact']=$artifact;
            if($this->mode==='clarification_ids')$out['artifact']=webpageFixtureRenameIds($source['artifact']);
            if($this->mode==='clarification_metadata'){$out['rationale']='不保存的解釋';$out['goalText']='不保存的目標';$out['changeSummary']='不保存的摘要';}
            if($this->mode==='clarification_claim')$out['reply']='已經修改完成。';if($this->mode==='clarification_two_questions'){$out['reply']='你想改哪裡？';$out['question']='你要什麼風格？';}
            if($this->mode==='clarification_choices'){$out['question']='你想討論哪一種風格？';$out['choices']=array(array('id'=>'paper','label'=>'明亮紙感','value'=>'討論 paper 風格。'),array('id'=>'midnight','label'=>'深色','value'=>'討論 midnight 風格。'));}
        }elseif(isset($props['artifact'])){
            $out=$candidate;$out['artifact']=$data['selectedVersions'][0]['artifact'];$out['artifact']['theme']=$data['selectedVersions'][1]['artifact']['theme'];$out['artifact']['sections'][1]['body']='整合兩版重點，清楚呈現社區影展。';$out['changeSummary']='整合第一版區塊、第二版風格與新的介紹。';
            if($this->mode==='copy_source')$out['artifact']=$data['selectedVersions'][0]['artifact'];
            if($this->mode==='ids_copy')$out['artifact']=webpageFixtureRenameIds($data['selectedVersions'][0]['artifact']);
            if($this->mode==='reorder_source'){$out['artifact']=$data['selectedVersions'][0]['artifact'];$out['artifact']['sections']=array_reverse($out['artifact']['sections']);}
            if($this->mode==='retarget_source'){$out['artifact']=$data['selectedVersions'][0]['artifact'];$out['artifact']['sections'][0]['actionTarget']='questions';}
        }else{$items=array();foreach($data['selectedVersions'] as $version)$items[]=array('versionId'=>$version['id'],'fit'=>'依本版目標比較。','strength'=>'結構清楚。','tradeoff'=>'需要確認風格取捨。','suggestion'=>'可微調介紹內容。');$out=array('items'=>$items,'summary'=>'由使用者依各版目標判斷。');}
        return json_decode(jsonEncode($out),false,128,JSON_THROW_ON_ERROR);
    }
}
function webpageLastCall($adapter) {return $adapter->history[count($adapter->history)-1];}
function webpageModuleReject($adapter,$fn,$label,$code='MODEL_OUTPUT_INVALID',$calls=1,$status=502) {$before=$adapter->calls;webpageReject($fn,$label,$code,$status);webpageCheck($adapter->calls===$before+$calls,$label.' exact model call count');}
$adapter=new WebpageFixtureAdapter();$module=new WebpageModule($adapter);$project=webpageFixtureProject();$source=$project['versions'][0];$model='fixed-fixture-v1';
$before=$adapter->calls;$direction=$module->discuss($project,'用明亮風格介紹社區影展，加入常見問答。',$model);$call=webpageLastCall($adapter);
webpageCheck($direction['directionStatus']==='ready'&&$direction['direction']['items']===array(array('id'=>'document','label'=>'網頁來源'))&&$adapter->calls===$before+1,'ready three-part direction uses one call and fixed document item');
foreach(array('tone=視覺風格','message=內容結構','constraints=操作功能與限制','頁內導覽與原生 FAQ','不會自動連動','沒有註冊') as $phrase)webpageCheck(strpos($call['messages'][0]['content'],$phrase)!==false,'honest three-part brief mapping and function scope: '.$phrase);
$adapter->mode='exploring';$discussion=$module->discuss($project,'還沒決定。',$model);webpageCheck($discussion['direction']===null&&$discussion['question']!=='','discussion asks only one necessary question');
$adapter->mode='normal';webpageCheck($module->summarize($project,$model)===webpageFixtureBrief(),'strict seven-field summary');
$before=$adapter->calls;$generated=$module->generate($project,'保留完整區塊。',$model);$call=webpageLastCall($adapter);
webpageCheck(count($generated)===1&&$generated[0]['artifact']===webpageFixture(true)&&$generated[0]['items']===webpageItems($generated[0]['artifact']),'generate one full candidate with derived projection');
webpageCheck($adapter->calls===$before+1&&$call['model']===$model&&$call['maxOutputTokens']===24000,'one fixed-model bounded call with no alternate provider or retry');
webpageCheck(!isset($call['data']['versions'])&&count($call['data']['versionIndex'])===1&&$call['data']['pinnedReferences']===$project['references'],'generation omits unrelated full artifacts and retains pinned references');
foreach(array('extra_candidate','extra_property','bad_boolean','bad_target','bad_crossfield') as $mode){$adapter->mode=$mode;webpageModuleReject($adapter,function()use($module,$project,$model){$module->generate($project,'',$model);},'generation rejects '.$mode);}
$adapter->mode='normal';$before=$adapter->calls;$revision=$module->refine($project,$source,'主題改為 meadow。',$model);$call=webpageLastCall($adapter);
webpageCheck($revision['outcome']==='revision'&&$revision['artifact']['theme']==='meadow'&&$revision['artifact']['sections']===$source['artifact']['sections'],'real revision changes requested theme while retaining unchanged sections');
webpageCheck($call['data']['sourceVersion']['artifact']===$source['artifact']&&$call['data']['sourceVersion']['goalText']===$source['goalText']&&$call['data']['latestUserMessage']==='主題改為 meadow。','full exact selected source, own goal and latest request reach model');
webpageCheck($adapter->calls===$before+1&&$source===webpageFixtureVersion()&&$project['officialVersionId']===null,'unadopted source supported with immutable inputs and no automatic promotion');
webpageModuleReject($adapter,function()use($module,$project,$source,$model){$module->refine($project,$source,'修改',$model,array('document'));},'paragraph targets rejected before inference','TARGET_ITEMS_INVALID',0,409);
foreach(array('unchanged','metadata_only','ids_only') as $mode){$adapter->mode=$mode;webpageModuleReject($adapter,function()use($module,$project,$source,$model){$module->refine($project,$source,'修改',$model);},'reject no-op '.$mode,'MODEL_NO_REVISION');}
$adapter->mode='ids_goal_change';webpageModuleReject($adapter,function()use($module,$project,$source,$model){$module->refine($project,$source,'只更新本版目標。',$model);},'ID-only artifact changes rejected even with changed goal','MODEL_NO_REVISION');
$adapter->mode='goal_only';$revision=$module->refine($project,$source,'只更新本版目標。',$model);webpageCheck($revision['artifact']===$source['artifact']&&$revision['goalText']!==$source['goalText']&&strpos($revision['reply'],'僅更新本版目標')!==false,'goal-only revision preserves complete webpage artifact and is labeled honestly');
$adapter->mode='title_only';$revision=$module->refine($project,$source,'只改網頁標題。',$model);webpageCheck($revision['artifact']['title']==='新的網頁標題','explicit authored title refinement remains allowed');
$combined=$source;$combined['goalAndRationale']='使用者保存的新目標與修改意見。';$adapter->mode='combined_revert';$revision=$module->refine($project,$combined,'恢復舊版目標。',$model);$call=webpageLastCall($adapter);
webpageCheck($revision['artifact']===$source['artifact']&&$revision['goalText']===$source['goalText']&&$call['data']['sourceVersion']['goalAndRationale']===$combined['goalAndRationale'],'authoritative combined goal override allows deliberate legacy-goal restoration');
$adapter->mode='ids_only';webpageModuleReject($adapter,function()use($module,$project,$combined,$model){$module->refine($project,$combined,'恢復舊版目標。',$model);},'ID-only artifact changes rejected even with changed combined goal metadata','MODEL_NO_REVISION');
$adapter->mode='clarification';$clarification=$module->refine($project,$source,'你覺得結構如何？',$model);webpageCheck($clarification['outcome']==='clarification'&&$clarification['items']===array()&&!isset($clarification['artifact'])&&!isset($clarification['goalText']),'clarification source echo discarded without version');
$adapter->mode='clarification_metadata';$clarification=$module->refine($project,$source,'繼續討論。',$model);webpageCheck($clarification['rationale']===''&&!isset($clarification['artifact'])&&!isset($clarification['goalText'])&&!isset($clarification['changeSummary']),'bounded unused clarification metadata discarded');
$adapter->mode='clarification_choices';$clarification=$module->refine($project,$source,'談風格。',$model);webpageCheck(count($clarification['choices'])===2&&!isset($clarification['artifact']),'clarification choices do not create artifacts');
foreach(array('clarification_changed'=>'MODEL_CLARIFICATION_ARTIFACT','clarification_ids'=>'MODEL_CLARIFICATION_ARTIFACT','clarification_claim'=>'MODEL_CLARIFICATION_CLAIM','clarification_two_questions'=>'MODEL_QUESTION_COUNT','revision_question'=>'MODEL_OUTPUT_INVALID') as $mode=>$code){$adapter->mode=$mode;webpageModuleReject($adapter,function()use($module,$project,$source,$model){$module->refine($project,$source,'討論',$model);},'reject '.$mode,$code);}
$adapter->mode='revision_claim';$revision=$module->refine($project,$source,'改成 meadow。',$model);webpageCheck(strpos($revision['reply'],'尚未採用、定稿或取代正式版')!==false&&strpos($revision['reply'],'已經採用')===false,'deterministic revision reply cannot claim adoption');

$other=webpageFixtureVersion('b');$other['artifact']['theme']='midnight';$other['items']=webpageItems($other['artifact']);$other['goalAndRationale']='使用者保存的深色版本目標。';$adapter->mode='normal';
$before=$adapter->calls;$fusion=$module->fuse($project,array($source,$other),'保留兩版優點。',$model);$call=webpageLastCall($adapter);
webpageCheck($fusion['artifact']['theme']==='midnight'&&$fusion['artifact']['sections'][1]['body']!==$source['artifact']['sections'][1]['body']&&$fusion['items']===webpageItems($fusion['artifact']),'fusion returns genuinely changed full native candidate');
webpageCheck($adapter->calls===$before+1&&$call['model']===$model&&$call['maxOutputTokens']===24000,'fusion one fixed-model call');
webpageCheck($call['data']['creativeGoal']===null&&$call['data']['goalApprovedAt']===null&&$call['data']['selectedVersions'][1]['goalAndRationale']===$other['goalAndRationale'],'fusion uses selected version goals, not common current goal');
webpageCheck($call['data']['selectedVersions'][0]['artifact']===$source['artifact']&&$call['data']['selectedVersions'][0]['provenance']===$source['provenance']&&$call['data']['selectedVersions'][0]['discussionMessageIds']===$source['discussionMessageIds'],'fusion preserves full source snapshots and provenance');
foreach(array(array($source),array($source,$source),array($source,$other,$source,$other,$source,$other)) as $versions)webpageModuleReject($adapter,function()use($module,$project,$versions,$model){$module->fuse($project,$versions,'融合',$model);},'invalid fusion selection rejected before inference','FUSION_VERSIONS_INVALID',0,409);
foreach(array('copy_source','ids_copy') as $mode){$adapter->mode=$mode;webpageModuleReject($adapter,function()use($module,$project,$source,$other,$model){$module->fuse($project,array($source,$other),'融合',$model);},'fusion rejects '.$mode,'MODEL_NO_REVISION');}
$adapter->mode='reorder_source';$fusion=$module->fuse($project,array($source,$other),'重新整合區塊順序。',$model);webpageCheck($fusion['artifact']['sections']===array_reverse($source['artifact']['sections']),'fusion permits materially different section order');
$adapter->mode='retarget_source';$fusion=$module->fuse($project,array($source,$other),'改為導覽到問答。',$model);webpageCheck($fusion['artifact']['sections'][0]['actionTarget']==='questions','fusion preserves material internal target changes');
$adapter->mode='normal';$comparison=$module->compare($project,array($source,$other),'依各版目標比較。',$model);$call=webpageLastCall($adapter);
webpageCheck(count($comparison['items'])===2&&$call['data']['selectedVersions'][0]['artifact']===$source['artifact']&&$call['data']['selectedVersions'][1]['goalAndRationale']===$other['goalAndRationale'],'inherited comparison receives complete native snapshots and own goals');
$adapter->raw=(object)array('candidates'=>(object)array());webpageModuleReject($adapter,function()use($module,$project,$model){$module->generate($project,'',$model);},'provider raw object-array distinction retained');$adapter->raw=null;
echo 'PASS '.$webpageChecks." native webpage checks. No real provider, credentials or network used.\n";
