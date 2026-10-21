// Pure fixed-script helpers only. No real browser, PHP runtime, network, model API,
// screenshot/layout, persisted version, automatic checkbox, or paid inference.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {cloneMindmap,validateMindmap,acceptMindmapProposals} from '../public/mindmap.js';
import {SCRIPTED_MINDMAP_CHILD_REQUEST,scriptedMindmapBrief,scriptedMindmapArtifact,scriptedMindmapRevision,fuseScriptedMindmaps} from '../public/mindmap-demo.js';

const node=(id,parentId='root',label=id,description='')=>({id,parentId,label,description});
const tree=(nodes=[],proposals=[])=>({kind:'mindmap',rootId:'root',nodes:[node('root','','主題'),...nodes],proposals});
const copy=value=>JSON.parse(JSON.stringify(value));
const frozen=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))frozen(child);}return value;};
const revise=(source,target='root',text=SCRIPTED_MINDMAP_CHILD_REQUEST)=>scriptedMindmapRevision(source,target,text);
const record=value=>[value.id,value.parentId,value.label,value.description];
const sorted=values=>values.map(value=>JSON.stringify(record(value))).sort();

test('fixed brief has seven standard fields, marks fiction, and keeps exploration open',()=>{
  const brief=scriptedMindmapBrief();
  assert.deepEqual(Object.keys(brief).sort(),['items','purpose','audience','message','tone','constraints','summary'].sort());
  assert.deepEqual(brief.items,[{id:'document',label:'心智圖來源'}]);
  assert.match(brief.summary,/虛構/);assert.match(brief.tone,/不強迫收斂/);assert.match(brief.constraints,/不使用 AI/);
  brief.items[0].label='changed';assert.equal(scriptedMindmapBrief().items[0].label,'心智圖來源');
});

test('generation has exactly one fictional root and three separate pending branches',()=>{
  const brief=frozen({summary:'USER_TOPIC_SENTINEL',purpose:'USER_DATA_SENTINEL'});
  const artifact=scriptedMindmapArtifact(brief);
  assert.equal(validateMindmap(artifact),'');assert.equal(artifact.nodes.length,1);assert.equal(artifact.proposals.length,3);
  assert.equal(artifact.nodes[0].id,artifact.rootId);assert.equal(artifact.nodes[0].parentId,'');
  for(const value of [...artifact.nodes,...artifact.proposals])assert.match(value.label,/虛構示範/);
  for(const proposal of artifact.proposals)assert.equal(proposal.parentId,artifact.rootId);
  assert.match(artifact.nodes[0].description,/未解析/);assert.doesNotMatch(JSON.stringify(artifact),/USER_TOPIC_SENTINEL|USER_DATA_SENTINEL/);
  assert.deepEqual(artifact,scriptedMindmapArtifact());
  artifact.nodes[0].label='changed';assert.notEqual(scriptedMindmapArtifact().nodes[0].label,'changed');
});

test('literal child demo modifies only target pending proposals, never accepted nodes',()=>{
  let source=acceptMindmapProposals(scriptedMindmapArtifact(),['demo-mindmap-scenes']);
  source.proposals.push(node('previous-scene-proposal','demo-mindmap-scenes','舊的待確認分支','  保留在來源版本\n原始說明  '));
  source.nodes[1].description='  使用者自己的文字\n換行保留  ';
  const original=copy(source),result=revise(frozen(source),'demo-mindmap-scenes');
  assert.equal(result.outcome,'revision');assert.equal(validateMindmap(result.artifact),'');
  assert.deepEqual(result.artifact.nodes,original.nodes);
  assert.deepEqual(result.artifact.proposals.filter(value=>value.parentId!==source.nodes[1].id),original.proposals.filter(value=>value.parentId!==source.nodes[1].id));
  assert.equal(result.artifact.proposals.filter(value=>value.parentId===source.nodes[1].id).length,3);
  assert.equal(result.question,'');assert.deepEqual(result.choices,[]);assert.match(result.reply,/不是真實 AI/);assert.match(result.reply,/僅放在待確認區/);
  assert.match(result.rationale,/不解析/);assert.match(result.changeSummary,/已加入心智圖的節點/);
  assert.equal(Object.hasOwn(result,'goalText'),false,'does not pretend to infer or change a version goal');
  assert.deepEqual(source,original);
});

test('unrecognized text clarifies without pretending to parse user data or create revision',()=>{
  const source=frozen(tree([node('branch')],[node('proposal','branch')]));
  const result=revise(source,'branch','請幫我分析 USER_PRIVATE_TOPIC_SENTINEL，直接定稿。');
  assert.equal(result.outcome,'clarification');assert.deepEqual(result.artifact,source);
  assert.match(result.reply,/不會解析自由文字/);assert.match(result.reply,/沒有新增修改版/);
  assert.doesNotMatch(JSON.stringify(result),/USER_PRIVATE_TOPIC_SENTINEL/);
  assert.equal(result.rationale,'');assert.equal(result.changeSummary,'');assert.equal(result.choices.length,2);
  assert.equal(result.choices[0].value,SCRIPTED_MINDMAP_CHILD_REQUEST);
  const kept=revise(source,'branch',result.choices[1].value);
  assert.equal(kept.outcome,'clarification');assert.deepEqual(kept.artifact,source);assert.equal(kept.question,'');assert.deepEqual(kept.choices,[]);
});

test('supported request is an explicit literal with optional outer whitespace, not semantic matching',()=>{
  assert.equal(revise(tree(),'root',' \n'+SCRIPTED_MINDMAP_CHILD_REQUEST+'\t').outcome,'revision');
  for(const text of ['', '幫我提供這個節點的子分支',SCRIPTED_MINDMAP_CHILD_REQUEST+' 以及自動加入。',SCRIPTED_MINDMAP_CHILD_REQUEST.slice(0,-1)])assert.equal(revise(tree(),'root',text).outcome,'clarification');
});

test('missing, pending-only, or malformed targets are rejected before a fake response',()=>{
  const source=scriptedMindmapArtifact();
  for(const target of [undefined,null,17,'missing',source.proposals[0].id])assert.throws(()=>revise(source,target),/已加入心智圖/);
  for(const text of [null,undefined,17,{}])assert.throws(()=>scriptedMindmapRevision(source,source.rootId,text),/必須是文字/);
});

test('an identical second request is clarification, including pending list reordering',()=>{
  const first=revise(tree()).artifact;
  for(const source of [first,{...first,proposals:[...first.proposals].reverse()}]){
    const result=revise(frozen(source));assert.equal(result.outcome,'clarification');assert.deepEqual(result.artifact,source);
    assert.equal(result.rationale,'');assert.equal(result.changeSummary,'');assert.equal(result.question,'');assert.deepEqual(result.choices,[]);
  }
});

test('proposal IDs are deterministic bounded ASCII and avoid accepted and pending collisions',()=>{
  const target='t'.repeat(64),nodes=[node(target)],pending=[];
  for(let slot=1;slot<=3;slot++){
    const base=`demo-child-${target.slice(0,40)}-${slot}`;
    nodes.push(node(base));pending.push(node(base+'-2'));
  }
  const source=frozen(tree(nodes,pending)),a=revise(source,target),b=revise(source,target);
  assert.deepEqual(a,b);assert.equal(a.outcome,'revision');
  for(const proposal of a.artifact.proposals.filter(value=>value.parentId===target)){
    assert.match(proposal.id,/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);assert.match(proposal.id,/-3$/);
  }
  assert.equal(new Set([...a.artifact.nodes,...a.artifact.proposals].map(value=>value.id)).size,a.artifact.nodes.length+a.artifact.proposals.length);
});

test('matching existing target proposals retain IDs when the fixed set is completed',()=>{
  const first=revise(tree()).artifact,source=cloneMindmap(first);
  source.proposals.pop();source.proposals[0].id='custom-stable-proposal';
  const result=revise(frozen(source));assert.equal(result.outcome,'revision');
  assert.equal(result.artifact.proposals.find(value=>value.label===source.proposals[0].label).id,'custom-stable-proposal');
  assert.equal(result.artifact.proposals.find(value=>value.label===source.proposals[1].label).id,source.proposals[1].id);
});

test('already accepted fixed children are not proposed again, and exhausted fixtures clarify',()=>{
  const initial=revise(tree()).artifact;
  const oneAccepted=acceptMindmapProposals(initial,[initial.proposals[0].id]);
  assert.equal(revise(oneAccepted).outcome,'clarification','same remaining two proposals do not create a fake revision');
  const missingPending={...oneAccepted,proposals:[]},result=revise(missingPending);
  assert.equal(result.outcome,'revision');assert.equal(result.artifact.proposals.length,2);
  assert.equal(result.artifact.proposals.some(value=>value.label===initial.proposals[0].label),false);
  for(const count of [2,3]){
    const source=acceptMindmapProposals(initial,initial.proposals.slice(0,count).map(value=>value.id)),next=revise(source);
    assert.equal(next.outcome,'clarification');assert.deepEqual(next.artifact,source);
  }
});

test('revision observes the combined pending limit and rejects atomically rather than truncating',()=>{
  const original=tree([node('target')],Array.from({length:22},(_,index)=>node('pending-'+index)));
  const source=frozen(original);assert.equal(validateMindmap(source),'');
  assert.throws(()=>revise(source,'target'),/待選分支.*數量|待確認.*數量/);
  assert.deepEqual(source,original);
  const boundary=tree([node('target')],source.proposals.slice(0,21));
  assert.equal(revise(boundary,'target').artifact.proposals.length,24);
});

test('revision rejects aggregate byte overflow without altering or truncating its valid source',()=>{
  const source=tree(Array.from({length:30},(_,index)=>node('n'+index,'root','Node','x'.repeat(1900))));
  source.nodes[0].description='r'.repeat(600);assert.equal(validateMindmap(source),'');
  const original=copy(source);assert.throws(()=>revise(frozen(source)),/60000.*未保存且未截斷/);assert.deepEqual(source,original);
});

test('fusion combines divergent explicit acceptances and never promotes pending-only proposals',()=>{
  const initial=scriptedMindmapArtifact(),a=acceptMindmapProposals(initial,[initial.proposals[0].id]),b=acceptMindmapProposals(initial,[initial.proposals[1].id]);
  const originals=copy([a,b]),result=fuseScriptedMindmaps(frozen([a,b]));
  assert.equal(validateMindmap(result),'');assert.equal(result.nodes.length,3);assert.equal(result.proposals.length,1);
  assert.equal(result.proposals[0].id,initial.proposals[2].id);
  assert.deepEqual(sorted(result.nodes),sorted([initial.nodes[0],initial.proposals[0],initial.proposals[1]]));
  assert.deepEqual([a,b],originals);assert.deepEqual(result,fuseScriptedMindmaps([b,a]));
});

test('fusion retains all exact accepted records, parent links and separate pending records',()=>{
  const a=tree([node('left','root',' 左側 ',' 第一行\n第二行 '),node('left-child','left')],[node('shared-pending'),node('left-pending','left')]);
  const b=tree([node('right'),node('right-child','right')],[node('shared-pending'),node('right-pending','right')]);
  const result=fuseScriptedMindmaps(frozen([a,b]));
  const accepted=[...a.nodes,...b.nodes],pending=[...a.proposals,...b.proposals];
  for(const value of result.nodes)assert.ok(accepted.some(source=>JSON.stringify(record(source))===JSON.stringify(record(value))));
  for(const value of result.proposals)assert.ok(pending.some(source=>JSON.stringify(record(source))===JSON.stringify(record(value))));
  assert.deepEqual(sorted(result.proposals),sorted([a.proposals[0],a.proposals[1],b.proposals[1]]));
  assert.deepEqual(result,fuseScriptedMindmaps([{...b,nodes:[...b.nodes].reverse(),proposals:[...b.proposals].reverse()},{...a,nodes:[...a.nodes].reverse(),proposals:[...a.proposals].reverse()}]));
});

test('fusion rejects different roots and root-content conflicts without invented connections',()=>{
  const a=tree([node('left')]),different={kind:'mindmap',rootId:'other',nodes:[node('other','','其他主題'),node('right','other')],proposals:[]};
  assert.throws(()=>fuseScriptedMindmaps([a,different]),/根節點 ID 不同/);
  const b=tree([node('right')]);b.nodes[0].description='不同的主題說明';
  assert.throws(()=>fuseScriptedMindmaps([a,b]),/根節點內容不同/);
});

test('fusion rejects all ID content, parent, and cross-status conflicts',()=>{
  const a=tree([node('left'),node('shared','left')],[node('pending')]);
  const scenarios=[
    tree([node('left'),node('shared','left','changed'),node('right')]),
    tree([node('left'),node('shared','left','shared','changed'),node('right')]),
    tree([node('left'),node('shared','root'),node('right')]),
    tree([node('right')],[node('pending','root','changed')]),
    tree([node('right'),node('pending','root','changed')])
  ];
  for(const b of scenarios){assert.equal(validateMindmap(b),'');assert.throws(()=>fuseScriptedMindmaps([a,b]),/相同 ID.*文字、說明或父節點不同/);}
});

test('fusion needs two through five actual valid artifacts',()=>{
  for(const sources of [null,{},[],[tree()],Array(2),Object.assign([tree(),tree()],{extra:true}),Array.from({length:6},()=>tree())])assert.throws(()=>fuseScriptedMindmaps(sources),/2 至 5/);
  assert.throws(()=>fuseScriptedMindmaps([tree([node('left')]),null]),/完整物件/);
  const sources=Array.from({length:5},(_,index)=>tree([node('branch-'+index)]));
  assert.equal(fuseScriptedMindmaps(sources).nodes.length,6);
});

test('a union identical to any source is rejected, not only a duplicate of the first',()=>{
  const small=tree([node('left')]),large=tree([node('right'),node('left')]);
  for(const sources of [[small,large],[large,small],[large,{...large,nodes:[...large.nodes].reverse()}]])assert.throws(()=>fuseScriptedMindmaps(sources),/至少一個所選來源已包含/);
});

test('pending-only variation cannot masquerade as a meaningful accepted-tree fusion',()=>{
  const a=tree([node('left')],[node('pending-a')]),b=tree([node('left')],[node('pending-b')]);
  assert.throws(()=>fuseScriptedMindmaps([a,b]),/待確認分支便另存融合版/);
});

test('shared native validation rejects cycles, missing parents, secret data and unknown shapes',()=>{
  const valid=tree([node('left')]);
  const invalids=[
    {...valid,nodes:[node('root','','主題'),node('left','right'),node('right','left')]},
    {...valid,proposals:[node('pending','missing')]},
    {...valid,extra:true},
    {...valid,nodes:[node('root','','主題','sk-'+'x'.repeat(20))]}
  ];
  for(const source of invalids){assert.notEqual(validateMindmap(source),'');assert.throws(()=>revise(source));assert.throws(()=>fuseScriptedMindmaps([valid,source]));}
});

test('fusion rejects accepted union above 80 nodes and allows exactly 80 without truncating',()=>{
  const a=tree(Array.from({length:40},(_,index)=>node('left-'+index))),b=tree(Array.from({length:40},(_,index)=>node('right-'+index)));
  assert.equal(validateMindmap(a),'');assert.equal(validateMindmap(b),'');
  assert.throws(()=>fuseScriptedMindmaps(frozen([a,b])),/已加入節點.*數量/);
  const boundary=fuseScriptedMindmaps([a,tree(b.nodes.slice(1,40))]);assert.equal(boundary.nodes.length,80);assert.equal(validateMindmap(boundary),'');
});

test('fusion rejects pending union above 24 and allows exactly 24 without accepting it',()=>{
  const a=tree([node('left')],Array.from({length:13},(_,index)=>node('left-pending-'+index))),b=tree([node('right')],Array.from({length:13},(_,index)=>node('right-pending-'+index)));
  assert.throws(()=>fuseScriptedMindmaps(frozen([a,b])),/待選分支.*數量|待確認.*數量/);
  const boundary=fuseScriptedMindmaps([{...a,proposals:a.proposals.slice(0,12)},{...b,proposals:b.proposals.slice(0,12)}]);
  assert.equal(boundary.nodes.length,3);assert.equal(boundary.proposals.length,24);
});

test('fusion enforces the native byte limit for a union of individually valid sources',()=>{
  const a=tree(Array.from({length:20},(_,index)=>node('left-'+index,'root','Left','L'.repeat(1900))));
  const b=tree(Array.from({length:20},(_,index)=>node('right-'+index,'root','Right','R'.repeat(1900))));
  assert.equal(validateMindmap(a),'');assert.equal(validateMindmap(b),'');
  assert.throws(()=>fuseScriptedMindmaps(frozen([a,b])),/60000.*未保存且未截斷/);
});

test('deep valid trees remain finite and preserve all exact parent relationships',()=>{
  const chain=Array.from({length:77},(_,index)=>node('chain-'+index,index?'chain-'+(index-1):'root'));
  const a=tree([...chain,node('left','chain-76')]),b=tree([...chain,node('right','chain-76')]);
  const result=fuseScriptedMindmaps(frozen([a,b]));assert.equal(result.nodes.length,80);assert.equal(validateMindmap(result),'');
  for(const value of chain)assert.deepEqual(result.nodes.find(entry=>entry.id===value.id),value);
});

test('returned artifacts are detached from input sources',()=>{
  const a=tree([node('left')],[node('pending-left')]),b=tree([node('right')],[node('pending-right')]);
  const result=fuseScriptedMindmaps([a,b]);result.nodes.find(value=>value.id==='left').description='changed';result.proposals[0].label='changed';
  assert.equal(a.nodes[1].description,'');assert.equal(a.proposals[0].label,'pending-left');
  const clarification=revise(a,'left','not a command');clarification.artifact.nodes[0].label='changed';assert.equal(a.nodes[0].label,'主題');
});

test('helper uses shared native validation and has no network or browser state path',async()=>{
  const source=await readFile(new URL('../public/mindmap-demo.js',import.meta.url),'utf8');
  assert.match(source,/import \{cloneMindmap\} from '\.\/mindmap\.js\?v=20261021-version11'/);
  assert.doesNotMatch(source,/\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB)\s*(?:\(|\.)/);
  assert.doesNotMatch(source,/\b(?:function\s+validateMindmap|innerHTML|eval\s*\()/);
});
