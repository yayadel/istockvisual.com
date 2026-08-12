import type { CategorySlug } from '../config/categories';

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
	depictedElements: string[];
	imagePageTitle: string;
	pageShortDescription: string;
	medium: string;
};

export type GeneratedAssetRecord = GeneratedAssetMeta & {
	id: string;
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
	keyword?: string;
	imagePrompt?: string;
	creationDescription?: string;
	usageTips?: string;
	colorPalette?: ColorSwatch[];
	relatedQueries?: string[];
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

	const imagePageTitle = readString(parsed, ['imagePageTitle', 'Image Page Title']) || keyword;
	const pageShortDescription =
		readString(parsed, ['pageShortDescription', 'Page Short Description']) ||
		readString(parsed, ['imageCreationDescription']) ||
		`${keyword} stock asset`;

	return {
		imagePrompt,
		imageCreationDescription:
			readString(parsed, ['imageCreationDescription', 'Image Creation Description']) ||
			imagePrompt,
		assetUsageTips:
			readString(parsed, ['assetUsageTips', 'Asset Functionality & Usage Tips']) || '',
		colorPalette: normalizePalette(parsed.colorPalette),
		tags: normalizeStringArray(parsed.tags),
		relatedSearchQueries: normalizeStringArray(
			parsed.relatedSearchQueries ?? parsed['Related Search Queries'],
		),
		depictedElements: normalizeStringArray(
			parsed.depictedElements ?? parsed['Depicted Objects/Elements'],
		),
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
