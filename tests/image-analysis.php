<?php
/**
 * Native PHP 7.4+/PDO SQLite/zlib end-to-end image-analysis application fixtures.
 * Run: php tests/image-analysis.php
 * UNEXECUTED in the authoring environment: PHP is unavailable.
 * Node source contracts and a lexer check are NOT PHP syntax/runtime verification.
 * Uses real CocreationApp, Store, MediaStore, temporary SQLite and synthetic PNGs.
 * Only model inference is injected. No credentials, network or real user data.
 */
require_once dirname(__DIR__).'/app/bootstrap.php';
require_once __DIR__.'/phase1-helpers.php';
if(!class_exists('PDO')||!in_array('sqlite',PDO::getAvailableDrivers(),true)||!function_exists('gzcompress')){
    fwrite(STDERR,"UNEXECUTED: image-analysis fixtures require PHP, PDO SQLite and zlib.\n");exit(77);
}
$imageAnalysisChecks=0;
function imageAnalysisCheck($ok,$label) {
    global $imageAnalysisChecks;
    if(!$ok)throw new RuntimeException('FAIL '.$label);
    $imageAnalysisChecks++;echo 'PASS '.$label."\n";
}
function imageAnalysisReject(callable $call,$label,$code,$status=409) {
    $error=null;try{$call();}catch(AppError $caught){$error=$caught;}
    imageAnalysisCheck($error instanceof AppError&&$error->errorCode===$code&&$error->status===$status,$label);
}
function imageAnalysisInput($project,$action,$extra=array()) {
    return array_merge(array('action'=>$action,'id'=>$project['id'],'itemId'=>$project['activeItemId'],'revision'=>$project['revision']),$extra);
}
function imageAnalysisUploadInput($project,$title,$note,$extra=array()) {
    return imageAnalysisInput($project,'upload_image',array_merge(array('requestId'=>newId(),'title'=>$title,'alt'=>'自製單色測試像素','attribution'=>'合成測試資料','goalAndRationale'=>$note,'versionMode'=>'major','basedOnVersionId'=>null),$extra));
}
function imageAnalysisChunk($type,$data) {
    return pack('N',strlen($data)).$type.$data.hash('crc32b',$type.$data,true);
}
function imageAnalysisPng($r,$g,$b) {
    return "\x89PNG\r\n\x1a\n".imageAnalysisChunk('IHDR',pack('NNCCCCC',1,1,8,2,0,0,0)).imageAnalysisChunk('IDAT',gzcompress("\0".chr($r).chr($g).chr($b),9)).imageAnalysisChunk('IEND','');
}
function imageAnalysisClean($directory) {
    foreach(scandir($directory) as $name)if($name!=='.'&&$name!=='..'){
        $path=$directory.'/'.$name;
        if(is_dir($path)&&!is_link($path))imageAnalysisClean($path);else unlink($path);
    }
    rmdir($directory);
}
function imageAnalysisCounts($store) {
    return array((int)$store->db->query('SELECT COUNT(*) FROM media_assets')->fetchColumn(),(int)$store->db->query('SELECT COUNT(*) FROM media_upload_receipts')->fetchColumn());
}
function imageAnalysisSavedState($store,$project,$owner) {return jsonEncode($store->project($project['id'],$owner));}
function imageAnalysisProvenance($provenance,$project,$snapshots,$label) {
    imageAnalysisCheck($provenance['memberId']===$project['aiBinding']['memberId']&&$provenance['provider']==='ollama'&&$provenance['requestedModel']==='fixed-vision-model'&&$provenance['actualModel']==='fixture-vision-actual'&&is_string($provenance['requestedAt']),$label.' fixed model provenance');
    imageAnalysisCheck($provenance['inputMode']==='image_bytes'&&$provenance['imageInputs']===$snapshots,$label.' imageInputSnapshots persisted in provenance.imageInputs');
    foreach($snapshots as $snapshot)imageAnalysisCheck(array_keys($snapshot)===array('itemId','versionId','assetId','sha256','label'),$label.' snapshot contains identities and hash, never bytes');
}
// The override executes the exact real Store::save on the existing PDO before
// injecting a failure. It does not replace Store or model transaction semantics.
class ImageAnalysisFixtureStore extends Store {
    public $failAfterSave=false;public $saveCalls=0;public $injectedSaveFailures=0;
    public function save($project,$owner) {
        $this->saveCalls++;$saved=parent::save($project,$owner);
        if($this->failAfterSave){$this->failAfterSave=false;$this->injectedSaveFailures++;throw new AppError('FIXTURE_SAVE_FAILURE','Synthetic failure after the real PDO project write.',500);}
        return $saved;
    }
}
class ImageAnalysisFixtureAdapter {
    public $calls=array();public $forcedResponse=null;
    public function actualModel() {return 'fixture-vision-actual';}
    public function generate($model,$messages,$schema,$maxOutputTokens=6000,$images=array()) {
        $data=json_decode($messages[count($messages)-1]['content'],true,128,JSON_THROW_ON_ERROR);
        $this->calls[]=array('model'=>$model,'messages'=>$messages,'data'=>$data,'schema'=>$schema,'images'=>$images,'budget'=>$maxOutputTokens);
        if($this->forcedResponse!==null)return json_decode(jsonEncode($this->forcedResponse));
        if(isset($data['selectedVersions'])){
            $response=array('items'=>array(),'summary'=>'每版依自己的目標比較，不指定唯一優勝。');
            foreach($data['selectedVersions'] as $version)$response['items'][]=array('versionId'=>$version['id'],'fit'=>'依本版目標評估','strength'=>'主體清楚','tradeoff'=>'仍可調整對比','suggestion'=>'可考慮更清楚的層次');
        }elseif(isset($schema['properties']['outcome'])){
            $response=array('outcome'=>'clarification','reply'=>'可以考慮增加背景與主體的對比，目前只能提出建議，不能修改像素。','question'=>'','choices'=>array());
        }else{
            $response=array('reply'=>'可依目前提供的圖片繼續討論構圖與用途。','question'=>'','choices'=>array(),'directionStatus'=>'exploring','direction'=>fixtureEmptyDirection());
        }
        return json_decode(jsonEncode($response));
    }
}
$directory=sys_get_temp_dir().'/cocreation-image-analysis-'.bin2hex(random_bytes(8));
if(!mkdir($directory,0700,true))throw new RuntimeException('Cannot create disposable fixture directory.');
try {
    $config=validateConfig(array('app_url'=>'http://localhost/studio/public/','data_dir'=>$directory,'openai_model'=>'fixed-vision-model','model_timeout_ms'=>120000));
    $store=new ImageAnalysisFixtureStore($directory);$owner=str_repeat('a',64);$otherOwner=str_repeat('b',64);
    $memberId=str_repeat('c',32);$alternateId=str_repeat('d',32);
    $members=array(
        array('id'=>$memberId,'nickname'=>'固定圖片測試夥伴','enabled'=>true,'provider'=>'ollama','model'=>'fixed-vision-model','ollamaUrl'=>'http://127.0.0.1:11434'),
        array('id'=>$alternateId,'nickname'=>'其他測試夥伴','enabled'=>true,'provider'=>'ollama','model'=>'alternate-vision-model','ollamaUrl'=>'http://127.0.0.1:11434')
    );
    $store->setMemberRoster($members,$memberId,true,$owner);
    $adapter=new ImageAnalysisFixtureAdapter();$app=new CocreationApp($store,$config,$owner,$adapter);
    imageAnalysisCheck($store->db instanceof PDO&&$store->db->getAttribute(PDO::ATTR_DRIVER_NAME)==='sqlite','native Store uses actual temporary PDO SQLite');
    $project=$app->action(fixtureBoundNew($app,array('title'=>'圖片端到端測試','description'=>'不改專案名稱或來源像素')))['project'];
    $project=$app->action(imageAnalysisInput($project,'create_item',array('type'=>'image','title'=>'比較圖片','description'=>'')))['project'];$mainItemId=$project['activeItemId'];
    for($i=0;$i<6;$i++){
        $project=$app->uploadImage(imageAnalysisUploadInput($project,'合成圖片 '.($i+1),'版本 '.($i+1).' 自己的目標與修改意見'),imageAnalysisPng(20+$i*30,10+$i*20,200-$i*20))['project'];
    }
    $versions=$project['versions'];$first=$versions[0];$second=$versions[1];
    imageAnalysisCheck(count($adapter->calls)===0&&count($versions)===6,'six real PNG uploads create saved versions with zero model calls');
    $savedBytes=array();foreach($versions as $version)$savedBytes[$version['id']]=$app->readImageVersion(array('id'=>$project['id'],'itemId'=>$mainItemId,'versionId'=>$version['id']))['bytes'];
    $before=imageAnalysisSavedState($store,$project,$owner);
    foreach(array('discuss','compare','summarize') as $action){
        $extra=$action==='compare'?array('versionIds'=>array($first['id'],$second['id']),'question'=>'比較'):array('baseVersionId'=>$first['id'],'text'=>'討論這張圖片');
        imageAnalysisReject(function()use($app,$project,$action,$extra){$app->action(fixtureProjectInput($app,$project,$action,$extra));},$action.' without image consent rejects before model','IMAGE_ANALYSIS_OPT_IN');
    }
    imageAnalysisCheck(count($adapter->calls)===0&&imageAnalysisSavedState($store,$project,$owner)===$before,'missing consent creates no inference or project mutation');
    // A different global active member must not redirect this bound project.
    $status=$app->status();$store->selectMember($alternateId,$config['openai_model'],$owner,$status['settingsRevision']);
    $project=$app->action(imageAnalysisInput($project,'grant_image_analysis'))['project'];
    $expectedHash=hash('sha256',jsonEncode(validateProjectAiBinding($project['aiBinding'])));
    imageAnalysisCheck($project['imageAnalysisConsent']['bindingHash']===$expectedHash&&is_string($project['imageAnalysisConsent']['acceptedAt'])&&$project['aiBinding']['memberId']===$memberId&&$app->status()['memberId']===$alternateId,'grant_image_analysis binds exact fixed project instead of global active member');
    imageAnalysisCheck(count($adapter->calls)===0&&$project['versions']===$versions&&$project['officialVersionId']===null,'grant_image_analysis makes zero model calls and changes no artwork');

    for($size=2;$size<=5;$size++){
        $selected=array_slice($versions,0,$size);$ids=array_column($selected,'id');$beforeCalls=count($adapter->calls);$beforeVersions=$project['versions'];
        $project=$app->action(fixtureProjectInput($app,$project,'compare',array('versionIds'=>$ids,'question'=>'依各版自己的目標比較')))['project'];
        $call=end($adapter->calls);$comparison=end($project['comparisons']);$message=end($project['messages']);
        imageAnalysisCheck(count($adapter->calls)===$beforeCalls+1&&$call['model']==='fixed-vision-model'&&count($call['images'])===$size,'compare '.$size.' saved versions makes one fixed-model call');
        imageAnalysisCheck(array_column($call['data']['selectedVersions'],'id')===$ids&&array_column($comparison['items'],'versionId')===$ids&&$comparison['versionIds']===$ids,'compare '.$size.' preserves every selected version identity and order');
        $snapshots=array();
        foreach($selected as $index=>$version){
            $image=$call['images'][$index];$asset=$version['artifact']['asset'];
            imageAnalysisCheck($image['bytes']===$savedBytes[$version['id']]&&$image['sha256']===$asset['sha256']&&hash('sha256',$image['bytes'])===$asset['sha256']&&$image['assetId']===$asset['id'],'compare '.$size.' forwards exact persisted PNG bytes '.$index);
            $snapshots[]=array('itemId'=>$mainItemId,'versionId'=>$version['id'],'assetId'=>$asset['id'],'sha256'=>$asset['sha256'],'label'=>$image['label']);
            imageAnalysisCheck($call['data']['selectedVersions'][$index]['goalAndRationale']===$version['goalAndRationale']&&$comparison['versionGoalSnapshots'][$index]['goalAndRationale']===$version['goalAndRationale'],'compare '.$size.' retains each version own note '.$index);
            imageAnalysisCheck(strpos(jsonEncode($project),base64_encode($image['bytes']))===false&&!isset($call['data']['imageInputs'][$index]['bytes']),'compare '.$size.' retains no image bytes in project or textual model data '.$index);
        }
        imageAnalysisProvenance($comparison['provenance'],$project,$snapshots,'compare '.$size);
        imageAnalysisCheck($message['provenance']===$comparison['provenance']&&$project['versions']===$beforeVersions&&$project['officialVersionId']===null,'compare '.$size.' persists message provenance without revising or adopting artwork');
    }
    foreach(array(array($first['id']),array_column($versions,'id'),array($first['id'],$first['id'])) as $badIds){
        $beforeCalls=count($adapter->calls);
        imageAnalysisReject(function()use($app,$project,$badIds){$app->action(fixtureProjectInput($app,$project,'compare',array('versionIds'=>$badIds)));},'invalid one six or duplicate version selection rejects before inference','COMPARISON_SELECTION',400);
        imageAnalysisCheck(count($adapter->calls)===$beforeCalls,'invalid comparison selection makes zero model calls');
    }
    $artifact=$first['artifact'];$artifact['alt']='同一像素，改成不同說明';
    $project=$app->action(imageAnalysisInput($project,'snapshot',array('artifact'=>$artifact,'basedOnVersionId'=>$first['id'],'versionMode'=>'minor','goalAndRationale'=>'同一像素但目標改為低刺激視覺，保留完整不同的修改意見')))['project'];$duplicate=end($project['versions']);
    imageAnalysisCheck($duplicate['artifact']['asset']===$first['artifact']['asset']&&$duplicate['goalAndRationale']!==$first['goalAndRationale'],'metadata-only snapshot preserves pixels with a genuinely different version note');
    $project=$app->action(fixtureProjectInput($app,$project,'compare',array('versionIds'=>array($first['id'],$duplicate['id']),'question'=>'相同圖片在兩個不同目標下的取捨')))['project'];
    $call=end($adapter->calls);$comparison=end($project['comparisons']);$snapshots=$comparison['provenance']['imageInputs'];
    imageAnalysisCheck(count($call['images'])===1&&$call['images'][0]['bytes']===$savedBytes[$first['id']]&&strpos($call['images'][0]['label'],$first['id'])!==false&&strpos($call['images'][0]['label'],$duplicate['id'])!==false,'duplicate asset deduplicates actual bytes but labels both saved versions');
    imageAnalysisCheck(array_column($call['data']['selectedVersions'],'id')===array($first['id'],$duplicate['id'])&&array_column($call['data']['selectedVersions'],'goalAndRationale')===array($first['goalAndRationale'],$duplicate['goalAndRationale'])&&count($comparison['items'])===2,'duplicate asset different notes are both compared, not collapsed');
    imageAnalysisCheck(count($snapshots)===2&&array_column($snapshots,'versionId')===array($first['id'],$duplicate['id'])&&$snapshots[0]['assetId']===$snapshots[1]['assetId'],'duplicate asset keeps separate imageInputSnapshots for both version identities');
    imageAnalysisProvenance($comparison['provenance'],$project,$snapshots,'duplicate asset comparison');

    $before=imageAnalysisSavedState($store,$project,$owner);$beforeCalls=count($adapter->calls);
    imageAnalysisReject(function()use($app,$project,$first,$second){$app->action(imageAnalysisInput($project,'snapshot',array('artifact'=>$second['artifact'],'basedOnVersionId'=>$first['id'],'versionMode'=>'minor','goalAndRationale'=>'非法替換像素')));},'manual snapshot asset swap rejects even another valid same-item image','IMAGE_METADATA_ONLY');
    imageAnalysisCheck(imageAnalysisSavedState($store,$project,$owner)===$before&&count($adapter->calls)===$beforeCalls,'rejected manual pixel swap saves nothing and makes no model call');
    foreach(array('generate','confirm_generate','fuse') as $action){
        $beforeCalls=count($adapter->calls);
        imageAnalysisReject(function()use($app,$project,$action,$first,$second){$app->action(fixtureProjectInput($app,$project,$action,array('versionIds'=>array($first['id'],$second['id']),'instruction'=>'生成圖片','question'=>'融合圖片')));},$action.' unavailable in application before any model call','IMAGE_GENERATION_UNAVAILABLE');
        imageAnalysisCheck(count($adapter->calls)===$beforeCalls&&imageAnalysisSavedState($store,$project,$owner)===$before,$action.' call count zero and no fake pixel revision');
    }
    $beforeVersions=$project['versions'];$beforeCalls=count($adapter->calls);
    $project=$app->action(fixtureProjectInput($app,$project,'discuss',array('baseVersionId'=>$first['id'],'text'=>'請把顏色改淡一些')))['project'];$message=end($project['messages']);
    imageAnalysisCheck(count($adapter->calls)===$beforeCalls+1&&$message['kind']==='clarification'&&$message['basedOnVersionId']===$first['id']&&$project['versions']===$beforeVersions&&$project['officialVersionId']===null,'image refinement is one discussion call with no fake pixel revision');
    imageAnalysisCheck(end($adapter->calls)['images'][0]['bytes']===$savedBytes[$first['id']],'image refinement sends actual selected source bytes');
    foreach(array(
        array(array('outcome'=>'revision','reply'=>'提供修訂。','question'=>'','choices'=>array()),'MODEL_OUTPUT_INVALID'),
        array(array('outcome'=>'clarification','reply'=>'已生成圖片。','question'=>'','choices'=>array()),'MODEL_CLARIFICATION_CLAIM')
    ) as $bad){
        $adapter->forcedResponse=$bad[0];$before=imageAnalysisSavedState($store,$project,$owner);$beforeCalls=count($adapter->calls);
        imageAnalysisReject(function()use($app,$project,$first){$app->action(fixtureProjectInput($app,$project,'discuss',array('baseVersionId'=>$first['id'],'text'=>'請修改圖片')));},'invalid image revision or generated claim is not persisted',$bad[1],502);
        imageAnalysisCheck(count($adapter->calls)===$beforeCalls+1&&imageAnalysisSavedState($store,$project,$owner)===$before,'invalid image reply fails once without retry or fake saved version');
    }
    $adapter->forcedResponse=null;

    $otherApp=new CocreationApp($store,$config,$otherOwner,$adapter);
    imageAnalysisReject(function()use($otherApp,$project,$first,$mainItemId){$otherApp->readImageVersion(array('id'=>$project['id'],'itemId'=>$mainItemId,'versionId'=>$first['id']));},'cross-owner saved image read rejects','PROJECT_NOT_FOUND',404);
    imageAnalysisReject(function()use($otherApp,$project){$otherApp->uploadImage(imageAnalysisUploadInput($project,'跨擁有者','不應保存'),imageAnalysisPng(1,2,3));},'cross-owner image upload rejects','PROJECT_NOT_FOUND',404);
    $foreign=$app->action(fixtureBoundNew($app,array('title'=>'另一個私人專案')))['project'];
    $foreign=$app->action(imageAnalysisInput($foreign,'create_item',array('type'=>'image','title'=>'另一專案圖片')))['project'];
    $foreign=$app->uploadImage(imageAnalysisUploadInput($foreign,'另一專案像素','只屬於另一專案'),imageAnalysisPng(9,8,7))['project'];$foreignVersion=$foreign['versions'][0];
    imageAnalysisReject(function()use($app,$foreign,$mainItemId,$first){$app->readImageVersion(array('id'=>$foreign['id'],'itemId'=>$mainItemId,'versionId'=>$first['id']));},'cross-project item read rejects','ITEM_NOT_FOUND',404);
    imageAnalysisReject(function()use($app,$foreign,$first){$app->readImageVersion(array('id'=>$foreign['id'],'itemId'=>$foreign['activeItemId'],'versionId'=>$first['id']));},'cross-project saved version read rejects','VERSION_NOT_FOUND',404);
    imageAnalysisReject(function()use($app,$foreign,$mainItemId){$app->uploadImage(imageAnalysisUploadInput($foreign,'跨專案項目','不應保存',array('itemId'=>$mainItemId)),imageAnalysisPng(2,3,4));},'cross-project item upload rejects','ACTIVE_ITEM_CHANGED');
    imageAnalysisReject(function()use($app,$project,$first,$foreignVersion){$app->action(imageAnalysisInput($project,'snapshot',array('artifact'=>$foreignVersion['artifact'],'basedOnVersionId'=>$first['id'],'goalAndRationale'=>'不應跨專案讀取')));},'cross-project asset reuse rejects before manual snapshot','MEDIA_NOT_FOUND',404);
    $beforeCalls=count($adapter->calls);
    imageAnalysisReject(function()use($app,$foreign,$foreignVersion){$app->action(fixtureProjectInput($app,$foreign,'discuss',array('baseVersionId'=>$foreignVersion['id'],'text'=>'討論圖片')));},'image consent never leaks into another project','IMAGE_ANALYSIS_OPT_IN');
    imageAnalysisCheck(count($adapter->calls)===$beforeCalls,'cross-project consent denial makes zero model calls');

    $project=$app->action(imageAnalysisInput($project,'create_item',array('type'=>'image','title'=>'固定引用來源')))['project'];$sourceItemId=$project['activeItemId'];
    $project=$app->uploadImage(imageAnalysisUploadInput($project,'舊來源圖片','固定舊來源目的'),imageAnalysisPng(11,111,211))['project'];$pinnedVersion=$project['versions'][0];
    $pinnedBytes=$app->readImageVersion(array('id'=>$project['id'],'itemId'=>$sourceItemId,'versionId'=>$pinnedVersion['id']))['bytes'];
    $project=$app->action(imageAnalysisInput($project,'promote',array('versionId'=>$pinnedVersion['id'])))['project'];
    imageAnalysisReject(function()use($app,$project,$first){$app->readImageVersion(array('id'=>$project['id'],'itemId'=>$project['activeItemId'],'versionId'=>$first['id']));},'cross-item saved version read rejects','VERSION_NOT_FOUND',404);
    imageAnalysisReject(function()use($app,$project,$mainItemId){$app->uploadImage(imageAnalysisUploadInput($project,'錯誤作用中項目','不應保存',array('itemId'=>$mainItemId)),imageAnalysisPng(3,4,5));},'cross-item upload rejects','ACTIVE_ITEM_CHANGED');
    $project=$app->action(imageAnalysisInput($project,'select_item',array('itemId'=>$mainItemId)))['project'];
    imageAnalysisReject(function()use($app,$project,$first,$pinnedVersion){$app->action(imageAnalysisInput($project,'snapshot',array('artifact'=>$pinnedVersion['artifact'],'basedOnVersionId'=>$first['id'],'goalAndRationale'=>'不應跨項目替換')));},'cross-item asset reuse rejects before manual snapshot','MEDIA_NOT_FOUND',404);
    $project=$app->action(imageAnalysisInput($project,'attach_reference',array('targetItemId'=>$sourceItemId,'versionId'=>$pinnedVersion['id'])))['project'];$pinnedReference=$project['references'][0];
    $project=$app->action(imageAnalysisInput($project,'select_item',array('itemId'=>$sourceItemId)))['project'];
    $project=$app->uploadImage(imageAnalysisUploadInput($project,'新來源圖片','新版不能替換既有固定引用',array('basedOnVersionId'=>$pinnedVersion['id'])),imageAnalysisPng(221,121,21))['project'];$newSourceVersion=end($project['versions']);
    $project=$app->action(imageAnalysisInput($project,'promote',array('versionId'=>$newSourceVersion['id'])))['project'];$sourceVersions=$project['versions'];
    $project=$app->action(imageAnalysisInput($project,'select_item',array('itemId'=>$mainItemId)))['project'];$beforeVersions=$project['versions'];
    $project=$app->action(fixtureProjectInput($app,$project,'discuss',array('baseVersionId'=>$first['id'],'text'=>'請參考固定引用的圖片，討論配色')))['project'];$call=end($adapter->calls);$message=end($project['messages']);
    imageAnalysisCheck(count($call['images'])===2&&$call['images'][0]['bytes']===$savedBytes[$first['id']]&&$call['images'][1]['bytes']===$pinnedBytes&&$call['images'][1]['sha256']!==$newSourceVersion['artifact']['asset']['sha256'],'discussion after source advances still uses old pinned bytes, never latest official pixels');
    imageAnalysisCheck($project['references'][0]===$pinnedReference&&$call['data']['pinnedReferences'][0]['versionId']===$pinnedVersion['id']&&$message['referencesSnapshot'][0]===$pinnedReference,'pinned reference snapshot stays immutable after new source version and adoption');
    $snapshots=$message['provenance']['imageInputs'];
    imageAnalysisCheck(count($snapshots)===2&&$snapshots[1]['itemId']===$sourceItemId&&$snapshots[1]['versionId']===$pinnedVersion['id']&&$snapshots[1]['assetId']===$pinnedVersion['artifact']['asset']['id'],'discussion provenance records exact pinned source item version and asset');
    imageAnalysisProvenance($message['provenance'],$project,$snapshots,'pinned image discussion');
    foreach($project['creativeItems'] as $item)if($item['id']===$sourceItemId)imageAnalysisCheck($item['versions']===$sourceVersions&&$item['officialVersionId']===$newSourceVersion['id'],'discussion never mutates referenced source versions or its new official version');
    imageAnalysisCheck($project['versions']===$beforeVersions&&$project['officialVersionId']===null,'pinned discussion does not save a fake pixel revision or adopt a version');
    $project=$app->action(fixtureProjectInput($app,$project,'compare',array('versionIds'=>array($first['id'],$second['id']),'question'=>'只比較選定版本')))['project'];$call=end($adapter->calls);$comparison=end($project['comparisons']);
    imageAnalysisCheck(count($call['images'])===2&&array_column($call['images'],'assetId')===array($first['artifact']['asset']['id'],$second['artifact']['asset']['id'])&&array_column($comparison['provenance']['imageInputs'],'versionId')===array($first['id'],$second['id']),'comparison sends only selected images, not unrelated pinned reference bytes');

    // Real atomicity: an actual project UPDATE happened before the injected throw.
    $before=imageAnalysisSavedState($store,$project,$owner);$counts=imageAnalysisCounts($store);$beforeCalls=count($adapter->calls);
    $request=imageAnalysisUploadInput($project,'保存失敗測試','不能留下半筆資料');$png=imageAnalysisPng(101,102,103);$store->failAfterSave=true;
    imageAnalysisReject(function()use($app,$request,$png){$app->uploadImage($request,$png);},'failed real Store save rolls back asset plus complete version','FIXTURE_SAVE_FAILURE',500);
    imageAnalysisCheck($store->injectedSaveFailures===1&&imageAnalysisSavedState($store,$project,$owner)===$before&&imageAnalysisCounts($store)===$counts,'after-save exception restores exact project, asset count and receipts');
    imageAnalysisCheck(count($adapter->calls)===$beforeCalls,'failed upload save makes zero model calls');
    $result=$app->uploadImage($request,$png);$project=$result['project'];
    imageAnalysisCheck(empty($result['replayed'])&&imageAnalysisCounts($store)===array($counts[0]+1,$counts[1]+1),'same request after rolled-back save can create one complete version');

    // A TEMP trigger aborts the real PDO receipt INSERT. Project and asset writes
    // have already happened on that exact connection and must both roll back.
    $before=imageAnalysisSavedState($store,$project,$owner);$counts=imageAnalysisCounts($store);$saveCalls=$store->saveCalls;
    $request=imageAnalysisUploadInput($project,'收據失敗測試','收據失敗也不能留下版本');$png=imageAnalysisPng(104,105,106);
    $store->db->exec("CREATE TEMP TRIGGER fixture_abort_image_receipt BEFORE INSERT ON media_upload_receipts BEGIN SELECT RAISE(ABORT, 'synthetic receipt failure'); END");
    try {
        imageAnalysisReject(function()use($app,$request,$png){$app->uploadImage($request,$png);},'failed real receipt INSERT rolls back asset plus complete version','MEDIA_RECEIPT_CONFLICT');
    }finally{$store->db->exec('DROP TRIGGER fixture_abort_image_receipt');}
    imageAnalysisCheck($store->saveCalls===$saveCalls+1&&imageAnalysisSavedState($store,$project,$owner)===$before&&imageAnalysisCounts($store)===$counts,'receipt failure rolls back preceding actual PDO project write and image');
    $result=$app->uploadImage($request,$png);$project=$result['project'];
    imageAnalysisCheck(empty($result['replayed'])&&imageAnalysisCounts($store)===array($counts[0]+1,$counts[1]+1),'same request after receipt rollback succeeds once on reusable PDO connection');
    $persisted=$app->project($project['id']);
    imageAnalysisCheck($persisted===$project&&$persisted['title']==='圖片端到端測試'&&$persisted['officialVersionId']===null,'final application state round-trips without renaming or auto-adoption');
    echo 'TOTAL '.$imageAnalysisChecks." native image-analysis application checks. No live provider support is implied.\n";
}finally{
    if(isset($store))$store->db=null;
    imageAnalysisClean($directory);
}
