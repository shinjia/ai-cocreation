/** Native mindmaps. Pure validation/mutations, own SVG primitives, and a local draft editor.
 * No persistence, network, AI invocation, executable markup, or implicit downloads. */
const SVG_NS='http://www.w3.org/2000/svg';
const SECRET_ERROR='請勿在對話或作品欄位貼入 API Key；請只使用 API 設定中的密碼欄。';
const bytes=value=>new TextEncoder().encode(value).length;
const fail=(condition,message)=>{if(!condition)throw new Error(message);};
let idSequence=0,instanceSequence=0;
function validUnicode(value){
  for(let i=0;i<value.length;i++){
    const code=value.charCodeAt(i);
    if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))return false;}
    else if(code>=0xdc00&&code<=0xdfff)return false;
  }
  return true;
}
function secretGuard(value){fail(!/\bsk-[a-zA-Z0-9_-]{16,}\b/.test(value),SECRET_ERROR);}
function object(value,keys,name){
  fail(value!==null&&typeof value==='object'&&!Array.isArray(value),name+'必須是完整物件。');
  fail(JSON.stringify(Object.keys(value).sort())===JSON.stringify([...keys].sort())&&Reflect.ownKeys(value).length===keys.length,name+'缺少欄位或包含未支援的欄位。');
}
function list(value,min,max,name){
  fail(Array.isArray(value)&&value.length>=min&&value.length<=max&&Object.keys(value).length===value.length&&Reflect.ownKeys(value).length===value.length+1&&Object.keys(value).every((key,index)=>key===String(index)),name+'的數量或清單格式不正確。');
}
function text(value,max,name,empty=true){
  fail(typeof value==='string'&&validUnicode(value)&&!value.includes('\0'),name+'必須是有效 UTF8 文字。');
  fail(bytes(value)<=max&&(empty||value.trim()!==''),name+'空白或超過長度上限。');
  secretGuard(value);return value;
}
function stableId(value,name){
  fail(typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$(?![\s\S])/.test(value),name+'必須是最多64字元的穩定英數識別碼，可包含 - 或 _。');
  secretGuard(value);return value;
}
function checkedMindmap(value){
  object(value,['kind','rootId','nodes','proposals'],'心智圖');fail(value.kind==='mindmap','心智圖類型欄位不正確。');
  const rootId=stableId(value.rootId,'根節點識別碼');list(value.nodes,1,80,'已加入節點');list(value.proposals,0,24,'待選分支');
  const ids=new Set();
  const read=(entry,pending)=>{
    object(entry,['id','parentId','label','description'],pending?'待選分支':'節點');
    const id=stableId(entry.id,'節點識別碼');fail(!ids.has(id),'節點與待選分支識別碼不可重複。');ids.add(id);
    const parentId=entry.parentId===''&&!pending?'':stableId(entry.parentId,'父節點識別碼');
    return {id,parentId,label:text(entry.label,240,'節點名稱',false),description:text(entry.description,2000,'節點說明')};
  };
  const nodes=value.nodes.map(node=>read(node,false)),proposals=value.proposals.map(node=>read(node,true));
  const byId=new Map(nodes.map(node=>[node.id,node])),roots=nodes.filter(node=>node.parentId==='');
  fail(roots.length===1&&roots[0].id===rootId,'心智圖必須只有一個根節點，且須與 rootId 相符。');
  nodes.forEach(node=>{
    if(node.id===rootId)return;
    fail(byId.has(node.parentId),'每個已加入節點的父節點必須存在於圖中。');
    const visited=new Set([node.id]);let parent=node.parentId;
    while(parent!==rootId){
      fail(byId.has(parent),'每個已加入節點的父節點必須存在於圖中。');
      fail(!visited.has(parent),'心智圖不可循環，所有節點必須連接至根節點。');visited.add(parent);parent=byId.get(parent).parentId;
    }
  });
  proposals.forEach(node=>fail(byId.has(node.parentId),'待選分支的父節點必須是已加入圖中的節點。'));
  const out={kind:'mindmap',rootId,nodes,proposals};
  const encoded=JSON.stringify(out).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  fail(bytes(encoded)<=60000,'完整作品超過60000個 UTF8 位元組，未保存且未截斷內容。');
  fail(bytes(outlineContent(out))<=60000,'完整作品文字投影超過保存上限，未截斷內容。');return out;
}
export function defaultMindmap(){return {kind:'mindmap',rootId:'root',nodes:[{id:'root',parentId:'',label:'主題',description:''}],proposals:[]};}
export function validateMindmap(value){try{checkedMindmap(value);return '';}catch(error){return error.message;}}
export function cloneMindmap(value){return checkedMindmap(value);}
function findNode(value,id){const node=value.nodes.find(entry=>entry.id===id);fail(!!node,'找不到指定的已加入節點。');return node;}
function descendants(value,id){
  const result=new Set([id]);let changed=true;
  while(changed){changed=false;value.nodes.forEach(node=>{if(result.has(node.parentId)&&!result.has(node.id)){result.add(node.id);changed=true;}});}
  return result;
}
function mutate(value,callback){const next=checkedMindmap(value);callback(next);return checkedMindmap(next);}
export function updateMindmapNode(value,id,fields){
  object(fields,['label','description'],'節點修改');return mutate(value,next=>{const node=findNode(next,id);node.label=fields.label;node.description=fields.description;});
}
export function addMindmapChild(value,parentId,label,description='',id=null){
  return mutate(value,next=>{
    findNode(next,parentId);const ids=new Set([...next.nodes,...next.proposals].map(node=>node.id));
    if(id===null){do{id='node_'+(globalThis.crypto?.randomUUID?.()||'local_'+(++idSequence));}while(ids.has(id));}
    next.nodes.push({id,parentId,label,description});
  });
}
export function moveMindmapNode(value,id,parentId){
  return mutate(value,next=>{
    const node=findNode(next,id);findNode(next,parentId);fail(id!==next.rootId,'根節點不可移動。');
    fail(!descendants(next,id).has(parentId),'不可移到自己或後代節點，以免產生循環。');node.parentId=parentId;
  });
}
export function mergeMindmapNodes(value,id,destinationId){
  return mutate(value,next=>{
    const source=findNode(next,id),destination=findNode(next,destinationId);fail(id!==next.rootId,'根節點不可合併。');
    fail(!descendants(next,id).has(destinationId),'不可合併到自己或後代節點，以免產生循環。');
    // Keep both names, both original descriptions, and every child/pending branch.
    destination.description+=(destination.description?'\n\n':'')+'【合併節點：'+source.label+'】'+(source.description?'\n'+source.description:'');
    next.nodes.forEach(node=>{if(node.parentId===id)node.parentId=destinationId;});
    next.proposals.forEach(node=>{if(node.parentId===id)node.parentId=destinationId;});next.nodes=next.nodes.filter(node=>node.id!==id);
  });
}
export function acceptMindmapProposals(value,ids){
  list(ids,0,24,'勾選分支');fail(new Set(ids).size===ids.length,'勾選分支不可重複。');
  return mutate(value,next=>{
    ids.forEach(id=>fail(typeof id==='string'&&next.proposals.some(node=>node.id===id),'找不到指定的待選分支。'));
    const selected=new Set(ids);next.nodes.push(...next.proposals.filter(node=>selected.has(node.id)));next.proposals=next.proposals.filter(node=>!selected.has(node.id));
  });
}
export function deleteMindmapLeaf(value,id){
  return mutate(value,next=>{
    findNode(next,id);fail(id!==next.rootId,'根節點不可刪除。');
    fail(![...next.nodes,...next.proposals].some(node=>node.parentId===id),'只能移除沒有子節點且沒有待選分支的末端節點。');next.nodes=next.nodes.filter(node=>node.id!==id);
  });
}
function treeEntries(artifact){
  const children=new Map(artifact.nodes.map(node=>[node.id,[]]));artifact.nodes.forEach(node=>{if(node.parentId)children.get(node.parentId).push(node);});
  const result=[];const visit=(node,depth)=>{result.push({node,depth});children.get(node.id).forEach(child=>visit(child,depth+1));};visit(findNode(artifact,artifact.rootId),0);return {entries:result,children};
}
function outlineContent(artifact){
  const {entries}=treeEntries(artifact),lines=['已加入心智圖：'];
  entries.forEach(({node,depth})=>{lines.push('  '.repeat(depth)+'- ['+node.id+'] '+node.label);if(node.description!=='')lines.push('  '.repeat(depth)+'  說明：'+node.description);});
  lines.push('','待選分支（尚未加入心智圖）：');
  if(!artifact.proposals.length)lines.push('（無）');
  artifact.proposals.forEach(node=>{lines.push('- ['+node.id+'] '+node.label+'（父節點：'+node.parentId+'）');if(node.description!=='')lines.push('  說明：'+node.description);});
  return lines.join('\n');
}
export function mindmapItems(value){
  const artifact=checkedMindmap(value);return [{id:'document',label:'心智圖來源',content:outlineContent(artifact)}];
}
function element(document,tag,className='',value=null){const node=document.createElement(tag);if(className)node.className=className;if(value!==null)node.textContent=value;return node;}
function attr(node,name,value){node.setAttribute(name,String(value));return node;}
const svgNode=(tag,attrs={},value=null,children=[])=>({tag,attrs,value,children});
function labelLines(label){
  const characters=Array.from(label.replace(/[\r\n\t]/g,' ')),lines=[];
  for(let index=0;index<characters.length&&lines.length<3;index+=15)lines.push(characters.slice(index,index+15).join(''));
  if(characters.length>45)lines[2]=Array.from(lines[2]).slice(0,14).join('')+'…';return lines;
}
function mindmapSvg(artifact,id,selectedNodeId=null){
  const {children,entries}=treeEntries(artifact),locations=new Map();let leaf=0;
  const place=(node,depth)=>{
    const sub=children.get(node.id);sub.forEach(child=>place(child,depth+1));
    const y=sub.length?(locations.get(sub[0].id).y+locations.get(sub.at(-1).id).y)/2:80+(leaf++)*112;
    locations.set(node.id,{x:24+depth*296,y});
  };place(findNode(artifact,artifact.rootId),0);
  const width=288+Math.max(...entries.map(entry=>entry.depth))*296,height=Math.max(160,leaf*112+48);
  const shapes=[svgNode('title',{id:id+'-title'},findNode(artifact,artifact.rootId).label+'：心智圖'),svgNode('desc',{id:id+'-description'},'已加入 '+artifact.nodes.length+' 個節點。完整名稱、說明及父子關係見下方文字清單；待選分支尚未入圖。'),svgNode('rect',{x:0,y:0,width,height,fill:'#ffffff'})];
  entries.forEach(({node})=>{
    if(!node.parentId)return;const a=locations.get(node.parentId),b=locations.get(node.id),mid=(a.x+240+b.x)/2;
    shapes.push(svgNode('path',{d:'M '+(a.x+240)+' '+a.y+' C '+mid+' '+a.y+', '+mid+' '+b.y+', '+b.x+' '+b.y,fill:'none',stroke:'#7a8d9e','stroke-width':2}));
  });
  entries.forEach(({node})=>{
    const {x,y}=locations.get(node.id),lines=labelLines(node.label),selected=node.id===selectedNodeId;
    const children=[svgNode('title',{},node.label+(node.description?'\n'+node.description:'')),svgNode('rect',{x,y:y-42,width:240,height:84,rx:12,fill:selected?'#d7edf9':node.id===artifact.rootId?'#e9e4f6':'#f1f5f9',stroke:selected?'#15618f':'#536a7d','stroke-width':selected?3:1.5})];
    lines.forEach((line,index)=>children.push(svgNode('text',{x:x+120,y:y+(index-(lines.length-1)/2)*20+5,'text-anchor':'middle','font-size':15,fill:'#182b3d'},line)));
    shapes.push(svgNode('g',{'data-node-id':node.id},null,children));
  });
  return svgNode('svg',{xmlns:SVG_NS,viewBox:'0 0 '+width+' '+height,width,height,role:'img','aria-labelledby':id+'-title '+id+'-description','font-family':'system-ui, sans-serif'},null,shapes);
}
function svgDom(document,spec,onSelect){
  const node=document.createElementNS(SVG_NS,spec.tag);Object.entries(spec.attrs).forEach(([name,value])=>attr(node,name,value));
  if(spec.value!==null)node.textContent=spec.value;spec.children.forEach(child=>node.append(svgDom(document,child,onSelect)));
  if(typeof onSelect==='function'&&spec.attrs['data-node-id'])node.addEventListener('click',()=>onSelect(spec.attrs['data-node-id']));return node;
}
function xml(value){return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,'�').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[character]));}
function serializeSvg(node){return '<'+node.tag+Object.entries(node.attrs).map(([name,value])=>' '+name+'="'+xml(value)+'"').join('')+'>'+(node.value===null?'':xml(node.value))+node.children.map(serializeSvg).join('')+'</'+node.tag+'>';}
export function renderMindmap(value,{document=globalThis.document,compact=false,selectedNodeId=null,onSelect=null}={}){
  const root=element(document,'section','artifact-preview mindmap-preview'+(compact?' compact':'')),error=validateMindmap(value);
  if(error){root.append(element(document,'p','artifact-error',error));return root;}
  const artifact=checkedMindmap(value),id='mindmap-preview-'+(++instanceSequence),scroll=element(document,'div','mindmap-svg-scroll');
  attr(scroll,'tabindex','0');attr(scroll,'role','region');attr(scroll,'aria-label','已加入節點心智圖（可捲動）');scroll.append(svgDom(document,mindmapSvg(artifact,id,selectedNodeId),onSelect));root.append(scroll);
  root.append(element(document,'h4','mindmap-list-title','已加入節點（完整文字清單）'));const list=element(document,'ol','mindmap-node-list');
  const byId=new Map(artifact.nodes.map(node=>[node.id,node]));
  treeEntries(artifact).entries.forEach(({node,depth})=>{
    const entry=element(document,'li','mindmap-node-entry');attr(entry,'data-node-id',node.id);attr(entry,'data-depth',depth);
    if(typeof onSelect==='function'){
      const button=element(document,'button','button small mindmap-select-node',node.label);button.type='button';attr(button,'aria-pressed',node.id===selectedNodeId?'true':'false');
      attr(button,'aria-label','選取節點：'+node.label+'（'+node.id+'）');button.addEventListener('click',()=>{if(!button.disabled)onSelect(node.id);});entry.append(button);
    }else entry.append(element(document,'strong','mindmap-node-label',node.label));
    entry.append(element(document,'p','mindmap-node-meta','識別碼：'+node.id+'；'+(node.parentId?'父節點：'+byId.get(node.parentId).label+'（'+node.parentId+'）':'根節點')));
    if(node.description!=='')entry.append(element(document,'p','mindmap-node-description',node.description));list.append(entry);
  });root.append(list);
  const pending=element(document,'section','mindmap-pending-preview');pending.append(element(document,'h4','','待選分支（尚未加入心智圖）'));
  if(!artifact.proposals.length)pending.append(element(document,'p','editor-note','目前沒有待選分支。'));
  else{
    const items=element(document,'ul','mindmap-pending-list');artifact.proposals.forEach(node=>{
      const item=element(document,'li','mindmap-pending-entry');item.append(element(document,'strong','',node.label),element(document,'p','mindmap-node-meta','父節點：'+byId.get(node.parentId).label+'（'+node.parentId+'）；識別碼：'+node.id));
      if(node.description!=='')item.append(element(document,'p','mindmap-node-description',node.description));items.append(item);
    });pending.append(items);
  }root.append(pending);return root;
}
export function renderMindmapEditor(value,{document=globalThis.document,onChange=()=>{},disabled=false,idPrefix='mindmap',uiState={},onPendingChange=()=>{}}={}){
  let state=checkedMindmap(value),selected=state.nodes.some(node=>node.id===uiState.selectedNodeId)?uiState.selectedNodeId:state.rootId,revision=0;
  const history=[],fieldDrafts=uiState.fieldDrafts instanceof Map?uiState.fieldDrafts:new Map(),childDrafts=uiState.childDrafts instanceof Map?uiState.childDrafts:new Map(),checked=new Set();
  uiState.fieldDrafts=fieldDrafts;uiState.childDrafts=childDrafts;uiState.selectedNodeId=selected;
  const renderToken={};uiState.editorToken=renderToken;
  for(const drafts of [fieldDrafts,childDrafts])for(const id of drafts.keys())if(!state.nodes.some(node=>node.id===id))drafts.delete(id);
  const prefix=String(idPrefix).replace(/[^a-zA-Z0-9_-]/g,'_')+'-'+(++instanceSequence),root=element(document,'div','artifact-editor artifact-mindmap-editor');
  const error=element(document,'p','artifact-error');error.id=prefix+'-error';attr(error,'role','status');attr(error,'aria-live','polite');
  root.append(element(document,'p','editor-note','AI 待選分支不會自動入圖。欄位修改請先套用至草稿；新增、移動、合併與勾選加入也只修改草稿，仍須使用外層按鈕另存完整版本。'));
  const workspace=element(document,'div','mindmap-editor-workspace'),preview=element(document,'div','artifact-live-preview');const pendingStatus=element(document,'p','editor-note mindmap-pending-status');root.append(error,pendingStatus,workspace,preview);
  let draw,lastPending=null,undoControl=null,mergeControl=null,mergeDestination=null,deleteControl=null;
  const pendingNames=()=>{
    const fields=[],children=[];
    state.nodes.forEach(node=>{const draft=fieldDrafts.get(node.id),child=childDrafts.get(node.id);if(draft&&(draft.label!==node.label||draft.description!==node.description))fields.push(node.label);if(child&&(child.label!==''||child.description!==''))children.push(node.label);});
    return {fields,children};
  };
  const hasPending=()=>{const pending=pendingNames();return pending.fields.length>0||pending.children.length>0;};
  const notifyPending=()=>{
    if(uiState.editorToken!==renderToken)return;
    const pending=pendingNames(),exists=pending.fields.length>0||pending.children.length>0;
    pendingStatus.textContent=(pending.fields.length?'尚未套用節點欄位：'+pending.fields.join('、')+'。':'')+(pending.children.length?'尚未加入的自填分支：'+pending.children.join('、')+'。':'');
    if(undoControl)undoControl.disabled=disabled||!history.length||exists;
    if(deleteControl)deleteControl.disabled=disabled||exists||selected===state.rootId||[...state.nodes,...state.proposals].some(node=>node.parentId===selected);
    if(mergeControl)mergeControl.disabled=disabled||selected===state.rootId||!mergeDestination?.value||exists;
    if(exists!==lastPending){lastPending=exists;onPendingChange(exists);}
  };
  const message=value=>{error.textContent=value;};
  const commit=(operation,after=()=>{})=>{
    if(disabled||uiState.editorToken!==renderToken)return false;let next;
    try{next=operation();mindmapItems(next);}catch(failure){message(failure.message);return false;}
    if(JSON.stringify(next)===JSON.stringify(state)){message('沒有內容變更，尚未建立或保存任何版本。');return false;}
    history.push({artifact:state,selected});if(history.length>20)history.shift();state=next;revision++;after();
    if(!state.nodes.some(node=>node.id===selected))selected=state.rootId;uiState.selectedNodeId=selected;
    for(const id of checked)if(!state.proposals.some(node=>node.id===id))checked.delete(id);
    draw();message('草稿已更新，尚未另存版本。');
    try{onChange(checkedMindmap(state));}catch(failure){message('草稿已更新，但外層接收失敗；尚未保存版本。'+(failure?.message?' '+failure.message:''));}return true;
  };
  draw=()=>{
    workspace.replaceChildren();const current=findNode(state,selected),drawRevision=revision;
    const alive=()=>!disabled&&drawRevision===revision&&uiState.editorToken===renderToken;
    const button=(label,handler,blocked=false)=>{
      const node=element(document,'button','button small',label);node.type='button';node.disabled=disabled||blocked;
      node.addEventListener('click',()=>{if(!node.disabled&&alive())handler();});return node;
    };
    const field=(labelText,key,value,rows=2)=>{
      const wrap=element(document,'div','field'),label=element(document,'label','field-label',labelText),input=element(document,'textarea');
      input.id=prefix+'-'+key;input.rows=rows;input.value=value;input.disabled=disabled;attr(label,'for',input.id);attr(input,'aria-describedby',error.id);wrap.append(label,input);return {wrap,input};
    };
    const choose=(labelText,key,options,value)=>{
      const wrap=element(document,'div','field'),label=element(document,'label','field-label',labelText),select=element(document,'select');select.id=prefix+'-'+key;select.disabled=disabled;attr(label,'for',select.id);attr(select,'aria-describedby',error.id);
      options.forEach(option=>{const item=element(document,'option','',option.label);item.value=option.id;item.selected=value===option.id;select.append(item);});select.value=value;wrap.append(label,select);return {wrap,input:select};
    };
    const select=id=>{if(!alive()||!state.nodes.some(node=>node.id===id))return;selected=id;uiState.selectedNodeId=selected;revision++;draw();message('已選取節點；沒有呼叫 AI 或修改作品。');};
    const selector=choose('選取要編輯的節點','selection',state.nodes.map(node=>({id:node.id,label:node.label+'（'+node.id+'）'})),selected);
    selector.input.addEventListener('change',()=>{if(!selector.input.disabled)select(selector.input.value);});workspace.append(selector.wrap);
    workspace.append(element(document,'h4','','編輯節點：'+current.label));
    const draft=fieldDrafts.get(selected)||{label:current.label,description:current.description};fieldDrafts.set(selected,draft);
    const name=field('節點名稱','label',draft.label),description=field('節點說明','description',draft.description,4);
    name.input.addEventListener('input',()=>{if(alive()){draft.label=name.input.value;notifyPending();message('節點欄位尚未套用至草稿。');}});
    description.input.addEventListener('input',()=>{if(alive()){draft.description=description.input.value;notifyPending();message('節點欄位尚未套用至草稿。');}});
    workspace.append(name.wrap,description.wrap,button('套用節點修改至草稿',()=>commit(()=>updateMindmapNode(state,selected,draft),()=>fieldDrafts.delete(selected))),button('放棄此節點欄位修改',()=>{fieldDrafts.delete(selected);revision++;draw();message('已還原此節點欄位，草稿與版本沒有改變。');}));
    const childDraft=childDrafts.get(selected)||{label:'',description:''};childDrafts.set(selected,childDraft);
    const childName=field('自填子節點名稱','child-label',childDraft.label),childDescription=field('自填子節點說明','child-description',childDraft.description,3);
    childName.input.addEventListener('input',()=>{if(alive()){childDraft.label=childName.input.value;notifyPending();}});childDescription.input.addEventListener('input',()=>{if(alive()){childDraft.description=childDescription.input.value;notifyPending();}});
    workspace.append(element(document,'h4','','自行延伸分支'),childName.wrap,childDescription.wrap,button('將自填子節點加入草稿',()=>commit(()=>addMindmapChild(state,selected,childDraft.label,childDraft.description),()=>childDrafts.delete(selected)),state.nodes.length>=80),button('放棄自填子節點',()=>{childDrafts.delete(selected);revision++;draw();message('已清除自填子節點欄位，草稿與版本沒有改變。');}));
    const pending=element(document,'fieldset','mindmap-proposal-picker');pending.disabled=disabled;pending.append(element(document,'legend','','此節點的待選分支（尚未入圖）'));
    const proposals=state.proposals.filter(node=>node.parentId===selected),accept=button('將勾選分支加入草稿',()=>commit(()=>acceptMindmapProposals(state,proposals.filter(node=>checked.has(node.id)).map(node=>node.id))),!proposals.some(node=>checked.has(node.id)));
    proposals.forEach(proposal=>{
      const row=element(document,'div','mindmap-proposal-option'),input=element(document,'input'),label=element(document,'label','',proposal.label);input.type='checkbox';input.id=prefix+'-proposal-'+proposal.id;input.checked=checked.has(proposal.id);input.disabled=disabled;attr(label,'for',input.id);
      input.addEventListener('change',()=>{if(!alive()||input.disabled)return;if(input.checked)checked.add(proposal.id);else checked.delete(proposal.id);accept.disabled=disabled||!proposals.some(node=>checked.has(node.id));});row.append(input,label);
      if(proposal.description!=='')row.append(element(document,'p','mindmap-node-description',proposal.description));pending.append(row);
    });if(!proposals.length)pending.append(element(document,'p','editor-note','此節點沒有待選分支。可先自填，或使用對談區向 AI 提出子分支，再自行勾選。'));pending.append(accept);workspace.append(pending);
    const excluded=descendants(state,selected),destinations=state.nodes.filter(node=>!excluded.has(node.id)).map(node=>({id:node.id,label:node.label+'（'+node.id+'）'}));
    const move=choose('移動到父節點','move',destinations,current.parentId),merge=choose('明確選擇合併目的節點','merge',[{id:'',label:'請先選擇目的節點'},...destinations],'');
    move.input.disabled=disabled||selected===state.rootId;merge.input.disabled=disabled||selected===state.rootId;
    const moveButton=button('移動節點至草稿',()=>commit(()=>moveMindmapNode(state,selected,move.input.value)),selected===state.rootId),mergeButton=button('合併節點至草稿',()=>{if(hasPending()){message('請先套用或放棄尚未處理的欄位，再合併節點。');return;}commit(()=>mergeMindmapNodes(state,selected,merge.input.value),()=>{fieldDrafts.delete(selected);fieldDrafts.delete(merge.input.value);selected=merge.input.value;});},true);
    mergeControl=mergeButton;mergeDestination=merge.input;
    merge.input.addEventListener('change',()=>{if(alive())notifyPending();});
    workspace.append(element(document,'h4','','整理分支（不必現在收斂）'),move.wrap,moveButton,merge.wrap,element(document,'p','editor-note','合併會保留來源名稱與說明，附加到目的節點說明，並轉移全部子節點與待選分支。超過容量時整筆拒絕，不截斷內容。'),mergeButton);
    deleteControl=button('移除空末端節點',()=>{if(hasPending())return;const parentId=current.parentId;commit(()=>deleteMindmapLeaf(state,selected),()=>{fieldDrafts.delete(selected);childDrafts.delete(selected);selected=parentId;});},selected===state.rootId||[...state.nodes,...state.proposals].some(node=>node.parentId===selected));workspace.append(deleteControl);
    undoControl=button('復原上一步草稿操作',()=>{
      if(!history.length||hasPending())return;const previous=history.pop();state=previous.artifact;selected=previous.selected;uiState.selectedNodeId=selected;fieldDrafts.clear();childDrafts.clear();checked.clear();revision++;draw();message('已復原草稿，尚未保存版本。');
      try{onChange(checkedMindmap(state));}catch(failure){message('草稿已復原，但外層接收失敗；尚未保存版本。');}
    },!history.length);workspace.append(undoControl);
    preview.replaceChildren(renderMindmap(state,{document,selectedNodeId:selected,onSelect:disabled?null:select}));notifyPending();
  };draw();return root;
}
export function exportMindmap(value,format){
  const artifact=checkedMindmap(value);fail(['svg','json','txt'].includes(format),'心智圖只支援 SVG、JSON 或 TXT 匯出。');
  if(format==='json')return {filename:'mindmap.json',mime:'application/json;charset=utf-8',text:JSON.stringify(artifact,null,2)+'\n'};
  if(format==='txt')return {filename:'mindmap.txt',mime:'text/plain;charset=utf-8',text:mindmapItems(artifact)[0].content+'\n'};
  return {filename:'mindmap.svg',mime:'image/svg+xml;charset=utf-8',text:'<?xml version="1.0" encoding="UTF-8"?>\n'+serializeSvg(mindmapSvg(artifact,'mindmap-export'))+'\n'};
}
