// Executed source contracts + independent JavaScript policy examples ONLY.
// These do not execute PHP, PDO, private media reads, model inference or a UI.
// Native application fixtures: php tests/composition-app.php (UNEXECUTED here).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const app=read('app/app.php'),actions=read('app/composition-actions.php'),validation=read('app/validation.php');
const modules=read('app/modules.php'),bootstrap=read('app/bootstrap.php'),artifacts=read('app/artifacts.php'),content=read('app/content.php');
const imageActions=read('app/image-actions.php'),media=read('app/media-store.php'),model=read('app/modules/composition.php'),titles=read('app/modules/titles.php');
const native=read('tests/composition-app.php');
const section=(source,start,end)=>{
  const from=source.indexOf(start);assert.notEqual(from,-1,'missing '+start);
  const to=end===undefined?source.length:source.indexOf(end,from+start.length);assert.notEqual(to,-1,'missing '+end);
  return source.slice(from,to);
};
const ordered=(source,...parts)=>{let last=-1;for(const part of parts){const next=source.indexOf(part,last+1);assert.ok(next>last,'missing or misordered '+part);last=next;}};
const has=(source,...parts)=>{for(const part of parts)assert.ok(source.includes(part),'missing '+part);};

test('both native composition types are enabled and routed before generic artifacts',()=>{
  for(const type of ['illustrated','poster'])assert.match(modules,new RegExp("array\\('id'=>'"+type+"','label'=>'[^']+','enabled'=>true\\)"));
  ordered(modules,"if($id==='illustrated'||$id==='poster')return new CompositionModule($model,$id)",'if(artifactType($id))');
  ordered(bootstrap,"'/composition.php'","'/modules/composition.php'","'/composition-actions.php'","'/app.php'");
  has(app,'use CocreationCompositionActions;');
});

test('generic persistence and content dispatch preserve full native composition artifacts',()=>{
  has(artifacts,"$type==='illustrated'||$type==='poster'","return validateCompositionArtifact($value,$type)","return compositionItems($artifact)","return compositionSchema($type)");
  has(content,"'illustrated'=>'圖文來源'","'poster'=>'海報來源'");
  const append=section(app,'private function appendVersion(','public function action(');
  has(append,"$artifact=validateArtifact(field($metadata,'artifact'),$project['module'])",'$items=artifactItems($artifact)',"$v['artifact']=$artifact");
  has(append,"'referencesSnapshot'=>$this->isComposition($project)?field($metadata,'referencesSnapshot',$project['references']):$project['references']");
  assert.doesNotMatch(append,/\$project\['(?:officialVersionId|finalizedVersionId|title)'\]\s*=/);
});

test('reference pool verifies source identity, exact immutable image artifact and private media ownership',()=>{
  const pool=section(actions,'private function compositionReferencePool(','private function compositionUsedReferences(');
  ordered(pool,"field($source,'referencesSnapshot',array())","$groups[]=$p['references']");
  has(pool,"preg_match('/^[a-f0-9]{32}$/D',$id)","field($ref,'projectId')===$p['id']","array('targetItemId','versionId')","field($snapshot,'id')===$ref['versionId']");
  ordered(pool,"$this->locateItem($p,$ref['targetItemId'])","$this->version($target,$ref['versionId'])","field($snapshot,'contentType',$target['type'])===field($saved,'contentType',$target['type'])","validateImageArtifact(field($snapshot,'artifact'))","validateImageArtifact(field($saved,'artifact'))","ensure($artifact===$stored",'$this->resolveImageAsset($p,');
  has(pool,"COMPOSITION_REFERENCE_INVALID","COMPOSITION_REFERENCE_CONFLICT","jsonEncode($prior['versionSnapshot'])===jsonEncode($snapshot)",'count($out)<256');
  assert.doesNotMatch(pool,/officialVersionId|finalizedVersionId|end\(\$target\['versions'\]\)|setImageInputs|->generate\(|->ask\(/);
});

test('each selected source must have same content type and every used image must be in its authorized pool',()=>{
  const selected=section(actions,'foreach($sources as $source){','return $out;');
  has(selected,"field($source,'contentType')===$p['module']","validateCompositionArtifact(field($source,'artifact'),$p['module'])",'$this->compositionUsedReferences($artifact,$out)');
  const used=section(actions,'private function compositionUsedReferences(','private function compositionSnapshotReferences(');
  has(used,"$id=$block['imageRefId'];if($id==='')continue", "isset($map[$id])&&field($map[$id]['versionSnapshot'],'contentType')==='image'",'COMPOSITION_REFERENCE_MISSING');
  assert.doesNotMatch(used,/newId\(|->(?:save|insert|generate)\(|file_get_contents|curl_|base64_decode/);
});

test('new snapshots retain current context plus only historical image pins actually used',()=>{
  const snapshot=section(actions,'private function compositionSnapshotReferences(');
  ordered(snapshot,"$out=$p['references']","array_column($out,'id')",'$this->compositionUsedReferences($artifact,$pool)',"!in_array($ref['id'],$ids,true)","$out[]=$ref",'return $out');
  assert.doesNotMatch(snapshot,/array_merge\(\$out,\$pool|\$out=\$pool|\$p\['references'\]\s*=|newId\(/);
});

test('every composition inference path authorizes selected or current references before its one call',()=>{
  const discuss=section(app,"if($action==='discuss') {","if($action==='summarize') {");
  ordered(discuss,'$this->compositionReferencePool($p,array($official))','$module->refine(');
  ordered(discuss,'$this->compositionReferencePool($p);','$module->discuss(');
  const summarize=section(app,"if($action==='summarize') {","if($action==='approve_goal') {");
  ordered(summarize,'$this->compositionReferencePool($p);','$module->summarize(');
  const generate=section(app,"if($action==='generate'||$action==='confirm_generate') {","if($action==='snapshot') {");
  ordered(generate,'$this->compositionReferencePool($p)','$module->generate(','$this->compositionSnapshotReferences(');
  const fuse=section(app,"if($action==='fuse'){","ensure(count($p['comparisons'])<60");
  ordered(fuse,'$this->version($p,$id)','$this->compositionReferencePool($p,$versions)','$module->fuse(','$this->compositionSnapshotReferences(');
  const compare=section(app,"ensure(count($p['comparisons'])<60");
  ordered(compare,'$this->version($p,$id)','$this->compositionReferencePool($p,$versions)','$module->compare(');
  for(const [source,call] of [[discuss,'refine'],[discuss,'discuss'],[summarize,'summarize'],[generate,'generate'],[fuse,'fuse'],[compare,'compare']])assert.equal((source.match(new RegExp('\\$module->'+call+'\\(','g'))||[]).length,1);
});

test('manual snapshots authorize current plus explicitly selected base references before append without inference',()=>{
  const snapshot=section(app,"if($action==='snapshot') {","if($action==='promote') {");
  ordered(snapshot,"validateArtifact(field($input,'artifact'),$p['module'])","$base=$basedOn===null?null:$this->version($p,$basedOn)","$this->compositionReferencePool($p,$base===null?array():array($base))","$metadata['referencesSnapshot']=$this->compositionSnapshotReferences($p,$artifact,$pool)",'$this->appendVersion(');
  assert.doesNotMatch(snapshot,/\$module->|->generate\(|prepareImageInputs\(|setImageInputs\(|\$p\['officialVersionId'\]\s*=(?!=)/);
  const upload=section(imageActions,'public function uploadImage(','private function prepareImageInputs(');
  assert.doesNotMatch(upload,/\$module->|->generate\(|prepareImageInputs\(|setImageInputs\(/);
});

test('refinement fusion and comparison persist authorized historical context without adopting candidates',()=>{
  const discuss=section(app,"if($action==='discuss') {","if($action==='summarize') {");
  has(discuss,"$result['referencesSnapshot']=$this->compositionSnapshotReferences($p,$result['artifact'],$compositionPool)","$result['outcome']==='revision'?$result['referencesSnapshot']:$compositionPool");
  const fuse=section(app,"if($action==='fuse'){","ensure(count($p['comparisons'])<60");
  has(fuse,"$result['referencesSnapshot']=$this->compositionSnapshotReferences($p,$result['artifact'],$compositionPool)","['fusionSourceVersionIds']=$ids","['fusionSourceSnapshots']=$snapshots");
  const compare=section(app,"ensure(count($p['comparisons'])<60");
  has(compare,"$comparisonReferences=$this->isComposition($p)?$compositionPool:$p['references']","'versionGoalSnapshots'=>$goalSnapshots","'goalBasis'=>'version_snapshots','goalSnapshot'=>null");
  assert.equal((compare.match(/'referencesSnapshot'=>\$comparisonReferences/g)||[]).length,2);
  for(const action of [discuss,fuse,compare])assert.doesNotMatch(action,/\$p\['(?:officialVersionId|finalizedVersionId)'\]\s*=|\$p\['versions'\]\[[^\]]+\]\['artifact'\]\s*=/);
});

test('poster approval requires exact ordered style/text/layout and integer current summary revision',()=>{
  const direction=section(validation,'function webpageDirectionConfirmation(');
  has(direction,"$type!=='webpage'&&$type!=='poster'","$poster?array('style','text','layout'):array('style','content','functions')","is_array($parts)&&$parts===$expected&&is_int($summaryRevision)&&$summaryRevision===field($project,'summaryRevision')",'DIRECTION_CONFIRMATION_REQUIRED');
  has(direction,"'style'=>$project['brief']['tone'],'text'=>$project['brief']['message'],'layout'=>$project['brief']['constraints']");
  const approve=section(app,"if($action==='approve_goal') {","if($action==='generate'||$action==='confirm_generate') {");
  ordered(approve,'webpageDirectionConfirmation($p,$input)',"$p['goalApprovedAt']=", "'directionConfirmation'=>$directionConfirmation",'$this->save($p)');
  assert.doesNotMatch(approve,/\$module->/);
  const generate=section(app,"if($action==='generate'||$action==='confirm_generate') {","if($action==='snapshot') {");
  ordered(generate,"if($action==='confirm_generate')",'webpageDirectionConfirmation($p,$input)',"$p['goalApprovedAt']=",'$module->generate(',"'directionConfirmation'=>$directionConfirmation");
});

test('growth reservation counts explicitly selected historical pools before any paid inference',()=>{
  const budget=section(validation,'function inferenceGrowthBudget(','function webpageDirectionConfirmation(');
  has(budget,"if($type==='illustrated'||$type==='poster')", "array('compare','fuse')", "field($input,'versionIds',array())", "array(field($input,'baseVersionId',field($project,'officialVersionId')))", "foreach($project['references'] as $ref)$pool[$ref['id']]=$ref", "in_array($version['id'],$selected,true)", "field($version,'referencesSnapshot',array())", "if(!isset($pool[$ref['id']]))$pool[$ref['id']]=$ref", '$references=strlen(jsonEncode(array_values($pool)))');
  ordered(budget,"field($version,'referencesSnapshot',array())",'$references=strlen(jsonEncode(array_values($pool)))',"if($action==='fuse')",'return 2*$references');
  const execute=section(app,'private function execute(');
  ordered(execute,'$this->reserveStorage($p,inferenceGrowthBudget($p,$action,$input))',"if($action==='discuss') {",'$module->refine(');
  has(native,'selected historical pins increase comparison budget by both persisted copies','selected historical pins increase refinement budget before inference','historical reference storage reservation rejects near-full project before inference');
});

test('private media access scopes exact owner/project/item and saved image descriptor',()=>{
  const resolve=section(imageActions,'private function resolveImageAsset(','public function readImageVersion(');
  has(resolve,"$this->mediaStore()->read($this->owner,$p['id'],$artifact['asset']['id'],$itemId)","$this->imageAssetDescriptor($record['metadata'])===$artifact['asset']",'MEDIA_DESCRIPTOR_MISMATCH');
  const read=section(media,'public function read(','public function lookupReceipt(');
  has(read,'WHERE owner=? AND project_id=? AND id=? AND item_id=?');
  const view=section(imageActions,'public function readImageVersion(','public function uploadImage(');
  ordered(view,"$this->store->project(field($input,'id'),$this->owner)","$this->locateItem($raw,field($input,'itemId'))","$this->version($item,field($input,'versionId'))",'$this->resolveImageAsset(');
});

test('composition authorizer can inspect private media but never sends pixels to the text model',()=>{
  assert.doesNotMatch(actions,/setImageInputs|prepareImageInputs|\['bytes'\]|base64_encode|data:image|image_url|input_image|curl_/);
  const metadata=section(model,'protected function modelReferences(','protected function imageMetadata(');
  has(metadata,"'title'=>$artifact['title']","'alt'=>$artifact['alt']","'attribution'=>$artifact['attribution']","'pixelsProvided'=>false");
  assert.doesNotMatch(metadata,/'(?:bytes|url|path|assetId|sha256)'\s*=>/);
  has(section(titles,'protected function ask(','protected function briefSchema('),'$schema,$maxOutputTokens)');
  has(model,"$data['imagePixelsProvided']=false");
});

test('bounded pixel-claim guard checks commentary after one inference without rewriting literal artwork',()=>{
  const ask=section(model,'protected function ask(','protected function rejectsPixelInspectionClaim(');
  ordered(ask,'parent::ask(','strlen(jsonEncode($value))<=90000','$this->rejectsPixelInspectionClaim($value)','return $value');
  const guard=section(model,'protected function rejectsPixelInspectionClaim(','protected function artifactWithReferences(');
  has(guard,"if($key==='artifact'||$key==='direction')continue",'$this->rejectsPixelInspectionClaim($part)',"array('reply','question','rationale','changeSummary','summary','fit','strength','tradeoff','suggestion')",'$this->unquotedText($part)','未|沒有|並未|尚未|不曾|不能|無法','MODEL_PIXEL_CLAIM','not a guarantee of semantic truth');
  has(guard,'我(?:已經|已|確實|親自)?','中繼資料|標題|替代文字|說明|描述|來源註記|尺寸','metadata|title|alt');
  assert.doesNotMatch(guard,/->ask\(|->generate\(|\$part\s*=|\$value\[.*\]\s*=/);
  has(native,'generate rejects model claim of seeing unavailable pixels','refine rejects model claim of seeing unavailable pixels','compare rejects nested model claim of seeing unavailable pixels','我已檢視圖片，紅色主體很清楚','negative pixel-inspection disclaimer is allowed unchanged');
});

test('native fixture documents execution limits and covers real app/store/model seams',()=>{
  has(native,'UNEXECUTED in the authoring environment: PHP is unavailable','NOT PHP execution',"require_once dirname(__DIR__).'/app/bootstrap.php'",'new Store($directory)','new CocreationApp($store,$config,$owner,$adapter)',"foreach(array('illustrated','poster') as $type)",'PDO::ATTR_DRIVER_NAME',"'provider'=>'ollama'",'class CompositionAppFixtureAdapter','Unexpected inference: no queued fixture response.');
  for(const text of ['upload and image promotion make zero model calls','generate saves complete native artifact and current reference context','refine retains used historical pin after current reference removal','manual save retains historical pin and makes zero model calls','fusion preserves exact historical image pin','compare and message retain selected historical reference pool','poster exact three-part approval','poster confirm_generate pins exact current three-part summary','malicious historical reference rejected before','matching forged snapshot and saved artifact cannot grant another item media access','new generation cannot reuse removed historical pin without selected source','all earlier composition versions remain immutable'])has(native,text);
  assert.doesNotMatch(native,/curl_|new (?:OpenAIAdapter|OllamaAdapter)|set_key|Bearer |sk-proj-/);
});

// Independent algorithm examples. They define expected invariants, not PHP
// implementation coverage; source contracts above separately inspect wiring.
const id=hex=>hex.repeat(32),owner='a'.repeat(64);
function fixture(){
  const asset={id:id('e'),mime:'image/png',width:1,height:1,byteLength:70,sha256:'f'.repeat(64),normalization:'png-v1'};
  const artifact={kind:'image',title:'精確來源',alt:'使用者說明',attribution:'自製',asset};
  const version={id:id('c'),contentType:'image',artifact};
  const item={id:id('b'),type:'image',versions:[version,{...structuredClone(version),id:id('d'),artifact:{...structuredClone(artifact),title:'較新正式版'}}],officialVersionId:id('d')};
  const p={id:id('a'),module:'illustrated',references:[],creativeItems:[item]};
  const pin={id:id('1'),projectId:p.id,targetItemId:item.id,versionId:version.id,versionSnapshot:structuredClone(version)};
  const media=[{owner,projectId:p.id,itemId:item.id,asset:structuredClone(asset)}];
  const artifactFor=ref=>({kind:'illustrated',title:'完整作品',theme:'paper',blocks:[{id:'intro',heading:'',body:' 完整文字\n ',layout:'left',imageRefId:ref,caption:''}]});
  const source={id:id('2'),contentType:'illustrated',artifact:artifactFor(pin.id),referencesSnapshot:[pin]};
  return {p,pin,media,source,artifactFor};
}
function used(artifact,pool){
  const byId=new Map(pool.map(r=>[r.id,r])),result=[];
  for(const block of artifact.blocks){if(block.imageRefId==='')continue;const ref=byId.get(block.imageRefId);
    if(!ref||ref.versionSnapshot.contentType!=='image')throw new Error('missing');
    if(!result.some(r=>r.id===ref.id))result.push(structuredClone(ref));
  }return result;
}
function authorizedPool(p,sources,records){
  const out=[],byId=new Map();
  for(const group of [...sources.map(s=>s.referencesSnapshot??[]),p.references]){
    if(!Array.isArray(group))throw new Error('invalid list');
    for(const ref of group){
      if(!/^[a-f0-9]{32}$/.test(ref.id)||ref.projectId!==p.id||!/^[a-f0-9]{32}$/.test(ref.targetItemId)||!/^[a-f0-9]{32}$/.test(ref.versionId)||ref.versionSnapshot?.id!==ref.versionId)throw new Error('identity');
      if(byId.has(ref.id)){
        const prior=byId.get(ref.id);if(JSON.stringify([prior.targetItemId,prior.versionId,prior.versionSnapshot])!==JSON.stringify([ref.targetItemId,ref.versionId,ref.versionSnapshot]))throw new Error('conflict');continue;
      }
      const item=p.creativeItems.find(item=>item.id===ref.targetItemId),saved=item?.versions.find(version=>version.id===ref.versionId);
      if(!saved)throw new Error('source not found');
      if(saved.contentType!==ref.versionSnapshot.contentType)throw new Error('type');
      if(saved.contentType==='image'){
        if(JSON.stringify(saved.artifact)!==JSON.stringify(ref.versionSnapshot.artifact))throw new Error('artifact mismatch');
        const asset=records.find(record=>record.owner===owner&&record.projectId===p.id&&record.itemId===item.id&&record.asset.id===saved.artifact.asset.id);
        if(!asset)throw new Error('private media scope');
        if(JSON.stringify(asset.asset)!==JSON.stringify(saved.artifact.asset))throw new Error('descriptor mismatch');
      }
      if(out.length>=256)throw new Error('context limit');
      byId.set(ref.id,ref);out.push(structuredClone(ref));
    }
  }
  for(const source of sources){if(source.contentType!==p.module)throw new Error('source type');used(source.artifact,out);}
  return out;
}
function snapshot(p,artifact,pool){const out=structuredClone(p.references);for(const ref of used(artifact,pool))if(!out.some(r=>r.id===ref.id))out.push(ref);return out;}
function posterConfirmation(p,input){
  if(p.module!=='poster')return null;
  if(JSON.stringify(input.confirmedDirections)!==JSON.stringify(['style','text','layout'])||!Number.isInteger(input.directionRevision)||input.directionRevision!==p.summaryRevision)throw new Error('confirmation');
  return {summaryRevision:input.directionRevision,style:p.brief.tone,text:p.brief.message,layout:p.brief.constraints};
}

test('independent oracle: generate uses current pins; explicit refine/manual/fuse/compare can retain removed pins',()=>{
  const {p,pin,source,media}=fixture(),before=JSON.stringify({p,source});
  assert.deepEqual(authorizedPool(p,[],media),[]);
  assert.throws(()=>used(source.artifact,authorizedPool(p,[],media)),/missing/);
  for(const action of ['refine','manual','fuse','compare']){
    const pool=authorizedPool(p,[source],media);assert.deepEqual(pool,[pin],action);
    assert.deepEqual(snapshot(p,source.artifact,pool),[pin],action);
  }
  assert.equal(JSON.stringify({p,source}),before);
  assert.equal(authorizedPool(p,[source],media)[0].versionId,id('c'),'not latest official V2');
});

test('independent oracle: current context stays but unused historical pins do not accumulate in new snapshots',()=>{
  const {p,pin,source,media}=fixture();const other={...structuredClone(pin),id:id('3')};
  source.referencesSnapshot.push(other);const pool=authorizedPool(p,[source],media);
  assert.deepEqual(pool,[pin,other],'comparison keeps full selected pool');
  assert.deepEqual(snapshot(p,source.artifact,pool),[pin],'new candidate retains only used history');
  p.references=[other];assert.deepEqual(snapshot(p,source.artifact,authorizedPool(p,[source],media)),[other,pin],'current context plus used history');
});

test('independent oracle: foreign project, wrong item/version/type/artifact all reject before a hypothetical call',()=>{
  const edits=[pin=>pin.projectId=id('9'),pin=>pin.targetItemId=id('9'),pin=>pin.versionId=id('d'),pin=>pin.versionSnapshot.id=id('d'),pin=>pin.versionSnapshot.contentType='short_text',pin=>pin.versionSnapshot.artifact.title='偽造',pin=>pin.versionSnapshot.artifact.asset.sha256='0'.repeat(64)];
  for(const edit of edits){const {p,pin,media}=fixture();edit(pin);p.references=[pin];let calls=0;assert.throws(()=>{authorizedPool(p,[],media);calls++;});assert.equal(calls,0);}
});

test('independent oracle: metadata agreement alone cannot authorize another owner/project/item private asset',()=>{
  for(const field of ['owner','projectId','itemId']){const {p,pin,media}=fixture();p.references=[pin];media[0][field]=field==='owner'?'b'.repeat(64):id('9');assert.throws(()=>authorizedPool(p,[],media),/private media scope/);}
  const {p,pin,media}=fixture();p.references=[pin];media[0].asset.sha256='0'.repeat(64);assert.throws(()=>authorizedPool(p,[],media),/descriptor mismatch/);
});

test('independent oracle: duplicate pin IDs cannot refresh snapshots or silently switch versions',()=>{
  const {p,pin,source,media}=fixture();p.references=[structuredClone(pin)];assert.deepEqual(authorizedPool(p,[source],media),[pin]);
  p.references[0].versionId=id('d');p.references[0].versionSnapshot=structuredClone(p.creativeItems[0].versions[1]);
  assert.throws(()=>authorizedPool(p,[source],media),/conflict/);
});

test('independent oracle: missing historical pin and arbitrary asset/version/URL identifiers cannot grant access',()=>{
  const {p,pin,source,media,artifactFor}=fixture();source.referencesSnapshot=[];assert.throws(()=>authorizedPool(p,[source],media),/missing/);
  for(const ref of [pin.versionId,pin.versionSnapshot.artifact.asset.id,id('9'),'https://example.invalid/a.png','data:image/png;base64,AAA','../private'])assert.throws(()=>used(artifactFor(ref),[pin]),/missing/);
  const text={...structuredClone(pin),versionSnapshot:{id:pin.versionId,contentType:'short_text'}};assert.throws(()=>used(artifactFor(text.id),[text]),/missing/);
});

test('independent oracle: poster requires all three exact confirmations tied to current integer revision',()=>{
  const p={module:'poster',summaryRevision:7,brief:{tone:'夜色',message:'完整文字',constraints:'圖文左右排列'}},valid={confirmedDirections:['style','text','layout'],directionRevision:7};
  assert.deepEqual(posterConfirmation(p,valid),{summaryRevision:7,style:'夜色',text:'完整文字',layout:'圖文左右排列'});
  for(const parts of [undefined,[],['style','text'],['style','content','functions'],['text','style','layout'],['style','text','layout','layout'],'style,text,layout'])assert.throws(()=>posterConfirmation(p,{...valid,confirmedDirections:parts}),/confirmation/);
  for(const revision of [undefined,6,8,'7',7.5])assert.throws(()=>posterConfirmation(p,{...valid,directionRevision:revision}),/confirmation/);
  p.summaryRevision=8;assert.throws(()=>posterConfirmation(p,valid),/confirmation/);
});

test('independent oracle: explicit pixel-inspection contradictions fail but negatives and literal artwork stay intact',()=>{
  // Deliberately bounded examples, not an exhaustive natural-language truth test.
  const keys=new Set(['reply','question','rationale','changeSummary','summary','fit','strength','tradeoff','suggestion']);
  function commentaryGuard(value){for(const [key,part] of Object.entries(value)){
    if(key==='artifact'||key==='direction')continue;
    if(part&&typeof part==='object'){commentaryGuard(part);continue;}
    if(typeof part!=='string'||!keys.has(key))continue;
    const text=part.replace(/「[^」]*」|『[^』]*』|“[^”]*”|《[^》]*》|"[^"]*"/gu,'').replace(/(?:未|沒有|並未|尚未|不曾|不能|無法).{0,8}?(?:看過|看見|看到|檢視|觀察|分析).{0,10}?(?:圖片|照片|像素|影像)/gu,'');
    if(/(?:我(?:已經|已|確實|親自)?|已經|已|實際|親自)[ \t]*(?:看過|看見|看到|檢視|觀察|視覺分析).{0,10}(?:圖片|照片|像素|影像)(?!的?(?:中繼資料|標題|替代文字|說明|描述|來源註記|尺寸))|\bI\s+(?:have\s+)?(?:viewed|seen|inspected|visually\s+analy[sz]ed)\s+(?:the\s+)?(?:image|photo|pixels)\b(?!\s+(?:metadata|title|alt\s+text|description|dimensions))/iu.test(text))throw new Error('pixel claim');
  }}
  const claim='我已檢視圖片，紅色主體很清楚';
  for(const payload of [{candidates:[{rationale:claim}]},{reply:claim},{items:[{strength:claim}]},{reply:'I have inspected the image.'}])assert.throws(()=>commentaryGuard(payload),/pixel claim/);
  for(const payload of [{rationale:'沒有實際檢視圖片，僅依中繼資料安排版面。'},{summary:'「'+claim+'」是待查證的引文。'},{artifact:{body:claim},direction:{summary:claim}}]){const before=JSON.stringify(payload);assert.doesNotThrow(()=>commentaryGuard(payload));assert.equal(JSON.stringify(payload),before);}
  for(const reply of ['我建議你檢視圖片是否清晰','我只能分析圖片中繼資料，沒有看見圖片像素','我可以協助你分析圖片中繼資料','我已分析圖片的標題與替代文字','I have inspected the image metadata.']){has(native,reply);assert.doesNotThrow(()=>commentaryGuard({reply}));}
});
