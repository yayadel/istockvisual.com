"""Dump local D1 row data (no schema / migrations) for remote import."""

from __future__ import annotations

import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = (
	ROOT
	/ ".wrangler/state/v3/d1/miniflare-D1DatabaseObject"
	/ "9ba2b04bf514d9facfd57ed57d849e77241a7adc99d1c1545d06688b43d84248.sqlite"
)
OUT = ROOT / ".tmp" / "d1-data.sql"
ORDER = [
	"user",
	"session",
	"account",
	"verification",
	"keyword",
	"generated_asset",
	"keyword_content",
	"download_log",
]


def main() -> None:
	OUT.parent.mkdir(parents=True, exist_ok=True)
	con = sqlite3.connect(f"file:{SRC}?mode=ro", uri=True)
	existing = {
		row[0]
		for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'")
	}
	tables = [name for name in ORDER if name in existing]
	print("dumping", tables, "from", SRC.name)
	with OUT.open("w", encoding="utf-8", newline="\n") as fh:
		fh.write("PRAGMA defer_foreign_keys=TRUE;\n")
		for table in tables:
			quoted = f'"{table}"'
			rows = con.execute(f"SELECT * FROM {quoted}")
			cols = [info[0] for info in rows.description]
			col_sql = ", ".join(f'"{c}"' for c in cols)
			batch: list[str] = []
			batch_chars = 0
			row_limit = 1 if table in {"generated_asset", "keyword_content"} else 25

			def flush() -> None:
				nonlocal batch_chars
				if not batch:
					return
				fh.write(f"INSERT INTO {quoted} ({col_sql}) VALUES\n")
				fh.write(",\n".join(batch))
				fh.write(";\n")
				batch.clear()
				batch_chars = 0

			for row in rows:
				values = []
				for value in row:
					if value is None:
						values.append("NULL")
					elif isinstance(value, (int, float)):
						values.append(str(value))
					elif isinstance(value, bytes):
						values.append("X'" + value.hex() + "'")
					else:
						text = str(value).replace("'", "''")
						values.append("'" + text + "'")
				item = "(" + ", ".join(values) + ")"
				if batch and (len(batch) >= row_limit or batch_chars + len(item) > 40_000):
					flush()
				batch.append(item)
				batch_chars += len(item)
			flush()
			n = con.execute(f"SELECT COUNT(*) FROM {quoted}").fetchone()[0]
			print(table, n)
	con.close()
	print("wrote", OUT, "bytes", OUT.stat().st_size)


if __name__ == "__main__":
	main()
