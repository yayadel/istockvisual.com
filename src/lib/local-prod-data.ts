import { isCategorySlug, type CategorySlug } from '../config/categories';
import type { AssetDetail } from './asset-types';
import type { CatalogCardPayload } from './catalog-card';
import { parsePublicPreviewFile } from './public-image';

const PROD = 'https://stockvisual.org';

/** Topic slugs that already have live /c/ pages (from production sitemap). */
export async function fetchProdPopulatedContentCategorySlugs(): Promise<Set<string>> {
	const slugs = new Set<string>();
	const res = await fetch(`${PROD}/sitemap-categories.xml`, {
		headers: { Accept: 'application/xml,text/xml,*/*' },
		signal: AbortSignal.timeout(4000),
	}).catch(() => null);
	if (!res?.ok) return slugs;
	const xml = await res.text().catch(() => '');
	for (const match of xml.matchAll(/https:\/\/(?:istockvisual\.com|stockvisual\.org)\/c\/([a-z0-9-]+)/gi)) {
		const slug = match[1]?.toLowerCase();
		if (slug) slugs.add(slug);
	}
	return slugs;
}

function decodeHtml(value: string) {
	return value
		.replace(/<[^>]+>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/\s+/g, ' ')
		.trim();
}

function paragraphAfterLabel(html: string, label: string) {
	const start = html.indexOf(label);
	if (start < 0) return '';
	const slice = html.slice(start, start + 4000);
	const match = slice.match(/<p>([\s\S]*?)<\/p>/i);
	return match?.[1] ? decodeHtml(match[1]) : '';
}

function idFromPreview(preview: string) {
	const file = preview.split('/').pop()?.split('?')[0] || '';
	return parsePublicPreviewFile(file)?.id || '';
}

function cardToAsset(card: CatalogCardPayload): AssetDetail | null {
	const parts = card.href.replace(/^\//, '').split('/');
	const category = parts[0];
	const slug = parts[1];
	if (!category || !slug || !isCategorySlug(category)) return null;
	const id = idFromPreview(card.preview);
	if (!id) return null;
	const preview = card.preview.startsWith('http') ? card.preview : `${PROD}${card.preview}`;
	return {
		_id: id,
		title: card.title,
		slug,
		category,
		previewUrl: preview.replace(/_500w\./, '_1000w.'),
		width: card.width || 1536,
		height: card.height || 1024,
		isPremium: card.isPremium,
		source: 'generated',
		license: 'CC0 — Free to Use, Commercial OK',
	};
}

export async function fetchProdCatalog(limit: number): Promise<AssetDetail[]> {
	const items: AssetDetail[] = [];
	for (let page = 1; items.length < limit && page <= 10; page += 1) {
		const res = await fetch(`${PROD}/api/catalog?page=${page}`);
		if (!res.ok) break;
		const data = (await res.json()) as { items?: CatalogCardPayload[]; hasMore?: boolean };
		for (const card of data.items || []) {
			const asset = cardToAsset(card);
			if (asset) items.push(asset);
			if (items.length >= limit) break;
		}
		if (!data.hasMore) break;
	}
	return items.slice(0, limit);
}

async function fetchProdAssetFromCatalog(
	category: CategorySlug,
	slug: string,
): Promise<AssetDetail | null> {
	const href = `/${category}/${slug}`;
	const queries = [
		slug.replace(/-\d{4,}$/, '').replace(/-/g, ' '),
		slug.replace(/-/g, ' '),
	];
	for (const q of queries) {
		const res = await fetch(`${PROD}/api/catalog?page=1&q=${encodeURIComponent(q)}`, {
			signal: AbortSignal.timeout(2500),
		}).catch(() => null);
		if (!res.ok) continue;
		const data = (await res.json()) as { items?: CatalogCardPayload[] };
		const match = (data.items || []).find(
			(item) => item.href === href || item.href.endsWith(`/${slug}`),
		);
		if (match) return cardToAsset(match);
	}
	return null;
}

async function enrichAssetFromHtml(
	asset: AssetDetail,
	category: CategorySlug,
	slug: string,
): Promise<AssetDetail> {
	const res = await fetch(`${PROD}/${category}/${slug}`, {
		headers: { Accept: 'text/html' },
		signal: AbortSignal.timeout(2500),
	}).catch(() => null);
	if (!res?.ok) return asset;
	const html = await res.text().catch(() => '');
	if (!html) return asset;
	const creationDescription = paragraphAfterLabel(html, 'Creation description');
	const usageTips = paragraphAfterLabel(html, 'Usage tips');
	const description =
		html.match(/name="description"\s+content="([^"]+)"/)?.[1] || asset.description || '';
	const prompt = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/)?.[1]?.replace(/<[^>]+>/g, '').trim();
	const tags = [...html.matchAll(/href="\/s\/([^"]+)"/g)]
		.map((match) => decodeURIComponent(match[1] || '').replace(/\+/g, ' '))
		.filter(Boolean)
		.slice(0, 24);

	return {
		...asset,
		description: description || asset.description,
		shortDescription: asset.shortDescription || description,
		creationDescription: creationDescription || asset.creationDescription,
		usageTips: usageTips || asset.usageTips,
		imagePrompt: prompt || asset.imagePrompt,
		tags: tags.length > 0 ? tags : asset.tags,
	};
}

export async function fetchProdAssetBySlug(
	category: CategorySlug,
	slug: string,
): Promise<AssetDetail | null> {
	const fromCatalog = await fetchProdAssetFromCatalog(category, slug);
	if (fromCatalog) {
		try {
			return await enrichAssetFromHtml(fromCatalog, category, slug);
		} catch {
			return fromCatalog;
		}
	}

	const res = await fetch(`${PROD}/${category}/${slug}`, {
		headers: { Accept: 'text/html' },
		signal: AbortSignal.timeout(4000),
	}).catch(() => null);
	if (!res?.ok) return fromCatalog;
	const html = await res.text();

	const ogImage = html.match(/property="og:image"\s+content="([^"]+)"/)?.[1] || '';
	const id = idFromPreview(ogImage);
	if (!id) return null;

	const title =
		html.match(/property="og:title"\s+content="([^"]+)"/)?.[1]?.replace(/\s+·\s+Free Stock Image.*$/i, '') ||
		slug;
	const description = html.match(/name="description"\s+content="([^"]+)"/)?.[1] || '';
	const width = Number(html.match(/property="og:image:width"\s+content="(\d+)"/)?.[1] || 1536);
	const height = Number(html.match(/property="og:image:height"\s+content="(\d+)"/)?.[1] || 1024);
	const prompt = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/)?.[1]?.replace(/<[^>]+>/g, '').trim();
	const tags = [...html.matchAll(/href="\/s\/([^"]+)"/g)]
		.map((match) => decodeURIComponent(match[1] || '').replace(/\+/g, ' '))
		.filter(Boolean)
		.slice(0, 24);

	return {
		_id: id,
		title,
		slug,
		category,
		description,
		shortDescription: description,
		creationDescription: paragraphAfterLabel(html, 'Creation description'),
		usageTips: paragraphAfterLabel(html, 'Usage tips'),
		tags,
		previewUrl: `${PROD}/preview/${encodeURIComponent(id)}_1000w.jpg`,
		width,
		height,
		source: 'generated',
		imagePrompt: prompt,
		license: 'CC0 — Free to Use, Commercial OK',
	};
}
