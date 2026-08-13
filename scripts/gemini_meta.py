#!/usr/bin/env python3
"""Step-1 asset metadata via Gemini Interactions API (google-genai)."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import List

from google import genai
from pydantic import BaseModel, Field


ROOT = Path(__file__).resolve().parents[1]
DEV_VARS = ROOT / ".dev.vars"
HOST_PROMPT = ROOT / "host_prompt.txt"
CATEGORIES_FILE = ROOT / "categories"
KEYWORD_PLACEHOLDER = "[Insert topic keyword here]"
CATEGORIES_PLACEHOLDER = "[Insert allowed content categories here]"


def load_content_categories() -> list[str]:
	raw = CATEGORIES_FILE.read_text(encoding="utf-8").strip()
	return [item.strip() for item in raw.split(",") if item.strip()]


CONTENT_CATEGORIES = load_content_categories()
CONTENT_CATEGORY_LOOKUP = {item.lower(): item for item in CONTENT_CATEGORIES}
CONTENT_CATEGORIES_CSV = ", ".join(CONTENT_CATEGORIES)


class ColorSwatch(BaseModel):
	name: str = Field(description="Color name")
	hex: str = Field(description="HEX color like #RRGGBB")


class AssetMeta(BaseModel):
	imagePrompt: str = Field(description="Detailed English prompt for image generation")
	imageCreationDescription: str = Field(
		description="English description containing the topic keyword"
	)
	assetUsageTips: str = Field(description="English usage tips for designers/marketers")
	colorPalette: List[ColorSwatch] = Field(description="Palette with HEX codes")
	tags: List[str] = Field(min_length=40, description=">=40 unique title-case tags")
	contentCategories: List[str] = Field(
		min_length=1,
		max_length=1,
		description="Exactly 1 allowed category label for the depicted scene",
	)
	imagePageTitle: str = Field(description="Title-case title containing the keyword")
	pageShortDescription: str = Field(
		description="Sentence-case short description containing the keyword"
	)
	medium: str = Field(description="Photograph | Illustration | 3D Graphic")


def env_flag(dev_vars: dict[str, str], key: str, default: str = "0") -> bool:
	raw = (os.environ.get(key) or dev_vars.get(key) or default).strip().lower()
	return raw in {"1", "true", "yes", "on"}


def response_schema() -> dict:
	"""JSON schema for structured output — keep it small; rules live in host_prompt."""
	schema = AssetMeta.model_json_schema()
	props = schema.get("properties") or {}
	cats = props.get("contentCategories")
	if isinstance(cats, dict):
		cats["minItems"] = 1
		cats["maxItems"] = 1
		cats["items"] = {"type": "string", "enum": CONTENT_CATEGORIES}
	medium = props.get("medium")
	if isinstance(medium, dict):
		medium["enum"] = ["Photograph", "Illustration", "3D Graphic"]
	return schema


def load_dev_vars(path: Path = DEV_VARS) -> dict[str, str]:
	out: dict[str, str] = {}
	if not path.exists():
		return out
	for line in path.read_text(encoding="utf-8").splitlines():
		trimmed = line.strip()
		if not trimmed or trimmed.startswith("#") or "=" not in trimmed:
			continue
		key, value = trimmed.split("=", 1)
		value = value.strip().strip('"').strip("'")
		out[key.strip()] = value
	return out


def apply_proxy(dev_vars: dict[str, str]) -> None:
	proxy = (
		os.environ.get("HTTPS_PROXY")
		or os.environ.get("HTTP_PROXY")
		or os.environ.get("ALL_PROXY")
		or dev_vars.get("HTTPS_PROXY")
		or dev_vars.get("HTTP_PROXY")
		or ""
	)
	if proxy:
		os.environ.setdefault("HTTPS_PROXY", proxy)
		os.environ.setdefault("HTTP_PROXY", proxy)


def build_prompt(keyword: str) -> str:
	template = HOST_PROMPT.read_text(encoding="utf-8")
	if KEYWORD_PLACEHOLDER not in template:
		raise SystemExit("host_prompt.txt missing keyword placeholder")
	if CATEGORIES_PLACEHOLDER not in template:
		raise SystemExit("host_prompt.txt missing content-categories placeholder")
	return (
		template.replace(CATEGORIES_PLACEHOLDER, CONTENT_CATEGORIES_CSV).replace(
			KEYWORD_PLACEHOLDER, keyword.strip()
		)
	)


def extract_json(text: str) -> str:
	trimmed = text.strip()
	fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", trimmed, re.I)
	if fenced:
		return fenced.group(1).strip()
	start = trimmed.find("{")
	end = trimmed.rfind("}")
	if start >= 0 and end > start:
		return trimmed[start : end + 1]
	return trimmed


def normalize_content_categories(values: list[str] | None) -> list[str]:
	out: list[str] = []
	seen: set[str] = set()
	for value in values or []:
		if not isinstance(value, str):
			continue
		matched = CONTENT_CATEGORY_LOOKUP.get(value.strip().lower())
		if not matched:
			continue
		key = matched.lower()
		if key in seen:
			continue
		seen.add(key)
		out.append(matched)
		if len(out) >= 1:
			break
	return out


def fallback_content_categories(title: str, keyword: str) -> list[str]:
	"""Conservative keyword hit when the model omits/invalidates categories."""
	text = f"{title} {keyword}".lower()
	aliases: dict[str, list[str]] = {
		"Technology": [
			"tech",
			"digital",
			"hardware",
			"software",
			"computer",
			"device",
			"wireless",
			"mouse",
			"keyboard",
			"headset",
			"laptop",
			"gaming",
			"peripheral",
		],
		"AI": ["artificial intelligence", "machine learning", "neural", " llm"],
		"Coffee": ["coffee", "espresso", "latte", "cafe"],
		"Food": ["food", "meal", "cuisine", "restaurant"],
		"Nature": ["nature", "forest", "outdoor", "wilderness"],
		"Landscapes": ["landscape", "mountain", "valley", "scenic"],
		"Architecture": ["architecture", "building", "roof", "facade"],
		"Interior": ["interior", "room", "furniture", "indoor"],
		"Medical": ["medical", "hospital", "clinic", "doctor"],
		"Health": ["health", "wellness", "fitness"],
		"Sports": ["athlete", "soccer", "basketball", "tennis", "stadium"],
		"Advertising": ["advertising", "marketing", "campaign", "brand"],
		"E-commerce": ["e-commerce", "ecommerce", "shopping", "retail", "product"],
		"Photography": ["photo", "photograph", "studio"],
		"Business": ["business", "corporate", "office", "startup"],
		"Finance": ["finance", "bank", "invest", "currency"],
		"People": ["people", "person", "portrait", "crowd"],
		"Workplace": ["workplace", "desk", "meeting"],
	}
	scored: list[tuple[str, int]] = []
	for label in CONTENT_CATEGORIES:
		score = 0
		if re.search(rf"(?<![a-z0-9]){re.escape(label.lower())}(?![a-z0-9])", text):
			score += 12
		for alias in aliases.get(label, []):
			if re.search(rf"(?<![a-z0-9]){re.escape(alias.lower())}(?![a-z0-9])", text):
				score += 6
		if score:
			scored.append((label, score))
	scored.sort(key=lambda item: (-item[1], item[0]))
	return [label for label, _ in scored[:1]]


def ensure_content_categories(meta: AssetMeta, keyword: str) -> AssetMeta:
	cats = normalize_content_categories(meta.contentCategories)
	if not cats:
		cats = fallback_content_categories(meta.imagePageTitle or "", keyword)
	if not cats:
		cats = ["Photography"] if "photo" in (meta.medium or "").lower() else ["Advertising"]
	meta.contentCategories = cats[:1]
	return meta


def usage_to_dict(interaction) -> dict:
	usage = getattr(interaction, "usage", None) or getattr(interaction, "usage_metadata", None)
	raw: dict = {}
	if usage is None:
		raw = {}
	elif hasattr(usage, "model_dump"):
		raw = usage.model_dump(exclude_none=True)
	elif hasattr(usage, "to_json_dict"):
		raw = usage.to_json_dict()
	else:
		for key in (
			"total_tokens",
			"total_input_tokens",
			"total_output_tokens",
			"total_thought_tokens",
			"total_cached_tokens",
			"total_tool_use_tokens",
			"prompt_token_count",
			"candidates_token_count",
			"thoughts_token_count",
			"total_token_count",
			"cached_content_token_count",
		):
			value = getattr(usage, key, None)
			if value is not None:
				raw[key] = value

	input_tokens = int(raw.get("total_input_tokens") or raw.get("prompt_token_count") or 0)
	output_tokens = int(raw.get("total_output_tokens") or raw.get("candidates_token_count") or 0)
	thought_tokens = int(raw.get("total_thought_tokens") or raw.get("thoughts_token_count") or 0)
	cached_tokens = int(raw.get("total_cached_tokens") or raw.get("cached_content_token_count") or 0)
	total_tokens = int(raw.get("total_tokens") or raw.get("total_token_count") or 0)
	if not total_tokens:
		total_tokens = input_tokens + output_tokens + thought_tokens

	# Paid tier: thinking is billed at the output rate. If the API already folded
	# thoughts into output, don't double-count.
	if thought_tokens and output_tokens and total_tokens == input_tokens + output_tokens:
		billed_output = output_tokens
	else:
		billed_output = output_tokens + thought_tokens

	input_usd_per_m = 1.50
	output_usd_per_m = 7.50
	cost_usd = (input_tokens / 1_000_000) * input_usd_per_m + (
		billed_output / 1_000_000
	) * output_usd_per_m

	return {
		"raw": raw,
		"model": "",
		"inputTokens": input_tokens,
		"outputTokens": output_tokens,
		"thoughtTokens": thought_tokens,
		"cachedTokens": cached_tokens,
		"billedOutputTokens": billed_output,
		"totalTokens": total_tokens,
		"pricing": {
			"inputUsdPerMillion": input_usd_per_m,
			"outputUsdPerMillion": output_usd_per_m,
			"note": "Gemini 3.6 Flash paid tier; thinking billed as output",
		},
		"estimatedCostUsd": round(cost_usd, 8),
	}


def generate_meta(keyword: str) -> tuple[AssetMeta, dict]:
	dev_vars = load_dev_vars()
	apply_proxy(dev_vars)

	api_key = os.environ.get("GEMINI_API_KEY") or dev_vars.get("GEMINI_API_KEY") or ""
	if not api_key:
		raise SystemExit("GEMINI_API_KEY missing in env or .dev.vars")

	model = (
		os.environ.get("GEMINI_MODEL")
		or dev_vars.get("GEMINI_MODEL")
		or "gemini-3.6-flash"
	)
	# Accept either "gemini-3.6-flash" or "models/gemini-3.6-flash"
	model = model.removeprefix("models/")

	thinking = (
		os.environ.get("GEMINI_THINKING_LEVEL")
		or dev_vars.get("GEMINI_THINKING_LEVEL")
		or "low"
	)
	max_output = int(
		os.environ.get("GEMINI_MAX_OUTPUT_TOKENS")
		or dev_vars.get("GEMINI_MAX_OUTPUT_TOKENS")
		or "8192"
	)

	client = genai.Client(api_key=api_key)
	prompt = build_prompt(keyword)

	generation_config = {
		"max_output_tokens": max_output,
		"thinking_level": thinking,
	}

	request: dict = {
		"model": model,
		"input": prompt,
		"generation_config": generation_config,
		"response_format": {
			"type": "text",
			"mime_type": "application/json",
			"schema": response_schema(),
		},
	}
	# Search snippets are billed as extra input tokens and are not required
	# for the host_prompt JSON. Opt in with GEMINI_GOOGLE_SEARCH=1.
	if env_flag(dev_vars, "GEMINI_GOOGLE_SEARCH"):
		request["tools"] = [{"type": "google_search"}]

	interaction = client.interactions.create(**request)

	raw = getattr(interaction, "output_text", None)
	if not raw and getattr(interaction, "steps", None):
		last = interaction.steps[-1]
		raw = str(last)
	if not raw:
		raise SystemExit("Gemini returned empty output")

	try:
		meta = AssetMeta.model_validate_json(extract_json(raw))
	except Exception:
		# Fallback if schema validation fails but JSON is close
		data = json.loads(extract_json(raw))
		meta = AssetMeta.model_validate(data)

	usage = usage_to_dict(interaction)
	usage["model"] = model
	usage["thinkingLevel"] = thinking
	usage["googleSearch"] = bool(request.get("tools"))
	usage["keyword"] = keyword.strip()
	return ensure_content_categories(meta, keyword), usage


def append_usage_log(usage: dict) -> None:
	log_path = ROOT / ".tmp" / "gemini-usage.jsonl"
	log_path.parent.mkdir(parents=True, exist_ok=True)
	with log_path.open("a", encoding="utf-8") as handle:
		handle.write(json.dumps(usage, ensure_ascii=False) + "\n")


def main() -> None:
	parser = argparse.ArgumentParser(description="Generate asset metadata with Gemini")
	parser.add_argument("keyword", help="Topic keyword")
	parser.add_argument(
		"--out",
		help="Optional path to write JSON (default: stdout)",
	)
	args = parser.parse_args()

	meta, usage = generate_meta(args.keyword)
	payload = meta.model_dump()
	# contentCategories is the topical category field (exactly 1 from /categories).
	# depictedElements is unused; tags already cover depicted objects.
	# relatedSearchQueries is no longer generated.
	payload["depictedElements"] = []
	payload["relatedSearchQueries"] = []
	payload["contentCategories"] = (
		normalize_content_categories(payload.get("contentCategories"))
		or payload.get("contentCategories")
		or []
	)[:1]

	text = json.dumps(payload, ensure_ascii=False, indent=2)
	append_usage_log(usage)
	print(
		"usage: "
		f"input={usage['inputTokens']} output={usage['outputTokens']} "
		f"thoughts={usage['thoughtTokens']} billedOutput={usage['billedOutputTokens']} "
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
