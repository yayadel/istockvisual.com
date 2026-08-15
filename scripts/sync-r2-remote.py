"""Upload local Miniflare R2 objects to remote via Cloudflare API."""

from __future__ import annotations

import json
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
R2_DB = (
	ROOT
	/ ".wrangler/state/v3/r2/miniflare-R2BucketObject"
	/ "110b87d4088835d4d425a0b1781c66ae2c7ea6510b9619f1184fdfb989a480f7.sqlite"
)
BLOBS = ROOT / ".wrangler/state/v3/r2/istockvisual-media/blobs"
BUCKET = "istockvisual-media"


def load_dev_vars() -> dict[str, str]:
	env: dict[str, str] = {}
	path = ROOT / ".dev.vars"
	for raw in path.read_text(encoding="utf-8").splitlines():
		line = raw.strip()
		if not line or line.startswith("#") or "=" not in line:
			continue
		key, value = line.split("=", 1)
		env[key.strip()] = value.strip()
	return env


def object_url(account_id: str, key: str) -> str:
	encoded = urllib.parse.quote(key, safe="/")
	return (
		f"https://api.cloudflare.com/client/v4/accounts/{account_id}"
		f"/r2/buckets/{BUCKET}/objects/{encoded}"
	)


def list_keys(account_id: str, token: str) -> set[str]:
	keys: set[str] = set()
	cursor = ""
	while True:
		qs = f"?per_page=1000&cursor={urllib.parse.quote(cursor)}" if cursor else "?per_page=1000"
		url = (
			f"https://api.cloudflare.com/client/v4/accounts/{account_id}"
			f"/r2/buckets/{BUCKET}/objects{qs}"
		)
		req = urllib.request.Request(
			url,
			headers={"Authorization": f"Bearer {token}"},
		)
		with urllib.request.urlopen(req, timeout=60) as resp:
			payload = json.loads(resp.read().decode("utf-8"))
		if not payload.get("success"):
			raise RuntimeError(payload)
		for item in payload.get("result") or []:
			key = item.get("key") if isinstance(item, dict) else None
			if key:
				keys.add(key)
		info = payload.get("result_info") or {}
		cursor = info.get("cursor") or ""
		if not cursor or not info.get("is_truncated"):
			break
	return keys


def put_object(account_id: str, token: str, key: str, body: bytes, content_type: str) -> None:
	req = urllib.request.Request(
		object_url(account_id, key),
		data=body,
		method="PUT",
		headers={
			"Authorization": f"Bearer {token}",
			"Content-Type": content_type or "application/octet-stream",
		},
	)
	last_error: Exception | None = None
	for attempt in range(6):
		try:
			with urllib.request.urlopen(req, timeout=180) as resp:
				payload = json.loads(resp.read().decode("utf-8"))
			if not payload.get("success"):
				raise RuntimeError(f"{key}: {payload}")
			return
		except (urllib.error.URLError, TimeoutError, urllib.error.HTTPError) as exc:
			last_error = exc
			if isinstance(exc, urllib.error.HTTPError) and exc.code in {400, 401, 403, 404}:
				detail = exc.read().decode("utf-8", errors="replace")
				raise RuntimeError(f"{exc.code} {key}: {detail}") from exc
			time.sleep(min(2 ** attempt, 20))
	raise RuntimeError(f"{key}: {last_error}") from last_error


def main() -> None:
	env = load_dev_vars()
	account_id = env.get("CLOUDFLARE_ACCOUNT_ID") or os.environ.get("CLOUDFLARE_ACCOUNT_ID")
	token = env.get("CLOUDFLARE_API_TOKEN") or os.environ.get("CLOUDFLARE_API_TOKEN")
	if not account_id or not token:
		print("Missing CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN", file=sys.stderr)
		sys.exit(1)

	con = sqlite3.connect(f"file:{R2_DB}?mode=ro", uri=True)
	rows = con.execute(
		"SELECT key, blob_id, http_metadata FROM _mf_objects ORDER BY key"
	).fetchall()
	con.close()
	print("objects", len(rows))

	def upload(row: tuple[str, str, str | None]) -> str:
		key, blob_id, meta_raw = row
		blob_path = BLOBS / blob_id
		if not blob_path.is_file():
			raise FileNotFoundError(blob_path)
		content_type = "application/octet-stream"
		if meta_raw:
			try:
				content_type = json.loads(meta_raw).get("contentType") or content_type
			except json.JSONDecodeError:
				pass
		put_object(account_id, token, key, blob_path.read_bytes(), content_type)
		return key

	ok = 0
	with ThreadPoolExecutor(max_workers=8) as pool:
		futures = [pool.submit(upload, row) for row in rows]
		for future in as_completed(futures):
			key = future.result()
			ok += 1
			if ok % 25 == 0 or ok == len(rows):
				print(f"uploaded {ok}/{len(rows)} {key}")


if __name__ == "__main__":
	main()
