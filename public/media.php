<?php
ini_set('display_errors','0');umask(0077);require_once dirname(__DIR__).'/app/bootstrap.php';
foreach(securityHeaders() as $name=>$value)header($name.': '.$value);
header('Cross-Origin-Resource-Policy: same-origin');header('Content-Type: application/json; charset=utf-8');
try {
    ensure(PHP_VERSION_ID>=70400&&extension_loaded('pdo_sqlite'),'ENVIRONMENT_REQUIRED','圖片儲存需要 PHP 7.4+ 與 PDO SQLite。',503);
    ensure(is_file(dirname(__DIR__).'/config.local.php'),'INSTALL_REQUIRED','請先開啟 install.php 完成瀏覽器安裝。',503);
    $config=loadConfig();$config['data_dir']=prepareDataDirectory($config);$owner=startAppSession($config);
    $script=isset($_SERVER['SCRIPT_NAME'])?$_SERVER['SCRIPT_NAME']:'';ensure(rtrim(str_replace('\\','/',dirname($script)),'/').'/'===$config['base_path'],'BASE_PATH','網站子目錄與設定不一致。',500);
    ensure(isset($_SERVER['REQUEST_METHOD'])&&$_SERVER['REQUEST_METHOD']==='POST','METHOD_NOT_ALLOWED','圖片操作只接受 POST。',405);
    ensure(isset($_SERVER['HTTP_ORIGIN'])&&$_SERVER['HTTP_ORIGIN']===$config['origin'],'ORIGIN_REJECTED','拒絕跨站圖片操作。',403);
    ensure(isset($_SERVER['HTTP_X_CSRF_TOKEN'])&&hash_equals($_SESSION['csrf'],$_SERVER['HTTP_X_CSRF_TOKEN']),'CSRF_REJECTED','工作階段已失效，請重新整理。',403);
    ensure(!isset($_SERVER['CONTENT_LENGTH'])||ctype_digit((string)$_SERVER['CONTENT_LENGTH'])&&(float)$_SERVER['CONTENT_LENGTH']<=4325376,'BODY_LIMIT','圖片請求超過 4 MiB 圖片加中繼資料的上限。',413);
    $type=isset($_SERVER['CONTENT_TYPE'])?$_SERVER['CONTENT_TYPE']:'';$app=new CocreationApp(new Store($config['data_dir']),$config,$owner);
    if(preg_match('#^multipart/form-data(?:;|$)#i',$type)){
        ensure(isset($_POST['action'])&&$_POST['action']==='upload_image'&&isset($_POST['payload'])&&is_string($_POST['payload'])&&strlen($_POST['payload'])<=32768,'INVALID_INPUT','圖片上傳欄位缺失；請確認 PHP upload_max_filesize 至少為 4M、post_max_size 至少為 5M。');
        try{$input=json_decode($_POST['payload'],true,32,JSON_THROW_ON_ERROR);}catch(Throwable $e){throw new AppError('INVALID_JSON','圖片資料 JSON 格式不正確。');}
        ensure(is_array($input),'INVALID_INPUT','圖片資料必須是物件。');$input['action']='upload_image';
        ensure(isset($_FILES['image'])&&count($_FILES)===1&&is_array($_FILES['image']),'UPLOAD_REQUIRED','請選擇一個本機圖片檔。');$file=$_FILES['image'];
        ensure(isset($file['error'])&&is_int($file['error'])&&$file['error']===UPLOAD_ERR_OK,'UPLOAD_FAILED','圖片上傳未完成或超過 PHP 限制；未新增版本。請檢查 upload_max_filesize 與 post_max_size。',413);
        ensure(isset($file['tmp_name'])&&is_string($file['tmp_name'])&&is_uploaded_file($file['tmp_name']),'UPLOAD_INVALID','無法驗證上傳檔案。');
        $bytes=file_get_contents($file['tmp_name'],false,null,0,4194305);ensure(is_string($bytes)&&strlen($bytes)<=4194304,'PNG_TOO_LARGE','正規化 PNG 不可超過 4 MiB。',413);
        $result=$app->uploadImage($input,$bytes);unset($bytes);if(session_status()===PHP_SESSION_ACTIVE)session_write_close();echo jsonEncode($result);
    }else{
        ensure(preg_match('#^application/json(?:;|$)#i',$type),'CONTENT_TYPE','只接受圖片 multipart 或 JSON 請求。',415);
        $raw=file_get_contents('php://input',false,null,0,65537);ensure(is_string($raw)&&strlen($raw)<=65536,'BODY_LIMIT','圖片讀取請求過大。',413);
        try{$input=json_decode($raw,true,16,JSON_THROW_ON_ERROR);}catch(Throwable $e){throw new AppError('INVALID_JSON','圖片讀取 JSON 格式不正確。');}
        ensure(is_array($input)&&field($input,'action')==='read_image','INVALID_INPUT','圖片讀取請求格式不正確。');$record=$app->readImageVersion($input);
        if(session_status()===PHP_SESSION_ACTIVE)session_write_close();header('Content-Type: image/png');header('Content-Disposition: inline; filename="image.png"');header('Content-Length: '.strlen($record['bytes']));echo $record['bytes'];
    }
} catch(Throwable $e) {
    if(session_status()===PHP_SESSION_ACTIVE)session_write_close();http_response_code($e instanceof AppError?$e->status:500);header('Content-Type: application/json; charset=utf-8');echo jsonEncode(errorResponse($e));
}
