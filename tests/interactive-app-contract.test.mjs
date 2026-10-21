// Executed PHP SOURCE contracts + independent JavaScript policy examples.
// Also exercises real JS artifact serialization and the shared HTTP serializer
// with intercepted fetch. Does NOT run PHP/PDO, a server, browser, or provider.
// Real CocreationApp fixture: php tests/interactive-app.php (UNEXECUTED here).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MODULES,createApiAdapter} from '../public/app.js';
import {defaultInteractive,interactiveItems,interactiveFromItems,selectInteractiveParameter,setInteractiveParameter} from '../public/interactive.js';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const app=read('app/app.php'),validation=read('app/validation.php'),modules=read('app/modules.php'),bootstrap=read('app/bootstrap.php');
const artifacts=read('app/artifacts.php'),content=read('app/content.php'),model=read('app/modules/interactive.php'),baseModel=read('app/modules/titles.php');
const versioning=read('app/versioning.php'),native=read('tests/interactive-app.php'),client=read('public/app.js'),api=read('public/api.php');
const ids=['titles','short_text','article','illustrated','table','chart','mindmap','vector','image','poster','webpage','interactive'];
const has=(source,...parts)=>parts.forEach(part=>assert.ok(source.includes(part),'missing '+part));
const section=(source,start,end)=>{const a=source.indexOf(start);assert.ok(a>=0,'missing '+start);const b=end===undefined?source.length:source.indexOf(end,a+start.length);assert.ok(b>=0,'missing '+end);return source.slice(a,b);};
const ordered=(source,...parts)=>{let last=-1;for(const part of parts){const next=source.indexOf(part,last+1);assert.ok(next>last,'missing or misordered '+part);last=next;}};

test('all twelve registry IDs stay ordered; native interactive routes before generic artifacts',()=>{
  assert.deepEqual([...modules.matchAll(/array\('id'=>'([^']+)'/g)].map(match=>match[1]),ids);
  assert.deepEqual(MODULES.map(module=>module.id),ids);
  assert.match(modules,/array\('id'=>'interactive','label'=>'互動視覺程式','enabled'=>true\)/);
  ordered(modules,"if($id==='interactive')return new InteractiveModule($model)",'if(artifactType($id))');
  ordered(bootstrap,"'/interactive.php'","'/modules/interactive.php'","'/modules.php'","'/app.php'");
  has(artifacts,"$type==='interactive'","return validateInteractiveArtifact($value)","return interactiveItems($artifact)","return interactiveSchema()");
  has(content,"'interactive'=>'互動程式來源'");
});

test('four exact direction confirmations bind an integer current summary and require visual content',()=>{
  const gate=section(validation,"if($type==='interactive'){","if($type!=='webpage'&&$type!=='poster')");
  has(gate,"field($input,'confirmedDirections')===array('visual','animation','parameters','interaction')","is_int($revision)&&$revision===field($project,'summaryRevision')","trim($brief['message'])!==''",'DIRECTION_CONFIRMATION_REQUIRED');
  has(gate,"'visual'=>$brief['message']","'animation'=>$brief['tone']","'parameters'=>$brief['purpose']","'interaction'=>$brief['constraints']");
  assert.doesNotMatch(gate,/->generate\(|->save\(|\['selected'\]\s*=/);
});

test('approval and one-click generation gate before mutation or inference and record accepted summary',()=>{
  const approve=section(app,"if($action==='approve_goal') {","if($action==='generate'||$action==='confirm_generate') {");
  ordered(approve,'webpageDirectionConfirmation($p,$input)',"$p['goalApprovedAt']=", "'directionConfirmation'=>$directionConfirmation",'$this->save($p)');
  assert.doesNotMatch(approve,/\$module->/);
  const generate=section(app,"if($action==='generate'||$action==='confirm_generate') {","if($action==='snapshot') {");
  ordered(generate,"if($action==='confirm_generate')",'webpageDirectionConfirmation($p,$input)',"$p['goalApprovedAt']=",'$this->goalRequired($p)','$module->generate(',"'directionConfirmation'=>$directionConfirmation",'$this->appendVersion(');
  has(generate,"$slots=($p['module']==='article'||artifactType($p['module']))?1");
  ordered(section(app,'private function execute('),'$this->reserveStorage(','$module->generate(');
});

test('ready discussion stores a summary but cannot create artwork or imply approval',()=>{
  const discuss=section(app,"$result=$module->discuss($p,$text,$model);","if($action==='summarize') {");
  has(discuss,"$p['phase']=$ready?'summary':'discussion'","$p['goalApprovedAt']=null","$p['summaryRevision']=$ready?$p['revision']+1:null");
  assert.doesNotMatch(discuss,/appendVersion|officialVersionId.*=|module->generate/);
  has(model,'動畫、互動都可明確為無','不強迫加動畫或互動','只要必要視覺資訊足夠就 ready');
});

test('one complete artifact is persisted with lineage own goals provenance and no automatic adoption',()=>{
  const append=section(app,'private function appendVersion(','public function action(');
  ordered(append,"validateArtifact(field($metadata,'artifact'),$project['module'])",'$items=artifactItems($artifact)',"$v['artifact']=$artifact","$project['versions'][]=$v");
  has(append,"'source'=>$source","'basedOnVersionId'=>$basedOn","'goalSnapshot'=>array('summary'=>$goalText)","'goalAndRationale'=>$combined","'provenance'=>$provenance","'projectContextSnapshot'=>array(");
  assert.doesNotMatch(append,/\$project\['(?:officialVersionId|finalizedVersionId|title)'\]\s*=/);
  const generation=section(model,'protected function runGenerate(','protected function runRefine(');
  has(generation,"'minItems'=>1,'maxItems'=>1",'$this->candidateResult(');
  has(section(model,'protected function validateParameterState(','protected function contentFingerprint('),"$parameter['selected']===false&&$parameter['previousValue']===$parameter['value']");
});

test('manual snapshot validates full native data and keeps literal goal note without a model call',()=>{
  const snapshot=section(app,"if($action==='snapshot') {","if($action==='promote') {");
  ordered(snapshot,"validateArtifact(field($input,'artifact'),$p['module'])",'artifactItems($artifact)',"$metadata['artifact']=$artifact",'$this->appendVersion(');
  has(snapshot,"$combined=validateCombinedVersionNote($input['goalAndRationale'])","'snapshot',$basedOn,$message['id'],null,$mode,$metadata");
  assert.doesNotMatch(snapshot,/\$module->|->generate\(|\$p\['officialVersionId'\]\s*=(?!=)/);
  has(versioning,'return $value; // Keep deliberate whitespace');
});

test('official or explicitly selected unadopted source yields a new minor, not overwritten history',()=>{
  const select=section(app,'private function refinementSelection(','private function choiceContext(');
  has(select,"field($input,'baseVersionId',$project['officialVersionId'])",'$this->version($project,$id)');
  const discuss=section(app,"if($action==='discuss') {","if($action==='summarize') {");
  ordered(discuss,'$this->refinementSelection($p,$input)',"$official=$selection['base']",'$module->refine(',"'revision',$official['id'],$message['id'],$provenance,'minor',$result");
  has(discuss,"['revisionInstruction']=$text","['targetItemIds']=$selection['targetItemIds']");
  assert.doesNotMatch(discuss,/\$p\['officialVersionId'\]\s*=(?!=)|\$p\['versions'\]\[[^\]]+\]\['artifact'\]\s*=/);
  const refine=section(model,'protected function runRefine(','protected function selectedSources(');
  has(refine,"$data['sourceVersion']=$this->creativeVersions(array($source))[0]","$data['latestUserMessage']=$text",'$this->validateParameterState($artifact,$known)');
});

test('selected-control guard preserves selection and target, validates previous, and protects unselected values',()=>{
  const guard=section(model,'protected function validateParameterState(','protected function contentFingerprint(');
  has(guard,"$parameter['selected']===$prior['selected']","$parameter['layerId']===$prior['layerId']","$parameter['target']===$prior['target']","$parameter['value']===$prior['value']&&$parameter['previousValue']===$prior['previousValue']","$parameter['previousValue']===($parameter['value']===$prior['value']?$prior['previousValue']:$prior['value'])","if($prior['selected'])ensure(isset($next[$id])",'MODEL_PARAMETER_STATE');
  has(model,'只在 latestUserMessage 或 question 明確要求時修改 value');
  // The language instruction is not a claim of server-side semantic intent detection.
});

test('promotion changes official pointer without mutating artifacts, controls, or finalizing',()=>{
  const promote=section(app,"if($action==='promote') {","if($action==='archive_version'||$action==='restore_version'){");
  has(promote,"$old=$p['officialVersionId'];$p['officialVersionId']=$v['id']","'previousOfficialVersionId'=>$old");
  assert.doesNotMatch(promote,/\$module->|\['artifact'\]|\['parameters'\]|\['selected'\]|\['lifecycle'\]\s*=|\['finalizedAt'\]\s*=/);
});

test('compare is bounded to 2–5 selected versions with own immutable goal snapshots and no adoption',()=>{
  const compare=section(app,"ensure(count($p['comparisons'])<60");
  ordered(compare,"count($ids)>=2&&count($ids)<=5","count(array_unique($ids,SORT_STRING))===count($ids)",'$this->version($p,$id)','$module->compare(','versionComparisonSnapshot($v)');
  has(compare,"'goalBasis'=>'version_snapshots','goalSnapshot'=>null","'versionGoalSnapshots'=>$goalSnapshots");
  assert.doesNotMatch(compare,/appendVersion|\$p\['officialVersionId'\]\s*=(?!=)/);
  const data=section(model,'protected function selectedData(','protected function runFuse(');
  has(data,"'creativeGoal'=>null,'goalApprovedAt'=>null","'selectedVersions'=>$this->creativeVersions($sources)");
  has(baseModel,"'goalAndRationale'","'goalText'","'goalSnapshot'","'provenance'");
});

test('explicit fusion rejects incompatible control states before inference and stores complete source snapshots',()=>{
  const fuse=section(app,"if($action==='fuse'){","ensure(count($p['comparisons'])<60");
  ordered(fuse,"count($ids)>=2&&count($ids)<=5",'$this->version($p,$id)','$this->pinnedVersion($v)','$module->fuse(',"'fusion_request'",'$this->appendVersion(',"['fusionSourceSnapshots']=$snapshots");
  has(fuse,"['fusionSourceVersionIds']=$ids","'fusion',null,$message['id'],$provenance,'major',$result");
  assert.doesNotMatch(fuse,/\$p\['officialVersionId'\]\s*=(?!=)/);
  const runFuse=section(model,'protected function runFuse(','protected function runCompare(');
  ordered(runFuse,'$this->selectedSources(','$this->parameterSources($sources)','$this->ask(');
  has(section(model,'protected function parameterSources(','protected function validateParameterState('),'INTERACTIVE_PARAMETER_CONFLICT',"array('layerId','target','min','max','step','selected','value','previousValue')");
  const pinned=section(app,'private function pinnedVersion(','private function reserveStorage(');
  assert.doesNotMatch(pinned,/unset\(\$version\['(?:artifact|provenance|goalSnapshot|goalAndRationale)'\]\)/);
});

test('known invalid model output is rejected without claiming no charge; generic uncertainty remains unknown',()=>{
  const outcome=section(validation,'function operationOutcome(','function errorResponse(');
  ordered(outcome,"if(!($error instanceof AppError)||$error->errorCode==='REQUEST_ALREADY_ATTEMPTED')return 'unknown'",'$rejected=array(',"return $error->status<500||in_array($error->errorCode,$rejected,true)?'rejected':'unknown'");
  const rejected=section(outcome,'$rejected=array(',');');
  for(const code of ['MODEL_PARAMETER_STATE','MODEL_PIXEL_CLAIM','MODEL_IMAGE_REFERENCE_INVALID'])has(rejected,"'"+code+"'");
  has(outcome,'NOT that a provider charged nothing');
  has(section(validation,'function errorResponse(','function userTextValue('),"'operationOutcome'=>operationOutcome($error)");
  has(native,'known invalid model output is rejected, provider may still charge','transport prior attempt and generic failures remain unknown');
  const classify=(code,status,isAppError=true)=>!isAppError||code==='REQUEST_ALREADY_ATTEMPTED'?'unknown':status<500||['MODEL_PARAMETER_STATE','MODEL_PIXEL_CLAIM','MODEL_IMAGE_REFERENCE_INVALID'].includes(code)?'rejected':'unknown';
  for(const code of ['MODEL_PARAMETER_STATE','MODEL_PIXEL_CLAIM','MODEL_IMAGE_REFERENCE_INVALID'])assert.equal(classify(code,502),'rejected');
  assert.equal(classify('UPSTREAM_TRANSPORT',502),'unknown');assert.equal(classify('REQUEST_ALREADY_ATTEMPTED',409),'unknown');assert.equal(classify('RUNTIME',500,false),'unknown');
});

test('empty native interactive display title falls back to its registry label without changing artwork',()=>{
  const append=section(app,'private function appendVersion(','public function action(');
  has(append,"$labels=array_column(moduleRegistry(),'label','id')","trim($name)===''?$labels[$project['module']]");
  has(native,'empty interactive display title uses registry label without rewriting artifact');
});

test('shared request transport remains authoritative body.action and checks raw artifact before app dispatch',()=>{
  has(client,'options.body=JSON.stringify({...payload,action})');
  ordered(api,'validateArtifactJsonShape($rawInput->artifact)','$app->action($input)');
  has(read('tests/http-transport.test.mjs'),'every mutation route serializes authoritative action alongside unchanged payload');
});

test('native fixture is genuinely real-app queued inference, explicit UNEXECUTED, and covers app lifecycle',()=>{
  has(native,'UNEXECUTED in the authoring environment: PHP is unavailable','NOT PHP execution',"require_once dirname(__DIR__).'/app/bootstrap.php'",'new Store($directory)','new CocreationApp($store,$config,$owner,$adapter)','PDO::ATTR_DRIVER_NAME','class InteractiveAppFixtureAdapter','Unexpected inference: no queued fixture response.');
  for(const label of ['all twelve established registry IDs and order remain intact','exact four directions and current integer summary revision are required','empty visual direction is rejected','static animation false and interaction none are valid','manual selection saves complete artifact','default official refinement creates a complete new minor','unadopted candidate can be an explicit refinement source','adopt then continue uses new official source','earlier source provenance goal and full artifact snapshots stay immutable','comparison accepts selected count and uses own version goals','fusion rejects conflicting parameter selection and values before model call','explicit compatible fusion creates exactly one full major candidate','refreshed summary invalidates earlier four-part confirmation','confirm_generate pins the exact current four-part approval once'])has(native,label);
  assert.doesNotMatch(native,/curl_|new (?:OpenAIAdapter|OllamaAdapter)|set_key|Bearer |sk-proj-/);
});

// The following reference functions are independent policy examples, not a PHP
// port or proof that the native application executed these cases successfully.
const clone=value=>structuredClone(value),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const confirmations=['visual','animation','parameters','interaction'];
function confirm(p,input){
  if(!same(input.confirmedDirections,confirmations)||!Number.isInteger(input.directionRevision)||input.directionRevision!==p.summaryRevision)throw new Error('confirmation');
  if(!p.brief.message.trim())throw new Error('visual');
  return {summaryRevision:p.summaryRevision,visual:p.brief.message,animation:p.brief.tone,parameters:p.brief.purpose,interaction:p.brief.constraints};
}
function parameterSources(sources){
  const ids=new Map(),bindings=new Map();
  for(const source of sources)for(const parameter of source.artifact.parameters){
    const binding=parameter.layerId+':'+parameter.target,old=ids.get(parameter.id);
    if(old&&!['layerId','target','min','max','step','selected','value','previousValue'].every(key=>old[key]===parameter[key]))throw new Error('conflict');
    if(bindings.has(binding)&&bindings.get(binding)!==parameter.id)throw new Error('conflict');
    ids.set(parameter.id,clone(parameter));bindings.set(binding,parameter.id);
  }return ids;
}
function parameterGuard(artifact,known){
  const next=new Map(),bindings=new Map([...known.values()].map(p=>[p.layerId+':'+p.target,p.id]));
  for(const p of artifact.parameters){
    next.set(p.id,p);const binding=p.layerId+':'+p.target,old=known.get(p.id);
    if(bindings.has(binding)&&bindings.get(binding)!==p.id)throw new Error('identity');
    if(!old){if(p.selected!==false||p.previousValue!==p.value)throw new Error('new proposal');continue;}
    if(p.selected!==old.selected||p.layerId!==old.layerId||p.target!==old.target)throw new Error('control state');
    if(!old.selected&&(p.value!==old.value||p.previousValue!==old.previousValue))throw new Error('unselected');
    if(old.selected&&p.previousValue!==(p.value===old.value?old.previousValue:old.value))throw new Error('previous');
  }
  for(const [id,p] of known)if(p.selected&&!next.has(id))throw new Error('deleted selected');
}
function append(p,artifact,{id,source,base=null,goal='本版目標',provenance=null,mode='major'}={}){
  const all=p.versions,major=mode==='minor'?base.major:Math.max(0,...all.map(v=>v.major))+1;
  const minor=mode==='minor'?Math.max(0,...all.filter(v=>v.major===major).map(v=>v.minor))+1:0;
  const version={id,source,basedOnVersionId:base?.id??null,major,minor,artifact:clone(artifact),goalSnapshot:{summary:goal},goalAndRationale:goal,provenance:clone(provenance)};
  p.versions.push(version);return version;
}
function select(p,selected){if(!Array.isArray(selected)||selected.length<2||selected.length>5||new Set(selected).size!==selected.length)throw new Error('selection');return selected.map(id=>{const v=p.versions.find(v=>v.id===id);if(!v)throw new Error('source');return clone(v);});}
function project(){return {officialVersionId:null,versions:[],summaryRevision:7,brief:{message:'藍色幾何畫面',tone:'無動畫',purpose:'先提議控制',constraints:'無互動'}};}

test('independent oracle: four directions reject missing reordered duplicated wrong stale and noninteger inputs',()=>{
  const p=project(),valid={confirmedDirections:confirmations,directionRevision:7};
  assert.deepEqual(confirm(p,valid),{summaryRevision:7,visual:'藍色幾何畫面',animation:'無動畫',parameters:'先提議控制',interaction:'無互動'});
  for(const parts of [undefined,[],confirmations.slice(0,3),['animation','visual','parameters','interaction'],[...confirmations,'interaction'],['style','content','functions'],'visual,animation,parameters,interaction'])assert.throws(()=>confirm(p,{...valid,confirmedDirections:parts}),/confirmation/);
  for(const directionRevision of [undefined,null,6,8,'7',7.5])assert.throws(()=>confirm(p,{...valid,directionRevision}),/confirmation/);
  p.brief.message=' \n ';assert.throws(()=>confirm(p,valid),/visual/);p.brief.message='畫面';p.summaryRevision=8;assert.throws(()=>confirm(p,valid),/confirmation/);
});

test('real JS artifact round-trip: static full program and explicit manual controls preserve current/previous',()=>{
  const artifact=defaultInteractive(),before=clone(artifact),id=artifact.parameters[0].id;
  assert.equal(artifact.animation,false);assert.ok(artifact.layers.every(layer=>layer.interaction==='none'));
  assert.ok(artifact.parameters.every(parameter=>parameter.selected===false));
  assert.throws(()=>setInteractiveParameter(artifact,id,140));
  const selected=selectInteractiveParameter(artifact,id,true),changed=setInteractiveParameter(selected,id,140),saved=interactiveFromItems(interactiveItems(changed));
  assert.equal(saved.parameters[0].selected,true);assert.equal(saved.parameters[0].value,140);assert.equal(saved.parameters[0].previousValue,120);
  assert.deepEqual(saved,changed);assert.deepEqual(artifact,before);assert.deepEqual(selected.parameters[0],{...before.parameters[0],selected:true});
  const none=clone(artifact);none.parameters=[];assert.deepEqual(interactiveFromItems(interactiveItems(none)),none);
});

test('independent oracle: new AI controls are proposals only; prior controls preserve guarded state',()=>{
  const original=defaultInteractive();assert.doesNotThrow(()=>parameterGuard(original,new Map()));
  for(const field of ['selected','previousValue']){const bad=clone(original);bad.parameters[0][field]=field==='selected'?true:100;assert.throws(()=>parameterGuard(bad,new Map()),/new proposal/);}
  const manual=setInteractiveParameter(selectInteractiveParameter(original,original.parameters[0].id,true),original.parameters[0].id,140),known=parameterSources([{artifact:manual}]);
  const next=clone(manual);next.parameters[0].value=160;next.parameters[0].previousValue=140;assert.doesNotThrow(()=>parameterGuard(next,known));
  for(const change of [a=>a.parameters[0].selected=false,a=>a.parameters[0].target='height',a=>a.parameters[0].previousValue=120,a=>a.parameters=[]]){const bad=clone(next);change(bad);assert.throws(()=>parameterGuard(bad,known));}
  const unselected=parameterSources([{artifact:original}]),bad=clone(original);bad.parameters[0].value=140;assert.throws(()=>parameterGuard(bad,unselected),/unselected/);
  assert.doesNotThrow(()=>parameterGuard(manual,known),'unchanged current must retain its actual prior value');
});

test('independent oracle: generated manual official/candidate refine and adopt/continue keep whole immutable versions',()=>{
  const p=project(),artifact=defaultInteractive(),original=append(p,artifact,{id:'v1',source:'generated',goal:'生成目標',provenance:{model:'fixed'}});
  const manualArtifact=setInteractiveParameter(selectInteractiveParameter(artifact,artifact.parameters[0].id,true),artifact.parameters[0].id,140);
  const manual=append(p,manualArtifact,{id:'v1.1',source:'snapshot',base:original,mode:'minor',goal:'手動完整目標'}),old=clone(p.versions);
  p.officialVersionId=manual.id;
  const revised=setInteractiveParameter(manualArtifact,artifact.parameters[0].id,160),revision=append(p,revised,{id:'v1.2',source:'revision',base:manual,mode:'minor',goal:'正式來源修訂目標',provenance:{model:'fixed'}});
  assert.equal(p.officialVersionId,manual.id);assert.equal(revision.basedOnVersionId,manual.id);
  const candidateArtifact=setInteractiveParameter(revised,artifact.parameters[0].id,180),candidate=append(p,candidateArtifact,{id:'v1.3',source:'revision',base:revision,mode:'minor',goal:'候選來源目標',provenance:{model:'fixed'}});
  assert.equal(candidate.basedOnVersionId,revision.id);assert.equal(p.officialVersionId,manual.id);
  const adoptSnapshot=clone(p.versions);p.officialVersionId=candidate.id;assert.deepEqual(p.versions,adoptSnapshot);
  const continued=append(p,setInteractiveParameter(candidateArtifact,artifact.parameters[0].id,200),{id:'v1.4',source:'revision',base:candidate,mode:'minor',goal:'採用後接續目標',provenance:{model:'fixed'}});
  assert.deepEqual([continued.major,continued.minor,continued.basedOnVersionId],[1,4,candidate.id]);assert.equal(p.officialVersionId,candidate.id);
  assert.deepEqual(p.versions.slice(0,2),old);assert.deepEqual(p.versions.slice(0,4),adoptSnapshot);assert.deepEqual(original.artifact,artifact);
});

test('independent oracle: comparing 2–5 sources uses own goals and never adopts, fuses, or changes control state',()=>{
  const p=project(),artifact=defaultInteractive();for(let i=1;i<=5;i++)append(p,artifact,{id:'v'+i,source:i===2?'snapshot':'generated',goal:'各版目標 '+i});p.officialVersionId='v2';p.brief.message='無關的新共用目標';
  const before=clone(p);for(let count=2;count<=5;count++){const selected=select(p,p.versions.slice(0,count).map(v=>v.id)),request={creativeGoal:null,goalApprovedAt:null,goalBasis:'version_snapshots',selectedVersions:selected};assert.deepEqual(request.selectedVersions.map(v=>v.goalAndRationale),Array.from({length:count},(_,i)=>'各版目標 '+(i+1)));}
  for(const selected of [[],['v1'],['v1','v1'],['v1','v2','v3','v4','v5','v6'],['v1','missing']])assert.throws(()=>select(p,selected));assert.deepEqual(p,before);
});

test('independent oracle: fusion control conflicts reject before hypothetical call, compatible sources remain immutable',()=>{
  const p=project(),artifact=defaultInteractive(),a=append(p,artifact,{id:'v1',source:'generated'}),compatible=clone(artifact);compatible.layers[0].fill='#ff0000';const b=append(p,compatible,{id:'v2',source:'snapshot'});p.officialVersionId=a.id;const before=clone(p);
  const chosen=select(p,[a.id,b.id]);assert.equal(parameterSources(chosen).size,1);
  for(const field of ['selected','value','previousValue','min','max','step','target','layerId','id']){const bad=clone(chosen);bad[1].artifact.parameters[0][field]=field==='selected'?true:typeof bad[1].artifact.parameters[0][field]==='number'?bad[1].artifact.parameters[0][field]+1:'changed';let calls=0;assert.throws(()=>{parameterSources(bad);calls++;},/conflict/);assert.equal(calls,0);}
  assert.deepEqual(p,before);assert.equal(p.officialVersionId,a.id);
});

test('real shared JS transport preserves interactive artifact approval and source payload with authoritative action',async t=>{
  const oldFetch=globalThis.fetch,oldLocation=globalThis.location,calls=[];
  t.after(()=>{globalThis.fetch=oldFetch;globalThis.location=oldLocation;});globalThis.location={href:'http://localhost/studio/public/'};
  globalThis.fetch=async(url,options)=>{calls.push({url:new URL(url),options});return {ok:true,status:200,json:async()=>options.method==='POST'?{accepted:JSON.parse(options.body)}:{csrf:'fixture-csrf'}};};
  const api=createApiAdapter();await api.request('state');const artifact=defaultInteractive();
  for(const [action,extra] of [['confirm_generate',{confirmedDirections:confirmations,directionRevision:7}],['snapshot',{artifact,basedOnVersionId:'a'.repeat(32),versionMode:'minor',goalAndRationale:' 完整目標\n保留空白 '}],['discuss',{baseVersionId:'a'.repeat(32),text:'將已勾選寬度改成140。'}],['compare',{versionIds:['a'.repeat(32),'b'.repeat(32)]}],['fuse',{versionIds:['a'.repeat(32),'b'.repeat(32)],question:'明確融合這兩版'}]]){
    const payload={id:'c'.repeat(32),itemId:'d'.repeat(32),revision:7,action:'not-authoritative',...extra},before=clone(payload),result=await api.request(action,payload),call=calls.at(-1);
    assert.deepEqual(result.accepted,{...payload,action});assert.deepEqual(payload,before);assert.equal(call.url.searchParams.get('action'),action);assert.equal(call.options.headers['X-CSRF-Token'],'fixture-csrf');assert.equal(call.options.headers['Content-Type'],'application/json');
  }
  assert.equal(calls.length,6,'one state read and exactly one intercepted request for each action');
});
