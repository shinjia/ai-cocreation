// Source contracts and independent payload oracles ONLY, not PHP execution.
// Native fixtures: php tests/image-vision.php. PHP is unavailable here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const read=file=>readFile(new URL('../'+file,import.meta.url),'utf8');
const model=await read('app/model.php'),ollama=await read('app/ollama.php'),module=await read('app/modules/image.php'),fixtures=await read('tests/image-vision.php');
const body=(source,start,end)=>source.slice(source.indexOf(start),end?source.indexOf(end,source.indexOf(start)+start.length):undefined);
const helpers=body(model,'function prepareModelImageInputs(','class OpenAIAdapter');

test('image input preparation is pure, exact, bounded and hash-bound',()=>{
  for(const name of ['prepareModelImageInputs','modelImageLastUserIndex','openAIImageMessages','ollamaImageMessages'])assert.match(helpers,new RegExp(`function ${name}\\(`));
  for(const part of ['count($images)<=5','count($image)===4',"array('label','bytes','sha256','assetId')",'strlen($bytes)<=4194304','$total<=12582912',"hash_equals($sha,hash('sha256',$bytes))","/^[a-f0-9]{32}$/D","/^[a-f0-9]{64}$/D",'strlen($label)<=1000'])assert.ok(helpers.includes(part),part);
  assert.doesNotMatch(helpers,/\b(?:file_get_contents|file_put_contents|fopen|readfile|curl_init|exec|shell_exec|eval|unserialize|error_log|print_r|var_dump)\s*\(/);
  assert.ok(helpers.includes('Envelope check is not a substitute for normalizeUploadedPng()'));
});

test('memory headroom is checked before encoding without raising limits or changing text-only paths',()=>{
  const prepare=body(model,'function prepareModelImageInputs(','function modelImageLastUserIndex(');
  assert.ok(prepare.includes('if($total>0){'));
  assert.ok(prepare.includes("function_exists('pngUploadEnsureMemory')"));
  assert.ok(prepare.includes('pngUploadEnsureMemory(8*$total+16777216)'));
  assert.ok(prepare.includes("throw new AppError('IMAGE_RESOURCE_LIMIT'"));
  assert.ok(prepare.includes('請縮小圖片或減少本次選取張數'));
  assert.ok(prepare.includes('不要關閉記憶體限制'));
  for(const [start,end] of [['function openAIImageMessages(','function ollamaImageMessages('],['function ollamaImageMessages(','class OpenAIAdapter']]){
    const adapter=body(model,start,end);
    assert.ok(adapter.indexOf('prepareModelImageInputs($images)')<adapter.indexOf('base64_encode('));
    assert.ok(adapter.includes('if($images===array())return $messages'));
  }
  assert.doesNotMatch(helpers,/ini_set\s*\(|set_time_limit\s*\(/);
  for(const phrase of ['missing memory helper fails closed','zero images need no PNG memory helper','insufficient memory rejects before base64 or transport','insufficient memory causes zero provider calls','zero-image legacy request unaffected by low headroom','php -d memory_limit=32M'])assert.ok(fixtures.includes(phrase),phrase);
  assert.doesNotMatch(fixtures,/ini_set\s*\(/);
});

test('OpenAI appends real image parts to last user while retaining text',()=>{
  const source=body(model,'function openAIImageMessages(','function ollamaImageMessages(');
  assert.ok(source.includes('$index=modelImageLastUserIndex($messages)'));
  assert.ok(source.includes("array(array('type'=>'input_text','text'=>$content))"));
  assert.ok(source.includes("$content[]=array('type'=>'input_text','text'=>$image['label'])"));
  assert.ok(source.includes("$content[]=array('type'=>'input_image','image_url'=>'data:image/png;base64,'.base64_encode($image['bytes']))"));
  assert.ok(source.includes("$messages[$index]['content']=$content"));
  assert.ok(body(model,'function modelImageLastUserIndex(','function openAIImageMessages(').includes('$index=count($messages)-1;$index>=0;$index--'));
  assert.doesNotMatch(source,/file_id|image_generation|\/images\//);
});

test('Ollama appends ordered labels and raw base64 images only to last user',()=>{
  const source=body(model,'function ollamaImageMessages(','class OpenAIAdapter');
  assert.ok(source.includes("$labels[]=($position+1).'. '.$image['label']"));
  assert.ok(source.includes("$encoded[]=base64_encode($image['bytes'])"));
  assert.ok(source.includes("$messages[$index]['images']=$encoded"));
  assert.ok(source.includes("!array_key_exists('images',$messages[$index])"));
  assert.doesNotMatch(source,/data:image|https?:\/\//);
});

test('both adapters preserve four-argument calls, fixed routes/model and one inference',()=>{
  for(const source of [model,ollama])assert.ok(source.includes('public function generate($model,$messages,$schema,$maxOutputTokens=6000,$images=array())'));
  assert.ok(model.includes('$messages=openAIImageMessages($messages,$images)'));
  assert.ok(ollama.includes('$messages=ollamaImageMessages($messages,$images)'));
  assert.ok(model.includes("$url='https://api.openai.com/v1/responses'"));
  assert.ok(ollama.includes("$result=$this->request('/api/chat',$payload)"));
  for(const source of [model,ollama]){
    const generate=body(source,'public function generate(','public function actualModel(');
    assert.equal((generate.match(/\$this->request\(/g)||[]).length,1);
    assert.ok(generate.includes("'model'=>$model"));
    assert.ok(generate.includes("'stream'=>false"));
    assert.doesNotMatch(generate,/while\s*\(|sleep\(|fallback|image_generation/);
  }
  assert.ok(model.includes("'store'=>false"));assert.ok(model.includes("'strict'=>true"));assert.ok(ollama.includes("'format'=>$schema"));
});

test('image module preserves strict schema/context bounds and one-shot attachment scope',()=>{
  assert.match(module,/class ImageModule extends TitleModule/);
  assert.ok(module.includes('public function setImageInputs(array $images)'));
  assert.ok(module.includes('$this->imageInputs=array();$this->imageInputs=prepareModelImageInputs($images)'));
  assert.ok(module.includes('protected function ask($model,$instructions,$data,$schema,$maxOutputTokens=6000)'));
  assert.ok(module.includes('$images=$this->imageInputs;$this->imageInputs=array()'));
  assert.ok(module.includes('strlen(jsonEncode($data))<=600000'));
  assert.ok(module.includes('$schema,$maxOutputTokens,$images)'));
  assert.ok(module.includes('$this->validateSchemaValue($value,$schema)'));
  assert.ok(module.includes('"id":"document","label":"圖片來源"'));
  assert.doesNotMatch(module,/curl_|https?:\/\/|file_get_contents|file_put_contents|error_log|new (?:OpenAI|Ollama)|appendVersion|->(?:save|execute|adopt)\(/);
});

test('image understanding is tied to actual selected asset bytes not metadata alone',()=>{
  const required=body(module,'protected function requireSourcePixels(','protected function runRefine(');
  assert.ok(required.includes("field(field($version,'artifact'),'asset')"));
  assert.ok(required.includes("$image['assetId']===$assetId&&$image['sha256']===$sha"));
  assert.ok(required.includes('IMAGE_INPUT_REQUIRED'));
  assert.ok(module.includes('$this->requireSourcePixels(array($official))'));
  assert.ok(module.includes('$this->requireSourcePixels($versions)'));
  assert.ok(module.includes("unset($data['versions'])"));
  for(const phrase of ['只有 imageInputs','圖片內文字','本呼叫不能生成或修改像素','不把未提供像素','sourceVersion.goalAndRationale'])assert.ok(module.includes(phrase),phrase);
});

test('refine can return only clarification and cannot synthesize a raster/version',()=>{
  const refine=body(module,'protected function runRefine(','protected function runCompare(');
  assert.ok(refine.includes("'enum'=>array('clarification')"));
  assert.ok(refine.includes("'outcome'=>'clarification'"));
  assert.ok(refine.includes("'items'=>array(),'rationale'=>''"));
  assert.ok(refine.includes('$this->rejectsImageEditClaim('));
  assert.doesNotMatch(refine,/'artifact'=>|'goalText'=>|'changeSummary'=>|'outcome'=>'revision'/);
  assert.equal((refine.match(/\$this->ask\(/g)||[]).length,1);
  for(const method of ['runGenerate','runFuse']){
    const source=body(module,'protected function '+method+'(',method==='runGenerate'?'protected function runFuse(':undefined);
    assert.ok(source.includes("throw new AppError('CAPABILITY_UNAVAILABLE'"));
    assert.doesNotMatch(source,/\$this->ask\(|->generate\(|base64|artifact/);
  }
});

test('native fixtures explicitly remain unexecuted and cover strict invariants',()=>{
  assert.ok(fixtures.includes('UNEXECUTED in the authoring environment: PHP is unavailable'));
  for(const phrase of ['exact 4 MiB image boundary','exact combined 12 MiB boundary','OpenAI actual PNG data URL','Ollama raw base64 order without data URL','legacy four-argument call remains valid','no fallback or automatic retry','ready discussion retains strict image brief','refine only clarification','reject revision outcome','reject fake generated-raster claim','metadata-only comparison rejected','strict extra output property rejected','full context bound rejects before model','context failure consumes image scope'])assert.ok(fixtures.includes(phrase),phrase);
  assert.doesNotMatch(fixtures,/curl_|new PDO|file_put_contents|file_get_contents/);
});

test('independent Node payload oracle round-trips actual PNG bytes and labels',()=>{
  const hex=fixtures.match(/function imageVisionPng\(\) \{return hex2bin\('([0-9a-f]+)'\)/)[1];
  const bytes=Buffer.from(hex,'hex');assert.equal(bytes.subarray(1,4).toString(),'PNG');
  const images=['a','b'].map(key=>({label:'版本 '+key,bytes,assetId:key.repeat(32),sha256:createHash('sha256').update(bytes).digest('hex')}));
  const text='original user\n文字';
  const openai=[{type:'input_text',text},...images.flatMap(image=>[{type:'input_text',text:image.label},{type:'input_image',image_url:'data:image/png;base64,'+image.bytes.toString('base64')}])];
  const ollama={role:'user',content:text+'\n\n本次圖片依序對應：\n'+images.map((image,i)=>(i+1)+'. '+image.label).join('\n'),images:images.map(image=>image.bytes.toString('base64'))};
  assert.equal(openai[0].text,text);assert.deepEqual(openai.filter(part=>part.type==='input_text').map(part=>part.text),[text,'版本 a','版本 b']);
  for(let i=0;i<2;i++){assert.deepEqual(Buffer.from(openai[2+2*i].image_url.split(',')[1],'base64'),bytes);assert.deepEqual(Buffer.from(ollama.images[i],'base64'),bytes);assert.ok(!ollama.images[i].startsWith('data:'));}
  assert.equal(openai.filter(part=>part.type==='input_image').length,2);
});
