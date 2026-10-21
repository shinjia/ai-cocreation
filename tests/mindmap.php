<?php
/**
 * Native PHP 7.4+ mindmap fixtures. Run: php tests/mindmap.php
 * UNEXECUTED in the authoring environment: PHP is unavailable. Node source
 * contracts and lexer checks are not PHP syntax, runtime, HTTP or provider QA.
 * Uses real validators/modules with a deterministic adapter, no network, key,
 * paid inference, database or external mutation.
 */
require_once dirname(__DIR__).'/app/bootstrap.php';
require_once dirname(__DIR__).'/app/mindmap.php';
require_once dirname(__DIR__).'/app/modules/mindmap.php';
$mindmapChecks=0;
function mindmapCheck($ok,$label) {global $mindmapChecks;if(!$ok)throw new RuntimeException('FAIL '.$label);$mindmapChecks++;echo 'PASS '.$label."\n";}
function mindmapReject($fn,$label,$code='ARTIFACT_INVALID',$status=400) {
    $error=null;try{$fn();}catch(AppError $e){$error=$e;}
    mindmapCheck($error instanceof AppError&&$error->errorCode===$code&&$error->status===$status,$label);
}
function mindmapFixtureNode($id,$parentId,$label,$description='') {return array('id'=>$id,'parentId'=>$parentId,'label'=>$label,'description'=>$description);}
function mindmapFixture($initial=false) {
    $root=mindmapFixtureNode('root','','社區影展','保留各種探索角度。');
    if($initial)return array('kind'=>'mindmap','rootId'=>'root','nodes'=>array($root),'proposals'=>array(mindmapFixtureNode('p_topic','root','主題策展'),mindmapFixtureNode('p_people','root','參與者')));
    return array('kind'=>'mindmap','rootId'=>'root','nodes'=>array($root,mindmapFixtureNode('culture','root','在地文化','使用者自填的方向。'),mindmapFixtureNode('budget','root','資源規劃')),
        'proposals'=>array(mindmapFixtureNode('p_memory','culture','地方記憶','尚未選取。'),mindmapFixtureNode('p_space','culture','場域故事'),mindmapFixtureNode('p_public','root','公共討論'),mindmapFixtureNode('p_team','budget','團隊分工')));
}
function mindmapFixtureBrief() {return array('purpose'=>'探索主題','audience'=>'尚未指定','message'=>'社區影展','tone'=>'尚未指定','constraints'=>'尚未指定','summary'=>'以社區影展為主題，保留多個可繼續探索的角度。','items'=>array(array('id'=>'document','label'=>'心智圖來源')));}
function mindmapFixtureVersion($suffix='a') {
    $artifact=mindmapFixture();
    return array('id'=>str_repeat($suffix,32),'number'=>1,'major'=>1,'minor'=>0,'title'=>'來源 '.$suffix,'artifact'=>$artifact,'items'=>mindmapItems($artifact),'contentType'=>'mindmap',
        'rationale'=>'來源說明','source'=>'manual','basedOnVersionId'=>null,'goalText'=>'探索社區影展，不過早收斂。','changeSummary'=>'原有完整快照','goalSnapshot'=>mindmapFixtureBrief(),
        'discussionMessageIds'=>array('fixture_message'),'provenance'=>array('model'=>'fixed-fixture-v1'),'createdAt'=>'2026-01-01T00:00:00+00:00');
}
function mindmapFixtureProject() {
    return array('title'=>'心智圖原生測試','description'=>'只有主題也能開始','module'=>'mindmap','activeItem'=>array('title'=>'社區影展','description'=>'探索，不先收斂'),
        'references'=>array(array('id'=>'reference-fixture','versionId'=>str_repeat('c',32),'contentType'=>'short_text','items'=>array(array('id'=>'body','label'=>'全文','content'=>'使用者明確釘選的資料。')))),
        'messages'=>array(),'brief'=>mindmapFixtureBrief(),'goalApprovedAt'=>'2026-01-01T00:00:00+00:00','officialVersionId'=>null,'versions'=>array(mindmapFixtureVersion()),'mindmapTargetNodeId'=>'culture');
}

// Exact native shapes, stable identity, UTF8 bounds and tree topology.
$fixture=mindmapFixture();mindmapCheck(validateMindmapArtifact($fixture)===$fixture,'full accepted tree and pending queue are preserved exactly');
$one=mindmapFixture(true);$one['proposals']=array();mindmapCheck(validateMindmapArtifact($one)===$one,'root-only manual map with no proposals');
$order=$fixture;$order['nodes']=array($fixture['nodes'][2],$fixture['nodes'][0],$fixture['nodes'][1]);mindmapCheck(validateMindmapArtifact($order)===$order,'valid node array order is preserved, not sorted');
mindmapCheck(mindmapNode($fixture,'culture')===$fixture['nodes'][1]&&mindmapNode($fixture,'p_memory')===null&&mindmapNode($fixture,'missing')===null,'node lookup excludes unaccepted proposals');
mindmapCheck(mindmapNodesEqual($fixture['nodes'],$fixture['nodes'])&&!mindmapNodesEqual($fixture['nodes'],$order['nodes']),'accepted node equality includes complete list order');
$literal=$fixture;$literal['nodes'][1]['label']=' 在地文化 ';$literal['nodes'][1]['description']=" \t=SUM(A1:A2)\n<script>inert</script> ";$literal['proposals'][0]['description']="\n待選原文\r\n ";
mindmapCheck(validateMindmapArtifact($literal)===$literal,'preserve whitespace, multiline and inert HTML-looking text');
$numeric=array('kind'=>'mindmap','rootId'=>'0','nodes'=>array(mindmapFixtureNode('0','','根'),mindmapFixtureNode('1','0','子')),'proposals'=>array(mindmapFixtureNode('2','1','待選')));
mindmapCheck(validateMindmapArtifact($numeric)===$numeric,'numeric-looking ASCII stable IDs remain strings');
foreach(array(
    'extra property'=>function($v){$v['html']='x';return $v;},'missing property'=>function($v){unset($v['proposals']);return $v;},'wrong kind'=>function($v){$v['kind']='chart';return $v;},
    'empty nodes'=>function($v){$v['nodes']=array();return $v;},'root mismatch'=>function($v){$v['rootId']='other';return $v;},'numeric root'=>function($v){$v['rootId']=1;return $v;},
    'root has parent'=>function($v){$v['nodes'][0]['parentId']='culture';return $v;},'second root'=>function($v){$v['nodes'][1]['parentId']='';return $v;},
    'orphan'=>function($v){$v['nodes'][1]['parentId']='missing';return $v;},'self cycle'=>function($v){$v['nodes'][1]['parentId']='culture';return $v;},
    'disconnected cycle'=>function($v){$v['nodes'][1]['parentId']='budget';$v['nodes'][2]['parentId']='culture';return $v;},
    'node duplicate'=>function($v){$v['nodes'][2]['id']='culture';return $v;},'proposal duplicate'=>function($v){$v['proposals'][1]['id']='p_memory';return $v;},
    'cross-list duplicate'=>function($v){$v['proposals'][0]['id']='culture';return $v;},'proposal parent pending'=>function($v){$v['proposals'][0]['parentId']='p_public';return $v;},
    'proposal parent missing'=>function($v){$v['proposals'][0]['parentId']='missing';return $v;},'proposal parent empty'=>function($v){$v['proposals'][0]['parentId']='';return $v;},
    'node extra'=>function($v){$v['nodes'][0]['selected']=true;return $v;},'proposal extra'=>function($v){$v['proposals'][0]['accepted']=true;return $v;},
    'node missing description'=>function($v){unset($v['nodes'][0]['description']);return $v;},'proposal missing description'=>function($v){unset($v['proposals'][0]['description']);return $v;},
    'bad ID'=>function($v){$v['nodes'][1]['id']='_bad';return $v;},'too long ID'=>function($v){$v['proposals'][0]['id']=str_repeat('a',65);return $v;},
    'nonstring parent'=>function($v){$v['nodes'][1]['parentId']=0;return $v;},'nonstring label'=>function($v){$v['nodes'][0]['label']=1;return $v;},
    'null description'=>function($v){$v['nodes'][0]['description']=null;return $v;},'blank label'=>function($v){$v['nodes'][0]['label']=" \t\n";return $v;},
    'Unicode blank label'=>function($v){$v['proposals'][0]['label']="\u{3000}\u{00a0}\u{FEFF}";return $v;},
    'invalid UTF8'=>function($v){$v['nodes'][0]['description']="\xff";return $v;},'NUL'=>function($v){$v['proposals'][0]['description']="a\0b";return $v;},
    'node label bytes'=>function($v){$v['nodes'][0]['label']=str_repeat('x',241);return $v;},'proposal label bytes'=>function($v){$v['proposals'][0]['label']=str_repeat('中',81);return $v;},
    'node description bytes'=>function($v){$v['nodes'][0]['description']=str_repeat('x',2001);return $v;},'proposal description bytes'=>function($v){$v['proposals'][0]['description']=str_repeat('x',2001);return $v;},
    'nonlist nodes'=>function($v){$v['nodes']=array('root'=>$v['nodes'][0]);return $v;},'nonlist proposals'=>function($v){$v['proposals']=array(1=>$v['proposals'][0]);return $v;}
) as $label=>$mutate){$bad=$mutate($fixture);mindmapReject(function()use($bad){validateMindmapArtifact($bad);},'reject '.$label);}
$max=array('kind'=>'mindmap','rootId'=>'root','nodes'=>array(mindmapFixtureNode('root','','根')),'proposals'=>array());
for($i=1;$i<80;$i++)$max['nodes'][]=mindmapFixtureNode('n'.$i,$i===1?'root':'n'.($i-1),'同名但不同節點');
for($i=0;$i<24;$i++)$max['proposals'][]=mindmapFixtureNode('p'.$i,'n79','同名建議');
mindmapCheck(validateMindmapArtifact($max)===$max,'80 accepted nodes, deepest valid chain and 24 pending proposals');
$bad=$max;$bad['nodes'][]=mindmapFixtureNode('n80','n79','超限');mindmapReject(function()use($bad){validateMindmapArtifact($bad);},'reject 81 accepted nodes');
$bad=$max;$bad['proposals'][]=mindmapFixtureNode('p24','root','超限');mindmapReject(function()use($bad){validateMindmapArtifact($bad);},'reject 25 pending proposals');
$exact=mindmapFixture(true);$exact['nodes'][0]['label']=str_repeat('中',80);$exact['nodes'][0]['description']=str_repeat('x',2000);$exact['proposals'][0]['id']=str_repeat('a',64);$exact['proposals'][0]['label']=str_repeat('x',240);$exact['proposals'][0]['description']=str_repeat('x',2000);
mindmapCheck(validateMindmapArtifact($exact)===$exact,'exact stable-ID, UTF8 label and description bounds');
foreach(array('rootId','label','description','proposalId','proposalParent') as $where){$bad=$fixture;$secret='sk-'.str_repeat('x',20);if($where==='rootId')$bad['rootId']=$secret;elseif($where==='proposalId')$bad['proposals'][0]['id']=$secret;elseif($where==='proposalParent')$bad['proposals'][0]['parentId']=$secret;else $bad['nodes'][0][$where]=$secret;mindmapReject(function()use($bad){validateMindmapArtifact($bad);},'shared secret guard in '.$where,'SECRET_IN_TEXT');}
$size=array('kind'=>'mindmap','rootId'=>'root','nodes'=>array(mindmapFixtureNode('root','','根')),'proposals'=>array());
for($i=1;$i<=30;$i++)$size['nodes'][]=mindmapFixtureNode('n'.$i,'root','節點',str_repeat('x',1800));
$remaining=60000-strlen(jsonEncode($size));foreach($size['nodes'] as &$node){$add=min($remaining,2000-strlen($node['description']));$node['description'].=str_repeat('x',$add);$remaining-=$add;}unset($node);
mindmapCheck($remaining===0&&strlen(jsonEncode(validateMindmapArtifact($size)))===60000,'exact 60000-byte canonical JSON boundary');
$size['nodes'][0]['label'].='x';mindmapReject(function()use($size){validateMindmapArtifact($size);},'reject 60001-byte full artifact without truncation');
$outlineLimit=array('kind'=>'mindmap','rootId'=>'n0','nodes'=>array(),'proposals'=>array());
for($i=0;$i<80;$i++)$outlineLimit['nodes'][]=mindmapFixtureNode('n'.$i,$i===0?'':'n'.($i-1),'節點',str_repeat('x',650));
mindmapCheck(strlen(jsonEncode($outlineLimit))<60000&&strlen(mindmapOutlineContent($outlineLimit))>60000,'deep tree can fit native JSON but exceed full outline byte limit');
mindmapReject(function()use($outlineLimit){validateMindmapArtifact($outlineLimit);},'validator rejects outline overflow before any draft or version can be emitted');

// Full legacy projection is deterministic and clearly separates pending items.
$projection=mindmapItems($fixture);
$expected="已加入心智圖：\n- [root] 社區影展\n  說明：保留各種探索角度。\n  - [culture] 在地文化\n    說明：使用者自填的方向。\n  - [budget] 資源規劃\n\n待選分支（尚未加入心智圖）：\n- [p_memory] 地方記憶（父節點：culture）\n  說明：尚未選取。\n- [p_space] 場域故事（父節點：culture）\n- [p_public] 公共討論（父節點：root）\n- [p_team] 團隊分工（父節點：budget）";
mindmapCheck($projection===array(array('id'=>'document','label'=>'心智圖來源','content'=>$expected)),'exact projection parity fixture, pending separated and no final newline');
mindmapCheck(strpos(mindmapItems($literal)[0]['content'],$literal['nodes'][1]['description'])!==false&&strpos(mindmapItems($literal)[0]['content'],$literal['proposals'][0]['description'])!==false,'projection retains full multiline descriptions');
mindmapCheck(substr(mindmapItems($one)[0]['content'],-strlen('（無）'))==='（無）','empty proposal queue is explicit');
$schema=mindmapSchema();mindmapCheck($schema['additionalProperties']===false&&$schema['properties']['nodes']['items']['additionalProperties']===false&&$schema['properties']['proposals']['maxItems']===24,'strict native schema has complete bounded object lists');
$raw=json_decode(jsonEncode($fixture));artifactJsonSchemaValue($raw,$schema);mindmapCheck(true,'strict raw JSON mindmap shape accepted');
foreach(array('numeric-key nodes object'=>function($v){$v->nodes=(object)array('0'=>$v->nodes[0]);return $v;},'numeric-key proposals object'=>function($v){$v->proposals=(object)array('0'=>$v->proposals[0]);return $v;},'node array in object position'=>function($v){$v->nodes[0]=array();return $v;},'proposal array in object position'=>function($v){$v->proposals[0]=array();return $v;}) as $label=>$mutate){$bad=$mutate(json_decode(jsonEncode($fixture)));mindmapReject(function()use($bad,$schema){artifactJsonSchemaValue($bad,$schema);},'raw JSON rejects '.$label);}

class MindmapFixtureAdapter {
    public $calls=0;public $history=array();public $mode='normal';public $raw=null;
    public function generate($model,$messages,$schema,$maxOutputTokens=6000) {
        $this->calls++;$data=json_decode($messages[1]['content'],true,128,JSON_THROW_ON_ERROR);
        $this->history[]=array('model'=>$model,'messages'=>$messages,'data'=>$data,'schema'=>$schema,'maxOutputTokens'=>$maxOutputTokens);
        if($this->raw!==null)return $this->raw;
        $props=$schema['properties'];$candidate=array('artifact'=>mindmapFixture(true),'rationale'=>'提供多個可繼續探索的待選分支。','goalText'=>'探索社區影展，不過早收斂。','changeSummary'=>'第一次提出待選分支，未加入心智圖。');
        if(isset($props['directionStatus'])){
            $ready=$this->mode!=='exploring';$empty=array('purpose'=>'','audience'=>'','message'=>'','tone'=>'','constraints'=>'','summary'=>'','items'=>array());
            $out=array('reply'=>$ready?'主題已足夠，可以確認方向並生成，也能繼續討論。':'先從一個主題開始。','question'=>$ready?'':'你想探索什麼主題？','choices'=>array(),'directionStatus'=>$ready?'ready':'exploring','direction'=>$ready?mindmapFixtureBrief():$empty);
        }elseif(isset($props['purpose']))$out=mindmapFixtureBrief();
        elseif(isset($props['candidates'])){
            $out=array('candidates'=>array($candidate));
            if($this->mode==='extra_candidate')$out['candidates'][]=$candidate;
            if($this->mode==='auto_accepted')$out['candidates'][0]['artifact']['nodes'][]=mindmapFixtureNode('unasked','root','偷偷加入');
            if($this->mode==='one_proposal')array_pop($out['candidates'][0]['artifact']['proposals']);
            if($this->mode==='thirteen_proposals')for($i=2;$i<13;$i++)$out['candidates'][0]['artifact']['proposals'][]=mindmapFixtureNode('p'.$i,'root','建議');
            if($this->mode==='extra_property')$out['candidates'][0]['artifact']['extra']=true;
        }elseif(isset($props['outcome'])){
            $source=$data['sourceVersion'];$artifact=$source['artifact'];$target=$data['mindmapTargetNodeId'];$pending=array();
            foreach($artifact['proposals'] as $proposal)if($proposal['parentId']!==$target)$pending[]=$proposal;
            $pending[]=mindmapFixtureNode('new_a',$target,'新探索角度甲','供使用者選取。');$pending[]=mindmapFixtureNode('new_b',$target,'新探索角度乙');$artifact['proposals']=$pending;
            $out=array('outcome'=>'revision','reply'=>'這裡提供兩個待選方向，勾選後才會加入草稿。','question'=>'','choices'=>array(),'artifact'=>$artifact,'rationale'=>'保留全部已加入節點與其他待選分支。','goalText'=>versionGoalText($source),'changeSummary'=>'針對選定節點提出子分支。');
            if(in_array($this->mode,array('unchanged','goal_only','metadata_only','combined_revert','proposal_reorder'),true))$out['artifact']=$source['artifact'];
            if($this->mode==='goal_only')$out['goalText']='依使用者本次要求探索跨世代參與。';
            if($this->mode==='metadata_only')$out['rationale']='只有換一種說明方式。';
            if($this->mode==='proposal_reorder'){$out['artifact']['proposals'][0]=$source['artifact']['proposals'][1];$out['artifact']['proposals'][1]=$source['artifact']['proposals'][0];}
            if($this->mode==='accepted_label')$out['artifact']['nodes'][1]['label']='未經選取的改名';
            if($this->mode==='accepted_description')$out['artifact']['nodes'][1]['description']='未經選取的新說明';
            if($this->mode==='accepted_move')$out['artifact']['nodes'][1]['parentId']='budget';
            if($this->mode==='accepted_add')$out['artifact']['nodes'][]=mindmapFixtureNode('unasked','root','自動加入');
            if($this->mode==='accepted_order')$out['artifact']['nodes']=array_reverse($out['artifact']['nodes']);
            if($this->mode==='other_pending_edit')$out['artifact']['proposals'][0]['label']='改動另一節點';
            if($this->mode==='other_pending_delete')array_shift($out['artifact']['proposals']);
            if($this->mode==='other_pending_reorder'){$out['artifact']['proposals'][0]=$pending[1];$out['artifact']['proposals'][1]=$pending[0];}
            if($this->mode==='one_proposal')array_pop($out['artifact']['proposals']);
            if($this->mode==='thirteen_proposals')for($i=2;$i<13;$i++)$out['artifact']['proposals'][]=mindmapFixtureNode('new_'.$i,$target,'建議');
            if($this->mode==='revision_claim')$out['reply']='已經修改了你的心智圖。';
            if($this->mode==='pending_claim')$out['reply']='已更新此節點的待選分支，尚未加入心智圖；勾選後才入圖。';
            if($this->mode==='revision_question')$out['question']='你想先選哪個？';
            if(strpos($this->mode,'clarification')===0){$out['outcome']='clarification';$out['artifact']=$source['artifact'];$out['reply']='可以繼續探索，不必現在收斂。';$out['rationale']='';$out['goalText']='';$out['changeSummary']='';}
            if($this->mode==='clarification_changed')$out['artifact']=$artifact;
            if($this->mode==='clarification_metadata'){$out['rationale']='未使用的解釋';$out['goalText']='不應保存的目標';$out['changeSummary']='不應保存的摘要';}
            if($this->mode==='clarification_claim')$out['reply']='已經修改完成。';
            if($this->mode==='clarification_two_questions'){$out['reply']='你想看哪裡？';$out['question']='你想選哪個？';}
            if($this->mode==='clarification_choices'){$out['question']='你想先探索哪種參與方式？';$out['choices']=array(array('id'=>'local','label'=>'在地參與','value'=>'先探索在地居民的參與方式。'),array('id'=>'open','label'=>'開放參與','value'=>'先探索對外開放的參與方式。'));}
        }elseif(isset($props['artifact'])){
            $out=$candidate;$out['artifact']=$data['selectedVersions'][0]['artifact'];$seen=array_column($out['artifact']['nodes'],'id');
            foreach($data['selectedVersions'][1]['artifact']['nodes'] as $node)if(!in_array($node['id'],$seen,true)){$out['artifact']['nodes'][]=$node;$seen[]=$node['id'];}
            $out['artifact']['proposals'][]=mindmapFixtureNode('fusion_pending','root','融合後的新探索角度');$out['changeSummary']='依各版目標重組，新的角度仍待勾選。';
            if($this->mode==='copy_source')$out['artifact']=$data['selectedVersions'][0]['artifact'];
            if($this->mode==='promote_pending'){$promoted=array_shift($out['artifact']['proposals']);if(!in_array($promoted['id'],$seen,true))$out['artifact']['nodes'][]=$promoted;}
            if($this->mode==='invent_accepted')$out['artifact']['nodes'][]=mindmapFixtureNode('invented','root','新造已加入節點');
            if($this->mode==='rename_accepted')$out['artifact']['nodes'][1]['label']='更名但沒有來源';
            if($this->mode==='reparent_accepted')$out['artifact']['nodes'][1]['parentId']='budget';
        }else{
            $items=array();foreach($data['selectedVersions'] as $version)$items[]=array('versionId'=>$version['id'],'fit'=>'以本版目標比較。','strength'=>'探索方向清楚。','tradeoff'=>'仍有待選分支。','suggestion'=>'可繼續自由輸入。');
            $out=array('items'=>$items,'summary'=>'保留多個探索方向，由使用者判斷。');
        }
        return json_decode(jsonEncode($out),false,128,JSON_THROW_ON_ERROR);
    }
}
function mindmapLastCall($adapter) {return $adapter->history[count($adapter->history)-1];}
function mindmapModuleReject($adapter,$fn,$label,$code='MODEL_OUTPUT_INVALID',$calls=1,$status=502) {$before=$adapter->calls;mindmapReject($fn,$label,$code,$status);mindmapCheck($adapter->calls===$before+$calls,$label.' exact model call count');}
$adapter=new MindmapFixtureAdapter();$module=new MindmapModule($adapter);$project=mindmapFixtureProject();$source=$project['versions'][0];$model='fixed-fixture-v1';
$direction=$module->discuss($project,'主題是社區影展。',$model);$call=mindmapLastCall($adapter);
mindmapCheck($direction['directionStatus']==='ready'&&$direction['direction']['items']===array(array('id'=>'document','label'=>'心智圖來源')),'topic-first readiness with unknown audience and constraints');
mindmapCheck(strpos($call['messages'][0]['content'],'只要已有可探索的主題')!==false&&strpos($call['messages'][0]['content'],'不要求先收斂')!==false,'topic-first prompt does not force premature narrowing');
$adapter->mode='exploring';$discussion=$module->discuss($project,'還沒想到主題。',$model);mindmapCheck($discussion['direction']===null&&$discussion['question']!==''&&$discussion['choices']===array(),'one necessary question when topic missing');
$adapter->mode='normal';mindmapCheck($module->summarize($project,$model)===mindmapFixtureBrief(),'strict seven-field summary');
$before=$adapter->calls;$generated=$module->generate($project,'先探索不同方向。',$model);$call=mindmapLastCall($adapter);
mindmapCheck(count($generated)===1&&count($generated[0]['artifact']['nodes'])===1&&count($generated[0]['artifact']['proposals'])===2,'generation root only, 2 pending branches and no automatic acceptance');
mindmapCheck($adapter->calls===$before+1&&$call['model']===$model&&$call['maxOutputTokens']===24000,'generation one fixed-model 24000-token call');
mindmapCheck($generated[0]['items']===mindmapItems($generated[0]['artifact'])&&strpos($generated[0]['rationale'],'勾選並加入草稿後才入圖')!==false,'generated projection is derived and pending notice deterministic');
mindmapCheck(!isset($call['data']['versions'])&&count($call['data']['versionIndex'])===1&&$call['data']['pinnedReferences']===$project['references'],'generation omits unrelated full artifacts and retains pinned references');
foreach(array('extra_candidate'=>'MODEL_OUTPUT_INVALID','auto_accepted'=>'MODEL_MINDMAP_GENERATION','one_proposal'=>'MODEL_MINDMAP_GENERATION','thirteen_proposals'=>'MODEL_MINDMAP_GENERATION','extra_property'=>'MODEL_OUTPUT_INVALID') as $mode=>$code){$adapter->mode=$mode;mindmapModuleReject($adapter,function()use($module,$project,$model){$module->generate($project,'',$model);},'generation rejects '.$mode,$code);}
$adapter->mode='normal';$before=$adapter->calls;$revision=$module->refine($project,$source,'為這個節點提出子分支。',$model);$call=mindmapLastCall($adapter);
mindmapCheck($revision['outcome']==='revision'&&$revision['artifact']['nodes']===$source['artifact']['nodes']&&$revision['artifact']['rootId']===$source['artifact']['rootId'],'targeted exploration preserves exact accepted tree');
mindmapCheck(array_slice($revision['artifact']['proposals'],0,2)===array_slice($source['artifact']['proposals'],2),'other parents pending proposals remain unchanged');
mindmapCheck($call['data']['mindmapTargetNodeId']==='culture'&&$call['data']['selectedNode']===$source['artifact']['nodes'][1]&&$call['data']['sourceVersion']['artifact']===$source['artifact'],'selected accepted node and full exact source reach model');
mindmapCheck($adapter->calls===$before+1&&$call['maxOutputTokens']===24000&&$project['officialVersionId']===null&&$source===mindmapFixtureVersion(),'unadopted source allowed, one call, source immutable');
foreach(array(null,'missing','p_memory',1) as $target){$bad=$project;$bad['mindmapTargetNodeId']=$target;mindmapModuleReject($adapter,function()use($module,$bad,$source,$model){$module->refine($bad,$source,'探索',$model);},'invalid target rejected before call '.jsonEncode($target),'MINDMAP_TARGET_INVALID',0,409);}
mindmapModuleReject($adapter,function()use($module,$project,$source,$model){$module->refine($project,$source,'探索',$model,array('document'));},'paragraph target rejected before call','TARGET_ITEMS_INVALID',0,409);
foreach(array('accepted_label','accepted_description','accepted_move','accepted_add','accepted_order') as $mode){$adapter->mode=$mode;mindmapModuleReject($adapter,function()use($module,$project,$source,$model){$module->refine($project,$source,'探索',$model);},'reject '.$mode,'MODEL_MINDMAP_ACCEPTED_CHANGED');}
foreach(array('other_pending_edit','other_pending_delete','other_pending_reorder') as $mode){$adapter->mode=$mode;mindmapModuleReject($adapter,function()use($module,$project,$source,$model){$module->refine($project,$source,'探索',$model);},'reject '.$mode,'MODEL_MINDMAP_PENDING_CHANGED');}
foreach(array('one_proposal','thirteen_proposals') as $mode){$adapter->mode=$mode;mindmapModuleReject($adapter,function()use($module,$project,$source,$model){$module->refine($project,$source,'探索',$model);},'reject '.$mode,'MODEL_MINDMAP_PENDING_COUNT');}
foreach(array('unchanged','metadata_only','proposal_reorder') as $mode){$adapter->mode=$mode;mindmapModuleReject($adapter,function()use($module,$project,$source,$model){$module->refine($project,$source,'探索',$model);},'reject fake revision '.$mode,'MODEL_NO_REVISION');}
$adapter->mode='goal_only';$revision=$module->refine($project,$source,'只更新本版目標。',$model);mindmapCheck($revision['artifact']===$source['artifact']&&$revision['goalText']!==$source['goalText'],'goal-only revision echoes full tree and queue unchanged');
$combined=$source;$combined['goalAndRationale']='使用者另外保存的新目標與修改意見。';$adapter->mode='combined_revert';$revision=$module->refine($project,$combined,'請恢復原先的版本目標。',$model);$call=mindmapLastCall($adapter);
mindmapCheck($revision['goalText']===$source['goalText']&&$revision['artifact']===$source['artifact']&&$call['data']['sourceVersion']['goalAndRationale']===$combined['goalAndRationale'],'authoritative combined goal override permits explicit legacy-goal restoration');
$adapter->mode='clarification';$clarification=$module->refine($project,$source,'你覺得這個方向如何？',$model);mindmapCheck($clarification['outcome']==='clarification'&&$clarification['items']===array()&&!isset($clarification['artifact'])&&!isset($clarification['goalText']),'exact clarification source echo discarded without version');
$adapter->mode='clarification_metadata';$clarification=$module->refine($project,$source,'繼續討論。',$model);mindmapCheck($clarification['rationale']===''&&!isset($clarification['goalText'])&&!isset($clarification['changeSummary'])&&!isset($clarification['artifact']),'bounded unused clarification metadata discarded');
$adapter->mode='clarification_choices';$clarification=$module->refine($project,$source,'還想討論。',$model);mindmapCheck(count($clarification['choices'])===2&&!isset($clarification['artifact']),'normal conversation choices remain distinct from branch acceptance');
foreach(array('clarification_changed'=>'MODEL_CLARIFICATION_ARTIFACT','clarification_claim'=>'MODEL_CLARIFICATION_CLAIM','clarification_two_questions'=>'MODEL_QUESTION_COUNT','revision_question'=>'MODEL_OUTPUT_INVALID') as $mode=>$code){$adapter->mode=$mode;mindmapModuleReject($adapter,function()use($module,$project,$source,$model){$module->refine($project,$source,'討論',$model);},'reject '.$mode,$code);}
foreach(array('revision_claim','pending_claim') as $mode){$adapter->mode=$mode;$revision=$module->refine($project,$source,'提出子分支。',$model);mindmapCheck(strpos($revision['reply'],'已加入的節點保持不變')!==false&&strpos($revision['reply'],'已經修改了你的心智圖')===false,'deterministic truthful revision reply for '.$mode);}
$adapter->mode='normal';$rootProject=$project;$rootProject['mindmapTargetNodeId']='root';$revision=$module->refine($rootProject,$source,'再探索主題分支。',$model);mindmapCheck($revision['artifact']['nodes']===$source['artifact']['nodes'],'accepted root can be target for more pending branches');
$fullQueue=$source;$fullQueue['artifact']['proposals']=array_slice($source['artifact']['proposals'],0,2);
for($i=0;$i<22;$i++)$fullQueue['artifact']['proposals'][]=mindmapFixtureNode('outside_'.$i,'root','其他節點的待選分支');
$fullQueue['items']=mindmapItems($fullQueue['artifact']);$revision=$module->refine($project,$fullQueue,'為選定節點換一組子分支。',$model);
mindmapCheck(count($revision['artifact']['proposals'])===24&&array_slice($revision['artifact']['proposals'],0,22)===array_slice($fullQueue['artifact']['proposals'],2),'refinement at 24-proposal limit preserves all other parents');
$blockedQueue=$fullQueue;array_shift($blockedQueue['artifact']['proposals']);$blockedQueue['artifact']['proposals'][]=mindmapFixtureNode('outside_22','root','還有其他待選分支');$blockedQueue['items']=mindmapItems($blockedQueue['artifact']);
mindmapModuleReject($adapter,function()use($module,$project,$blockedQueue,$model){$module->refine($project,$blockedQueue,'再提出子分支。',$model);},'refinement cannot exceed total pending limit to fit new proposals');

// Fusion accepts only selected accepted-node identities, never pending-only IDs.
$other=mindmapFixtureVersion('b');$other['artifact']['nodes'][]=mindmapFixtureNode('research','root','研究素材','第二來源已加入。');$other['items']=mindmapItems($other['artifact']);$other['goalAndRationale']='使用者保存的另一版最新目標。';
$before=$adapter->calls;$fusion=$module->fuse($project,array($source,$other),'保留兩版不同的探索方向。',$model);$call=mindmapLastCall($adapter);
mindmapCheck(count($fusion['artifact']['nodes'])===4&&$fusion['items']===mindmapItems($fusion['artifact'])&&$adapter->calls===$before+1&&$call['maxOutputTokens']===24000,'fusion complete native artifact in one fixed-model call');
mindmapCheck($call['data']['creativeGoal']===null&&$call['data']['selectedVersions'][1]['goalAndRationale']===$other['goalAndRationale']&&$call['data']['pinnedReferences']===$project['references'],'fusion selected version goals, provenance and pinned references retained');
mindmapCheck($call['data']['selectedVersions'][0]['provenance']===$source['provenance']&&$call['data']['selectedVersions'][0]['discussionMessageIds']===$source['discussionMessageIds'],'model and discussion provenance preserved in source snapshots');
foreach(array(array($source),array($source,$source),array($source,$other,$source,$other,$source,$other)) as $versions)mindmapModuleReject($adapter,function()use($module,$project,$versions,$model){$module->fuse($project,$versions,'融合',$model);},'invalid fusion sources rejected before call','FUSION_VERSIONS_INVALID',0,409);
foreach(array('promote_pending','invent_accepted','rename_accepted') as $mode){$adapter->mode=$mode;mindmapModuleReject($adapter,function()use($module,$project,$source,$other,$model){$module->fuse($project,array($source,$other),'融合',$model);},'fusion rejects '.$mode,'MODEL_MINDMAP_FUSION_NODE');}
$adapter->mode='copy_source';mindmapModuleReject($adapter,function()use($module,$project,$source,$other,$model){$module->fuse($project,array($source,$other),'融合',$model);},'fusion rejects identical full source','MODEL_NO_REVISION');
$adapter->mode='reparent_accepted';$fusion=$module->fuse($project,array($source,$other),'重組關係。',$model);mindmapCheck(mindmapNode($fusion['artifact'],'culture')['parentId']==='budget','fusion may reorganize parentId of known accepted identity');
$cross=$other;$cross['artifact']['nodes'][]=$source['artifact']['proposals'][0];array_shift($cross['artifact']['proposals']);$cross['items']=mindmapItems($cross['artifact']);$adapter->mode='promote_pending';
$fusion=$module->fuse($project,array($source,$cross),'整合兩版已加入的節點。',$model);mindmapCheck(mindmapNode($fusion['artifact'],'p_memory')!==null,'accepted in any selected source can enter union even if pending in another');
$adapter->mode='normal';$comparison=$module->compare($project,array($source,$other),'依各版目標比較。',$model);$call=mindmapLastCall($adapter);
mindmapCheck(count($comparison['items'])===2&&$call['data']['selectedVersions'][0]['artifact']===$source['artifact']&&$call['data']['selectedVersions'][1]['goalAndRationale']===$other['goalAndRationale'],'inherited comparison receives complete native snapshots and each version goal');
$adapter->raw=(object)array('candidates'=>(object)array());mindmapModuleReject($adapter,function()use($module,$project,$model){$module->generate($project,'',$model);},'provider raw JSON object-array distinction enforced');$adapter->raw=null;
echo 'PASS '.$mindmapChecks." native mindmap checks. No real provider or network used.\n";
