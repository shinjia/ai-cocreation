// Source-level application contracts only. These do not execute PHP, PDO or AI.
// Native end-to-end fixture: php tests/image-analysis.php (UNEXECUTED here).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const app=read('app/app.php'),actions=read('app/image-actions.php'),module=read('app/modules/image.php');
const store=read('app/store.php'),media=read('app/media-store.php'),fixture=read('tests/image-analysis.php');
const section=(source,start,end)=>{
  const from=source.indexOf(start);assert.notEqual(from,-1,'missing source anchor '+start);
  const to=end===undefined?source.length:source.indexOf(end,from+start.length);assert.notEqual(to,-1,'missing end anchor '+end);
  return source.slice(from,to);
};
const ordered=(source,...needles)=>{
  let previous=-1;
  for(const needle of needles){const position=source.indexOf(needle,previous+1);assert.ok(position>previous,'missing or out-of-order '+needle);previous=position;}
};

test('project-specific image opt-in verifies fixed binding and persists without model or key access',()=>{
  const grant=section(actions,'private function grantImageAnalysis(','private function imageAssetDescriptor(');
  ordered(grant,'$this->project(','$this->revision(','$this->activeInput(','$this->projectConnection($p)',"$p['imageAnalysisConsent']=",'$this->save($p)');
  assert.ok(actions.includes("hash('sha256',jsonEncode(validateProjectAiBinding(field($p,'aiBinding'))))"));
  assert.ok(grant.includes("'bindingHash'=>$this->imageBindingHash($p)"));
  assert.doesNotMatch(grant,/->(?:generate|adapter|checkApproval|requestStart|vault|setImageInputs)\b/);
  const entry=section(app,'public function action(','private function settingsLease(');
  const paid=entry.match(/\$paid=in_array\(\$action,array\(([^;]+?)\),true\)/)[1];
  assert.doesNotMatch(paid,/grant_image_analysis/);
  const execute=section(app,'private function execute(',"if($action==='save_members')");
  ordered(execute,'$this->imageInputSnapshots=array()',"if($action==='grant_image_analysis')return $this->grantImageAnalysis($input)");
  const consent=section(actions,'private function imageConsentRequired(','private function grantImageAnalysis(');
  assert.ok(consent.includes("field($consent,'bindingHash')===$this->imageBindingHash($p)"));
  assert.ok(consent.includes('IMAGE_ANALYSIS_OPT_IN'));
});

test('every image action prepares authorized persisted bytes before its sole module inference',()=>{
  const prepare=section(actions,'private function prepareImageInputs(');
  ordered(prepare,"$this->resolveImageAsset($p,$itemId,$version['artifact'])","'bytes'=>$record['bytes']",'$this->imageConsentRequired($p)','$module->setImageInputs($images)');
  assert.ok(prepare.includes('count($images)<5&&$bytes+$asset[\'byteLength\']<=12582912'));
  const discuss=section(app,"if($action==='discuss') {","if($action==='summarize') {");
  ordered(discuss,'$this->prepareImageInputs($p,$module,array($official))','$module->refine(');
  ordered(discuss,'$this->prepareImageInputs($p,$module,array())','$module->discuss(');
  const summarize=section(app,"if($action==='summarize') {","if($action==='approve_goal') {");
  ordered(summarize,'$this->prepareImageInputs(','$module->summarize(');
  const compare=section(app,"ensure(count($p['comparisons'])<60");
  ordered(compare,"count($ids)>=2&&count($ids)<=5",'count(array_unique($ids,SORT_STRING))===count($ids)',"$this->version($p,$id)",'$this->prepareImageInputs($p,$module,$versions,false)','$module->compare(');
  assert.equal((compare.match(/\$module->compare\(/g)||[]).length,1);
  const ask=section(module,'protected function ask(','protected function rejectsImageEditClaim(');
  ordered(ask,'$images=$this->imageInputs;$this->imageInputs=array()',"$data['imageInputs']=array()",'$this->model->generate(');
  assert.ok(ask.includes('$schema,$maxOutputTokens,$images)'));
});

test('deduplicated image payload retains a snapshot for every selected version and its distinct note',()=>{
  const prepare=section(actions,'private function prepareImageInputs(');
  ordered(prepare,"'versionId'=>$version['id']",'$snapshots[]=$snapshot',"if(isset($seen[$asset['id']]))",'；亦為 ');
  assert.ok(prepare.includes('$this->imageInputSnapshots=$snapshots'));
  const compare=section(app,"ensure(count($p['comparisons'])<60");
  assert.ok(compare.includes('$goalSnapshots[]=versionComparisonSnapshot($v)'));
  assert.ok(compare.includes("'versionGoalSnapshots'=>$goalSnapshots"));
  assert.ok(compare.includes("'versionIds'=>$ids"));
  const title=read('app/modules/titles.php');
  assert.ok(section(title,'protected function creativeVersions(','protected function context(').includes("'goalAndRationale'"));
  assert.ok(section(title,'protected function runCompare(').includes("'selectedVersions'=>$this->creativeVersions($versions)"));
  assert.doesNotMatch(compare,/array_unique\(\$versions|array_unique\(\$snapshots|array_unique\(\$goalSnapshots/);
});

test('reference bytes resolve the immutable pinned item/version, never the latest official version',()=>{
  const references=section(actions,'if($includeReferences)foreach(',"if(count($images))");
  ordered(references,"$this->locateItem($p,$reference['targetItemId'])","$this->version($target,$reference['versionId'])","$add($target['id'],$saved");
  assert.doesNotMatch(references,/officialVersionId|finalizedVersionId|end\(\$target\['versions'\]\)/);
  const attach=section(app,"if($action==='attach_reference'){","}elseif($action==='remove_reference')");
  assert.ok(attach.includes("'versionId'=>$version['id'],'versionSnapshot'=>$this->pinnedVersion($version)"));
  assert.ok(attach.includes("$item['references'][]=$ref"));
  assert.ok(app.includes("'referencesSnapshot'=>$p['references']"));
});

test('read and upload bind owner, project, item and saved version before access or mutation',()=>{
  const resolve=section(actions,'private function resolveImageAsset(','public function readImageVersion(');
  assert.ok(resolve.includes("$this->mediaStore()->read($this->owner,$p['id'],$artifact['asset']['id'],$itemId)"));
  assert.ok(resolve.includes("$this->imageAssetDescriptor($record['metadata'])===$artifact['asset']"));
  const read=section(actions,'public function readImageVersion(','public function uploadImage(');
  ordered(read,"$this->store->project(field($input,'id'),$this->owner)","$this->locateItem($raw,field($input,'itemId'))","$this->version($item,field($input,'versionId'))",'$this->resolveImageAsset(');
  assert.doesNotMatch(read,/field\(\$input,'assetId'\)/);
  const upload=section(actions,'public function uploadImage(','private function prepareImageInputs(');
  ordered(upload,'$this->store->project($id,$this->owner)','normalizeUploadedPng($bytes)','$media->transaction(','lookupReceipt(','$this->revision($p,$input)','$this->activeInput($p,$input)','$store->insert(');
  const scopedRead=section(media,'public function read(','public function lookupReceipt(');
  assert.ok(scopedRead.includes('WHERE owner=? AND project_id=? AND id=? AND item_id=?'));
});

test('manual image snapshots cannot swap an asset, while generate and fuse cannot invoke a model',()=>{
  const snapshot=section(app,"if($action==='snapshot') {","if($action==='promote') {");
  ordered(snapshot,'$this->resolveImageAsset(',"$artifact['asset']===$base['artifact']['asset']",'IMAGE_METADATA_ONLY','$this->appendVersion(');
  const execution=section(app,"$module=moduleAdapter($p['module'],$adapter)","if($action==='reopen') {");
  assert.ok(execution.includes("array('generate','confirm_generate','fuse')"));
  assert.ok(execution.includes('IMAGE_GENERATION_UNAVAILABLE'));
  const refine=section(module,'protected function runRefine(','protected function runCompare(');
  assert.ok(refine.includes("'enum'=>array('clarification')"));
  assert.ok(refine.includes("'outcome'=>'clarification'"));
  assert.doesNotMatch(refine,/'outcome'=>'revision'|'artifact'=>|appendVersion/);
  assert.ok(refine.includes('$this->rejectsImageEditClaim('));
  for(const method of ['runGenerate','runFuse']){
    const body=section(module,'protected function '+method+'(',method==='runGenerate'?'protected function runFuse(':undefined);
    assert.ok(body.includes("throw new AppError('CAPABILITY_UNAVAILABLE'"));
    assert.doesNotMatch(body,/->generate\(|->ask\(|appendVersion/);
  }
});

test('image provenance records actual fixed model and bounded metadata but never raw pixels',()=>{
  const provenance=section(app,'private function provenance(','private function checkApproval(');
  for(const source of ["'memberId'=>$connection['memberId']","'provider'=>$connection['provider']","'requestedModel'=>$connection['model']","'actualModel'=>$adapter->actualModel()","'requestedAt'=>$requestedAt","$out['inputMode']='image_bytes'","$out['imageInputs']=$this->imageInputSnapshots"])assert.ok(provenance.includes(source),source);
  assert.doesNotMatch(provenance,/\['bytes'\]|base64|data:image/);
  const snapshot=section(actions,"$snapshot=array('itemId'",'$snapshots[]=$snapshot');
  for(const field of ['itemId','versionId','assetId','sha256','label'])assert.ok(snapshot.includes("'"+field+"'"));
  assert.doesNotMatch(snapshot,/\['bytes'\]|base64/);
  const compare=section(app,"ensure(count($p['comparisons'])<60");
  assert.equal((compare.match(/'provenance'=>\$this->provenance\(\$connection,\$adapter,\$requestedAt\)/g)||[]).length,2);
});

test('real upload asset, version, project save and receipt share one PDO transaction and rollback boundary',()=>{
  assert.ok(actions.includes('private function mediaStore() { return new MediaStore($this->store->db); }'));
  const upload=section(actions,'public function uploadImage(','private function prepareImageInputs(');
  ordered(upload,'return $media->transaction(','$store->insert(','$this->appendVersion(','$this->save($p)','$store->recordReceipt(');
  const transaction=section(media,'public function transaction(','private function requireTransaction(');
  ordered(transaction,"$this->db->exec('BEGIN IMMEDIATE')",'$result=$callback($this)',"$this->db->exec('COMMIT')");
  ordered(transaction,'catch(Throwable $error)',"$this->db->exec('ROLLBACK')",'throw $error');
  assert.ok(transaction.includes('$this->transactionActive=false'));
  const save=section(store,'public function save(','public function model(');
  assert.ok(save.includes('$this->db->prepare('));
  assert.doesNotMatch(save,/new PDO|beginTransaction|COMMIT|ROLLBACK/);
});

test('native fixture uses real application/PDO seams and distinguishes its unexecuted status',()=>{
  assert.ok(fixture.includes('UNEXECUTED in the authoring environment: PHP is unavailable'));
  assert.ok(fixture.includes('Node source contracts and a lexer check are NOT PHP syntax/runtime verification'));
  assert.ok(fixture.includes("require_once dirname(__DIR__).'/app/bootstrap.php'"));
  assert.ok(fixture.includes('class ImageAnalysisFixtureStore extends Store'));
  assert.ok(fixture.includes('$saved=parent::save($project,$owner)'));
  assert.ok(fixture.includes('new CocreationApp($store,$config,$owner,$adapter)'));
  assert.ok(fixture.includes('$store->setMemberRoster($members,$memberId,true,$owner)'));
  assert.ok(fixture.includes("'provider'=>'ollama'"));
  assert.ok(fixture.includes('CREATE TEMP TRIGGER fixture_abort_image_receipt BEFORE INSERT ON media_upload_receipts'));
  assert.ok(fixture.includes("SELECT RAISE(ABORT, 'synthetic receipt failure')"));
  assert.ok(fixture.includes("DROP TRIGGER fixture_abort_image_receipt"));
  assert.ok(fixture.includes("imageAnalysisChunk('IDAT',gzcompress("));
  assert.doesNotMatch(fixture,/curl_|https:\/\/api\.openai|new (?:OpenAI|Ollama)Adapter|set_key|setModel|file_get_contents\(/);
});

test('native application fixture covers bounded comparisons, privacy, fixed references and both rollback failures',()=>{
  for(const label of [
    'without image consent rejects before model',
    'grant_image_analysis binds exact fixed project instead of global active member',
    'grant_image_analysis makes zero model calls',
    'for($size=2;$size<=5;$size++)',
    'forwards exact persisted PNG bytes',
    'imageInputSnapshots persisted in provenance.imageInputs',
    'duplicate asset different notes are both compared, not collapsed',
    'cross-owner saved image read rejects','cross-owner image upload rejects',
    'cross-project saved version read rejects','cross-project item upload rejects',
    'cross-item saved version read rejects','cross-item upload rejects',
    'manual snapshot asset swap rejects even another valid same-item image',
    'discussion after source advances still uses old pinned bytes',
    'comparison sends only selected images, not unrelated pinned reference bytes',
    'call count zero and no fake pixel revision',
    'invalid image revision or generated claim is not persisted',
    'failed real Store save rolls back asset plus complete version',
    'failed real receipt INSERT rolls back asset plus complete version',
    'same request after receipt rollback succeeds once on reusable PDO connection'
  ])assert.ok(fixture.includes(label),label);
});

// Bound the descriptor label even when twelve references reuse one saved asset.
test('deduplicated labels fit the adapter bound with twelve distinct pinned version identities',()=>{
 const label='選取版本 '+'a'.repeat(32)+' / V60.59'+Array.from({length:12},(_,i)=>'；亦為 '+i.toString(16).padStart(32,'0')+' / V60.59').join('');
 assert.ok(Buffer.byteLength(label)<=1000);
});
