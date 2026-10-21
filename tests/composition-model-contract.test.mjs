// Executed source contracts and independent JavaScript oracles ONLY.
// These do not execute PHP, call providers, resolve media ownership, render the
// UI, or establish PHP syntax/runtime correctness. Native injected-model
// fixtures: php tests/composition-model.php (PHP is unavailable here).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=file=>readFile(new URL('../'+file,import.meta.url),'utf8');
const source=await read('app/modules/composition.php'),fixtures=await read('tests/composition-model.php'),base=await read('app/modules/titles.php');
const body=(text,start,end)=>{const i=text.indexOf(start);assert.ok(i>=0,`missing ${start}`);const j=end?text.indexOf(end,i+start.length):undefined;if(end)assert.ok(j>=0,`missing ${end}`);return text.slice(i,j);};
const method=(name,next)=>body(source,'protected function '+name+'(',next?'protected function '+next+'(':undefined);

test('composition module supports only illustrated and poster with shared fixed-model lifecycle',()=>{
  assert.match(source,/class CompositionModule extends TitleModule/);
  for(const part of ["public function __construct($model,$type)","array('illustrated','poster')",'parent::__construct($model)',"return $this->type",'protected function itemLimit() { return 1; }'])assert.ok(source.includes(part),part);
  assert.doesNotMatch(source,/function (?:runDiscuss|runSummarize|stableBrief|validateSchemaValue)\(/);
  assert.doesNotMatch(source,/new (?:OpenAI|Ollama|Responses)|curl_|\b(?:file_get_contents|file_put_contents|fopen|readfile|exec|shell_exec|eval|unserialize|base64_encode)\s*\(|->(?:save|execute|adopt|generate)\(/);
  assert.ok(source.includes('The application must resolve ownership and stored media before saving a result'));
});

test('brief uses accurate seven-field poster mapping and distinct document labels',()=>{
  const text=method('briefInstructions','artifactInstructions');
  for(const phrase of ['海報來源','圖文來源','tone=視覺風格','message=完整文字內容','constraints=圖文排列','purpose=用途','audience=受眾','summary=三部分的綜合方向','ready 只表示可以請使用者確認三部分','不要求填完問卷','不能把區塊拆成獨立創作項目','不是 AI 點陣圖片生成','沒有可用圖片時可生成純文字排版','沒有圖片像素'])assert.ok(text.includes(phrase),phrase);
  assert.ok(text.includes('{"id":"document","label":"'));
});

test('artifact instructions cover exact native schemas, literal text, full bounds and honest capabilities',()=>{
  const text=method('artifactInstructions','referencePool');
  for(const phrase of ['kind=poster、title、format、theme、blocks','kind=illustrated、title、theme、blocks','id、type、text、imageRefId、alignment','id、heading、body、layout、imageRefId、caption','portrait、square、landscape','paper、night、festival','paper、night、meadow','text、above、left、right','1至24項','2至16項','最多12000個 UTF8 位元組','最多2000個 UTF8 位元組','60000個 UTF8 位元組','32個小寫十六進位 id','不是 assetId、versionId、URL','沒有傳送或觀看圖片像素','所有文字原樣作純文字顯示','不能更新引用','不宣稱已匯出、印製、上線、部署、採用或定稿'])assert.ok((text+source).includes(phrase),phrase);
  assert.doesNotMatch(text,/input_image|image_url|response_format/);
});

test('reference pool uses selected historical snapshots before current pins and rejects identity refresh',()=>{
  const text=method('referencePool','imageReferenceMap');
  for(const part of ["field($source,'referencesSnapshot',array())","field($project,'references',array())","preg_match('/^[a-f0-9]{32}$/D',$id)","array('targetItemId','versionId')","field($snapshot,'id')===$ref['versionId']","jsonEncode($prior['versionSnapshot'])===jsonEncode($snapshot)",'COMPOSITION_REFERENCE_CONFLICT','count($out)<256','CONTEXT_LIMIT'])assert.ok(text.includes(part),part);
  assert.ok(text.indexOf("field($source,'referencesSnapshot'")<text.indexOf("field($project,'references'"));
  assert.doesNotMatch(text,/array_merge\(|array_replace\(|array_slice\(|substr\(/);
});

test('image metadata projection is allowlisted and cannot transport stored pixels or asset URLs',()=>{
  const text=method('modelReferences','imageMetadata');
  for(const part of ["array('id','projectId','targetItemId','targetItemTitle','versionId','pinnedAt')","field($source,'contentType')==='image'","validateImageArtifact($source['artifact'])","'title'=>$artifact['title']","'alt'=>$artifact['alt']","'attribution'=>$artifact['attribution']","'width'=>$artifact['asset']['width']","'height'=>$artifact['asset']['height']","'mime'=>$artifact['asset']['mime']","'pixelsProvided'=>false"])assert.ok(text.includes(part),part);
  assert.doesNotMatch(text,/'(?:bytes|data|base64|url|path|image_url|assetId|sha256)'\s*=>/);
  const imageBranch=body(text,"if(field($source,'contentType')==='image'){",'}else');
  assert.doesNotMatch(imageBranch,/\$entry\['versionSnapshot'\]=\$source|\$entry\['versionSnapshot'\].*\$artifact[,;]/);
  assert.ok(method('context','ask').includes("$safeProject['references']=$this->modelReferences($references)"));
  assert.ok(method('context','ask').includes("unset($data['versions'])"));
  assert.ok(method('context','ask').includes("$data['imagePixelsProvided']=false"));
});

test('requests use bounded inherited text-only generation and responses have an explicit complete-envelope limit',()=>{
  const text=method('ask','artifactWithReferences');
  assert.equal((text.match(/parent::ask\(/g)||[]).length,1);
  assert.ok(text.includes('不可聲稱視覺評估過圖片，也不生成或修改圖片像素'));
  assert.ok(text.includes('strlen(jsonEncode($value))<=90000'));
  assert.ok(base.includes("$this->moduleType()==='titles'?240000:600000"));
  assert.ok(base.includes('$schema,$maxOutputTokens)'));
  assert.doesNotMatch(text,/imageInputs|prepareModelImageInputs|setImageInputs|while\s*\(|for\s*\(|catch\s*\(/);
});

test('every artifact imageRefId must resolve to an existing image pin with before-call source errors',()=>{
  const map=method('imageReferenceMap','modelReferences'),text=method('artifactWithReferences','usedReferences');
  assert.ok(map.includes("field($ref['versionSnapshot'],'contentType')==='image'"));
  for(const part of ["validateCompositionArtifact($value,$this->type)","foreach($artifact['blocks'] as $block)","$block['imageRefId']!==''","isset($map[$block['imageRefId']])","'COMPOSITION_REFERENCE_MISSING':'MODEL_IMAGE_REFERENCE_INVALID'","$source?409:502"])assert.ok(text.includes(part),part);
  assert.ok(method('sourceSnapshot','selectedData').includes("$this->artifactWithReferences(field($source,'artifact'),$references,true)"));
});

test('result referencesSnapshot contains exact used pins, never autoattached or refreshed references',()=>{
  const text=method('usedReferences','contentFingerprint');
  assert.ok(text.includes("array_column($artifact['blocks'],'imageRefId')"));
  assert.ok(text.includes("if(in_array($ref['id'],$ids,true))$out[]=$ref"));
  const result=method('candidateResult','runGenerate');
  assert.ok(result.includes("'referencesSnapshot'=>$this->usedReferences($artifact,$references)"));
  assert.ok(result.includes("'items'=>compositionItems($artifact,$this->type)"));
  assert.doesNotMatch(source,/newId\(|appendVersion\(|->(?:addReference|refreshReference|prepareImageInputs|setImageInputs)\(/);
});

test('fingerprint prevents both block-ID churn and aliases to the exact same fixed image version',()=>{
  const text=method('contentFingerprint','candidateProperties');
  assert.ok(text.includes("$key=$ref['targetItemId'].':'.$ref['versionId']"));
  assert.ok(text.includes('if(!isset($aliases[$key]))$aliases[$key]=$id'));
  assert.ok(text.includes("$block['imageRefId']=$aliases[$ref['targetItemId'].':'.$ref['versionId']]"));
  assert.ok(text.includes('compositionContentFingerprint($artifact,$this->type)'));
  assert.doesNotMatch(text,/sort\(|ksort\(|trim\(|strtolower\(|array_unique\(/);
});

test('generation is exactly one complete candidate using the supplied native schema',()=>{
  const text=method('runGenerate','sourceSnapshot');
  assert.equal((text.match(/\$this->ask\(/g)||[]).length,1);
  assert.ok(text.includes("validateModuleItemDefinitions($project['brief']['items'],$this->type)"));
  assert.ok(text.includes("'minItems'=>1,'maxItems'=>1"));
  assert.ok(text.includes('$this->schema($props),24000'));
  assert.ok(text.includes("$this->candidateResult($v['candidates'][0],'候選',$references)"));
  assert.ok(method('candidateProperties','candidateResult').includes("'artifact'=>compositionSchema($this->type)"));
});

test('refinement receives exact source and historical pins, not adoption or mutable shared goals as authority',()=>{
  const text=method('runRefine','runFuse');
  assert.equal((text.match(/\$this->ask\(/g)||[]).length,1);
  assert.ok(text.indexOf('TARGET_ITEMS_INVALID')<text.indexOf('$this->ask('));
  for(const part of ['$this->referencePool($project,array($source))',"$data['sourceVersion']=$this->creativeVersions(array($source))[0]","$data['latestUserMessage']=$text",'sourceVersion.goalAndRationale','沒有合併紀錄才用 goalText','versionHasCombinedOverride($source)',"'referencesSnapshot'=>$this->usedReferences($artifact,$references)"])assert.ok(text.includes(part),part);
  assert.ok(text.includes('沒有生成、檢視或修改圖片像素'));
});

test('clarification requires an exact canonical source echo then discards artifacts, metadata and pins',()=>{
  const text=body(source,"if($v['outcome']==='clarification'){","ensure($question===''&&$choices===array()");
  assert.ok(text.includes("compositionCompactJson($artifact,$this->type)===compositionCompactJson($source['artifact'],$this->type)"));
  assert.ok(text.includes('MODEL_CLARIFICATION_ARTIFACT'));
  assert.ok(text.includes('rejectsCompletedEditClaim'));
  assert.ok(text.includes("'items'=>array(),'rationale'=>''"));
  assert.doesNotMatch(text,/'artifact'=>|'goalText'=>|'changeSummary'=>|'referencesSnapshot'=>|appendVersion/);
});

test('even changed goals cannot license ID-only edits; true goal-only revisions preserve the whole artifact',()=>{
  const text=method('runRefine','runFuse');
  const ids="ensure($contentChanged||!$artifactChanged,'MODEL_NO_REVISION'";
  const goal='ensure($contentChanged||$goalText!==versionGoalText($source)||$combinedChanged';
  assert.ok(text.includes(ids));assert.ok(text.includes(goal));assert.ok(text.indexOf(ids)<text.indexOf(goal));
  assert.ok(text.includes("$contentChanged=$this->contentFingerprint($artifact,$references)!==$this->contentFingerprint($source['artifact'],$references)"));
  assert.ok(text.includes('此候選僅更新本版目標，完整排版保持原樣'));
  assert.ok(text.includes("'reply'=>$revisionReply"));
});

test('fusion uses bounded selected source snapshots and rejects a copy of any source or invisible alias churn',()=>{
  const text=method('runFuse','runCompare'),data=method('selectedData','selectedSources'),selection=method('selectedSources','runRefine');
  assert.equal((text.match(/\$this->ask\(/g)||[]).length,1);
  assert.ok(selection.includes('count($versions)>=2&&count($versions)<=5'));
  assert.ok(selection.includes('!in_array($id,$ids,true)'));
  assert.ok(data.includes("'creativeGoal'=>null,'goalApprovedAt'=>null"));
  assert.ok(data.includes("'selectedVersions'=>$this->creativeVersions($sources)"));
  assert.ok(text.includes("$content=$this->contentFingerprint($result['artifact'],$references)"));
  assert.ok(text.includes("foreach($sources as $source)ensure($content!==$this->contentFingerprint($source['artifact'],$references)"));
  assert.ok(text.includes('$this->schema($this->candidateProperties()),24000'));
  assert.ok(text.includes('這是文字與排版的融合，不是圖片像素融合'));
  assert.doesNotMatch(text,/\$project\['brief'\]/);
});

test('comparison evaluates each own version goal and selected metadata without claiming pixel assessment',()=>{
  const text=method('runCompare');
  for(const part of ["'versionId','fit','strength','tradeoff','suggestion'",'自己的 goalAndRationale','沒有合併紀錄才用 goalText','模型沒有圖片像素','不能臆測實際印製或排版渲染結果','不指定唯一冠軍','沒有檢視圖片像素','!in_array($id,$seen,true)','$this->schema($props),6000'])assert.ok(text.includes(part),part);
  assert.doesNotMatch(text,/setImageInputs|prepareModelImageInputs|image_url|input_image|\$project\['brief'\]/);
});

test('native fixture disclosures and coverage distinguish authored tests from executed PHP',()=>{
  assert.ok(fixtures.includes('UNEXECUTED in the authoring environment: PHP is unavailable'));
  assert.ok(fixtures.includes("require_once dirname(__DIR__).'/app/bootstrap.php'"));
  assert.ok(fixtures.includes("foreach(array('illustrated','poster') as $type)"));
  for(const phrase of ['one bounded fixed-text-model call without image input or retry','honest text-only layout works without fake images','complete context budget rejects before model','goal-only revision requires exact unchanged artifact','combined goal change cannot authorize ID-only artifact churn','removed current pin is preserved from explicit source snapshot','missing historical pin blocks before inference','historical pin cannot silently refresh to another version','same fixed-image alias is not a visible revision','explicitly pinned different image is allowed','fusion rejects alias-only copy of source','comparison uses complete selected snapshots','all input project and source snapshots stay immutable'])assert.ok(fixtures.includes(phrase),phrase);
  assert.doesNotMatch(fixtures,/curl_|new PDO|new ResponsesClient|file_put_contents/);
});

// Independent logic oracle. These functions exercise policy examples in JS,
// not the implementation under test and never represent PHP runtime coverage.
const id=value=>value.repeat(32);
const pin=(reference='1',version='a')=>({id:id(reference),targetItemId:id('d'),versionId:id(version),versionSnapshot:{id:id(version),contentType:'image',artifact:{kind:'image',title:'圖片',alt:'替代文字',attribution:'使用者',asset:{id:id('e'),mime:'image/png',width:640,height:480,byteLength:1024,sha256:'f'.repeat(64),normalization:'png-v1'}}}});
function oraclePool(current,sources=[]){
  const map=new Map();for(const group of [...sources.map(s=>s.referencesSnapshot??[]),current])for(const ref of group){
    if(!/^[a-f0-9]{32}$/.test(ref.id)||ref.versionId!==ref.versionSnapshot.id)throw new Error('identity');
    const previous=map.get(ref.id);if(previous&&JSON.stringify([previous.targetItemId,previous.versionId,previous.versionSnapshot])!==JSON.stringify([ref.targetItemId,ref.versionId,ref.versionSnapshot]))throw new Error('conflict');
    if(!previous)map.set(ref.id,structuredClone(ref));
  }return [...map.values()];
}
function oracleFingerprint(artifact,references){
  const map=new Map(references.filter(r=>r.versionSnapshot.contentType==='image').map(r=>[r.id,r])),aliases=new Map();
  for(const ref of map.values()){const key=ref.targetItemId+':'+ref.versionId;if(!aliases.has(key))aliases.set(key,ref.id);}
  const result=structuredClone(artifact);for(const block of result.blocks){delete block.id;if(block.imageRefId){const ref=map.get(block.imageRefId);if(!ref)throw new Error('missing image pin');block.imageRefId=aliases.get(ref.targetItemId+':'+ref.versionId);}}return JSON.stringify(result);
}
const illustrated=()=>({kind:'illustrated',title:'影展',theme:'paper',blocks:[{id:'intro',heading:'介紹',body:' 保留文字\n ',layout:'left',imageRefId:id('1'),caption:'說明'},{id:'more',heading:'',body:'更多內容',layout:'text',imageRefId:'',caption:''}]});

test('independent oracle: source pin survives removal, retains exact snapshot, and conflicting refresh fails closed',()=>{
  const original=pin(),sourceVersion={referencesSnapshot:[original]},before=JSON.stringify(sourceVersion);
  assert.deepEqual(oraclePool([], [sourceVersion]),[original]);
  assert.deepEqual(oraclePool([original],[sourceVersion]),[original]);
  assert.throws(()=>oraclePool([pin('1','9')],[sourceVersion]),/conflict/);
  assert.equal(JSON.stringify(sourceVersion),before);
});

test('independent oracle: unknown reference or non-image pin cannot authorize an image block',()=>{
  assert.throws(()=>oracleFingerprint(illustrated(),[]),/missing image pin/);
  const nonImage=pin();nonImage.versionSnapshot.contentType='short_text';
  assert.throws(()=>oracleFingerprint(illustrated(),[nonImage]),/missing image pin/);
  const fake=illustrated();fake.blocks[0].imageRefId=id('e');
  assert.throws(()=>oracleFingerprint(fake,[pin()]),/missing image pin/);
});

test('independent oracle: block identifiers and duplicate-pin aliases cannot manufacture a revision',()=>{
  const artifact=illustrated(),renamed=structuredClone(artifact),aliased=structuredClone(artifact),refs=[pin(),pin('2')];
  renamed.blocks.forEach(block=>block.id='new_'+block.id);aliased.blocks[0].imageRefId=id('2');
  assert.equal(oracleFingerprint(artifact,refs),oracleFingerprint(renamed,refs));
  assert.equal(oracleFingerprint(artifact,refs),oracleFingerprint(aliased,refs));
  assert.notEqual(JSON.stringify(artifact),JSON.stringify(renamed));
  assert.notEqual(JSON.stringify(artifact),JSON.stringify(aliased));
});

test('independent oracle: every rendered text, theme, order, layout and fixed image change stays observable',()=>{
  const artifact=illustrated(),refs=[pin(),pin('3','9')],fingerprint=oracleFingerprint(artifact,refs);
  const edits=[v=>v.title='新標題',v=>v.theme='night',v=>v.blocks.reverse(),v=>v.blocks[0].body+=' ',v=>v.blocks[0].heading='新段落',v=>v.blocks[0].caption='新圖說',v=>v.blocks[0].layout='right',v=>v.blocks[0].imageRefId=id('3')];
  for(const edit of edits){const changed=structuredClone(artifact);edit(changed);assert.notEqual(oracleFingerprint(changed,refs),fingerprint);}
});

test('independent oracle: a goal edit allows unchanged artifact only, not invisible ID churn',()=>{
  const previous=illustrated(),refs=[pin()],allow=(next,goalChanged)=>{
    const artifactChanged=JSON.stringify(next)!==JSON.stringify(previous),contentChanged=oracleFingerprint(next,refs)!==oracleFingerprint(previous,refs);
    return (contentChanged||!artifactChanged)&&(contentChanged||goalChanged);
  };
  assert.equal(allow(previous,false),false);assert.equal(allow(previous,true),true);
  const renamed=structuredClone(previous);renamed.blocks[0].id='new_id';assert.equal(allow(renamed,false),false);assert.equal(allow(renamed,true),false);
  const changed=structuredClone(previous);changed.theme='night';assert.equal(allow(changed,false),true);
});
