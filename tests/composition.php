<?php
/** Native PHP 7.4+ composition fixtures. Run: php tests/composition.php
 * UNEXECUTED in the authoring environment because PHP is unavailable.
 * Pure data validation only: no network, providers, images, database or keys.
 */
require_once dirname(__DIR__).'/app/validation.php';
require_once dirname(__DIR__).'/app/artifacts.php';
require_once dirname(__DIR__).'/app/composition.php';
$compositionChecks=0;
function compositionCheck($ok,$label){global $compositionChecks;if(!$ok)throw new RuntimeException('FAIL '.$label);$compositionChecks++;echo 'PASS '.$label."\n";}
function compositionReject($operation,$label,$code='ARTIFACT_INVALID'){$error=null;try{$operation();}catch(AppError $caught){$error=$caught;}compositionCheck($error instanceof AppError&&$error->errorCode===$code,$label);}
function compositionFixture($kind='illustrated'){
    $literal="  原始文字 <script>literal</script> 🐻\r\n\u{2028}\u{2029} ";
    if($kind==='illustrated')return array('kind'=>'illustrated','title'=>$literal,'theme'=>'paper','blocks'=>array(
        array('id'=>'paragraph_1','heading'=>'第一段','body'=>$literal,'layout'=>'left','imageRefId'=>str_repeat('1',32),'caption'=>" 圖片說明\r\n "),
        array('id'=>'paragraph_2','heading'=>'','body'=>'完整第二段','layout'=>'text','imageRefId'=>'','caption'=>'')));
    return array('kind'=>'poster','title'=>$literal,'format'=>'portrait','theme'=>'festival','blocks'=>array(
        array('id'=>'headline_1','type'=>'headline','text'=>$literal,'imageRefId'=>'','alignment'=>'center'),
        array('id'=>'text_1','type'=>'text','text'=>'完整海報內容','imageRefId'=>'','alignment'=>'left'),
        array('id'=>'image_1','type'=>'image','text'=>'','imageRefId'=>str_repeat('1',32),'alignment'=>'right')));
}
foreach(array('illustrated','poster') as $kind){
    $value=compositionFixture($kind);compositionCheck(validateCompositionArtifact($value,$kind)===$value,$kind.' literal round trip');
    $reverse=array_reverse($value,true);foreach($reverse['blocks'] as &$block)$block=array_reverse($block,true);unset($block);
    compositionCheck(validateCompositionArtifact($reverse,$kind)===$value,$kind.' canonical field order');
    $items=compositionItems($value);compositionCheck($items[0]['id']==='document'&&$items[0]['label']===($kind==='illustrated'?'圖文來源':'海報來源'),$kind.' document label');
    compositionCheck(compositionFromItems($items,$kind)===$value,$kind.' invertible projection');
    compositionCheck(compositionCompactJson($value)===jsonEncode($value),$kind.' canonical JSON');
    compositionCheck(strpos($items[0]['content'],'\\u2028\\u2029')!==false,$kind.' Unicode separator escaping');
    artifactJsonSchemaValue(json_decode($items[0]['content']),compositionSchema($kind));compositionCheck(true,$kind.' raw JSON object/array schema');
    $renamed=$value;$renamed['blocks'][0]['id']='renamed';compositionCheck(compositionContentFingerprint($value)===compositionContentFingerprint($renamed),$kind.' ID-only rewrites do not change semantic content');
    $different=$value;$different['title']='changed';compositionCheck(compositionContentFingerprint($different)!==compositionContentFingerprint($value),$kind.' title remains part of fingerprint');
    $different=$value;$different['blocks']=array_reverse($different['blocks']);compositionCheck(compositionContentFingerprint($different)!==compositionContentFingerprint($value),$kind.' order remains part of fingerprint');
    foreach(array(
        'extra root'=>function($v){$v['url']='https://bad.invalid';return $v;},
        'missing root'=>function($v){unset($v['theme']);return $v;},
        'wrong kind'=>function($v){$v['kind']='html';return $v;},
        'blank title'=>function($v){$v['title']=" \t\r\n\u{3000}";return $v;},
        'overlong title'=>function($v){$v['title']=str_repeat('字',201);return $v;},
        'invalid UTF8'=>function($v){$v['title']="\xff";return $v;},
        'surrogate UTF8'=>function($v){$v['title']="\xed\xa0\x80";return $v;},
        'NUL'=>function($v){$v['title']="x\0y";return $v;},
        'bad theme'=>function($v){$v['theme']='url(x)';return $v;},
        'empty blocks'=>function($v){$v['blocks']=array();return $v;},
        'sparse blocks'=>function($v){unset($v['blocks'][0]);return $v;},
        'extra block key'=>function($v){$v['blocks'][0]['html']='<script>';return $v;},
        'missing block key'=>function($v){unset($v['blocks'][0]['imageRefId']);return $v;},
        'duplicate ID'=>function($v){$v['blocks'][1]['id']=$v['blocks'][0]['id'];return $v;},
        'ID newline'=>function($v){$v['blocks'][0]['id'].="\n";return $v;},
        'reference URL'=>function($v){$v['blocks'][0]['imageRefId']='https://bad.invalid';return $v;},
        'reference uppercase'=>function($v){$v['blocks'][0]['imageRefId']=str_repeat('A',32);return $v;},
        'reference newline'=>function($v){$v['blocks'][0]['imageRefId']=str_repeat('a',32)."\n";return $v;}
    ) as $label=>$change){$bad=$change($value);compositionReject(function()use($bad,$kind){validateCompositionArtifact($bad,$kind);},$kind.' rejects '.$label);}
    $secret=$value;$secret['title']='sk-'.str_repeat('a',20);compositionReject(function()use($secret,$kind){validateCompositionArtifact($secret,$kind);},$kind.' rejects secret','SECRET_IN_TEXT');
    $maximum=$kind==='illustrated'?24:16;$many=$value;$many['blocks']=array();for($i=0;$i<$maximum;$i++){$block=$value['blocks'][$i===0?0:1];$block['id']='block_'.$i;$many['blocks'][]=$block;}
    compositionCheck(count(validateCompositionArtifact($many,$kind)['blocks'])===$maximum,$kind.' maximum block count');
    $extra=$many;$block=$value['blocks'][0];$block['id']='extra';$extra['blocks'][]=$block;compositionReject(function()use($extra,$kind){validateCompositionArtifact($extra,$kind);},$kind.' rejects excess blocks');
    foreach(array(array(),array($items[0],$items[0]),array(array('id'=>'document','label'=>'bad','content'=>$items[0]['content'])),array(array('id'=>'document','label'=>$items[0]['label'],'content'=>'[]')),array(array('id'=>'document','label'=>$items[0]['label'],'content'=>'{'))) as $badItems){compositionReject(function()use($badItems,$kind){compositionFromItems($badItems,$kind);},$kind.' rejects malformed projection');}
    // Object-keyed blocks must not become legal arrays during associative decode.
    $raw=json_decode($items[0]['content']);$raw->blocks=(object)array('0'=>$raw->blocks[0]);$bad=$items;$bad[0]['content']=jsonEncode($raw);compositionReject(function()use($bad,$kind){compositionFromItems($bad,$kind);},$kind.' rejects object-shaped block list before assoc decode');
}
$article=compositionFixture();foreach(array('text','above','left','right') as $layout){$value=$article;$value['blocks'][0]['layout']=$layout;$value['blocks'][0]['imageRefId']=$layout==='text'?'':str_repeat('1',32);compositionCheck(validateCompositionArtifact($value,'illustrated')===$value,'article layout '.$layout);}
foreach(array(
    'blank body'=>function($v){$v['blocks'][0]['body']='';return $v;},
    'body limit'=>function($v){$v['blocks'][0]['body']=str_repeat('x',12001);return $v;},
    'heading limit'=>function($v){$v['blocks'][0]['heading']=str_repeat('x',601);return $v;},
    'caption limit'=>function($v){$v['blocks'][0]['caption']=str_repeat('x',601);return $v;},
    'unknown layout'=>function($v){$v['blocks'][0]['layout']='grid';return $v;},
    'text with image'=>function($v){$v['blocks'][0]['layout']='text';return $v;},
    'image without reference'=>function($v){$v['blocks'][0]['imageRefId']='';return $v;}
) as $label=>$change){$bad=$change($article);compositionReject(function()use($bad){validateCompositionArtifact($bad,'illustrated');},'article rejects '.$label);}
$big=$article;$big['blocks']=array();for($i=0;$i<6;$i++){$block=$article['blocks'][1];$block['id']='b'.$i;$block['body']=str_repeat('x',12000);$big['blocks'][]=$block;}compositionReject(function()use($big){validateCompositionArtifact($big,'illustrated');},'full JSON size bound');
$poster=compositionFixture('poster');foreach(array('portrait','square','landscape') as $format){$value=$poster;$value['format']=$format;compositionCheck(validateCompositionArtifact($value,'poster')===$value,'poster format '.$format);}
foreach(array(
    'unknown format'=>function($v){$v['format']='a4';return $v;},
    'unknown type'=>function($v){$v['blocks'][0]['type']='html';return $v;},
    'unknown alignment'=>function($v){$v['blocks'][0]['alignment']='justify';return $v;},
    'text with image'=>function($v){$v['blocks'][0]['imageRefId']=str_repeat('1',32);return $v;},
    'image without reference'=>function($v){$v['blocks'][2]['imageRefId']='';return $v;},
    'empty text'=>function($v){$v['blocks'][0]['text']=' ';return $v;},
    'text limit'=>function($v){$v['blocks'][0]['text']=str_repeat('x',2001);return $v;},
    'image caption limit'=>function($v){$v['blocks'][2]['text']=str_repeat('x',601);return $v;},
    'no headline'=>function($v){array_shift($v['blocks']);return $v;},
    'no content'=>function($v){$v['blocks']=array($v['blocks'][0]);return $v;}
) as $label=>$change){$bad=$change($poster);compositionReject(function()use($bad){validateCompositionArtifact($bad,'poster');},'poster rejects '.$label);}
$noImages=$poster;array_pop($noImages['blocks']);compositionCheck(validateCompositionArtifact($noImages,'poster')===$noImages,'poster images are optional');
$changed=$poster;$changed['blocks'][2]['imageRefId']=str_repeat('2',32);compositionCheck(compositionContentFingerprint($changed)!==compositionContentFingerprint($poster),'fingerprint retains exact pinned image reference');
echo 'PASS '.$compositionChecks." composition checks\n";
