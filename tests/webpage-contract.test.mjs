// Executed source-contract checks only. These DO NOT run or validate PHP.
// Native fixtures: php tests/webpage.php (PHP 7.4+ with shared integration).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read = file => readFile(new URL('../' + file, import.meta.url), 'utf8');
const body = (source, name, next) => {
  const start=source.indexOf(name);assert.ok(start>=0,`missing section: ${name}`);
  const end=next ? source.indexOf(next,start+name.length) : undefined;
  if(next)assert.ok(end>=0,`missing boundary: ${next}`);
  return source.slice(start,end);
};

test('webpage uses exact native root, section and entry keys with no code-bearing properties',async()=>{
  const source=await read('app/webpage.php');
  for(const name of ['validateWebpageArtifact','webpageCompactJson','webpageContentFingerprint','webpageSchema','webpageItems'])assert.match(source,new RegExp(`function ${name}\\(`));
  for(const shape of ["array('kind','title','theme','navigation','sections')","array('id','type','eyebrow','heading','body','entries','actionLabel','actionTarget')","array('id','title','body')"])assert.ok(source.includes(shape),shape);
  assert.ok(source.includes("array('paper','midnight','meadow')"));
  assert.ok(source.includes("array('hero','text','cards','faq','cta','image')"));
  assert.ok(source.includes("artifactList($value['sections'],1,20"));
  assert.ok(source.includes("is_bool($value['navigation'])"));
  assert.doesNotMatch(source,/\b(?:eval|exec|shell_exec|unserialize)\s*\(|curl_|file_get_contents|preg_replace/);
});

test('native validation preserves literal text and uses shared UTF8, nonblank, ID and secret guards',async()=>{
  const source=body(await read('app/webpage.php'),'function validateWebpageArtifact(', 'function webpageCompactJson(');
  for(const call of ["artifactText($value['title'],600,'網頁標題',false)","artifactText($section['eyebrow'],240", "artifactText($section['heading'],600,'網頁區塊標題',false)","artifactText($section['body'],12000", "artifactText($entry['title'],600,'網頁卡片或問題標題',false)","artifactText($entry['body'],6000", "artifactText($section['actionLabel'],240", "artifactStableId($section['id']", "artifactStableId($entry['id']", "artifactStableId($actionTarget"])assert.ok(source.includes(call),call);
  assert.ok(source.includes('!in_array($id,$ids,true)'));
  assert.ok(source.includes('$entries=array();$entryIds=array()'));
  assert.ok(source.includes('!in_array($entryId,$entryIds,true)'));
  assert.doesNotMatch(source,/strip_tags|htmlspecialchars|html_entity_decode|trim\(|substr\(|str_replace\(/);
});

test('cards and FAQ require one to twelve entries while other native sections cannot contain entries',async()=>{
  const source=await read('app/webpage.php');
  assert.ok(source.includes("$hasEntries=$type==='cards'||$type==='faq'"));
  assert.ok(source.includes("artifactList($section['entries'],$hasEntries?1:0,$hasEntries?12:0"));
});

test('actions are paired, restricted to hero or CTA, and resolve inside the same snapshot',async()=>{
  const source=body(await read('app/webpage.php'),'function validateWebpageArtifact(', 'function webpageCompactJson(');
  assert.ok(source.includes("ensure(is_string($actionTarget)"));
  assert.ok(source.includes("($actionLabel==='')===($actionTarget==='')"));
  assert.ok(source.includes("if($actionLabel!=='')artifactText($actionLabel,240,'網頁導覽按鈕文字',false)"));
  assert.ok(source.includes("if($type==='cta')ensure($actionLabel!==''&&$actionTarget!==''"));
  assert.ok(source.includes("elseif($type!=='hero')ensure($actionLabel===''&&$actionTarget===''"));
  assert.ok(source.includes("$section['actionTarget']===''||in_array($section['actionTarget'],$ids,true)"));
  assert.ok(source.indexOf("foreach($sections as $section)ensure(")>source.indexOf('$sections[]=array('));
  assert.doesNotMatch(source,/parse_url|filter_var|https?:\/\/|download|fetch\(/);
});

test('canonical JSON and single-document projection preserve complete content and exact UTF8 cap',async()=>{
  const source=await read('app/webpage.php');
  assert.ok(source.includes("$out=array('kind'=>'webpage','title'=>$title,'theme'=>$theme,'navigation'=>$value['navigation'],'sections'=>$sections)"));
  assert.ok(source.includes("strlen(webpageCompactJson($out))<=60000"));
  const serializer=body(source,'function webpageCompactJson(', 'function webpageContentFingerprint(');
  assert.ok(serializer.includes('return jsonEncode($value)'));
  assert.doesNotMatch(serializer,/sort\(|ksort\(|array_slice|substr|trim\(/);
  const projection=body(source,'function webpageItems(');
  assert.ok(projection.includes('validateWebpageArtifact($value)'));
  assert.ok(projection.includes('$content=webpageCompactJson($artifact)'));
  assert.ok(projection.includes("array('id'=>'document','label'=>'網頁來源','content'=>$content)"));
  assert.ok(projection.includes('strlen($content)<=60000'));
});

test('provider schema is fully required, rejects extra keys, and includes strict boolean navigation',async()=>{
  const schema=body(await read('app/webpage.php'),'function webpageSchema(', 'function webpageItems(');
  assert.equal((schema.match(/artifactSchemaObject\(/g)||[]).length,3);
  assert.ok(schema.includes("'navigation'=>array('type'=>'boolean')"));
  assert.ok(schema.includes("'minItems'=>1,'maxItems'=>20"));
  assert.ok(schema.includes("'minItems'=>0,'maxItems'=>12"));
  assert.doesNotMatch(schema,/anyOf|oneOf|additionalProperties.*true|schemaVersion/);
});

test('content fingerprint ignores only stable IDs and preserves internal target binding semantics',async()=>{
  const source=body(await read('app/webpage.php'),'function webpageContentFingerprint(', 'function webpageSchema(');
  assert.ok(source.includes('validateWebpageArtifact($value)'));
  assert.ok(source.includes("unset($section['id'])"));
  assert.ok(source.includes("unset($entry['id'])"));
  assert.ok(source.includes("$ids=array_column($artifact['sections'],'id')"));
  assert.ok(source.includes("$section['actionTarget']===''?'':'section_'.array_search($section['actionTarget'],$ids,true)"));
  for(const property of ['title','theme','navigation'])assert.ok(source.includes(`'${property}'=>$artifact['${property}']`));
  assert.ok(source.includes("$section['entries']=$entries"));
  assert.doesNotMatch(source,/sort\(|ksort\(|unique\(|array_filter|strtolower|trim\(/);
});

test('webpage module inherits fixed-model lifecycle and correct seven-field three-direction mapping',async()=>{
  const source=await read('app/modules/webpage.php');
  assert.match(source,/class WebpageModule extends TitleModule/);
  assert.doesNotMatch(source,/function (?:validateSchemaValue|runDiscuss|runSummarize)\(/);
  assert.ok(source.includes('{"id":"document","label":"網頁來源"}'));
  assert.ok(source.includes("unset($data['versions'])"));
  for(const phrase of ['tone=視覺風格','message=內容結構','constraints=操作功能與限制','purpose=用途','audience=受眾','不要求填完問卷','ready 只表示可以請使用者確認三部分','不會自動連動','沿用專案固定的文字／結構化模型'])assert.ok(source.includes(phrase),phrase);
  assert.doesNotMatch(source,/vectorSchema|validateVector|向量|curl_|https?:\/\/|file_get_contents|new (?:Responses|Ollama)|appendVersion|->(?:adopt|save|execute)\(/);
});

test('capability instructions promise only native navigation and FAQ, not arbitrary code or deployment',async()=>{
  const source=await read('app/modules/webpage.php');
  for(const phrase of ['頁內導覽與原生 FAQ 展開／收合','沒有註冊、登入、付款、表單送出','外部圖片','任意程式或自動部署','沒有 schemaVersion','不宣稱程式碼沙盒','不能以 HTML、CSS、JavaScript','所有文字原樣作純文字顯示','同時為空字串或同時非空','同一區塊內唯一','cta 必須提供頁內導覽按鈕'])assert.ok(source.includes(phrase),phrase);
  assert.doesNotMatch(source,/sandbox\s*=|innerHTML|srcdoc|createElement|eval\(/);
});

test('generation creates exactly one full candidate in one bounded model call after confirmed directions',async()=>{
  const source=body(await read('app/modules/webpage.php'),'protected function runGenerate(', 'protected function sourceSnapshot(');
  assert.equal((source.match(/\$this->ask\(/g)||[]).length,1);
  assert.ok(source.includes("validateModuleItemDefinitions($project['brief']['items'],'webpage')"));
  assert.ok(source.includes("'minItems'=>1,'maxItems'=>1"));
  assert.ok(source.includes('使用者已確認 creativeGoal 的視覺風格、內容結構、操作功能與限制'));
  assert.ok(source.includes('$this->schema($props),24000'));
  assert.ok(source.includes("$this->candidateResult($v['candidates'][0],'候選',$references)"));
  assert.ok(source.includes('不採用、不定稿、不改正式版、不部署'));
});

test('refinement preserves full selected source and latest combined goal authority while rejecting content no-ops',async()=>{
  const source=body(await read('app/modules/webpage.php'),'protected function runRefine(', 'protected function runFuse(');
  assert.equal((source.match(/\$this->ask\(/g)||[]).length,1);
  assert.ok(source.indexOf('TARGET_ITEMS_INVALID')<source.indexOf('$this->ask('));
  assert.ok(source.includes("$data['sourceVersion']=$this->creativeVersions(array($source))[0]"));
  assert.ok(source.includes("$data['latestUserMessage']=$text"));
  assert.ok(source.includes('sourceVersion.goalAndRationale'));
  assert.ok(source.includes('versionHasCombinedOverride($source)'));
  assert.ok(source.includes("$artifactChanged=webpageCompactJson($artifact)!==webpageCompactJson($source['artifact'])"));
  assert.ok(source.includes("$contentChanged=$this->contentFingerprint($artifact,$references)!==$this->contentFingerprint($source['artifact'],$references)"));
  assert.ok(source.includes('$contentChanged||$goalText!==versionGoalText($source)||$combinedChanged'));
  assert.ok(source.includes("'items'=>webpageItems($artifact)"));
  assert.ok(source.includes("'reply'=>$revisionReply"));
  assert.ok(source.includes('尚未採用、定稿或取代正式版，也沒有部署'));
});

test('clarification requires exact canonical echo, rejects edit claims, and discards artifact and goal metadata',async()=>{
  const source=body(await read('app/modules/webpage.php'),"if($v['outcome']==='clarification'){", "ensure($question===''&&$choices===array()");
  assert.ok(source.includes("webpageCompactJson($artifact)===webpageCompactJson($source['artifact'])"));
  assert.ok(source.includes('MODEL_CLARIFICATION_ARTIFACT'));
  assert.ok(source.includes('rejectsCompletedEditClaim'));
  assert.ok(source.includes("'items'=>array(),'rationale'=>''"));
  assert.doesNotMatch(source,/'artifact'=>|'goalText'=>|'changeSummary'=>|appendVersion/);
});

test('goal-only revisions require the exact source artifact even when goal or combined metadata changes',async()=>{
  const source=body(await read('app/modules/webpage.php'),'protected function runRefine(', 'protected function runFuse(');
  const guard="ensure($contentChanged||!$artifactChanged,'MODEL_NO_REVISION'";
  const goalGuard='ensure($contentChanged||$goalText!==versionGoalText($source)||$combinedChanged';
  assert.ok(source.includes(guard));
  assert.ok(source.indexOf(guard)<source.indexOf(goalGuard));
  assert.ok(source.indexOf(guard)<source.indexOf('$revisionReply='));
  const fixtures=await read('tests/webpage.php');
  for(const phrase of ['ID-only artifact changes rejected even with changed goal','ID-only artifact changes rejected even with changed combined goal metadata','goal-only revision preserves complete webpage artifact and is labeled honestly'])assert.ok(fixtures.includes(phrase),phrase);
  assert.ok(fixtures.includes("$this->mode==='goal_only'||$this->mode==='ids_goal_change'"));
  assert.ok(fixtures.includes("$this->mode==='ids_only'||$this->mode==='ids_goal_change'"));
});

test('fusion uses two to five selected native snapshots and own goals and rejects any copied content',async()=>{
  const source=body(await read('app/modules/webpage.php'),'protected function runFuse(', 'protected function runCompare(');
  assert.equal((source.match(/\$this->ask\(/g)||[]).length,1);
  assert.ok(source.includes('count($versions)>=2&&count($versions)<=5'));
  const module=await read('app/modules/webpage.php');
  assert.ok(source.includes("$this->selectedSources($versions,$references,'fusion')"));
  assert.ok(module.includes('!in_array($id,$ids,true)'));
  assert.ok(module.includes("'creativeGoal'=>null,'goalApprovedAt'=>null"));
  assert.ok(module.includes("'selectedVersions'=>$this->creativeVersions($sources)"));
  assert.ok(source.includes("$content=$this->contentFingerprint($result['artifact'],$references)"));
  assert.ok(source.includes("$content!==$this->contentFingerprint($source['artifact'],$references)"));
  assert.ok(source.includes('$this->schema($this->candidateProperties()),24000'));
  assert.ok(source.includes('MODEL_NO_REVISION'));
  assert.doesNotMatch(source,/\$project\['brief'\]/);
});

test('native PHP fixtures are explicitly unexecuted and cover strict boundaries, bindings and lifecycle semantics',async()=>{
  const source=await read('tests/webpage.php');
  assert.ok(source.includes('UNEXECUTED in the authoring environment: PHP is unavailable'));
  assert.ok(source.includes("require_once dirname(__DIR__).'/app/bootstrap.php'"));
  for(const phrase of ['five native section types','canonical root, section and entry key order','malicious-looking HTML','lone surrogate UTF8','shared secret guard','60000-byte canonical JSON boundary','60001-byte full artifact','exact projection parity fixture','raw JSON rejects','ID-only changes preserve internal target binding semantics','retargeting internal action changes content fingerprint','generate one full candidate','unchanged sections','authoritative combined goal override','clarification source echo discarded','fusion rejects','exact model call count'])assert.ok(source.includes(phrase),phrase);
  assert.doesNotMatch(source,/curl_|new PDO|new ResponsesClient|file_put_contents/);
});
