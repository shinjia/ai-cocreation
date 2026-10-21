<?php
/**
 * Native PHP 7.4+/PDO SQLite fixtures. Run: php tests/media-store.php
 * UNEXECUTED in the authoring environment because PHP is unavailable.
 * Python SQLite and Node source contracts do NOT establish PHP/PDO/HTTP success.
 * These fixtures use only new in-memory or disposable temporary databases.
 * No real user data, credentials, network, model or provider calls are used.
 */
require_once dirname(__DIR__).'/app/validation.php';
require_once dirname(__DIR__).'/app/store.php';
require_once dirname(__DIR__).'/app/media-store.php';
if(!class_exists('PDO')||!in_array('sqlite',PDO::getAvailableDrivers(),true)){
    fwrite(STDERR,"UNEXECUTED: native MediaStore fixtures require PDO SQLite.\n");exit(77);
}
$mediaChecks=0;
function mediaCheck($ok,$label) {global $mediaChecks;if(!$ok)throw new RuntimeException('FAIL '.$label);$mediaChecks++;echo 'PASS '.$label."\n";}
function mediaReject(callable $call,$label,$code,$status=400) {
    $error=null;try{$call();}catch(AppError $caught){$error=$caught;}
    mediaCheck($error instanceof AppError&&$error->errorCode===$code&&$error->status===$status,$label);
}
function mediaFixtureDb($path=':memory:') {
    $db=new PDO('sqlite:'.$path);$db->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);
    $db->exec('CREATE TABLE projects(id TEXT PRIMARY KEY, owner TEXT NOT NULL, title TEXT NOT NULL, updated_at TEXT NOT NULL, body TEXT NOT NULL)');
    $db->exec('CREATE TABLE settings(name TEXT PRIMARY KEY, value TEXT NOT NULL)');
    $db->exec('CREATE TABLE requests(owner TEXT, id TEXT, status TEXT)');
    $db->exec('PRAGMA user_version=37');return $db;
}
function mediaFixturePng() {
    $bytes=base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',true);
    return array('bytes'=>$bytes,'mime'=>'image/png','width'=>1,'height'=>1,'byteLength'=>strlen($bytes),'sha256'=>hash('sha256',$bytes),'normalization'=>'png-v1');
}
function mediaFixtureStore(PDO $db) {
    // Share the real project Store methods without invoking its path constructor.
    $reflection=new ReflectionClass('Store');$store=$reflection->newInstanceWithoutConstructor();$store->db=$db;return $store;
}
function mediaFixtureNumberId($number) {return str_pad(dechex($number),32,'0',STR_PAD_LEFT);}

$db=mediaFixtureDb();$store=mediaFixtureStore($db);
$owner=str_repeat('a',64);$otherOwner=str_repeat('b',64);$project=str_repeat('c',32);$otherProject=str_repeat('d',32);
$item=str_repeat('e',32);$otherItem=str_repeat('f',32);$asset=str_repeat('1',32);$version=str_repeat('2',32);
$request='upload-20261021-fixture-0001';$fingerprint=str_repeat('3',64);$png=mediaFixturePng();
$original=$store->save(array('id'=>$project,'title'=>'既有作品','versions'=>array(array('id'=>'old-version','content'=>'保留原文'))),$owner);
$db->exec("INSERT INTO settings(name,value) VALUES('existing','preserved')");
$q=$db->prepare('INSERT INTO requests(owner,id,status) VALUES(?,?,?)');$q->execute(array($owner,'old-request','completed'));
$media=new MediaStore($db);
mediaCheck((int)$db->query('PRAGMA user_version')->fetchColumn()===37,'constructor retains existing schema version');
mediaCheck($store->project($project,$owner)===$original,'constructor retains existing project body');
mediaCheck($db->query("SELECT value FROM settings WHERE name='existing'")->fetchColumn()==='preserved','constructor retains existing settings');
mediaCheck($db->query("SELECT status FROM requests WHERE id='old-request'")->fetchColumn()==='completed','constructor retains existing request journal');
mediaReject(function()use($media,$owner,$project,$item,$png){$media->insert($owner,$project,$item,$png);},'standalone asset insert cannot escape atomic helper','MEDIA_TRANSACTION_REQUIRED',409);
mediaReject(function()use($media,$owner,$request,$project,$item,$fingerprint,$version){$media->recordReceipt($owner,$request,$project,$item,$fingerprint,$version);},'standalone receipt insert cannot escape atomic helper','MEDIA_TRANSACTION_REQUIRED',409);
$metadata=$media->transaction(function($same)use($media,$owner,$project,$item,$png,$asset,$request,$fingerprint,$version,$store,$original){
    mediaCheck($same===$media,'transaction callback receives same MediaStore instance');
    $metadata=$media->insert($owner,$project,$item,$png,$asset);
    $next=$original;$next['versions'][]=array('id'=>$version,'asset'=>$metadata);$store->save($next,$owner);
    $receipt=$media->recordReceipt($owner,$request,$project,$item,$fingerprint,$version);
    mediaCheck($receipt['versionId']===$version,'receipt reports new complete version identity');return $metadata;
});
mediaCheck(array_keys($metadata)===array('id','mime','width','height','byteLength','sha256','normalization','createdAt'),'metadata has only exact safe allowlist');
mediaCheck($metadata['id']===$asset&&$metadata['sha256']===$png['sha256'],'metadata returns saved identity and verified digest');
$read=$media->read($owner,$project,$asset,$item);
mediaCheck(array_keys($read)===array('metadata','bytes','itemId')&&$read['bytes']===$png['bytes']&&$read['itemId']===$item,'native PDO BLOB reads as original binary bytes with scoped item');
mediaCheck($media->read($owner,$project,$asset)['bytes']===$png['bytes'],'optional-item read still authorizes owner and project');
mediaCheck($db->query('SELECT typeof(bytes) FROM media_assets')->fetchColumn()==='blob','PDO PARAM_LOB is actually stored as SQLite BLOB');
mediaReject(function()use($media,$otherOwner,$project,$asset){$media->read($otherOwner,$project,$asset);},'cross-owner read rejected','MEDIA_NOT_FOUND',404);
mediaReject(function()use($media,$owner,$otherProject,$asset){$media->read($owner,$otherProject,$asset);},'cross-project read rejected','MEDIA_NOT_FOUND',404);
mediaReject(function()use($media,$owner,$project,$asset,$otherItem){$media->read($owner,$project,$asset,$otherItem);},'cross-item read rejected','MEDIA_NOT_FOUND',404);
mediaCheck($media->lookupReceipt($otherOwner,$request)===null,'receipt cannot cross owner boundary');
$receipt=$media->lookupReceipt($owner,$request);
mediaCheck(array_keys($receipt)===array('requestId','projectId','itemId','fingerprint','versionId','createdAt')&&$receipt['fingerprint']===$fingerprint,'replay receipt is complete and excludes owner');
mediaReject(function()use($media,$owner,$project,$item,$png,$asset){$media->transaction(function()use($media,$owner,$project,$item,$png,$asset){$media->insert($owner,$project,$item,$png,$asset);});},'asset collision does not overwrite existing bytes','MEDIA_WRITE_FAILED',409);
mediaReject(function()use($media,$owner,$request,$project,$item,$version){$media->transaction(function()use($media,$owner,$request,$project,$item,$version){$media->recordReceipt($owner,$request,$project,$item,str_repeat('4',64),$version);});},'same request ID cannot replace receipt fingerprint','MEDIA_RECEIPT_CONFLICT',409);
mediaCheck($media->lookupReceipt($owner,$request)===$receipt,'rejected duplicate leaves receipt immutable');
$again=new MediaStore($db);
mediaCheck($again->read($owner,$project,$asset)['bytes']===$png['bytes']&&$again->lookupReceipt($owner,$request)===$receipt,'reinitialization retains image and receipt');
mediaCheck((int)$db->query('PRAGMA user_version')->fetchColumn()===37,'reinitialization does not change user_version');
$generated=$media->transaction(function()use($media,$owner,$project,$item,$png){return $media->insert($owner,$project,$item,$png);});
mediaCheck(preg_match('/^[a-f0-9]{32}$/D',$generated['id'])&&$generated['id']!==$asset,'default asset identity is independently generated 32-hex ID');

$invalid=array(
    'extra field'=>function($v){$v['extra']='not saved';return $v;},
    'missing field'=>function($v){unset($v['normalization']);return $v;},
    'incorrect MIME'=>function($v){$v['mime']='image/jpeg';return $v;},
    'incorrect normalization'=>function($v){$v['normalization']='raw';return $v;},
    'zero width'=>function($v){$v['width']=0;return $v;},
    'oversize height'=>function($v){$v['height']=2049;return $v;},
    'noninteger dimensions'=>function($v){$v['width']=1.0;return $v;},
    'header dimension mismatch'=>function($v){$v['width']=2;return $v;},
    'byte count mismatch'=>function($v){$v['byteLength']++;return $v;},
    'noninteger byte count'=>function($v){$v['byteLength']=(string)$v['byteLength'];return $v;},
    'oversize byte count'=>function($v){$v['byteLength']=4194305;return $v;},
    'digest mismatch'=>function($v){$v['sha256']=str_repeat('0',64);return $v;},
    'uppercase digest'=>function($v){$v['sha256']=strtoupper($v['sha256']);return $v;},
    'nonbinary payload'=>function($v){$v['bytes']=false;return $v;},
    'invalid PNG signature'=>function($v){$v['bytes'][0]='X';$v['sha256']=hash('sha256',$v['bytes']);return $v;},
    'trailing bytes'=>function($v){$v['bytes'].='x';$v['byteLength']=strlen($v['bytes']);$v['sha256']=hash('sha256',$v['bytes']);return $v;}
);
$beforeCount=(int)$db->query('SELECT COUNT(*) FROM media_assets')->fetchColumn();
foreach($invalid as $label=>$mutate){$bad=$mutate($png);mediaReject(function()use($media,$owner,$project,$item,$bad){$media->transaction(function()use($media,$owner,$project,$item,$bad){$media->insert($owner,$project,$item,$bad);});},'descriptor rejects '.$label,'MEDIA_INVALID');}
mediaCheck((int)$db->query('SELECT COUNT(*) FROM media_assets')->fetchColumn()===$beforeCount,'descriptor failures leave no partial assets');
mediaReject(function()use($media,$project,$item,$png){$media->transaction(function()use($media,$project,$item,$png){$media->insert(str_repeat('x',64),$project,$item,$png);});},'invalid owner rejected before query','MEDIA_OWNER_INVALID');
mediaReject(function()use($media,$owner,$item,$png){$media->transaction(function()use($media,$owner,$item,$png){$media->insert($owner,str_repeat('x',32),$item,$png);});},'invalid project rejected before query','MEDIA_ID_INVALID');
foreach(array('short',str_repeat('x',65),str_repeat('x',19).'_',str_repeat('x',19).'é',str_repeat('x',19)."\n") as $badRequest){mediaReject(function()use($media,$owner,$badRequest){$media->lookupReceipt($owner,$badRequest);},'strict request ID grammar rejects invalid input','REQUEST_ID_REQUIRED');}
mediaReject(function()use($media){$media->transaction(function()use($media){$media->transaction(function(){return null;});});},'helper rejects nested transaction','MEDIA_TRANSACTION_NESTED',409);
$db->beginTransaction();
mediaReject(function()use($media){$media->transaction(function(){return null;});},'helper refuses to own existing PDO transaction','MEDIA_TRANSACTION_NESTED',409);
mediaCheck($db->inTransaction(),'nested rejection does not rollback caller-owned transaction');$db->rollBack();
mediaCheck($media->transaction(function(){return 'reusable';})==='reusable','helper can be reused after rollback');

// Inject failures after each mutation: asset, complete project version, receipt.
$stableProject=$store->project($project,$owner);
foreach(array('asset','project','receipt') as $index=>$stage){
    $transient=mediaFixtureNumberId(1000+$index);$transientRequest='rollback-'.$stage.'-20261021-0001';$caught=null;
    try{$media->transaction(function()use($media,$store,$owner,$project,$item,$png,$transient,$transientRequest,$fingerprint,$version,$stableProject,$stage){
        $metadata=$media->insert($owner,$project,$item,$png,$transient);
        if($stage==='project'||$stage==='receipt'){$next=$stableProject;$next['versions'][]=array('id'=>$version,'asset'=>$metadata);$store->save($next,$owner);}
        if($stage==='receipt')$media->recordReceipt($owner,$transientRequest,$project,$item,$fingerprint,$version);
        throw new RuntimeException('fixture interruption after '.$stage);
    });}catch(RuntimeException $error){$caught=$error;}
    mediaCheck($caught instanceof RuntimeException,'original callback failure returned after '.$stage);
    mediaReject(function()use($media,$owner,$project,$transient){$media->read($owner,$project,$transient);},'rollback after '.$stage.' removes orphan asset','MEDIA_NOT_FOUND',404);
    mediaCheck($store->project($project,$owner)===$stableProject,'rollback after '.$stage.' retains previous complete project');
    mediaCheck($media->lookupReceipt($owner,$transientRequest)===null,'rollback after '.$stage.' has no success receipt');
}
$transient=mediaFixtureNumberId(2000);
mediaReject(function()use($media,$store,$owner,$project,$item,$png,$transient,$stableProject){$media->transaction(function()use($media,$store,$owner,$project,$item,$png,$transient,$stableProject){$media->insert($owner,$project,$item,$png,$transient);$next=$stableProject;$next['oversized']=str_repeat('x',2000001);$store->save($next,$owner);});},'real Store save size failure propagates through transaction','PROJECT_LIMIT',409);
mediaReject(function()use($media,$owner,$project,$transient){$media->read($owner,$project,$transient);},'real Store failure rolls back prior BLOB insert','MEDIA_NOT_FOUND',404);

// A corrupted private database row must not be emitted as an image.
$q=$db->prepare('UPDATE media_assets SET sha256=? WHERE id=?');$q->execute(array(str_repeat('0',64),$generated['id']));
mediaReject(function()use($media,$owner,$project,$generated){$media->read($owner,$project,$generated['id']);},'read rechecks stored hash before returning bytes','MEDIA_CORRUPT',409);

// Count quotas: normal insert path, including canonical byte descriptor checks.
$countDb=mediaFixtureDb();$countMedia=new MediaStore($countDb);
$countMedia->transaction(function()use($countMedia,$owner,$project,$item,$png){for($n=0;$n<100;$n++)$countMedia->insert($owner,$project,$item,$png,mediaFixtureNumberId($n+1));});
mediaCheck((int)$countDb->query('SELECT COUNT(*) FROM media_assets')->fetchColumn()===100,'100th project asset accepted at exact count cap');
mediaReject(function()use($countMedia,$owner,$project,$item,$png){$countMedia->transaction(function()use($countMedia,$owner,$project,$item,$png){$countMedia->insert($owner,$project,$item,$png);});},'101st project asset rejected','MEDIA_PROJECT_QUOTA',409);
$countMedia->transaction(function()use($countMedia,$owner,$item,$png){for($n=100;$n<400;$n++)$countMedia->insert($owner,mediaFixtureNumberId(1000+(int)floor($n/100)),$item,$png,mediaFixtureNumberId($n+1));});
mediaCheck((int)$countDb->query('SELECT COUNT(*) FROM media_assets')->fetchColumn()===400,'400th owner asset accepted across projects');
mediaReject(function()use($countMedia,$owner,$otherProject,$item,$png){$countMedia->transaction(function()use($countMedia,$owner,$otherProject,$item,$png){$countMedia->insert($owner,$otherProject,$item,$png);});},'401st owner asset rejected in otherwise empty project','MEDIA_OWNER_QUOTA',409);
$other=$countMedia->transaction(function()use($countMedia,$otherOwner,$project,$item,$png){return $countMedia->insert($otherOwner,$project,$item,$png);});
mediaCheck($other['byteLength']===$png['byteLength'],'another owner has independent quota');

// Byte quota tests use disposable SQL-only zeroblob fixtures, not valid images.
// The normal insert() being tested still receives the canonical PNG fixture.
$temp=tempnam(sys_get_temp_dir(),'cocreation-media-');
mediaCheck(is_string($temp),'temporary byte-quota fixture path created');
try {
    $byteDb=mediaFixtureDb($temp);$byteMedia=new MediaStore($byteDb);
    $seed=$byteDb->prepare('INSERT INTO media_assets(id,owner,project_id,item_id,mime,width,height,byte_length,sha256,normalization,created_at,bytes) VALUES(?,?,?,?,?,?,?,?,?,?,?,zeroblob(?))');
    $byteDb->beginTransaction();
    for($n=0;$n<64;$n++)$seed->execute(array(mediaFixtureNumberId($n+1),$owner,mediaFixtureNumberId(2000+(int)floor($n/16)),$item,'image/png',1,1,4194304,str_repeat('0',64),'png-v1',gmdate('c'),4194304));
    $byteDb->commit();
    mediaReject(function()use($byteMedia,$owner,$item,$png){$byteMedia->transaction(function()use($byteMedia,$owner,$item,$png){$byteMedia->insert($owner,mediaFixtureNumberId(2000),$item,$png);});},'64 MiB project byte cap blocks next image below count cap','MEDIA_PROJECT_QUOTA',409);
    mediaReject(function()use($byteMedia,$owner,$otherProject,$item,$png){$byteMedia->transaction(function()use($byteMedia,$owner,$otherProject,$item,$png){$byteMedia->insert($owner,$otherProject,$item,$png);});},'256 MiB owner byte cap blocks next image in empty project','MEDIA_OWNER_QUOTA',409);
    mediaCheck((int)$byteDb->query('SELECT COUNT(*) FROM media_assets')->fetchColumn()===64,'quota refusal does not delete retained assets');
} finally {
    unset($seed,$byteMedia,$byteDb);if(is_string($temp)&&is_file($temp))unlink($temp);
}
echo 'PASS '.$mediaChecks." native MediaStore checks.\n";
echo "NOT COVERED: GD normalization, route/version/reference authorization, HTTP/browser flows or provider integration.\n";
