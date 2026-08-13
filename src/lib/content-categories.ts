import raw from '../data/content-categories.txt?raw';
import { toPathSlug } from './paths';

/** Fixed topical categories from /categories — not expandable at runtime. */
export const CONTENT_CATEGORIES = raw
	.split(',')
	.map((item) => item.trim())
	.filter(Boolean);

export type ContentCategory = {
	label: string;
	slug: string;
};

/** Fixed catalog used by /c/ pages — labels only from the categories file. */
export const CONTENT_CATEGORY_PAGES: ContentCategory[] = CONTENT_CATEGORIES.map((label) => ({
	label,
	slug: toPathSlug(label),
}));

const CATEGORY_SET = new Set(CONTENT_CATEGORIES.map((item) => item.toLowerCase()));
const PAGE_BY_SLUG = new Map(CONTENT_CATEGORY_PAGES.map((item) => [item.slug, item]));

const ALIASES: Record<string, string[]> = {
	ai: ['artificial intelligence', 'machine learning', 'neural', 'llm'],
	technology: [
		'tech',
		'digital',
		'software',
		'hardware',
		'computer',
		'device',
		'gadget',
		'wireless',
		'mouse',
		'keyboard',
		'headset',
		'laptop',
		'smartphone',
		'peripheral',
		'gaming',
		'esports',
		'controller',
		'monitor',
	],
	finance: ['money', 'bank', 'invest', 'stock', 'trading', 'currency', 'yen', 'aud', 'usd'],
	business: ['office', 'corporate', 'company', 'startup', 'commerce'],
	workplace: ['desk', 'meeting', 'coworker', 'office'],
	people: ['man', 'woman', 'person', 'portrait', 'human', 'crowd'],
	lifestyle: ['daily', 'home life', 'leisure'],
	landscapes: ['landscape', 'mountain', 'valley', 'horizon', 'scenic'],
	nature: ['forest', 'outdoor', 'wilderness', 'natural', 'alpine', 'sunrise'],
	plants: ['plant', 'flower', 'leaf', 'tree', 'botanical'],
	animals: ['animal', 'dog', 'cat', 'bird', 'wildlife', 'pet'],
	cityscapes: ['city', 'urban', 'skyline', 'street', 'downtown'],
	architecture: ['building', 'facade', 'structure', 'roof', 'flashing'],
	interior: ['room', 'furniture', 'indoor', 'apartment'],
	food: ['meal', 'dish', 'cuisine', 'restaurant', 'kitchen'],
	beverage: ['drink', 'wine', 'beer', 'juice', 'alcoholic'],
	coffee: ['espresso', 'cafe', 'latte', 'cappuccino'],
	education: ['school', 'study', 'classroom', 'learning', 'book'],
	culture: ['art', 'museum', 'heritage', 'tradition'],
	medical: ['hospital', 'clinic', 'doctor', 'surgery'],
	health: ['wellness', 'fitness', 'nutrition', 'care'],
	sports: [
		'sport',
		'athlete',
		'soccer',
		'football',
		'basketball',
		'tennis',
		'baseball',
		'running',
		'yoga',
		'gym',
		'stadium',
		'tackle',
	],
	advertising: ['marketing', 'campaign', 'brand', 'promo'],
	'e-commerce': ['ecommerce', 'shopping', 'retail', 'product', 'cart'],
	web: ['website', 'ui', 'interface', 'browser'],
	vectors: ['vector', 'flat design', 'icon set'],
	illustrations: ['illustration', 'drawing', 'illustrated'],
	photography: ['photo', 'photograph', 'studio', 'editorial'],
	aerial: ['drone', 'overhead', 'bird eye', "bird's-eye"],
	'3d assets': ['3d', 'render', 'cgi'],
	backgrounds: ['backdrop', 'wallpaper', 'background'],
	textures: ['texture', 'pattern', 'surface', 'material'],
	abstract: ['abstract', 'geometric', 'shape'],
	conceptual: ['concept', 'metaphor', 'symbolic'],
	sustainability: ['eco', 'green', 'recycle', 'sustainable', 'reuse'],
	mood: ['atmosphere', 'emotion', 'moody', 'feeling'],
};

function canonicalCategory(value: string): string | null {
	const needle = value.trim().toLowerCase();
	if (!needle) return null;
	const exact = CONTENT_CATEGORIES.find((item) => item.toLowerCase() === needle);
	return exact ?? null;
}

/** Keep only allowed vocabulary labels; exactly one primary category. */
export function normalizeContentCategories(values: string[] | undefined | null): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const value of values || []) {
		const matched = canonicalCategory(value);
		if (!matched) continue;
		const key = matched.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(matched);
		if (out.length >= 1) break;
	}
	return out;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function includesTerm(text: string, term: string): boolean {
	const needle = term.trim().toLowerCase();
	if (!needle) return false;
	if (needle.length <= 3 || !needle.includes(' ')) {
		const pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(needle)}(?:[^a-z0-9]|$)`, 'i');
		return pattern.test(text);
	}
	return text.includes(needle);
}

/** Score title/keyword text; return exactly one best label when confident. */
export function pickContentCategoriesFromTitle(
	title: string,
	extra = '',
	limit = 1,
): string[] {
	const text = `${title} ${extra}`.toLowerCase();
	if (!text.trim()) return [];

	const scored = CONTENT_CATEGORIES.map((label) => {
		const key = label.toLowerCase();
		let score = 0;
		if (includesTerm(text, key)) score += 12;
		for (const alias of ALIASES[key] || []) {
			if (includesTerm(text, alias)) score += 6;
		}
		const words = key.split(/\s+/);
		if (words.length > 1 && words.every((word) => includesTerm(text, word))) score += 4;
		return { label, score };
	})
		.filter((item) => item.score >= 6)
		.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));

	return scored.slice(0, Math.min(Math.max(limit, 1), 1)).map((item) => item.label);
}

export function isKnownContentCategory(value: string): boolean {
	return CATEGORY_SET.has(value.trim().toLowerCase());
}

export function getContentCategoryBySlug(slug: string): ContentCategory | undefined {
	return PAGE_BY_SLUG.get(toPathSlug(slug));
}

export function isContentCategorySlug(slug: string): boolean {
	return PAGE_BY_SLUG.has(toPathSlug(slug));
}

export function contentCategoryPath(labelOrSlug: string): string {
	const page =
		PAGE_BY_SLUG.get(toPathSlug(labelOrSlug)) ||
		CONTENT_CATEGORY_PAGES.find((item) => item.label.toLowerCase() === labelOrSlug.toLowerCase());
	return page ? `/c/${encodeURIComponent(page.slug)}` : '/c/';
}

/** Resolve exactly one vocabulary category from stored JSON or title fallback. */
export function resolveContentCategories(input: {
	stored?: string[] | null;
	title?: string;
	keyword?: string;
}): string[] {
	const title = input.title || '';
	const keyword = input.keyword || '';
	const text = `${title} ${keyword}`.toLowerCase();
	const fromStored = sanitizeStoredCategories(
		normalizeContentCategories(input.stored),
		text,
	);
	if (fromStored.length > 0) return fromStored.slice(0, 1);
	return pickContentCategoriesFromTitle(title, keyword, 1).slice(0, 1);
}

function sanitizeStoredCategories(categories: string[], text: string): string[] {
	const isPeripheral = [
		'mouse',
		'keyboard',
		'headset',
		'laptop',
		'wireless',
		'peripheral',
		'controller',
		'monitor',
		'smartphone',
	].some((term) => includesTerm(text, term));
	const hasPhysicalSport = (ALIASES.sports || []).some((term) => includesTerm(text, term));

	return categories.filter((label) => {
		if (label === 'Sports' && isPeripheral && !hasPhysicalSport) return false;
		return true;
	});
}

export function contentCategoriesPromptList(): string {
	return CONTENT_CATEGORIES.join(', ');
}

export function assetMatchesContentCategory(
	asset: { contentCategories?: string[]; depictedElements?: string[] },
	labelOrSlug: string,
): boolean {
	const target = toPathSlug(labelOrSlug);
	const labels = [...(asset.contentCategories || []), ...(asset.depictedElements || [])];
	return labels.some((label) => toPathSlug(label) === target && isKnownContentCategory(label));
}
