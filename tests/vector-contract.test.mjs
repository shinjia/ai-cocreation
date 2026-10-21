// Executed source-contract checks only. These DO NOT run or validate PHP.
// Native fixtures: php tests/vector.php (PHP 7.4+ and vector integration).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read = file => readFile(new URL('../' + file, import.meta.url), 'utf8');
const body = (source, name, next) => source.slice(source.indexOf(name), next ? source.indexOf(next, source.indexOf(name) + name.length) : undefined);

test('vector helper accepts only exact native primitive objects and bounded lists', async () => {
  const source=await read('app/vector.php');
  for(const name of ['vectorNumber','vectorPaint','validateVectorArtifact','vectorCompactJson','vectorDrawingFingerprint','vectorSchema','vectorItems'])assert.match(source,new RegExp(`function ${name}\\(`));
  assert.ok(source.includes("array('kind','title','width','height','background','shapes')"));
  assert.ok(source.includes("array('id','type','label','x','y','width','height','fill','stroke','strokeWidth','opacity','text','fontSize','points')"));
  assert.ok(source.includes("array('rect','ellipse','line','polygon','polyline','text')"));
  assert.ok(source.includes("artifactObject($point,array('x','y')"));
  assert.match(source,/artifactList\(\$value\['shapes'\],1,100/);
  assert.ok(source.includes("$minimum=$type==='polygon'?3:($type==='polyline'?2:0)"));
  assert.ok(source.includes('$maximum=$minimum===0?0:80'));
  assert.ok(source.includes('!in_array($id,$ids,true)'));
  assert.doesNotMatch(source,/\b(?:eval|exec|shell_exec|unserialize)\s*\(|curl_|file_get_contents/);
});

test('finite numeric, precision, paint and type-dependent geometry boundaries remain explicit', async () => {
  const source=await read('app/vector.php');
  assert.ok(source.includes('(is_int($value)||is_float($value))&&is_finite((float)$value)'));
  assert.ok(source.includes('floor((float)$value)==(float)$value'));
  assert.ok(source.includes('round($value,3)==$value'));
  assert.ok(source.includes('if($value==0)return 0'));
  assert.ok(source.includes("vectorNumber($value['width'],1,4096,'畫布寬度',true)"));
  assert.ok(source.includes("vectorNumber($shape['x'],-4096,8192"));
  assert.ok(source.includes("vectorNumber($shape['width'],-8192,8192"));
  assert.ok(source.includes("vectorNumber($shape['strokeWidth'],0,100"));
  assert.ok(source.includes("vectorNumber($shape['opacity'],0,1"));
  assert.ok(source.includes("$type==='text'?1:0,$type==='text'?512:0"));
  assert.ok(source.includes('$shapeWidth>0&&$shapeHeight>0'));
  assert.ok(source.includes("elseif($type!=='line')ensure($shapeWidth===0&&$shapeHeight===0"));
  assert.ok(source.includes("$type==='text'||$text===''"));
  assert.ok(source.includes("$value==='none'||preg_match('/^#[0-9a-fA-F]{6}$/D',$value)"));
  assert.ok(source.includes("artifactText($shape['text'],4000,'向量文字',$type!=='text')"));
});

test('UTF8 and secret checks are shared while canonical text and complete byte limits are retained', async () => {
  const source=await read('app/vector.php');
  assert.match(source,/artifactText\(\$value\['title'\],600/);
  assert.match(source,/artifactText\(\$shape\['label'\],120/);
  assert.match(source,/artifactStableId\(\$shape\['id'\]/);
  assert.match(source,/strlen\(jsonEncode\(\$out\)\)<=60000/);
  assert.match(source,/strlen\(vectorCompactJson\(\$out\)\)<=60000/);
  const serializer=body(source,'function vectorCompactJson(', 'function vectorDrawingFingerprint(');
  assert.ok(serializer.includes("number_format($value,3,'.','')"));
  assert.ok(serializer.includes('if(is_string($value))return jsonEncode($value)'));
  assert.ok(serializer.includes("if($value==0)return '0'"));
  assert.ok(serializer.includes('serialize_precision'));
  assert.doesNotMatch(serializer,/sort\(|ksort\(|array_slice|substr/);
  const projection=body(source,'function vectorItems(');
  assert.ok(projection.includes('validateVectorArtifact($value)'));
  assert.ok(projection.includes('$content=vectorCompactJson($artifact)'));
  assert.ok(projection.includes("array('id'=>'document','label'=>'向量圖形來源','content'=>$content)"));
  assert.match(projection,/strlen\(\$content\)<=60000/);
});

test('provider schema has complete required keys, strict number types and bounded arrays', async () => {
  const source=body(await read('app/vector.php'),'function vectorSchema(', 'function vectorItems(');
  assert.ok(source.includes("array('type'=>'integer','minimum'=>1,'maximum'=>4096)"));
  assert.ok(source.includes("array('type'=>'number','minimum'=>-4096,'maximum'=>8192)"));
  assert.ok(source.includes("array('type'=>'number','minimum'=>-8192,'maximum'=>8192)"));
  assert.ok(source.includes("'minItems'=>0,'maxItems'=>80"));
  assert.ok(source.includes("'minItems'=>1,'maxItems'=>100"));
  assert.equal((source.match(/artifactSchemaObject\(/g)||[]).length,3);
  assert.doesNotMatch(source,/anyOf|oneOf|additionalProperties.*true/);
});

test('vector module inherits shared fixed-model lifecycle and states honest capability limits', async () => {
  const source=await read('app/modules/vector.php');
  assert.match(source,/class VectorModule extends TitleModule/);
  assert.doesNotMatch(source,/function (?:ask|validateSchemaValue|runDiscuss|runSummarize|runCompare)\(/);
  assert.ok(source.includes('{"id":"document","label":"向量圖形來源"}'));
  assert.ok(source.includes("unset($data['versions'])"));
  for(const phrase of ['不能生成照片','文字／結構化模型','不會另行呼叫圖片模型','最多三位小數','不下載任何字型','形坊','尚未驗證','貝茲曲線','穩定 id'])assert.ok(source.includes(phrase),phrase);
  assert.doesNotMatch(source,/curl_|https?:\/\/|file_get_contents|new (?:Responses|Ollama)|appendVersion|->(?:adopt|save|execute)\(/);
});

test('generation produces exactly one complete native candidate in a single bounded call', async () => {
  const source=body(await read('app/modules/vector.php'),'protected function runGenerate(', 'protected function sourceSnapshot(');
  assert.equal((source.match(/\$this->ask\(/g)||[]).length,1);
  assert.ok(source.includes("validateModuleItemDefinitions($project['brief']['items'],'vector')"));
  assert.ok(source.includes("'minItems'=>1,'maxItems'=>1"));
  assert.ok(source.includes('$this->schema($props),24000'));
  assert.ok(source.includes("$this->candidateResult($v['candidates'][0],'候選')"));
  assert.ok(source.includes('不採用、不定稿、不改正式版'));
});

test('refinement uses full selected source, own goal and immutable candidate semantics', async () => {
  const source=body(await read('app/modules/vector.php'),'protected function runRefine(', 'protected function runFuse(');
  assert.equal((source.match(/\$this->ask\(/g)||[]).length,1);
  assert.ok(source.indexOf('TARGET_ITEMS_INVALID')<source.indexOf('$this->ask('));
  assert.ok(source.includes("$data['sourceVersion']=$this->creativeVersions(array($source))[0]"));
  assert.ok(source.includes("$data['latestUserMessage']=$text"));
  assert.ok(source.includes('sourceVersion.goalAndRationale'));
  assert.ok(source.includes('versionHasCombinedOverride($source)'));
  assert.ok(source.includes("$artifactChanged=vectorCompactJson($artifact)!==vectorCompactJson($source['artifact'])"));
  assert.ok(source.includes('$artifactChanged||$goalText!==versionGoalText($source)||$combinedChanged'));
  assert.ok(source.includes("'items'=>vectorItems($artifact)"));
  assert.ok(source.includes("'reply'=>$revisionReply"));
  assert.ok(source.includes('尚未採用、定稿或取代正式版'));
});

test('clarification requires exact canonical echo and discards artifact plus unused metadata', async () => {
  const source=body(await read('app/modules/vector.php'),"if($v['outcome']==='clarification'){", "ensure($question===''&&$choices===array()");
  assert.ok(source.includes("vectorCompactJson($artifact)===vectorCompactJson($source['artifact'])"));
  assert.ok(source.includes('MODEL_CLARIFICATION_ARTIFACT'));
  assert.ok(source.includes('rejectsCompletedEditClaim'));
  assert.ok(source.includes("'items'=>array(),'rationale'=>''"));
  assert.doesNotMatch(source,/'artifact'=>|'goalText'=>|'changeSummary'=>|appendVersion/);
});

test('fusion only considers explicitly selected snapshots with own goals and rejects copied output', async () => {
  const source=body(await read('app/modules/vector.php'),'protected function runFuse(');
  assert.equal((source.match(/\$this->ask\(/g)||[]).length,1);
  assert.ok(source.includes('count($versions)>=2&&count($versions)<=5'));
  assert.ok(source.includes('!in_array($id,$ids,true)'));
  assert.ok(source.includes("'creativeGoal'=>null,'goalApprovedAt'=>null"));
  assert.ok(source.includes("'selectedVersions'=>$this->creativeVersions($sources)"));
  assert.ok(source.includes("$drawing=vectorDrawingFingerprint($result['artifact'])"));
  assert.ok(source.includes("$drawing!==vectorDrawingFingerprint($source['artifact'])"));
  assert.ok(source.includes('$this->schema($this->candidateProperties()),24000'));
  assert.ok(source.includes('MODEL_NO_REVISION'));
  assert.doesNotMatch(source,/\$project\['brief'\]/);
});

test('fusion fingerprint preserves ordered geometry and multiplicity but excludes only naming metadata', async () => {
  const source=body(await read('app/vector.php'),'function vectorDrawingFingerprint(', 'function vectorSchema(');
  assert.ok(source.includes('validateVectorArtifact($value)'));
  assert.ok(source.includes("unset($shape['id'],$shape['label'])"));
  assert.ok(source.includes("'width'=>$artifact['width'],'height'=>$artifact['height'],'background'=>strtolower($artifact['background']),'shapes'=>$shapes"));
  assert.doesNotMatch(source,/sort\(|ksort\(|unique\(|array_filter|\['title'\]/);
});

test('fusion fingerprint normalizes hexadecimal paint case without altering native source', async () => {
  const source=await read('app/vector.php');
  const fingerprint=body(source,'function vectorDrawingFingerprint(', 'function vectorSchema(');
  for(const paint of ['fill','stroke'])assert.ok(fingerprint.includes(`$shape['${paint}']=strtolower($shape['${paint}'])`));
  assert.ok(fingerprint.includes("strtolower($artifact['background'])"));
  assert.doesNotMatch(body(source,'function vectorPaint(', 'function vectorCompactJson('),/strtolower/);
  assert.doesNotMatch(body(source,'function vectorItems('),/strtolower/);
  const fixtures=await read('tests/vector.php');
  for(const phrase of ['semantically identical hex color case','never changes saved native source or projection','fusion rejects paint-case-only drawing copy'])assert.ok(fixtures.includes(phrase));
});

test('native fixtures explicitly remain unexecuted and cover boundary plus lifecycle invariants', async () => {
  const source=await read('tests/vector.php');
  assert.ok(source.includes('UNEXECUTED in the authoring environment: PHP is unavailable'));
  assert.ok(source.includes("require_once dirname(__DIR__).'/app/bootstrap.php'"));
  for(const phrase of ['six native primitive types','canonical root and shape key order','lone surrogate UTF8','shared secret guard','overprecision','60000-byte canonical JSON boundary','60001-byte full artifact','exact projection parity fixture','serialize_precision setting','raw JSON rejects','generate one full candidate','unchanged objects','authoritative combined goal override','clarification source echo discarded','fusion rejects exact source copy','exact model call count'])assert.ok(source.includes(phrase),phrase);
  assert.doesNotMatch(source,/curl_|new PDO|new ResponsesClient/);
});
