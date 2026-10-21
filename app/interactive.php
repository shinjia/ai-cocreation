<?php
/** Bounded declarative visual programs. No code, HTML, URLs or executable input.
 * Unselected parameter proposals do not override layer literals. Every snapshot
 * retains the complete program, selection, current values and previous values.
 */
function interactiveNumber($value,$min,$max,$name,$integer=false) {
    ensure((is_int($value)||is_float($value))&&is_finite((float)$value)&&$value>=$min&&$value<=$max,'ARTIFACT_INVALID',$name.'必須是範圍內的有限數字。');
    ensure((!$integer||floor($value)==$value)&&round($value,3)==$value,'ARTIFACT_INVALID',$name.'必須符合整數或最多三位小數限制。');
    if($value==0)return 0;return floor($value)==$value?(int)$value:$value;
}
function interactivePaint($value,$name) {
    ensure(is_string($value)&&preg_match('/^(?:#[0-9a-fA-F]{6}|none)$/D',$value),'ARTIFACT_INVALID',$name.'只接受六位十六進位色碼或 none。');return $value;
}
function interactiveTargetBounds($target,$type) {
    $bounds=array('x'=>array(-4096,4096),'y'=>array(-4096,4096),'width'=>array($type==='line'?-4096:0.001,4096),'height'=>array($type==='line'?-4096:0.001,4096),'strokeWidth'=>array(0,64),'opacity'=>array(0,1),'rotation'=>array(-360,360),'motionAmount'=>array(0,512),'motionSpeed'=>array(0,10));
    ensure(is_string($target)&&isset($bounds[$target]),'ARTIFACT_INVALID','參數只能控制支援的數字屬性。');return $bounds[$target];
}
function interactiveGrid($value,$min,$step) {return ((int)round($value*1000)-(int)round($min*1000))%(int)round($step*1000)===0;}
function validateInteractiveArtifact($value) {
    artifactObject($value,array('kind','title','width','height','background','animation','duration','layers','parameters'),'互動視覺');
    ensure($value['kind']==='interactive','ARTIFACT_INVALID','互動視覺類型不正確。');
    $title=artifactText($value['title'],600,'互動視覺標題');$width=interactiveNumber($value['width'],1,2048,'畫布寬度',true);$height=interactiveNumber($value['height'],1,2048,'畫布高度',true);
    $background=interactivePaint($value['background'],'背景');ensure(is_bool($value['animation']),'ARTIFACT_INVALID','動畫選項必須是布林值。');$duration=interactiveNumber($value['duration'],1,60,'播放秒數',true);
    artifactList($value['layers'],1,40,'視覺圖層');$layers=array();$ids=array();
    foreach($value['layers'] as $layer){
        artifactObject($layer,array('id','label','type','x','y','width','height','fill','stroke','strokeWidth','opacity','rotation','motion','motionAmount','motionSpeed','interaction'),'視覺圖層');
        $id=artifactStableId($layer['id'],'圖層識別碼');ensure(!in_array($id,$ids,true),'ARTIFACT_INVALID','圖層識別碼不可重複。');$ids[]=$id;
        ensure(in_array($layer['type'],array('rect','ellipse','line'),true),'ARTIFACT_INVALID','圖層只支援 rect、ellipse、line。');
        $next=array('id'=>$id,'label'=>artifactText($layer['label'],120,'圖層名稱'),'type'=>$layer['type']);
        foreach(array('x','y','width','height') as $key){$bounds=interactiveTargetBounds($key,$layer['type']);$next[$key]=interactiveNumber($layer[$key],$bounds[0],$bounds[1],$key);}
        $next['fill']=interactivePaint($layer['fill'],'填色');$next['stroke']=interactivePaint($layer['stroke'],'外框');
        foreach(array('strokeWidth','opacity','rotation') as $key){$bounds=interactiveTargetBounds($key,$layer['type']);$next[$key]=interactiveNumber($layer[$key],$bounds[0],$bounds[1],$key);}
        ensure(in_array($layer['motion'],array('none','orbit','wave','pulse','spin'),true),'ARTIFACT_INVALID','不支援的動畫模式。');$next['motion']=$layer['motion'];
        foreach(array('motionAmount','motionSpeed') as $key){$bounds=interactiveTargetBounds($key,$layer['type']);$next[$key]=interactiveNumber($layer[$key],$bounds[0],$bounds[1],$key);}
        ensure(in_array($layer['interaction'],array('none','pointer','hover'),true),'ARTIFACT_INVALID','不支援的互動模式。');$next['interaction']=$layer['interaction'];$layers[]=$next;
    }
    artifactList($value['parameters'],0,24,'可選參數');$parameters=array();$parameterIds=array();$targets=array();
    foreach($value['parameters'] as $parameter){
        artifactObject($parameter,array('id','label','layerId','target','min','max','step','value','previousValue','selected'),'可選參數');
        $id=artifactStableId($parameter['id'],'參數識別碼');ensure(!in_array($id,$parameterIds,true),'ARTIFACT_INVALID','參數識別碼不可重複。');$parameterIds[]=$id;
        $layerId=artifactStableId($parameter['layerId'],'參數目標圖層');$index=array_search($layerId,$ids,true);ensure($index!==false,'ARTIFACT_INVALID','參數目標圖層不存在。');
        $bounds=interactiveTargetBounds($parameter['target'],$layers[$index]['type']);$targetKey=$layerId.':'.$parameter['target'];ensure(!in_array($targetKey,$targets,true),'ARTIFACT_INVALID','同一圖層屬性只能有一個參數。');$targets[]=$targetKey;
        $min=interactiveNumber($parameter['min'],$bounds[0],$bounds[1],'參數下限');$max=interactiveNumber($parameter['max'],$min,$bounds[1],'參數上限');
        $step=interactiveNumber($parameter['step'],0.001,8192,'參數步進');ensure($max>$min&&interactiveGrid($max,$min,$step)&&((int)round($max*1000)-(int)round($min*1000))/(int)round($step*1000)<=10000,'ARTIFACT_INVALID','參數範圍須大於零、對齊步進，且最多10000個間隔。');
        $current=interactiveNumber($parameter['value'],$min,$max,'參數目前值');$previous=interactiveNumber($parameter['previousValue'],$min,$max,'參數前次值');
        ensure(interactiveGrid($current,$min,$step)&&interactiveGrid($previous,$min,$step),'ARTIFACT_INVALID','參數目前值與前次值必須對齊步進。');
        ensure(is_bool($parameter['selected']),'ARTIFACT_INVALID','參數選用必須是布林值。');
        $parameters[]=array('id'=>$id,'label'=>artifactText($parameter['label'],120,'參數名稱'),'layerId'=>$layerId,'target'=>$parameter['target'],'min'=>$min,'max'=>$max,'step'=>$step,'value'=>$current,'previousValue'=>$previous,'selected'=>$parameter['selected']);
    }
    $out=array('kind'=>'interactive','title'=>$title,'width'=>$width,'height'=>$height,'background'=>$background,'animation'=>$value['animation'],'duration'=>$duration,'layers'=>$layers,'parameters'=>$parameters);
    ensure(strlen(jsonEncode($out))<=60000&&strlen(interactiveEncode($out))<=60000,'ARTIFACT_INVALID','完整互動視覺超過60000個 UTF8 位元組，未保存且未截斷。');return $out;
}
function interactiveEncode($value) {
    if(is_string($value))return jsonEncode($value);if(is_bool($value))return $value?'true':'false';
    if(is_int($value)||is_float($value)){if($value==0)return '0';return rtrim(rtrim(number_format($value,3,'.',''),'0'),'.');}
    $list=$value===array()||array_keys($value)===range(0,count($value)-1);$parts=array();foreach($value as $key=>$entry)$parts[]=($list?'':jsonEncode((string)$key).':').interactiveEncode($entry);return ($list?'[':'{').implode(',',$parts).($list?']':'}');
}
function interactiveCompactJson($value) {return interactiveEncode(validateInteractiveArtifact($value));}
function interactiveItems($value) {return array(array('id'=>'document','label'=>'互動程式來源','content'=>interactiveCompactJson($value)));}
function interactiveFromItems($items) {
    artifactList($items,1,1,'互動程式來源');artifactObject($items[0],array('id','label','content'),'互動程式來源');
    ensure($items[0]['id']==='document'&&$items[0]['label']==='互動程式來源','ARTIFACT_INVALID','互動程式來源必須是完整 document 項目。');$content=artifactText($items[0]['content'],60000,'互動視覺 JSON',false);
    try{$raw=json_decode($content,false,8,JSON_THROW_ON_ERROR);}catch(JsonException $error){throw new AppError('ARTIFACT_INVALID','互動程式來源必須是有效完整 JSON。');}
    artifactJsonSchemaValue($raw,interactiveSchema());return validateInteractiveArtifact(json_decode($content,true,8,JSON_THROW_ON_ERROR));
}
function interactiveDrawingFingerprint($value) {
    // Derived drawing comparison ONLY. Full saved artifacts, latent motion
    // settings, current/prior parameter values and refine content are untouched.
    $artifact=validateInteractiveArtifact($value);$layers=$artifact['layers'];
    foreach($artifact['parameters'] as $parameter)if($parameter['selected'])foreach($layers as &$layer)if($layer['id']===$parameter['layerId'])$layer[$parameter['target']]=$parameter['value'];unset($layer);
    $drawing=array();$dynamic=false;
    foreach($layers as $layer){
        unset($layer['id'],$layer['label']);$layer['fill']=strtolower($layer['fill']);$layer['stroke']=strtolower($layer['stroke']);
        if($layer['type']==='line')$layer['fill']='none';
        if($layer['stroke']==='none'||$layer['strokeWidth']==0){$layer['stroke']='none';$layer['strokeWidth']=0;}
        // No off-canvas culling: motion or pointer interaction may bring a
        // visible layer into view. Fully transparent/unpainted layers cannot.
        if($layer['opacity']==0||($layer['fill']==='none'&&$layer['stroke']==='none'))continue;
        $moving=$artifact['animation']&&$layer['motion']!=='none'&&$layer['motionAmount']!=0;
        if($moving&&$layer['motionSpeed']==0){
            // At angle zero orbit adds cos(0)*amount to X, including the
            // interaction/hover center. Other supported modes are identity.
            if($layer['motion']==='orbit')$layer['x']=round($layer['x']+$layer['motionAmount'],3);
            $moving=false;
        }
        if(!$moving){$layer['motion']='none';$layer['motionAmount']=0;$layer['motionSpeed']=0;}else $dynamic=true;
        $drawing[]=$layer;
    }
    return interactiveEncode(array('width'=>$artifact['width'],'height'=>$artifact['height'],'background'=>strtolower($artifact['background']),'animation'=>$dynamic,'duration'=>$dynamic?$artifact['duration']:0,'layers'=>$drawing));
}
function interactiveSchema() {
    $text=array('type'=>'string');$boolean=array('type'=>'boolean');$number=array('type'=>'number');$num=function($min,$max){return array('type'=>'number','minimum'=>$min,'maximum'=>$max);};$enum=function($values){return array('type'=>'string','enum'=>$values);};
    $layer=artifactSchemaObject(array('id'=>$text,'label'=>$text,'type'=>$enum(array('rect','ellipse','line')),'x'=>$num(-4096,4096),'y'=>$num(-4096,4096),'width'=>$num(-4096,4096),'height'=>$num(-4096,4096),'fill'=>$text,'stroke'=>$text,'strokeWidth'=>$num(0,64),'opacity'=>$num(0,1),'rotation'=>$num(-360,360),'motion'=>$enum(array('none','orbit','wave','pulse','spin')),'motionAmount'=>$num(0,512),'motionSpeed'=>$num(0,10),'interaction'=>$enum(array('none','pointer','hover'))));
    $parameter=artifactSchemaObject(array('id'=>$text,'label'=>$text,'layerId'=>$text,'target'=>$enum(array('x','y','width','height','strokeWidth','opacity','rotation','motionAmount','motionSpeed')),'min'=>$number,'max'=>$number,'step'=>$num(0.001,8192),'value'=>$number,'previousValue'=>$number,'selected'=>$boolean));
    return artifactSchemaObject(array('kind'=>$enum(array('interactive')),'title'=>$text,'width'=>array('type'=>'integer','minimum'=>1,'maximum'=>2048),'height'=>array('type'=>'integer','minimum'=>1,'maximum'=>2048),'background'=>$text,'animation'=>$boolean,'duration'=>array('type'=>'integer','minimum'=>1,'maximum'=>60),'layers'=>array('type'=>'array','minItems'=>1,'maxItems'=>40,'items'=>$layer),'parameters'=>array('type'=>'array','minItems'=>0,'maxItems'=>24,'items'=>$parameter)));
}
