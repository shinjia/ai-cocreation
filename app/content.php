<?php
// Text snapshots keep their original content bytes. Validation never silently
// truncates a document, renumbers paragraph ids, or rewrites untouched text.
function moduleContentLimits($type) {
    if(artifactType($type))return array('min'=>1,'max'=>1,'each'=>60000,'total'=>60000);
    if($type==='titles')return array('min'=>1,'max'=>12,'each'=>6000,'total'=>24000);
    if($type==='short_text')return array('min'=>1,'max'=>1,'each'=>12000,'total'=>12000);
    if($type==='article')return array('min'=>1,'max'=>80,'each'=>6000,'total'=>120000);
    throw new AppError('MODULE_UNAVAILABLE','此類型仍在規劃中，尚未提供可執行的創作功能。',409);
}
function validateModuleItemDefinitions($items,$type) {
    $limits=moduleContentLimits($type);
    if($type==='titles')return validateItemDefinitions($items);
    ensure(is_array($items)&&($items===array()||array_keys($items)===range(0,count($items)-1))&&count($items)>=$limits['min']&&count($items)<=$limits['max'],'ITEMS_INVALID','內容項目數量不符合此創作類型的限制。');
    $out=array();$ids=array();$labels=array();
    foreach($items as $item){
        ensure(is_array($item)&&count($item)===2,'ITEMS_INVALID','每個段落定義必須包含 id 和 label。');
        $id=field($item,'id');ensure(is_string($id)&&preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/D',$id),'ITEMS_INVALID','段落識別碼格式不正確。');
        userTextValue($id,64,'段落識別碼');$label=userTextValue(field($item,'label'),120,'段落名稱');
        ensure(!in_array($id,$ids,true)&&!in_array($label,$labels,true),'ITEMS_INVALID','段落識別碼與名稱不可重複。');
        if(artifactType($type))ensure($id==='document'&&$label===($type==='table'?'表格內容':($type==='mindmap'?'心智圖來源':($type==='vector'?'向量圖形來源':($type==='webpage'?'網頁來源':($type==='image'?'圖片來源':'圖表來源'))))),'ITEMS_INVALID','此類型使用完整結構化內容，不以一般文字欄位取代。');
        if($type==='short_text')ensure($id==='body'&&$label==='全文','ITEMS_INVALID','短文只保存一個 id 為 body、名稱為全文的完整內容。');
        $ids[]=$id;$labels[]=$label;$out[]=array('id'=>$id,'label'=>$label);
    }
    return $out;
}
function validateModuleContentItems($items,$type,$definitions=null) {
    $limits=moduleContentLimits($type);
    if($type==='titles')return validateContentItems($items,$definitions);
    ensure(is_array($items)&&($items===array()||array_keys($items)===range(0,count($items)-1))&&count($items)>=$limits['min']&&count($items)<=$limits['max'],'ITEMS_INVALID','完整內容的項目數量不符合此創作類型的限制。');
    $defs=array();$out=array();$bytes=0;
    foreach($items as $item){
        ensure(is_array($item)&&count($item)===3,'ITEMS_INVALID','每個內容項目必須包含 id、label 和 content。');
        $content=field($item,'content');userTextValue($content,$limits['each'],'完整內容');
        // userTextValue checks text, but its trimming must not mutate snapshots.
        ensure(strlen($content)<=$limits['each'],'ITEMS_INVALID','單一內容或段落超過可保存的長度。');
        $bytes+=strlen($content);$defs[]=array('id'=>field($item,'id'),'label'=>field($item,'label'));
        $out[]=array('id'=>field($item,'id'),'label'=>field($item,'label'),'content'=>$content);
    }
    $defs=validateModuleItemDefinitions($defs,$type);ensure($bytes<=$limits['total'],'ITEMS_INVALID','完整內容超過此創作類型的保存上限，請先縮短；內容沒有被截斷。');
    foreach($out as $i=>&$row)$row['label']=$defs[$i]['label'];unset($row);
    if($definitions===null)return $out;
    $definitions=validateModuleItemDefinitions($definitions,$type);
    ensure(count($defs)===count($definitions),'MODEL_OUTPUT_INVALID','AI 沒有回傳全部已確認的內容項目，未保存。',502);
    $map=array();foreach($out as $row)$map[$row['id']]=$row;
    $ordered=array();foreach($definitions as $def){ensure(isset($map[$def['id']])&&$map[$def['id']]['label']===$def['label'],'MODEL_OUTPUT_INVALID','AI 變更或遺漏既有段落識別碼與名稱，未保存。',502);$ordered[]=$map[$def['id']];}
    return $ordered;
}
function validateModuleBrief($value,$type) {
    if($type==='titles')return validateBrief($value);
    ensure(is_array($value)&&count($value)===7,'MODEL_OUTPUT_INVALID','創作主軸欄位不正確。',502);$out=array();
    foreach(array('purpose','audience','message','tone','constraints','summary') as $key)$out[$key]=textValue(field($value,$key),$key==='summary'?3000:1200,'創作主軸');
    $out['items']=validateModuleItemDefinitions(field($value,'items'),$type);return $out;
}
