// Production pure helpers and real callbacks exercised with a minimal DOM fixture.
// This does not run a real browser, PHP, network, an AI model, layout or screenshots.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {defaultMindmap,validateMindmap,cloneMindmap,mindmapItems,updateMindmapNode,addMindmapChild,moveMindmapNode,mergeMindmapNodes,acceptMindmapProposals,deleteMindmapLeaf,renderMindmap,renderMindmapEditor,exportMindmap} from '../public/mindmap.js';

const node=(id,parentId,label=id,description='')=>({id,parentId,label,description});
const map=()=>({kind:'mindmap',rootId:'theme',nodes:[node('theme','','共同探索','主題\n不必立即收斂'),node('a','theme','  分支甲  ','甲的說明\n第二行'),node('grandchild','a','孫節點'),node('b','theme','分支乙','乙的說明')],proposals:[node('pending_a','a','甲待選','  完整\n待選說明  '),node('pending_root','theme','根待選'),node('pending_other','theme','另一待選')]});
const copy=value=>JSON.parse(JSON.stringify(value));
const changed=(value,change)=>{const next=copy(value);change(next);return next;};
const invalid=(value,pattern)=>assert.match(validateMindmap(value),pattern);
const bytes=value=>new TextEncoder().encode(value).length;

test('default is a genuine single-root native map and clone preserves exact text/IDs',()=>{
  assert.deepEqual(defaultMindmap(),{kind:'mindmap',rootId:'root',nodes:[node('root','','主題')],proposals:[]});
  assert.equal(validateMindmap(defaultMindmap()),'');assert.equal(validateMindmap(map()),'');
  const original=map(),cloned=cloneMindmap(original);assert.deepEqual(cloned,original);cloned.nodes[1].label='new';cloned.proposals[0].description='new';assert.deepEqual(original,map());
  const reordered={proposals:original.proposals,nodes:original.nodes,rootId:'theme',kind:'mindmap'};
  assert.equal(JSON.stringify(cloneMindmap(reordered)),JSON.stringify(original));
});
test('native shape refuses unknown/missing properties, coercion, sparse lists and invalid count',()=>{
  for(const value of [null,undefined,5,'mindmap',[]])invalid(value,/完整物件/);
  invalid({...map(),extra:1},/未支援/);invalid(changed(map(),v=>delete v.proposals),/缺少欄位/);invalid({...map(),kind:'chart'},/類型欄位/);
  invalid(changed(map(),v=>v.nodes[0].extra='x'),/未支援/);invalid(changed(map(),v=>delete v.nodes[0].description),/缺少欄位/);
  invalid(changed(map(),v=>v.proposals[0].extra='x'),/未支援/);invalid(changed(map(),v=>v.nodes=[]),/數量/);
  invalid(changed(map(),v=>v.nodes=Array.from({length:81},(_,i)=>node('n'+i,i?'n0':''))),/數量/);
  invalid(changed(map(),v=>v.proposals=Array.from({length:25},(_,i)=>node('p'+i,'theme'))),/數量/);
  const sparse=map();delete sparse.nodes[1];invalid(sparse,/清單格式/);
  const custom=map();custom.proposals.extra='x';invalid(custom,/清單格式/);
  invalid(changed(map(),v=>v.nodes[0].label=6),/有效 UTF8/);invalid(changed(map(),v=>v.nodes[0].description=null),/有效 UTF8/);
});
test('identifiers are stable ASCII, unique across both queues, and root shape is exact',()=>{
  for(const id of ['', '_x','中文','space id','x\n','x\r','x\u2028','a'.repeat(65)])invalid(changed(map(),v=>v.proposals[0].id=id),/穩定英數識別碼/);
  for(const id of ['A','a-1_b','a'.repeat(64)])assert.equal(validateMindmap(changed(map(),v=>v.proposals[0].id=id)),'');
  invalid(changed(map(),v=>v.nodes[3].id='a'),/不可重複/);invalid(changed(map(),v=>v.proposals[0].id='a'),/不可重複/);
  invalid(changed(map(),v=>v.proposals[1].id='pending_a'),/不可重複/);invalid(changed(map(),v=>v.rootId='a'),/根節點/);
  invalid(changed(map(),v=>v.nodes[1].parentId=''),/根節點/);invalid(changed(map(),v=>v.nodes[0].parentId='a'),/根節點/);
  invalid(changed(map(),v=>v.proposals[0].parentId=''),/父節點識別碼/);invalid(changed(map(),v=>v.nodes[1].parentId=3),/父節點識別碼/);
});
test('accepted tree is connected, acyclic and independent of list order; proposals cannot parent proposals',()=>{
  const original=map();assert.equal(validateMindmap({...original,nodes:[original.nodes[2],original.nodes[3],original.nodes[0],original.nodes[1]]}),'');
  invalid(changed(original,v=>v.nodes[1].parentId='a'),/循環/);invalid(changed(original,v=>v.nodes[1].parentId='grandchild'),/循環/);
  invalid(changed(original,v=>v.nodes[1].parentId='missing'),/父節點必須存在/);
  invalid(changed(original,v=>{v.nodes[1].parentId='b';v.nodes[3].parentId='a';}),/循環/);
  invalid(changed(original,v=>v.nodes[1].parentId='pending_a'),/父節點必須存在/);
  invalid(changed(original,v=>v.proposals[0].parentId='pending_root'),/待選分支的父節點/);
  invalid(changed(original,v=>v.proposals[0].parentId='missing'),/待選分支的父節點/);
});
test('UTF8 bounds, valid Unicode, NUL, whitespace and secret guard match the shared contract',()=>{
  assert.equal(validateMindmap(changed(map(),v=>{v.nodes[1].label='字'.repeat(80);v.nodes[1].description='字'.repeat(666)+'ab';})), '');
  invalid(changed(map(),v=>v.nodes[1].label='字'.repeat(81)),/名稱空白或超過/);
  invalid(changed(map(),v=>v.nodes[1].description='字'.repeat(667)),/說明空白或超過/);
  invalid(changed(map(),v=>v.proposals[0].description='x'.repeat(2001)),/說明空白或超過/);
  for(const value of ['\ud800','\udfff','a\0b'])invalid(changed(map(),v=>v.proposals[0].label=value),/有效 UTF8/);
  for(const value of ['',' \t\r\n','\u3000\u00a0\uFEFF'])invalid(changed(map(),v=>v.nodes[0].label=value),/名稱空白/);
  assert.equal(validateMindmap(changed(map(),v=>v.nodes[0].label=' 🐻 保留\n內容 ')),'');
  const secret='sk-'+'x'.repeat(20);
  for(const field of ['id','label','description'])invalid(changed(map(),v=>v.proposals[0][field]=secret),/請勿.*API Key/);
  invalid(changed(map(),v=>v.rootId=secret),/請勿.*API Key/);
});
test('full native and projected outline sizes reject atomically without truncation',()=>{
  const huge={kind:'mindmap',rootId:'r',nodes:[node('r','','根'),...Array.from({length:30},(_,i)=>node('c'+i,'r','名稱','x'.repeat(2000)))],proposals:[]};
  invalid(huge,/60000.*未保存且未截斷/);assert.throws(()=>exportMindmap(huge,'json'),/60000/);
  const deep={kind:'mindmap',rootId:'n0',nodes:Array.from({length:80},(_,i)=>node('n'+i,i?'n'+(i-1):'','N','x'.repeat(680))),proposals:[]};
  assert.ok(bytes(JSON.stringify(deep))<60000);invalid(deep,/文字投影超過/);assert.throws(()=>cloneMindmap(deep),/文字投影超過/);
  const separators={kind:'mindmap',rootId:'r',nodes:[node('r','','根'),...Array.from({length:30},(_,i)=>node('c'+i,'r','N','\u2028'.repeat(333)))],proposals:[]};
  assert.ok(bytes(JSON.stringify(separators))<60000);invalid(separators,/60000/);
});
test('projection is the full deterministic PHP-compatible outline with pending branches labelled unaccepted',()=>{
  const value={kind:'mindmap',rootId:'root',nodes:[node('child','root',' 子 ','一\n二'),node('root','','主題','根說明')],proposals:[node('p','child',' 待選 ',' 保留\n換行 ')]};
  assert.deepEqual(mindmapItems(value),[{id:'document',label:'心智圖來源',content:'已加入心智圖：\n- [root] 主題\n  說明：根說明\n  - [child]  子 \n    說明：一\n二\n\n待選分支（尚未加入心智圖）：\n- [p]  待選 （父節點：child）\n  說明： 保留\n換行 '}]);
  assert.ok(mindmapItems(defaultMindmap())[0].content.endsWith('待選分支（尚未加入心智圖）：\n（無）'));
  assert.deepEqual(value.nodes[0],node('child','root',' 子 ','一\n二'));
});
test('rename, custom children and move preserve IDs/content and are immutable',()=>{
  const value=map(),renamed=updateMindmapNode(value,'a',{label:'  新名稱  ',description:'  自由說明\n第二行 '});
  assert.equal(renamed.nodes[1].id,'a');assert.equal(renamed.nodes[1].parentId,'theme');assert.equal(renamed.nodes[1].label,'  新名稱  ');assert.deepEqual(renamed.proposals,value.proposals);
  const added=addMindmapChild(value,'a','自填','自填說明','custom');assert.deepEqual(added.nodes.at(-1),node('custom','a','自填','自填說明'));
  const automatic=addMindmapChild(value,'a','自填');assert.match(automatic.nodes.at(-1).id,/^node_/);
  const moved=moveMindmapNode(value,'a','b');assert.equal(moved.nodes[1].parentId,'b');assert.deepEqual(moved.nodes[2],value.nodes[2]);assert.deepEqual(moved.proposals,value.proposals);
  assert.deepEqual(moveMindmapNode(value,'a','theme'),value);assert.deepEqual(value,map());
  assert.throws(()=>updateMindmapNode(value,'a',{label:'X'}),/缺少欄位/);assert.throws(()=>addMindmapChild(value,'a','new','','pending_a'),/不可重複/);
  assert.throws(()=>addMindmapChild(value,'pending_a','new'),/找不到/);assert.throws(()=>moveMindmapNode(value,'theme','b'),/根節點不可移動/);
  for(const id of ['a','grandchild'])assert.throws(()=>moveMindmapNode(value,'a',id),/循環/);
});
test('explicit merge preserves destination and source text, reparents all children/proposals, and rejects overflow atomically',()=>{
  const original=map(),merged=mergeMindmapNodes(original,'a','b'),destination=merged.nodes.find(n=>n.id==='b');
  assert.equal(destination.label,'分支乙');assert.equal(destination.description,'乙的說明\n\n【合併節點：  分支甲  】\n甲的說明\n第二行');
  assert.equal(merged.nodes.find(n=>n.id==='grandchild').parentId,'b');assert.equal(merged.proposals.find(n=>n.id==='pending_a').parentId,'b');assert.equal(merged.nodes.some(n=>n.id==='a'),false);
  assert.deepEqual(merged.proposals.filter(n=>n.id!=='pending_a'),original.proposals.filter(n=>n.id!=='pending_a'));assert.deepEqual(original,map());
  for(const destination of ['a','grandchild'])assert.throws(()=>mergeMindmapNodes(original,'a',destination),/循環/);
  assert.throws(()=>mergeMindmapNodes(original,'theme','b'),/根節點不可合併/);
  const large=changed(original,v=>v.nodes[3].description='x'.repeat(2000)),before=copy(large);assert.throws(()=>mergeMindmapNodes(large,'a','b'),/說明空白或超過/);assert.deepEqual(large,before);
  const intoRoot=mergeMindmapNodes(original,'a','theme');assert.equal(intoRoot.nodes.find(n=>n.id==='grandchild').parentId,'theme');assert.equal(intoRoot.rootId,'theme');
});
test('only explicitly selected proposals enter the accepted tree with their original stable IDs',()=>{
  const value=map(),accepted=acceptMindmapProposals(value,['pending_other']);assert.equal(accepted.nodes.length,value.nodes.length+1);
  assert.deepEqual(accepted.nodes.at(-1),value.proposals[2]);assert.deepEqual(accepted.proposals,value.proposals.slice(0,2));assert.deepEqual(value,map());
  assert.deepEqual(acceptMindmapProposals(value,[]),value);
  for(const ids of [['missing'],['a'],['pending_a','pending_a'],[null]])assert.throws(()=>acceptMindmapProposals(value,ids),/找不到|不可重複/);
  const full={kind:'mindmap',rootId:'r',nodes:[node('r','','R'),...Array.from({length:79},(_,i)=>node('n'+i,'r'))],proposals:[node('p','r')]};
  assert.equal(validateMindmap(full),'');const before=copy(full);assert.throws(()=>acceptMindmapProposals(full,['p']),/數量/);assert.deepEqual(full,before);
});
test('delete never deletes root, branches, or a leaf that still owns proposals',()=>{
  const value=map();assert.throws(()=>deleteMindmapLeaf(value,'theme'),/根節點不可刪除/);assert.throws(()=>deleteMindmapLeaf(value,'a'),/末端節點/);
  const withPending=changed(value,v=>v.proposals.push(node('p_b','b')));assert.throws(()=>deleteMindmapLeaf(withPending,'b'),/末端節點/);
  const deleted=deleteMindmapLeaf(value,'b');assert.equal(deleted.nodes.length,3);assert.deepEqual(deleted.proposals,value.proposals);assert.deepEqual(value,map());
});

class FixtureNode {
  constructor(tag,document,namespace=null){this.tagName=tag.toUpperCase();this.ownerDocument=document;this.namespaceURI=namespace;this.children=[];this.parentNode=null;this.attributes={};this.listeners={};this.className='';this.disabled=false;this.checked=false;this._text='';}
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
function fixture(){
  const document={createElement(tag){return new FixtureNode(tag,this);},createElementNS(namespace,tag){return new FixtureNode(tag,this,namespace);},getElementById(id){return this.body.querySelector('#'+id);}};document.body=document.createElement('body');return document;
}
function control(root,labelText){const label=root.querySelectorAll('label').find(node=>node.textContent===labelText);assert.ok(label,'label exists: '+labelText);const input=root.querySelector('#'+label.getAttribute('for'));assert.ok(input);return input;}
function button(root,text){const found=root.querySelectorAll('button').find(node=>node.textContent===text);assert.ok(found,'button exists: '+text);return found;}
async function fill(root,label,value,event='input'){const input=control(root,label);input.value=value;await input.dispatch(event);return input;}
async function select(root,id){await fill(root,'選取要編輯的節點',id,'change');}
async function tick(root,label,checked=true){const input=control(root,label);input.checked=checked;await input.dispatch('change');return input;}
const allNodes=root=>[root,...root.children.flatMap(allNodes)];
function editor(value=map(),options={}){const document=fixture(),snapshots=[],root=renderMindmapEditor(value,{document,onChange:value=>snapshots.push(value),...options});document.body.append(root);return {document,snapshots,root};}

test('genuine SVG draws only accepted nodes/edges and preserves every node in a full accessible list',()=>{
  const document=fixture(),root=renderMindmap(map(),{document,compact:true});document.body.append(root);const svg=root.querySelector('svg');assert.ok(svg);
  assert.equal(svg.namespaceURI,'http://www.w3.org/2000/svg');assert.equal(svg.getAttribute('role'),'img');
  for(const id of svg.getAttribute('aria-labelledby').split(' '))assert.ok(document.getElementById(id));
  assert.equal(svg.querySelectorAll('g').length,4);assert.equal(svg.querySelectorAll('path').length,3);assert.equal(svg.textContent.includes('甲待選'),false);assert.equal(svg.textContent.includes('根待選'),false);
  const entries=root.querySelector('.mindmap-node-list').querySelectorAll('li');assert.equal(entries.length,4);
  assert.ok(entries[1].textContent.includes('  分支甲  '));assert.ok(entries[1].textContent.includes('甲的說明\n第二行'));assert.ok(entries[2].textContent.includes('父節點：  分支甲  （a）'));
  assert.ok(root.querySelector('.mindmap-pending-preview').textContent.includes('待選分支（尚未加入心智圖）'));assert.ok(root.querySelector('.mindmap-pending-preview').textContent.includes('  完整\n待選說明  '));
  assert.equal(root.querySelector('.mindmap-svg-scroll').getAttribute('tabindex'),'0');
  for(const entry of allNodes(svg))for(const [name,value] of Object.entries(entry.attributes)){assert.doesNotMatch(name,/^on|href/i);assert.doesNotMatch(value,/NaN|Infinity|undefined/);}
});
test('single root, deep 80-node tree, and broad tree have finite real geometry and complete lists',()=>{
  const deep={kind:'mindmap',rootId:'n0',nodes:Array.from({length:80},(_,i)=>node('n'+i,i?'n'+(i-1):'')),proposals:[]};
  const broad={...deep,nodes:deep.nodes.map((entry,i)=>({...entry,parentId:i?'n0':''}))};
  for(const value of [defaultMindmap(),deep,broad]){
    const root=renderMindmap(value,{document:fixture()}),svg=root.querySelector('svg');assert.ok(svg);assert.equal(svg.querySelectorAll('g').length,value.nodes.length);assert.equal(svg.querySelectorAll('path').length,value.nodes.length-1);
    assert.equal(root.querySelector('.mindmap-node-list').querySelectorAll('li').length,value.nodes.length);assert.doesNotMatch(exportMindmap(value,'svg').text,/NaN|Infinity/);
    assert.ok(Number(svg.getAttribute('width'))>0);assert.ok(Number(svg.getAttribute('height'))>0);
  }
});
test('selection via SVG and native list button selects a node without changing any artifact',async()=>{
  const document=fixture(),selected=[],root=renderMindmap(map(),{document,onSelect:id=>selected.push(id),selectedNodeId:'a'});document.body.append(root);
  await root.querySelector('svg').querySelectorAll('g').find(n=>n.getAttribute('data-node-id')==='b').dispatch('click');
  const listButton=root.querySelectorAll('button').find(n=>n.getAttribute('aria-label')==='選取節點：  分支甲  （a）');assert.ok(listButton);assert.equal(listButton.getAttribute('aria-pressed'),'true');await listButton.dispatch('click');assert.deepEqual(selected,['b','a']);
  const invalidRoot=renderMindmap({...map(),rootId:'absent'},{document});assert.equal(invalidRoot.querySelector('svg'),null);assert.match(invalidRoot.textContent,/根節點/);
});
test('rendering/export never inserts executable markup; JSON preserves proposals and TXT labels them clearly',()=>{
  const payload='</text><script>alert("X")</script> & <img src=x onerror=x>',value=changed(map(),v=>{v.nodes[1].label=payload;v.nodes[1].description='Control\x01text';});
  const root=renderMindmap(value,{document:fixture()}),svg=exportMindmap(value,'svg');assert.equal(root.querySelector('script'),null);assert.equal(root.querySelector('img'),null);assert.ok(root.textContent.includes(payload));
  assert.equal(svg.filename,'mindmap.svg');assert.equal(svg.mime,'image/svg+xml;charset=utf-8');assert.match(svg.text,/&lt;script&gt;/);assert.match(svg.text,/&amp;/);assert.match(svg.text,/Control�text/);
  assert.doesNotMatch(svg.text,/<script|<iframe|<img|<foreignObject|<image|<use|<[^>]*\s(?:on[a-z]+|href)=/i);assert.doesNotMatch(svg.text,/甲待選|根待選|\x01/);
  const json=exportMindmap(value,'json');assert.equal(json.mime,'application/json;charset=utf-8');assert.deepEqual(JSON.parse(json.text),value);
  const txt=exportMindmap(value,'txt');assert.equal(txt.text,mindmapItems(value)[0].content+'\n');assert.match(txt.text,/待選分支（尚未加入心智圖）：/);assert.ok(txt.text.includes('甲待選'));assert.throws(()=>exportMindmap(value,'html'),/只支援 SVG、JSON 或 TXT/);
});
test('editor starts with unchecked proposals, selection/checkbox changes do not emit, and only checked branches enter draft',async()=>{
  const {root,snapshots}=editor();assert.equal(snapshots.length,0);const first=control(root,'根待選'),other=control(root,'另一待選');assert.equal(first.checked,false);assert.equal(other.checked,false);
  assert.equal(button(root,'將勾選分支加入草稿').disabled,true);await tick(root,'根待選');assert.equal(snapshots.length,0);
  const stale=button(root,'將勾選分支加入草稿');await stale.dispatch('click');assert.equal(snapshots.length,1);assert.ok(snapshots[0].nodes.some(n=>n.id==='pending_root'));assert.ok(snapshots[0].proposals.some(n=>n.id==='pending_other'));
  assert.equal(snapshots[0].proposals.some(n=>n.id==='pending_root'),false);await stale.dispatch('click');assert.equal(snapshots.length,1,'detached repeated click cannot replay acceptance');
  await select(root,'a');assert.equal(snapshots.length,1);assert.equal(control(root,'甲待選').checked,false);await tick(root,'甲待選');await button(root,'將勾選分支加入草稿').dispatch('click');assert.equal(snapshots.length,2);assert.equal(snapshots.at(-1).nodes.find(n=>n.id==='pending_a').parentId,'a');
});
test('editor keeps interrupted field drafts by node, applies exact text only explicitly, and reset does not emit',async()=>{
  const original=map(),{root,snapshots}=editor(original);await select(root,'a');await fill(root,'節點名稱','  改名\n保留  ');await fill(root,'節點說明','新說明\n第二行');assert.equal(snapshots.length,0);
  await select(root,'b');await select(root,'a');assert.equal(control(root,'節點名稱').value,'  改名\n保留  ');
  await button(root,'套用節點修改至草稿').dispatch('click');assert.equal(snapshots.length,1);assert.equal(snapshots[0].nodes[1].id,'a');assert.equal(snapshots[0].nodes[1].label,'  改名\n保留  ');assert.equal(snapshots[0].nodes[1].description,'新說明\n第二行');
  await button(root,'套用節點修改至草稿').dispatch('click');assert.equal(snapshots.length,1,'same fields do not create fake change');
  await fill(root,'節點名稱','discard');await button(root,'放棄此節點欄位修改').dispatch('click');assert.equal(control(root,'節點名稱').value,'  改名\n保留  ');assert.equal(snapshots.length,1);assert.deepEqual(original,map());
});
test('invalid partial typing and overflow do not emit or alter the accepted SVG; correcting fields recovers',async()=>{
  const {root,snapshots}=editor();await select(root,'a');await fill(root,'節點名稱',' ');await button(root,'套用節點修改至草稿').dispatch('click');assert.equal(snapshots.length,0);assert.match(root.querySelector('.artifact-error').textContent,/名稱空白/);
  assert.ok(root.querySelector('svg').textContent.includes('  分支甲  '));assert.equal(control(root,'節點名稱').value,' ');
  await fill(root,'節點名稱','修正');await fill(root,'節點說明','字'.repeat(667));await button(root,'套用節點修改至草稿').dispatch('click');assert.equal(snapshots.length,0);assert.match(root.querySelector('.artifact-error').textContent,/說明空白或超過/);
  await fill(root,'節點說明','完整說明');await button(root,'套用節點修改至草稿').dispatch('click');assert.equal(snapshots.length,1);assert.equal(validateMindmap(snapshots[0]),'');
});
test('custom child fields survive selection interruption and append exactly one valid child with stable identity',async()=>{
  const {root,snapshots}=editor();await select(root,'a');await fill(root,'自填子節點名稱','我的子節點');await fill(root,'自填子節點說明','  我的說明\n保留空白 ');await select(root,'b');await select(root,'a');assert.equal(control(root,'自填子節點名稱').value,'我的子節點');
  const stale=button(root,'將自填子節點加入草稿');await stale.dispatch('click');await stale.dispatch('click');assert.equal(snapshots.length,1);
  const child=snapshots[0].nodes.at(-1);assert.match(child.id,/^node_/);assert.equal(child.parentId,'a');assert.equal(child.description,'  我的說明\n保留空白 ');assert.equal(control(root,'自填子節點名稱').value,'');
  await button(root,'將自填子節點加入草稿').dispatch('click');assert.equal(snapshots.length,1,'empty custom child rejected, not duplicated');
});
test('move and merge require explicit buttons and safe destinations; merge transfers every branch without early automatic narrowing',async()=>{
  const {root,snapshots}=editor();assert.equal(button(root,'移動節點至草稿').disabled,true);assert.equal(button(root,'合併節點至草稿').disabled,true);await select(root,'a');
  const moves=control(root,'移動到父節點').children.map(n=>n.value);assert.deepEqual(moves,['theme','b']);await fill(root,'移動到父節點','b','change');assert.equal(snapshots.length,0);await button(root,'移動節點至草稿').dispatch('click');assert.equal(snapshots.length,1);assert.equal(snapshots[0].nodes[1].parentId,'b');
  await fill(root,'明確選擇合併目的節點','b','change');assert.equal(snapshots.length,1);assert.equal(button(root,'合併節點至草稿').disabled,false);await button(root,'合併節點至草稿').dispatch('click');assert.equal(snapshots.length,2);
  const state=snapshots.at(-1);assert.equal(state.nodes.some(n=>n.id==='a'),false);assert.equal(state.nodes.find(n=>n.id==='grandchild').parentId,'b');assert.equal(state.proposals[0].parentId,'b');assert.equal(control(root,'選取要編輯的節點').value,'b');assert.match(control(root,'節點說明').value,/【合併節點：  分支甲  】/);
});
test('merge overflow, malicious move value, and acceptance capacity failure are atomic and recoverable in real callbacks',async()=>{
  const large=changed(map(),v=>v.nodes[3].description='x'.repeat(2000)),{root,snapshots}=editor(large);await select(root,'a');await fill(root,'明確選擇合併目的節點','b','change');await button(root,'合併節點至草稿').dispatch('click');assert.equal(snapshots.length,0);assert.match(root.querySelector('.artifact-error').textContent,/說明空白或超過/);assert.equal(root.querySelector('svg').querySelectorAll('g').length,4);
  await fill(root,'移動到父節點','grandchild','change');await button(root,'移動節點至草稿').dispatch('click');assert.equal(snapshots.length,0);assert.match(root.querySelector('.artifact-error').textContent,/循環/);
  const full={kind:'mindmap',rootId:'r',nodes:[node('r','','R'),...Array.from({length:79},(_,i)=>node('n'+i,'r'))],proposals:[node('p','r','等待加入')]},second=editor(full);assert.equal(button(second.root,'將自填子節點加入草稿').disabled,true);await tick(second.root,'等待加入');await button(second.root,'將勾選分支加入草稿').dispatch('click');assert.equal(second.snapshots.length,0);assert.equal(control(second.root,'等待加入').checked,true);assert.match(second.root.querySelector('.artifact-error').textContent,/數量/);
});
test('leaf removal and bounded 20-step undo are local snapshot operations',async()=>{
  const {root,snapshots}=editor();assert.equal(button(root,'移除空末端節點').disabled,true);await select(root,'a');assert.equal(button(root,'移除空末端節點').disabled,true);await select(root,'b');await button(root,'移除空末端節點').dispatch('click');assert.equal(snapshots.length,1);assert.equal(snapshots[0].nodes.length,3);await button(root,'復原上一步草稿操作').dispatch('click');assert.deepEqual(snapshots.at(-1),map());
  assert.equal(button(root,'復原上一步草稿操作').disabled,true);
  for(let i=1;i<=23;i++){await fill(root,'節點名稱','修訂'+i);await button(root,'套用節點修改至草稿').dispatch('click');}
  for(let i=0;i<20;i++)await button(root,'復原上一步草稿操作').dispatch('click');assert.equal(control(root,'節點名稱').value,'修訂3');assert.equal(button(root,'復原上一步草稿操作').disabled,true);assert.equal(validateMindmap(snapshots.at(-1)),'');
});
test('readonly controls and detached handlers cannot mutate, emit, or accidentally trigger a later selected node',async()=>{
  const disabled=editor(map(),{disabled:true});assert.equal(disabled.root.querySelectorAll('input,textarea,select,button').every(n=>n.disabled),true);
  for(const input of disabled.root.querySelectorAll('input,textarea,select')){input.value='tampered';input.checked=true;await input.dispatch('input');await input.dispatch('change');}
  for(const action of disabled.root.querySelectorAll('button'))await action.dispatch('click');assert.equal(disabled.snapshots.length,0);
  const {root,snapshots}=editor();await select(root,'a');const staleInput=control(root,'節點名稱'),staleApply=button(root,'套用節點修改至草稿');await select(root,'b');staleInput.value='wrong node';await staleInput.dispatch('input');await staleApply.dispatch('click');assert.equal(snapshots.length,0);assert.equal(control(root,'節點名稱').value,'分支乙');
});
test('callbacks receive complete isolated snapshots; callback failure is visible rather than falsely reporting saved success',async()=>{
  const values=[],{root}=editor(map(),{onChange:value=>{values.push(copy(value));value.nodes[0].label='consumer tampering';}});await fill(root,'節點名稱','新主題');await button(root,'套用節點修改至草稿').dispatch('click');assert.equal(values.length,1);assert.equal(values[0].nodes[0].label,'新主題');assert.equal(control(root,'節點名稱').value,'新主題');
  const broken=editor(map(),{onChange:()=>{throw new Error('外層測試錯誤');}});await fill(broken.root,'節點名稱','本機草稿');await button(broken.root,'套用節點修改至草稿').dispatch('click');assert.match(broken.root.querySelector('.artifact-error').textContent,/外層接收失敗.*尚未保存版本/);assert.equal(control(broken.root,'節點名稱').value,'本機草稿');
});
test('module is standalone, safe DOM/SVG primitives only, with no automatic persistence, networking, downloads or dynamic evaluation',async()=>{
  const source=await readFile(new URL('../public/mindmap.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\bimport\s|\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|\.innerHTML\s*=|insertAdjacentHTML|\beval\s*\(|new Function|createObjectURL|\.click\s*\(/);
  assert.match(source,/createElementNS/);assert.match(source,/textContent/);assert.match(source,/history\.length>20/);
});

test('shared ephemeral uiState retains selected node and unapplied raw text through busy/read-only and AI-response rerenders',async()=>{
  const uiState={},pending=[],first=editor(map(),{uiState,onPendingChange:value=>pending.push(value)});
  assert.deepEqual(pending,[false]);await select(first.root,'a');await fill(first.root,'節點名稱','  未套用\n名稱  ');await fill(first.root,'節點說明','尚未套用的說明');await fill(first.root,'自填子節點名稱','還沒加入');await fill(first.root,'自填子節點說明','保留所有\n草稿');
  assert.deepEqual(pending,[false,true]);assert.equal(first.snapshots.length,0);assert.equal(uiState.selectedNodeId,'a');
  const staleInput=control(first.root,'節點名稱'),staleApply=button(first.root,'套用節點修改至草稿');
  const readonlyPending=[],readonly=editor(map(),{uiState,disabled:true,onPendingChange:value=>readonlyPending.push(value)});
  assert.deepEqual(readonlyPending,[true]);assert.equal(control(readonly.root,'選取要編輯的節點').value,'a');assert.equal(control(readonly.root,'節點名稱').value,'  未套用\n名稱  ');assert.equal(control(readonly.root,'自填子節點說明').value,'保留所有\n草稿');
  staleInput.value='detached interference';await staleInput.dispatch('input');await staleApply.dispatch('click');assert.equal(first.snapshots.length,0);
  const aiResponse=changed(map(),v=>{v.proposals=v.proposals.filter(n=>n.parentId!=='a');v.proposals.push(node('fresh','a','新待選'));}),afterPending=[],after=editor(aiResponse,{uiState,onPendingChange:value=>afterPending.push(value)});
  assert.deepEqual(afterPending,[true]);assert.equal(control(after.root,'節點名稱').value,'  未套用\n名稱  ');assert.equal(control(after.root,'自填子節點名稱').value,'還沒加入');assert.equal(control(after.root,'新待選').checked,false);
  await button(after.root,'套用節點修改至草稿').dispatch('click');assert.equal(after.snapshots.length,1);assert.deepEqual(afterPending,[true],'custom child is still pending');assert.ok(after.snapshots[0].proposals.some(n=>n.id==='fresh'));
  await button(after.root,'放棄自填子節點').dispatch('click');assert.deepEqual(afterPending,[true,false]);assert.equal(after.snapshots.length,1);assert.equal(control(after.root,'自填子節點名稱').value,'');
  assert.deepEqual(Object.keys(JSON.parse(exportMindmap(after.snapshots[0],'json').text)),['kind','rootId','nodes','proposals']);assert.deepEqual(map().nodes,aiResponse.nodes);
});
test('pending notifications cover invalid fields, cancellation, multiple nodes, child whitespace and reversible no-ops',async()=>{
  const pending=[],{root,snapshots}=editor(map(),{onPendingChange:value=>pending.push(value)});await select(root,'a');await fill(root,'節點名稱',' ');await button(root,'套用節點修改至草稿').dispatch('click');assert.deepEqual(pending,[false,true]);assert.equal(snapshots.length,0);
  await select(root,'b');await fill(root,'節點說明','B 未套用');await button(root,'放棄此節點欄位修改').dispatch('click');assert.deepEqual(pending,[false,true],'node A remains pending');assert.match(root.querySelector('.mindmap-pending-status').textContent,/分支甲/);
  await select(root,'a');await button(root,'放棄此節點欄位修改').dispatch('click');assert.deepEqual(pending,[false,true,false]);
  await fill(root,'自填子節點名稱',' ');assert.deepEqual(pending,[false,true,false,true]);await button(root,'將自填子節點加入草稿').dispatch('click');assert.equal(snapshots.length,0);assert.equal(control(root,'自填子節點名稱').value,' ');
  await button(root,'放棄自填子節點').dispatch('click');assert.deepEqual(pending,[false,true,false,true,false]);await fill(root,'節點名稱','  分支甲  ');assert.deepEqual(pending,[false,true,false,true,false],'typing identical content is not pending');
});
test('merge, deletion and undo cannot silently discard raw field or custom-child drafts',async()=>{
  const {root,snapshots}=editor();await fill(root,'節點名稱','根的新名稱');await button(root,'套用節點修改至草稿').dispatch('click');assert.equal(button(root,'復原上一步草稿操作').disabled,false);
  await select(root,'b');await fill(root,'明確選擇合併目的節點','a','change');assert.equal(button(root,'合併節點至草稿').disabled,false);assert.equal(button(root,'移除空末端節點').disabled,false);
  await fill(root,'自填子節點名稱','未完成分支');assert.equal(button(root,'合併節點至草稿').disabled,true);assert.equal(button(root,'移除空末端節點').disabled,true);assert.equal(button(root,'復原上一步草稿操作').disabled,true);
  for(const label of ['合併節點至草稿','移除空末端節點','復原上一步草稿操作'])await button(root,label).dispatch('click');assert.equal(snapshots.length,1);assert.equal(control(root,'自填子節點名稱').value,'未完成分支');
  await button(root,'放棄自填子節點').dispatch('click');assert.equal(button(root,'移除空末端節點').disabled,false);assert.equal(button(root,'復原上一步草稿操作').disabled,false);
});
