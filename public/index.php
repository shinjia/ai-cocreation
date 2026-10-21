<?php
ini_set('display_errors','0');umask(0077);require_once dirname(__DIR__).'/app/bootstrap.php';
foreach(securityHeaders() as $name=>$value)header($name.': '.$value);header('Content-Type: text/html; charset=utf-8');
try {
    if(!is_file(dirname(__DIR__).'/config.local.php')){header('Location: ./install.php',true,303);exit;}
    $config=loadConfig();$config['data_dir']=prepareDataDirectory($config);startAppSession($config);session_write_close();readfile(dirname(__DIR__).'/app/view.html');
} catch(Throwable $e){http_response_code($e instanceof AppError?$e->status:500);echo '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>暫時無法開啟</title><body><h1>暫時無法開啟共創室</h1><p>'.htmlspecialchars($e instanceof AppError?$e->getMessage():'請檢查 PHP、私有資料夾及安裝設定。',ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8').'</p><p><a href="./install.php">檢查安裝</a></p></body></html>';}
