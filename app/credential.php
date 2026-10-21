<?php
// Temporary per-browser credentials. Never included in SQLite, config or exports.
function keyEntryAllowed($config,$server)
{
    $host=parse_url($config['origin'],PHP_URL_HOST);
    $ip=isset($server['REMOTE_ADDR'])?$server['REMOTE_ADDR']:'';
    foreach(array('HTTP_FORWARDED','HTTP_X_FORWARDED_FOR','HTTP_X_FORWARDED_HOST','HTTP_X_FORWARDED_PROTO','HTTP_X_REAL_IP') as $header){if(isset($server[$header]))return false;}
    return in_array($host,array('localhost','127.0.0.1','[::1]','::1'),true)
        && in_array($ip,array('127.0.0.1','::1','::ffff:127.0.0.1'),true);
}
function requireKeyContext($config,$server)
{
    ensure(keyEntryAllowed($config,$server),'KEY_LOCAL_ONLY','此測試版只允許在 PHP 主機本機以 localhost／127.0.0.1 開啟並使用 API Key；不接受遠端或代理來源。',403);
}
function validateApiKey($key)
{
    ensure(is_string($key)&&strlen($key)>=20&&strlen($key)<=512&&preg_match('/^sk-[a-zA-Z0-9_-]+$/D',$key),'INVALID_API_KEY','請輸入有效格式的 OpenAI API Key；不要加入空白或換行。');
    return $key;
}
class SessionKeyVault
{
    private $directory;
    private function restrict($path,$directory=false)
    {
        // POSIX permissions can be checked. Windows requires the private directory ACL
        // to be restricted to the Apache/PHP account by the local installer/operator.
        $mode=$directory?0700:0600;
        if(DIRECTORY_SEPARATOR!=='\\'){
            ensure(@chmod($path,$mode),'KEY_STORAGE','無法限制私有金鑰檔案權限；未繼續使用金鑰。',503);
            clearstatcache(true,$path);$actual=@fileperms($path);
            ensure($actual!==false&&($actual&0077)===0,'KEY_STORAGE','私有金鑰工作階段權限過寬，請由管理者修正。',503);
        } else {@chmod($path,$mode);}
    }
    public function __construct($privateDirectory)
    {
        $parent=realpath($privateDirectory);
        ensure($parent!==false,'KEY_STORAGE','私有工作階段目錄無法使用。',503);
        $parent=str_replace('\\','/',$parent);$path=$parent.'/openai-session-keys';
        ensure(!is_link($path),'KEY_STORAGE','私有金鑰工作階段路徑不安全。',503);
        if(!is_dir($path)){ensure(@mkdir($path,0700),'KEY_STORAGE','無法建立私有金鑰工作階段，請檢查 PHP 寫入權。',503);}
        ensure(str_replace('\\','/',realpath($path))===$path&&is_writable($path),'KEY_STORAGE','私有金鑰工作階段不可寫入。',503);
        $this->directory=$path;
        $this->restrict($path,true);
    }
    private function path($id)
    {
        ensure(is_string($id)&&preg_match('/^[a-f0-9]{64}$/D',$id),'KEY_SESSION','工作階段格式不正確。',403);
        return $this->directory.'/'.$id.'.json';
    }
    private function locked($work)
    {
        $lock=$this->directory.'/.lock';ensure(!is_link($lock),'KEY_STORAGE','金鑰鎖路徑不安全。',503);
        $handle=@fopen($lock,'c');ensure($handle!==false,'KEY_STORAGE','無法鎖定私有金鑰工作階段。',503);
        try {
            $this->restrict($lock);
            ensure(flock($handle,LOCK_EX),'KEY_STORAGE','無法鎖定私有金鑰工作階段。',503);
            // Expiry is enforced on every read; physical removal also happens on later requests.
            foreach(glob($this->directory.'/*.json') as $file){
                if(!is_link($file)&&preg_match('/^[a-f0-9]{64}\.json$/D',basename($file))&&is_file($file)&&filemtime($file)<=time()-1800){@unlink($file);}
            }
            return $work();
        } finally {flock($handle,LOCK_UN);fclose($handle);}
    }
    private function record($id)
    {
        $path=$this->path($id);ensure(!is_link($path),'KEY_STORAGE','金鑰工作階段路徑不安全。',503);
        if(!is_file($path))return null;
        $this->restrict($path);
        $raw=@file_get_contents($path,false,null,0,2049);
        $data=is_string($raw)&&strlen($raw)<=2048?json_decode($raw,true):null;
        if(!is_array($data)||!isset($data['key'],$data['expires'],$data['revision'])||!is_int($data['expires'])||$data['expires']<=time()||!is_string($data['revision'])||!preg_match('/^[a-f0-9]{64}$/D',$data['revision'])){
            @unlink($path);return null;
        }
        return $data;
    }
    public function status($id)
    {
        return $this->locked(function()use($id){$data=$this->record($id);return array('keyPresent'=>$data!==null,'keyExpiresAt'=>$data===null?null:$data['expires'],'keyRevision'=>$data===null?null:$data['revision']);});
    }
    public function get($id)
    {
        return $this->locked(function()use($id){$data=$this->record($id);ensure($data!==null,'API_KEY_REQUIRED','請在API 設定貼入本次測試的 API Key；金鑰可能已清除或超過 30 分鐘。',409);return validateApiKey($data['key']);});
    }
    public function put($id,$key)
    {
        validateApiKey($key);
        return $this->locked(function()use($id,$key){
            $path=$this->path($id);ensure(!is_link($path),'KEY_STORAGE','金鑰工作階段路徑不安全。',503);
            $expires=time()+1800;$revision=randomToken();$raw=jsonEncode(array('key'=>$key,'expires'=>$expires,'revision'=>$revision));
            $handle=@fopen($path,'c+b');ensure($handle!==false,'KEY_STORAGE','無法暫存本次金鑰。',503);
            $complete=false;
            try {$this->restrict($path);ensure(ftruncate($handle,0),'KEY_STORAGE','無法重設金鑰工作階段。',503);$complete=fwrite($handle,$raw)===strlen($raw)&&fflush($handle);}
            finally {fclose($handle);if(!$complete)@unlink($path);}
            ensure($complete,'KEY_STORAGE','金鑰未完整暫存，請重新輸入。',503);
            return array('keyPresent'=>true,'keyExpiresAt'=>$expires,'keyRevision'=>$revision);
        });
    }
    public function clear($id)
    {
        return $this->locked(function()use($id){$path=$this->path($id);ensure(!is_link($path),'KEY_STORAGE','金鑰工作階段路徑不安全。',503);if(file_exists($path))ensure(@unlink($path),'KEY_STORAGE','無法清除私有金鑰工作階段。',503);return array('keyPresent'=>false,'keyExpiresAt'=>null,'keyRevision'=>null);});
    }
}
