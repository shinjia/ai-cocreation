/** Explicit, project-fixed pixel generation. No transport, storage, or default member. */
export const IMAGE_GENERATION_MODELS=Object.freeze(['gpt-image-2','gpt-image-2-2026-04-21','gpt-image-2.5-sunburst','gpt-image-2.5-sunburst-2026-09-08','gpt-image-2.5-flare','gpt-image-2.5-flare-2026-09-08']);
export const IMAGE_GENERATION_NOTICE='只有你按下圖片生成、重繪或融合按鈕時，才會把本次文字、專案背景、已選來源圖片與明確勾選的固定圖片引用之實際 PNG 像素傳送給 OpenAI。圖片模型與對談模型分開固定，圖片 API 會另外計費。每次請求 1 張 1024 × 1024、low 品質 PNG；服務可能已計費但未成功保存圖片。系統不自動重試，不自動生成下一張，也不自動採用或定稿。不帶日期的模型 ID 是供應商可更新的別名；如需固定版本，請優先選用完整日期 ID。程式支援清單不代表帳戶可用清單。';
export const IMAGE_REFERENCE_ROLES=Object.freeze({general:'整體參考',palette:'配色',composition:'構圖',style:'風格'});
export function isImageOnlyModel(model){return typeof model==='string' && /^(?:(?:gpt-image|chatgpt-image)(?:-|$)|dall-e(?:-|$))/i.test(model);}
export function chatMembers(state){return (state?.members || []).filter(member=>member.enabled && !(member.provider==='openai' && isImageOnlyModel(member.model)));}
export function imageMembers(state){
  const supported=Array.isArray(state?.imageGenerationModels)?state.imageGenerationModels:[];
  return (state?.members || []).filter(member=>member.enabled && member.provider==='openai' && IMAGE_GENERATION_MODELS.includes(member.model) && supported.includes(member.model));
}
export function projectImageMember(state,project){
  const binding=project?.imageBinding;if(!binding)return null;
  const member=imageMembers(state).find(value=>value.id===binding.memberId);
  if(!member || member.provider!==binding.provider || member.model!==binding.model || (member.ollamaUrl || '')!==(binding.ollamaUrl || ''))return null;
  return {...member,nickname:binding.memberNickname || member.nickname};
}
export function imageGenerationSetupReason(state,project,demo=false){
  if(demo)return '圖片生成腳本示範尚未提供，不會呼叫服務。';
  if(!project?.imageBinding)return '請先一次選定專案固定圖片模型，並同意圖片傳送範圍與額外費用。';
  if(!projectImageMember(state,project))return '此專案固定圖片成員已停用、模型設定已變更或不受支援。請恢復原成員設定；不會自動改用其他模型。';
  if(!project.imageGenerationConsent?.bindingHash || !project.imageGenerationConsent?.acceptedAt)return '專案尚未保存此固定圖片模型的傳送範圍與費用同意，未呼叫圖片服務。';
  if(!state?.usageConsent)return '請先在 AI 系統設定保存資料傳送與費用同意。';
  if(!state.keyPresent)return 'OpenAI 金鑰尚未設定或已到期。請到「AI 系統設定」重新提供金鑰。';
  return '';
}
export function currentImageGenerationReferences(project){
  const references=project?.activeItem?.references || project?.references || [];
  if(!Array.isArray(references))return [];
  // Duplicate identifiers are ambiguous. Do not substitute another snapshot.
  const counts=new Map();for(const ref of references)counts.set(ref?.id,(counts.get(ref?.id)||0)+1);
  return references.filter(ref=>typeof ref?.id==='string' && counts.get(ref.id)===1 && ref.targetItemId && ref.versionId && ref.versionSnapshot?.id===ref.versionId && ref.versionSnapshot?.contentType==='image' && ref.versionSnapshot?.artifact?.kind==='image');
}
function validUnicode(value){for(let i=0;i<value.length;i++){const code=value.charCodeAt(i);if(code>=0xd800 && code<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00 && next<=0xdfff))return false;}else if(code>=0xdc00 && code<=0xdfff)return false;}return true;}
export function imageGenerationPayloadError(project,payload){
  if(!['generate','revise','fuse'].includes(payload?.mode))return '請選擇圖片生成、重繪或融合操作。';
  const ids=payload.sourceVersionIds;
  if(!Array.isArray(ids) || new Set(ids).size!==ids.length || (payload.mode==='generate'?ids.length!==0:payload.mode==='revise'?ids.length!==1:ids.length<2 || ids.length>5))return payload.mode==='revise'?'請明確選擇 1 個圖片重繪來源版本。':payload.mode==='fuse'?'請在版本樹明確勾選 2–5 個圖片版本。':'新圖生成不接受來源版本。';
  if(ids.some(id=>!project?.versions?.some(v=>v.id===id && v.contentType==='image' && v.artifact?.kind==='image') || (project.archivedVersionIds || project.activeItem?.archivedVersionIds || []).includes(id)))return '圖片來源不存在或已封存，請重新選擇未封存的圖片版本。';
  if(payload.mode==='generate' && !project?.goalApprovedAt)return '請先整理並按「確認圖片方向」，再明確生成新圖。';
  const references=payload.references,available=currentImageGenerationReferences(project);
  if(!Array.isArray(references) || references.length>5 || new Set(references.map(ref=>ref.referenceId)).size!==references.length || references.some(ref=>!Object.hasOwn(IMAGE_REFERENCE_ROLES,ref.role) || !available.some(pin=>pin.id===ref.referenceId)))return '最多選擇 5 份目前項目的固定圖片引用；引用已變更時請重新勾選。';
  for(const [key,max,label,required] of [['instruction',4000,'本次圖片指示',payload.mode!=='generate'],['title',600,'圖片標題',true],['alt',3000,'替代文字',false],['goalAndRationale',12000,'本版目標與修改意見',false]]){
    const value=payload[key];if(typeof value!=='string' || (required && !value.trim()) || new TextEncoder().encode(value).length>max)return `${label}${required?'不可空白，且':''}最多 ${max.toLocaleString('en-US')} 位元組。`;
    if(!validUnicode(value) || value.includes('\0') || /\bsk-[a-zA-Z0-9_-]{16,}\b/.test(value))return '請勿在作品欄位填入 API Key 或不合法文字。';
  }
  return '';
}
export function imageVersionOrigin(version){
  if(['external_upload','upload','uploaded'].includes(version?.source))return '來源：外部上傳圖片（不是 AI 生圖）';
  if(['generated','revision','fusion','image_generated','image_revision','image_fusion'].includes(version?.source) && version?.artifact?.kind==='image')return '來源：AI 圖片生成'+(version.source.includes('fusion')?'／融合':version.source.includes('revision')?'／重繪':'')+'（尚需自行審閱）';
  return '來源：已保存圖片版本；原始來源請見版本紀錄';
}
