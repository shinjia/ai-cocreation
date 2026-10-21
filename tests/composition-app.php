<?php
/**
 * Native PHP 7.4+/PDO SQLite/zlib composition application integration fixtures.
 * Run: php tests/composition-app.php
 * UNEXECUTED in the authoring environment: PHP is unavailable.
 * Node source/algorithm contracts and a lexer check are NOT PHP execution,
 * PHP syntax verification, PDO coverage, or a browser acceptance test.
 * Real CocreationApp, Store and MediaStore; only model inference is injected.
 * Disposable SQLite, synthetic one-pixel PNGs, no secrets or real API calls.
 */
require_once dirname(__DIR__).'/app/bootstrap.php';
require_once __DIR__.'/phase1-helpers.php';
if(!class_exists('PDO')||!in_array('sqlite',PDO::getAvailableDrivers(),true)||!function_exists('gzcompress')){
    fwrite(STDERR,"UNEXECUTED: composition-app fixtures require PHP, PDO SQLite and zlib.\n");exit(77);
}
$compositionAppChecks=0;
function compositionAppCheck($ok,$label) {
    global $compositionAppChecks;
    if(!$ok)throw new RuntimeException('FAIL '.$label);
    $compositionAppChecks++;echo 'PASS '.$label."\n";
}
function compositionAppReject(callable $call,$label,$code,$status=409) {
    $error=null;try{$call();}catch(AppError $caught){$error=$caught;}
    compositionAppCheck($error instanceof AppError&&$error->errorCode===$code&&$error->status===$status,$label);
}
function compositionAppInput($project,$action,$extra=array()) {
    return array_merge(array('action'=>$action,'id'=>$project['id'],'itemId'=>$project['activeItemId'],'revision'=>$project['revision']),$extra);
}
function compositionAppClean($directory) {
    foreach(scandir($directory) as $name)if($name!=='.'&&$name!=='..'){
        $path=$directory.'/'.$name;if(is_dir($path)&&!is_link($path))compositionAppClean($path);else unlink($path);
    }
    rmdir($directory);
}
function compositionAppChunk($type,$data) {return pack('N',strlen($data)).$type.$data.hash('crc32b',$type.$data,true);}
function compositionAppPng($red) {
    return "\x89PNG\r\n\x1a\n".compositionAppChunk('IHDR',pack('NNCCCCC',1,1,8,2,0,0,0)).compositionAppChunk('IDAT',gzcompress("\0".chr($red)."\x20\x80",9)).compositionAppChunk('IEND','');
}
function compositionAppUpload($app,$project,$red,$title) {
    return $app->uploadImage(compositionAppInput($project,'upload_image',array('requestId'=>newId(),'title'=>$title,'alt'=>'合成測試圖片的使用者說明','attribution'=>'測試程式自行建立','goalAndRationale'=>'保留完整固定圖片來源','versionMode'=>'major','basedOnVersionId'=>null)),compositionAppPng($red))['project'];
}
function compositionAppBrief($type) {
    return array('purpose'=>'介紹影展','audience'=>'參加者','message'=>'完整介紹與活動文字','tone'=>'紙感留白風格','constraints'=>'標題、說明與固定圖片並列','summary'=>'保留完整活動文字，以原生排版搭配已釘選圖片；沒有觀看圖片像素。','items'=>array(array('id'=>'document','label'=>$type==='poster'?'海報來源':'圖文來源')));
}
function compositionAppArtifact($type,$ref,$variant='original') {
    if($type==='illustrated')return array('kind'=>'illustrated','title'=>'圖文 '.$variant,'theme'=>$variant==='refined'?'night':($variant==='fused'?'meadow':'paper'),'blocks'=>array(
        array('id'=>'intro','heading'=>'完整介紹','body'=>" 保留引號 \"活動\" 與換行\n第二行 ",'layout'=>$ref===''?'text':'left','imageRefId'=>$ref,'caption'=>'使用者提供的圖片說明'),
        array('id'=>'details','heading'=>'','body'=>'完整資訊 '.$variant,'layout'=>'text','imageRefId'=>'','caption'=>'')
    ));
    $blocks=array(array('id'=>'headline','type'=>'headline','text'=>'影展完整標題','imageRefId'=>'','alignment'=>'center'),array('id'=>'details','type'=>'text','text'=>" 完整活動文字\n保留換行 ".$variant,'imageRefId'=>'','alignment'=>'left'));
    if($ref!=='')$blocks[]=array('id'=>'visual','type'=>'image','text'=>'使用者提供的圖片說明','imageRefId'=>$ref,'alignment'=>'center');
    return array('kind'=>'poster','title'=>'海報 '.$variant,'format'=>'portrait','theme'=>$variant==='refined'?'night':($variant==='fused'?'festival':'paper'),'blocks'=>$blocks);
}
function compositionAppCandidate($artifact,$label) {
    return array('artifact'=>$artifact,'rationale'=>'完整保留文字與固定圖片，只調整已要求的排版。','goalText'=>'本候選自己的目標 '.$label,'changeSummary'=>'本次實際排版變化 '.$label);
}
function compositionAppDirectionInput($project) {
    return $project['module']==='poster'?array('confirmedDirections'=>array('style','text','layout'),'directionRevision'=>$project['summaryRevision']):array();
}
function compositionAppVersion($project,$id) {foreach($project['versions'] as $version)if($version['id']===$id)return $version;throw new RuntimeException('Fixture version is missing.');}
function compositionAppItemIndex($raw,$id) {foreach($raw['creativeItems'] as $index=>$item)if($item['id']===$id)return $index;throw new RuntimeException('Fixture item is missing.');}
function compositionAppSaved($store,$project,$owner) {return jsonEncode($store->project($project['id'],$owner));}
function compositionAppNoPixels($adapter,$pngs,$label) {
    foreach($adapter->calls as $call){
        compositionAppCheck($call['model']==='fixed-composition-text-model'&&$call['images']===array(),$label.' fixed text model receives no image input');
        $encoded=jsonEncode($call['data']);
        foreach($pngs as $png)compositionAppCheck(strpos($encoded,base64_encode($png))===false&&strpos($encoded,$png)===false,$label.' no raw or base64 PNG in textual context');
        compositionAppCheck(field($call['data'],'imagePixelsProvided')===false,$label.' explicit metadata-only context');
        foreach(field($call['data'],'availableImageReferences',array()) as $ref){
            $metadata=$ref['versionSnapshot'];
            compositionAppCheck(field($metadata,'pixelsProvided')===false&&!isset($metadata['artifact'])&&!isset($metadata['asset'])&&!isset($metadata['bytes'])&&!isset($metadata['url'])&&!isset($metadata['path']),$label.' image metadata allowlist omits private media descriptors');
        }
    }
}
class CompositionAppFixtureAdapter {
    public $calls=array();public $responses=array();
    public function actualModel() {return 'fixture-composition-actual';}
    public function generate($model,$messages,$schema,$maxOutputTokens=6000,$images=array()) {
        $data=json_decode($messages[count($messages)-1]['content'],true,128,JSON_THROW_ON_ERROR);
        $this->calls[]=array('model'=>$model,'messages'=>$messages,'data'=>$data,'schema'=>$schema,'budget'=>$maxOutputTokens,'images'=>$images);
        if(!$this->responses)throw new RuntimeException('Unexpected inference: no queued fixture response.');
        return json_decode(jsonEncode(array_shift($this->responses)));
    }
}
$directory=sys_get_temp_dir().'/cocreation-composition-app-'.bin2hex(random_bytes(8));
if(!mkdir($directory,0700,true))throw new RuntimeException('Cannot create disposable fixture directory.');
try {
    $config=validateConfig(array('app_url'=>'http://localhost/studio/public/','data_dir'=>$directory,'openai_model'=>'fixed-composition-text-model','model_timeout_ms'=>120000));
    $store=new Store($directory);$owner=str_repeat('a',64);$memberId=str_repeat('c',32);
    $store->setMemberRoster(array(array('id'=>$memberId,'nickname'=>'固定排版測試夥伴','enabled'=>true,'provider'=>'ollama','model'=>'fixed-composition-text-model','ollamaUrl'=>'http://127.0.0.1:11434')),$memberId,true,$owner);
    $adapter=new CompositionAppFixtureAdapter();$app=new CocreationApp($store,$config,$owner,$adapter);
    compositionAppCheck($store->db instanceof PDO&&$store->db->getAttribute(PDO::ATTR_DRIVER_NAME)==='sqlite','real temporary PDO SQLite store, not a persistence mock');
    foreach(array('illustrated','poster') as $type){
        $adapter->calls=array();$adapter->responses=array();
        $project=$app->action(fixtureBoundNew($app,array('title'=>'排版整合 '.$type,'description'=>'不可被作品標題改寫的專案說明')))['project'];
        $project=$app->action(compositionAppInput($project,'create_item',array('type'=>'image','title'=>'固定來源圖片','description'=>'')))['project'];$imageItemId=$project['activeItemId'];
        $project=compositionAppUpload($app,$project,20,'第一版來源');$imageFirst=$project['versions'][0];
        $project=compositionAppUpload($app,$project,220,'第二版來源');$imageSecond=$project['versions'][1];
        $imageBytes=$app->readImageVersion(array('id'=>$project['id'],'itemId'=>$imageItemId,'versionId'=>$imageFirst['id']))['bytes'];
        $project=$app->action(compositionAppInput($project,'promote',array('versionId'=>$imageSecond['id'])))['project'];
        $project=$app->action(compositionAppInput($project,'create_item',array('type'=>'image','title'=>'同專案其他來源','description'=>'')))['project'];$otherImageItemId=$project['activeItemId'];
        $project=compositionAppUpload($app,$project,70,'另一項目圖片');$otherImage=$project['versions'][0];
        compositionAppCheck(count($adapter->calls)===0,'upload and image promotion make zero model calls '.$type);
        $project=$app->action(compositionAppInput($project,'create_item',array('type'=>$type,'title'=>'我的原生排版','description'=>'')))['project'];
        compositionAppCheck($project['activeItem']['enabled']===true&&moduleAdapter($type,$adapter) instanceof CompositionModule,'native module enabled and dispatched '.$type);
        $project=$app->action(compositionAppInput($project,'attach_reference',array('targetItemId'=>$imageItemId,'versionId'=>$imageFirst['id'])))['project'];$pin=$project['references'][0];
        $project=$app->action(compositionAppInput($project,'attach_reference',array('targetItemId'=>$otherImageItemId,'versionId'=>$otherImage['id'])))['project'];$unusedPin=$project['references'][1];
        compositionAppCheck($pin['versionId']===$imageFirst['id']&&$pin['versionSnapshot']['artifact']===$imageFirst['artifact'],'pin remains the explicitly selected older image, not latest official '.$type);
        $adapter->responses[]=array('reply'=>'主軸已足夠，可以確認方向並生成。','question'=>'','choices'=>array(),'directionStatus'=>'ready','direction'=>compositionAppBrief($type));
        $project=$app->action(fixtureProjectInput($app,$project,'discuss',array('text'=>'依完整活動內容整理原生排版方向')))['project'];
        compositionAppCheck($project['phase']==='summary'&&$project['summaryRevision']===$project['revision']&&count($project['versions'])===0&&$project['goalApprovedAt']===null,'ready discussion is not generation or direction approval '.$type);

        if($type==='poster'){
            $invalidDirections=array(array(),array('confirmedDirections'=>array('style','text'),'directionRevision'=>$project['summaryRevision']),array('confirmedDirections'=>array('style','content','functions'),'directionRevision'=>$project['summaryRevision']),array('confirmedDirections'=>array('text','style','layout'),'directionRevision'=>$project['summaryRevision']),array('confirmedDirections'=>array('style','text','layout','layout'),'directionRevision'=>$project['summaryRevision']),array('confirmedDirections'=>array('style','text','layout'),'directionRevision'=>$project['summaryRevision']-1),array('confirmedDirections'=>array('style','text','layout'),'directionRevision'=>(string)$project['summaryRevision']));
            foreach(array('approve_goal','confirm_generate') as $action)foreach($invalidDirections as $invalid){
                $before=compositionAppSaved($store,$project,$owner);$calls=count($adapter->calls);
                $input=$action==='approve_goal'?compositionAppInput($project,$action,$invalid):fixtureProjectInput($app,$project,$action,$invalid);
                compositionAppReject(function()use($app,$input){$app->action($input);},'poster rejects missing reordered duplicate wrong or stale direction confirmation '.$action,'DIRECTION_CONFIRMATION_REQUIRED');
                compositionAppCheck(count($adapter->calls)===$calls&&compositionAppSaved($store,$project,$owner)===$before,'poster direction failure has no model call or saved mutation '.$action);
            }
            $calls=count($adapter->calls);$project=$app->action(compositionAppInput($project,'approve_goal',compositionAppDirectionInput($project)))['project'];$confirmation=end($project['messages'])['directionConfirmation'];
            compositionAppCheck(count($adapter->calls)===$calls&&$confirmation===array('summaryRevision'=>$project['summaryRevision'],'style'=>$project['brief']['tone'],'text'=>$project['brief']['message'],'layout'=>$project['brief']['constraints']),'poster exact three-part approval records current summary and makes no inference');
            $generationAction='generate';
        }else $generationAction='confirm_generate';
        $originalArtifact=compositionAppArtifact($type,$pin['id']);$claimed=compositionAppCandidate($originalArtifact,'不實視覺聲明');$claimed['rationale']='我已檢視圖片，紅色主體很清楚';$adapter->responses[]=array('candidates'=>array($claimed));$before=compositionAppSaved($store,$project,$owner);$calls=count($adapter->calls);
        compositionAppReject(function()use($app,$project,$generationAction){$app->action(fixtureProjectInput($app,$project,$generationAction,compositionAppDirectionInput($project)));},'generate rejects model claim of seeing unavailable pixels '.$type,'MODEL_PIXEL_CLAIM',502);
        compositionAppCheck(count($adapter->calls)===$calls+1&&compositionAppSaved($store,$project,$owner)===$before,'pixel claim generation is not saved or automatically retried '.$type);
        $honestCandidate=compositionAppCandidate($originalArtifact,'原始');$honestCandidate['rationale']='沒有實際檢視圖片，僅依中繼資料安排版面。';$adapter->responses[]=array('candidates'=>array($honestCandidate));
        $project=$app->action(fixtureProjectInput($app,$project,$generationAction,compositionAppDirectionInput($project)))['project'];$original=$project['versions'][0];
        compositionAppCheck($original['rationale']==='沒有實際檢視圖片，僅依中繼資料安排版面。','negative pixel-inspection disclaimer is allowed unchanged '.$type);
        compositionAppCheck($original['artifact']===$originalArtifact&&$original['items']===compositionItems($originalArtifact,$type)&&$original['referencesSnapshot']===array($pin,$unusedPin),'generate saves complete native artifact and current reference context '.$type);
        compositionAppCheck($original['source']==='generated'&&$original['provenance']['requestedModel']==='fixed-composition-text-model'&&$original['provenance']['actualModel']==='fixture-composition-actual'&&!isset($original['provenance']['imageInputs']),'generated candidate has fixed text provenance, not image analysis '.$type);
        compositionAppCheck($project['officialVersionId']===null&&$project['title']==='排版整合 '.$type,'generation neither auto-adopts nor renames project '.$type);
        $project=$app->action(compositionAppInput($project,'promote',array('versionId'=>$original['id'])))['project'];
        foreach(array($pin,$unusedPin) as $removed)$project=$app->action(compositionAppInput($project,'remove_reference',array('referenceId'=>$removed['id'])))['project'];
        compositionAppCheck($project['references']===array()&&$project['goalApprovedAt']===null&&compositionAppVersion($project,$original['id'])===$original,'remove current references preserves historical version snapshot '.$type);

        $refinedArtifact=compositionAppArtifact($type,$pin['id'],'refined');$candidate=compositionAppCandidate($refinedArtifact,'修訂');
        $adapter->responses[]=array_merge(array('outcome'=>'revision','reply'=>'我已檢視圖片，紅色主體很清楚','question'=>'','choices'=>array()),$candidate);$before=compositionAppSaved($store,$project,$owner);$calls=count($adapter->calls);
        compositionAppReject(function()use($app,$project,$original){$app->action(fixtureProjectInput($app,$project,'discuss',array('text'=>'改用夜色主題','baseVersionId'=>$original['id'])));},'refine rejects model claim of seeing unavailable pixels '.$type,'MODEL_PIXEL_CLAIM',502);
        compositionAppCheck(count($adapter->calls)===$calls+1&&compositionAppSaved($store,$project,$owner)===$before,'pixel claim refinement preserves original state without retry '.$type);
        $adapter->responses[]=array_merge(array('outcome'=>'revision','reply'=>'提供完整候選供審閱。','question'=>'','choices'=>array()),$candidate);
        $project=$app->action(fixtureProjectInput($app,$project,'discuss',array('text'=>'改用夜色主題，保留原有固定圖片','baseVersionId'=>$original['id'])))['project'];$refined=end($project['versions']);$call=end($adapter->calls);
        compositionAppCheck($refined['basedOnVersionId']===$original['id']&&$refined['major']===$original['major']&&$refined['minor']===1&&$refined['referencesSnapshot']===array($pin),'refine retains used historical pin after current reference removal '.$type);
        compositionAppCheck($call['data']['sourceVersion']['id']===$original['id']&&$call['data']['sourceVersion']['artifact']===$originalArtifact&&$call['data']['availableImageReferences'][0]['versionId']===$imageFirst['id'],'refine sends exact chosen old source and image version metadata '.$type);
        $manualArtifact=$refinedArtifact;$manualArtifact['title'].=' 手動';$calls=count($adapter->calls);
        $project=$app->action(compositionAppInput($project,'snapshot',array('artifact'=>$manualArtifact,'basedOnVersionId'=>$refined['id'],'versionMode'=>'minor','goalAndRationale'=>" 手動完整目標\n保留原圖 ")))['project'];$manual=end($project['versions']);
        compositionAppCheck(count($adapter->calls)===$calls&&$manual['artifact']===$manualArtifact&&$manual['referencesSnapshot']===array($pin)&&$manual['provenance']===null,'manual save retains historical pin and makes zero model calls '.$type);
        compositionAppCheck($manual['source']==='snapshot'&&$manual['basedOnVersionId']===$refined['id']&&$manual['goalAndRationale']===" 手動完整目標\n保留原圖 ",'manual note and explicit source lineage are preserved '.$type);

        $selected=array($refined,$manual);$ids=array_column($selected,'id');$beforeVersions=$project['versions'];
        $adapter->responses[]=compositionAppCandidate(compositionAppArtifact($type,$pin['id'],'fused'),'融合');
        $project=$app->action(fixtureProjectInput($app,$project,'fuse',array('versionIds'=>$ids,'question'=>'保留來源圖片，整合兩版文字與排版')))['project'];$fused=end($project['versions']);
        compositionAppCheck($fused['source']==='fusion'&&$fused['referencesSnapshot']===array($pin)&&$fused['fusionSourceVersionIds']===$ids&&count($fused['fusionSourceSnapshots'])===2,'fusion preserves exact historical image pin and selected source lineage '.$type);
        compositionAppCheck(array_slice($project['versions'],0,count($beforeVersions))===$beforeVersions&&$project['officialVersionId']===$original['id'],'fusion never rewrites old versions or auto-adopts '.$type);
        $beforeVersions=$project['versions'];$response=array('items'=>array(),'summary'=>'沒有實際檢視圖片，各版依自己的目標評估，沒有唯一冠軍。');
        foreach($selected as $source)$response['items'][]=array('versionId'=>$source['id'],'fit'=>'符合自己的目標','strength'=>'結構清楚','tradeoff'=>'排列取捨','suggestion'=>'可考慮留白');
        $claimed=$response;$claimed['items'][0]['strength']='我已檢視圖片，紅色主體很清楚';$adapter->responses[]=$claimed;$before=compositionAppSaved($store,$project,$owner);$calls=count($adapter->calls);
        compositionAppReject(function()use($app,$project,$ids){$app->action(fixtureProjectInput($app,$project,'compare',array('versionIds'=>$ids)));},'compare rejects nested model claim of seeing unavailable pixels '.$type,'MODEL_PIXEL_CLAIM',502);
        compositionAppCheck(count($adapter->calls)===$calls+1&&compositionAppSaved($store,$project,$owner)===$before,'pixel claim comparison saves no commentary or artwork and is not retried '.$type);
        $adapter->responses[]=$response;
        $project=$app->action(fixtureProjectInput($app,$project,'compare',array('versionIds'=>$ids,'question'=>'比較兩版自己的目標')))['project'];$comparison=end($project['comparisons']);$message=end($project['messages']);$call=end($adapter->calls);
        compositionAppCheck($comparison['versionIds']===$ids&&$comparison['referencesSnapshot']===array($pin)&&$message['referencesSnapshot']===array($pin),'compare and message retain selected historical reference pool '.$type);
        compositionAppCheck(array_column($call['data']['selectedVersions'],'goalAndRationale')===array_column($selected,'goalAndRationale')&&$comparison['goalBasis']==='version_snapshots'&&$comparison['goalSnapshot']===null,'comparison uses each selected version own immutable goal '.$type);
        compositionAppCheck($project['versions']===$beforeVersions&&$project['officialVersionId']===$original['id']&&compositionAppVersion($project,$original['id'])===$original,'compare leaves all versions immutable and official unchanged '.$type);
        $allContextIds=array($original['id'],$manual['id']);$response=array('items'=>array(),'summary'=>'保留每個選取來源的完整參考脈絡。');
        foreach($allContextIds as $id)$response['items'][]=array('versionId'=>$id,'fit'=>'依該版目標','strength'=>'完整文字','tradeoff'=>'風格差異','suggestion'=>'自行選擇');
        $adapter->responses[]=$response;$project=$app->action(fixtureProjectInput($app,$project,'compare',array('versionIds'=>$allContextIds)))['project'];$comparison=end($project['comparisons']);
        compositionAppCheck($comparison['referencesSnapshot']===array($pin,$unusedPin)&&end($project['messages'])['referencesSnapshot']===array($pin,$unusedPin),'comparison retains full selected context including unused historical context pin '.$type);
        compositionAppCheck($project['versions']===$beforeVersions&&$project['references']===array(),'comparison does not reattach any historical reference '.$type);
        $withoutHistoricalPins=$project;foreach($withoutHistoricalPins['versions'] as &$source)$source['referencesSnapshot']=array();unset($source);
        $selectedInput=array('versionIds'=>$allContextIds);$historicalBytes=strlen(jsonEncode(array($pin,$unusedPin)))-strlen(jsonEncode(array()));
        compositionAppCheck(inferenceGrowthBudget($project,'compare',$selectedInput)-inferenceGrowthBudget($withoutHistoricalPins,'compare',$selectedInput)===2*$historicalBytes,'selected historical pins increase comparison budget by both persisted copies '.$type);
        compositionAppCheck(inferenceGrowthBudget($project,'discuss',array('baseVersionId'=>$original['id']))-inferenceGrowthBudget($withoutHistoricalPins,'discuss',array('baseVersionId'=>$original['id']))===2*$historicalBytes,'selected historical pins increase refinement budget before inference '.$type);
        compositionAppCheck(inferenceGrowthBudget($project,'fuse',$selectedInput)>inferenceGrowthBudget($withoutHistoricalPins,'fuse',$selectedInput)&&inferenceGrowthBudget($project,'generate')===inferenceGrowthBudget($withoutHistoricalPins,'generate'),'fusion reserves historical context but new generation does not inherit unselected history '.$type);

        // Corrupt only disposable saved fixtures, then exercise real public app actions.
        // Restoring this test data is not an application repair or external write.
        $baseline=$store->project($project['id'],$owner);$index=compositionAppItemIndex($baseline,$project['activeItemId']);
        $crowded=$baseline;$budget=inferenceGrowthBudget($project,'compare',$selectedInput);$crowded['fixturePadding']=str_repeat('x',2000000-$budget-strlen(jsonEncode($baseline))+100);
        $store->save($crowded,$owner);$crowdedProject=$app->project($project['id']);$before=compositionAppSaved($store,$crowdedProject,$owner);$calls=count($adapter->calls);
        compositionAppReject(function()use($app,$crowdedProject,$selectedInput){$app->action(fixtureProjectInput($app,$crowdedProject,'compare',$selectedInput));},'historical reference storage reservation rejects near-full project before inference '.$type,'PROJECT_LIMIT');
        compositionAppCheck(count($adapter->calls)===$calls&&compositionAppSaved($store,$crowdedProject,$owner)===$before,'capacity failure leaves historical artwork unchanged and makes no model call '.$type);$store->save($baseline,$owner);
        $badPins=array();$bad=$pin;$bad['projectId']=str_repeat('f',32);$badPins['foreign project']=$bad;
        $bad=$pin;$bad['targetItemId']=$otherImageItemId;$badPins['sameproject wrong source item']=$bad;
        $bad=$pin;$bad['versionId']=$imageSecond['id'];$badPins['different saved version id']=$bad;
        $bad=$pin;$bad['versionSnapshot']['id']=$imageSecond['id'];$badPins['snapshot version mismatch']=$bad;
        $bad=$pin;$bad['versionSnapshot']['contentType']='short_text';$badPins['wrong source content type']=$bad;
        $bad=$pin;$bad['versionSnapshot']['artifact']['title']='偽造圖片標題';$badPins['changed source artifact metadata']=$bad;
        $bad=$pin;$bad['versionSnapshot']['artifact']['asset']['sha256']=str_repeat('0',64);$badPins['forged media descriptor']=$bad;
        foreach($badPins as $label=>$badPin){
            $corrupted=$baseline;$corrupted['creativeItems'][$index]['references']=array($badPin);$store->save($corrupted,$owner);$badProject=$app->project($project['id']);$before=compositionAppSaved($store,$badProject,$owner);$calls=count($adapter->calls);
            $code=$label==='sameproject wrong source item'?'VERSION_NOT_FOUND':'COMPOSITION_REFERENCE_INVALID';$status=$code==='VERSION_NOT_FOUND'?404:409;
            compositionAppReject(function()use($app,$badProject){$app->action(fixtureProjectInput($app,$badProject,'summarize'));},'malicious current reference rejected before model: '.$label.' '.$type,$code,$status);
            compositionAppCheck(count($adapter->calls)===$calls&&compositionAppSaved($store,$badProject,$owner)===$before,'invalid reference has no model call or saved mutation: '.$label.' '.$type);
            $store->save($baseline,$owner);
        }
        foreach(array('discuss','fuse','compare') as $action){
            $corrupted=$baseline;$sourceIndex=null;foreach($corrupted['creativeItems'][$index]['versions'] as $n=>$source)if($source['id']===$refined['id'])$sourceIndex=$n;
            $corrupted['creativeItems'][$index]['versions'][$sourceIndex]['referencesSnapshot'][0]['versionSnapshot']['artifact']['alt']='偽造歷史圖片說明';
            $store->save($corrupted,$owner);$badProject=$app->project($project['id']);$before=compositionAppSaved($store,$badProject,$owner);$calls=count($adapter->calls);
            $extra=$action==='discuss'?array('baseVersionId'=>$refined['id'],'text'=>'保留來源修訂'):array('versionIds'=>$ids,'question'=>'保留來源');
            compositionAppReject(function()use($app,$badProject,$action,$extra){$app->action(fixtureProjectInput($app,$badProject,$action,$extra));},'malicious historical reference rejected before '.$action.' '.$type,'COMPOSITION_REFERENCE_INVALID');
            compositionAppCheck(count($adapter->calls)===$calls&&compositionAppSaved($store,$badProject,$owner)===$before,'bad historical source is not sent or saved '.$action.' '.$type);$store->save($baseline,$owner);
        }
        foreach(array('missing','conflict') as $failure){
            $corrupted=$baseline;
            if($failure==='missing')$corrupted['creativeItems'][$index]['versions'][$sourceIndex]['referencesSnapshot']=array();
            else{$changedPin=$pin;$changedPin['versionId']=$imageSecond['id'];$changedPin['versionSnapshot']=$imageSecond;$corrupted['creativeItems'][$index]['references']=array($changedPin);}
            $store->save($corrupted,$owner);$badProject=$app->project($project['id']);$before=compositionAppSaved($store,$badProject,$owner);$calls=count($adapter->calls);
            compositionAppReject(function()use($app,$badProject,$refined){$app->action(fixtureProjectInput($app,$badProject,'discuss',array('baseVersionId'=>$refined['id'],'text'=>'保留來源圖片')));},'missing historical pin or conflicting newer pin blocks refinement '.$failure.' '.$type,$failure==='missing'?'COMPOSITION_REFERENCE_MISSING':'COMPOSITION_REFERENCE_CONFLICT');
            compositionAppCheck(count($adapter->calls)===$calls&&compositionAppSaved($store,$badProject,$owner)===$before,'source pin failure does not refresh image or call model '.$failure.' '.$type);$store->save($baseline,$owner);
        }
        $corrupted=$baseline;$imageIndex=compositionAppItemIndex($corrupted,$imageItemId);$forgedImage=$imageFirst['artifact'];$forgedImage['asset']=$otherImage['artifact']['asset'];
        $corrupted['creativeItems'][$imageIndex]['versions'][0]['artifact']=$forgedImage;$forgedPin=$pin;$forgedPin['versionSnapshot']['artifact']=$forgedImage;$corrupted['creativeItems'][$index]['references']=array($forgedPin);
        $store->save($corrupted,$owner);$badProject=$app->project($project['id']);$before=compositionAppSaved($store,$badProject,$owner);$calls=count($adapter->calls);
        compositionAppReject(function()use($app,$badProject){$app->action(fixtureProjectInput($app,$badProject,'summarize'));},'matching forged snapshot and saved artifact cannot grant another item media access '.$type,'MEDIA_NOT_FOUND',404);
        compositionAppCheck(count($adapter->calls)===$calls&&compositionAppSaved($store,$badProject,$owner)===$before,'private media ownership rejects before model even when descriptors agree '.$type);$store->save($baseline,$owner);
        $project=$app->project($project['id']);
        $missing=compositionAppArtifact($type,str_repeat('e',32));$before=compositionAppSaved($store,$project,$owner);$calls=count($adapter->calls);
        compositionAppReject(function()use($app,$project,$missing,$refined){$app->action(compositionAppInput($project,'snapshot',array('artifact'=>$missing,'basedOnVersionId'=>$refined['id'],'goalAndRationale'=>'不可捏造引用')));},'manual unknown image reference rejected '.$type,'COMPOSITION_REFERENCE_MISSING');
        compositionAppCheck(count($adapter->calls)===$calls&&compositionAppSaved($store,$project,$owner)===$before,'malicious manual reference saves nothing and makes no model call '.$type);
        foreach(array('https://example.invalid/image.png','data:image/png;base64,AAA','../../private.png',$imageFirst['id']) as $malicious){
            $badArtifact=$manualArtifact;foreach($badArtifact['blocks'] as &$block)if($block['imageRefId']!=='')$block['imageRefId']=$malicious;unset($block);
            $code=$malicious===$imageFirst['id']?'COMPOSITION_REFERENCE_MISSING':'ARTIFACT_INVALID';$status=$code==='ARTIFACT_INVALID'?400:409;
            compositionAppReject(function()use($app,$project,$badArtifact,$refined){$app->action(compositionAppInput($project,'snapshot',array('artifact'=>$badArtifact,'basedOnVersionId'=>$refined['id'],'goalAndRationale'=>'不接受網址或來源版本代替引用')));},'manual URL data URI path or version id cannot substitute for pin '.$type,$code,$status);
        }
        compositionAppCheck(count($adapter->calls)===$calls&&compositionAppSaved($store,$project,$owner)===$before,'all manual malformed references fail closed without model or persistence '.$type);

        $otherOwnerApp=new CocreationApp($store,$config,str_repeat('b',64),$adapter);
        compositionAppReject(function()use($otherOwnerApp,$project,$imageItemId,$imageFirst){$otherOwnerApp->readImageVersion(array('id'=>$project['id'],'itemId'=>$imageItemId,'versionId'=>$imageFirst['id']));},'private image rejects different owner '.$type,'PROJECT_NOT_FOUND',404);
        compositionAppReject(function()use($app,$project,$otherImageItemId,$imageFirst){$app->readImageVersion(array('id'=>$project['id'],'itemId'=>$otherImageItemId,'versionId'=>$imageFirst['id']));},'private image requires exact source item and version '.$type,'VERSION_NOT_FOUND',404);
        $reread=$app->readImageVersion(array('id'=>$project['id'],'itemId'=>$imageItemId,'versionId'=>$imageFirst['id']));
        compositionAppCheck($reread['bytes']===$imageBytes&&hash('sha256',$reread['bytes'])===$imageFirst['artifact']['asset']['sha256'],'historical layout use never modifies original image pixels '.$type);

        // A new generation does not inherit removed pins from arbitrary old versions.
        $adapter->responses[]=compositionAppBrief($type);$project=$app->action(fixtureProjectInput($app,$project,'summarize'))['project'];
        $before=compositionAppSaved($store,$project,$owner);$calls=count($adapter->calls);$adapter->responses[]=array('candidates'=>array(compositionAppCandidate($originalArtifact,'未授權舊引用')));
        compositionAppReject(function()use($app,$project){$app->action(fixtureProjectInput($app,$project,'confirm_generate',compositionAppDirectionInput($project)));},'new generation cannot reuse removed historical pin without selected source '.$type,'MODEL_IMAGE_REFERENCE_INVALID',502);
        compositionAppCheck(count($adapter->calls)===$calls+1&&compositionAppSaved($store,$project,$owner)===$before,'bad model output saves neither approval nor candidate and is not retried '.$type);
        $adapter->responses[]=array('candidates'=>array(compositionAppCandidate(compositionAppArtifact($type,'','text-only'),'明確純文字')));
        $project=$app->action(fixtureProjectInput($app,$project,'confirm_generate',compositionAppDirectionInput($project)))['project'];$textOnly=end($project['versions']);
        compositionAppCheck($textOnly['referencesSnapshot']===array()&&$project['references']===array()&&$project['officialVersionId']===$original['id'],'text-only generation creates no fake media, reattached pins or auto-adoption '.$type);
        if($type==='poster'){
            $confirmations=array_values(array_filter($project['messages'],function($message){return $message['kind']==='goal_approval';}));$latest=end($confirmations)['directionConfirmation'];
            compositionAppCheck($latest===array('summaryRevision'=>$project['summaryRevision'],'style'=>$project['brief']['tone'],'text'=>$project['brief']['message'],'layout'=>$project['brief']['constraints']),'poster confirm_generate pins exact current three-part summary');
        }
        foreach(array('我建議你檢視圖片是否清晰','我只能分析圖片中繼資料，沒有看見圖片像素','我可以協助你分析圖片中繼資料','我已分析圖片的標題與替代文字','I have inspected the image metadata.') as $allowed){
            $beforeVersions=$project['versions'];$calls=count($adapter->calls);$adapter->responses[]=array('outcome'=>'clarification','reply'=>$allowed,'question'=>'','choices'=>array(),'artifact'=>$refinedArtifact,'rationale'=>'','goalText'=>'','changeSummary'=>'');
            $project=$app->action(fixtureProjectInput($app,$project,'discuss',array('baseVersionId'=>$refined['id'],'text'=>'只討論已提供的圖片中繼資料')))['project'];
            compositionAppCheck(count($adapter->calls)===$calls+1&&strpos(end($project['messages'])['text'],$allowed)!==false&&$project['versions']===$beforeVersions&&$project['officialVersionId']===$original['id'],'metadata analysis and user-directed inspection advice remain allowed '.$allowed.' '.$type);
        }
        compositionAppCheck(compositionAppVersion($project,$original['id'])===$original&&compositionAppVersion($project,$refined['id'])===$refined&&compositionAppVersion($project,$manual['id'])===$manual,'all earlier composition versions remain immutable '.$type);
        compositionAppNoPixels($adapter,array(compositionAppPng(20),compositionAppPng(220),compositionAppPng(70)),$type);
        compositionAppCheck($adapter->responses===array(),'every queued inference consumed once without retry '.$type);
    }
    echo 'PASS '.$compositionAppChecks." native composition application checks\n";
}finally{compositionAppClean($directory);}
