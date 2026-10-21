<?php
/**
 * Native PHP 7.4+ injected-model fixtures: php tests/webpage-image-model.php
 * UNEXECUTED in the authoring environment: PHP is unavailable.
 * Node source contracts and lexer checks are NOT PHP syntax/runtime, HTTP,
 * media-ownership, real-provider, browser or export verification.
 * No credentials, real inference, database, file writes, network or publication.
 */
require_once dirname(__DIR__).'/app/bootstrap.php';
require_once dirname(__DIR__).'/app/webpage.php';
require_once dirname(__DIR__).'/app/modules/webpage.php';
$webpageImageModelChecks=0;
function wimCheck($ok,$label) {global $webpageImageModelChecks;if(!$ok)throw new RuntimeException('FAIL '.$label);$webpageImageModelChecks++;echo 'PASS '.$label."\n";}
function wimReject($adapter,$fn,$label,$code,$calls=1,$status=502) {$before=$adapter->calls;$error=null;try{$fn();}catch(AppError $e){$error=$e;}wimCheck($error instanceof AppError&&$error->errorCode===$code&&$error->status===$status,$label);wimCheck($adapter->calls===$before+$calls,$label.' exact model call count');}
function wimPin($id='1',$version='a') {
    $artifact=array('kind'=>'image','title'=>'固定圖片','alt'=>'使用者提供的替代說明','attribution'=>'使用者提供',
        'asset'=>array('id'=>str_repeat($version==='a'?'e':'7',32),'mime'=>'image/png','width'=>640,'height'=>480,'byteLength'=>1024,'sha256'=>str_repeat($version==='a'?'f':'6',64),'normalization'=>'png-v1'));
    return array('id'=>str_repeat($id,32),'projectId'=>str_repeat('8',32),'targetItemId'=>str_repeat('d',32),'targetItemTitle'=>'既有圖片','versionId'=>str_repeat($version,32),
        'versionSnapshot'=>array('id'=>str_repeat($version,32),'title'=>'圖片固定版本','contentType'=>'image','artifact'=>$artifact,'items'=>imageArtifactItems($artifact),'goalText'=>'原圖目標','provenance'=>array('kind'=>'upload')),'pinnedAt'=>'2026-01-01T00:00:00+00:00');
}
function wimArtifact($image=true) {
    $sections=array(array('id'=>'intro','type'=>'hero','eyebrow'=>'','heading'=>'社區影展','body'=>" 原文與換行。\n保留全部。 ",'entries'=>array(),'actionLabel'=>'閱讀介紹','actionTarget'=>'about'),
        array('id'=>'about','type'=>'text','eyebrow'=>'','heading'=>'介紹','body'=>'文字內容。','entries'=>array(),'actionLabel'=>'','actionTarget'=>''));
    if($image)$sections[]=array('id'=>'photo','type'=>'image','eyebrow'=>'','heading'=>'固定圖片','body'=>'依使用者提供資料編排。',
        'entries'=>array(array('id'=>str_repeat('1',32),'title'=>'使用者指定的替代文字','body'=>" 原有圖說。\n ")),'actionLabel'=>'','actionTarget'=>'');
    return array('kind'=>'webpage','title'=>'社區影展','theme'=>'paper','navigation'=>true,'sections'=>$sections);
}
function wimBrief() {return array('purpose'=>'介紹影展','audience'=>'社區居民','message'=>'首屏、介紹、固定圖片','tone'=>'paper 明亮紙感','constraints'=>'頁內導覽與固定圖片，不使用外部圖片','summary'=>'以原生網頁呈現介紹與明確選定的固定圖片。','items'=>array(array('id'=>'document','label'=>'網頁來源')));}
function wimVersion($id='b',$image=true) {$artifact=wimArtifact($image);return array('id'=>str_repeat($id,32),'major'=>1,'minor'=>0,'number'=>1,'title'=>'網頁 '.$id,'source'=>'manual','contentType'=>'webpage','artifact'=>$artifact,'items'=>webpageItems($artifact),'goalText'=>'以明亮風格呈現社區影展。','rationale'=>'來源結構說明','changeSummary'=>'來源完整快照','goalSnapshot'=>wimBrief(),'referencesSnapshot'=>$image?array(wimPin()):array(),'createdAt'=>'2026-01-01T00:00:00+00:00');}
function wimProject($image=true) {return array('id'=>str_repeat('8',32),'title'=>'網頁固定圖片測試','description'=>'不觀看或生成圖片像素','module'=>'webpage','activeItem'=>array('title'=>'社區影展','description'=>'完整原生網頁'),'references'=>$image?array(wimPin()):array(),'versions'=>array(wimVersion('b',$image)),'messages'=>array(),'brief'=>wimBrief(),'goalApprovedAt'=>'2026-01-01T00:00:00+00:00','officialVersionId'=>null);}
function wimChangePin($artifact,$id) {foreach($artifact['sections'] as &$section)if($section['type']==='image')$section['entries'][0]['id']=$id;unset($section);return $artifact;}
function wimRename($artifact) {$ids=array();foreach($artifact['sections'] as $section)$ids[$section['id']]='new_'.$section['id'];foreach($artifact['sections'] as &$section){$section['id']=$ids[$section['id']];if($section['actionTarget']!=='')$section['actionTarget']=$ids[$section['actionTarget']];}unset($section);return $artifact;}
class WebpageImageFixtureAdapter {
    public $calls=0;public $mode='normal';public $history=array();public $images=true;
    public function generate($model,$messages,$schema,$maxOutputTokens=6000) {
        $this->calls++;$data=json_decode($messages[1]['content'],true,64,JSON_THROW_ON_ERROR);$this->history[]=array('model'=>$model,'data'=>$data,'messages'=>$messages,'schema'=>$schema,'maxOutputTokens'=>$maxOutputTokens,'argumentCount'=>func_num_args());
        $props=$schema['properties'];$candidate=array('artifact'=>wimArtifact($this->images),'rationale'=>'依已提供的文字與圖片中繼資料編排，沒有看過圖片像素。','goalText'=>'以明亮風格呈現社區影展。','changeSummary'=>'建立待審閱網頁候選。');
        if(isset($props['candidates']))$out=array('candidates'=>array($candidate));
        elseif(isset($props['outcome'])){
            $source=$data['sourceVersion'];$artifact=$source['artifact'];$artifact['theme']='meadow';
            $out=array('outcome'=>'revision','reply'=>'提供完整待審閱候選。','question'=>'','choices'=>array(),'artifact'=>$artifact,'rationale'=>'只改主題，保留固定圖片。','goalText'=>versionGoalText($source),'changeSummary'=>'調整為 meadow。');
            if(in_array($this->mode,array('unchanged','metadata_only','goal_only','combined_revert','pin_alias','pin_alias_goal'),true))$out['artifact']=$source['artifact'];
            if($this->mode==='ids_only'||$this->mode==='ids_goal')$out['artifact']=wimRename($source['artifact']);
            if(in_array($this->mode,array('goal_only','ids_goal','pin_alias_goal'),true))$out['goalText']='保留原網頁，只更新本版目標。';
            if($this->mode==='metadata_only')$out['rationale']='只換說明。';
            if($this->mode==='pin_alias'||$this->mode==='pin_alias_goal')$out['artifact']=wimChangePin($source['artifact'],str_repeat('2',32));
            if($this->mode==='new_image')$out['artifact']=wimChangePin($source['artifact'],str_repeat('3',32));
            if($this->mode==='alt_only'){$out['artifact']=$source['artifact'];$out['artifact']['sections'][2]['entries'][0]['title']='更新後替代文字';}
            if($this->mode==='caption_only'){$out['artifact']=$source['artifact'];$out['artifact']['sections'][2]['entries'][0]['body']='更新後圖說';}
            if(strpos($this->mode,'clarification')===0){$out['outcome']='clarification';$out['artifact']=$source['artifact'];$out['reply']='可以討論固定圖片的排列。';$out['rationale']='';$out['goalText']='';$out['changeSummary']='';}
            if($this->mode==='clarification_changed')$out['artifact']=$artifact;
            if($this->mode==='clarification_alias')$out['artifact']=wimChangePin($source['artifact'],str_repeat('2',32));
            if($this->mode==='clarification_claim')$out['reply']='已經修改完成。';
        }elseif(isset($props['artifact'])){
            $out=$candidate;$out['artifact']=$data['selectedVersions'][0]['artifact'];$out['artifact']['title']='融合後完整網頁';
            if($this->mode==='copy_source'||$this->mode==='alias_copy')$out['artifact']=$data['selectedVersions'][0]['artifact'];
            if($this->mode==='copy_second')$out['artifact']=$data['selectedVersions'][1]['artifact'];
            if($this->mode==='ids_copy')$out['artifact']=wimRename($data['selectedVersions'][0]['artifact']);
            if($this->mode==='alias_copy')$out['artifact']=wimChangePin($out['artifact'],str_repeat('2',32));
            if($this->mode==='reorder'){$out['artifact']=$data['selectedVersions'][0]['artifact'];$out['artifact']['sections']=array_reverse($out['artifact']['sections']);}
        }else{
            $items=array();foreach($data['selectedVersions'] as $version)$items[]=array('versionId'=>$version['id'],'fit'=>'依本版目標比較。','strength'=>'結構清楚。','tradeoff'=>'未提供圖片像素。','suggestion'=>'可調整圖說。');
            if($this->mode==='duplicate_comparison')$items[1]=$items[0];if($this->mode==='foreign_comparison')$items[0]['versionId']=str_repeat('0',32);
            $out=array('items'=>$items,'summary'=>'依各版目標與已知結構判斷。');
        }
        $target=&$out;if(isset($out['candidates']))$target=&$out['candidates'][0];
        if(isset($target['artifact'])){
            if($this->mode==='unknown_pin')$target['artifact']=wimChangePin($target['artifact'],str_repeat('9',32));
            if($this->mode==='asset_as_pin')$target['artifact']=wimChangePin($target['artifact'],str_repeat('e',32));
            if($this->mode==='url_as_pin')$target['artifact']=wimChangePin($target['artifact'],'https://example.invalid/image.png');
            if($this->mode==='empty_alt')$target['artifact']['sections'][2]['entries'][0]['title']=' ';
            if($this->mode==='image_action'){$target['artifact']['sections'][2]['actionLabel']='Go';$target['artifact']['sections'][2]['actionTarget']='about';}
            if($this->mode==='extra_entry')$target['artifact']['sections'][2]['entries'][]=array('id'=>str_repeat('2',32),'title'=>'另一張','body'=>'');
        }
        $comment=isset($target['artifact'])?'rationale':'summary';
        if($this->mode==='pixel_claim')$target[$comment]='我已看過圖片，畫面非常清楚。';
        if($this->mode==='pixel_claim_en')$target[$comment]='I have inspected the image and verified the colors.';
        if($this->mode==='generated_claim')$target[$comment]='我已生成圖片，現在可以使用。';
        if($this->mode==='generated_claim_en')$target[$comment]='I have generated an image for this webpage.';
        if($this->mode==='metadata_claim')$target[$comment]='我已檢視圖片中繼資料，沒有看過圖片像素。';
        unset($target);return json_decode(jsonEncode($out),false,128,JSON_THROW_ON_ERROR);
    }
}
function wimLast($adapter) {return $adapter->history[count($adapter->history)-1];}
$adapter=new WebpageImageFixtureAdapter();$module=new WebpageModule($adapter);$project=wimProject();$source=$project['versions'][0];$model='fixed-fixture-v1';
$generated=$module->generate($project,'保留固定圖片。',$model);$call=wimLast($adapter);
wimCheck(count($generated)===1&&$generated[0]['artifact']===wimArtifact()&&$generated[0]['referencesSnapshot']===array(wimPin()),'generate one complete native webpage with exact used pin snapshot');
wimCheck($call['model']===$model&&$call['argumentCount']===4&&$call['maxOutputTokens']===24000&&$adapter->calls===1,'one bounded fixed text-model call without image input arguments');
$metadata=$call['data']['availableImageReferences'][0]['versionSnapshot'];
wimCheck($metadata['pixelsProvided']===false&&$metadata['width']===640&&$metadata['alt']==='使用者提供的替代說明'&&!isset($metadata['asset'])&&!isset($metadata['items'])&&$call['data']['imagePixelsProvided']===false,'allowlisted image metadata excludes asset and pixel-bearing items');
wimCheck(strpos(jsonEncode($call['data']),str_repeat('e',32))===false&&strpos(jsonEncode($call['data']),str_repeat('f',64))===false,'asset IDs and pixel hashes never reach model');
$dirty=$project;$dirty['references'][0]['transport']=array('url'=>'https://example.invalid/private','bytes'=>'NOT_REAL_BYTES');$dirty['references'][0]['versionSnapshot']['attachment']='NOT_REAL_ATTACHMENT';$module->generate($dirty,'',$model);$call=wimLast($adapter);
wimCheck(strpos(jsonEncode($call['data']),'NOT_REAL_')===false&&strpos(jsonEncode($call['data']),'example.invalid/private')===false,'unknown transport and nested attachment data is not forwarded');
foreach(array('unknown_pin'=>'MODEL_IMAGE_REFERENCE_INVALID','asset_as_pin'=>'MODEL_IMAGE_REFERENCE_INVALID','url_as_pin'=>'MODEL_OUTPUT_INVALID','empty_alt'=>'MODEL_OUTPUT_INVALID','image_action'=>'MODEL_OUTPUT_INVALID','extra_entry'=>'MODEL_OUTPUT_INVALID','pixel_claim'=>'MODEL_PIXEL_CLAIM','pixel_claim_en'=>'MODEL_PIXEL_CLAIM','generated_claim'=>'MODEL_PIXEL_CLAIM','generated_claim_en'=>'MODEL_PIXEL_CLAIM') as $mode=>$code){$adapter->mode=$mode;wimReject($adapter,function()use($module,$project,$model){$module->generate($project,'',$model);},'generation rejects '.$mode,$code);}
$adapter->mode='metadata_claim';$module->generate($project,'',$model);wimCheck(true,'metadata-only inspection statement remains honest and permitted');
$adapter->mode='normal';$adapter->images=false;$plain=wimProject(false);$generated=$module->generate($plain,'只做純文字。',$model);$call=wimLast($adapter);
wimCheck($generated[0]['artifact']===wimArtifact(false)&&$generated[0]['referencesSnapshot']===array()&&$call['data']['availableImageReferences']===array(),'legacy text-only webpage works without fake image or pin');$adapter->images=true;
// Root-only expansion: module receives already validated image references from selected illustrated/poster snapshots.
foreach(array('illustrated','poster') as $type){$derived=$project;$derived['references']=array();$pin=wimPin();$pin['viaReferences']=array(array('referenceId'=>str_repeat('4',32),'targetItemId'=>str_repeat('5',32),'versionId'=>str_repeat('6',32)));$derived['compositionReferencePool']=array($pin);$generated=$module->generate($derived,'使用已明確選取的'.$type.'固定圖片。',$model);$call=wimLast($adapter);wimCheck($generated[0]['referencesSnapshot']===array($pin)&&$call['data']['availableImageReferences'][0]['id']===$pin['id'],'validated derived '.$type.' image pin works without traversing or refreshing source');}
$restricted=$project;$restricted['compositionReferencePool']=array();wimReject($adapter,function()use($module,$restricted,$model){$module->generate($restricted,'',$model);},'explicit empty validated pool cannot be expanded from raw project references','MODEL_IMAGE_REFERENCE_INVALID');
$revision=$module->refine($project,$source,'只改 meadow 主題。',$model);$call=wimLast($adapter);
wimCheck($revision['artifact']['theme']==='meadow'&&$revision['artifact']['sections']===$source['artifact']['sections']&&$revision['referencesSnapshot']===$source['referencesSnapshot'],'real refine preserves full image entries literal text order and IDs');
wimCheck($call['data']['sourceVersion']['artifact']===$source['artifact']&&$call['data']['sourceVersion']['goalText']===$source['goalText']&&!isset($call['data']['sourceVersion']['referencesSnapshot']),'selected source and own goal retained without nested image bytes');
$removed=$project;$removed['references']=array();$revision=$module->refine($removed,$source,'只改主題。',$model);wimCheck($revision['referencesSnapshot']===$source['referencesSnapshot']&&wimLast($adapter)['data']['availableImageReferences'][0]['versionId']===str_repeat('a',32),'removed current pin survives from exact selected source history');
$missing=$source;$missing['referencesSnapshot']=array();wimReject($adapter,function()use($module,$removed,$missing,$model){$module->refine($removed,$missing,'修改',$model);},'missing source image blocks before inference','COMPOSITION_REFERENCE_MISSING',0,409);
wimReject($adapter,function()use($module,$restricted,$source,$model){$module->refine($restricted,$source,'修改',$model);},'validated pool is authoritative over historical raw pins','COMPOSITION_REFERENCE_MISSING',0,409);
foreach(array('unchanged','metadata_only','ids_only','ids_goal') as $mode){$adapter->mode=$mode;wimReject($adapter,function()use($module,$project,$source,$model){$module->refine($project,$source,'修改',$model);},'refine rejects '.$mode,'MODEL_NO_REVISION');}
$adapter->mode='goal_only';$revision=$module->refine($project,$source,'只更新本版目標。',$model);wimCheck($revision['artifact']===$source['artifact']&&strpos($revision['reply'],'僅更新本版目標')!==false,'goal-only revision keeps exact canonical artifact and pins');
$combined=$source;$combined['goalAndRationale']='使用者保存的最新完整目標與修改意見。';$adapter->mode='combined_revert';$revision=$module->refine($project,$combined,'恢復舊目標。',$model);wimCheck(wimLast($adapter)['data']['sourceVersion']['goalAndRationale']===$combined['goalAndRationale']&&$revision['artifact']===$source['artifact'],'combined goal override remains authoritative for deliberate restoration');
$alias=$project;$alias['references'][]=wimPin('2');foreach(array('pin_alias','pin_alias_goal') as $mode){$adapter->mode=$mode;wimReject($adapter,function()use($module,$alias,$source,$model){$module->refine($alias,$source,'修改',$model);},'same source version pin alias cannot create revision '.$mode,'MODEL_NO_REVISION');}
$newImage=$project;$newImage['references'][]=wimPin('3','9');$adapter->mode='new_image';$revision=$module->refine($newImage,$source,'換成另一個已釘選固定版本。',$model);wimCheck($revision['referencesSnapshot']===array(wimPin('3','9')),'different explicitly pinned image is meaningful and only used pin is retained');
foreach(array('alt_only','caption_only') as $mode){$adapter->mode=$mode;$revision=$module->refine($project,$source,'修改圖片文字。',$model);wimCheck($revision['artifact']!==$source['artifact']&&$revision['referencesSnapshot']===$source['referencesSnapshot'],'meaningful image text change preserved '.$mode);}
$adapter->mode='clarification';$discussion=$module->refine($project,$source,'討論圖片排列。',$model);wimCheck($discussion['outcome']==='clarification'&&!isset($discussion['artifact'])&&!isset($discussion['referencesSnapshot'])&&!isset($discussion['goalText']),'clarification exact source echo is discarded without artifact pin or goal mutation');
foreach(array('clarification_changed'=>'MODEL_CLARIFICATION_ARTIFACT','clarification_alias'=>'MODEL_CLARIFICATION_ARTIFACT','clarification_claim'=>'MODEL_CLARIFICATION_CLAIM','unknown_pin'=>'MODEL_IMAGE_REFERENCE_INVALID','pixel_claim'=>'MODEL_PIXEL_CLAIM','generated_claim'=>'MODEL_PIXEL_CLAIM') as $mode=>$code){$adapter->mode=$mode;wimReject($adapter,function()use($module,$alias,$source,$model){$module->refine($alias,$source,'討論或修改。',$model);},'refine rejects '.$mode,$code);}
$other=wimVersion('c');$other['artifact']['theme']='midnight';$other['items']=webpageItems($other['artifact']);$other['goalAndRationale']='第二版自己不同的完整目標。';$adapter->mode='normal';
$fusion=$module->fuse($removed,array($source,$other),'整合兩版。',$model);$call=wimLast($adapter);
wimCheck($fusion['artifact']['title']==='融合後完整網頁'&&$fusion['referencesSnapshot']===$source['referencesSnapshot']&&$call['data']['creativeGoal']===null&&$call['data']['selectedVersions'][1]['goalAndRationale']===$other['goalAndRationale'],'fusion preserves historical pins and each selected version own goals');
foreach(array('copy_source','copy_second','ids_copy','alias_copy') as $mode){$adapter->mode=$mode;wimReject($adapter,function()use($module,$alias,$source,$other,$model){$module->fuse($alias,array($source,$other),'融合',$model);},'fusion rejects copied content or aliases '.$mode,'MODEL_NO_REVISION');}
foreach(array('unknown_pin'=>'MODEL_IMAGE_REFERENCE_INVALID','pixel_claim'=>'MODEL_PIXEL_CLAIM','generated_claim'=>'MODEL_PIXEL_CLAIM') as $mode=>$code){$adapter->mode=$mode;wimReject($adapter,function()use($module,$project,$source,$other,$model){$module->fuse($project,array($source,$other),'融合',$model);},'fusion rejects '.$mode,$code);}
$adapter->mode='reorder';$fusion=$module->fuse($project,array($source,$other),'重新排列。',$model);wimCheck($fusion['artifact']['sections']===array_reverse($source['artifact']['sections']),'real section reorder remains a meaningful fusion change');
$adapter->mode='normal';$comparison=$module->compare($removed,array($source,$other),'依各版目標比較。',$model);$call=wimLast($adapter);
wimCheck(count($comparison['items'])===2&&strpos($comparison['summary'],'沒有檢視圖片像素')!==false&&$call['data']['creativeGoal']===null&&$call['data']['selectedVersions'][1]['goalAndRationale']===$other['goalAndRationale']&&count($call['data']['availableImageReferences'])===1,'compare keeps selected full snapshots own goals and historical metadata only');
foreach(array('duplicate_comparison'=>'MODEL_OUTPUT_INVALID','foreign_comparison'=>'MODEL_OUTPUT_INVALID','pixel_claim'=>'MODEL_PIXEL_CLAIM','pixel_claim_en'=>'MODEL_PIXEL_CLAIM','generated_claim'=>'MODEL_PIXEL_CLAIM') as $mode=>$code){$adapter->mode=$mode;wimReject($adapter,function()use($module,$project,$source,$other,$model){$module->compare($project,array($source,$other),'比較',$model);},'comparison rejects '.$mode,$code);}
$adapter->mode='normal';foreach(array(null,array(),array($source),array($source,$source),array('first'=>$source,'second'=>$other)) as $versions){wimReject($adapter,function()use($module,$project,$versions,$model){$module->fuse($project,$versions,'融合',$model);},'invalid fusion selection blocks before inference','FUSION_VERSIONS_INVALID',0,409);wimReject($adapter,function()use($module,$project,$versions,$model){$module->compare($project,$versions,'比較',$model);},'invalid comparison selection blocks before inference','COMPARISON_SELECTION',0,409);}
foreach(array('identity','foreign_project','bad_asset','missing_image_type','alias_conflict') as $mode){$bad=$project;if($mode==='identity')$bad['references'][0]['versionSnapshot']['id']=str_repeat('9',32);elseif($mode==='foreign_project')$bad['references'][0]['projectId']=str_repeat('0',32);elseif($mode==='bad_asset')$bad['references'][0]['versionSnapshot']['artifact']['asset']['mime']='image/jpeg';elseif($mode==='missing_image_type')unset($bad['references'][0]['versionSnapshot']['contentType']);else{$bad['references'][]=wimPin('2');$bad['references'][1]['versionSnapshot']['artifact']['alt']='同版本不同說明';}$code=$mode==='alias_conflict'?'COMPOSITION_REFERENCE_CONFLICT':'COMPOSITION_REFERENCE_INVALID';wimReject($adapter,function()use($module,$bad,$model){$module->generate($bad,'',$model);},'invalid image reference blocks before model '.$mode,$code,0,409);}
$conflict=$project;$conflict['references'][0]=wimPin('1','9');wimReject($adapter,function()use($module,$conflict,$source,$model){$module->refine($conflict,$source,'修改',$model);},'same pin cannot silently refresh selected source image','COMPOSITION_REFERENCE_CONFLICT',0,409);
$oversize=$project;$oversize['description']=str_repeat('x',600001);wimReject($adapter,function()use($module,$oversize,$model){$module->generate($oversize,'',$model);},'oversize complete context fails without truncation or inference','CONTEXT_LIMIT',0,409);
wimCheck($project===wimProject()&&$source===wimVersion(),'all input projects and source snapshots remain immutable');
echo 'PASS '.$webpageImageModelChecks." native webpage image-model checks. No real provider, credentials or network used.\n";
