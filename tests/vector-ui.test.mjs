// Real module and callbacks with a minimal DOM fixture. No real browser, PHP,
// network, screenshot, external-editor compatibility or actual-model claims.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {defaultVector,defaultVectorShape,validateVector,cloneVector,vectorCompactJson,vectorItems,updateVectorDocument,addVectorShape,updateVectorShape,removeVectorShape,reorderVectorShape,duplicateVectorShape,renderVector,renderVectorEditor,exportVector} from '../public/vector.js';
const types=['rect','ellipse','line','polygon','polyline','text'];
const copy=value=>JSON.parse(JSON.stringify(value));
const changed=(value,change)=>{const next=copy(value);change(next);return next;};
const sample=()=>({...defaultVector(),title:'共同編輯 <向量> & "幾何"',shapes:types.map((type,index)=>({...defaultVectorShape(type,'s'+index),x:10+index*20,y:20+index*15,text:type==='text'?'第一行\n 完整文字 🐻 ':''}))});
const fields=shape=>{const {id,type,...rest}=shape;return rest;};
const invalid=(value,pattern)=>assert.match(validateVector(value),pattern);
const bytes=value=>new TextEncoder().encode(value).length;

test('native defaults cover all six geometric types; clone canonicalizes key order and isolates all nested points',()=>{
  assert.equal(validateVector(defaultVector()),'');assert.equal(validateVector(sample()),'');
  for(const type of types)assert.equal(defaultVectorShape(type).type,type);
  assert.throws(()=>defaultVectorShape('path'),/不支援/);
  const original=sample(),cloned=cloneVector(original);assert.deepEqual(cloned,original);cloned.shapes[3].points[0].x=999;cloned.shapes[0].label='tampered';assert.deepEqual(original,sample());
  const reordered={shapes:original.shapes.map(shape=>Object.fromEntries(Object.entries(shape).reverse())),background:original.background,height:original.height,width:original.width,title:original.title,kind:'vector'};
  assert.equal(vectorCompactJson(reordered),vectorCompactJson(original));
  assert.deepEqual(Object.keys(cloneVector(reordered)),['kind','title','width','height','background','shapes']);
});
test('exact objects, array bounds, dense lists and own keys reject malformed JSON shapes without coercion',()=>{
  for(const value of [null,undefined,'vector',false,5,[]])invalid(value,/完整物件/);
  invalid({...sample(),extra:1},/未支援/);invalid(changed(sample(),v=>delete v.width),/缺少欄位/);invalid({...sample(),kind:'svg'},/類型欄位/);
  invalid(changed(sample(),v=>v.shapes[0].extra='x'),/未支援/);invalid(changed(sample(),v=>delete v.shapes[0].opacity),/缺少欄位/);
  invalid(changed(sample(),v=>v.shapes[3].points[0].z=0),/未支援/);
  const symbol=sample();symbol.shapes[0][Symbol('hidden')]=0;invalid(symbol,/未支援/);
  const hidden=sample();Object.defineProperty(hidden.shapes[0],'hidden',{value:0});invalid(hidden,/未支援/);
  const sparse=sample();delete sparse.shapes[0];invalid(sparse,/清單格式/);
  const extra=sample();extra.shapes.extra=0;invalid(extra,/清單格式/);
  const pointHole=sample();delete pointHole.shapes[3].points[0];invalid(pointHole,/清單格式/);
  for(const count of [0,101])invalid({...defaultVector(),shapes:Array.from({length:count},(_,i)=>defaultVectorShape('rect','s'+i))},/數量/);
  assert.equal(validateVector({...defaultVector(),shapes:Array.from({length:100},(_,i)=>defaultVectorShape('rect','s'+i))}),'');
});
test('stable unique ASCII IDs and strict six-digit colors forbid executable or external paint references',()=>{
  for(const id of ['', '_id','中文','x y','x\n','x\r','x\u2028','a'.repeat(65)])invalid(changed(sample(),v=>v.shapes[0].id=id),/穩定英數/);
  for(const id of ['A','a-1_b','a'.repeat(64)])assert.equal(validateVector(changed(sample(),v=>v.shapes[0].id=id)),'');
  invalid(changed(sample(),v=>v.shapes[1].id='s0'),/不可重複/);
  for(const color of ['#fff','red','transparent','#123456\n','url(https://evil.test/a.svg)','url(#pattern)','var(--x)',5,null]){
    invalid(changed(sample(),v=>v.background=color),/六位/);invalid(changed(sample(),v=>v.shapes[0].fill=color),/六位/);invalid(changed(sample(),v=>v.shapes[0].stroke=color),/六位/);
  }
  for(const color of ['none','#123abc','#ABCDEF'])assert.equal(validateVector(changed(sample(),v=>{v.background=color;v.shapes[0].fill=color;v.shapes[0].stroke=color;})),'');
});
test('numeric contract is strict finite native numbers, integer canvas and exact <=3 decimals without rounding',()=>{
  for(const value of ['', '10',true,false,null,NaN,Infinity,-Infinity]){
    invalid(changed(sample(),v=>v.shapes[0].x=value),/有限數字/);invalid(changed(sample(),v=>v.width=value),/有限整數/);
  }
  for(const value of [0,4097,1.5])invalid({...sample(),width:value},/有限整數/);
  for(const value of [1,4096])assert.equal(validateVector({...sample(),width:value,height:value}),'');
  for(const value of [-4096,8192,0.001,-0.001,1.234,-1.234])assert.equal(validateVector(changed(sample(),v=>v.shapes[0].x=value)),'');
  for(const value of [-4096.001,8192.001])invalid(changed(sample(),v=>v.shapes[0].x=value),/有限數字/);
  for(const value of [0.0001,1.2345,1/3,0.30000000000000004])invalid(changed(sample(),v=>v.shapes[0].x=value),/3位小數/);
  const normalized=cloneVector(changed(sample(),v=>{v.shapes[0].x=-0;v.shapes[0].strokeWidth=-0;v.shapes[3].points[0].x=-0;}));
  assert.equal(Object.is(normalized.shapes[0].x,-0),false);assert.equal(Object.is(normalized.shapes[3].points[0].x,-0),false);
  for(const [field,values] of [['strokeWidth',[-0.001,100.001]],['opacity',[-0.001,1.001]],['fontSize',[0,512.001]]])for(const value of values)invalid(changed(sample(),v=>v.shapes[field==='fontSize'?5:0][field]=value),/有限數字/);
});
test('shape-dependent geometry has positive boxes, signed line deltas, local bounded points and no paths',()=>{
  for(const index of [0,1])for(const field of ['width','height'])for(const value of [0,-1])invalid(changed(sample(),v=>v.shapes[index][field]=value),/大於零/);
  for(const value of [-8192,0,8192])assert.equal(validateVector(changed(sample(),v=>{v.shapes[2].width=value;v.shapes[2].height=value;})),'');
  for(const value of [-8192.001,8192.001])invalid(changed(sample(),v=>v.shapes[2].width=value),/有限數字/);
  for(const index of [3,4,5])invalid(changed(sample(),v=>v.shapes[index].width=1),/必須為零/);
  for(const index of [0,1,2,3,4])invalid(changed(sample(),v=>v.shapes[index].fontSize=1),/fontSize/);
  for(const index of [0,1,2,5])invalid(changed(sample(),v=>v.shapes[index].points=[{x:0,y:0}]),/頂點/);
  invalid(changed(sample(),v=>v.shapes[3].points=[{x:0,y:0},{x:1,y:1}]),/頂點/);invalid(changed(sample(),v=>v.shapes[4].points=[{x:0,y:0}]),/頂點/);
  for(const index of [3,4]){
    assert.equal(validateVector(changed(sample(),v=>v.shapes[index].points=Array.from({length:80},(_,i)=>({x:i,y:-i})))), '');
    invalid(changed(sample(),v=>v.shapes[index].points=Array.from({length:81},(_,i)=>({x:i,y:0}))),/頂點/);
    invalid(changed(sample(),v=>v.shapes[index].points[0].x=8193),/頂點 X/);
    invalid(changed(sample(),v=>v.shapes[index].points[0].y='0'),/頂點 Y/);
  }
  for(const type of ['path','image','foreignObject','script','use'])invalid(changed(sample(),v=>v.shapes[0].type=type),/只支援/);
  const cycle=sample();cycle.shapes[3].points[0].x=cycle;invalid(cycle,/有限數字/);assert.throws(()=>cloneVector(cycle),/有限數字/);
});
test('UTF8, nonblank text-shapes, NUL, lone surrogates and secret guard preserve valid text exactly',()=>{
  assert.equal(validateVector(changed(sample(),v=>{v.title='字'.repeat(200);v.shapes[0].label='字'.repeat(40);v.shapes[5].text='字'.repeat(1333)+'a';})),'');
  invalid(changed(sample(),v=>v.title='字'.repeat(201)),/標題空白或超過/);invalid(changed(sample(),v=>v.shapes[0].label='字'.repeat(41)),/名稱空白或超過/);invalid(changed(sample(),v=>v.shapes[5].text='字'.repeat(1334)),/文字空白或超過/);
  for(const value of ['', ' \t\r\n','\u3000\u00a0\uFEFF'])invalid(changed(sample(),v=>v.shapes[5].text=value),/文字空白/);
  assert.equal(validateVector(changed(sample(),v=>{v.title='';v.shapes[0].label='';})),'');
  invalid(changed(sample(),v=>v.shapes[0].text='not text'),/非文字圖形/);
  for(const value of ['\ud800','\udfff','a\0b',7,null])for(const field of ['label','text'])invalid(changed(sample(),v=>v.shapes[5][field]=value),/有效 UTF8/);
  const secret='sk-'+'x'.repeat(20);for(const field of ['id','label','text'])invalid(changed(sample(),v=>v.shapes[5][field]=secret),/請勿.*API Key/);invalid({...sample(),title:secret},/請勿.*API Key/);
  const exact='  <safe> 🐻 & \t\n  ';assert.equal(cloneVector(changed(sample(),v=>v.shapes[5].text=exact)).shapes[5].text,exact);
});
test('canonical projection preserves fixed schema order, normalized numbers and PHP Unicode escapes',()=>{
  const value=changed(defaultVector(),v=>{v.title='分隔\u2028\u2029 /';v.shapes[0].x=1.2;v.shapes[0].y=-0.001;v.shapes[0].opacity=0.5;v.shapes[0].strokeWidth=-0;});
  const encoded=vectorCompactJson(value);assert.match(encoded,/"title":"分隔\\u2028\\u2029 \/"/);assert.match(encoded,/"x":1\.2,"y":-0\.001/);assert.match(encoded,/"strokeWidth":0,"opacity":0\.5/);assert.doesNotMatch(encoded,/1\.200|0\.500|e[+-]\d/);
  assert.deepEqual(JSON.parse(encoded),cloneVector(value));assert.deepEqual(vectorItems(value),[{id:'document',label:'向量圖形來源',content:encoded}]);
  assert.equal(exportVector(value,'json').text,encoded+'\n');assert.equal(exportVector(value,'txt').text,encoded+'\n');
  for(const number of [0,1,10,100,1000,8192,-1000,1.1,1.01,1.001,0.001,-0.001]){
    const candidate=changed(defaultVector(),v=>v.shapes[0].x=number);assert.equal(JSON.parse(vectorCompactJson(candidate)).shapes[0].x,number);
  }
});
test('60000-byte canonical size including PHP U2028/U2029 escaping rejects atomically without truncation',()=>{
  const huge={...defaultVector(),shapes:Array.from({length:16},(_,i)=>({...defaultVectorShape('text','s'+i),text:'x'.repeat(4000)}))};invalid(huge,/60000.*未保存且未截斷/);assert.throws(()=>exportVector(huge,'svg'),/60000/);
  const separators={...defaultVector(),shapes:Array.from({length:15},(_,i)=>({...defaultVectorShape('text','s'+i),text:'x'+'\u2028'.repeat(667)}))};assert.ok(bytes(JSON.stringify(separators))<60000);invalid(separators,/60000/);
  const original=sample(),before=copy(original);assert.throws(()=>updateVectorShape(original,'s5',{...fields(original.shapes[5]),text:'字'.repeat(1334)}),/超過/);assert.deepEqual(original,before);
});
test('exact canonical byte boundary accepts 60000 bytes and rejects one byte more',()=>{
  const value={...defaultVector(),shapes:Array.from({length:15},(_,i)=>({...defaultVectorShape('text','s'+i),text:'x'.repeat(i<14?3900:1)}))};
  const start=bytes(vectorCompactJson(value));value.shapes[14].text+='x'.repeat(60000-start);
  assert.equal(bytes(vectorCompactJson(value)),60000);assert.equal(validateVector(value),'');assert.equal(bytes(vectorItems(value)[0].content),60000);
  value.shapes[14].text+='x';invalid(value,/60000/);assert.throws(()=>cloneVector(value),/60000/);
});
test('pure add/update/remove/reorder/duplicate preserve identities and content with isolated immutable snapshots',()=>{
  const value=sample(),before=copy(value),updated=updateVectorShape(value,'s0',{...fields(value.shapes[0]),label:'  new  ',x:-1.234});assert.equal(updated.shapes[0].id,'s0');assert.equal(updated.shapes[0].label,'  new  ');assert.equal(updated.shapes[0].x,-1.234);
  const canvas=updateVectorDocument(value,{title:'畫布',width:123,height:456,background:'none'});assert.equal(canvas.width,123);assert.deepEqual(canvas.shapes,value.shapes);
  const added=addVectorShape(value,'ellipse');assert.equal(added.shapes.length,7);assert.match(added.shapes.at(-1).id,/^shape_/);assert.equal(added.shapes.at(-1).type,'ellipse');
  const duplicated=duplicateVectorShape(value,'s3');assert.equal(duplicated.shapes[4].type,'polygon');assert.notEqual(duplicated.shapes[4].id,'s3');assert.deepEqual(fields(duplicated.shapes[4]),fields(value.shapes[3]));duplicated.shapes[4].points[0].x=99;assert.equal(duplicated.shapes[3].points[0].x,0);
  const moved=reorderVectorShape(value,'s0',5);assert.deepEqual(moved.shapes.map(shape=>shape.id),['s1','s2','s3','s4','s5','s0']);assert.deepEqual(reorderVectorShape(value,'s0',0),value);
  assert.deepEqual(removeVectorShape(value,'s0').shapes,value.shapes.slice(1));assert.deepEqual(value,before);
  for(const operation of [()=>removeVectorShape(defaultVector(),'shape_1'),()=>reorderVectorShape(value,'s0',6),()=>reorderVectorShape(value,'s0','1'),()=>updateVectorShape(value,'s0',{x:1}),()=>duplicateVectorShape(value,'missing')])assert.throws(operation);
  const full={...defaultVector(),shapes:Array.from({length:100},(_,i)=>defaultVectorShape('rect','s'+i))};assert.throws(()=>addVectorShape(full),/數量/);assert.throws(()=>duplicateVectorShape(full,'s0'),/數量/);assert.equal(full.shapes.length,100);
});

class FixtureNode {
  constructor(tag,document,namespace=null){this.tagName=tag.toUpperCase();this.ownerDocument=document;this.namespaceURI=namespace;this.children=[];this.parentNode=null;this.attributes={};this.listeners={};this.className='';this.disabled=false;this._text='';}
  get id(){return this.attributes.id||'';}set id(value){this.attributes.id=String(value);}
  get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}set textContent(value){this._text=String(value);this.children=[];}
  get value(){return this._value??(this.tagName==='SELECT'?(this.children.find(child=>child.selected)||this.children[0])?.value:'')??'';}set value(value){this._value=String(value);}
  setAttribute(name,value){this.attributes[name]=String(value);if(name==='class')this.className=String(value);}
  getAttribute(name){return this.attributes[name]??null;}
  append(...nodes){nodes.forEach(node=>{assert.ok(node instanceof FixtureNode);node.parentNode=this;this.children.push(node);});}
  replaceChildren(...nodes){this.children.forEach(node=>node.parentNode=null);this.children=[];this._text='';this.append(...nodes);}
  matches(selector){return selector.startsWith('.')?this.className.split(' ').includes(selector.slice(1)):selector.startsWith('#')?this.id===selector.slice(1):this.tagName===selector.toUpperCase();}
  querySelectorAll(selector){const selectors=selector.split(',').map(value=>value.trim()),result=[];const visit=node=>node.children.forEach(child=>{if(selectors.some(value=>child.matches(value)))result.push(child);visit(child);});visit(this);return result;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  addEventListener(type,listener){(this.listeners[type]??=[]).push(listener);}
  async dispatch(type){for(const listener of this.listeners[type]||[])await listener({type,target:this});}
}
function fixture(){const document={createElement(tag){return new FixtureNode(tag,this);},createElementNS(namespace,tag){return new FixtureNode(tag,this,namespace);},getElementById(id){return this.body.querySelector('#'+id);}};document.body=document.createElement('body');return document;}
function control(root,labelText){const label=root.querySelectorAll('label').find(node=>node.textContent===labelText);assert.ok(label,'label exists: '+labelText);const input=root.querySelector('#'+label.getAttribute('for'));assert.ok(input);return input;}
function button(root,text){const found=root.querySelectorAll('button').find(node=>node.textContent===text);assert.ok(found,'button exists: '+text);return found;}
async function fill(root,label,value,event='input'){const input=control(root,label);input.value=value;await input.dispatch(event);return input;}
async function select(root,id){return fill(root,'選取要編輯的圖形',id,'change');}
function editor(value=sample(),options={}){const document=fixture(),snapshots=[],root=renderVectorEditor(value,{document,onChange:value=>snapshots.push(value),...options});document.body.append(root);return {document,snapshots,root};}
const allNodes=root=>[root,...root.children.flatMap(allNodes)];

test('real SVG uses correct geometric primitives, line signed deltas, translated points, and readable bounded scrolling',()=>{
  const value=changed(sample(),v=>{v.shapes[2].x=100;v.shapes[2].y=100;v.shapes[2].width=-50;v.shapes[2].height=-75;}),document=fixture(),root=renderVector(value,{document,compact:true});document.body.append(root);const svg=root.querySelector('svg');
  assert.equal(svg.namespaceURI,'http://www.w3.org/2000/svg');assert.equal(svg.getAttribute('viewBox'),'0 0 800 600');assert.equal(svg.getAttribute('role'),'img');for(const id of svg.getAttribute('aria-labelledby').split(' '))assert.ok(document.getElementById(id));
  assert.equal(svg.querySelectorAll('g').length,6);assert.equal(svg.querySelectorAll('rect').length,2);for(const type of ['ellipse','line','polygon','polyline','text'])assert.equal(svg.querySelectorAll(type).length,1);
  const ellipse=svg.querySelector('ellipse');assert.equal(ellipse.getAttribute('cx'),'110');assert.equal(ellipse.getAttribute('cy'),'85');assert.equal(ellipse.getAttribute('rx'),'80');
  const line=svg.querySelector('line');assert.equal(line.getAttribute('x2'),'50');assert.equal(line.getAttribute('y2'),'25');
  assert.equal(svg.querySelector('polygon').getAttribute('transform'),'translate(70 65)');assert.equal(svg.querySelector('polygon').getAttribute('points'),'0,100 80,0 160,100');
  assert.equal(svg.querySelectorAll('tspan').length,2);assert.equal(svg.querySelector('text').getAttribute('xml:space'),'preserve');assert.equal(root.querySelector('.vector-shape-list').querySelectorAll('li').length,6);assert.ok(root.textContent.includes(value.shapes[5].text));
  assert.match(root.querySelector('.vector-svg-scroll').getAttribute('style'),/max-height:34rem;overflow:auto/);assert.equal(root.querySelector('.vector-svg-scroll').getAttribute('tabindex'),'0');assert.match(svg.getAttribute('style'),/max-width:none;width:800px;height:600px/);
  for(const node of allNodes(svg))for(const [name,value] of Object.entries(node.attributes)){assert.doesNotMatch(name,/^on|href/i);assert.doesNotMatch(value,/NaN|Infinity|undefined/);}
  assert.equal(renderVector({...value,background:'none'},{document:fixture()}).querySelector('svg').querySelectorAll('rect').length,1);
});
test('SVG DOM/export use escaped full text and no executable markup, URLs, path, images or hidden unsupported claims',()=>{
  const payload='</text><script>alert("X")</script> & <img src=x onerror=x>',value=changed(sample(),v=>{v.shapes[5].text=payload+'\x01\nhttps://evil.test';v.shapes[5].label='<script>label</script>';});
  const root=renderVector(value,{document:fixture()}),svg=exportVector(value,'svg');assert.equal(root.querySelector('script'),null);assert.equal(root.querySelector('img'),null);assert.ok(root.textContent.includes(payload));
  assert.equal(svg.filename,'vector.svg');assert.equal(svg.mime,'image/svg+xml;charset=utf-8');assert.match(svg.text,/&lt;script&gt;/);assert.match(svg.text,/&amp;/);assert.match(svg.text,/�/);assert.doesNotMatch(svg.text,/<script|<iframe|<img|<foreignObject|<image|<use|<path|<style|<[^>]*\s(?:on[a-z]+|href)=|\x01/i);
  assert.deepEqual(JSON.parse(exportVector(value,'json').text),value);assert.equal(exportVector(value,'txt').mime,'text/plain;charset=utf-8');assert.throws(()=>exportVector(value,'png'),/只支援 SVG、JSON 或 TXT/);
  assert.match(editor().root.textContent,/沒有拖曳、貝茲曲線、自由路徑、SVG 匯入/);assert.match(editor().root.textContent,/尚未驗證任何外部工具/);
  const invalidRoot=renderVector({...sample(),width:0},{document:fixture()});assert.equal(invalidRoot.querySelector('svg'),null);assert.match(invalidRoot.textContent,/畫布寬度/);
});
test('selection through SVG or accessible full list does not mutate or emit any artifact',async()=>{
  const document=fixture(),chosen=[],root=renderVector(sample(),{document,onSelect:id=>chosen.push(id),selectedShapeId:'s3'});document.body.append(root);
  await root.querySelector('svg').querySelectorAll('g')[2].dispatch('click');const polygon=root.querySelectorAll('button').find(node=>node.getAttribute('aria-pressed')==='true');await polygon.dispatch('click');assert.deepEqual(chosen,['s2','s3']);
  const editing=editor();await select(editing.root,'s3');assert.equal(editing.snapshots.length,0);assert.equal(control(editing.root,'局部頂點（每行 x,y）').value,'0,100\n80,0\n160,100');
});
test('raw fields require explicit apply, survive shape switching, preserve exact text and do not mutate accepted preview',async()=>{
  const original=sample(),{root,snapshots}=editor(original);await fill(root,'圖形名稱','  新名稱  ');await fill(root,'X 座標','-12.125');assert.equal(snapshots.length,0);assert.equal(root.querySelector('svg').querySelector('g').querySelector('rect').getAttribute('x'),'10');
  await select(root,'s1');await select(root,'s0');assert.equal(control(root,'圖形名稱').value,'  新名稱  ');assert.equal(control(root,'X 座標').value,'-12.125');
  await button(root,'套用圖形修改至草稿').dispatch('click');assert.equal(snapshots.length,1);assert.equal(snapshots[0].shapes[0].x,-12.125);assert.equal(snapshots[0].shapes[0].label,'  新名稱  ');assert.equal(snapshots[0].shapes[0].id,'s0');assert.deepEqual(original,sample());
  await button(root,'套用圖形修改至草稿').dispatch('click');assert.equal(snapshots.length,1);await fill(root,'圖形名稱','discard');await button(root,'放棄此圖形欄位修改').dispatch('click');assert.equal(control(root,'圖形名稱').value,'  新名稱  ');assert.equal(snapshots.length,1);
});
test('decimal UI refuses blank, NaN, exponent, partial parse, out of range and excessive precision without losing drafts',async()=>{
  const {root,snapshots}=editor();for(const value of ['', ' ', 'NaN','Infinity','1e2','0x10','10px','1.2.3',' 2','2 ','8193','0.0001','0.3000000000000000000001','1.0000000000000000001','-0.00000000000000000001']){
    await fill(root,'X 座標',value);await button(root,'套用圖形修改至草稿').dispatch('click');assert.equal(snapshots.length,0,value);assert.notEqual(root.querySelector('.artifact-error').textContent,'');assert.equal(control(root,'X 座標').value,value);
  }
  await fill(root,'X 座標','+.125');await button(root,'套用圖形修改至草稿').dispatch('click');assert.equal(snapshots.length,1);assert.equal(snapshots[0].shapes[0].x,0.125);
  await fill(root,'畫布寬度','1.5');await button(root,'套用畫布修改至草稿').dispatch('click');assert.equal(snapshots.length,1);assert.match(root.querySelector('.artifact-error').textContent,/有限整數/);
  await fill(root,'畫布寬度','4096');await fill(root,'畫布背景','none');await button(root,'套用畫布修改至草稿').dispatch('click');assert.equal(snapshots.length,2);assert.equal(snapshots.at(-1).width,4096);assert.equal(snapshots.at(-1).background,'none');
});
test('polygon point editing uses local x,y lines; partial/invalid points and nonblank text rejection are atomic',async()=>{
  const {root,snapshots}=editor();await select(root,'s3');for(const points of ['0,0\n1','0,0\n1,1','0,0\n1,1\n2,Infinity','0,0\n1,1\n2,0.0001','0,0\n1,1\n2,3\n']){
    await fill(root,'局部頂點（每行 x,y）',points);await button(root,'套用圖形修改至草稿').dispatch('click');assert.equal(snapshots.length,0);assert.equal(control(root,'局部頂點（每行 x,y）').value,points);
  }
  await fill(root,'局部頂點（每行 x,y）','-1.25,0\n10,0\n5,20');await fill(root,'X 座標','20');await button(root,'套用圖形修改至草稿').dispatch('click');assert.equal(snapshots.length,1);assert.deepEqual(snapshots[0].shapes[3].points,[{x:-1.25,y:0},{x:10,y:0},{x:5,y:20}]);
  await select(root,'s5');await fill(root,'圖形文字',' ');await button(root,'套用圖形修改至草稿').dispatch('click');assert.equal(snapshots.length,1);await fill(root,'圖形文字','字'.repeat(1334));await button(root,'套用圖形修改至草稿').dispatch('click');assert.equal(snapshots.length,1);
  await fill(root,'圖形文字','  完整\n文字 🐻 ');await fill(root,'文字大小','32.5');await button(root,'套用圖形修改至草稿').dispatch('click');assert.equal(snapshots.length,2);assert.equal(snapshots.at(-1).shapes[5].text,'  完整\n文字 🐻 ');
});
test('editor adds, duplicates, reorders and removes with fresh IDs and prevents duplicate stale clicks',async()=>{
  const {root,snapshots}=editor();await fill(root,'新增圖形類型','polygon','change');assert.equal(snapshots.length,0);const staleAdd=button(root,'新增圖形至草稿');await staleAdd.dispatch('click');await staleAdd.dispatch('click');assert.equal(snapshots.length,1);const added=snapshots[0].shapes.at(-1);assert.equal(added.type,'polygon');assert.equal(control(root,'選取要編輯的圖形').value,added.id);
  await button(root,'複製圖形至草稿').dispatch('click');const duplicated=snapshots.at(-1).shapes.at(-1);assert.notEqual(duplicated.id,added.id);assert.deepEqual(fields(duplicated),fields(added));
  assert.equal(button(root,'向前移一層').disabled,true);await button(root,'向後移一層').dispatch('click');assert.equal(snapshots.at(-1).shapes.at(-2).id,duplicated.id);await button(root,'向前移一層').dispatch('click');assert.equal(snapshots.at(-1).shapes.at(-1).id,duplicated.id);
  await button(root,'移除圖形').dispatch('click');assert.equal(snapshots.at(-1).shapes.some(shape=>shape.id===duplicated.id),false);assert.equal(snapshots.at(-1).shapes.length,7);
  const only=editor(defaultVector());assert.equal(button(only.root,'移除圖形').disabled,true);assert.equal(button(only.root,'向前移一層').disabled,true);assert.equal(button(only.root,'向後移一層').disabled,true);
});
test('invalid add type, maximum count, and capacity failures never change valid state',async()=>{
  const {root,snapshots}=editor();await fill(root,'新增圖形類型','script','change');await button(root,'新增圖形至草稿').dispatch('click');assert.equal(snapshots.length,0);assert.match(root.querySelector('.artifact-error').textContent,/不支援/);
  const full=editor({...defaultVector(),shapes:Array.from({length:100},(_,i)=>defaultVectorShape('rect','s'+i))});assert.equal(button(full.root,'新增圖形至草稿').disabled,true);assert.equal(button(full.root,'複製圖形至草稿').disabled,true);assert.equal(full.snapshots.length,0);
});
test('pending notifications include document/invalid/multiple shape drafts and block destructive operations until explicit resolution',async()=>{
  const pending=[],{root,snapshots}=editor(sample(),{onPendingChange:value=>pending.push(value)});assert.deepEqual(pending,[false]);await fill(root,'圖形名稱','changed');await button(root,'套用圖形修改至草稿').dispatch('click');assert.equal(button(root,'復原上一步草稿操作').disabled,false);
  await fill(root,'X 座標','');await select(root,'s1');await fill(root,'圖形名稱','pending B');await fill(root,'畫布寬度','');assert.deepEqual(pending,[false,true,false,true]);
  for(const label of ['新增圖形至草稿','複製圖形至草稿','向前移一層','向後移一層','移除圖形','復原上一步草稿操作']){assert.equal(button(root,label).disabled,true);await button(root,label).dispatch('click');}
  assert.equal(snapshots.length,1);await button(root,'放棄此圖形欄位修改').dispatch('click');assert.equal(button(root,'移除圖形').disabled,true);await button(root,'放棄畫布欄位修改').dispatch('click');assert.equal(button(root,'移除圖形').disabled,true);
  await select(root,'s0');assert.equal(control(root,'X 座標').value,'');await button(root,'放棄此圖形欄位修改').dispatch('click');assert.equal(button(root,'移除圖形').disabled,false);assert.deepEqual(pending,[false,true,false,true,false]);
  await fill(root,'X 座標','+10');assert.equal(pending.at(-1),true);await button(root,'套用圖形修改至草稿').dispatch('click');assert.equal(pending.at(-1),false);assert.equal(snapshots.length,1,'numeric spelling-only apply is a no-op but clears raw pending');
});
test('twenty-step undo restores full artifacts and selection, is immutable, and survives outer readonly rerender',async()=>{
  const uiState={},first=editor(sample(),{uiState});await select(first.root,'s3');await button(first.root,'向後移一層').dispatch('click');const committed=first.snapshots.at(-1);assert.equal(committed.shapes[2].id,'s3');
  const second=editor(committed,{uiState,disabled:true});assert.equal(button(second.root,'復原上一步草稿操作').disabled,true);const third=editor(committed,{uiState});await button(third.root,'復原上一步草稿操作').dispatch('click');assert.deepEqual(third.snapshots.at(-1),sample());assert.equal(control(third.root,'選取要編輯的圖形').value,'s3');
  for(let index=1;index<=23;index++){await fill(third.root,'圖形名稱','revision'+index);await button(third.root,'套用圖形修改至草稿').dispatch('click');}
  for(let index=0;index<20;index++)await button(third.root,'復原上一步草稿操作').dispatch('click');assert.equal(control(third.root,'圖形名稱').value,'revision3');assert.equal(button(third.root,'復原上一步草稿操作').disabled,true);assert.equal(validateVector(third.snapshots.at(-1)),'');assert.deepEqual(committed,first.snapshots[0]);
});
test('shared uiState retains raw invalid drafts and selection across busy/AI rerenders; detached editors cannot act',async()=>{
  const uiState={},pending=[],first=editor(sample(),{uiState,onPendingChange:value=>pending.push(value)});await select(first.root,'s3');await fill(first.root,'局部頂點（每行 x,y）','0,0\n1,');await fill(first.root,'畫布背景','url(evil)');const staleInput=control(first.root,'局部頂點（每行 x,y）'),staleApply=button(first.root,'套用圖形修改至草稿');
  const readonlyPending=[],second=editor(sample(),{uiState,disabled:true,onPendingChange:value=>readonlyPending.push(value)});assert.deepEqual(readonlyPending,[true]);assert.equal(control(second.root,'局部頂點（每行 x,y）').value,'0,0\n1,');assert.equal(control(second.root,'畫布背景').value,'url(evil)');
  staleInput.value='stale';await staleInput.dispatch('input');await staleApply.dispatch('click');assert.equal(first.snapshots.length,0);
  const external=changed(sample(),v=>v.shapes.push(defaultVectorShape('ellipse','external'))),third=editor(external,{uiState});assert.equal(control(third.root,'選取要編輯的圖形').value,'s3');assert.equal(control(third.root,'局部頂點（每行 x,y）').value,'0,0\n1,');assert.equal(control(third.root,'畫布背景').value,'url(evil)');
  await fill(third.root,'局部頂點（每行 x,y）','0,0\n1,1\n2,2');await button(third.root,'套用圖形修改至草稿').dispatch('click');assert.equal(third.snapshots.length,1);assert.equal(third.snapshots[0].shapes.at(-1).id,'external');assert.equal(button(third.root,'移除圖形').disabled,true);await button(third.root,'放棄畫布欄位修改').dispatch('click');assert.equal(button(third.root,'移除圖形').disabled,false);
});
test('removed-shape raw drafts are not silently thrown away by an external replacement',async()=>{
  const uiState={},first=editor(sample(),{uiState});await select(first.root,'s3');await fill(first.root,'局部頂點（每行 x,y）','unfinished');
  const replaced=removeVectorShape(sample(),'s3'),pending=[],second=editor(replaced,{uiState,onPendingChange:value=>pending.push(value)});assert.deepEqual(pending,[true]);assert.equal(uiState.fieldDrafts.get('s3').points,'unfinished');assert.equal(button(second.root,'新增圖形至草稿').disabled,true);
  await button(second.root,'放棄已移除圖形的未套用欄位').dispatch('click');assert.deepEqual(pending,[true,false]);assert.equal(uiState.fieldDrafts.has('s3'),false);assert.equal(second.snapshots.length,0);
});
test('readonly controls, stale selected-field handlers, and detached SVG selections cannot mutate or emit',async()=>{
  const disabled=editor(sample(),{disabled:true});assert.equal(disabled.root.querySelectorAll('input,textarea,select,button').every(node=>node.disabled),true);
  for(const input of disabled.root.querySelectorAll('input,textarea,select')){input.value='tampered';await input.dispatch('input');await input.dispatch('change');}for(const action of disabled.root.querySelectorAll('button'))await action.dispatch('click');assert.equal(disabled.snapshots.length,0);
  const {root,snapshots}=editor(),staleInput=control(root,'圖形名稱'),staleApply=button(root,'套用圖形修改至草稿'),staleSvg=root.querySelector('svg').querySelectorAll('g')[2];await select(root,'s1');staleInput.value='wrong shape';await staleInput.dispatch('input');await staleApply.dispatch('click');await staleSvg.dispatch('click');assert.equal(snapshots.length,0);assert.equal(control(root,'選取要編輯的圖形').value,'s1');assert.equal(control(root,'圖形名稱').value,'橢圓');
});
test('callback values are validated complete isolated snapshots; callback failure is visible, never falsely saved',async()=>{
  const seen=[],{root}=editor(sample(),{onChange:value=>{seen.push(copy(value));value.shapes[0].label='tamper';value.shapes[3].points[0].x=999;}});await fill(root,'圖形名稱','local');await button(root,'套用圖形修改至草稿').dispatch('click');assert.equal(validateVector(seen[0]),'');assert.equal(control(root,'圖形名稱').value,'local');await select(root,'s3');assert.equal(control(root,'局部頂點（每行 x,y）').value,'0,100\n80,0\n160,100');
  const broken=editor(sample(),{onChange:()=>{throw new Error('test failure');}});await fill(broken.root,'圖形名稱','local');await button(broken.root,'套用圖形修改至草稿').dispatch('click');assert.match(broken.root.querySelector('.artifact-error').textContent,/外層接收失敗.*尚未保存版本/);assert.equal(control(broken.root,'圖形名稱').value,'local');
});
test('standalone module permits safe direct SVG/DOM only, with no raw SVG parser, execution, network, storage or download effects',async()=>{
  const source=await readFile(new URL('../public/vector.js',import.meta.url),'utf8');assert.doesNotMatch(source,/\bimport\s|\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|\.innerHTML\s*=|insertAdjacentHTML|DOMParser|\beval\s*\(|new Function|createObjectURL|\.click\s*\(/);assert.match(source,/createElementNS/);assert.match(source,/textContent/);assert.match(source,/history\.length>20/);
});
