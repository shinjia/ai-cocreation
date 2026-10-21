// Pure fixed-script helpers and native SVG serialization only. No real browser,
// PHP runtime, provider call, persisted version, external editor or paid AI test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {cloneVector,validateVector,vectorCompactJson,vectorItems,exportVector} from '../public/vector.js';
import {SCRIPTED_VECTOR_TITLE_REQUEST,SCRIPTED_VECTOR_COLOR_REQUEST,scriptedVectorArtifact,scriptedVectorBrief,scriptedVectorRevision,fuseScriptedVectors} from '../public/vector-demo.js';

const shape=(id,type='rect',fields={})=>({id,type,label:id,x:20,y:30,width:160,height:100,fill:'#dbece3',stroke:'#245c91',strokeWidth:2,opacity:1,text:'',fontSize:0,points:[],...fields});
const textShape=(id,text='literal')=>shape(id,'text',{width:0,height:0,text,fontSize:28});
const vector=(shapes=[shape('a')],fields={})=>({kind:'vector',title:'來源作品',width:640,height:420,background:'#ffffff',shapes,...fields});
const copy=value=>structuredClone(value);
const frozen=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))frozen(child);}return value;};
const revise=(source,text=SCRIPTED_VECTOR_TITLE_REQUEST)=>scriptedVectorRevision(source,text);
const bytes=value=>new TextEncoder().encode(value).length;
const titleCommand=title=>`標題改為「${title}」。`;
const colorCommand=(name,color,field='填色')=>`將「${name}」的${field}改為「${color}」。`;
const assertNative=value=>{assert.equal(validateVector(value),'');assert.deepEqual(cloneVector(value),value);assert.equal(vectorItems(value)[0].content,vectorCompactJson(value));assert.ok(bytes(vectorCompactJson(value))<=60000);};
const assertResult=(result,outcome)=>{
  assert.equal(result.outcome,outcome);
  assert.deepEqual(Object.keys(result).sort(),['outcome','artifact','reply','question','choices','rationale','changeSummary'].sort());
  assertNative(result.artifact);assert.match(result.reply,/固定腳本.*不是真實 AI/);
  assert.equal(Object.hasOwn(result,'goalText'),false);
};

test('fixed brief is seven standard fields and does not claim to understand a user brief',()=>{
  const brief=scriptedVectorBrief();
  assert.deepEqual(Object.keys(brief).sort(),['items','purpose','audience','message','tone','constraints','summary'].sort());
  assert.deepEqual(brief.items,[{id:'document',label:'向量圖形來源'}]);
  assert.match(brief.purpose,/虛構/);assert.match(brief.message,/未解析/);assert.match(brief.constraints,/不使用 AI/);
  assert.match(brief.summary,/未驗證任何外部工具/);assert.match(brief.constraints,/沒有 SVG 匯入、貝茲曲線/);
  brief.items[0].label='changed';assert.equal(scriptedVectorBrief().items[0].label,'向量圖形來源');
});

test('fixed fictional emblem contains five editable primitives and literal lettering, not a raster',()=>{
  const artifact=scriptedVectorArtifact(frozen({purpose:'PRIVATE_USER_REQUIREMENT',summary:'DO_NOT_CLAIM_PARSED'}));
  assertNative(artifact);assert.equal(artifact.shapes.length,5);assert.match(artifact.title,/虛構固定腳本示範，非 AI/);
  assert.deepEqual(artifact.shapes.map(entry=>entry.type),['ellipse','polygon','polygon','line','text']);
  assert.equal(artifact.shapes.at(-1).text,'晨光書屋');assert.equal(new Set(artifact.shapes.map(entry=>entry.id)).size,5);
  assert.doesNotMatch(JSON.stringify(artifact),/PRIVATE_USER_REQUIREMENT|DO_NOT_CLAIM_PARSED|data:image|https?:/);
  const svg=exportVector(artifact,'svg').text;assert.match(svg,/<ellipse /);assert.match(svg,/<polygon /);assert.match(svg,/<line /);assert.match(svg,/<text /);assert.doesNotMatch(svg,/<image\b/);
  assert.deepEqual(artifact,scriptedVectorArtifact());
  artifact.shapes[1].points[0].x=99;artifact.shapes.at(-1).text='changed';assert.notEqual(scriptedVectorArtifact().shapes[1].points[0].x,99);assert.equal(scriptedVectorArtifact().shapes.at(-1).text,'晨光書屋');
});

test('exported demonstration commands each create one real native change from the fixed fixture',()=>{
  const source=frozen(scriptedVectorArtifact());
  const title=revise(source,SCRIPTED_VECTOR_TITLE_REQUEST),color=revise(source,SCRIPTED_VECTOR_COLOR_REQUEST);
  assertResult(title,'revision');assertResult(color,'revision');
  assert.notEqual(title.artifact.title,source.title);assert.deepEqual(title.artifact.shapes,source.shapes);
  assert.equal(color.artifact.shapes.find(entry=>entry.label==='晨光').fill,'#ef8354');
  assert.deepEqual({...color.artifact,shapes:source.shapes},source);
  assert.deepEqual(color.artifact.shapes.slice(1),source.shapes.slice(1));
  assert.equal(title.question,'');assert.deepEqual(title.choices,[]);assert.equal(color.question,'');assert.deepEqual(color.choices,[]);
});

test('title change is literal and retains inner whitespace, markup and text objects without rewriting them',()=>{
  const source=frozen(vector([textShape('lettering','  原始文字\n第二行  ')])),title='  <script>alert("x")</script>\nA & B  ';
  const result=revise(source,' \n'+titleCommand(title)+'\t');assertResult(result,'revision');
  assert.equal(result.artifact.title,title);assert.deepEqual(result.artifact.shapes,source.shapes);
  const svg=exportVector(result.artifact,'svg').text;assert.doesNotMatch(svg,/<script>|<\/script>/);assert.match(svg,/&lt;script&gt;/);
  assert.match(result.reply,/圖中的文字物件/);assert.equal(revise(vector(),titleCommand('')).artifact.title,'');
});

test('unique named-shape and stable-ID color assignments change only the explicitly selected field',()=>{
  const source=vector([shape('left','rect',{label:' 左頁 '}),shape('right')]);
  for(const name of ['left',' 左頁 ']){
    const result=revise(frozen(source),colorCommand(name,'#A1b2C3'));assertResult(result,'revision');
    assert.equal(result.artifact.shapes[0].fill,'#A1b2C3');assert.deepEqual(result.artifact.shapes[0],{...source.shapes[0],fill:'#A1b2C3'});assert.deepEqual(result.artifact.shapes[1],source.shapes[1]);
  }
  const stroke=revise(source,colorCommand('right','none','外框色'));assert.equal(stroke.artifact.shapes[1].stroke,'none');assert.deepEqual(stroke.artifact.shapes[0],source.shapes[0]);
});

test('literal malicious labels are data and cannot inject SVG or executable commands',()=>{
  const label='<script>boom</script>',source=frozen(vector([shape('safe','rect',{label})]));
  const result=revise(source,colorCommand(label,'#123456'));assertResult(result,'revision');assert.equal(result.artifact.shapes[0].label,label);
  const svg=exportVector(result.artifact,'svg').text;assert.doesNotMatch(svg,/<script>/);assert.match(svg,/&lt;script&gt;boom&lt;\/script&gt;/);
  for(const color of ['url(https://example.invalid/payload)','url(#paint)','red','#123','#12345678','#123456" onload="evil','none\nonload=evil','NONE','rgb(1,2,3)'])assert.throws(()=>revise(source,colorCommand(label,color)),/六位十六進位色碼或 none/);
});

test('missing or ambiguous name/ID targets clarify rather than pick, rename or add an object',()=>{
  const fixtures=[vector([shape('a')]),vector([shape('a','rect',{label:'同名'}),shape('b','rect',{label:'同名'})]),vector([shape('a'),shape('b','rect',{label:'a'})])];
  for(const [index,source] of fixtures.entries()){
    const result=revise(frozen(source),colorCommand(index===0?'missing':index===1?'同名':'a','#112233'));assertResult(result,'clarification');assert.deepEqual(result.artifact,source);assert.equal(result.question,'');assert.deepEqual(result.choices,[]);
  }
});

test('line fill is not presented as a visible revision but its explicit stroke change is supported',()=>{
  const source=vector([shape('line','line',{fill:'none',width:-80,height:30})]);
  const noFill=revise(source,colorCommand('line','#112233'));assertResult(noFill,'clarification');assert.deepEqual(noFill.artifact,source);assert.match(noFill.reply,/線段沒有可見的填色/);
  const stroke=revise(source,colorCommand('line','#112233','外框色'));assertResult(stroke,'revision');assert.equal(stroke.artifact.shapes[0].stroke,'#112233');
});

test('identical title and case-only equivalent color are clarification without a fake version',()=>{
  const source=vector([shape('a','rect',{fill:'#a1B2c3'})]);
  for(const text of [titleCommand(source.title),colorCommand('a','#A1b2C3')]){
    const result=revise(frozen(source),text);assertResult(result,'clarification');assert.deepEqual(result.artifact,source);assert.equal(result.rationale,'');assert.equal(result.changeSummary,'');assert.deepEqual(result.choices,[]);
  }
  const first=revise(scriptedVectorArtifact(),SCRIPTED_VECTOR_COLOR_REQUEST);assert.equal(revise(first.artifact,SCRIPTED_VECTOR_COLOR_REQUEST).outcome,'clarification');
});

test('unknown natural language never claims analysis, echoes private requests or alters geometry',()=>{
  const source=frozen(scriptedVectorArtifact());
  for(const text of ['', '請理解 PRIVATE_TOPIC_SENTINEL 並重新設計 Logo。',SCRIPTED_VECTOR_TITLE_REQUEST+'同時刪除其他圖層。',SCRIPTED_VECTOR_TITLE_REQUEST.slice(0,-1),'標題改為「甲」「乙」。']){
    const result=revise(source,text);assertResult(result,'clarification');assert.deepEqual(result.artifact,source);assert.match(result.reply,/不會解析自由文字/);assert.match(result.reply,/沒有新增修改版/);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_TOPIC_SENTINEL/);assert.equal(result.rationale,'');assert.equal(result.changeSummary,'');
  }
});

test('optional choices are exactly two literal actions that each really work on the current source',()=>{
  for(const source of [scriptedVectorArtifact(),vector([shape('a','line',{fill:'none'})]),revise(scriptedVectorArtifact()).artifact]){
    const result=revise(frozen(source),'有哪些操作？');assert.equal(result.choices.length,2);assert.notEqual(result.question,'');
    for(const choice of result.choices){assert.equal(typeof choice.id,'string');assert.equal(typeof choice.label,'string');const selected=revise(source,choice.value);assertResult(selected,'revision');assert.notDeepEqual(selected.artifact,source);assert.deepEqual(selected.choices,[]);}
  }
});

test('choices are omitted when both executable safe examples cannot be offered',()=>{
  const source=vector([shape('a','rect',{label:'b'}),shape('b','rect',{label:'a'})]);
  const result=revise(source,'自由討論');assertResult(result,'clarification');assert.equal(result.question,'');assert.deepEqual(result.choices,[]);
});

test('non-text requests and invalid assignment results throw plain Errors rather than truncating data',()=>{
  const source=frozen(vector());
  for(const text of [undefined,null,17,{},[]])assert.throws(()=>scriptedVectorRevision(source,text),error=>error.constructor===Error&&/必須是文字/.test(error.message));
  for(const title of ['字'.repeat(201),'a\0b','\ud800','sk-'+'x'.repeat(20)])assert.throws(()=>revise(source,titleCommand(title)),Error);
  assert.deepEqual(source,vector());
});

test('fusion preserves all exact stable objects and the first-source back-to-front order',()=>{
  const shared=shape('shared'),a=vector([shape('left'),shared],{title:'保留第一來源標題'}),b=vector([shared,shape('right','ellipse'),shape('last')],{title:'第二來源標題'});
  const original=copy([a,b]),result=fuseScriptedVectors(frozen([a,b]));assertNative(result);
  assert.equal(result.title,a.title);assert.deepEqual(result.shapes.map(entry=>entry.id),['left','shared','right','last']);
  assert.deepEqual(result.shapes,[a.shapes[0],a.shapes[1],b.shapes[1],b.shapes[2]]);assert.deepEqual([a,b],original);
  assert.deepEqual(fuseScriptedVectors([b,a]).shapes.map(entry=>entry.id),['shared','right','last','left']);
});

test('fusion compares the entire ordered drawing, not an unordered set of shapes',()=>{
  const a=shape('a','rect',{fill:'#ff0000'}),b=shape('b','rect',{fill:'#0000ff'}),c=shape('c','rect',{x:300});
  const partial=vector([a,b]),completeDifferentOrder=vector([b,a,c]);
  const result=fuseScriptedVectors([partial,completeDifferentOrder]);assertNative(result);assert.deepEqual(result.shapes,[a,b,c]);
  assert.throws(()=>fuseScriptedVectors([completeDifferentOrder,partial]),/相同順序的完整繪製物件/);
});

test('distinct IDs with repeated drawing geometry retain multiplicity for transparency and occlusion',()=>{
  const a=vector([shape('a','rect',{opacity:0.5})]),b=vector([shape('b','rect',{opacity:0.5})]);
  const result=fuseScriptedVectors([a,b]);assertNative(result);assert.equal(result.shapes.length,2);assert.deepEqual(result.shapes.map(entry=>entry.opacity),[0.5,0.5]);assert.deepEqual(result.shapes.map(entry=>entry.id),['a','b']);
});

test('fusion requires compatible canvas dimensions and exact background without transforming a source',()=>{
  const source=vector([shape('left')]);
  for(const fields of [{width:641},{height:421},{background:'#eeeeee'},{background:'none'}]){
    const second=vector([shape('right')],fields),original=copy([source,second]);assert.throws(()=>fuseScriptedVectors(frozen([source,second])),/畫布寬高或背景不同/);assert.deepEqual([source,second],original);
  }
});

test('same-ID conflicts in every shape field reject rather than rename, replace or drop content',()=>{
  const polygon=shape('shared','polygon',{width:0,height:0,points:[{x:0,y:0},{x:100,y:0},{x:50,y:80}]}),a=vector([polygon,shape('left')]);
  const variants=[{label:'changed'},{x:21},{y:31},{fill:'#ffffff'},{stroke:'none'},{strokeWidth:3},{opacity:0.4},{points:[{x:0,y:0},{x:99,y:0},{x:50,y:80}]},{type:'polyline'}];
  for(const fields of variants){const b=vector([{...polygon,...fields},shape('right')]);assertNative(b);assert.throws(()=>fuseScriptedVectors(frozen([a,b])),/相同 ID.*圖形欄位不同/);}
  const text=textShape('shared','first');for(const fields of [{text:'changed'},{fontSize:29}])assert.throws(()=>fuseScriptedVectors([vector([text]),vector([{...text,...fields},shape('extra')])]),/相同 ID/);
  for(const fields of [{width:170},{height:110}])assert.throws(()=>fuseScriptedVectors([vector(),vector([shape('a','rect',fields),shape('extra')])]),/相同 ID/);
});

test('no-op detection checks any source including metadata-only and reordered-source-list variations',()=>{
  const small=vector([shape('a')]),large=vector([shape('a'),shape('b')]);
  for(const sources of [[small,large],[large,small],[large,{...large,title:'僅改標題'}],[large,vector([...large.shapes].reverse())]])assert.throws(()=>fuseScriptedVectors(frozen(sources)),/至少一個所選來源已包含相同順序/);
});

test('fusion requires two through five dense source artifacts without extra own properties',()=>{
  const a=vector([shape('a')]),b=vector([shape('b')]);
  const symbolic=[a,b];symbolic[Symbol('extra')]=true;
  const hidden=[a,b];Object.defineProperty(hidden,'extra',{value:true});
  for(const values of [undefined,null,{},[],[a],Array(2),Object.assign([a,b],{extra:true}),symbolic,hidden,Array.from({length:6},()=>a)])assert.throws(()=>fuseScriptedVectors(values),/2 至 5/);
  assert.throws(()=>fuseScriptedVectors([a,null]),/完整物件/);
  const result=fuseScriptedVectors(Array.from({length:5},(_,index)=>vector([shape('item-'+index)])));assertNative(result);assert.equal(result.shapes.length,5);
});

test('all entry points reject corrupt native schemas and unsafe color strings through shared validation',()=>{
  const good=vector([shape('a')]),invalids=[
    {...good,extra:true},{...good,kind:'svg'},{...good,background:'url(#evil)'},{...good,width:1.2},{...good,height:4097},{...good,title:'\udfff'},
    {...good,shapes:[]},{...good,shapes:[shape('a'),shape('a')]},{...good,shapes:[{...shape('a'),extra:true}]},
    {...good,shapes:[shape('a','rect',{fill:'red'})]},{...good,shapes:[shape('a','rect',{stroke:'#fff'})]},
    {...good,shapes:[shape('a','rect',{label:'字'.repeat(41)})]},{...good,shapes:[shape('bad id')]},
    {...good,shapes:[shape('a','rect',{label:'sk-'+'x'.repeat(20)})]},{...good,shapes:[shape('a','image')]}
  ];
  for(const source of invalids){assert.notEqual(validateVector(source),'');assert.throws(()=>revise(source),Error);assert.throws(()=>fuseScriptedVectors([good,source]),Error);}
});

test('native number bounds and exact three-decimal precision are enforced without silent rounding',()=>{
  const good=vector([shape('a')]);
  const fields=[{x:Infinity},{y:NaN},{x:-4096.001},{y:8192.001},{width:0},{height:-1},{width:8192.001},{strokeWidth:100.001},{opacity:1.001},{opacity:-0.001},{x:1.0001},{strokeWidth:0.1234}];
  for(const change of fields){const source=vector([shape('a','rect',change)]);assert.throws(()=>revise(source));assert.throws(()=>fuseScriptedVectors([good,source]));}
  const valid=vector([shape('a','rect',{x:-4096,y:8192,width:0.001,height:8192,strokeWidth:0.123,opacity:0.001})],{width:1,height:4096});
  assertNative(revise(valid).artifact);assert.equal(revise(valid).artifact.shapes[0].x,-4096);assert.equal(revise(valid).artifact.shapes[0].strokeWidth,0.123);
  const invalidText=vector([textShape('t')]);invalidText.shapes[0].fontSize=512.001;assert.throws(()=>revise(invalidText));
  const invalidPoint=scriptedVectorArtifact();invalidPoint.shapes[1].points[0].x=1.0001;assert.throws(()=>revise(invalidPoint));
});

test('fusion accepts exactly 100 shapes and rejects 101 atomically without dropping layers',()=>{
  const left=vector(Array.from({length:50},(_,index)=>shape('left-'+index))),right=vector(Array.from({length:50},(_,index)=>shape('right-'+index)));
  const result=fuseScriptedVectors(frozen([left,right]));assertNative(result);assert.equal(result.shapes.length,100);
  const overflow=vector([...right.shapes,shape('one-too-many')]),original=copy([left,overflow]);assert.throws(()=>fuseScriptedVectors(frozen([left,overflow])),/圖形.*數量/);assert.deepEqual([left,overflow],original);
});

function maximumBytesArtifact() {
  const source=vector(Array.from({length:15},(_,index)=>textShape('text-'+index,index===14?'x':'x'.repeat(4000))),{title:''});
  const remaining=60000-bytes(JSON.stringify(source));assert.ok(remaining>=0&&remaining<4000);source.shapes.at(-1).text+='x'.repeat(remaining);assertNative(source);assert.equal(bytes(vectorCompactJson(source)),60000);return source;
}

test('native and projection byte limits apply to literal revisions without truncation or extra invalid choices',()=>{
  const source=frozen(maximumBytesArtifact()),original=copy(source);
  assert.throws(()=>revise(source,titleCommand('x')),/60000.*未保存且未截斷/);assert.deepEqual(source,original);
  const result=revise(source,'普通討論');assertResult(result,'clarification');assert.deepEqual(result.artifact,source);assert.deepEqual(result.choices,[]);assert.equal(result.question,'');
  assert.equal(bytes(vectorItems(result.artifact)[0].content),60000);
});

test('fusion enforces aggregate native and projection size even for individually valid sources',()=>{
  const a=vector(Array.from({length:8},(_,index)=>textShape('left-'+index,'L'.repeat(4000)))),b=vector(Array.from({length:8},(_,index)=>textShape('right-'+index,'R'.repeat(4000))));
  assertNative(a);assertNative(b);const original=copy([a,b]);assert.throws(()=>fuseScriptedVectors(frozen([a,b])),/60000.*未保存且未截斷/);assert.deepEqual([a,b],original);
});

test('revision, clarification and fusion outputs are deeply detached from all input sources',()=>{
  const source=scriptedVectorArtifact(),original=copy(source);
  for(const result of [revise(source),revise(source,'自由討論')]){result.artifact.shapes[1].points[0].x=123;result.artifact.shapes.at(-1).text='changed';assert.deepEqual(source,original);}
  const a=vector([shape('a','polygon',{width:0,height:0,points:[{x:0,y:0},{x:100,y:0},{x:50,y:80}]})]),b=vector([shape('b')]),merged=fuseScriptedVectors([a,b]);merged.shapes[0].points[0].x=888;merged.shapes[1].label='changed';assert.equal(a.shapes[0].points[0].x,0);assert.equal(b.shapes[0].label,'b');
});

test('helper imports native validation and has no network, persistence, raster or script execution path',async()=>{
  const source=await readFile(new URL('../public/vector-demo.js',import.meta.url),'utf8');
  assert.match(source,/import \{cloneVector\} from '\.\/vector\.js\?v=20261021-version11'/);
  assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB)\s*(?:\(|\.)/);
  assert.doesNotMatch(source,/\b(?:function\s+validateVector|innerHTML|eval\s*\(|setTimeout\s*\(|setInterval\s*\()/);
  assert.doesNotMatch(source,/data:image|<image\b|<foreignObject\b/);
});
