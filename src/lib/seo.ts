import type { CategorySlug } from '../config/categories';
import { contentCategoryPath } from './content-categories';

export const ABOUT_PATH = '/info/about';
export const HELP_PATH = '/info/help';
export const LICENSE_PATH = '/info/license';
export const TERMS_PATH = '/info/terms';
export const PRIVACY_PATH = '/info/privacy';
export const COOKIES_PATH = '/info/cookies';
export const REFUNDS_PATH = '/info/refunds';
export const LEGAL_CONTACT_EMAIL = 'hello@istockvisual.com';
export const LEGAL_UPDATED = 'August 16, 2026';

export const LEGAL_PAGES = [
	{ href: ABOUT_PATH, label: 'About' },
	{ href: HELP_PATH, label: 'Help' },
	{ href: LICENSE_PATH, label: 'CC0 License' },
	{ href: TERMS_PATH, label: 'Terms' },
	{ href: PRIVACY_PATH, label: 'Privacy' },
	{ href: COOKIES_PATH, label: 'Cookies' },
	{ href: REFUNDS_PATH, label: 'Refunds' },
] as const;

export const SITE_BRAND = 'iStockVisual.com';
export const USAGE_TERMS = 'CC0. Free for commercial and personal use. Attribution not required.';
export const COPYRIGHT_NOTICE = 'CC0 1.0 Universal. No attribution required.';

const DESC_MAX = 160;

export function assetSearchTitle(imageName: string): string {
	return `${imageName.trim()} Stock Image - Free Download`;
}

export function assetPageHeading(imageName: string): string {
	return assetSearchTitle(imageName);
}

export function assetSearchDescription(input: {
	title: string;
	shortDescription?: string;
	description?: string;
	category: CategorySlug;
}): string {
	const heading = assetSearchTitle(input.title);
	const lead = (input.shortDescription || input.description || '').trim();
	const closer = 'Royalty-free for commercial use.';

	if (!lead) {
		return clipDescription(`${heading}. ${closer}`);
	}

	const punctuated = /[.!?]$/.test(lead) ? lead : `${lead}.`;
	return clipDescription(`${heading}. ${punctuated} ${closer}`);
}

function clipDescription(text: string): string {
	if (text.length <= DESC_MAX) return text;
	const sliced = text.slice(0, DESC_MAX - 1);
	const lastSpace = sliced.lastIndexOf(' ');
	return `${(lastSpace > 80 ? sliced.slice(0, lastSpace) : sliced).trimEnd()}…`;
}

export function absoluteUrl(pathOrUrl: string, origin: string): string {
	try {
		return new URL(pathOrUrl, origin).href;
	} catch {
		return pathOrUrl;
	}
}

export function stringifyJsonLd(data: unknown): string {
	return JSON.stringify(data).replace(/</g, '\\u003c');
}

export const SITE_TAGLINE =
	'Stock photos, illustrations, vectors, and 3D assets — plus AI editing tools.';
export const SITE_HOME_DESCRIPTION =
	'Royalty-free stock photos, illustrations, vectors, and 3D for commercial and personal use. Free downloads on iStockVisual.';
export const SITE_HOME_TITLE = 'Free Stock Photos, Illustrations & 3D';

export function siteOrigin(fallback?: string): string {
	const configured = import.meta.env.SITE;
	if (configured) {
		try {
			return new URL(configured).origin;
		} catch {
			/* use fallback */
		}
	}
	return String(fallback || 'https://istockvisual.com').replace(/\/$/, '');
}

export function canonicalPath(pathname: string): string {
	const trimmed = pathname.replace(/\/+$/, '');
	return trimmed || '/';
}

export function canonicalHref(pathname: string, origin?: string): string {
	const root = siteOrigin(origin);
	const path = canonicalPath(pathname);
	return path === '/' ? `${root}/` : `${root}${path}`;
}

export function libraryPageTitle(subject: string): string {
	const name = subject.trim();
	return name ? `${name} Stock Images - Free Download` : 'Stock Images - Free Download';
}

const JSON_LD_LIST_LIMIT = 24;

export type JsonLdListAsset = {
	title: string;
	slug: string;
	category: CategorySlug;
	previewUrl?: string;
};

function homeUrl(origin: string) {
	return `${origin.replace(/\/$/, '')}/`;
}

export function websiteId(origin: string) {
	return `${origin.replace(/\/$/, '')}/#website`;
}

export function organizationId(origin: string) {
	return `${origin.replace(/\/$/, '')}/#organization`;
}

export type BreadcrumbCrumb = { name: string; path: string };

function breadcrumbList(origin: string, pageUrl: string, crumbs: BreadcrumbCrumb[]) {
	const breadcrumbId = `${pageUrl}#breadcrumb`;
	return {
		'@type': 'BreadcrumbList',
		'@id': breadcrumbId,
		itemListElement: crumbs.map((crumb, index) => ({
			'@type': 'ListItem',
			position: index + 1,
			name: crumb.name,
			item: absoluteUrl(crumb.path, origin),
		})),
	};
}

export function organizationJsonLd(origin: string) {
	const root = homeUrl(origin);
	return {
		'@type': 'Organization',
		'@id': organizationId(origin),
		name: SITE_BRAND,
		url: root,
		email: LEGAL_CONTACT_EMAIL,
		logo: {
			'@type': 'ImageObject',
			url: absoluteUrl('/favicon.svg', origin),
		},
	};
}

export function websiteJsonLd(origin: string) {
	const root = homeUrl(origin);
	return {
		'@type': 'WebSite',
		'@id': websiteId(origin),
		name: SITE_BRAND,
		url: root,
		description: SITE_TAGLINE,
		inLanguage: 'en',
		publisher: { '@id': organizationId(origin) },
	};
}

function assetListItems(origin: string, assets: JsonLdListAsset[]) {
	return assets.slice(0, JSON_LD_LIST_LIMIT).map((asset, index) => {
		const url = absoluteUrl(`/${asset.category}/${asset.slug}`, origin);
		const item: Record<string, unknown> = {
			'@type': 'ImageObject',
			'@id': `${url}#image`,
			name: asset.title,
			url,
			contentUrl: asset.previewUrl ? absoluteUrl(asset.previewUrl, origin) : url,
		};
		if (asset.previewUrl) item.thumbnailUrl = absoluteUrl(asset.previewUrl, origin);
		return {
			'@type': 'ListItem',
			position: index + 1,
			item,
		};
	});
}

function collectionListItems(origin: string, collections: Array<{ name: string; path: string }>) {
	return collections.map((collection, index) => ({
		'@type': 'ListItem',
		position: index + 1,
		item: {
			'@type': 'CollectionPage',
			name: collection.name,
			url: absoluteUrl(collection.path, origin),
		},
	}));
}

function itemListNode(
	listId: string,
	name: string,
	origin: string,
	assets: JsonLdListAsset[],
	numberOfItems?: number,
) {
	return {
		'@type': 'ItemList',
		'@id': listId,
		name,
		numberOfItems: numberOfItems ?? assets.length,
		itemListOrder: 'https://schema.org/ItemListOrderDescending',
		itemListElement: assetListItems(origin, assets),
	};
}

export function homeJsonLd(input: {
	origin: string;
	title: string;
	description: string;
	assets: JsonLdListAsset[];
	categories?: Array<{ name: string; path: string }>;
}): Record<string, unknown> {
	const pageUrl = homeUrl(input.origin);
	const listId = `${pageUrl}#featured`;
	const breadcrumb = breadcrumbList(input.origin, pageUrl, [{ name: 'Home', path: '/' }]);
	const first = input.assets[0];
	const graph: unknown[] = [
		organizationJsonLd(input.origin),
		websiteJsonLd(input.origin),
		{
			'@type': 'WebPage',
			'@id': pageUrl,
			url: pageUrl,
			name: input.title,
			description: input.description,
			inLanguage: 'en',
			isPartOf: { '@id': websiteId(input.origin) },
			about: { '@id': organizationId(input.origin) },
			breadcrumb: { '@id': breadcrumb['@id'] },
			mainEntity: { '@id': listId },
			primaryImageOfPage: first
				? {
						'@id': `${absoluteUrl(`/${first.category}/${first.slug}`, input.origin)}#image`,
					}
				: undefined,
		},
		breadcrumb,
		itemListNode(listId, 'Featured stock images', input.origin, input.assets),
	];

	if (input.categories?.length) {
		graph.push({
			'@type': 'ItemList',
			'@id': `${pageUrl}#categories`,
			name: 'Popular categories',
			numberOfItems: input.categories.length,
			itemListElement: collectionListItems(input.origin, input.categories),
		});
	}

	return { '@context': 'https://schema.org', '@graph': graph };
}

export function collectionPageJsonLd(input: {
	origin: string;
	pagePath: string;
	title: string;
	description: string;
	assets: JsonLdListAsset[];
	totalCount?: number;
	crumbs: BreadcrumbCrumb[];
	collections?: Array<{ name: string; path: string }>;
}): Record<string, unknown> {
	const pageUrl = absoluteUrl(input.pagePath, input.origin);
	const listId = `${pageUrl}#items`;
	const breadcrumb = breadcrumbList(input.origin, pageUrl, input.crumbs);
	const first = input.assets[0];
	const graph: unknown[] = [
		organizationJsonLd(input.origin),
		websiteJsonLd(input.origin),
		{
			'@type': 'CollectionPage',
			'@id': pageUrl,
			url: pageUrl,
			name: input.title,
			description: input.description,
			inLanguage: 'en',
			isPartOf: { '@id': websiteId(input.origin) },
			breadcrumb: { '@id': breadcrumb['@id'] },
			mainEntity: { '@id': listId },
			primaryImageOfPage: first
				? {
						'@id': `${absoluteUrl(`/${first.category}/${first.slug}`, input.origin)}#image`,
					}
				: undefined,
		},
		breadcrumb,
	];

	if (input.collections?.length && input.assets.length === 0) {
		graph.push({
			'@type': 'ItemList',
			'@id': listId,
			name: input.title,
			numberOfItems: input.collections.length,
			itemListElement: collectionListItems(input.origin, input.collections),
		});
	} else {
		graph.push(
			itemListNode(
				listId,
				input.title,
				input.origin,
				input.assets,
				input.totalCount ?? input.assets.length,
			),
		);
	}

	return { '@context': 'https://schema.org', '@graph': graph };
}

export function assetJsonLd(input: {
	origin: string;
	pagePath: string;
	title: string;
	seoTitle: string;
	seoDescription: string;
	imageDescription?: string;
	imageUrl?: string;
	thumbnailUrl?: string;
	width?: number;
	height?: number;
	fileType?: string;
	medium?: string;
	tags?: string[];
	publishedAt?: string;
	categorySlug: CategorySlug;
	categoryLabel: string;
	contentCategories?: string[];
}): Record<string, unknown> {
	const pageUrl = absoluteUrl(input.pagePath, input.origin);
	const licenseUrl = absoluteUrl(LICENSE_PATH, input.origin);
	const imageId = `${pageUrl}#image`;
	const breadcrumbId = `${pageUrl}#breadcrumb`;
	const imageUrl = input.imageUrl ? absoluteUrl(input.imageUrl, input.origin) : undefined;
	const thumbnailUrl = input.thumbnailUrl
		? absoluteUrl(input.thumbnailUrl, input.origin)
		: imageUrl;
	const encodingFormat =
		input.fileType && input.fileType.includes('/')
			? input.fileType
			: input.fileType
				? `image/${input.fileType.replace(/^\./, '')}`
				: 'image/jpeg';
	const imageDescription = (
		input.imageDescription ||
		input.seoDescription ||
		input.title
	).trim();

	const organization = organizationJsonLd(input.origin);

	const imageObject: Record<string, unknown> = {
		'@type': ['ImageObject', 'VisualArtwork'],
		'@id': imageId,
		name: input.title,
		description: imageDescription,
		contentUrl: imageUrl,
		thumbnailUrl,
		license: licenseUrl,
		acquireLicensePage: licenseUrl,
		copyrightNotice: COPYRIGHT_NOTICE,
		creator: organization,
		creditText: `Generated by ${SITE_BRAND}`,
		encodingFormat,
		usageTerms: USAGE_TERMS,
		isAccessibleForFree: true,
		isFamilyFriendly: true,
		representativeOfPage: true,
	};

	if (input.width) imageObject.width = input.width;
	if (input.height) imageObject.height = input.height;
	if (input.medium) imageObject.artform = input.medium;
	if (input.tags?.length) imageObject.keywords = input.tags.join(', ');
	if (input.publishedAt) {
		imageObject.datePublished = input.publishedAt;
		imageObject.uploadDate = input.publishedAt;
	}

	const crumbs: Array<{ '@type': string; position: number; name: string; item: string }> = [
		{ '@type': 'ListItem', position: 1, name: 'Home', item: homeUrl(input.origin) },
		{
			'@type': 'ListItem',
			position: 2,
			name: input.categoryLabel,
			item: absoluteUrl(`/${input.categorySlug}`, input.origin),
		},
	];

	for (const label of input.contentCategories || []) {
		crumbs.push({
			'@type': 'ListItem',
			position: crumbs.length + 1,
			name: label,
			item: absoluteUrl(contentCategoryPath(label), input.origin),
		});
	}

	crumbs.push({
		'@type': 'ListItem',
		position: crumbs.length + 1,
		name: input.title,
		item: pageUrl,
	});

	return {
		'@context': 'https://schema.org',
		'@graph': [
			organization,
			websiteJsonLd(input.origin),
			{
				'@type': 'WebPage',
				'@id': pageUrl,
				url: pageUrl,
				name: input.seoTitle,
				description: input.seoDescription,
				inLanguage: 'en',
				isPartOf: { '@id': websiteId(input.origin) },
				primaryImageOfPage: { '@id': imageId },
				breadcrumb: { '@id': breadcrumbId },
			},
			{
				'@type': 'BreadcrumbList',
				'@id': breadcrumbId,
				itemListElement: crumbs,
			},
			imageObject,
		],
	};
}
