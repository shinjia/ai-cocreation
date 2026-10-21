// Source contracts only. Native PHP/PDO fixtures remain UNEXECUTED until run
// with PHP 7.4+ and PDO SQLite: php tests/media-store.php.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const section = (source, start, next) => source.split(start)[1].split(next)[0];

test('media store shares injected PDO and creates only additive private tables', async () => {
  const source = await read('app/media-store.php');
  assert.match(source, /function __construct\(PDO \$db\)/);
  assert.match(source, /\$this->db=\$db/);
  assert.match(source, /ATTR_DRIVER_NAME\)==='sqlite'/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS media_assets/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS media_upload_receipts/);
  assert.doesNotMatch(source, /\bnew PDO\b|\b(?:DROP|ALTER|TRUNCATE|DELETE|UPDATE|REPLACE)\s+(?:TABLE|FROM|media_assets|media_upload_receipts)\b|PRAGMA\s+user_version\s*=/i);
  assert.doesNotMatch(source, /(?:file_get_contents|file_put_contents|fopen|unlink|rename|curl_|shell_exec)\s*\(|https?:\/\//);
});

test('asset DDL constrains exact type, dimensions, hex identifiers and BLOB length', async () => {
  const source = await read('app/media-store.php');
  const ddl = source.match(/<<<'MEDIA_ASSETS_DDL'\n([\s\S]*?)\nMEDIA_ASSETS_DDL;/)[1];
  for (const column of ['id','owner','project_id','item_id','sha256']) {
    assert.ok(ddl.includes(`typeof(${column})='text'`));
    assert.ok(ddl.includes(`${column} NOT GLOB '*[^a-f0-9]*'`));
  }
  for (const column of ['width','height','byte_length']) assert.ok(ddl.includes(`typeof(${column})='integer'`));
  assert.match(ddl, /mime='image\/png'/);
  assert.match(ddl, /width BETWEEN 1 AND 2048/);
  assert.match(ddl, /height BETWEEN 1 AND 2048 AND width\*height<=4194304/);
  assert.match(ddl, /byte_length BETWEEN 1 AND 4194304/);
  assert.match(ddl, /normalization='png-v1'/);
  assert.match(ddl, /typeof\(bytes\)='blob' AND length\(bytes\)=byte_length/);
  assert.doesNotMatch(ddl, /filename|original_name|path|credential|external_url|base64|data_url/i);
});

test('writer lock starts before callback and commit or rollback uses same PDO', async () => {
  const source = await read('app/media-store.php');
  const transaction = section(source, 'public function transaction(', 'private function requireTransaction(');
  assert.match(transaction, /!\$this->transactionActive&&!\$this->db->inTransaction\(\)/);
  assert.ok(transaction.indexOf("exec('BEGIN IMMEDIATE')") < transaction.indexOf('$callback($this)'));
  assert.ok(transaction.indexOf('$callback($this)') < transaction.indexOf("exec('COMMIT')"));
  assert.match(transaction, /catch\(Throwable \$error\)/);
  assert.match(transaction, /exec\('ROLLBACK'\)/);
  assert.match(transaction, /throw \$error/);
  assert.match(transaction, /finally\s*\{\s*\$this->transactionActive=false/);
  assert.doesNotMatch(transaction, /SAVEPOINT|new PDO|ask\(|requestStart\(|curl_|sleep\(/);
  for (const [start,next] of [['public function insert(', '/** Accepts'], ['public function recordReceipt(', '\n}']]) {
    assert.match(section(source,start,next), /\$this->requireTransaction\(\)/);
  }
});

test('insert requires strict normalized descriptor and binds binary payload as LOB', async () => {
  const source = await read('app/media-store.php');
  const validate = section(source,'private function validateNormalized(', 'private function enforceQuota(');
  assert.match(validate, /\$actual===\$expected/);
  assert.match(validate, /array\('bytes','mime','width','height','byteLength','sha256','normalization'\)/);
  assert.match(validate, /strlen\(\$normalized\['bytes'\]\)===\$normalized\['byteLength'\]/);
  assert.match(validate, /hash_equals\(hash\('sha256',\$normalized\['bytes'\]\),\$normalized\['sha256'\]\)/);
  assert.match(validate, /unpack\('Nwidth\/Nheight',substr\(\$bytes,16,8\)\)/);
  assert.match(validate, /\$dimensions\['width'\]===\$normalized\['width'\]/);
  assert.match(validate, /\$dimensions\['height'\]===\$normalized\['height'\]/);
  assert.match(validate, /substr\(\$bytes,-12\)/);
  const insert = section(source,'public function insert(', '/** Accepts');
  assert.match(insert, /bin2hex\(random_bytes\(16\)\)/);
  assert.match(insert, /\$this->validateNormalized\(\$normalized\)/);
  assert.match(insert, /bindValue\(12,\$normalized\['bytes'\],PDO::PARAM_LOB\)/);
  assert.ok(insert.indexOf('$this->enforceQuota(') < insert.indexOf("prepare('INSERT INTO media_assets"));
  assert.doesNotMatch(insert, /normalizeUploadedPng\s*\(|ON CONFLICT|OR REPLACE|base64_encode|jsonEncode\(\$normalized/);
});

test('quota accounting is owner-project scoped and includes all retained assets', async () => {
  const source = await read('app/media-store.php');
  const quota = section(source,'private function enforceQuota(', 'public function insert(');
  for (const [name,value] of [['MAX_ASSET_BYTES',4194304],['MAX_PROJECT_BYTES',67108864],['MAX_PROJECT_ASSETS',100],['MAX_OWNER_BYTES',268435456],['MAX_OWNER_ASSETS',400]]) {
    assert.ok(source.includes(`public const ${name}=${value};`));
  }
  assert.match(quota, /\$this->requireTransaction\(\)/);
  assert.match(quota, /COUNT\(\*\) AS asset_count, COALESCE\(SUM\(byte_length\),0\) AS byte_count FROM media_assets WHERE owner=\? AND project_id=\?/);
  assert.match(quota, /COUNT\(\*\) AS asset_count, COALESCE\(SUM\(byte_length\),0\) AS byte_count FROM media_assets WHERE owner=\?'/);
  assert.match(quota, /asset_count'\]\+1<=self::MAX_PROJECT_ASSETS/);
  assert.match(quota, /byte_count'\]\+\$byteLength<=self::MAX_PROJECT_BYTES/);
  assert.match(quota, /asset_count'\]\+1<=self::MAX_OWNER_ASSETS/);
  assert.match(quota, /byte_count'\]\+\$byteLength<=self::MAX_OWNER_BYTES/);
  assert.doesNotMatch(quota, /DELETE|archived\s*=|LIMIT\s+\d|OFFSET/i);
});

test('asset read is never ID-only and revalidates stored bytes before returning', async () => {
  const source = await read('app/media-store.php');
  const readSection = section(source,'public function read(', 'public function lookupReceipt(');
  const queries = [...readSection.matchAll(/prepare\('([^']+)'\)/g)].map(match=>match[1]);
  assert.equal(queries.length,2);
  for (const query of queries) assert.match(query,/WHERE owner=\? AND project_id=\? AND id=\?/);
  assert.ok(queries.some(query=>query.endsWith('AND item_id=?')));
  assert.match(readSection, /MEDIA_NOT_FOUND/);
  assert.match(readSection, /stream_get_contents\(\$bytes,self::MAX_ASSET_BYTES\+1\)/);
  assert.match(readSection, /\$this->validateNormalized\(\$normalized\)/);
  assert.match(readSection, /MEDIA_CORRUPT/);
  assert.match(readSection, /return array\('metadata'=>\$this->metadata\(\$row\),'bytes'=>\$bytes,'itemId'=>\$row\['item_id'\]\)/);
  const metadata = section(source,'public function metadata(', '/** Authorization');
  const keys = [...metadata.matchAll(/'([A-Za-z0-9]+)'\s*=>/g)].map(match=>match[1]);
  assert.deepEqual(keys,['id','mime','width','height','byteLength','sha256','normalization','createdAt']);
});

test('receipts are owner-scoped immutable inserts with strict request and fingerprint grammar', async () => {
  const source = await read('app/media-store.php');
  assert.match(source,/PRIMARY KEY\(owner,request_id\)/);
  assert.ok(source.includes("preg_match('/^[a-zA-Z0-9-]{20,64}$/D',$value)"));
  const lookup = section(source,'public function lookupReceipt(', 'private function receiptMetadata(');
  assert.match(lookup,/WHERE owner=\? AND request_id=\?/);
  assert.match(lookup,/\$row===false\?null:/);
  const receipt = source.split('public function recordReceipt(')[1];
  assert.match(receipt,/\$this->requireTransaction\(\)/);
  assert.match(receipt,/INSERT INTO media_upload_receipts/);
  assert.match(receipt,/MEDIA_RECEIPT_CONFLICT/);
  assert.doesNotMatch(receipt,/\bUPDATE\b|\bDELETE\b|ON CONFLICT|OR REPLACE/);
  assert.doesNotMatch(source,/可能已計費|再次呼叫|重新確認費用/);
});

test('verification fixtures distinguish actual extracted SQLite checks from unexecuted PHP', async () => {
  const python = await read('tests/media-store-sqlite-check.py');
  const native = await read('tests/media-store.php');
  assert.match(python,/re\.search\(/);
  assert.match(python,/DDL\.append\(match\.group\(1\)\)/);
  assert.match(python,/db\.execute\(sql\)/);
  assert.match(python,/db\.execute\(INSERT,/);
  assert.match(python,/db\.execute\(READ_ITEM,/);
  assert.match(python,/db\.execute\(READ_RECEIPT,/);
  assert.match(python,/db\.execute\(PROJECT_QUOTA,/);
  assert.match(python,/db\.execute\(OWNER_QUOTA,/);
  assert.match(python,/db\.execute\('ROLLBACK'\)/);
  assert.match(python,/TemporaryDirectory/);
  assert.match(python,/UNEXECUTED: PHP parser\/PDO runtime/);
  assert.match(native,/UNEXECUTED in the authoring environment because PHP is unavailable/);
  assert.match(native,/PDO::getAvailableDrivers/);
  assert.match(native,/PDO PARAM_LOB is actually stored as SQLite BLOB/);
  assert.match(native,/Store save size failure/);
  assert.doesNotMatch(native,/https?:\/\/|curl_/);
});
