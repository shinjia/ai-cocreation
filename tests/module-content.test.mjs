// Executed source-contract checks only. Native behavior is covered separately in
// phase1.php when PHP 7.4+ is available; this suite is not runtime validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read = file => readFile(new URL('../' + file, import.meta.url), 'utf8');
const method = (source, name, next) => source.split(`protected function ${name}(`)[1].split(`protected function ${next}(`)[0];

test('registry exposes exact twelve established module ids but enables only supported text and structured artifact formats', async () => {
  const source = await read('app/modules.php');
  const rows = [...source.matchAll(/array\('id'=>'([^']+)','label'=>'([^']+)','enabled'=>(true|false)\)/g)];
  assert.deepEqual(rows.map(x => x[1]), ['titles','short_text','article','illustrated','table','chart','mindmap','vector','image','poster','webpage','interactive']);
  assert.deepEqual(rows.map(x => x[2]), ['標題名稱','短文','長篇文章','圖文','表格','圖表','心智圖','向量圖形','圖片創作','海報設計','網頁','互動視覺程式']);
  assert.deepEqual(rows.filter(x => x[3] === 'true').map(x => x[1]), ['titles','short_text','article','illustrated','table','chart','mindmap','vector','image','poster','webpage','interactive']);
  assert.match(source, /throw new AppError\('MODULE_UNAVAILABLE'/);
  assert.match(source, /new TextModule\(\$model,\$id\)/);
});

test('format validators bound full snapshots and never trim stored text body bytes', async () => {
  const source = await read('app/content.php');
  assert.match(source, /'short_text'\)return array\('min'=>1,'max'=>1,'each'=>12000,'total'=>12000\)/);
  assert.match(source, /'article'\)return array\('min'=>1,'max'=>80,'each'=>6000,'total'=>120000\)/);
  assert.match(source, /if\(\$type==='titles'\)return validateContentItems\(\$items,\$definitions\)/);
  assert.match(source, /\$id==='body'&&\$label==='全文'/);
  assert.match(source, /array_keys\(\$items\)===range\(0,count\(\$items\)-1\)/);
  assert.match(source, /\$content=field\(\$item,'content'\);userTextValue\(\$content/);
  assert.match(source, /strlen\(\$content\)<=\$limits\['each'\]/);
  assert.match(source, /'content'=>\$content/);
  assert.doesNotMatch(source, /\$content=(?:trim|userTextValue)\(/);
  assert.match(source, /count\(\$defs\)===count\(\$definitions\)/);
  assert.match(source, /\$map\[\$def\['id'\]\]\['label'\]===\$def\['label'\]/);
});

test('one initial discussion call returns either a strict ready direction or an exploratory conversation', async () => {
  const source = await read('app/modules/titles.php');
  const discuss = method(source,'runDiscuss','unquotedText');
  assert.equal((discuss.match(/\$this->ask\(/g) || []).length, 1);
  assert.match(discuss, /'enum'=>array\('exploring','ready'\)/);
  assert.match(discuss, /\$props\['direction'\]=\$this->briefSchema\(true\)/);
  assert.match(discuss, /count\(\$v\)===5/);
  assert.match(discuss, /ensure\(\$question===''&&\$choices===array\(\)/);
  assert.match(discuss, /\$direction=\$this->stableBrief\(\$v\['direction'\],\$project\)/);
  assert.match(discuss, /trim\(\$direction\['summary'\]\)/);
  assert.match(discuss, /\$direction=null/);
  assert.match(discuss, /不按固定對談輪數/);
  assert.doesNotMatch(discuss, /->(?:generate|summarize)\(|goalApprovedAt.*=/);
  assert.match(source, /AI共創工作室/);
});

test('raw strict response validation precedes associative conversion for both modules', async () => {
  const [titles,text] = await Promise.all(['app/modules/titles.php','app/modules/text.php'].map(read));
  const ask = method(titles,'ask','briefSchema');
  assert.ok(ask.indexOf('validateSchemaValue($value,$schema)') < ask.indexOf('return json_decode'));
  assert.match(titles, /'required'=>array_keys\(\$properties\),'additionalProperties'=>false/);
  assert.match(ask, /\$this->moduleType\(\)==='titles'\?240000:600000/);
  assert.match(ask, /\$schema,\$maxOutputTokens/);
  assert.match(text, /class TextModule extends TitleModule/);
  assert.doesNotMatch(text, /function (?:ask|validateSchemaValue)\(/);
});

test('article targeted refinement preflights bounds then merges complete selected-source snapshot', async () => {
  const source = await read('app/modules/text.php');
  const selected = method(source,'selectedDefinitions','runRefine');
  const refine = method(source,'runRefine','fusionOutputBudget');
  for (const code of ['TARGET_ITEMS_REQUIRED','TARGET_ITEMS_INVALID','REFINEMENT_RANGE_TOO_LARGE']) assert.ok(selected.includes(code));
  assert.match(selected, /\$bytes<=24000/);
  assert.match(selected, /!in_array\(\$id,\$seen,true\)/);
  assert.ok(refine.indexOf('selectedDefinitions(') < refine.indexOf('$this->ask('));
  assert.match(refine, /\$data\['sourceVersion'\]=\$this->creativeVersions\(array\(\$source\)\)\[0\]/);
  assert.doesNotMatch(refine, /\$data\['officialVersion'\]/);
  assert.match(refine, /\$item\['properties'\]\['id'\]\['enum'\]=\$data\['targetItemIds'\]/);
  assert.match(refine, /validateModuleContentItems\(\$v\['items'\],\$this->type,\$definitions\)/);
  assert.match(refine, /foreach\(\$source\['items'\] as \$prior\)\$merged\[\]=isset\(\$map\[\$prior\['id'\]\]\)\?\$map\[\$prior\['id'\]\]:\$prior/);
  assert.match(refine, /validateModuleContentItems\(\$merged,\$this->type\)/);
  assert.match(refine, /'items'=>\$merged/);
  assert.match(refine, /MODEL_CLARIFICATION_CLAIM|rejectsCompletedEditClaim/);
  assert.match(refine, /MODEL_NO_REVISION/);
});

test('short and article generation advertise actual candidate counts with bounded complete outputs', async () => {
  const source = await read('app/modules/text.php');
  const generation = method(source,'runGenerate','selectedDefinitions');
  assert.match(generation, /\$count=\$this->type==='short_text'\?3:1/);
  assert.match(generation, /'minItems'=>\$count,'maxItems'=>\$count/);
  assert.match(generation, /validateModuleContentItems\(\$candidate\['items'\],\$this->type,\$definitions\)/);
  assert.match(generation, /\$bytes<=36000/);
  assert.match(generation, /\$this->schema\(\$props\),24000/);
  assert.match(generation, /不是片段|不只回傳大綱/);
  assert.match(source, /unset\(\$data\['versions'\]\)/);
});

test('fusion is one new complete candidate based only on selected version goals', async () => {
  const source = await read('app/modules/titles.php');
  const definitions = method(source,'fusionDefinitions','fusionOutputBudget');
  const fusion = method(source,'runFuse','runCompare');
  assert.match(definitions, /count\(\$versions\)>=2&&count\(\$versions\)<=5/);
  assert.match(definitions, /FUSION_ITEMS_CONFLICT/);
  assert.equal((fusion.match(/\$this->ask\(/g) || []).length, 1);
  assert.match(fusion, /'goalBasis'=>'version_snapshots','creativeGoal'=>null/);
  assert.match(fusion, /'selectedVersions'=>\$this->creativeVersions\(\$versions\)/);
  assert.match(fusion, /goalAndRationale/);
  assert.match(fusion, /不可用目前專案共用目標/);
  assert.match(fusion, /validateModuleContentItems\(\$v\['items'\],\$this->moduleType\(\),\$definitions\)/);
  assert.match(fusion, /MODEL_NO_REVISION/);
  assert.doesNotMatch(fusion, /->(?:save|generate|compare)\(|\$project\['officialVersionId'\]=/);
});

test('strict shared numeric schema handles finite native numbers only, integral values and explicit bounds',async()=>{
 const source=await read('app/modules/titles.php');const validate=method(source,'validateSchemaValue','ask');
 assert.match(validate,/\$type==='number'\|\|\$type==='integer'/);assert.match(validate,/is_int\(\$value\)\|\|is_float\(\$value\)/);assert.match(validate,/is_finite\(\(float\)\$value\)/);assert.match(validate,/floor\(\$value\)===\$value\|\|is_int\(\$value\)/);
 assert.match(validate,/\$value>=\$schema\['minimum'\]/);assert.match(validate,/\$value<=\$schema\['maximum'\]/);assert.doesNotMatch(validate,/is_numeric\(|floatval\(|intval\(/);
 const fixture=await read('tests/response-contract.php');assert.match(fixture,/NumericSchemaFixture/);assert.match(fixture,/NAN,INF,-INF/);
});

test('webpage three-part approval validates current summary before inference and leaves legacy modules unchanged',async()=>{
 const validation=await read('app/validation.php'),app=await read('app/app.php'),client=await read('public/app.js');
 assert.match(validation,/function webpageDirectionConfirmation/);assert.match(validation,/\$expected=\$poster\?array\('style','text','layout'\):array\('style','content','functions'\)/);assert.match(validation,/is_int\(\$summaryRevision\)&&\$summaryRevision===field\(\$project,'summaryRevision'\)/);
 const generation=app.slice(app.indexOf("if($action==='generate'||$action==='confirm_generate')"),app.indexOf("if($action==='snapshot')"));assert.ok(generation.indexOf('webpageDirectionConfirmation($p,$input)')<generation.indexOf('$module->generate'));assert.match(generation,/'directionConfirmation'=>\$directionConfirmation/);
 assert.match(client,/project.summaryRevision!==directionRevision \|\| project.activeItemId!==directionItemId/);assert.match(client,/type==='webpage'\?'網頁由可編輯的內容區塊組成/);
 const php=await read('tests/response-contract.php');assert.match(php,/strict native boolean accepted/);assert.match(php,/three direction confirmations pin exact current summary content/);
});
