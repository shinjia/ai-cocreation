// Executed source-contract checks, NOT PHP runtime validation. Run native
// fixtures separately with PHP 7.4+: php tests/artifacts.php.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read = file => readFile(new URL('../' + file, import.meta.url), 'utf8');
const section = (source, start, next) => source.split(start)[1].split(next)[0];

test('native validator has two exact bounded artifact shapes, never text substitutes', async () => {
  const source = await read('app/artifacts.php');
  assert.match(source, /function artifactType\(\$type\) \{ return \$type==='table'\|\|\$type==='chart'\|\|\$type==='mindmap'\|\|\$type==='vector'\|\|\$type==='webpage'; \}/);
  assert.match(source, /artifactObject\(\$value,array\('kind','caption','columns','rows'\)/);
  assert.match(source, /artifactObject\(\$value,array\('kind','chartType','title','xLabel','yLabel','sourceText'\)/);
  assert.match(source, /\$actual===\$expected/);
  assert.match(source, /artifactList\(\$value\['columns'\],1,12/);
  assert.match(source, /artifactList\(\$value\['rows'\],1,100/);
  assert.match(source, /artifactList\(\$row\['cells'\],count\(\$columns\),count\(\$columns\)/);
  assert.match(source, /artifactText\(\$cell,2000/);
  assert.match(source, /strlen\(jsonEncode\(\$out\)\)<=60000/);
  assert.match(source, /array_keys\(\$value\)===range\(0,count\(\$value\)-1\)/);
});

test('table text and stable identities are preserved with byte, UTF8 and existing-secret guards', async () => {
  const source = await read('app/artifacts.php');
  const text = section(source, 'function artifactText(', 'function artifactStableId(');
  assert.match(text, /preg_match\('\/\/u',\$value\)/);
  assert.match(text, /strpos\(\$value,"\\0"\)===false/);
  assert.match(text, /strlen\(\$value\)<=\$maximum/);
  assert.match(text, /userTextValue\(\$value,\$maximum,\$name,\$empty\)/);
  assert.match(text, /return \$value;/);
  assert.doesNotMatch(text, /\$value=(?:trim|userTextValue|artifactTrim)\(/);
  assert.match(source, /\[a-zA-Z0-9\]\[a-zA-Z0-9_-\]\{0,63\}/);
  assert.match(source, /!in_array\(\$id,\$columnIds,true\)/);
  assert.match(source, /!in_array\(\$id,\$rowIds,true\)/);
  assert.match(source, /function artifactTrim\(/);
  assert.match(source, /\\x\{FEFF\}/);
  assert.doesNotMatch(source, /\beval\s*\(|\bexec\s*\(|\bshell_exec\s*\(|\bunserialize\s*\(/);
});

test('chart parser has real TSV numeric data, consistent rows and bounded dimensions', async () => {
  const source = await read('app/artifacts.php');
  const parser = section(source, 'function parseChartSource(', 'function validateArtifact(');
  assert.match(parser, /count\(\$lines\)>=2&&count\(\$lines\)<=25/);
  assert.match(parser, /count\(\$header\)>=2&&count\(\$header\)<=6/);
  assert.match(parser, /count\(\$cells\)===count\(\$header\)/);
  assert.match(parser, /\$names\[\]=artifactTrim\(\$cell\)/);
  assert.match(parser, /\$label=artifactTrim\(\$rawLabel\)/);
  assert.match(parser, /!in_array\(\$name,\$seenNames,true\)/);
  assert.match(parser, /!in_array\(\$label,\$labels,true\)/);
  assert.match(parser, /'id'=>'series_'\.\(\$index\+1\)/);
  assert.match(parser, /\$series\[\$index\]\['values'\]\[\]=\$number/);
  assert.match(parser, /return array\('labels'=>\$labels,'series'=>\$series,'categoryLabel'=>\$categoryLabel\)/);
});

test('numeric grammar and decimal magnitude reject executable data, exponent and rounded-bound bypass', async () => {
  const source = await read('app/artifacts.php');
  assert.ok(source.includes("preg_match('/^[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)$/D',$cell)"));
  assert.match(source, /\$decimal=explode\('\.',ltrim\(\$cell,'\+-'\),2\)/);
  assert.match(source, /strcmp\(\$integer,'1000000000000'\)<=0/);
  assert.match(source, /trim\(\$fraction,'0'\)===''/);
  assert.match(source, /\$within&&is_finite\(\$number\)&&abs\(\$number\)<=1000000000000/);
  assert.match(source, /\$chartType!=='pie'\|\|count\(\$series\)===1/);
  assert.match(source, /\$cell\[0\]==='-'&&preg_match\('\/\[1-9\]\/',\$cell\)/);
  assert.match(source, /\$chartType!=='pie'\|\|\$sum>0/);
});

test('source normalizes only CRLF while retaining conventional final newline and source formatting', async () => {
  const source = await read('app/artifacts.php');
  assert.match(source, /artifactText\(\$sourceText,12000/);
  assert.match(source, /str_replace\("\\r\\n","\\n",\$sourceText\)/);
  assert.match(source, /strpos\(\$sourceText,"\\r"\)===false/);
  assert.match(source, /substr\(\$sourceText,-1\)==="\\n"\?substr\(\$sourceText,0,-1\):\$sourceText/);
  assert.match(source, /'sourceText'=>\$sourceText/);
  assert.doesNotMatch(source, /\$sourceText=(?:trim|rtrim|userTextValue)\(/);
});

test('legacy projection is always server derived from full validated artifacts', async () => {
  const source = await read('app/artifacts.php');
  const projection = section(source, 'function artifactItems(', 'function artifactSchemaObject(');
  assert.match(projection, /\$artifact=validateArtifact\(\$artifact,\$type\)/);
  assert.match(projection, /array_map\('artifactTsvField',array_column\(\$artifact\['columns'\],'label'\)\)/);
  assert.match(projection, /foreach\(\$artifact\['rows'\] as \$row\)/);
  assert.match(projection, /'圖表類型：'\.\$artifact\['chartType'\]/);
  assert.match(projection, /'橫軸：'\.\$artifact\['xLabel'\]/);
  assert.match(projection, /'縱軸：'\.\$artifact\['yLabel'\]/);
  assert.match(projection, /strlen\(\$content\)<=60000/);
  assert.match(projection, /'id'=>'document','label'=>\$label,'content'=>\$content/);
});

test('provider native schemas forbid extra properties and use strict nested string-array objects', async () => {
  const source = await read('app/artifacts.php');
  const schema = source.split('function artifactSchemaObject(')[1];
  assert.match(schema, /'required'=>array_keys\(\$properties\),'additionalProperties'=>false/);
  assert.match(schema, /'enum'=>array\('table'\)/);
  assert.match(schema, /'enum'=>array\('chart'\)/);
  assert.match(schema, /'enum'=>array\('flowchart','bar','line','pie'\)/);
  assert.match(schema, /'columns'=>array\('type'=>'array','minItems'=>1,'maxItems'=>12/);
  assert.match(schema, /'rows'=>array\('type'=>'array','minItems'=>1,'maxItems'=>100/);
  assert.match(schema, /'cells'=>array\('type'=>'array','minItems'=>1,'maxItems'=>12,'items'=>\$text\)/);
});

test('artifact module reuses strict fixed-model path and seven-field ready/exploring brief', async () => {
  const source = await read('app/modules/artifacts.php');
  assert.match(source, /class ArtifactModule extends TitleModule/);
  assert.doesNotMatch(source, /function (?:ask|validateSchemaValue|runDiscuss|runSummarize|runCompare)\(/);
  assert.match(source, /unset\(\$data\['versions'\]\)/);
  assert.match(source, /\$data\['contentType'\]=\$this->type/);
  assert.match(source, /\{"id":"document","label":"表格內容"\}/);
  assert.match(source, /\{"id":"document","label":"圖表來源"\}/);
  assert.match(source, /缺少必要數據時維持 exploring/);
  assert.match(source, /不宣稱已連接、驗證或自動匯入圖坊/);
  assert.match(source, /不得捏造數據、事實、引文或來源/);
  assert.doesNotMatch(source, /curl_|https?:\/\/|file_get_contents|new (?:Responses|Ollama)/);
});

test('generation produces exactly one complete artifact with metadata in one bounded call', async () => {
  const source = await read('app/modules/artifacts.php');
  const generation = section(source, 'protected function runGenerate(', 'protected function sourceSnapshot(');
  assert.equal((generation.match(/\$this->ask\(/g)||[]).length,1);
  assert.match(generation, /'minItems'=>1,'maxItems'=>1/);
  assert.match(generation, /\$this->schema\(\$props\),24000/);
  assert.match(generation, /return array\(\$this->candidateResult\(\$v\['candidates'\]\[0\]/);
  const result = section(source, 'protected function candidateResult(', 'protected function runGenerate(');
  assert.match(result, /validateArtifact\(\$candidate\['artifact'\],\$this->type\)/);
  assert.match(result, /'artifact'=>\$artifact,'items'=>artifactItems\(\$artifact\)/);
  for(const name of ['rationale','goalText','changeSummary'])assert.ok(result.includes(name));
});

test('refinement uses candidate source, forbids paragraph ranges, and rejects fake changes', async () => {
  const source = await read('app/modules/artifacts.php');
  const refine = section(source, 'protected function runRefine(', 'protected function runFuse(');
  assert.equal((refine.match(/\$this->ask\(/g)||[]).length,1);
  assert.ok(refine.indexOf('TARGET_ITEMS_INVALID')<refine.indexOf('$this->ask('));
  assert.match(refine, /\$data\['sourceVersion'\]=\$this->creativeVersions\(array\(\$source\)\)\[0\]/);
  assert.doesNotMatch(refine, /\$data\['officialVersion'\]/);
  assert.match(refine, /\$this->schema\(\$props\),24000/);
  assert.match(refine, /jsonEncode\(\$artifact\)!==jsonEncode\(\$source\['artifact'\]\)\|\|\$goalText!==versionGoalText\(\$source\)\|\|\$combinedChanged/);
  assert.match(refine, /'MODEL_NO_REVISION'/);
  assert.match(refine, /sourceVersion\.goalAndRationale/);
  assert.match(refine, /'artifact'=>\$artifact,'items'=>artifactItems\(\$artifact\)/);
});

test('strict clarification echoes exact source then discards it with bounded unused metadata', async () => {
  const source = await read('app/modules/artifacts.php');
  const refine = section(source, 'protected function runRefine(', 'protected function runFuse(');
  const clarification = section(refine, "if($v['outcome']==='clarification'){", "ensure($question===''&&$choices===array()");
  assert.match(clarification, /jsonEncode\(\$artifact\)===jsonEncode\(\$source\['artifact'\]\)/);
  assert.match(clarification, /'MODEL_CLARIFICATION_ARTIFACT'/);
  assert.match(refine, /userTextValue\(\$v\['goalText'\],6000,'本版目標',true\)/);
  assert.match(clarification, /bounded above, then discarded/);
  assert.doesNotMatch(clarification, /ensure\(\$rationale===''/);
  assert.match(clarification, /rejectsCompletedEditClaim/);
  assert.match(clarification, /'items'=>array\(\)/);
  assert.doesNotMatch(clarification, /'artifact'=>|appendVersion|officialVersionId.*=/);
});

test('fusion receives only explicit 2–5 source artifacts and their goals, not shared creative goal', async () => {
  const source = await read('app/modules/artifacts.php');
  const fusion = source.split('protected function runFuse(')[1];
  assert.equal((fusion.match(/\$this->ask\(/g)||[]).length,1);
  assert.match(fusion, /count\(\$versions\)>=2&&count\(\$versions\)<=5/);
  assert.match(fusion, /!in_array\(\$id,\$ids,true\)/);
  assert.match(fusion, /\$sources\[\]=\$this->sourceSnapshot\(\$version\)/);
  assert.match(fusion, /'creativeGoal'=>null,'goalApprovedAt'=>null/);
  assert.match(fusion, /'selectedVersions'=>\$this->creativeVersions\(\$sources\)/);
  assert.match(fusion, /\$this->schema\(\$this->candidateProperties\(\)\),24000/);
  assert.match(fusion, /jsonEncode\(\$result\['artifact'\]\)!==jsonEncode\(\$source\['artifact'\]\)/);
  assert.match(fusion, /'MODEL_NO_REVISION'/);
  assert.doesNotMatch(fusion, /\$project\['brief'\]/);
});

test('native fixtures explicitly distinguish preparation from executed runtime coverage', async () => {
  const native=await read('tests/artifacts.php');
  assert.match(native, /UNEXECUTED in the authoring environment/);
  assert.match(native, /PHP is unavailable/);
  assert.match(native, /require_once dirname\(__DIR__\)\.'\/app\/bootstrap.php'/);
  assert.match(native, /new ArtifactModule\(\$adapter,\$type\)/);
  for(const label of ['60000-byte boundary','60001 bytes','tiny negative','exact model call count','clarification echo discarded','raw JSON object/array distinction'])assert.ok(native.includes(label),label);
  assert.doesNotMatch(native, /curl_|new PDO|new ResponsesClient/);
});

test('flowchart parser enforces declared bounded graphs, reserved ids and strict safe labels', async () => {
  const source=await read('app/artifacts.php');
  const parser=section(source,'function parseFlowchartSource(','function parseChartSource(');
  assert.match(parser,/strpos\(\$sourceText,'%%\{'\)===false/);
  assert.ok(parser.indexOf('特殊換行或雙向控制字元') < parser.indexOf("strpos($sourceText,'%%{')"));
  for(const escaped of ['\\x{2028}','\\x{2029}','\\x{061C}','\\x{2066}'])assert.ok(parser.includes(escaped));
  assert.match(parser,/\$header\[1\]==='TB'\?'TD':\$header\[1\]/);
  assert.match(parser,/count\(\$nodes\)<40/);
  assert.match(parser,/count\(\$edges\)<80/);
  assert.match(parser,/!in_array\(\$id,\$ids,true\)/);
  assert.match(parser,/!in_array\(\$key,\$edgeKeys,true\)/);
  assert.match(parser,/in_array\(\$edge\['from'\],\$ids,true\)&&in_array\(\$edge\['to'\],\$ids,true\)/);
  assert.match(parser,/'\['=>'rect','\{'=>'diamond','\('=>'round'/);
  assert.match(parser,/return array\('direction'=>\$direction,'nodes'=>\$nodes,'edges'=>\$edges\)/);
  const labels=section(source,'function flowchartLabel(','function parseFlowchartSource(');
  assert.match(labels,/\$quoted=strlen\(\$value\)>=2/);
  assert.match(labels,/\$edge\?120:240/);
  assert.ok(labels.includes("ensure($quoted||!preg_match('/[\\[\\]{}();]/u',$value)"));
  assert.match(labels,/mailto:\|javascript:\|data:\|www/);
  assert.match(source,/'end','subgraph','click','style','classdef','class','direction','linkstyle','flowchart','graph'/);
  assert.match(source,/if\(\$chartType==='flowchart'\)return parseFlowchartSource\(\$sourceText\)/);
});

test('flowchart source-export grammar rejects hidden statements and unsupported nested shapes', async () => {
  const native=await read('tests/artifacts.php');
  for(const value of ['unquoted source injection','A[foo]; click A call evil(); X[bar]','nested rect shape','A[[foo]]','nested round shape','A((foo))','edge unquoted semicolon','forward references','40 nodes and 80 edges','flowchart generation returns full valid graph artifact'])assert.ok(native.includes(value),value);
  const source=await read('app/modules/artifacts.php');
  assert.match(source,/預設 flowchart/);
  assert.match(source,/不要求流程圖提供統計數字/);
  assert.match(source,/受限安全 Mermaid 子集/);
  assert.match(source,/含中括號、大括號、小括號或分號時必須使用一組外層雙引號/);
});

test('raw JSON guard preserves object-array identity before associative conversion', async () => {
  const source=await read('app/artifacts.php');
  const guard=source.split('function artifactJsonSchemaValue(')[1];
  assert.match(guard,/plain\(\$value\)/);
  assert.match(guard,/count\(\$values\)===count\(\$properties\)/);
  assert.match(guard,/array_key_exists\(\$key,\$values\)/);
  assert.match(guard,/is_array\(\$value\).*array_keys\(\$value\)===range\(0,count\(\$value\)-1\)/);
  assert.match(guard,/artifactJsonSchemaValue\(\$entry,\$schema\['items'\],\$depth\+1\)/);
  assert.match(guard,/function validateArtifactJsonShape\(\$rawObject\)/);
  assert.match(guard,/artifactJsonSchemaValue\(\$rawObject,artifactSchema\(\$rawObject->kind\)\)/);
  assert.match(guard,/'ARTIFACT_INVALID'/);
  assert.doesNotMatch(guard,/json_decode|array_values\(/);
  const native=await read('tests/artifacts.php');
  for(const value of ['raw JSON rejects numeric-key columns object','raw JSON rejects numeric-key rows object','raw JSON rejects numeric-key cells object','raw JSON rejects column array in object position'])assert.ok(native.includes(value),value);
});
