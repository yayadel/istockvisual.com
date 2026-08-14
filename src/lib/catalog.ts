import { CATEGORIES, isCategorySlug, type CategorySlug } from '../config/categories';
import type { AssetDetail } from './asset-types';
import {
	CONTENT_CATEGORY_PAGES,
	assetMatchesContentCategory,
	getContentCategoryBySlug,
} from './content-categories';
import { toPathSlug, tagMatches } from './paths';

export type CatalogType = 'all' | CategorySlug;
export type CatalogOrient = '' | 'landscape' | 'portrait' | 'square';
export type CatalogSort = 'newest' | 'oldest' | 'title';

export type CatalogQuery = {
	q: string;
	type: CatalogType;
	topic: string;
	color: string;
	tag: string;
	orient: CatalogOrient;
	exclude: string;
	sort: CatalogSort;
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

export const CATALOG_ORIENTS: { id: CatalogOrient; label: string }[] = [
	{ id: 'landscape', label: 'Landscape' },
	{ id: 'portrait', label: 'Portrait' },
	{ id: 'square', label: 'Square' },
];

export const CATALOG_SORTS: { id: CatalogSort; label: string }[] = [
	{ id: 'newest', label: 'Newest' },
	{ id: 'oldest', label: 'Oldest' },
	{ id: 'title', label: 'Title A–Z' },
];

export const EMPTY_CATALOG_QUERY: CatalogQuery = {
	q: '',
	type: 'all',
	topic: '',
	color: '',
	tag: '',
	orient: '',
	exclude: '',
	sort: 'newest',
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

export function normalizeCatalogColor(raw: string): string {
	const value = raw.trim().toLowerCase().replace(/^#/, '');
	if (CATALOG_COLORS.some((item) => item.id === value)) return value;
	if (/^[0-9a-f]{6}$/.test(value)) return value;
	if (/^[0-9a-f]{3}$/.test(value)) {
		return value
			.split('')
			.map((char) => char + char)
			.join('');
	}
	return '';
}

export function catalogColorHex(colorId: string): string {
	const family = CATALOG_COLORS.find((item) => item.id === colorId);
	if (family) return family.hex.replace(/^#/, '').toLowerCase();
	if (/^[0-9a-f]{6}$/i.test(colorId)) return colorId.toLowerCase();
	return '';
}

export function assetMatchesColor(asset: AssetDetail, colorId: string): boolean {
	const palette = asset.colorPalette || [];
	if (!palette.length) return false;

	const family = CATALOG_COLORS.find((item) => item.id === colorId);
	if (family) {
		const target = parseHex(family.hex);
		if (!target) return false;
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

	const target = parseHex(colorId);
	if (!target) return false;
	return palette.some((swatch) => {
		const rgb = parseHex(swatch.hex);
		return Boolean(rgb && colorDistance(rgb, target) < 158 ** 2);
	});
}

export function assetOrientation(asset: AssetDetail): CatalogOrient {
	const width = asset.width || 0;
	const height = asset.height || 0;
	if (!width || !height) return '';
	const ratio = width / height;
	if (ratio > 1.08) return 'landscape';
	if (ratio < 0.92) return 'portrait';
	return 'square';
}

function assetSearchHay(asset: AssetDetail): string {
	return [
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
}

export function parseCatalogQuery(
	url: URL,
	hints: Partial<Pick<CatalogQuery, 'q' | 'type' | 'topic'>> = {},
): CatalogQuery {
	const typeParam = url.searchParams.get('category') || url.searchParams.get('type') || '';
	const topicParam = toPathSlug(url.searchParams.get('topic') || '');
	const colorParam = (url.searchParams.get('color') || '').trim().toLowerCase();
	const tagParam = toPathSlug(url.searchParams.get('tag') || '');
	const orientParam = (url.searchParams.get('orient') || '') as CatalogOrient;
	const sortParam = (url.searchParams.get('sort') || '') as CatalogSort;
	const excludeParam = (url.searchParams.get('exclude') || '').trim();

	const type: CatalogType = hints.type
		? hints.type
		: isCategorySlug(typeParam)
			? typeParam
			: 'all';

	const topic = hints.topic || (topicParam && getContentCategoryBySlug(topicParam) ? topicParam : '');
	const color = normalizeCatalogColor(colorParam);

	return {
		q: (hints.q || '').trim(),
		type,
		topic,
		color,
		tag: tagParam,
		orient: CATALOG_ORIENTS.some((item) => item.id === orientParam) ? orientParam : '',
		exclude: excludeParam.slice(0, 80),
		sort: CATALOG_SORTS.some((item) => item.id === sortParam) ? sortParam : 'newest',
	};
}

function appendSharedParams(params: URLSearchParams, query: CatalogQuery) {
	if (query.type !== 'all') params.set('category', query.type);
	if (query.topic) params.set('topic', query.topic);
	if (query.color) params.set('color', query.color);
	if (query.tag) params.set('tag', query.tag);
	if (query.orient) params.set('orient', query.orient);
	if (query.exclude) params.set('exclude', query.exclude);
	if (query.sort && query.sort !== 'newest') params.set('sort', query.sort);
}

export function catalogHref(query: CatalogQuery, patch: Partial<CatalogQuery> = {}): string {
	const next: CatalogQuery = { ...query, ...patch };
	next.q = next.q.trim();
	next.topic = toPathSlug(next.topic);
	next.tag = toPathSlug(next.tag);
	next.exclude = next.exclude.trim().slice(0, 80);
	if (next.topic && !getContentCategoryBySlug(next.topic)) next.topic = '';
	if (next.type !== 'all' && !isCategorySlug(next.type)) next.type = 'all';
	if (next.color) next.color = normalizeCatalogColor(next.color);
	if (next.license && !CATALOG_LICENSES.some((item) => item.id === next.license)) next.license = '';
	if (next.orient && !CATALOG_ORIENTS.some((item) => item.id === next.orient)) next.orient = '';
	if (next.format && !CATALOG_FORMATS.some((item) => item.id === next.format)) next.format = '';
	if (!CATALOG_SORTS.some((item) => item.id === next.sort)) next.sort = 'newest';

	const params = new URLSearchParams();
	let pathname = '/s/';

	if (next.q) {
		pathname = `/s/${encodeURIComponent(toPathSlug(next.q))}`;
		appendSharedParams(params, next);
	} else if (next.topic) {
		pathname = `/c/${encodeURIComponent(next.topic)}`;
		appendSharedParams(params, { ...next, topic: '' });
	} else if (next.type !== 'all') {
		pathname = `/${next.type}`;
		appendSharedParams(params, { ...next, type: 'all' });
	} else {
		appendSharedParams(params, next);
	}

	const qs = params.toString();
	return qs ? `${pathname}?${qs}` : pathname;
}

export function catalogPathAndParams(query: CatalogQuery) {
	const href = catalogHref(query);
	const qIndex = href.indexOf('?');
	return {
		pathname: qIndex === -1 ? href : href.slice(0, qIndex),
		params: new URLSearchParams(qIndex === -1 ? '' : href.slice(qIndex + 1)),
	};
}

export function catalogHasFilters(query: CatalogQuery) {
	return Boolean(
		query.q ||
			query.type !== 'all' ||
			query.topic ||
			query.color ||
			query.tag ||
			query.license ||
			query.ai ||
			query.orient ||
			query.access ||
			query.format ||
			query.exclude ||
			query.sort !== 'newest',
	);
}

function matchesExclude(asset: AssetDetail, exclude: string): boolean {
	const terms = exclude
		.toLowerCase()
		.split(/[,]+/)
		.map((item) => item.trim())
		.filter(Boolean);
	if (!terms.length) return false;
	const hay = assetSearchHay(asset);
	return terms.some((term) => hay.includes(term));
}

export function applyCatalogFilters(assets: AssetDetail[], query: CatalogQuery): AssetDetail[] {
	const needle = query.q.trim().toLowerCase();
	const filtered = assets.filter((asset) => {
		if (query.type !== 'all' && asset.category !== query.type) return false;
		if (query.topic && !assetMatchesContentCategory(asset, query.topic)) return false;
		if (query.tag && !(asset.tags || []).some((value) => tagMatches(value, query.tag))) return false;
		if (query.color && !assetMatchesColor(asset, query.color)) return false;
		if (query.license && assetLicenseKind(asset) !== query.license) return false;
		if (query.ai === 'yes' && !assetIsAiGenerated(asset)) return false;
		if (query.ai === 'no' && assetIsAiGenerated(asset)) return false;
		if (query.orient && assetOrientation(asset) !== query.orient) return false;
		if (query.access === 'pro' && !asset.isPremium) return false;
		if (query.access === 'standard' && asset.isPremium) return false;
		if (query.format && assetFormat(asset) !== query.format) return false;
		if (query.exclude && matchesExclude(asset, query.exclude)) return false;
		if (needle && !assetSearchHay(asset).includes(needle)) return false;
		return true;
	});

	return sortCatalogAssets(filtered, query.sort);
}

export function sortCatalogAssets(assets: AssetDetail[], sort: CatalogSort): AssetDetail[] {
	const copy = [...assets];
	if (sort === 'oldest') {
		return copy.sort((a, b) => (a.publishedAt || '').localeCompare(b.publishedAt || ''));
	}
	if (sort === 'title') {
		return copy.sort((a, b) => a.title.localeCompare(b.title));
	}
	return copy.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
}

export type CatalogFacets = {
	types: { slug: CatalogType; label: string; count: number }[];
	topics: { slug: string; label: string; count: number }[];
	colors: { id: string; label: string; hex: string; count: number }[];
	tags: { slug: string; label: string; count: number }[];
	licenses: { id: CatalogLicense; label: string; count: number }[];
	ai: { id: CatalogAi; label: string; count: number }[];
	orients: { id: CatalogOrient; label: string; count: number }[];
	access: { id: CatalogAccess; label: string; count: number }[];
	formats: { id: CatalogFormat; label: string; count: number }[];
};

function except<K extends keyof CatalogQuery>(query: CatalogQuery, key: K): CatalogQuery {
	if (key === 'type') return { ...query, type: 'all' };
	if (key === 'q') return { ...query, q: '' };
	if (key === 'sort') return { ...query, sort: 'newest' };
	return { ...query, [key]: '' };
}

export function catalogFacets(pool: AssetDetail[], query: CatalogQuery, tagLimit = 18): CatalogFacets {
	const typeBase = applyCatalogFilters(pool, except(query, 'type'));
	const topicBase = applyCatalogFilters(pool, except(query, 'topic'));
	const colorBase = applyCatalogFilters(pool, except(query, 'color'));
	const tagBase = applyCatalogFilters(pool, except(query, 'tag'));
	const licenseBase = applyCatalogFilters(pool, except(query, 'license'));
	const aiBase = applyCatalogFilters(pool, except(query, 'ai'));
	const orientBase = applyCatalogFilters(pool, except(query, 'orient'));
	const accessBase = applyCatalogFilters(pool, except(query, 'access'));
	const formatBase = applyCatalogFilters(pool, except(query, 'format'));

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

	return {
		types,
		topics,
		colors,
		tags,
		licenses: CATALOG_LICENSES.map((item) => ({
			...item,
			count: licenseBase.filter((asset) => assetLicenseKind(asset) === item.id).length,
		})),
		ai: CATALOG_AI.map((item) => ({
			...item,
			count: aiBase.filter((asset) => (item.id === 'yes') === assetIsAiGenerated(asset)).length,
		})),
		orients: CATALOG_ORIENTS.map((item) => ({
			...item,
			count: orientBase.filter((asset) => assetOrientation(asset) === item.id).length,
		})),
		access: CATALOG_ACCESS.map((item) => ({
			...item,
			count: accessBase.filter((asset) => (item.id === 'pro') === Boolean(asset.isPremium)).length,
		})),
		formats: CATALOG_FORMATS.map((item) => ({
			...item,
			count: formatBase.filter((asset) => assetFormat(asset) === item.id).length,
		})),
	};
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
	if (query.license) {
		const label = CATALOG_LICENSES.find((item) => item.id === query.license)?.label || query.license;
		chips.push({ key: 'license', label, href: catalogHref(query, { license: '' }) });
	}
	if (query.ai) {
		const label = CATALOG_AI.find((item) => item.id === query.ai)?.label || query.ai;
		chips.push({ key: 'ai', label, href: catalogHref(query, { ai: '' }) });
	}
	if (query.orient) {
		const label = CATALOG_ORIENTS.find((item) => item.id === query.orient)?.label || query.orient;
		chips.push({ key: 'orient', label, href: catalogHref(query, { orient: '' }) });
	}
	if (query.access) {
		const label = CATALOG_ACCESS.find((item) => item.id === query.access)?.label || query.access;
		chips.push({ key: 'access', label, href: catalogHref(query, { access: '' }) });
	}
	if (query.format) {
		const label = CATALOG_FORMATS.find((item) => item.id === query.format)?.label || query.format;
		chips.push({ key: 'format', label, href: catalogHref(query, { format: '' }) });
	}
	if (query.color) {
		const family = CATALOG_COLORS.find((item) => item.id === query.color);
		const label = family ? family.label : `#${catalogColorHex(query.color).toUpperCase()}`;
		chips.push({ key: 'color', label, href: catalogHref(query, { color: '' }) });
	}
	if (query.tag) {
		chips.push({ key: 'tag', label: query.tag.replace(/-/g, ' '), href: catalogHref(query, { tag: '' }) });
	}
	if (query.exclude) {
		chips.push({
			key: 'exclude',
			label: `Not “${query.exclude}”`,
			href: catalogHref(query, { exclude: '' }),
		});
	}
	if (query.sort !== 'newest') {
		const label = CATALOG_SORTS.find((item) => item.id === query.sort)?.label || query.sort;
		chips.push({ key: 'sort', label, href: catalogHref(query, { sort: 'newest' }) });
	}
	if (query.q) {
		chips.push({ key: 'q', label: `“${query.q}”`, href: catalogHref(query, { q: '' }) });
	}
	return chips;
}
