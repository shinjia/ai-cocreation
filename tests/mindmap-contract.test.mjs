// Executed source-contract checks only. These do NOT execute or validate PHP.
// Native fixtures: php tests/mindmap.php (PHP 7.4+ required).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read = file => readFile(new URL('../' + file, import.meta.url), 'utf8');
const body = (source, name, next) => source.slice(source.indexOf(name), next ? source.indexOf(next, source.indexOf(name) + name.length) : undefined);

test('mindmap native helper exposes exact authoritative tree and pending shapes', async () => {
  const source=await read('app/mindmap.php');
  for (const name of ['validateMindmapArtifact', 'mindmapSchema', 'mindmapItems', 'mindmapNode', 'mindmapNodesEqual']) assert.match(source,new RegExp(`function ${name}\\(`));
  assert.ok(source.includes("array('kind','rootId','nodes','proposals')"));
  assert.ok(source.includes("array('id','parentId','label','description')"));
  assert.match(source,/artifactList\(\$value\['nodes'\],1,80/);
  assert.match(source,/artifactList\(\$value\['proposals'\],0,24/);
  assert.match(source,/artifactText\(\$node\['label'\],240/);
  assert.match(source,/artifactText\(\$node\['description'\],2000/);
  assert.match(source,/artifactText\(\$proposal\['label'\],240/);
  assert.match(source,/artifactText\(\$proposal\['description'\],2000/);
  assert.match(source,/strlen\(jsonEncode\(\$out\)\)<=60000/);
  assert.match(source,/strlen\(mindmapOutlineContent\(\$out\)\)<=60000/);
  assert.doesNotMatch(source,/\b(?:eval|exec|shell_exec|unserialize)\s*\(/);
});

test('topology validation connects every accepted node to one root and keeps proposals outside it', async () => {
  const source=await read('app/mindmap.php');
  assert.match(source,/\$roots===array\(\$rootId\)/);
  assert.match(source,/while\(\$cursor!==\$rootId\)/);
  assert.match(source,/isset\(\$byId\[\$cursor\]\)&&!in_array\(\$cursor,\$seen,true\)/);
  assert.match(source,/\$cursor=\$byId\[\$cursor\]\['parentId'\]/);
  assert.match(source,/isset\(\$byId\[\$parentId\]\)/);
  assert.equal((source.match(/!in_array\(\$id,\$ids,true\)/g)||[]).length,2);
  const lookup=body(source,'function mindmapNode(', 'function mindmapNodesEqual(');
  assert.ok(lookup.includes("$artifact['nodes']"));assert.ok(!lookup.includes("$artifact['proposals']"));
});

test('legacy projection walks validated accepted tree and marks the complete pending queue separately', async () => {
  const source=body(await read('app/mindmap.php'),'function mindmapOutlineContent(');
  assert.match(source,/validateMindmapArtifact\(\$value\)/);
  for(const text of ['已加入心智圖：','待選分支（尚未加入心智圖）：','（父節點：','心智圖來源'])assert.ok(source.includes(text));
  assert.ok(source.includes("$walk($node['id'],$depth+1)"));
  assert.ok(source.includes("foreach($artifact['proposals'] as $proposal)"));
  assert.match(source,/strlen\(\$content\)<=60000/);
  assert.ok(source.includes("array('id'=>'document','label'=>'心智圖來源','content'=>$content)"));
  assert.doesNotMatch(source,/substr|mb_substr|\.\.\./);
});

test('mindmap shares strict provider workflow and topic-first open exploration', async () => {
  const source=await read('app/modules/mindmap.php');
  assert.match(source,/class MindmapModule extends TitleModule/);
  assert.doesNotMatch(source,/function (?:ask|validateSchemaValue|runDiscuss|runSummarize|runCompare)\(/);
  for(const text of ['只要已有可探索的主題','不要求先收斂','自由文字始終可作答','sourceVersion.goalAndRationale','rootId 與 nodes'])assert.ok(source.includes(text));
  assert.ok(source.includes('{"id":"document","label":"心智圖來源"}'));
  assert.ok(source.includes("unset($data['versions'])"));
  assert.doesNotMatch(source,/curl_|https?:\/\/|file_get_contents|new (?:Responses|Ollama)/);
});

test('generation enforces one root and two to twelve unaccepted branches in one bounded call', async () => {
  const source=body(await read('app/modules/mindmap.php'),'protected function runGenerate(', 'protected function sourceSnapshot(');
  assert.equal((source.match(/\$this->ask\(/g)||[]).length,1);
  assert.ok(source.includes("'minItems'=>1,'maxItems'=>1"));
  assert.ok(source.includes('$this->schema($props),24000'));
  assert.ok(source.includes("count($artifact['nodes'])===1"));
  assert.ok(source.includes("count($artifact['proposals'])>=2"));
  assert.ok(source.includes("count($artifact['proposals'])<=12"));
  assert.ok(source.includes("$proposal['parentId']===$artifact['rootId']"));
  assert.ok(source.includes('勾選並加入草稿後才入圖'));
});

test('refinement checks target before inference and forbids mutations outside its pending queue', async () => {
  const source=body(await read('app/modules/mindmap.php'),'protected function runRefine(', 'protected function runFuse(');
  assert.equal((source.match(/\$this->ask\(/g)||[]).length,1);
  assert.ok(source.indexOf('MINDMAP_TARGET_INVALID')<source.indexOf('$this->ask('));
  assert.ok(source.includes("mindmapNode($source['artifact'],$targetId)!==null"));
  assert.ok(source.includes("mindmapNodesEqual($artifact['nodes'],$source['artifact']['nodes'])"));
  assert.ok(source.includes("$artifact['rootId']===$source['artifact']['rootId']"));
  assert.ok(source.includes('$this->pendingFor($artifact,$targetId,false)===$this->pendingFor($source[\'artifact\'],$targetId,false)'));
  for(const code of ['MODEL_MINDMAP_ACCEPTED_CHANGED','MODEL_MINDMAP_PENDING_CHANGED','MODEL_MINDMAP_PENDING_COUNT','MODEL_NO_REVISION'])assert.ok(source.includes(code));
  assert.ok(source.includes('$pendingChanged||$goalChanged'));
  assert.ok(source.includes('versionHasCombinedOverride($source)'));
  assert.ok(source.includes("'items'=>mindmapItems($artifact)"));
  assert.ok(source.includes("'reply'=>$revisionReply"));
  assert.ok(source.includes('已加入的節點保持不變'));
  assert.doesNotMatch(source,/rejectsCompletedEditClaim\(\$reply\);/);
});

test('clarification verifies exact source echo then discards artifact and metadata without a version', async () => {
  const source=body(await read('app/modules/mindmap.php'),"if($v['outcome']==='clarification'){", "ensure($question===''&&$choices===array()");
  assert.ok(source.includes("$artifact===$source['artifact']"));
  assert.ok(source.includes('MODEL_CLARIFICATION_ARTIFACT'));
  assert.ok(source.includes('rejectsCompletedEditClaim'));
  assert.ok(source.includes("'items'=>array(),'rationale'=>''"));
  assert.doesNotMatch(source,/'artifact'=>|'goalText'=>|appendVersion|officialVersionId.*=/);
});

test('fusion uses selected version goals and accepted identities, not pending promotion or shared goal', async () => {
  const source=body(await read('app/modules/mindmap.php'),'protected function runFuse(');
  assert.equal((source.match(/\$this->ask\(/g)||[]).length,1);
  assert.ok(source.includes('count($versions)>=2&&count($versions)<=5'));
  assert.ok(source.includes("'creativeGoal'=>null,'goalApprovedAt'=>null"));
  assert.ok(source.includes("'selectedVersions'=>$this->creativeVersions($sources)"));
  assert.ok(source.includes("foreach($source['artifact']['nodes'] as $node)"));
  assert.ok(source.includes("array('id'=>$node['id'],'label'=>$node['label'],'description'=>$node['description'])"));
  assert.ok(source.includes('in_array($identity,$accepted,true)'));
  assert.ok(source.includes("$result['artifact']!==$source['artifact']"));
  assert.ok(source.includes('$this->schema($this->candidateProperties()),24000'));
  assert.doesNotMatch(source,/\$project\['brief'\]/);
});

test('native fixtures document their unexecuted status and cover boundary and workflow invariants', async () => {
  const source=await read('tests/mindmap.php');
  assert.ok(source.includes('UNEXECUTED in the authoring environment: PHP is unavailable'));
  assert.ok(source.includes("require_once dirname(__DIR__).'/app/bootstrap.php'"));
  for(const phrase of ['60000-byte canonical JSON boundary','60001-byte full artifact','validator rejects outline overflow','disconnected cycle','cross-list duplicate','exact projection parity fixture','raw JSON rejects','generation root only','other parents pending proposals','selected accepted node','goal-only revision','authoritative combined goal override','clarification source echo discarded','accepted in any selected source','exact model call count'])assert.ok(source.includes(phrase),phrase);
  assert.doesNotMatch(source,/curl_|new PDO|new ResponsesClient/);
});
