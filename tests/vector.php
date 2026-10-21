<?php
/**
 * Native PHP 7.4+ vector fixtures. Run: php tests/vector.php
 * UNEXECUTED in the authoring environment: PHP is unavailable. Node source
 * contracts and lexer checks do not establish PHP syntax/runtime, HTTP, real
 * provider or external SVG-tool compatibility. Requires the vector integration
 * and numeric raw-schema support in the shared bootstrap/content/TitleModule.
 * Uses a deterministic adapter: no credentials, network, paid inference,
 * database, file mutation or external publication.
 */
require_once dirname(__DIR__).'/app/bootstrap.php';
require_once dirname(__DIR__).'/app/vector.php';
require_once dirname(__DIR__).'/app/modules/vector.php';
$vectorChecks=0;
function vectorCheck($ok,$label) {global $vectorChecks;if(!$ok)throw new RuntimeException('FAIL '.$label);$vectorChecks++;echo 'PASS '.$label."\n";}
function vectorReject($fn,$label,$code='ARTIFACT_INVALID',$status=400) {
    $error=null;try{$fn();}catch(AppError $e){$error=$e;}
    vectorCheck($error instanceof AppError&&$error->errorCode===$code&&$error->status===$status,$label);
}
function vectorFixtureShape($type='rect',$id='shape_a') {
    $shape=array('id'=>$id,'type'=>$type,'label'=>'主要物件','x'=>32,'y'=>24,'width'=>160,'height'=>100,'fill'=>'#FFCC66','stroke'=>'#123ABC','strokeWidth'=>2,'opacity'=>1,'text'=>'','fontSize'=>0,'points'=>array());
    if($type==='line'){$shape['width']=-100;$shape['height']=20;$shape['fill']='none';}
    elseif($type==='polygon'||$type==='polyline'){$shape['width']=0;$shape['height']=0;$shape['points']=array(array('x'=>0,'y'=>0),array('x'=>80,'y'=>40));if($type==='polygon')$shape['points'][]=array('x'=>0,'y'=>80);}
    elseif($type==='text'){$shape['width']=0;$shape['height']=0;$shape['text']='社區影展';$shape['fontSize']=24;$shape['stroke']='none';}
    return $shape;
}
function vectorFixture($all=false) {
    $shapes=array(vectorFixtureShape());
    if($all)foreach(array('ellipse','line','polygon','polyline','text') as $type)$shapes[]=vectorFixtureShape($type,'shape_'.$type);
    return array('kind'=>'vector','title'=>'社區影展識別圖','width'=>640,'height'=>480,'background'=>'none','shapes'=>$shapes);
}
function vectorFixtureBrief() {return array('purpose'=>'活動識別圖','audience'=>'社區居民','message'=>'一起看見在地故事','tone'=>'清楚溫暖','constraints'=>'保留文字與獨立可編輯圖形','summary'=>'使用簡潔基本圖形與文字，製作溫暖的社區影展識別圖。','items'=>array(array('id'=>'document','label'=>'向量圖形來源')));}
function vectorFixtureVersion($suffix='a') {
    $artifact=vectorFixture(true);
    return array('id'=>str_repeat($suffix,32),'number'=>1,'major'=>1,'minor'=>0,'title'=>'來源 '.$suffix,'artifact'=>$artifact,'items'=>vectorItems($artifact),'contentType'=>'vector',
        'rationale'=>'來源構圖說明','source'=>'manual','basedOnVersionId'=>null,'goalText'=>'以暖色基本向量圖形呈現社區影展。','changeSummary'=>'原有完整快照','goalSnapshot'=>vectorFixtureBrief(),
        'discussionMessageIds'=>array('fixture_message'),'provenance'=>array('model'=>'fixed-fixture-v1'),'createdAt'=>'2026-01-01T00:00:00+00:00');
}
function vectorFixtureProject() {
    return array('title'=>'向量原生測試','description'=>'獨立可編輯基本圖形','module'=>'vector','activeItem'=>array('title'=>'社區影展識別圖','description'=>'原生向量作品'),
        'references'=>array(array('id'=>'reference-fixture','versionId'=>str_repeat('c',32),'contentType'=>'short_text','items'=>array(array('id'=>'body','label'=>'全文','content'=>'使用者明確釘選的社區影展資料。')))),
        'messages'=>array(),'brief'=>vectorFixtureBrief(),'goalApprovedAt'=>'2026-01-01T00:00:00+00:00','officialVersionId'=>null,'versions'=>array(vectorFixtureVersion()));
}

// Native shape contract, canonical ordering and literal text safety.
$fixture=vectorFixture(true);vectorCheck(validateVectorArtifact($fixture)===$fixture,'six native primitive types retain exact geometry, order and identity');
$ordered=array_reverse($fixture,true);$ordered['shapes']=array_map(function($shape){return array_reverse($shape,true);},$fixture['shapes']);
vectorCheck(validateVectorArtifact($ordered)===$fixture,'canonical root and shape key order');
$literal=$fixture;$literal['title']=" \t圖形\n ";$literal['shapes'][0]['label']='';$literal['shapes'][5]['text']="  <script>literal</script> & \"quoted\"\nhttps://example.invalid  ";
vectorCheck(validateVectorArtifact($literal)===$literal,'HTML-looking and URL-looking strings remain literal text, not active resources');
$zero=$fixture;$zero['width']=640.0;$zero['height']=480.0;$zero['shapes'][0]['x']=-0.0;$zero['shapes'][0]['width']=160.0;$canonical=validateVectorArtifact($zero);
vectorCheck($canonical['width']===640&&$canonical['height']===480&&$canonical['shapes'][0]['x']===0&&$canonical['shapes'][0]['width']===160,'integral numeric canvas and signed zero normalize without coercing strings');
$fraction=$fixture;$fraction['shapes'][0]['x']=-0.001;$fraction['shapes'][0]['y']=8191.999;$fraction['shapes'][0]['width']=0.001;$fraction['shapes'][0]['height']=8192;$fraction['shapes'][0]['strokeWidth']=99.999;$fraction['shapes'][0]['opacity']=0.001;
$fraction['shapes'][3]['points'][0]=array('x'=>-4096,'y'=>8192);$fraction['shapes'][5]['fontSize']=511.999;
vectorCheck(validateVectorArtifact($fraction)===$fraction,'finite three-decimal boundary geometry, local points and fractional text size');
$line=vectorFixture();$line['shapes']=array(vectorFixtureShape('line'));$line['shapes'][0]['width']=-8192;$line['shapes'][0]['height']=0;
vectorCheck(validateVectorArtifact($line)===$line,'line supports negative endpoint deltas and zero length dimension');
$emptyTitle=$fixture;$emptyTitle['title']='';$emptyTitle['background']='#ABCDEF';vectorCheck(validateVectorArtifact($emptyTitle)===$emptyTitle,'empty title, empty labels and six-digit uppercase paint supported');
$numericId=$fixture;$numericId['shapes'][0]['id']='0';vectorCheck(validateVectorArtifact($numericId)['shapes'][0]['id']==='0','numeric-looking stable ID remains string');

foreach(array(
    'root extra SVG'=>function($v){$v['svg']='<svg/>';return $v;},'missing root field'=>function($v){unset($v['background']);return $v;},'wrong kind'=>function($v){$v['kind']='chart';return $v;},
    'canvas fractional'=>function($v){$v['width']=640.5;return $v;},'canvas numeric string'=>function($v){$v['width']='640';return $v;},'canvas boolean'=>function($v){$v['height']=true;return $v;},
    'canvas zero'=>function($v){$v['width']=0;return $v;},'canvas over maximum'=>function($v){$v['height']=4097;return $v;},'title null'=>function($v){$v['title']=null;return $v;},
    'title bytes'=>function($v){$v['title']=str_repeat('中',201);return $v;},'label bytes'=>function($v){$v['shapes'][0]['label']=str_repeat('中',41);return $v;},
    'invalid UTF8'=>function($v){$v['title']="\xff";return $v;},'lone surrogate UTF8'=>function($v){$v['shapes'][5]['text']="\xed\xa0\x80";return $v;},'NUL'=>function($v){$v['shapes'][5]['text']="a\0b";return $v;},
    'empty shapes'=>function($v){$v['shapes']=array();return $v;},'shapes associative'=>function($v){$v['shapes']=array('first'=>$v['shapes'][0]);return $v;},
    'shape field missing'=>function($v){unset($v['shapes'][0]['opacity']);return $v;},'shape event field'=>function($v){$v['shapes'][0]['onclick']='alert(1)';return $v;},
    'shape external image'=>function($v){$v['shapes'][0]['href']='https://example.invalid/image';return $v;},'shape font'=>function($v){$v['shapes'][5]['fontFamily']='remote';return $v;},
    'path unsupported'=>function($v){$v['shapes'][0]['type']='path';return $v;},'image unsupported'=>function($v){$v['shapes'][0]['type']='image';return $v;},
    'duplicate stable ID'=>function($v){$v['shapes'][1]['id']=$v['shapes'][0]['id'];return $v;},'ID nonstring'=>function($v){$v['shapes'][0]['id']=0;return $v;},
    'bad stable ID'=>function($v){$v['shapes'][0]['id']='_bad';return $v;},'long stable ID'=>function($v){$v['shapes'][0]['id']=str_repeat('a',65);return $v;},
    'rect zero width'=>function($v){$v['shapes'][0]['width']=0;return $v;},'ellipse negative height'=>function($v){$v['shapes'][1]['height']=-1;return $v;},
    'text width nonzero'=>function($v){$v['shapes'][5]['width']=1;return $v;},'polygon height nonzero'=>function($v){$v['shapes'][3]['height']=1;return $v;},
    'rect text nonempty'=>function($v){$v['shapes'][0]['text']='not allowed';return $v;},'line font nonzero'=>function($v){$v['shapes'][2]['fontSize']=1;return $v;},
    'text empty'=>function($v){$v['shapes'][5]['text']='';return $v;},'text Unicode blank'=>function($v){$v['shapes'][5]['text']="\u{3000}\u{00a0}\u{FEFF}";return $v;},
    'text bytes'=>function($v){$v['shapes'][5]['text']=str_repeat('x',4001);return $v;},'text font zero'=>function($v){$v['shapes'][5]['fontSize']=0;return $v;},
    'rect points nonempty'=>function($v){$v['shapes'][0]['points']=array(array('x'=>0,'y'=>0));return $v;},'polygon two points'=>function($v){array_pop($v['shapes'][3]['points']);return $v;},
    'polyline one point'=>function($v){array_pop($v['shapes'][4]['points']);return $v;},'points associative'=>function($v){$v['shapes'][3]['points']=array('a'=>array('x'=>0,'y'=>0));return $v;},
    'point extra field'=>function($v){$v['shapes'][3]['points'][0]['z']=1;return $v;},'point missing field'=>function($v){unset($v['shapes'][3]['points'][0]['y']);return $v;},
    'point numeric string'=>function($v){$v['shapes'][3]['points'][0]['x']='0';return $v;},'point boolean'=>function($v){$v['shapes'][3]['points'][0]['y']=false;return $v;},
    'point over bound'=>function($v){$v['shapes'][3]['points'][0]['y']=8192.001;return $v;},'point overprecision'=>function($v){$v['shapes'][3]['points'][0]['x']=0.0001;return $v;}
) as $label=>$mutate){$bad=$mutate($fixture);vectorReject(function()use($bad){validateVectorArtifact($bad);},'reject '.$label);}
foreach(array('x','y','width','height','strokeWidth','opacity','fontSize') as $key){
    foreach(array('numeric string'=>'1','boolean'=>true,'null'=>null,'NaN'=>NAN,'positive infinity'=>INF,'negative infinity'=>-INF,'overprecision'=>0.0001) as $label=>$number){
        $bad=$fixture;$index=$key==='fontSize'?5:0;$bad['shapes'][$index][$key]=$number;
        vectorReject(function()use($bad){validateVectorArtifact($bad);},'reject '.$key.' '.$label);
    }
}
foreach(array('x'=>array(-4096.001,8192.001),'y'=>array(-4096.001,8192.001),'width'=>array(-8192.001,8192.001),'height'=>array(-8192.001,8192.001),'strokeWidth'=>array(-0.001,100.001),'opacity'=>array(-0.001,1.001),'fontSize'=>array(0.999,512.001)) as $key=>$numbers){
    foreach($numbers as $number){$bad=$fixture;$bad['shapes'][$key==='fontSize'?5:0][$key]=$number;vectorReject(function()use($bad){validateVectorArtifact($bad);},'reject out-of-range '.$key.' '.$number);}
}
foreach(array('red','#fff','#12345678','NONE',' none ','url(https://example.invalid)','var(--color)','linear-gradient(red,blue)',null,1) as $paint){
    foreach(array('background','fill','stroke') as $where){$bad=$fixture;if($where==='background')$bad[$where]=$paint;else $bad['shapes'][0][$where]=$paint;vectorReject(function()use($bad){validateVectorArtifact($bad);},'reject unsupported paint '.$where.' '.json_encode($paint));}
}
$maximum=vectorFixture();$maximum['shapes']=array();for($i=0;$i<100;$i++)$maximum['shapes'][]=vectorFixtureShape('rect','shape_'.$i);
vectorCheck(count(validateVectorArtifact($maximum)['shapes'])===100,'100 objects accepted');$maximum['shapes'][]=vectorFixtureShape('rect','overflow');vectorReject(function()use($maximum){validateVectorArtifact($maximum);},'101 objects rejected');
$maximum=vectorFixture();$maximum['shapes']=array(vectorFixtureShape('polygon'));$maximum['shapes'][0]['points']=array();for($i=0;$i<80;$i++)$maximum['shapes'][0]['points'][]=array('x'=>$i,'y'=>$i%2);
vectorCheck(count(validateVectorArtifact($maximum)['shapes'][0]['points'])===80,'80 local polygon points accepted');$maximum['shapes'][0]['points'][]=array('x'=>0,'y'=>0);vectorReject(function()use($maximum){validateVectorArtifact($maximum);},'81 points rejected');
$exact=$fixture;$exact['title']=str_repeat('中',200);$exact['shapes'][0]['label']=str_repeat('中',40);$exact['shapes'][0]['id']=str_repeat('a',64);$exact['shapes'][5]['text']=str_repeat('x',4000);$exact['shapes'][5]['fontSize']=512;
vectorCheck(validateVectorArtifact($exact)===$exact,'exact UTF8, stable-ID, text and font bounds');
foreach(array('title','label','id','text') as $where){$bad=$fixture;$secret='sk-'.str_repeat('x',20);if($where==='title')$bad['title']=$secret;else $bad['shapes'][$where==='text'?5:0][$where]=$secret;vectorReject(function()use($bad){validateVectorArtifact($bad);},'shared secret guard in '.$where,'SECRET_IN_TEXT');}

// Both complete native JSON and canonical text projection have hard byte caps.
$size=vectorFixture();$size['title']='';$size['shapes']=array();for($i=0;$i<15;$i++){$entry=vectorFixtureShape('text','t'.$i);$entry['text']='x';$size['shapes'][]=$entry;}
$remaining=60000-strlen(jsonEncode($size));foreach($size['shapes'] as &$shape){$add=min($remaining,4000-strlen($shape['text']));$shape['text'].=str_repeat('x',$add);$remaining-=$add;}unset($shape);
vectorCheck($remaining===0&&strlen(jsonEncode(validateVectorArtifact($size)))===60000,'60000-byte canonical JSON boundary');
vectorCheck(strlen(vectorItems($size)[0]['content'])===60000,'60000-byte complete projection boundary');
$size['title']='x';vectorReject(function()use($size){validateVectorArtifact($size);},'60001-byte full artifact rejected without truncation');
$projection=vectorItems($fraction);vectorCheck($projection===array(array('id'=>'document','label'=>'向量圖形來源','content'=>vectorCompactJson($fraction))),'exact projection parity fixture uses canonical compact native JSON');
vectorCheck(strpos($projection[0]['content'],'"x":-0.001')!==false&&strpos($projection[0]['content'],'"opacity":0.001')!==false,'deterministic decimals never become exponent notation');
$unicode=vectorFixture();$unicode['title']="\u{2028}\u{2029}";vectorCheck(strpos(vectorCompactJson($unicode),'\\u2028\\u2029')!==false,'U2028 and U2029 are escaped for PHP-browser projection parity');
$precision=ini_get('serialize_precision');$before=vectorCompactJson($fraction);ini_set('serialize_precision','3');$after=vectorCompactJson($fraction);ini_set('serialize_precision',$precision);
vectorCheck($after===$before,'projection independent of serialize_precision setting');
vectorCheck(vectorCompactJson(array('zero'=>-0.0,'whole'=>1.0,'fraction'=>1.234,'empty'=>array()))==='{"zero":0,"whole":1,"fraction":1.234,"empty":[]}','compact serializer normalizes numbers and preserves true empty lists');
$metadataOnly=$fixture;$metadataOnly['title']='不同圖名';foreach($metadataOnly['shapes'] as &$shape){$shape['id']='new_'.$shape['id'];$shape['label']='不同名稱';}unset($shape);
vectorCheck(vectorDrawingFingerprint($metadataOnly)===vectorDrawingFingerprint($fixture),'rendered drawing fingerprint excludes only title, stable IDs and labels');
$paintCase=$fixture;$paintCase['background']='#ABCDEF';$samePaint=$paintCase;$samePaint['background']='#abcdef';foreach($samePaint['shapes'] as &$shape){$shape['fill']=strtolower($shape['fill']);$shape['stroke']=strtolower($shape['stroke']);}unset($shape);
vectorCheck(vectorDrawingFingerprint($samePaint)===vectorDrawingFingerprint($paintCase),'drawing fingerprint ignores semantically identical hex color case');
vectorCheck(validateVectorArtifact($paintCase)===$paintCase&&strpos(vectorItems($paintCase)[0]['content'],'#ABCDEF')!==false&&$paintCase['shapes'][0]['fill']==='#FFCC66','paint-case normalization never changes saved native source or projection');
$layers=$fixture;$layers['shapes']=array_reverse($layers['shapes']);vectorCheck(vectorDrawingFingerprint($layers)!==vectorDrawingFingerprint($fixture),'drawing fingerprint preserves meaningful layer order');
$duplicate=$fixture;$copy=$duplicate['shapes'][0];$copy['id']='duplicate';$duplicate['shapes'][]=$copy;vectorCheck(vectorDrawingFingerprint($duplicate)!==vectorDrawingFingerprint($fixture),'drawing fingerprint preserves duplicate multiplicity');

// Raw JSON object/array separation is enforced before associative conversion.
$schema=vectorSchema();vectorCheck($schema['properties']['width']['type']==='integer'&&$schema['properties']['shapes']['items']['properties']['x']['type']==='number','schema uses integer canvas and numeric geometry');
$raw=json_decode(jsonEncode($fixture));artifactJsonSchemaValue($raw,$schema);vectorCheck(true,'raw JSON valid full vector shape');
foreach(array('shapes object','empty points object','point array','root array','missing shape field','extra root','numeric string','fractional canvas','null coordinate') as $mode){
    $raw=json_decode(jsonEncode($fixture));
    if($mode==='shapes object')$raw->shapes=(object)array('0'=>$raw->shapes[0]);
    elseif($mode==='empty points object')$raw->shapes[0]->points=(object)array();
    elseif($mode==='point array')$raw->shapes[3]->points[0]=array(0,0);
    elseif($mode==='root array')$raw=array();
    elseif($mode==='missing shape field')unset($raw->shapes[0]->label);
    elseif($mode==='extra root')$raw->svg='<svg/>';
    elseif($mode==='numeric string')$raw->shapes[0]->x='0';
    elseif($mode==='fractional canvas')$raw->width=640.5;
    elseif($mode==='null coordinate')$raw->shapes[0]->x=null;
    vectorReject(function()use($raw,$schema){artifactJsonSchemaValue($raw,$schema);},'raw JSON rejects '.$mode);
}
$raw=json_decode(jsonEncode($fixture));$raw->width=640.0;artifactJsonSchemaValue($raw,$schema);vectorCheck(true,'raw integer schema accepts mathematically integral JSON number');

// Shared fixed-model lifecycle exercised with deterministic complete responses.
class VectorFixtureAdapter {
    public $mode='normal';public $calls=0;public $history=array();public $raw=null;
    public function generate($model,$messages,$schema,$maxOutputTokens) {
        $this->calls++;$data=json_decode($messages[1]['content'],true,64,JSON_THROW_ON_ERROR);$this->history[]=array('model'=>$model,'messages'=>$messages,'schema'=>$schema,'maxOutputTokens'=>$maxOutputTokens,'data'=>$data);
        if($this->raw!==null)return $this->raw;$props=$schema['properties'];
        $candidate=array('artifact'=>vectorFixture(true),'rationale'=>'以獨立物件構成溫暖識別圖。','goalText'=>'以暖色基本向量圖形呈現社區影展。','changeSummary'=>'依確認方向建立完整候選。');
        if(isset($props['directionStatus'])){
            $ready=$this->mode!=='exploring';$empty=array('purpose'=>'','audience'=>'','message'=>'','tone'=>'','constraints'=>'','summary'=>'','items'=>array());
            $out=array('reply'=>$ready?'主軸已足夠，可以確認方向並生成。':'先確定要表達的內容。','question'=>$ready?'':'這張圖要傳達什麼內容？','choices'=>array(),'directionStatus'=>$ready?'ready':'exploring','direction'=>$ready?vectorFixtureBrief():$empty);
        }elseif(isset($props['purpose']))$out=vectorFixtureBrief();
        elseif(isset($props['candidates'])){
            $out=array('candidates'=>array($candidate));
            if($this->mode==='extra_candidate')$out['candidates'][]=$candidate;
            if($this->mode==='extra_property')$out['candidates'][0]['artifact']['svg']='<svg/>';
            if($this->mode==='bad_number')$out['candidates'][0]['artifact']['shapes'][0]['x']='0';
            if($this->mode==='bad_precision')$out['candidates'][0]['artifact']['shapes'][0]['x']=0.0001;
            if($this->mode==='bad_crossfield')$out['candidates'][0]['artifact']['shapes'][0]['fontSize']=24;
        }elseif(isset($props['outcome'])){
            $source=$data['sourceVersion'];$artifact=$source['artifact'];$artifact['shapes'][0]['fill']='#77AA99';
            $out=array('outcome'=>'revision','reply'=>'這裡提供改色後的完整待審閱候選。','question'=>'','choices'=>array(),'artifact'=>$artifact,'rationale'=>'只修改指定物件填色，保留其他內容。','goalText'=>versionGoalText($source),'changeSummary'=>'將第一個矩形改為綠色。');
            if(in_array($this->mode,array('unchanged','metadata_only','goal_only','combined_revert','numeric_noop'),true))$out['artifact']=$source['artifact'];
            if($this->mode==='goal_only')$out['goalText']='依本次要求，強調清楚易讀的活動圖形。';
            if($this->mode==='metadata_only')$out['rationale']='只是換一段說明。';
            if($this->mode==='numeric_noop')$out['artifact']['shapes'][0]['width']=(float)$source['artifact']['shapes'][0]['width'];
            if($this->mode==='revision_question')$out['question']='你要哪種顏色？';
            if($this->mode==='revision_claim')$out['reply']='已經採用並取代正式版。';
            if($this->mode==='rename_only'){$out['artifact']=$source['artifact'];$out['artifact']['title']='新的文件標題';$out['artifact']['shapes'][0]['label']='新的物件名稱';}
            if(strpos($this->mode,'clarification')===0){$out['outcome']='clarification';$out['artifact']=$source['artifact'];$out['reply']='這個構圖清楚，也可以繼續討論。';$out['rationale']='';$out['goalText']='';$out['changeSummary']='';}
            if($this->mode==='clarification_changed')$out['artifact']=$artifact;
            if($this->mode==='clarification_metadata'){$out['rationale']='不保存的解釋';$out['goalText']='不保存的目標';$out['changeSummary']='不保存的摘要';}
            if($this->mode==='clarification_claim')$out['reply']='已經修改完成。';
            if($this->mode==='clarification_two_questions'){$out['reply']='你想改哪裡？';$out['question']='你要什麼顏色？';}
            if($this->mode==='clarification_choices'){$out['question']='你想討論哪一種配色？';$out['choices']=array(array('id'=>'warm','label'=>'暖色','value'=>'討論暖色構圖。'),array('id'=>'cool','label'=>'冷色','value'=>'討論冷色構圖。'));}
        }elseif(isset($props['artifact'])){
            $out=$candidate;$out['artifact']=$data['selectedVersions'][0]['artifact'];$out['artifact']['shapes'][0]['fill']=$data['selectedVersions'][1]['artifact']['shapes'][0]['fill'];$out['artifact']['shapes'][0]['x']=80;
            $out['changeSummary']='整合第一版文字、第二版配色與新的構圖間距。';
            if($this->mode==='copy_source')$out['artifact']=$data['selectedVersions'][0]['artifact'];
            if($this->mode==='metadata_copy'){$out['artifact']=$data['selectedVersions'][0]['artifact'];$out['artifact']['title']='假融合標題';foreach($out['artifact']['shapes'] as &$shape){$shape['id']='renamed_'.$shape['id'];$shape['label']='假融合物件名稱';}unset($shape);}
            if($this->mode==='paint_case_copy'){$out['artifact']=$data['selectedVersions'][0]['artifact'];$out['artifact']['background']=strtolower($out['artifact']['background']);foreach($out['artifact']['shapes'] as &$shape){$shape['fill']=strtolower($shape['fill']);$shape['stroke']=strtolower($shape['stroke']);}unset($shape);}
            if($this->mode==='reorder_source'){$out['artifact']=$data['selectedVersions'][0]['artifact'];$out['artifact']['shapes']=array_reverse($out['artifact']['shapes']);}
        }else{
            $items=array();foreach($data['selectedVersions'] as $version)$items[]=array('versionId'=>$version['id'],'fit'=>'依本版目標比較。','strength'=>'基本物件清楚。','tradeoff'=>'需要確認視覺取捨。','suggestion'=>'可微調排版。');$out=array('items'=>$items,'summary'=>'由使用者依各版目標判斷。');
        }
        return json_decode(jsonEncode($out),false,128,JSON_THROW_ON_ERROR);
    }
}
function vectorLastCall($adapter) {return $adapter->history[count($adapter->history)-1];}
function vectorModuleReject($adapter,$fn,$label,$code='MODEL_OUTPUT_INVALID',$calls=1,$status=502) {$before=$adapter->calls;vectorReject($fn,$label,$code,$status);vectorCheck($adapter->calls===$before+$calls,$label.' exact model call count');}
$adapter=new VectorFixtureAdapter();$module=new VectorModule($adapter);$project=vectorFixtureProject();$source=$project['versions'][0];$model='fixed-fixture-v1';
$direction=$module->discuss($project,'為社區影展製作溫暖識別圖。',$model);$call=vectorLastCall($adapter);
vectorCheck($direction['directionStatus']==='ready'&&$direction['direction']['items']===array(array('id'=>'document','label'=>'向量圖形來源')),'ready direction keeps fixed document item');
vectorCheck(strpos($call['messages'][0]['content'],'不能生成照片')!==false&&strpos($call['messages'][0]['content'],'尚未驗證')!==false,'honest primitive-only capability and unverified external import limit');
$adapter->mode='exploring';$discussion=$module->discuss($project,'還沒決定。',$model);vectorCheck($discussion['direction']===null&&$discussion['question']!=='','discussion can ask one necessary question');
$adapter->mode='normal';vectorCheck($module->summarize($project,$model)===vectorFixtureBrief(),'strict seven-field summary');
$before=$adapter->calls;$generated=$module->generate($project,'保留獨立物件。',$model);$call=vectorLastCall($adapter);
vectorCheck(count($generated)===1&&$generated[0]['artifact']===vectorFixture(true)&&$generated[0]['items']===vectorItems($generated[0]['artifact']),'generate one full candidate with derived projection');
vectorCheck($adapter->calls===$before+1&&$call['model']===$model&&$call['maxOutputTokens']===24000,'one fixed-model bounded call, no alternate provider or retry');
vectorCheck(!isset($call['data']['versions'])&&count($call['data']['versionIndex'])===1&&$call['data']['pinnedReferences']===$project['references'],'generation omits unrelated full artifacts and retains pinned references');
foreach(array('extra_candidate','extra_property','bad_number','bad_precision','bad_crossfield') as $mode){$adapter->mode=$mode;vectorModuleReject($adapter,function()use($module,$project,$model){$module->generate($project,'',$model);},'generation rejects '.$mode);}
$adapter->mode='normal';$before=$adapter->calls;$revision=$module->refine($project,$source,'第一個矩形改成綠色。',$model);$call=vectorLastCall($adapter);
vectorCheck($revision['outcome']==='revision'&&$revision['artifact']['shapes'][0]['fill']==='#77AA99'&&array_slice($revision['artifact']['shapes'],1)===array_slice($source['artifact']['shapes'],1),'real revision changes requested shape while retaining unchanged objects');
vectorCheck($call['data']['sourceVersion']['artifact']===$source['artifact']&&$call['data']['sourceVersion']['goalText']===$source['goalText']&&$call['data']['latestUserMessage']==='第一個矩形改成綠色。','full exact selected source, own goal and latest request reach model');
vectorCheck($adapter->calls===$before+1&&$source===vectorFixtureVersion()&&$project['officialVersionId']===null,'unadopted source supported, immutable input and no automatic promotion');
vectorModuleReject($adapter,function()use($module,$project,$source,$model){$module->refine($project,$source,'修改',$model,array('document'));},'paragraph targets rejected before inference','TARGET_ITEMS_INVALID',0,409);
foreach(array('unchanged','metadata_only','numeric_noop') as $mode){$adapter->mode=$mode;vectorModuleReject($adapter,function()use($module,$project,$source,$model){$module->refine($project,$source,'修改',$model);},'reject no-op '.$mode,'MODEL_NO_REVISION');}
$adapter->mode='goal_only';$revision=$module->refine($project,$source,'只更新本版目標。',$model);vectorCheck($revision['artifact']===$source['artifact']&&$revision['goalText']!==$source['goalText'],'goal-only revision preserves complete vector artifact');
$adapter->mode='rename_only';$revision=$module->refine($project,$source,'只改文件標題與第一個物件名稱。',$model);vectorCheck($revision['artifact']['title']==='新的文件標題'&&$revision['artifact']['shapes'][0]['label']==='新的物件名稱','explicit title and label refinement remains allowed');
$combined=$source;$combined['goalAndRationale']='使用者保存的新目標與修改意見。';$adapter->mode='combined_revert';$revision=$module->refine($project,$combined,'恢復舊版目標。',$model);$call=vectorLastCall($adapter);
vectorCheck($revision['artifact']===$source['artifact']&&$revision['goalText']===$source['goalText']&&$call['data']['sourceVersion']['goalAndRationale']===$combined['goalAndRationale'],'authoritative combined goal override allows deliberate legacy-goal restoration');
$adapter->mode='clarification';$clarification=$module->refine($project,$source,'你覺得構圖如何？',$model);vectorCheck($clarification['outcome']==='clarification'&&$clarification['items']===array()&&!isset($clarification['artifact'])&&!isset($clarification['goalText']),'clarification source echo discarded without version');
$adapter->mode='clarification_metadata';$clarification=$module->refine($project,$source,'繼續討論。',$model);vectorCheck($clarification['rationale']===''&&!isset($clarification['artifact'])&&!isset($clarification['goalText'])&&!isset($clarification['changeSummary']),'bounded unused clarification metadata discarded');
$adapter->mode='clarification_choices';$clarification=$module->refine($project,$source,'談配色。',$model);vectorCheck(count($clarification['choices'])===2&&!isset($clarification['artifact']),'clarification choices do not create artifacts');
foreach(array('clarification_changed'=>'MODEL_CLARIFICATION_ARTIFACT','clarification_claim'=>'MODEL_CLARIFICATION_CLAIM','clarification_two_questions'=>'MODEL_QUESTION_COUNT','revision_question'=>'MODEL_OUTPUT_INVALID') as $mode=>$code){$adapter->mode=$mode;vectorModuleReject($adapter,function()use($module,$project,$source,$model){$module->refine($project,$source,'討論',$model);},'reject '.$mode,$code);}
$adapter->mode='revision_claim';$revision=$module->refine($project,$source,'改成綠色。',$model);vectorCheck(strpos($revision['reply'],'尚未採用、定稿或取代正式版')!==false&&strpos($revision['reply'],'已經採用')===false,'deterministic revision reply cannot claim adoption');

$other=vectorFixtureVersion('b');$other['artifact']['shapes'][0]['fill']='#336699';$other['items']=vectorItems($other['artifact']);$other['goalAndRationale']='使用者保存的冷色版本目標。';$adapter->mode='normal';
$before=$adapter->calls;$fusion=$module->fuse($project,array($source,$other),'保留兩版優點。',$model);$call=vectorLastCall($adapter);
vectorCheck($fusion['artifact']['shapes'][0]['fill']==='#336699'&&$fusion['artifact']['shapes'][0]['x']===80&&$fusion['items']===vectorItems($fusion['artifact']),'fusion returns genuinely changed full native candidate');
vectorCheck($adapter->calls===$before+1&&$call['model']===$model&&$call['maxOutputTokens']===24000,'fusion one fixed-model call');
vectorCheck($call['data']['creativeGoal']===null&&$call['data']['goalApprovedAt']===null&&$call['data']['selectedVersions'][1]['goalAndRationale']===$other['goalAndRationale'],'fusion uses selected version goals, not common current goal');
vectorCheck($call['data']['selectedVersions'][0]['artifact']===$source['artifact']&&$call['data']['selectedVersions'][0]['provenance']===$source['provenance']&&$call['data']['selectedVersions'][0]['discussionMessageIds']===$source['discussionMessageIds'],'fusion preserves full source snapshots and provenance');
foreach(array(array($source),array($source,$source),array($source,$other,$source,$other,$source,$other)) as $versions)vectorModuleReject($adapter,function()use($module,$project,$versions,$model){$module->fuse($project,$versions,'融合',$model);},'invalid fusion selection rejected before inference','FUSION_VERSIONS_INVALID',0,409);
$adapter->mode='copy_source';vectorModuleReject($adapter,function()use($module,$project,$source,$other,$model){$module->fuse($project,array($source,$other),'融合',$model);},'fusion rejects exact source copy','MODEL_NO_REVISION');
$adapter->mode='metadata_copy';vectorModuleReject($adapter,function()use($module,$project,$source,$other,$model){$module->fuse($project,array($source,$other),'融合',$model);},'fusion rejects metadata-only drawing copy','MODEL_NO_REVISION');
$adapter->mode='paint_case_copy';vectorModuleReject($adapter,function()use($module,$project,$source,$other,$model){$module->fuse($project,array($source,$other),'融合',$model);},'fusion rejects paint-case-only drawing copy','MODEL_NO_REVISION');
$adapter->mode='reorder_source';$fusion=$module->fuse($project,array($source,$other),'重新整合圖層前後順序。',$model);vectorCheck($fusion['artifact']['shapes']===array_reverse($source['artifact']['shapes']),'fusion permits materially different drawing layer order');
$adapter->mode='normal';$comparison=$module->compare($project,array($source,$other),'依各版目標比較。',$model);$call=vectorLastCall($adapter);
vectorCheck(count($comparison['items'])===2&&$call['data']['selectedVersions'][0]['artifact']===$source['artifact']&&$call['data']['selectedVersions'][1]['goalAndRationale']===$other['goalAndRationale'],'inherited comparison receives complete native snapshots and own goals');
$adapter->raw=(object)array('candidates'=>(object)array());vectorModuleReject($adapter,function()use($module,$project,$model){$module->generate($project,'',$model);},'provider raw object-array distinction retained');$adapter->raw=null;
echo 'PASS '.$vectorChecks." native vector checks. No real provider, credentials or network used.\n";
