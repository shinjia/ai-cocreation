<?php
ini_set('display_errors','0');umask(0077);require_once dirname(__DIR__).'/app/bootstrap.php';
foreach(securityHeaders() as $name=>$value)header($name.': '.$value);header('Content-Type: application/json; charset=utf-8');
try {
    ensure(PHP_VERSION_ID>=70400&&extension_loaded('pdo_sqlite')&&extension_loaded('curl'),'ENVIRONMENT_REQUIRED','請啟用 PHP 7.4+、PDO SQLite 及 cURL。',503);
    ensure(is_file(dirname(__DIR__).'/config.local.php'),'INSTALL_REQUIRED','請先開啟 install.php 完成瀏覽器安裝。',503);
    $config=loadConfig();$config['data_dir']=prepareDataDirectory($config);$owner=startAppSession($config);$store=new Store($config['data_dir']);$app=new CocreationApp($store,$config,$owner);
    $script=isset($_SERVER['SCRIPT_NAME'])?$_SERVER['SCRIPT_NAME']:'';ensure(rtrim(str_replace('\\','/',dirname($script)),'/').'/'===$config['base_path'],'BASE_PATH','網站子目錄與設定不一致。',500);
    $method=isset($_SERVER['REQUEST_METHOD'])?$_SERVER['REQUEST_METHOD']:'GET';
    if($method==='GET'){
        $action=isset($_GET['action'])?$_GET['action']:'state';
        if($action==='state')$result=$app->state();
        elseif($action==='project')$result=array('project'=>$app->project(isset($_GET['id'])?$_GET['id']:null));
        else throw new AppError('UNKNOWN_ACTION','未知操作。',404);
    } else {
        ensure($method==='POST','METHOD_NOT_ALLOWED','只支援 GET 或 POST。',405);
        ensure(isset($_SERVER['HTTP_ORIGIN'])&&$_SERVER['HTTP_ORIGIN']===$config['origin'],'ORIGIN_REJECTED','拒絕跨站操作。請從原本本機網址開啟。',403);
        ensure(isset($_SERVER['HTTP_X_CSRF_TOKEN'])&&hash_equals($_SESSION['csrf'],$_SERVER['HTTP_X_CSRF_TOKEN']),'CSRF_REJECTED','工作階段已失效，請重新整理。',403);
        ensure(isset($_SERVER['CONTENT_TYPE'])&&preg_match('#^application/json(?:;|$)#i',$_SERVER['CONTENT_TYPE']),'CONTENT_TYPE','只接受 JSON 請求。',415);
        $raw=file_get_contents('php://input',false,null,0,32769);ensure(is_string($raw)&&strlen($raw)<=32768,'BODY_LIMIT','請求過大。',413);
        try{$input=json_decode($raw,true,32,JSON_THROW_ON_ERROR);}catch(Throwable $e){throw new AppError('INVALID_JSON','JSON 格式不正確。');}
        ensure(is_array($input)&&isset($input['action'])&&is_string($input['action']),'INVALID_INPUT','請求格式不正確。');
        @set_time_limit((int)ceil($config['model_timeout_ms']/1000)+20);$result=$app->action($input);
    }
    if(session_status()===PHP_SESSION_ACTIVE)session_write_close();echo jsonEncode($result);
} catch(Throwable $e) {
    if(session_status()===PHP_SESSION_ACTIVE)session_write_close();http_response_code($e instanceof AppError?$e->status:500);echo jsonEncode(errorResponse($e));
}
