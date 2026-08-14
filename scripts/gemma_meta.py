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


def append_response_log(record: dict) -> Path:
	log_dir = gm.ROOT / ".tmp"
	log_dir.mkdir(parents=True, exist_ok=True)
	jsonl_path = log_dir / "gemma4-log.jsonl"
	with jsonl_path.open("a", encoding="utf-8") as handle:
		handle.write(json.dumps(record, ensure_ascii=False) + "\n")
	keyword = str(record.get("keyword") or "keyword")
	slug = "".join(ch.lower() if ch.isalnum() else "-" for ch in keyword).strip("-")
	slug = "-".join(part for part in slug.split("-") if part)[:60] or "keyword"
	pretty_path = log_dir / f"gemma4-{slug}.json"
	pretty_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
	return pretty_path


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

	recorded_at = datetime.now(timezone.utc).isoformat()
	response = client.chat.completions.create(**kwargs)
	choice = (response.choices or [None])[0]
	message = getattr(choice, "message", None) if choice else None
	content = str(getattr(message, "content", None) or "")
	reasoning = ""
	if message is not None:
		for field in ("reasoning", "reasoning_content"):
			value = getattr(message, field, None)
			if value:
				reasoning = str(value)
				break
	finish_reason = str(getattr(choice, "finish_reason", "") or "") if choice else ""
	raw_text = content.strip() or reasoning.strip()

	log_record: dict = {
		"recordedAt": recorded_at,
		"provider": "together",
		"model": model,
		"keyword": keyword.strip(),
		"finishReason": finish_reason,
		"responseId": getattr(response, "id", None),
		"rawContent": content,
		"reasoning": reasoning,
		"parseOk": False,
		"parseError": None,
		"parsedMeta": None,
	}

	if not raw_text:
		log_record["parseError"] = "Together Gemma returned empty output"
		append_response_log(log_record)
		raise SystemExit("Together Gemma returned empty output")

	try:
		meta = gm.AssetMeta.model_validate_json(gm.extract_json(raw_text))
	except Exception as first_error:
		try:
			data = json.loads(gm.extract_json(raw_text))
			meta = gm.AssetMeta.model_validate(data)
		except Exception as second_error:
			log_record["parseError"] = f"{first_error}; {second_error}"
			append_response_log(log_record)
			raise SystemExit(f"Together Gemma JSON parse failed: {second_error}") from second_error

	meta = gm.ensure_content_categories(meta, keyword)
	usage = usage_to_dict(response, model)
	usage["keyword"] = keyword.strip()
	usage["recordedAt"] = recorded_at
	usage["finishReason"] = finish_reason
	usage["hadReasoning"] = bool(reasoning)
	log_record["parseOk"] = True
	log_record["parsedMeta"] = meta.model_dump()
	log_record["usage"] = usage
	pretty_path = append_response_log(log_record)
	usage["logPath"] = pretty_path.relative_to(gm.ROOT).as_posix()
	return meta, usage


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
	print("log: .tmp/gemma4-log.jsonl", file=sys.stderr)
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
