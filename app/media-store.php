<?php
/**
 * Private, append-only normalized PNG storage on the existing Store PDO.
 * This class does not open a path, accept uploads, expose a route, call a model,
 * or authorize a version/reference. The caller must authorize the exact saved
 * version/reference before read(), and call normalizeUploadedPng() before insert().
 * Keep normalization/network work outside transaction(). Save the asset, complete
 * project/version and receipt together inside one short transaction callback.
 */
class MediaStore {
    public const MAX_ASSET_BYTES=4194304;
    public const MAX_PROJECT_BYTES=67108864;
    public const MAX_PROJECT_ASSETS=100;
    public const MAX_OWNER_BYTES=268435456;
    public const MAX_OWNER_ASSETS=400;

    // The Python SQL check extracts and executes these exact DDL strings.
    private const ASSETS_DDL = <<<'MEDIA_ASSETS_DDL'
CREATE TABLE IF NOT EXISTS media_assets (
    id TEXT NOT NULL PRIMARY KEY CHECK(typeof(id)='text' AND length(id)=32 AND id NOT GLOB '*[^a-f0-9]*'),
    owner TEXT NOT NULL CHECK(typeof(owner)='text' AND length(owner)=64 AND owner NOT GLOB '*[^a-f0-9]*'),
    project_id TEXT NOT NULL CHECK(typeof(project_id)='text' AND length(project_id)=32 AND project_id NOT GLOB '*[^a-f0-9]*'),
    item_id TEXT NOT NULL CHECK(typeof(item_id)='text' AND length(item_id)=32 AND item_id NOT GLOB '*[^a-f0-9]*'),
    mime TEXT NOT NULL CHECK(mime='image/png'),
    width INTEGER NOT NULL CHECK(typeof(width)='integer' AND width BETWEEN 1 AND 2048),
    height INTEGER NOT NULL CHECK(typeof(height)='integer' AND height BETWEEN 1 AND 2048 AND width*height<=4194304),
    byte_length INTEGER NOT NULL CHECK(typeof(byte_length)='integer' AND byte_length BETWEEN 1 AND 4194304),
    sha256 TEXT NOT NULL CHECK(typeof(sha256)='text' AND length(sha256)=64 AND sha256 NOT GLOB '*[^a-f0-9]*'),
    normalization TEXT NOT NULL CHECK(normalization='png-v1'),
    created_at TEXT NOT NULL CHECK(typeof(created_at)='text' AND length(created_at) BETWEEN 20 AND 40),
    bytes BLOB NOT NULL CHECK(typeof(bytes)='blob' AND length(bytes)=byte_length)
)
MEDIA_ASSETS_DDL;

    private const RECEIPTS_DDL = <<<'MEDIA_RECEIPTS_DDL'
CREATE TABLE IF NOT EXISTS media_upload_receipts (
    owner TEXT NOT NULL CHECK(typeof(owner)='text' AND length(owner)=64 AND owner NOT GLOB '*[^a-f0-9]*'),
    request_id TEXT NOT NULL CHECK(typeof(request_id)='text' AND length(request_id) BETWEEN 20 AND 64 AND request_id NOT GLOB '*[^a-zA-Z0-9-]*'),
    project_id TEXT NOT NULL CHECK(typeof(project_id)='text' AND length(project_id)=32 AND project_id NOT GLOB '*[^a-f0-9]*'),
    item_id TEXT NOT NULL CHECK(typeof(item_id)='text' AND length(item_id)=32 AND item_id NOT GLOB '*[^a-f0-9]*'),
    fingerprint TEXT NOT NULL CHECK(typeof(fingerprint)='text' AND length(fingerprint)=64 AND fingerprint NOT GLOB '*[^a-f0-9]*'),
    version_id TEXT NOT NULL CHECK(typeof(version_id)='text' AND length(version_id)=32 AND version_id NOT GLOB '*[^a-f0-9]*'),
    created_at TEXT NOT NULL CHECK(typeof(created_at)='text' AND length(created_at) BETWEEN 20 AND 40),
    PRIMARY KEY(owner,request_id)
)
MEDIA_RECEIPTS_DDL;

    private $db;
    private $transactionActive=false;

    public function __construct(PDO $db) {
        ensure($db->getAttribute(PDO::ATTR_DRIVER_NAME)==='sqlite','MEDIA_STORAGE','圖片儲存需要原有的 SQLite 資料庫連線。',503);
        $this->db=$db;
        $this->db->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);
        // Additive only: no file replacement, user_version change, existing table
        // rewrite, migration cleanup, content update or historical asset deletion.
        $this->db->exec(self::ASSETS_DDL);
        $this->db->exec(self::RECEIPTS_DDL);
    }

    public function transaction(callable $callback) {
        ensure(!$this->transactionActive&&!$this->db->inTransaction(),'MEDIA_TRANSACTION_NESTED','圖片保存不可巢狀啟動資料庫交易。',409);
        // Reserve the writer before reading quotas or the current project version.
        // Explicit SQL is paired with explicit COMMIT/ROLLBACK on the same PDO.
        $this->db->exec('BEGIN IMMEDIATE');
        $this->transactionActive=true;
        try {
            $result=$callback($this);
            $this->db->exec('COMMIT');
            return $result;
        } catch(Throwable $error) {
            // A failed commit may have already ended the SQLite transaction.
            // Preserve the original failure even if rollback is no longer needed.
            try {$this->db->exec('ROLLBACK');} catch(Throwable $rollbackError) {}
            throw $error;
        } finally {
            $this->transactionActive=false;
        }
    }

    private function requireTransaction() {
        ensure($this->transactionActive,'MEDIA_TRANSACTION_REQUIRED','圖片與版本必須在同一筆資料庫交易中保存。',409);
    }

    private function owner($value) {
        ensure(is_string($value)&&preg_match('/^[a-f0-9]{64}$/D',$value),'MEDIA_OWNER_INVALID','圖片工作階段識別碼不正確。');
        return $value;
    }

    private function identifier($value) {
        ensure(is_string($value)&&preg_match('/^[a-f0-9]{32}$/D',$value),'MEDIA_ID_INVALID','圖片、專案、項目或版本識別碼不正確。');
        return $value;
    }

    private function requestId($value) {
        ensure(is_string($value)&&preg_match('/^[a-zA-Z0-9-]{20,64}$/D',$value),'REQUEST_ID_REQUIRED','請重新送出有效的圖片上傳請求編號。');
        return $value;
    }

    private function validateNormalized(array $normalized) {
        $actual=array_keys($normalized);sort($actual);
        $expected=array('bytes','mime','width','height','byteLength','sha256','normalization');sort($expected);
        ensure($actual===$expected,'MEDIA_INVALID','正規化圖片欄位不完整或含未允許的欄位。');
        ensure(is_string($normalized['bytes'])&&is_int($normalized['byteLength'])&&$normalized['byteLength']>=1&&$normalized['byteLength']<=self::MAX_ASSET_BYTES&&strlen($normalized['bytes'])===$normalized['byteLength'],'MEDIA_INVALID','正規化圖片資料大小不正確或超過 4 MiB。');
        ensure($normalized['mime']==='image/png'&&$normalized['normalization']==='png-v1','MEDIA_INVALID','只可保存已完成正規化的 PNG 圖片。');
        ensure(is_int($normalized['width'])&&is_int($normalized['height'])&&$normalized['width']>=1&&$normalized['width']<=2048&&$normalized['height']>=1&&$normalized['height']<=2048&&$normalized['width']*$normalized['height']<=4194304,'MEDIA_INVALID','正規化圖片尺寸不正確。');
        ensure(is_string($normalized['sha256'])&&preg_match('/^[a-f0-9]{64}$/D',$normalized['sha256'])&&hash_equals(hash('sha256',$normalized['bytes']),$normalized['sha256']),'MEDIA_INVALID','正規化圖片雜湊與內容不一致。');
        // Storage verifies the descriptor against the canonical byte envelope;
        // it never substitutes this check for the upload normalizer's decoding.
        $bytes=$normalized['bytes'];
        ensure(strlen($bytes)>=45&&substr($bytes,0,16)==="\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR"&&substr($bytes,-12)==="\x00\x00\x00\x00IEND\xae\x42\x60\x82",'MEDIA_INVALID','正規化 PNG 圖片格式不正確。');
        $dimensions=unpack('Nwidth/Nheight',substr($bytes,16,8));
        ensure(is_array($dimensions)&&$dimensions['width']===$normalized['width']&&$dimensions['height']===$normalized['height'],'MEDIA_INVALID','正規化圖片尺寸與內容不一致。');
        return $normalized;
    }

    public function assertCapacity($owner,$projectId,$byteLength=4194304) {
        $owner=$this->owner($owner);$projectId=$this->identifier($projectId);
        ensure(is_int($byteLength)&&$byteLength>0&&$byteLength<=self::MAX_ASSET_BYTES,'MEDIA_INVALID','圖片預留容量不正確。');
        $this->checkQuota($owner,$projectId,$byteLength);
    }

    private function enforceQuota($owner,$projectId,$byteLength) {
        $this->requireTransaction();$this->checkQuota($owner,$projectId,$byteLength);
    }

    private function checkQuota($owner,$projectId,$byteLength) {
        $project=$this->db->prepare('SELECT COUNT(*) AS asset_count, COALESCE(SUM(byte_length),0) AS byte_count FROM media_assets WHERE owner=? AND project_id=?');
        $project->execute(array($owner,$projectId));$projectUsage=$project->fetch(PDO::FETCH_ASSOC);
        ensure((int)$projectUsage['asset_count']+1<=self::MAX_PROJECT_ASSETS&&(int)$projectUsage['byte_count']+$byteLength<=self::MAX_PROJECT_BYTES,'MEDIA_PROJECT_QUOTA','此專案圖片已達 100 張或 64 MiB 上限；沒有刪除任何歷史圖片。',409);
        $account=$this->db->prepare('SELECT COUNT(*) AS asset_count, COALESCE(SUM(byte_length),0) AS byte_count FROM media_assets WHERE owner=?');
        $account->execute(array($owner));$ownerUsage=$account->fetch(PDO::FETCH_ASSOC);
        ensure((int)$ownerUsage['asset_count']+1<=self::MAX_OWNER_ASSETS&&(int)$ownerUsage['byte_count']+$byteLength<=self::MAX_OWNER_BYTES,'MEDIA_OWNER_QUOTA','此工作階段圖片已達 400 張或 256 MiB 上限；沒有刪除任何歷史圖片。',409);
    }

    public function insert($owner,$projectId,$itemId,array $normalized,$assetId=null) {
        $this->requireTransaction();
        $owner=$this->owner($owner);$projectId=$this->identifier($projectId);$itemId=$this->identifier($itemId);
        $assetId=$assetId===null?bin2hex(random_bytes(16)):$this->identifier($assetId);
        $normalized=$this->validateNormalized($normalized);
        $this->enforceQuota($owner,$projectId,$normalized['byteLength']);
        $createdAt=gmdate('c');
        $insert=$this->db->prepare('INSERT INTO media_assets(id,owner,project_id,item_id,mime,width,height,byte_length,sha256,normalization,created_at,bytes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
        $insert->bindValue(1,$assetId,PDO::PARAM_STR);$insert->bindValue(2,$owner,PDO::PARAM_STR);
        $insert->bindValue(3,$projectId,PDO::PARAM_STR);$insert->bindValue(4,$itemId,PDO::PARAM_STR);
        $insert->bindValue(5,$normalized['mime'],PDO::PARAM_STR);$insert->bindValue(6,$normalized['width'],PDO::PARAM_INT);
        $insert->bindValue(7,$normalized['height'],PDO::PARAM_INT);$insert->bindValue(8,$normalized['byteLength'],PDO::PARAM_INT);
        $insert->bindValue(9,$normalized['sha256'],PDO::PARAM_STR);$insert->bindValue(10,$normalized['normalization'],PDO::PARAM_STR);
        $insert->bindValue(11,$createdAt,PDO::PARAM_STR);$insert->bindValue(12,$normalized['bytes'],PDO::PARAM_LOB);
        try {$insert->execute();} catch(PDOException $error) {throw new AppError('MEDIA_WRITE_FAILED','圖片未能保存；請重新讀取專案確認目前狀態。',409);}
        return $this->metadata(array('id'=>$assetId,'mime'=>$normalized['mime'],'width'=>$normalized['width'],'height'=>$normalized['height'],'byte_length'=>$normalized['byteLength'],'sha256'=>$normalized['sha256'],'normalization'=>$normalized['normalization'],'created_at'=>$createdAt));
    }

    /** Accepts a private SQL row and exposes only this fixed public allowlist. */
    public function metadata(array $row) {
        return array('id'=>$row['id'],'mime'=>$row['mime'],'width'=>(int)$row['width'],'height'=>(int)$row['height'],'byteLength'=>(int)$row['byte_length'],'sha256'=>$row['sha256'],'normalization'=>$row['normalization'],'createdAt'=>$row['created_at']);
    }

    /** Authorization of the exact version/reference is the caller's prerequisite. */
    public function read($owner,$projectId,$assetId,$itemId=null) {
        $owner=$this->owner($owner);$projectId=$this->identifier($projectId);$assetId=$this->identifier($assetId);
        if($itemId===null){
            $read=$this->db->prepare('SELECT id,mime,width,height,byte_length,sha256,normalization,created_at,item_id,bytes FROM media_assets WHERE owner=? AND project_id=? AND id=?');
            $read->execute(array($owner,$projectId,$assetId));
        }else{
            $itemId=$this->identifier($itemId);
            $read=$this->db->prepare('SELECT id,mime,width,height,byte_length,sha256,normalization,created_at,item_id,bytes FROM media_assets WHERE owner=? AND project_id=? AND id=? AND item_id=?');
            $read->execute(array($owner,$projectId,$assetId,$itemId));
        }
        $row=$read->fetch(PDO::FETCH_ASSOC);
        ensure($row!==false,'MEDIA_NOT_FOUND','找不到此工作階段與專案可使用的圖片。',404);
        $bytes=$row['bytes'];
        if(is_resource($bytes))$bytes=stream_get_contents($bytes,self::MAX_ASSET_BYTES+1);
        $normalized=array('bytes'=>$bytes,'mime'=>$row['mime'],'width'=>(int)$row['width'],'height'=>(int)$row['height'],'byteLength'=>(int)$row['byte_length'],'sha256'=>$row['sha256'],'normalization'=>$row['normalization']);
        try {$this->validateNormalized($normalized);} catch(AppError $error) {throw new AppError('MEDIA_CORRUPT','已保存圖片的完整性檢查未通過；未提供圖片內容。',409);}
        return array('metadata'=>$this->metadata($row),'bytes'=>$bytes,'itemId'=>$row['item_id']);
    }

    public function lookupReceipt($owner,$requestId) {
        $owner=$this->owner($owner);$requestId=$this->requestId($requestId);
        $read=$this->db->prepare('SELECT request_id,project_id,item_id,fingerprint,version_id,created_at FROM media_upload_receipts WHERE owner=? AND request_id=?');
        $read->execute(array($owner,$requestId));$row=$read->fetch(PDO::FETCH_ASSOC);
        return $row===false?null:$this->receiptMetadata($row);
    }

    private function receiptMetadata(array $row) {
        return array('requestId'=>$row['request_id'],'projectId'=>$row['project_id'],'itemId'=>$row['item_id'],'fingerprint'=>$row['fingerprint'],'versionId'=>$row['version_id'],'createdAt'=>$row['created_at']);
    }

    /** Append-only receipt: duplicate IDs are rejected, never replaced/updated. */
    public function recordReceipt($owner,$requestId,$projectId,$itemId,$fingerprint,$versionId) {
        $this->requireTransaction();
        $owner=$this->owner($owner);$requestId=$this->requestId($requestId);
        $projectId=$this->identifier($projectId);$itemId=$this->identifier($itemId);$versionId=$this->identifier($versionId);
        ensure(is_string($fingerprint)&&preg_match('/^[a-f0-9]{64}$/D',$fingerprint),'MEDIA_FINGERPRINT_INVALID','圖片上傳內容識別碼不正確。');
        $createdAt=gmdate('c');
        $insert=$this->db->prepare('INSERT INTO media_upload_receipts(owner,request_id,project_id,item_id,fingerprint,version_id,created_at) VALUES(?,?,?,?,?,?,?)');
        try {$insert->execute(array($owner,$requestId,$projectId,$itemId,$fingerprint,$versionId,$createdAt));}
        catch(PDOException $error) {throw new AppError('MEDIA_RECEIPT_CONFLICT','這個圖片上傳請求編號已使用或無法保存，未覆寫原有紀錄；請重新讀取專案確認結果。',409);}
        return $this->receiptMetadata(array('request_id'=>$requestId,'project_id'=>$projectId,'item_id'=>$itemId,'fingerprint'=>$fingerprint,'version_id'=>$versionId,'created_at'=>$createdAt));
    }
}
