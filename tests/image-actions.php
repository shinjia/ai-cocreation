<?php
// Developer-only PHP 7.4/PDO/zlib fixture. UNEXECUTED here: PHP unavailable.
// Synthetic in-memory PNG and temporary SQLite only; never a provider call.
require_once dirname(__DIR__).'/app/bootstrap.php';
$checks=0;function imageCheck($ok,$label){global $checks;if(!$ok)throw new Exception('FAIL '.$label);$checks++;echo "PASS $label\n";}
function imageReject($fn,$code){try{$fn();throw new Exception('Expected '.$code);}catch(AppError $e){imageCheck($e->errorCode===$code,$code);}}
function imageInput($p,$action,$extra=array()){return array_merge(array('action'=>$action,'id'=>$p['id'],'itemId'=>$p['activeItemId'],'revision'=>$p['revision']),$extra);}
function imageClean($dir){foreach(scandir($dir) as $name)if($name!=='.'&&$name!=='..'){$p=$dir.'/'.$name;is_dir($p)?imageClean($p):unlink($p);}rmdir($dir);}
$dir=sys_get_temp_dir().'/cocreation-image-actions-'.bin2hex(random_bytes(6));mkdir($dir,0700,true);
try{
 $config=validateConfig(array('app_url'=>'http://localhost/studio/public/','data_dir'=>$dir,'openai_model'=>'fixture','model_timeout_ms'=>120000));
 $store=new Store($dir);$owner=str_repeat('a',64);$app=new CocreationApp($store,$config,$owner);
 $p=$app->action(array('action'=>'new','title'=>'圖片測試專案','description'=>'原專案名稱不得改寫'))['project'];
 $p=$app->action(imageInput($p,'create_item',array('type'=>'image','title'=>'圖片創作','description'=>'')))['project'];
 $png=hex2bin('89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c49444154789c63f8cfc0000003010100c9fe92ef0000000049454e44ae426082');
 $request=imageInput($p,'upload_image',array('requestId'=>newId(),'title'=>'外部作品','alt'=>'紅色測試像素','attribution'=>'自製測試資料','goalAndRationale'=>'測試紅色視覺','versionMode'=>'major','basedOnVersionId'=>null));
 $uploaded=$app->uploadImage($request,$png);$p=$uploaded['project'];$v=$p['versions'][0];
 imageCheck($v['source']==='external_upload'&&$v['provenance']===null&&$v['major']===1&&$v['minor']===0,'external origin no model provenance V1');
 imageCheck($p['title']==='圖片測試專案'&&$p['officialVersionId']===null,'upload does not rename project or adopt official');
 imageCheck(strpos(jsonEncode($p),base64_encode($png))===false&&strpos(jsonEncode($p),$png)===false,'project contains no image bytes');
 $read=$app->readImageVersion(array('id'=>$p['id'],'itemId'=>$p['activeItemId'],'versionId'=>$v['id']));imageCheck(hash('sha256',$read['bytes'])===$v['artifact']['asset']['sha256'],'private read exact saved canonical bytes');
 $replayed=$app->uploadImage($request,$png);imageCheck($replayed['replayed']===true&&$replayed['uploadedVersionId']===$v['id']&&count($replayed['project']['versions'])===1,'exact retry with stale original revision reuses version');
 imageCheck((int)$store->db->query('SELECT count(*) FROM media_assets')->fetchColumn()===1,'retry inserts no second asset');
 $conflict=$request;$conflict['title']='另一個名稱';imageReject(function()use($app,$conflict,$png){$app->uploadImage($conflict,$png);},'REQUEST_ID_CONFLICT');
 $other=new CocreationApp($store,$config,str_repeat('b',64));imageReject(function()use($other,$p,$v){$other->readImageVersion(array('id'=>$p['id'],'itemId'=>$p['activeItemId'],'versionId'=>$v['id']));},'PROJECT_NOT_FOUND');
 $p=$app->action(imageInput($p,'promote',array('versionId'=>$v['id'])))['project'];
 $artifact=$v['artifact'];$artifact['alt']='新的文字說明';$p=$app->action(imageInput($p,'snapshot',array('artifact'=>$artifact,'basedOnVersionId'=>$v['id'],'versionMode'=>'minor','goalAndRationale'=>'保留像素，只修正替代文字')))['project'];
 $v2=$p['versions'][1];imageCheck($v2['major']===1&&$v2['minor']===1&&$v2['basedOnVersionId']===$v['id'],'metadata revision retains lineage V1.1');
 imageCheck($p['versions'][0]===$v&&$v2['artifact']['asset']===$v['artifact']['asset'],'prior snapshot and exact bytes preserved');
 $forged=$artifact;$forged['asset']['sha256']=str_repeat('0',64);imageReject(function()use($app,$p,$forged,$v){$app->action(imageInput($p,'snapshot',array('artifact'=>$forged,'basedOnVersionId'=>$v['id'],'goalAndRationale'=>'不應保存')));},'MEDIA_DESCRIPTOR_MISMATCH');
 $p=$app->action(imageInput($p,'archive_version',array('versionId'=>$v2['id'])))['project'];$archived=$app->readImageVersion(array('id'=>$p['id'],'itemId'=>$p['activeItemId'],'versionId'=>$v2['id']));imageCheck($archived['bytes']===$read['bytes'],'archive retains readable bytes');
 $wrong=$request;$wrong['requestId']=newId();imageReject(function()use($app,$wrong,$png){$app->uploadImage($wrong,$png);},'STALE_REVISION');
 imageCheck((int)$store->db->query('SELECT count(*) FROM media_assets')->fetchColumn()===1,'stale upload leaves no orphan asset');
 imageCheck((int)$store->db->query('SELECT count(*) FROM requests')->fetchColumn()===0,'all upload/read/adopt/snapshot/archive paths avoid paid journal');
 echo "PASS $checks image action fixtures\n";
}finally{imageClean($dir);}
