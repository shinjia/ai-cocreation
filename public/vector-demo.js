/**
 * Pure fixed-script demonstration, not AI. The fictional emblem is not derived
 * from the user's brief. Literal assignments and exact compatible layer unions
 * never interpret arbitrary requests, import SVG, or save/approve a version.
 */
import {cloneVector} from './vector.js?v=20261021-version11';

const DEMO_TITLE='晨光書屋｜探索版（虛構示範）';
export const SCRIPTED_VECTOR_TITLE_REQUEST=`標題改為「${DEMO_TITLE}」。`;
export const SCRIPTED_VECTOR_COLOR_REQUEST='將「晨光」的填色改為「#ef8354」。';
const shape=(id,type,label,fields)=>({id,type,label,x:0,y:0,width:0,height:0,fill:'none',stroke:'none',strokeWidth:0,opacity:1,text:'',fontSize:0,points:[],...fields});

/** All five objects, including the literal lettering, remain native geometry. */
export function scriptedVectorArtifact(_brief) {
  return cloneVector({
    kind:'vector',title:'晨光書屋（虛構固定腳本示範，非 AI）',width:640,height:420,background:'#fffdf7',
    shapes:[
      shape('demo-vector-sun','ellipse','晨光',{x:255,y:64,width:130,height:130,fill:'#f3c969'}),
      shape('demo-vector-left-page','polygon','左側書頁',{x:128,y:168,fill:'#dbece3',stroke:'#245c91',strokeWidth:4,points:[{x:0,y:0},{x:192,y:45},{x:192,y:138},{x:0,y:92}]}),
      shape('demo-vector-right-page','polygon','右側書頁',{x:320,y:213,fill:'#bad9d2',stroke:'#245c91',strokeWidth:4,points:[{x:0,y:0},{x:192,y:-45},{x:192,y:47},{x:0,y:93}]}),
      shape('demo-vector-spine','line','書脊',{x:320,y:213,width:0,height:93,stroke:'#245c91',strokeWidth:4}),
      shape('demo-vector-lettering','text','書屋文字',{x:200,y:367,fill:'#245c91',text:'晨光書屋',fontSize:40})
    ]
  });
}

export function scriptedVectorBrief() {
  return {
    items:[{id:'document',label:'向量圖形來源'}],
    purpose:'以虛構的晨光書屋圖案，示範可編輯幾何、圖層與版本保存。',
    audience:'想試用向量圖形操作方式的示範使用者。',
    message:'書屋名稱、圖形與配色都是事先寫好的虛構範例，未解析或採用使用者的真實需求。',
    tone:'清楚、開放；可自行修改，不強迫選定或定稿。',
    constraints:'固定腳本，不使用 AI；只示範既有原生幾何、字面標題／圖形色彩修改與相容圖層合併。沒有 SVG 匯入、貝茲曲線或外部工具相容性驗證。',
    summary:'以五個可編輯的橢圓、多邊形、線段與文字物件，呈現虛構的晨光書屋圖案。可手動編輯並匯出 SVG；未驗證任何外部工具的匯入規格，不代表已理解使用者需求。'
  };
}

function matchingShapes(source,name) {
  return source.shapes.filter(entry=>entry.id===name||entry.label===name);
}

/** Offer exactly two executable examples when both fit the current source. */
function exampleChoices(source) {
  const title=source.title===DEMO_TITLE?'晨光書屋｜暖色版（虛構示範）':DEMO_TITLE;
  const target=source.shapes.find(entry=>matchingShapes(source,entry.id).length===1);
  if(!target)return [];
  const field=target.type==='line'?'stroke':'fill',fieldName=field==='stroke'?'外框色':'填色';
  const color=target[field].toLowerCase()==='#ef8354'?'#245c91':'#ef8354';
  try {
    cloneVector({...source,title});
    cloneVector({...source,shapes:source.shapes.map(entry=>entry.id===target.id?{...entry,[field]:color}:entry)});
  } catch (_) {return [];}
  return [
    {id:'vector-demo-title',label:'修改作品標題的字面範例',value:`標題改為「${title}」。`},
    {id:'vector-demo-color',label:`修改一個圖形${fieldName}的字面範例`,value:`將「${target.id}」的${fieldName}改為「${color}」。`}
  ];
}

function clarification(source,reply,offerChoices=false) {
  const choices=offerChoices?exampleChoices(source):[];
  return {
    outcome:'clarification',artifact:cloneVector(source),
    reply:reply+'\n（固定腳本，不是真實 AI；這次沒有新增修改版。）',
    question:choices.length?'若要試用固定腳本，可選擇以下字面範例，也可以繼續討論或自行編輯。':'',
    choices,rationale:'',changeSummary:''
  };
}

function revision(artifact,reply,changeSummary) {
  return {
    outcome:'revision',artifact:cloneVector(artifact),
    reply:reply+'\n（固定腳本，不是真實 AI；僅執行明確的字面設定，沒有分析主題或自行定稿。）',
    question:'',choices:[],
    rationale:'只執行已列明格式的字面標題或單一圖形色彩設定；未解讀其他需求，也未更動目標說明。',
    changeSummary
  };
}

/**
 * Exact grammar only (outer whitespace is allowed):
 * 標題改為「literal title」。
 * 將「exact unique label or stable ID」的填色改為「#rrggbb or none」。
 * 將「exact unique label or stable ID」的外框色改為「#rrggbb or none」。
 * Title changes are document metadata, not rewrites of the literal text object.
 */
export function scriptedVectorRevision(sourceArtifact,text) {
  const source=cloneVector(sourceArtifact);
  if(typeof text!=='string')throw new Error('向量圖形討論內容必須是文字。');
  const command=text.trim(),titleMatch=command.match(/^標題改為「([^「」]*)」。$(?![\s\S])/);
  if(titleMatch) {
    const title=titleMatch[1];
    if(title===source.title)return clarification(source,'作品標題已經是指定文字，所有圖形保持原樣，不會重複建立修改版。');
    return revision(cloneVector({...source,title}),'已依字面指令更新作品標題；圖中的文字物件、幾何、圖層與色彩均保持不變。','僅更新作品標題；完整保留所有圖形與圖層順序。');
  }
  const colorMatch=command.match(/^將「([^「」]+)」的(填色|外框色)改為「([^「」]*)」。$(?![\s\S])/);
  if(colorMatch) {
    const [,name,fieldName,color]=colorMatch,matches=matchingShapes(source,name);
    if(matches.length!==1)return clarification(source,matches.length?'有多個圖形符合這個名稱或 ID；請使用不會與其他名稱混淆的穩定 ID，或在編輯器選取圖形。未替你挑選或更改任何圖形。':'來源作品沒有符合這個名稱或 ID 的圖形。請使用現有圖形的完整名稱或穩定 ID，或在編輯器選取圖形。');
    const target=matches[0],field=fieldName==='填色'?'fill':'stroke';
    if(target.type==='line'&&field==='fill')return clarification(source,'線段沒有可見的填色；請明確設定外框色，或在編輯器調整線段。沒有建立只改無效填色的修改版。');
    const artifact=cloneVector({...source,shapes:source.shapes.map(entry=>entry.id===target.id?{...entry,[field]:color}:entry)});
    if(target[field].toLowerCase()===color.toLowerCase())return clarification(source,'此圖形已使用指定色彩；色碼大小寫不會造成可見差異，所有圖形保持原樣，不會重複建立修改版。');
    return revision(artifact,`已依字面指令更新圖形 ${target.id} 的${fieldName}；其他欄位與圖層順序均保持不變。`,`僅更新圖形 ${target.id} 的${fieldName}；沒有移除、新增或重排圖形。`);
  }
  return clarification(source,'固定腳本不會解析自由文字或推論設計需求。只支援明確格式的作品標題與單一圖形填色／外框色設定；其他內容請在編輯器手動調整，也可以繼續自由討論。',true);
}

// Stable IDs, labels and document title are metadata, not drawing instructions.
// Order and duplicate multiplicity remain essential for occlusion and opacity.
function drawingSignature(artifact) {
  return JSON.stringify(artifact.shapes.map(entry=>[entry.type,entry.x,entry.y,entry.width,entry.height,entry.fill,entry.stroke,entry.strokeWidth,entry.opacity,entry.text,entry.fontSize,entry.points]));
}

/** Exact layer union only. No inferred transforms, renaming, clipping or drops. */
export function fuseScriptedVectors(artifacts) {
  if(!Array.isArray(artifacts)||artifacts.length<2||artifacts.length>5||Object.keys(artifacts).length!==artifacts.length||Reflect.ownKeys(artifacts).length!==artifacts.length+1||!Object.keys(artifacts).every((key,index)=>key===String(index)))throw new Error('固定向量融合示範需要選擇 2 至 5 個完整來源版本。');
  const sources=artifacts.map(cloneVector),first=sources[0];
  if(sources.some(source=>source.width!==first.width||source.height!==first.height||source.background!==first.background))throw new Error('所選來源的畫布寬高或背景不同；固定腳本不會縮放、裁切或替換背景，沒有建立融合版。');
  const records=new Map();
  for(const source of sources)for(const entry of source.shapes) {
    const previous=records.get(entry.id);
    if(previous&&JSON.stringify(previous)!==JSON.stringify(entry))throw new Error('所選來源有相同 ID，但圖形欄位不同；固定腳本不會猜測取捨、重新命名或丟棄圖形，沒有建立融合版。');
    if(!previous)records.set(entry.id,entry);
  }
  const artifact=cloneVector({...first,shapes:[...records.values()]});
  const signature=drawingSignature(artifact);
  if(sources.some(source=>drawingSignature(source)===signature))throw new Error('至少一個所選來源已包含相同順序的完整繪製物件；固定腳本不會僅改標題或圖形名稱便建立融合版。');
  return artifact;
}
