import {scriptedWebpageArtifact,scriptedWebpageBrief,scriptedWebpageRevision,fuseScriptedWebpages} from './webpage-demo.js?v=20261021-version16';
import {scriptedVectorArtifact,scriptedVectorBrief,scriptedVectorRevision,fuseScriptedVectors} from './vector-demo.js?v=20261021-version16';
import {scriptedMindmapArtifact,scriptedMindmapBrief,scriptedMindmapRevision,fuseScriptedMindmaps} from './mindmap-demo.js?v=20261021-version16';
/** SCRIPTED DEMO ONLY. This adapter has no network, key, or persistent browser storage. */
import {createTitleApp,MODULES,ApiError,canGenerate,validComparison,validItems,versionLabel,nextVersionCoordinates,isArchivedVersion,COMPARISON_SNAPSHOT_NOTE,comparisonQuestionError,versionGoalText,versionGoalAndRationale,combinedMetadataError,snapshotMetadataError,memberRosterError,officialItemTitle,currentChoiceQuestion,webpageDirectionConfirmationError} from './app.js?v=20261021-version16';
import {isArtifactType,validateArtifact,artifactItems,cloneArtifact,parseChartSource,parseFlowchartSource} from './artifacts.js?v=20261021-version16';
const clone=value=>JSON.parse(JSON.stringify(value));
const DEMO_PROVENANCE={provider:'scripted',requestedModel:'固定腳本',actualModel:'非 AI'};
const DEMO_BRIEF={items:[{id:'zh-title',label:'中文名稱'},{id:'en-title',label:'英文名稱'},{id:'tagline',label:'宣傳短句'}],purpose:'社區影像展的主視覺與宣傳海報',audience:'對影像創作有興趣的居民與創作者，以及第一次走進影展的觀眾',message:'從平凡的生活日常中，發現值得被看見的故事。',tone:'溫暖、有畫面感，保留一點想像',constraints:'繁體中文；主標題簡短好讀；避免過度抽象與艱深字詞。',summary:'為社區影像展找到一個溫暖、易讀且有畫面感的主標題，讓觀眾願意停下腳步，看見日常裡值得被記住的故事。'};
const SCRIPTED_CANDIDATES=[
  {title:'把日常，放映成光',rationale:'用「放映」連結影像展，讓熟悉的日常多一層被看見的意義。'},
  {title:'故事，就在我們之間',rationale:'把觀眾與創作者放在同一個敘事裡，溫暖、親近，也容易理解。'},
  {title:'那些未完的畫面',rationale:'保留觀看與想像的空間，適合強調生活片段與持續創作。'}
];
export function createDemoAdapter({seed=true}={}) {
  const projects=new Map(),requests=new Map();let sequence=0;
  const id=prefix=>`${prefix}-${++sequence}`;
  const now=()=>new Date().toISOString();
  const provenance=project=>{const owner=project?.creativeItems?project:[...projects.values()].find(raw=>raw.creativeItems.some(item=>item.id===project?.id)),binding=owner?.aiBinding;return {...DEMO_PROVENANCE,memberId:binding?.memberId || null,memberNickname:binding?.memberNickname || null,requestedAt:now()};};
  const settings={csrf:'scripted-demo-no-token',provider:'ollama',model:'固定腳本',members:[{id:'11111111111111111111111111111111',nickname:'小光（固定腳本）',enabled:true,provider:'ollama',model:'固定腳本',ollamaUrl:'http://127.0.0.1:11434'}],activeMemberId:'11111111111111111111111111111111',memberId:'11111111111111111111111111111111',memberNickname:'小光（固定腳本）',usageConsent:true,consentAt:'scripted-demo-not-network-consent',keyPresent:false,keyExpiresAt:null,keyRevision:0,settingsRevision:0,ollamaUrl:'http://127.0.0.1:11434',modules:MODULES};
  const fail=(code,text,status=409)=>{throw new ApiError(text,status,{error:{code,message:text,operationOutcome:'rejected'}});};
  function bindingFor(memberId,expectedSettingsRevision) {
    if(expectedSettingsRevision!==settings.settingsRevision)fail('STALE_SETTINGS','AI 成員設定已更新，請重新載入最新設定。');
    const member=settings.members.find(value=>value.id===memberId);
    if(!member?.enabled)fail('MEMBER_DISABLED','這位成員尚未勾選或不存在。');
    return {memberId:member.id,memberNickname:member.nickname,provider:member.provider,model:member.model,ollamaUrl:member.ollamaUrl || '',boundAt:now()};
  }
  function requireProjectModel(raw,body) {
    const binding=raw.aiBinding;if(!binding)fail('PROJECT_MODEL_REQUIRED','請先為此專案選定固定 AI 成員與模型。');
    const member=settings.members.find(value=>value.id===binding.memberId);
    if(!member?.enabled)fail('MEMBER_DISABLED','此專案的固定 AI 成員已停用，請到系統設定重新啟用。');
    if(member.provider!==binding.provider || member.model!==binding.model || (member.ollamaUrl || '')!==binding.ollamaUrl)fail('PROJECT_MODEL_CHANGED','此專案的固定模型設定已變更，請恢復原模型設定；不會改用其他模型。');
    if(!body.consent || !settings.usageConsent)fail('CONSENT_REQUIRED','請先在系統設定同意使用範圍，並確認這次操作。',400);
    if(body.approvedMemberId!==undefined && body.approvedMemberId!==binding.memberId)fail('PROJECT_MODEL_CHANGED','這次確認的成員與專案固定模型不同。');
    if((body.approvedProvider!==undefined && body.approvedProvider!==binding.provider) || (body.approvedModel!==undefined && body.approvedModel!==binding.model))fail('PROJECT_MODEL_CHANGED','這次確認的模型與專案固定模型不同。');
    if(body.approvedSettingsRevision!==undefined && body.approvedSettingsRevision!==settings.settingsRevision)fail('STALE_SETTINGS','AI 設定已更新。');
    if(body.approvedKeyRevision!==undefined && body.approvedKeyRevision!==settings.keyRevision)fail('STALE_KEY','金鑰狀態已更新。');
  }
  function demoBrief(type,chartMode='flowchart') {
    if(type==='mindmap')return scriptedMindmapBrief();
    if(type==='vector')return scriptedVectorBrief();
    if(type==='webpage')return scriptedWebpageBrief();
    const brief=clone(DEMO_BRIEF);
    if(type==='short_text'){brief.items=[{id:'body',label:'全文'}];brief.summary='為社區影像展撰寫一篇溫暖、清楚的宣傳短文，邀請居民與創作者從日常生活看見故事。';}
    if(type==='article'){brief.items=[{id:'paragraph-1',label:'開場'},{id:'paragraph-2',label:'展覽內容'},{id:'paragraph-3',label:'邀請與結語'}];brief.summary='以開場、展覽內容及邀請結語三段介紹社區影像展，讓居民與創作者理解活動意義，從日常生活看見故事。';}
    if(isArtifactType(type)){
      const table=type==='table',flow=!table && chartMode==='flowchart';
      return {items:[{id:'document',label:table?'表格內容':'圖表來源'}],purpose:table?'展示活動時段表格的編輯與版本保存。':flow?'展示流程圖節點、連線與版本保存。':'展示參觀人次統計圖表的編輯與版本保存。',audience:'想了解操作流程的示範使用者。',message:flow?'全部流程步驟、判斷與連線皆為固定的虛構示範，不代表使用者提供的真實流程。':'全部時段、活動名稱與人數皆為虛構示範資料，不代表使用者提供的真實資料。',tone:'清楚易讀，明確標示示範。',constraints:(table?'':flow?'示範種類：流程圖（flowchart），文字來源使用安全 Mermaid 子集。':'示範種類：統計圖表（bar），文字來源使用 TSV。')+'固定腳本，不解析使用者資料、不使用 AI；示範資料不可當作真實活動資訊。',summary:table?'用虛構活動時段資料建立一個完整表格候選，示範結構編輯、另存、比較與固定引用。':flow?'用虛構的想法整理流程建立一個完整流程圖候選，示範節點、判斷、連線、安全文字來源、另存與固定引用。':'用虛構參觀人次建立一個完整統計圖表候選，示範 TSV 來源、圖形預覽、另存與固定引用。'};
    }
    return brief;
  }
  function markDirectionReady(raw,p,kind='summary') {
    const chartChoice=[...p.messages].reverse().find(entry=>entry.role==='student' && /流程圖|參觀人次/u.test(entry.text));
    const chartMode=chartChoice && /參觀人次/u.test(chartChoice.text) && !/流程圖/u.test(chartChoice.text)?'bar':'flowchart';
    p.brief=demoBrief(p.type,chartMode);p.phase='summary';p.summaryRevision=raw.revision+1;p.goalApprovedAt=null;p.lifecycle='in_progress';
    message(p,'assistant',`${p.brief.summary}\n主軸已可進入下一步，請按「確認方向並生成候選」；你也可以繼續輸入想法。\n（固定示範方向，不是真實 AI 推論；不代表已理解或採用你提供的資料）`,kind,{question:'',choices:[],directionStatus:'ready',direction:clone(p.brief),goalSnapshot:clone(p.brief)});
  }
  function message(project,role,text,kind='discussion',extra={}) {
    const value={id:id('message'),role,text,kind,at:now(),...extra};
    if(role==='assistant')value.provenance=provenance(project);project.messages.push(value);return value;
  }
  function scriptedQuestion(raw,item,question,choices,baseVersionId=null,targetItemIds=[],targetNodeId=null) {
    return {question,choices:clone(choices),choiceContext:{itemId:item.id,officialVersionId:item.officialVersionId,sharedContextRevision:raw.sharedContextRevision,itemTitle:item.title,itemDescription:item.description,baseVersionId,targetItemIds:clone(targetItemIds),...(item.type==='mindmap'&&baseVersionId?{targetNodeId}:{})}};
  }
  function newItem(type,title,description='') {
    const item={id:id('item'),type,title,description,enabled:MODULES.some(module=>module.id===type && module.enabled),archived:false,references:[],lifecycle:'created',phase:'discussion',messages:[],brief:null,summaryRevision:null,goalApprovedAt:null,versions:[],archivedVersionIds:[],officialVersionId:null,finalizedVersionId:null,finalizedAt:null,finalizations:[],comparisons:[],createdAt:now()};
    message(item,'system',item.enabled?'腳本示範，不是真實 AI。所有回覆事先寫好，不會送出任何網路請求。'+(type==='interactive'?'互動視覺需使用本機版，此離線腳本尚未提供此類示範。':['illustrated','poster'].includes(type)?'圖文與海報排版需使用本機版；此離線腳本沒有提供這兩類示範。':type==='image'?'圖片功能需要已安裝本機版的私有儲存；離線示範不接受上傳或分析。':type==='vector'?'向量圖形是事先寫好的虛構幾何示範，不是 AI 生成或你的真實設計。':type==='mindmap'?'心智圖主題與待選分支全部虛構，勾選後才加入草稿。':isArtifactType(type)?'表格與圖表的初始資料全部虛構，僅供操作示範，不是你提供的實際資料。':''):'這個類型尚未實作，只能保存規劃與其他項目的固定引用。','demo_notice');return item;
  }
  function newProject(title,description='',aiBinding=null) {
    const item=newItem('titles','標題名稱');
    const project={id:id('project'),title,description,aiBinding,projectLifecycle:'created',projectFinalizations:[],revision:1,sharedContextRevision:0,activeItemId:item.id,creativeItems:[item],updatedAt:now()};projects.set(project.id,project);return project;
  }
  function view(project) {
    const item=project.creativeItems.find(i=>i.id===project.activeItemId);
    const projection={...project,activeItem:item,module:item.type};
    for(const field of ['phase','lifecycle','messages','brief','summaryRevision','goalApprovedAt','versions','archivedVersionIds','officialVersionId','finalizedVersionId','finalizedAt','finalizations','comparisons','references'])projection[field]=item[field];
    return clone(projection);
  }
  function checkedArtifact(value,type) {
    const error=validateArtifact(value,type);if(error)throw new ApiError(error,400);
    const artifact=cloneArtifact(value);
    if(type==='chart')artifact.sourceText=artifact.sourceText.replace(/\r\n/g,'\n');
    return artifact;
  }
  function artifactTitle(artifact,items) {return String(artifact?.kind==='table'?artifact.caption:['chart','vector','webpage'].includes(artifact?.kind)?artifact.title:artifact?.kind==='mindmap'?artifact.nodes.find(node=>node.id===artifact.rootId).label:items[0].content).slice(0,180);}
  function scriptedArtifact(type,brief) {
    if(type==='mindmap')return scriptedMindmapArtifact(brief);
    if(type==='vector')return scriptedVectorArtifact(brief);
    if(type==='webpage')return scriptedWebpageArtifact(brief);
    if(type==='chart' && !brief?.constraints?.includes('示範種類：統計圖表'))return {kind:'chart',chartType:'flowchart',title:'想法整理流程（虛構示範）',xLabel:'',yLabel:'',sourceText:'flowchart TD\nStart("開始")\nIdea["整理想法"]\nReview{"確認方向？"}\nDraft["建立候選"]\nStart --> Idea\nIdea --> Review\nReview -->|需要調整| Idea\nReview -->|確認| Draft'};
    return type==='table'?{kind:'table',caption:'活動時段（虛構示範資料）',columns:[{id:'time',label:'時段'},{id:'activity',label:'活動'}],rows:[{id:'morning',cells:['10:00','開場與導覽（虛構）']},{id:'noon',cells:['11:00','作品交流（虛構）']},{id:'afternoon',cells:['14:00','分享時段（虛構）']}]}:{kind:'chart',chartType:'bar',title:'參觀人次（虛構示範資料）',xLabel:'時段',yLabel:'人次',sourceText:'時段\t人次\n上午\t12\n下午\t18\n傍晚\t9'};
  }
  function addGeneratedArtifact(project) {
    const artifact=checkedArtifact(scriptedArtifact(project.type,project.brief),project.type),items=artifactItems(artifact);
    const msg=message(project,'assistant','已建立一個完整的'+(project.type==='vector'?'向量圖形':project.type==='mindmap'?'心智圖':project.type==='table'?'表格':artifact.chartType==='flowchart'?'流程圖':'統計圖表')+'候選。'+(project.type==='vector'?'幾何圖形與文字皆為事先寫好的虛構示範，可選取物件修改並匯出 SVG；沒有解析或採用你的真實設計。':project.type==='mindmap'?'目前圖中只有主題，所有建議分支都是固定的虛構內容，尚未加入圖中；請勾選想要的分支，再另存完整版本。':artifact.chartType==='flowchart'?'所有節點、判斷與連線皆為事先寫好的虛構示範流程，沒有解析或採用你的真實流程。':'所有時段、活動名稱與人數皆為事先寫好的虛構示範資料，沒有解析或採用你的真實資料。')+'\n（固定腳本示範，不是真實 AI 生成）','generation',{versionIds:[]});
    const v={id:id('version'),number:project.versions.length+1,contentType:project.type,...nextVersionCoordinates(project),title:artifactTitle(artifact,items),artifact,items,rationale:'使用明確標示的虛構資料，示範完整結構與版本保存；未推論或補造使用者資料。',goalText:project.brief.summary,goalSource:'ai',changeSummary:'建立一個固定腳本的虛構示範候選。',discussionMessageIds:project.messages.filter(m=>['student','assistant'].includes(m.role)).map(m=>m.id),source:'generated',basedOnVersionId:null,goalSnapshot:{summary:project.brief.summary},referencesSnapshot:clone(project.references || []),messageId:msg.id,createdAt:now(),provenance:clone(msg.provenance)};
    v.goalAndRationale=versionGoalAndRationale(v);project.versions.push(v);msg.versionIds.push(v.id);project.phase='work';project.lifecycle='in_progress';
  }
  function addGenerated(project) {
    if(isArtifactType(project.type)){addGeneratedArtifact(project);return;}
    const msg=message(project,'assistant',(project.type==='article'?'已建立一個包含完整段落的文章候選。你可以選擇來源版本與段落範圍繼續修改，原內容會完整保留。':'這一組候選展示三種不同角度。它們會一起保留，你可以選一個繼續編輯，也可以把幾個版本放在一起比較。')+'\n（固定腳本示範，不是真實 AI 生成）','generation',{versionIds:[]});
    (project.type==='article'?SCRIPTED_CANDIDATES.slice(0,1):SCRIPTED_CANDIDATES).forEach((candidate,index)=>{
      let items=[{id:'zh-title',label:'中文名稱',content:candidate.title},{id:'en-title',label:'英文名稱',content:['Everyday, In Light','Stories Between Us','Frames Unfinished'][index]},{id:'tagline',label:'宣傳短句',content:['每一個平凡瞬間，都值得被看見。','靠近彼此，故事就開始了。','把生活留在畫面裡，讓故事繼續。'][index]}];
      if(project.type==='short_text')items=[{id:'body',label:'全文',content:[
        '把日常，放映成光。社區影像展邀請你從街角與生活片段裡，看見熟悉卻未曾停下來欣賞的故事。居民與創作者一起分享畫面，讓每一個平凡瞬間都有被看見的機會。',
        '故事，就在我們之間。帶著好奇走進社區影像展，與居民、創作者一起發現生活裡的小小光亮。不必熟悉電影，也能在一個畫面、一段回憶中找到共鳴。',
        '那些未完的畫面，等待我們一起觀看。社區影像展用熟悉的生活片段，串起居民與創作者的故事。邀請你暫停腳步，讓日常開啟新的想像。'
      ][index]}];
      if(project.type==='article')items=[{id:'paragraph-1',label:'開場',content:`${candidate.title}。每天走過的街道、熟悉的店家與回家的路，都有等待被看見的故事。社區影像展從這些生活片段出發，邀請觀眾重新觀看自己的日常。`},{id:'paragraph-2',label:'展覽內容',content:'展覽匯集居民與創作者的影像作品，記錄人與地方之間的連結。從街角的問候到一段共同回憶，每個畫面都帶來不同的觀看角度，也讓平凡生活留下可以分享的痕跡。'},{id:'paragraph-3',label:'邀請與結語',content:['不論你是熟悉影像的創作者，或第一次走進影展的觀眾，都歡迎一起觀看、交流。讓我們把日常放映成光，發現身邊值得被記住的故事。','故事不只在銀幕上，也在我們彼此之間。歡迎居民與創作者帶著好奇走進影展，用自己的生活經驗回應這些畫面。','畫面可以結束，故事仍會繼續。邀請每位觀眾停下腳步，從作品裡找到自己的生活片段，帶著新的眼光回到熟悉的日常。'][index]}];
      const v={id:id('version'),number:project.versions.length+1,contentType:project.type,...nextVersionCoordinates(project),...candidate,title:items[0].content.slice(0,180),items,goalText:['以影像意象讓觀眾重新看見生活日常。','強調觀眾與創作者之間的親近感及共同故事。','以生活片段與未完成的畫面留下想像空間。'][index],goalSource:'ai',changeSummary:`固定腳本候選方向：${candidate.rationale}`,discussionMessageIds:project.messages.filter(m=>['student','assistant'].includes(m.role)).map(m=>m.id),source:'generated',basedOnVersionId:null,goalSnapshot:clone(project.brief),referencesSnapshot:clone(project.references || []),messageId:msg.id,createdAt:now(),provenance:provenance(project)};v.goalSnapshot={summary:v.goalText};v.goalAndRationale=versionGoalAndRationale(v);project.versions.push(v);msg.versionIds.push(v.id);
    });project.phase='work';project.lifecycle='in_progress';
  }
  function addSnapshot(project,items,rationale,basedOnVersionId=null,versionMode='major',goalText=undefined,goalAndRationale=undefined,artifact=undefined) {
    if(isArtifactType(project.type)){artifact=checkedArtifact(artifact,project.type);items=artifactItems(artifact);}
    const base=project.versions.find(v=>v.id===basedOnVersionId);goalText=goalText===undefined?(base?versionGoalText(base):project.brief?.summary || ''):goalText;
    if(goalAndRationale!==undefined){goalText=base?versionGoalText(base):project.brief?.summary || '';rationale=base?.rationale || '';}
    const msg=message(project,'system','你把工作區的編輯成果另存成新版本。原版本保持不變。','snapshot',{versionIds:[]});
    const v={id:id('version'),number:project.versions.length+1,contentType:project.type,...nextVersionCoordinates(project,versionMode,project.versions.find(v=>v.id===basedOnVersionId)),title:artifactTitle(artifact,items),items:clone(items),...(artifact?{artifact}:{}),rationale,goalText,goalSource:'user',changeSummary:rationale,discussionMessageIds:clone(project.versions.find(v=>v.id===basedOnVersionId)?.discussionMessageIds || []),source:'snapshot',basedOnVersionId,goalSnapshot:clone(project.brief),referencesSnapshot:clone(project.references || []),messageId:msg.id,createdAt:now(),provenance:null};
    v.goalSnapshot={summary:v.goalText};if(goalAndRationale!==undefined)v.changeSummary=base?.changeSummary || '';v.goalAndRationale=goalAndRationale===undefined?versionGoalAndRationale(v):goalAndRationale;project.versions.push(v);msg.versionIds.push(v.id);project.phase='work';project.lifecycle='in_progress';return v;
  }
  function addScriptedRevision(project,base,items,targetItemIds=[],artifact=undefined) {
    if(isArtifactType(project.type)){artifact=checkedArtifact(artifact===undefined?base.artifact:artifact,project.type);items=artifactItems(artifact);}
    const changed=items.filter(item=>item.content!==base.items.find(previous=>previous.id===item.id)?.content);
    const summary=changed.length?`固定腳本逐字替換${changed.map(item=>`「${item.label}」`).join('、')}，其餘內容不變。`:'固定腳本保留完整內容，僅調整明確指定的目標。';
    const msg=message(project,'assistant','已逐字替換你明確指定的內容，其餘項目原樣保留。請閱讀完整修改版與差異，再決定是否採用。\n（固定字串替換示範，不是真實 AI）','revision',{versionIds:[]});
    const v={id:id('version'),number:project.versions.length+1,contentType:project.type,...nextVersionCoordinates(project,'minor',base),title:artifactTitle(artifact,items),items:clone(items),...(artifact?{artifact}:{}),rationale:'固定腳本僅替換明確指定的內容，未修改其他內容。',goalText:versionGoalText(base),goalSource:'ai',changeSummary:summary,discussionMessageIds:[project.messages.at(-2).id,msg.id],source:'revision',basedOnVersionId:base.id,targetItemIds:clone(targetItemIds),goalSnapshot:clone(project.brief),referencesSnapshot:clone(project.references || []),messageId:msg.id,createdAt:now(),provenance:clone(msg.provenance)};
    v.goalSnapshot={summary:v.goalText};v.goalAndRationale=typeof base.goalAndRationale==='string'?[base.goalAndRationale,`本次修改：\n${v.changeSummary}`].filter(Boolean).join('\n\n'):versionGoalAndRationale(v);project.versions.push(v);msg.versionIds.push(v.id);project.phase='work';project.lifecycle='in_progress';return v;
  }
  function addComparison(project,versionIds,question='') {
    const msg=message(project,'assistant','各版本創作內容的比較已整理在右側。各版本有不同優點與取捨，沒有自動選出贏家，也沒有變更正式版。\n（固定腳本意見，不是真實 AI 評估）','comparison');
    const comparison={id:id('comparison'),versionIds:[...versionIds],question,goalBasis:'version_snapshots',versionGoalSnapshots:versionIds.map(versionId=>({versionId,goalSnapshot:clone(project.versions.find(v=>v.id===versionId).goalSnapshot || null),goalText:versionGoalText(project.versions.find(v=>v.id===versionId)),goalAndRationale:versionGoalAndRationale(project.versions.find(v=>v.id===versionId)),goalSource:project.versions.find(v=>v.id===versionId).goalSource || null,changeSummary:project.versions.find(v=>v.id===versionId).changeSummary || '',rationale:project.versions.find(v=>v.id===versionId).rationale || '',discussionMessageIds:clone(project.versions.find(v=>v.id===versionId).discussionMessageIds || [])})),goalSnapshot:null,referencesSnapshot:clone(project.references || []),items:versionIds.map((versionId,index)=>({versionId,fit:index===0?'名稱與宣傳短句方向一致，能連結這次展示情境。':'情感較直接，能邀請讀者走進創作者的故事。',strength:index===0?'中英文名稱有共同意象，宣傳短句能接續同一方向。':'親近、好理解，容易形成觀眾共鳴。',tradeoff:index===0?'意象較多，可能需要副標補充活動資訊。':'名稱、短句與短文的語氣可以再確認是否一致。',suggestion:index===0?'可以試著調整動詞，讓語氣更主動。':'保留情緒核心，再考慮是否加入影像相關詞彙。'})),summary:'這些版本適合不同的溝通重點：有的強調影像意象，有的強調人與故事的關係。請回到你最希望觀眾記得的那件事，決定下一步。'+(question?' 這是固定腳本示範，不會因比較問題而改寫分析。':''),messageId:msg.id,createdAt:now(),provenance:provenance(project)};
    if(isArtifactType(project.type)){
      comparison.items=versionIds.map(versionId=>({versionId,fit:'請對照這個版本保存的完整資料與本版目標。',strength:'完整原生內容、資料來源與版本紀錄都保持不變。',tradeoff:'固定腳本沒有分析資料真實性、呈現品質或不同版本的優劣。',suggestion:project.type==='vector'?'逐一檢查圖形、文字、顏色、位置及圖層遮擋，依各版本自己的目標判斷；固定腳本沒有看圖評比。':project.type==='mindmap'?'區分已加入的節點與待選建議，檢查節點名稱、說明與父子關係；不要把未採用建議當成作品內容。':project.type==='table'?'逐欄檢查欄位名稱、列內容及表格說明。':'逐項檢查圖表類型、標題，以及流程節點／連線或統計資料來源。'}));
      comparison.summary='這是版本並排檢視的固定操作提示，不是內容評估或 AI 分析；請自行檢閱完整資料、各版目標與差異。'+(question?' 已保存你的比較問題，固定腳本不會解析或回答該問題。':'');
      msg.text='已保存選定版本的比較紀錄；完整結構化作品保持在各自的固定版本中。固定腳本只提供操作提示，不判斷優劣，也不會變更正式版。';
    }
    project.comparisons.push(comparison);msg.comparisonId=comparison.id;msg.goalBasis=comparison.goalBasis;msg.text+='\n'+COMPARISON_SNAPSHOT_NOTE;return comparison;
  }
  function pinVersion(version) {
    const pinned=clone(version);delete pinned.fusionSourceSnapshots;
    if(Array.isArray(pinned.referencesSnapshot))pinned.referencesSnapshot=pinned.referencesSnapshot.map(reference=>{const source=reference.versionSnapshot;delete reference.versionSnapshot;reference.sourceProvenance=source?.provenance || null;return reference;});
    return pinned;
  }
  function decimalIdentity(value) {
    const negative=value.startsWith('-');let [integer='',fraction='']=value.replace(/^[+-]/,'').split('.');
    integer=integer.replace(/^0+/,'') || '0';fraction=fraction.replace(/0+$/,'');
    return (negative && (integer!=='0' || fraction)?'-':'')+integer+(fraction?'.'+fraction:'');
  }
  const setSignature=values=>JSON.stringify([...new Set(values.map(value=>JSON.stringify(value)))].sort());
  function flowSignature(graph) {return JSON.stringify([graph.direction,setSignature(graph.nodes.map(node=>[node.id,node.label,node.shape])),setSignature(graph.edges.map(edge=>[edge.from,edge.to,edge.label]))]);}
  function fuseArtifacts(sources,type) {
    if(type==='vector'){try{return fuseScriptedVectors(sources.map(source=>source.artifact));}catch(error){throw new ApiError(error.message,400);}}
    if(type==='webpage'){try{return fuseScriptedWebpages(sources.map(source=>source.artifact));}catch(error){throw new ApiError(error.message,400);}}
    if(type==='mindmap'){try{return fuseScriptedMindmaps(sources.map(source=>source.artifact));}catch(error){throw new ApiError(error.message,400);}}
    const artifacts=sources.map(source=>checkedArtifact(source.artifact,type)),artifact=cloneArtifact(artifacts[0]);
    if(type==='chart' && artifacts.some(source=>source.chartType==='flowchart')){
      if(artifacts.some(source=>source.chartType!=='flowchart'))throw new ApiError('固定腳本不能混合流程圖與統計圖表，沒有建立融合版。',400);
      const graphs=artifacts.map(source=>parseFlowchartSource(source.sourceText)),first=graphs[0];
      if(graphs.some(graph=>graph.direction!==first.direction))throw new ApiError('固定腳本只能合併方向相同的流程圖，沒有建立融合版。',400);
      const nodes=clone(first.nodes),edges=clone(first.edges),nodeMap=new Map(nodes.map(node=>[node.id,node])),edgeKeys=new Set(edges.map(edge=>JSON.stringify([edge.from,edge.to,edge.label])));
      for(const graph of graphs.slice(1)){
        for(const node of graph.nodes){
          const previous=nodeMap.get(node.id);
          if(previous){if(previous.label!==node.label || previous.shape!==node.shape)throw new ApiError('所選流程圖有相同節點 ID，但文字或形狀不同；固定腳本不會猜測取捨，沒有建立融合版。',400);continue;}
          nodeMap.set(node.id,node);nodes.push(clone(node));
        }
        for(const edge of graph.edges){const key=JSON.stringify([edge.from,edge.to,edge.label]);if(!edgeKeys.has(key)){edgeKeys.add(key);edges.push(clone(edge));}}
      }
      const mergedSignature=flowSignature({direction:first.direction,nodes,edges});
      if(graphs.some(graph=>flowSignature(graph)===mergedSignature))throw new ApiError('至少一個所選來源已包含合併後的完整流程；固定腳本不會僅改標題、排列或文字格式，便另存成融合版。',400);
      const delimiters={rect:['[',']'],diamond:['{','}'],round:['(',')']};
      artifact.sourceText=['flowchart '+first.direction,...nodes.map(node=>node.id+delimiters[node.shape][0]+'"'+node.label+'"'+delimiters[node.shape][1]),...edges.map(edge=>edge.from+' -->'+(edge.label?'|"'+edge.label+'"|':'')+' '+edge.to)].join('\n');
      return checkedArtifact(artifact,type);
    }
    if(type==='table'){
      if(artifacts.some(source=>JSON.stringify(source.columns.map(column=>[column.id,column.label]))!==JSON.stringify(artifact.columns.map(column=>[column.id,column.label]))))throw new ApiError('固定腳本只能合併欄位 ID、名稱與順序完全相同的表格；這次沒有建立融合版。',400);
      const seen=new Set(artifact.rows.map(row=>JSON.stringify(row.cells))),ids=new Set(artifact.rows.map(row=>row.id));let next=0;
      for(const source of artifacts.slice(1))for(const row of source.rows){
        const key=JSON.stringify(row.cells);if(seen.has(key))continue;seen.add(key);
        let rowId=row.id;while(ids.has(rowId))rowId=`fusion-row-${++next}`;ids.add(rowId);artifact.rows.push({id:rowId,cells:clone(row.cells)});
      }
      const mergedSignature=setSignature(artifact.rows.map(row=>row.cells));
      if(artifacts.some(source=>setSignature(source.rows.map(row=>row.cells))===mergedSignature))throw new ApiError('至少一個所選來源已包含合併後的完整資料列；固定腳本不會僅改說明、排列或列 ID，便另存成融合版。',400);
    }else{
      const parsed=artifacts.map(source=>parseChartSource(source.sourceText,source.chartType)),first=parsed[0];
      if(artifacts.some((source,index)=>source.chartType!==artifact.chartType || source.xLabel!==artifact.xLabel || source.yLabel!==artifact.yLabel || parsed[index].categoryLabel!==first.categoryLabel || JSON.stringify(parsed[index].series.map(series=>series.label))!==JSON.stringify(first.series.map(series=>series.label))))throw new ApiError('固定腳本只能合併圖表類型、座標軸與 TSV 欄位相同的圖表；這次沒有建立融合版。',400);
      const trailingLF=artifact.sourceText.endsWith('\n'),rows=artifact.sourceText.split('\n'),seen=new Map(first.labels.map((label,index)=>[label,rows[index+1].split('\t').slice(1).map(decimalIdentity)]));
      if(trailingLF)rows.pop();
      for(let sourceIndex=1;sourceIndex<artifacts.length;sourceIndex++){
        const sourceRows=artifacts[sourceIndex].sourceText.split('\n'),data=parsed[sourceIndex];
        data.labels.forEach((label,index)=>{
          const values=sourceRows[index+1].split('\t').slice(1).map(decimalIdentity);
          if(seen.has(label)){if(JSON.stringify(seen.get(label))!==JSON.stringify(values))throw new ApiError('所選圖表有同名分類但數值不同；固定腳本不會猜測或改寫數值，請先明確整理來源。',400);return;}
          seen.set(label,values);rows.push(sourceRows[index+1]);
        });
      }
      const mergedSignature=setSignature([...seen].map(([label,values])=>[label,...values]));
      if(artifacts.some((source,index)=>{
        const sourceRows=source.sourceText.split('\n');
        return setSignature(parsed[index].labels.map((label,rowIndex)=>[label,...sourceRows[rowIndex+1].split('\t').slice(1).map(decimalIdentity)]))===mergedSignature;
      }))throw new ApiError('至少一個所選來源已包含合併後的完整分類與數值；固定腳本不會僅改標題、排列或數字格式，便另存成融合版。',400);
      artifact.sourceText=rows.join('\n')+(trailingLF?'\n':'');
    }
    return checkedArtifact(artifact,type);
  }
  function addFusion(project,versionIds,question='') {
    const sources=versionIds.map(versionId=>project.versions.find(version=>version.id===versionId));
    // Deterministic sampling is not model inference: preserve the first source's schema,
    // take matching fields in source order, and show the literal construction method.
    const artifact=isArtifactType(project.type)?fuseArtifacts(sources,project.type):null;
    const items=artifact?artifactItems(artifact):sources[0].items.map((item,index)=>clone(sources[index%sources.length].items.find(candidate=>candidate.id===item.id && candidate.label===item.label) || item));
    if(project.type==='short_text')items[0].content=sources.map(source=>source.items[0].content).join('\n\n');
    if(!validItems(items,project.type))throw new ApiError('示範融合結果超過內容限制，請減少來源版本或縮短內容。',400);
    const method=project.type==='webpage'?'依選取順序合併相容的完整內容區塊，保留既有區塊識別碼與頁內導覽；衝突時拒絕，不捏造外部圖片、表單或網站功能':project.type==='vector'?'依選取順序追加相容的新圖形物件，保留第一份來源的畫布、背景與既有圖層順序；不猜測相衝突的圖形內容或外部工具相容性':project.type==='mindmap'?'合併已在來源中加入的相容節點，待選建議仍保持待選；不推測關係、不把未勾選建議加入圖中':project.type==='table'?'依選取順序加入不同的完整資料列，相同儲存格內容的列不重複加入；保留第一份來源的欄位與說明，僅在列 ID 衝突時另建 ID':project.type==='chart'?(artifact.chartType==='flowchart'?'依選取順序合併已宣告的相容節點與不同連線，保留第一份來源的標題與方向；重新排列成安全文字來源，不新增任何未在來源出現的連線':'依選取順序加入新分類，跳過同名且同值的分類；保留第一份來源的圖表類型、標題、座標軸與欄位，不計算或改寫數值'):'依選取順序輪流取用同名欄位；短文則逐篇串接';
    const goal='固定腳本未綜合或重新判斷來源目標；下方逐版保留本版目標與修改意見，請自行審閱。';
    const combined=[goal,...sources.map(source=>`${versionLabel(source)} 來源目標與修改意見：\n${versionGoalAndRationale(source) || '此舊版未保存目標與修改意見。'}`),`本次固定腳本操作：\n${method}`].join('\n\n');
    if(combinedMetadataError(combined))throw new ApiError('完整來源目標與意見合計超過示範融合的 12,000 位元組限制；未省略、未截斷，也沒有建立融合版。請減少來源版本。',400);
    const msg=message(project,'assistant',`已建立獨立的融合候選，沒有變更任何來源或正式版。固定腳本只會${method}，不是真實 AI 融合。`,'fusion',{versionIds:[]});
    const rationale=`固定腳本${method}，僅示範融合版本與來源快照的保存方式。`;
    const v={id:id('version'),number:project.versions.length+1,contentType:project.type,...nextVersionCoordinates(project),title:artifactTitle(artifact,items),items,...(artifact?{artifact}:{}),rationale,goalText:goal,goalSource:'ai',changeSummary:'建立獨立融合候選；原版本和正式版維持不變。'+(question?' 已保存融合重點，但固定腳本不會解析或依此重寫內容。':''),discussionMessageIds:[msg.id],source:'fusion',basedOnVersionId:null,fusionSourceVersionIds:[...versionIds],fusionSourceSnapshots:sources.map(pinVersion),fusionInstruction:question,goalSnapshot:{summary:goal},referencesSnapshot:clone(project.references || []),messageId:msg.id,createdAt:now(),provenance:clone(msg.provenance)};
    v.goalAndRationale=combined;project.versions.push(v);msg.versionIds.push(v.id);project.phase='work';project.lifecycle='in_progress';return v;
  }
  if(seed) {
    const project=newProject('社區影像展 · 共創企劃','為年度社區影像展規劃名稱、宣傳與主視覺。希望邀請居民、創作者與第一次來看影展的觀眾，從日常看見故事。',bindingFor(settings.activeMemberId,settings.settingsRevision));
    const p=project.creativeItems[0];p.title='影像展創作內容';p.description='中文名稱、英文名稱與宣傳短句，也可以延伸策展短文。';
    message(p,'student','我想替社區影像展取一個主標題，會用在海報上。');
    message(p,'assistant','這次最希望吸引誰來看？先想像一位會站在海報前的觀眾。');
    message(p,'student','主要是居民與創作者，也想讓不熟悉電影的人願意走進來。');
    message(p,'assistant','如果觀眾看完只能記得一件事，你希望那是什麼？');
    message(p,'student','日常裡也有值得被看見的故事。希望溫暖、有畫面，不要太難懂。');
    message(p,'assistant','想法已經很清楚了。我們可以先把用途、對象與核心訊息整理成目標，再由你確認。');
    p.brief=clone(DEMO_BRIEF);message(p,'assistant',DEMO_BRIEF.summary,'summary');
    p.goalApprovedAt=now();message(p,'system','你確認了創作目標。這一步不會自動產生候選。','goal_approved');
    addGenerated(p);
    const version=addSnapshot(p,[{id:'zh-title',label:'中文名稱',content:'讓日常，被看見'},{id:'en-title',label:'英文名稱',content:'Everyday, Seen'},{id:'tagline',label:'宣傳短句',content:'鏡頭裡，有我們一起生活的痕跡。'},{id:'curatorial-note',label:'策展短文',content:'從街角巷弄到回家的路，每一段熟悉的日常都藏著故事。邀請你停下腳步，從這些作品裡，看見我們的生活。'}],'把較抽象的意象改成直接邀請，希望觀眾能一眼理解。',p.versions[0].id);
    p.officialVersionId=version.id;p.title=officialItemTitle(version.items);message(p,'system',`你將 ${versionLabel(version)}「${version.title}」設為正式版。所有候選仍保留。`,'promotion',{versionIds:[version.id]});
    addComparison(p,[version.id,p.versions[0].id,p.versions[1].id]);project.revision=10;project.projectLifecycle='in_progress';
    const poster=newItem('poster','主視覺海報規劃','未來將引用創作內容，發展活動海報。目前僅保存規劃，尚未提供生成。');
    poster.references.push({id:id('reference'),projectId:project.id,targetItemId:p.id,targetItemTitle:p.title,versionId:version.id,versionSnapshot:pinVersion(version),pinnedAt:now()});project.creativeItems.push(poster);
  }
  function state() {return {...settings,projects:[...projects.values()].map(p=>({id:p.id,title:p.title,description:p.description,projectLifecycle:p.projectLifecycle,lifecycle:p.projectLifecycle,itemCount:p.creativeItems.length,updatedAt:p.updatedAt})).reverse()};}
  async function request(action,body={}) {
    if(action==='state')return clone(state());
    if(action==='new')return {project:view(newProject(body.title || '新的創作專案',body.description || '',body.memberId?bindingFor(body.memberId,body.expectedSettingsRevision):null))};
    if(action==='list_models')throw new ApiError('離線腳本示範無法讀取真實模型清單，沒有連接任何服務。',400);
    if(['save_members','select_member'].includes(action) && body.expectedSettingsRevision!==undefined && body.expectedSettingsRevision!==settings.settingsRevision)throw new ApiError('AI 成員設定已更新，請重新載入最新設定；你的草稿仍保留。',409);
    if(action==='save_members'){
      if(!Array.isArray(body.members) || body.members.length>20 || new Set(body.members.map(member=>member.id)).size!==body.members.length)throw new ApiError('請保存最多 20 個不同的 AI 成員。',400);
      if(memberRosterError(body.members))throw new ApiError(memberRosterError(body.members),400);
      if(settings.members.some(old=>!body.members.some(member=>member.id===old.id)))throw new ApiError('請取消勾選既有成員，不要刪除記錄。',400);
      if(body.members.some(member=>!member.id || !member.nickname?.trim() || !['openai','ollama'].includes(member.provider) || !member.model?.trim()))throw new ApiError('每位成員都需要名稱、使用方法與模型。',400);
      settings.members=clone(body.members);settings.activeMemberId=body.activeMemberId && settings.members.some(member=>member.enabled && member.id===body.activeMemberId)?body.activeMemberId:null;settings.usageConsent=body.usageConsent===true;settings.consentAt=settings.usageConsent?now():null;settings.settingsRevision++;
      const active=settings.members.find(member=>member.id===settings.activeMemberId);settings.memberId=active?.id || null;settings.memberNickname=active?.nickname || null;if(active){settings.provider=active.provider;settings.model=active.model;settings.ollamaUrl=active.ollamaUrl;}return clone(state());
    }
    if(action==='select_member'){
      const active=settings.members.find(member=>member.id===body.memberId && member.enabled);if(body.memberId && !active)throw new ApiError('這位成員尚未勾選或不存在。',409);
      settings.activeMemberId=active?.id || null;settings.memberId=active?.id || null;settings.memberNickname=active?.nickname || null;if(active){settings.provider=active.provider;settings.model=active.model;settings.ollamaUrl=active.ollamaUrl;}settings.settingsRevision++;return clone(state());
    }
    if(['set_key','save_settings','clear_key','test_connection'].includes(action))throw new ApiError('腳本示範不設定或測試任何真實 AI 來源。',400);
    const saved=projects.get(body.id);if(!saved)throw new ApiError('找不到這個示範專案。',404);
    // Commit the working copy once, after all validation succeeds. Failed operations
    // never leave half-approved directions or partially appended versions behind.
    const raw=clone(saved),requestKey=body.requestId?`${raw.id}:${body.requestId}`:null;
    if(action==='project')return {project:view(raw)};
    if(requestKey && requests.has(requestKey)){
      const prior=requests.get(requestKey);if(prior.action!==action || prior.itemId!==body.itemId)fail('REQUEST_ID_REUSED','這個請求識別碼已用於另一個操作。');
      return {project:view(raw),...prior.result};
    }
    if(body.revision!==raw.revision)throw new ApiError('示範資料已更新，請重新載入。',409);
    if(action==='bind_project_model'){
      if(raw.aiBinding)fail('PROJECT_MODEL_ALREADY_BOUND','此專案已選定固定模型，不可重新綁定。');
      raw.aiBinding=bindingFor(body.memberId,body.expectedSettingsRevision);raw.revision++;raw.updatedAt=now();projects.set(raw.id,raw);return {project:view(raw)};
    }
    const p=raw.creativeItems.find(i=>i.id===raw.activeItemId);
    const shellActions=['edit_project','create_item','select_item','edit_item','archive_item','restore_item','attach_reference','remove_reference','finalize_project','reopen_project'];
    if(shellActions.includes(action)) {
      if(action==='select_item'){
        if(!raw.creativeItems.some(i=>i.id===body.itemId))throw new ApiError('創作項目不存在。',404);raw.activeItemId=body.itemId;
      }else if(action==='reopen_project'){
        if(raw.projectLifecycle!=='finalized')throw new ApiError('專案尚未結案。',400);raw.projectLifecycle='in_progress';
      }else{
        if(raw.projectLifecycle==='finalized')throw new ApiError('專案已結案，請先重新開啟。',409);
        if(action==='create_item'){
          if(!MODULES.some(m=>m.id===body.type))throw new ApiError('未知項目類型。',400);
          const item=newItem(body.type,body.title,body.description || '');raw.creativeItems.push(item);raw.activeItemId=item.id;
        }else if(action==='edit_project'){
          if(raw.description!==body.description || raw.title!==body.title){raw.sharedContextRevision++;raw.creativeItems.forEach(i=>{i.goalApprovedAt=null;i.summaryRevision=null;i.phase='discussion';});}raw.title=body.title;raw.description=body.description;
        }else if(action==='finalize_project'){
          const active=raw.creativeItems.filter(i=>!i.archived);
          if(!active.length || active.some(i=>i.lifecycle!=='finalized' || !i.goalApprovedAt))throw new ApiError('所有未封存項目都需先定稿。尚未實作的規劃項目可先封存。',409);
          raw.projectFinalizations.push({at:now(),title:raw.title,description:raw.description,items:active.map(i=>({itemId:i.id,itemTitle:i.title,versionSnapshot:clone(i.versions.find(v=>v.id===i.finalizedVersionId))}))});raw.projectLifecycle='finalized';
        }else{
          if(body.itemId!==raw.activeItemId)throw new ApiError('創作項目已切換。',409);
          if(action==='archive_item'){
            if(raw.creativeItems.filter(i=>!i.archived).length<=1)throw new ApiError('至少保留一個未封存項目。',409);p.archived=true;
          }else if(action==='restore_item'){p.archived=false;}
          else{
            if(p.archived)throw new ApiError('請先還原封存項目。',409);
            if(action==='edit_item'){if(p.lifecycle==='finalized')throw new ApiError('請先重新開啟項目，再編輯資料。',409);if(p.title!==body.title || p.description!==body.description){p.goalApprovedAt=null;p.summaryRevision=null;p.phase='discussion';}p.title=body.title;p.description=body.description;}
            else{
              if(p.lifecycle==='finalized')throw new ApiError('請先重新開啟這個項目。',409);
              if(action==='attach_reference'){
                const source=raw.creativeItems.find(i=>i.id===body.targetItemId && i.id!==p.id),version=source?.versions.find(v=>v.id===body.versionId);
                if(!version)throw new ApiError('找不到可引用的來源版本。',400);
                if(isArchivedVersion(source,version.id))throw new ApiError('來源版本已封存，請先還原後再引用。',409);
                if(p.references.some(r=>r.targetItemId===source.id && r.versionId===version.id))throw new ApiError('這份固定版本已經引用過。',409);
                p.references.push({id:id('reference'),projectId:raw.id,targetItemId:source.id,targetItemTitle:source.title,versionId:version.id,versionSnapshot:pinVersion(version),pinnedAt:now()});message(p,'system','你加入一份明確選定的固定引用。來源之後更新不會自動改寫。','reference_added');
              }else{p.references=p.references.filter(r=>r.id!==body.referenceId);message(p,'system','你移除了固定引用，來源版本不變。','reference_removed');}
              p.goalApprovedAt=null;p.summaryRevision=null;p.phase='discussion';
            }
          }
        }
        if(action!=='finalize_project')raw.projectLifecycle='in_progress';
      }
      raw.revision++;raw.updatedAt=now();projects.set(raw.id,raw);return {project:view(raw)};
    }
    if(body.itemId!==raw.activeItemId)throw new ApiError('目前創作項目已切換。',409);
    if(raw.projectLifecycle==='finalized' || p.archived)throw new ApiError('專案已結案或項目已封存，請先重新開啟。',409);
    if(p.type==='interactive')throw new ApiError('受限互動視覺請使用已安裝的本機版；離線腳本尚未提供此類示範，沒有執行程式或呼叫 AI。',409);
    if(['illustrated','poster'].includes(p.type))throw new ApiError('圖文與海報排版請使用已安裝的本機版；離線腳本未提供這兩類的示範，沒有呼叫 AI。',409);
    if(p.type==='image')throw new ApiError('離線腳本示範不提供真實圖片上傳、讀取或分析。請在已安裝的本機版使用；沒有任何圖片或 AI 網路請求。',409);
    if(!p.enabled)throw new ApiError('這個項目類型尚未實作，不能執行 AI 或保存版本。',409);
    if(p.lifecycle==='finalized' && action!=='reopen')throw new ApiError('項目已定稿，請先重新開啟討論。',409);
    if(['discuss','summarize','generate','confirm_generate','compare','fuse'].includes(action))requireProjectModel(raw,body);
    let directionConfirmation=null;
    if(p.type==='webpage' && ['approve_goal','confirm_generate'].includes(action)){
      const error=webpageDirectionConfirmationError(view(raw),body.confirmedDirections,body.directionRevision);if(error)throw new ApiError(error,409);
      directionConfirmation={summaryRevision:p.summaryRevision,style:p.brief.tone,content:p.brief.message,functions:p.brief.constraints};
    }
    let revisionVersionId=null,fusionVersionId=null,directionResult=null;
    switch(action) {
      case 'discuss': {
        if(!String(body.text || '').trim())throw new ApiError('請先寫下想法。',400);
        if(body.officialVersionId!==undefined && body.officialVersionId!==p.officialVersionId)throw new ApiError('正式版已變更，請重新載入後再回應。',409);
        const baseId=body.baseVersionId || p.officialVersionId || null,base=baseId?p.versions.find(version=>version.id===baseId):null;
        if(baseId && (!base || isArchivedVersion(p,baseId)))throw new ApiError('修改來源不存在、屬於其他項目或已封存，請重新選取。',409);
        let targetItemIds=[];
        if(base && p.type==='article'){
          if(!Array.isArray(body.targetItemIds) || !body.targetItemIds.length || new Set(body.targetItemIds).size!==body.targetItemIds.length || body.targetItemIds.some(target=>typeof target!=='string' || !base.items.some(item=>item.id===target)))throw new ApiError('請明確選擇來源文章中要修改的段落，未選段落會保持不變。',400);
          targetItemIds=[...body.targetItemIds].sort();
        }else if(body.targetItemIds!==undefined && (!Array.isArray(body.targetItemIds) || body.targetItemIds.length))throw new ApiError('只有文章修改可指定段落範圍。',400);
        let targetNodeId=null;
        if(base && p.type==='mindmap'){targetNodeId=body.targetNodeId;if(typeof targetNodeId!=='string' || !base.artifact?.nodes.some(node=>node.id===targetNodeId))throw new ApiError('請選擇來源版本中已加入心智圖的節點，待選建議尚不能作為起點。',409);}
        else if(body.targetNodeId!==undefined && body.targetNodeId!==null)throw new ApiError('此階段不接受心智圖節點範圍。',409);
        let studentExtra={};
        if(body.choiceAnswer!==undefined){
          const question=p.messages.at(-1),answer=body.choiceAnswer;
          if(!answer || typeof answer!=='object' || Array.isArray(answer) || Object.keys(answer).length!==2 || typeof answer.questionMessageId!=='string' || typeof answer.choiceId!=='string')throw new ApiError('選項答案格式不正確。',400);
          const context=question?.choiceContext;
          if(!currentChoiceQuestion(view(raw),question,{baseVersionId:baseId,targetItemIds,targetNodeId}) || answer.questionMessageId!==question.id || body.officialVersionId!==p.officialVersionId || context.baseVersionId!==baseId || JSON.stringify(context.targetItemIds)!==JSON.stringify(targetItemIds))throw new ApiError('這個選項問題已失效，請重新載入最新討論或確認修改來源。',409);
          const choice=question.choices.find(option=>option.id===answer.choiceId);
          if(!choice || body.text!==choice.value)throw new ApiError('選項答案與保存的問題不一致。',400);
          studentExtra={choiceAnswer:{questionMessageId:question.id,choiceId:choice.id,label:choice.label,value:choice.value}};
        }
        if(base && p.type==='webpage'){
          let result;try{result=scriptedWebpageRevision(base.artifact,body.text);}catch(error){throw new ApiError(error.message,400);}
          if(result.outcome==='revision'){
            const combined=[versionGoalAndRationale(base),'本次網頁修改：\n'+result.changeSummary].filter(Boolean).join('\n\n');if(combinedMetadataError(combined))throw new ApiError('完整目標與網頁修改意見超過 12,000 位元組，未截斷或建立修改版。',400);
            message(p,'student',body.text,'discussion',{...studentExtra,basedOnVersionId:base.id});
            const revised=addScriptedRevision(p,base,artifactItems(result.artifact),[],result.artifact);revised.revisionInstruction=body.text;revised.changeSummary=result.changeSummary;revised.rationale=result.rationale;revised.goalAndRationale=combined;p.messages.find(m=>m.id===revised.messageId).text=result.reply;revisionVersionId=revised.id;
          }else{message(p,'student',body.text,'discussion',{...studentExtra,basedOnVersionId:base.id});message(p,'assistant',result.reply,'clarification',{...scriptedQuestion(raw,p,result.question || '',result.choices || [],base.id,[]),basedOnVersionId:base.id});p.lifecycle='in_progress';}
          break;
        }
        if(base && p.type==='vector'){
          let result;try{result=scriptedVectorRevision(base.artifact,body.text);}catch(error){throw new ApiError(error.message,400);}
          if(result.outcome==='revision'){
            const combined=[versionGoalAndRationale(base),'本次向量修改：\n'+result.changeSummary].filter(Boolean).join('\n\n');if(combinedMetadataError(combined))throw new ApiError('完整目標與向量修改意見超過 12,000 位元組，未截斷或建立修改版。',400);
            message(p,'student',body.text,'discussion',{...studentExtra,basedOnVersionId:base.id});
            const revised=addScriptedRevision(p,base,artifactItems(result.artifact),[],result.artifact);revised.revisionInstruction=body.text;revised.changeSummary=result.changeSummary;revised.rationale=result.rationale;revised.goalAndRationale=combined;p.messages.find(m=>m.id===revised.messageId).text=result.reply;revisionVersionId=revised.id;
          }else{message(p,'student',body.text,'discussion',{...studentExtra,basedOnVersionId:base.id});message(p,'assistant',result.reply,'clarification',{...scriptedQuestion(raw,p,result.question || '',result.choices || [],base.id,[]),basedOnVersionId:base.id});p.lifecycle='in_progress';}
          break;
        }
        if(base && p.type==='mindmap'){
          let result;try{result=scriptedMindmapRevision(base.artifact,targetNodeId,body.text);}catch(error){throw new ApiError(error.message,400);}
          message(p,'student',body.text,'discussion',{...studentExtra,targetNodeId,basedOnVersionId:base.id});
          if(result.outcome==='revision'){
            const combined=[versionGoalAndRationale(base),'本次待選建議：\n'+result.changeSummary].filter(Boolean).join('\n\n');if(combinedMetadataError(combined))throw new ApiError('完整目標與待選變更意見超過 12,000 位元組，沒有建立修改版或截斷原文。',400);
            const revised=addScriptedRevision(p,base,artifactItems(result.artifact),[],result.artifact);revised.targetNodeId=targetNodeId;revised.revisionInstruction=body.text;revised.changeSummary=result.changeSummary;revised.rationale=result.rationale;revised.goalText=result.goalText || versionGoalText(base);revised.goalSnapshot={summary:revised.goalText};revised.goalAndRationale=combined;
            const msg=p.messages.find(m=>m.id===revised.messageId);msg.text=result.reply;msg.targetNodeId=targetNodeId;revisionVersionId=revised.id;
          }else message(p,'assistant',result.reply,'clarification',{...scriptedQuestion(raw,p,result.question || '',result.choices || [],base.id,[],targetNodeId),basedOnVersionId:base.id,targetNodeId});
          p.lifecycle='in_progress';break;
        }
        if(base && isArtifactType(p.type)){
          const artifact=checkedArtifact(base.artifact,p.type),field=p.type==='table'?'表格說明':'圖表標題',key=p.type==='table'?'caption':'title';
          const command=String(body.text).trim(),match=command.match(p.type==='table'?/^請把表格說明改為「([^「」\r\n]*)」[。！]?$/u:/^請把圖表標題改為「([^「」\r\n]*)」[。！]?$/u),goalMatch=command.match(/^請把本版目標改為「([^「」\r\n]+)」[。！]?$/u);
          const goal=goalMatch?.[1].trim();
          if(match && match[1]!==artifact[key]){
            artifact[key]=match[1];const validated=checkedArtifact(artifact,p.type);
            message(p,'student',body.text,'discussion',studentExtra);const revised=addScriptedRevision(p,base,artifactItems(validated),[],validated);
            revised.changeSummary=`固定腳本僅逐字替換${field}，其餘原生資料完整保留。`;revised.rationale=`依明確字串修改${field}，未解析或改寫資料。`;revised.goalAndRationale=typeof base.goalAndRationale==='string'?[base.goalAndRationale,`本次修改：\n${revised.changeSummary}`].filter(Boolean).join('\n\n'):versionGoalAndRationale(revised);revisionVersionId=revised.id;
          }else if(goal && goal!==versionGoalText(base)){
            const error=snapshotMetadataError(goal,'');if(error)throw new ApiError(error,400);
            message(p,'student',body.text,'discussion',studentExtra);const revised=addScriptedRevision(p,base,base.items,[],artifact);
            revised.goalText=goal;revised.goalSnapshot={summary:goal};revised.changeSummary='固定腳本僅逐字替換本版目標，原生資料完整保留。';revised.rationale='依明確指定的目標文字另存待審修改版。';delete revised.goalAndRationale;revised.goalAndRationale=versionGoalAndRationale(revised);p.messages.find(m=>m.id===revised.messageId).text='已逐字替換你指定的本版目標，完整表格或圖表原樣保留。請閱讀目標差異，再決定是否採用。\n（固定字串替換示範，不是真實 AI）';revisionVersionId=revised.id;
          }else{
            message(p,'student',body.text,'discussion',studentExtra);
            message(p,'assistant',`固定腳本只支援「請把${field}改為「新的文字」」或「請把本版目標改為「新的目標」」，且必須與目前內容不同。其他內容可直接在編輯器修改並另存。這次沒有新增修改版，原生資料與正式版不變。`,'clarification',scriptedQuestion(raw,p,'要示範哪一種明確修改？',[
              {id:'revise-caption',label:`示範修改${field}`,value:`請把${field}改為「${p.type==='table'?'活動時段表':artifact.chartType==='flowchart'?'流程圖':'參觀人次圖'}（新的虛構示範標示）」`},
              {id:'revise-goal',label:'示範修改本版目標',value:'請把本版目標改為「清楚展示虛構示範資料與完整版本差異。」'}
            ],base.id,[]));p.lifecycle='in_progress';
          }
          break;
        }
        if(base){
          // A deliberately narrow literal-command fixture, never semantic rewriting.
          const match=String(body.text).trim().match(/^請把(第一項內容|全文|選取段落)改為「([^「」\r\n]+)」[。！]?$/u);
          const goalMatch=String(body.text).trim().match(/^請把本版目標改為「([^「」\r\n]+)」[。！]?$/u);
          const replacement=match?.[2].trim(),goalReplacement=goalMatch?.[1].trim(),items=clone(base.items);
          const changedIds=p.type==='article'?targetItemIds:[items[0].id];
          if(goalReplacement && goalReplacement!==versionGoalText(base)){
            if(snapshotMetadataError(goalReplacement,''))throw new ApiError(snapshotMetadataError(goalReplacement,''),400);
            message(p,'student',body.text,'discussion',studentExtra);const revised=addScriptedRevision(p,base,items,targetItemIds);revised.goalText=goalReplacement;revised.goalSnapshot={summary:goalReplacement};revised.changeSummary='固定腳本僅替換明確指定的本版目標，完整內容欄位維持不變。';revised.rationale='依照明確指定的目標文字另存待審修改版。';delete revised.goalAndRationale;revised.goalAndRationale=versionGoalAndRationale(revised);p.messages.find(m=>m.id===revised.messageId).text='已逐字替換你指定的本版目標，完整內容欄位原樣保留。請閱讀目標差異，再決定是否採用。\n（固定字串替換示範，不是真實 AI）';revisionVersionId=revised.id;
          }else if(replacement && changedIds.some(target=>items.find(item=>item.id===target).content!==replacement)){
            for(const item of items)if(changedIds.includes(item.id))item.content=replacement;
            if(!validItems(items,p.type))throw new ApiError('這次示範替換超過項目內容限制。',400);
            message(p,'student',body.text,'discussion',studentExtra);revisionVersionId=addScriptedRevision(p,base,items,targetItemIds).id;
          }else{
            const field=p.type==='article'?'選取段落':p.type==='short_text'?'全文':'第一項內容';
            message(p,'student',body.text,'discussion',studentExtra);
            message(p,'assistant',`你希望${field}具體改成什麼文字？請使用「請把${field}改為「你的新內容」」或「請把本版目標改為「你的新目標」」這個固定示範格式，並提供與目前不同的內容。\n（固定腳本追問，不是真實 AI；這次沒有新增修改版，正式內容不變。）`,'clarification',scriptedQuestion(raw,p,'想先示範哪一種明確修改？',[
              {id:'revise-name',label:p.type==='titles'?'示範修改第一項名稱':`示範修改${field}`,value:`請把${field}改為「一起，看見日常」`},
              {id:'revise-goal',label:'示範修改本版目標',value:'請把本版目標改為「以清楚易讀的內容邀請居民看見日常故事。」'}
            ],base.id,targetItemIds));
            p.lifecycle='in_progress';
          }
          break;
        }
        message(p,'student',body.text,'discussion',studentExtra);p.phase='discussion';p.brief=null;p.summaryRevision=null;p.goalApprovedAt=null;p.lifecycle='in_progress';
        if(p.type==='webpage'){
          if(/示範|網頁/u.test(body.text)){markDirectionReady(raw,p,'discussion');directionResult={directionStatus:'ready',direction:clone(p.brief)};break;}
          message(p,'assistant','固定腳本不會解析你的網站需求。可先使用虛構活動網頁，體驗內容區塊、頁內導覽與可展開問答；需分別確認三部分方向，再按生成。','discussion',scriptedQuestion(raw,p,'要使用固定的虛構網頁示範嗎？',[{id:'webpage-demo',label:'使用網頁示範',value:'請使用網頁示範。'},{id:'webpage-continue',label:'繼續自由輸入',value:'我想先繼續說明想法。'}]));break;
        }
        if(p.type==='vector'){
          if(/示範|向量/u.test(body.text)){markDirectionReady(raw,p,'discussion');directionResult={directionStatus:'ready',direction:clone(p.brief)};break;}
          message(p,'assistant','固定腳本不會解析你的設計要求。可使用虛構向量圖，體驗可編輯幾何物件與 SVG 匯出；確認前不建立作品。','discussion',scriptedQuestion(raw,p,'要先使用固定的虛構向量示範嗎？',[{id:'vector-demo',label:'使用向量圖形示範',value:'請使用向量圖形示範。'},{id:'vector-continue',label:'繼續自由輸入',value:'我想先繼續說明想法。'}]));break;
        }
        if(p.type==='mindmap'){
          if(/示範|心智圖|探索/u.test(body.text)){markDirectionReady(raw,p,'discussion');directionResult={directionStatus:'ready',direction:clone(p.brief)};break;}
          message(p,'assistant','這是固定腳本，不會解析你的真實主題。可以用虛構主題示範如何挑選分支；確認前不建立圖形。','discussion',scriptedQuestion(raw,p,'要用固定的虛構主題，試試勾選分支嗎？',[{id:'mindmap-demo',label:'使用心智圖示範',value:'請使用心智圖示範。'},{id:'mindmap-continue',label:'繼續自由輸入',value:'我想先繼續說明想法。'}]));break;
        }
        if(isArtifactType(p.type)){
          if(/示範|活動時段|參觀人次|流程圖/u.test(body.text)){markDirectionReady(raw,p,'discussion');directionResult={directionStatus:'ready',direction:clone(p.brief)};break;}
          const table=p.type==='table',options=scriptedQuestion(raw,p,table?'要使用虛構活動時段，示範表格操作嗎？':'要先使用虛構流程圖，示範節點與連線操作嗎？也可明確選擇統計圖表。',[
            {id:'artifact-demo',label:table?'使用虛構活動時段示範':'使用流程圖示範',value:table?'請使用虛構活動時段示範。':'請使用流程圖示範。'},
            ...(!table?[{id:'statistics-demo',label:'改用虛構參觀人次統計圖',value:'請使用虛構參觀人次示範。'}]:[]),
            {id:'artifact-limits',label:'先看操作與資料限制',value:'請先說明可用操作與資料限制。'}
          ]);directionResult={directionStatus:'exploring',direction:null};
          message(p,'assistant',`${options.question}\n固定腳本不會解析你輸入的資料；初始候選全部是明確標示的虛構範例。對話只支援逐字替換${table?'表格說明':'圖表標題'}或本版目標。產生候選後可在編輯器換成自己的資料，再另存新版本。`,'discussion',{...options,...directionResult});break;
        }
        // This fixture recognizes a few literal sample cues; it does not call a model
        // or imply that arbitrary input has been understood. One complete input is enough.
        const sample=[raw.description,p.description,...p.messages.filter(m=>m.role==='student').map(m=>m.text)].join(' ');
        const hasPurpose=/海報|影展|影像展|宣傳|文章|短文|用途|目的|命名/u.test(sample),hasAudience=/居民|創作者|觀眾|讀者|對象|客群|家長/u.test(sample),hasMessage=/故事|日常|重點|訊息|溫暖|連結|傳達/u.test(sample);
        if(hasPurpose && hasAudience && hasMessage){markDirectionReady(raw,p,'discussion');directionResult={directionStatus:'ready',direction:clone(p.brief)};break;}
        const options=!hasAudience?scriptedQuestion(raw,p,'這次最希望吸引誰？',[
          {id:'neighbors',label:'社區居民',value:'主要希望吸引社區居民。'},
          {id:'creators',label:'影像創作者',value:'主要希望吸引影像創作者。'},
          {id:'newcomers',label:'第一次接觸影展的觀眾',value:'希望第一次接觸影展的觀眾也願意參加。'}
        ]):!hasPurpose?scriptedQuestion(raw,p,'這次內容主要會用在哪裡？',[
          {id:'poster-use',label:'影展海報',value:'這次會用在社區影展海報。'},
          {id:'promotion-use',label:'活動宣傳',value:'這次會用在社區影像展的活動宣傳。'}
        ]):scriptedQuestion(raw,p,'最希望觀眾記得什麼？',[
          {id:'daily-stories',label:'日常裡的故事',value:'日常裡也有值得被看見的故事。'},
          {id:'shared-life',label:'一起生活的連結',value:'希望觀眾記得我們一起生活的連結。'}
        ]);
        directionResult={directionStatus:'exploring',direction:null};
        message(p,'assistant',`${options.question}\n（固定腳本只辨識範例關鍵字，不是真實 AI 理解；也可以隨時整理目前方向。）`,'discussion',{...options,...directionResult});break;
      }
      case 'summarize': {
        if(!p.messages.some(m=>m.role==='student' && (!m.kind || m.kind==='discussion')))throw new ApiError('請先寫下一些創作想法，再整理方向。',400);
        markDirectionReady(raw,p);directionResult={directionStatus:'ready',direction:clone(p.brief)};break;
      }
      case 'approve_goal': {
        if(p.phase!=='summary' || !p.brief)throw new ApiError('請先整理目標。',400);
        p.goalApprovedAt=now();p.phase='ready';p.lifecycle='in_progress';message(p,'system','你已確認這份目標。候選尚未生成，需要另外按下「產生候選」並確認。','goal_approved',{directionConfirmation});break;
      }
      case 'confirm_generate': {
        if(p.phase!=='summary' || !p.brief || !Number.isInteger(p.summaryRevision) || p.summaryRevision>raw.revision)throw new ApiError('請先檢閱最新整理的主軸與方向，再確認生成。',409);
        p.goalApprovedAt=now();p.phase='ready';message(p,'system','你已確認目前主軸與方向，並明確要求產生候選。','goal_approved',{directionConfirmation});addGenerated(p);break;
      }
      case 'generate': {
        if(!canGenerate(p))throw new ApiError('請先確認創作目標。',400);addGenerated(p);break;
      }
      case 'snapshot': {
        if(!p.goalApprovedAt && !p.versions.some(v=>(v.id===p.officialVersionId || v.id===body.basedOnVersionId) && !isArchivedVersion(p,v.id)))throw new ApiError('請先確認創作目標，或明確選取現有版本作為修改來源。',400);
        const artifact=isArtifactType(p.type)?checkedArtifact(body.artifact,p.type):undefined,items=artifact?artifactItems(artifact):body.items;
        if(!validItems(items,p.type))throw new ApiError('內容不符合此類型的欄位、段落或長度限制。',400);
        if(body.basedOnVersionId && (!p.versions.some(v=>v.id===body.basedOnVersionId) || isArchivedVersion(p,body.basedOnVersionId)))throw new ApiError('來源版本不存在或已封存，請先還原。',400);
        if(body.versionMode && !['major','minor'].includes(body.versionMode))throw new ApiError('未知版本模式。',400);
        if(body.versionMode==='minor' && !body.basedOnVersionId)throw new ApiError('小修改必須指定來源版本。',400);
        const source=p.versions.find(v=>v.id===body.basedOnVersionId),goal=body.goalText===undefined?(source?versionGoalText(source):p.brief?.summary || ''):body.goalText;
        const metadataError=body.goalAndRationale!==undefined?combinedMetadataError(body.goalAndRationale):snapshotMetadataError(goal,body.rationale || '');
        if(metadataError)throw new ApiError(metadataError,400);
        addSnapshot(p,items,body.rationale || '',body.basedOnVersionId || null,body.versionMode || 'major',body.goalText,body.goalAndRationale,artifact);break;
      }
      case 'promote': {
        const version=p.versions.find(v=>v.id===body.versionId);if(!version || isArchivedVersion(p,version.id))throw new ApiError('版本不存在或已封存，請先還原。',400);
        p.officialVersionId=version.id;if(p.type==='titles')p.title=officialItemTitle(version.items);p.lifecycle='in_progress';message(p,'system',`你指定 ${versionLabel(version)}「${version.title}」為正式版，其他版本仍完整保留。`,'promotion',{versionIds:[version.id]});break;
      }
      case 'archive_version':
      case 'restore_version': {
        const version=p.versions.find(v=>v.id===body.versionId);if(!version)throw new ApiError('版本不存在。',400);
        if(action==='archive_version' && version.id===p.officialVersionId)throw new ApiError('目前正式版不能封存，請先指定其他正式版。',409);
        const restore=action==='restore_version',archived=isArchivedVersion(p,version.id);
        if(restore?!archived:archived)throw new ApiError(restore?'這個版本尚未封存。':'這個版本已經封存。',409);
        p.archivedVersionIds=restore?p.archivedVersionIds.filter(id=>id!==version.id):[...p.archivedVersionIds,version.id];
        message(p,'system',`${versionLabel(version)} 已${restore?'還原':'封存'}。完整內容、來源與歷程都保留。`,action,{versionIds:[version.id]});break;
      }
      case 'compare': {
        if(!validComparison(body.versionIds,p))throw new ApiError('請選擇 2 到 5 個不同且未封存的版本。',400);
        if(comparisonQuestionError(body.question))throw new ApiError(comparisonQuestionError(body.question),400);
        addComparison(p,body.versionIds,body.question);p.lifecycle='in_progress';break;
      }
      case 'fuse': {
        if(!validComparison(body.versionIds,p))throw new ApiError('請選擇 2 到 5 個不同且未封存的融合來源。',400);
        if(comparisonQuestionError(body.question))throw new ApiError(comparisonQuestionError(body.question),400);
        fusionVersionId=addFusion(p,body.versionIds,body.question || '').id;break;
      }
      case 'finalize': {
        if(!p.goalApprovedAt)throw new ApiError('請先確認最新的創作目標。',409);
        const version=p.versions.find(v=>v.id===p.officialVersionId);if(!version)throw new ApiError('請先指定正式版。',400);
        const msg=message(p,'system',`創作項目已定稿：${versionLabel(version)}「${version.title}」。原版本、討論與比較都會保留。`,'finalize',{versionIds:[version.id]});
        p.lifecycle='finalized';p.finalizedVersionId=version.id;p.finalizedAt=now();p.finalizations.push({versionId:version.id,versionSnapshot:clone(version),at:p.finalizedAt,messageId:msg.id});break;
      }
      case 'reopen': {
        if(p.lifecycle!=='finalized')throw new ApiError('這個創作項目尚未定稿。',400);
        p.lifecycle='in_progress';p.finalizedAt=null;p.finalizedVersionId=null;message(p,'system','你重新開啟了創作項目。先前的定稿快照仍完整保留，現在可以繼續創作。','reopen');break;
      }
      default:throw new ApiError('這個操作沒有對應的示範腳本。',400);
    }
    const result={...(revisionVersionId?{revisionVersionId}:{}),...(fusionVersionId?{fusionVersionId}:{}),...(directionResult || {})};
    raw.revision++;raw.updatedAt=now();raw.projectLifecycle='in_progress';projects.set(raw.id,raw);if(requestKey)requests.set(requestKey,{action,itemId:body.itemId,result});return {project:view(raw),...result};
  }
  return {request};
}
if(typeof document!=='undefined' && document.body?.dataset.appMode==='demo')createTitleApp({adapter:createDemoAdapter(),demo:true});
