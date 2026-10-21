// Executed source contracts + independent JavaScript policy fixtures ONLY.
// These do not execute PHP, PDO, private media reads, HTTP, model inference,
// or a browser. Native fixture: php tests/webpage-image-app.php, UNEXECUTED here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const app=read('app/app.php'),actions=read('app/composition-actions.php'),validation=read('app/validation.php');
const model=read('app/modules/webpage.php'),titles=read('app/modules/titles.php'),modules=read('app/modules.php');
const imageActions=read('app/image-actions.php'),media=read('app/media-store.php'),store=read('app/store.php'),native=read('tests/webpage-image-app.php');
const section=(s,start,end)=>{const i=s.indexOf(start);assert.notEqual(i,-1,'missing '+start);const j=end===undefined?s.length:s.indexOf(end,i+start.length);assert.notEqual(j,-1,'missing '+end);return s.slice(i,j);};
const has=(s,...parts)=>{for(const part of parts)assert.ok(s.includes(part),'missing '+part);};
const ordered=(s,...parts)=>{let last=-1;for(const part of parts){const i=s.indexOf(part,last+1);assert.ok(i>last,'missing or misordered '+part);last=i;}};

test('webpage is a composition for authorization, snapshots and fixed native dispatch',()=>{
  has(actions,"array('illustrated','poster','webpage')","if($artifact['kind']==='webpage')$imageIds=webpageImageReferenceIds($artifact)");
  has(modules,"if($id==='webpage')return new WebpageModule($model)");
  ordered(modules,"if($id==='webpage')",'if(artifactType($id))');
  const append=section(app,'private function appendVersion(','public function action(');
  has(append,"'referencesSnapshot'=>$this->isComposition($project)?field($metadata,'referencesSnapshot',$project['references']):$project['references']");
});

test('explicit immutable illustrated/poster pins alone expand actually used child images',()=>{
  const expand=section(actions,'private function webpageExpandedReferenceGroups(','private function webpageInferenceReferences(');
  ordered(expand,'foreach($groups as $group)','foreach($group as $ref)',"array('illustrated','poster')","$this->locateItem($p,$ref['targetItemId'])","$this->version($target,$ref['versionId'])","validateCompositionArtifact(field($saved,'artifact'),$type)","validateCompositionArtifact(field($snapshot,'artifact'),$type)===$artifact","$this->compositionUsedReferences($artifact,field($saved,'referencesSnapshot',array()))");
  has(expand,"field($ref,'projectId')===$p['id']","field($snapshot,'id')===field($ref,'versionId')","field($saved,'contentType')===$type","$image['viaReferences']=array(array('referenceId'=>$ref['id'],'targetItemId'=>$target['id'],'versionId'=>$saved['id']))",'count($result)<=256');
  assert.doesNotMatch(expand,/officialVersionId|finalizedVersionId|foreach\(\$p\['creativeItems'\]|newId\(|->(?:save|generate|ask)\(/);
});

test('all current and selected historical refs pass identity and actual private media checks',()=>{
  const pool=section(actions,'private function compositionReferencePool(','private function compositionUsedReferences(');
  ordered(pool,"field($source,'referencesSnapshot',array())","$groups[]=$p['references']",'$this->webpageExpandedReferenceGroups($p,$groups)');
  has(pool,"preg_match('/^[a-f0-9]{32}$/D',$id)","field($ref,'projectId')===$p['id']","field($snapshot,'id')===$ref['versionId']","array('targetItemId','versionId')");
  ordered(pool,"$this->locateItem($p,$ref['targetItemId'])","$this->version($target,$ref['versionId'])","validateImageArtifact(field($snapshot,'artifact'))","validateImageArtifact(field($saved,'artifact'))",'ensure($artifact===$stored','$this->resolveImageAsset($p,');
  has(pool,"ensure(field($snapshot,'contentType')==='image'",'COMPOSITION_REFERENCE_CONFLICT',"jsonEncode($prior['versionSnapshot'])===jsonEncode($snapshot)",'count($out)<256',"field($source,'contentType')===$p['module']",'validateWebpageArtifact(field($source,');
  assert.doesNotMatch(pool,/officialVersionId|->(?:save|generate|ask)\(/);
  const used=section(actions,'private function compositionUsedReferences(','private function webpageExpandedReferenceGroups(');
  ordered(used,'ensure(is_array($pool)',"ensure(is_array($ref)&&is_string(field($ref,'id'))&&is_array(field($ref,'versionSnapshot'))","$map[$ref['id']]=$ref");
  has(used,"field($map[$id]['versionSnapshot'],'contentType')==='image'",'COMPOSITION_REFERENCE_MISSING');
});

test('private media resolution binds owner project item saved version and exact descriptor',()=>{
  const resolve=section(imageActions,'private function resolveImageAsset(','public function readImageVersion(');
  has(resolve,"$this->mediaStore()->read($this->owner,$p['id'],$artifact['asset']['id'],$itemId)","$this->imageAssetDescriptor($record['metadata'])===$artifact['asset']");
  has(section(media,'public function read(','public function lookupReceipt('),'WHERE owner=? AND project_id=? AND id=? AND item_id=?');
  const readImage=section(imageActions,'public function readImageVersion(','public function uploadImage(');
  ordered(readImage,"$this->store->project(field($input,'id'),$this->owner)","$this->locateItem($raw,field($input,'itemId'))","$this->version($item,field($input,'versionId'))",'$this->resolveImageAsset(');
});

test('webpage preflight resolves only requested source IDs before storage budget and inference',()=>{
  const infer=section(actions,'private function webpageInferenceReferences(','private function compositionSnapshotReferences(');
  has(infer,"array('compare','fuse')","field($input,'versionIds',array())","$action==='discuss'?array(field($input,'baseVersionId',$p['officialVersionId'])):array()","$this->version($p,$id)","return $this->compositionReferencePool($p,$sources)");
  const execute=section(app,'private function execute(');
  ordered(execute,"$p['compositionReferencePool']=$this->webpageInferenceReferences($p,$action,$input)","$budgetProject['references']=$p['compositionReferencePool']",'$this->reserveStorage($p,inferenceGrowthBudget($budgetProject,$action,$input))',"if($action==='discuss') {",'$module->refine(');
  const budget=section(validation,'function inferenceGrowthBudget(','function webpageDirectionConfirmation(');
  has(budget,"$type==='illustrated'||$type==='poster'||$type==='webpage'","field($version,'referencesSnapshot',array())",'return 2*$references');
});

test('transient current image options and authoritative pool never persist in raw project',()=>{
  const view=section(app,'private function view(','private function normalizeRaw(');
  has(view,"if($out['module']==='webpage')","$out['availableImageReferences']=array()","$out['availableImageReferencesError']=''",'$this->compositionReferencePool($out,array(),false)','catch(AppError $error)');
  for(const [block,object] of [[section(app,'private function normalizeRaw(','public function project('),'raw'],[section(app,'private function save($project)','private function message('),'project']]){
    for(const key of ['compositionReferencePool','availableImageReferences','availableImageReferencesError'])assert.match(block,new RegExp('unset\\([^;]*\\$'+object+"\\['"+key+"'\\]"));
  }
  assert.doesNotMatch(view,/->generate\(|prepareImageInputs|setImageInputs/);
});

test('selected historical references are retained by refine manual fuse and compare, without reattachment',()=>{
  const saveRefs=section(actions,'private function compositionSnapshotReferences(');
  ordered(saveRefs,"$out=$p['references']",'$this->compositionUsedReferences($artifact,$pool)',"$out[]=$ref",'return $out');
  assert.doesNotMatch(saveRefs,/\$p\['references'\]\s*=|\$out=\$pool|newId\(/);
  const snapshot=section(app,"if($action==='snapshot') {","if($action==='promote') {");
  ordered(snapshot,"$base=$basedOn===null?null:$this->version($p,$basedOn)",'$this->compositionReferencePool($p,$base===null?array():array($base))','$this->compositionSnapshotReferences($p,$artifact,$pool)','$this->appendVersion(');
  assert.doesNotMatch(snapshot,/\$module->|prepareImageInputs|setImageInputs/);
  const refine=section(app,"if($action==='discuss') {","if($action==='summarize') {");
  const fuse=section(app,"if($action==='fuse'){","ensure(count($p['comparisons'])<60");
  const compare=section(app,"ensure(count($p['comparisons'])<60");
  has(refine,"$result['referencesSnapshot']=$this->compositionSnapshotReferences($p,$result['artifact'],$compositionPool)");
  has(fuse,"$result['referencesSnapshot']=$this->compositionSnapshotReferences($p,$result['artifact'],$compositionPool)","['fusionSourceVersionIds']=$ids","['fusionSourceSnapshots']=$snapshots");
  has(compare,"$comparisonReferences=$this->isComposition($p)?$compositionPool:$p['references']","'goalBasis'=>'version_snapshots','goalSnapshot'=>null");
  assert.equal((compare.match(/'referencesSnapshot'=>\$comparisonReferences/g)||[]).length,2);
  for(const block of [refine,fuse,compare])assert.doesNotMatch(block,/\$p\['(?:officialVersionId|finalizedVersionId)'\]\s*=(?!=)/);
});

test('only sanitized metadata reaches the same fixed text model, not image transport',()=>{
  const refs=section(model,'protected function modelReferences(','protected function imageMetadata(');
  has(refs,"'title'=>$artifact['title']","'alt'=>$artifact['alt']","'attribution'=>$artifact['attribution']","'width'=>$artifact['asset']['width']","'height'=>$artifact['asset']['height']","'pixelsProvided'=>false");
  assert.doesNotMatch(refs,/'(?:bytes|url|path|asset|assetId|sha256)'\s*=>/);
  has(model,"$data['imagePixelsProvided']=false","array_key_exists('compositionReferencePool',$project)","$groups[]=$project['compositionReferencePool']");
  assert.doesNotMatch(model,/setImageInputs|prepareImageInputs|base64_encode|input_image|image_url|curl_|file_get_contents/);
  assert.doesNotMatch(actions,/setImageInputs|prepareImageInputs|base64_encode|\['bytes'\]|input_image|image_url/);
  has(section(titles,'protected function ask(','protected function briefSchema('),'$schema,$maxOutputTokens)');
});

test('webpage model output cannot manufacture authority, mutate images or claim inspection',()=>{
  const artifact=section(model,'protected function artifactWithReferences(','protected function usedReferences(');
  has(artifact,'webpageImageReferenceIds($artifact)','isset($map[$id])','COMPOSITION_REFERENCE_MISSING','MODEL_IMAGE_REFERENCE_INVALID');
  const ask=section(model,'protected function ask(','protected function rejectsPixelInspectionClaim(');
  ordered(ask,'parent::ask(',"strlen(jsonEncode($value))<=90000",'$this->rejectsPixelInspectionClaim($value)','return $value');
  const guard=section(model,'protected function rejectsPixelInspectionClaim(','protected function artifactWithReferences(');
  has(guard,"if($key==='artifact'||$key==='direction')continue",'MODEL_PIXEL_CLAIM','中繼資料|標題|替代文字','metadata|title|alt');
  assert.doesNotMatch(guard,/->(?:ask|generate)\(/);
});

test('exact two-to-five selected sources and output identities are checked with own goals',()=>{
  const selected=section(model,'protected function selectedSources(','protected function briefInstructions(');
  has(selected,'count($versions)>=2&&count($versions)<=5','array_keys($versions)===range(0,count($versions)-1)','!in_array($id,$ids,true)','$this->sourceSnapshot($version,$references)');
  const compare=section(model,'protected function runCompare(');
  has(compare,"$this->selectedSources($versions,$references,'comparison')","'minItems'=>count($sources),'maxItems'=>count($sources)",'in_array($id,$expected,true)&&!in_array($id,$seen,true)');
  const context=section(model,'protected function selectedData(','protected function selectedSources(');
  has(context,"'goalBasis'=>'version_snapshots'","'creativeGoal'=>null,'goalApprovedAt'=>null","'selectedVersions'=>$this->creativeVersions($sources)");
});

test('three-part current webpage confirmation and all request outcome semantics remain intact',()=>{
  const direction=section(validation,'function webpageDirectionConfirmation(');
  has(direction,"array('style','content','functions')",'$parts===$expected&&is_int($summaryRevision)&&$summaryRevision===field($project,',"'style'=>$project['brief']['tone'],'content'=>$project['brief']['message'],'functions'=>$project['brief']['constraints']");
  has(validation,"'MODEL_PIXEL_CLAIM'","'MODEL_IMAGE_REFERENCE_INVALID'","'MODEL_OUTPUT_INVALID'");
  const action=section(app,'public function action(','private function settingsLease(');
  ordered(action,'$this->checkApproval($input,$connection)','$this->store->requestStart(',"$this->execute($action,$input,$connection)",'$this->store->requestFinish(');
  has(action,'catch(Throwable $e)',"$this->store->requestFinish($this->owner,$requestId,null,false);throw $e");
  has(store,"$old['status']==='completed'",'REQUEST_ALREADY_ATTEMPTED','REQUEST_ID_CONFLICT');
});

test('native integration fixtures explicitly disclose missing execution and cover every trust seam',()=>{
  has(native,'UNEXECUTED in the authoring environment: PHP is unavailable','are NOT PHP',"require_once dirname(__DIR__).'/app/bootstrap.php'",'new Store($directory)','new CocreationApp($store,$config,$owner,$adapter)','PDO::ATTR_DRIVER_NAME',"foreach(array('direct','illustrated','poster') as $route)",'class WebpageImageAppFixtureAdapter','Unexpected inference: no queued fixture response.');
  for(const label of ['same-project images and illustrated sources are not auto-discovered','selected old image survives newer official image and parent versions','derived pin carries exact immutable parent provenance','derived inference and view pools are never persisted','refine retains used historical image after current reference removal','manual save retains historical pin','fusion retains historical image','comparison uses exact selected versions','exact five selected sources accepted','zero one duplicate or six selections rejected','tampered explicit parent or nested saved child rejected','tampered historical pin rejected','missing or conflicting historical pin','matching forged descriptors cannot grant other item private media','different owner cannot read source image','cross-project item cannot be attached','historical derived context capacity rejected','new generation does not inherit removed historical image authority','transport failure remains uncertain','prior failed request cannot repeat inference','all earlier full webpage snapshots remain immutable','other module item and image history remain isolated'])has(native,label);
  assert.doesNotMatch(native,/curl_|new (?:OpenAIAdapter|OllamaAdapter)|set_key|Bearer /);
});

// Independent policy examples, not PHP execution or a line-for-line port.
// They specify expected trust boundaries; source contracts above inspect wiring.
const id=n=>n.toString(16).padStart(32,'0'),owner='a'.repeat(64),clone=v=>structuredClone(v);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function fail(message){throw new Error(message);}
function fixture(type='illustrated'){
  const image=(n,title)=>({id:id(n),contentType:'image',artifact:{kind:'image',title,alt:'使用者說明',attribution:'自製',asset:{id:id(n+100),sha256:n.toString(16).padStart(64,'0'),mime:'image/png',width:1,height:1,byteLength:70}}});
  const old=image(10,'selected old'),latest=image(11,'new official'),other=image(12,'unselected');
  const imageItem={id:id(2),type:'image',versions:[old,latest],officialVersionId:latest.id};
  const otherItem={id:id(3),type:'image',versions:[other]};
  const p={id:id(1),module:'webpage',references:[],creativeItems:[imageItem,otherItem],versions:[]};
  const pin=(n,item,v)=>({id:id(n),projectId:p.id,targetItemId:item.id,versionId:v.id,versionSnapshot:clone(v)});
  const oldPin=pin(20,imageItem,old),newPin=pin(21,imageItem,latest),unusedPin=pin(22,otherItem,other);
  const art=ref=>({kind:type,title:'full literal parent',blocks:[{id:'visual',imageRefId:ref,body:' complete\ntext '}]});
  const oldParent={id:id(30),contentType:type,artifact:art(oldPin.id),referencesSnapshot:[oldPin,unusedPin]};
  const newParent={id:id(31),contentType:type,artifact:art(newPin.id),referencesSnapshot:[newPin]};
  const parentItem={id:id(4),type,versions:[oldParent,newParent],officialVersionId:newParent.id};p.creativeItems.push(parentItem);
  const parentPin=pin(40,parentItem,oldParent);
  const records=[old,latest].map(v=>({owner,projectId:p.id,itemId:imageItem.id,asset:clone(v.artifact.asset)}));records.push({owner,projectId:p.id,itemId:otherItem.id,asset:clone(other.artifact.asset)});
  return {p,records,imageItem,otherItem,old,latest,oldPin,newPin,unusedPin,parentItem,oldParent,newParent,parentPin};
}
function imageIds(artifact){return artifact.kind==='webpage'?artifact.sections.filter(s=>s.type==='image').map(s=>s.entries[0].id):artifact.blocks.map(b=>b.imageRefId).filter(Boolean);}
function page(pin){return {kind:'webpage',title:'full page',theme:'paper',sections:pin?[{id:'visual',type:'image',entries:[{id:pin,title:' full alt ',body:'caption\nline'}]}]:[{id:'text',type:'text',entries:[]}]};}
function used(artifact,pool){const map=new Map(pool.map(r=>[r.id,r])),out=[];for(const key of imageIds(artifact)){const ref=map.get(key);if(ref?.versionSnapshot?.contentType!=='image')fail('missing image');if(!out.some(r=>r.id===key))out.push(clone(ref));}return out;}
function saved(p,ref){const item=p.creativeItems.find(i=>i.id===ref.targetItemId),v=item?.versions.find(v=>v.id===ref.versionId);if(!v)fail('source not found');return {item,v};}
function identity(p,r){if(!r||r.projectId!==p.id||!['id','targetItemId','versionId'].every(k=>typeof r[k]==='string'&&/^[a-f0-9]{32}$/.test(r[k]))||r.versionSnapshot?.id!==r.versionId)fail('invalid identity');}
function authorized(p,sources,records,requestOwner=owner){
  const groups=[...sources.map(v=>v.referencesSnapshot??[]),p.references],out=[],seen=new Map();
  for(const group of groups){if(!Array.isArray(group))fail('invalid group');const expanded=clone(group);
    for(const ref of group){if(!['illustrated','poster'].includes(ref?.versionSnapshot?.contentType))continue;identity(p,ref);const {item,v}=saved(p,ref);if(v.contentType!==ref.versionSnapshot.contentType||!equal(v.artifact,ref.versionSnapshot.artifact))fail('parent mismatch');
      for(const child of used(v.artifact,v.referencesSnapshot)){expanded.push({...child,viaReferences:[{referenceId:ref.id,targetItemId:item.id,versionId:v.id}]});if(expanded.length>256)fail('context limit');}
    }
    for(const r of expanded){identity(p,r);const prior=seen.get(r.id);if(prior){if(!equal([prior.targetItemId,prior.versionId,prior.versionSnapshot],[r.targetItemId,r.versionId,r.versionSnapshot]))fail('conflict');continue;}
      const {item,v}=saved(p,r);if(v.contentType!==r.versionSnapshot.contentType)fail('type mismatch');
      if(v.contentType==='image'){if(!equal(v.artifact,r.versionSnapshot.artifact))fail('child mismatch');const record=records.find(m=>m.owner===requestOwner&&m.projectId===p.id&&m.itemId===item.id&&m.asset.id===v.artifact.asset.id);if(!record)fail('private media scope');if(!equal(record.asset,v.artifact.asset))fail('media descriptor');}
      if(out.length>=256)fail('context limit');seen.set(r.id,r);out.push(clone(r));
    }
  }
  for(const s of sources){if(s.contentType!==p.module)fail('source type');used(s.artifact,out);}return out;
}
function saveSnapshot(p,artifact,pool){const result=clone(p.references);for(const r of used(artifact,pool))if(!result.some(v=>v.id===r.id))result.push(r);return result;}
function selected(versions,ids){if(!Array.isArray(ids)||ids.length<2||ids.length>5||new Set(ids).size!==ids.length)fail('selection');return ids.map(id=>versions.find(v=>v.id===id)??fail('source not found'));}
function validateOutput(ids,rows){if(rows.length!==ids.length||new Set(rows.map(r=>r.versionId)).size!==ids.length||rows.some(r=>!ids.includes(r.versionId)))fail('output selection');return rows;}
function metadata(pool){return pool.filter(r=>r.versionSnapshot.contentType==='image').map(r=>{const a=r.versionSnapshot.artifact;return {id:r.id,targetItemId:r.targetItemId,versionId:r.versionId,versionSnapshot:{id:r.versionId,contentType:'image',title:a.title,alt:a.alt,attribution:a.attribution,width:a.asset.width,height:a.asset.height,mime:a.asset.mime,pixelsProvided:false}};});}

test('independent: no explicit references means no automatic same-project image or parent linking',()=>{
  const f=fixture();assert.deepEqual(authorized(f.p,[],f.records),[]);assert.deepEqual(saveSnapshot(f.p,page(),[]),[]);assert.throws(()=>used(page(f.oldPin.id),[]),/missing image/);
});

test('independent: direct image pin selects old version, never newest official',()=>{
  const f=fixture();f.p.references=[f.oldPin];const before=clone(f);const pool=authorized(f.p,[],f.records);assert.deepEqual(pool,[f.oldPin]);assert.equal(pool[0].versionId,f.old.id);assert.notEqual(pool[0].versionId,f.imageItem.officialVersionId);assert.deepEqual(f,before);
});

for(const type of ['illustrated','poster'])test('independent: explicit '+type+' old version expands only used image with parent provenance',()=>{
  const f=fixture(type);f.p.references=[f.parentPin];const before=clone(f);const pool=authorized(f.p,[],f.records),images=pool.filter(r=>r.versionSnapshot.contentType==='image');assert.equal(images.length,1);assert.equal(images[0].id,f.oldPin.id);assert.equal(images[0].versionId,f.old.id);assert.deepEqual(images[0].viaReferences,[{referenceId:f.parentPin.id,targetItemId:f.parentItem.id,versionId:f.oldParent.id}]);assert.ok(!pool.some(r=>[f.newPin.id,f.unusedPin.id].includes(r.id)));assert.deepEqual(f,before);
});

test('independent: tampered project item version snapshot parent and child cannot authorize sources',()=>{
  for(const mutate of [f=>f.parentPin.projectId=id(99),f=>f.parentPin.targetItemId=f.otherItem.id,f=>f.parentPin.versionId=f.newParent.id,f=>f.parentPin.versionSnapshot.artifact.title='forged',f=>f.oldParent.referencesSnapshot[0].versionSnapshot.artifact.alt='forged']){const f=fixture();mutate(f);f.p.references=[f.parentPin];assert.throws(()=>authorized(f.p,[],f.records));}
  for(const mutate of [f=>f.oldPin.projectId=id(99),f=>f.oldPin.targetItemId=f.otherItem.id,f=>f.oldPin.versionId=f.latest.id,f=>f.oldPin.versionSnapshot.id=f.latest.id,f=>f.oldPin.versionSnapshot.artifact.title='forged',f=>delete f.oldPin.versionSnapshot.contentType]){const f=fixture();mutate(f);f.p.references=[f.oldPin];assert.throws(()=>authorized(f.p,[],f.records));}
});

test('independent: agreeing forged saved and pinned descriptors still cannot cross private media ownership',()=>{
  const f=fixture();f.old.artifact.asset=clone(f.otherItem.versions[0].artifact.asset);f.oldPin.versionSnapshot.artifact=clone(f.old.artifact);f.p.references=[f.oldPin];assert.throws(()=>authorized(f.p,[],f.records),/private media scope/);
  const clean=fixture();clean.p.references=[clean.oldPin];assert.throws(()=>authorized(clean.p,[],clean.records,'b'.repeat(64)),/private media scope/);clean.records[0].projectId=id(99);assert.throws(()=>authorized(clean.p,[],clean.records),/private media scope/);
});

test('independent: removed current parent refs do not break selected historical refine manual fuse compare',()=>{
  const f=fixture();f.p.references=[f.parentPin];const pool=authorized(f.p,[],f.records),artifact=page(f.oldPin.id);const original={id:id(50),contentType:'webpage',artifact,goalAndRationale:'original own goal',referencesSnapshot:saveSnapshot(f.p,artifact,pool)};f.p.references=[];const historical=authorized(f.p,[original],f.records);const refined={id:id(51),contentType:'webpage',artifact:{...clone(artifact),theme:'midnight'},goalAndRationale:'refined own goal',referencesSnapshot:saveSnapshot(f.p,artifact,historical)};
  assert.equal(refined.referencesSnapshot.length,1);assert.equal(refined.referencesSnapshot[0].versionId,f.old.id);assert.ok(refined.referencesSnapshot[0].viaReferences);const before=clone([original,refined]);for(const action of ['manual','refine','fuse','compare']){const sources=action==='compare'||action==='fuse'?[original,refined]:[refined];const refs=authorized(f.p,sources,f.records);assert.equal(used(artifact,refs)[0].versionId,f.old.id);assert.deepEqual(f.p.references,[]);assert.deepEqual([original,refined],before);}assert.deepEqual(authorized(f.p,[],f.records),[]);
});

test('independent: missing or conflicting historical image fails closed rather than selecting latest',()=>{
  const f=fixture();const source={id:id(50),contentType:'webpage',artifact:page(f.oldPin.id),referencesSnapshot:[]};assert.throws(()=>authorized(f.p,[source],f.records),/missing image/);source.referencesSnapshot=[f.oldPin];f.p.references=[{...clone(f.oldPin),versionId:f.latest.id,versionSnapshot:clone(f.latest)}];assert.throws(()=>authorized(f.p,[source],f.records),/conflict/);
});

test('independent: comparison accepts exact 2 and 5 sources and never uses a common goal',()=>{
  const versions=Array.from({length:6},(_,n)=>({id:id(60+n),goalAndRationale:'own goal '+n,artifact:page()}));const before=clone(versions);
  for(const n of [2,5]){const ids=versions.slice(0,n).map(v=>v.id),result=selected(versions,ids);assert.deepEqual(result.map(v=>v.goalAndRationale),versions.slice(0,n).map(v=>v.goalAndRationale));assert.deepEqual(validateOutput(ids,ids.map(versionId=>({versionId}))),ids.map(versionId=>({versionId})));}
  for(const ids of [[],[versions[0].id],[versions[0].id,versions[0].id],versions.map(v=>v.id),null])assert.throws(()=>selected(versions,ids),/selection/);
  const ids=versions.slice(0,2).map(v=>v.id);for(const rows of [[],[{versionId:ids[0]}],[{versionId:ids[0]},{versionId:ids[0]}],[{versionId:ids[0]},{versionId:versions[2].id}]])assert.throws(()=>validateOutput(ids,rows),/output selection/);assert.deepEqual(versions,before);
});

test('independent: text model metadata cannot contain pixel payloads descriptors paths or asset secrets',()=>{
  const f=fixture();f.p.references=[f.parentPin];const pool=authorized(f.p,[],f.records);pool.find(r=>r.id===f.oldPin.id).versionSnapshot.bytes='PRIVATE_PIXEL_SENTINEL';const safe=metadata(pool);assert.equal(safe[0].versionSnapshot.pixelsProvided,false);const encoded=JSON.stringify(safe);for(const text of ['PRIVATE_PIXEL_SENTINEL',f.old.artifact.asset.id,f.old.artifact.asset.sha256,'"asset"','"bytes"','"path"','"url"'])assert.ok(!encoded.includes(text));assert.equal(safe[0].versionId,f.old.id);assert.equal(safe[0].versionSnapshot.alt,'使用者說明');
});

test('independent: bounded reference pools never silently truncate valid explicit data',()=>{
  const f=fixture();f.p.references=Array.from({length:256},(_,i)=>({...clone(f.oldPin),id:id(i+500)}));assert.equal(authorized(f.p,[],f.records).length,256);f.p.references.push({...clone(f.oldPin),id:id(999)});assert.throws(()=>authorized(f.p,[],f.records),/context limit/);
});
