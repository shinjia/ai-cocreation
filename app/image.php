<?php
/**
 * Native metadata for an externally uploaded, server-normalized PNG version.
 * Validation proves shape only, never ownership, access, or that bytes exist.
 * The application must resolve every asset against its authorized stored version.
 * No URL, filesystem path, raw bytes, provider request, or image generation lives here.
 */
function validateImageArtifact($value) {
    artifactObject($value,array('kind','title','alt','attribution','asset'),'圖片作品');
    ensure($value['kind']==='image','ARTIFACT_INVALID','圖片作品類型欄位不正確。');
    $title=artifactText($value['title'],600,'圖片標題',false);
    $alt=artifactText($value['alt'],3000,'圖片替代文字');
    $attribution=artifactText($value['attribution'],2000,'圖片來源註記');
    $asset=$value['asset'];
    artifactObject($asset,array('id','mime','width','height','byteLength','sha256','normalization'),'圖片資產');
    ensure(is_string($asset['id'])&&preg_match('/^[a-f0-9]{32}$/D',$asset['id']),'ARTIFACT_INVALID','圖片資產識別碼必須是32個小寫十六進位字元。');
    ensure($asset['mime']==='image/png','ARTIFACT_INVALID','圖片資產格式必須是 image/png。');
    foreach(array('width','height') as $dimension)ensure(is_int($asset[$dimension])&&$asset[$dimension]>=1&&$asset[$dimension]<=2048,'ARTIFACT_INVALID','圖片寬高必須是1至2048的整數。');
    ensure(is_int($asset['byteLength'])&&$asset['byteLength']>=1&&$asset['byteLength']<=4194304,'ARTIFACT_INVALID','圖片位元組長度必須是1至4194304的整數。');
    ensure(is_string($asset['sha256'])&&preg_match('/^[a-f0-9]{64}$/D',$asset['sha256']),'ARTIFACT_INVALID','圖片 SHA256 必須是64個小寫十六進位字元。');
    ensure($asset['normalization']==='png-v1','ARTIFACT_INVALID','圖片正規化版本必須是 png-v1。');
    return array('kind'=>'image','title'=>$title,'alt'=>$alt,'attribution'=>$attribution,'asset'=>array(
        'id'=>$asset['id'],'mime'=>'image/png','width'=>$asset['width'],'height'=>$asset['height'],
        'byteLength'=>$asset['byteLength'],'sha256'=>$asset['sha256'],'normalization'=>'png-v1'));
}
function imageArtifactSchema() {
    $text=array('type'=>'string');$dimension=array('type'=>'integer','minimum'=>1,'maximum'=>2048);
    return artifactSchemaObject(array('kind'=>array('type'=>'string','enum'=>array('image')),'title'=>$text,'alt'=>$text,'attribution'=>$text,
        'asset'=>artifactSchemaObject(array('id'=>$text,'mime'=>array('type'=>'string','enum'=>array('image/png')),
            'width'=>$dimension,'height'=>$dimension,'byteLength'=>array('type'=>'integer','minimum'=>1,'maximum'=>4194304),
            'sha256'=>$text,'normalization'=>array('type'=>'string','enum'=>array('png-v1'))))));
}
function imageArtifactItems($value) {
    $artifact=validateImageArtifact($value);
    return array(array('id'=>'document','label'=>'圖片來源','content'=>jsonEncode($artifact)));
}
function imageArtifactFromItems($items) {
    artifactList($items,1,1,'圖片來源');artifactObject($items[0],array('id','label','content'),'圖片來源');
    ensure($items[0]['id']==='document'&&$items[0]['label']==='圖片來源','ARTIFACT_INVALID','圖片來源必須是完整的 document 項目。');
    $content=artifactText($items[0]['content'],60000,'圖片來源 JSON',false);
    try {$raw=json_decode($content,false,8,JSON_THROW_ON_ERROR);}catch(JsonException $error){throw new AppError('ARTIFACT_INVALID','圖片來源必須是有效的完整 JSON 物件。');}
    // Preserve JSON object/array distinction before associative decoding.
    artifactJsonSchemaValue($raw,imageArtifactSchema());
    return validateImageArtifact(json_decode($content,true,8,JSON_THROW_ON_ERROR));
}
