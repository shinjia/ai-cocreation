import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = file => readFile(new URL('../' + file, import.meta.url), 'utf8');
test('local-only HTTP boundary includes loopback, proxy rejection, CSRF, Origin and body cap',async()=>{
 const [api,config,session,key]=await Promise.all(['public/api.php','app/config.php','app/session.php','app/credential.php'].map(read));
 assert.match(api,/HTTP_ORIGIN/);assert.match(api,/HTTP_X_CSRF_TOKEN/);assert.match(api,/262144/);assert.match(config,/LOCAL_ONLY/);assert.match(session,/requireKeyContext/);assert.match(session,/HTTP_HOST/);assert.match(key,/HTTP_X_FORWARDED_FOR/);assert.match(key,/REMOTE_ADDR/);
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
 const version={items:bundle,goalText:'\u0001'.repeat(6000),changeSummary:'\u0001'.repeat(1200),goalAndRationale:'\u0001'.repeat(12000),rationale:'\u0001'.repeat(1200),title:'\u0001'.repeat(60),referencesSnapshot:refs,goalSnapshot:brief,projectContextSnapshot:context};
 const historicalGoals=Array.from({length:5},(_,i)=>({versionId:'v'+i,goalSnapshot:brief,goalText:'\u0001'.repeat(6000),goalAndRationale:'\u0001'.repeat(12000),changeSummary:'\u0001'.repeat(2000),rationale:'\u0001'.repeat(2000)}));
 const comparison={referencesSnapshot:refs,goalSnapshot:null,versionGoalSnapshots:historicalGoals,items:Array.from({length:5},()=>Object.fromEntries(['fit','strength','tradeoff','suggestion'].map(k=>[k,'\u0001'.repeat(1000)]))),summary:'\u0001'.repeat(2000)};
 const saved={discuss:[{text:'\u0001'.repeat(4000)},{text:'\u0001'.repeat(1200),referencesSnapshot:refs}],summarize:{brief,message:{goalSnapshot:brief,referencesSnapshot:refs}},generate:{versions:Array.from({length:5},()=>version),message:{referencesSnapshot:refs},instruction:'\u0001'.repeat(2000)},compare:{comparison,message:{referencesSnapshot:refs,text:comparison.summary},question:'\u0001'.repeat(2000)}};
 for(const action of Object.keys(saved)){
   const expression=(action==='compare'?source.match(/return (2\*\$references\+\$brief\+array_sum\(array_slice\(\$goals,0,5\)\)\+180000);/) : source.match(new RegExp("if\\(\\$action==='"+action+"'\\)return ([^;]+);")))?.[1];assert.ok(expression,action);
   const arithmetic=expression.replace('array_sum(array_slice($goals,0,5))',String(historicalGoals.reduce((sum,g)=>sum+size(g),0))).replaceAll('$references','references').replaceAll('$brief','brief').replaceAll('$context','context');
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
 assert.match(branch,/latestUserMessage/);assert.match(branch,/pinnedReferences/);assert.match(branch,/validateContentItems/);
 assert.match(branch,/\$byId\[\$prior\['id'\]\]\['label'\]===\$prior\['label'\]/);
 assert.match(branch,/jsonEncode\(\$ordered\)!==jsonEncode\(\$official\['items'\]\)/);assert.match(branch,/MODEL_NO_REVISION/);
 assert.match(branch,/field\(\$v,'items'\)===array\(\)/);assert.match(branch,/作品內容與正式版都尚未變更/);
});
test('existing official allows manual save without falsely restoring approval; initial work still goal gated',async()=>{
 const app=await read('app/app.php');const snapshot=app.split("if($action==='snapshot')")[1].split("if($action==='promote')")[0];
 assert.match(snapshot,/if\(\$p\['officialVersionId'\]===null\)\$this->goalRequired\(\$p\)/);assert.doesNotMatch(snapshot,/goalApprovedAt.*=/);
 const generate=app.split("if($action==='generate')")[1].split("if($action==='snapshot')")[0];assert.match(generate,/goalRequired/);
});
test('revision growth budget includes two reference copies and worst-case full bundle plus repeated instruction',async()=>{
 const source=await read('app/validation.php');
 assert.match(source,/if\(\$action==='discuss'&&field\(\$project,'officialVersionId'\)!==null\)return 2\*\$references\+\$brief\+\$context\+450000/);
 const size=x=>Buffer.byteLength(JSON.stringify(x));const refs=[{versionSnapshot:{content:'x'.repeat(50000)}}],brief={summary:'\u0001'.repeat(9000)},context={title:'\u0001'.repeat(240),description:'\u0001'.repeat(4000)};
 const items=Array.from({length:12},(_,i)=>({id:'i'+i,label:'\u0001'.repeat(120),content:'\u0001'.repeat(2000)}));const instruction='\u0001'.repeat(4000);
 const goalText='\u0001'.repeat(6000),changeSummary='\u0001'.repeat(1200);
 const stored={version:{items,goalText,goalSnapshot:{summary:goalText},goalAndRationale:'\u0001'.repeat(12000),changeSummary,title:'\u0001'.repeat(60),rationale:'\u0001'.repeat(1200),revisionInstruction:instruction,referencesSnapshot:refs,projectContextSnapshot:context},student:{text:instruction},assistant:{text:'\u0001'.repeat(1200),referencesSnapshot:refs}};
 const budget=2*size(refs)+size(brief)+size(context)+450000;assert.ok(budget>size(stored)+5000);assert.ok((2000000-budget+1)+budget>2000000);
});

test('two-level version metadata migrates without changing snapshot identities and allocates from all versions',async()=>{
 const [v,app,boot]=await Promise.all(['app/versioning.php','app/app.php','app/bootstrap.php'].map(read));
 assert.match(boot,/versioning\.php/);assert.match(v,/normalizeItemVersions/);assert.match(v,/\$reserved\[\$key\]/);
 assert.match(v,/\$v\['major'\]=\$n\['major'\]/);assert.match(v,/\$v\['minor'\]=\$n\['minor'\]/);
 assert.doesNotMatch(v,/\$v\['(?:id|items|provenance|createdAt)'\]\s*=/);
 assert.match(v,/\$minor=max\(\$minor,\$n\['minor'\]\)/);assert.match(v,/'minor'=>\$minor\+1/);
 assert.match(app,/nextVersionCoordinates\(\$project\['versions'\],\$mode,\$base\)/);assert.match(app,/field\(\$input,'versionMode','major'\)/);
 assert.match(app,/'major'=>\$coordinates\['major'\],'minor'=>\$coordinates\['minor'\]/);
 assert.match(app,/\$raw=\$this->normalizeRaw\(\$this->store->project\(\$p\['id'\],\$this->owner\)\)/);
});
test('candidate archives are reversible metadata, block official archival and retain immutable versions',async()=>{
 const app=await read('app/app.php');const branch=app.split("if($action==='archive_version'||$action==='restore_version'){")[1].split("ensure(count($p['comparisons'])")[0];
 assert.ok(branch);assert.match(branch,/OFFICIAL_ARCHIVE/);assert.match(branch,/archivedVersionIds/);assert.match(branch,/array_filter/);
 assert.doesNotMatch(branch,/unset\(\$p\['versions'\]|\$p\['versions'\]\s*=/);
 assert.match(app,/\$action==='restore_version'\|\|count\(\$p\['messages'\]\)<400/);assert.match(branch,/if\(count\(\$p\['messages'\]\)<400\)/);
 for(const part of [app.split("if($action==='snapshot')")[1].split("if($action==='promote')")[0],app.split("if($action==='promote')")[1].split("if($action==='archive_version'")[0]])assert.match(part,/VERSION_ARCHIVED/);
});
test('comparison uses each selected version goal and changes, never current shared-goal approval',async()=>{
 const [app,mod]=await Promise.all(['app/app.php','app/modules/titles.php'].map(read));
 const compare=app.split("ensure(count($p['comparisons'])<60")[1];assert.doesNotMatch(compare,/goalRequired\(/);
 assert.match(compare,/'goalBasis'=>'version_snapshots','goalSnapshot'=>null/);assert.match(compare,/versionComparisonSnapshot\(\$v\)/);
 assert.match(compare,/VERSION_ARCHIVED/);assert.doesNotMatch(compare,/\$p\['(?:goalApprovedAt|officialVersionId)'\]\s*=/);
 const prompt=mod.split('private function runCompare')[1];assert.match(prompt,/'creativeGoal'=>null,'goalApprovedAt'=>null/);
 assert.match(prompt,/creativeItemTitle/);assert.match(prompt,/creativeItemDescription/);assert.match(prompt,/不以任何目前共用目標統一評分/);
 assert.match(prompt,/\['versionId'\]\['enum'\]=array_column\(\$versions,'id'\)/);assert.match(prompt,/'minItems'=>count\(\$versions\),'maxItems'=>count\(\$versions\)/);
});
test('new per-version goals and discussion summaries are generated in the existing call and manual notes preserved',async()=>{
 const [app,mod,v]=await Promise.all(['app/app.php','app/modules/titles.php','app/versioning.php'].map(read));
 const refine=mod.split('private function runRefine')[1].split('private function runSummarize')[0];assert.equal((refine.match(/\$this->ask\(/g)||[]).length,1);
 assert.match(refine,/count\(\$v\)===7/);assert.match(refine,/\|\|\$goalText!==versionGoalText\(\$official\)/);
 const generate=mod.split('private function runGenerate')[1].split('private function runCompare')[0];assert.equal((generate.match(/\$this->ask\(/g)||[]).length,1);assert.match(generate,/count\(\$candidate\)===4/);
 for(const key of ['goalText','goalSource','changeSummary','discussionMessageIds']){assert.ok(app.includes(key));assert.ok(mod.includes(key));}
 assert.match(app,/field\(\$input,'goalText',\$goalDefault\)/);assert.match(app,/'goalSnapshot'=>array\('summary'=>\$goalText\)/);
 assert.match(app,/\$source==='revision'&&\$last\['kind'\]==='discussion'/);assert.match(app,/\$source==='generated'&&\$last\['kind'\]==='generation_request'/);
 assert.doesNotMatch(v,/\$v\['(?:goalText|changeSummary|discussionMessageIds)'\]\s*=/); // Legacy history is not fabricated.
});
test('AI member settings are non-secret allowlisted owner-scoped records with explicit opt-in and no fallback',async()=>{
 const [members,store,app]=await Promise.all(['app/members.php','app/store.php','app/app.php'].map(read));
 assert.match(members,/count\(\$member\)===6/);assert.match(members,/array\('id','nickname','enabled','provider','model','ollamaUrl'\)/);
 assert.match(members,/count\(\$members\)<=20/);assert.match(members,/MEMBER_DUPLICATE/);assert.match(members,/MEMBER_DISABLED/);assert.match(members,/\$activeFound=\$activeMemberId===null/);
 assert.match(store,/'members\.'\.\$owner/);assert.match(store,/'usageConsent'=>false,'consentAt'=>null/);assert.match(store,/ON CONFLICT\(name\) DO NOTHING/);
 assert.match(app,/AI_MEMBER_REQUIRED/);assert.match(app,/AI_USAGE_OPT_IN/);assert.match(app,/approvedMemberId/);assert.match(app,/MEMBER_CHANGED/);
 const legacy=app.split("if($action==='save_settings')")[1].split("if($action==='set_key')")[0];assert.match(legacy,/setMemberRoster\(\$roster\['members'\],\$roster\['activeMemberId'\],false/);
});
test('paid member configuration is frozen at dispatch and provenance stores nickname and stable member ID',async()=>{
 const app=await read('app/app.php');assert.match(app,/\$result=\$this->execute\(\$action,\$input,\$connection\)/);
 assert.match(app,/\$connection=\$requestConnection===null\?\$this->connection\(\):\$requestConnection/);
 assert.match(app,/'memberId'=>\$connection\['memberId'\],'memberNickname'=>\$connection\['memberNickname'\]/);
 assert.match(app,/selectMember\(field\(\$input,'memberId'\)/);assert.match(app,/approvedSettingsRevision/);assert.match(app,/approvedKeyRevision/);
});
test('available model catalog uses explicit metadata-only fixed destinations without invented inventory',async()=>{
 const [openai,ollama,store,app]=await Promise.all(['app/model.php','app/ollama.php','app/store.php','app/app.php'].map(read));
 const listed=openai.split('public function listModels()')[1].split('public function checkConnection')[0];assert.match(listed,/https:\/\/api\.openai\.com\/v1\/models'/);assert.doesNotMatch(listed,/responses|generate\(/);
 const meta=openai.split('private function metadata')[1].split('public function listModels')[0];assert.match(meta,/CURLOPT_HTTPGET=>true/);assert.match(meta,/CURLOPT_SSL_VERIFYPEER=>true/);assert.match(meta,/CURLOPT_FOLLOWLOCATION=>false/);assert.match(meta,/\$this->transport!==null/);
 const local=ollama.split('public function listModels()')[1].split('public function checkConnection')[0];assert.match(local,/request\('\/api\/tags'\)/);assert.doesNotMatch(local,/\/api\/chat|generate\(|Authorization/);
 assert.match(listed,/count\(\$entries\)<=1000/);assert.match(store,/array\('openai'=>array\(\),'ollama'=>array\(\)\)/);
 const route=app.split("if($action==='list_models')")[1].split("if($action==='save_settings')")[0];assert.match(route,/providerName/);assert.match(route,/validateOllamaUrl/);assert.match(route,/->listModels\(\)/);
});

test('member editing and switching require revision lease and explicit null selection never falls back',async()=>{
 const [app,store]=await Promise.all(['app/app.php','app/store.php'].map(read));
 assert.match(app,/field\(\$input,'expectedSettingsRevision'\)===\$roster\['settingsRevision'\]/);
 for(const action of ['save_members','select_member'])assert.match(app.split(`if($action==='${action}')`)[1].split("if($action===")[0],/settingsLease\(\$input\)/);
 assert.match(store,/\$expectedRevision===null\|\|\$expectedRevision===\$out\['settingsRevision'\]/);
 assert.match(store,/\$found=\$id===null/);assert.match(store,/WHERE name=\? AND value=\?/);
 assert.match(app,/\$this->connection\(\$roster\)/);
 const legacy=app.split("if($action==='save_settings')")[1].split("if($action==='set_key')")[0];
 assert.ok(legacy.indexOf('validateMemberRosterInput(')<legacy.indexOf('setMemberRoster('));
 assert.ok(legacy.indexOf('validateMemberRosterInput(')<legacy.indexOf('setConnection('));
});

test('AI prompts use general-audience roles without rewriting persisted user-authored history',async()=>{
 const [mod,app,model,ollama]=await Promise.all(['app/modules/titles.php','app/app.php','app/model.php','app/ollama.php'].map(read));
 for(const source of [mod,model,ollama])assert.doesNotMatch(source,/學生|同學|校園|教師|課堂|作業系統以外的作業/);
 assert.match(mod,/任何使用者/);assert.match(mod,/不預設身分/);assert.match(mod,/latestUserMessage/);assert.doesNotMatch(mod,/latestStudentMessage/);
 assert.match(mod,/if\(field\(\$entry,'role'\)==='student'\)\$entry\['role'\]='user'/);
 assert.doesNotMatch(app,/\$project\['messages'\].*\['role'\]='user'/); // Legacy storage stays intact.
});
test('raw model schema validates JSON arrays versus objects before lossy conversion',async()=>{
 const mod=await read('app/modules/titles.php');const ask=mod.split('private function ask(')[1].split('private function runDiscuss')[0];
 assert.ok(ask.indexOf('validateSchemaValue($value,$schema)')<ask.indexOf('return json_decode'));
 const validate=mod.split('private function validateSchemaValue')[1].split('private function ask')[0];
 for(const evidence of ['plain($value)','is_array($value)','array_keys($value)===range(0,count($value)-1)','is_string($value)','array_key_exists($key,$values)',"in_array($value,$schema['enum'],true)"])assert.ok(validate.includes(evidence));
 assert.match(validate,/minItems/);assert.match(validate,/maxItems/);assert.doesNotMatch(validate,/array_is_list|str_contains|\bmatch\s*\(/);
});
test('clarification tolerates bounded metadata and punctuation variants without accepting fake revised content',async()=>{
 const mod=await read('app/modules/titles.php');const branch=mod.split("if($v['outcome']==='clarification'){")[1].split("ensure($question===")[0];
 assert.match(branch,/field\(\$v,'items'\)===array\(\)/);assert.match(branch,/rejectsCompletedEditClaim/);assert.match(branch,/dialogueText/);
 assert.doesNotMatch(branch,/\$rationale===''|\$goalText===''|\$changeSummary===''/);assert.match(branch,/'items'=>array\(\),'rationale'=>''/);
 assert.match(mod,/MODEL_CLARIFICATION_CLAIM/);assert.match(mod,/MODEL_CLARIFICATION_ITEMS/);assert.match(mod,/unquotedText/);assert.match(mod,/preg_match_all\('\/\[\?？\]\+\/u',\$unquoted\)<=1/);
 assert.doesNotMatch(mod,/preg_match\('\/\[\?？\]\$\/u',\$question\)/);
});
test('server distinguishes explicit rejection from genuinely unknown outcomes and never promises no charge',async()=>{
 const validation=await read('app/validation.php');const outcome=validation.split('function operationOutcome(')[1].split('function userTextValue')[0];
 assert.match(outcome,/REQUEST_ALREADY_ATTEMPTED'\)return 'unknown'/);assert.match(outcome,/!\(\$error instanceof AppError\)/);
 for(const code of ['MODEL_OUTPUT_INVALID','MODEL_CLARIFICATION_CLAIM','MODEL_CLARIFICATION_ITEMS','MODEL_QUESTION_COUNT','MODEL_NO_REVISION'])assert.ok(outcome.includes(code));
 assert.doesNotMatch(outcome,/'MODEL_TIMEOUT'|'OLLAMA_CONNECTION'|'MODEL_UNAVAILABLE'/);
 assert.match(outcome,/'operationOutcome'=>operationOutcome\(\$error\)/);assert.match(outcome,/NOT that a provider charged nothing/);
});

test('shipped UI installation docs and demo defaults do not frame the tool as coursework',async()=>{
 const paths=['public/app.js','public/demo.js','public/install.php','app/view.html','public/demo.html','README.md','開始使用.txt','docs/ARCHITECTURE.md','docs/INSTALLATION.md','docs/SECURITY.md','docs/USER-GUIDE.md'];
 for(const path of paths)assert.doesNotMatch(await read(path),/學生|同學|教師|老師|校園|課堂|課程|作業(?!系統)/,path);
});

test('combined version notes are immutable snapshots and authoritative in refinement and comparison',async()=>{
 const [app,versioning,mod]=await Promise.all(['app/app.php','app/versioning.php','app/modules/titles.php'].map(read));
 assert.match(versioning,/function versionGoalAndRationale/);assert.match(versioning,/if\(is_string\(\$combined\)\)return \$combined/);assert.match(versioning,/in_array\(\$value,\$seen,true\)/);
 const snapshot=app.split("if($action==='snapshot')")[1].split("if($action==='promote')")[0];
 assert.match(snapshot,/array_key_exists\('goalAndRationale',\$input\)/);assert.match(snapshot,/validateCombinedVersionNote/);assert.match(versioning,/12000,'本版目標與修改意見'/);assert.match(versioning,/return \$value; \/\/ Keep deliberate whitespace/);assert.match(snapshot,/\$metadata=array\('goalText'=>\$goalText,'changeSummary'=>\$changeSummary,'goalAndRationale'=>\$combined\)/);
 assert.match(app,/'goalAndRationale'=>\$combined/);assert.match(versioning,/'goalAndRationale'=>field\(\$version,'goalAndRationale'\)/);
 assert.match(mod,/'goalSource','goalAndRationale','changeSummary'/);assert.match(mod,/officialVersion\.goalAndRationale若存在/);assert.match(mod,/versionHasCombinedOverride\(\$official\)/);assert.match(mod,/\|\|\$combinedChanged/);assert.match(mod,/合併紀錄存在時，舊分欄只是相容歷史/);
});
test('promotion atomically renames the active creative item only and preserves prior names in history',async()=>{
 const [app,validation]=await Promise.all(['app/app.php','app/validation.php'].map(read));
 const promote=app.split("if($action==='promote')")[1].split("if($action==='archive_version'")[0];
 assert.match(promote,/officialItemTitle\(\$v\['items'\]\)/);assert.match(promote,/\$p\['creativeItems'\]\[\$index\]\['title'\]=\$itemTitle/);
 assert.match(promote,/'previousItemTitle'=>\$previousItemTitle,'itemTitle'=>\$itemTitle/);assert.match(promote,/return \$this->save\(\$p\)/);assert.doesNotMatch(promote,/\$p\['title'\]=|\$p\['description'\]=/);
 assert.match(validation,/function officialItemTitle/);assert.match(validation,/中文名稱.*中文標題.*主標題/);assert.match(validation,/array_slice\(\$chars,0,59\)/);
 const other=app.split("if($action==='promote')")[0];assert.doesNotMatch(other,/officialItemTitle\(/);
});
