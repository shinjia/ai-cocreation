// Source invariants and bounded-size calculations, NOT a PHP runtime test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=file=>readFile(new URL('../'+file,import.meta.url),'utf8');
const method=(s,name)=>{const rest=s.slice(s.search(new RegExp('(?:private|protected|public) function '+name+'\\(')));const n=rest.slice(1).search(/\n    (?:private|protected|public) function /);return n<0?rest:rest.slice(0,n+1);};
test('project binding is explicit, immutable, and resolved before any paid request journal or adapter call',async()=>{
 const s=await read('app/app.php'), b=method(s,'bindingFromInput'), c=method(s,'projectConnection'), action=method(s,'action');
 assert.match(b,/settingsLease/);assert.match(b,/memberId/);assert.match(b,/MEMBER_DISABLED/);assert.match(b,/boundAt/);
 assert.match(c,/PROJECT_MODEL_REQUIRED/);assert.match(c,/PROJECT_MODEL_CHANGED/);assert.match(c,/array\('provider','model','ollamaUrl'\)/);assert.match(c,/memberNickname.*binding\['memberNickname'\]/);
 assert.doesNotMatch(c,/activeMemberId|\$this->connection\(/);
 assert.ok(action.indexOf('projectConnection(')<action.indexOf('requestStart('));
 const bind=s.split("if($action==='bind_project_model'){")[1].split("if(in_array($action")[0];assert.match(bind,/aiBinding'\]===null/);assert.match(bind,/PROJECT_MODEL_BOUND/);assert.match(bind,/revision\(\$raw,\$input\)/);
 assert.match(method(s,'normalizeRaw'),/aiBinding'\]=null/);
});
test('direction readiness commits the same response and confirmation performs one generation after exact revision guard',async()=>{
 const s=await read('app/app.php'),discuss=s.split("if($action==='discuss') {")[1].split("if($action==='summarize')")[0],gen=s.split("if($action==='generate'||$action==='confirm_generate') {")[1].split("if($action==='snapshot')")[0];
 assert.match(discuss,/directionStatus'\]==='ready'/);assert.match(discuss,/summaryRevision'\]=\$ready\?\$p\['revision'\]\+1:null/);assert.match(discuss,/'goalSnapshot'\]=\$p\['brief'\]/);
 assert.doesNotMatch(discuss,/->generate\(/);assert.equal((gen.match(/\$module->generate\(/g)||[]).length,1);assert.match(gen,/summaryRevision'\]<=\$p\['revision'\]/);
 assert.ok(gen.indexOf('$module->generate(')<gen.indexOf("'goal_approval'"));assert.match(s,/\$this->revision\(\$p,\$input\)/);
});
test('candidate refinement pins selected source and article selection into question validity',async()=>{
 const s=await read('app/app.php'),select=method(s,'refinementSelection'),binding=method(s,'choiceContext'),discuss=s.split("if($action==='discuss') {")[1].split("if($action==='summarize')")[0];
 assert.match(select,/baseVersionId/);assert.match(select,/TARGET_ITEMS_REQUIRED/);assert.match(select,/sort\(\$targets,SORT_STRING\)/);
 for(const key of ['baseVersionId','targetItemIds'])assert.ok(binding.includes("'"+key+"'"));
 assert.match(discuss,/if\(\$selection\['base'\]!==null\)/);assert.match(discuss,/\$module->refine\(\$refinementProject,\$official,\$text,\$model,\$selection\['targetItemIds'\]\)/);
 assert.match(discuss,/'revision',\$official\['id'\].*'minor'/);assert.doesNotMatch(discuss,/officialVersionId'\]=/);
});
test('fusion uses new major, complete direct snapshots and bounded ancestor lineage, without adoption',async()=>{
 const s=await read('app/app.php'),pin=method(s,'pinnedVersion'),fuse=s.split("if($action==='fuse'){")[1].split("ensure(count($p['comparisons'])")[0];
 assert.match(pin,/unset\(\$version\['fusionSourceSnapshots'\]\)/);assert.doesNotMatch(pin,/unset\(\$version\['(?:items|provenance|fusionSourceVersionIds)'\]\)/);
 assert.match(fuse,/count\(\$ids\)>=2&&count\(\$ids\)<=5/);assert.match(fuse,/fusionSourceSnapshots'\]=\$snapshots/);assert.match(fuse,/fusionSourceVersionIds'\]=\$ids/);
 assert.match(fuse,/'fusion',null,\$message\['id'\],\$provenance,'major'/);assert.equal((fuse.match(/\$module->fuse\(/g)||[]).length,1);assert.doesNotMatch(fuse,/officialVersionId'\]=|finalizedVersionId'\]=/);
});
test('both provider adapters declare and validate the requested bounded output token budget',async()=>{
 for(const path of ['app/model.php','app/ollama.php']){const s=await read(path),g=method(s,'generate');assert.match(g,/generate\(\$model,\$messages,\$schema,\$maxOutputTokens=6000\)/);assert.match(g,/is_int\(\$maxOutputTokens\)&&\$maxOutputTokens>=6000&&\$maxOutputTokens<=24000/);assert.match(g,/(?:max_output_tokens|num_predict)'\s*=>\$maxOutputTokens/);assert.ok(g.indexOf('MODEL_OUTPUT_BUDGET')<g.indexOf('$this->request('));}
});
test('article manual snapshots validate new full structure, while selected AI edits preserve original bytes',async()=>{
 const s=await read('app/app.php'),manual=s.split("if($action==='snapshot') {")[1].split("if($action==='promote')")[0],text=await read('app/modules/text.php');
 assert.match(manual,/validateModuleContentItems\(field\(\$input,'items'\),\$p\['module'\]\)/);assert.match(text,/\$merged\[\]=isset\(\$map\[\$prior\['id'\]\]\)\?\$map\[\$prior\['id'\]\]:\$prior/);
 assert.match(text,/validateModuleContentItems\(\$merged,\$this->type\)/);assert.match(text,/REFINEMENT_RANGE_TOO_LARGE/);assert.match(text,/FUSION_CONTENT_TOO_LARGE/);
 const promote=s.split("if($action==='promote') {")[1].split("if($action==='archive_version'")[0];assert.match(promote,/\$p\['module'\]==='titles'\?officialItemTitle\(\$v\['items'\]\):\$previousItemTitle/);
});
test('readiness budgets reserve two fully escaped maximum direction snapshots plus reply and metadata',async()=>{
 const s=await read('app/validation.php'),size=x=>Buffer.byteLength(JSON.stringify(x)),control='\u0001';
 for(const [article,count] of [[false,12],[true,80]]){
  const direction={...Object.fromEntries(['purpose','audience','message','tone','constraints'].map(k=>[k,control.repeat(1200)])),summary:control.repeat(3000),items:Array.from({length:count},(_,i)=>({id:`i${i}`+'x'.repeat(60),label:i+control.repeat(117)}))};
  const growth={brief:direction,messages:[{text:control.repeat(4000)},{text:control.repeat(1200),goalSnapshot:direction,directionStatus:'ready'}]};
  const match=article?s.match(/if\(\$long&&\$action==='discuss'\)return \$references\+(\d+);/):s.match(/if\(\$action==='discuss'\)return \$references\+(\d+);/);
  assert.ok(Number(match[1])>size(growth)+10000,article?'article':'titles');
 }
});

test('article selected patch budget includes all untouched document bytes before inference',async()=>{
 const s=await read('app/modules/text.php'),refine=method(s,'runRefine');
 assert.match(refine,/min\(36000,120000-\$untouchedBytes\)/);assert.match(refine,/selectedOutputByteLimit'\]=\$selectedOutputByteLimit/);assert.match(refine,/ensure\(\$bytes<=\$selectedOutputByteLimit/);assert.ok(refine.indexOf('$selectedOutputByteLimit=')<refine.indexOf('$this->ask('));
 assert.equal(Math.min(36000,120000-(120000-24000)),24000);
});
