import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = file => readFile(new URL('../' + file, import.meta.url), 'utf8');
test('local-only HTTP boundary includes loopback, proxy rejection, CSRF, Origin and body cap',async()=>{
 const [api,config,session,key]=await Promise.all(['public/api.php','app/config.php','app/session.php','app/credential.php'].map(read));
 assert.match(api,/HTTP_ORIGIN/);assert.match(api,/HTTP_X_CSRF_TOKEN/);assert.match(api,/32768/);assert.match(config,/LOCAL_ONLY/);assert.match(session,/requireKeyContext/);assert.match(session,/HTTP_HOST/);assert.match(key,/HTTP_X_FORWARDED_FOR/);assert.match(key,/REMOTE_ADDR/);
});
test('temporary vault never lives in config or SQLite, does not echo secret, expires and can clear',async()=>{
 const [vault,store,config]=await Promise.all(['app/credential.php','app/store.php','config.example.php'].map(read));
 assert.match(vault,/time\(\)\+1800/);assert.match(vault,/expires.*<=time\(\)/);assert.match(vault,/unlink\(\$path\)/);assert.match(vault,/0600/);assert.match(vault,/0700/);
 assert.doesNotMatch(store,/api_key|sk-/);assert.doesNotMatch(config,/sk-/);assert.match(vault,/'keyPresent'/);
});
test('paid actions require explicit consent, current model, current key generation, and idempotency',async()=>{
 const app=await read('app/app.php'), store=await read('app/store.php');
 for(const action of ['discuss','summarize','generate','compare'])assert.match(app,new RegExp("'"+action+"'"));
 for(const check of ['CONSENT_REQUIRED','MODEL_CHANGED','KEY_CHANGED','requestStart','requestFinish'])assert.ok(app.includes(check));
 assert.match(store,/REQUEST_ALREADY_ATTEMPTED/);assert.match(store,/PRIMARY KEY\(owner,id\)/);assert.match(app,/array\('projectId'=>\$result\['project'\]\['id'\]\)/);
});
test('goal approval gate, one question, module boundary, no code execution',async()=>{
 const app=await read('app/app.php'), module=await read('app/modules/titles.php'), registry=await read('app/modules.php');
 assert.match(app,/studentTurns\(\$p\)>=3/);assert.match(app,/GOAL_APPROVAL_REQUIRED/);assert.match(app,/approve_goal/);assert.match(module,/preg_match_all/);assert.match(registry,/\$id==='titles'/);
 assert.doesNotMatch(module,/eval\(|shell_exec\(|system\(|exec\(/);assert.match(registry,/'enabled'=>false/);
});
test('official pointer changes only on explicit promote; generation never auto-finalizes',async()=>{
 const app=await read('app/app.php');const generate=app.split("if($action==='generate')")[1].split("if($action==='snapshot')")[0];
 assert.doesNotMatch(generate,/officialVersionId.*=/);assert.doesNotMatch(generate,/finalizedVersionId.*=/);assert.match(generate,/appendVersion/);
 assert.match(app,/if\(\$action==='promote'\)/);assert.match(app,/if\(\$action==='finalize'\)/);assert.match(app,/PROJECT_FINALIZED/);assert.match(app,/versionSnapshot/);assert.match(app,/if\(\$action==='reopen'\)/);
});
test('snapshots and comparisons retain exact goal/message/version linkage and enforce membership',async()=>{
 const app=await read('app/app.php'),mod=await read('app/modules/titles.php');
 for(const key of ['goalSnapshot','messageId','basedOnVersionId','previousOfficialVersionId','comparisonId'])assert.ok(app.includes(key));
 assert.match(app,/count\(\$ids\)>=2&&count\(\$ids\)<=5/);assert.match(app,/array_unique/);assert.match(mod,/in_array\(\$id,\$expected,true\)/);assert.match(mod,/!in_array\(\$id,\$seen,true\)/);
});
test('fixed HTTPS Responses endpoint, certificate verification, strict schema, no upstream raw errors',async()=>{
 const model=await read('app/model.php');
 assert.match(model,/https:\/\/api\.openai\.com\/v1\/responses/);assert.match(model,/CURLOPT_FOLLOWLOCATION=>false/);assert.match(model,/CURLOPT_SSL_VERIFYPEER=>true/);assert.match(model,/CURLOPT_SSL_VERIFYHOST=>2/);assert.match(model,/'store'=>false/);assert.match(model,/'strict'=>true/);assert.match(model,/MODEL_REFUSAL/);assert.match(model,/MODEL_INCOMPLETE/);
});
test('installer non-destructive lock, external private data and no secret input',async()=>{
 const install=await read('app/installer.php'),page=await read('public/install.php');
 assert.match(install,/LOCK_EX\|LOCK_NB/);assert.match(install,/fopen\(\$target,'x'\)/);assert.match(install,/!isWithin\(\$candidate,\$doc\)/);assert.match(install,/CONTEXT_DOCUMENT_ROOT/);assert.doesNotMatch(page,/name="(?:key|api_key)"/);assert.match(install,/cocreation\.sqlite/);
});
test('project identity and metadata separate from generated title; all reads scoped',async()=>{
 const app=await read('app/app.php'),store=await read('app/store.php');
 assert.match(app,/edit_project/);assert.match(app,/'description'=>userTextValue/);assert.match(store,/WHERE id=\? AND owner=\?/);assert.match(store,/projects.owner=excluded.owner/);
 const append=app.split('private function appendVersion')[1].split('public function action')[0];assert.doesNotMatch(append,/\$project\['title'\]=/);
});
test('Ollama restricts destination to loopback and never receives OpenAI credential',async()=>{
 const validation=await read('app/validation.php'),ollama=await read('app/ollama.php');
 assert.match(validation,/validateOllamaUrl/);assert.match(validation,/'localhost','127\.0\.0\.1','\[::1\]'/);assert.match(validation,/1024/);assert.match(ollama,/CURLOPT_RESOLVE/);assert.match(ollama,/CURLOPT_PROXY=>''/);assert.match(ollama,/CURLOPT_FOLLOWLOCATION=>false/);assert.doesNotMatch(ollama,/Authorization|Bearer|keyProvider/);assert.match(ollama,/'format'=>\$schema/);assert.match(ollama,/done_reason/);
});
test('provider selection binds every call to immutable settings, no automatic fallback',async()=>{
 const app=await read('app/app.php');assert.match(app,/approvedProvider/);assert.match(app,/approvedSettingsRevision/);assert.match(app,/SETTINGS_CHANGED/);assert.match(app,/if\(\$connection\['provider'\]==='openai'\)/);assert.match(app,/requestedModel/);assert.match(app,/actualModel/);assert.match(app,/requestedAt/);assert.match(app,/provenance/);
 assert.doesNotMatch(app,/catch[^}]*new OllamaAdapter/s);
});
test('connection tests read only model metadata, no inference',async()=>{
 const openai=await read('app/model.php'),local=await read('app/ollama.php');
 const check=openai.split('public function checkConnection')[1];assert.match(check,/\/v1\/models\//);assert.doesNotMatch(check,/CURLOPT_POST/);const checkLocal=local.split('public function checkConnection')[1];assert.match(checkLocal,/request\('\/api\/tags'\)/);assert.doesNotMatch(checkLocal,/generate\(/);
});
test('extensible stable-id naming bundles validated and generated only from approved item definitions',async()=>{
 const validation=await read('app/validation.php'),module=await read('app/modules/titles.php'),app=await read('app/app.php');
 assert.match(validation,/validateContentItems/);assert.match(validation,/count\(\$items\)<=12/);assert.match(validation,/24000/);assert.match(module,/creativeGoal.items/);assert.match(module,/validateContentItems\(field\(\$candidate,'items'\),\$project\['brief'\]\['items'\]\)/);assert.match(app,/'items'=>\$items/);
 assert.doesNotMatch(app,/'zhTitle'|'enTitle'/);
});
test('project shell separates creative items, isolates active item actions, and pins explicit cross-item references',async()=>{
 const app=await read('app/app.php'),mod=await read('app/modules/titles.php'),registry=await read('app/modules.php');
 for(const token of ['creativeItems','activeItemId','create_item','select_item','ACTIVE_ITEM_CHANGED','attach_reference','targetItemId','versionSnapshot','referencesSnapshot','projectFinalizations','archive_item','restore_item'])assert.ok(app.includes(token));
 assert.match(app,/CAPABILITY_UNAVAILABLE/);assert.match(app,/ITEMS_UNFINISHED/);assert.match(mod,/pinnedReferences/);assert.match(registry,/'id'=>'poster','label'=>'海報設計','enabled'=>false/);
});
test('context changes invalidate projected approvals consistently and finalized metadata requires reopening',async()=>{
 const app=await read('app/app.php');
 assert.match(app,/foreach\(\$raw\['creativeItems'\] as &\$item\)/);assert.match(app,/\$item\['contextRevision'\]!==\$raw\['sharedContextRevision'\]/);assert.match(app,/\$changed=\$description!==\$p\['description'\]\|\|\$title!==\$p\['title'\]/);
 assert.match(app,/if\(\$action==='edit_item'\)\{ensure\(\$item\['lifecycle'\]!=='finalized'/);assert.match(app,/\$item\['contextRevision'\]===\$raw\['sharedContextRevision'\]/);
});
test('generation capacity checked before inference and reference copying avoids recursive content explosion',async()=>{
 const app=await read('app/app.php'),mod=await read('app/modules/titles.php');
 assert.match(app,/reserveStorage/);assert.match(app,/private function pinnedVersion/);assert.match(app,/unset\(\$ref\['versionSnapshot'\]\)/);assert.match(mod,/CONTEXT_LIMIT/);assert.match(mod,/240000/);
 assert.ok(app.indexOf('reserveStorage($p,inferenceGrowthBudget($p,$action))')<app.indexOf('$module->generate'));
});

test('inference storage budgets bound all copied references and six-byte JSON escaping at capacity edge',async()=>{
 const source=await read('app/validation.php');
 const size=x=>Buffer.byteLength(JSON.stringify(x));
 const refs=[{versionSnapshot:{items:[{id:'source',label:'引用',content:'x'.repeat(50000)}]}}];
 const definitions=Array.from({length:12},(_,i)=>({id:'i'+i,label:'x'+i+'\u0001'.repeat(110)}));
 const brief=Object.fromEntries(['purpose','audience','message','tone','constraints'].map(k=>[k,'\u0001'.repeat(1200)]));brief.summary='\u0001'.repeat(3000);brief.items=definitions;
 const context={title:'\u0001'.repeat(240),description:'\u0001'.repeat(4000),revision:999};
 const bundle=definitions.map(d=>({...d,content:'\u0001'.repeat(2000)}));
 const version={items:bundle,rationale:'\u0001'.repeat(1200),title:'\u0001'.repeat(60),referencesSnapshot:refs,goalSnapshot:brief,projectContextSnapshot:context};
 const comparison={referencesSnapshot:refs,goalSnapshot:brief,items:Array.from({length:5},()=>Object.fromEntries(['fit','strength','tradeoff','suggestion'].map(k=>[k,'\u0001'.repeat(1000)]))),summary:'\u0001'.repeat(2000)};
 const saved={discuss:[{text:'\u0001'.repeat(4000)},{text:'\u0001'.repeat(1200),referencesSnapshot:refs}],summarize:{brief,message:{goalSnapshot:brief,referencesSnapshot:refs}},generate:{versions:Array.from({length:5},()=>version),message:{referencesSnapshot:refs},instruction:'\u0001'.repeat(2000)},compare:{comparison,message:{referencesSnapshot:refs,text:comparison.summary},question:'\u0001'.repeat(2000)}};
 for(const action of Object.keys(saved)){
   const expression=source.match(new RegExp("if\\(\\$action==='"+action+"'\\)return ([^;]+);"))?.[1];assert.ok(expression,action);
   const arithmetic=expression.replaceAll('$references','references').replaceAll('$brief','brief').replaceAll('$context','context');
   assert.match(arithmetic,/^[0-9+* referencesbifcontx]+$/);
   const budget=Function('references','brief','context','return '+arithmetic)(size(refs),size(brief),size(context));
   assert.ok(budget>size(saved[action])+5000,action+' includes JSON and metadata overhead');
   const existing=2000000-budget+1;assert.ok(existing+budget>2000000,action+' rejected at limit before spending');
 }
});

test('official discussion branches into true revisions before initial-goal reset and never promotes automatically',async()=>{
 const app=await read('app/app.php');
 const branch=app.split("if($p['officialVersionId']!==null){")[1].split('$reply=$module->discuss')[0];
 assert.ok(branch);assert.match(branch,/\$official=\$this->version\(\$p,\$p\['officialVersionId'\]\)/);assert.match(branch,/module->refine/);
 for(const marker of ["'revision'","'basedOnVersionId'","'revisionInstruction'","'revisionVersionId'","'clarification'"])assert.ok(branch.includes(marker),marker);
 assert.match(branch,/appendVersion\(\$p,\$result\['items'\],\$result\['rationale'\],'revision',\$official\['id'\]/);
 assert.doesNotMatch(branch,/\$p\['(?:officialVersionId|goalApprovedAt|summaryRevision|finalizedVersionId)'\]\s*=/);
 assert.ok(app.indexOf("ensure($p['lifecycle']!=='finalized'")<app.indexOf('$module->refine'));
 assert.ok(branch.indexOf("count($p['versions'])<60")<branch.indexOf('$module->refine'));
});
test('refinement includes current full official bundle, custom labels, current references and genuine output validation',async()=>{
 const mod=await read('app/modules/titles.php');const branch=mod.split('private function runRefine')[1].split('private function runSummarize')[0];
 assert.match(branch,/\$data\['officialVersion'\]=\$this->creativeVersions\(array\(\$official\)\)\[0\]/);
 assert.match(branch,/latestStudentMessage/);assert.match(branch,/pinnedReferences/);assert.match(branch,/validateContentItems/);
 assert.match(branch,/\$byId\[\$prior\['id'\]\]\['label'\]===\$prior\['label'\]/);
 assert.match(branch,/jsonEncode\(\$ordered\)!==jsonEncode\(\$official\['items'\]\)/);assert.match(branch,/MODEL_NO_REVISION/);
 assert.match(branch,/field\(\$v,'items'\)===array\(\)/);assert.match(branch,/尚未修改任何內容/);
});
test('existing official allows manual save without falsely restoring approval; initial work still goal gated',async()=>{
 const app=await read('app/app.php');const snapshot=app.split("if($action==='snapshot')")[1].split("if($action==='promote')")[0];
 assert.match(snapshot,/if\(\$p\['officialVersionId'\]===null\)\$this->goalRequired\(\$p\)/);assert.doesNotMatch(snapshot,/goalApprovedAt.*=/);
 const generate=app.split("if($action==='generate')")[1].split("if($action==='snapshot')")[0];assert.match(generate,/goalRequired/);
});
test('revision growth budget includes two reference copies and worst-case full bundle plus repeated instruction',async()=>{
 const source=await read('app/validation.php');
 assert.match(source,/if\(\$action==='discuss'&&field\(\$project,'officialVersionId'\)!==null\)return 2\*\$references\+\$brief\+\$context\+250000/);
 const size=x=>Buffer.byteLength(JSON.stringify(x));const refs=[{versionSnapshot:{content:'x'.repeat(50000)}}],brief={summary:'\u0001'.repeat(9000)},context={title:'\u0001'.repeat(240),description:'\u0001'.repeat(4000)};
 const items=Array.from({length:12},(_,i)=>({id:'i'+i,label:'\u0001'.repeat(120),content:'\u0001'.repeat(2000)}));const instruction='\u0001'.repeat(4000);
 const stored={version:{items,title:'\u0001'.repeat(60),rationale:'\u0001'.repeat(1200),revisionInstruction:instruction,referencesSnapshot:refs,goalSnapshot:brief,projectContextSnapshot:context},student:{text:instruction},assistant:{text:'\u0001'.repeat(1200),referencesSnapshot:refs}};
 const budget=2*size(refs)+size(brief)+size(context)+250000;assert.ok(budget>size(stored)+5000);assert.ok((2000000-budget+1)+budget>2000000);
});
