"""Execute the actual schema and selected prepared SQL in Python SQLite.
This verifies SQL syntax/isolation, NOT PHP PDO behavior or HTTP runtime.
"""
from pathlib import Path
import re,sqlite3,json
source=(Path(__file__).resolve().parents[1]/'app/store.php').read_text()
db=sqlite3.connect(':memory:')
for statement in re.findall(r"->exec\('([^']*)'\)",source):
    db.execute(statement)
queries=re.findall(r"->prepare\('([^']*)'\)",source)
insert=next(q for q in queries if q.startswith('INSERT INTO projects'))
read=next(q for q in queries if q.startswith('SELECT body'))
body=json.dumps({'phase':'discussion','versions':[]})
db.execute(insert,('project1','ownerA','Original','2026-10-20',body))
db.execute(insert,('project1','ownerB','Attacker','2026-10-20',body))
assert db.execute('SELECT title FROM projects').fetchone()[0]=='Original'
assert db.execute(read,('project1','ownerB')).fetchone() is None
assert db.execute(read,('project1','ownerA')).fetchone()[0]==body
request=next(q for q in queries if q.startswith('INSERT INTO requests'))
db.execute(request,('ownerA','r1','generate','fingerprint','running',1))
try:
    db.execute(request,('ownerA','r1','generate','fingerprint','running',1))
    raise AssertionError('duplicate journal request accepted')
except sqlite3.IntegrityError:pass
settings=next(q for q in queries if q.startswith('INSERT INTO settings'))
db.execute(settings,('model.ownerA','model-A'))
db.execute(settings,('model.ownerB','model-B'))
assert dict(db.execute('SELECT name,value FROM settings'))=={'model.ownerA':'model-A','model.ownerB':'model-B'}
for statement in re.findall(r"->exec\('([^']*)'\)",source):db.execute(statement)
assert db.execute('SELECT COUNT(*) FROM projects').fetchone()[0]==1
print('PASS: Actual SQLite schema, insert/upsert owner isolation, read ownership, request uniqueness, non-destructive reinitialization (7 checks, including owner-scoped settings).')
print('NOT RUN: PHP PDO integration or HTTP workflow.')
