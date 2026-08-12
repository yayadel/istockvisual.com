import type { CategorySlug } from '../config/categories';
import {
	DEFAULT_IMAGE_HEIGHT,
	DEFAULT_IMAGE_WIDTH,
	generateAssetMetadata,
	generateImageBytes,
} from './ai-generate';
import {
	mediumToCategory,
	slugifyTitle,
	type AssetDetail,
	type GeneratedAssetMeta,
} from './asset-types';
import {
	getGeneratedAssetById,
	getGeneratedAssetBySlug,
	insertGeneratedAsset,
	listGeneratedAssetsByCategory,
	listRecentGeneratedAssets,
	slugExists,
	generatedToDetail,
} from './generated-assets';
import { claimNextKeyword, releaseKeyword } from './keywords';
import {
	getAssetById as getSanityAssetById,
	getAssetBySlug as getSanityAssetBySlug,
	listAssetsByCategory as listSanityAssetsByCategory,
	listFeaturedAssets as listSanityFeaturedAssets,
	type AssetDoc,
} from './sanity';

type GenerateEnv = {
	DB?: D1Database;
	MEDIA?: R2Bucket;
	AI?: { run(model: string, input: Record<string, unknown>): Promise<unknown> };
	OPENAI_API_KEY?: string;
	OPENAI_BASE_URL?: string;
	OPENAI_MODEL?: string;
};

export type GenerateAssetResult = {
	asset: AssetDetail;
	meta: GeneratedAssetMeta;
	keyword: string;
};

function demoToDetail(asset: AssetDoc): AssetDetail {
	return { ...asset, source: 'demo' };
}

function sanityToDetail(asset: AssetDoc): AssetDetail {
	return { ...asset, source: 'sanity' };
}

export async function resolveAssetBySlug(
	db: D1Database | undefined,
	origin: string,
	category: CategorySlug,
	slug: string,
): Promise<AssetDetail | null> {
	if (db) {
		const generated = await getGeneratedAssetBySlug(db, category, slug);
		if (generated) {
			return generatedToDetail(generated, origin);
		}
	}

	const sanity = await getSanityAssetBySlug(category, slug);
	if (sanity) return sanityToDetail(sanity);

	return null;
}

export async function resolveAssetById(
	db: D1Database | undefined,
	origin: string,
	id: string,
): Promise<AssetDetail | null> {
	if (db && id.startsWith('gen-')) {
		const generated = await getGeneratedAssetById(db, id);
		if (generated) return generatedToDetail(generated, origin);
	}

	const sanity = await getSanityAssetById(id);
	if (sanity) return sanityToDetail(sanity);

	return null;
}

export async function listCategoryAssets(
	db: D1Database | undefined,
	origin: string,
	category: CategorySlug,
): Promise<AssetDetail[]> {
	const sanityAssets = (await listSanityAssetsByCategory(category)).map(sanityToDetail);
	if (!db) return sanityAssets;

	const generated = (await listGeneratedAssetsByCategory(db, category)).map((row) =>
		generatedToDetail(row, origin),
	);
	return [...generated, ...sanityAssets].sort((a, b) =>
		(b.publishedAt || '').localeCompare(a.publishedAt || ''),
	);
}

export async function listFeaturedAssets(
	db: D1Database | undefined,
	origin: string,
	limit = 8,
): Promise<AssetDetail[]> {
	const sanityAssets = (await listSanityFeaturedAssets(limit)).map((asset) =>
		asset._id.startsWith('demo-') ? demoToDetail(asset) : sanityToDetail(asset),
	);
	if (!db) return sanityAssets.slice(0, limit);

	const generated = (await listRecentGeneratedAssets(db, limit)).map((row) =>
		generatedToDetail(row, origin),
	);
	return [...generated, ...sanityAssets]
		.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))
		.slice(0, limit);
}

async function uniqueSlug(
	db: D1Database,
	category: CategorySlug,
	title: string,
): Promise<string> {
	const base = slugifyTitle(title) || 'asset';
	let slug = base;
	let suffix = 1;
	while (await slugExists(db, category, slug)) {
		slug = `${base}-${suffix++}`;
	}
	return slug;
}

export async function runGenerateAssetPipeline(
	env: GenerateEnv,
	origin: string,
): Promise<GenerateAssetResult> {
	if (!env.DB) throw new Error('D1 database binding (DB) is missing');
	if (!env.MEDIA) throw new Error('R2 bucket binding (MEDIA) is missing');

	const keywordRow = await claimNextKeyword(env.DB);
	if (!keywordRow) {
		throw new Error('No unused keywords left in the database');
	}

	const keyword = keywordRow.keyword;

	try {
		const meta = await generateAssetMetadata(env, keyword);
		const category = mediumToCategory(meta.medium);
		const title = meta.imagePageTitle.trim() || keyword;
		const slug = await uniqueSlug(env.DB, category, title);
		const id = `gen-${crypto.randomUUID()}`;

		const imageBytes = await generateImageBytes(env, meta.imagePrompt);
		const r2ObjectKey = `generated/${category}/${slug}.jpg`;

		await env.MEDIA.put(r2ObjectKey, imageBytes, {
			httpMetadata: { contentType: 'image/jpeg' },
		});

		const record = await insertGeneratedAsset(env.DB, {
			id,
			keyword,
			slug,
			category,
			title,
			shortDescription: meta.pageShortDescription,
			description: meta.imageCreationDescription,
			imagePrompt: meta.imagePrompt,
			creationDescription: meta.imageCreationDescription,
			usageTips: meta.assetUsageTips,
			colorPalette: meta.colorPalette,
			tags: meta.tags,
			relatedQueries: meta.relatedSearchQueries,
			depictedElements: meta.depictedElements,
			medium: meta.medium,
			r2ObjectKey,
			fileType: 'image/jpeg',
			width: DEFAULT_IMAGE_WIDTH,
			height: DEFAULT_IMAGE_HEIGHT,
		});

		return {
			asset: generatedToDetail(record, origin),
			meta,
			keyword,
		};
	} catch (error) {
		await releaseKeyword(env.DB, keyword);
		throw error;
	}
}
