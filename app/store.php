<?php
class Store {
    public $db;
    public function __construct($directory) {
        $path=$directory.'/cocreation.sqlite';ensure(!is_link($path),'DATA_PATH','資料庫不可為連結。',503);
        foreach(array('-wal','-shm','-journal') as $suffix)ensure(!is_link($path.$suffix),'DATA_PATH','資料庫附屬檔不可為連結。',503);
        $this->db=new PDO('sqlite:'.$path);$this->db->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);$this->db->exec('PRAGMA busy_timeout=5000');
        $this->db->exec('CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, owner TEXT NOT NULL, title TEXT NOT NULL, updated_at TEXT NOT NULL, body TEXT NOT NULL)');
        $this->db->exec('CREATE INDEX IF NOT EXISTS projects_owner ON projects(owner,updated_at)');
        $this->db->exec('CREATE TABLE IF NOT EXISTS requests (owner TEXT NOT NULL, id TEXT NOT NULL, action TEXT NOT NULL, fingerprint TEXT NOT NULL, status TEXT NOT NULL, response TEXT, created_at INTEGER NOT NULL, PRIMARY KEY(owner,id))');
        $this->db->exec('CREATE TABLE IF NOT EXISTS settings (name TEXT PRIMARY KEY, value TEXT NOT NULL)');@chmod($path,0600);
    }
    public function listProjects($owner) {
        $stmt=$this->db->prepare('SELECT id,title,updated_at,body FROM projects WHERE owner=? ORDER BY updated_at DESC LIMIT 100');$stmt->execute(array($owner));$rows=array();
        foreach($stmt->fetchAll(PDO::FETCH_ASSOC) as $row){$body=json_decode($row['body'],true);if(!is_array($body)||!isset($body['creativeItems'],$body['projectLifecycle']))continue;$rows[]=array('id'=>$row['id'],'title'=>$row['title'],'updatedAt'=>$row['updated_at'],'projectLifecycle'=>$body['projectLifecycle'],'lifecycle'=>$body['projectLifecycle'],'itemCount'=>count($body['creativeItems']),'description'=>$body['description']);}return $rows;
    }
    public function project($id,$owner) {
        validId($id);$stmt=$this->db->prepare('SELECT body FROM projects WHERE id=? AND owner=?');$stmt->execute(array($id,$owner));$body=$stmt->fetchColumn();ensure($body!==false,'PROJECT_NOT_FOUND','找不到此瀏覽器工作階段的作品。',404);return json_decode($body,true,128,JSON_THROW_ON_ERROR);
    }
    public function save($project,$owner) {
        $project['updatedAt']=gmdate('c');$body=jsonEncode($project);ensure(strlen($body)<=2000000,'PROJECT_LIMIT','此作品資料已達上限，請匯出後建立新作品。',409);
        $stmt=$this->db->prepare('INSERT INTO projects(id,owner,title,updated_at,body) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,updated_at=excluded.updated_at,body=excluded.body WHERE projects.owner=excluded.owner');
        $stmt->execute(array($project['id'],$owner,$project['title'],$project['updatedAt'],$body));return $project;
    }
    public function model($default,$owner) {$q=$this->db->prepare('SELECT value FROM settings WHERE name=?');$q->execute(array('model.'.$owner));$v=$q->fetchColumn();return $v===false?$default:modelName($v);}
    public function setModel($model,$owner) {$q=$this->db->prepare('INSERT INTO settings(name,value) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value');$q->execute(array('model.'.$owner,modelName($model)));}
    public function connection($default,$owner) {
        $q=$this->db->prepare('SELECT value FROM settings WHERE name=?');$q->execute(array('connection.'.$owner));$value=$q->fetchColumn();
        if($value===false){$out=array('provider'=>'openai','model'=>$default,'ollamaUrl'=>'http://127.0.0.1:11434');$out['settingsRevision']=hash('sha256',$owner.jsonEncode($out));return $out;}
        $value=json_decode($value,true,16,JSON_THROW_ON_ERROR);$out=validateConnection($value);$out['settingsRevision']=field($value,'settingsRevision');ensure(is_string($out['settingsRevision'])&&preg_match('/^[a-f0-9]{64}$/D',$out['settingsRevision']),'INVALID_SETTINGS','AI 設定無法驗證，請重新保存設定。',500);return $out;
    }
    public function setConnection($values,$owner) {
        $out=validateConnection($values);$out['settingsRevision']=randomToken();$q=$this->db->prepare('INSERT INTO settings(name,value) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value');$q->execute(array('connection.'.$owner,jsonEncode($out)));return $out;
    }
    public function modelCatalog($owner) {
        $q=$this->db->prepare('SELECT value FROM settings WHERE name=?');$q->execute(array('catalog.'.$owner));$value=$q->fetchColumn();
        return $value===false?array('openai'=>array('gpt-5.4-mini'),'ollama'=>array('qwen3:8b')):json_decode($value,true,16,JSON_THROW_ON_ERROR);
    }
    public function rememberModel($provider,$model,$owner) {
        $catalog=$this->modelCatalog($owner);$catalog[$provider]=array_values(array_unique(array_merge(array($model),$catalog[$provider])));$catalog[$provider]=array_slice($catalog[$provider],0,20);
        $q=$this->db->prepare('INSERT INTO settings(name,value) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value');$q->execute(array('catalog.'.$owner,jsonEncode($catalog)));
    }
    public function requestStart($owner,$id,$action,$fingerprint) {
        ensure(is_string($id)&&preg_match('/^[a-zA-Z0-9-]{20,64}$/D',$id),'REQUEST_ID_REQUIRED','請重新送出有效的請求編號。');
        $q=$this->db->prepare('SELECT * FROM requests WHERE owner=? AND id=?');$q->execute(array($owner,$id));$old=$q->fetch(PDO::FETCH_ASSOC);
        if($old){ensure($old['action']===$action&&hash_equals($old['fingerprint'],$fingerprint),'REQUEST_ID_CONFLICT','這個請求編號已用於不同內容。請重新確認後再操作。',409);ensure($old['status']==='completed','REQUEST_ALREADY_ATTEMPTED','此請求已送出或失敗，可能已計費，因此不會再次呼叫。先重新整理確認結果；要再試請重新確認費用後建立新請求。',409);return json_decode($old['response'],true,128,JSON_THROW_ON_ERROR);}
        $q=$this->db->prepare('INSERT INTO requests(owner,id,action,fingerprint,status,created_at) VALUES(?,?,?,?,?,?)');$q->execute(array($owner,$id,$action,$fingerprint,'running',time()));return null;
    }
    public function requestFinish($owner,$id,$response,$success) {$q=$this->db->prepare('UPDATE requests SET status=?,response=? WHERE owner=? AND id=?');$q->execute(array($success?'completed':'failed',$success?jsonEncode($response):null,$owner,$id));}
}
