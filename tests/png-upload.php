<?php
/**
 * Native PHP 7.4+ PNG fixtures. Run: php tests/png-upload.php
 * UNEXECUTED in the authoring environment: PHP is unavailable.
 * Node source-contract/golden-PNG tests do NOT execute or validate this PHP.
 * No user images, external decoder, network, filesystem writes, GD or API key.
 * Requires zlib and enough configured memory for the deliberately safe budget.
 */
require_once dirname(__DIR__).'/app/validation.php';
require_once dirname(__DIR__).'/app/png-upload.php';

$pngChecks=0;
function pngCheck($ok,$label) {global $pngChecks;if(!$ok)throw new RuntimeException('FAIL '.$label);$pngChecks++;echo 'PASS '.$label."\n";}
function pngReject($bytes,$label,$code='PNG_INVALID',$status=400) {
    $error=null;try{normalizeUploadedPng($bytes);}catch(AppError $e){$error=$e;}
    pngCheck($error instanceof AppError&&$error->errorCode===$code&&$error->status===$status,$label);
    pngCheck(strpos($error->getMessage(),'fixture-secret-marker')===false&&strpos($error->getMessage(),"\x89PNG")===false,$label.' redacts payload');
}
function pngFixtureChunk($type,$data) {return pack('N',strlen($data)).$type.$data.hash('crc32b',$type.$data,true);}
function pngFixtureHeader($width=1,$height=1,$color=2,$depth=8,$compression=0,$filter=0,$interlace=0) {return pack('NNCCCCC',$width,$height,$depth,$color,$compression,$filter,$interlace);}
function pngFixture($raw="\x00\xff\x00\x00",$header=null,$before=array(),$after=array(),$compressed=null) {
    if($header===null)$header=pngFixtureHeader();
    return "\x89PNG\r\n\x1a\n".pngFixtureChunk('IHDR',$header).implode('',$before).pngFixtureChunk('IDAT',$compressed===null?gzcompress($raw,6):$compressed).implode('',$after).pngFixtureChunk('IEND','');
}
function pngFixtureRead($bytes) {
    $chunks=array();$offset=8;$size=strlen($bytes);
    pngCheck(substr($bytes,0,8)==="\x89PNG\r\n\x1a\n",'canonical PNG signature');
    while($offset<$size){$length=unpack('N',substr($bytes,$offset,4))[1];$type=substr($bytes,$offset+4,4);$data=substr($bytes,$offset+8,$length);$crc=substr($bytes,$offset+8+$length,4);
        pngCheck($crc===hash('crc32b',$type.$data,true),'canonical '.$type.' CRC');$chunks[]=array('type'=>$type,'data'=>$data);$offset+=12+$length;}
    pngCheck($offset===$size,'canonical has exact framing with no trailing bytes');return $chunks;
}
// Fixed independently assembled golden bytes are also inspected by Node zlib.
// GOLDEN_PNG_FIXTURES_BEGIN
function pngGoldenFixtures() {return array(
    'rgb'=>hex2bin('89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c49444154789c63f8cfc0000003010100c9fe92ef0000000049454e44ae426082'),
    'rgba'=>hex2bin('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63f8cfc0d00000048101802c55ceb00000000049454e44ae426082'),
    'filters'=>hex2bin('89504e470d0a1a0a0000000d49484452000000020000000508060000006fb33d9c0000002c49444154789c6310b6886d5a7ee6a318a37542ebaa2953a64c61d28002e6a89cfa8971f7eedd63810a4c010070e70f8325e7289a0000000049454e44ae426082')
);}
// GOLDEN_PNG_FIXTURES_END
$golden=pngGoldenFixtures();
foreach($golden as $name=>$input){
    $normalized=normalizeUploadedPng($input);$chunks=pngFixtureRead($normalized['bytes']);
    pngCheck(array_keys($normalized)===array('bytes','mime','width','height','byteLength','sha256','normalization'),'exact canonical descriptor '.$name);
    pngCheck(array_column($chunks,'type')===array('IHDR','IDAT','IEND'),'only IHDR single IDAT IEND '.$name);
    pngCheck($normalized['mime']==='image/png'&&$normalized['normalization']==='png-v1','fixed MIME and normalization '.$name);
    pngCheck($normalized['byteLength']===strlen($normalized['bytes'])&&$normalized['byteLength']<=4194304,'canonical byte length '.$name);
    pngCheck(preg_match('/^[a-f0-9]{64}$/D',$normalized['sha256'])===1&&$normalized['sha256']===hash('sha256',$normalized['bytes']),'lowercase SHA256 of canonical bytes '.$name);
    pngCheck($normalized['width']===($name==='filters'?2:1)&&$normalized['height']===($name==='filters'?5:1),'descriptor dimensions '.$name);
    $sourceChunks=pngFixtureRead($input);
    pngCheck(gzuncompress($chunks[1]['data'])===gzuncompress($sourceChunks[1]['data']),'filtered scanline identity preserves pixels '.$name);
    pngCheck(normalizeUploadedPng($normalized['bytes'])===$normalized,'normalization is idempotent '.$name);
}
pngCheck(gzuncompress(pngFixtureRead(normalizeUploadedPng($golden['rgba'])['bytes'])[1]['data'])==="\x00\xff\x00\x00\x80",'RGBA alpha byte preserved');
$filters=hex2bin('0013385d82a7ccf116013b6085aa94949494022828282828282828035a6c7f915ededede042828282828282894');
pngCheck(gzuncompress(pngFixtureRead(normalizeUploadedPng($golden['filters'])['bytes'])[1]['data'])===$filters,'all five valid PNG filters retained exactly');

// Metadata is CRC checked but never decoded, copied into the descriptor or saved.
$metadata=array(pngFixtureChunk('tEXt',"Comment\0fixture-secret-marker"),pngFixtureChunk('zTXt',"Comment\0\0".gzcompress(str_repeat('metadata',5000))),pngFixtureChunk('iTXt',"Comment\0\0\0\0\0fixture-secret-marker"),pngFixtureChunk('eXIf','fixture-secret-marker'),pngFixtureChunk('iCCP',"profile\0\0".gzcompress('fixture-secret-marker')),pngFixtureChunk('vpAg','fixture-secret-marker'));
$withMetadata=pngFixture("\x00\xff\x00\x00",null,$metadata,array(pngFixtureChunk('tIME',pack('nCCCCC',2026,1,2,3,4,5))));
$base=normalizeUploadedPng($golden['rgb']);$clean=normalizeUploadedPng($withMetadata);
pngCheck($clean===$base&&strpos($clean['bytes'],'fixture-secret-marker')===false,'EXIF text profiles compressed metadata and private ancillary chunks are stripped');
$stream=gzcompress("\x00\xff\x00\x00",6);
$split="\x89PNG\r\n\x1a\n".pngFixtureChunk('IHDR',pngFixtureHeader()).pngFixtureChunk('IDAT','').pngFixtureChunk('IDAT',substr($stream,0,3)).pngFixtureChunk('IDAT',substr($stream,3)).pngFixtureChunk('IDAT','').pngFixtureChunk('IEND','');
pngCheck(normalizeUploadedPng($split)===$base,'contiguous split and empty IDAT chunks become one fresh stream');
pngCheck(normalizeUploadedPng(pngFixture('',null,array(),array(),$stream.'fixture-secret-marker'))===$base,'compressed trailing garbage is not preserved');
pngCheck(normalizeUploadedPng(pngFixture('',null,array(),array(),$stream.gzcompress('fixture-secret-marker')))===$base,'additional compressed stream is not preserved');

// Input limits, signature, dimensions and every unsupported IHDR field.
foreach(array(null,false,12,array(),new stdClass()) as $bad)pngReject($bad,'reject non-string binary payload');
pngReject('','reject empty input','PNG_TOO_LARGE',413);
pngReject(str_repeat('x',4194305),'reject input over 4 MiB','PNG_TOO_LARGE',413);
pngReject('x','reject incomplete signature');pngReject('not-a-png-fixture-secret-marker','reject invalid signature');
pngReject("\x89PNG\r\n\x1a\n",'reject signature without chunks');
foreach(array(array(0,1),array(1,0),array(2049,1),array(1,2049),array(4294967295,1)) as $dimensions)pngReject(pngFixture('',pngFixtureHeader($dimensions[0],$dimensions[1])),'reject out-of-bounds dimensions','PNG_TOO_LARGE',413);
foreach(array(0,1,3,4,5,7) as $color)pngReject(pngFixture('',pngFixtureHeader(1,1,$color)),'reject unsupported color type '.$color,'PNG_FORMAT_UNSUPPORTED',415);
foreach(array(0,1,2,4,16) as $depth)pngReject(pngFixture('',pngFixtureHeader(1,1,2,$depth)),'reject unsupported bit depth '.$depth,'PNG_FORMAT_UNSUPPORTED',415);
foreach(array(pngFixtureHeader(1,1,2,8,1),pngFixtureHeader(1,1,2,8,0,1),pngFixtureHeader(1,1,2,8,0,0,1)) as $header)pngReject(pngFixture('',$header),'reject compression filter-method or interlace field','PNG_FORMAT_UNSUPPORTED',415);
pngReject(pngFixture('',substr(pngFixtureHeader(),0,12)),'reject short IHDR');pngReject(pngFixture('',pngFixtureHeader()."\0"),'reject long IHDR');

// Framing, CRC, ASCII type names, reserved bit and strict critical/order checks.
$signature="\x89PNG\r\n\x1a\n";$ihdr=pngFixtureChunk('IHDR',pngFixtureHeader());$idat=pngFixtureChunk('IDAT',$stream);$iend=pngFixtureChunk('IEND','');
foreach(array(substr($base['bytes'],0,-1),substr($base['bytes'],0,-5),$signature."\0\0\0",$signature.pack('N',4294967295).'IHDR'.'tiny') as $bad)pngReject($bad,'reject truncated or overflowing chunk framing');
foreach(array(29,54,strlen($base['bytes'])-1) as $position){$bad=$base['bytes'];$bad[$position]=chr(ord($bad[$position])^1);pngReject($bad,'reject IHDR IDAT or IEND CRC corruption');}
$badMetadata=pngFixtureChunk('tEXt','fixture-secret-marker');$badMetadata[strlen($badMetadata)-1]=chr(ord($badMetadata[strlen($badMetadata)-1])^1);pngReject(pngFixture("\x00\xff\x00\x00",null,array($badMetadata)),'reject ancillary CRC even though metadata is stripped');
foreach(array('teXt','t1Xt',"t\x80Xt",'t_Xt') as $type)pngReject(pngFixture("\x00\xff\x00\x00",null,array(pngFixtureChunk($type,''))),'reject invalid ASCII or reserved chunk bit');
foreach(array('ABCD','PLTE') as $type)pngReject(pngFixture("\x00\xff\x00\x00",null,array(pngFixtureChunk($type,'fixture-secret-marker'))),'reject unsupported critical '.$type,'PNG_FORMAT_UNSUPPORTED',415);
foreach(array('acTL','fcTL','fdAT','tRNS') as $type)pngReject(pngFixture("\x00\xff\x00\x00",null,array(pngFixtureChunk($type,''))),'reject APNG or semantic transparency '.$type,'PNG_FORMAT_UNSUPPORTED',415);
pngReject($signature.$idat.$ihdr.$iend,'reject IDAT before IHDR');
pngReject($signature.pngFixtureChunk('tEXt','x').$ihdr.$idat.$iend,'reject ancillary before IHDR');
pngReject($signature.$ihdr.$ihdr.$idat.$iend,'reject duplicate IHDR');
pngReject($signature.$ihdr.$idat.pngFixtureChunk('tEXt','x').pngFixtureChunk('IDAT','').$iend,'reject noncontiguous IDAT');
pngReject($signature.$ihdr.$iend,'reject missing IDAT');
pngReject($signature.$ihdr.pngFixtureChunk('IDAT','').$iend,'reject empty aggregate IDAT');
pngReject($signature.$ihdr.$idat,'reject missing IEND');
pngReject($signature.$ihdr.$idat.pngFixtureChunk('IEND','x'),'reject nonempty IEND');
pngReject($base['bytes'].'fixture-secret-marker','reject trailing file bytes');
pngReject($base['bytes'].$iend,'reject duplicate IEND');
pngReject($base['bytes'].$golden['rgba'],'reject appended second PNG');
$chunks1024=$signature.$ihdr.str_repeat(pngFixtureChunk('vpAg',''),1021).$idat.$iend;
pngCheck(normalizeUploadedPng($chunks1024)===$base,'accept exactly 1024 chunks');
pngReject($signature.$ihdr.str_repeat(pngFixtureChunk('vpAg',''),1022).$idat.$iend,'reject 1025 chunks');

// Strict zlib wrapper, exact inflate bound, checksum, filters and row lengths.
foreach(array('abcdef',"\x78\x9dabcdef",gzencode("\x00\xff\x00\x00"),gzdeflate("\x00\xff\x00\x00")) as $compressed)pngReject(pngFixture('',null,array(),array(),$compressed),'reject invalid FCHECK gzip raw or malformed zlib wrapper','PNG_FORMAT_UNSUPPORTED',415);
foreach(array(0x79,0x88,0x78) as $cmf){$flg=$cmf===0x78?32:0;while((($cmf<<8)+$flg)%31!==0)$flg++;$compressed=chr($cmf).chr($flg).str_repeat("\0",6);pngReject(pngFixture('',null,array(),array(),$compressed),'reject CM CINFO or FDICT despite correct FCHECK','PNG_FORMAT_UNSUPPORTED',415);}
pngReject(pngFixture('',null,array(),array(),"\x78\x9c"),'reject truncated zlib stream');
$corrupt=$stream;$corrupt[strlen($corrupt)-1]=chr(ord($corrupt[strlen($corrupt)-1])^1);pngReject(pngFixture('',null,array(),array(),$corrupt),'reject zlib Adler checksum corruption');
pngReject(pngFixture('',null,array(),array(),"\x78\x9c\xff\xff\xff\xff\x00\x00"),'reject corrupt deflate after valid wrapper');
pngReject(pngFixture("\x00\xff\x00"),'reject short decoded row');
pngReject(pngFixture("\x00\xff\x00\x00\x00"),'reject overlong decoded row');
pngReject(pngFixture(str_repeat("\0",1048576)),'reject inflate bomb at exact expected row bound');
pngReject(pngFixture("\x05\xff\x00\x00"),'reject filter 5');pngReject(pngFixture("\xff\xff\x00\x00"),'reject filter 255');
pngReject(pngFixture("\0\xff\0\0\5\xff\0\0",pngFixtureHeader(1,2)),'reject invalid filter on later row');
pngReject(pngFixture("\0\xff\0\0",pngFixtureHeader(1,2)),'reject missing later scanline');

// Legal large dimensions use narrow rows to avoid a large fixture allocation.
foreach(array(array(2048,1),array(1,2048)) as $dimensions){$raw=str_repeat("\0",($dimensions[0]*3+1)*$dimensions[1]);$n=normalizeUploadedPng(pngFixture($raw,pngFixtureHeader($dimensions[0],$dimensions[1])));pngCheck($n['width']===$dimensions[0]&&$n['height']===$dimensions[1],'accept exact 2048 side boundary');}
// A legal Huffman-only source fits the input cap, but the fresh default-strategy
// stream exceeds it. These synthetic nibbles are pixels, never a user image.
$large='';$largeLength=(2048*4+1)*1000;
for($counter=0;strlen($large)<$largeLength;$counter++)$large.=hash('sha256',(string)$counter,true);
$from='';$to='';for($value=0;$value<256;$value++){$from.=chr($value);$to.=chr($value&15);}
$large=strtr(substr($large,0,$largeLength),$from,$to);
for($row=0;$row<1000;$row++)$large[$row*8193]="\0";
$context=deflate_init(ZLIB_ENCODING_DEFLATE,array('level'=>9,'strategy'=>ZLIB_HUFFMAN_ONLY));$smallStream=deflate_add($context,$large,ZLIB_FINISH);
$expands=pngFixture('',pngFixtureHeader(2048,1000,6),array(),array(),$smallStream);
pngCheck(strlen($expands)<=4194304&&strlen(gzcompress($large,6))+57>4194304,'golden Huffman source fits but default recompression exceeds 4 MiB');
pngReject($expands,'reject canonical output over 4 MiB even when source fits','PNG_TOO_LARGE',413);
unset($large,$smallStream,$expands,$context,$from,$to);
$exactBytes=4194304;$filler=$exactBytes-strlen($base['bytes'])-12;
$exactInput=$signature.$ihdr.pngFixtureChunk('vpAg',str_repeat('x',$filler)).$idat.$iend;
pngCheck(strlen($exactInput)===$exactBytes&&normalizeUploadedPng($exactInput)===$base,'accept exact 4 MiB source while stripping metadata');
unset($exactInput,$metadata,$withMetadata,$chunks1024);

// Pure configuration parser fixtures; do not alter process ini settings.
pngCheck(pngUploadMemoryLimitBytes('-1')===null,'unlimited memory setting still uses fixed PNG limits');
foreach(array('128M'=>134217728,'64m'=>67108864,'512K'=>524288,'1048576'=>1048576,' 32M '=>33554432) as $setting=>$bytes)pngCheck(pngUploadMemoryLimitBytes((string)$setting)===$bytes,'parse conservative memory budget '.$setting);
foreach(array('',false,'0','-2','128MB','1.5G','not-a-limit','999999999999999999999G') as $setting){$error=null;try{pngUploadMemoryLimitBytes($setting);}catch(AppError $e){$error=$e;}pngCheck($error instanceof AppError&&$error->errorCode==='PNG_RUNTIME_UNAVAILABLE'&&$error->status===503,'fail closed on unknown memory limit');}
$limit=pngUploadMemoryLimitBytes(ini_get('memory_limit'));
if($limit!==null){$error=null;try{pngUploadEnsureMemory($limit);}catch(AppError $e){$error=$e;}pngCheck($error instanceof AppError&&$error->errorCode==='PNG_RESOURCE_LIMIT'&&$error->status===503,'reject insufficient memory without allocating or changing limits');}
else echo "SKIP finite-memory refusal fixture: memory_limit is unlimited.\n";

echo 'PNG native fixtures passed: '.$pngChecks." checks.\n";
