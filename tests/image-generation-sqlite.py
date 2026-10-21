"""Actual SQLite image-generation atomicity and request-journal checks.

Runs the exact DDL and prepared queries extracted from Store and MediaStore.
This is NOT PHP/PDO execution, endpoint validation, PNG decoding, a provider
request, or a browser test. Native integration: tests/image-generation-app.php.
Run: python3 tests/image-generation-sqlite.py
"""
from pathlib import Path
import hashlib
import json
import re
import sqlite3
import struct
import tempfile
import zlib

ROOT = Path(__file__).resolve().parents[1]
STORE = (ROOT / 'app/store.php').read_text(encoding='utf-8')
MEDIA = (ROOT / 'app/media-store.php').read_text(encoding='utf-8')


def php_sql(source, method):
    # Fixed SQL literals only. No interpolation, dynamic SQL, or PHP execution.
    matches = re.finditer(r'->' + method + r'\((\'|\")((?:\\.|(?!\1).)*?)\1\)', source)
    return [m.group(2).replace("\\'", "'").replace('\\"', '"').replace('\\\\', '\\') for m in matches]


DDL = [q for q in php_sql(STORE, 'exec') if q.startswith('CREATE TABLE IF NOT EXISTS ') and
       (q.startswith('CREATE TABLE IF NOT EXISTS projects ') or q.startswith('CREATE TABLE IF NOT EXISTS requests '))]
assert len(DDL) == 2, 'Must use the real projects and requests DDL'
for marker in ('MEDIA_ASSETS_DDL', 'MEDIA_RECEIPTS_DDL'):
    match = re.search(r"<<<'" + marker + r"'\n(.*?)\n" + marker + r';', MEDIA, re.S)
    assert match, 'Missing actual MediaStore DDL'
    DDL.append(match.group(1))
QUERIES = php_sql(STORE, 'prepare')
MEDIA_QUERIES = php_sql(MEDIA, 'prepare')
PROJECT_SAVE = next(q for q in QUERIES if q.startswith('INSERT INTO projects('))
PROJECT_READ = next(q for q in QUERIES if q.startswith('SELECT body FROM projects '))
REQUEST_INSERT = next(q for q in QUERIES if q.startswith('INSERT INTO requests('))
REQUEST_READ = next(q for q in QUERIES if q.startswith('SELECT * FROM requests '))
REQUEST_FINISH = next(q for q in QUERIES if q.startswith('UPDATE requests SET '))
ASSET_INSERT = next(q for q in MEDIA_QUERIES if q.startswith('INSERT INTO media_assets('))
ASSET_READ = next(q for q in MEDIA_QUERIES if q.startswith('SELECT id,mime,') and q.endswith('AND item_id=?'))
assert "AND status='running'" in REQUEST_FINISH, 'Completion/failure must never overwrite an earlier completed receipt'
assert set(q for q in php_sql(MEDIA, 'exec') if q in ('BEGIN IMMEDIATE', 'COMMIT', 'ROLLBACK')) == {'BEGIN IMMEDIATE', 'COMMIT', 'ROLLBACK'}

OWNER, OTHER_OWNER = 'a' * 64, 'b' * 64
PROJECT, ITEM = 'c' * 32, 'd' * 32
CREATED = '2026-10-21T00:00:00+00:00'
CHECKS = 0


def check(ok, label):
    global CHECKS
    assert ok, label
    CHECKS += 1
    print('PASS:', label)


def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)


# Self-generated complete RGB PNG. No internet or image-generation service.
PNG = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 1024, 1024, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress((b'\0' + b'\x30\x80\xc0' * 1024) * 1024, 9)) + chunk(b'IEND', b'')
SHA = hashlib.sha256(PNG).hexdigest()
BASE = json.dumps({'title': 'unchanged project', 'revision': 7, 'versions': [{'id': 'e' * 32, 'source': 'external_upload'}]}, ensure_ascii=False)
GENERATED = json.dumps({'title': 'unchanged project', 'revision': 8, 'versions': [{'id': 'e' * 32, 'source': 'external_upload'}, {'id': 'f' * 32, 'source': 'image_generated'}]}, ensure_ascii=False)
RECEIPT = json.dumps({'projectId': PROJECT, 'generatedVersionId': 'f' * 32})


def connect(path):
    db = sqlite3.connect(path, isolation_level=None, timeout=0.02)
    db.row_factory = sqlite3.Row
    return db


def initialize(db):
    for query in DDL:
        db.execute(query)
    db.execute(PROJECT_SAVE, (PROJECT, OWNER, 'unchanged project', CREATED, BASE))


def start(db, request, fingerprint='1' * 64, owner=OWNER):
    db.execute(REQUEST_INSERT, (owner, request, 'generate_image', fingerprint, 'running', 1792540800))


def asset(db, asset_id):
    db.execute(ASSET_INSERT, (asset_id, OWNER, PROJECT, ITEM, 'image/png', 1024, 1024, len(PNG), SHA, 'png-v1', CREATED, PNG))


def body(db):
    return db.execute(PROJECT_READ, (PROJECT, OWNER)).fetchone()[0]


def journal(db, request, owner=OWNER):
    return db.execute(REQUEST_READ, (owner, request)).fetchone()


def saved_asset(db, asset_id, owner=OWNER, project=PROJECT, item=ITEM):
    return db.execute(ASSET_READ, (owner, project, asset_id, item)).fetchone()


with tempfile.TemporaryDirectory(prefix='cocreation-image-generation-sqlite-') as directory:
    path = str(Path(directory) / 'atomic.sqlite')
    db = connect(path)
    observer = connect(path)
    initialize(db)
    request, asset_id = 'image-success-fixture-0001', '1' * 32
    start(db, request)
    check(journal(observer, request)['status'] == 'running', 'pre-provider attempt is durably recorded before local asset transaction')
    db.execute('BEGIN IMMEDIATE')
    asset(db, asset_id)
    db.execute(PROJECT_SAVE, (PROJECT, OWNER, 'unchanged project', CREATED, GENERATED))
    db.execute(REQUEST_FINISH, ('completed', RECEIPT, OWNER, request))
    check(saved_asset(observer, asset_id) is None and body(observer) == BASE and journal(observer, request)['status'] == 'running', 'second connection sees neither partial PNG nor version nor premature completed receipt')
    db.execute('COMMIT')
    check(saved_asset(observer, asset_id)['bytes'] == PNG and body(observer) == GENERATED and journal(observer, request)['response'] == RECEIPT, 'asset project and success receipt become visible together after commit')
    check(journal(observer, request)['status'] == 'completed', 'completed receipt survives independent reader reload')
    check(saved_asset(observer, asset_id)['sha256'] == SHA, 'complete 1024 RGB PNG bytes and descriptor survive transaction')
    check(saved_asset(observer, asset_id, owner=OTHER_OWNER) is None, 'asset lookup cannot cross owner')
    check(saved_asset(observer, asset_id, project='2' * 32) is None, 'asset lookup cannot cross project')
    check(saved_asset(observer, asset_id, item='3' * 32) is None, 'asset lookup cannot cross image item')
    check(journal(observer, request, OTHER_OWNER) is None, 'request replay lookup is owner-scoped')

    old_receipt = dict(journal(db, request))
    db.execute(REQUEST_FINISH, ('failed', None, OWNER, request))
    check(dict(journal(db, request)) == old_receipt, 'late failure handler cannot overwrite already completed receipt')
    db.execute(REQUEST_FINISH, ('completed', '{"changed":true}', OWNER, request))
    check(dict(journal(db, request)) == old_receipt, 'late completion handler cannot rewrite completed receipt payload')
    try:
        start(db, request)
    except sqlite3.IntegrityError:
        check(True, 'unique owner/request key prevents duplicate attempt insertion')
    else:
        raise AssertionError('duplicate request insertion succeeded')
    start(db, request, owner=OTHER_OWNER)
    check(journal(db, request, OTHER_OWNER)['status'] == 'running', 'same request ID does not borrow another owners completion')
    check(dict(journal(db, request)) == old_receipt, 'second owner request leaves first receipt immutable')

    # Provider result has returned, but a local stage fails. All saved output
    # must roll back; the durable attempted-request journal must remain failed.
    committed_body, committed_count = body(db), db.execute('SELECT COUNT(*) FROM media_assets').fetchone()[0]
    for number, stage in enumerate(('asset', 'project', 'receipt'), start=10):
        failed_request = 'image-local-failure-' + stage + '-0001'
        transient = format(number, '032x')
        start(db, failed_request)
        try:
            db.execute('BEGIN IMMEDIATE')
            asset(db, transient)
            if stage in ('project', 'receipt'):
                db.execute(PROJECT_SAVE, (PROJECT, OWNER, 'changed only transiently', CREATED, 'uncommitted full version'))
            if stage == 'receipt':
                db.execute(REQUEST_FINISH, ('completed', RECEIPT, OWNER, failed_request))
            raise RuntimeError('injected local failure after ' + stage)
        except RuntimeError:
            db.execute('ROLLBACK')
            db.execute(REQUEST_FINISH, ('failed', None, OWNER, failed_request))
        check(saved_asset(db, transient) is None, 'rollback after ' + stage + ' leaves no orphan generated asset')
        check(body(db) == committed_body and db.execute('SELECT COUNT(*) FROM media_assets').fetchone()[0] == committed_count, 'rollback after ' + stage + ' preserves complete prior versions and byte count')
        check(journal(db, failed_request)['status'] == 'failed' and journal(db, failed_request)['response'] is None, 'rollback after ' + stage + ' retains failed no-success-receipt attempt')
        db.execute(REQUEST_FINISH, ('completed', RECEIPT, OWNER, failed_request))
        check(journal(db, failed_request)['status'] == 'failed', 'failed attempt cannot later be relabeled completed after ' + stage)
        try:
            start(db, failed_request)
        except sqlite3.IntegrityError:
            check(True, 'failed attempt ID remains consumed after ' + stage)
        else:
            raise AssertionError('failed request ID unexpectedly reused')

    # Closing a connection in an uncommitted transaction approximates the local
    # persistence effect of process loss. No assertion about provider billing.
    crash_request, crash_asset = 'image-process-loss-fixture-0001', '4' * 32
    start(db, crash_request)
    db.execute('BEGIN IMMEDIATE')
    asset(db, crash_asset)
    db.execute(PROJECT_SAVE, (PROJECT, OWNER, 'transient crash title', CREATED, 'uncommitted crash version'))
    db.execute(REQUEST_FINISH, ('completed', RECEIPT, OWNER, crash_request))
    db.close()
    db = connect(path)
    check(saved_asset(db, crash_asset) is None and body(db) == committed_body, 'connection loss rolls back PNG and project rather than leaving an orphan')
    check(journal(db, crash_request)['status'] == 'running' and journal(db, crash_request)['response'] is None, 'connection loss retains attempted/unknown running journal without success receipt')
    try:
        start(db, crash_request)
    except sqlite3.IntegrityError:
        check(True, 'uncertain running request ID remains consumed and cannot be reinserted')
    else:
        raise AssertionError('uncertain request ID unexpectedly reused')

    # BEGIN IMMEDIATE serializes output saves, including the journal update.
    db.execute('BEGIN IMMEDIATE')
    try:
        observer.execute('BEGIN IMMEDIATE')
    except sqlite3.OperationalError as error:
        check('locked' in str(error).lower(), 'second output writer cannot enter while the first owns atomic save')
    else:
        raise AssertionError('second writer acquired an existing writer reservation')
    db.execute('ROLLBACK')
    check(dict(journal(db, request)) == old_receipt and body(db) == committed_body, 'rollback and crash fixtures never alter the completed earlier generation')
    observer.close()
    db.close()

print('PASS: %d actual SQLite image-generation checks using extracted production SQL.' % CHECKS)
print('UNEXECUTED: PHP/PDO runtime, PNG decoder, HTTP/browser, provider and native application integration. SQLite checks do not substitute for them.')
