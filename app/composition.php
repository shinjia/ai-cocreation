<?php
/** Native illustrated articles and posters. Images are pinned reference IDs,
 * never URLs, bytes, live items, generation instructions, or access grants.
 * Shape validation is not authorization: resolve references in the owning item.
 */
function compositionType($type) {
    ensure(in_array($type,array('illustrated','poster'),true),'ARTIFACT_INVALID','圖文排版只支援 illustrated 或 poster。');return $type;
}
function compositionImageRef($value) {
    ensure(is_string($value)&&($value===''||preg_match('/^[a-f0-9]{32}$/D',$value)),'ARTIFACT_INVALID','圖片引用必須是空字串或32個小寫十六進位字元。');return $value;
}
function validateCompositionArtifact($value,$type) {
    compositionType($type);$illustrated=$type==='illustrated';$name=$illustrated?'圖文':'海報';
    artifactObject($value,$illustrated?array('kind','title','theme','blocks'):array('kind','title','format','theme','blocks'),$name.'作品');
    ensure($value['kind']===$type,'ARTIFACT_INVALID','圖文排版作品類型欄位不正確。');
    $title=artifactText($value['title'],600,$name.'標題',false);
    ensure(in_array($value['theme'],$illustrated?array('paper','night','meadow'):array('paper','night','festival'),true),'ARTIFACT_INVALID','圖文排版風格不受支援。');
    if(!$illustrated)ensure(in_array($value['format'],array('portrait','square','landscape'),true),'ARTIFACT_INVALID','海報版型只支援 portrait、square 或 landscape。');
    artifactList($value['blocks'],1,$illustrated?24:16,$name.'區塊');$ids=array();$blocks=array();$headlines=0;$content=0;
    foreach($value['blocks'] as $block){
        artifactObject($block,$illustrated?array('id','heading','body','layout','imageRefId','caption'):array('id','type','text','imageRefId','alignment'),$name.'區塊');
        $id=artifactStableId($block['id'],$name.'區塊識別碼');ensure(!in_array($id,$ids,true),'ARTIFACT_INVALID','圖文排版區塊識別碼不可重複。');$ids[]=$id;
        $ref=compositionImageRef($block['imageRefId']);
        if($illustrated){
            $heading=artifactText($block['heading'],600,'圖文段落標題');$body=artifactText($block['body'],12000,'圖文段落內文',false);
            ensure(in_array($block['layout'],array('text','above','left','right'),true),'ARTIFACT_INVALID','圖文排版只支援 text、above、left 或 right。');
            ensure(($block['layout']==='text')===($ref===''),'ARTIFACT_INVALID','純文字段落不可指定圖片；有圖排版必須選取固定圖片引用。');
            $blocks[]=array('id'=>$id,'heading'=>$heading,'body'=>$body,'layout'=>$block['layout'],'imageRefId'=>$ref,'caption'=>artifactText($block['caption'],600,'圖文圖片說明'));
        }else{
            ensure(in_array($block['type'],array('headline','text','image'),true),'ARTIFACT_INVALID','海報區塊只支援 headline、text 或 image。');
            ensure(in_array($block['alignment'],array('left','center','right'),true),'ARTIFACT_INVALID','海報對齊只支援 left、center 或 right。');
            $isImage=$block['type']==='image';ensure($isImage===($ref!==''),'ARTIFACT_INVALID','文字區塊不可指定圖片；圖片區塊必須選取固定圖片引用。');
            $literal=artifactText($block['text'],$isImage?600:2000,$isImage?'海報圖片說明':'海報文字',$isImage);
            if($block['type']==='headline')$headlines++;else $content++;
            $blocks[]=array('id'=>$id,'type'=>$block['type'],'text'=>$literal,'imageRefId'=>$ref,'alignment'=>$block['alignment']);
        }
    }
    if(!$illustrated)ensure($headlines>=1&&$content>=1,'ARTIFACT_INVALID','海報至少須有一個標題區塊及一個文字或圖片內容區塊。');
    $out=array('kind'=>$type,'title'=>$title);if(!$illustrated)$out['format']=$value['format'];$out['theme']=$value['theme'];$out['blocks']=$blocks;
    ensure(strlen(jsonEncode($out))<=60000,'ARTIFACT_INVALID','完整圖文排版 JSON 超過60000個 UTF8 位元組，未保存且未截斷內容。');return $out;
}
function compositionSchema($type) {
    compositionType($type);$text=array('type'=>'string');$illustrated=$type==='illustrated';
    $block=$illustrated?artifactSchemaObject(array('id'=>$text,'heading'=>$text,'body'=>$text,'layout'=>array('type'=>'string','enum'=>array('text','above','left','right')),'imageRefId'=>$text,'caption'=>$text)):
        artifactSchemaObject(array('id'=>$text,'type'=>array('type'=>'string','enum'=>array('headline','text','image')),'text'=>$text,'imageRefId'=>$text,'alignment'=>array('type'=>'string','enum'=>array('left','center','right'))));
    $properties=array('kind'=>array('type'=>'string','enum'=>array($type)),'title'=>$text);
    if(!$illustrated)$properties['format']=array('type'=>'string','enum'=>array('portrait','square','landscape'));
    $properties['theme']=array('type'=>'string','enum'=>$illustrated?array('paper','night','meadow'):array('paper','night','festival'));
    $properties['blocks']=array('type'=>'array','minItems'=>1,'maxItems'=>$illustrated?24:16,'items'=>$block);return artifactSchemaObject($properties);
}
function compositionItems($value,$type=null) {
    if($type===null)$type=field($value,'kind');$artifact=validateCompositionArtifact($value,$type);
    return array(array('id'=>'document','label'=>$type==='illustrated'?'圖文來源':'海報來源','content'=>jsonEncode($artifact)));
}
function compositionFromItems($items,$type) {
    compositionType($type);artifactList($items,1,1,'圖文排版來源');artifactObject($items[0],array('id','label','content'),'圖文排版來源');
    ensure($items[0]['id']==='document'&&$items[0]['label']===($type==='illustrated'?'圖文來源':'海報來源'),'ARTIFACT_INVALID','圖文排版來源必須是完整的 document 項目。');
    $content=artifactText($items[0]['content'],60000,'圖文排版來源 JSON',false);
    try{$raw=json_decode($content,false,8,JSON_THROW_ON_ERROR);}catch(JsonException $error){throw new AppError('ARTIFACT_INVALID','圖文排版來源必須是有效的完整 JSON 物件。');}
    artifactJsonSchemaValue($raw,compositionSchema($type));return validateCompositionArtifact(json_decode($content,true,8,JSON_THROW_ON_ERROR),$type);
}
function compositionCompactJson($value,$type=null) {
    if($type===null)$type=field($value,'kind');return jsonEncode(validateCompositionArtifact($value,$type));
}
function compositionContentFingerprint($value,$type=null) {
    if($type===null)$type=field($value,'kind');$artifact=validateCompositionArtifact($value,$type);foreach($artifact['blocks'] as &$block)unset($block['id']);unset($block);return jsonEncode($artifact);
}
