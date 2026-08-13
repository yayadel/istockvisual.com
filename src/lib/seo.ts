import type { CategorySlug } from '../config/categories';
import { contentCategoryPath } from './content-categories';

const DESC_MAX = 160;

export function assetSearchTitle(imageName: string): string {
	return `Free Download ${imageName.trim()} Stock Image`;
}

function stockNoun(category: CategorySlug): string {
	switch (category) {
		case 'illustrations':
 mar	return 'stock illustration';
		case 'vectors':
			return 'stock vector';
		case '3d':
			return 'stock 3D image';
		default:
			return 'stock photo';
	}
}

export function assetSearchDescription(input: {
	title: string;
	shortDescription?: string;
	description?: string;
	category: CategorySlug;
}): string {
	const noun = stockNoun(input.category);
	const lead = (input.shortDescription || input.description || '').trim();
	const closer = `Free HD ${noun} download. Royalty-free for commercial use.`;

	if (!lead) {
		return clipDescription(`Free download ${input.title} ${noun}. ${closer}`);
	}

	const punctuated = /[.!?]$/.test(lead) ? lead : `${lead}.`;
	return clipDescription(`${punctuated} ${closer}`);
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

export function assetJsonLd(input: {
	origin: string;
	pagePath: string;
	title: string;
	seoTitle: string;
	seoDescription: string;
	imageUrl?: string;
	width?: number;
	height?: number;
	fileType?: string;
	tags?: string[];
	publishedAt?: string;
	categorySlug: CategorySlug;
	categoryLabel: string;
	contentCategories?: string[];
}): Record<string, unknown> {
	const pageUrl = absoluteUrl(input.pagePath, input.origin);
	const imageId = `${pageUrl}#image`;
	const breadcrumbId = `${pageUrl}#breadcrumb`;
	const websiteId = `${input.origin}/#website`;
	const orgId = `${input.origin}/#organization`;
	const imageUrl = input.imageUrl ? absoluteUrl(input.imageUrl, input.origin) : undefined;

	const imageObject: Record<string, unknown> = {
		'@type': 'ImageObject',
		'@id': imageId,
		name: input.title,
		alternateName: input.seoTitle,
		description: input.seoDescription,
		url: pageUrl,
		license: pageUrl,
		acquireLicensePage: pageUrl,
		usageInfo: pageUrl,
		creditText: 'iStockVisual',
		creator: { '@id': orgId },
		copyrightNotice: 'iStockVisual',
		isAccessibleForFree: true,
		isFamilyFriendly: true,
		representativeOfPage: true,
		inLanguage: 'en',
	};

	if (imageUrl) {
		imageObject.contentUrl = imageUrl;
		imageObject.thumbnailUrl = imageUrl;
	}
	if (input.width) imageObject.width = input.width;
	if (input.height) imageObject.height = input.height;
	if (input.fileType) imageObject.encodingFormat = input.fileType;
	if (input.tags?.length) imageObject.keywords = input.tags.join(', ');
	if (input.publishedAt) {
		imageObject.datePublished = input.publishedAt;
		imageObject.uploadDate = input.publishedAt;
	}

	const crumbs: Array<{ '@type': string; position: number; name: string; item: string }> = [
		{ '@type': 'ListItem', position: 1, name: 'Home', item: `${input.origin}/` },
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
			{
				'@type': 'Organization',
				'@id': orgId,
				name: 'iStockVisual',
				url: `${input.origin}/`,
			},
			{
				'@type': 'WebSite',
				'@id': websiteId,
				name: 'iStockVisual',
				url: `${input.origin}/`,
				publisher: { '@id': orgId },
			},
			{
				'@type': 'WebPage',
				'@id': pageUrl,
				url: pageUrl,
				name: input.seoTitle,
				description: input.seoDescription,
				inLanguage: 'en',
				isPartOf: { '@id': websiteId },
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
