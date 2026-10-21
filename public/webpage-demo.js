/**
 * Pure fixed-script demonstration, not AI. This fictional community event page
 * is not derived from a user's brief. All authored values remain plain text;
 * commands never execute markup, request a resource, publish, or save a version.
 */
import {cloneWebpage} from './webpage.js?v=20261021-version13';

const DEMO_TITLE='街角故事日｜探索版（虛構示範）';
export const SCRIPTED_WEBPAGE_TITLE_REQUEST=`標題改為「${DEMO_TITLE}」。`;
export const SCRIPTED_WEBPAGE_THEME_REQUEST='視覺主題改為「midnight」。';
export const SCRIPTED_WEBPAGE_HEADING_REQUEST='將「demo-webpage-about」的標題改為「從一個街角開始（虛構示範）」。';
export const SCRIPTED_WEBPAGE_BODY_REQUEST='將「demo-webpage-about」的內文改為「這是虛構社區活動的固定腳本範例；可以把觀察、故事與創作排成自己的內容結構，不代表真實活動公告。」。';
export const SCRIPTED_WEBPAGE_NAVIGATION_ENABLE_REQUEST='啟用頁內導覽。';
export const SCRIPTED_WEBPAGE_NAVIGATION_DISABLE_REQUEST='停用頁內導覽。';

const section=(id,type,heading,fields={})=>({id,type,eyebrow:'',heading,body:'',entries:[],actionLabel:'',actionTarget:'',...fields});

/** The input brief is intentionally neither parsed nor represented as understood. */
export function scriptedWebpageArtifact(_brief) {
  return cloneWebpage({
    kind:'webpage',title:'街角故事日（虛構固定腳本示範，非 AI）',theme:'paper',navigation:true,
    sections:[
      section('demo-webpage-hero','hero','把日常，變成相遇的故事。',{
        eyebrow:'街角故事日 · 虛構活動網站範例',
        body:'這是一個事先寫好的虛構社區活動網站，僅供操作示範，不是真實活動公告。內容未採用使用者資料，也不提供報名、付款或對外發布。',
        actionLabel:'看看示範內容',actionTarget:'demo-webpage-program'
      }),
      section('demo-webpage-about','text','一場關於生活觀察的想像',{
        eyebrow:'活動介紹（虛構）',
        body:'在這個虛構設定裡，參與者可以從一張照片、一段聲音或一則小故事開始，交流不同的生活視角。主題、名稱與活動安排都是固定範例，可在編輯器自行改寫。'
      }),
      section('demo-webpage-program','cards','三種故事入口',{
        eyebrow:'內容安排（虛構）',
        body:'以下是虛構的活動內容卡片，不代表已安排的場次或服務。',
        entries:[
          {id:'demo-webpage-observe',title:'街角觀察',body:'虛構活動構想：留意日常的光線、聲音與細節，把一個發現寫成短句。'},
          {id:'demo-webpage-share',title:'故事交換',body:'虛構活動構想：用一張照片或一段文字，分享自己想記住的生活片刻。'},
          {id:'demo-webpage-create',title:'共同創作',body:'虛構活動構想：把彼此的觀察排成一份小作品，保留不同觀點，不預設唯一答案。'}
        ]
      }),
      section('demo-webpage-faq','faq','先看看這些問題',{
        eyebrow:'範例說明',
        body:'可展開下列問答，了解這個固定腳本頁面的範圍。',
        entries:[
          {id:'demo-webpage-faq-fiction',title:'這是真實活動嗎？',body:'不是。活動名稱、內容與敘述均為虛構固定範例，非 AI 產生，也不是真實活動公告。'},
          {id:'demo-webpage-faq-registration',title:'可以在這裡報名或付款嗎？',body:'不可以。按鈕只會移動到同一頁內的指定段落；沒有表單送出、報名、登入、付款或外部資料連線功能。'},
          {id:'demo-webpage-faq-edit',title:'可以修改哪些內容？',body:'可在原生編輯器調整文字、段落與固定視覺主題。內容以純文字顯示，不執行自訂 HTML、CSS 或 JavaScript。'}
        ]
      }),
      section('demo-webpage-next','cta','從自己的觀察繼續寫',{
        eyebrow:'下一步（操作示範）',
        body:'這個按鈕只會回到本頁的活動介紹，不會報名、傳送資料或建立任何承諾。你可以繼續探索，是否另存或採用版本由你決定。',
        actionLabel:'回到活動介紹',actionTarget:'demo-webpage-about'
      })
    ]
  });
}

export function scriptedWebpageBrief() {
  return {
    items:[{id:'document',label:'網頁來源'}],
    purpose:'以虛構的街角故事日活動網站，示範可編輯網頁、頁內互動與版本保存。',
    audience:'想試用原生網頁編輯與版本操作方式的示範使用者。',
    message:'內容結構：主視覺、活動介紹、內容卡片、常見問題與頁內行動區。全部是事先寫好的虛構範例，未解析或採用使用者的真實需求。',
    tone:'視覺風格：清楚、留白的紙感主題；另有深色與草地配色，可用固定主題切換，不推論使用者喜好。',
    constraints:'操作功能與限制：固定腳本，不使用 AI；只支援字面標題／段落文字、固定主題與頁內導覽設定及相容段落合併。FAQ 可展開，按鈕僅作頁內移動；沒有外部連線、表單送出、登入、付款、任意程式碼或自動發布。',
    summary:'以五個原生段落呈現虛構社區活動網站，可手動編輯並匯出獨立 HTML。範例不代表真實活動、沒有理解使用者需求，也不會自動定稿或發布。'
  };
}

function matchingSections(source,name) {
  return source.sections.filter(entry=>entry.id===name||entry.heading===name);
}

/** Offer exactly two validated literal actions, never a fictional AI suggestion. */
function exampleChoices(source) {
  const title=source.title===DEMO_TITLE?'街角故事日｜另一個方向（虛構示範）':DEMO_TITLE;
  const theme=source.theme==='midnight'?'paper':'midnight';
  try {
    cloneWebpage({...source,title});
    cloneWebpage({...source,theme});
  } catch (_) {return [];}
  return [
    {id:'webpage-demo-title',label:'修改網頁標題的字面範例',value:`標題改為「${title}」。`},
    {id:'webpage-demo-theme',label:'切換固定視覺主題的字面範例',value:`視覺主題改為「${theme}」。`}
  ];
}

function clarification(source,reply,offerChoices=false) {
  const choices=offerChoices?exampleChoices(source):[];
  return {
    outcome:'clarification',artifact:cloneWebpage(source),
    reply:reply+'\n（固定腳本，不是真實 AI；這次沒有新增修改版。）',
    question:choices.length?'若要試用固定腳本，可選擇以下字面範例，也可以繼續討論或自行編輯。':'',
    choices,rationale:'',changeSummary:''
  };
}

function revision(artifact,reply,changeSummary) {
  return {
    outcome:'revision',artifact:cloneWebpage(artifact),
    reply:reply+'\n（固定腳本，不是真實 AI；僅執行明確的字面設定，沒有分析主題或自行定稿。）',
    question:'',choices:[],
    rationale:'只執行已列明格式的網頁標題、單一段落文字、固定視覺主題或頁內導覽設定；未解讀其他需求，也未更動目標說明。',
    changeSummary
  };
}

/**
 * Exact grammar only; outer whitespace is allowed, inner text is preserved:
 * 標題改為「literal title」。
 * 將「exact unique heading or stable ID」的標題改為「literal heading」。
 * 將「exact unique heading or stable ID」的內文改為「literal body」。
 * 視覺主題改為「paper|midnight|meadow」。
 * 啟用頁內導覽。 / 停用頁內導覽。
 * These commands never interpret URLs, markup, free-form requests or scripts.
 */
export function scriptedWebpageRevision(sourceArtifact,text) {
  const source=cloneWebpage(sourceArtifact);
  if(typeof text!=='string')throw new Error('網頁討論內容必須是文字。');
  const command=text.trim(),titleMatch=command.match(/^標題改為「([^「」]*)」。$(?![\s\S])/);
  if(titleMatch) {
    const title=titleMatch[1];
    if(title===source.title)return clarification(source,'網頁標題已經是指定文字，完整網頁保持原樣，不會重複建立修改版。');
    return revision(cloneWebpage({...source,title}),'已依字面指令更新網頁標題；段落、文字、視覺主題與頁內功能均保持不變。','僅更新網頁標題；完整保留段落內容、穩定 ID 與順序。');
  }
  const sectionMatch=command.match(/^將「([^「」]+)」的(標題|內文)改為「([^「」]*)」。$(?![\s\S])/);
  if(sectionMatch) {
    const [,name,fieldName,value]=sectionMatch,matches=matchingSections(source,name);
    if(matches.length!==1)return clarification(source,matches.length?'有多個段落符合這個標題或 ID；請使用不會與其他標題混淆的穩定 ID，或在編輯器選取段落。未替你挑選或更改任何段落。':'來源網頁沒有符合這個標題或 ID 的段落。請使用現有段落的完整標題或穩定 ID，或在編輯器選取段落。');
    const target=matches[0],field=fieldName==='標題'?'heading':'body';
    if(target[field]===value)return clarification(source,'此段落已使用指定文字，完整網頁保持原樣，不會重複建立修改版。');
    const artifact=cloneWebpage({...source,sections:source.sections.map(entry=>entry.id===target.id?{...entry,[field]:value}:entry)});
    return revision(artifact,`已依字面指令更新段落 ${target.id} 的${fieldName}；其他內容、按鈕目標與段落順序均保持不變。`,`僅更新段落 ${target.id} 的${fieldName}；完整保留其他欄位、卡片／問答條目及穩定 ID。`);
  }
  const themeMatch=command.match(/^視覺主題改為「([^「」]*)」。$(?![\s\S])/);
  if(themeMatch) {
    const theme=themeMatch[1];
    if(theme===source.theme)return clarification(source,'網頁已使用指定視覺主題，完整網頁保持原樣，不會重複建立修改版。');
    return revision(cloneWebpage({...source,theme}),'已依字面指令切換固定視覺主題；文字、段落、按鈕目標與頁內導覽設定均保持不變。','僅切換固定視覺主題；未改寫任何文字或新增功能。');
  }
  if(command===SCRIPTED_WEBPAGE_NAVIGATION_ENABLE_REQUEST||command===SCRIPTED_WEBPAGE_NAVIGATION_DISABLE_REQUEST) {
    const navigation=command===SCRIPTED_WEBPAGE_NAVIGATION_ENABLE_REQUEST;
    if(navigation===source.navigation)return clarification(source,'頁內導覽已是指定狀態，完整網頁保持原樣，不會重複建立修改版。');
    return revision(cloneWebpage({...source,navigation}),`已依字面指令${navigation?'啟用':'停用'}頁內導覽；原有段落、文字、FAQ 與頁內按鈕目標均保持不變。`,'僅切換頁內導覽顯示；沒有新增外部連線、表單或其他功能。');
  }
  return clarification(source,'固定腳本不會解析自由文字或推論設計需求。只支援明確格式的網頁標題、單一段落標題／內文、paper／midnight／meadow 視覺主題及頁內導覽開關；其他內容請在編輯器手動調整，也可以繼續自由討論。',true);
}

// Document title alone is not a new content composition. Stable section/entry
// IDs, order, full text, multiplicity and section targets remain significant.
function pageSignature(artifact) {
  return JSON.stringify([artifact.theme,artifact.navigation,artifact.sections]);
}

/** Exact compatible section union, with no inferred rewrite, renaming or drops. */
export function fuseScriptedWebpages(artifacts) {
  if(!Array.isArray(artifacts)||artifacts.length<2||artifacts.length>5||Object.keys(artifacts).length!==artifacts.length||Reflect.ownKeys(artifacts).length!==artifacts.length+1||!Object.keys(artifacts).every((key,index)=>key===String(index)))throw new Error('固定網頁融合示範需要選擇 2 至 5 個完整來源版本。');
  const sources=artifacts.map(cloneWebpage),first=sources[0];
  if(sources.some(source=>source.theme!==first.theme||source.navigation!==first.navigation))throw new Error('所選來源的視覺主題或頁內導覽設定不同；固定腳本不會猜測取捨或替換設定，沒有建立融合版。');
  const records=new Map();
  for(const source of sources)for(const entry of source.sections) {
    const previous=records.get(entry.id);
    if(previous&&JSON.stringify(previous)!==JSON.stringify(entry))throw new Error('所選來源有相同 ID，但段落內容或設定不同；固定腳本不會猜測取捨、重新命名或丟棄段落，沒有建立融合版。');
    if(!previous)records.set(entry.id,entry);
  }
  const artifact=cloneWebpage({...first,sections:[...records.values()]});
  const signature=pageSignature(artifact);
  if(sources.some(source=>pageSignature(source)===signature))throw new Error('至少一個所選來源已包含相同順序的完整網頁內容；固定腳本不會僅改網頁標題便建立融合版。');
  return artifact;
}
