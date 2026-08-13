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
PLACEHOLDER = "[Insert topic keyword here]"


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
	tags: List[str] = Field(
		min_length=40,
		description=(
			"At least 40 unique English tags merging topic keywords, "
			"category/subject labels, and depicted objects/elements"
		),
	)
	relatedSearchQueries: List[str] = Field(description="Related search queries")
	imagePageTitle: str = Field(
		description="Title-case English title containing the topic keyword"
	)
	pageShortDescription: str = Field(
		description="Sentence-case short description containing the topic keyword"
	)
	medium: str = Field(description="Photograph | Illustration | 3D Graphic")


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
	if PLACEHOLDER not in template:
		raise SystemExit("host_prompt.txt missing placeholder")
	return template.replace(PLACEHOLDER, keyword.strip())


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


def generate_meta(keyword: str) -> AssetMeta:
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
		or "medium"
	)

	client = genai.Client(api_key=api_key)
	prompt = build_prompt(keyword)

	tools = [{"type": "google_search"}]
	generation_config = {
		"max_output_tokens": 65536,
		"thinking_level": thinking,
	}

	interaction = client.interactions.create(
		model=model,
		input=prompt,
		tools=tools,
		generation_config=generation_config,
		response_format={
			"type": "text",
			"mime_type": "application/json",
			"schema": AssetMeta.model_json_schema(),
		},
	)

	raw = getattr(interaction, "output_text", None)
	if not raw and getattr(interaction, "steps", None):
		last = interaction.steps[-1]
		raw = str(last)
	if not raw:
		raise SystemExit("Gemini returned empty output")

	try:
		return AssetMeta.model_validate_json(extract_json(raw))
	except Exception:
		# Fallback if schema validation fails but JSON is close
		data = json.loads(extract_json(raw))
		return AssetMeta.model_validate(data)


def main() -> None:
	parser = argparse.ArgumentParser(description="Generate asset metadata with Gemini")
	parser.add_argument("keyword", help="Topic keyword")
	parser.add_argument(
		"--out",
		help="Optional path to write JSON (default: stdout)",
	)
	args = parser.parse_args()

	meta = generate_meta(args.keyword)
	payload = meta.model_dump()
	# Depicted elements / categories / keyword labels are merged into tags (40+).
	payload["depictedElements"] = []
	text = json.dumps(payload, ensure_ascii=False, indent=2)
	if args.out:
		out_path = Path(args.out)
		out_path.parent.mkdir(parents=True, exist_ok=True)
		out_path.write_text(text + "\n", encoding="utf-8")
		print(str(out_path), file=sys.stderr)
	print(text)


if __name__ == "__main__":
	main()
