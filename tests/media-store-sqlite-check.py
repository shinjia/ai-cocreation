"""Execute MediaStore's exact extracted DDL and prepared SQL in temporary SQLite.

These are real SQLite checks, NOT PHP/PDO, PNG decoding, HTTP, or provider tests.
The large quota fixtures use SQLite zeroblob data solely to exercise SQL byte sums;
normal user inserts must first pass the PHP normalizer and MediaStore validation.
Run: python3 tests/media-store-sqlite-check.py
"""
from pathlib import Path
import hashlib
import re
import sqlite3
import struct
import tempfile
import zlib

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / 'app/media-store.php').read_text(encoding='utf-8')
DDL = []
for marker in ('MEDIA_ASSETS_DDL', 'MEDIA_RECEIPTS_DDL'):
    match = re.search(r"<<<'" + marker + r"'\n(.*?)\n" + marker + r';', SOURCE, re.S)
    assert match, 'Missing exact PHP DDL: ' + marker
    DDL.append(match.group(1))
QUERIES = re.findall(r"->prepare\('([^']*)'\)", SOURCE)
TRANSACTIONS = re.findall(r"->exec\('(BEGIN IMMEDIATE|COMMIT|ROLLBACK)'\)", SOURCE)
assert set(TRANSACTIONS) == {'BEGIN IMMEDIATE', 'COMMIT', 'ROLLBACK'}
INSERT = next(q for q in QUERIES if q.startswith('INSERT INTO media_assets('))
READ = next(q for q in QUERIES if q.startswith('SELECT id,mime,') and not q.endswith('AND item_id=?'))
READ_ITEM = next(q for q in QUERIES if q.startswith('SELECT id,mime,') and q.endswith('AND item_id=?'))
PROJECT_QUOTA = next(q for q in QUERIES if q.startswith('SELECT COUNT(*)') and q.endswith('project_id=?'))
OWNER_QUOTA = next(q for q in QUERIES if q.startswith('SELECT COUNT(*)') and q.endswith('owner=?'))
INSERT_RECEIPT = next(q for q in QUERIES if q.startswith('INSERT INTO media_upload_receipts('))
READ_RECEIPT = next(q for q in QUERIES if q.startswith('SELECT request_id,'))
LIMITS = {name: int(value) for name, value in re.findall(r'public const (MAX_[A-Z_]+)=(\d+);', SOURCE)}
CHECKS = 0
OWNER = 'a' * 64
OTHER_OWNER = 'b' * 64
PROJECT = 'c' * 32
OTHER_PROJECT = 'd' * 32
ITEM = 'e' * 32
OTHER_ITEM = 'f' * 32
CREATED = '2026-10-21T00:00:00+00:00'
REQUEST = 'upload-20261021-fixture-0001'
FINGERPRINT = '1' * 64
VERSION = '2' * 32


def check(ok, label):
    global CHECKS
    assert ok, label
    CHECKS += 1
    print('PASS:', label)


def chunk(kind, payload):
    return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', zlib.crc32(kind + payload) & 0xffffffff)


PNG = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 1, 1, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b'\0\xff\0\0\xff')) + chunk(b'IEND', b'')
SHA = hashlib.sha256(PNG).hexdigest()


def values(asset_id, owner=OWNER, project=PROJECT, item=ITEM, data=PNG):
    return [asset_id, owner, project, item, 'image/png', 1, 1, len(data), hashlib.sha256(data).hexdigest(), 'png-v1', CREATED, data]


def rejected(db, sql, params, label):
    try:
        db.execute(sql, params)
    except sqlite3.IntegrityError:
        check(True, label)
    else:
        raise AssertionError(label + ': invalid insert accepted')


def initialize(db):
    db.row_factory = sqlite3.Row
    for sql in DDL:
        db.execute(sql)


def check_quota_queries(db, project, expected_project_count, expected_project_bytes, expected_owner_count, expected_owner_bytes):
    project_usage = db.execute(PROJECT_QUOTA, (OWNER, project)).fetchone()
    owner_usage = db.execute(OWNER_QUOTA, (OWNER,)).fetchone()
    check(tuple(project_usage) == (expected_project_count, expected_project_bytes), 'exact project quota query counts retained assets and bytes')
    check(tuple(owner_usage) == (expected_owner_count, expected_owner_bytes), 'exact owner quota query counts every project')
    return project_usage, owner_usage


with tempfile.TemporaryDirectory(prefix='cocreation-media-sqlite-') as directory:
    # File-backed temp DB keeps the 256 MiB boundary check out of Python memory.
    db = sqlite3.connect(str(Path(directory) / 'fixture.sqlite'), isolation_level=None)
    db.execute('CREATE TABLE projects(id TEXT PRIMARY KEY, body TEXT NOT NULL)')
    db.execute('CREATE TABLE settings(name TEXT PRIMARY KEY, value TEXT NOT NULL)')
    db.execute('CREATE TABLE requests(owner TEXT, id TEXT, status TEXT)')
    db.execute('INSERT INTO projects VALUES(?,?)', (PROJECT, 'retained-version-body'))
    db.execute('INSERT INTO settings VALUES(?,?)', ('existing', 'retained-setting'))
    db.execute('INSERT INTO requests VALUES(?,?,?)', (OWNER, 'old-request', 'completed'))
    db.execute('PRAGMA user_version=37')
    initialize(db)
    check(db.execute('PRAGMA user_version').fetchone()[0] == 37, 'additive media initialization retains existing user_version')
    check([row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")] == ['media_assets', 'media_upload_receipts', 'projects', 'requests', 'settings'], 'actual extracted DDL creates only the two media tables')
    columns = [row['name'] for row in db.execute('PRAGMA table_info(media_assets)')]
    check(columns == ['id', 'owner', 'project_id', 'item_id', 'mime', 'width', 'height', 'byte_length', 'sha256', 'normalization', 'created_at', 'bytes'], 'asset schema stores only approved private fields')

    asset = '3' * 32
    db.execute('BEGIN IMMEDIATE')
    db.execute(INSERT, values(asset))
    db.execute(INSERT_RECEIPT, (OWNER, REQUEST, PROJECT, ITEM, FINGERPRINT, VERSION, CREATED))
    db.execute('COMMIT')
    row = db.execute(READ_ITEM, (OWNER, PROJECT, asset, ITEM)).fetchone()
    check(row['bytes'] == PNG and row['sha256'] == SHA and row['byte_length'] == len(PNG), 'actual asset INSERT and owner/project/item SELECT round-trip binary PNG')
    check(db.execute('SELECT typeof(bytes) FROM media_assets WHERE id=?', (asset,)).fetchone()[0] == 'blob', 'binary fixture is stored as SQLite BLOB')
    check(db.execute(READ, (OTHER_OWNER, PROJECT, asset)).fetchone() is None, 'cross-owner asset read is empty')
    check(db.execute(READ, (OWNER, OTHER_PROJECT, asset)).fetchone() is None, 'cross-project asset read is empty')
    check(db.execute(READ_ITEM, (OWNER, PROJECT, asset, OTHER_ITEM)).fetchone() is None, 'cross-item asset read is empty')
    check(db.execute(READ, (OWNER, PROJECT, asset)).fetchone()['bytes'] == PNG, 'optional-item read still requires owner and project')
    receipt = db.execute(READ_RECEIPT, (OWNER, REQUEST)).fetchone()
    check(receipt['fingerprint'] == FINGERPRINT and receipt['version_id'] == VERSION, 'upload receipt replay lookup returns saved fingerprint/version')
    check(db.execute(READ_RECEIPT, (OTHER_OWNER, REQUEST)).fetchone() is None, 'receipt lookup is owner-scoped')
    rejected(db, INSERT, values(asset), 'asset identity cannot overwrite an existing BLOB')
    rejected(db, INSERT_RECEIPT, (OWNER, REQUEST, PROJECT, ITEM, FINGERPRINT, VERSION, CREATED), 'duplicate receipt cannot create a second upload')
    rejected(db, INSERT_RECEIPT, (OWNER, REQUEST, PROJECT, ITEM, '4' * 64, '5' * 32, CREATED), 'same receipt ID with changed fingerprint cannot replace original')
    check(db.execute(READ_RECEIPT, (OWNER, REQUEST)).fetchone()['fingerprint'] == FINGERPRINT, 'conflicting receipt leaves original immutable')
    db.execute(INSERT_RECEIPT, (OTHER_OWNER, REQUEST, OTHER_PROJECT, OTHER_ITEM, '6' * 64, '7' * 32, CREATED))
    check(db.execute(READ_RECEIPT, (OTHER_OWNER, REQUEST)).fetchone()['project_id'] == OTHER_PROJECT, 'same request ID is independent for another owner')

    initialize(db)
    check(db.execute('SELECT body FROM projects').fetchone()[0] == 'retained-version-body', 'reinitialization retains existing project and version body')
    check(db.execute('SELECT value FROM settings').fetchone()[0] == 'retained-setting', 'reinitialization retains existing settings')
    check(db.execute('SELECT status FROM requests').fetchone()[0] == 'completed', 'reinitialization retains existing request journal')
    check(db.execute(READ, (OWNER, PROJECT, asset)).fetchone()['bytes'] == PNG, 'reinitialization retains saved asset bytes')
    check(db.execute(READ_RECEIPT, (OWNER, REQUEST)).fetchone()['version_id'] == VERSION, 'reinitialization retains upload receipt')
    check(db.execute('PRAGMA user_version').fetchone()[0] == 37, 'reinitialization does not overwrite schema version')

    # Deliberately fault after every stage that can mutate the upload transaction.
    for stage in ('asset', 'project', 'receipt'):
        transient = {'asset': '8', 'project': '9', 'receipt': '0'}[stage] * 32
        request = 'rollback-' + stage + '-20261021-0001'
        try:
            db.execute('BEGIN IMMEDIATE')
            db.execute(INSERT, values(transient))
            if stage in ('project', 'receipt'):
                db.execute('UPDATE projects SET body=? WHERE id=?', ('transient-version-body', PROJECT))
            if stage == 'receipt':
                db.execute(INSERT_RECEIPT, (OWNER, request, PROJECT, ITEM, FINGERPRINT, VERSION, CREATED))
            raise RuntimeError('fixture-injected failure after ' + stage)
        except RuntimeError:
            db.execute('ROLLBACK')
        check(db.execute(READ, (OWNER, PROJECT, transient)).fetchone() is None, 'rollback after ' + stage + ' removes transient asset')
        check(db.execute('SELECT body FROM projects').fetchone()[0] == 'retained-version-body', 'rollback after ' + stage + ' retains original project version')
        check(db.execute(READ_RECEIPT, (OWNER, request)).fetchone() is None, 'rollback after ' + stage + ' leaves no success receipt')

    invalid_columns = [
        (0, 'z' * 32, 'non-hex asset ID'), (0, 'A' * 32, 'uppercase asset ID'), (0, '3' * 31, 'short asset ID'),
        (1, 'g' * 64, 'non-hex owner'), (1, OWNER[:-1], 'short owner'),
        (2, 'x' * 32, 'invalid project'), (3, 'x' * 32, 'invalid item'),
        (4, 'image/jpeg', 'non-PNG MIME'), (5, 0, 'zero width'), (5, 2049, 'oversize width'),
        (5, 1.5, 'non-integral width'), (6, 0, 'zero height'), (6, 2049, 'oversize height'),
        (7, 0, 'empty byte length'), (7, LIMITS['MAX_ASSET_BYTES'] + 1, 'oversize byte length'),
        (7, len(PNG) + 1, 'declared BLOB length mismatch'), (8, 'g' * 64, 'non-hex digest'),
        (9, 'raw', 'unapproved normalization'), (10, '', 'missing creation time'),
        (11, PNG.decode('latin1'), 'TEXT instead of BLOB'), (11, b'', 'empty BLOB'),
    ]
    for index, replacement, label in invalid_columns:
        parameters = values('f0' * 16)
        parameters[index] = replacement
        rejected(db, INSERT, parameters, 'schema rejects ' + label)
    for bad_request in ('short', 'x' * 65, 'x' * 19 + '_', 'x' * 19 + 'é', 'x' * 19 + '\n'):
        rejected(db, INSERT_RECEIPT, (OWNER, bad_request, PROJECT, ITEM, FINGERPRINT, VERSION, CREATED), 'schema rejects invalid request ID ' + repr(bad_request))
    rejected(db, INSERT_RECEIPT, (OWNER, 'valid-request-fixture-0001', PROJECT, ITEM, 'z' * 64, VERSION, CREATED), 'schema rejects invalid receipt fingerprint')

    # Count quotas execute the actual parameterized SQL used before insert().
    db.execute('BEGIN IMMEDIATE')
    for number in range(1, LIMITS['MAX_PROJECT_ASSETS']):
        db.execute(INSERT, values(format(number, '032x')))
    db.execute('COMMIT')
    project_usage, owner_usage = check_quota_queries(db, PROJECT, 100, len(PNG) * 100, 100, len(PNG) * 100)
    check(project_usage['asset_count'] + 1 > LIMITS['MAX_PROJECT_ASSETS'], '100 retained assets leaves no project count slot')
    check(owner_usage['asset_count'] + 1 <= LIMITS['MAX_OWNER_ASSETS'], 'project count limit is independent of owner allowance')
    db.execute('BEGIN IMMEDIATE')
    for number in range(100, 400):
        project = format(1000 + (number // 100), '032x')
        db.execute(INSERT, values(format(number, '032x'), project=project))
    db.execute('COMMIT')
    usage = db.execute(OWNER_QUOTA, (OWNER,)).fetchone()
    check(usage['asset_count'] == 400 and usage['asset_count'] + 1 > LIMITS['MAX_OWNER_ASSETS'], '400 assets across projects reaches exact owner count cap')
    check(tuple(db.execute(OWNER_QUOTA, (OTHER_OWNER,)).fetchone()) == (0, 0), 'owner quota never counts another owner')
    check(tuple(db.execute(PROJECT_QUOTA, (OTHER_OWNER, PROJECT)).fetchone()) == (0, 0), 'project quota still includes owner boundary')
    db.close()

    # Use a fresh disposable database, not cleanup of historical media.
    sizes = sqlite3.connect(str(Path(directory) / 'quota-bytes.sqlite'), isolation_level=None)
    initialize(sizes)
    # The source INSERT is unchanged; only the final placeholder is replaced by
    # zeroblob(?) to allocate test BLOB bytes without copying them through Python.
    assert INSERT.endswith('?,?)')
    seed_insert = INSERT[:-2] + 'zeroblob(?))'
    sizes.execute('BEGIN IMMEDIATE')
    for number in range(64):
        project = format(2000 + number // 16, '032x')
        params = values(format(10000 + number, '032x'), project=project)
        params[7] = LIMITS['MAX_ASSET_BYTES']
        params[11] = LIMITS['MAX_ASSET_BYTES']
        sizes.execute(seed_insert, params)
    sizes.execute('COMMIT')
    project_usage, owner_usage = check_quota_queries(sizes, format(2000, '032x'), 16, LIMITS['MAX_PROJECT_BYTES'], 64, LIMITS['MAX_OWNER_BYTES'])
    check(project_usage['byte_count'] + len(PNG) > LIMITS['MAX_PROJECT_BYTES'], '64 MiB project bytes blocks the next image below count cap')
    check(owner_usage['byte_count'] + len(PNG) > LIMITS['MAX_OWNER_BYTES'], '256 MiB owner bytes blocks the next image below count cap')
    check(tuple(sizes.execute(PROJECT_QUOTA, (OWNER, format(9999, '032x'))).fetchone()) == (0, 0), 'new project cannot bypass existing owner-byte aggregate')
    sizes.close()

    # Two real SQLite connections prove the writer reservation spans the quota
    # read and insert. A second writer cannot also consume the final slot.
    race_path = str(Path(directory) / 'quota-race.sqlite')
    first = sqlite3.connect(race_path, isolation_level=None, timeout=0.01)
    second = sqlite3.connect(race_path, isolation_level=None, timeout=0.01)
    initialize(first)
    second.row_factory = sqlite3.Row
    first.execute('BEGIN IMMEDIATE')
    for number in range(99):
        first.execute(INSERT, values(format(number, '032x')))
    first.execute('COMMIT')
    first.execute('BEGIN IMMEDIATE')
    first_usage = first.execute(PROJECT_QUOTA, (OWNER, PROJECT)).fetchone()
    check(first_usage['asset_count'] + 1 == LIMITS['MAX_PROJECT_ASSETS'], 'first writer sees exactly one remaining project slot')
    try:
        second.execute('BEGIN IMMEDIATE')
    except sqlite3.OperationalError as error:
        check('locked' in str(error).lower(), 'second writer is blocked while first owns quota transaction')
    else:
        raise AssertionError('second writer acquired lock during active writer transaction')
    first.execute(INSERT, values(format(999, '032x')))
    first.execute('COMMIT')
    second.execute('BEGIN IMMEDIATE')
    second_usage = second.execute(PROJECT_QUOTA, (OWNER, PROJECT)).fetchone()
    check(second_usage['asset_count'] + 1 > LIMITS['MAX_PROJECT_ASSETS'], 'next writer observes committed full quota before any insert')
    second.execute('ROLLBACK')
    check(first.execute('SELECT COUNT(*) FROM media_assets').fetchone()[0] == 100, 'serialized quota check retains exactly the capped asset count')
    first.close()
    second.close()

print('PASS: %d actual SQLite checks with extracted PHP DDL and prepared queries.' % CHECKS)
print('UNEXECUTED: PHP parser/PDO runtime, normalizeUploadedPng/GD, browser/HTTP and provider integration. Python SQLite is not a substitute.')
