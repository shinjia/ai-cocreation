<?php
// Browser-only installation helpers. No credentials, accounts or role permissions.
require_once __DIR__.'/bootstrap.php';
function installEscape($value) { return htmlspecialchars((string)$value,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8'); }
function installLocation($server)
{
    $host=isset($server['HTTP_HOST'])?$server['HTTP_HOST']:'';
    ensure(is_string($host) && preg_match('/^(?:[a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\])(?::[0-9]{1,5})?$/D',$host),'INSTALL_HOST','目前網站 Host 格式不正確。',400);
    $secure=isset($server['HTTPS']) && $server['HTTPS']!=='' && strtolower($server['HTTPS'])!=='off';
    $script=isset($server['SCRIPT_NAME'])?$server['SCRIPT_NAME']:'';
    $path=rtrim(str_replace('\\','/',dirname($script)),'/').'/';
    $base=array('app_url'=>($secure?'https':'http').'://'.$host.$path,'data_dir'=>'','openai_model'=>'gpt-5.4-mini','model_timeout_ms'=>120000);
    $config=validateConfig($base);requireKeyContext($config,$server);return $config;
}
function installSuggestedDirectory($documentRoot,$projectRoot)
{
    if(DIRECTORY_SEPARATOR==='\\'){return 'C:/private/ai-cocreation-series-data';}
    $doc=realpath($documentRoot);$project=realpath($projectRoot);
    if($doc===false||$project===false){return '';}
    foreach(array(dirname($doc),dirname($project)) as $parent){$candidate=rtrim($parent,'/').'/ai-cocreation-series-private-data';if(!isWithin($candidate,$doc)&&!isWithin($candidate,$project)){return $candidate;}}
    return ''; // A document root covering the entire filesystem has no safe suggestion.
}
function installChecks()
{
    $checks=array('PHP 7.4 以上'=>PHP_VERSION_ID>=70400,'JSON'=>extension_loaded('json'),'PDO SQLite'=>extension_loaded('pdo_sqlite'),'cURL（OpenAI HTTPS 連線）'=>extension_loaded('curl'),'工作階段與隨機權杖'=>function_exists('session_start')&&function_exists('random_bytes')&&function_exists('hash_equals'),'檔案鎖'=>function_exists('flock'));
    $sqlite=false;
    if(extension_loaded('pdo_sqlite')) { try {$db=new PDO('sqlite::memory:');$sqlite=version_compare($db->query('SELECT sqlite_version()')->fetchColumn(),'3.24.0','>=');}catch(Throwable $e){} }
    $checks['SQLite 3.24.0 以上']=$sqlite; return $checks;
}
function installValidateRequest($server,$expectedOrigin,$expectedToken,$post)
{
    ensure(isset($server['REQUEST_METHOD']) && $server['REQUEST_METHOD']==='POST','INSTALL_METHOD','請由安裝頁送出表單。',405);
    ensure(isset($server['CONTENT_TYPE']) && preg_match('#^application/x-www-form-urlencoded(?:;|$)#i',$server['CONTENT_TYPE']),'INSTALL_CONTENT_TYPE','安裝頁只接受一般表單。',415);
    ensure(isset($server['CONTENT_LENGTH']) && (int)$server['CONTENT_LENGTH']>0 && (int)$server['CONTENT_LENGTH']<=16384,'INSTALL_BODY','安裝表單過大或內容不完整。',413);
    ensure(isset($server['HTTP_ORIGIN']) && $server['HTTP_ORIGIN']===$expectedOrigin,'ORIGIN_REJECTED','拒絕跨站安裝操作。請回到目前網址重新開啟安裝頁。',403);
    ensure(isset($post['csrf']) && is_string($post['csrf']) && is_string($expectedToken) && strlen($expectedToken)===64 && hash_equals($expectedToken,$post['csrf']),'CSRF_REJECTED','安裝表單已失效。請重新整理後再試。',403);
}
function installInput($post,$location)
{
    foreach(array('app_url','data_dir','openai_model') as $key) {ensure(isset($post[$key]) && is_string($post[$key]) && strlen($post[$key])<=2048,'INSTALL_INPUT','安裝欄位格式不正確。');}
    $config=validateConfig(array('app_url'=>trim($post['app_url']),'data_dir'=>trim($post['data_dir']),'openai_model'=>trim($post['openai_model']),'model_timeout_ms'=>120000));
    ensure($config['origin']===$location['origin'] && $config['base_path']===$location['base_path'],'INSTALL_URL','網站網址需與目前開啟的安裝頁所在網址相同。若要換網址，請先使用新網址開啟本安裝頁。');
    return $config;
}
function installPrivateDirectory($data,$documentRoot,$projectRoot,$create=false,$additionalRoots=array())
{
    ensure(is_string($data) && strlen($data)<=1024 && strpos($data,"\0")===false && (substr($data,0,1)==='/'||preg_match('/^[a-zA-Z]:[\\\\\/]/',$data)),'INVALID_DATA_DIR','請輸入私有資料夾的絕對路徑，例如 C:/private/ai-cocreation-series-data。');
    $normalized=str_replace('\\','/',$data);
    ensure(!preg_match('#(?:^|/)(?:\.|\.\.)(?:/|$)#',$normalized),'INVALID_DATA_DIR','資料路徑不可使用 . 或 ..。');
    ensure(!file_exists($data)||is_dir($data),'INVALID_DATA_DIR','資料路徑已存在但不是資料夾。');
    $probe=$data;$missing=array();
    while(!is_dir($probe)) { $parent=dirname($probe);ensure($parent!==$probe,'INVALID_DATA_DIR','找不到可用的上層資料夾。');array_unshift($missing,basename($probe));$probe=$parent; }
    $ancestor=realpath($probe);$doc=realpath($documentRoot);$project=realpath($projectRoot);
    ensure($ancestor!==false && $doc!==false && $project!==false,'INVALID_DATA_DIR','無法確認網站或資料夾真實路徑，請由主機管理者檢查。');
    $candidate=rtrim($ancestor,'/\\').(count($missing)?DIRECTORY_SEPARATOR.implode(DIRECTORY_SEPARATOR,$missing):'');
    ensure(!isWithin($candidate,$doc)&&!isWithin($candidate,$project),'UNSAFE_DATA_DIR','資料庫不可放在網站公開根目錄或專案內。XAMPP 請使用 C:/private/ai-cocreation-series-data，不要使用 htdocs。');
    foreach($additionalRoots as $extra){$resolved=realpath($extra);ensure($resolved!==false&&!isWithin($candidate,$resolved),'UNSAFE_DATA_DIR','私有資料不可放在目前 Apache Alias 的公開根目錄內。');}
    ensure(is_writable($probe),'DATA_DIR_UNWRITABLE','PHP 無法寫入資料夾或其上層。請用檔案總管或主機檔案管理器建立私有資料夾，僅授予 Apache/PHP 執行帳號寫入權，再回此頁重試。');
    if($create && !is_dir($data)) {ensure(@mkdir($data,0700,true),'DATA_DIR_UNWRITABLE','無法建立私有資料夾。請用檔案總管或主機檔案管理器建立，再回此頁重試。');}
    if($create) { $candidate=realpath($data);ensure($candidate!==false&&!isWithin($candidate,$doc)&&!isWithin($candidate,$project),'UNSAFE_DATA_DIR','資料夾真實位置不安全。'); }
    foreach($additionalRoots as $extra){$resolved=realpath($extra);ensure($resolved!==false&&!isWithin($candidate,$resolved),'UNSAFE_DATA_DIR','私有資料真實位置不可位於 Apache Alias 公開根目錄內。');}
    return $candidate;
}
function installCommit($config,$documentRoot)
{
    $root=dirname(__DIR__);$target=$root.'/config.local.php';$lockPath=$root.'/.install.lock';
    ensure(!file_exists($target)&&!is_link($target),'INSTALL_LOCKED','已存在設定檔，安裝已鎖定，不會覆寫原設定或資料庫。',409);
    ensure(is_writable($root),'INSTALL_NOT_WRITABLE','PHP 無法建立設定檔。請用檔案總管或主機檔案管理器，暫時讓 Apache/PHP 執行帳號可寫入專案根目錄，完成後再收回寫入權。',503);
    ensure(!is_link($lockPath),'INSTALL_LOCK','安裝鎖路徑不安全，請管理者檢查。',503);
    $lock=@fopen($lockPath,'c');ensure($lock!==false,'INSTALL_LOCK','無法建立安裝鎖，請檢查專案根目錄寫入權。',503);
    try {
        ensure(flock($lock,LOCK_EX|LOCK_NB),'INSTALL_BUSY','另一個安裝請求正在處理，請稍後重整確認，不要重複送出。',409);
        clearstatcache(true,$target);ensure(!file_exists($target)&&!is_link($target),'INSTALL_LOCKED','設定已建立，安裝已鎖定。',409);
        $extraRoots=isset($_SERVER['CONTEXT_DOCUMENT_ROOT'])&&$_SERVER['CONTEXT_DOCUMENT_ROOT']!==''?array($_SERVER['CONTEXT_DOCUMENT_ROOT']):array();
        $directory=installPrivateDirectory($config['data_dir'],$documentRoot,$root,true,$extraRoots);
        foreach(array('cocreation.sqlite','cocreation.sqlite-wal','cocreation.sqlite-shm','cocreation.sqlite-journal') as $name) { $file=$directory.DIRECTORY_SEPARATOR.$name;ensure(!is_link($file)&&(!file_exists($file)||(is_file($file)&&dirname(realpath($file))===$directory)),'INSTALL_DB_PATH','資料庫或附屬檔案路徑不安全，請管理者檢查。',503); }
        $store=new Store($directory);$store->db->query('SELECT COUNT(*) FROM projects')->fetchColumn();
        // Existing data and saved model settings are not reset or overwritten.
        $values=array_intersect_key($config,array_flip(array('app_url','data_dir','openai_model','model_timeout_ms')));$values['data_dir']=$directory;
        $source="<?php\n// Created by the one-time HTTP installer.\nreturn ".var_export($values,true).";\n";
        $handle=@fopen($target,'x');ensure($handle!==false,'INSTALL_LOCKED','設定檔已存在或無法建立；不會覆寫。請重新整理確認。',409);
        $complete=false;
        try { $written=fwrite($handle,$source);$complete=$written===strlen($source)&&fflush($handle); } finally {fclose($handle);if(!$complete){@unlink($target);}}
        ensure($complete,'INSTALL_WRITE_FAILED','設定未完整寫入，未完成安裝。已保留私有資料庫，修正磁碟或檔案權限後可再試。',503);
        @chmod($target,0600);return $directory;
    } finally {flock($lock,LOCK_UN);fclose($lock);}
}
