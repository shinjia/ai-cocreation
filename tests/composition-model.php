<?php
/**
 * Native PHP 7.4+ injected-model fixtures. Run: php tests/composition-model.php
 * UNEXECUTED in the authoring environment: PHP is unavailable.
 * Requires shared illustrated/poster content, bootstrap and adapter integration.
 * Node source contracts and independent JS oracles are NOT PHP execution,
 * PHP syntax validation, HTTP, real-provider, media-access or browser tests.
 * No credentials, network, paid inference, database, file writes or publication.
 */
require_once dirname(__DIR__).'/app/bootstrap.php';
require_once dirname(__DIR__).'/app/composition.php';
require_once dirname(__DIR__).'/app/modules/composition.php';
$compositionModelChecks=0;
function compositionModelCheck($ok,$label) {global $compositionModelChecks;if(!$ok)throw new RuntimeException('FAIL '.$label);$compositionModelChecks++;echo 'PASS '.$label."\n";}
function compositionModelReject($fn,$label,$code='MODEL_OUTPUT_INVALID',$status=502) {$error=null;try{$fn();}catch(AppError $e){$error=$e;}compositionModelCheck($error instanceof AppError&&$error->errorCode===$code&&$error->status===$status,$label);}
function compositionModelPin($id='1',$version='a') {
    $artifact=array('kind'=>'image','title'=>'使用者選定的圖片','alt'=>'使用者提供的替代說明，不是模型視覺分析。','attribution'=>'使用者提供',
        'asset'=>array('id'=>str_repeat($version==='a'?'e':'7',32),'mime'=>'image/png','width'=>640,'height'=>480,'byteLength'=>1024,'sha256'=>str_repeat($version==='a'?'f':'6',64),'normalization'=>'png-v1'));
    $snapshot=array('id'=>str_repeat($version,32),'title'=>'圖片固定版本','contentType'=>'image','artifact'=>$artifact,'items'=>imageArtifactItems($artifact),'goalText'=>'原圖目標','provenance'=>array('kind'=>'upload'));
    return array('id'=>str_repeat($id,32),'projectId'=>str_repeat('8',32),'targetItemId'=>str_repeat('d',32),'targetItemTitle'=>'既有圖片','versionId'=>$snapshot['id'],'versionSnapshot'=>$snapshot,'pinnedAt'=>'2026-01-01T00:00:00+00:00');
}
function compositionModelArtifact($type,$images=true) {
    if($type==='poster'){
        $blocks=array(array('id'=>'headline','type'=>'headline','text'=>'社區影展','imageRefId'=>'','alignment'=>'center'),array('id'=>'details','type'=>'text','text'=>" 一起閱讀與分享。\n時間由使用者確認。 ",'imageRefId'=>'','alignment'=>'left'));
        if($images)$blocks[]=array('id'=>'photo','type'=>'image','text'=>'使用者提供的圖片','imageRefId'=>str_repeat('1',32),'alignment'=>'center');
        return array('kind'=>'poster','title'=>'社區影展海報','format'=>'portrait','theme'=>'paper','blocks'=>$blocks);
    }
    return array('kind'=>'illustrated','title'=>'社區影展圖文','theme'=>'paper','blocks'=>array(
        array('id'=>'intro','heading'=>'社區影展','body'=>" 一起閱讀與分享。\n保留原文。 ",'layout'=>'text','imageRefId'=>'','caption'=>''),
        array('id'=>'story','heading'=>'生活記憶','body'=>'文字段落內容。','layout'=>$images?'left':'text','imageRefId'=>$images?str_repeat('1',32):'','caption'=>$images?'使用者提供的圖片':'')));
}
function compositionModelBrief($type) {return array('purpose'=>'介紹社區影展','audience'=>'社區居民','message'=>'社區影展與完整活動文字','tone'=>'paper 明亮紙感','constraints'=>'文字搭配固定圖片，不更換圖片來源','summary'=>'以明亮紙感呈現社區影展完整文字與明確釘選的既有圖片。','items'=>array(array('id'=>'document','label'=>$type==='poster'?'海報來源':'圖文來源')));}
function compositionModelVersion($type,$id='b',$images=true) {
    $artifact=compositionModelArtifact($type,$images);
    return array('id'=>str_repeat($id,32),'number'=>1,'major'=>1,'minor'=>0,'title'=>'來源 '.$id,'artifact'=>$artifact,'items'=>compositionItems($artifact,$type),'contentType'=>$type,
        'rationale'=>'來源排版說明','source'=>'manual','basedOnVersionId'=>null,'goalText'=>'以明亮風格介紹社區影展。','changeSummary'=>'原有完整快照','goalSnapshot'=>compositionModelBrief($type),
        'referencesSnapshot'=>$images?array(compositionModelPin()):array(),'discussionMessageIds'=>array('fixture_message'),'provenance'=>array('model'=>'fixed-fixture-v1'),'createdAt'=>'2026-01-01T00:00:00+00:00');
}
function compositionModelProject($type,$images=true) {return array('title'=>'原生排版測試','description'=>'圖文與海報','module'=>$type,'activeItem'=>array('title'=>'社區影展','description'=>'固定排版作品'),'references'=>$images?array(compositionModelPin()):array(),'messages'=>array(),'brief'=>compositionModelBrief($type),'goalApprovedAt'=>'2026-01-01T00:00:00+00:00','officialVersionId'=>null,'versions'=>array(compositionModelVersion($type,'b',$images)));}
function compositionModelRename($artifact) {foreach($artifact['blocks'] as &$block)$block['id']='renamed_'.$block['id'];unset($block);return $artifact;}
function compositionModelImageRef($artifact,$ref) {foreach($artifact['blocks'] as &$block)if($block['imageRefId']!=='')$block['imageRefId']=$ref;unset($block);return $artifact;}
class CompositionFixtureAdapter {
    public $type;public $mode='normal';public $calls=0;public $history=array();public $raw=null;public $images=true;
    public function __construct($type){$this->type=$type;}
    public function generate($model,$messages,$schema,$maxOutputTokens=6000) {
        $this->calls++;$data=json_decode($messages[1]['content'],true,64,JSON_THROW_ON_ERROR);$this->history[]=array('model'=>$model,'messages'=>$messages,'schema'=>$schema,'maxOutputTokens'=>$maxOutputTokens,'data'=>$data,'argumentCount'=>func_num_args());
        if($this->raw!==null)return $this->raw;
        $props=$schema['properties'];$candidate=array('artifact'=>compositionModelArtifact($this->type,$this->images),'rationale'=>'依固定文字與圖片中繼資料安排原生版面，未觀看圖片像素。','goalText'=>'以明亮風格介紹社區影展。','changeSummary'=>'初次整理已確認的原生排版。');
        if(isset($props['directionStatus'])){$out=array('reply'=>'主軸已足夠，可以確認方向並生成，也能繼續討論。','question'=>'','choices'=>array(),'directionStatus'=>'ready','direction'=>compositionModelBrief($this->type));if($this->mode==='exploring'){$out['directionStatus']='exploring';$out['question']='你想先傳達哪個重點？';$out['reply']='可以先聚焦重點。';$out['direction']=array('purpose'=>'','audience'=>'','message'=>'','tone'=>'','constraints'=>'','summary'=>'','items'=>array());}}
        elseif(isset($props['purpose']))$out=compositionModelBrief($this->type);
        elseif(isset($props['candidates'])){
            $out=array('candidates'=>array($candidate));
            if($this->mode==='extra_candidate')$out['candidates'][]=$candidate;
            if($this->mode==='extra_property')$out['candidates'][0]['artifact']['url']='not-allowed';
            if($this->mode==='unknown_pin')$out['candidates'][0]['artifact']=compositionModelImageRef($candidate['artifact'],str_repeat('9',32));
            if($this->mode==='asset_as_pin')$out['candidates'][0]['artifact']=compositionModelImageRef($candidate['artifact'],str_repeat('e',32));
            if($this->mode==='url_as_pin')$out['candidates'][0]['artifact']=compositionModelImageRef($candidate['artifact'],'https://example.invalid/image.png');
            if($this->mode==='wrong_kind')$out['candidates'][0]['artifact']['kind']='image';
            if($this->mode==='huge_response')$out['candidates'][0]['rationale']=str_repeat('x',90001);
        }elseif(isset($props['outcome'])){
            $source=$data['sourceVersion'];$out=array_merge($candidate,array('outcome'=>'revision','reply'=>'提供一個完整修訂候選。','question'=>'','choices'=>array(),'artifact'=>$source['artifact'],'goalText'=>$source['goalText'],'changeSummary'=>'主題改為 night。'));$out['artifact']['theme']='night';
            if(in_array($this->mode,array('unchanged','metadata_only','goal_only','combined_revert','ids_only','ids_goal_change','pin_alias','pin_alias_goal'),true))$out['artifact']=$source['artifact'];
            if($this->mode==='ids_only'||$this->mode==='ids_goal_change')$out['artifact']=compositionModelRename($source['artifact']);
            if($this->mode==='goal_only'||$this->mode==='ids_goal_change'||$this->mode==='pin_alias_goal')$out['goalText']='僅更新本版目標，保留完整作品。';
            if($this->mode==='pin_alias'||$this->mode==='pin_alias_goal')$out['artifact']=compositionModelImageRef($source['artifact'],str_repeat('2',32));
            if($this->mode==='new_image')$out['artifact']=compositionModelImageRef($source['artifact'],str_repeat('3',32));
            if($this->mode==='title_only'){$out['artifact']=$source['artifact'];$out['artifact']['title']='新的作品標題';}
            if($this->mode==='unknown_pin')$out['artifact']=compositionModelImageRef($source['artifact'],str_repeat('9',32));
            if($this->mode==='revision_question')$out['question']='你還要改什麼？';
            if($this->mode==='revision_claim')$out['reply']='已經採用並取代正式版。';
            if(strpos($this->mode,'clarification')===0){$out=array('outcome'=>'clarification','reply'=>'可以討論原生排版結構，但我未觀看圖片像素。','question'=>'','choices'=>array(),'artifact'=>$source['artifact'],'rationale'=>'','goalText'=>'','changeSummary'=>'');
                if($this->mode==='clarification_changed')$out['artifact']['theme']='night';
                if($this->mode==='clarification_ids')$out['artifact']=compositionModelRename($source['artifact']);
                if($this->mode==='clarification_metadata'){$out['rationale']='討論說明';$out['goalText']='不保存的目標';$out['changeSummary']='不保存的摘要';}
                if($this->mode==='clarification_claim')$out['reply']='已經修改完成。';
                if($this->mode==='clarification_two_questions'){$out['reply']='要改哪裡？';$out['question']='哪個風格？';}
                if($this->mode==='clarification_choices'){$out['question']='你想討論哪個主題？';$out['choices']=array(array('id'=>'paper','label'=>'明亮','value'=>'討論 paper。'),array('id'=>'night','label'=>'深色','value'=>'討論 night。'));}
            }
        }elseif(isset($props['artifact'])){
            $out=$candidate;$out['artifact']=$data['selectedVersions'][0]['artifact'];$out['artifact']['theme']='night';$out['artifact']['title']='融合後的完整作品';$out['changeSummary']='整合兩版文字與排列。';
            if($this->mode==='copy_source')$out['artifact']=$data['selectedVersions'][0]['artifact'];
            if($this->mode==='copy_second')$out['artifact']=$data['selectedVersions'][1]['artifact'];
            if($this->mode==='ids_copy')$out['artifact']=compositionModelRename($data['selectedVersions'][0]['artifact']);
            if($this->mode==='pin_alias_copy')$out['artifact']=compositionModelImageRef($data['selectedVersions'][0]['artifact'],str_repeat('2',32));
            if($this->mode==='reorder_source'){$out['artifact']=$data['selectedVersions'][0]['artifact'];$out['artifact']['blocks']=array_reverse($out['artifact']['blocks']);}
            if($this->mode==='unknown_pin')$out['artifact']=compositionModelImageRef($out['artifact'],str_repeat('9',32));
        }else{
            $items=array();foreach($data['selectedVersions'] as $version)$items[]=array('versionId'=>$version['id'],'fit'=>'依本版目標比較。','strength'=>'原生結構清楚。','tradeoff'=>'只能依文字和中繼資料判斷。','suggestion'=>'可調整文字排列。');$out=array('items'=>$items,'summary'=>'依各版目標選擇，不預設優勝。');
            if($this->mode==='duplicate_comparison')$out['items'][1]=$out['items'][0];
            if($this->mode==='foreign_comparison')$out['items'][0]['versionId']=str_repeat('9',32);
        }
        return json_decode(jsonEncode($out),false,128,JSON_THROW_ON_ERROR);
    }
}
function compositionModelLastCall($adapter) {return $adapter->history[count($adapter->history)-1];}
function compositionModelCallReject($adapter,$fn,$label,$code='MODEL_OUTPUT_INVALID',$calls=1,$status=502) {$before=$adapter->calls;compositionModelReject($fn,$label,$code,$status);compositionModelCheck($adapter->calls===$before+$calls,$label.' exact model call count');}
compositionModelReject(function(){new CompositionModule(new CompositionFixtureAdapter('poster'),'image');},'unsupported composition type rejected','MODULE_UNAVAILABLE',409);
foreach(array('illustrated','poster') as $type){
    $adapter=new CompositionFixtureAdapter($type);$module=new CompositionModule($adapter,$type);$project=compositionModelProject($type);$source=$project['versions'][0];$model='fixed-fixture-v1';$prefix=$type.': ';
    $discussion=$module->discuss($project,'完整文字搭配明亮原生排版。',$model);$call=compositionModelLastCall($adapter);
    compositionModelCheck($discussion['directionStatus']==='ready'&&$discussion['direction']['items']===compositionModelBrief($type)['items'],$prefix.'strict seven-field direction uses own document label');
    if($type==='poster')foreach(array('tone=視覺風格','message=完整文字內容','constraints=圖文排列','ready 只表示可以請使用者確認三部分') as $phrase)compositionModelCheck(strpos($call['messages'][0]['content'],$phrase)!==false,$prefix.'three-part direction mapping '.$phrase);
    $adapter->mode='exploring';$discussion=$module->discuss($project,'還沒有核心重點。',$model);compositionModelCheck($discussion['direction']===null&&$discussion['question']!=='',$prefix.'one necessary question without saving exploratory direction');
    $adapter->mode='normal';compositionModelCheck($module->summarize($project,$model)===compositionModelBrief($type),$prefix.'strict summary retains composition label');
    $before=$adapter->calls;$generated=$module->generate($project,'保留完整內容。',$model);$call=compositionModelLastCall($adapter);
    compositionModelCheck(count($generated)===1&&$generated[0]['artifact']===compositionModelArtifact($type)&&$generated[0]['items']===compositionItems($generated[0]['artifact'],$type),$prefix.'generate one full native candidate');
    compositionModelCheck($generated[0]['referencesSnapshot']===array(compositionModelPin()),$prefix.'result preserves exact used image pins for app ownership resolution');
    compositionModelCheck($adapter->calls===$before+1&&$call['model']===$model&&$call['maxOutputTokens']===24000&&$call['argumentCount']===4,$prefix.'one bounded fixed-text-model call without image input or retry');
    compositionModelCheck(!isset($call['data']['versions'])&&count($call['data']['versionIndex'])===1&&$call['data']['imagePixelsProvided']===false,$prefix.'generation omits unrelated complete versions and declares no pixels');
    $metadata=$call['data']['availableImageReferences'][0]['versionSnapshot'];compositionModelCheck($metadata['alt']===compositionModelPin()['versionSnapshot']['artifact']['alt']&&$metadata['pixelsProvided']===false&&!isset($metadata['asset'])&&!isset($metadata['items'])&&!isset($metadata['artifact']),$prefix.'image allowlist contains metadata only, no media transport fields');
    foreach(array('extra_candidate','extra_property','url_as_pin','wrong_kind','huge_response') as $mode){$adapter->mode=$mode;compositionModelCallReject($adapter,function()use($module,$project,$model){$module->generate($project,'',$model);},$prefix.'generation rejects '.$mode);}
    foreach(array('unknown_pin','asset_as_pin') as $mode){$adapter->mode=$mode;compositionModelCallReject($adapter,function()use($module,$project,$model){$module->generate($project,'',$model);},$prefix.'generation rejects '.$mode,'MODEL_IMAGE_REFERENCE_INVALID');}
    $adapter->raw=(object)array('candidates'=>(object)array());compositionModelCallReject($adapter,function()use($module,$project,$model){$module->generate($project,'',$model);},$prefix.'raw object-array distinction retained');$adapter->raw=null;
    $adapter->mode='normal';$plain=compositionModelProject($type,false);$adapter->images=false;$generated=$module->generate($plain,'先做純文字。',$model);$call=compositionModelLastCall($adapter);
    compositionModelCheck($generated[0]['referencesSnapshot']===array()&&$call['data']['availableImageReferences']===array()&&$generated[0]['artifact']===compositionModelArtifact($type,false),$prefix.'honest text-only layout works without fake images');$adapter->images=true;
    $oversize=$project;$oversize['description']=str_repeat('x',600001);compositionModelCallReject($adapter,function()use($module,$oversize,$model){$module->generate($oversize,'',$model);},$prefix.'complete context budget rejects before model','CONTEXT_LIMIT',0,409);
    $before=$adapter->calls;$revision=$module->refine($project,$source,'只將主題改為 night。',$model);$call=compositionModelLastCall($adapter);
    compositionModelCheck($revision['outcome']==='revision'&&$revision['artifact']['theme']==='night'&&$revision['artifact']['blocks']===$source['artifact']['blocks'],$prefix.'real refinement preserves literal text, block order, IDs and fixed images');
    compositionModelCheck($adapter->calls===$before+1&&$call['data']['sourceVersion']['artifact']===$source['artifact']&&$call['data']['latestUserMessage']==='只將主題改為 night。'&&$project['officialVersionId']===null,$prefix.'unadopted exact source is sole refinement base');
    compositionModelCallReject($adapter,function()use($module,$project,$source,$model){$module->refine($project,$source,'修改',$model,array('document'));},$prefix.'paragraph selection rejected before inference','TARGET_ITEMS_INVALID',0,409);
    foreach(array('unchanged','metadata_only','ids_only','ids_goal_change') as $mode){$adapter->mode=$mode;compositionModelCallReject($adapter,function()use($module,$project,$source,$model){$module->refine($project,$source,'修改',$model);},$prefix.'ID-only or metadata-only revision rejected '.$mode,'MODEL_NO_REVISION');}
    $adapter->mode='goal_only';$revision=$module->refine($project,$source,'只更新目標。',$model);compositionModelCheck($revision['artifact']===$source['artifact']&&strpos($revision['reply'],'僅更新本版目標')!==false,$prefix.'goal-only revision requires exact unchanged artifact');
    $combined=$source;$combined['goalAndRationale']='使用者保存的最新完整目標與修改意見。';$adapter->mode='combined_revert';$revision=$module->refine($project,$combined,'恢復先前目標。',$model);$call=compositionModelLastCall($adapter);
    compositionModelCheck($revision['artifact']===$source['artifact']&&$revision['goalText']===$source['goalText']&&$call['data']['sourceVersion']['goalAndRationale']===$combined['goalAndRationale'],$prefix.'combined goal authority allows deliberate legacy goal restoration');
    $adapter->mode='ids_only';compositionModelCallReject($adapter,function()use($module,$project,$combined,$model){$module->refine($project,$combined,'修改目標。',$model);},$prefix.'combined goal change cannot authorize ID-only artifact churn','MODEL_NO_REVISION');
    $adapter->mode='title_only';$revision=$module->refine($project,$source,'更新作品標題。',$model);compositionModelCheck($revision['artifact']['title']==='新的作品標題',$prefix.'visible title change is a real revision');
    $adapter->mode='clarification';$clarification=$module->refine($project,$source,'討論排列。',$model);compositionModelCheck($clarification['items']===array()&&!isset($clarification['artifact'])&&!isset($clarification['goalText'])&&!isset($clarification['referencesSnapshot']),$prefix.'exact source echo discarded without saving artifact or pins');
    $adapter->mode='clarification_metadata';$clarification=$module->refine($project,$source,'繼續討論。',$model);compositionModelCheck($clarification['rationale']===''&&!isset($clarification['goalText'])&&!isset($clarification['changeSummary']),$prefix.'bounded unused clarification goal metadata discarded');
    $adapter->mode='clarification_choices';$clarification=$module->refine($project,$source,'談風格。',$model);compositionModelCheck(count($clarification['choices'])===2&&!isset($clarification['artifact']),$prefix.'clarification choices never create a candidate');
    foreach(array('clarification_changed'=>'MODEL_CLARIFICATION_ARTIFACT','clarification_ids'=>'MODEL_CLARIFICATION_ARTIFACT','clarification_claim'=>'MODEL_CLARIFICATION_CLAIM','clarification_two_questions'=>'MODEL_QUESTION_COUNT','revision_question'=>'MODEL_OUTPUT_INVALID','unknown_pin'=>'MODEL_IMAGE_REFERENCE_INVALID') as $mode=>$code){$adapter->mode=$mode;compositionModelCallReject($adapter,function()use($module,$project,$source,$model){$module->refine($project,$source,'討論或修改。',$model);},$prefix.'reject '.$mode,$code);}
    $adapter->mode='revision_claim';$revision=$module->refine($project,$source,'改主題。',$model);compositionModelCheck(strpos($revision['reply'],'尚未採用、定稿或取代正式版')!==false&&strpos($revision['reply'],'已經採用')===false,$prefix.'deterministic revision reply cannot promote candidate');
    // Historical source pins survive current-list removal; no auto-refresh.
    $removed=$project;$removed['references']=array();$adapter->mode='normal';$revision=$module->refine($removed,$source,'改主題，不換圖片。',$model);$call=compositionModelLastCall($adapter);
    compositionModelCheck($revision['referencesSnapshot']===$source['referencesSnapshot']&&$call['data']['availableImageReferences'][0]['versionId']===compositionModelPin()['versionId'],$prefix.'removed current pin is preserved from explicit source snapshot');
    $missing=$source;$missing['referencesSnapshot']=array();compositionModelCallReject($adapter,function()use($module,$removed,$missing,$model){$module->refine($removed,$missing,'改主題。',$model);},$prefix.'missing historical pin blocks before inference','COMPOSITION_REFERENCE_MISSING',0,409);
    $brokenImage=$project;$brokenImage['references'][0]['versionSnapshot']['artifact']['asset']['mime']='image/jpeg';compositionModelCallReject($adapter,function()use($module,$brokenImage,$model){$module->generate($brokenImage,'',$model);},$prefix.'invalid stored image metadata blocks before inference','COMPOSITION_REFERENCE_INVALID',0,409);
    $badSnapshot=$project;$badSnapshot['references'][0]['versionSnapshot']['id']=str_repeat('4',32);compositionModelCallReject($adapter,function()use($module,$badSnapshot,$model){$module->generate($badSnapshot,'',$model);},$prefix.'pin version identity mismatch blocks before inference','COMPOSITION_REFERENCE_INVALID',0,409);
    $conflict=$project;$conflict['references'][0]=compositionModelPin('1','9');compositionModelCallReject($adapter,function()use($module,$conflict,$source,$model){$module->refine($conflict,$source,'改主題。',$model);},$prefix.'historical pin cannot silently refresh to another version','COMPOSITION_REFERENCE_CONFLICT',0,409);
    $alias=$project;$alias['references'][]=compositionModelPin('2','a');foreach(array('pin_alias','pin_alias_goal') as $mode){$adapter->mode=$mode;compositionModelCallReject($adapter,function()use($module,$alias,$source,$model){$module->refine($alias,$source,'修改。',$model);},$prefix.'same fixed-image alias is not a visible revision '.$mode,'MODEL_NO_REVISION');}
    $newImage=$project;$newImage['references'][]=compositionModelPin('3','9');$adapter->mode='new_image';$revision=$module->refine($newImage,$source,'改用已釘選的新圖片。',$model);compositionModelCheck(count($revision['referencesSnapshot'])===1&&$revision['referencesSnapshot'][0]['id']===str_repeat('3',32),$prefix.'explicitly pinned different image is allowed and only used pins returned');
    $other=compositionModelVersion($type,'c');$other['artifact']['theme']=$type==='poster'?'festival':'meadow';$other['items']=compositionItems($other['artifact'],$type);$other['goalAndRationale']='第二版自己不同的最新目標。';$adapter->mode='normal';
    $before=$adapter->calls;$fusion=$module->fuse($removed,array($source,$other),'融合完整文字與版面。',$model);$call=compositionModelLastCall($adapter);
    compositionModelCheck($fusion['artifact']['title']==='融合後的完整作品'&&$fusion['items']===compositionItems($fusion['artifact'],$type)&&$fusion['referencesSnapshot']===$source['referencesSnapshot'],$prefix.'fusion returns one real complete candidate with old pins');
    compositionModelCheck($adapter->calls===$before+1&&$call['data']['creativeGoal']===null&&$call['data']['goalApprovedAt']===null&&$call['data']['selectedVersions'][1]['goalAndRationale']===$other['goalAndRationale']&&$call['maxOutputTokens']===24000,$prefix.'fusion uses each selected version goal and one bounded fixed-model call');
    foreach(array(null,array(),array($source),array($source,$source),array('first'=>$source,'second'=>$other),array($source,$other,$source,$other,$source,$other)) as $versions)compositionModelCallReject($adapter,function()use($module,$project,$versions,$model){$module->fuse($project,$versions,'融合。',$model);},$prefix.'invalid fusion selection before inference','FUSION_VERSIONS_INVALID',0,409);
    foreach(array('copy_source','copy_second','ids_copy') as $mode){$adapter->mode=$mode;compositionModelCallReject($adapter,function()use($module,$project,$source,$other,$model){$module->fuse($project,array($source,$other),'融合。',$model);},$prefix.'fusion rejects '.$mode,'MODEL_NO_REVISION');}
    $adapter->mode='pin_alias_copy';compositionModelCallReject($adapter,function()use($module,$alias,$source,$other,$model){$module->fuse($alias,array($source,$other),'融合。',$model);},$prefix.'fusion rejects alias-only copy of source','MODEL_NO_REVISION');
    $adapter->mode='reorder_source';$fusion=$module->fuse($project,array($source,$other),'重新整合順序。',$model);compositionModelCheck($fusion['artifact']['blocks']===array_reverse($source['artifact']['blocks']),$prefix.'genuine block-order changes remain observable');
    $adapter->mode='normal';$comparison=$module->compare($removed,array($source,$other),'依各版目標比較。',$model);$call=compositionModelLastCall($adapter);
    compositionModelCheck(count($comparison['items'])===2&&strpos($comparison['summary'],'沒有檢視圖片像素')!==false&&$call['data']['creativeGoal']===null&&$call['data']['selectedVersions'][1]['goalAndRationale']===$other['goalAndRationale']&&$call['data']['availableImageReferences'][0]['versionId']===compositionModelPin()['versionId'],$prefix.'comparison uses complete selected snapshots, own goals and old image metadata only');
    foreach(array('duplicate_comparison','foreign_comparison') as $mode){$adapter->mode=$mode;compositionModelCallReject($adapter,function()use($module,$project,$source,$other,$model){$module->compare($project,array($source,$other),'比較。',$model);},$prefix.'reject '.$mode);}
    compositionModelCallReject($adapter,function()use($module,$project,$source,$model){$module->compare($project,array($source,$source),'比較。',$model);},$prefix.'duplicate comparison before inference','COMPARISON_SELECTION',0,409);
    compositionModelCheck($source===compositionModelVersion($type)&&$project===compositionModelProject($type),$prefix.'all input project and source snapshots stay immutable');
}
echo 'PASS '.$compositionModelChecks." native composition model checks. No real provider, credentials or network used.\n";
