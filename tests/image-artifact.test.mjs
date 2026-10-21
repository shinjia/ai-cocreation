// Executed JS validators and minimal mocked DOM only, not a real browser.
// PHP source contracts below do not execute PHP; native fixtures remain separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import {validateImageArtifact,imageArtifactItems,imageArtifactFromItems,createImagePreview,createImageEditor} from '../public/image.js';

const PNG_BASE64='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
const PNG=Buffer.from(PNG_BASE64,'base64');
const SHA256='4ff6ab670a58c14270e034e2090d9a432caa263a14e0a25785386b0c12f880b5';
const sample=()=>({kind:'image',title:'  外部圖片 <標題> & "測試"\r\n ',alt:'紅色像素 🐻\nhttps://example.invalid  ',attribution:'原作者\t外部上傳',asset:{id:'0123456789abcdef0123456789abcdef',mime:'image/png',width:1,height:1,byteLength:PNG.length,sha256:SHA256,normalization:'png-v1'}});
const copy=value=>JSON.parse(JSON.stringify(value));
const changed=(operation,value=sample())=>{operation(value);return value;};
const invalid=(value,pattern)=>assert.match(validateImageArtifact(value),pattern);
const pngBlob=()=>new Blob([PNG],{type:'image/png'});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const read=file=>readFile(new URL('../'+file,import.meta.url),'utf8');

class FixtureNode{
  constructor(tag,document){this.tagName=tag.toUpperCase();this.ownerDocument=document;this.children=[];this.parentNode=null;this.attributes={};this.listeners={};this.className='';this.disabled=false;this._text='';this.value='';}
  get id(){return this.attributes.id||'';}set id(value){this.attributes.id=String(value);}
  get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}set textContent(value){this._text=String(value);this.children=[];}
  setAttribute(name,value){this.attributes[name]=String(value);if(name==='class')this.className=String(value);}
  getAttribute(name){return this.attributes[name]??null;}
  removeAttribute(name){delete this.attributes[name];}
  append(...nodes){nodes.forEach(node=>{assert.ok(node instanceof FixtureNode);node.parentNode=this;this.children.push(node);});}
  replaceChildren(...nodes){this.children.forEach(node=>node.parentNode=null);this.children=[];this._text='';this.append(...nodes);}
  matches(selector){return selector.startsWith('.')?this.className.split(' ').includes(selector.slice(1)):selector.startsWith('#')?this.id===selector.slice(1):this.tagName===selector.toUpperCase();}
  querySelectorAll(selector){const result=[];const visit=node=>node.children.forEach(child=>{if(child.matches(selector))result.push(child);visit(child);});visit(this);return result;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  addEventListener(type,listener){(this.listeners[type]??=[]).push(listener);}
  async dispatch(type){const event={type,target:this,preventDefault(){}};for(const listener of this.listeners[type]||[])await listener(event);return event;}
}
function fixture(){
  const created=[],revoked=[],document={createElement(tag){return new FixtureNode(tag,this);},defaultView:{Blob,URL:{createObjectURL(blob){assert.ok(blob instanceof Blob);const url='blob:fixture/'+created.length;created.push({url,blob});return url;},revokeObjectURL(url){revoked.push(url);}}}};
  document.body=document.createElement('body');return {document,created,revoked};
}
const allNodes=root=>[root,...root.children.flatMap(allNodes)];
function control(root,name){const label=root.querySelectorAll('label').find(node=>node.textContent===name);assert.ok(label,name);return root.querySelector('#'+label.getAttribute('for'));}
function button(root,label){const node=root.querySelectorAll('button').find(node=>node.textContent===label);assert.ok(node,label);return node;}
async function fill(root,label,value){const input=control(root,label);input.value=value;await input.dispatch('input');return input;}
function editor(value=sample(),options={}){const env=fixture(),snapshots=[],pending=[],uiState={},root=createImageEditor(env.document,value,{onChange:value=>snapshots.push(value),onPendingChange:value=>pending.push(value),uiState,...options});env.document.body.append(root);return {...env,root,snapshots,pending,uiState};}

test('fixture contains actual one-pixel RGBA PNG bytes, dimensions, scanline, and matching SHA256',()=>{
  assert.equal(PNG.length,70);assert.equal(PNG.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(PNG.readUInt32BE(16),1);assert.equal(PNG.readUInt32BE(20),1);assert.equal(PNG[24],8);assert.equal(PNG[25],6);
  assert.equal(PNG.subarray(37,41).toString(),'IDAT');assert.deepEqual(inflateSync(PNG.subarray(41,54)),Buffer.from([0,255,0,0,255]));
  assert.equal(createHash('sha256').update(PNG).digest('hex'),SHA256);assert.equal(validateImageArtifact(sample()),'');
});
test('literal metadata survives canonical clone and one-document JSON projection without reinterpreting URLs or markup',()=>{
  const value=sample();value.title=' \t<script>alert(1)</script> 🐻\r\n\u2028\u2029 ';value.alt='<img src="https://bad.invalid" onerror="x">';value.attribution='javascript:literal';
  const items=imageArtifactItems(value);assert.equal(items.length,1);assert.equal(items[0].id,'document');assert.equal(items[0].label,'圖片來源');
  assert.match(items[0].content,/\\u2028\\u2029/);assert.deepEqual(JSON.parse(items[0].content),value);assert.deepEqual(imageArtifactFromItems(items),value);
  const reversed=Object.fromEntries(Object.entries(value).reverse());reversed.asset=Object.fromEntries(Object.entries(value.asset).reverse());assert.deepEqual(imageArtifactItems(reversed),items);
  const clone=imageArtifactFromItems(items);clone.asset.width=2;assert.equal(value.asset.width,1);
});
test('exact object keys reject paths, URLs, raw bytes, missing fields, hidden and symbol properties',()=>{
  for(const value of [null,undefined,[],false,1,'image'])invalid(value,/完整物件/);
  for(const key of ['url','src','path','bytes','base64','html'])invalid({...sample(),[key]:'https://example.invalid'},/未支援/);
  invalid(changed(v=>delete v.alt),/缺少/);invalid({...sample(),kind:'png'},/類型/);
  for(const key of ['url','src','file','owner','projectId'])invalid(changed(v=>v.asset[key]='value'),/未支援/);
  for(const asset of [null,[],false,'x'])invalid({...sample(),asset},/完整物件/);
  const hidden=sample();Object.defineProperty(hidden.asset,'hidden',{value:1});invalid(hidden,/未支援/);
  const symbol=sample();symbol[Symbol('hidden')]=1;invalid(symbol,/未支援/);
  invalid(changed(v=>delete v.asset.sha256),/缺少/);
});
test('UTF8 byte boundaries, title nonblank, optional empty strings, invalid Unicode and secret guard',()=>{
  for(const [key,max] of [['title',600],['alt',3000],['attribution',2000]]){
    assert.equal(validateImageArtifact(changed(v=>v[key]='x'.repeat(max))),'');invalid(changed(v=>v[key]='x'.repeat(max+1)),/超過/);
    assert.equal(validateImageArtifact(changed(v=>v[key]='字'.repeat(Math.floor(max/3)))),'');invalid(changed(v=>v[key]='字'.repeat(Math.floor(max/3)+1)),/超過/);
    for(const bad of [null,1,false,'a\0b','\ud800','\udfff'])invalid(changed(v=>v[key]=bad),/有效 UTF8/);
    invalid(changed(v=>v[key]='sk-'+'x'.repeat(20)),/請勿.*API Key/);
  }
  for(const title of ['', ' \t\r\n','\u3000\u00a0\uFEFF'])invalid({...sample(),title},/空白/);
  assert.equal(validateImageArtifact({...sample(),alt:'',attribution:''}),'');
});
test('asset ID, hash, MIME, integer dimensions, byte limits and normalization are exact',()=>{
  for(const [key,length] of [['id',32],['sha256',64]]){
    for(const bad of ['a'.repeat(length-1),'a'.repeat(length+1),'A'.repeat(length),'g'.repeat(length),'a'.repeat(length)+'\n',null,1])invalid(changed(v=>v.asset[key]=bad),/小寫十六進位/);
    assert.equal(validateImageArtifact(changed(v=>v.asset[key]='0'.repeat(length))),'');
  }
  for(const mime of ['image/jpeg','image/svg+xml','IMAGE/PNG','image/png; charset=utf-8',null])invalid(changed(v=>v.asset.mime=mime),/格式/);
  for(const key of ['width','height','byteLength']){
    const max=key==='byteLength'?4194304:2048;
    for(const bad of [0,-1,max+1,1.5,NaN,Infinity,'1',true,null])invalid(changed(v=>v.asset[key]=bad),/整數/);
    for(const valid of [1,max])assert.equal(validateImageArtifact(changed(v=>v.asset[key]=valid)),'');
  }
  for(const value of ['png-v2','PNG-V1','',1])invalid(changed(v=>v.asset.normalization=value),/正規化/);
  // A well-formed but invented reference still validates. Ownership and bytes
  // must be checked by application storage, never guessed by pure validators.
  assert.equal(validateImageArtifact(changed(v=>{v.asset.id='f'.repeat(32);v.asset.sha256='f'.repeat(64);})), '');
});
test('FromItems rejects wrong collection and item shapes, malformed JSON, arrays and unbounded source',()=>{
  const item=imageArtifactItems(sample())[0];
  for(const items of [null,{},[],[item,item],{0:item},[undefined]])assert.throws(()=>imageArtifactFromItems(items));
  const sparse=Array(1);assert.throws(()=>imageArtifactFromItems(sparse));const extra=[item];extra.extra=1;assert.throws(()=>imageArtifactFromItems(extra));
  const symbolic=[item];symbolic[Symbol('hidden')]=1;assert.throws(()=>imageArtifactFromItems(symbolic));
  for(const bad of [{...item,id:'image'},{...item,label:'圖片'},{...item,extra:0},{...item,content:'{'},{...item,content:'[]'},{...item,content:'null'},{...item,content:' '.repeat(60001)}])assert.throws(()=>imageArtifactFromItems([bad]));
  for(const mutate of [v=>v.asset=[],v=>v.asset.url='https://bad.invalid',v=>v.alt=null])assert.throws(()=>imageArtifactFromItems([{...item,content:JSON.stringify(changed(mutate))}]));
});
test('preview without loader or object-URL support is honest, inert, and does not invent a placeholder image',async()=>{
  const {document}=fixture(),root=createImagePreview(document,sample());assert.equal(root.tagName,'FIGURE');assert.equal(root.querySelectorAll('img').length,0);assert.match(root.textContent,/目前無法預覽/);assert.match(root.textContent,/已保存圖片版本；原始來源請見版本紀錄/);assert.equal(typeof root.disposeImagePreview,'function');root.disposeImagePreview();root.disposeImagePreview();
  let calls=0;document.defaultView.URL={createObjectURL(){throw new Error('must not run without revoke');}};
  const unavailable=createImagePreview(document,sample(),{loadImage(){calls++;return pngBlob();}});await tick();assert.equal(calls,0);assert.match(unavailable.textContent,/不支援/);
});
test('preview uses only parent-loaded PNG Blob, renders all user strings literally, and cleans up exactly once',async()=>{
  const env=fixture(),artifact=sample();artifact.title='<script>literal</script>';artifact.alt='" onerror="literal <img src=x>';artifact.attribution='<a href="https://bad.invalid">not a link</a>';
  const loaded=[],root=createImagePreview(env.document,artifact,{loadImage(value){loaded.push(value);value.title='loader changes its isolated clone';return Promise.resolve(pngBlob());}});
  assert.equal(env.created.length,0);await tick();assert.equal(loaded.length,1);assert.notStrictEqual(loaded[0],artifact);assert.equal(artifact.title,'<script>literal</script>');
  const img=root.querySelector('img');assert.ok(img);assert.equal(img.getAttribute('src'),'blob:fixture/0');assert.equal(img.getAttribute('alt'),artifact.alt);assert.equal(img.getAttribute('width'),'1');
  assert.equal(root.querySelector('h4').textContent,artifact.title);assert.ok(root.textContent.includes(artifact.attribution));assert.equal(root.querySelectorAll('a').length,0);
  assert.ok(allNodes(root).every(node=>!['SCRIPT','IFRAME','STYLE'].includes(node.tagName)));assert.ok(allNodes(root).every(node=>!Object.keys(node.attributes).some(key=>key.startsWith('on'))));
  await img.dispatch('load');assert.match(root.textContent,/已顯示保存/);assert.deepEqual(env.revoked,[]);
  root.disposeImagePreview();root.disposeImagePreview();assert.deepEqual(env.revoked,['blob:fixture/0']);assert.equal(img.getAttribute('src'),null);assert.equal(root.querySelectorAll('img').length,0);await img.dispatch('load');assert.match(root.textContent,/已關閉/);
});
test('disposing before loader starts or before late loader resolution never creates an object URL or calls errors',async()=>{
  const env=fixture();let calls=0,resolve,reject;const errors=[];
  const before=createImagePreview(env.document,sample(),{loadImage(){calls++;return pngBlob();}});before.disposeImagePreview();await tick();assert.equal(calls,0);
  const late=createImagePreview(env.document,sample(),{loadImage(){calls++;return new Promise(done=>resolve=done);},onError:error=>errors.push(error)});await tick();late.disposeImagePreview();resolve(pngBlob());await tick();assert.equal(calls,1);assert.deepEqual(env.created,[]);assert.deepEqual(errors,[]);
  const failure=createImagePreview(env.document,sample(),{loadImage(){return new Promise((done,fail)=>reject=fail);},onError:error=>errors.push(error)});await tick();failure.disposeImagePreview();reject(new Error('late failure'));await tick();assert.deepEqual(errors,[]);
});
test('preview rejects URL strings, Blob impostors, non-PNG and wrong lengths without creating object URLs',async()=>{
  for(const result of ['https://bad.invalid/image.png','data:image/png;base64,x',{type:'image/png',size:70},new Blob([PNG],{type:'image/svg+xml'}),new Blob(['x'],{type:'image/png'}),null]){
    const env=fixture(),errors=[],root=createImagePreview(env.document,sample(),{loadImage:()=>result,onError:error=>errors.push(error)});await tick();assert.equal(errors.length,1);assert.match(errors[0].message,/PNG Blob/);assert.equal(env.created.length,0);assert.equal(root.querySelectorAll('img').length,0);assert.match(root.textContent,/無法載入/);
  }
});
test('loader throws, rejected promise, host URL failure and image decoding error have bounded failure and cleanup',async()=>{
  for(const loadImage of [()=>{throw new Error('sync failure');},()=>Promise.reject(new Error('async failure'))]){
    const env=fixture(),errors=[],root=createImagePreview(env.document,sample(),{loadImage,onError:error=>{errors.push(error);throw new Error('consumer failure');}});await tick();assert.equal(errors.length,1);assert.equal(env.created.length,0);assert.match(root.textContent,/無法載入/);
  }
  const env=fixture(),errors=[],root=createImagePreview(env.document,sample(),{loadImage:pngBlob,onError:error=>errors.push(error)});await tick();const img=root.querySelector('img');await img.dispatch('error');await img.dispatch('error');await img.dispatch('load');assert.equal(errors.length,1);assert.deepEqual(env.revoked,['blob:fixture/0']);assert.equal(root.querySelectorAll('img').length,0);assert.match(root.textContent,/無法載入/);root.disposeImagePreview();assert.deepEqual(env.revoked,['blob:fixture/0']);
  const broken=fixture();broken.document.defaultView.URL.createObjectURL=()=>{throw new Error('host failure');};const failed=createImagePreview(broken.document,sample(),{loadImage:pngBlob});await tick();assert.match(failed.textContent,/無法載入/);
});
test('preview rejects a non-blob host result and releases a URL created during synchronous disposal',async()=>{
  const unsafe=fixture();unsafe.document.defaultView.URL.createObjectURL=()=> 'https://bad.invalid/';const blocked=createImagePreview(unsafe.document,sample(),{loadImage:pngBlob});await tick();assert.equal(blocked.querySelectorAll('img').length,0);assert.match(blocked.textContent,/無法載入/);assert.deepEqual(unsafe.revoked,['https://bad.invalid/']);
  const env=fixture();let root;env.document.defaultView.URL.createObjectURL=()=>{root.disposeImagePreview();return 'blob:reentrant';};root=createImagePreview(env.document,sample(),{loadImage:pngBlob});await tick();assert.deepEqual(env.revoked,['blob:reentrant']);assert.equal(root.querySelectorAll('img').length,0);
  let calls=0;assert.throws(()=>createImagePreview(env.document,changed(v=>v.asset.url='https://bad.invalid'),{loadImage(){calls++;return pngBlob();}}));await tick();assert.equal(calls,0);
});
test('metadata editor only exposes three textareas and explicit apply/discard; saving preserves asset exactly',async()=>{
  const original=sample(),env=editor(original);assert.equal(env.root.querySelectorAll('textarea').length,3);assert.equal(env.root.querySelectorAll('input').length,0);assert.equal(env.root.querySelectorAll('img').length,0);assert.deepEqual(env.pending,[false]);
  const literal='  新標題\r\n<script>not executed</script> ';await fill(env.root,'圖片標題',literal);await fill(env.root,'圖片替代文字','<img src=x onerror=x>');assert.deepEqual(env.pending,[false,true]);assert.deepEqual(env.snapshots,[]);assert.equal(original.title,sample().title);
  await button(env.root,'套用圖片文字至草稿').dispatch('click');assert.equal(env.snapshots.length,1);assert.equal(env.snapshots[0].title,literal);assert.equal(env.snapshots[0].attribution,original.attribution);assert.deepEqual(env.snapshots[0].asset,original.asset);assert.notStrictEqual(env.snapshots[0].asset,original.asset);assert.deepEqual(env.pending,[false,true,false]);assert.match(env.root.textContent,/尚未另存版本/);
  await button(env.root,'套用圖片文字至草稿').dispatch('click');assert.equal(env.snapshots.length,1);assert.match(env.root.textContent,/沒有內容變更/);
});
test('editor invalid drafts are preserved through failure and rerender, while old editor handlers are inert',async()=>{
  const env=editor(),old=env.root,oldApply=button(old,'套用圖片文字至草稿'),oldInput=await fill(old,'圖片標題','字'.repeat(201));await oldApply.dispatch('click');assert.equal(env.snapshots.length,0);assert.match(old.textContent,/超過/);assert.equal(control(old,'圖片標題').value,'字'.repeat(201));
  const current=createImageEditor(env.document,sample(),{uiState:env.uiState,onChange:value=>env.snapshots.push(value),onPendingChange:value=>env.pending.push(value)});assert.equal(control(current,'圖片標題').value,'字'.repeat(201));assert.match(current.textContent,/尚未套用/);
  oldInput.value='stale edit';await oldInput.dispatch('input');await oldApply.dispatch('click');await button(old,'放棄圖片文字欄位修改').dispatch('click');assert.equal(control(current,'圖片標題').value,'字'.repeat(201));assert.equal(env.snapshots.length,0);
  await fill(current,'圖片標題','已修正');await button(current,'套用圖片文字至草稿').dispatch('click');assert.equal(env.snapshots.length,1);assert.equal(env.snapshots[0].title,'已修正');
});
test('discard invalidates detached controls, preserves applied state, and never emits a version',async()=>{
  const env=editor(),stale=await fill(env.root,'圖片替代文字','pending text'),staleApply=button(env.root,'套用圖片文字至草稿');await button(env.root,'放棄圖片文字欄位修改').dispatch('click');assert.equal(control(env.root,'圖片替代文字').value,sample().alt);assert.deepEqual(env.pending,[false,true,false]);assert.deepEqual(env.snapshots,[]);
  stale.value='stale';await stale.dispatch('input');await staleApply.dispatch('click');assert.equal(control(env.root,'圖片替代文字').value,sample().alt);assert.deepEqual(env.snapshots,[]);
});
test('raw untouched CR/LF survives apply, draft identity does not leak across versions, and disabled editors are inert',async()=>{
  const env=editor();await fill(env.root,'圖片標題','new title');await button(env.root,'套用圖片文字至草稿').dispatch('click');assert.equal(env.snapshots[0].alt,sample().alt);assert.equal(env.snapshots[0].attribution,sample().attribution);
  const other=editor();await fill(other.root,'圖片標題','old draft');const next=changed(v=>v.title='different saved version');const different=createImageEditor(other.document,next,{uiState:other.uiState});assert.equal(control(different,'圖片標題').value,next.title);
  const locked=editor(sample(),{disabled:true});assert.ok(locked.root.querySelectorAll('textarea').every(node=>node.disabled));assert.ok(locked.root.querySelectorAll('button').every(node=>node.disabled));await fill(locked.root,'圖片標題','forbidden');await button(locked.root,'套用圖片文字至草稿').dispatch('click');assert.deepEqual(locked.snapshots,[]);assert.deepEqual(locked.pending,[false]);
});
test('editor callback failures do not claim a saved version, and literal error text never becomes markup',async()=>{
  const env=editor(sample(),{onChange(){throw new Error('<script>failed receiver</script>');}});await fill(env.root,'圖片標題','changed');await button(env.root,'套用圖片文字至草稿').dispatch('click');assert.match(env.root.textContent,/外層接收失敗；尚未保存版本/);assert.ok(env.root.textContent.includes('<script>failed receiver</script>'));assert.equal(env.root.querySelectorAll('script').length,0);
});
test('separate image editors have unique explicit labels and parent token invalidation makes detached handlers inert',async()=>{
  const first=editor(),second=createImageEditor(first.document,sample());const ids=[...allNodes(first.root),...allNodes(second)].map(node=>node.id).filter(Boolean);assert.equal(new Set(ids).size,ids.length);
  for(const root of [first.root,second])for(const label of root.querySelectorAll('label'))assert.ok(root.querySelector('#'+label.getAttribute('for')));
  await fill(first.root,'圖片標題','pending');delete first.uiState.imageEditorToken;await button(first.root,'套用圖片文字至草稿').dispatch('click');await button(first.root,'放棄圖片文字欄位修改').dispatch('click');assert.deepEqual(first.snapshots,[]);assert.equal(first.uiState.imageFieldDraft.title,'pending');
});
test('JS source uses no networking, markup, URL imports, pixels or model API; PHP source uses shared guards and no IO',async()=>{
  const js=await read('public/image.js'),php=await read('app/image.php'),fixtures=await read('tests/image-artifact.php');
  assert.doesNotMatch(js,/\b(?:fetch|XMLHttpRequest|WebSocket|eval|Function|createImageBitmap)\s*\(|innerHTML|outerHTML|insertAdjacentHTML|\.style\b|\bimport\s|canvas|toDataURL|toBlob/);
  assert.match(js,/loadImage\(checkedImage\(artifact\)\)/);assert.match(js,/disposeImagePreview/);assert.match(js,/createObjectURL\(blob\)/);assert.match(js,/revokeObjectURL\(url\)/);assert.match(js,/imageEditorToken/);
  assert.doesNotMatch(php,/\b(?:file_get_contents|file_put_contents|fopen|curl_init|exec|shell_exec|eval|unserialize|getimagesize|imagecreatefromstring)\s*\(|\$_(?:FILES|GET|POST)|https?:\/\//);
  for(const name of ['validateImageArtifact','imageArtifactItems','imageArtifactFromItems','imageArtifactSchema'])assert.ok(php.includes('function '+name+'('));
  assert.ok(php.includes("artifactObject($value,array('kind','title','alt','attribution','asset')"));assert.ok(php.includes("artifactObject($asset,array('id','mime','width','height','byteLength','sha256','normalization')"));
  assert.ok(php.includes("artifactText($value['title'],600,'圖片標題',false)"));assert.ok(php.includes("artifactText($value['alt'],3000"));assert.ok(php.includes("artifactText($value['attribution'],2000"));assert.ok(php.includes("artifactJsonSchemaValue($raw,imageArtifactSchema())"));
  assert.ok(fixtures.includes(PNG_BASE64));assert.ok(fixtures.includes(SHA256));assert.match(fixtures,/UNEXECUTED/);
});
