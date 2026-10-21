import {validateImageArtifact,imageArtifactItems,createImagePreview,createImageEditor} from './image.js?v=20261021-version13';
import {defaultWebpage,validateWebpage,webpageItems,renderWebpage,renderWebpageEditor,exportWebpage} from './webpage.js?v=20261021-version13';
import {defaultVector,validateVector,vectorItems,renderVector,renderVectorEditor,exportVector} from './vector.js?v=20261021-version13';
import {defaultMindmap,validateMindmap,mindmapItems,renderMindmap,renderMindmapEditor,exportMindmap} from './mindmap.js?v=20261021-version13';
/** Typed, text-only table/chart documents. No storage, network, or implicit downloads. */
const SVG_NS = 'http://www.w3.org/2000/svg';
const CHART_TYPES = ['flowchart','bar','line','pie'];
const COLORS = ['#245c91','#b34229','#28754b','#774b9a','#947000'];
const SECRET_ERROR = '請勿在對話或作品欄位貼入 API Key；請只使用 API 設定中的密碼欄。';
const DECIMAL = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$(?![\s\S])/;
let idSequence = 0;
let instanceSequence = 0;
const bytes = value => new TextEncoder().encode(value).length;
const trimmed = value => value.trim();
const fail = (condition,message) => { if(!condition)throw new Error(message); };
const secretGuard = value => fail(!/\bsk-[a-zA-Z0-9_-]{16,}\b/.test(value),SECRET_ERROR);
function validUnicode(value) {
  for(let i=0;i<value.length;i++){
    const code=value.charCodeAt(i);
    if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))return false;}
    else if(code>=0xdc00&&code<=0xdfff)return false;
  }
  return true;
}
function object(value,keys,name) {
  fail(value!==null&&typeof value==='object',name+'必須是完整物件。');
  fail(JSON.stringify(Object.keys(value).sort())===JSON.stringify([...keys].sort()),name+'缺少欄位或包含未支援的欄位。');
}
function list(value,min,max,name) {
  fail(Array.isArray(value)&&value.length>=min&&value.length<=max&&Object.keys(value).length===value.length&&Object.keys(value).every((key,index)=>key===String(index)),name+'的數量或清單格式不正確。');
}
function text(value,max,name,empty=true) {
  fail(typeof value==='string'&&validUnicode(value)&&!value.includes('\0'),name+'必須是有效 UTF8 文字。');
  fail(bytes(value)<=max&&(empty||trimmed(value)!==''),name+'空白或超過長度上限。');
  secretGuard(value);return value;
}
function stableId(value,name) {
  fail(typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$(?![\s\S])/.test(value),name+'必須是最多64字元的穩定英數識別碼，可包含 - 或 _。');
  secretGuard(value);return value;
}
function sourceText(value) {
  text(value,12000,'圖表文字來源',false);
  const normalized=value.replace(/\r\n/g,'\n');
  fail(!normalized.includes('\r'),'圖表來源不可包含單獨的 CR 換行字元。');
  return normalized;
}
export function isArtifactType(type) { return type==='table'||type==='chart'||type==='mindmap'||type==='vector'||type==='webpage'||type==='image'; }
export function cloneArtifact(value) { return JSON.parse(JSON.stringify(value)); }
export function defaultArtifact(type) {
  if(type==='image')return null; // A saved private asset is required; never fabricate an image.
  if(type==='mindmap')return defaultMindmap();
  if(type==='vector')return defaultVector();
  if(type==='webpage')return defaultWebpage();
  if(type==='table')return {kind:'table',caption:'',columns:[{id:'column_1',label:'欄位 1'},{id:'column_2',label:'欄位 2'}],rows:[{id:'row_1',cells:['','']}]};
  if(type==='chart')return {kind:'chart',chartType:'flowchart',title:'',xLabel:'',yLabel:'',sourceText:'flowchart TD\nStart["開始"]'};
  throw new Error('此類型不是可保存的結構化作品。');
}
export function parseChartSource(value,chartType) {
  fail(CHART_TYPES.includes(chartType),'圖表類型只支援 flowchart、bar、line 或 pie。');
  if(chartType==='flowchart')return parseFlowchartSource(value);
  const normalized=sourceText(value);
  const lines=(normalized.endsWith('\n')?normalized.slice(0,-1):normalized).split('\n');
  fail(lines.length>=2&&lines.length<=25,'圖表 TSV 必須有一列標頭，以及1至24列資料。');
  const header=lines.shift().split('\t');
  fail(header.length>=2&&header.length<=6,'圖表 TSV 標頭需包含分類名稱與1至5個數列。');
  const names=header.map(cell=>trimmed(text(cell,120,'圖表標頭',false)));
  const categoryLabel=names.shift(),series=[],seenNames=new Set();
  names.forEach((name,index)=>{
    fail(!seenNames.has(name),'圖表數列名稱不可重複。');seenNames.add(name);
    series.push({id:'series_'+(index+1),label:name,values:[]});
  });
  fail(chartType!=='pie'||series.length===1,'圓餅圖只能包含一個數列。');
  const labels=[];let sum=0;
  lines.forEach(line=>{
    const cells=line.split('\t');
    fail(cells.length===header.length,'圖表每列欄位數必須與標頭完全相同。');
    const label=trimmed(text(cells.shift(),120,'圖表分類名稱',false));
    fail(!labels.includes(label),'圖表分類名稱不可重複。');labels.push(label);
    cells.forEach((cell,index)=>{
      fail(DECIMAL.test(cell),'圖表數值需使用完整十進位數字，不可使用公式、科學記號或空白。');
      const [integerPart,fraction='']=cell.replace(/^[+-]/,'').split('.'),integer=integerPart.replace(/^0+/,'');
      const within=integer.length<13||(integer.length===13&&integer<='1000000000000'&&(integer!=='1000000000000'||!/[1-9]/.test(fraction)));
      const number=Number(cell);
      fail(within&&Number.isFinite(number)&&Math.abs(number)<=1e12,'圖表數值必須有限，且絕對值不得超過1兆。');
      fail(chartType!=='pie'||!(cell.startsWith('-')&&/[1-9]/.test(cell)),'圓餅圖數值不可為負數。');
      series[index].values.push(number);sum+=number;
    });
  });
  fail(chartType!=='pie'||sum>0,'圓餅圖數值加總必須大於零。');
  return {labels,series,categoryLabel};
}
function flowchartId(id) {
  fail(!['end','subgraph','click','style','classdef','class','direction','linkstyle','flowchart','graph'].includes(id.toLowerCase()),'流程圖節點識別碼使用了保留字。');return id;
}
function flowchartLabel(value,edge=false) {
  const quoted=value.length>=2&&value.startsWith('"')&&value.endsWith('"');if(quoted)value=value.slice(1,-1);
  text(value,edge?120:240,edge?'流程圖連線標籤':'流程圖節點文字',edge);
  fail(!/[\x00-\x1f\x7f"`\\<>&#|]/.test(value),'流程圖標籤只能使用純文字，不可包含控制字元、引號、反引號、反斜線、HTML 或特殊標記。');
  fail(!/(?:[a-z][a-z0-9+.-]*:\/\/|mailto:|javascript:|data:|www\.)/iu.test(value),'流程圖標籤不可包含網址或可執行連結。');
  fail(quoted||!/[\[\]{}();]/.test(value),'流程圖含括號或分號的標籤必須使用一組外層雙引號，不能混入其他語法。');return value;
}
export function parseFlowchartSource(value) {
  const normalized=sourceText(value);
  fail(!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u2028\u2029\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(normalized),'流程圖來源不可包含控制字元、特殊換行或雙向控制字元。');
  fail(!normalized.includes('%%{'),'流程圖不支援初始化指令或 Mermaid directives。');
  let direction=null;const nodes=[],edges=[],ids=new Set(),edgeKeys=new Set();
  for(const rawLine of normalized.split('\n')){
    let line=rawLine.trim();if(!line||line.startsWith('%%'))continue;
    if(line.endsWith(';'))line=line.slice(0,-1).trim();
    if(direction===null){
      const header=/^(?:flowchart|graph) (TD|TB|LR)$(?![\s\S])/.exec(line);
      fail(!!header,'流程圖第一個有效行必須是 flowchart TD、flowchart LR、graph TD 或 graph LR（也接受 TB）。');
      direction=header[1]==='TB'?'TD':header[1];continue;
    }
    const node=/^([A-Za-z][A-Za-z0-9_]{0,39})[ \t]*([\[{(])([\s\S]*)([\]})])$(?![\s\S])/.exec(line);
    if(node){
      fail(({ '[':']','{':'}','(':')' })[node[2]]===node[4],'流程圖節點括號必須正確配對。');
      const id=flowchartId(node[1]),label=flowchartLabel(node[3]);
      fail(!ids.has(id),'流程圖節點識別碼不可重複宣告。');fail(nodes.length<40,'流程圖最多支援40個節點。');
      ids.add(id);nodes.push({id,label,shape:({'[':'rect','{':'diamond','(':'round'})[node[2]]});continue;
    }
    const edge=/^([A-Za-z][A-Za-z0-9_]{0,39})[ \t]*-->[ \t]*(?:\|([^|]*)\|[ \t]*)?([A-Za-z][A-Za-z0-9_]{0,39})$(?![\s\S])/.exec(line);
    if(edge){
      const from=flowchartId(edge[1]),to=flowchartId(edge[3]),label=flowchartLabel(edge[2]??'',true),key=JSON.stringify([from,to,label]);
      fail(!edgeKeys.has(key),'流程圖不可重複相同起點、終點與標籤的連線。');fail(edges.length<80,'流程圖最多支援80條連線。');
      edgeKeys.add(key);edges.push({from,to,label});continue;
    }
    throw new Error('流程圖包含不支援的語法；請逐行宣告節點或使用 A --> B、A -->|標籤| B。');
  }
  fail(direction!==null&&nodes.length>=1,'流程圖必須包含方向標頭及至少1個明確宣告的節點。');
  edges.forEach(edge=>fail(ids.has(edge.from)&&ids.has(edge.to),'流程圖連線的起點與終點都必須明確宣告為節點。'));
  return {direction,nodes,edges};
}
function checkedArtifact(value,type) {
  if(type==='image'){const error=validateImageArtifact(value);if(error)throw new Error(error);return cloneArtifact(value);}
  if(type==='mindmap'){const error=validateMindmap(value);if(error)throw new Error(error);return cloneArtifact(value);}
  if(type==='vector'){const error=validateVector(value);if(error)throw new Error(error);return cloneArtifact(value);}
  if(type==='webpage'){const error=validateWebpage(value);if(error)throw new Error(error);return cloneArtifact(value);}
  fail(isArtifactType(type),'此類型不是可保存的結構化作品。');
  let out;
  if(type==='table'){
    object(value,['kind','caption','columns','rows'],'表格');
    fail(value.kind==='table','表格類型欄位不正確。');
    const caption=text(value.caption,600,'表格說明');
    list(value.columns,1,12,'表格欄位');list(value.rows,1,100,'表格資料列');
    const columnIds=new Set(),rowIds=new Set();
    const columns=value.columns.map(column=>{
      object(column,['id','label'],'表格欄位');const id=stableId(column.id,'欄位識別碼');
      fail(!columnIds.has(id),'表格欄位識別碼不可重複。');columnIds.add(id);
      return {id,label:text(column.label,120,'欄位名稱',false)};
    });
    const rows=value.rows.map(row=>{
      object(row,['id','cells'],'表格資料列');const id=stableId(row.id,'資料列識別碼');
      fail(!rowIds.has(id),'表格資料列識別碼不可重複。');rowIds.add(id);
      list(row.cells,columns.length,columns.length,'資料列儲存格');
      return {id,cells:row.cells.map(cell=>text(cell,2000,'儲存格'))};
    });
    out={kind:'table',caption,columns,rows};
  }else{
    object(value,['kind','chartType','title','xLabel','yLabel','sourceText'],'圖表');
    fail(value.kind==='chart','圖表類型欄位不正確。');
    const normalized=sourceText(value.sourceText);parseChartSource(normalized,value.chartType);
    out={kind:'chart',chartType:value.chartType,title:text(value.title,600,'圖表標題'),xLabel:text(value.xLabel,120,'橫軸標籤'),yLabel:text(value.yLabel,120,'縱軸標籤'),sourceText:normalized};
  }
  // PHP JSON_UNESCAPED_UNICODE still escapes these two line separators.
  const encoded=JSON.stringify(out).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  fail(bytes(encoded)<=60000,'完整作品超過60000個 UTF8 位元組，未保存且未截斷內容。');
  return out;
}
export function validateArtifact(value,type=value?.kind) {
  try{checkedArtifact(value,type);return '';}catch(error){return error.message;}
}
function delimitedField(value,delimiter,spreadsheet=false) {
  let result=String(value);
  // Quote formulas before CSV/TSV quoting; original JSON and editor text are unchanged.
  if(spreadsheet&&(/^[=+\-@\t\r\n]/.test(result)||/^[ \f\v]+[=+\-@]/.test(result)))result="'"+result;
  return result.includes(delimiter)||/[\r\n"]/.test(result)?'"'+result.replace(/"/g,'""')+'"':result;
}
export function artifactItems(value) {
  if(value?.kind==='image')return imageArtifactItems(value);
  if(value?.kind==='mindmap')return mindmapItems(value);
  if(value?.kind==='vector')return vectorItems(value);
  if(value?.kind==='webpage')return webpageItems(value);
  const artifact=checkedArtifact(value,value?.kind);let content,label;
  if(artifact.kind==='table'){
    const lines=artifact.caption?[artifact.caption]:[];
    lines.push(artifact.columns.map(column=>delimitedField(column.label,'\t')).join('\t'));
    artifact.rows.forEach(row=>lines.push(row.cells.map(cell=>delimitedField(cell,'\t')).join('\t')));
    content=lines.join('\n');label='表格內容';
  }else{
    content=(artifact.title?artifact.title+'\n':'')+'圖表類型：'+artifact.chartType+'\n橫軸：'+artifact.xLabel+'\n縱軸：'+artifact.yLabel+'\n'+artifact.sourceText;label='圖表來源';
  }
  fail(bytes(content)<=60000,'完整作品文字投影超過保存上限，未截斷內容。');
  return [{id:'document',label,content}];
}
function element(document,tag,className='',value=null) {
  const node=document.createElement(tag);if(className)node.className=className;if(value!==null)node.textContent=value;return node;
}
function attr(node,name,value) { node.setAttribute(name,String(value));return node; }
function dataTable(document,caption,headers,rows) {
  const wrap=element(document,'div','artifact-table-scroll'),table=element(document,'table','artifact-data-table');
  attr(wrap,'tabindex','0');attr(wrap,'role','region');attr(wrap,'aria-label',caption+'（可水平捲動）');
  table.append(element(document,'caption','',caption));
  const head=element(document,'thead'),header=element(document,'tr');
  headers.forEach(label=>header.append(attr(element(document,'th','',label),'scope','col')));head.append(header);table.append(head);
  const body=element(document,'tbody');rows.forEach(cells=>{
    const row=element(document,'tr');cells.forEach(cell=>row.append(element(document,'td','',String(cell))));body.append(row);
  });table.append(body);wrap.append(table);return wrap;
}
const svgNode = (tag,attrs={},value=null,children=[]) => ({tag,attrs,value,children});
const position = value => String(Number(value.toFixed(6)));
const shortLabel = (value,limit=15) => Array.from(value).length>limit?Array.from(value).slice(0,limit-1).join('')+'…':value;
const formattedNumber = value => Object.is(value,-0)?'0':String(value);
const tickLabel = value => value!==0&&(Math.abs(value)>=1e6||Math.abs(value)<1e-4)?value.toExponential(2):formattedNumber(Number(value.toPrecision(6)));
function chartSvg(artifact,parsed,id) {
  const {labels,series,categoryLabel}=parsed;
  const title=artifact.title||({bar:'長條圖',line:'折線圖',pie:'圓餅圖'}[artifact.chartType]);
  const description=categoryLabel+'，'+labels.length+' 個分類；數列：'+series.map(item=>item.label).join('、')+'。完整數值見文字資料表。';
  const height=artifact.chartType==='pie'?Math.max(430,100+labels.length*23):490;
  const children=[svgNode('title',{id:id+'-title'},title),svgNode('desc',{id:id+'-description'},description),svgNode('rect',{x:0,y:0,width:800,height,fill:'#ffffff'}),svgNode('text',{x:400,y:30,'text-anchor':'middle','font-size':20,fill:'#182b3d'},shortLabel(title,28))];
  const add=(...nodes)=>children.push(...nodes);
  if(artifact.chartType==='pie'){
    const values=series[0].values,total=values.reduce((sum,value)=>sum+value,0),cx=235,cy=235,r=145;
    let angle=-Math.PI/2;
    values.forEach((value,index)=>{
      const delta=value/total*Math.PI*2,color=COLORS[index%COLORS.length];
      if(value>0){
        let slice;
        if(value===total)slice=svgNode('circle',{cx,cy,r,fill:color,stroke:'#ffffff','stroke-width':2});
        else{
          const end=angle+delta,x1=cx+r*Math.cos(angle),y1=cy+r*Math.sin(angle),x2=cx+r*Math.cos(end),y2=cy+r*Math.sin(end);
          const d='M '+cx+' '+cy+' L '+position(x1)+' '+position(y1)+' A '+r+' '+r+' 0 '+(delta>Math.PI?1:0)+' 1 '+position(x2)+' '+position(y2)+' Z';
          slice=svgNode('path',{d,fill:color,stroke:'#ffffff','stroke-width':2});
        }
        slice.children.push(svgNode('title',{},labels[index]+'：'+formattedNumber(value)+'（'+(value/total*100).toFixed(1)+'%）'));add(slice);
      }
      const y=85+index*23;
      add(svgNode('rect',{x:440,y:y-11,width:12,height:12,fill:color}),svgNode('text',{x:460,y,'font-size':12,fill:'#182b3d'},shortLabel(labels[index])+'：'+formattedNumber(value)+'（'+(value/total*100).toFixed(1)+'%）'));
      angle+=delta;
    });
    add(svgNode('text',{x:235,y:415,'text-anchor':'middle','font-size':14,fill:'#182b3d'},shortLabel(series[0].label)));
  }else{
    const left=90,right=760,top=80,bottom=350,width=right-left,height=bottom-top;
    const all=series.flatMap(item=>item.values);let low=Math.min(0,...all),high=Math.max(0,...all);
    if(low===high)high=low+1;
    const scale=value=>bottom-(value-low)/(high-low)*height,zero=scale(0),step=width/labels.length;
    for(let tick=0;tick<=4;tick++){
      const value=low+(high-low)*tick/4,y=scale(value);
      add(svgNode('line',{x1:left,y1:position(y),x2:right,y2:position(y),stroke:'#d9e0e7','stroke-width':1}),svgNode('text',{x:left-9,y:position(y+4),'text-anchor':'end','font-size':11,fill:'#34475a'},tickLabel(value)));
    }
    add(svgNode('line',{x1:left,y1:position(zero),x2:right,y2:position(zero),stroke:'#34475a','stroke-width':1.5}),svgNode('line',{x1:left,y1:top,x2:left,y2:bottom,stroke:'#34475a','stroke-width':1}));
    const labelStride=Math.max(1,Math.ceil(labels.length/12));
    labels.forEach((label,index)=>{if(index%labelStride===0)add(svgNode('text',{x:position(left+(index+.5)*step),y:bottom+17,'text-anchor':'end',transform:'rotate(-55 '+position(left+(index+.5)*step)+' '+(bottom+17)+')','font-size':10,fill:'#34475a'},shortLabel(label,8)));});
    series.forEach((item,seriesIndex)=>{
      const color=COLORS[seriesIndex];
      if(artifact.chartType==='line'){
        const points=item.values.map((value,index)=>position(left+(index+.5)*step)+','+position(scale(value))).join(' ');
        add(svgNode('polyline',{points,fill:'none',stroke:color,'stroke-width':2.5}));
      }
      item.values.forEach((value,index)=>{
        let shape;
        if(artifact.chartType==='bar'){
          const barWidth=step*.76/series.length,x=left+index*step+step*.12+barWidth*seriesIndex;
          shape=svgNode('rect',{x:position(x),y:position(Math.min(zero,scale(value))),width:position(barWidth*.92),height:position(Math.abs(zero-scale(value))),fill:color});
        }else shape=svgNode('circle',{cx:position(left+(index+.5)*step),cy:position(scale(value)),r:3.5,fill:color});
        shape.children.push(svgNode('title',{},item.label+'，'+labels[index]+'：'+formattedNumber(value)));add(shape);
      });
      const x=90+seriesIndex*139;
      add(svgNode('rect',{x,y:53,width:11,height:11,fill:color}),svgNode('text',{x:x+16,y:63,'font-size':11,fill:'#182b3d'},shortLabel(item.label,10)));
    });
    add(svgNode('text',{x:(left+right)/2,y:475,'text-anchor':'middle','font-size':13,fill:'#182b3d'},shortLabel(artifact.xLabel||categoryLabel)),svgNode('text',{x:18,y:(top+bottom)/2,transform:'rotate(-90 18 '+((top+bottom)/2)+')','text-anchor':'middle','font-size':13,fill:'#182b3d'},shortLabel(artifact.yLabel)));
  }
  return svgNode('svg',{xmlns:SVG_NS,viewBox:'0 0 800 '+height,width:800,height,role:'img','aria-labelledby':id+'-title '+id+'-description','font-family':'system-ui, sans-serif'},null,children);
}
function svgDom(document,node) {
  const out=document.createElementNS(SVG_NS,node.tag);
  Object.entries(node.attrs).forEach(([name,value])=>attr(out,name,value));
  if(node.value!==null)out.textContent=node.value;
  node.children.forEach(child=>out.append(svgDom(document,child)));return out;
}
function flowchartSvg(artifact,parsed,id) {
  const {nodes,edges,direction}=parsed,title=artifact.title||'流程圖';
  const incoming=new Map(nodes.map(node=>[node.id,0])),outgoing=new Map(nodes.map(node=>[node.id,[]])),rank=new Map(nodes.map(node=>[node.id,0]));
  edges.forEach(edge=>{incoming.set(edge.to,incoming.get(edge.to)+1);outgoing.get(edge.from).push(edge.to);});
  const queue=nodes.filter(node=>incoming.get(node.id)===0).map(node=>node.id),seen=new Set();
  for(let cursor=0;cursor<queue.length;cursor++){
    const current=queue[cursor];seen.add(current);
    outgoing.get(current).forEach(target=>{rank.set(target,Math.max(rank.get(target),rank.get(current)+1));incoming.set(target,incoming.get(target)-1);if(incoming.get(target)===0)queue.push(target);});
  }
  // Cyclic components receive finite declared-order layers, rather than a walk
  // that could loop. All cycle/back edges remain visible and in the text list.
  let next=seen.size?Math.max(...[...seen].map(node=>rank.get(node)))+1:0;
  nodes.filter(node=>!seen.has(node.id)).forEach(node=>rank.set(node.id,next++));
  const groups=new Map();nodes.forEach(node=>{const level=rank.get(node.id);if(!groups.has(level))groups.set(level,[]);groups.get(level).push(node);});
  const locations=new Map();let layers=0,maxAcross=1;
  [...groups.keys()].sort((a,b)=>a-b).forEach(level=>{
    const group=groups.get(level);maxAcross=Math.max(maxAcross,Math.min(4,group.length));
    group.forEach((node,index)=>{const part=Math.floor(index/4),count=Math.min(4,group.length-part*4);locations.set(node.id,{node,layer:layers+part,across:index%4,count});});
    layers+=Math.ceil(group.length/4);
  });
  const width=direction==='TD'?Math.max(480,maxAcross*260+120):Math.max(480,layers*310+140);
  const height=direction==='TD'?Math.max(280,layers*190+140):Math.max(280,maxAcross*170+140);
  locations.forEach(location=>{
    location.x=direction==='TD'?width/2+(location.across-(location.count-1)/2)*260:180+location.layer*310;
    location.y=direction==='TD'?130+location.layer*190:height/2+(location.across-(location.count-1)/2)*170;
    location.width=220;location.height=location.node.shape==='diamond'?132:104;
  });
  const children=[svgNode('title',{id:id+'-title'},title),svgNode('desc',{id:id+'-description'},(direction==='TD'?'由上而下':'由左至右')+'，'+nodes.length+' 個節點、'+edges.length+' 條連線。所有節點文字與連線另列於文字表格。'),svgNode('rect',{x:0,y:0,width,height,fill:'#ffffff'}),svgNode('text',{x:width/2,y:30,'text-anchor':'middle','font-size':20,fill:'#182b3d'},shortLabel(title,28))];
  const point=(x,y)=>({x,y});
  edges.forEach((edge,index)=>{
    const from=locations.get(edge.from),to=locations.get(edge.to);let points;
    if(from===to){
      const lane=from.x+from.width/2+32+(index%3)*12;
      points=[point(from.x+from.width/2,from.y),point(lane,from.y),point(lane,from.y-from.height/2-25),point(from.x,from.y-from.height/2-25),point(from.x,from.y-from.height/2)];
    }else if(direction==='TD'&&to.y>from.y){
      const start=point(from.x,from.y+from.height/2),end=point(to.x,to.y-to.height/2),middle=(start.y+end.y)/2;
      points=[start,point(start.x,middle),point(end.x,middle),end];
    }else if(direction==='LR'&&to.x>from.x){
      const start=point(from.x+from.width/2,from.y),end=point(to.x-to.width/2,to.y),middle=(start.x+end.x)/2;
      points=[start,point(middle,start.y),point(middle,end.y),end];
    }else if(direction==='TD'){
      const lane=Math.max(12,Math.min(from.x,to.x)-130-(index%3)*13);
      points=[point(from.x-from.width/2,from.y),point(lane,from.y),point(lane,to.y),point(to.x-to.width/2,to.y)];
    }else{
      const lane=Math.min(height-12,Math.max(from.y,to.y)+85+(index%3)*13);
      points=[point(from.x,from.y+from.height/2),point(from.x,lane),point(to.x,lane),point(to.x,to.y+to.height/2)];
    }
    const end=points.at(-1),previous=points.at(-2),length=Math.hypot(end.x-previous.x,end.y-previous.y)||1,dx=(end.x-previous.x)/length,dy=(end.y-previous.y)/length;
    const arrow=[end,point(end.x-dx*9-dy*4,end.y-dy*9+dx*4),point(end.x-dx*9+dy*4,end.y-dy*9-dx*4)];
    const group=svgNode('g',{},null,[svgNode('title',{},edge.from+' → '+edge.to+(edge.label?'：'+edge.label:'')),svgNode('polyline',{points:points.map(p=>position(p.x)+','+position(p.y)).join(' '),fill:'none',stroke:'#526b7e','stroke-width':2}),svgNode('polygon',{points:arrow.map(p=>position(p.x)+','+position(p.y)).join(' '),fill:'#526b7e'})]);
    if(edge.label){
      const middle=points[Math.floor(points.length/2)],previousMiddle=points[Math.floor(points.length/2)-1],x=(middle.x+previousMiddle.x)/2,y=(middle.y+previousMiddle.y)/2-6;
      group.children.push(svgNode('text',{x:position(x),y:position(y),'text-anchor':'middle','font-size':12,fill:'#253f54',stroke:'#ffffff','stroke-width':3,'paint-order':'stroke'},shortLabel(edge.label,16)));
    }
    children.push(group);
  });
  nodes.forEach(node=>{
    const {x,y,width,height}=locations.get(node.id),shapes=[];
    if(node.shape==='diamond')shapes.push(svgNode('polygon',{points:[[x,y-height/2],[x+width/2,y],[x,y+height/2],[x-width/2,y]].map(p=>p.map(position).join(',')).join(' '),fill:'#fff2cd',stroke:'#796119','stroke-width':2}));
    else shapes.push(svgNode('rect',{x:position(x-width/2),y:position(y-height/2),width,height,rx:node.shape==='round'?height/2:8,fill:node.shape==='round'?'#dcefe2':'#e6eef8',stroke:'#355d7d','stroke-width':2}));
    const limit=node.shape==='diamond'?10:14,maxLines=node.shape==='diamond'?3:4,characters=Array.from(node.label),lines=[];
    for(let index=0;index<characters.length&&lines.length<maxLines;index+=limit)lines.push(characters.slice(index,index+limit).join(''));
    if(characters.length>limit*maxLines)lines[lines.length-1]=shortLabel(lines.at(-1)+'…',limit);
    lines.forEach((line,index)=>shapes.push(svgNode('text',{x,y:position(y+(index-(lines.length-1)/2)*18+5),'text-anchor':'middle','font-size':14,fill:'#182b3d'},line)));
    children.push(svgNode('g',{},null,[svgNode('title',{},node.id+'：'+node.label),...shapes]));
  });
  return svgNode('svg',{xmlns:SVG_NS,viewBox:'0 0 '+width+' '+height,width,height,role:'img','aria-labelledby':id+'-title '+id+'-description','font-family':'system-ui, sans-serif'},null,children);
}
function xml(value) { return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,'�').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[character])); }
function serializeSvg(node) {
  return '<'+node.tag+Object.entries(node.attrs).map(([name,value])=>' '+name+'="'+xml(value)+'"').join('')+'>'+(node.value===null?'':xml(node.value))+node.children.map(serializeSvg).join('')+'</'+node.tag+'>';
}
export function renderArtifact(value,{document=globalThis.document,compact=false,loadImage,onError}={}) {
  if(value?.kind==='image')return createImagePreview(document,value,{loadImage,onError});
  if(value?.kind==='mindmap')return renderMindmap(value,{document,compact});
  if(value?.kind==='vector')return renderVector(value,{document,compact});
  if(value?.kind==='webpage')return renderWebpage(value,{document,compact});
  const root=element(document,'section','artifact-preview'+(compact?' compact':''));
  const error=validateArtifact(value,value?.kind);
  if(error){root.append(element(document,'p','artifact-error',error));return root;}
  const artifact=checkedArtifact(value,value.kind);
  if(artifact.kind==='table')root.append(dataTable(document,artifact.caption||'表格內容',artifact.columns.map(column=>column.label),artifact.rows.map(row=>row.cells)));
  else if(artifact.chartType==='flowchart'){
    const parsed=parseFlowchartSource(artifact.sourceText),id='artifact-flowchart-'+(++instanceSequence),shapes={rect:'方框',diamond:'判斷菱形',round:'圓角框'};
    root.append(svgDom(document,flowchartSvg(artifact,parsed,id)));
    root.append(dataTable(document,'流程圖節點（文字列表）',['節點識別碼','節點文字','形狀'],parsed.nodes.map(node=>[node.id,node.label,shapes[node.shape]])));
    if(parsed.edges.length)root.append(dataTable(document,'流程圖連線（文字列表）',['起點','連線標籤','終點'],parsed.edges.map(edge=>[edge.from,edge.label,edge.to])));
    else root.append(element(document,'p','editor-note','此流程圖目前沒有連線。'));
  }else{
    const parsed=parseChartSource(artifact.sourceText,artifact.chartType),id='artifact-chart-'+(++instanceSequence);
    root.append(svgDom(document,chartSvg(artifact,parsed,id)));
    root.append(dataTable(document,'圖表資料（文字表格）',[parsed.categoryLabel,...parsed.series.map(item=>item.label)],parsed.labels.map((label,index)=>[label,...parsed.series.map(item=>formattedNumber(item.values[index]))])));
  }
  return root;
}
function newStableId(kind,existing) {
  let id;
  do{id=kind+'_'+(globalThis.crypto?.randomUUID?.()||'local_'+(++idSequence));}while(existing.includes(id));
  return id;
}
export function renderArtifactEditor(value,{document=globalThis.document,disabled=false,onChange=()=>{},idPrefix='artifact',uiState={},onPendingChange=()=>{}}={}) {
  if(value?.kind==='image')return createImageEditor(document,value,{disabled,onChange,idPrefix,uiState,onPendingChange});
  if(value?.kind==='mindmap')return renderMindmapEditor(value,{document,disabled,onChange,idPrefix,uiState,onPendingChange});
  if(value?.kind==='vector')return renderVectorEditor(value,{document,disabled,onChange,idPrefix,uiState,onPendingChange});
  if(value?.kind==='webpage')return renderWebpageEditor(value,{document,disabled,onChange,idPrefix,uiState,onPendingChange});
  const state=cloneArtifact(value),kind=state.kind;
  fail(isArtifactType(kind),'此類型不是可保存的結構化作品。');
  const prefix=String(idPrefix).replace(/[^a-zA-Z0-9_-]/g,'_')+'-'+(++instanceSequence);
  const root=element(document,'div','artifact-editor artifact-'+kind+'-editor'),error=element(document,'p','artifact-error');
  error.id=prefix+'-error';attr(error,'role','status');attr(error,'aria-live','polite');
  const field=(labelText,key,multiline=false)=>{
    const wrap=element(document,'div','field'),label=element(document,'label','field-label',labelText),input=element(document,'textarea');input.rows=multiline?8:2;
    input.id=prefix+'-'+key;attr(label,'for',input.id);attr(input,'aria-describedby',error.id);input.value=state[key];input.disabled=disabled;
    wrap.append(label,input);return {wrap,input,label};
  };
  const button=(label,handler,blocked=false)=>{
    const node=element(document,'button','button small',label);node.type='button';node.disabled=disabled||blocked;
    node.addEventListener('click',()=>{if(!node.disabled)handler();});return node;
  };
  let preview=null,chartFields=null,chartHint=null;
  const update=()=>{
    if(chartFields){
      const flow=state.chartType==='flowchart';chartFields.sourceText.label.textContent=flow?'流程圖文字來源（Mermaid 子集）':'圖表文字來源（TSV）';
      for(const key of ['xLabel','yLabel']){chartFields[key].wrap.hidden=flow;chartFields[key].input.disabled=disabled||flow;}
      chartHint.textContent=flow?'使用受限 Mermaid 子集：第一行 flowchart TD（由上而下）或 flowchart LR（由左至右）；逐行宣告 A["說明"]、B{"判斷"}、C("開始")，另用 A --> B 或 A -->|是| B 連線。最多 40 個節點、80 條連線，不支援指令、網址、HTML 或任意程式碼。新建時的「開始」是手動佔位節點，可依實際流程修改。':'以 Tab 分隔欄位，第一列為分類名稱與數列名稱；之後填入 1 至 24 列你提供的數據。數值只接受十進位數字，不接受公式、科學記號或空白。圓餅圖限一個非負數列，總和須大於零。';
    }
    error.textContent=validateArtifact(state,kind);
    root.querySelectorAll('input,textarea,select').forEach(input=>attr(input,'aria-invalid',error.textContent?'true':'false'));
    if(preview)preview.replaceChildren(error.textContent?element(document,'p','editor-note','來源資料尚未通過驗證，修正後才會顯示預覽。'):renderArtifact(state,{document}));
  };
  const emit=()=>{update();onChange(cloneArtifact(state));};
  if(kind==='table'){
    const caption=field('表格說明','caption');caption.input.addEventListener('input',()=>{if(!disabled){state.caption=caption.input.value;emit();}});root.append(caption.wrap);
    const workspace=element(document,'div','artifact-table-workspace');root.append(workspace);
    const draw=()=>{
      workspace.replaceChildren();
      const scroll=element(document,'div','artifact-table-scroll'),table=element(document,'table','artifact-edit-table');table.append(element(document,'caption','sr-only','編輯表格欄位、資料列與儲存格'));
      attr(scroll,'tabindex','0');attr(scroll,'role','region');attr(scroll,'aria-label','表格編輯區（可水平捲動）');
      const head=element(document,'thead'),header=element(document,'tr');header.append(attr(element(document,'th','','資料列'),'scope','col'));
      state.columns.forEach((column,index)=>{
        const cell=attr(element(document,'th'),'scope','col'),label=element(document,'label','field-label','第 '+(index+1)+' 欄名稱'),input=element(document,'textarea');input.rows=2;
        input.id=prefix+'-column-'+column.id;input.value=column.label;input.disabled=disabled;attr(label,'for',input.id);attr(input,'aria-describedby',error.id);
        input.addEventListener('input',()=>{if(!disabled){state.columns[index].label=input.value;emit();}});
        cell.append(label,input,button('移除第 '+(index+1)+' 欄',()=>{state.columns.splice(index,1);state.rows.forEach(row=>row.cells.splice(index,1));draw();emit();},state.columns.length<=1));header.append(cell);
      });head.append(header);table.append(head);
      const body=element(document,'tbody');state.rows.forEach((row,rowIndex)=>{
        const tr=element(document,'tr'),heading=attr(element(document,'th','','第 '+(rowIndex+1)+' 列'),'scope','row');
        heading.append(button('移除第 '+(rowIndex+1)+' 列',()=>{state.rows.splice(rowIndex,1);draw();emit();},state.rows.length<=1));tr.append(heading);
        state.columns.forEach((column,columnIndex)=>{
          const td=element(document,'td'),label=element(document,'label','sr-only','第 '+(rowIndex+1)+' 列，第 '+(columnIndex+1)+' 欄'),input=element(document,'textarea','artifact-cell-input');
          input.id=prefix+'-cell-'+row.id.length+'-'+row.id+'-'+column.id.length+'-'+column.id;input.value=row.cells[columnIndex];input.disabled=disabled;input.rows=2;attr(label,'for',input.id);attr(input,'aria-describedby',error.id);
          input.addEventListener('input',()=>{if(!disabled){state.rows[rowIndex].cells[columnIndex]=input.value;emit();}});td.append(label,input);tr.append(td);
        });body.append(tr);
      });table.append(body);scroll.append(table);workspace.append(scroll);
      const actions=element(document,'div','artifact-structure-actions');
      actions.append(button('新增欄位',()=>{const id=newStableId('column',state.columns.map(column=>column.id));state.columns.push({id,label:'新欄位'});state.rows.forEach(row=>row.cells.push(''));draw();emit();},state.columns.length>=12),button('新增資料列',()=>{state.rows.push({id:newStableId('row',state.rows.map(row=>row.id)),cells:state.columns.map(()=>'')});draw();emit();},state.rows.length>=100));
      workspace.append(actions,element(document,'p','editor-note','最多 12 欄、100 列。儲存格只保存文字，不會執行公式。'));
    };draw();
  }else{
    const typeWrap=element(document,'div','field'),typeLabel=element(document,'label','field-label','圖表類型'),select=element(document,'select');select.id=prefix+'-chartType';select.disabled=disabled;attr(typeLabel,'for',select.id);attr(select,'aria-describedby',error.id);
    [['flowchart','流程圖'],['bar','長條圖'],['line','折線圖'],['pie','圓餅圖']].forEach(([value,label])=>{const option=element(document,'option','',label);option.value=value;option.selected=state.chartType===value;select.append(option);});select.value=state.chartType;
    select.addEventListener('change',()=>{if(!disabled){state.chartType=select.value;emit();}});typeWrap.append(typeLabel,select);root.append(typeWrap);
    chartFields={};
    [['title','圖表標題'],['xLabel','橫軸標籤'],['yLabel','縱軸標籤'],['sourceText','圖表文字來源（TSV）']].forEach(([key,label])=>{
      const inputField=field(label,key,key==='sourceText');chartFields[key]=inputField;
      if(key==='sourceText'){inputField.input.rows=10;inputField.input.spellcheck=false;}
      inputField.input.addEventListener('input',()=>{if(!inputField.input.disabled){state[key]=inputField.input.value;emit();}});root.append(inputField.wrap);
    });
    chartHint=element(document,'p','editor-note');root.append(chartHint);
    preview=element(document,'div','artifact-live-preview');attr(preview,'aria-label','圖表即時預覽');
  }
  root.append(error);if(preview)root.append(preview);update();return root;
}
export function exportArtifact(value,format) {
  if(value?.kind==='image'){const artifact=checkedArtifact(value,'image');fail(format==='json','圖片檔案須從私人圖片讀取介面下載 PNG；JSON 僅含中繼資料，不是圖片備份。');return {filename:'image-metadata-only.json',mime:'application/json;charset=utf-8',text:JSON.stringify({notice:'僅含圖片中繼資料，未包含 PNG 圖片檔，不是完整備份。',artifact},null,2)};}
  if(value?.kind==='mindmap')return exportMindmap(value,format);
  if(value?.kind==='vector')return exportVector(value,format);
  if(value?.kind==='webpage')return exportWebpage(value,format);
  const artifact=checkedArtifact(value,value?.kind);
  if(artifact.kind==='table'){
    fail(format==='csv'||format==='tsv','表格只支援 CSV 或 TSV 匯出。');
    const delimiter=format==='csv'?',':'\t';
    const rows=[artifact.columns.map(column=>column.label),...artifact.rows.map(row=>row.cells)];
    const output=rows.map(cells=>cells.map(cell=>delimitedField(cell,delimiter,true)).join(delimiter)).join('\r\n')+'\r\n';
    return {filename:'table.'+format,mime:format==='csv'?'text/csv;charset=utf-8':'text/tab-separated-values;charset=utf-8',text:output};
  }
  if(artifact.chartType==='flowchart'){
    fail(['svg','mmd','txt'].includes(format),'流程圖只支援 SVG、MMD 或 TXT 文字來源匯出。');
    if(format!=='svg')return {filename:'flowchart.'+format,mime:'text/plain;charset=utf-8',text:artifact.sourceText};
    return {filename:'flowchart.svg',mime:'image/svg+xml;charset=utf-8',text:'<?xml version="1.0" encoding="UTF-8"?>\n'+serializeSvg(flowchartSvg(artifact,parseFlowchartSource(artifact.sourceText),'flowchart-export'))+'\n'};
  }
  fail(format==='svg'||format==='tsv','圖表只支援 SVG 或 TSV 匯出。');
  const parsed=parseChartSource(artifact.sourceText,artifact.chartType);
  if(format==='svg')return {filename:'chart.svg',mime:'image/svg+xml;charset=utf-8',text:'<?xml version="1.0" encoding="UTF-8"?>\n'+serializeSvg(chartSvg(artifact,parsed,'chart-export'))+'\n'};
  const normalized=artifact.sourceText.endsWith('\n')?artifact.sourceText.slice(0,-1):artifact.sourceText;
  const output=normalized.split('\n').map((line,rowIndex)=>line.split('\t').map((cell,columnIndex)=>delimitedField(cell,'\t',rowIndex===0||columnIndex===0)).join('\t')).join('\n')+'\n';
  return {filename:'chart.tsv',mime:'text/tab-separated-values;charset=utf-8',text:output};
}
