<?php
/** Native PHP 7.4+ fixtures: php tests/interactive.php
 * UNEXECUTED in authoring environment (no PHP binary). Node mocks / structure
 * checks do not establish native PHP syntax, HTTP, provider or p5 compatibility.
 * Pure in-memory validation; no database, credentials, network or writes.
 */
require_once dirname(__DIR__).'/app/bootstrap.php';
require_once dirname(__DIR__).'/app/interactive.php';
$interactiveChecks=0;
function interactiveCheck($condition,$label) {global $interactiveChecks;if(!$condition)throw new RuntimeException('FAIL '.$label);$interactiveChecks++;echo 'PASS '.$label."\n";}
function interactiveReject($operation,$label) {$error=null;try{$operation();}catch(AppError $failure){$error=$failure;}interactiveCheck($error instanceof AppError&&$error->errorCode==='ARTIFACT_INVALID',$label);}
function interactiveFixture() {
    return array('kind'=>'interactive','title'=>'互動視覺作品','width'=>640,'height'=>480,'background'=>'#f4f6fb','animation'=>false,'duration'=>10,
        'layers'=>array(array('id'=>'layer_1','label'=>'圓形','type'=>'ellipse','x'=>260,'y'=>180,'width'=>120,'height'=>120,'fill'=>'#4f80df','stroke'=>'#172c52','strokeWidth'=>2,'opacity'=>1,'rotation'=>0,'motion'=>'none','motionAmount'=>40,'motionSpeed'=>1,'interaction'=>'none')),
        'parameters'=>array(array('id'=>'parameter_size','label'=>'主圖形寬度','layerId'=>'layer_1','target'=>'width','min'=>40,'max'=>240,'step'=>1,'value'=>120,'previousValue'=>120,'selected'=>false)));
}
$fixture=interactiveFixture();interactiveCheck(validateInteractiveArtifact($fixture)===$fixture,'native declarative visual program round trip');
$reversed=array_reverse($fixture,true);$reversed['layers']=array(array_reverse($fixture['layers'][0],true));$reversed['parameters']=array(array_reverse($fixture['parameters'][0],true));interactiveCheck(validateInteractiveArtifact($reversed)===$fixture,'canonical field order');
$literal=$fixture;$literal['title']=" <script>literal</script> \u{2028}\u{2029} ";$literal['layers'][0]['label']='https://example.invalid';interactiveCheck(validateInteractiveArtifact($literal)===$literal,'markup and URL-looking labels remain literal');
interactiveCheck(strpos(interactiveCompactJson($literal),'\\u2028\\u2029')!==false,'line separators are escaped');
interactiveCheck(json_decode(interactiveCompactJson($fixture),true)===$fixture,'canonical JSON includes complete program and parameter values');
$numeric=$fixture;$numeric['width']=640.0;$numeric['layers'][0]['x']=-0.0;interactiveCheck(validateInteractiveArtifact($numeric)['width']===640&&validateInteractiveArtifact($numeric)['layers'][0]['x']===0,'integral values and signed zero canonicalize');
$line=$fixture;$line['layers'][0]['type']='line';$line['layers'][0]['width']=-4096;$line['layers'][0]['height']=0;$line['parameters']=array();interactiveCheck(validateInteractiveArtifact($line)===$line,'signed line deltas including zero');
$edge=$fixture;$edge['parameters'][0]=array_merge($edge['parameters'][0],array('target'=>'opacity','min'=>0,'max'=>1,'step'=>0.001,'value'=>0.999,'previousValue'=>0,'selected'=>true));interactiveCheck(validateInteractiveArtifact($edge)===$edge,'fine-grained selected opacity and complete prior value');
$changes=array(
    'missing field'=>function($v){unset($v['duration']);return $v;},'code field'=>function($v){$v['code']='alert(1)';return $v;},'wrong kind'=>function($v){$v['kind']='p5';return $v;},
    'canvas string'=>function($v){$v['width']='640';return $v;},'canvas too large'=>function($v){$v['height']=2049;return $v;},'canvas fractional'=>function($v){$v['width']=100.5;return $v;},
    'animation numeric'=>function($v){$v['animation']=1;return $v;},'duration too long'=>function($v){$v['duration']=61;return $v;},'duration zero'=>function($v){$v['duration']=0;return $v;},
    'no layers'=>function($v){$v['layers']=array();return $v;},'duplicate layer'=>function($v){$v['layers'][]=$v['layers'][0];return $v;},'image layer'=>function($v){$v['layers'][0]['type']='image';return $v;},
    'remote URL'=>function($v){$v['layers'][0]['url']='https://example.invalid/a';return $v;},'unsupported motion'=>function($v){$v['layers'][0]['motion']='eval';return $v;},'event code'=>function($v){$v['layers'][0]['interaction']='onclick';return $v;},
    'zero width'=>function($v){$v['layers'][0]['width']=0;return $v;},'paint URL'=>function($v){$v['background']='url(x)';return $v;},'paint shorthand'=>function($v){$v['layers'][0]['fill']='#fff';return $v;},
    'parameter duplicate ID'=>function($v){$v['parameters'][]=$v['parameters'][0];return $v;},'parameter duplicate target'=>function($v){$p=$v['parameters'][0];$p['id']='p2';$v['parameters'][]=$p;return $v;},
    'parameter missing layer'=>function($v){$v['parameters'][0]['layerId']='missing';return $v;},'parameter target paint'=>function($v){$v['parameters'][0]['target']='fill';return $v;},
    'parameter selection numeric'=>function($v){$v['parameters'][0]['selected']=1;return $v;},'parameter min outside domain'=>function($v){$v['parameters'][0]['min']=0;return $v;},
    'parameter max outside domain'=>function($v){$v['parameters'][0]['max']=5000;return $v;},'parameter zero step'=>function($v){$v['parameters'][0]['step']=0;return $v;},
    'parameter off grid max'=>function($v){$v['parameters'][0]['max']=240.5;return $v;},'parameter off grid value'=>function($v){$v['parameters'][0]['value']=120.5;return $v;},
    'parameter previous outside range'=>function($v){$v['parameters'][0]['previousValue']=0;return $v;},'parameter too many intervals'=>function($v){$v['parameters'][0]['step']=0.001;return $v;},
    'title bytes'=>function($v){$v['title']=str_repeat('中',201);return $v;},'label bytes'=>function($v){$v['layers'][0]['label']=str_repeat('中',41);return $v;},
    'invalid UTF8'=>function($v){$v['title']="\xff";return $v;},'NUL'=>function($v){$v['layers'][0]['label']="a\0b";return $v;},'bad stable ID'=>function($v){$v['layers'][0]['id']='_bad';return $v;}
);
foreach($changes as $label=>$edit){$bad=$edit($fixture);interactiveReject(function()use($bad){validateInteractiveArtifact($bad);},'reject '.$label);}
foreach(array('x','y','width','height','strokeWidth','opacity','rotation','motionAmount','motionSpeed') as $key)foreach(array(NAN,INF,-INF,null,true,'1',0.0001) as $badNumber){$bad=$fixture;$bad['layers'][0][$key]=$badNumber;interactiveReject(function()use($bad){validateInteractiveArtifact($bad);},'reject nonfinite/coerced/overprecise '.$key);}
$full=$fixture;$full['parameters']=array();$full['layers']=array();for($i=0;$i<40;$i++){$layer=$fixture['layers'][0];$layer['id']='layer_'.$i;$full['layers'][]=$layer;}interactiveCheck(count(validateInteractiveArtifact($full)['layers'])===40,'forty bounded layers');$overflow=$full;$layer=$fixture['layers'][0];$layer['id']='overflow';$overflow['layers'][]=$layer;interactiveReject(function()use($overflow){validateInteractiveArtifact($overflow);},'reject layer overflow');
$items=interactiveItems($fixture);interactiveCheck($items[0]['id']==='document'&&$items[0]['label']==='互動程式來源','canonical native item identity');interactiveCheck(interactiveFromItems($items)===$fixture,'raw object/list schema guard round trip');
$wrongItems=$items;$wrongItems[0]['label']='other';interactiveReject(function()use($wrongItems){interactiveFromItems($wrongItems);},'reject wrong source label');
$raw=$items;$raw[0]['content']=str_replace('"parameters":[','"parameters":{',$items[0]['content']);interactiveReject(function()use($raw){interactiveFromItems($raw);},'reject malformed raw JSON');
$base=interactiveDrawingFingerprint($fixture);$renamed=$fixture;$renamed['title']='不同標題';$renamed['layers'][0]['label']='另一個名稱';$renamed['layers'][0]['id']='renamed';$renamed['parameters'][0]['layerId']='renamed';$renamed['parameters'][0]['id']='renamed_parameter';interactiveCheck(interactiveDrawingFingerprint($renamed)===$base,'labels and stable ID churn do not fake a new drawing');
$history=$fixture;$history['parameters'][0]['previousValue']=150;interactiveCheck(interactiveDrawingFingerprint($history)===$base,'parameter previous value does not change drawing');
$selected=$fixture;$selected['parameters'][0]['selected']=true;interactiveCheck(interactiveDrawingFingerprint($selected)===$base,'selection alone with same literal does not change drawing');$selected['parameters'][0]['value']=180;interactiveCheck(interactiveDrawingFingerprint($selected)!==$base,'effective selected parameter changes drawing');
$unselected=$fixture;$unselected['parameters'][0]['value']=180;interactiveCheck(interactiveDrawingFingerprint($unselected)===$base,'unselected proposal value does not change drawing');
// Fusion drawing fingerprints ignore latent settings without rewriting a snapshot.
$staticDuration=$fixture;$staticDuration['duration']=11;interactiveCheck(interactiveDrawingFingerprint($staticDuration)===$base,'static duration-only edits cannot fake fusion');interactiveCheck(validateInteractiveArtifact($staticDuration)===$staticDuration,'latent static duration remains in the complete snapshot');
foreach(array('none','orbit','wave','pulse','spin') as $motion){$dead=$fixture;$dead['layers'][0]['motion']=$motion;$dead['layers'][0]['motionAmount']=512;$dead['layers'][0]['motionSpeed']=10;interactiveCheck(interactiveDrawingFingerprint($dead)===$base,'animation false ignores '.$motion.' settings');}
foreach(array('none','wave','pulse','spin') as $motion){$dead=$fixture;$dead['animation']=true;$dead['duration']=60;$dead['layers'][0]['motion']=$motion;$dead['layers'][0]['motionSpeed']=0;interactiveCheck(interactiveDrawingFingerprint($dead)===$base,'zero-speed '.$motion.' has no effective animation');}
foreach(array('orbit','wave','pulse','spin') as $motion){$dead=$fixture;$dead['animation']=true;$dead['layers'][0]['motion']=$motion;$dead['layers'][0]['motionAmount']=0;interactiveCheck(interactiveDrawingFingerprint($dead)===$base,'zero-amount '.$motion.' has no effective animation');}
$orbit=$fixture;$orbit['animation']=true;$orbit['layers'][0]['motion']='orbit';$orbit['layers'][0]['motionSpeed']=0;$orbit['layers'][0]['interaction']='hover';$offset=$fixture;$offset['layers'][0]['x']+=40;$offset['layers'][0]['interaction']='hover';interactiveCheck(interactiveDrawingFingerprint($orbit)===interactiveDrawingFingerprint($offset),'zero-speed orbit retains constant X and hover-center offset');interactiveCheck(interactiveDrawingFingerprint($orbit)!==$base,'zero-speed orbit is not blindly erased');
$moving=$fixture;$moving['animation']=true;$moving['layers'][0]['motion']='wave';$longer=$moving;$longer['duration']=11;interactiveCheck(interactiveDrawingFingerprint($moving)!==$base&&interactiveDrawingFingerprint($moving)!==interactiveDrawingFingerprint($longer),'actual movement and its duration remain meaningful');
$selectedSpeed=$moving;$selectedSpeed['parameters'][0]=array_merge($selectedSpeed['parameters'][0],array('target'=>'motionSpeed','min'=>0,'max'=>10,'step'=>1,'value'=>0,'previousValue'=>1,'selected'=>true));interactiveCheck(interactiveDrawingFingerprint($selectedSpeed)===$base,'selected values resolve before dead-motion normalization');
$unpainted=$fixture;$unpainted['layers'][0]['stroke']='none';$stroke=$unpainted;$stroke['layers'][0]['strokeWidth']=64;interactiveCheck(interactiveDrawingFingerprint($unpainted)===interactiveDrawingFingerprint($stroke),'inactive stroke width is not a drawing change');$stroke['layers'][0]['strokeWidth']=0;$stroke['layers'][0]['stroke']='#abcdef';interactiveCheck(interactiveDrawingFingerprint($unpainted)===interactiveDrawingFingerprint($stroke),'zero stroke width ignores stroke color');
$invisible=$fixture;$invisible['animation']=true;$hidden=$fixture['layers'][0];$hidden['id']='hidden';$hidden['opacity']=0;$hidden['motion']='wave';$invisible['layers'][]=$hidden;interactiveCheck(interactiveDrawingFingerprint($invisible)===$base,'invisible animated layers cannot fake a new drawing');
echo 'Interactive native fixtures: '.$interactiveChecks." passed.\n";
