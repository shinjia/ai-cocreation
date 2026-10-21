<?php
function startAppSession($config) {
    requireKeyContext($config,$_SERVER);
    ensure(isset($_SERVER['HTTP_HOST'])&&strtolower($_SERVER['HTTP_HOST'])===strtolower($config['host']),'HOST_REJECTED','網站 Host 與安裝設定不一致。',403);
    if(isset($_SERVER['HTTP_SEC_FETCH_SITE']))ensure(in_array($_SERVER['HTTP_SEC_FETCH_SITE'],array('same-origin','none'),true),'CROSS_SITE_REJECTED','拒絕跨站開啟本機資料。',403);
    $dir=$config['data_dir'].'/sessions';ensure(!is_link($dir),'SESSION_PATH','工作階段路徑不安全。',503);if(!is_dir($dir))ensure(@mkdir($dir,0700),'SESSION_PATH','無法建立私有工作階段目錄。',503);
    if(DIRECTORY_SEPARATOR!=='\\'){ensure(@chmod($dir,0700),'SESSION_PATH','無法限制工作階段目錄權限。',503);}
    session_save_path($dir);ini_set('session.use_strict_mode','1');ini_set('session.use_only_cookies','1');ini_set('session.gc_maxlifetime','2592000');session_name($config['cookie_name']);
    session_set_cookie_params(array('lifetime'=>2592000,'path'=>$config['base_path'],'secure'=>$config['secure'],'httponly'=>true,'samesite'=>'Strict'));
    ensure(session_start(),'SESSION_UNAVAILABLE','無法建立工作階段。',503);if(!isset($_SESSION['owner'])){session_regenerate_id(true);$_SESSION['owner']=randomToken();$_SESSION['csrf']=randomToken();}
    return $_SESSION['owner'];
}
