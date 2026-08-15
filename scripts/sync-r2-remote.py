"""Upload local Miniflare R2 objects to the remote istockvisual-media bucket."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import sqlite3
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

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


def sign(key: bytes, msg: str) -> bytes:
	return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def authorization(
	*,
	method: str,
	url_path: str,
	host: str,
	region: str,
	access_key: str,
	secret_key: str,
	payload_hash: str,
	now: datetime,
	content_type: str,
) -> dict[str, str]:
	amz_date = now.strftime("%Y%m%dT%H%M%SZ")
	date_stamp = now.strftime("%Y%m%d")
	canonical_headers = (
		f"content-type:{content_type}\n"
		f"host:{host}\n"
		f"x-amz-content-sha256:{payload_hash}\n"
		f"x-amz-date:{amz_date}\n"
	)
	signed_headers = "content-type;host;x-amz-content-sha256;x-amz-date"
	canonical_request = "\n".join(
		[
			method,
			url_path,
			"",
			canonical_headers,
			signed_headers,
			payload_hash,
		]
	)
	credential_scope = f"{date_stamp}/{region}/s3/aws4_request"
	string_to_sign = "\n".join(
		[
			"AWS4-HMAC-SHA256",
			amz_date,
			credential_scope,
			hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
		]
	)
	k_date = sign(("AWS4" + secret_key).encode("utf-8"), date_stamp)
	k_region = hmac.new(k_date, region.encode("utf-8"), hashlib.sha256).digest()
	k_service = hmac.new(k_region, b"s3", hashlib.sha256).digest()
	k_signing = hmac.new(k_service, b"aws4_request", hashlib.sha256).digest()
	signature = hmac.new(k_signing, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
	return {
		"Authorization": (
			f"AWS4-HMAC-SHA256 Credential={access_key}/{credential_scope}, "
			f"SignedHeaders={signed_headers}, Signature={signature}"
		),
		"x-amz-date": amz_date,
		"x-amz-content-sha256": payload_hash,
		"content-type": content_type,
	}


def put_object(
	*,
	endpoint: str,
	access_key: str,
	secret_key: str,
	key: str,
	body: bytes,
	content_type: str,
) -> None:
	host = endpoint.split("://", 1)[1].rstrip("/")
	encoded_key = quote(key, safe="/")
	url_path = f"/{BUCKET}/{encoded_key}"
	payload_hash = hashlib.sha256(body).hexdigest()
	now = datetime.now(timezone.utc)
	headers = authorization(
		method="PUT",
		url_path=url_path,
		host=host,
		region="auto",
		access_key=access_key,
		secret_key=secret_key,
		payload_hash=payload_hash,
		now=now,
		content_type=content_type or "application/octet-stream",
	)
	req = urllib.request.Request(
		f"{endpoint.rstrip('/')}{url_path}",
		data=body,
		method="PUT",
		headers=headers,
	)
	try:
		with urllib.request.urlopen(req) as resp:
			resp.read()
	except urllib.error.HTTPError as exc:
		detail = exc.read().decode("utf-8", errors="replace")
		raise RuntimeError(f"{exc.code} {key}: {detail}") from exc


def main() -> None:
	env = load_dev_vars()
	access_key = env.get("R2_ACCESS_KEY_ID") or os.environ.get("R2_ACCESS_KEY_ID")
	secret_key = env.get("R2_SECRET_ACCESS_KEY") or os.environ.get("R2_SECRET_ACCESS_KEY")
	endpoint = env.get("R2_ENDPOINT") or os.environ.get("R2_ENDPOINT")
	if not access_key or not secret_key or not endpoint:
		print("Missing R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ENDPOINT", file=sys.stderr)
		sys.exit(1)

	con = sqlite3.connect(f"file:{R2_DB}?mode=ro", uri=True)
	rows = con.execute(
		"SELECT key, blob_id, http_metadata FROM _mf_objects ORDER BY key"
	).fetchall()
	con.close()
	print("objects", len(rows))
	ok = 0
	for key, blob_id, meta_raw in rows:
		blob_path = BLOBS / blob_id
		if not blob_path.is_file():
			raise FileNotFoundError(blob_path)
		content_type = "application/octet-stream"
		if meta_raw:
			try:
				content_type = json.loads(meta_raw).get("contentType") or content_type
			except json.JSONDecodeError:
				pass
		body = blob_path.read_bytes()
		put_object(
			endpoint=endpoint,
			access_key=access_key,
			secret_key=secret_key,
			key=key,
			body=body,
			content_type=content_type,
		)
		ok += 1
		if ok % 25 == 0 or ok == len(rows):
			print(f"uploaded {ok}/{len(rows)} {key}")


if __name__ == "__main__":
	main()
