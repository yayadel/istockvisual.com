/** Node mirror of src/lib/stock-tags.ts for batch scripts. Keep in sync. */

const TITLE_SMALL_WORDS = new Set([
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
]);
const TITLE_ACRONYMS = new Set([
	'pdf',
	'uae',
	'ky',
	'diy',
	'usa',
	'uk',
	'ai',
	'ui',
	'api',
	'gps',
	'led',
	'hd',
	'4k',
	'usb',
	'3d',
	'vr',
	'ar',
	'ss19',
]);

function formatTitleToken(token, forceCapitalize) {
	if (!token) return token;
	const lower = token.toLowerCase();
	if (TITLE_ACRONYMS.has(lower)) return token.toUpperCase();
	if (!forceCapitalize && TITLE_SMALL_WORDS.has(lower)) return lower;
	if (/^[a-z]$/i.test(token) && !TITLE_SMALL_WORDS.has(lower)) return token.toUpperCase();
	return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function formatAssetTitle(title) {
	const words = title.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return '';
	return words
		.map((word, index) => {
			const force = index === 0 || index === words.length - 1;
			return word
				.split('-')
				.map((part) => formatTitleToken(part, force))
				.join('-');
		})
		.join(' ');
}

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

function toPathSlug(value) {
	return String(value || '')
		.trim()
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 96);
}

function wordCount(tag) {
	return tag.trim().split(/\s+/).filter(Boolean).length;
}

function titleTokens(title) {
	return (title || '')
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

function isRawKeywordTag(tag, context) {
	const keyword = (context.keyword || '').trim();
	if (!keyword) return false;
	const tagSlug = toPathSlug(tag);
	const keySlug = toPathSlug(keyword);
	if (!tagSlug || !keySlug) return false;
	if (tagSlug === keySlug) return true;
	if (keySlug.includes(tagSlug) && wordCount(tag) >= 2) return true;
	if (tagSlug.includes(keySlug) && wordCount(keyword) >= 3) return true;
	return false;
}

function appearsInTitle(tag, title) {
	const slug = toPathSlug(tag);
	if (!slug) return false;
	const titleSlug = toPathSlug(title);
	if (!titleSlug) return false;
	if (titleSlug.includes(slug)) return true;
	const tagWords = slug.split('-').filter(Boolean);
	if (tagWords.length >= 2 && tagWords.every((part) => titleSlug.includes(part))) return true;
	return false;
}

export function isBlockedStockTag(tag, context = {}) {
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

function lastWordSlug(tag) {
	const parts = toPathSlug(tag).split('-').filter(Boolean);
	return parts[parts.length - 1] || '';
}

function dedupeNearDuplicates(tags) {
	const kept = [];
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

function tagsFromTitle(title) {
	const tokens = titleTokens(title);
	const out = [];
	const seen = new Set();

	for (const token of tokens) {
		const label = formatAssetTitle(token);
		const key = label.toLowerCase();
		if (!label || seen.has(key)) continue;
		seen.add(key);
		out.push(label);
	}

	for (let index = 0; index < tokens.length - 1; index += 1) {
		const phrase = `${tokens[index]} ${tokens[index + 1]}`;
		const label = formatAssetTitle(phrase);
		const key = label.toLowerCase();
		if (!label || seen.has(key) || wordCount(label) > STOCK_TAG_MAX_WORDS) continue;
		seen.add(key);
		out.push(label);
	}

	return out;
}

export function sanitizeStockTags(rawTags, context = {}) {
	const title = (context.title || '').trim();
	const keyword = (context.keyword || '').trim();
	const ctx = { title, keyword };

	const literal = [];
	const seen = new Set();

	for (const value of rawTags || []) {
		const formatted = formatAssetTitle(String(value || ''));
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
