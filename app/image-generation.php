<?php
/**
 * Pure PHP 7.4 image-generation policy. No provider, credential, file or state IO.
 * This allowlist describes IDs supported by this application, NOT the models
 * available to an account. The user explicitly fetches metadata or enters an ID;
 * nothing here selects a default, discovers inventory, or substitutes a model.
 * Shape validation never establishes version/reference ownership or pixel access.
 */
function imageGenerationModels() {
    return array(
        'gpt-image-2',
        'gpt-image-2-2026-04-21',
        'gpt-image-2.5-sunburst',
        'gpt-image-2.5-sunburst-2026-09-08',
        'gpt-image-2.5-flare',
        'gpt-image-2.5-flare-2026-09-08'
    );
}
function imageGenerationModelSupported($provider,$model) {
    return $provider==='openai'&&is_string($model)&&in_array($model,imageGenerationModels(),true);
}
function imageGenerationModelDisclosure($model) {
    ensure(imageGenerationModelSupported('openai',$model),'IMAGE_MODEL_UNSUPPORTED','這個圖片模型 ID 尚未受到本程式支援；沒有自行改用其他模型。',409);
    $mutable=preg_match('/-\d{4}-\d{2}-\d{2}$/D',$model)!==1;
    $detail=$mutable?'這是不帶日期的可變模型別名；供應商可能更新它所指向的版本，固定此 ID 不代表固定底層版本。':'這是帶日期的模型 ID；本程式會保留此完整 ID，不會自行替換成別名或其他模型。';
    return array('model'=>$model,'kind'=>$mutable?'mutable_alias':'dated_id','mutableAlias'=>$mutable,
        'disclosure'=>$detail.'這是程式支援範圍，不是帳號可用模型清單；請自行輸入 ID 或明確取得模型清單，可用性仍由帳號權限與服務回應決定。');
}
function validateProjectImageBinding($value) {
    $binding=validateProjectAiBinding($value);
    ensure(imageGenerationModelSupported($binding['provider'],$binding['model']),'IMAGE_MODEL_UNSUPPORTED','固定圖片模型必須是本程式支援的 OpenAI 圖片模型；不接受對談模型、ChatGPT 圖片別名、已退役模型或自動替代。',409);
    return $binding;
}
function imageGenerationOptions() {
    // One ordinary image per explicit action; callers cannot expose a quality
    // chooser or merge client-supplied generation options into this policy.
    return array('n'=>1,'size'=>'1024x1024','quality'=>'low','output_format'=>'png','background'=>'opaque','moderation'=>'auto','stream'=>false);
}
function validateImageGenerationJsonShape($rawInput) {
    // Run against json_decode(..., false) before associative decoding collapses
    // {} and [] into the same PHP array. Other actions keep their own validators.
    if(field($rawInput,'action')!=='generate_image')return $rawInput;
    ensure(plain($rawInput),'IMAGE_GENERATION_INPUT','圖片生成 JSON 必須是物件。');
    foreach(array('sourceVersionIds','references') as $key){
        if(property_exists($rawInput,$key))ensure(is_array($rawInput->$key),'IMAGE_GENERATION_INPUT','圖片生成 JSON 清單必須使用真正的陣列，不接受物件。');
    }
    if(property_exists($rawInput,'references'))foreach($rawInput->references as $reference){
        ensure(plain($reference),'IMAGE_GENERATION_INPUT','每筆圖片參考 JSON 必須是物件，不接受陣列。');
        $fields=get_object_vars($reference);
        ensure(count($fields)===2&&array_key_exists('referenceId',$fields)&&array_key_exists('role',$fields),'IMAGE_GENERATION_INPUT','每筆圖片參考 JSON 只接受 referenceId 與 role。');
    }
    // Values, dense indexes, counts, IDs and roles are checked later by the
    // canonical request validator. This shape guard never mutates its input.
    return $rawInput;
}
function validateImageGenerationRequest($input) {
    ensure(is_array($input),'IMAGE_GENERATION_INPUT','圖片生成要求必須是物件。');
    $mode=field($input,'mode');
    ensure(in_array($mode,array('generate','revise','fuse'),true),'IMAGE_GENERATION_INPUT','請選擇生成、修改或融合圖片。');
    $ids=array_key_exists('sourceVersionIds',$input)?$input['sourceVersionIds']:array();
    ensure(is_array($ids)&&($ids===array()||array_keys($ids)===range(0,count($ids)-1)),'IMAGE_GENERATION_INPUT','來源版本必須是連續清單。');
    $count=count($ids);
    ensure(($mode==='generate'&&$count===0)||($mode==='revise'&&$count===1)||($mode==='fuse'&&$count>=2&&$count<=5),'IMAGE_GENERATION_INPUT','生成不選來源、修改選1個來源，融合選2至5個來源版本。');
    foreach($ids as $id)validId($id);
    ensure(count(array_unique($ids,SORT_STRING))===$count,'IMAGE_GENERATION_INPUT','來源版本不可重複。');

    $references=array_key_exists('references',$input)?$input['references']:array();
    ensure(is_array($references)&&($references===array()||array_keys($references)===range(0,count($references)-1))&&count($references)<=5,'IMAGE_GENERATION_INPUT','圖片參考必須是最多5筆的連續清單。');
    $selected=array();$seen=array();
    foreach($references as $reference){
        ensure(is_array($reference)&&count($reference)===2&&array_key_exists('referenceId',$reference)&&array_key_exists('role',$reference),'IMAGE_GENERATION_INPUT','每筆圖片參考只接受 referenceId 與 role。');
        $id=validId($reference['referenceId']);$role=$reference['role'];
        ensure(in_array($role,array('palette','composition','style','general'),true),'IMAGE_GENERATION_INPUT','圖片參考角色必須是色彩、構圖、風格或一般參考。');
        ensure(!in_array($id,$seen,true),'IMAGE_GENERATION_INPUT','同一筆圖片參考不可重複選取。');
        $seen[]=$id;$selected[]=array('referenceId'=>$id,'role'=>$role);
    }

    $instruction=userTextValue(array_key_exists('instruction',$input)?$input['instruction']:'',4000,'圖片生成指示',$mode==='generate');
    ensure($mode==='generate'||artifactTrim($instruction)!=='','IMAGE_GENERATION_INPUT','修改與融合必須提供明確指示。');
    $title=artifactText(field($input,'title'),600,'圖片標題',false);
    $alt=artifactText(array_key_exists('alt',$input)?$input['alt']:'',3000,'圖片替代文字');
    $note=array_key_exists('goalAndRationale',$input)?$input['goalAndRationale']:'';
    userTextValue($note,12000,'本版目標與修改意見',true);
    ensure(strlen($note)<=12000,'INVALID_INPUT','本版目標與修改意見過長。');
    // Blank means the application must derive the already-confirmed goal before
    // dispatch, not that a generated saved version may lack its goal and note.
    $note=artifactTrim($note)===''?'':validateCombinedVersionNote($note);

    // Ignore transport metadata (action/id/revision/consent/etc.) and return only
    // validated creative input. No pixels, URLs, options, binding or credentials.
    return array('mode'=>$mode,'sourceVersionIds'=>$ids,'references'=>$selected,'instruction'=>$instruction,'title'=>$title,'alt'=>$alt,'goalAndRationale'=>$note);
}
