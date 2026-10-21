// Executed source contracts and independent JavaScript policy oracles ONLY.
// These do not execute PHP, call providers, run application HTTP or render UI.
// Native injected-model fixture: php tests/interactive-model.php, UNEXECUTED
// here because PHP is unavailable. An oracle is not PHP runtime validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=file=>readFile(new URL('../'+file,import.meta.url),'utf8');
const source=await read('app/modules/interactive.php'),fixtures=await read('tests/interactive-model.php'),base=await read('app/modules/titles.php');
const body=(text,start,end)=>{const i=text.indexOf(start);assert.ok(i>=0,`missing ${start}`);const j=end?text.indexOf(end,i+start.length):undefined;if(end)assert.ok(j>=0,`missing ${end}`);return text.slice(i,j);};
const method=(name,next)=>body(source,'protected function '+name+'(',next?'protected function '+next+'(':undefined);

test('interactive adapter inherits fixed text-model lifecycle without networking, storage, adoption or execution',()=>{
  for(const part of ['class InteractiveModule extends TitleModule',"return 'interactive'",'protected function itemLimit() { return 1; }'])assert.ok(source.includes(part),part);
  assert.doesNotMatch(source,/function (?:runDiscuss|runSummarize|stableBrief|validateSchemaValue)\(/);
  assert.doesNotMatch(source,/new (?:OpenAI|Ollama|Responses)|curl_|\b(?:file_get_contents|file_put_contents|fopen|readfile|exec|shell_exec|eval|unserialize)\s*\(|->(?:save|execute|adopt|generate|setImageInputs)\(/);
  assert.ok(source.includes('Preview/export and explicit parameter selection belong to the application'));
});

test('seven-field brief maps four ordered directions and accepts explicit no animation or interaction',()=>{
  const text=method('briefInstructions','artifactInstructions');
  for(const phrase of ['畫面視覺、動畫效果、參數設定說明、互動表現','message=畫面視覺','tone=動畫效果','purpose=參數設定說明','constraints=互動表現','audience=用途與觀眾','summary=四部分綜合方向','{"id":"document","label":"互動程式來源"}','動畫、互動都可明確為無','只要必要視覺資訊足夠就 ready','不要求問卷或固定輪數','不表示已確認或已生成','作品採用與參數勾選是不同動作'])assert.ok(text.includes(phrase),phrase);
});

test('artifact contract is bounded declarative data, never model program execution or external resources',()=>{
  const text=method('artifactInstructions','modelReferences');
  for(const phrase of ['kind=interactive、title、width、height、background、animation、duration、layers、parameters','1至2048整數','1至60整數秒','1至40項','0至24項','id、label、type、x、y、width、height、fill、stroke、strokeWidth、opacity、rotation、motion、motionAmount、motionSpeed、interaction','id、label、layerId、target、min、max、step、value、previousValue、selected','none、orbit、wave、pulse、spin','none、pointer、hover','最多三位小數','範圍須可整除 step','最多10000間隔','60000個 UTF8 位元組','沒有 schemaVersion、code、HTML、JavaScript、p5.js 原始碼、URL','所有文字原樣純文字顯示','不宣稱已採用、定稿、執行、匯出、部署'])assert.ok(text.includes(phrase),phrase);
});

test('parameter prompt preserves unrequested controls and distinguishes selected current values from proposals',()=>{
  const text=method('artifactInstructions','modelReferences');
  for(const phrase of ['新參數一律 selected=false、previousValue=value','已有參數不能更改 selected','未勾選既有參數的 value、previousValue 必須原樣保留','只在 latestUserMessage 或 question 明確要求時修改 value','previousValue 必須等於來源 value','value 未變時 previousValue 原樣保留','不可刪除已勾選參數或其圖層','未要求的圖層、文字、順序、動畫、互動及參數設定完整保留'])assert.ok(text.includes(phrase),phrase);
});

test('current and source image references are allowlisted metadata only, never pixels or transport fields',()=>{
  const text=method('modelReferences','context');
  for(const part of ["array('id','projectId','targetItemId','targetItemTitle','versionId','pinnedAt')","field($source,'contentType')==='image'","validateImageArtifact(field($source,'artifact'))","'title'=>$artifact['title']","'alt'=>$artifact['alt']","'attribution'=>$artifact['attribution']","'width'=>$artifact['asset']['width']","'pixelsProvided'=>false"] )assert.ok(text.includes(part),part);
  assert.doesNotMatch(text,/'(?:bytes|data|base64|url|path|image_url|assetId|sha256)'\s*=>/);
  const imageBranch=body(text,"if(field($source,'contentType')==='image'){",'}else');assert.doesNotMatch(imageBranch,/\$entry\['versionSnapshot'\]=\$source|\$entry\['versionSnapshot'\].*\$artifact[,;]/);
  assert.ok(method('context','ask').includes("$safeProject['references']=$this->modelReferences($project['references'])"));
  assert.ok(method('runRefine','selectedSources').includes("$data['sourceReferencesSnapshot']=$this->modelReferences(field($source,'referencesSnapshot',array()))"));
});

test('context omits unrelated full version bodies, retains dialogue, and bounds full requests and responses',()=>{
  const context=method('context','ask'),ask=method('ask','rejectsPixelInspectionClaim');
  assert.ok(context.includes('parent::context($safeProject)'));assert.ok(context.includes("unset($data['versions'])"));assert.ok(context.includes("$data['imagePixelsProvided']=false"));
  assert.equal((ask.match(/parent::ask\(/g)||[]).length,1);assert.ok(ask.includes('strlen(jsonEncode($value))<=90000'));assert.ok(ask.includes('rejectsPixelInspectionClaim'));
  assert.ok(base.includes("$this->moduleType()==='titles'?240000:600000"));
  assert.doesNotMatch(ask,/while\s*\(|catch\s*\(|imageInputs|prepareModelImageInputs|setImageInputs/);
});

test('same-id or same-binding conflicting parameter source states fail before fusion inference',()=>{
  const text=method('parameterSources','validateParameterState');
  assert.ok(text.includes("array('layerId','target','min','max','step','selected','value','previousValue')"));
  assert.ok(text.includes("$known[$id][$key]===$parameter[$key]"));assert.ok(text.includes("$bindings[$binding]===$id"));assert.ok(text.includes('INTERACTIVE_PARAMETER_CONFLICT'));
  const fuse=method('runFuse','runCompare');assert.ok(fuse.indexOf('$this->parameterSources($sources)')<fuse.indexOf('$this->ask('));
});

test('hard parameter state guard forbids model selection, retargeting, silent removal and fabricated history',()=>{
  const text=method('validateParameterState','contentFingerprint');
  for(const part of ["$parameter['selected']===false&&$parameter['previousValue']===$parameter['value']","$parameter['selected']===$prior['selected']","$parameter['layerId']===$prior['layerId']","$parameter['target']===$prior['target']","if(!$prior['selected'])","$parameter['value']===$prior['value']&&$parameter['previousValue']===$prior['previousValue']","$parameter['value']===$prior['value']?$prior['previousValue']:$prior['value']","if($prior['selected'])ensure(isset($next[$id])","$bindings[$binding]===$id",'MODEL_PARAMETER_STATE'])assert.ok(text.includes(part),part);
  assert.doesNotMatch(text,/\$parameter\['selected'\]\s*=\s*(?:true|false)|\$artifact\['parameters'\]\s*=/);
});

test('revision content fingerprint keeps proposal definitions, labels and ordered content while removing identities',()=>{
  const text=method('contentFingerprint','candidateProperties');
  for(const part of ["$ids[$layer['id']]='layer_'.$index","$layer['id']='layer_'.$index","$parameter['id']='parameter_'.$index","$parameter['layerId']=$ids[$parameter['layerId']]",'interactiveCompactJson($value)',"strtolower($value['background'])"])assert.ok(text.includes(part),part);
  assert.doesNotMatch(text,/unset\(\$\w+\[|sort\(|ksort\(|array_unique\(|trim\(/);
});

test('generation uses one complete candidate schema and hard-checks all proposed controls',()=>{
  const text=method('runGenerate','runRefine');assert.equal((text.match(/\$this->ask\(/g)||[]).length,1);
  assert.ok(text.includes("'minItems'=>1,'maxItems'=>1"));assert.ok(text.includes("validateModuleItemDefinitions($project['brief']['items'],'interactive')"));assert.ok(text.includes('$this->schema($props),24000'));
  assert.ok(method('candidateProperties','candidateResult').includes("'artifact'=>interactiveSchema()"));
  assert.ok(method('candidateResult','runGenerate').includes('$this->validateParameterState($artifact,$known)'));assert.ok(method('candidateResult','runGenerate').includes("'items'=>interactiveItems($artifact)"));
});

test('refinement takes exact unadopted source and per-version goals, never mutable common goal authority',()=>{
  const text=method('runRefine','selectedSources');
  assert.equal((text.match(/\$this->ask\(/g)||[]).length,1);
  for(const part of ['TARGET_ITEMS_INVALID',"$source=$this->sourceSnapshot($source)","$data['sourceVersion']=$this->creativeVersions(array($source))[0]","$data['latestUserMessage']=$text",'sourceVersion.goalAndRationale','沒有合併紀錄才用 goalText','不要求先採用','versionHasCombinedOverride($source)'])assert.ok(text.includes(part),part);
  assert.ok(text.indexOf('TARGET_ITEMS_INVALID')<text.indexOf('$this->ask('));
});

test('clarification requires exact source echo then discards artifact, parameters and goal metadata',()=>{
  const text=body(source,"if($v['outcome']==='clarification'){","ensure($question===''&&$choices===array()");
  assert.ok(text.includes("interactiveCompactJson($artifact)===interactiveCompactJson($source['artifact'])"));assert.ok(text.includes('MODEL_CLARIFICATION_ARTIFACT'));assert.ok(text.includes('rejectsCompletedEditClaim'));assert.ok(text.includes("'items'=>array(),'rationale'=>''"));
  assert.doesNotMatch(text,/'artifact'=>|'goalText'=>|'changeSummary'=>|appendVersion|validateParameterState/);
});

test('no-op and identity-only revision cannot be rescued by a goal edit; proposal-only edits stay honest',()=>{
  const text=method('runRefine','selectedSources');
  const identity="ensure($contentChanged||!$artifactChanged,'MODEL_NO_REVISION'",goal='ensure($contentChanged||$goalText!==versionGoalText($source)||$combinedChanged';
  assert.ok(text.includes(identity));assert.ok(text.includes(goal));assert.ok(text.indexOf(identity)<text.indexOf(goal));
  for(const phrase of ['此候選僅更新本版目標，完整作品保持原樣','畫面與行為沒有因此改變；新參數尚未勾選','尚未採用、定稿、取代正式版或代為勾選參數'])assert.ok(text.includes(phrase),phrase);
  assert.ok(text.includes("'reply'=>$revisionReply"));
});

test('selected compare and fusion use bounded unique versions and null shared-goal authority',()=>{
  const selection=method('selectedSources','selectedData'),data=method('selectedData','runFuse');
  assert.ok(selection.includes('count($versions)>=2&&count($versions)<=5'));assert.ok(selection.includes('!in_array($id,$ids,true)'));assert.ok(selection.includes("preg_match('/^[a-f0-9]{32}$/D',$id)"));
  assert.ok(data.includes("'creativeGoal'=>null,'goalApprovedAt'=>null"));assert.ok(data.includes("'selectedVersions'=>$this->creativeVersions($sources)"));assert.ok(data.includes("'imagePixelsProvided'=>false"));
  assert.doesNotMatch(data,/\$project\['brief'\]/);
});

test('fusion requires changed actual drawing against every source, not labels or unselected proposal changes',()=>{
  const text=method('runFuse','runCompare');
  assert.ok(text.includes("$result=$this->candidateResult($v,'融合',$known)"));assert.ok(text.includes("$drawing=interactiveDrawingFingerprint($result['artifact'])"));assert.ok(text.includes("foreach($sources as $source)ensure($drawing!==interactiveDrawingFingerprint($source['artifact'])"));
  assert.ok(text.includes('不能複製任一來源或只改標題、標籤、id、前次值、未勾選參數或摘要假稱融合'));assert.ok(text.includes('$this->schema($this->candidateProperties()),24000'));
  assert.doesNotMatch(text,/\$project\['brief'\]|setImageInputs|appendVersion/);
});

test('comparison separately evaluates each own goal, distinguishes proposal state, and never claims execution',()=>{
  const text=method('runCompare');for(const phrase of ['自己的 goalAndRationale','沒有合併紀錄才用 goalText','不以目前共用目標統一評分','未勾選參數是提議','已勾選才依 value 評估','沒有執行預覽或檢視圖片像素','不指定唯一冠軍','不融合作品','!in_array($id,$seen,true)','$this->schema($props),6000'])assert.ok(text.includes(phrase),phrase);
  assert.doesNotMatch(text,/parameterSources\(|\$project\['brief'\]|prepareModelImageInputs|setImageInputs/);
});

test('native fixtures disclose runtime limitations and cover schema, revision, controls, own goals and provenance',()=>{
  assert.ok(fixtures.includes('UNEXECUTED in the authoring environment: PHP is unavailable'));assert.ok(fixtures.includes("require_once dirname(__DIR__).'/app/bootstrap.php'"));
  for(const phrase of ['strict seven-field four-part direction accepts explicit no animation or interaction','one bounded fixed-text-model call without image input or retry','pinned image references use allowlisted metadata only','raw object-array distinction retained','complete context budget rejects before model','unadopted exact source is sole refinement base','goal-only revision requires exact unchanged artifact','pure parameter proposals are real candidates honestly marked unselected','explicit selected-value revision preserves exact prior value','unselected existing values remain unchanged','clarification echo discarded without saving version or controls','ambiguous selected parameter definitions block before inference','all input artifacts goals references provenance and parameter history remain immutable'])assert.ok(fixtures.includes(phrase),phrase);
  for(const mode of ['static_duration_copy','dead_motion_copy','animation_flag_copy','zero_speed_wave_copy','zero_speed_pulse_copy','zero_speed_spin_copy','zero_speed_orbit_alias','dead_paint_copy','invisible_layer_copy','unpainted_layer_copy'])assert.ok(fixtures.includes(mode),mode);
  assert.doesNotMatch(fixtures,/curl_|new PDO|new ResponsesClient|file_put_contents/);
});

// Independent policy oracles, not imports or execution of PHP implementation.
const layer=()=>({id:'hero',label:'主角',type:'ellipse',x:60,y:80,width:120,height:120,fill:'#336699',stroke:'none',strokeWidth:0,opacity:1,rotation:0,motion:'none',motionAmount:0,motionSpeed:0,interaction:'none'});
const parameter=(selected=false)=>({id:'hero_x',label:'水平位置',layerId:'hero',target:'x',min:0,max:600,step:10,value:60,previousValue:selected?50:60,selected});
const artifact=(selected=false)=>({kind:'interactive',title:'幾何節奏',width:640,height:480,background:'#ffffff',animation:false,duration:8,layers:[layer()],parameters:[parameter(selected)]});
function oracleState(next,old){
  const known=new Map(old.parameters.map(p=>[p.id,p])),bindings=new Map(old.parameters.map(p=>[p.layerId+':'+p.target,p.id])),seen=new Set();
  for(const p of next.parameters){seen.add(p.id);const binding=bindings.get(p.layerId+':'+p.target);if(binding&&binding!==p.id)throw Error('identity');const prior=known.get(p.id);
    if(!prior){if(p.selected!==false||p.previousValue!==p.value)throw Error('proposal');continue;}
    if(p.selected!==prior.selected||p.layerId!==prior.layerId||p.target!==prior.target)throw Error('selection');
    if(!prior.selected&&(p.value!==prior.value||p.previousValue!==prior.previousValue))throw Error('unselected');
    if(prior.selected&&p.previousValue!==(p.value===prior.value?prior.previousValue:prior.value))throw Error('history');
  }for(const p of old.parameters)if(p.selected&&!seen.has(p.id))throw Error('selected removal');return true;
}
function oracleDrawing(value){
  const a=structuredClone(value),layers=a.layers;for(const p of a.parameters)if(p.selected){const target=layers.find(l=>l.id===p.layerId);if(!target)throw Error('target');target[p.target]=p.value;}
  const drawing=[];let dynamic=false;
  for(const l of layers){
    delete l.id;delete l.label;l.fill=l.fill.toLowerCase();l.stroke=l.stroke.toLowerCase();
    if(l.type==='line')l.fill='none';if(l.stroke==='none'||l.strokeWidth===0){l.stroke='none';l.strokeWidth=0;}
    if(l.opacity===0||(l.fill==='none'&&l.stroke==='none'))continue;
    let moving=a.animation&&l.motion!=='none'&&l.motionAmount!==0;
    if(moving&&l.motionSpeed===0){if(l.motion==='orbit')l.x=Math.round((l.x+l.motionAmount)*1000)/1000;moving=false;}
    if(!moving){l.motion='none';l.motionAmount=0;l.motionSpeed=0;}else dynamic=true;
    drawing.push(l);
  }
  return JSON.stringify({width:a.width,height:a.height,background:a.background.toLowerCase(),animation:dynamic,duration:dynamic?a.duration:0,layers:drawing});
}
function oracleContent(value){const a=structuredClone(value),ids=new Map();a.background=a.background.toLowerCase();a.layers.forEach((l,i)=>{ids.set(l.id,'layer_'+i);l.id='layer_'+i;l.fill=l.fill.toLowerCase();l.stroke=l.stroke.toLowerCase();});a.parameters.forEach((p,i)=>{p.id='parameter_'+i;p.layerId=ids.get(p.layerId);});return JSON.stringify(a);}

test('independent oracle: initial proposals must be unselected with no invented history',()=>{
  const empty={parameters:[]},a=artifact();assert.equal(oracleState(a,empty),true);const selected=artifact(true);assert.throws(()=>oracleState(selected,empty),/proposal/);a.parameters[0].previousValue=50;assert.throws(()=>oracleState(a,empty),/proposal/);
});

test('independent oracle: changing selected values records exact previous value without flipping adoption',()=>{
  const previous=artifact(true),next=structuredClone(previous);next.parameters[0].value=70;next.parameters[0].previousValue=60;assert.equal(oracleState(next,previous),true);
  next.parameters[0].previousValue=50;assert.throws(()=>oracleState(next,previous),/history/);next.parameters[0].value=60;assert.equal(oracleState(next,previous),true);next.parameters[0].previousValue=40;assert.throws(()=>oracleState(next,previous),/history/);
});

test('independent oracle: model cannot flip, drop, rename or retarget existing selected controls',()=>{
  const previous=artifact(true);for(const edit of [a=>a.parameters[0].selected=false,a=>a.parameters=[],a=>a.parameters[0].id='renamed',a=>a.parameters[0].target='y']){const next=structuredClone(previous);edit(next);assert.throws(()=>oracleState(next,previous));}
  const unselected=artifact(),next=structuredClone(unselected);next.parameters[0].value=70;next.parameters[0].previousValue=60;assert.throws(()=>oracleState(next,unselected),/unselected/);
});

test('independent oracle: IDs, labels, proposals and source current-value aliases cannot fake fusion',()=>{
  const previous=artifact(true),fingerprint=oracleDrawing(previous),renamed=structuredClone(previous);renamed.title='新標題';renamed.layers[0].id='new_hero';renamed.layers[0].label='新標籤';renamed.parameters[0].layerId='new_hero';renamed.parameters[0].id='new_parameter';renamed.parameters[0].label='新說明';assert.equal(oracleDrawing(renamed),fingerprint);
  const proposal=structuredClone(previous);proposal.parameters.push({...parameter(),id:'hero_y',target:'y',value:300,previousValue:300});assert.equal(oracleDrawing(proposal),fingerprint);assert.notEqual(oracleContent(proposal),oracleContent(previous));
  const selectedAlias=artifact();selectedAlias.parameters[0].selected=true;assert.equal(oracleDrawing(selectedAlias),oracleDrawing(artifact()));
});

test('independent oracle: actual visual, active animation, interaction, order and selected-value changes remain observable',()=>{
  const previous=artifact(true),baseDrawing=oracleDrawing(previous);for(const edit of [a=>a.layers[0].fill='#cc6600',a=>{a.animation=true;a.layers[0].motion='wave';a.layers[0].motionAmount=50;a.layers[0].motionSpeed=2;},a=>a.layers[0].interaction='pointer',a=>a.parameters[0].value=70,a=>a.layers.push({...layer(),id:'other'})]){const next=structuredClone(previous);edit(next);assert.notEqual(oracleDrawing(next),baseDrawing);}
  const dynamic=artifact();dynamic.animation=true;Object.assign(dynamic.layers[0],{motion:'wave',motionAmount:50,motionSpeed:2});const duration=structuredClone(dynamic);duration.duration=9;assert.notEqual(oracleDrawing(dynamic),oracleDrawing(duration));
  const two=artifact();two.layers.push({...layer(),id:'other',fill:'#112233'});const reverse=structuredClone(two);reverse.layers.reverse();assert.notEqual(oracleDrawing(two),oracleDrawing(reverse));
});

test('independent oracle: static duration, inactive motion and invisible paint cannot fake fusion',()=>{
  const previous=artifact(true),before=JSON.stringify(previous),drawing=oracleDrawing(previous);
  const ineffective=[a=>a.duration=9,a=>a.animation=true,a=>Object.assign(a.layers[0],{motion:'wave',motionAmount:50,motionSpeed:2}),a=>Object.assign(a.layers[0],{stroke:'#ff00ff',strokeWidth:0}),a=>{a.animation=true;a.layers.push({...layer(),id:'invisible',opacity:0,motion:'wave',motionAmount:50,motionSpeed:2});},a=>{a.animation=true;a.layers.push({...layer(),id:'unpainted',fill:'none',stroke:'none',motion:'wave',motionAmount:50,motionSpeed:2});}];
  for(const mode of ['wave','pulse','spin'])ineffective.push(a=>{a.animation=true;Object.assign(a.layers[0],{motion:mode,motionAmount:50,motionSpeed:0});});
  for(const edit of ineffective){const next=structuredClone(previous);edit(next);assert.equal(oracleDrawing(next),drawing);assert.notEqual(oracleContent(next),oracleContent(previous));}
  const line=artifact();line.parameters=[];Object.assign(line.layers[0],{type:'line',width:300,height:0,fill:'none',stroke:'#112233',strokeWidth:2});const paint=structuredClone(line);paint.layers[0].fill='#ff00ff';assert.equal(oracleDrawing(line),oracleDrawing(paint));
  assert.equal(JSON.stringify(previous),before);
});

test('independent oracle: zero-speed orbit folds into static X and selected speed zero disables motion',()=>{
  const previous=artifact();previous.parameters=[];const orbit=structuredClone(previous);orbit.animation=true;Object.assign(orbit.layers[0],{x:50,motion:'orbit',motionAmount:10,motionSpeed:0});assert.equal(oracleDrawing(previous),oracleDrawing(orbit));
  orbit.layers[0].interaction='hover';const hover=structuredClone(previous);hover.layers[0].interaction='hover';assert.equal(oracleDrawing(hover),oracleDrawing(orbit));
  orbit.layers[0].x=60;assert.notEqual(oracleDrawing(hover),oracleDrawing(orbit));
  const selectedSpeed=artifact();selectedSpeed.animation=true;Object.assign(selectedSpeed.layers[0],{motion:'wave',motionAmount:50,motionSpeed:2});selectedSpeed.parameters=[{...parameter(true),id:'speed',target:'motionSpeed',min:0,max:10,step:1,value:0,previousValue:2}];assert.equal(oracleDrawing(selectedSpeed),oracleDrawing(previous));
});

test('independent oracle: goal changes permit exact artifact only, not identity or hex-case churn',()=>{
  const previous=artifact(),allow=(next,goalChanged)=>{const artifactChanged=JSON.stringify(previous)!==JSON.stringify(next),contentChanged=oracleContent(previous)!==oracleContent(next);return(contentChanged||!artifactChanged)&&(contentChanged||goalChanged);};
  assert.equal(allow(previous,false),false);assert.equal(allow(previous,true),true);const renamed=structuredClone(previous);renamed.layers[0].id='renamed';renamed.parameters[0].layerId='renamed';assert.equal(allow(renamed,false),false);assert.equal(allow(renamed,true),false);
  const cased=structuredClone(previous);cased.background='#FFFFFF';assert.equal(allow(cased,true),false);const labelled=structuredClone(previous);labelled.parameters[0].label='新的提議說明';assert.equal(allow(labelled,false),true);
});
