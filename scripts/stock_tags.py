#!/usr/bin/env python3
"""Stock tag sanitizer — mirror of src/lib/stock-tags.ts. Keep in sync."""

from __future__ import annotations

import re

STOCK_TAG_MIN = 18
STOCK_TAG_MAX = 28
STOCK_TAG_MAX_WORDS = 3

BLOCKED_EXACT = {
	"background",
	"image",
	"concept",
	"wallpaper",
	"stock photo",
	"stock image",
	"free download",
	"photo",
	"picture",
	"illustration",
	"graphic",
	"design element",
	"copy space",
}

BLOCKED_SUBJECTIVE = {
	"beautiful",
	"amazing",
	"stunning",
	"nice",
	"best",
	"perfect",
	"awesome",
	"incredible",
}

BLOCKED_SUFFIXES = [
	re.compile(r"\btravel$", re.I),
	re.compile(r"\bdestination$", re.I),
	re.compile(r"\binspiration$", re.I),
	re.compile(r"\bgetaway$", re.I),
	re.compile(r"\bretreat$", re.I),
	re.compile(r"\bmode$", re.I),
	re.compile(r"\bvacation$", re.I),
	re.compile(r"\bholiday$", re.I),
]

BLOCKED_PATTERNS = [
	re.compile(r"\bhow to\b", re.I),
	re.compile(r"\bnear me\b", re.I),
	re.compile(r"\bfor sale\b", re.I),
	re.compile(r"\bfree download\b", re.I),
	re.compile(r"\bstock image\b", re.I),
	re.compile(r"\bstock photo\b", re.I),
	re.compile(r"\bwatch online\b", re.I),
	re.compile(r"\bfull movie\b", re.I),
]

STOPWORDS = {
	"a",
	"an",
	"the",
	"and",
	"or",
	"for",
	"of",
	"in",
	"on",
	"at",
	"to",
	"by",
	"with",
	"from",
	"into",
	"over",
	"who",
	"what",
	"when",
	"where",
	"why",
	"how",
	"is",
	"are",
	"was",
	"were",
	"its",
	"this",
	"that",
	"your",
	"our",
}

TITLE_SMALL_WORDS = STOPWORDS | {"as"}
TITLE_ACRONYMS = {
	"pdf",
	"uae",
	"ky",
	"diy",
	"usa",
	"uk",
	"ai",
	"ui",
	"api",
	"gps",
	"led",
	"hd",
	"4k",
	"usb",
	"3d",
	"vr",
	"ar",
	"ss19",
}


def to_path_slug(value: str) -> str:
	text = re.sub(r"[^\w]+", "-", (value or "").strip().lower(), flags=re.UNICODE)
	return re.sub(r"^-+|-+$", "", text)[:96]


def word_count(tag: str) -> int:
	return len([part for part in tag.strip().split() if part])


def format_title_token(token: str, force: bool) -> str:
	if not token:
		return token
	lower = token.lower()
	if lower in TITLE_ACRONYMS:
		return token.upper()
	if not force and lower in TITLE_SMALL_WORDS:
		return lower
	if len(token) == 1 and lower not in TITLE_SMALL_WORDS:
		return token.upper()
	return lower[:1].upper() + lower[1:]


def format_asset_title(title: str) -> str:
	words = [part for part in title.strip().split() if part]
	if not words:
		return ""
	formatted: list[str] = []
	for index, word in enumerate(words):
		force = index == 0 or index == len(words) - 1
		formatted.append(
			"-".join(format_title_token(part, force) for part in word.split("-"))
		)
	return " ".join(formatted)


def title_tokens(title: str) -> list[str]:
	return [
		token
		for token in re.split(r"[^a-z0-9]+", (title or "").lower())
		if len(token) >= 2 and token not in STOPWORDS
	]


def is_raw_keyword_tag(tag: str, keyword: str) -> bool:
	keyword = (keyword or "").strip()
	if not keyword:
		return False
	tag_slug = to_path_slug(tag)
	key_slug = to_path_slug(keyword)
	if not tag_slug or not key_slug:
		return False
	if tag_slug == key_slug:
		return True
	if key_slug in tag_slug and word_count(tag) >= 2:
		return True
	if tag_slug in key_slug and word_count(keyword) >= 3:
		return True
	return False


def appears_in_title(tag: str, title: str) -> bool:
	slug = to_path_slug(tag)
	if not slug:
		return False
	title_slug = to_path_slug(title)
	if not title_slug:
		return False
	if slug in title_slug:
		return True
	parts = [part for part in slug.split("-") if part]
	if len(parts) >= 2 and all(part in title_slug for part in parts):
		return True
	return False


def is_blocked_stock_tag(tag: str, title: str = "", keyword: str = "") -> bool:
	trimmed = tag.strip()
	if not trimmed:
		return True
	if word_count(trimmed) > STOCK_TAG_MAX_WORDS:
		return True
	lower = trimmed.lower()
	if lower in BLOCKED_EXACT or lower in BLOCKED_SUBJECTIVE:
		return True
	if any(pattern.search(trimmed) for pattern in BLOCKED_PATTERNS):
		return True
	if any(pattern.search(trimmed) for pattern in BLOCKED_SUFFIXES):
		return True
	if is_raw_keyword_tag(trimmed, keyword) and not appears_in_title(trimmed, title):
		return True
	return False


def last_word_slug(tag: str) -> str:
	parts = [part for part in to_path_slug(tag).split("-") if part]
	return parts[-1] if parts else ""


def dedupe_near_duplicates(tags: list[str]) -> list[str]:
	kept: list[str] = []
	for tag in tags:
		last = last_word_slug(tag)
		idx = next(
			(
				i
				for i, item in enumerate(kept)
				if last_word_slug(item) == last and len(last) > 2
			),
			-1,
		)
		if idx == -1:
			kept.append(tag)
			continue
		if word_count(tag) > word_count(kept[idx]):
			kept[idx] = tag
	return kept


def tags_from_title(title: str) -> list[str]:
	tokens = title_tokens(title)
	out: list[str] = []
	seen: set[str] = set()
	for token in tokens:
		label = format_asset_title(token)
		key = label.lower()
		if not label or key in seen:
			continue
		seen.add(key)
		out.append(label)
	for index in range(len(tokens) - 1):
		phrase = f"{tokens[index]} {tokens[index + 1]}"
		label = format_asset_title(phrase)
		key = label.lower()
		if not label or key in seen or word_count(label) > STOCK_TAG_MAX_WORDS:
			continue
		seen.add(key)
		out.append(label)
	return out


def sanitize_stock_tags(
	raw_tags: list[str] | None,
	*,
	title: str = "",
	keyword: str = "",
) -> list[str]:
	title = (title or "").strip()
	keyword = (keyword or "").strip()
	literal: list[str] = []
	seen: set[str] = set()

	for value in raw_tags or []:
		formatted = format_asset_title(str(value or ""))
		if not formatted or is_blocked_stock_tag(formatted, title, keyword):
			continue
		key = formatted.lower()
		if key in seen:
			continue
		seen.add(key)
		literal.append(formatted)

	tags = dedupe_near_duplicates(literal)

	if len(tags) < STOCK_TAG_MIN and title:
		for candidate in tags_from_title(title):
			if len(tags) >= STOCK_TAG_MAX:
				break
			if is_blocked_stock_tag(candidate, title, keyword):
				continue
			key = candidate.lower()
			if key in seen:
				continue
			seen.add(key)
			tags.append(candidate)

	tags = dedupe_near_duplicates(tags)
	return tags[:STOCK_TAG_MAX]
