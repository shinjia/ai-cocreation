<?php
// Native, immutable document data. Cells are text, never expressions or HTML.
// Validation is authoritative for manual snapshots and strict model responses.
function artifactType($type) { return $type==='table'||$type==='chart'||$type==='mindmap'||$type==='vector'||$type==='webpage'; }
function artifactObject($value,$keys,$name) {
    ensure(is_array($value),'ARTIFACT_INVALID',$name.'必須是完整物件。');
    $actual=array_keys($value);sort($actual,SORT_STRING);$expected=$keys;sort($expected,SORT_STRING);
    ensure($actual===$expected,'ARTIFACT_INVALID',$name.'缺少欄位或包含未支援的欄位。');
}
function artifactList($value,$minimum,$maximum,$name) {
    ensure(is_array($value)&&($value===array()||array_keys($value)===range(0,count($value)-1))&&count($value)>=$minimum&&count($value)<=$maximum,'ARTIFACT_INVALID',$name.'的數量或清單格式不正確。');
}
function artifactTrim($value) {
    // ECMAScript trim whitespace gives the browser and PHP identical labels.
    $space='[\x{0009}-\x{000D}\x{0020}\x{00A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]';
    return preg_replace('/^'.$space.'+|'.$space.'+$/u','',$value);
}
function artifactText($value,$maximum,$name,$empty=true) {
    ensure(is_string($value)&&preg_match('//u',$value)&&strpos($value,"\0")===false,'ARTIFACT_INVALID',$name.'必須是有效 UTF8 文字。');
    ensure(strlen($value)<=$maximum&&($empty||artifactTrim($value)!==''),'ARTIFACT_INVALID',$name.'空白或超過長度上限。');
    userTextValue($value,$maximum,$name,$empty); // Retain the shared secret guard, not its trimmed return.
    return $value; // Do not trim or otherwise rewrite stored text.
}
function artifactStableId($value,$name) {
    ensure(is_string($value)&&preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/D',$value),'ARTIFACT_INVALID',$name.'必須是最多64字元的穩定英數識別碼，可包含 - 或 _。');
    userTextValue($value,64,$name);
    return $value;
}
function artifactSourceText($sourceText) {
    artifactText($sourceText,12000,'圖表文字來源',false);
    $sourceText=str_replace("\r\n","\n",$sourceText);
    ensure(strpos($sourceText,"\r")===false,'ARTIFACT_INVALID','圖表來源不可包含單獨的 CR 換行字元。');
    return $sourceText;
}
function flowchartId($id) {
    ensure(!in_array(strtolower($id),array('end','subgraph','click','style','classdef','class','direction','linkstyle','flowchart','graph'),true),'ARTIFACT_INVALID','流程圖節點識別碼使用了保留字。');
    return $id;
}
function flowchartLabel($value,$edge=false) {
    $quoted=strlen($value)>=2&&$value[0]==='"'&&substr($value,-1)==='"';
    if($quoted)$value=substr($value,1,-1);
    artifactText($value,$edge?120:240,$edge?'流程圖連線標籤':'流程圖節點文字',$edge);
    ensure(!preg_match('/[\x00-\x1F\x7F"`\\\\<>&#|]/u',$value),'ARTIFACT_INVALID','流程圖標籤只能使用純文字，不可包含控制字元、引號、反引號、反斜線、HTML 或特殊標記。');
    ensure(!preg_match('/(?:[a-z][a-z0-9+.-]*:\/\/|mailto:|javascript:|data:|www\.)/iu',$value),'ARTIFACT_INVALID','流程圖標籤不可包含網址或可執行連結。');
    // Unquoted closing delimiters/statement separators can escape a node in
    // exported Mermaid text; quoted punctuation is literal and stays supported.
    ensure($quoted||!preg_match('/[\[\]{}();]/u',$value),'ARTIFACT_INVALID','流程圖含括號或分號的標籤必須使用一組外層雙引號，不能混入其他語法。');
    return $value;
}
function parseFlowchartSource($sourceText) {
    $sourceText=artifactSourceText($sourceText);
    // Check even comments before parsing: external Mermaid parsers must not
    // reinterpret hidden newlines or bidi controls when this source is copied.
    ensure(!preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x{007F}-\x{009F}\x{2028}\x{2029}\x{061C}\x{200E}\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}]/u',$sourceText),'ARTIFACT_INVALID','流程圖來源不可包含控制字元、特殊換行或雙向控制字元。');
    ensure(strpos($sourceText,'%%{')===false,'ARTIFACT_INVALID','流程圖不支援初始化指令或 Mermaid directives。');
    $direction=null;$nodes=array();$edges=array();$ids=array();$edgeKeys=array();
    foreach(explode("\n",$sourceText) as $rawLine){
        $line=artifactTrim($rawLine);if($line===''||substr($line,0,2)==='%%')continue;
        if(substr($line,-1)===';')$line=artifactTrim(substr($line,0,-1));
        if($direction===null){
            ensure(preg_match('/^(?:flowchart|graph) (TD|TB|LR)$/D',$line,$header),'ARTIFACT_INVALID','流程圖第一個有效行必須是 flowchart TD、flowchart LR、graph TD 或 graph LR（也接受 TB）。');
            $direction=$header[1]==='TB'?'TD':$header[1];continue;
        }
        if(preg_match('/^([A-Za-z][A-Za-z0-9_]{0,39})[ \t]*([\[\{\(])(.*)([\]\}\)])$/Du',$line,$node)){
            $pairs=array('['=>']','{'=>'}','('=>')');
            ensure($pairs[$node[2]]===$node[4],'ARTIFACT_INVALID','流程圖節點括號必須正確配對。');
            $id=flowchartId($node[1]);$label=flowchartLabel($node[3]);
            ensure(!in_array($id,$ids,true),'ARTIFACT_INVALID','流程圖節點識別碼不可重複宣告。');
            ensure(count($nodes)<40,'ARTIFACT_INVALID','流程圖最多支援40個節點。');
            $ids[]=$id;$shapes=array('['=>'rect','{'=>'diamond','('=>'round');$nodes[]=array('id'=>$id,'label'=>$label,'shape'=>$shapes[$node[2]]);continue;
        }
        if(preg_match('/^([A-Za-z][A-Za-z0-9_]{0,39})[ \t]*-->[ \t]*(?:\|([^|]*)\|[ \t]*)?([A-Za-z][A-Za-z0-9_]{0,39})$/Du',$line,$edge)){
            $from=flowchartId($edge[1]);$to=flowchartId($edge[3]);$label=flowchartLabel($edge[2],true);
            $key=jsonEncode(array($from,$to,$label));
            ensure(!in_array($key,$edgeKeys,true),'ARTIFACT_INVALID','流程圖不可重複相同起點、終點與標籤的連線。');
            ensure(count($edges)<80,'ARTIFACT_INVALID','流程圖最多支援80條連線。');
            $edgeKeys[]=$key;$edges[]=array('from'=>$from,'to'=>$to,'label'=>$label);continue;
        }
        throw new AppError('ARTIFACT_INVALID','流程圖包含不支援的語法；請逐行宣告節點或使用 A --> B、A -->|標籤| B。');
    }
    ensure($direction!==null&&count($nodes)>=1,'ARTIFACT_INVALID','流程圖必須包含方向標頭及至少1個明確宣告的節點。');
    foreach($edges as $edge)ensure(in_array($edge['from'],$ids,true)&&in_array($edge['to'],$ids,true),'ARTIFACT_INVALID','流程圖連線的起點與終點都必須明確宣告為節點。');
    return array('direction'=>$direction,'nodes'=>$nodes,'edges'=>$edges);
}
function parseChartSource($sourceText,$chartType) {
    ensure(in_array($chartType,array('flowchart','bar','line','pie'),true),'ARTIFACT_INVALID','圖表類型只支援 flowchart、bar、line 或 pie。');
    if($chartType==='flowchart')return parseFlowchartSource($sourceText);
    $sourceText=artifactSourceText($sourceText);
    // One optional final newline is conventional TSV, not an extra data row.
    // It is ignored for parsing only; the validated artifact keeps this byte.
    $lines=explode("\n",substr($sourceText,-1)==="\n"?substr($sourceText,0,-1):$sourceText);
    ensure(count($lines)>=2&&count($lines)<=25,'ARTIFACT_INVALID','圖表 TSV 必須有一列標頭，以及1至24列資料。');
    $header=explode("\t",array_shift($lines));
    ensure(count($header)>=2&&count($header)<=6,'ARTIFACT_INVALID','圖表 TSV 標頭需包含分類名稱與1至5個數列。');
    $names=array();foreach($header as $cell){artifactText($cell,120,'圖表標頭',false);$names[]=artifactTrim($cell);}
    $categoryLabel=array_shift($names);$series=array();$seenNames=array();
    foreach($names as $index=>$name){
        ensure(!in_array($name,$seenNames,true),'ARTIFACT_INVALID','圖表數列名稱不可重複。');$seenNames[]=$name;
        $series[]=array('id'=>'series_'.($index+1),'label'=>$name,'values'=>array());
    }
    ensure($chartType!=='pie'||count($series)===1,'ARTIFACT_INVALID','圓餅圖只能包含一個數列。');
    $labels=array();$sum=0.0;
    foreach($lines as $line){
        $cells=explode("\t",$line);
        ensure(count($cells)===count($header),'ARTIFACT_INVALID','圖表每列欄位數必須與標頭完全相同。');
        $rawLabel=array_shift($cells);artifactText($rawLabel,120,'圖表分類名稱',false);$label=artifactTrim($rawLabel);
        ensure(!in_array($label,$labels,true),'ARTIFACT_INVALID','圖表分類名稱不可重複。');$labels[]=$label;
        foreach($cells as $index=>$cell){
            // Decimal only: no whitespace, exponent, separators, formulas, JS,
            // NaN or Infinity. A plus sign, leading zeros and .5 are permitted.
            ensure(preg_match('/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/D',$cell),'ARTIFACT_INVALID','圖表數值需使用完整十進位數字，不可使用公式、科學記號或空白。');
            // Compare decimal magnitude before float conversion so a value just
            // above 1e12 cannot round down and slip through the hard bound.
            $decimal=explode('.',ltrim($cell,'+-'),2);$integer=ltrim($decimal[0],'0');$fraction=isset($decimal[1])?$decimal[1]:'';
            $within=strlen($integer)<13||(strlen($integer)===13&&strcmp($integer,'1000000000000')<=0&&($integer!=='1000000000000'||trim($fraction,'0')===''));
            $number=(float)$cell;
            ensure($within&&is_finite($number)&&abs($number)<=1000000000000,'ARTIFACT_INVALID','圖表數值必須有限，且絕對值不得超過1兆。');
            ensure($chartType!=='pie'||!($cell[0]==='-'&&preg_match('/[1-9]/',$cell)),'ARTIFACT_INVALID','圓餅圖數值不可為負數。');
            $series[$index]['values'][]=$number;$sum+=$number;
        }
    }
    ensure($chartType!=='pie'||$sum>0,'ARTIFACT_INVALID','圓餅圖數值加總必須大於零。');
    return array('labels'=>$labels,'series'=>$series,'categoryLabel'=>$categoryLabel);
}
function validateArtifact($value,$type) {
    if($type==='webpage')return validateWebpageArtifact($value);
    if($type==='mindmap')return validateMindmapArtifact($value);
    if($type==='vector')return validateVectorArtifact($value);
    ensure(artifactType($type),'ARTIFACT_TYPE_INVALID','此類型不是可保存的結構化作品。');
    if($type==='table'){
        artifactObject($value,array('kind','caption','columns','rows'),'表格');
        ensure($value['kind']==='table','ARTIFACT_INVALID','表格類型欄位不正確。');
        $caption=artifactText($value['caption'],600,'表格說明');
        artifactList($value['columns'],1,12,'表格欄位');artifactList($value['rows'],1,100,'表格資料列');
        $columns=array();$columnIds=array();
        foreach($value['columns'] as $column){
            artifactObject($column,array('id','label'),'表格欄位');$id=artifactStableId($column['id'],'欄位識別碼');
            ensure(!in_array($id,$columnIds,true),'ARTIFACT_INVALID','表格欄位識別碼不可重複。');$columnIds[]=$id;
            $columns[]=array('id'=>$id,'label'=>artifactText($column['label'],120,'欄位名稱',false));
        }
        $rows=array();$rowIds=array();
        foreach($value['rows'] as $row){
            artifactObject($row,array('id','cells'),'表格資料列');$id=artifactStableId($row['id'],'資料列識別碼');
            ensure(!in_array($id,$rowIds,true),'ARTIFACT_INVALID','表格資料列識別碼不可重複。');$rowIds[]=$id;
            artifactList($row['cells'],count($columns),count($columns),'資料列儲存格');$cells=array();
            foreach($row['cells'] as $cell)$cells[]=artifactText($cell,2000,'儲存格');
            $rows[]=array('id'=>$id,'cells'=>$cells);
        }
        $out=array('kind'=>'table','caption'=>$caption,'columns'=>$columns,'rows'=>$rows);
    }else{
        artifactObject($value,array('kind','chartType','title','xLabel','yLabel','sourceText'),'圖表');
        ensure($value['kind']==='chart','ARTIFACT_INVALID','圖表類型欄位不正確。');
        $sourceText=artifactSourceText($value['sourceText']);parseChartSource($sourceText,$value['chartType']);
        $out=array('kind'=>'chart','chartType'=>$value['chartType'],'title'=>artifactText($value['title'],600,'圖表標題'),
            'xLabel'=>artifactText($value['xLabel'],120,'橫軸標籤'),'yLabel'=>artifactText($value['yLabel'],120,'縱軸標籤'),'sourceText'=>$sourceText);
    }
    ensure(strlen(jsonEncode($out))<=60000,'ARTIFACT_INVALID','完整作品超過60000個 UTF8 位元組，未保存且未截斷內容。');
    return $out;
}
function artifactTsvField($value) {
    // Quoted TSV retains literal tabs/newlines and quotes in text-table cells.
    // This is a display projection, not a spreadsheet execution or export path.
    return strpbrk($value,"\t\r\n\"")===false?$value:'"'.str_replace('"','""',$value).'"';
}
function artifactItems($artifact) {
    if(field($artifact,'kind')==='mindmap')return mindmapItems($artifact);
    if(field($artifact,'kind')==='vector')return vectorItems($artifact);
    if(field($artifact,'kind')==='webpage')return webpageItems($artifact);
    $type=field($artifact,'kind');$artifact=validateArtifact($artifact,$type);
    if($type==='table'){
        $lines=array();if($artifact['caption']!=='')$lines[]=$artifact['caption'];
        $lines[]=implode("\t",array_map('artifactTsvField',array_column($artifact['columns'],'label')));
        foreach($artifact['rows'] as $row)$lines[]=implode("\t",array_map('artifactTsvField',$row['cells']));
        $content=implode("\n",$lines);$label='表格內容';
    }else{
        $content=($artifact['title']===''?'':$artifact['title']."\n").'圖表類型：'.$artifact['chartType']."\n".'橫軸：'.$artifact['xLabel']."\n".'縱軸：'.$artifact['yLabel']."\n".$artifact['sourceText'];$label='圖表來源';
    }
    ensure(strlen($content)<=60000,'ARTIFACT_INVALID','完整作品文字投影超過保存上限，未截斷內容。');
    return array(array('id'=>'document','label'=>$label,'content'=>$content));
}
function artifactSchemaObject($properties) { return array('type'=>'object','properties'=>$properties,'required'=>array_keys($properties),'additionalProperties'=>false); }
function artifactSchema($type) {
    if($type==='webpage')return webpageSchema();
    if($type==='mindmap')return mindmapSchema();
    if($type==='vector')return vectorSchema();
    ensure(artifactType($type),'ARTIFACT_TYPE_INVALID','不支援此原生作品類型。');$text=array('type'=>'string');
    if($type==='table')return artifactSchemaObject(array('kind'=>array('type'=>'string','enum'=>array('table')),'caption'=>$text,
        'columns'=>array('type'=>'array','minItems'=>1,'maxItems'=>12,'items'=>artifactSchemaObject(array('id'=>$text,'label'=>$text))),
        'rows'=>array('type'=>'array','minItems'=>1,'maxItems'=>100,'items'=>artifactSchemaObject(array('id'=>$text,'cells'=>array('type'=>'array','minItems'=>1,'maxItems'=>12,'items'=>$text))))));
    return artifactSchemaObject(array('kind'=>array('type'=>'string','enum'=>array('chart')),'chartType'=>array('type'=>'string','enum'=>array('flowchart','bar','line','pie')),
        'title'=>$text,'xLabel'=>$text,'yLabel'=>$text,'sourceText'=>$text));
}
// JSON arrays and objects collapse to the same PHP array after associative
// decoding. HTTP callers must run this guard against json_decode(..., false)
// first; semantic/canonical validation still follows with validateArtifact().
function artifactJsonSchemaValue($value,$schema,$depth=0) {
    ensure($depth<=16,'ARTIFACT_INVALID','作品 JSON 結構過深。');$type=$schema['type'];
    if($type==='object'){
        ensure(plain($value),'ARTIFACT_INVALID','作品 JSON 物件與陣列型別不正確。');$values=get_object_vars($value);$properties=$schema['properties'];
        ensure(count($values)===count($properties),'ARTIFACT_INVALID','作品 JSON 缺少必要欄位或包含未支援欄位。');
        foreach($properties as $key=>$definition){ensure(array_key_exists($key,$values),'ARTIFACT_INVALID','作品 JSON 缺少必要欄位或包含未支援欄位。');artifactJsonSchemaValue($values[$key],$definition,$depth+1);}
    }elseif($type==='array'){
        ensure(is_array($value)&&($value===array()||array_keys($value)===range(0,count($value)-1)),'ARTIFACT_INVALID','作品 JSON 清單必須使用真正的陣列。');
        ensure(count($value)>=field($schema,'minItems',0)&&count($value)<=field($schema,'maxItems',1000),'ARTIFACT_INVALID','作品 JSON 清單數量超過限制。');
        foreach($value as $entry)artifactJsonSchemaValue($entry,$schema['items'],$depth+1);
    }elseif($type==='string')ensure(is_string($value)&&preg_match('//u',$value)&&strpos($value,"\0")===false,'ARTIFACT_INVALID','作品 JSON 文字欄位型別不正確。');
    elseif($type==='boolean')ensure(is_bool($value),'ARTIFACT_INVALID','作品 JSON 此欄位必須是布林值。');
    elseif($type==='number'||$type==='integer'){
        ensure((is_int($value)||is_float($value))&&is_finite((float)$value),'ARTIFACT_INVALID','作品 JSON 數值必須是有限數字，不接受文字或布林值。');
        if($type==='integer')ensure(is_int($value)||floor($value)===$value,'ARTIFACT_INVALID','作品 JSON 此欄位需要整數。');
        if(isset($schema['minimum']))ensure($value>=$schema['minimum'],'ARTIFACT_INVALID','作品 JSON 數值小於允許範圍。');
        if(isset($schema['maximum']))ensure($value<=$schema['maximum'],'ARTIFACT_INVALID','作品 JSON 數值超過允許範圍。');
    }else throw new AppError('ARTIFACT_INVALID','作品 JSON 結構不受支援。');
    if(isset($schema['enum']))ensure(in_array($value,$schema['enum'],true),'ARTIFACT_INVALID','作品 JSON 選項不在允許範圍內。');
}
function validateArtifactJsonShape($rawObject) {
    ensure(plain($rawObject)&&artifactType(field($rawObject,'kind')),'ARTIFACT_INVALID','作品 JSON 必須是具有正確 kind 的完整物件。');
    artifactJsonSchemaValue($rawObject,artifactSchema($rawObject->kind));return $rawObject;
}
