/** Native editable geometric vectors. No SVG input, markup execution, network or storage.
 * Geometry: rect/ellipse x,y are the upper-left of their positive width/height box;
 * line starts at x,y and ends at x+width,y+height (signed deltas); text x,y is
 * its first baseline. Polygon/polyline points are local offsets translated by x,y.
 * Document width/height defines the clipping viewport, not the shapes' bounds.
 * Shape order is back-to-front. Everything outside the viewport remains in JSON.
 */
const SVG_NS='http://www.w3.org/2000/svg';
const TYPES=['rect','ellipse','line','polygon','polyline','text'];
const TYPE_NAMES={rect:'矩形',ellipse:'橢圓',line:'線段',polygon:'多邊形',polyline:'折線',text:'文字'};
const SHAPE_KEYS=['id','type','label','x','y','width','height','fill','stroke','strokeWidth','opacity','text','fontSize','points'];
const DECIMAL=/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$(?![\s\S])/;
const bytes=value=>new TextEncoder().encode(value).length;
const fail=(condition,message)=>{if(!condition)throw new Error(message);};
let idSequence=0,instanceSequence=0;
function validUnicode(value){
  for(let i=0;i<value.length;i++){
    const code=value.charCodeAt(i);
    if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))return false;}
    else if(code>=0xdc00&&code<=0xdfff)return false;
  }return true;
}
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
  fail(!/\bsk-[a-zA-Z0-9_-]{16,}\b/.test(value),'請勿在對話或作品欄位貼入 API Key；請只使用 API 設定中的密碼欄。');return value;
}
function stableId(value){
  fail(typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$(?![\s\S])/.test(value),'圖形識別碼必須是最多64字元的穩定英數識別碼，可包含 - 或 _。');return text(value,64,'圖形識別碼',false);
}
function number(value,min,max,name,integer=false){
  fail(typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max&&(!integer||Number.isInteger(value)),name+'必須是範圍 '+min+' 至 '+max+' 的有限'+(integer?'整數':'數字')+'。');
  fail(integer||Math.round(value*1000)/1000===value,name+'最多支援3位小數；不會自動四捨五入。');return value===0?0:value;
}
function color(value,name){fail(typeof value==='string'&&/^(?:#[a-fA-F0-9]{6}|none)$(?![\s\S])/.test(value),name+'只能是六位十六進位色碼或 none。');return value;}
// Shared PHP/JS canonical encoder: native geometry has at most three decimals.
// No exponential notation or negative zero; preserve exact supported numbers.
// Strings follow unescaped Unicode/slashes, except PHP's U+2028/U+2029 escapes.
function canonicalJson(value){
  if(typeof value==='number')return value===0?'0':value.toFixed(3).replace(/\.?0+$/,'');
  if(typeof value==='string')return JSON.stringify(value).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  if(Array.isArray(value))return '['+value.map(canonicalJson).join(',')+']';
  return '{'+Object.entries(value).map(([key,item])=>JSON.stringify(key)+':'+canonicalJson(item)).join(',')+'}';
}
function checkedVector(value){
  object(value,['kind','title','width','height','background','shapes'],'向量作品');fail(value.kind==='vector','向量作品類型欄位不正確。');
  const title=text(value.title,600,'作品標題'),width=number(value.width,1,4096,'畫布寬度',true),height=number(value.height,1,4096,'畫布高度',true),background=color(value.background,'背景');
  list(value.shapes,1,100,'圖形');const ids=new Set();
  const shapes=value.shapes.map(shape=>{
    object(shape,SHAPE_KEYS,'圖形');const id=stableId(shape.id);fail(!ids.has(id),'圖形識別碼不可重複。');ids.add(id);
    fail(TYPES.includes(shape.type),'圖形類型只支援 rect、ellipse、line、polygon、polyline 或 text。');
    const type=shape.type,label=text(shape.label,120,'圖形名稱'),x=number(shape.x,-4096,8192,'X 座標'),y=number(shape.y,-4096,8192,'Y 座標');
    const w=number(shape.width,-8192,8192,'圖形寬度'),h=number(shape.height,-8192,8192,'圖形高度');
    if(type==='rect'||type==='ellipse')fail(w>0&&h>0,'矩形及橢圓寬高必須大於零。');
    else if(type!=='line')fail(w===0&&h===0,'文字、多邊形與折線的 width、height 必須為零。');
    const fill=color(shape.fill,'填色'),stroke=color(shape.stroke,'外框色'),strokeWidth=number(shape.strokeWidth,0,100,'外框寬度'),opacity=number(shape.opacity,0,1,'不透明度');
    const content=text(shape.text,4000,'圖形文字',type!=='text');
    if(type!=='text')fail(content==='','非文字圖形的 text 必須為空字串。');
    const fontSize=type==='text'?number(shape.fontSize,1,512,'文字大小'):number(shape.fontSize,0,0,'非文字圖形的 fontSize');
    list(shape.points,type==='polygon'?3:type==='polyline'?2:0,type==='polygon'||type==='polyline'?80:0,'頂點');
    const points=shape.points.map(point=>{object(point,['x','y'],'頂點');return {x:number(point.x,-4096,8192,'頂點 X'),y:number(point.y,-4096,8192,'頂點 Y')};});
    return {id,type,label,x,y,width:w,height:h,fill,stroke,strokeWidth,opacity,text:content,fontSize,points};
  });
  const out={kind:'vector',title,width,height,background,shapes};fail(bytes(canonicalJson(out))<=60000,'完整向量作品超過60000個 UTF8 位元組，未保存且未截斷內容。');return out;
}
export function defaultVectorShape(type='rect',id='shape_1'){
  fail(TYPES.includes(type),'不支援的圖形類型。');
  return {id,type,label:TYPE_NAMES[type],x:40,y:40,width:['rect','ellipse','line'].includes(type)?160:0,height:type==='line'?80:['rect','ellipse'].includes(type)?100:0,fill:['line','polyline'].includes(type)?'none':'#dbece3',stroke:'#245c91',strokeWidth:2,opacity:1,text:type==='text'?'文字':'',fontSize:type==='text'?28:0,points:type==='polygon'?[{x:0,y:100},{x:80,y:0},{x:160,y:100}]:type==='polyline'?[{x:0,y:80},{x:80,y:0},{x:160,y:80}]:[]};
}
export function defaultVector(){return {kind:'vector',title:'向量作品',width:800,height:600,background:'#ffffff',shapes:[defaultVectorShape()]};}
export function validateVector(value){try{checkedVector(value);return '';}catch(error){return error.message;}}
export function cloneVector(value){return checkedVector(value);}
export function vectorCompactJson(value){return canonicalJson(checkedVector(value));}
export function vectorItems(value){return [{id:'document',label:'向量圖形來源',content:canonicalJson(checkedVector(value))}];}
function mutate(value,operation){const next=checkedVector(value);operation(next);return checkedVector(next);}
function findIndex(value,id){const index=value.shapes.findIndex(shape=>shape.id===id);fail(index>=0,'找不到指定圖形。');return index;}
function freshId(value){let id;do{id='shape_'+(globalThis.crypto?.randomUUID?.()||'local_'+(++idSequence));}while(value.shapes.some(shape=>shape.id===id));return id;}
export function updateVectorDocument(value,fields){object(fields,['title','width','height','background'],'畫布修改');return mutate(value,next=>Object.assign(next,fields));}
export function addVectorShape(value,type='rect'){return mutate(value,next=>next.shapes.push(defaultVectorShape(type,freshId(next))));}
export function updateVectorShape(value,id,fields){
  object(fields,SHAPE_KEYS.filter(key=>key!=='id'&&key!=='type'),'圖形修改');return mutate(value,next=>Object.assign(next.shapes[findIndex(next,id)],fields));
}
export function removeVectorShape(value,id){return mutate(value,next=>{fail(next.shapes.length>1,'作品至少須保留一個圖形。');next.shapes.splice(findIndex(next,id),1);});}
export function reorderVectorShape(value,id,index){return mutate(value,next=>{number(index,0,next.shapes.length-1,'圖層位置',true);const from=findIndex(next,id);next.shapes.splice(index,0,next.shapes.splice(from,1)[0]);});}
export function duplicateVectorShape(value,id){return mutate(value,next=>{const index=findIndex(next,id),shape=next.shapes[index];next.shapes.splice(index+1,0,{...shape,id:freshId(next),points:shape.points.map(point=>({...point}))});});}
function element(document,tag,className='',value=null){const node=document.createElement(tag);if(className)node.className=className;if(value!==null)node.textContent=value;return node;}
function attr(node,name,value){node.setAttribute(name,String(value));return node;}
const svgNode=(tag,attrs={},value=null,children=[])=>({tag,attrs,value,children});
function shapeDescription(shape,index){
  return (index+1)+'：'+(shape.label||TYPE_NAMES[shape.type])+'（'+shape.id+'／'+TYPE_NAMES[shape.type]+'）\n位置 '+shape.x+', '+shape.y+'；寬高／線段位移 '+shape.width+', '+shape.height+'；填色 '+shape.fill+'；外框 '+shape.stroke+'／'+shape.strokeWidth+'；不透明度 '+shape.opacity+(shape.type==='text'?'\n文字大小 '+shape.fontSize+'；文字：\n'+shape.text:'')+(shape.points.length?'\n局部頂點：'+shape.points.map(point=>point.x+','+point.y).join(' ; '):'');
}
function vectorSvg(artifact,id){
  const children=[svgNode('title',{id:id+'-title'},artifact.title||'向量作品'),svgNode('desc',{id:id+'-description'},'由後至前的完整圖形清單：\n'+artifact.shapes.map(shapeDescription).join('\n\n'))];
  if(artifact.background!=='none')children.push(svgNode('rect',{x:0,y:0,width:artifact.width,height:artifact.height,fill:artifact.background,'data-background':'true'}));
  artifact.shapes.forEach(shape=>{
    const common={fill:shape.fill,stroke:shape.stroke,'stroke-width':shape.strokeWidth,opacity:shape.opacity};let primitive;
    if(shape.type==='rect')primitive=svgNode('rect',{...common,x:shape.x,y:shape.y,width:shape.width,height:shape.height});
    if(shape.type==='ellipse')primitive=svgNode('ellipse',{...common,cx:shape.x+shape.width/2,cy:shape.y+shape.height/2,rx:shape.width/2,ry:shape.height/2});
    if(shape.type==='line')primitive=svgNode('line',{...common,x1:shape.x,y1:shape.y,x2:shape.x+shape.width,y2:shape.y+shape.height});
    if(shape.type==='polygon'||shape.type==='polyline')primitive=svgNode(shape.type,{...common,points:shape.points.map(point=>point.x+','+point.y).join(' '),transform:'translate('+shape.x+' '+shape.y+')'});
    if(shape.type==='text')primitive=svgNode('text',{...common,x:shape.x,y:shape.y,'font-size':shape.fontSize,'font-family':'sans-serif','xml:space':'preserve'},null,shape.text.split(/\r\n|\r|\n/).map((line,index)=>svgNode('tspan',{x:shape.x,y:shape.y+index*shape.fontSize*1.2},line)));
    children.push(svgNode('g',{'data-shape-id':shape.id},null,[svgNode('title',{},shape.label||TYPE_NAMES[shape.type]),primitive]));
  });
  return svgNode('svg',{xmlns:SVG_NS,width:artifact.width,height:artifact.height,viewBox:'0 0 '+artifact.width+' '+artifact.height,role:'img','aria-labelledby':id+'-title '+id+'-description',overflow:'hidden'},null,children);
}
function svgDom(document,spec,onSelect){
  const node=document.createElementNS(SVG_NS,spec.tag);Object.entries(spec.attrs).forEach(([name,value])=>attr(node,name,value));
  if(spec.value!==null)node.textContent=spec.value;spec.children.forEach(child=>node.append(svgDom(document,child,onSelect)));
  if(typeof onSelect==='function'&&spec.attrs['data-shape-id'])node.addEventListener('click',()=>onSelect(spec.attrs['data-shape-id']));return node;
}
function xml(value){return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,'�').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[character])).replace(/\r/g,'&#13;');}
function serializeSvg(node){return '<'+node.tag+Object.entries(node.attrs).map(([name,value])=>' '+name+'="'+xml(value)+'"').join('')+'>'+(node.value===null?'':xml(node.value))+node.children.map(serializeSvg).join('')+'</'+node.tag+'>';}
export function renderVector(value,{document=globalThis.document,compact=false,selectedShapeId=null,onSelect=null}={}){
  const root=element(document,'section','artifact-preview vector-preview'+(compact?' compact':'')),error=validateVector(value);
  if(error){root.append(element(document,'p','artifact-error',error));return root;}
  const artifact=checkedVector(value),id='vector-preview-'+(++instanceSequence),scroll=element(document,'div','vector-svg-scroll');
  attr(scroll,'tabindex','0');attr(scroll,'role','region');attr(scroll,'aria-label','向量畫布（可捲動；超出畫布的圖形見完整清單）');attr(scroll,'style','max-width:100%;max-height:34rem;overflow:auto;');
  const svg=svgDom(document,vectorSvg(artifact,id),onSelect);attr(svg,'style','display:block;max-width:none;width:'+artifact.width+'px;height:'+artifact.height+'px;');scroll.append(svg);root.append(scroll);
  root.append(element(document,'h4','','圖形與圖層（完整清單，由後至前）'));const entries=element(document,'ol','vector-shape-list');
  artifact.shapes.forEach((shape,index)=>{
    const entry=element(document,'li','vector-shape-entry');attr(entry,'data-shape-id',shape.id);
    if(typeof onSelect==='function'){
      const button=element(document,'button','button small vector-select-shape',shape.label||TYPE_NAMES[shape.type]);button.type='button';attr(button,'aria-pressed',shape.id===selectedShapeId?'true':'false');attr(button,'aria-label','選取圖形：'+(shape.label||TYPE_NAMES[shape.type])+'（'+shape.id+'）');button.addEventListener('click',()=>{if(!button.disabled)onSelect(shape.id);});entry.append(button);
    }
    const description=element(document,'p','vector-shape-description',shapeDescription(shape,index));attr(description,'style','white-space:pre-wrap;overflow-wrap:anywhere;');entry.append(description);entries.append(entry);
  });root.append(entries);return root;
}
const DOCUMENT_FIELDS=['title','width','height','background'];
const NUMERIC_FIELDS=['x','y','width','height','strokeWidth','opacity','fontSize'];
function documentDraft(value){return {title:value.title,width:String(value.width),height:String(value.height),background:value.background};}
function shapeDraft(shape){
  const draft={label:shape.label,x:String(shape.x),y:String(shape.y),width:String(shape.width),height:String(shape.height),fill:shape.fill,stroke:shape.stroke,strokeWidth:String(shape.strokeWidth),opacity:String(shape.opacity),text:shape.text,fontSize:String(shape.fontSize),points:shape.points.map(point=>point.x+','+point.y).join('\n')};return draft;
}
function decimal(value,name){
  fail(typeof value==='string'&&DECIMAL.test(value),name+'需使用完整十進位數字，不可空白、使用科學記號或附加文字。');
  // Validate raw precision before Number() can round away significant digits.
  const fraction=(value.split('.')[1]||'').replace(/0+$/,'');fail(fraction.length<=3,name+'最多支援3位小數；不會自動四捨五入。');
  const parsed=Number(value);fail(Number.isFinite(parsed),name+'必須是有限數字。');return parsed===0?0:parsed;
}
function parsePoints(value){
  if(value==='')return [];const lines=value.split('\n');fail(lines.length<=80,'頂點最多80個。');
  return lines.map(line=>{const coordinates=line.split(',');fail(coordinates.length===2,'每行頂點須為 x,y，使用局部座標。');return {x:decimal(coordinates[0],'頂點 X'),y:decimal(coordinates[1],'頂點 Y')};});
}
function parseShapeDraft(draft){const fields={...draft};NUMERIC_FIELDS.forEach(key=>fields[key]=decimal(draft[key],key));fields.points=parsePoints(draft.points);return fields;}
export function renderVectorEditor(value,{document=globalThis.document,disabled=false,onChange=()=>{},idPrefix='vector',uiState={},onPendingChange=()=>{}}={}){
  let state=checkedVector(value),selected=state.shapes.some(shape=>shape.id===uiState.selectedShapeId)?uiState.selectedShapeId:state.shapes[0].id,revision=0;
  const fieldDrafts=uiState.fieldDrafts instanceof Map?uiState.fieldDrafts:new Map();uiState.fieldDrafts=fieldDrafts;uiState.selectedShapeId=selected;
  const token={};uiState.editorToken=token;
  const history=uiState.lastArtifact===canonicalJson(state)&&Array.isArray(uiState.undoHistory)?uiState.undoHistory.slice(-20).filter(entry=>entry&&validateVector(entry.artifact)==='').map(entry=>({artifact:checkedVector(entry.artifact),selected:entry.selected})):[];
  const remember=()=>{uiState.lastArtifact=canonicalJson(state);uiState.undoHistory=history.map(entry=>({artifact:checkedVector(entry.artifact),selected:entry.selected}));};remember();
  // Raw drafts are retained even if an external update removed their shape. They
  // block destructive operations until the user explicitly discards them.
  const prefix=String(idPrefix).replace(/[^a-zA-Z0-9_-]/g,'_')+'-'+(++instanceSequence),root=element(document,'div','artifact-editor artifact-vector-editor');
  const error=element(document,'p','artifact-error');error.id=prefix+'-error';attr(error,'role','status');attr(error,'aria-live','polite');
  const workspace=element(document,'div','vector-editor-workspace'),preview=element(document,'div','artifact-live-preview'),pendingStatus=element(document,'p','editor-note vector-pending-status');
  root.append(element(document,'p','editor-note','欄位請明確套用至草稿，再使用外層按鈕另存完整版本。提供矩形、橢圓、線段、多邊形、折線與文字；沒有拖曳、貝茲曲線、自由路徑、SVG 匯入、圖片、外部字型或濾鏡。可匯出可編輯幾何 SVG，但尚未驗證任何外部工具的匯入相容性。'),error,pendingStatus,workspace,preview);
  let draw,lastPending=null,guarded=[];
  const different=(a,b)=>JSON.stringify(a)!==JSON.stringify(b);
  const pendingIds=()=>[...fieldDrafts].filter(([id,draft])=>{const shape=state.shapes.find(item=>item.id===id);return !shape||different(draft,shapeDraft(shape));}).map(([id])=>id);
  const documentPending=()=>!!uiState.documentDraft&&different(uiState.documentDraft,documentDraft(state));
  const hasPending=()=>documentPending()||pendingIds().length>0;
  const notify=()=>{
    if(uiState.editorToken!==token)return;const ids=pendingIds(),exists=documentPending()||ids.length>0;
    pendingStatus.textContent=(documentPending()?'畫布欄位尚未套用。':'')+(ids.length?'圖形欄位尚未套用：'+ids.map(id=>state.shapes.find(shape=>shape.id===id)?.label||id).join('、')+'。':'');
    guarded.forEach(({control,blocked})=>control.disabled=disabled||exists||blocked());if(exists!==lastPending){lastPending=exists;onPendingChange(exists);}
  };
  const message=value=>{error.textContent=value;};
  const emit=()=>{try{onChange(checkedVector(state));}catch(failure){message('草稿已更新，但外層接收失敗；尚未保存版本。'+(failure?.message?' '+failure.message:''));}};
  const commit=(operation,after=()=>{})=>{
    if(disabled||uiState.editorToken!==token)return false;let next;
    try{next=checkedVector(operation());}catch(failure){message(failure.message);return false;}
    if(canonicalJson(next)===canonicalJson(state)){after();revision++;draw();message('沒有內容變更，尚未建立或保存任何版本。');return false;}
    history.push({artifact:checkedVector(state),selected});if(history.length>20)history.shift();state=next;after();revision++;
    if(!state.shapes.some(shape=>shape.id===selected))selected=state.shapes[0].id;uiState.selectedShapeId=selected;remember();draw();message('草稿已更新，尚未另存版本。');emit();return true;
  };
  draw=()=>{
    workspace.replaceChildren();guarded=[];const current=state.shapes[findIndex(state,selected)],drawRevision=revision;
    const alive=()=>!disabled&&drawRevision===revision&&uiState.editorToken===token;
    const button=(label,handler,blocked=false)=>{const node=element(document,'button','button small',label);node.type='button';node.disabled=disabled||blocked;node.addEventListener('click',()=>{if(!node.disabled&&alive())handler();});return node;};
    const guardedButton=(label,handler,blocked=()=>false)=>{const control=button(label,()=>{if(!hasPending())handler();});guarded.push({control,blocked});return control;};
    const field=(labelText,key,value,multiline=false)=>{
      const wrap=element(document,'div','field'),label=element(document,'label','field-label',labelText),input=element(document,multiline?'textarea':'input');
      input.id=prefix+'-'+key;input.value=value;input.disabled=disabled;if(multiline)input.rows=4;else input.type='text';attr(label,'for',input.id);attr(input,'aria-describedby',error.id);wrap.append(label,input);return {wrap,input};
    };
    const choose=(labelText,key,options,value)=>{
      const wrap=element(document,'div','field'),label=element(document,'label','field-label',labelText),input=element(document,'select');input.id=prefix+'-'+key;input.disabled=disabled;attr(label,'for',input.id);attr(input,'aria-describedby',error.id);
      options.forEach(option=>{const child=element(document,'option','',option.label);child.value=option.id;child.selected=option.id===value;input.append(child);});input.value=value;wrap.append(label,input);return {wrap,input};
    };
    const select=id=>{if(!alive()||!state.shapes.some(shape=>shape.id===id))return;selected=id;uiState.selectedShapeId=id;revision++;draw();message('已選取圖形；沒有呼叫 AI 或修改作品。');};
    workspace.append(element(document,'h4','','畫布'));
    const doc=uiState.documentDraft||documentDraft(state),docLabels={title:'作品標題',width:'畫布寬度',height:'畫布高度',background:'畫布背景'};
    DOCUMENT_FIELDS.forEach(key=>{const entry=field(docLabels[key],'document-'+key,doc[key]);entry.input.addEventListener('input',()=>{if(!alive())return;uiState.documentDraft={...(uiState.documentDraft||documentDraft(state)),[key]:entry.input.value};notify();});workspace.append(entry.wrap);});
    workspace.append(button('套用畫布修改至草稿',()=>commit(()=>{const draft=uiState.documentDraft||documentDraft(state);return updateVectorDocument(state,{title:draft.title,width:decimal(draft.width,'畫布寬度'),height:decimal(draft.height,'畫布高度'),background:draft.background});},()=>{delete uiState.documentDraft;})),button('放棄畫布欄位修改',()=>{delete uiState.documentDraft;revision++;draw();message('已還原畫布欄位，草稿與版本沒有改變。');}));
    const selector=choose('選取要編輯的圖形','selection',state.shapes.map(shape=>({id:shape.id,label:(shape.label||TYPE_NAMES[shape.type])+'（'+shape.id+'）'})),selected);selector.input.addEventListener('change',()=>{if(!selector.input.disabled)select(selector.input.value);});workspace.append(selector.wrap,element(document,'h4','','編輯圖形：'+TYPE_NAMES[current.type]));
    workspace.append(element(document,'p','editor-note','矩形／橢圓 X、Y 是外接框左上角；線段 X、Y 是起點，寬、高是可為負的終點位移；文字 X、Y 是首行基線；多邊形／折線的頂點是相對 X、Y 的局部座標。數值最多3位小數，不接受科學記號或自動四捨五入。填色與外框使用 #rrggbb 或 none。'));
    const draft=fieldDrafts.get(selected)||shapeDraft(current),labels={label:'圖形名稱',x:'X 座標',y:'Y 座標',width:current.type==='line'?'線段水平位移':'圖形寬度',height:current.type==='line'?'線段垂直位移':'圖形高度',fill:'填色',stroke:'外框色',strokeWidth:'外框寬度',opacity:'不透明度',text:'圖形文字',fontSize:'文字大小',points:'局部頂點（每行 x,y）'};
    const shown=['label','x','y',...(['rect','ellipse','line'].includes(current.type)?['width','height']:[]),'fill','stroke','strokeWidth','opacity',...(current.type==='text'?['text','fontSize']:[]),...(['polygon','polyline'].includes(current.type)?['points']:[])];
    shown.forEach(key=>{const entry=field(labels[key],'shape-'+key,draft[key],['text','points'].includes(key));entry.input.addEventListener('input',()=>{if(!alive())return;fieldDrafts.set(selected,{...(fieldDrafts.get(selected)||shapeDraft(current)),[key]:entry.input.value});notify();});workspace.append(entry.wrap);});
    workspace.append(button('套用圖形修改至草稿',()=>commit(()=>updateVectorShape(state,selected,parseShapeDraft(fieldDrafts.get(selected)||shapeDraft(current))),()=>fieldDrafts.delete(selected))),button('放棄此圖形欄位修改',()=>{fieldDrafts.delete(selected);revision++;draw();message('已還原圖形欄位，草稿與版本沒有改變。');}));
    const addType=choose('新增圖形類型','add-type',TYPES.map(type=>({id:type,label:TYPE_NAMES[type]})),TYPES.includes(uiState.addType)?uiState.addType:'rect');
    addType.input.addEventListener('change',()=>{if(alive())uiState.addType=addType.input.value;});workspace.append(addType.wrap,guardedButton('新增圖形至草稿',()=>commit(()=>addVectorShape(state,addType.input.value),()=>{selected=state.shapes.at(-1).id;}),()=>state.shapes.length>=100));
    const index=findIndex(state,selected);
    workspace.append(guardedButton('複製圖形至草稿',()=>commit(()=>duplicateVectorShape(state,selected),()=>{selected=state.shapes[index+1].id;}),()=>state.shapes.length>=100),guardedButton('向前移一層',()=>commit(()=>reorderVectorShape(state,selected,index+1)),()=>index===state.shapes.length-1),guardedButton('向後移一層',()=>commit(()=>reorderVectorShape(state,selected,index-1)),()=>index===0),guardedButton('移除圖形',()=>commit(()=>removeVectorShape(state,selected),()=>fieldDrafts.delete(selected)),()=>state.shapes.length===1));
    workspace.append(guardedButton('復原上一步草稿操作',()=>{
      if(!history.length)return;const previous=history.pop();state=checkedVector(previous.artifact);selected=state.shapes.some(shape=>shape.id===previous.selected)?previous.selected:state.shapes[0].id;uiState.selectedShapeId=selected;fieldDrafts.clear();delete uiState.documentDraft;revision++;remember();draw();message('已復原草稿，尚未保存版本。');emit();
    },()=>!history.length));
    if([...fieldDrafts.keys()].some(id=>!state.shapes.some(shape=>shape.id===id)))workspace.append(button('放棄已移除圖形的未套用欄位',()=>{for(const id of fieldDrafts.keys())if(!state.shapes.some(shape=>shape.id===id))fieldDrafts.delete(id);revision++;draw();}));
    preview.replaceChildren(renderVector(state,{document,selectedShapeId:selected,onSelect:disabled?null:select}));notify();
  };draw();return root;
}
export function exportVector(value,format){
  const artifact=checkedVector(value);fail(['svg','json','txt'].includes(format),'向量作品只支援 SVG、JSON 或 TXT 匯出。');
  if(format==='json')return {filename:'vector.json',mime:'application/json;charset=utf-8',text:canonicalJson(artifact)+'\n'};
  if(format==='txt')return {filename:'vector.txt',mime:'text/plain;charset=utf-8',text:vectorItems(artifact)[0].content+'\n'};
  return {filename:'vector.svg',mime:'image/svg+xml;charset=utf-8',text:'<?xml version="1.0" encoding="UTF-8"?>\n'+serializeSvg(vectorSvg(artifact,'vector-export'))+'\n'};
}
