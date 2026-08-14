#!/usr/bin/env python3
"""Step-1 asset metadata via Together API (Gemma 4). Gemini path is unchanged."""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from together import Together

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
	sys.path.insert(0, str(SCRIPT_DIR))

import gemini_meta as gm


DEFAULT_MODEL = "google/gemma-4-31B-it"
JSON_ONLY = (
	"Respond with a single JSON object only (no markdown fences, no extra text). "
	"Use exactly the keys required by the host prompt."
)


def usage_to_dict(response, model: str) -> dict:
	usage = getattr(response, "usage", None)
	raw: dict = {}
	if usage is None:
		raw = {}
	elif hasattr(usage, "model_dump"):
		raw = usage.model_dump(exclude_none=True)
	else:
		for key in ("prompt_tokens", "completion_tokens", "total_tokens"):
			value = getattr(usage, key, None)
			if value is not None:
				raw[key] = value

	input_tokens = int(raw.get("prompt_tokens") or 0)
	output_tokens = int(raw.get("completion_tokens") or 0)
	total_tokens = int(raw.get("total_tokens") or 0)
	if not total_tokens:
		total_tokens = input_tokens + output_tokens

	input_usd_per_m = 0.39
	output_usd_per_m = 0.97
	cost_usd = (input_tokens / 1_000_000) * input_usd_per_m + (
		output_tokens / 1_000_000
	) * output_usd_per_m

	return {
		"raw": raw,
		"model": model,
		"provider": "together",
		"inputTokens": input_tokens,
		"outputTokens": output_tokens,
		"thoughtTokens": 0,
		"cachedTokens": 0,
		"billedOutputTokens": output_tokens,
		"totalTokens": total_tokens,
		"pricing": {
			"inputUsdPerMillion": input_usd_per_m,
			"outputUsdPerMillion": output_usd_per_m,
			"note": "Together Gemma 4 31B IT serverless (May 2026 list price)",
		},
		"estimatedCostUsd": round(cost_usd, 8),
	}


def generate_meta(keyword: str) -> tuple[gm.AssetMeta, dict]:
	dev_vars = gm.load_dev_vars()
	gm.apply_proxy(dev_vars)

	api_key = os.environ.get("TOGETHER_API_KEY") or dev_vars.get("TOGETHER_API_KEY") or ""
	if not api_key:
		raise SystemExit("TOGETHER_API_KEY missing in env or .dev.vars")

	model = (
		os.environ.get("TOGETHER_MODEL")
		or dev_vars.get("TOGETHER_MODEL")
		or DEFAULT_MODEL
	)
	max_output = int(
		os.environ.get("TOGETHER_MAX_OUTPUT_TOKENS")
		or dev_vars.get("TOGETHER_MAX_OUTPUT_TOKENS")
		or "8192"
	)

	os.environ["TOGETHER_API_KEY"] = api_key
	client = Together(api_key=api_key)
	prompt = f"{gm.build_prompt(keyword)}\n\n{JSON_ONLY}"

	kwargs: dict = {
		"model": model,
		"messages": [{"role": "user", "content": prompt}],
		"temperature": 0.75,
		"max_tokens": max_output,
		"response_format": {"type": "json_object"},
	}

	response = client.chat.completions.create(**kwargs)
	choice = (response.choices or [None])[0]
	raw = getattr(getattr(choice, "message", None), "content", None) if choice else None
	if not raw:
		raise SystemExit("Together Gemma returned empty output")

	try:
		meta = gm.AssetMeta.model_validate_json(gm.extract_json(raw))
	except Exception:
		data = json.loads(gm.extract_json(raw))
		meta = gm.AssetMeta.model_validate(data)

	usage = usage_to_dict(response, model)
	usage["keyword"] = keyword.strip()
	usage["recordedAt"] = datetime.now(timezone.utc).isoformat()
	return gm.ensure_content_categories(meta, keyword), usage


def append_usage_log(usage: dict) -> None:
	log_path = gm.ROOT / ".tmp" / "together-usage.jsonl"
	log_path.parent.mkdir(parents=True, exist_ok=True)
	with log_path.open("a", encoding="utf-8") as handle:
		handle.write(json.dumps(usage, ensure_ascii=False) + "\n")


def main() -> None:
	parser = argparse.ArgumentParser(description="Generate asset metadata with Together Gemma 4")
	parser.add_argument("keyword", help="Topic keyword")
	parser.add_argument("--out", help="Optional path to write JSON (default: stdout)")
	args = parser.parse_args()

	meta, usage = generate_meta(args.keyword)
	payload = meta.model_dump()
	payload["depictedElements"] = []
	payload["relatedSearchQueries"] = []
	payload["contentCategories"] = (
		gm.normalize_content_categories(payload.get("contentCategories"))
		or payload.get("contentCategories")
		or []
	)[:1]

	text = json.dumps(payload, ensure_ascii=False, indent=2)
	append_usage_log(usage)
	print(
		"usage: "
		f"input={usage['inputTokens']} output={usage['outputTokens']} "
		f"total={usage['totalTokens']} costUSD={usage['estimatedCostUsd']}",
		file=sys.stderr,
	)
	if args.out:
		out_path = Path(args.out)
		out_path.parent.mkdir(parents=True, exist_ok=True)
		out_path.write_text(text + "\n", encoding="utf-8")
		usage_path = out_path.with_suffix(".usage.json")
		usage_path.write_text(json.dumps(usage, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
		print(str(out_path), file=sys.stderr)
		print(
			f"contentCategories: {json.dumps(payload.get('contentCategories'), ensure_ascii=False)}",
			file=sys.stderr,
		)
	print(text)


if __name__ == "__main__":
	main()
