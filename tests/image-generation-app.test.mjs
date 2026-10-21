// Executed source contracts and independent policy examples ONLY.
// These do not run PHP, PDO, the PNG decoder, HTTP, a browser, or a provider.
// Native real-application fixtures: php tests/image-generation-app.php (UNEXECUTED here).
// Real SQL transaction checks: python3 tests/image-generation-sqlite.py.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const app=read('app/app.php'),actions=read('app/image-generation-actions.php'),store=read('app/store.php');
const media=read('app/media-store.php'),image=read('app/image-actions.php'),bootstrap=read('app/bootstrap.php');
const native=read('tests/image-generation-app.php'),sqlite=read('tests/image-generation-sqlite.py');
const section=(s,start,end)=>{const i=s.indexOf(start);assert.notEqual(i,-1,'missing '+start);const j=end===undefined?s.length:s.indexOf(end,i+start.length);assert.notEqual(j,-1,'missing '+end);return s.slice(i,j);};
const has=(s,...parts)=>{for(const part of parts)assert.ok(s.includes(part),'missing '+part);};
const ordered=(s,...parts)=>{let last=-1;for(const part of parts){const i=s.indexOf(part,last+1);assert.ok(i>last,'missing or misordered '+part);last=i;}};
const generate=section(actions,'private function generateImage('),prepare=section(actions,'private function preparePixelRequest(','private function generateImage(');

test('fixed image generation is an independently injected explicit action, never the chat adapter',()=>{
  ordered(bootstrap,"'/image-generation.php'","'/image-provider.php'","'/image-generation-actions.php'","'/app.php'");
  has(app,'use CocreationImageGenerationActions;','__construct($store,$config,$owner,$adapter=null,$imageAdapter=null)','$this->model=$adapter;$this->imageModel=$imageAdapter');
  const dispatch=section(app,'public function action(','private function settingsLease(');
  ordered(dispatch,"if(field($input,'action')==='generate_image')return $this->generateImage($input)",'$paid=in_array(');
  has(app,"if($action==='bind_project_image_model')return $this->bindProjectImageModel($input)");
  has(section(actions,'private function imageAdapter(','private function preparePixelRequest('),'if($this->imageModel!==null)return $this->imageModel','new OpenAIImageAdapter(');
  assert.doesNotMatch(actions,/\$this->adapter\(|new (?:OpenAIAdapter|OllamaAdapter)|->(?:summarize|discuss|refine)\(/);
});

test('new and legacy projects keep independent immutable image binding and explicit consent',()=>{
  const binding=section(actions,'private function imageBindingFromInput(','private function projectImageConnection(');
  ordered(binding,'$this->settingsLease($input)',"validId(field($input,'imageMemberId'))","$member['enabled']","field($input,'imageUsageConsent')===true",'validateProjectImageBinding(');
  has(binding,"'memberId'=>$member['id']","'memberNickname'=>$member['nickname']","'boundAt'=>nowIso()","'bindingHash'=>hash('sha256',jsonEncode(validateProjectImageBinding($binding)))","'acceptedAt'=>nowIso()");
  const bind=section(binding,'private function bindProjectImageModel(');
  ordered(bind,"$this->store->project(field($input,'id'),$this->owner)",'$this->revision($p,$input)',"$p['projectLifecycle']!=='finalized'","$p['imageBinding']===null","$p['imageBinding']=$this->imageBindingFromInput($input)",'$this->saveRaw($p)');
  assert.doesNotMatch(bind,/\['aiBinding'\]\s*=|->(?:generate|request|put)\(/);
  const normalize=section(app,'private function normalizeRaw(','public function project(');
  has(normalize,"if(!array_key_exists('imageBinding',$raw))$raw['imageBinding']=null","if(!array_key_exists('imageGenerationConsent',$raw))$raw['imageGenerationConsent']=null","validateProjectImageBinding($raw['imageBinding'])");
  const create=section(app,"if($action==='new') {","if($action==='bind_project_model')");
  has(create,"field($input,'imageMemberId')===null?null:$this->imageBindingFromInput($input)","'aiBinding'=>$binding,'imageBinding'=>$imageBinding","'imageGenerationConsent'=>$imageBinding===null?null:$this->newImageGenerationConsent($imageBinding)");
});

test('fixed image member revalidates roster identity enabled destination and exact consent hash without fallback',()=>{
  const connection=section(actions,'private function projectImageConnection(','private function imageAdapter(');
  ordered(connection,"field($p,'imageBinding')!==null","validateProjectImageBinding($p['imageBinding'])",'$this->store->memberRoster(',"$candidate['id']===$binding['memberId']","$member!==null","$member['enabled']");
  has(connection,"array('provider','model','ollamaUrl')","$member[$key]===$binding[$key]",'IMAGE_MODEL_CHANGED',"field(field($p,'imageGenerationConsent'),'bindingHash')===hash('sha256',jsonEncode($binding))","'memberNickname'=>$binding['memberNickname']");
  assert.doesNotMatch(connection,/activeMemberId|->(?:selectMember|setMemberRoster|setConnection|generate)\(/);
  const approval=section(app,'private function checkApproval(','public function status(');
  has(approval,"field($input,'approvedMemberId')===$connection['memberId']","field($input,'approvedModel')===$connection['model']","field($input,'approvedSettingsRevision')===$connection['settingsRevision']","field($input,'approvedKeyRevision')===$status['keyRevision']");
});

test('completed request lookup is before expiring approval, and every preflight is before the attempt',()=>{
  ordered(generate,"$this->store->requestLookup($this->owner,$requestId,'generate_image',$fingerprint)",'if($prior!==null)return',"function_exists('zlib_decode')",'validateImageGenerationRequest($input)',"$this->project(field($input,'id'))",'$this->revision($p,$input)','$this->activeInput($p,$input)',"$p['module']==='image'","$p['projectLifecycle']!=='finalized'","count($p['messages'])<=398&&count($p['versions'])<60","if($request['mode']==='generate')$this->goalRequired($p)",'$this->projectImageConnection($p)','$this->checkApproval($input,$connection)','$this->preparePixelRequest($p,$request)','$media->assertCapacity(', '$this->reserveStorage(', '$this->store->requestStart(', '$this->imageAdapter()->generate(');
  has(generate,"'project'=>$this->project($prior['projectId']),'generatedVersionId'=>$prior['versionId'],'replayed'=>true");
  assert.equal((generate.match(/\$this->imageAdapter\(\)->generate\(/g)||[]).length,1);
  assert.doesNotMatch(generate,/\b(?:while|for|foreach)\s*\(|sleep\(|usleep\(|curl_|file_get_contents/);
});

test('pixel sources are exact current-item versions and explicit pinned references, not newer official versions',()=>{
  ordered(prepare,"foreach($request['sourceVersionIds'] as $id)",'$this->version($p,$id)',"!versionArchived($p,$id)","$add($p['activeItemId'],$source",'$this->pinnedVersion($source)',"foreach($request['references'] as $selection)","foreach($p['references'] as $candidate)","$candidate['id']===$selection['referenceId']","field($ref,'projectId')===$p['id']","$this->locateItem($p,$ref['targetItemId'])","$this->version($target,$ref['versionId'])","field($ref['versionSnapshot'],'artifact')===field($source,'artifact')","$add($target['id'],$source,$selection['role'],$ref['id'])");
  has(prepare,"field($version,'contentType')==='image'&&isset($version['artifact'])","$this->resolveImageAsset($p,$itemId,$version['artifact'])");
  assert.doesNotMatch(prepare,/officialVersionId|finalizedVersionId|availableImageReferences|compositionReferencePool|webpageExpandedReferenceGroups/);
  const resolve=section(image,'private function resolveImageAsset(','public function readImageVersion(');
  has(resolve,"$this->mediaStore()->read($this->owner,$p['id'],$artifact['asset']['id'],$itemId)","$this->imageAssetDescriptor($record['metadata'])===$artifact['asset']");
  has(media,'WHERE owner=? AND project_id=? AND id=? AND item_id=?');
});

test('unique PNGs deduplicate but every selected source role keeps correct one-based transport index',()=>{
  has(prepare,"'referenceId'=>$referenceId,'role'=>$role,'imageIndex'=>isset($seen[$asset['id']])?$seen[$asset['id']]+1:count($images)+1","if(isset($seen[$asset['id']]))","count($images)<5&&$total+$asset['byteLength']<=12582912","$seen[$asset['id']]=count($images)","$total+=$asset['byteLength']",'prepareModelImageInputs($images)','one-based position in the supplied image array');
  ordered(prepare,'$this->resolveImageAsset(',"$snapshots[]=array(","if(isset($seen[$asset['id']]))","ensure(count($images)<5",'$images[]=array(');
  assert.doesNotMatch(prepare,/array_slice|substr\(\$prompt|base64_encode|data:image/);
});

test('saved image goals derive from selected version goals, new generation alone uses current approval',()=>{
  has(prepare,"'goalAndRationale'=>versionGoalAndRationale($source)","if($request['mode']==='generate')$parts[]=field($p['brief'],'summary','')","foreach($sourceGoals as $source)","$request['instruction']","validateCombinedVersionNote(implode(","'approvedDirection'=>$request['mode']==='generate'?$p['brief']:null","'versionGoalAndRationale'=>$note","'pinnedTextReferences'=>$textReferences","strlen($prompt)<=32000");
  const texts=section(prepare,'$textReferences=array();','$note=$request[');
  has(texts,"field($ref['versionSnapshot'],'contentType')!=='image'","'items'=>field($ref['versionSnapshot'],'items',array())");
  assert.doesNotMatch(texts,/\['bytes'\]|base64|\['asset'\]|\['artifact'\]/);
  has(prepare,"$selectedReferenceIds=array_column($request['references'],'referenceId')","field($ref['versionSnapshot'],'contentType')!=='image'||in_array($ref['id'],$selectedReferenceIds,true)","'references'=>$usedReferences");
  has(generate,"['referencesSnapshot']=$prepared['references']");
});

test('provider return is normalized before the short asset project receipt atomic transaction',()=>{
  ordered(generate,'$this->store->requestStart(', '$this->imageAdapter()->generate(',"$received=true", "normalizeUploadedPng($result['bytes'])","unset($result['bytes'])",'$media->transaction(',"$this->project($p['id'])",'$this->revision($current,$input)','$this->activeInput($current,$input)','$this->projectImageConnection($current)','$media->insert(', '$this->appendVersion(', '$this->save($p)',"$this->store->requestFinish($this->owner,$requestId,array('projectId'=>$p['id'],'versionId'=>$id),true)");
  const transaction=section(media,'public function transaction(','private function requireTransaction(');
  ordered(transaction,"$this->db->exec('BEGIN IMMEDIATE')",'$result=$callback($this)',"$this->db->exec('COMMIT')",'catch(Throwable $error)',"$this->db->exec('ROLLBACK')");
  has(generate,"$this->store->requestFinish($this->owner,$requestId,null,false)",'IMAGE_GENERATION_NOT_SAVED','if($received)throw new AppError(');
  assert.doesNotMatch(generate,/recordReceipt\(|lookupReceipt\(/);
});

test('new complete candidates retain immutable provenance and never alter official/finalized pointers',()=>{
  has(generate,"'requestedModel'=>$connection['model'],'actualModel'=>$result['actualModel']","'memberNickname'=>$connection['memberNickname']","'bindingSnapshot'=>$p['imageBinding']","'providerRequestId'=>$result['providerRequestId']","'providerCreatedAt'=>$result['providerCreatedAt']","'revisedPrompt'=>$result['revisedPrompt']","'usage'=>$result['usage']","'options'=>imageGenerationOptions()","'imageSourceSnapshots']=$prepared['sourceSnapshots']","'revisionInstruction']=$request['instruction']");
  has(generate,"$mode==='revise'?'image_revision':($mode==='fuse'?'image_fusion':'image_generated')","$mode==='revise'?'minor':'major'","$mode==='revise'?$request['sourceVersionIds'][0]:null","'fusionSourceVersionIds']=$request['sourceVersionIds']");
  assert.doesNotMatch(generate,/\$p\['(?:officialVersionId|finalizedVersionId|finalizedAt|title|aiBinding|imageBinding)'\]\s*=(?!=)/);
  const snapshot=section(app,'private function pinnedVersion(','private function reserveStorage(');
  has(snapshot,"unset($version['fusionSourceSnapshots'],$version['imageSourceSnapshots'])","unset($ref['versionSnapshot'])","$ref['sourceProvenance']=field($source,'provenance')");
});

test('request journal is owner-scoped consumed once and cannot downgrade a committed receipt',()=>{
  const lookup=section(store,'public function requestLookup(','public function requestStart(');
  has(lookup,'SELECT * FROM requests WHERE owner=? AND id=?',"$old['action']===$action&&hash_equals($old['fingerprint'],$fingerprint)","$old['status']==='completed'",'REQUEST_ID_CONFLICT','REQUEST_ALREADY_ATTEMPTED');
  const start=section(store,'public function requestStart(','public function requestFinish(');
  ordered(start,'$this->requestLookup(', 'if($previous!==null)return $previous','INSERT INTO requests(',"$fingerprint,'running',time()");
  has(section(store,'public function requestFinish('),"UPDATE requests SET status=?,response=? WHERE owner=? AND id=? AND status='running'","if($success)ensure($q->rowCount()===1",'REQUEST_JOURNAL_CONFLICT');
  assert.doesNotMatch(section(store,'public function requestLookup('),/DELETE FROM requests|REPLACE INTO requests|ON CONFLICT/);
});

test('native fixtures are key-free and disclose exact runtime limits while targeting real app seams',()=>{
  has(native,'UNEXECUTED in the authoring environment: PHP is unavailable','are NOT PHP execution',"require_once dirname(__DIR__).'/app/bootstrap.php'",'new CocreationApp($store,$config,$owner,$text,$images)','new ImageGenerationFixtureStore($directory)','new MediaStore($store->db)',"new ReflectionProperty(CocreationApp::class,'vault')",'Fixture must never retrieve a credential.');
  assert.doesNotMatch(native,/\bsk-[A-Za-z0-9_-]{16,}|curl_|new (?:OpenAIAdapter|OpenAIImageAdapter|OllamaAdapter)|set_key|Bearer |ini_set\(/);
  for(const label of ['legacy project never infers image binding','one-time late image binding preserves existing chat','new generation requires explicitly approved current goal','literal own goal title fixed requested model nickname and unknown actual model','promoted saved source can be revised without restarting goal','direct source snapshots retain content and provenance without recursively expanding','generate promote revise promote fuse preserves','completed same-payload replay precedes expired approval','same request ID with changed payload','only explicitly chosen old reference pixels','same-project other-item source ID','reference must be an explicit currently pinned reference','sixth unique image fails before dispatch','failed same request never sends again','four valid images over combined 12 MiB','previous complete image snapshot remains immutable'])has(native,label);
  has(native,"array('bad_png','before_project','after_project','after_receipt','transport')","$text->calls===0&&$vault->reads===0");
});

test('SQLite runner uses actual extracted SQL and distinguishes its scope from PHP/provider execution',()=>{
  has(sqlite,"(ROOT / 'app/store.php').read_text","(ROOT / 'app/media-store.php').read_text","REQUEST_FINISH = next(q for q in QUERIES",'second connection sees neither partial PNG','late failure handler cannot overwrite','rollback after ','connection loss retains attempted/unknown running journal','second output writer cannot enter','UNEXECUTED: PHP/PDO runtime');
  assert.doesNotMatch(sqlite,/requests\.get|urllib|subprocess|https?:\/\//);
});

// Independent policy examples, not PHP execution or another implementation of
// the application. They exercise the intended byte-index and replay invariants.
const id=n=>n.toString(16).padStart(32,'0');
function transportMap(selections){const images=[],inputs=[],seen=new Map();let bytes=0;for(const source of selections){let index=seen.get(source.assetId);if(index===undefined){if(images.length>=5||bytes+source.byteLength>12582912)throw new Error('IMAGE_INPUT_LIMIT');index=images.length;seen.set(source.assetId,index);bytes+=source.byteLength;images.push(source.assetId);}inputs.push({versionId:source.versionId,referenceId:source.referenceId??null,role:source.role,imageIndex:index+1});}return {images,inputs,bytes};}
test('independent: duplicate pixel roles do not shift following unique image indices',()=>{
  const source=(n,asset=n,role='fusion_source')=>({versionId:id(n),assetId:id(asset),byteLength:1024,role});
  const selection=[source(1),source(2,1),{...source(3,3,'palette'),referenceId:id(20)},{...source(4,3,'style'),referenceId:id(21)},source(5)];
  const result=transportMap(selection);assert.deepEqual(result.images,[id(1),id(3),id(5)]);assert.deepEqual(result.inputs.map(v=>v.imageIndex),[1,1,2,2,3]);assert.deepEqual(result.inputs.map(v=>v.role),['fusion_source','fusion_source','palette','style','fusion_source']);assert.equal(result.bytes,3072);
});
test('independent: unique byte and image limits reject rather than truncate, duplicate versions preserve lineage',()=>{
  const sources=Array.from({length:5},(_,n)=>({versionId:id(n+1),assetId:id(n+1),byteLength:1024,role:'fusion_source'}));assert.equal(transportMap(sources).images.length,5);assert.throws(()=>transportMap([...sources,{...sources[0],assetId:id(6)}]),/IMAGE_INPUT_LIMIT/);
  const duplicate=transportMap([...sources,{...sources[0],versionId:id(7)}]);assert.equal(duplicate.images.length,5);assert.equal(duplicate.inputs.length,6);assert.equal(duplicate.inputs[5].imageIndex,1);
  const bytes=sources.slice(0,3).map(v=>({...v,byteLength:4194304}));assert.equal(transportMap(bytes).bytes,12582912);assert.throws(()=>transportMap([...bytes,{...sources[3],byteLength:1}]),/IMAGE_INPUT_LIMIT/);
});
