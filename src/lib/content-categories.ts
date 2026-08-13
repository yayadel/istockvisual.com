import raw from '../data/content-categories.txt?raw';

/** Curated topical categories from /categories — pick 1–3 per asset from the title. */
export const CONTENT_CATEGORIES = raw
	.split(',')
	.map((item) => item.trim())
	.filter(Boolean);

const CATEGORY_SET = new Set(CONTENT_CATEGORIES.map((item) => item.toLowerCase()));

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
	sports: ['sport', 'athlete', 'game', 'training', 'esports', 'gaming', 'tackle'],
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

/** Keep only allowed vocabulary labels, unique, max 3. */
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
		if (out.length >= 3) break;
	}
	return out;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function includesTerm(text: string, term: string): boolean {
	const needle = term.trim().toLowerCase();
	if (!needle) return false;
	// Short tokens (AI, Web, 3D) must match as whole words/phrases.
	if (needle.length <= 3 || !needle.includes(' ')) {
		const pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(needle)}(?:[^a-z0-9]|$)`, 'i');
		return pattern.test(text);
	}
	return text.includes(needle);
}

/** Score title/keyword text against the fixed category vocabulary; return 1–3 labels. */
export function pickContentCategoriesFromTitle(
	title: string,
	extra = '',
	limit = 3,
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
		// Prefer multi-word exact-ish hits
		const words = key.split(/\s+/);
		if (words.length > 1 && words.every((word) => includesTerm(text, word))) score += 4;
		return { label, score };
	})
		.filter((item) => item.score > 0)
		.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));

	const picked = scored.slice(0, Math.min(Math.max(limit, 1), 3)).map((item) => item.label);
	if (picked.length > 0) return picked;

	// Soft fallback for photo-like stock when nothing matched
	return normalizeContentCategories(['Photography', 'Advertising']).slice(0, 2);
}

export function isKnownContentCategory(value: string): boolean {
	return CATEGORY_SET.has(value.trim().toLowerCase());
}

/** Resolve 1–3 vocabulary categories from stored JSON or title fallback. */
export function resolveContentCategories(input: {
	stored?: string[] | null;
	title?: string;
	keyword?: string;
}): string[] {
	const fromStored = normalizeContentCategories(input.stored);
	if (fromStored.length > 0) return fromStored;
	return pickContentCategoriesFromTitle(input.title || '', input.keyword || '');
}

export function contentCategoriesPromptList(): string {
	return CONTENT_CATEGORIES.join(', ');
}
