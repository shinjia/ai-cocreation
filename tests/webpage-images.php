<?php
/**
 * Native PHP 7.4+ image-section fixtures. Run: php tests/webpage-images.php
 * UNEXECUTED in the authoring environment: PHP is unavailable.
 * Node source contracts/lexer checks do not establish PHP runtime or syntax,
 * real browser, private HTTP authorization, database or provider behavior.
 * No network, credentials, inference, persistence, asset reads or publication.
 */
require_once dirname(__DIR__).'/app/bootstrap.php';
$webpageImageChecks=0;
function webpageImageCheck($ok,$label) {global $webpageImageChecks;if(!$ok)throw new RuntimeException('FAIL '.$label);$webpageImageChecks++;echo 'PASS '.$label."\n";}
function webpageImageReject($fn,$label) {$error=null;try{$fn();}catch(AppError $e){$error=$e;}webpageImageCheck($error instanceof AppError&&$error->errorCode==='ARTIFACT_INVALID',$label);}
function webpageImageSection($id='picture',$pin=null) {return array('id'=>$id,'type'=>'image','eyebrow'=>'','heading'=>'固定照片','body'=>" 區塊全文\r\n 第二行 ",'entries'=>array(array('id'=>$pin===null?str_repeat('1',32):$pin,'title'=>" 自訂替代文字\r\n <literal> ",'body'=>" 完整圖說\r\n 第二行 ")),'actionLabel'=>'','actionTarget'=>'');}
function webpageImageFixture() {return array('kind'=>'webpage','title'=>'圖片網頁','theme'=>'midnight','navigation'=>true,'sections'=>array(webpageImageSection()));}
$value=webpageImageFixture();
webpageImageCheck(validateWebpageArtifact($value)===$value,'image section preserves exact existing root section and entry keys');
webpageImageCheck(webpageImageReferenceIds($value)===array(str_repeat('1',32)),'helper returns pinned reference IDs');
$repeated=$value;$repeated['sections'][]=webpageImageSection('repeat');$repeated['sections'][]=webpageImageSection('other',str_repeat('2',32));
webpageImageCheck(webpageImageReferenceIds($repeated)===array(str_repeat('1',32),str_repeat('2',32)),'helper deduplicates exact pins in first-occurrence order');
webpageImageCheck(json_decode(webpageItems($value)[0]['content'],true)===$value,'image projection remains one complete native document');
$reordered=array_reverse($value,true);$reordered['sections']=array(array_reverse($value['sections'][0],true));$reordered['sections'][0]['entries']=array(array_reverse($value['sections'][0]['entries'][0],true));
webpageImageCheck(validateWebpageArtifact($reordered)===$value,'image canonical field ordering is unchanged');
$literal=$value;$literal['sections'][0]['entries'][0]['title']=" <script>literal</script>\r\nhttps://example.invalid ";$literal['sections'][0]['entries'][0]['body']=" </figure><img src=x onerror=bad> & \r\n\u{2028}\u{2029} ";
webpageImageCheck(validateWebpageArtifact($literal)===$literal,'authored image alt and caption remain full literal text');
foreach(array('',null,7,'entry_1',str_repeat('A',32),str_repeat('a',31),str_repeat('a',33),str_repeat('a',32)."\n",'https://example.invalid/a.png','data:image/png;base64,x') as $i=>$pin){$bad=$value;$bad['sections'][0]['entries'][0]['id']=$pin;webpageImageReject(function()use($bad){validateWebpageArtifact($bad);},'invalid image pin syntax '.$i);}
foreach(array(
    'empty image entries'=>function($v){$v['sections'][0]['entries']=array();return $v;},
    'multiple image entries'=>function($v){$v['sections'][0]['entries'][]=$v['sections'][0]['entries'][0];return $v;},
    'associative image entries'=>function($v){$v['sections'][0]['entries']=array('a'=>$v['sections'][0]['entries'][0]);return $v;},
    'image URL field'=>function($v){$v['sections'][0]['src']='https://example.invalid';return $v;},
    'new entry image field'=>function($v){$v['sections'][0]['entries'][0]['imageRefId']=str_repeat('1',32);return $v;},
    'missing image caption'=>function($v){unset($v['sections'][0]['entries'][0]['body']);return $v;},
    'image action forbidden'=>function($v){$v['sections'][0]['actionLabel']='Go';$v['sections'][0]['actionTarget']='picture';return $v;},
    'blank image alt'=>function($v){$v['sections'][0]['entries'][0]['title']=" \t\r\n\u{3000}";return $v;},
    'image alt over bytes'=>function($v){$v['sections'][0]['entries'][0]['title']=str_repeat('中',201);return $v;},
    'image caption over bytes'=>function($v){$v['sections'][0]['entries'][0]['body']=str_repeat('中',2001);return $v;},
    'invalid UTF8 alt'=>function($v){$v['sections'][0]['entries'][0]['title']="\xff";return $v;},
    'NUL caption'=>function($v){$v['sections'][0]['entries'][0]['body']="a\0b";return $v;}
) as $label=>$edit){$bad=$edit($value);webpageImageReject(function()use($bad){validateWebpageArtifact($bad);},$label);}
$max=$value;$max['sections'][0]['entries'][0]['title']=str_repeat('中',200);$max['sections'][0]['entries'][0]['body']=str_repeat('中',2000);
webpageImageCheck(validateWebpageArtifact($max)===$max,'exact existing 600-byte alt and 6000-byte caption bounds');
$empty=$value;$empty['sections'][0]['entries'][0]['body']='';webpageImageCheck(validateWebpageArtifact($empty)===$empty,'empty optional image caption accepted');
$secret=$value;$secret['sections'][0]['entries'][0]['body']='sk-'.str_repeat('x',20);$error=null;try{validateWebpageArtifact($secret);}catch(AppError $e){$error=$e;}webpageImageCheck($error instanceof AppError,'shared secret guard remains active on image captions');
$pinChange=$value;$pinChange['sections'][0]['entries'][0]['id']=str_repeat('2',32);webpageImageCheck(webpageContentFingerprint($pinChange)!==webpageContentFingerprint($value),'image pin change alters content fingerprint');
$sectionIdChange=$value;$sectionIdChange['sections'][0]['id']='renamed';webpageImageCheck(webpageContentFingerprint($sectionIdChange)===webpageContentFingerprint($value),'incidental image section ID rewrite does not manufacture a revision');
$textChange=$value;$textChange['sections'][0]['entries'][0]['title']='new custom alt';webpageImageCheck(webpageContentFingerprint($textChange)!==webpageContentFingerprint($value),'custom alt change is content');
$legacy=array('kind'=>'webpage','title'=>'Legacy','theme'=>'paper','navigation'=>false,'sections'=>array(array('id'=>'cards','type'=>'cards','eyebrow'=>'','heading'=>'Cards','body'=>'','entries'=>array(array('id'=>'entry_a','title'=>'Card','body'=>'literal')),'actionLabel'=>'','actionTarget'=>'')));
$legacyBytes=jsonEncode($legacy);webpageImageCheck(validateWebpageArtifact($legacy)===$legacy&&webpageItems($legacy)[0]['content']===$legacyBytes,'legacy no-image versions remain byte-for-byte unchanged');webpageImageCheck(webpageImageReferenceIds($legacy)===array(),'legacy text-only helper is empty');
$legacyRenamed=$legacy;$legacyRenamed['sections'][0]['entries'][0]['id']='renamed';webpageImageCheck(webpageContentFingerprint($legacyRenamed)===webpageContentFingerprint($legacy),'legacy card entry IDs still ignored in content fingerprint');
$schema=webpageSchema();webpageImageCheck(in_array('image',$schema['properties']['sections']['items']['properties']['type']['enum'],true),'strict provider section enum includes image');webpageImageCheck(array_keys($schema['properties'])===array('kind','title','theme','navigation','sections'),'provider root keys remain unchanged without migration');
echo 'Completed '.$webpageImageChecks." native webpage image checks.\n";
