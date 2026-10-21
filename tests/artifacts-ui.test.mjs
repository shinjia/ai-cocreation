// Pure JavaScript and a minimal DOM fixture. No real browser, PHP runtime,
// network, model API, screenshot, layout, or paid inference is exercised here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isArtifactType,defaultArtifact,validateArtifact,artifactItems,parseChartSource,parseFlowchartSource,cloneArtifact,renderArtifact,renderArtifactEditor,exportArtifact} from '../public/artifacts.js';

const chart=(changes={})=>({kind:'chart',chartType:'bar',title:'活動人數',xLabel:'場次',yLabel:'人數',sourceText:'場次\t參與\t工作人員\n第一場\t10\t2\n第二場\t20\t3',...changes});
const table=()=>({kind:'table',caption:'  活動表格  ',columns:[{id:'custom_col',label:' 場次 '},{id:'value',label:'內容'}],rows:[{id:'custom_row',cells:['第一場','  保留前後空白\n保留換行\t與 Tab  ']},{id:'other',cells:['第二場','']} ]});
const changed=(source,edit)=>{const copy=cloneArtifact(source);edit(copy);return copy;};
const expectInvalid=(value,pattern,type=value?.kind)=>assert.match(validateArtifact(value,type),pattern);

test('native defaults contain no invented chart numbers and support only table/chart',()=>{
  assert.equal(isArtifactType('table'),true);assert.equal(isArtifactType('chart'),true);
  for(const type of ['titles','svg','poster',null,{},'TABLE'])assert.equal(isArtifactType(type),false);
  assert.equal(validateArtifact(defaultArtifact('table')),'');
  const initial=defaultArtifact('chart');assert.equal(initial.chartType,'flowchart');assert.equal(initial.sourceText,'flowchart TD\nStart["開始"]');
  assert.equal(validateArtifact(initial),'');assert.throws(()=>defaultArtifact('poster'),/不是可保存/);
});
test('table validation preserves stable IDs, whitespace, empty cells and immutable clones',()=>{
  const original=table(),copy=cloneArtifact(original);assert.equal(validateArtifact(original),'');
  assert.deepEqual(copy,original);copy.rows[0].cells[0]='changed';copy.columns[0].label='changed';assert.notDeepEqual(copy,original);
  assert.equal(original.rows[0].id,'custom_row');assert.equal(original.rows[0].cells[1],'  保留前後空白\n保留換行\t與 Tab  ');
  const sameLabels=changed(original,value=>value.columns[1].label=value.columns[0].label);assert.equal(validateArtifact(sameLabels),'','duplicate labels are allowed; IDs identify columns');
});
test('table exact shape, stable ASCII identifiers, dimensions and string types are enforced',()=>{
  const original=table();
  for(const value of [null,'table',17])expectInvalid(value,/完整物件/,'table');
  expectInvalid({...original,extra:true},/未支援/);expectInvalid(changed(original,v=>delete v.caption),/缺少欄位/);
  expectInvalid({...original,kind:'chart'},/類型欄位/,'table');expectInvalid(original,/不是可保存/,'article');
  for(const id of ['', '_start','中文','a b','a'.repeat(65),'row\n','row\r','row\u2028'])expectInvalid(changed(original,v=>v.rows[0].id=id),/穩定英數識別碼/);
  for(const id of ['A','a-1_b','a'.repeat(64)])assert.equal(validateArtifact(changed(original,v=>v.rows[0].id=id)),'');
  expectInvalid(changed(original,v=>v.columns[1].id=v.columns[0].id),/欄位識別碼不可重複/);
  expectInvalid(changed(original,v=>v.rows[1].id=v.rows[0].id),/資料列識別碼不可重複/);
  expectInvalid(changed(original,v=>v.columns=[]),/欄位的數量/);expectInvalid(changed(original,v=>v.rows=[]),/資料列的數量/);
  expectInvalid(changed(original,v=>v.rows[0].cells.pop()),/儲存格的數量/);
  expectInvalid(changed(original,v=>v.rows[0].cells.push('extra')),/儲存格的數量/);
  expectInvalid(changed(original,v=>v.rows[0].cells[0]=5),/有效 UTF8/);
  expectInvalid(changed(original,v=>v.columns[0].label='\u3000\u00a0'),/空白或超過/);
  expectInvalid(changed(original,v=>v.columns[0].extra='ignored'),/未支援/);
});
test('native validation enforces UTF8 bytes, malformed Unicode/NUL, full JSON size, and secret guard',()=>{
  const original=table();
  assert.equal(validateArtifact(changed(original,v=>{v.caption='字'.repeat(200);v.columns[0].label='字'.repeat(40);v.rows[0].cells[0]='字'.repeat(666)+'ab';})), '');
  expectInvalid(changed(original,v=>v.caption='字'.repeat(201)),/表格說明空白或超過/);
  expectInvalid(changed(original,v=>v.columns[0].label='字'.repeat(41)),/欄位名稱空白或超過/);
  expectInvalid(changed(original,v=>v.rows[0].cells[0]='字'.repeat(667)),/儲存格空白或超過/);
  for(const text of ['nul\0value','\ud800','\udfff'])expectInvalid(changed(original,v=>v.rows[0].cells[0]=text),/有效 UTF8/);
  const oversized={kind:'table',caption:'',columns:[{id:'c',label:'C'}],rows:Array.from({length:30},(_,index)=>({id:'r'+index,cells:['x'.repeat(2000)]}))};
  expectInvalid(oversized,/60000.*未保存且未截斷/);
  const secret='sk-'+'x'.repeat(20);
  expectInvalid(changed(original,v=>v.rows[0].cells[0]=secret),/請勿.*API Key/);
  expectInvalid(changed(original,v=>v.columns[0].id=secret),/請勿.*API Key/);
  expectInvalid(chart({title:secret}),/請勿.*API Key/);
});
test('chart parser canonical labels, decimal values, CRLF and optional terminal LF match the native contract',()=>{
  const parsed=parseChartSource(' 場次 \t\u3000參與\u00a0\t人員\r\n 甲 \t+001.25\t-.5\r\n乙\t-0\t.25\r\n','line');
  assert.deepEqual(parsed.labels,['甲','乙']);assert.equal(parsed.categoryLabel,'場次');
  assert.deepEqual(parsed.series.map(series=>({id:series.id,label:series.label})),[{id:'series_1',label:'參與'},{id:'series_2',label:'人員'}]);
  assert.equal(parsed.series[0].values[0],1.25);assert.equal(parsed.series[1].values[0],-.5);assert.equal(parsed.series[1].values[1],.25);
  assert.equal(validateArtifact(chart({sourceText:'類別\t數值\r\n甲\t2\r\n'})),'');
  assert.equal(parseChartSource('X\tY\nA\t1000000000000.000','bar').series[0].values[0],1e12);
  assert.equal(parseChartSource('X\tY\nA\t-1000000000000','bar').series[0].values[0],-1e12);
});
test('chart rejects formulas, loose numbers, whitespace, magnitude rounding bypasses and unsupported types',()=>{
  for(const token of ['', ' ', ' 1','1 ', '1.', '.', '+', '1e2','1E-2','Infinity','NaN','0x10','1,000','=1+1','1+1','1\u2028','1\u2029'])assert.throws(()=>parseChartSource('X\tY\nA\t'+token,'bar'),/完整十進位數字/,JSON.stringify(token));
  for(const token of ['1000000000001','1000000000000.000001','-1000000000000.000001','999999999999999999999999'])assert.throws(()=>parseChartSource('X\tY\nA\t'+token,'bar'),/不得超過1兆/,token);
  assert.throws(()=>parseChartSource('X\tY\nA\t1','scatter'),/只支援 flowchart、bar、line 或 pie/);
});
test('chart rejects malformed, oversized, duplicate and empty source labels without guessing data',()=>{
  const invalid=[
    ['',/來源空白或超過/],['X\tY',/1至24列/],['X\tY\nA\t1\n\n',/欄位數/],
    ['X\tY\rA\t1',/單獨的 CR/],['X\nA',/1至5個數列/],
    ['X\tY\t Y \nA\t1\t2',/數列名稱不可重複/],['X\tY\nA\t1\n A \t2',/分類名稱不可重複/],
    ['X\t\u3000\nA\t1',/標頭空白或超過/],['\tY\nA\t1',/標頭空白或超過/],
    ['X\tY\n \t1',/分類名稱空白或超過/],['X\tY\nA\t1\t2',/欄位數/],
    ['X\tY\nA\t1\nB',/欄位數/],['X\t'+('字'.repeat(41))+'\nA\t1',/標頭空白或超過/],
    ['X\tY\n'+('字'.repeat(41))+'\t1',/分類名稱空白或超過/],
    ['X\tY\n'+('a'.repeat(12000))+'\t1',/來源空白或超過/],
    ['X\tY\n'+Array.from({length:25},(_,index)=>'A'+index+'\t1').join('\n'),/1至24列/],
    ['X\tA\tB\tC\tD\tE\tF\nA\t1\t2\t3\t4\t5\t6',/1至5個數列/]
  ];
  for(const [source,pattern] of invalid)assert.throws(()=>parseChartSource(source,'bar'),pattern);
});
test('pie rejects multiple series, negative numbers including underflow, and zero sum',()=>{
  assert.throws(()=>parseChartSource(chart().sourceText,'pie'),/只能包含一個數列/);
  assert.throws(()=>parseChartSource('X\tY\nA\t-1\nB\t2','pie'),/不可為負數/);
  assert.throws(()=>parseChartSource('X\tY\nA\t-0.'+'0'.repeat(350)+'1\nB\t2','pie'),/不可為負數/);
  assert.throws(()=>parseChartSource('X\tY\nA\t0\nB\t-0','pie'),/加總必須大於零/);
  assert.equal(parseChartSource('X\tY\nA\t-0\nB\t2','pie').series[0].values[1],2);
});
test('authoritative item projection includes full table text and all chart metadata without formula mutation',()=>{
  const original=table(),items=artifactItems(original);assert.equal(items.length,1);assert.equal(items[0].id,'document');assert.equal(items[0].label,'表格內容');
  assert.equal(items[0].content,'  活動表格  \n 場次 \t內容\n第一場\t"  保留前後空白\n保留換行\t與 Tab  "\n第二場\t');
  const value=chart({title:'比較',xLabel:'時段',yLabel:'數量',sourceText:'分類\t數值\r\n甲\t-2\r\n'});
  assert.deepEqual(artifactItems(value),[{id:'document',label:'圖表來源',content:'比較\n圖表類型：bar\n橫軸：時段\n縱軸：數量\n分類\t數值\n甲\t-2\n'}]);
  assert.equal(value.sourceText.includes('\r\n'),true,'projection does not mutate source artifact');
  assert.throws(()=>artifactItems(chart({sourceText:'類別\t數值'})),/1至24列/);
});
test('CSV and TSV protect spreadsheet formula cells while preserving quoted multiline literals',()=>{
  const value={kind:'table',caption:'not a data row',columns:[{id:'a',label:'=header'},{id:'b',label:'text'}],rows:[{id:'r1',cells:['=1+1','a,"b"\nc']},{id:'r2',cells:['-2','\tvalue']},{id:'r3',cells:['@SUM(A1)','  +formula']}]};
  const original=cloneArtifact(value),csv=exportArtifact(value,'csv'),tsv=exportArtifact(value,'tsv');
  assert.equal(csv.filename,'table.csv');assert.equal(csv.mime,'text/csv;charset=utf-8');
  assert.equal(csv.text,'\'=header,text\r\n\'=1+1,"a,""b""\nc"\r\n\'-2,\'\tvalue\r\n\'@SUM(A1),\'  +formula\r\n');
  assert.ok(tsv.text.includes('"\'\tvalue"'));assert.ok(tsv.text.includes("'@SUM(A1)\t'  +formula"));
  assert.deepEqual(value,original);assert.throws(()=>exportArtifact(value,'svg'),/CSV 或 TSV/);
});
test('chart TSV escapes only text fields, leaving strict numeric negative/positive values as numbers',()=>{
  const value=chart({sourceText:'=類別\t+人數\n@甲\t-2\n普通\t+3'}),output=exportArtifact(value,'tsv');
  assert.equal(output.text,"'=類別\t'+人數\n'@甲\t-2\n普通\t+3\n");
  assert.equal(output.filename,'chart.tsv');assert.throws(()=>exportArtifact(value,'csv'),/SVG 或 TSV/);
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
function fixture(){
  const document={createElement(tag){return new FixtureNode(tag,this);},createElementNS(namespace,tag){return new FixtureNode(tag,this,namespace);},getElementById(id){return this.body.querySelector('#'+id);}};
  document.body=document.createElement('body');return document;
}
function control(root,labelText){const label=root.querySelectorAll('label').find(node=>node.textContent===labelText);assert.ok(label,'label exists: '+labelText);const input=root.querySelector('#'+label.getAttribute('for'));assert.ok(input);return input;}
function button(root,text){const found=root.querySelectorAll('button').find(node=>node.textContent===text);assert.ok(found,'button exists: '+text);return found;}
async function fill(root,label,value,event='input'){const input=control(root,label);input.value=value;await input.dispatch(event);return input;}
const allNodes=root=>[root,...root.children.flatMap(allNodes)];

test('table rendering uses real DOM text, semantic headers/caption and a keyboard-accessible scroll region',()=>{
  const document=fixture(),value=table();value.rows[0].cells[0]='<img src=x onerror=alert(1)>';
  const root=renderArtifact(value,{document,compact:true});document.body.append(root);
  assert.equal(root.querySelectorAll('table').length,1);assert.equal(root.querySelector('caption').textContent,value.caption);
  assert.equal(root.querySelectorAll('th').every(node=>node.getAttribute('scope')==='col'),true);
  assert.equal(root.querySelectorAll('td')[0].textContent,value.rows[0].cells[0]);assert.equal(root.querySelectorAll('img').length,0);
  const scroll=root.querySelector('.artifact-table-scroll');assert.equal(scroll.getAttribute('tabindex'),'0');assert.equal(scroll.getAttribute('role'),'region');assert.ok(scroll.getAttribute('aria-label'));
});
test('bar, line and pie previews render finite actual geometry plus complete accessible text data',()=>{
  for(const type of ['bar','line','pie']){
    const document=fixture(),value=chart({chartType:type,sourceText:type==='pie'?'分類\t人數\n甲\t2\n乙\t3':'分類\t人數\n甲\t-2\n乙\t3'}),root=renderArtifact(value,{document});document.body.append(root);
    const svg=root.querySelector('svg');assert.ok(svg);assert.equal(svg.namespaceURI,'http://www.w3.org/2000/svg');assert.equal(svg.getAttribute('role'),'img');
    for(const id of svg.getAttribute('aria-labelledby').split(' '))assert.ok(document.getElementById(id));
    assert.equal(root.querySelectorAll('tbody')[0].children.length,2);assert.ok(root.textContent.includes('圖表資料（文字表格）'));assert.ok(root.textContent.includes('甲'));
    if(type==='bar'){const bars=svg.querySelectorAll('rect').filter(node=>node.querySelector('title'));assert.equal(bars.length,2);assert.ok(bars.every(node=>Number(node.getAttribute('height'))>0));}
    if(type==='line'){assert.equal(svg.querySelectorAll('polyline').length,1);assert.equal(svg.querySelectorAll('circle').length,2);}
    if(type==='pie')assert.equal(svg.querySelectorAll('path').length,2);
    for(const node of allNodes(svg))for(const [name,value] of Object.entries(node.attributes)){assert.doesNotMatch(name,/^on|href/i);assert.doesNotMatch(String(value),/NaN|Infinity|undefined/);}
  }
});
test('zero and single-point chart cases never fabricate values or produce invalid geometry',()=>{
  for(const type of ['bar','line']){
    const document=fixture(),root=renderArtifact(chart({chartType:type,sourceText:'分類\t人數\n甲\t0'}),{document});assert.ok(root.querySelector('svg'));assert.ok(root.textContent.includes('甲'));assert.doesNotMatch(exportArtifact(chart({chartType:type,sourceText:'分類\t人數\n甲\t0'}),'svg').text,/NaN|Infinity/);
  }
  const document=fixture(),pie=renderArtifact(chart({chartType:'pie',sourceText:'分類\t人數\n甲\t2\n乙\t0'}),{document});
  assert.equal(pie.querySelectorAll('circle').length,1);assert.equal(pie.querySelectorAll('path').length,0);assert.ok(pie.textContent.includes('乙：0'));
  const invalid=renderArtifact(chart({sourceText:'類別\t數值'}),{document});assert.equal(invalid.querySelector('svg'),null);assert.match(invalid.textContent,/1至24列/);
});
test('safe SVG export uses escaped XML primitives, includes all values, and never executes source text',()=>{
  const value=chart({title:'</text><script>alert("X")</script> & 標題',xLabel:'<iframe>',yLabel:"'單位'",sourceText:'分類\t人數\n<img onerror=x>\t2\n乙\t3'});
  const result=exportArtifact(value,'svg');assert.equal(result.filename,'chart.svg');assert.equal(result.mime,'image/svg+xml;charset=utf-8');
  assert.match(result.text,/&lt;script&gt;/);assert.match(result.text,/&amp; 標題/);assert.match(result.text,/&lt;img onerror=x&gt;：2/);
  assert.doesNotMatch(result.text,/<script|<iframe|<img|<foreignObject|<image|<use|<[^>]*\s(?:on[a-z]+|href)=/i);
  assert.match(result.text,/xmlns="http:\/\/www.w3.org\/2000\/svg"/);assert.match(result.text,/viewBox="0 0 800 490"/);
  const controlled=exportArtifact(chart({title:'Control\x01text'}),'svg');assert.doesNotMatch(controlled.text,/\x01/);assert.match(controlled.text,/Control�text/);
});
test('table editor independently changes columns, rows and cells while preserving stable identity and saved inputs',async()=>{
  const document=fixture(),original=table(),snapshots=[],root=renderArtifactEditor(original,{document,onChange:value=>snapshots.push(value),idPrefix:'test-table'});document.body.append(root);
  await fill(root,'表格說明','新說明');await fill(root,'第 1 欄名稱','場次新名稱');await fill(root,'第 1 列，第 2 欄','新的\n儲存格');
  assert.equal(snapshots.at(-1).columns[0].id,'custom_col');assert.equal(snapshots.at(-1).rows[0].id,'custom_row');assert.equal(snapshots.at(-1).rows[0].cells[1],'新的\n儲存格');assert.deepEqual(original,table());
  await button(root,'新增欄位').dispatch('click');let state=snapshots.at(-1);const addedColumn=state.columns[2].id;
  assert.equal(state.columns.length,3);assert.equal(state.rows.every(row=>row.cells.length===3),true);assert.notEqual(addedColumn,'custom_col');
  await fill(root,'第 1 列，第 3 欄','第三欄內容');await button(root,'新增資料列').dispatch('click');state=snapshots.at(-1);const addedRow=state.rows[2].id;
  assert.equal(state.rows.length,3);assert.equal(state.rows[2].cells.length,3);assert.notEqual(addedRow,'custom_row');
  await button(root,'移除第 2 欄').dispatch('click');state=snapshots.at(-1);assert.deepEqual(state.columns.map(column=>column.id),['custom_col',addedColumn]);assert.deepEqual(state.rows[0].cells,['第一場','第三欄內容']);
  await button(root,'移除第 2 列').dispatch('click');state=snapshots.at(-1);assert.deepEqual(state.rows.map(row=>row.id),['custom_row',addedRow]);assert.equal(validateArtifact(state),'');
  assert.equal(snapshots[0].caption,'新說明');assert.equal(snapshots[0].columns[0].label,' 場次 ','callbacks are independent complete snapshots');
});
test('table editor retains invalid text drafts and disables minimum/maximum structural actions',async()=>{
  const document=fixture(),changes=[],root=renderArtifactEditor(defaultArtifact('table'),{document,onChange:value=>changes.push(value)});document.body.append(root);
  await fill(root,'第 1 欄名稱','');assert.equal(changes.at(-1).columns[0].label,'');assert.match(root.querySelector('.artifact-error').textContent,/欄位名稱空白或超過/);assert.equal(control(root,'第 1 欄名稱').getAttribute('aria-invalid'),'true');
  await fill(root,'第 1 欄名稱','修復');assert.equal(root.querySelector('.artifact-error').textContent,'');
  assert.equal(button(root,'移除第 1 列').disabled,true);await button(root,'移除第 2 欄').dispatch('click');assert.equal(button(root,'移除第 1 欄').disabled,true);
  const maximum={kind:'table',caption:'',columns:Array.from({length:12},(_,i)=>({id:'c'+i,label:'C'+i})),rows:Array.from({length:100},(_,i)=>({id:'r'+i,cells:Array(12).fill('')}))};
  const maxRoot=renderArtifactEditor(maximum,{document});assert.equal(button(maxRoot,'新增欄位').disabled,true);assert.equal(button(maxRoot,'新增資料列').disabled,true);
});
test('editor controls have unique explicit labels, including ambiguous stable-ID combinations and repeated prefixes',()=>{
  const document=fixture(),value={kind:'table',caption:'',columns:[{id:'c',label:'C'},{id:'b-c',label:'B'}],rows:[{id:'a-b',cells:['','']},{id:'a',cells:['','']}]};
  const roots=[renderArtifactEditor(value,{document,idPrefix:'same'}),renderArtifactEditor(value,{document,idPrefix:'same'}),renderArtifactEditor(chart(),{document,idPrefix:'same'})];document.body.append(...roots);
  const nodes=allNodes(document.body),ids=nodes.map(node=>node.id).filter(Boolean);assert.equal(new Set(ids).size,ids.length);
  for(const node of document.body.querySelectorAll('input,textarea,select'))assert.ok(nodes.some(label=>label.tagName==='LABEL'&&label.getAttribute('for')===node.id&&label.textContent));
  for(const node of document.body.querySelectorAll('.artifact-table-scroll'))assert.equal(node.getAttribute('tabindex'),'0');
});
test('disabled editor cannot change artifacts or expose active mutating controls',async()=>{
  for(const value of [table(),chart()]){
    const document=fixture(),changes=[],root=renderArtifactEditor(value,{document,disabled:true,onChange:value=>changes.push(value)});
    for(const input of root.querySelectorAll('input,textarea,select')){assert.equal(input.disabled,true);input.value='programmatic attempt';await input.dispatch('input');await input.dispatch('change');}
    for(const input of root.querySelectorAll('button')){assert.equal(input.disabled,true);await input.dispatch('click');}
    assert.equal(changes.length,0);
  }
});
test('chart source editing keeps invalid drafts, removes stale visual, and re-renders from changed values',async()=>{
  const document=fixture(),initial=chart(),changes=[],root=renderArtifactEditor(initial,{document,onChange:value=>changes.push(value)});document.body.append(root);assert.ok(root.querySelector('svg'));
  await fill(root,'圖表文字來源（TSV）','分類\t人數\n甲\t=1+1');assert.equal(changes.at(-1).sourceText,'分類\t人數\n甲\t=1+1');assert.equal(root.querySelector('svg'),null);assert.match(root.querySelector('.artifact-error').textContent,/完整十進位數字/);
  await fill(root,'圖表文字來源（TSV）','分類\t人數\n甲\t40\n乙\t10');assert.ok(root.querySelector('svg'));assert.equal(root.querySelector('.artifact-error').textContent,'');assert.ok(root.textContent.includes('甲：40'));
  await fill(root,'圖表類型','pie','change');assert.equal(changes.at(-1).chartType,'pie');assert.equal(root.querySelectorAll('path').length,2);
  await fill(root,'圖表標題','改後標題');assert.equal(changes.at(-1).title,'改後標題');assert.ok(root.querySelector('svg').textContent.includes('改後標題'));
  assert.deepEqual(initial,chart());assert.equal(root.querySelectorAll('.artifact-live-preview').length,1);assert.equal(root.querySelectorAll('textarea').filter(node=>node.id.endsWith('-sourceText')).length,1,'only one source editing workspace');
});
test('frontend errors correspond exactly to PHP validation messages and public module contains no unsafe side effects',async()=>{
  const php=await readFile(new URL('../app/artifacts.php',import.meta.url),'utf8'),shared=await readFile(new URL('../app/validation.php',import.meta.url),'utf8'),source=await readFile(new URL('../public/artifacts.js',import.meta.url),'utf8');
  const values=[chart({sourceText:'類別\t數值'}),chart({sourceText:'X\tY\nA\t1e2'}),chart({chartType:'pie',sourceText:'X\tY\nA\t-1'}),chart({sourceText:'X\tY\nA\t1000000000001'}),chart({sourceText:'X\tY\nA\t1\nA\t2'}),{...table(),extra:true},changed(table(),value=>value.rows[1].id=value.rows[0].id),changed(table(),value=>value.caption='sk-'+'x'.repeat(20))];
  for(const value of values){const error=validateArtifact(value);assert.ok(error);const composedTable=error.startsWith('表格')&&php.includes("$name.'"+error.slice(2)+"'");assert.ok((php+shared).includes(error)||composedTable,error);}
  assert.doesNotMatch(source,/innerHTML|outerHTML|insertAdjacentHTML|\beval\s*\(|new Function|\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|document\.cookie|createObjectURL|\.click\s*\(/);
});

const flow=(changes={})=>({...defaultArtifact('chart'),title:'申請流程',sourceText:'flowchart TD\nA("開始")\nB{"資料完整？"}\nC["送出申請"]\nA --> B\nB -->|是| C\nB -->|否| A',...changes});
test('flowchart parser handles safe declared shapes, forward references, TB alias, comments, labels and cycles',()=>{
  const source='\n%% 純文字註解\r\ngraph TB;\r\nA -->|"是"| B;\r\nA[" 開始; [說明] "];\r\nB{判斷？}\r\nC("完成")\r\nB --> C\r\nC --> A\r\nA --> A\r\n';
  const parsed=parseFlowchartSource(source);assert.equal(parsed.direction,'TD');
  assert.deepEqual(parsed.nodes,[{id:'A',label:' 開始; [說明] ',shape:'rect'},{id:'B',label:'判斷？',shape:'diamond'},{id:'C',label:'完成',shape:'round'}]);
  assert.deepEqual(parsed.edges,[{from:'A',to:'B',label:'是'},{from:'B',to:'C',label:''},{from:'C',to:'A',label:''},{from:'A',to:'A',label:''}]);
  assert.deepEqual(parseChartSource(source,'flowchart'),parsed);assert.equal(validateArtifact(flow({sourceText:source})),'');
  assert.equal(parseFlowchartSource('flowchart LR\nA["文字"]\n').direction,'LR');
  assert.equal(parseFlowchartSource('flowchart TD\nA[שלום]\n').nodes[0].label,'שלום','ordinary RTL letters are plain text');
});
test('flowchart rejects unsupported directives, wrong headers, implicit nodes, chains and reserved identifiers',()=>{
  const cases=[
    ['%%{init: {}}\nflowchart TD\nA[x]',/初始化指令/],['graph TD\n%% hidden %%{directive}\nA[x]',/初始化指令/],
    ['flowchart BT\nA[x]',/第一個有效行/],['flowchart  TD\nA[x]',/第一個有效行/],['Flowchart TD\nA[x]',/第一個有效行/],
    ['flowchart TD',/至少1個/],['%% only comment',/至少1個/],['flowchart TD\nA[x]\nA --> B',/都必須明確宣告/],
    ['flowchart TD\nA[x]\nA --> A --> A',/不支援的語法/],['flowchart TD\nA[x]\nsubgraph x',/不支援的語法/],
    ['flowchart TD\nA[x]\nclick A call evil()',/不支援的語法/],['flowchart TD\nA[x]\nstyle A fill:red',/不支援的語法/],
    ['flowchart TD\nA[x]\nclassDef evil fill:red',/不支援的語法/],['flowchart TD\nA[x) ',/括號必須正確配對/],
    ['flowchart TD\nA[x]\nA[y]',/不可重複宣告/],['flowchart TD\nA[x]\nA --> A\nA --> A',/不可重複相同/],
    ['flowchart TD\nEND[x]',/保留字/],['flowchart TD\nA[x]\nclick --> A',/保留字/],['flowchart TD\n'+('A'.repeat(41))+'[x]',/不支援的語法/],
    ['flowchart TD\nA[x];;',/不支援的語法/]
  ];
  for(const [source,pattern] of cases)assert.throws(()=>parseFlowchartSource(source),pattern,source);
});
test('flowchart source-export bypasses and nested non-subset shapes are rejected rather than silently reinterpreted',()=>{
  const sourceLines=['A[foo]; click A call evil(); X[bar]','A[foo] X[bar]','A[[foo]]','A((foo))','A{{foo}}','A[foo;bar]','A["hello" onclick="evil"]'];
  for(const line of sourceLines){const value=flow({sourceText:'flowchart TD\n'+line});assert.ok(validateArtifact(value),line);for(const format of ['mmd','txt','svg'])assert.throws(()=>exportArtifact(value,format));}
  const quoted=flow({sourceText:'flowchart TD\nA["括號 [文字]；分號; 是字面內容"]'});assert.equal(validateArtifact(quoted),'');assert.equal(exportArtifact(quoted,'mmd').text,quoted.sourceText);
});
test('flowchart validates the entire source including ignored comments against Unicode line and bidi bypasses',()=>{
  const controls=['\x01','\x08','\x0b','\x0c','\x0e','\x1f','\x7f','\x85','\x9f','\u2028','\u2029','\u061c','\u200e','\u200f','\u202a','\u202e','\u2066','\u2069'];
  for(const control of controls){
    for(const source of ['flowchart TD\nA["safe'+control+'text"]','flowchart TD\nA[x]\n%% ignored'+control+'click A call evil()']){
      assert.throws(()=>parseFlowchartSource(source),/來源不可包含控制字元、特殊換行或雙向控制字元/);
      for(const format of ['mmd','txt','svg'])assert.throws(()=>exportArtifact(flow({sourceText:source}),format),/來源不可包含控制字元/);
    }
  }
  assert.equal(parseFlowchartSource('flowchart TD\n\tA[שלום]\n%% ordinary comment\twith Tab\n').nodes[0].label,'שלום');
});
test('flowchart label grammar forbids entities, HTML, escapes, controls, executable links and unquoted delimiters',()=>{
  const labels=['<script>','a & b','&#60;','a#b','a|b','`markdown`','a\\b','a"b','https://example.com','javascript:alert','data:text/plain','MAILTO:person','WWW.example.com','ſcheme://example.com','a[b]','a(b)','a{b}','a;b'];
  for(const label of labels)assert.throws(()=>parseFlowchartSource('flowchart TD\nA['+label+']'),/純文字|網址|括號或分號/,label);
  assert.throws(()=>parseFlowchartSource('flowchart TD\nA["\t"]'),/空白或超過/);
  assert.throws(()=>parseFlowchartSource('flowchart TD\nA["字'.repeat(1)+'\0"]'),/UTF8/);
  assert.throws(()=>parseFlowchartSource('flowchart TD\nA['+'字'.repeat(81)+']'),/節點文字空白或超過/);
  assert.throws(()=>parseFlowchartSource('flowchart TD\nA[x]\nA -->|'+'字'.repeat(41)+'| A'),/連線標籤空白或超過/);
  assert.equal(parseFlowchartSource('flowchart TD\nA["'+'字'.repeat(80)+'"]\nA -->|"'+'字'.repeat(40)+'"| A').nodes[0].label.length,80);
});
test('flowchart caps node and edge complexity, including cyclic diagrams with complete finite geometry',()=>{
  const declarations=Array.from({length:40},(_,index)=>'N'+index+'["節點 '+index+'"]');
  const edges=Array.from({length:40},(_,index)=>['N'+index+' -->|前進| N'+((index+1)%40),'N'+index+' -->|重試| N'+index]).flat();
  const source='flowchart TD\n'+[...declarations,...edges].join('\n'),parsed=parseFlowchartSource(source);assert.equal(parsed.nodes.length,40);assert.equal(parsed.edges.length,80);
  assert.throws(()=>parseFlowchartSource(source+'\nExtra[x]'),/最多支援40個節點/);
  assert.throws(()=>parseFlowchartSource(source+'\nN0 -->|額外| N2'),/最多支援80條連線/);
  assert.throws(()=>parseFlowchartSource('flowchart TD\nA[x]\n%% '+('x'.repeat(12000))),/來源空白或超過/);
  for(const direction of ['TD','LR']){
    const document=fixture(),value=flow({sourceText:source.replace('flowchart TD','flowchart '+direction)}),root=renderArtifact(value,{document});document.body.append(root);
    const svg=root.querySelector('svg');assert.ok(svg);assert.equal(svg.querySelectorAll('polyline').length,80);assert.equal(root.querySelectorAll('tbody')[0].children.length,40);assert.equal(root.querySelectorAll('tbody')[1].children.length,80);
    for(const node of allNodes(svg))for(const [name,value] of Object.entries(node.attributes)){assert.doesNotMatch(name,/^on|href/i);assert.doesNotMatch(String(value),/NaN|Infinity|undefined/);}
    assert.ok(exportArtifact(value,'svg').text.length<100000,'bounded primitive output');
  }
});
test('flowchart renders real node shapes, arrows, self loops, labels, accessible text and escaped title',()=>{
  const document=fixture(),value=flow({title:'<script>alert(1)</script>',sourceText:flow().sourceText+'\nC -->|重做| C'}),root=renderArtifact(value,{document});document.body.append(root);
  const svg=root.querySelector('svg');assert.equal(svg.querySelectorAll('polyline').length,4);assert.ok(svg.querySelectorAll('polygon').length>=5);assert.ok(svg.querySelectorAll('rect').some(node=>Number(node.getAttribute('rx'))>8));assert.equal(root.querySelectorAll('table').length,2);
  assert.ok(root.textContent.includes('資料完整？'));assert.ok(root.textContent.includes('流程圖連線（文字列表）'));
  for(const id of svg.getAttribute('aria-labelledby').split(' '))assert.ok(document.getElementById(id));
  const output=exportArtifact(value,'svg');assert.equal(output.filename,'flowchart.svg');assert.match(output.text,/&lt;script&gt;/);assert.doesNotMatch(output.text,/<script|<foreignObject|<image|<use|<[^>]*\s(?:on[a-z]+|href)=/i);
  const initial=renderArtifact(defaultArtifact('chart'),{document});assert.ok(initial.textContent.includes('目前沒有連線'));assert.ok(initial.querySelector('svg'));
});
test('flowchart MMD/TXT exports preserve normalized user source, never add directives or silently convert modes',()=>{
  const source='%% 說明\r\ngraph TB;\r\nA[" 字面內容; "];\r\n\r\n',value=flow({sourceText:source});
  for(const format of ['mmd','txt']){const result=exportArtifact(value,format);assert.equal(result.filename,'flowchart.'+format);assert.equal(result.mime,'text/plain;charset=utf-8');assert.equal(result.text,source.replace(/\r\n/g,'\n'));}
  assert.equal(value.sourceText,source);assert.throws(()=>exportArtifact(value,'tsv'),/SVG、MMD 或 TXT/);assert.throws(()=>exportArtifact(chart(),'mmd'),/SVG 或 TSV/);
});
test('chart mode switch retains drafts, updates source label, hides flow axes, and does not claim placeholder is AI output',async()=>{
  const document=fixture(),changes=[],initial=defaultArtifact('chart'),root=renderArtifactEditor(initial,{document,onChange:value=>changes.push(value)});document.body.append(root);
  assert.equal(control(root,'圖表類型').value,'flowchart');assert.equal(control(root,'流程圖文字來源（Mermaid 子集）').value,initial.sourceText);assert.match(root.textContent,/手動佔位節點/);assert.ok(root.querySelector('svg'));
  assert.equal(control(root,'橫軸標籤').parentNode.hidden,true);assert.equal(control(root,'橫軸標籤').disabled,true);
  await fill(root,'圖表類型','bar','change');assert.equal(changes.at(-1).sourceText,initial.sourceText);assert.equal(control(root,'圖表文字來源（TSV）').value,initial.sourceText);assert.equal(control(root,'橫軸標籤').parentNode.hidden,false);assert.equal(root.querySelector('svg'),null);
  await fill(root,'圖表文字來源（TSV）','分類\t數值\n甲\t3');assert.ok(root.querySelector('svg'));
  await fill(root,'圖表類型','flowchart','change');assert.equal(changes.at(-1).sourceText,'分類\t數值\n甲\t3');assert.equal(root.querySelector('svg'),null);assert.match(root.querySelector('.artifact-error').textContent,/第一個有效行/);
  await fill(root,'流程圖文字來源（Mermaid 子集）',flow().sourceText);assert.ok(root.querySelector('svg'));assert.equal(validateArtifact(changes.at(-1)),'');assert.equal(root.querySelectorAll('textarea').filter(node=>node.id.endsWith('-sourceText')).length,1);
});
test('metadata uses textareas and preserves valid multiline strings rather than single-line input sanitization',async()=>{
  const document=fixture(),tableChanges=[],tableValue=changed(table(),value=>{value.caption='說明\n第二行';value.columns[0].label='欄位\n第二行';}),tableRoot=renderArtifactEditor(tableValue,{document,onChange:value=>tableChanges.push(value)});
  for(const label of ['表格說明','第 1 欄名稱'])assert.equal(control(tableRoot,label).tagName,'TEXTAREA');
  await fill(tableRoot,'第 1 列，第 1 欄','編輯內容');assert.equal(tableChanges.at(-1).caption,tableValue.caption);assert.equal(tableChanges.at(-1).columns[0].label,tableValue.columns[0].label);
  const chartChanges=[],chartValue=chart({title:'標題\n第二行',xLabel:'橫軸\n第二行',yLabel:'縱軸\n第二行'}),chartRoot=renderArtifactEditor(chartValue,{document,onChange:value=>chartChanges.push(value)});
  for(const label of ['圖表標題','橫軸標籤','縱軸標籤'])assert.equal(control(chartRoot,label).tagName,'TEXTAREA');
  await fill(chartRoot,'圖表文字來源（TSV）',chartValue.sourceText+'\n');for(const key of ['title','xLabel','yLabel'])assert.equal(chartChanges.at(-1)[key],chartValue[key]);
});
