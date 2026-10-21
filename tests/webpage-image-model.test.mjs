// Source contracts only. These do NOT execute PHP or establish runtime,
// media authorization, real-provider, HTTP, browser or export correctness.
// Native injected-model fixtures: php tests/webpage-image-model.php.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read = file => readFile(new URL('../' + file, import.meta.url), 'utf8');
const method = (source, name) => {
  const start = source.indexOf(`    protected function ${name}(`);
  assert.ok(start >= 0, `missing method ${name}`);
  const next = source.indexOf('\n    protected function ', start + 1);
  return source.slice(start, next < 0 ? source.length : next);
};

test('validated image pool is authoritative; fallback preserves only selected source history and current pins', async () => {
  const source = method(await read('app/modules/webpage.php'), 'referencePool');
  assert.ok(source.includes("if(array_key_exists('compositionReferencePool',$project))$groups[]=$project['compositionReferencePool']"));
  assert.ok(source.includes("else {foreach($sources as $source)$groups[]=field($source,'referencesSnapshot',array());$groups[]=field($project,'references',array());}"));
  for (const token of ['validateImageArtifact(', "field($snapshot,'id')===$ref['versionId']", "field($ref,'projectId')===$project['id']", 'COMPOSITION_REFERENCE_CONFLICT', "count($out)<256", "$images[$identity]===$artifact"]) assert.ok(source.includes(token), token);
  assert.doesNotMatch(source, /creativeItems|referencesSnapshot.*versionSnapshot.*referencesSnapshot|resolveImageAsset|->generate\(|https?:\/\//);
});

test('image model context is allowlisted metadata with no asset or nested attachment forwarding', async () => {
  const full = await read('app/modules/webpage.php');
  const source = method(full, 'modelReferences');
  assert.ok(source.includes("array('id','projectId','targetItemId','targetItemTitle','versionId','pinnedAt')"));
  for (const token of ["'contentType'=>'image'", "'title'=>$artifact['title']", "'alt'=>$artifact['alt']", "'attribution'=>$artifact['attribution']", "'width'=>$artifact['asset']['width']", "'height'=>$artifact['asset']['height']", "'mime'=>$artifact['asset']['mime']", "'pixelsProvided'=>false"]) assert.ok(source.includes(token), token);
  assert.doesNotMatch(source, /'asset'\s*=>|'items'\s*=>|base64|data:image|viaReferences|image_url|transport\s*=>/);
  const context = method(full, 'context');
  assert.ok(context.includes("$safeProject['references']=$this->modelReferences($references)"));
  assert.ok(context.includes("unset($data['versions'])"));
  assert.ok(context.includes("$data['availableImageReferences']=$this->imageMetadata($references)"));
  assert.ok(context.includes("$data['imagePixelsProvided']=false"));
});

test('every image entry is checked against the supplied image-only pool before it may become an artifact', async () => {
  const full = await read('app/modules/webpage.php');
  const validation = method(full, 'artifactWithReferences');
  assert.ok(validation.includes('validateWebpageArtifact($value)'));
  assert.ok(validation.includes('foreach(webpageImageReferenceIds($artifact) as $id)ensure(isset($map[$id])'));
  assert.ok(validation.includes("$source?'COMPOSITION_REFERENCE_MISSING':'MODEL_IMAGE_REFERENCE_INVALID'"));
  assert.ok(validation.includes('$source?409:502'));
  for (const name of ['candidateResult', 'sourceSnapshot', 'runRefine']) assert.ok(method(full, name).includes('$this->artifactWithReferences('), name);
  assert.ok(method(full, 'usedReferences').includes("in_array(field($ref,'id'),$ids,true)"));
  assert.ok(method(full, 'candidateResult').includes("'referencesSnapshot'=>$this->usedReferences($artifact,$references)"));
  assert.ok(method(full, 'runRefine').includes("'referencesSnapshot'=>$this->usedReferences($artifact,$references)"));
});

test('same fixed-image aliases cannot manufacture refine or fusion content changes', async () => {
  const full = await read('app/modules/webpage.php');
  const source = method(full, 'contentFingerprint');
  assert.ok(source.includes("$key=$ref['targetItemId'].':'.$ref['versionId']"));
  assert.ok(source.includes("$section['entries'][0]['id']=$aliases[$ref['targetItemId'].':'.$ref['versionId']]"));
  assert.ok(source.includes('return webpageContentFingerprint($artifact)'));
  const refine = method(full, 'runRefine');
  assert.ok(refine.includes("$contentChanged=$this->contentFingerprint($artifact,$references)!==$this->contentFingerprint($source['artifact'],$references)"));
  assert.ok(refine.includes("ensure($contentChanged||!$artifactChanged,'MODEL_NO_REVISION'"));
  assert.ok(refine.includes('$contentChanged||$goalText!==versionGoalText($source)||$combinedChanged'));
  const fuse = method(full, 'runFuse');
  assert.ok(fuse.includes("$content=$this->contentFingerprint($result['artifact'],$references)"));
  assert.ok(fuse.includes("$content!==$this->contentFingerprint($source['artifact'],$references)"));
});

test('selected source snapshots and per-version goal authority remain isolated from common goal', async () => {
  const full = await read('app/modules/webpage.php');
  const data = method(full, 'selectedData');
  assert.ok(data.includes("'goalBasis'=>'version_snapshots'"));
  assert.ok(data.includes("'creativeGoal'=>null,'goalApprovedAt'=>null"));
  assert.ok(data.includes("'selectedVersions'=>$this->creativeVersions($sources)"));
  assert.ok(data.includes("'pinnedReferences'=>$this->modelReferences($references)"));
  for (const action of ['runFuse', 'runCompare']) {
    const section = method(full, action);
    assert.ok(section.includes('$this->referencePool($project,$versions)'));
    assert.ok(section.includes('$this->selectedData($project,$sources,$question,$references)'));
    assert.ok(section.includes('goalAndRationale'));
    assert.equal((section.match(/\$this->ask\(/g) || []).length, 1);
  }
  const refine = method(full, 'runRefine');
  assert.ok(refine.includes('$this->referencePool($project,array($source))'));
  assert.ok(refine.includes("$data['sourceVersion']=$this->creativeVersions(array($source))[0]"));
  assert.ok(refine.includes("webpageCompactJson($artifact)===webpageCompactJson($source['artifact'])"));
  assert.ok(refine.includes('versionHasCombinedOverride($source)'));
});

test('comparison validates selected full artifacts and rejects duplicate or foreign version rows', async () => {
  const full = await read('app/modules/webpage.php');
  const source = method(full, 'runCompare');
  assert.ok(source.includes("$this->selectedSources($versions,$references,'comparison')"));
  assert.ok(source.includes("$item['properties']['versionId']['enum']=array_column($sources,'id')"));
  assert.ok(source.includes('in_array($id,$expected,true)&&!in_array($id,$seen,true)'));
  assert.ok(source.includes('沒有檢視圖片像素'));
  assert.ok(source.includes('不指定唯一冠軍、不打總分、不修改或融合作品、不更新引用、不採用或定稿'));
  assert.doesNotMatch(source, /appendVersion|->save|->adopt|->execute|\$project\['brief'\]/);
});

test('all structured model output passes bounded commentary guards without scanning literal artifact text', async () => {
  const full = await read('app/modules/webpage.php');
  const ask = method(full, 'ask');
  assert.equal((ask.match(/parent::ask\(/g) || []).length, 1);
  assert.ok(ask.includes('strlen(jsonEncode($value))<=90000'));
  assert.ok(ask.includes('$this->rejectsPixelInspectionClaim($value)'));
  const guard = method(full, 'rejectsPixelInspectionClaim');
  assert.ok(guard.includes("if($key==='artifact'||$key==='direction')continue"));
  assert.ok(guard.includes('$this->unquotedText($part)'));
  for (const text of ['MODEL_PIXEL_CLAIM', '中繼資料', 'generated|created|edited|modified', 'viewed|seen|inspected', '不會自動重試']) assert.ok(guard.includes(text), text);
  assert.doesNotMatch(full, /curl_|file_get_contents|new (?:Responses|Ollama)|image_url|->(?:adopt|execute|save)\(/);
});

test('new image contract retains existing keys, normal native section limits, and truthful capabilities', async () => {
  const full = await read('app/modules/webpage.php');
  const instructions = method(full, 'artifactInstructions');
  for (const text of ['kind=webpage、title、theme、navigation、sections', 'id、type、eyebrow、heading、body、entries、actionLabel、actionTarget', 'hero、text、cards、faq、cta、image', 'image 必須恰好1項', 'entry.title 是非空白替代文字', 'entry.body 是可空圖說', '32個小寫十六進位固定圖片引用 id', '不是 assetId、versionId、URL、路徑或自造 id', 'text、cards、faq、image 兩欄必須為空', '沒有圖片像素', '完整 JSON 最多60000']) assert.ok(instructions.includes(text), text);
  const brief = method(full, 'briefInstructions');
  for (const text of ['tone=視覺風格', 'message=內容結構', 'constraints=操作功能與限制', '不會自動連動', '沒有可用圖片則做純文字網頁', '不另行呼叫圖片模型或外部服務']) assert.ok(brief.includes(text), text);
});

test('native fixtures explicitly disclose unexecuted PHP and cover generate/refine/compare/fuse image safeguards', async () => {
  const fixture = await read('tests/webpage-image-model.php');
  assert.ok(fixture.includes('UNEXECUTED in the authoring environment: PHP is unavailable.'));
  assert.ok(fixture.includes("require_once dirname(__DIR__).'/app/bootstrap.php'"));
  for (const phrase of ['exact model call count', 'allowlisted image metadata', 'legacy text-only webpage', 'validated derived ', 'explicit empty validated pool', 'removed current pin survives', 'missing source image blocks', 'same source version pin alias', 'goal-only revision keeps exact canonical artifact', 'combined goal override remains authoritative', 'clarification exact source echo', 'fusion rejects copied content or aliases', 'compare keeps selected full snapshots own goals', 'invalid image reference blocks before model', 'all input projects and source snapshots remain immutable']) assert.ok(fixture.includes(phrase), phrase);
  for (const mode of ['unknown_pin', 'asset_as_pin', 'url_as_pin', 'empty_alt', 'image_action', 'extra_entry', 'pixel_claim_en', 'generated_claim_en', 'metadata_claim', 'alias_conflict', 'caption_only', 'alt_only']) assert.ok(fixture.includes(mode), mode);
  assert.doesNotMatch(fixture, /curl_|new PDO|new ResponsesClient|file_put_contents|https:\/\/api\./);
});
