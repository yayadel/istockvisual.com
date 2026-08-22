import { formatTagLabel } from './asset-types';
import { toPathSlug } from './paths';

export const STOCK_TAG_MIN = 18;
export const STOCK_TAG_MAX = 28;
export const STOCK_TAG_MAX_WORDS = 3;

const BLOCKED_EXACT = new Set(
	[
		'background',
		'image',
		'concept',
		'wallpaper',
		'stock photo',
		'stock image',
		'free download',
		'photo',
		'picture',
		'illustration',
		'graphic',
		'design element',
		'copy space',
	].map((item) => item.toLowerCase()),
);

const BLOCKED_SUBJECTIVE = new Set(
	['beautiful', 'amazing', 'stunning', 'nice', 'best', 'perfect', 'awesome', 'incredible'].map(
		(item) => item.toLowerCase(),
	),
);

const BLOCKED_SUFFIXES = [
	/\btravel$/i,
	/\bdestination$/i,
	/\binspiration$/i,
	/\bgetaway$/i,
	/\bretreat$/i,
	/\bmode$/i,
	/\bvacation$/i,
	/\bholiday$/i,
];

const BLOCKED_PATTERNS = [
	/\bhow to\b/i,
	/\bnear me\b/i,
	/\bfor sale\b/i,
	/\bfree download\b/i,
	/\bstock image\b/i,
	/\bstock photo\b/i,
	/\bwatch online\b/i,
	/\bfull movie\b/i,
];

const STOPWORDS = new Set([
	'a',
	'an',
	'the',
	'and',
	'or',
	'for',
	'of',
	'in',
	'on',
	'at',
	'to',
	'by',
	'with',
	'from',
	'into',
	'over',
	'who',
	'what',
	'when',
	'where',
	'why',
	'how',
	'is',
	'are',
	'was',
	'were',
	'its',
	'this',
	'that',
	'your',
	'our',
]);

export type StockTagContext = {
	title?: string;
	keyword?: string;
};

function wordCount(tag: string): number {
	return tag.trim().split(/\s+/).filter(Boolean).length;
}

function titleTokens(title: string): string[] {
	return (title || '')
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

function keywordSlug(keyword?: string): string {
	return keyword ? toPathSlug(keyword) : '';
}

function isRawKeywordTag(tag: string, context: StockTagContext): boolean {
	const keyword = (context.keyword || '').trim();
	if (!keyword) return false;
	const tagSlug = toPathSlug(tag);
	const keySlug = keywordSlug(keyword);
	if (!tagSlug || !keySlug) return false;
	if (tagSlug === keySlug) return true;
	// Multi-word SEO phrases copied from the seed keyword.
	if (keySlug.includes(tagSlug) && wordCount(tag) >= 2) return true;
	if (tagSlug.includes(keySlug) && wordCount(keyword) >= 3) return true;
	return false;
}

function appearsInTitle(tag: string, title: string): boolean {
	const slug = toPathSlug(tag);
	if (!slug) return false;
	const titleSlug = toPathSlug(title);
	if (!titleSlug) return false;
	if (titleSlug.includes(slug)) return true;
	const tagWords = slug.split('-').filter(Boolean);
	if (tagWords.length >= 2 && tagWords.every((part) => titleSlug.includes(part))) return true;
	return false;
}

export function isBlockedStockTag(tag: string, context: StockTagContext = {}): boolean {
	const trimmed = tag.trim();
	if (!trimmed) return true;
	if (wordCount(trimmed) > STOCK_TAG_MAX_WORDS) return true;

	const lower = trimmed.toLowerCase();
	if (BLOCKED_EXACT.has(lower)) return true;
	if (BLOCKED_SUBJECTIVE.has(lower)) return true;
	if (BLOCKED_PATTERNS.some((pattern) => pattern.test(trimmed))) return true;
	if (BLOCKED_SUFFIXES.some((pattern) => pattern.test(trimmed))) return true;
	if (isRawKeywordTag(trimmed, context) && !appearsInTitle(trimmed, context.title || '')) {
		return true;
	}
	return false;
}

function lastWordSlug(tag: string): string {
	const parts = toPathSlug(tag).split('-').filter(Boolean);
	return parts[parts.length - 1] || '';
}

/** Drop near-duplicates that share the same head noun (keep the more specific tag). */
function dedupeNearDuplicates(tags: string[]): string[] {
	const kept: string[] = [];
	for (const tag of tags) {
		const last = lastWordSlug(tag);
		const idx = kept.findIndex((item) => lastWordSlug(item) === last && last.length > 2);
		if (idx === -1) {
			kept.push(tag);
			continue;
		}
		const existing = kept[idx];
		if (wordCount(tag) > wordCount(existing)) {
			kept[idx] = tag;
		}
	}
	return kept;
}

function tagsFromTitle(title: string): string[] {
	const tokens = titleTokens(title);
	const out: string[] = [];
	const seen = new Set<string>();

	for (const token of tokens) {
		const label = formatTagLabel(token);
		const key = label.toLowerCase();
		if (!label || seen.has(key)) continue;
		seen.add(key);
		out.push(label);
	}

	for (let index = 0; index < tokens.length - 1; index += 1) {
		const phrase = `${tokens[index]} ${tokens[index + 1]}`;
		const label = formatTagLabel(phrase);
		const key = label.toLowerCase();
		if (!label || seen.has(key) || wordCount(label) > STOCK_TAG_MAX_WORDS) continue;
		seen.add(key);
		out.push(label);
	}

	return out;
}

/**
 * Normalize LLM / legacy tags into stock-style indexing labels (not SEO keyword phrases).
 * Order: kept literal tags first, then title-derived fillers, capped at STOCK_TAG_MAX.
 */
export function sanitizeStockTags(
	rawTags: string[] | undefined | null,
	context: StockTagContext = {},
): string[] {
	const title = (context.title || '').trim();
	const keyword = (context.keyword || '').trim();
	const ctx = { title, keyword };

	const literal: string[] = [];
	const seen = new Set<string>();

	for (const value of rawTags || []) {
		const formatted = formatTagLabel(String(value || ''));
		if (!formatted || isBlockedStockTag(formatted, ctx)) continue;
		const key = formatted.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		literal.push(formatted);
	}

	let tags = dedupeNearDuplicates(literal);

	if (tags.length < STOCK_TAG_MIN && title) {
		for (const candidate of tagsFromTitle(title)) {
			if (tags.length >= STOCK_TAG_MAX) break;
			if (isBlockedStockTag(candidate, ctx)) continue;
			const key = candidate.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			tags.push(candidate);
		}
	}

	tags = dedupeNearDuplicates(tags);
	return tags.slice(0, STOCK_TAG_MAX);
}
