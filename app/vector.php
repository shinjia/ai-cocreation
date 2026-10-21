<?php
// Native primitive geometry is authoritative. SVG is an export format, never
// accepted as executable/source input. Shared helpers check exact keys, UTF8,
// byte limits and secrets; the raw JSON guard checks object/list distinctions.
function vectorNumber($value,$minimum,$maximum,$name,$integer=false) {
    ensure((is_int($value)||is_float($value))&&is_finite((float)$value),'ARTIFACT_INVALID',$name.'必須是有限數字，不接受數字字串、布林值或空值。');
    ensure(!$integer||floor((float)$value)==(float)$value,'ARTIFACT_INVALID',$name.'必須是整數。');
    ensure($value>=$minimum&&$value<=$maximum,'ARTIFACT_INVALID',$name.'超過允許範圍。');
    ensure(round($value,3)==$value,'ARTIFACT_INVALID',$name.'最多只能有三位小數，未自動四捨五入。');
    // JSON/JavaScript cannot distinguish 1 from 1.0. Accept integral numeric
    // canvas values, reject booleans/strings, and canonicalize to integers.
    // Never round overprecision into a different accepted drawing.
    if($value==0)return 0;
    return is_float($value)&&floor($value)===$value?(int)$value:$value;
}
function vectorPaint($value,$name) {
    ensure(is_string($value)&&($value==='none'||preg_match('/^#[0-9a-fA-F]{6}$/D',$value)),'ARTIFACT_INVALID',$name.'只接受六位十六進位色碼或 none。');
    return $value;
}
function validateVectorArtifact($value) {
    artifactObject($value,array('kind','title','width','height','background','shapes'),'向量圖形');
    ensure($value['kind']==='vector','ARTIFACT_INVALID','向量圖形類型欄位不正確。');
    $title=artifactText($value['title'],600,'向量圖形標題');
    $width=vectorNumber($value['width'],1,4096,'畫布寬度',true);$height=vectorNumber($value['height'],1,4096,'畫布高度',true);
    $background=vectorPaint($value['background'],'畫布背景');artifactList($value['shapes'],1,100,'向量物件');
    $shapes=array();$ids=array();
    foreach($value['shapes'] as $shape){
        artifactObject($shape,array('id','type','label','x','y','width','height','fill','stroke','strokeWidth','opacity','text','fontSize','points'),'向量物件');
        $id=artifactStableId($shape['id'],'向量物件識別碼');ensure(!in_array($id,$ids,true),'ARTIFACT_INVALID','向量物件識別碼不可重複。');$ids[]=$id;
        $type=$shape['type'];ensure(in_array($type,array('rect','ellipse','line','polygon','polyline','text'),true),'ARTIFACT_INVALID','向量物件只支援矩形、橢圓、直線、多邊形、折線與文字。');
        $label=artifactText($shape['label'],120,'向量物件名稱');
        $x=vectorNumber($shape['x'],-4096,8192,'物件 X 座標');$y=vectorNumber($shape['y'],-4096,8192,'物件 Y 座標');
        $shapeWidth=vectorNumber($shape['width'],-8192,8192,'物件寬度');$shapeHeight=vectorNumber($shape['height'],-8192,8192,'物件高度');
        if($type==='rect'||$type==='ellipse')ensure($shapeWidth>0&&$shapeHeight>0,'ARTIFACT_INVALID','矩形與橢圓的寬高必須大於零。');
        elseif($type!=='line')ensure($shapeWidth===0&&$shapeHeight===0,'ARTIFACT_INVALID','多邊形、折線與文字的寬高欄位必須為零。');
        $fill=vectorPaint($shape['fill'],'物件填色');$stroke=vectorPaint($shape['stroke'],'物件邊線');
        $strokeWidth=vectorNumber($shape['strokeWidth'],0,100,'邊線寬度');$opacity=vectorNumber($shape['opacity'],0,1,'物件不透明度');
        $text=artifactText($shape['text'],4000,'向量文字',$type!=='text');
        $fontSize=vectorNumber($shape['fontSize'],$type==='text'?1:0,$type==='text'?512:0,'文字大小');
        ensure($type==='text'||$text==='','ARTIFACT_INVALID','非文字物件的 text 欄位必須為空字串。');
        $minimum=$type==='polygon'?3:($type==='polyline'?2:0);$maximum=$minimum===0?0:80;
        artifactList($shape['points'],$minimum,$maximum,'向量頂點');$points=array();
        foreach($shape['points'] as $point){
            artifactObject($point,array('x','y'),'向量頂點');
            $points[]=array('x'=>vectorNumber($point['x'],-4096,8192,'頂點 X 座標'),'y'=>vectorNumber($point['y'],-4096,8192,'頂點 Y 座標'));
        }
        // Order is meaningful: later shapes are drawn above earlier ones.
        // Points are local coordinates translated by the shape's x and y.
        $shapes[]=array('id'=>$id,'type'=>$type,'label'=>$label,'x'=>$x,'y'=>$y,'width'=>$shapeWidth,'height'=>$shapeHeight,
            'fill'=>$fill,'stroke'=>$stroke,'strokeWidth'=>$strokeWidth,'opacity'=>$opacity,'text'=>$text,'fontSize'=>$fontSize,'points'=>$points);
    }
    $out=array('kind'=>'vector','title'=>$title,'width'=>$width,'height'=>$height,'background'=>$background,'shapes'=>$shapes);
    ensure(strlen(jsonEncode($out))<=60000,'ARTIFACT_INVALID','向量圖形經伺服器序列化後超過60000個 UTF8 位元組，未保存且未截斷內容。');
    ensure(strlen(vectorCompactJson($out))<=60000,'ARTIFACT_INVALID','完整向量圖形文字投影超過保存上限，未截斷內容。');
    return $out;
}
function vectorCompactJson($value) {
    // Deterministic projection independent of PHP serialize_precision. Call
    // with validated canonical geometry. At most three fractional digits,
    // no exponent or signed zero; string encoding retains U+2028/U+2029 escapes.
    // Keys and array order are never sorted or rewritten during serialization.
    if(is_string($value))return jsonEncode($value);
    if(is_int($value)||is_float($value)){
        ensure(is_finite((float)$value)&&round($value,3)==$value,'ARTIFACT_INVALID','向量投影數字必須有限且最多三位小數。');
        if($value==0)return '0';
        return rtrim(rtrim(number_format($value,3,'.',''),'0'),'.');
    }
    ensure(is_array($value),'ARTIFACT_INVALID','向量投影只接受完整原生圖形資料。');
    $list=$value===array()||array_keys($value)===range(0,count($value)-1);$parts=array();
    foreach($value as $key=>$entry)$parts[]=($list?'':jsonEncode((string)$key).':').vectorCompactJson($entry);
    return ($list?'[':'{').implode(',',$parts).($list?']':'}');
}
function vectorDrawingFingerprint($value) {
    // Fusion must change the actual ordered drawing, not just document/title
    // labels or identities. Retain layer order AND duplicate multiplicity:
    // overlap and opacity can change the rendered result in either case.
    $artifact=validateVectorArtifact($value);$shapes=array();
    foreach($artifact['shapes'] as $shape){
        unset($shape['id'],$shape['label']);
        // Hex case does not change paint. Normalize only this derived key;
        // native snapshots/projections retain the user's original spelling.
        $shape['fill']=strtolower($shape['fill']);$shape['stroke']=strtolower($shape['stroke']);$shapes[]=$shape;
    }
    return vectorCompactJson(array('width'=>$artifact['width'],'height'=>$artifact['height'],'background'=>strtolower($artifact['background']),'shapes'=>$shapes));
}
function vectorSchema() {
    $text=array('type'=>'string');$coordinate=array('type'=>'number','minimum'=>-4096,'maximum'=>8192);
    $dimension=array('type'=>'number','minimum'=>-8192,'maximum'=>8192);$canvas=array('type'=>'integer','minimum'=>1,'maximum'=>4096);
    $point=artifactSchemaObject(array('x'=>$coordinate,'y'=>$coordinate));
    // Cross-field/type rules are checked by validateVectorArtifact after the
    // provider/raw schema guard, not by an optional provider union extension.
    $shape=artifactSchemaObject(array('id'=>$text,'type'=>array('type'=>'string','enum'=>array('rect','ellipse','line','polygon','polyline','text')),
        'label'=>$text,'x'=>$coordinate,'y'=>$coordinate,'width'=>$dimension,'height'=>$dimension,'fill'=>$text,'stroke'=>$text,
        'strokeWidth'=>array('type'=>'number','minimum'=>0,'maximum'=>100),'opacity'=>array('type'=>'number','minimum'=>0,'maximum'=>1),
        'text'=>$text,'fontSize'=>array('type'=>'number','minimum'=>0,'maximum'=>512),'points'=>array('type'=>'array','minItems'=>0,'maxItems'=>80,'items'=>$point)));
    return artifactSchemaObject(array('kind'=>array('type'=>'string','enum'=>array('vector')),'title'=>$text,'width'=>$canvas,'height'=>$canvas,'background'=>$text,
        'shapes'=>array('type'=>'array','minItems'=>1,'maxItems'=>100,'items'=>$shape)));
}
function vectorItems($value) {
    $artifact=validateVectorArtifact($value);$content=vectorCompactJson($artifact);
    ensure(strlen($content)<=60000,'ARTIFACT_INVALID','完整向量圖形文字投影超過保存上限，未截斷內容。');
    return array(array('id'=>'document','label'=>'向量圖形來源','content'=>$content));
}
