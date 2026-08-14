import { CATEGORIES, isCategorySlug, type CategorySlug } from '../config/categories';
import type { AssetDetail } from './asset-types';
import {
	CONTENT_CATEGORY_PAGES,
	assetMatchesContentCategory,
	getContentCategoryBySlug,
} from './content-categories';
import { toPathSlug, tagMatches } from './paths';

export type CatalogType = 'all' | CategorySlug;

export type CatalogQuery = {
	q: string;
	type: CatalogType;
	topic: string;
	color: string;
	tag: string;
};

export type CatalogColor = {
	id: string;
	label: string;
	hex: string;
};

export const CATALOG_COLORS: CatalogColor[] = [
	{ id: 'black', label: 'Black', hex: '#111111' },
	{ id: 'white', label: 'White', hex: '#f4f4f4' },
	{ id: 'gray', label: 'Gray', hex: '#8a8f8c' },
	{ id: 'red', label: 'Red', hex: '#d64545' },
	{ id: 'orange', label: 'Orange', hex: '#e67a28' },
	{ id: 'yellow', label: 'Yellow', hex: '#e6c229' },
	{ id: 'green', label: 'Green', hex: '#3f8f46' },
	{ id: 'teal', label: 'Teal', hex: '#2a9d8f' },
	{ id: 'blue', label: 'Blue', hex: '#2f6fed' },
	{ id: 'purple', label: 'Purple', hex: '#7b4fc4' },
	{ id: 'pink', label: 'Pink', hex: '#e85d8c' },
	{ id: 'brown', label: 'Brown', hex: '#8b5a2b' },
];

export const EMPTY_CATALOG_QUERY: CatalogQuery = {
	q: '',
	type: 'all',
	topic: '',
	color: '',
	tag: '',
};

type Rgb = { r: number; g: number; b: number };

function parseHex(value: string): Rgb | null {
	const hex = value.trim().replace(/^#/, '');
	if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
	return {
		r: Number.parseInt(hex.slice(0, 2), 16),
		g: Number.parseInt(hex.slice(2, 4), 16),
		b: Number.parseInt(hex.slice(4, 6), 16),
	};
}

function luminance(rgb: Rgb) {
	return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
}

function saturation(rgb: Rgb) {
	const max = Math.max(rgb.r, rgb.g, rgb.b) / 255;
	const min = Math.min(rgb.r, rgb.g, rgb.b) / 255;
	if (max === 0) return 0;
	return (max - min) / max;
}

function colorDistance(a: Rgb, b: Rgb) {
	return (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;
}

export function assetMatchesColor(asset: AssetDetail, colorId: string): boolean {
	const family = CATALOG_COLORS.find((item) => item.id === colorId);
	if (!family) return false;
	const target = parseHex(family.hex);
	if (!target) return false;
	const palette = asset.colorPalette || [];
	if (!palette.length) return false;

	return palette.some((swatch) => {
		const rgb = parseHex(swatch.hex);
		if (!rgb) return false;
		const lum = luminance(rgb);
		const sat = saturation(rgb);
		if (family.id === 'black') return lum < 42 && sat < 0.35;
		if (family.id === 'white') return lum > 214 && sat < 0.22;
		if (family.id === 'gray') return sat < 0.14 && lum > 42 && lum < 214;
		if (family.id === 'brown') return lum < 160 && sat > 0.18 && colorDistance(rgb, target) < 220 ** 2;
		return colorDistance(rgb, target) < 168 ** 2;
	});
}

export function parseCatalogQuery(
	url: URL,
	hints: Partial<Pick<CatalogQuery, 'q' | 'type' | 'topic'>> = {},
): CatalogQuery {
	const typeParam = url.searchParams.get('category') || url.searchParams.get('type') || '';
	const topicParam = toPathSlug(url.searchParams.get('topic') || '');
	const colorParam = (url.searchParams.get('color') || '').trim().toLowerCase();
	const tagParam = toPathSlug(url.searchParams.get('tag') || '');

	const type: CatalogType = hints.type
		? hints.type
		: isCategorySlug(typeParam)
			? typeParam
			: 'all';

	const topic = hints.topic || (topicParam && getContentCategoryBySlug(topicParam) ? topicParam : '');
	const color = CATALOG_COLORS.some((item) => item.id === colorParam) ? colorParam : '';

	return {
		q: (hints.q || '').trim(),
		type,
		topic,
		color,
		tag: tagParam,
	};
}

export function catalogHref(query: CatalogQuery, patch: Partial<CatalogQuery> = {}): string {
	const next: CatalogQuery = { ...query, ...patch };
	next.q = next.q.trim();
	next.topic = toPathSlug(next.topic);
	next.tag = toPathSlug(next.tag);
	if (next.topic && !getContentCategoryBySlug(next.topic)) next.topic = '';
	if (next.type !== 'all' && !isCategorySlug(next.type)) next.type = 'all';
	if (next.color && !CATALOG_COLORS.some((item) => item.id === next.color)) next.color = '';

	const params = new URLSearchParams();
	let pathname = '/s/';

	if (next.q) {
		pathname = `/s/${encodeURIComponent(toPathSlug(next.q))}`;
		if (next.type !== 'all') params.set('category', next.type);
		if (next.topic) params.set('topic', next.topic);
	} else if (next.topic) {
		pathname = `/c/${encodeURIComponent(next.topic)}`;
		if (next.type !== 'all') params.set('category', next.type);
	} else if (next.type !== 'all') {
		pathname = `/${next.type}`;
	}

	if (next.color) params.set('color', next.color);
	if (next.tag) params.set('tag', next.tag);

	const qs = params.toString();
	return qs ? `${pathname}?${qs}` : pathname;
}

export function catalogHasFilters(query: CatalogQuery) {
	return Boolean(query.q || query.type !== 'all' || query.topic || query.color || query.tag);
}

export function applyCatalogFilters(assets: AssetDetail[], query: CatalogQuery): AssetDetail[] {
	const needle = query.q.trim().toLowerCase();
	return assets.filter((asset) => {
		if (query.type !== 'all' && asset.category !== query.type) return false;
		if (query.topic && !assetMatchesContentCategory(asset, query.topic)) return false;
		if (query.tag && !(asset.tags || []).some((value) => tagMatches(value, query.tag))) return false;
		if (query.color && !assetMatchesColor(asset, query.color)) return false;
		if (needle) {
			const hay = [
				asset.title,
				asset.description,
				asset.shortDescription,
				asset.keyword,
				asset.category,
				...(asset.tags || []),
				...(asset.relatedQueries || []),
			]
				.filter(Boolean)
				.join(' ')
				.toLowerCase();
			if (!hay.includes(needle)) return false;
		}
		return true;
	});
}

export type CatalogFacets = {
	types: { slug: CatalogType; label: string; count: number }[];
	topics: { slug: string; label: string; count: number }[];
	colors: { id: string; label: string; hex: string; count: number }[];
	tags: { slug: string; label: string; count: number }[];
};

function except(query: CatalogQuery, key: keyof CatalogQuery): CatalogQuery {
	if (key === 'type') return { ...query, type: 'all' };
	if (key === 'q') return { ...query, q: '' };
	return { ...query, [key]: '' };
}

export function catalogFacets(pool: AssetDetail[], query: CatalogQuery, tagLimit = 18): CatalogFacets {
	const typeBase = applyCatalogFilters(pool, except(query, 'type'));
	const topicBase = applyCatalogFilters(pool, except(query, 'topic'));
	const colorBase = applyCatalogFilters(pool, except(query, 'color'));
	const tagBase = applyCatalogFilters(pool, except(query, 'tag'));

	const types: CatalogFacets['types'] = [
		{ slug: 'all', label: 'All types', count: typeBase.length },
		...CATEGORIES.map((item) => ({
			slug: item.slug,
			label: item.label,
			count: typeBase.filter((asset) => asset.category === item.slug).length,
		})),
	];

	const topics = CONTENT_CATEGORY_PAGES.map((item) => ({
		slug: item.slug,
		label: item.label,
		count: topicBase.filter((asset) => assetMatchesContentCategory(asset, item.slug)).length,
	}));

	const colors = CATALOG_COLORS.map((item) => ({
		...item,
		count: colorBase.filter((asset) => assetMatchesColor(asset, item.id)).length,
	}));

	const tagCounts = new Map<string, { label: string; count: number }>();
	for (const asset of tagBase) {
		for (const label of asset.tags || []) {
			const slug = toPathSlug(label);
			if (!slug) continue;
			const current = tagCounts.get(slug);
			if (current) current.count += 1;
			else tagCounts.set(slug, { label, count: 1 });
		}
	}

	const tags = [...tagCounts.entries()]
		.map(([slug, item]) => ({ slug, label: item.label, count: item.count }))
		.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
		.slice(0, tagLimit);

	if (query.tag && !tags.some((item) => item.slug === query.tag)) {
		const selected = [...tagCounts.entries()].find(([slug]) => slug === query.tag);
		if (selected) {
			tags.unshift({ slug: selected[0], label: selected[1].label, count: selected[1].count });
		}
	}

	return { types, topics, colors, tags };
}

export function catalogHeading(query: CatalogQuery) {
	if (query.q) return query.q;
	if (query.topic) return getContentCategoryBySlug(query.topic)?.label || query.topic;
	if (query.type !== 'all') return CATEGORIES.find((item) => item.slug === query.type)?.label || 'Library';
	return 'All visuals';
}

export function catalogChips(query: CatalogQuery) {
	const chips: { key: keyof CatalogQuery; label: string; href: string }[] = [];
	if (query.topic) {
		const label = getContentCategoryBySlug(query.topic)?.label || query.topic;
		chips.push({ key: 'topic', label, href: catalogHref(query, { topic: '' }) });
	}
	if (query.type !== 'all') {
		const label = CATEGORIES.find((item) => item.slug === query.type)?.label || query.type;
		chips.push({ key: 'type', label, href: catalogHref(query, { type: 'all' }) });
	}
	if (query.color) {
		const label = CATALOG_COLORS.find((item) => item.id === query.color)?.label || query.color;
		chips.push({ key: 'color', label, href: catalogHref(query, { color: '' }) });
	}
	if (query.tag) {
		chips.push({ key: 'tag', label: query.tag.replace(/-/g, ' '), href: catalogHref(query, { tag: '' }) });
	}
	if (query.q) {
		chips.push({ key: 'q', label: `“${query.q}”`, href: catalogHref(query, { q: '' }) });
	}
	return chips;
}
