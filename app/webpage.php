<?php
// A webpage is native structured content, never arbitrary HTML/CSS/JavaScript.
// Rendering and HTML export use fixed frontend templates. All authored strings
// stay literal, including whitespace, angle brackets and URL-looking prose.
function validateWebpageArtifact($value) {
    artifactObject($value,array('kind','title','theme','navigation','sections'),'網頁');
    ensure($value['kind']==='webpage','ARTIFACT_INVALID','網頁類型欄位不正確。');
    $title=artifactText($value['title'],600,'網頁標題',false);
    $theme=$value['theme'];ensure(in_array($theme,array('paper','midnight','meadow'),true),'ARTIFACT_INVALID','網頁視覺風格只支援 paper、midnight 或 meadow。');
    ensure(is_bool($value['navigation']),'ARTIFACT_INVALID','網頁導覽設定必須是布林值。');
    artifactList($value['sections'],1,20,'網頁區塊');$sections=array();$ids=array();
    foreach($value['sections'] as $section){
        artifactObject($section,array('id','type','eyebrow','heading','body','entries','actionLabel','actionTarget'),'網頁區塊');
        $id=artifactStableId($section['id'],'網頁區塊識別碼');ensure(!in_array($id,$ids,true),'ARTIFACT_INVALID','網頁區塊識別碼不可重複。');$ids[]=$id;
        $type=$section['type'];ensure(in_array($type,array('hero','text','cards','faq','cta'),true),'ARTIFACT_INVALID','網頁區塊只支援 hero、text、cards、faq 或 cta。');
        $eyebrow=artifactText($section['eyebrow'],240,'網頁區塊引言');
        $heading=artifactText($section['heading'],600,'網頁區塊標題',false);
        $body=artifactText($section['body'],12000,'網頁區塊內文');
        $hasEntries=$type==='cards'||$type==='faq';artifactList($section['entries'],$hasEntries?1:0,$hasEntries?12:0,'網頁卡片或問答');
        $entries=array();$entryIds=array();
        foreach($section['entries'] as $entry){
            artifactObject($entry,array('id','title','body'),'網頁卡片或問答');
            $entryId=artifactStableId($entry['id'],'網頁卡片或問答識別碼');
            ensure(!in_array($entryId,$entryIds,true),'ARTIFACT_INVALID','同一區塊的卡片或問答識別碼不可重複。');$entryIds[]=$entryId;
            $entries[]=array('id'=>$entryId,'title'=>artifactText($entry['title'],600,'網頁卡片或問題標題',false),'body'=>artifactText($entry['body'],6000,'網頁卡片或回答內文'));
        }
        $actionLabel=artifactText($section['actionLabel'],240,'網頁導覽按鈕文字');
        $actionTarget=$section['actionTarget'];ensure(is_string($actionTarget),'ARTIFACT_INVALID','網頁導覽目標必須是區塊識別碼或空字串。');
        if($actionTarget!=='')$actionTarget=artifactStableId($actionTarget,'網頁導覽目標');
        ensure(($actionLabel==='')===($actionTarget===''),'ARTIFACT_INVALID','網頁導覽按鈕文字與目標必須同時填寫或同時留空。');
        if($actionLabel!=='')artifactText($actionLabel,240,'網頁導覽按鈕文字',false);
        if($type==='cta')ensure($actionLabel!==''&&$actionTarget!=='','ARTIFACT_INVALID','cta 區塊必須指定頁內導覽按鈕與目標。');
        elseif($type!=='hero')ensure($actionLabel===''&&$actionTarget==='','ARTIFACT_INVALID','只有 hero 與 cta 區塊可設定頁內導覽按鈕。');
        $sections[]=array('id'=>$id,'type'=>$type,'eyebrow'=>$eyebrow,'heading'=>$heading,'body'=>$body,'entries'=>$entries,'actionLabel'=>$actionLabel,'actionTarget'=>$actionTarget);
    }
    // Resolve only against this complete snapshot. No URL, external anchor,
    // sibling creative item, DOM selector or later live reference is accepted.
    foreach($sections as $section)ensure($section['actionTarget']===''||in_array($section['actionTarget'],$ids,true),'ARTIFACT_INVALID','網頁導覽目標必須指向同一作品中存在的區塊。');
    $out=array('kind'=>'webpage','title'=>$title,'theme'=>$theme,'navigation'=>$value['navigation'],'sections'=>$sections);
    ensure(strlen(webpageCompactJson($out))<=60000,'ARTIFACT_INVALID','完整網頁 JSON 超過60000個 UTF8 位元組，未保存且未截斷內容。');
    return $out;
}
function webpageCompactJson($value) {
    // Canonical field order is created by validation. There are no floats or
    // provider code strings. Shared encoding preserves text and escapes U+2028
    // and U+2029 exactly as the frontend projection does, without truncation.
    return jsonEncode($value);
}
function webpageContentFingerprint($value) {
    // ID-only rewrites cannot manufacture a fusion. Keep all authored text,
    // theme, navigation, order and multiplicity. Translate internal targets to
    // their ordered section positions so renaming IDs keeps binding semantics,
    // but changing which section a button targets remains a real difference.
    $artifact=validateWebpageArtifact($value);$ids=array_column($artifact['sections'],'id');$sections=array();
    foreach($artifact['sections'] as $section){
        unset($section['id']);$entries=array();
        foreach($section['entries'] as $entry){unset($entry['id']);$entries[]=$entry;}
        $section['entries']=$entries;
        $section['actionTarget']=$section['actionTarget']===''?'':'section_'.array_search($section['actionTarget'],$ids,true);
        $sections[]=$section;
    }
    return webpageCompactJson(array('kind'=>'webpage','title'=>$artifact['title'],'theme'=>$artifact['theme'],'navigation'=>$artifact['navigation'],'sections'=>$sections));
}
function webpageSchema() {
    $text=array('type'=>'string');
    $entry=artifactSchemaObject(array('id'=>$text,'title'=>$text,'body'=>$text));
    // Byte lengths, ID uniqueness, type-specific counts/actions and target
    // resolution are authoritative in validateWebpageArtifact after raw shape
    // validation. No optional provider union/conditional schema is required.
    $section=artifactSchemaObject(array('id'=>$text,'type'=>array('type'=>'string','enum'=>array('hero','text','cards','faq','cta')),
        'eyebrow'=>$text,'heading'=>$text,'body'=>$text,'entries'=>array('type'=>'array','minItems'=>0,'maxItems'=>12,'items'=>$entry),'actionLabel'=>$text,'actionTarget'=>$text));
    return artifactSchemaObject(array('kind'=>array('type'=>'string','enum'=>array('webpage')),'title'=>$text,'theme'=>array('type'=>'string','enum'=>array('paper','midnight','meadow')),
        'navigation'=>array('type'=>'boolean'),'sections'=>array('type'=>'array','minItems'=>1,'maxItems'=>20,'items'=>$section)));
}
function webpageItems($value) {
    $artifact=validateWebpageArtifact($value);$content=webpageCompactJson($artifact);
    ensure(strlen($content)<=60000,'ARTIFACT_INVALID','完整網頁文字投影超過保存上限，未截斷內容。');
    return array(array('id'=>'document','label'=>'網頁來源','content'=>$content));
}
