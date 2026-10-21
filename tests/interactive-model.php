<?php
/** Native PHP 7.4+ injected-model fixtures: php tests/interactive-model.php
 * UNEXECUTED in the authoring environment: PHP is unavailable.
 * Node source contracts and independent JS oracles are NOT PHP execution,
 * syntax validation, browser rendering, real-provider or HTTP acceptance.
 * No credentials, network, paid inference, database, file writes or publication.
 */
require_once dirname(__DIR__).'/app/bootstrap.php';
require_once dirname(__DIR__).'/app/interactive.php';
require_once dirname(__DIR__).'/app/modules/interactive.php';
$interactiveModelChecks=0;
function interactiveModelCheck($ok,$label) {global $interactiveModelChecks;if(!$ok)throw new RuntimeException('FAIL '.$label);$interactiveModelChecks++;echo 'PASS '.$label."\n";}
function interactiveModelReject($fn,$label,$code='MODEL_OUTPUT_INVALID',$status=502) {$error=null;try{$fn();}catch(AppError $e){$error=$e;}interactiveModelCheck($error instanceof AppError&&$error->errorCode===$code&&$error->status===$status,$label);}
function interactiveModelLayer($id='hero') {return array('id'=>$id,'label'=>'主圖形','type'=>'ellipse','x'=>60,'y'=>80,'width'=>120,'height'=>120,'fill'=>'#336699','stroke'=>'none','strokeWidth'=>0,'opacity'=>1,'rotation'=>0,'motion'=>'none','motionAmount'=>0,'motionSpeed'=>0,'interaction'=>'none');}
function interactiveModelParameter($selected=false) {return array('id'=>'hero_x','label'=>'水平位置','layerId'=>'hero','target'=>'x','min'=>0,'max'=>600,'step'=>10,'value'=>60,'previousValue'=>$selected?50:60,'selected'=>$selected);}
function interactiveModelArtifact($selected=false) {$accent=interactiveModelLayer('accent');$accent['type']='line';$accent['y']=240;$accent['width']=300;$accent['height']=0;$accent['fill']='none';$accent['stroke']='#112233';$accent['strokeWidth']=2;return array('kind'=>'interactive','title'=>' 幾何節奏 ','width'=>640,'height'=>480,'background'=>'#ffffff','animation'=>false,'duration'=>8,'layers'=>array(interactiveModelLayer(),$accent),'parameters'=>array(interactiveModelParameter($selected)));}
function interactiveModelBrief() {return array('purpose'=>'建議水平位置參數，使用者自行勾選。','audience'=>'一般觀眾','message'=>'簡單圓形與直線構圖','tone'=>'無動畫','constraints'=>'無互動','summary'=>'以簡單圓形與直線構成靜態畫面，提議位置參數供使用者選用。','items'=>array(array('id'=>'document','label'=>'互動程式來源')));}
function interactiveModelPin() {$artifact=array('kind'=>'image','title'=>'使用者固定圖片','alt'=>'使用者提供的文字說明','attribution'=>'使用者','asset'=>array('id'=>str_repeat('e',32),'mime'=>'image/png','width'=>640,'height'=>480,'byteLength'=>1024,'sha256'=>str_repeat('f',64),'normalization'=>'png-v1'));return array('id'=>str_repeat('1',32),'projectId'=>str_repeat('8',32),'targetItemId'=>str_repeat('d',32),'targetItemTitle'=>'圖片參考','versionId'=>str_repeat('a',32),'versionSnapshot'=>array('id'=>str_repeat('a',32),'contentType'=>'image','title'=>'固定圖片','artifact'=>$artifact,'items'=>imageArtifactItems($artifact),'secretTransport'=>'must not forward'),'pinnedAt'=>'2026-01-01T00:00:00+00:00');}
function interactiveModelVersion($id='b') {$artifact=interactiveModelArtifact(true);return array('id'=>str_repeat($id,32),'number'=>1,'major'=>1,'minor'=>0,'title'=>'來源 '.$id,'contentType'=>'interactive','artifact'=>$artifact,'items'=>interactiveItems($artifact),'rationale'=>'來源說明','source'=>'manual','basedOnVersionId'=>null,'goalText'=>'以簡單幾何呈現互動節奏。','changeSummary'=>'原有完整快照','goalSnapshot'=>interactiveModelBrief(),'referencesSnapshot'=>array(interactiveModelPin()),'discussionMessageIds'=>array('fixture_message'),'provenance'=>array('provider'=>'fixture','model'=>'fixed-fixture-v1'),'createdAt'=>'2026-01-01T00:00:00+00:00');}
function interactiveModelProject() {return array('title'=>'互動視覺測試','description'=>'安全原生宣告式視覺','module'=>'interactive','activeItem'=>array('title'=>'幾何節奏','description'=>'完整視覺作品'),'references'=>array(interactiveModelPin()),'messages'=>array(),'brief'=>interactiveModelBrief(),'goalApprovedAt'=>'2026-01-01T00:00:00+00:00','officialVersionId'=>null,'versions'=>array(interactiveModelVersion()));}
class InteractiveFixtureAdapter {
    public $mode='normal';public $calls=0;public $history=array();public $raw=null;
    public function generate($model,$messages,$schema,$maxOutputTokens=6000) {
        $this->calls++;$data=json_decode($messages[1]['content'],true,64,JSON_THROW_ON_ERROR);$this->history[]=array('model'=>$model,'messages'=>$messages,'schema'=>$schema,'maxOutputTokens'=>$maxOutputTokens,'data'=>$data,'argumentCount'=>func_num_args());if($this->raw!==null)return $this->raw;
        $props=$schema['properties'];$candidate=array('artifact'=>interactiveModelArtifact(),'rationale'=>'以安全原生結構表達幾何構圖，參數尚未勾選。','goalText'=>'以簡單幾何呈現互動節奏。','changeSummary'=>'初次整理確認方向。');
        if(isset($props['directionStatus'])){$out=array('reply'=>'主軸已足夠，可以確認方向並生成，也能繼續討論。','question'=>'','choices'=>array(),'directionStatus'=>'ready','direction'=>interactiveModelBrief());if($this->mode==='exploring'){$out['directionStatus']='exploring';$out['reply']='可以先聚焦畫面。';$out['question']='你想以什麼圖形作為主角？';$out['direction']=array('purpose'=>'','audience'=>'','message'=>'','tone'=>'','constraints'=>'','summary'=>'','items'=>array());}}
        elseif(isset($props['purpose']))$out=interactiveModelBrief();
        elseif(isset($props['candidates'])){
            $out=array('candidates'=>array($candidate));
            if($this->mode==='extra_candidate')$out['candidates'][]=$candidate;
            if($this->mode==='code')$out['candidates'][0]['artifact']['code']='fetch("https://example.invalid/")';
            if($this->mode==='wrong_kind')$out['candidates'][0]['artifact']['kind']='vector';
            if($this->mode==='string_number')$out['candidates'][0]['artifact']['width']='640';
            if($this->mode==='bad_grid')$out['candidates'][0]['artifact']['parameters'][0]['value']=61;
            if($this->mode==='url_color')$out['candidates'][0]['artifact']['background']='url(https://example.invalid/)';
            if($this->mode==='huge_response')$out['candidates'][0]['rationale']=str_repeat('x',90001);
            if($this->mode==='selected_new')$out['candidates'][0]['artifact']['parameters'][0]['selected']=true;
            if($this->mode==='new_history')$out['candidates'][0]['artifact']['parameters'][0]['previousValue']=50;
            if($this->mode==='pixel_claim')$out['candidates'][0]['rationale']='我已檢視圖片像素並確認配色。';
        }elseif(isset($props['outcome'])){
            $source=$data['sourceVersion'];$out=array_merge($candidate,array('outcome'=>'revision','reply'=>'已經採用並取代正式版。','question'=>'','choices'=>array(),'artifact'=>$source['artifact'],'goalText'=>$source['goalText'],'changeSummary'=>'將主圖形填色改為暖橙色。'));$out['artifact']['layers'][0]['fill']='#cc6600';
            if(in_array($this->mode,array('unchanged','metadata_only','goal_only','combined_revert','ids_only','ids_goal','case_only','proposal_only','title_only','selected_value','wrong_previous','false_history'),true))$out['artifact']=$source['artifact'];
            if($this->mode==='goal_only'||$this->mode==='ids_goal')$out['goalText']='只更新本版目標。';
            if($this->mode==='ids_only'||$this->mode==='ids_goal')$out['artifact']['layers'][1]['id']='new_accent';
            if($this->mode==='case_only')$out['artifact']['background']='#FFFFFF';
            if($this->mode==='proposal_only'){$parameter=interactiveModelParameter();$parameter['id']='hero_y';$parameter['label']='垂直位置';$parameter['target']='y';$parameter['value']=80;$parameter['previousValue']=80;$out['artifact']['parameters'][]=$parameter;}
            if($this->mode==='title_only')$out['artifact']['title']='新的作品標題';
            if($this->mode==='flip_selection')$out['artifact']['parameters'][0]['selected']=!$source['artifact']['parameters'][0]['selected'];
            if($this->mode==='drop_selected')$out['artifact']['parameters']=array();
            if($this->mode==='retarget')$out['artifact']['parameters'][0]['target']='y';
            if($this->mode==='rename_parameter')$out['artifact']['parameters'][0]['id']='new_control';
            if($this->mode==='selected_value'||$this->mode==='wrong_previous'){$out['artifact']['parameters'][0]['value']=70;$out['artifact']['parameters'][0]['previousValue']=$this->mode==='wrong_previous'?50:60;}
            if($this->mode==='false_history')$out['artifact']['parameters'][0]['previousValue']=40;
            if($this->mode==='unselected_value'){$out['artifact']['parameters'][0]['value']=70;$out['artifact']['parameters'][0]['previousValue']=60;}
            if($this->mode==='revision_question')$out['question']='還有哪裡要改？';
            if(strpos($this->mode,'clarification')===0){$out=array('outcome'=>'clarification','reply'=>'可先討論原生視覺與可選參數。','question'=>'','choices'=>array(),'artifact'=>$source['artifact'],'rationale'=>'','goalText'=>'','changeSummary'=>'');
                if($this->mode==='clarification_changed')$out['artifact']['layers'][0]['fill']='#cc6600';
                if($this->mode==='clarification_ids')$out['artifact']['layers'][1]['id']='new_accent';
                if($this->mode==='clarification_metadata'){$out['goalText']='討論中但不保存的目標';$out['rationale']='討論文字';$out['changeSummary']='不保存的摘要';}
                if($this->mode==='clarification_claim')$out['reply']='已經修改完成。';
                if($this->mode==='clarification_two_questions'){$out['reply']='要改哪裡？';$out['question']='什麼風格？';}
                if($this->mode==='clarification_choices'){$out['question']='你要先討論哪一部分？';$out['choices']=array(array('id'=>'visual','label'=>'畫面','value'=>'先討論畫面。'),array('id'=>'motion','label'=>'動畫','value'=>'先討論動畫。'));}
            }
        }elseif(isset($props['artifact'])){
            $out=$candidate;$out['artifact']=$data['selectedVersions'][0]['artifact'];$out['artifact']['layers'][0]['fill']='#cc6600';$out['artifact']['layers'][1]['rotation']=20;$out['changeSummary']='整合所選版本的配色與角度。';
            if(in_array($this->mode,array('copy_source','title_copy','ids_copy','proposal_copy','static_duration_copy','dead_motion_copy','animation_flag_copy','zero_speed_wave_copy','zero_speed_pulse_copy','zero_speed_spin_copy','zero_speed_orbit_alias','dead_paint_copy','invisible_layer_copy','unpainted_layer_copy'),true))$out['artifact']=$data['selectedVersions'][0]['artifact'];
            if($this->mode==='copy_second')$out['artifact']=$data['selectedVersions'][1]['artifact'];
            if($this->mode==='title_copy')$out['artifact']['title']='融合新名稱';
            if($this->mode==='ids_copy')$out['artifact']['layers'][1]['id']='new_accent';
            if($this->mode==='proposal_copy')$out['artifact']['parameters'][0]['label']='新的參數說明';
            if($this->mode==='static_duration_copy')$out['artifact']['duration']=9;
            if($this->mode==='dead_motion_copy'){$out['artifact']['layers'][0]['motion']='wave';$out['artifact']['layers'][0]['motionAmount']=50;$out['artifact']['layers'][0]['motionSpeed']=2;}
            if($this->mode==='animation_flag_copy')$out['artifact']['animation']=true;
            if(in_array($this->mode,array('zero_speed_wave_copy','zero_speed_pulse_copy','zero_speed_spin_copy'),true)){$out['artifact']['animation']=true;$out['artifact']['layers'][0]['motion']=explode('_',$this->mode)[2];$out['artifact']['layers'][0]['motionAmount']=50;$out['artifact']['layers'][0]['motionSpeed']=0;}
            if($this->mode==='zero_speed_orbit_alias'){$out['artifact']['animation']=true;$out['artifact']['layers'][1]['x']=50;$out['artifact']['layers'][1]['motion']='orbit';$out['artifact']['layers'][1]['motionAmount']=10;$out['artifact']['layers'][1]['motionSpeed']=0;}
            if($this->mode==='dead_paint_copy'){$out['artifact']['layers'][1]['fill']='#ff00ff';$out['artifact']['layers'][0]['stroke']='#ff00ff';$out['artifact']['layers'][0]['strokeWidth']=0;}
            if($this->mode==='invisible_layer_copy'||$this->mode==='unpainted_layer_copy'){$layer=interactiveModelLayer('invisible');if($this->mode==='invisible_layer_copy')$layer['opacity']=0;else{$layer['fill']='none';$layer['stroke']='none';}$layer['motion']='wave';$layer['motionAmount']=50;$layer['motionSpeed']=2;$out['artifact']['animation']=true;$out['artifact']['layers'][]=$layer;}
            if($this->mode==='fusion_drop')$out['artifact']['parameters']=array();
        }else{
            $items=array();foreach($data['selectedVersions'] as $version)$items[]=array('versionId'=>$version['id'],'fit'=>'依本版目標比較。','strength'=>'原生幾何清楚。','tradeoff'=>'只有結構資料，沒有執行預覽。','suggestion'=>'可討論顏色。');$out=array('items'=>$items,'summary'=>'以各版目標選擇，沒有唯一冠軍。');
            if($this->mode==='duplicate_comparison')$out['items'][1]=$out['items'][0];
            if($this->mode==='foreign_comparison')$out['items'][0]['versionId']=str_repeat('9',32);
        }
        return json_decode(jsonEncode($out),false,128,JSON_THROW_ON_ERROR);
    }
}
function interactiveModelLastCall($adapter) {return $adapter->history[count($adapter->history)-1];}
function interactiveModelCallReject($adapter,$fn,$label,$code='MODEL_OUTPUT_INVALID',$calls=1,$status=502) {$before=$adapter->calls;interactiveModelReject($fn,$label,$code,$status);interactiveModelCheck($adapter->calls===$before+$calls,$label.' exact model call count');}
$adapter=new InteractiveFixtureAdapter();$module=new InteractiveModule($adapter);$project=interactiveModelProject();$source=$project['versions'][0];$model='fixed-fixture-v1';
$discussion=$module->discuss($project,'圓形搭配直線，不加動畫或互動。',$model);$call=interactiveModelLastCall($adapter);
interactiveModelCheck($discussion['directionStatus']==='ready'&&$discussion['direction']===interactiveModelBrief(),'strict seven-field four-part direction accepts explicit no animation or interaction');
foreach(array('message=畫面視覺','tone=動畫效果','purpose=參數設定說明','constraints=互動表現','ready 只表示可以請使用者確認方向') as $phrase)interactiveModelCheck(strpos($call['messages'][0]['content'],$phrase)!==false,'correct direction mapping '.$phrase);
$adapter->mode='exploring';$discussion=$module->discuss($project,'還沒想好畫面。',$model);interactiveModelCheck($discussion['direction']===null&&$discussion['question']!=='','one necessary question without saving exploratory direction');
$adapter->mode='normal';interactiveModelCheck($module->summarize($project,$model)===interactiveModelBrief(),'strict summary keeps canonical document label');
$before=$adapter->calls;$generated=$module->generate($project,'保持簡單。',$model);$call=interactiveModelLastCall($adapter);
interactiveModelCheck(count($generated)===1&&$generated[0]['artifact']===interactiveModelArtifact()&&$generated[0]['items']===interactiveItems(interactiveModelArtifact()),'generate exactly one complete declarative candidate');
interactiveModelCheck($adapter->calls===$before+1&&$call['argumentCount']===4&&$call['model']===$model&&$call['maxOutputTokens']===24000,'one bounded fixed-text-model call without image input or retry');
interactiveModelCheck(!$generated[0]['artifact']['parameters'][0]['selected']&&$generated[0]['artifact']['parameters'][0]['value']===$generated[0]['artifact']['parameters'][0]['previousValue'],'new parameter proposals never auto-select or invent previous history');
interactiveModelCheck(!isset($call['data']['versions'])&&$call['data']['imagePixelsProvided']===false&&count($call['data']['versionIndex'])===1,'omit unrelated full versions and declare no image pixels');
$metadata=$call['data']['pinnedReferences'][0]['versionSnapshot'];interactiveModelCheck($metadata['alt']===interactiveModelPin()['versionSnapshot']['artifact']['alt']&&$metadata['pixelsProvided']===false&&!isset($metadata['artifact'])&&!isset($metadata['items'])&&!isset($metadata['asset'])&&!isset($metadata['secretTransport']),'pinned image references use allowlisted metadata only');
foreach(array('extra_candidate','code','wrong_kind','string_number','bad_grid','url_color','huge_response') as $mode){$adapter->mode=$mode;interactiveModelCallReject($adapter,function()use($module,$project,$model){$module->generate($project,'',$model);},'strict generation rejects '.$mode);}
foreach(array('selected_new','new_history') as $mode){$adapter->mode=$mode;interactiveModelCallReject($adapter,function()use($module,$project,$model){$module->generate($project,'',$model);},'parameter adoption boundary rejects '.$mode,'MODEL_PARAMETER_STATE');}
$adapter->mode='pixel_claim';interactiveModelCallReject($adapter,function()use($module,$project,$model){$module->generate($project,'',$model);},'reject unprovided image pixel inspection claim','MODEL_PIXEL_CLAIM');
$adapter->raw=(object)array('candidates'=>(object)array());interactiveModelCallReject($adapter,function()use($module,$project,$model){$module->generate($project,'',$model);},'raw object-array distinction retained');$adapter->raw=null;
$oversize=$project;$oversize['description']=str_repeat('x',600001);interactiveModelCallReject($adapter,function()use($module,$oversize,$model){$module->generate($oversize,'',$model);},'complete context budget rejects before model','CONTEXT_LIMIT',0,409);
$adapter->mode='normal';$revision=$module->refine($project,$source,'只改主圖形為暖橙色。',$model);$call=interactiveModelLastCall($adapter);
interactiveModelCheck($revision['artifact']['layers'][0]['fill']==='#cc6600'&&$revision['artifact']['parameters']===$source['artifact']['parameters'],'clear edit returns complete candidate and preserves parameter selection current and previous values');
interactiveModelCheck($call['data']['sourceVersion']['artifact']===$source['artifact']&&$call['data']['latestUserMessage']==='只改主圖形為暖橙色。'&&$project['officialVersionId']===null,'unadopted exact source is sole refinement base');
interactiveModelCheck(strpos($revision['reply'],'尚未採用')!==false&&strpos($revision['reply'],'已經採用')===false,'model adoption claim replaced by honest candidate boundary');
interactiveModelCallReject($adapter,function()use($module,$project,$source,$model){$module->refine($project,$source,'修改',$model,array('document'));},'paragraph range rejected before inference','TARGET_ITEMS_INVALID',0,409);
$wrongSource=$source;$wrongSource['contentType']='vector';interactiveModelCallReject($adapter,function()use($module,$project,$wrongSource,$model){$module->refine($project,$wrongSource,'修改',$model);},'wrong source kind rejected before inference','INTERACTIVE_SOURCE_INVALID',0,409);
foreach(array('unchanged','metadata_only','ids_only','ids_goal','case_only') as $mode){$adapter->mode=$mode;interactiveModelCallReject($adapter,function()use($module,$project,$source,$model){$module->refine($project,$source,'修改',$model);},'no-op or identity-only revision rejected '.$mode,'MODEL_NO_REVISION');}
$adapter->mode='goal_only';$revision=$module->refine($project,$source,'只改本版目標。',$model);interactiveModelCheck($revision['artifact']===$source['artifact']&&strpos($revision['reply'],'僅更新本版目標')!==false,'goal-only revision requires exact unchanged artifact');
$combined=$source;$combined['goalAndRationale']='使用者保存的新目標與修改意見。';$adapter->mode='combined_revert';$revision=$module->refine($project,$combined,'恢復先前目標。',$model);$call=interactiveModelLastCall($adapter);interactiveModelCheck($revision['artifact']===$source['artifact']&&$call['data']['sourceVersion']['goalAndRationale']===$combined['goalAndRationale'],'combined own-goal authority supports deliberate legacy goal restoration');
$adapter->mode='ids_only';interactiveModelCallReject($adapter,function()use($module,$project,$combined,$model){$module->refine($project,$combined,'改目標。',$model);},'combined goal change cannot authorize identity-only churn','MODEL_NO_REVISION');
$adapter->mode='proposal_only';$revision=$module->refine($project,$source,'另提議垂直位置控制。',$model);interactiveModelCheck(count($revision['artifact']['parameters'])===2&&!$revision['artifact']['parameters'][1]['selected']&&strpos($revision['reply'],'畫面與行為沒有因此改變')!==false,'pure parameter proposals are real candidates honestly marked unselected');
$adapter->mode='title_only';$revision=$module->refine($project,$source,'只改標題。',$model);interactiveModelCheck($revision['artifact']['title']==='新的作品標題','visible title-only edit is real editor content');
$adapter->mode='selected_value';$revision=$module->refine($project,$source,'把已勾選水平位置改為70。',$model);interactiveModelCheck($revision['artifact']['parameters'][0]['value']===70&&$revision['artifact']['parameters'][0]['previousValue']===60&&$revision['artifact']['parameters'][0]['selected'],'explicit selected-value revision preserves exact prior value');
foreach(array('flip_selection','drop_selected','retarget','rename_parameter','wrong_previous','false_history') as $mode){$adapter->mode=$mode;interactiveModelCallReject($adapter,function()use($module,$project,$source,$model){$module->refine($project,$source,'改顏色。',$model);},'protected parameter state rejects '.$mode,'MODEL_PARAMETER_STATE');}
$unselected=$source;$unselected['artifact']=interactiveModelArtifact();$unselected['items']=interactiveItems($unselected['artifact']);$adapter->mode='unselected_value';interactiveModelCallReject($adapter,function()use($module,$project,$unselected,$model){$module->refine($project,$unselected,'改顏色。',$model);},'unselected existing values remain unchanged','MODEL_PARAMETER_STATE');
$adapter->mode='clarification';$clarification=$module->refine($project,$source,'可以討論嗎？',$model);interactiveModelCheck($clarification['items']===array()&&!isset($clarification['artifact'])&&!isset($clarification['goalText']),'clarification echo discarded without saving version or controls');
$adapter->mode='clarification_metadata';$clarification=$module->refine($project,$source,'繼續討論。',$model);interactiveModelCheck($clarification['rationale']===''&&!isset($clarification['goalText'])&&!isset($clarification['changeSummary']),'bounded unused clarification metadata discarded');
$adapter->mode='clarification_choices';$clarification=$module->refine($project,$source,'給我選項。',$model);interactiveModelCheck(count($clarification['choices'])===2,'one necessary clarification supports actual optional choices');
foreach(array('clarification_changed','clarification_ids') as $mode){$adapter->mode=$mode;interactiveModelCallReject($adapter,function()use($module,$project,$source,$model){$module->refine($project,$source,'討論。',$model);},'clarification must echo exact source '.$mode,'MODEL_CLARIFICATION_ARTIFACT');}
$adapter->mode='clarification_claim';interactiveModelCallReject($adapter,function()use($module,$project,$source,$model){$module->refine($project,$source,'討論。',$model);},'clarification cannot claim completed edit','MODEL_CLARIFICATION_CLAIM');
$adapter->mode='clarification_two_questions';interactiveModelCallReject($adapter,function()use($module,$project,$source,$model){$module->refine($project,$source,'討論。',$model);},'clarification cannot ask two questions','MODEL_QUESTION_COUNT');
$adapter->mode='revision_question';interactiveModelCallReject($adapter,function()use($module,$project,$source,$model){$module->refine($project,$source,'修改。',$model);},'revision cannot include unanswered question');
$other=interactiveModelVersion('c');$other['artifact']['layers'][1]['y']=280;$other['items']=interactiveItems($other['artifact']);$other['goalAndRationale']='另一版追求更多留白，不受共用目標覆蓋。';
$adapter->mode='normal';$fused=$module->fuse($project,array($source,$other),'融合兩版配色與角度。',$model);$call=interactiveModelLastCall($adapter);interactiveModelCheck($fused['artifact']['layers'][0]['fill']==='#cc6600'&&$fused['artifact']['parameters']===$source['artifact']['parameters'],'real complete fusion preserves explicitly selected control state');
interactiveModelCheck($call['data']['creativeGoal']===null&&$call['data']['goalApprovedAt']===null&&$call['data']['selectedVersions'][1]['goalAndRationale']===$other['goalAndRationale'],'fusion uses only selected snapshots and each own goal');
foreach(array('copy_source','copy_second','title_copy','ids_copy','proposal_copy','static_duration_copy','dead_motion_copy','animation_flag_copy','zero_speed_wave_copy','zero_speed_pulse_copy','zero_speed_spin_copy','zero_speed_orbit_alias','dead_paint_copy','invisible_layer_copy','unpainted_layer_copy') as $mode){$adapter->mode=$mode;interactiveModelCallReject($adapter,function()use($module,$project,$source,$other,$model){$module->fuse($project,array($source,$other),'融合。',$model);},'no fake fusion '.$mode,'MODEL_NO_REVISION');}
$adapter->mode='fusion_drop';interactiveModelCallReject($adapter,function()use($module,$project,$source,$other,$model){$module->fuse($project,array($source,$other),'融合。',$model);},'fusion cannot drop selected controls','MODEL_PARAMETER_STATE');
$conflict=$other;$conflict['artifact']['parameters'][0]['value']=70;$conflict['artifact']['parameters'][0]['previousValue']=60;$conflict['items']=interactiveItems($conflict['artifact']);interactiveModelCallReject($adapter,function()use($module,$project,$source,$conflict,$model){$module->fuse($project,array($source,$conflict),'融合。',$model);},'ambiguous selected parameter definitions block before inference','INTERACTIVE_PARAMETER_CONFLICT',0,409);
interactiveModelCallReject($adapter,function()use($module,$project,$source,$model){$module->fuse($project,array($source,$source),'融合。',$model);},'duplicate fusion source blocked before inference','FUSION_VERSIONS_INVALID',0,409);
$adapter->mode='normal';$compared=$module->compare($project,array($source,$conflict),'依各版目標比較。',$model);$call=interactiveModelLastCall($adapter);interactiveModelCheck(count($compared['items'])===2&&$call['data']['creativeGoal']===null&&$call['data']['selectedVersions'][1]['goalAndRationale']===$other['goalAndRationale']&&strpos($compared['summary'],'沒有執行預覽')!==false,'comparison permits distinct parameter states and evaluates each own goal without execution claims');
foreach(array('duplicate_comparison','foreign_comparison') as $mode){$adapter->mode=$mode;interactiveModelCallReject($adapter,function()use($module,$project,$source,$other,$model){$module->compare($project,array($source,$other),'比較。',$model);},'comparison rejects '.$mode);}
interactiveModelCallReject($adapter,function()use($module,$project,$source,$model){$module->compare($project,array($source,$source),'比較。',$model);},'duplicate comparison blocked before inference','COMPARISON_SELECTION',0,409);
interactiveModelCheck($source===interactiveModelVersion()&&$project===interactiveModelProject(),'all input artifacts goals references provenance and parameter history remain immutable');
echo 'PASS '.$interactiveModelChecks." native interactive model checks. No real provider, credentials or network used.\n";
