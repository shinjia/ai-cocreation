/**
 * Pure, fixed-script fixtures, not AI. No network, storage, inferred relationships,
 * arbitrary-input interpretation, or automatic acceptance of pending proposals.
 */
import {cloneMindmap} from './mindmap.js?v=20261021-version11';

export const SCRIPTED_MINDMAP_CHILD_REQUEST='請提供這個節點的子分支示範。';
const KEEP_EXPLORING_REQUEST='先保留目前分支，繼續自由探索。';
const compareText=(a,b)=>a<b?-1:a>b?1:0;
const tuple=node=>[node.id,node.parentId,node.label,node.description];
const sameRecord=(a,b)=>JSON.stringify(tuple(a))===JSON.stringify(tuple(b));
const sameContent=(a,b)=>a.label===b.label&&a.description===b.description;
const recordSignature=nodes=>JSON.stringify(nodes.map(tuple).map(value=>JSON.stringify(value)).sort());
const childTemplates=[
  {label:'觀察細節（虛構示範）',description:'固定範例：記錄一個場景中的光線、聲音與動作；不是對所選節點內容的分析。'},
  {label:'延伸問題（虛構示範）',description:'固定範例：換一個觀看角度，列出仍想探索的問題；不代表必須選定結論。'},
  {label:'呈現方式（虛構示範）',description:'固定範例：比較照片、短片與文字等表達方式；不是 AI 建議或真實資料。'}
];

export function scriptedMindmapBrief() {
  return {
    items:[{id:'document',label:'心智圖來源'}],
    purpose:'以虛構的社區影像展主題，示範心智圖的自由探索與版本保存。',
    audience:'想了解心智圖操作方式的示範使用者。',
    message:'主題與分支皆為事先寫好的虛構範例，沒有解析或採用使用者的真實資料。',
    tone:'清楚、開放，允許保留問題與不同方向，不強迫收斂。',
    constraints:'固定腳本，不使用 AI；待確認分支不在圖中，只有使用者明確勾選加入草稿後才成為節點，另存版本仍需使用者操作。',
    summary:'用虛構的社區影像展主題示範：先提供待確認分支，由使用者決定是否加入，再選取任一既有節點繼續探索子分支；不自動採用、定稿或強迫收斂。'
  };
}

/** The brief is intentionally not parsed or represented as understood. */
export function scriptedMindmapArtifact(_brief) {
  return cloneMindmap({
    kind:'mindmap',rootId:'demo-mindmap-root',
    nodes:[{id:'demo-mindmap-root',parentId:'',label:'社區影像展（虛構示範主題）',description:'固定腳本示範，未解析使用者的主題。待確認分支需由使用者勾選後加入草稿，並自行另存版本。'}],
    proposals:[
      {id:'demo-mindmap-scenes',parentId:'demo-mindmap-root',label:'生活場景（虛構示範）',description:'固定範例：街角、菜市場與回家的路。尚未加入心智圖。'},
      {id:'demo-mindmap-people',parentId:'demo-mindmap-root',label:'人物觀點（虛構示範）',description:'固定範例：居民、創作者與初次觀展者的觀看角度。尚未加入心智圖。'},
      {id:'demo-mindmap-questions',parentId:'demo-mindmap-root',label:'開放問題（虛構示範）',description:'固定範例：還想看見哪些生活故事？可持續探索，沒有預設結論。尚未加入心智圖。'}
    ]
  });
}

function clarification(artifact,reply,offerChoices=false) {
  return {
    outcome:'clarification',artifact,
    reply:reply+'\n（固定腳本，不是真實 AI；這次沒有新增修改版。）',
    question:offerChoices?'要先看固定子分支示範，還是保留目前內容繼續探索？':'',
    choices:offerChoices?[
      {id:'mindmap-demo-children',label:'提供虛構子分支示範',value:SCRIPTED_MINDMAP_CHILD_REQUEST},
      {id:'mindmap-keep-exploring',label:'保留內容，繼續探索',value:KEEP_EXPLORING_REQUEST}
    ]:[],
    rationale:'',changeSummary:''
  };
}

/** IDs remain ASCII, bounded, deterministic, and unique across the full source. */
function nextProposalId(targetNodeId,slot,occupied) {
  const base=`demo-child-${targetNodeId.slice(0,40)}-${slot+1}`;
  let id=base,suffix=2;
  while(occupied.has(id))id=`${base}-${suffix++}`;
  occupied.add(id);return id;
}

export function scriptedMindmapRevision(sourceArtifact,targetNodeId,text) {
  const source=cloneMindmap(sourceArtifact);
  if(typeof targetNodeId!=='string'||!source.nodes.some(node=>node.id===targetNodeId))throw new Error('請選擇來源版本中已加入心智圖的節點；待確認分支不能作為子分支的父節點。');
  if(typeof text!=='string')throw new Error('心智圖討論內容必須是文字。');
  const command=text.trim();
  if(command===KEEP_EXPLORING_REQUEST)return clarification(source,'已保留完整心智圖與待確認分支。你可以改選節點、在編輯器手動整理，或繼續自由探索；不需要先選定結論。');
  if(command!==SCRIPTED_MINDMAP_CHILD_REQUEST)return clarification(source,`固定腳本不會解析自由文字或推論新內容。如要操作示範，請使用「${SCRIPTED_MINDMAP_CHILD_REQUEST}」。既有節點和待確認分支保持不變；自己的內容可在編輯器手動調整。`,true);

  const current=source.proposals.filter(node=>node.parentId===targetNodeId);
  const accepted=source.nodes.filter(node=>node.parentId===targetNodeId);
  const available=childTemplates.map((node,slot)=>({node,slot})).filter(({node})=>!accepted.some(previous=>sameContent(previous,node)));
  if(available.length<2)return clarification(source,'此節點已加入大部分固定示範子分支，目前沒有至少兩個不同的固定範例可供新增。現有內容保持不變；你仍可自行新增其他分支，或改選節點繼續探索。');
  const occupied=new Set([...source.nodes,...source.proposals].map(node=>node.id));
  const proposals=available.map(({node,slot})=>{
    const existing=current.find(previous=>sameContent(previous,node));
    return {id:existing?existing.id:nextProposalId(targetNodeId,slot,occupied),parentId:targetNodeId,label:node.label,description:node.description};
  });
  if(recordSignature(current)===recordSignature(proposals))return clarification(source,'此節點的相同固定示範分支已在待確認區，不會重複建立修改版。它們尚未加入心智圖；是否勾選加入草稿仍由你決定，也可以改選節點繼續探索。');

  const artifact=cloneMindmap({...source,proposals:[...source.proposals.filter(node=>node.parentId!==targetNodeId),...proposals]});
  return {
    outcome:'revision',artifact,
    reply:`已為所選節點準備 ${proposals.length} 個固定的虛構子分支，僅放在待確認區。所有既有節點及其他節點的待確認分支保持不變；需由你勾選加入草稿，再自行另存版本。\n（固定腳本示範，不是真實 AI，沒有分析你輸入的主題或自由文字。）`,
    question:'',choices:[],
    rationale:'使用事先寫好的虛構範例示範子分支提案，不解析使用者文字、不更動既有節點，也不自動採用分支或強迫收斂。',
    changeSummary:`僅更新所選節點的 ${proposals.length} 個待確認分支；已加入心智圖的節點與其他父節點的提案完整保留。`
  };
}

/** Tree meaning excludes IDs and array order, not text, topology, or multiplicity. */
function acceptedSignature(artifact) {
  const byId=new Map(artifact.nodes.map(node=>[node.id,node]));
  const children=new Map(artifact.nodes.map(node=>[node.id,[]]));
  for(const node of artifact.nodes)if(node.parentId!=='')children.get(node.parentId).push(node.id);
  const visit=id=>{
    const node=byId.get(id);
    return [node.label,node.description,children.get(id).map(visit).sort((a,b)=>compareText(JSON.stringify(a),JSON.stringify(b)))];
  };
  return JSON.stringify(visit(artifact.rootId));
}

/**
 * Exact compatible union, never an inferred relationship or semantic rewrite.
 * A pending ID enters nodes only if an explicitly selected source accepted it.
 * Pending-only IDs remain separate, and all original parent relationships survive.
 */
export function fuseScriptedMindmaps(artifacts) {
  if(!Array.isArray(artifacts)||artifacts.length<2||artifacts.length>5||Object.keys(artifacts).length!==artifacts.length||!Object.keys(artifacts).every((key,index)=>key===String(index)))throw new Error('固定心智圖融合示範需要選擇 2 至 5 個完整來源版本。');
  const sources=artifacts.map(cloneMindmap),rootId=sources[0].rootId;
  if(sources.some(source=>source.rootId!==rootId))throw new Error('所選心智圖的根節點 ID 不同；固定腳本不會猜測主題關係或建立新根節點，沒有建立融合版。');
  const root=sources[0].nodes.find(node=>node.id===rootId);
  if(sources.some(source=>!sameRecord(source.nodes.find(node=>node.id===rootId),root)))throw new Error('所選心智圖的根節點內容不同；固定腳本不會替你決定主題，沒有建立融合版。');
  const records=new Map(),acceptedIds=new Set();
  for(const source of sources){
    for(const node of [...source.nodes,...source.proposals]){
      const existing=records.get(node.id);
      if(existing&&!sameRecord(existing,node))throw new Error('所選心智圖有相同 ID，但節點文字、說明或父節點不同；固定腳本不會猜測取捨，沒有建立融合版。');
      if(!existing)records.set(node.id,node);
    }
    for(const node of source.nodes)acceptedIds.add(node.id);
  }
  const nodes=[...acceptedIds].map(id=>records.get(id)),children=new Map(nodes.map(node=>[node.id,[]]));
  for(const node of nodes)if(node.parentId!=='')children.get(node.parentId).push(node);
  for(const group of children.values())group.sort((a,b)=>compareText(a.id,b.id));
  const ordered=[],queue=[root];
  for(let index=0;index<queue.length;index++){
    const node=queue[index];ordered.push(node);queue.push(...children.get(node.id));
  }
  const proposals=[...records.values()].filter(node=>!acceptedIds.has(node.id)).sort((a,b)=>compareText(a.parentId,b.parentId)||compareText(a.id,b.id));
  const artifact=cloneMindmap({kind:'mindmap',rootId,nodes:ordered,proposals});
  const signature=acceptedSignature(artifact);
  if(sources.some(source=>acceptedSignature(source)===signature))throw new Error('至少一個所選來源已包含合併後的完整已加入節點；固定腳本不會僅改排列、ID 或待確認分支便另存融合版。');
  return artifact;
}
