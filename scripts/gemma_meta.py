#!/usr/bin/env python3
"""Step-1 asset metadata via Together API (Gemma 4). Gemini path is unchanged."""

from __future__ import annotations

import argparse
import json
import os
import re
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


def _norm_key(key: str) -> str:
	return re.sub(r"[^a-z0-9]", "", str(key).lower())


_CANONICAL_KEYS = {
	"imageprompt": "imagePrompt",
	"imagegenerationprompt": "imagePrompt",
	"imagecreationdescription": "imageCreationDescription",
	"assetusagetips": "assetUsageTips",
	"assetfunctionalityusagetips": "assetUsageTips",
	"colorpalette": "colorPalette",
	"tags": "tags",
	"imagepagetitle": "imagePageTitle",
	"pageshortdescription": "pageShortDescription",
	"contentcategories": "contentCategories",
	"medium": "medium",
	"depictedelements": "depictedElements",
	"relatedsearchqueries": "relatedSearchQueries",
}


def coerce_gemma_payload(data: dict) -> dict:
	"""Map Gemma's near-miss keys onto the Gemini AssetMeta schema."""
	normalized: dict = {}
	for key, value in data.items():
		canon = _CANONICAL_KEYS.get(_norm_key(key), key)
		if canon not in normalized or not normalized.get(canon):
			normalized[canon] = value
	data = normalized
	aliases = {
		"imagePrompt": (
			"image_generation_prompt",
			"imageGenerationPrompt",
			"image_prompt",
			"prompt",
		),
		"imageCreationDescription": (
			"image_creation_description",
			"creation_description",
			"creationDescription",
		),
		"assetUsageTips": (
			"asset_usage_tips",
			"asset_functionality_usage_tips",
			"assetFunctionalityUsageTips",
			"usageTips",
			"assetUsageTip",
			"functionalityUsageTips",
			"usage_tips",
			"tips",
		),
		"colorPalette": ("color_palette", "palette"),
		"imagePageTitle": ("image_page_title", "page_title", "title"),
		"pageShortDescription": (
			"page_short_description",
			"short_description",
			"shortDescription",
		),
		"contentCategories": ("content_categories", "categories"),
		"tags": ("tag_list", "keywords"),
		"medium": ("media_type", "asset_medium"),
	}
	out = dict(data)
	for dest, keys in aliases.items():
		if out.get(dest):
			continue
		for key in keys:
			value = out.get(key)
			if value:
				out[dest] = value
				break
	if not out.get("assetUsageTips"):
		for key in (
			"assetFunctionalityUsageTips",
			"usageTips",
			"assetUsageTip",
			"functionalityUsageTips",
			"tips",
		):
			value = out.get(key)
			if isinstance(value, str) and value.strip():
				out["assetUsageTips"] = value.strip()
				break
	if not out.get("imagePrompt"):
		creation = out.get("imageCreationDescription")
		if isinstance(creation, str) and len(creation.strip()) > 80:
			out["imagePrompt"] = creation.strip()
	palette = out.get("colorPalette")
	if isinstance(palette, list):
		fixed = []
		for item in palette:
			if not isinstance(item, dict):
				continue
			lookup = {_norm_key(k): v for k, v in item.items()}
			name = lookup.get("name") or lookup.get("color") or lookup.get("label") or "Color"
			hex_value = lookup.get("hex") or lookup.get("value") or "#888888"
			fixed.append({"name": str(name), "hex": str(hex_value)})
		out["colorPalette"] = fixed
	medium = str(out.get("medium") or "").strip()
	lower = medium.lower()
	if lower in {"photograph", "photo", "photography"}:
		out["medium"] = "Photograph"
	elif "illustrat" in lower or lower == "vector":
		out["medium"] = "Illustration"
	elif "3d" in lower:
		out["medium"] = "3D Graphic"
	elif not medium:
		prompt = str(out.get("imagePrompt") or "").lower()
		if "illustrat" in prompt or "vector" in prompt:
			out["medium"] = "Illustration"
		elif "3d" in prompt:
			out["medium"] = "3D Graphic"
		else:
			out["medium"] = "Photograph"
	return out


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
		"messages": [
			{
				"role": "system",
				"content": "Direct JSON output only. Do not think, reason, or explain. Return one JSON object.",
			},
			{"role": "user", "content": prompt},
		],
		"temperature": 0.75,
		"max_tokens": max_output,
		"response_format": {"type": "json_object"},
		"extra_body": {
			"enable_thinking": False,
			"chat_template_kwargs": {"enable_thinking": False},
		},
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
		"thinkingEnabled": False,
		"parseOk": False,
		"parseError": None,
		"parsedMeta": None,
	}

	if not raw_text:
		log_record["parseError"] = "Together Gemma returned empty output"
		append_response_log(log_record)
		raise SystemExit("Together Gemma returned empty output")

	try:
		payload = coerce_gemma_payload(json.loads(gm.extract_json(raw_text)))
		meta = gm.AssetMeta.model_validate(payload)
	except Exception as first_error:
		try:
			payload = coerce_gemma_payload(json.loads(gm.extract_json(raw_text)))
			meta = gm.AssetMeta.model_validate(payload)
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
