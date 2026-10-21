<?php
/**
 * Native PHP 7.4+ metadata fixtures. Run: php tests/image-artifact.php
 * UNEXECUTED in the authoring environment because PHP is unavailable.
 * JS/mock DOM/source checks do not establish PHP runtime or browser behavior.
 * No external images, user data, filesystem writes, network, credentials or AI.
 */
require_once dirname(__DIR__).'/app/validation.php';
require_once dirname(__DIR__).'/app/artifacts.php';
require_once dirname(__DIR__).'/app/image.php';

$imageChecks=0;
function imageCheck($ok,$label){global $imageChecks;if(!$ok)throw new RuntimeException('FAIL '.$label);$imageChecks++;echo 'PASS '.$label."\n";}
function imageReject($operation,$label,$code='ARTIFACT_INVALID'){$error=null;try{$operation();}catch(AppError $e){$error=$e;}imageCheck($error instanceof AppError&&$error->errorCode===$code,$label);}
function imageFixture(){
    $png=base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',true);
    return array('kind'=>'image','title'=>"  外部圖片 <標題> & \"測試\"\r\n ",'alt'=>"紅色像素 🐻\nhttps://example.invalid  ",'attribution'=>"原作者\t外部上傳",'asset'=>array('id'=>'0123456789abcdef0123456789abcdef','mime'=>'image/png','width'=>1,'height'=>1,'byteLength'=>strlen($png),'sha256'=>hash('sha256',$png),'normalization'=>'png-v1'));
}
$fixture=imageFixture();imageCheck($fixture['asset']['byteLength']===70&&$fixture['asset']['sha256']==='4ff6ab670a58c14270e034e2090d9a432caa263a14e0a25785386b0c12f880b5','metadata matches actual one-pixel PNG bytes');
imageCheck(validateImageArtifact($fixture)===$fixture,'valid literal metadata round trip');
$reverse=array_reverse($fixture,true);$reverse['asset']=array_reverse($fixture['asset'],true);imageCheck(validateImageArtifact($reverse)===$fixture,'fixed canonical field order');
$items=imageArtifactItems($fixture);imageCheck(count($items)===1&&$items[0]['id']==='document'&&$items[0]['label']==='圖片來源','one complete JSON document projection');
imageCheck(json_decode($items[0]['content'],true)===$fixture&&imageArtifactFromItems($items)===$fixture,'projection is invertible with immutable source metadata');
$literal=$fixture;$literal['title']=" \t<script>literal</script>\r\n\u{2028}\u{2029} ";$literal['alt']='<img src=x onerror=literal>';$literal['attribution']='javascript:literal';
imageCheck(imageArtifactFromItems(imageArtifactItems($literal))===$literal,'markup, URLs and CR/LF remain literal strings');
imageCheck(strpos(imageArtifactItems($literal)[0]['content'],'\\u2028\\u2029')!==false,'PHP JSON separator escaping is canonical');
$empty=$fixture;$empty['alt']='';$empty['attribution']='';imageCheck(validateImageArtifact($empty)===$empty,'optional text must exist but may be empty');

foreach(array(
    'extra root'=>function($v){$v['url']='https://example.invalid';return $v;},
    'missing root'=>function($v){unset($v['alt']);return $v;},
    'wrong kind'=>function($v){$v['kind']='png';return $v;},
    'title blank'=>function($v){$v['title']=" \t\n\u{3000}";return $v;},
    'invalid UTF8'=>function($v){$v['alt']="\xff";return $v;},
    'surrogate UTF8'=>function($v){$v['alt']="\xed\xa0\x80";return $v;},
    'NUL'=>function($v){$v['attribution']="x\0y";return $v;},
    'extra asset URL'=>function($v){$v['asset']['src']='https://example.invalid';return $v;},
    'missing hash'=>function($v){unset($v['asset']['sha256']);return $v;},
    'upper ID'=>function($v){$v['asset']['id']=str_repeat('A',32);return $v;},
    'short ID'=>function($v){$v['asset']['id']=str_repeat('a',31);return $v;},
    'ID newline'=>function($v){$v['asset']['id'].="\n";return $v;},
    'hash newline'=>function($v){$v['asset']['sha256'].="\n";return $v;},
    'upper hash'=>function($v){$v['asset']['sha256']=str_repeat('A',64);return $v;},
    'wrong hash length'=>function($v){$v['asset']['sha256']=str_repeat('a',63);return $v;},
    'nonhex hash'=>function($v){$v['asset']['sha256']=str_repeat('g',64);return $v;},
    'wrong MIME'=>function($v){$v['asset']['mime']='image/svg+xml';return $v;},
    'wrong normalization'=>function($v){$v['asset']['normalization']='png-v2';return $v;}
) as $label=>$edit){imageReject(function()use($fixture,$edit){validateImageArtifact($edit($fixture));},$label);}

foreach(array('title'=>600,'alt'=>3000,'attribution'=>2000) as $field=>$maximum){
    $v=$fixture;$v[$field]=str_repeat('x',$maximum);imageCheck(validateImageArtifact($v)===$v,$field.' exact byte boundary');
    $v[$field].='x';imageReject(function()use($v){validateImageArtifact($v);},$field.' over byte boundary');
    $v[$field]=str_repeat('字',(int)floor($maximum/3));imageCheck(validateImageArtifact($v)===$v,$field.' UTF8 boundary');
    $v[$field].='字';imageReject(function()use($v){validateImageArtifact($v);},$field.' over UTF8 boundary');
    foreach(array(null,1,false,array()) as $bad){$v=$fixture;$v[$field]=$bad;imageReject(function()use($v){validateImageArtifact($v);},$field.' non-string');}
    $v=$fixture;$v[$field]='sk-'.str_repeat('x',20);imageReject(function()use($v){validateImageArtifact($v);},$field.' synthetic secret guard','SECRET_IN_TEXT');
}
foreach(array('width'=>2048,'height'=>2048,'byteLength'=>4194304) as $field=>$maximum){
    foreach(array(1,$maximum) as $good){$v=$fixture;$v['asset'][$field]=$good;imageCheck(validateImageArtifact($v)===$v,$field.' valid integer bound');}
    foreach(array(0,-1,$maximum+1,1.0,1.5,'1',true,null,INF,NAN) as $bad){$v=$fixture;$v['asset'][$field]=$bad;imageReject(function()use($v){validateImageArtifact($v);},$field.' strict integer boundary');}
}
foreach(array(null,'image',false,1,array()) as $bad)imageReject(function()use($bad){validateImageArtifact($bad);},'non-object root');
$invented=$fixture;$invented['asset']['id']=str_repeat('f',32);$invented['asset']['sha256']=str_repeat('f',64);imageCheck(validateImageArtifact($invented)===$invented,'shape cannot establish ownership or existence; application must resolve saved bytes');

foreach(array(null,array(),array($items[0],$items[0]),array('document'=>$items[0])) as $bad)imageReject(function()use($bad){imageArtifactFromItems($bad);},'wrong document list shape');
foreach(array('id'=>'other','label'=>'圖片','content'=>'{') as $field=>$bad){$next=$items;$next[0][$field]=$bad;imageReject(function()use($next){imageArtifactFromItems($next);},'wrong projection '.$field);}
foreach(array('[]','null','{"kind":"image","title":"x","alt":"","attribution":"","asset":[]}',str_repeat(' ',60001)) as $bad){$next=$items;$next[0]['content']=$bad;imageReject(function()use($next){imageArtifactFromItems($next);},'invalid or array-shaped JSON source');}
$next=$items;$next[0]['extra']='x';imageReject(function()use($next){imageArtifactFromItems($next);},'extra document property');
artifactJsonSchemaValue(json_decode(jsonEncode($fixture),false),imageArtifactSchema());imageCheck(true,'raw JSON schema validates complete image metadata');
echo 'TOTAL '.$imageChecks." native image metadata fixtures passed. No IO or model calls.\n";
