<?php
// This file contains no credentials. Optional config.local.php must return an array.
function loadConfig()
{
    $root = dirname(__DIR__);
    $config = array(
        'app_url' => 'http://127.0.0.1:8787/',
        'data_dir' => dirname($root) . '/ai-cocreation-series-private-data',
        'openai_model' => 'gpt-5.4-mini',
        'model_timeout_ms' => 120000
    );
    $local = $root . '/config.local.php';
    if (is_file($local)) {
        $values = require $local;
        ensure(is_array($values), 'INVALID_CONFIG', 'config.local.php 必須回傳設定陣列。', 500);
        $config = array_merge($config, array_intersect_key($values, $config));
    }
    return validateConfig($config);
}
function validateConfig($config)
{
    $url = parse_url($config['app_url']);
    if (is_array($url)) {
        if (isset($url['scheme'])) { $url['scheme'] = strtolower($url['scheme']); }
        if (isset($url['host'])) { $url['host'] = strtolower($url['host']); }
        if (isset($url['port'], $url['scheme']) && (($url['scheme'] === 'https' && $url['port'] === 443) || ($url['scheme'] === 'http' && $url['port'] === 80))) { unset($url['port']); }
    }
    ensure(is_array($url) && isset($url['scheme'], $url['host']) && in_array($url['scheme'], array('http','https'),true) && !isset($url['user']) && !isset($url['pass']) && !isset($url['query']) && !isset($url['fragment']), 'INVALID_CONFIG', 'APP_URL 必須是完整網站網址，可含子目錄，不能含帳密或查詢參數。', 500);
    $path = isset($url['path']) ? $url['path'] : '/';
    ensure(preg_match('#^/(?:[a-zA-Z0-9_-]+/)*$#D', $path), 'INVALID_CONFIG', 'APP_URL 路徑需以 / 結尾，目錄名稱請使用英數字、底線或連字號。', 500);
    $localHost = in_array($url['host'], array('127.0.0.1','localhost','[::1]'),true);
    ensure($localHost, 'LOCAL_ONLY', '此套件只允許 localhost、127.0.0.1 或 [::1] 本機測試，不提供公開部署。', 500);
    $config['origin'] = $url['scheme'].'://'.$url['host'].(isset($url['port']) ? ':'.$url['port'] : '');
    $config['host'] = $url['host'].(isset($url['port']) ? ':'.$url['port'] : '');
    $config['base_path'] = $path;
    $config['secure'] = $url['scheme'] === 'https';
    $config['cookie_name'] = 'cocreate_sid_' . substr(hash('sha256', $config['origin'].$path),0,12);
    modelName($config['openai_model']);
    ensure(filter_var($config['model_timeout_ms'], FILTER_VALIDATE_INT) !== false && $config['model_timeout_ms'] >= 1000 && $config['model_timeout_ms'] <= 180000, 'INVALID_CONFIG', 'MODEL_TIMEOUT_MS 必須是 1000–180000。', 500);
    $config['model_timeout_ms'] = (int)$config['model_timeout_ms'];
    return $config;
}
function isWithin($path, $parent)
{
    $path = str_replace('\\','/', $path); $parent = rtrim(str_replace('\\','/', $parent),'/');
    if (DIRECTORY_SEPARATOR === '\\') { $path = strtolower($path); $parent = strtolower($parent); }
    return $path === $parent || strpos($path, $parent.'/') === 0;
}
function prepareDataDirectory($config, $documentRoot = null)
{
    $data = $config['data_dir'];
    ensure(is_string($data) && (substr($data,0,1) === '/' || preg_match('/^[a-zA-Z]:[\\\\\/]/', $data)), 'INVALID_DATA_DIR', 'DATA_DIR 請使用絕對路徑，放在網站根目錄之外。', 500);
    // Require parent to exist so containment can be checked before creating anything.
    $parent = realpath(dirname($data));
    ensure($parent !== false, 'INVALID_DATA_DIR', 'DATA_DIR 的上層目錄不存在。請由管理者建立並設定權限。', 500);
    $candidate = is_dir($data) ? realpath($data) : $parent . DIRECTORY_SEPARATOR . basename($data);
    $doc = $documentRoot !== null ? $documentRoot : (isset($_SERVER['DOCUMENT_ROOT']) && $_SERVER['DOCUMENT_ROOT'] !== '' ? $_SERVER['DOCUMENT_ROOT'] : dirname(__DIR__).'/public');
    $doc = realpath($doc);
    ensure($doc !== false && !isWithin($candidate,$doc) && !isWithin($candidate,dirname(__DIR__)), 'UNSAFE_DATA_DIR', 'DATA_DIR 必須位於網站 DocumentRoot 與專案目錄之外，不能讓資料庫透過網址存取。', 500);
    if(isset($_SERVER['CONTEXT_DOCUMENT_ROOT'])&&$_SERVER['CONTEXT_DOCUMENT_ROOT']!=='') { $alias=realpath($_SERVER['CONTEXT_DOCUMENT_ROOT']);ensure($alias!==false&&!isWithin($candidate,$alias),'UNSAFE_DATA_DIR','私有資料不可位於 Apache Alias 公開目錄內。',500); }
    if (!is_dir($data)) { ensure(@mkdir($data,0700), 'DATA_DIR_UNWRITABLE', '無法建立私有資料目錄，請檢查主機權限。', 500); }
    ensure(is_writable($data), 'DATA_DIR_UNWRITABLE', '私有資料目錄無法寫入，請檢查主機權限。', 500);
    return realpath($data);
}
