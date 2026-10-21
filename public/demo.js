/** SCRIPTED DEMO ONLY. This adapter has no network, key, or persistent browser storage. */
import {createTitleApp,MODULES,ApiError,canGenerate,canSummarize,validComparison,validItems,versionLabel,nextVersionCoordinates,isArchivedVersion,COMPARISON_SNAPSHOT_NOTE,comparisonQuestionError,versionGoalText,versionGoalAndRationale,combinedMetadataError,snapshotMetadataError,memberRosterError,officialItemTitle,currentChoiceQuestion} from './app.js?v=20261021-version7';
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
  const provenance=()=>({...DEMO_PROVENANCE,memberId:settings.activeMemberId,memberNickname:settings.members.find(member=>member.id===settings.activeMemberId)?.nickname || null,requestedAt:now()});
  const settings={csrf:'scripted-demo-no-token',provider:'ollama',model:'固定腳本',members:[{id:'11111111111111111111111111111111',nickname:'小光（固定腳本）',enabled:true,provider:'ollama',model:'固定腳本',ollamaUrl:'http://127.0.0.1:11434'}],activeMemberId:'11111111111111111111111111111111',memberId:'11111111111111111111111111111111',memberNickname:'小光（固定腳本）',usageConsent:true,consentAt:'scripted-demo-not-network-consent',keyPresent:false,keyExpiresAt:null,keyRevision:0,settingsRevision:0,ollamaUrl:'http://127.0.0.1:11434',modules:MODULES};
  function message(project,role,text,kind='discussion',extra={}) {
    const value={id:id('message'),role,text,kind,at:now(),...extra};
    if(role==='assistant')value.provenance=provenance();project.messages.push(value);return value;
  }
  function scriptedQuestion(raw,item,question,choices) {
    return {question,choices:clone(choices),choiceContext:{itemId:item.id,officialVersionId:item.officialVersionId,sharedContextRevision:raw.sharedContextRevision,itemTitle:item.title,itemDescription:item.description}};
  }
  function newItem(type,title,description='') {
    const item={id:id('item'),type,title,description,enabled:type==='titles',archived:false,references:[],lifecycle:'created',phase:'discussion',messages:[],brief:null,goalApprovedAt:null,versions:[],archivedVersionIds:[],officialVersionId:null,finalizedVersionId:null,finalizedAt:null,finalizations:[],comparisons:[],createdAt:now()};
    message(item,'system',type==='titles'?'腳本示範，不是真實 AI。所有回覆事先寫好，不會送出任何網路請求。':'這個類型尚未實作，只能保存規劃與其他項目的固定引用。','demo_notice');return item;
  }
  function newProject(title,description='') {
    const item=newItem('titles','標題名稱');
    const project={id:id('project'),title,description,projectLifecycle:'created',projectFinalizations:[],revision:1,sharedContextRevision:0,activeItemId:item.id,creativeItems:[item],updatedAt:now()};projects.set(project.id,project);return project;
  }
  function view(project) {
    const item=project.creativeItems.find(i=>i.id===project.activeItemId);
    const projection={...project,activeItem:item,module:item.type};
    for(const field of ['phase','lifecycle','messages','brief','goalApprovedAt','versions','archivedVersionIds','officialVersionId','finalizedVersionId','finalizedAt','finalizations','comparisons','references'])projection[field]=item[field];
    return clone(projection);
  }
  function addGenerated(project) {
    const msg=message(project,'assistant','這一組候選展示三種不同角度。它們會一起保留，你可以選一個繼續編輯，也可以把幾個版本放在一起比較。\n（固定腳本示範，不是真實 AI 生成）','generation',{versionIds:[]});
    SCRIPTED_CANDIDATES.forEach((candidate,index)=>{
      const items=[{id:'zh-title',label:'中文名稱',content:candidate.title},{id:'en-title',label:'英文名稱',content:['Everyday, In Light','Stories Between Us','Frames Unfinished'][index]},{id:'tagline',label:'宣傳短句',content:['每一個平凡瞬間，都值得被看見。','靠近彼此，故事就開始了。','把生活留在畫面裡，讓故事繼續。'][index]}];
      const v={id:id('version'),number:project.versions.length+1,...nextVersionCoordinates(project),...candidate,items,goalText:['以影像意象讓觀眾重新看見生活日常。','強調觀眾與創作者之間的親近感及共同故事。','以生活片段與未完成的畫面留下想像空間。'][index],goalSource:'ai',changeSummary:`固定腳本候選方向：${candidate.rationale}`,discussionMessageIds:project.messages.filter(m=>['student','assistant'].includes(m.role)).map(m=>m.id),source:'generated',basedOnVersionId:null,goalSnapshot:clone(project.brief),referencesSnapshot:clone(project.references || []),messageId:msg.id,createdAt:now(),provenance:provenance()};v.goalSnapshot={summary:v.goalText};v.goalAndRationale=versionGoalAndRationale(v);project.versions.push(v);msg.versionIds.push(v.id);
    });project.phase='work';project.lifecycle='in_progress';
  }
  function addSnapshot(project,items,rationale,basedOnVersionId=null,versionMode='major',goalText=undefined,goalAndRationale=undefined) {
    const base=project.versions.find(v=>v.id===basedOnVersionId);goalText=goalText===undefined?(base?versionGoalText(base):project.brief?.summary || ''):goalText;
    if(goalAndRationale!==undefined){goalText=base?versionGoalText(base):project.brief?.summary || '';rationale=base?.rationale || '';}
    const msg=message(project,'system','你把工作區的編輯成果另存成新版本。原版本保持不變。','snapshot',{versionIds:[]});
    const v={id:id('version'),number:project.versions.length+1,...nextVersionCoordinates(project,versionMode,project.versions.find(v=>v.id===basedOnVersionId)),title:items[0].content.slice(0,180),items:clone(items),rationale,goalText,goalSource:'user',changeSummary:rationale,discussionMessageIds:clone(project.versions.find(v=>v.id===basedOnVersionId)?.discussionMessageIds || []),source:'snapshot',basedOnVersionId,goalSnapshot:clone(project.brief),referencesSnapshot:clone(project.references || []),messageId:msg.id,createdAt:now(),provenance:null};
    v.goalSnapshot={summary:v.goalText};if(goalAndRationale!==undefined)v.changeSummary=base?.changeSummary || '';v.goalAndRationale=goalAndRationale===undefined?versionGoalAndRationale(v):goalAndRationale;project.versions.push(v);msg.versionIds.push(v.id);project.phase='work';project.lifecycle='in_progress';return v;
  }
  function addScriptedRevision(project,base,items) {
    const msg=message(project,'assistant','已逐字替換你指定的第一項內容，其餘項目原樣保留。請閱讀完整修改版與差異，再決定是否採用。\n（固定字串替換示範，不是真實 AI）','revision',{versionIds:[]});
    const v={id:id('version'),number:project.versions.length+1,...nextVersionCoordinates(project,'minor',base),title:items[0].content.slice(0,180),items:clone(items),rationale:'固定腳本僅替換明確指定的第一項，未修改其他內容。',goalText:versionGoalText(base),goalSource:'ai',changeSummary:`固定腳本本次將第一項由「${base.items[0].content}」替換為「${items[0].content}」，其餘內容不變。`,discussionMessageIds:[project.messages.at(-2).id,msg.id],source:'revision',basedOnVersionId:base.id,goalSnapshot:clone(project.brief),referencesSnapshot:clone(project.references || []),messageId:msg.id,createdAt:now(),provenance:clone(msg.provenance)};
    v.goalSnapshot={summary:v.goalText};v.goalAndRationale=typeof base.goalAndRationale==='string'?[base.goalAndRationale,`本次修改：\n${v.changeSummary}`].filter(Boolean).join('\n\n'):versionGoalAndRationale(v);project.versions.push(v);msg.versionIds.push(v.id);project.phase='work';project.lifecycle='in_progress';return v;
  }
  function addComparison(project,versionIds,question='') {
    const msg=message(project,'assistant','各版本創作內容的比較已整理在右側。各版本有不同優點與取捨，沒有自動選出贏家，也沒有變更正式版。\n（固定腳本意見，不是真實 AI 評估）','comparison');
    const comparison={id:id('comparison'),versionIds:[...versionIds],goalBasis:'version_snapshots',versionGoalSnapshots:versionIds.map(versionId=>({versionId,goalSnapshot:clone(project.versions.find(v=>v.id===versionId).goalSnapshot || null),goalText:versionGoalText(project.versions.find(v=>v.id===versionId)),goalAndRationale:versionGoalAndRationale(project.versions.find(v=>v.id===versionId)),goalSource:project.versions.find(v=>v.id===versionId).goalSource || null,changeSummary:project.versions.find(v=>v.id===versionId).changeSummary || '',rationale:project.versions.find(v=>v.id===versionId).rationale || '',discussionMessageIds:clone(project.versions.find(v=>v.id===versionId).discussionMessageIds || [])})),goalSnapshot:null,referencesSnapshot:clone(project.references || []),items:versionIds.map((versionId,index)=>({versionId,fit:index===0?'名稱與宣傳短句方向一致，能連結這次展示情境。':'情感較直接，能邀請讀者走進創作者的故事。',strength:index===0?'中英文名稱有共同意象，宣傳短句能接續同一方向。':'親近、好理解，容易形成觀眾共鳴。',tradeoff:index===0?'意象較多，可能需要副標補充活動資訊。':'名稱、短句與短文的語氣可以再確認是否一致。',suggestion:index===0?'可以試著調整動詞，讓語氣更主動。':'保留情緒核心，再考慮是否加入影像相關詞彙。'})),summary:'這些版本適合不同的溝通重點：有的強調影像意象，有的強調人與故事的關係。請回到你最希望觀眾記得的那件事，決定下一步。'+(question?' 這是固定腳本示範，不會因比較問題而改寫分析。':''),messageId:msg.id,createdAt:now(),provenance:provenance()};
    project.comparisons.push(comparison);msg.comparisonId=comparison.id;msg.goalBasis=comparison.goalBasis;msg.text+='\n'+COMPARISON_SNAPSHOT_NOTE;return comparison;
  }
  if(seed) {
    const project=newProject('社區影像展 · 共創企劃','為年度社區影像展規劃名稱、宣傳與主視覺。希望邀請居民、創作者與第一次來看影展的觀眾，從日常看見故事。');
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
    poster.references.push({id:id('reference'),projectId:project.id,targetItemId:p.id,targetItemTitle:p.title,versionId:version.id,versionSnapshot:clone(version),pinnedAt:now()});project.creativeItems.push(poster);
  }
  function state() {return {...settings,projects:[...projects.values()].map(p=>({id:p.id,title:p.title,description:p.description,projectLifecycle:p.projectLifecycle,lifecycle:p.projectLifecycle,itemCount:p.creativeItems.length,updatedAt:p.updatedAt})).reverse()};}
  async function request(action,body={}) {
    if(action==='state')return clone(state());
    if(action==='new')return {project:view(newProject(body.title || '新的創作專案',body.description || ''))};
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
    const raw=projects.get(body.id);if(!raw)throw new ApiError('找不到這個示範專案。',404);
    if(action==='project')return {project:view(raw)};
    if(body.requestId && requests.has(body.requestId))return {project:view(raw),...requests.get(body.requestId)};
    if(body.revision!==raw.revision)throw new ApiError('示範資料已更新，請重新載入。',409);
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
          if(raw.description!==body.description || raw.title!==body.title){raw.sharedContextRevision++;raw.creativeItems.forEach(i=>{i.goalApprovedAt=null;i.phase='discussion';});}raw.title=body.title;raw.description=body.description;
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
            if(action==='edit_item'){if(p.lifecycle==='finalized')throw new ApiError('請先重新開啟項目，再編輯資料。',409);if(p.title!==body.title || p.description!==body.description){p.goalApprovedAt=null;p.phase='discussion';}p.title=body.title;p.description=body.description;}
            else{
              if(p.lifecycle==='finalized')throw new ApiError('請先重新開啟這個項目。',409);
              if(action==='attach_reference'){
                const source=raw.creativeItems.find(i=>i.id===body.targetItemId && i.id!==p.id),version=source?.versions.find(v=>v.id===body.versionId);
                if(!version)throw new ApiError('找不到可引用的來源版本。',400);
                if(isArchivedVersion(source,version.id))throw new ApiError('來源版本已封存，請先還原後再引用。',409);
                if(p.references.some(r=>r.targetItemId===source.id && r.versionId===version.id))throw new ApiError('這份固定版本已經引用過。',409);
                p.references.push({id:id('reference'),projectId:raw.id,targetItemId:source.id,targetItemTitle:source.title,versionId:version.id,versionSnapshot:clone(version),pinnedAt:now()});message(p,'system','你加入一份明確選定的固定引用。來源之後更新不會自動改寫。','reference_added');
              }else{p.references=p.references.filter(r=>r.id!==body.referenceId);message(p,'system','你移除了固定引用，來源版本不變。','reference_removed');}
              p.goalApprovedAt=null;p.phase='discussion';
            }
          }
        }
        if(action!=='finalize_project')raw.projectLifecycle='in_progress';
      }
      raw.revision++;raw.updatedAt=now();return {project:view(raw)};
    }
    if(body.itemId!==raw.activeItemId)throw new ApiError('目前創作項目已切換。',409);
    if(raw.projectLifecycle==='finalized' || p.archived)throw new ApiError('專案已結案或項目已封存，請先重新開啟。',409);
    if(!p.enabled)throw new ApiError('這個項目類型尚未實作，不能執行 AI 或保存版本。',409);
    if(p.lifecycle==='finalized' && action!=='reopen')throw new ApiError('項目已定稿，請先重新開啟討論。',409);
    if(['discuss','summarize','generate','compare'].includes(action)){
      if(!body.consent || !settings.usageConsent || !settings.members.some(member=>member.id===settings.activeMemberId && member.enabled))throw new ApiError('請先選取已勾選的成員，並在系統設定同意使用範圍。',400);
      if(body.approvedMemberId && body.approvedMemberId!==settings.activeMemberId)throw new ApiError('AI 成員已變更，請重新確認下一次使用的成員。',409);
      if(body.approvedSettingsRevision!==undefined && body.approvedSettingsRevision!==settings.settingsRevision)throw new ApiError('AI 設定已更新。',409);
    }
    let revisionVersionId=null;
    switch(action) {
      case 'discuss': {
        if(!String(body.text || '').trim())throw new ApiError('請先寫下想法。',400);
        if(body.officialVersionId!==undefined && body.officialVersionId!==p.officialVersionId)throw new ApiError('正式版已變更，請重新載入後再回應。',409);
        let studentExtra={};
        if(body.choiceAnswer!==undefined){
          const question=p.messages.at(-1),answer=body.choiceAnswer;
          if(!answer || typeof answer!=='object' || Array.isArray(answer) || Object.keys(answer).length!==2 || typeof answer.questionMessageId!=='string' || typeof answer.choiceId!=='string')throw new ApiError('選項答案格式不正確。',400);
          if(!currentChoiceQuestion(view(raw),question) || answer.questionMessageId!==question.id || body.officialVersionId!==p.officialVersionId)throw new ApiError('這個選項問題已失效，請重新載入最新討論。',409);
          const choice=question.choices.find(option=>option.id===answer.choiceId);
          if(!choice || body.text!==choice.value)throw new ApiError('選項答案與保存的問題不一致。',400);
          studentExtra={choiceAnswer:{questionMessageId:question.id,choiceId:choice.id,label:choice.label,value:choice.value}};
        }
        const official=p.versions.find(v=>v.id===p.officialVersionId);
        if(official){
          // A deliberately narrow literal-command fixture, never inference or generic rewriting.
          const match=String(body.text).trim().match(/^請把第一項內容改為「([^「」\r\n]+)」[。！]?$/u);
          const goalMatch=String(body.text).trim().match(/^請把本版目標改為「([^「」\r\n]+)」[。！]?$/u);
          const replacement=match?.[1].trim(),goalReplacement=goalMatch?.[1].trim(),items=clone(official.items);
          if(goalReplacement && goalReplacement!==versionGoalText(official)){
            if(snapshotMetadataError(goalReplacement,''))throw new ApiError(snapshotMetadataError(goalReplacement,''),400);
            message(p,'student',body.text,'discussion',studentExtra);const revised=addScriptedRevision(p,official,items);revised.goalText=goalReplacement;revised.goalSnapshot={summary:goalReplacement};revised.changeSummary='固定腳本僅替換明確指定的本版目標，完整內容欄位維持不變。';revised.rationale='依照明確指定的目標文字另存待審修改版。';delete revised.goalAndRationale;revised.goalAndRationale=versionGoalAndRationale(revised);p.messages.find(m=>m.id===revised.messageId).text='已逐字替換你指定的本版目標，完整內容欄位原樣保留。請閱讀目標差異，再決定是否採用。\n（固定字串替換示範，不是真實 AI）';revisionVersionId=revised.id;
          }else if(replacement && replacement!==items[0].content){
            items[0].content=replacement;
            if(!validItems(items))throw new ApiError('這次示範替換超過項目內容限制。',400);
            message(p,'student',body.text,'discussion',studentExtra);revisionVersionId=addScriptedRevision(p,official,items).id;
          }else{
            message(p,'student',body.text,'discussion',studentExtra);
            message(p,'assistant','你希望第一項具體改成什麼文字？請使用「請把第一項內容改為「你的新名稱」」或「請把本版目標改為「你的新目標」」這個固定示範格式，並提供與目前不同的內容。\n（固定腳本追問，不是真實 AI；這次沒有新增修改版，正式內容不變。）','clarification',scriptedQuestion(raw,p,'想先示範哪一種明確修改？',[
              {id:'revise-name',label:'示範修改第一項名稱',value:'請把第一項內容改為「一起，看見日常」'},
              {id:'revise-goal',label:'示範修改本版目標',value:'請把本版目標改為「以清楚易讀的名稱邀請居民看見日常故事。」'}
            ]));
            p.lifecycle='in_progress';
          }
          break;
        }
        message(p,'student',body.text,'discussion',studentExtra);p.phase='discussion';p.goalApprovedAt=null;p.lifecycle='in_progress';
        const count=p.messages.filter(m=>m.role==='student').length;
        const scripted=count===1?'這次最希望吸引誰？可以先描述主要的讀者或觀眾。':count===2?'如果讀者只記得一件事，你最希望他記得什麼？':'現在可以按「整理目前目標」，看看用途、對象與重點是否一致。整理完成後仍要由你確認，才會進入候選創作。';
        const options=count===1?scriptedQuestion(raw,p,'這次最希望吸引誰？',[
          {id:'neighbors',label:'社區居民',value:'主要希望吸引社區居民。'},
          {id:'creators',label:'影像創作者',value:'主要希望吸引影像創作者。'},
          {id:'newcomers',label:'第一次接觸影展的觀眾',value:'希望第一次接觸影展的觀眾也願意參加。'}
        ]):count===2?scriptedQuestion(raw,p,'最希望觀眾記得什麼？',[
          {id:'daily-stories',label:'日常裡的故事',value:'日常裡也有值得被看見的故事。'},
          {id:'shared-life',label:'一起生活的連結',value:'希望觀眾記得我們一起生活的連結。'}
        ]):{};
        message(p,'assistant',`${scripted}\n（固定腳本示範，不會解析你輸入的內容）`,'discussion',options);break;
      }
      case 'summarize': {
        if(!canSummarize(p))throw new ApiError('請先完成至少三次回應，再整理目標。',400);
        p.brief=clone(DEMO_BRIEF);p.phase='summary';p.goalApprovedAt=null;p.lifecycle='in_progress';
        message(p,'assistant',`${DEMO_BRIEF.summary}\n（此為社區影像展的固定示範目標，不是依據輸入推論）`,'summary');break;
      }
      case 'approve_goal': {
        if(p.phase!=='summary' || !p.brief)throw new ApiError('請先整理目標。',400);
        p.goalApprovedAt=now();p.phase='ready';p.lifecycle='in_progress';message(p,'system','你已確認這份目標。候選尚未生成，需要另外按下「產生候選」並確認。','goal_approved');break;
      }
      case 'generate': {
        if(!canGenerate(p))throw new ApiError('請先確認創作目標。',400);addGenerated(p);break;
      }
      case 'snapshot': {
        if(!p.goalApprovedAt && !p.versions.some(v=>v.id===p.officialVersionId))throw new ApiError('請先確認創作目標。',400);
        if(!validItems(body.items))throw new ApiError('請保留 1 到 12 個項目，每項都要有名稱與內容。',400);
        if(body.basedOnVersionId && (!p.versions.some(v=>v.id===body.basedOnVersionId) || isArchivedVersion(p,body.basedOnVersionId)))throw new ApiError('來源版本不存在或已封存，請先還原。',400);
        if(body.versionMode && !['major','minor'].includes(body.versionMode))throw new ApiError('未知版本模式。',400);
        if(body.versionMode==='minor' && !body.basedOnVersionId)throw new ApiError('小修改必須指定來源版本。',400);
        const source=p.versions.find(v=>v.id===body.basedOnVersionId),goal=body.goalText===undefined?(source?versionGoalText(source):p.brief?.summary || ''):body.goalText;
        const metadataError=body.goalAndRationale!==undefined?combinedMetadataError(body.goalAndRationale):snapshotMetadataError(goal,body.rationale || '');
        if(metadataError)throw new ApiError(metadataError,400);
        addSnapshot(p,body.items,body.rationale || '',body.basedOnVersionId || null,body.versionMode || 'major',body.goalText,body.goalAndRationale);break;
      }
      case 'promote': {
        const version=p.versions.find(v=>v.id===body.versionId);if(!version || isArchivedVersion(p,version.id))throw new ApiError('版本不存在或已封存，請先還原。',400);
        p.officialVersionId=version.id;p.title=officialItemTitle(version.items);p.lifecycle='in_progress';message(p,'system',`你指定 ${versionLabel(version)}「${version.title}」為正式版，其他版本仍完整保留。`,'promotion',{versionIds:[version.id]});break;
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
    const result=revisionVersionId?{revisionVersionId}:{};
    raw.revision++;raw.updatedAt=now();raw.projectLifecycle='in_progress';if(body.requestId)requests.set(body.requestId,result);return {project:view(raw),...result};
  }
  return {request};
}
if(typeof document!=='undefined' && document.body?.dataset.appMode==='demo')createTitleApp({adapter:createDemoAdapter(),demo:true});
