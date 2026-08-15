import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1] / ".wrangler/state/v3/d1/miniflare-D1DatabaseObject"
for p in sorted(root.glob("*.sqlite")):
    print("---", p.name, p.stat().st_size)
    con = sqlite3.connect(f"file:{p}?mode=ro", uri=True)
    tables = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")]
    print("tables", tables)
    for t in ("keyword", "generated_asset", "keyword_content", "user", "session"):
        if t in tables:
            print(t, con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0])
    con.close()
