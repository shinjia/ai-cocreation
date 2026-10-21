// Pure scripted helpers and native serialization only. No AI/provider call,
// browser integration, persisted version, real event, publication or payment.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {cloneWebpage,validateWebpage,webpageCompactJson,webpageItems,exportWebpage} from '../public/webpage.js';
import {
  SCRIPTED_WEBPAGE_TITLE_REQUEST,SCRIPTED_WEBPAGE_THEME_REQUEST,
  SCRIPTED_WEBPAGE_HEADING_REQUEST,SCRIPTED_WEBPAGE_BODY_REQUEST,
  SCRIPTED_WEBPAGE_NAVIGATION_ENABLE_REQUEST,SCRIPTED_WEBPAGE_NAVIGATION_DISABLE_REQUEST,
  scriptedWebpageArtifact,scriptedWebpageBrief,scriptedWebpageRevision,fuseScriptedWebpages
} from '../public/webpage-demo.js';

const entry=(id,title='項目 '+id,body='完整條目內容')=>({id,title,body});
const section=(id,type='text',fields={})=>({id,type,eyebrow:'',heading:'段落 '+id,body:'原始內文',entries:[],actionLabel:'',actionTarget:'',...fields});
const webpage=(sections=[section('a')],fields={})=>({kind:'webpage',title:'來源網頁',theme:'paper',navigation:true,sections,...fields});
const copy=value=>structuredClone(value);
const frozen=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))frozen(child);}return value;};
const bytes=value=>new TextEncoder().encode(value).length;
const revise=(source,text=SCRIPTED_WEBPAGE_TITLE_REQUEST)=>scriptedWebpageRevision(source,text);
const titleCommand=title=>`標題改為「${title}」。`;
const sectionCommand=(name,value,field='標題')=>`將「${name}」的${field}改為「${value}」。`;
const themeCommand=theme=>`視覺主題改為「${theme}」。`;
const assertNative=value=>{assert.equal(validateWebpage(value),'');assert.deepEqual(cloneWebpage(value),value);assert.equal(webpageItems(value)[0].content,webpageCompactJson(value));assert.ok(bytes(webpageCompactJson(value))<=60000);};
const assertResult=(result,outcome)=>{
  assert.equal(result.outcome,outcome);
  assert.deepEqual(Object.keys(result).sort(),['outcome','artifact','reply','question','choices','rationale','changeSummary'].sort());
  assertNative(result.artifact);assert.match(result.reply,/固定腳本.*不是真實 AI/);
  assert.equal(Object.hasOwn(result,'goalText'),false);
};

test('brief has seven standard fields with webpage structure, style, limits and honest fixed provenance',()=>{
  const brief=scriptedWebpageBrief();
  assert.deepEqual(Object.keys(brief).sort(),['items','purpose','audience','message','tone','constraints','summary'].sort());
  assert.deepEqual(brief.items,[{id:'document',label:'網頁來源'}]);
  assert.match(brief.purpose,/虛構/);assert.match(brief.message,/內容結構.*未解析/);
  assert.match(brief.tone,/視覺風格/);assert.match(brief.constraints,/操作功能與限制.*固定腳本，不使用 AI/);
  assert.match(brief.constraints,/沒有外部連線、表單送出、登入、付款/);assert.match(brief.summary,/不會自動定稿或發布/);
  brief.items[0].label='changed';assert.equal(scriptedWebpageBrief().items[0].label,'網頁來源');
});

test('fictional event fixture includes all five native section types and only resolved internal actions',()=>{
  const artifact=scriptedWebpageArtifact(frozen({purpose:'PRIVATE_USER_REQUIREMENT',summary:'DO_NOT_CLAIM_PARSED'}));
  assertNative(artifact);assert.match(artifact.title,/虛構固定腳本示範，非 AI/);
  assert.deepEqual(artifact.sections.map(item=>item.type),['hero','text','cards','faq','cta']);
  assert.equal(artifact.theme,'paper');assert.equal(artifact.navigation,true);
  assert.equal(new Set(artifact.sections.map(item=>item.id)).size,5);
  for(const item of artifact.sections)if(item.actionTarget)assert.ok(artifact.sections.some(target=>target.id===item.actionTarget));
  assert.equal(artifact.sections[2].entries.length,3);assert.equal(artifact.sections[3].entries.length,3);
  assert.doesNotMatch(JSON.stringify(artifact),/PRIVATE_USER_REQUIREMENT|DO_NOT_CLAIM_PARSED|https?:|data:image/);
  assert.match(artifact.sections[0].body,/不是真實活動公告/);assert.match(artifact.sections.at(-1).body,/不會報名、傳送資料/);
  assert.deepEqual(artifact,scriptedWebpageArtifact());
  artifact.sections[2].entries[0].body='changed';assert.notEqual(scriptedWebpageArtifact().sections[2].entries[0].body,'changed');
});

test('exported demonstration commands each change only their stated field',()=>{
  const source=frozen(scriptedWebpageArtifact());
  const cases=[
    [SCRIPTED_WEBPAGE_TITLE_REQUEST,result=>{assert.notEqual(result.title,source.title);assert.deepEqual({...result,title:source.title},source);}],
    [SCRIPTED_WEBPAGE_THEME_REQUEST,result=>{assert.equal(result.theme,'midnight');assert.deepEqual({...result,theme:source.theme},source);}],
    [SCRIPTED_WEBPAGE_HEADING_REQUEST,result=>{assert.notEqual(result.sections[1].heading,source.sections[1].heading);const reverted=copy(result);reverted.sections[1].heading=source.sections[1].heading;assert.deepEqual(reverted,source);}],
    [SCRIPTED_WEBPAGE_BODY_REQUEST,result=>{assert.notEqual(result.sections[1].body,source.sections[1].body);const reverted=copy(result);reverted.sections[1].body=source.sections[1].body;assert.deepEqual(reverted,source);}],
    [SCRIPTED_WEBPAGE_NAVIGATION_DISABLE_REQUEST,result=>{assert.equal(result.navigation,false);assert.deepEqual({...result,navigation:true},source);}]
  ];
  for(const [command,check] of cases){const result=revise(source,command);assertResult(result,'revision');assert.equal(result.question,'');assert.deepEqual(result.choices,[]);check(result.artifact);}
  const noNavigation=frozen({...source,navigation:false}),enabled=revise(noNavigation,SCRIPTED_WEBPAGE_NAVIGATION_ENABLE_REQUEST);assertResult(enabled,'revision');assert.deepEqual(enabled.artifact,source);
});

test('literal title preserves inner whitespace, markup, Chinese and newlines without rewriting any section',()=>{
  const source=frozen(scriptedWebpageArtifact()),title='  <script>alert("x")</script>\nA & B 中文  ';
  const result=revise(source,' \n'+titleCommand(title)+'\t');assertResult(result,'revision');
  assert.equal(result.artifact.title,title);assert.deepEqual(result.artifact.sections,source.sections);
  const html=exportWebpage(result.artifact,'html').text;
  assert.doesNotMatch(html,/<script\b|<\/script>/i);assert.match(html,/&lt;script&gt;/);
});

test('unique section ID or exact heading assignments preserve every other custom field and entry',()=>{
  const source=scriptedWebpageArtifact();source.title='自訂完整來源';source.theme='meadow';source.navigation=false;
  source.sections[2].heading=' 自訂卡片區 ';source.sections[2].eyebrow='自訂小標';source.sections[2].body='自訂內文\n第二行';
  source.sections[2].entries=[entry('custom-card','自訂標題',' 自訂卡片\n完整內容 '),entry('custom-card-two','次標題','另一個內容')];
  source.sections[3].entries[0].body='自訂問答，保留全部字元。';
  const original=copy(source);frozen(source);
  for(const name of ['demo-webpage-program',' 自訂卡片區 '])for(const field of ['標題','內文']){
    const text=' 新的字面內容\n第二行 ',result=revise(source,sectionCommand(name,text,field));assertResult(result,'revision');
    const expected=copy(source);expected.sections[2][field==='標題'?'heading':'body']=text;
    assert.deepEqual(result.artifact,expected);assert.deepEqual(source,original);
  }
});

test('literal markup and apparent resource URLs are text, not new executable instructions',()=>{
  const payload='</section><script>alert(1)</script><img src="https://example.invalid/a" onerror="evil()"> javascript:evil() url(https://example.invalid/b)';
  const source=webpage([section('literal','text',{heading:payload})]);
  const result=revise(frozen(source),sectionCommand(payload,payload+'\n中文與空白  ','內文'));assertResult(result,'revision');
  assert.equal(result.artifact.sections[0].heading,payload);assert.equal(result.artifact.sections[0].body,payload+'\n中文與空白  ');
  const html=exportWebpage(result.artifact,'html').text;
  assert.doesNotMatch(html,/<script\b|<img\b|<[^>]*\sonerror\s*=/i);assert.match(html,/&lt;script&gt;/);assert.match(html,/https:\/\/example\.invalid/);
});

test('empty section body is supported but blank required headings and document titles are rejected',()=>{
  const source=frozen(webpage());const cleared=revise(source,sectionCommand('a','','內文'));assertResult(cleared,'revision');assert.equal(cleared.artifact.sections[0].body,'');
  for(const text of ['', ' ', '\t\n']){assert.throws(()=>revise(source,titleCommand(text)),Error);assert.throws(()=>revise(source,sectionCommand('a',text)),Error);}
  assert.deepEqual(source,webpage());
});

test('missing or ambiguous heading and ID targets clarify instead of selecting or adding a section',()=>{
  const sources=[webpage(),webpage([section('a','text',{heading:'同名'}),section('b','text',{heading:'同名'})]),webpage([section('a'),section('b','text',{heading:'a'})])];
  for(const [index,source] of sources.entries()){
    const result=revise(frozen(source),sectionCommand(index===0?'missing':index===1?'同名':'a','新的標題'));assertResult(result,'clarification');assert.deepEqual(result.artifact,source);assert.equal(result.question,'');assert.deepEqual(result.choices,[]);
  }
});

test('only exact fixed theme tokens and navigation commands can change configuration',()=>{
  const source=frozen(webpage());
  for(const theme of ['midnight','meadow']){const result=revise(source,themeCommand(theme));assertResult(result,'revision');assert.deepEqual(result.artifact,{...source,theme});}
  for(const theme of ['', 'PAPER',' midnight','night','url(https://example.invalid)','<style>body{display:none}</style>'])assert.throws(()=>revise(source,themeCommand(theme)),Error);
  for(const command of ['啟用頁內導覽','關閉導覽。','啟用外部導覽。',SCRIPTED_WEBPAGE_NAVIGATION_DISABLE_REQUEST+'同時發布網站。']){const result=revise(source,command);assertResult(result,'clarification');assert.deepEqual(result.artifact,source);}
});

test('identical literal assignments return clarification without a fake revision or changed goal',()=>{
  const source=frozen(webpage());
  for(const text of [titleCommand(source.title),sectionCommand('a',source.sections[0].heading),sectionCommand('a',source.sections[0].body,'內文'),themeCommand(source.theme),SCRIPTED_WEBPAGE_NAVIGATION_ENABLE_REQUEST]){
    const result=revise(source,text);assertResult(result,'clarification');assert.deepEqual(result.artifact,source);assert.equal(result.rationale,'');assert.equal(result.changeSummary,'');assert.deepEqual(result.choices,[]);assert.equal(result.question,'');
  }
  const disabled=revise(source,SCRIPTED_WEBPAGE_NAVIGATION_DISABLE_REQUEST).artifact;assert.equal(revise(disabled,SCRIPTED_WEBPAGE_NAVIGATION_DISABLE_REQUEST).outcome,'clarification');
});

test('unknown requests and incomplete or combined grammar do not infer, echo private requests or create a version',()=>{
  const source=frozen(scriptedWebpageArtifact());
  for(const text of ['', '請理解 PRIVATE_TOPIC_SENTINEL，設計網站並發布。',SCRIPTED_WEBPAGE_TITLE_REQUEST+'刪除 FAQ。',SCRIPTED_WEBPAGE_TITLE_REQUEST.slice(0,-1),'標題改為「甲」「乙」。','將「demo-webpage-about」的內文改為「甲」「乙」。','請把網頁換成深色。']){
    const result=revise(source,text);assertResult(result,'clarification');assert.deepEqual(result.artifact,source);assert.match(result.reply,/不會解析自由文字/);assert.match(result.reply,/沒有新增修改版/);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_TOPIC_SENTINEL/);assert.equal(result.rationale,'');assert.equal(result.changeSummary,'');
  }
});

test('unknown-input choices are exactly two executable literal changes on the current artifact',()=>{
  for(const source of [scriptedWebpageArtifact(),webpage(),revise(scriptedWebpageArtifact()).artifact,webpage(undefined,{theme:'midnight'})]){
    const result=revise(frozen(source),'還可以做什麼？');assert.equal(result.choices.length,2);assert.notEqual(result.question,'');
    for(const choice of result.choices){assert.equal(typeof choice.id,'string');assert.equal(typeof choice.label,'string');const selected=revise(source,choice.value);assertResult(selected,'revision');assert.notDeepEqual(selected.artifact,source);assert.deepEqual(selected.choices,[]);}
  }
});

test('non-text requests and invalid Unicode or oversized assignments fail without truncation',()=>{
  const source=frozen(webpage());
  for(const text of [undefined,null,0,{},[]])assert.throws(()=>scriptedWebpageRevision(source,text),error=>error.constructor===Error&&/必須是文字/.test(error.message));
  for(const text of ['字'.repeat(201),'a\0b','\ud800','\udfff']){assert.throws(()=>revise(source,titleCommand(text)),Error);assert.throws(()=>revise(source,sectionCommand('a',text)),Error);}
  assert.throws(()=>revise(source,sectionCommand('a','字'.repeat(4001),'內文')),Error);
  const boundary=revise(source,sectionCommand('a','字'.repeat(4000),'內文'));assert.equal(bytes(boundary.artifact.sections[0].body),12000);
  assert.equal(bytes(revise(source,titleCommand('字'.repeat(200))).artifact.title),600);assert.deepEqual(source,webpage());
});

test('compatible fusion preserves exact sections, entries, resolved targets and first-source order',()=>{
  const shared=section('shared'),a=webpage([section('left','hero',{actionLabel:'前往共用段落',actionTarget:'shared'}),shared],{title:'保留第一來源標題'});
  const b=webpage([shared,section('cards','cards',{entries:[entry('one'),entry('two','第二張','完整文字')]}),section('right','cta',{actionLabel:'回到共用段落',actionTarget:'shared'})],{title:'第二來源標題'});
  const original=copy([a,b]),result=fuseScriptedWebpages(frozen([a,b]));assertNative(result);
  assert.equal(result.title,a.title);assert.deepEqual(result.sections,[...a.sections,...b.sections.slice(1)]);assert.deepEqual(result.sections.map(item=>item.id),['left','shared','cards','right']);assert.deepEqual([a,b],original);
  assert.deepEqual(fuseScriptedWebpages([b,a]).sections.map(item=>item.id),['shared','cards','right','left']);
});

test('fusion considers ordered sections, not an unordered set or a document title change',()=>{
  const a=section('a'),b=section('b'),c=section('c'),partial=webpage([a,b]),completeDifferentOrder=webpage([b,a,c]);
  assert.deepEqual(fuseScriptedWebpages([partial,completeDifferentOrder]).sections,[a,b,c]);
  assert.throws(()=>fuseScriptedWebpages([completeDifferentOrder,partial]),/相同順序的完整網頁內容/);
  for(const values of [[partial,{...partial,title:'另一標題'}],[partial,webpage([b,a])],[webpage([a]),partial],[partial,webpage([a])]])assert.throws(()=>fuseScriptedWebpages(frozen(values)),/至少一個所選來源/);
});

test('distinct stable section IDs retain repeated content and order rather than silently deduplicate',()=>{
  const a=webpage([section('left','text',{heading:'相同內容',body:'保留重複'})]),b=webpage([section('right','text',{heading:'相同內容',body:'保留重複'})]);
  const result=fuseScriptedWebpages([a,b]);assertNative(result);assert.equal(result.sections.length,2);assert.deepEqual(result.sections.map(item=>item.id),['left','right']);
});

test('fusion rejects incompatible theme or navigation settings without replacing them',()=>{
  const a=webpage([section('left')]);
  for(const fields of [{theme:'midnight'},{theme:'meadow'},{navigation:false}]){const b=webpage([section('right')],fields),original=copy([a,b]);assert.throws(()=>fuseScriptedWebpages(frozen([a,b])),/視覺主題或頁內導覽設定不同/);assert.deepEqual([a,b],original);}
});

test('same-ID conflicts in full section and entry content reject rather than drop, rename or replace',()=>{
  const shared=section('shared','hero',{eyebrow:'原始小標',actionLabel:'回到本段',actionTarget:'shared'}),a=webpage([shared,section('left')]);
  for(const fields of [{eyebrow:'changed'},{heading:'changed'},{body:'changed'},{actionLabel:'changed'},{actionTarget:'right'},{type:'cta'}]){
    const b=webpage([{...shared,...fields},section('right')]);assertNative(b);assert.throws(()=>fuseScriptedWebpages(frozen([a,b])),/相同 ID.*段落內容或設定不同/);
  }
  const cards=section('cards','cards',{entries:[entry('one'),entry('two')]}),first=webpage([cards,section('left')]);
  for(const entries of [[entry('one','changed'),entry('two')],[entry('one','項目 one','changed'),entry('two')],[entry('renamed'),entry('two')],[entry('two'),entry('one')],[entry('one')]])assert.throws(()=>fuseScriptedWebpages([first,webpage([{...cards,entries},section('right')])]),/相同 ID/);
});

test('dangling targets reject even when another source would supply the missing section',()=>{
  const invalid=webpage([section('a','hero',{actionLabel:'缺少目標',actionTarget:'missing'})]),other=webpage([section('missing')]);
  assert.notEqual(validateWebpage(invalid),'');assert.throws(()=>revise(invalid),Error);assert.throws(()=>fuseScriptedWebpages([invalid,other]),Error);
  const source=scriptedWebpageArtifact(),original=copy(source);source.sections.pop();source.sections[0].actionTarget='demo-webpage-next';assert.throws(()=>fuseScriptedWebpages([source,original]),Error);
});

test('fusion requires two to five dense artifacts without extra, symbol or hidden array properties',()=>{
  const a=webpage([section('a')]),b=webpage([section('b')]),symbolic=[a,b],hidden=[a,b];symbolic[Symbol('extra')]=true;Object.defineProperty(hidden,'extra',{value:true});
  for(const values of [undefined,null,{},[],[a],Array(2),Object.assign([a,b],{extra:true}),symbolic,hidden,Array.from({length:6},()=>a)])assert.throws(()=>fuseScriptedWebpages(values),/2 至 5/);
  assert.throws(()=>fuseScriptedWebpages([a,null]),Error);
  const result=fuseScriptedWebpages(Array.from({length:5},(_,index)=>webpage([section('item-'+index)])));assertNative(result);assert.equal(result.sections.length,5);
});

test('all entry points delegate strict schema validation rather than normalize corrupt input',()=>{
  const good=webpage(),invalids=[
    {...good,extra:true},{...good,kind:'html'},{...good,title:''},{...good,title:'\ud800'},{...good,theme:'custom'},{...good,navigation:'true'},
    {...good,sections:[]},{...good,sections:[section('a'),section('a')]},{...good,sections:[{...section('a'),extra:true}]},
    {...good,sections:[section('bad id')]},{...good,sections:[section('x'.repeat(65))]},{...good,sections:[section('a','script')]},
    {...good,sections:[section('a','text',{heading:''})]},{...good,sections:[section('a','text',{eyebrow:'字'.repeat(81)})]},
    {...good,sections:[section('a','text',{entries:[entry('x')]})]},{...good,sections:[section('a','cards')]},
    {...good,sections:[section('a','cards',{entries:[entry('x'),entry('x')]})]},
    {...good,sections:[section('a','faq',{entries:[{...entry('x'),extra:true}]})]},
    {...good,sections:[section('a','faq',{entries:[entry('x','','內容')]})]},
    {...good,sections:[section('a','cta')]},{...good,sections:[section('a','hero',{actionLabel:'Only label'})]},
    {...good,sections:[section('a','hero',{actionTarget:'a'})]},{...good,sections:[section('a','text',{actionLabel:'不可用',actionTarget:'a'})]},
    {...good,sections:[section('a','hero',{actionLabel:'目標',actionTarget:'https://example.invalid'})]}
  ];
  for(const source of invalids){assert.notEqual(validateWebpage(source),'');assert.throws(()=>revise(source),Error);assert.throws(()=>fuseScriptedWebpages([good,source]),Error);}
});

test('fusion permits exactly twenty sections and rejects twenty-one atomically',()=>{
  const a=webpage(Array.from({length:10},(_,index)=>section('left-'+index))),b=webpage(Array.from({length:10},(_,index)=>section('right-'+index)));
  const result=fuseScriptedWebpages(frozen([a,b]));assertNative(result);assert.equal(result.sections.length,20);
  const overflow=webpage([...b.sections,section('extra')]),original=copy([a,overflow]);assert.throws(()=>fuseScriptedWebpages(frozen([a,overflow])),Error);assert.deepEqual([a,overflow],original);
});

function maximumBytesArtifact() {
  const source=webpage(Array.from({length:5},(_,index)=>section('text-'+index,'text',{body:index===4?'x':'x'.repeat(12000)})),{title:'x'});
  const remaining=60000-bytes(JSON.stringify(source));assert.ok(remaining>=0&&remaining<12000);source.sections.at(-1).body+='x'.repeat(remaining);assertNative(source);assert.equal(bytes(webpageCompactJson(source)),60000);return source;
}

test('canonical byte limits apply to literal assignments and prevent unexecutable examples',()=>{
  const source=frozen(maximumBytesArtifact()),original=copy(source);
  assert.throws(()=>revise(source,titleCommand('xx')),/60000/);assert.throws(()=>revise(source,themeCommand('midnight')),/60000/);assert.deepEqual(source,original);
  const result=revise(source,'自由討論');assertResult(result,'clarification');assert.deepEqual(result.artifact,source);assert.equal(result.question,'');assert.deepEqual(result.choices,[]);
  assert.equal(bytes(webpageItems(result.artifact)[0].content),60000);
});

test('fusion rejects aggregate canonical overflow from individually valid sources without truncation',()=>{
  const a=webpage(Array.from({length:3},(_,index)=>section('left-'+index,'text',{body:'左'.repeat(4000)}))),b=webpage(Array.from({length:3},(_,index)=>section('right-'+index,'text',{body:'右'.repeat(4000)})));
  assertNative(a);assertNative(b);const original=copy([a,b]);assert.throws(()=>fuseScriptedWebpages(frozen([a,b])),/60000/);assert.deepEqual([a,b],original);
});

test('revision, clarification and fusion are deeply detached from all input provenance',()=>{
  const source=scriptedWebpageArtifact(),original=copy(source);
  for(const result of [revise(source),revise(source,'自由討論')]){result.artifact.sections[2].entries[0].body='changed';result.artifact.sections[0].actionTarget='demo-webpage-faq';assert.deepEqual(source,original);}
  const a=webpage([section('left','cards',{entries:[entry('item')]})]),b=webpage([section('right','faq',{entries:[entry('item')]})]),merged=fuseScriptedWebpages([a,b]);
  merged.sections[0].entries[0].body='changed';merged.sections[1].entries[0].title='changed';assert.equal(a.sections[0].entries[0].body,'完整條目內容');assert.equal(b.sections[0].entries[0].title,'項目 item');
});

test('helper imports shared native validation and has no network, storage, browser execution or persistence path',async()=>{
  const source=await readFile(new URL('../public/webpage-demo.js',import.meta.url),'utf8');
  assert.match(source,/import \{cloneWebpage\} from '\.\/webpage\.js\?v=20261021-version16'/);
  assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB)\s*(?:\(|\.)/);
  assert.doesNotMatch(source,/\b(?:function\s+validateWebpage|innerHTML|eval\s*\(|setTimeout\s*\(|setInterval\s*\()/);
  assert.doesNotMatch(source,/data:image|<script\b|<iframe\b|document\./);
});
