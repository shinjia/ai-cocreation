<?php
ini_set('display_errors','0');umask(0077);
require_once dirname(__DIR__).'/app/installer.php';
foreach(securityHeaders() as $name=>$value){header($name.': '.$value);}header('Content-Type: text/html; charset=utf-8');header('Referrer-Policy: same-origin');
$root=dirname(__DIR__);$target=$root.'/config.local.php';$locked=file_exists($target)||is_link($target);$success=false;$error='';$checks=installChecks();$values=array();$token='';$location=null;
try {
    $location=installLocation($_SERVER);
    if(!$locked) {
        ensure(!in_array(false,$checks,true),'INSTALL_ENVIRONMENT','環境檢查尚未通過。請在 XAMPP 控制台／主機管理介面啟用所列 PHP 擴充套件，重新啟動 Apache 後回到本頁，不需要 CLI。',503);
        ini_set('session.use_strict_mode','1');ini_set('session.use_only_cookies','1');
        session_name('cocreate_install_'.substr(hash('sha256',$location['origin'].$location['base_path']),0,12));
        session_set_cookie_params(array('lifetime'=>0,'path'=>$location['base_path'],'secure'=>$location['secure'],'httponly'=>true,'samesite'=>'Strict'));
        ensure(session_start(),'INSTALL_SESSION','無法建立安裝表單工作階段，請檢查 PHP session 儲存目錄設定。',503);
        if(!isset($_SESSION['csrf'])){$_SESSION['csrf']=randomToken();}$token=$_SESSION['csrf'];
        $doc=isset($_SERVER['DOCUMENT_ROOT'])?$_SERVER['DOCUMENT_ROOT']:'';
        $defaultData=installSuggestedDirectory($doc,$root);
        $values=array('app_url'=>$location['origin'].$location['base_path'],'data_dir'=>$defaultData,'openai_model'=>'gpt-5.4-mini');
        if(isset($_SERVER['REQUEST_METHOD'])&&$_SERVER['REQUEST_METHOD']==='POST') {
            installValidateRequest($_SERVER,$location['origin'],$token,$_POST);
            foreach($values as $key=>$value) {if(isset($_POST[$key])&&is_string($_POST[$key])){$values[$key]=substr($_POST[$key],0,2048);}}
            $config=installInput($_POST,$location);
            $action=isset($_POST['action'])?$_POST['action']:'';
            ensure($action==='install','INSTALL_ACTION','未知的安裝操作。');
            installCommit($config,$doc);$success=true;$locked=true;unset($_SESSION['csrf']);
        }
        session_write_close();
    } elseif(isset($_SERVER['REQUEST_METHOD'])&&$_SERVER['REQUEST_METHOD']==='POST') {http_response_code(409);$error='安裝已鎖定，不接受設定覆寫。原有設定與資料庫未變更。';}
} catch(Throwable $e) {http_response_code($e instanceof AppError?$e->status:500);$error=$e instanceof AppError?$e->getMessage():'安裝未完成。請檢查 PHP／SQLite、磁碟空間與目錄寫入權。已有資料不會被刪除。';if(function_exists('session_status') && session_status()===PHP_SESSION_ACTIVE){session_write_close();}}
?><!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI共創工作室｜瀏覽器安裝</title><link rel="stylesheet" href="./install.css"></head><body><main><p class="eyebrow">AI共創工作室 · PHP 7.4</p><h1>瀏覽器安裝</h1><p>不需要 CLI，也不建立登入帳密。只供 localhost／loopback 本機測試，請勿公開或提供區網存取。安裝不需要 API Key，也不呼叫 OpenAI。</p>
<?php if($error!==''):?><p class="error" role="alert"><?php echo installEscape($error);?></p><?php endif;?>
<?php if($locked):?><section><h2><?php echo $success?'安裝完成':'安裝已鎖定';?></h2><p><?php echo $success?'設定檔與私有 SQLite 資料庫已建立，安裝頁現在不可再修改設定。':'偵測到 config.local.php，本頁不讀出設定內容，也不覆寫任何設定或資料庫。';?></p><p>這是防止重複安裝，不是登入或角色權限。若是更新版本，先停止網站寫入、備份程式與完整私有資料，再更新程式並保留既有設定。不要為了升級刪除設定檔或資料庫。</p><p>若原設定損壞，請由管理者使用檔案總管／主機檔案管理器修正，不提供 HTTP 重設功能。</p><p>安裝只建立本機設定與資料庫，不連線 OpenAI。回到「AI 系統設定」後，可選 OpenAI 或 Ollama。OpenAI 金鑰可使用 30 分鐘，到期後下一次請求才清理實體檔案；不用時可立即清除。連線檢查只讀模型資訊，不推論；正式對話或生成才可能產生費用。</p><a class="button" href="./">開啟 AI共創工作室</a></section>
<?php else:?><section><h2>1. 檢查環境</h2><ul><?php foreach($checks as $label=>$ok):?><li><?php echo $ok?'✓':'✕';?> <?php echo installEscape($label);?></li><?php endforeach;?></ul><p>若 PHP 版本過舊或擴充套件缺少，請在 XAMPP 控制台或主機管理介面調整，重啟 Apache 後重新整理。</p></section>
<?php if($token!=='' && $location!==null):?><form method="post" action="./install.php"><input type="hidden" name="csrf" value="<?php echo installEscape($token);?>"><section><h2>2. 網址與私有資料</h2><label>網站網址（自動偵測，請確認）<input name="app_url" maxlength="2048" required value="<?php echo installEscape($values['app_url']);?>"></label><p>末尾保留 /。若需要不同網域或埠號，請先透過該網址開啟本安裝頁。</p><label>私有資料夾絕對路徑<input name="data_dir" maxlength="1024" required value="<?php echo installEscape($values['data_dir']);?>"></label><p>Windows 建議 C:/private/ai-cocreation-series-data。不可在 C:/xampp/htdocs 或本專案內。會嘗試建立資料夾；若無權限，請用檔案總管建立並僅開放 Apache/PHP 寫入後重試。既有練習資料不會清空。</p></section><section><h2>3. OpenAI 模型</h2><label>模型名稱<input name="openai_model" maxlength="120" required value="<?php echo installEscape($values['openai_model']);?>" autocomplete="off" spellcheck="false"></label><p>預設 gpt-5.4-mini。這裡只儲存模型名稱，不查詢清單、不下載模型、不需要金鑰，也不呼叫 API；沒有網際網路仍可完成安裝。模型需支援 Responses API 與結構化輸出，帳戶可用性要在安裝後自行確認。</p><p>安裝完成後到「AI 系統設定」選擇 OpenAI 或 Ollama。若使用 OpenAI，可自行貼入既有 API Key；金鑰僅在私有目錄保存，可用 30 分鐘，不寫入設定檔，到期實體清理發生於後續請求，也可手動清除。連線檢查只讀模型資訊，不推論。每次對話、整理、生成與比較都會再次確認；OpenAI API 費用另計，不包含在 ChatGPT 訂閱內。</p></section><button type="submit" name="action" value="install">完成安裝並建立資料庫</button><p>只在尚無設定檔時建立 config.local.php；完成後安裝自動鎖定。建議安裝完成後收回 Apache 對程式根目錄的寫入權，保留私有資料夾的寫入權。</p></form><?php endif;?><?php endif;?></main></body></html>
