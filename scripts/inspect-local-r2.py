import sqlite3
from pathlib import Path

root = Path(".wrangler/state/v3/r2/miniflare-R2BucketObject")
for p in root.glob("*.sqlite"):
	print("FILE", p.name, p.stat().st_size)
	con = sqlite3.connect(p)
	tables = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")]
	print("tables", tables)
	for t in tables:
		cols = list(con.execute(f"PRAGMA table_info({t})"))
		print(" cols", t, cols)
		print(" n", con.execute(f"SELECT COUNT(*) FROM {t}").fetchone())
		print(" sample", con.execute(f"SELECT * FROM {t} LIMIT 2").fetchall())
