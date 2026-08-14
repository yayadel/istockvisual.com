import type { CategorySlug } from '../config/categories';
import {
	normalizeContentCategories,
	pickContentCategoriesFromTitle,
} from './content-categories';

export type ColorSwatch = {
	name: string;
	hex: string;
};

export type GeneratedAssetMeta = {
	imagePrompt: string;
	imageCreationDescription: string;
	assetUsageTips: string;
	colorPalette: ColorSwatch[];
	tags: string[];
	relatedSearchQueries: string[];
	/** Exactly 1 label from /categories vocabulary (stored in DB depictedElements). */
	contentCategories: string[];
	/** @deprecated Prefer contentCategories; kept empty for older meta JSON. */
	depictedElements: string[];
	imagePageTitle: string;
	pageShortDescription: string;
	medium: string;
};

export type GeneratedAssetRecord = GeneratedAssetMeta & {
	id: string;
	keywordId: number | null;
	keyword: string;
	slug: string;
	category: CategorySlug;
	title: string;
	shortDescription: string;
	description: string;
	r2ObjectKey: string;
	fileType: string;
	width: number;
	height: number;
	license: string;
	isPremium: boolean;
	publishedAt: string;
	createdAt: string;
};

export type AssetDetail = {
	_id: string;
	title: string;
	slug: string;
	category: CategorySlug;
	description?: string;
	shortDescription?: string;
	tags?: string[];
	previewUrl?: string;
	r2ObjectKey?: string;
	fileType?: string;
	width?: number;
	height?: number;
	license?: string;
	isPremium?: boolean;
	publishedAt?: string;
	source: 'sanity' | 'generated' | 'demo';
	keywordId?: number;
	keyword?: string;
	imagePrompt?: string;
	creationDescription?: string;
	usageTips?: string;
	colorPalette?: ColorSwatch[];
	relatedQueries?: string[];
	/** Exactly 1 topical category from the fixed vocabulary. */
	contentCategories?: string[];
	depictedElements?: string[];
	medium?: string;
};

export function mediumToCategory(medium: string): CategorySlug {
	const value = medium.toLowerCase();
	if (value.includes('3d')) return '3d';
	if (value.includes('vector')) return 'vectors';
	if (value.includes('illustr')) return 'illustrations';
	return 'photos';
}

export function slugifyTitle(title: string): string {
	return title
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^\w\s-]/g, '')
		.trim()
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.slice(0, 80);
}

export function randomSlugCode(length = 6): string {
	const max = 10 ** length;
	const value = crypto.getRandomValues(new Uint32Array(1))[0] % max;
	return String(value).padStart(length, '0');
}

/** Short words kept lowercase in title case (unless first/last). */
const TITLE_SMALL_WORDS = new Set([
	'a',
	'an',
	'the',
	'and',
	'but',
	'or',
	'for',
	'nor',
	'on',
	'at',
	'to',
	'from',
	'by',
	'of',
	'in',
	'with',
	'as',
	'vs',
	'via',
]);

/** Abbreviations/acronyms that must render uppercase in titles and body copy. */
const TITLE_ACRONYMS = new Set([
	'pdf',
	'uae',
	'ky',
	'diy',
	'usa',
	'uk',
	'ai',
	'ui',
	'ux',
	'api',
	'faq',
	'seo',
	'gps',
	'led',
	'lcd',
	'hdmi',
	'usb',
	'html',
	'css',
	'js',
	'tv',
	'hd',
	'4k',
	'8k',
	'2d',
	'3d',
	'vr',
	'ar',
	'iot',
	'ev',
	'suv',
	'ss19',
]);

/** Fashion season codes such as SS19, FW20, AW21. */
const FASHION_SEASON = /^(ss|fw|aw|pf)\d{2}$/i;

function formatTitleToken(token: string, forceCapitalize: boolean): string {
	if (!token) return token;
	const lower = token.toLowerCase();
	if (TITLE_ACRONYMS.has(lower) || FASHION_SEASON.test(token)) return token.toUpperCase();
	if (!forceCapitalize && TITLE_SMALL_WORDS.has(lower)) return lower;
	// Single-letter designators (e.g. Z in Z Flashing), not articles like "a"
	if (/^[a-z]$/i.test(token) && !TITLE_SMALL_WORDS.has(lower)) return token.toUpperCase();
	return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Standard English title case with acronym awareness (PDF, UAE, KY, …). */
export function formatAssetTitle(title: string): string {
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

/** Tag labels use the same title-case + acronym rules as page titles. */
export function formatTagLabel(tag: string): string {
	return formatAssetTitle(tag);
}

/** Dedupe tags (case-insensitive) and apply title-case / acronym formatting. */
export function normalizeTags(values: string[] | undefined | null): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const value of values || []) {
		const formatted = formatTagLabel(value);
		if (!formatted) continue;
		const key = formatted.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(formatted);
	}
	return out;
}

/** Uppercase known acronyms inside sentence-case copy without changing other casing. */
export function formatAcronymsInText(text: string): string {
	return text.replace(/\b([A-Za-z0-9]+)\b/g, (word) => {
		const lower = word.toLowerCase();
		return TITLE_ACRONYMS.has(lower) || FASHION_SEASON.test(word) ? word.toUpperCase() : word;
	});
}

export function parseGeneratedMeta(raw: string, keyword: string): GeneratedAssetMeta {
	const jsonText = extractJson(raw);
	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(jsonText) as Record<string, unknown>;
	} catch {
		throw new Error('LLM response is not valid JSON');
	}

	const imagePrompt = readString(parsed, ['imagePrompt', 'Image Creation Description']);
	if (!imagePrompt) {
		throw new Error('Missing imagePrompt in LLM response');
	}

	const imagePageTitle = formatAssetTitle(
		readString(parsed, ['imagePageTitle', 'Image Page Title']) || keyword,
	);
	const pageShortDescription = formatAcronymsInText(
		readString(parsed, ['pageShortDescription', 'Page Short Description']) ||
			readString(parsed, ['imageCreationDescription']) ||
			`${keyword} stock asset`,
	);

	const contentCategories = (() => {
		const fromMeta = normalizeContentCategories(
			normalizeStringArray(parsed.contentCategories ?? parsed['Content Categories']),
		);
		if (fromMeta.length > 0) return fromMeta;
		return pickContentCategoriesFromTitle(imagePageTitle, keyword);
	})();

	return {
		imagePrompt,
		imageCreationDescription: formatAcronymsInText(
			readString(parsed, ['imageCreationDescription', 'Image Creation Description']) ||
				imagePrompt,
		),
		assetUsageTips:
			readString(parsed, ['assetUsageTips', 'Asset Functionality & Usage Tips']) || '',
		colorPalette: normalizePalette(parsed.colorPalette),
		tags: normalizeTags(normalizeStringArray(parsed.tags)),
		relatedSearchQueries: [],
		contentCategories,
		// Legacy field; topical categories live in contentCategories (DB: depictedElements).
		depictedElements: contentCategories,
		imagePageTitle,
		pageShortDescription,
		medium: readString(parsed, ['medium', 'Medium']) || 'Photograph',
	};
}

function extractJson(raw: string): string {
	const trimmed = raw.trim();
	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fenced?.[1]) return fenced[1].trim();
	const start = trimmed.indexOf('{');
	const end = trimmed.lastIndexOf('}');
	if (start >= 0 && end > start) {
		return trimmed.slice(start, end + 1);
	}
	return trimmed;
}

function readString(obj: Record<string, unknown>, keys: string[]): string {
	for (const key of keys) {
		const value = obj[key];
		if (typeof value === 'string' && value.trim()) {
			return value.trim();
		}
	}
	return '';
}

function normalizeStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => (typeof item === 'string' ? item.trim() : ''))
		.filter(Boolean);
}

function normalizePalette(value: unknown): ColorSwatch[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => {
			if (!item || typeof item !== 'object') return null;
			const row = item as Record<string, unknown>;
			const name = typeof row.name === 'string' ? row.name.trim() : 'Color';
			const hex = typeof row.hex === 'string' ? row.hex.trim() : '';
			if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
			return { name, hex };
		})
		.filter((item): item is ColorSwatch => Boolean(item));
}
