// Actual module and event handlers using a minimal fake DOM. No browser,
// screenshots, networking, PHP runtime or external compatibility claims.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {defaultWebpage,defaultWebpageSection,defaultWebpageEntry,validateWebpage,cloneWebpage,webpageCompactJson,webpageItems,updateWebpageDocument,updateWebpageSection,addWebpageSection,removeWebpageSection,reorderWebpageSection,addWebpageEntry,updateWebpageEntry,removeWebpageEntry,reorderWebpageEntry,renderWebpage,renderWebpageEditor,exportWebpage,WEBPAGE_STYLES,WEBPAGE_CSP} from '../public/webpage.js';
const types=['hero','text','cards','faq','cta'];
const copy=value=>JSON.parse(JSON.stringify(value));
const changed=(value,edit)=>{const next=copy(value);edit(next);return next;};
const bytes=value=>new TextEncoder().encode(value).length;
const invalid=(value,pattern)=>assert.match(validateWebpage(value),pattern);
const fields=section=>{const {id,type,...rest}=section;return rest;};
const sample=()=>({kind:'webpage',title:'共同編輯 <網頁> & "內容"',theme:'paper',navigation:true,sections:types.map((type,index)=>({...defaultWebpageSection(type,'s'+index,'s0'),eyebrow:'  主題 '+index+'  ',heading:'內容區塊 '+index,body:' 第一行\r\n第二行 🐻\n https://example.test/不是超連結 ',...(type==='hero'?{actionLabel:'前往介紹',actionTarget:'s1'}:{}),...(type==='cards'||type==='faq'?{entries:[{id:'one',title:'  條目一  ',body:'第一段\n 保留內容 '},{id:'two',title:'條目二',body:''}]}:{})}))});

class FixtureNode{
  constructor(tag,document){this.tagName=tag.toUpperCase();this.ownerDocument=document;this.children=[];this.parentNode=null;this.attributes={};this.listeners={};this.className='';this.disabled=false;this._text='';this.scrolls=[];this.focuses=[];}
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
  async dispatch(type){const event={type,target:this,prevented:false,preventDefault(){this.prevented=true;}};for(const listener of this.listeners[type]||[])await listener(event);return event;}
  scrollIntoView(options){this.scrolls.push(options);}
  focus(options){this.focuses.push(options);}
}
function fixture(){const document={createElement(tag){return new FixtureNode(tag,this);},getElementById(id){return this.body.querySelector('#'+id);}};document.body=document.createElement('body');return document;}
const allNodes=root=>[root,...root.children.flatMap(allNodes)];
function control(root,labelText){const label=root.querySelectorAll('label').find(node=>node.textContent===labelText);assert.ok(label,'label exists: '+labelText);const input=root.querySelector('#'+label.getAttribute('for'));assert.ok(input);return input;}
function button(root,text){const found=root.querySelectorAll('button').find(node=>node.textContent===text);assert.ok(found,'button exists: '+text);return found;}
async function fill(root,label,value,event='input'){const input=control(root,label);input.value=value;await input.dispatch(event);return input;}
async function select(root,id){return fill(root,'選取要編輯的內容區塊',id,'change');}
function editor(value=sample(),options={}){const document=fixture(),snapshots=[],pending=[],uiState=options.uiState||{},root=renderWebpageEditor(value,{document,uiState,onChange:value=>snapshots.push(value),onPendingChange:value=>pending.push(value),...options});document.body.append(root);return {document,snapshots,pending,root,uiState};}

test('default and all five section types validate; canonical clones isolate entries and preserve literal text',()=>{
  assert.equal(validateWebpage(defaultWebpage()),'');assert.equal(validateWebpage(sample()),'');
  for(const type of types)assert.equal(defaultWebpageSection(type).type,type);assert.throws(()=>defaultWebpageSection('html'),/不支援/);
  assert.deepEqual(defaultWebpageEntry(),{id:'entry_1',title:'條目標題',body:'在這裡填寫內容。'});
  const original=sample(),cloned=cloneWebpage(original);assert.deepEqual(cloned,original);cloned.sections[2].entries[0].body='changed';assert.deepEqual(original,sample());
  const reversed=Object.fromEntries(Object.entries(original).reverse());reversed.sections=original.sections.map(section=>Object.fromEntries(Object.entries(section).reverse().map(([key,value])=>[key,key==='entries'?value.map(entry=>Object.fromEntries(Object.entries(entry).reverse())):value])));
  assert.equal(webpageCompactJson(reversed),webpageCompactJson(original));assert.deepEqual(Object.keys(cloneWebpage(reversed)),['kind','title','theme','navigation','sections']);assert.deepEqual(Object.keys(cloneWebpage(reversed).sections[0]),['id','type','eyebrow','heading','body','entries','actionLabel','actionTarget']);assert.deepEqual(Object.keys(cloneWebpage(reversed).sections[2].entries[0]),['id','title','body']);
});
test('exact own keys and dense arrays reject extra, missing, hidden, symbolic, sparse or unsupported data',()=>{
  for(const value of [null,undefined,7,false,'webpage',[]])invalid(value,/完整物件/);
  invalid({...sample(),extra:1},/未支援/);invalid(changed(sample(),value=>delete value.theme),/缺少/);invalid({...sample(),kind:'html'},/類型/);
  for(const edit of [v=>v.sections[0].extra='',v=>delete v.sections[0].body,v=>v.sections[2].entries[0].html='x'])invalid(changed(sample(),edit),/未支援|缺少/);
  const symbol=sample();symbol[Symbol('hidden')]=1;invalid(symbol,/未支援/);
  const hidden=sample();Object.defineProperty(hidden.sections[0],'hidden',{value:1});invalid(hidden,/未支援/);
  for(const location of ['sections','entries']){
    const sparse=sample(),list=location==='sections'?sparse.sections:sparse.sections[2].entries;delete list[0];invalid(sparse,/清單格式/);
    const extra=sample(),array=location==='sections'?extra.sections:extra.sections[2].entries;array.extra=1;invalid(extra,/清單格式/);
    const symbolic=sample(),arr=location==='sections'?symbolic.sections:symbolic.sections[2].entries;arr[Symbol('hidden')]=0;invalid(symbolic,/清單格式/);
  }
  for(const count of [0,21])invalid({...defaultWebpage(),sections:Array.from({length:count},(_,index)=>defaultWebpageSection('text','s'+index))},/數量/);
  assert.equal(validateWebpage({...defaultWebpage(),sections:Array.from({length:20},(_,index)=>defaultWebpageSection('text','s'+index))}),'');
  for(const type of ['script','form','image','iframe'])invalid(changed(sample(),value=>value.sections[0].type=type),/只支援/);
  for(const theme of ['#fff','url(x)','__proto__','constructor',null,false])invalid({...sample(),theme},/風格只支援/);
  for(const theme of ['paper','midnight','meadow'])assert.equal(validateWebpage({...sample(),theme}),'');
  for(const navigation of ['true',0,1,null,undefined])invalid({...sample(),navigation},/布林值/);
});
test('stable IDs are ASCII, unique in scope, safe even with object prototype key names',()=>{
  for(const id of ['', '_id','中文','x y','x\n','x\r','x\u2028','a'.repeat(65)])invalid(changed(sample(),value=>value.sections[2].id=id),/穩定英數/);
  for(const id of ['constructor','toString','hasOwnProperty','a-1_b','a'.repeat(64)])assert.equal(validateWebpage(changed(sample(),value=>value.sections[2].id=id)),'');
  invalid(changed(sample(),value=>value.sections[2].id='s1'),/不可重複/);invalid(changed(sample(),value=>value.sections[2].entries[1].id='one'),/不可重複/);
  assert.equal(validateWebpage(sample()),''); // IDs 'one'/'two' may repeat across different sections.
  invalid(changed(sample(),value=>value.sections[2].entries[0].id='<svg>'),/穩定英數/);
});
test('cards/FAQ require one to twelve exact entries; other section entry lists remain empty',()=>{
  for(const index of [2,3])for(const count of [0,13])invalid(changed(sample(),value=>value.sections[index].entries=Array.from({length:count},(_,i)=>defaultWebpageEntry('e'+i))),/數量/);
  for(const index of [2,3])assert.equal(validateWebpage(changed(sample(),value=>value.sections[index].entries=Array.from({length:12},(_,i)=>defaultWebpageEntry('e'+i)))),'');
  for(const index of [0,1,4])invalid(changed(sample(),value=>value.sections[index].entries=[defaultWebpageEntry()]),/數量/);
  invalid(changed(sample(),value=>value.sections[2].entries='not list'),/清單格式/);
});
test('actions permit only existing section IDs, paired hero/CTA labels and mandatory CTA buttons',()=>{
  for(const target of ['missing','#s0','https://evil.test','javascript:alert(1)','s0\n',null])invalid(changed(sample(),value=>value.sections[0].actionTarget=target),/目標|穩定英數/);
  for(const [actionLabel,actionTarget] of [['','s1'],['go',''],['  ','s1']])invalid(changed(sample(),value=>Object.assign(value.sections[0],{actionLabel,actionTarget})),/同時/);
  assert.equal(validateWebpage(changed(sample(),value=>Object.assign(value.sections[0],{actionLabel:'',actionTarget:''}))),'');
  invalid(changed(sample(),value=>Object.assign(value.sections[4],{actionLabel:'',actionTarget:''})),/必須有/);
  for(const index of [1,2,3])invalid(changed(sample(),value=>Object.assign(value.sections[index],{actionLabel:'go',actionTarget:'s0'})),/只有/);
  assert.equal(validateWebpage(changed(sample(),value=>value.sections[4].actionTarget='s4')),'');
});
test('UTF8 byte limits, nonblank headings, exact literals and shared API-key guard apply to all textual fields',()=>{
  const maxed=changed(sample(),value=>{value.title='字'.repeat(200);Object.assign(value.sections[0],{eyebrow:'字'.repeat(80),heading:'字'.repeat(200),body:'字'.repeat(4000),actionLabel:'字'.repeat(80)});value.sections[2].entries[0]={id:'e',title:'字'.repeat(200),body:'字'.repeat(2000)};});assert.equal(validateWebpage(maxed),'');
  const edits=[v=>v.title='字'.repeat(201),v=>v.sections[0].eyebrow='字'.repeat(81),v=>v.sections[0].heading='字'.repeat(201),v=>v.sections[0].body='字'.repeat(4001),v=>v.sections[0].actionLabel='字'.repeat(81),v=>v.sections[2].entries[0].title='字'.repeat(201),v=>v.sections[2].entries[0].body='字'.repeat(2001)];for(const edit of edits)invalid(changed(sample(),edit),/超過/);
  for(const blank of ['', ' \t\r\n','\u3000\u00a0\uFEFF'])for(const edit of [v=>v.title=blank,v=>v.sections[0].heading=blank,v=>v.sections[2].entries[0].title=blank])invalid(changed(sample(),edit),/空白/);
  for(const invalidText of ['\ud800','\udfff','a\0b',8,null])for(const edit of [v=>v.title=invalidText,v=>v.sections[0].body=invalidText,v=>v.sections[2].entries[0].body=invalidText])invalid(changed(sample(),edit),/有效 UTF8/);
  const secret='sk-'+'x'.repeat(20);for(const edit of [v=>v.title=secret,v=>v.sections[2].id=secret,v=>v.sections[0].eyebrow=secret,v=>v.sections[0].heading=secret,v=>v.sections[0].body=secret,v=>v.sections[0].actionLabel=secret,v=>v.sections[0].actionTarget=secret,v=>v.sections[2].entries[0].id=secret,v=>v.sections[2].entries[0].title=secret,v=>v.sections[2].entries[0].body=secret])invalid(changed(sample(),edit),/請勿.*API Key/);
  const literal='  <script> 🐻 & \t\r\n\u2028\u2029 https://x.test  ',value=changed(sample(),v=>v.sections[0].body=literal);assert.equal(cloneWebpage(value).sections[0].body,literal);assert.equal(JSON.parse(exportWebpage(value,'json').text).sections[0].body,literal);
});
test('canonical JSON has fixed order and PHP separator escapes; projection is a single document, never per section',()=>{
  const value=changed(sample(),v=>v.title='分隔\u2028\u2029 /'),encoded=webpageCompactJson(value);assert.match(encoded,/"title":"分隔\\u2028\\u2029 \/"/);assert.match(encoded,/"navigation":true/);assert.deepEqual(JSON.parse(encoded),value);
  assert.deepEqual(webpageItems(value),[{id:'document',label:'網頁來源',content:encoded}]);assert.equal(exportWebpage(value,'json').text,encoded+'\n');assert.equal(exportWebpage(value,'txt').text,encoded+'\n');
  assert.equal(exportWebpage(value,'json').mime,'application/json;charset=utf-8');assert.equal(exportWebpage(value,'txt').mime,'text/plain;charset=utf-8');
});
test('60000-byte canonical boundary is exact, atomic, and counts separator escaping',()=>{
  const value={...defaultWebpage(),sections:Array.from({length:5},(_,i)=>({...defaultWebpageSection('text','s'+i),body:'x'.repeat(i<4?12000:1)}))},before=bytes(webpageCompactJson(value));value.sections[4].body+='x'.repeat(60000-before);assert.equal(bytes(webpageCompactJson(value)),60000);assert.equal(validateWebpage(value),'');value.sections[4].body+='x';invalid(value,/60000.*未保存且未截斷/);assert.throws(()=>exportWebpage(value,'html'),/60000/);
  const separator={...defaultWebpage(),sections:Array.from({length:5},(_,i)=>({...defaultWebpageSection('text','s'+i),body:'\u2028'.repeat(2200)}))};assert.ok(bytes(JSON.stringify(separator))<60000);invalid(separator,/60000/);
  const original=sample();assert.throws(()=>updateWebpageSection(original,'s0',{...fields(original.sections[0]),body:'x'.repeat(12001)}),/超過/);assert.deepEqual(original,sample());
});
test('pure immutable operations preserve section/entry identity and explicitly protect incoming targets',()=>{
  const original=sample(),updated=updateWebpageDocument(original,{title:'  new  ',theme:'midnight',navigation:false});assert.equal(updated.title,'  new  ');assert.deepEqual(updated.sections,original.sections);
  const section=updateWebpageSection(original,'s0',{...fields(original.sections[0]),heading:'新的標題'});assert.equal(section.sections[0].id,'s0');assert.equal(section.sections[0].heading,'新的標題');
  const added=addWebpageSection(original,'cta');assert.equal(added.sections.length,6);assert.equal(added.sections.at(-1).actionTarget,'s0');assert.match(added.sections.at(-1).id,/^section_/);
  const moved=reorderWebpageSection(original,'s0',4);assert.deepEqual(moved.sections.map(section=>section.id),['s1','s2','s3','s4','s0']);assert.equal(moved.sections[3].actionTarget,'s0');
  assert.throws(()=>removeWebpageSection(original,'s0'),/其他行動按鈕/);assert.throws(()=>removeWebpageSection(original,'s1'),/其他行動按鈕/);assert.equal(removeWebpageSection(original,'s2').sections.length,4);assert.throws(()=>removeWebpageSection({...defaultWebpage(),sections:[defaultWebpageSection()]},'section_1'),/至少/);
  assert.throws(()=>reorderWebpageSection(original,'s0',5),/整數/);assert.throws(()=>reorderWebpageSection(original,'s0','1'),/整數/);assert.throws(()=>updateWebpageSection(original,'s0',{heading:'short'}),/缺少/);
  const entryAdded=addWebpageEntry(original,'s2');assert.equal(entryAdded.sections[2].entries.length,3);assert.match(entryAdded.sections[2].entries[2].id,/^entry_/);assert.throws(()=>addWebpageEntry(original,'s0'),/不支援/);
  const entryChanged=updateWebpageEntry(original,'s2','one',{title:'改',body:'保留'});assert.deepEqual(entryChanged.sections[2].entries[0],{id:'one',title:'改',body:'保留'});
  assert.deepEqual(reorderWebpageEntry(original,'s2','one',1).sections[2].entries.map(entry=>entry.id),['two','one']);assert.equal(removeWebpageEntry(original,'s2','one').sections[2].entries.length,1);
  assert.throws(()=>removeWebpageEntry(removeWebpageEntry(original,'s2','one'),'s2','two'),/數量/);assert.throws(()=>updateWebpageEntry(original,'s2','absent',{title:'x',body:''}),/找不到/);assert.throws(()=>reorderWebpageEntry(original,'s2','one',2),/整數/);assert.deepEqual(original,sample());
});

test('native DOM renders all content, navigation anchors, card lists and independently operable FAQ semantics',async()=>{
  const value=sample(),document=fixture(),root=renderWebpage(value,{document,compact:true});document.body.append(root);
  assert.ok(root.className.includes('webpage-preview'));assert.ok(root.className.includes('webpage-theme-paper'));assert.ok(root.className.includes('compact'));assert.equal(root.querySelector('h1').textContent,value.title);
  const nav=root.querySelector('nav');assert.equal(nav.getAttribute('aria-label'),'網頁內容導覽');assert.equal(nav.querySelectorAll('a').length,5);assert.equal(root.querySelectorAll('.webpage-section').length,5);
  const cards=root.querySelector('.webpage-cards');assert.equal(cards.tagName,'UL');assert.equal(cards.querySelectorAll('li').length,2);assert.equal(root.querySelectorAll('details').length,2);assert.equal(root.querySelectorAll('summary').length,2);assert.equal(root.querySelector('details').children[0].tagName,'SUMMARY');assert.equal(root.querySelector('details').getAttribute('name'),null);
  for(const section of root.querySelectorAll('.webpage-section')){assert.equal(section.getAttribute('tabindex'),'-1');assert.ok(document.getElementById(section.getAttribute('aria-labelledby')));}
  for(const anchor of root.querySelectorAll('a')){const href=anchor.getAttribute('href');assert.match(href,/^#[a-zA-Z0-9_-]+$/);const target=document.getElementById(href.slice(1));assert.ok(target);const event=await anchor.dispatch('click');assert.equal(event.prevented,true);assert.equal(target.scrolls.at(-1).behavior,'auto');assert.equal(target.focuses.at(-1).preventScroll,true);}
  assert.ok(root.textContent.includes(value.sections[0].body));assert.equal(renderWebpage({...value,navigation:false},{document:fixture()}).querySelector('nav'),null);
  for(const node of allNodes(root))for(const name of Object.keys(node.attributes))assert.doesNotMatch(name,/^on|style|src|target/i);
});
test('malicious authored markup and URLs are literal in DOM and escaped in standalone HTML',()=>{
  const payload='</title></style></script><script>alert("X")</script><img src="https://evil.test/a" onerror="x"> & " \'',value=changed(sample(),v=>{v.title=payload;v.sections[0].eyebrow=payload;v.sections[0].body=payload+'\r\nhttps://evil.test';v.sections[0].actionLabel='<svg onload=x>';v.sections[2].entries[0].title=payload;v.sections[3].entries[0].body=payload;}),root=renderWebpage(value,{document:fixture()}),out=exportWebpage(value,'html');
  assert.ok(root.textContent.includes(payload));assert.equal(root.querySelector('script,img,iframe,svg,form,style,link'),null);assert.ok(root.querySelector('h1').textContent.includes('</title>'));
  assert.equal(out.filename,'webpage.html');assert.equal(out.mime,'text/html;charset=utf-8');assert.match(out.text,/&lt;script&gt;/);assert.match(out.text,/&amp;/);assert.match(out.text,/&quot;/);assert.match(out.text,/&#39;/);assert.match(out.text,/&#13;\n/);assert.match(out.text,/https:\/\/evil\.test/);
  assert.doesNotMatch(out.text,/<script\b|<img\b|<iframe\b|<svg\b|<form\b|<base\b|<link\b/i);
  for(const tag of out.text.matchAll(/<[a-z][^>]*>/gi))assert.doesNotMatch(tag[0].replace(/"[^"]*"/g,'""'),/\s(?:on[a-z]+|src|srcset|action)=/i);
  assert.equal((out.text.match(/<style>/g)||[]).length,1);assert.equal((out.text.match(/<\/style>/g)||[]).length,1);assert.equal((out.text.match(/<title>/g)||[]).length,1);assert.equal((out.text.match(/<\/title>/g)||[]).length,1);
  for(const match of out.text.matchAll(/href="([^"]*)"/g))assert.match(match[1],/^#webpage-export-section-\d+$/);
  assert.deepEqual(JSON.parse(exportWebpage(value,'json').text),value);assert.throws(()=>exportWebpage(value,'png'),/只支援 HTML、JSON 或 TXT/);
});
test('standalone HTML has an early restrictive CSP, fixed responsive high-contrast themes and no app/private context',()=>{
  const out=exportWebpage(sample(),'html').text;assert.match(out,/^<!doctype html>/);assert.ok(out.indexOf('Content-Security-Policy')<out.indexOf('<title>'));assert.ok(out.indexOf('Content-Security-Policy')<out.indexOf('<style>'));
  for(const directive of ['default-src','script-src','img-src','font-src','connect-src','frame-src','object-src','media-src','worker-src','base-uri','form-action'])assert.ok(WEBPAGE_CSP.includes(directive+" 'none'"));assert.ok(WEBPAGE_CSP.includes("style-src 'unsafe-inline'"));
  assert.match(out,/<meta name="viewport" content="width=device-width, initial-scale=1">/);assert.ok(out.includes(WEBPAGE_STYLES));assert.match(WEBPAGE_STYLES,/@media\(max-width:36rem\)/);assert.match(WEBPAGE_STYLES,/grid-template-columns/);assert.match(WEBPAGE_STYLES,/focus-visible/);assert.match(WEBPAGE_STYLES,/white-space:pre-wrap/);
  assert.doesNotMatch(out,/\b(?:session|provenance|csrf|localStorage|sessionStorage)\b|<script\b|url\s*\(|@import|@font-face|<iframe\b/i);
  for(const theme of ['paper','midnight','meadow'])assert.match(exportWebpage({...sample(),theme},'html').text,new RegExp('webpage-theme-'+theme));assert.equal((out.match(/<details /g)||[]).length,2);assert.equal((out.match(/<summary>/g)||[]).length,2);
});
test('two preview/editor instances use unique generated IDs and each anchor stays in its own DOM subtree',async()=>{
  const document=fixture(),value=changed(sample(),v=>{v.sections[2].id='constructor';v.sections[3].id='toString';}),a=renderWebpage(value,{document,idPrefix:'same unsafe <prefix>'}),b=renderWebpage(value,{document,idPrefix:'same unsafe <prefix>'}),e1=renderWebpageEditor(value,{document,idPrefix:'same'}),e2=renderWebpageEditor(value,{document,idPrefix:'same'});document.body.append(a,b,e1,e2);
  const nodes=allNodes(document.body),ids=nodes.map(node=>node.id).filter(Boolean);assert.equal(new Set(ids).size,ids.length);ids.forEach(id=>assert.match(id,/^[a-zA-Z0-9_-]+$/));
  for(const root of [a,b])for(const anchor of root.querySelectorAll('a')){const target=root.querySelector(anchor.getAttribute('href'));assert.ok(target);await anchor.dispatch('click');assert.ok(target.scrolls.length);}
  assert.notEqual(control(e1,'網頁標題').id,control(e2,'網頁標題').id);assert.equal(Object.prototype.polluted,undefined);
});
test('invalid preview reports validation errors and never partially renders malformed input',()=>{
  const root=renderWebpage(changed(sample(),v=>v.sections[0].actionTarget='bad'),{document:fixture()});assert.match(root.textContent,/行動目標/);assert.equal(root.querySelector('a'),null);assert.equal(root.querySelector('details'),null);
  assert.throws(()=>renderWebpageEditor({...sample(),title:''},{document:fixture()}),/空白/);
});

test('document edits stay raw/pending until explicit apply, update preview only on apply, and can be discarded',async()=>{
  const {root,snapshots,pending,uiState}=editor();assert.deepEqual(pending,[false]);const previewTitle=()=>root.querySelector('.artifact-live-preview').querySelector('h1').textContent;
  await fill(root,'網頁標題','  改好的網頁  ');await fill(root,'網頁風格','midnight','change');await fill(root,'頁內導覽','false','change');assert.equal(snapshots.length,0);assert.equal(previewTitle(),sample().title);assert.equal(pending.at(-1),true);assert.equal(button(root,'新增內容區塊至草稿').disabled,true);
  await button(root,'套用網頁設定至草稿').dispatch('click');assert.equal(snapshots.length,1);assert.equal(snapshots[0].title,'  改好的網頁  ');assert.equal(snapshots[0].theme,'midnight');assert.equal(snapshots[0].navigation,false);assert.equal(previewTitle(),'  改好的網頁  ');assert.equal(pending.at(-1),false);assert.equal(uiState.documentDraft,undefined);assert.equal(root.querySelector('.artifact-live-preview').querySelector('nav'),null);
  await fill(root,'網頁標題','');await button(root,'套用網頁設定至草稿').dispatch('click');assert.equal(snapshots.length,1);assert.equal(control(root,'網頁標題').value,'');assert.equal(pending.at(-1),true);assert.match(root.querySelector('.artifact-error').textContent,/空白/);
  await button(root,'放棄網頁設定欄位修改').dispatch('click');assert.equal(control(root,'網頁標題').value,'  改好的網頁  ');assert.equal(pending.at(-1),false);assert.equal(snapshots.length,1);
});
test('all authored text uses textareas, never newline-stripping text inputs, and retains multiline drafts through apply',async()=>{
  const context=editor(),{root,snapshots}=context,literal='  第一行\r\n第二行\n保留空白  ';
  for(const label of ['網頁標題','內容區塊眉標','內容區塊標題','內容區塊內文','行動按鈕文字']){const node=control(root,label);assert.equal(node.tagName,'TEXTAREA',label+' must preserve multiline text');assert.ok(node.rows>=2);await fill(root,label,literal);assert.equal(node.value,literal);}
  assert.equal(root.querySelectorAll('input').length,0);for(const label of ['網頁風格','頁內導覽','選取要編輯的內容區塊','行動目標（頁內內容區塊）','新增內容區塊類型'])assert.equal(control(root,label).tagName,'SELECT');
  await button(root,'套用網頁設定至草稿').dispatch('click');assert.equal(snapshots.at(-1).title,literal);await button(root,'套用內容區塊修改至草稿').dispatch('click');for(const key of ['eyebrow','heading','body','actionLabel'])assert.equal(snapshots.at(-1).sections[0][key],literal);
  await select(root,'s2');for(const label of ['條目 1 標題','條目 1 內文']){assert.equal(control(root,label).tagName,'TEXTAREA');await fill(root,label,literal);}await button(root,'套用內容區塊修改至草稿').dispatch('click');assert.equal(snapshots.at(-1).sections[2].entries[0].title,literal);assert.equal(snapshots.at(-1).sections[2].entries[0].body,literal);
  await select(root,'s3');assert.equal(control(root,'條目 1 標題').tagName,'TEXTAREA');assert.equal(root.querySelectorAll('input').length,0);
  const untouched=editor(changed(sample(),value=>{value.title=literal;Object.assign(value.sections[0],{eyebrow:literal,heading:literal,actionLabel:literal});value.sections[2].entries[0].title=literal;}));for(const label of ['網頁標題','內容區塊眉標','內容區塊標題','行動按鈕文字'])assert.equal(control(untouched.root,label).value,literal);await select(untouched.root,'s2');assert.equal(control(untouched.root,'條目 1 標題').value,literal);assert.equal(untouched.snapshots.length,0);
});
test('section drafts survive selection and complete app rerenders; obsolete DOM event handlers do nothing',async()=>{
  const context=editor(),{document,uiState,snapshots}=context;let root=context.root;
  const obsoleteField=control(root,'內容區塊標題');await fill(root,'內容區塊標題','  尚未套用 <b>  ');await fill(root,'內容區塊內文','raw\r\n text ');await select(root,'s2');await fill(root,'條目 1 標題','卡片草稿');assert.equal(snapshots.length,0);
  await select(root,'s0');assert.equal(control(root,'內容區塊標題').value,'  尚未套用 <b>  ');assert.equal(control(root,'內容區塊內文').value,'raw\r\n text ');
  const oldRoot=root,pending=[];root=renderWebpageEditor(sample(),{document,uiState,onChange:value=>snapshots.push(value),onPendingChange:value=>pending.push(value)});document.body.replaceChildren(root);assert.equal(control(root,'內容區塊標題').value,'  尚未套用 <b>  ');assert.deepEqual(pending,[true]);assert.ok(uiState.fieldDrafts instanceof Map);
  obsoleteField.value='stale';await obsoleteField.dispatch('input');await button(oldRoot,'套用內容區塊修改至草稿').dispatch('click');assert.equal(snapshots.length,0);assert.equal(control(root,'內容區塊標題').value,'  尚未套用 <b>  ');
  await button(root,'套用內容區塊修改至草稿').dispatch('click');assert.equal(snapshots.length,1);assert.equal(snapshots[0].sections[0].heading,'  尚未套用 <b>  ');assert.equal(pending.at(-1),true);await select(root,'s2');assert.equal(control(root,'條目 1 標題').value,'卡片草稿');await button(root,'放棄此內容區塊欄位修改').dispatch('click');assert.equal(pending.at(-1),false);
});
test('action target control offers only same-document IDs and rejects tampered unsupported targets without clipping drafts',async()=>{
  const {root,snapshots,pending}=editor(),target=control(root,'行動目標（頁內內容區塊）');assert.equal(target.tagName,'SELECT');assert.deepEqual(target.children.map(option=>option.value),['','s0','s1','s2','s3','s4']);
  await fill(root,'行動目標（頁內內容區塊）','https://evil.test','change');await button(root,'套用內容區塊修改至草稿').dispatch('click');assert.equal(snapshots.length,0);assert.equal(pending.at(-1),true);assert.match(root.querySelector('.artifact-error').textContent,/穩定英數/);
  await fill(root,'行動目標（頁內內容區塊）','s3','change');await fill(root,'行動按鈕文字','  看 FAQ  ');await button(root,'套用內容區塊修改至草稿').dispatch('click');assert.equal(snapshots[0].sections[0].actionTarget,'s3');assert.equal(snapshots[0].sections[0].actionLabel,'  看 FAQ  ');
  await select(root,'s1');assert.equal(root.querySelectorAll('label').some(label=>label.textContent==='行動按鈕文字'),false);
});
test('card and FAQ entry fields, add/remove/reorder are raw drafts until explicit section apply',async()=>{
  const {root,snapshots,pending}=editor();await select(root,'s2');await fill(root,'條目 1 標題','新的第一張');await fill(root,'條目 1 內文','完整\r\n 內文');await button(root,'新增條目（尚未套用）').dispatch('click');assert.equal(snapshots.length,0);assert.equal(pending.at(-1),true);assert.equal(control(root,'條目 1 標題').value,'新的第一張');
  await fill(root,'條目 3 標題','新增第三張');await button(root,'上移條目 3').dispatch('click');assert.equal(control(root,'條目 2 標題').value,'新增第三張');await button(root,'移除條目 3').dispatch('click');assert.equal(root.querySelectorAll('fieldset').length,2);
  await button(root,'套用內容區塊修改至草稿').dispatch('click');assert.equal(snapshots.length,1);assert.deepEqual(snapshots[0].sections[2].entries.map(entry=>entry.title),['新的第一張','新增第三張']);assert.equal(snapshots[0].sections[2].entries[0].body,'完整\r\n 內文');assert.equal(pending.at(-1),false);
  await select(root,'s3');await fill(root,'條目 1 標題','');await button(root,'套用內容區塊修改至草稿').dispatch('click');assert.equal(snapshots.length,1);assert.equal(pending.at(-1),true);assert.match(root.querySelector('.artifact-error').textContent,/條目標題空白/);await button(root,'放棄此內容區塊欄位修改').dispatch('click');assert.equal(control(root,'條目 1 標題').value,'  條目一  ');
});
test('entry draft operations enforce one-to-twelve bounds and cannot bypass disabled editor state',async()=>{
  const value=changed(sample(),v=>v.sections[2].entries=Array.from({length:12},(_,i)=>defaultWebpageEntry('e'+i))),context=editor(value);await select(context.root,'s2');assert.equal(button(context.root,'新增條目（尚未套用）').disabled,true);await button(context.root,'新增條目（尚未套用）').dispatch('click');assert.equal(context.uiState.fieldDrafts.size,0);
  const single=editor(changed(sample(),v=>v.sections[2].entries=[defaultWebpageEntry()]));await select(single.root,'s2');assert.equal(button(single.root,'移除條目 1').disabled,true);
  const disabled=editor(sample(),{disabled:true});for(const node of disabled.root.querySelectorAll('input,textarea,select,button'))assert.equal(node.disabled,true);await fill(disabled.root,'網頁標題','changed');await button(disabled.root,'套用網頁設定至草稿').dispatch('click');assert.equal(disabled.snapshots.length,0);assert.equal(disabled.uiState.documentDraft,undefined);assert.deepEqual(disabled.pending,[false]);
});
test('section structural operations are guarded against any pending field and support explicit reorder/add/remove',async()=>{
  const {root,snapshots}=editor();await fill(root,'內容區塊標題','pending');for(const label of ['新增內容區塊至草稿','上移內容區塊','下移內容區塊','移除內容區塊','復原上一步草稿操作']){assert.equal(button(root,label).disabled,true);await button(root,label).dispatch('click');}assert.equal(snapshots.length,0);
  await button(root,'放棄此內容區塊欄位修改').dispatch('click');await button(root,'下移內容區塊').dispatch('click');assert.equal(snapshots.at(-1).sections[1].id,'s0');await button(root,'上移內容區塊').dispatch('click');assert.deepEqual(snapshots.at(-1),sample());
  await fill(root,'新增內容區塊類型','faq','change');await button(root,'新增內容區塊至草稿').dispatch('click');assert.equal(snapshots.at(-1).sections.length,6);assert.equal(snapshots.at(-1).sections.at(-1).type,'faq');assert.equal(control(root,'內容區塊標題').value,'常見問答');await button(root,'移除內容區塊').dispatch('click');assert.equal(snapshots.at(-1).sections.length,5);
  await select(root,'s0');const before=snapshots.length;await button(root,'移除內容區塊').dispatch('click');assert.equal(snapshots.length,before);assert.match(root.querySelector('.artifact-error').textContent,/其他行動按鈕/);
});
test('twenty-step undo survives parent rerenders, is blocked by drafts, and never writes a version itself',async()=>{
  const context=editor();let root=context.root;for(let i=1;i<=22;i++){await fill(root,'網頁標題','版本 '+i);await button(root,'套用網頁設定至草稿').dispatch('click');}assert.equal(context.snapshots.length,22);assert.equal(context.uiState.undoHistory.length,20);
  root=renderWebpageEditor(context.snapshots.at(-1),{document:context.document,uiState:context.uiState,onChange:value=>context.snapshots.push(value)});context.document.body.replaceChildren(root);await fill(root,'內容區塊眉標','pending');assert.equal(button(root,'復原上一步草稿操作').disabled,true);await button(root,'放棄此內容區塊欄位修改').dispatch('click');
  for(let i=0;i<20;i++)await button(root,'復原上一步草稿操作').dispatch('click');assert.equal(context.snapshots.at(-1).title,'版本 2');assert.equal(button(root,'復原上一步草稿操作').disabled,true);assert.equal(context.uiState.undoHistory.length,0);assert.match(root.querySelector('.artifact-error').textContent,/尚未保存版本/);
});
test('orphaned drafts remain pending across external structural changes until explicitly discarded',async()=>{
  const context=editor();await select(context.root,'s2');await fill(context.root,'條目 1 標題','removed but keep');const pending=[],value=removeWebpageSection(sample(),'s2'),root=renderWebpageEditor(value,{document:context.document,uiState:context.uiState,onPendingChange:value=>pending.push(value)});assert.deepEqual(pending,[true]);assert.equal(button(root,'新增內容區塊至草稿').disabled,true);assert.ok(context.uiState.fieldDrafts.has('s2'));await button(root,'放棄已移除內容區塊的未套用欄位').dispatch('click');assert.equal(pending.at(-1),false);assert.equal(context.uiState.fieldDrafts.has('s2'),false);
});
test('no-op applies clear identical drafts without emitting, stale closures cannot double-apply, callback errors are visible',async()=>{
  const context=editor(),root=context.root;await button(root,'套用內容區塊修改至草稿').dispatch('click');await button(root,'套用網頁設定至草稿').dispatch('click');assert.equal(context.snapshots.length,0);assert.match(root.querySelector('.artifact-error').textContent,/沒有內容變更/);
  await fill(root,'內容區塊標題','改一次');const apply=button(root,'套用內容區塊修改至草稿');await apply.dispatch('click');await apply.dispatch('click');assert.equal(context.snapshots.length,1);
  const throwing=editor(sample(),{onChange(){throw new Error('host problem');}});await fill(throwing.root,'網頁標題','host failure');await button(throwing.root,'套用網頁設定至草稿').dispatch('click');assert.match(throwing.root.querySelector('.artifact-error').textContent,/外層接收失敗.*host problem/);assert.equal(throwing.root.querySelector('.artifact-live-preview').querySelector('h1').textContent,'host failure');
});
test('oversize editor values remain visible and pending rather than truncating or emitting invalid state',async()=>{
  const {root,snapshots,pending}=editor();const huge='字'.repeat(4001);await fill(root,'內容區塊內文',huge);await button(root,'套用內容區塊修改至草稿').dispatch('click');assert.equal(control(root,'內容區塊內文').value,huge);assert.equal(snapshots.length,0);assert.equal(pending.at(-1),true);assert.match(root.querySelector('.artifact-error').textContent,/超過/);assert.equal(control(root,'內容區塊內文').getAttribute('maxlength'),null);
});
test('editor scopes limitations accurately; module contains no dynamic markup, networking, persistence or version saves',async()=>{
  const root=editor().root;for(const phrase of ['內容區塊','任意腳本','自訂 HTML/CSS','圖片','表單提交','登入','付款','API','部署','不會自動連動','外層按鈕另存完整版本'])assert.ok(root.textContent.includes(phrase));assert.equal(root.textContent.includes('創作項目'),false);
  const source=await readFile(new URL('../public/webpage.js',import.meta.url),'utf8');assert.doesNotMatch(source,/innerHTML|outerHTML|insertAdjacentHTML|\beval\s*\(|new Function|\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|document\.write|createElement\(['"]iframe/);
  assert.match(source,/new Map/);assert.doesNotMatch(source,/\.submit\s*\(|\.click\s*\(|createObjectURL/);
});
