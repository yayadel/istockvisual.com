import type { CategorySlug } from '../config/categories';
import { DEFAULT_IMAGE_HEIGHT, DEFAULT_IMAGE_WIDTH } from './ai-generate';
import {
	formatAcronymsInText,
	formatAssetTitle,
	mediumToCategory,
	normalizeTags,
	randomSlugCode,
	slugifyTitle,
	type AssetDetail,
	type GeneratedAssetMeta,
} from './asset-types';
import { resolveContentCategories, assetMatchesContentCategory } from './content-categories';
import { buildHostPrompt, JSON_OUTPUT_INSTRUCTION } from './host-prompt';
import {
	getGeneratedAssetById,
	getGeneratedAssetBySlug,
	insertGeneratedAsset,
	listGeneratedAssetsByCategory,
	listRecentGeneratedAssets,
	listTopSearchKeywords as listTopSearchKeywordRows,
	slugExists,
	generatedToDetail,
} from './generated-assets';
import {
	KEYWORD_CONTENT_TYPES,
	getPrimaryContentLink,
	linkKeywordContent,
} from './keyword-content';
import { assetMatchesSearchQuery } from './catalog';
import { tagMatches, toPathSlug } from './paths';
import {
	claimKeywords,
	claimNextKeyword,
	clearKeywordLockBatch,
	getKeywordById,
	releaseKeywordById,
} from './keywords';
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
};

export type GenerateAssetResult = {
	asset: AssetDetail;
	meta: GeneratedAssetMeta;
	keyword: string;
	keywordId: number;
};

export type PrepareKeywordResult = {
	keywordId: number;
	keyword: string;
	hostPrompt: string;
	jsonInstruction: string;
	fullPrompt: string;
	lockBatchId?: string | null;
};

export type PrepareKeywordsResult = {
	batchId: string;
	count: number;
	keywords: PrepareKeywordResult[];
};

export type ImportGeneratedAssetInput = {
	keywordId: number;
	meta: GeneratedAssetMeta;
	imageBytes: Uint8Array;
	fileType?: string;
	width?: number;
	height?: number;
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
	limit = 50,
): Promise<AssetDetail[]> {
	const sanityAssets = (await listSanityAssetsByCategory(category)).map(sanityToDetail);
	if (!db) return sanityAssets.slice(0, limit);

	const generated = (await listGeneratedAssetsByCategory(db, category, limit)).map((row) =>
		generatedToDetail(row, origin),
	);
	return [...generated, ...sanityAssets]
		.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))
		.slice(0, limit);
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

export async function listTopSearchKeywords(
	db: D1Database | undefined,
	limit = 16,
): Promise<string[]> {
	if (!db) return [];
	return listTopSearchKeywordRows(db, limit);
}

export async function listAllAssets(
	db: D1Database | undefined,
	origin: string,
	limit = 400,
): Promise<AssetDetail[]> {
	return listFeaturedAssets(db, origin, limit);
}

/** Tag page: match against unified image tags only. */
export function filterAssetsByTag(assets: AssetDetail[], tagSlug: string): AssetDetail[] {
	return assets.filter((asset) => {
		const tags = asset.tags || [];
		return tags.some((value) => tagMatches(value, tagSlug));
	});
}

/** Topic category page (/c/…): match fixed contentCategories vocabulary. */
export function filterAssetsByContentCategory(
	assets: AssetDetail[],
	labelOrSlug: string,
): AssetDetail[] {
	return assets.filter((asset) => assetMatchesContentCategory(asset, labelOrSlug));
}

const SIMILAR_STOPWORDS = new Set([
	'a',
	'an',
	'the',
	'of',
	'in',
	'on',
	'at',
	'to',
	'for',
	'and',
	'or',
	'how',
	'what',
	'with',
	'from',
	'by',
	'vs',
	'its',
	'into',
	'over',
	'your',
	'this',
	'that',
]);

function similarTokens(value?: string): string[] {
	return (value || '')
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((token) => token.length >= 2 && !SIMILAR_STOPWORDS.has(token));
}

function overlapCount(tokens: string[], against: Set<string>): number {
	let count = 0;
	for (const token of tokens) {
		if (against.has(token)) count += 1;
	}
	return count;
}

/** Title-to-title overlap. Longer words and shared phrases rank higher. */
function titleSimilarity(currentTitle: string, otherTitle: string): number {
	const current = similarTokens(currentTitle);
	const other = similarTokens(otherTitle);
	if (!current.length || !other.length) return 0;
	if (toPathSlug(currentTitle) === toPathSlug(otherTitle)) return 100;

	const otherSet = new Set(other);
	let score = 0;
	for (const token of current) {
		if (!otherSet.has(token)) continue;
		score += token.length >= 5 ? 2 : 1;
	}

	const otherBigrams = new Set<string>();
	for (let index = 0; index < other.length - 1; index += 1) {
		otherBigrams.add(`${other[index]} ${other[index + 1]}`);
	}
	for (let index = 0; index < current.length - 1; index += 1) {
		if (otherBigrams.has(`${current[index]} ${current[index + 1]}`)) score += 4;
	}
	return score;
}

/** Source keyword first, then weaker tag overlap. */
function keywordSimilarity(current: AssetDetail, other: AssetDetail): number {
	const currentKey = similarTokens(current.keyword);
	const otherKey = similarTokens(other.keyword);
	let score = 0;

	if (
		current.keyword &&
		other.keyword &&
		toPathSlug(current.keyword) === toPathSlug(other.keyword)
	) {
		score += 20;
	}
	score += overlapCount(currentKey, new Set(otherKey)) * 4;
	score += overlapCount(currentKey, new Set(similarTokens(other.title))) * 2;
	score += overlapCount(otherKey, new Set(similarTokens(current.title))) * 2;

	const currentTags = new Set((current.tags || []).map((tag) => toPathSlug(tag)).filter(Boolean));
	let tagHits = 0;
	for (const tag of other.tags || []) {
		if (currentTags.has(toPathSlug(tag))) tagHits += 1;
	}
	score += Math.min(tagHits, 6);
	return score;
}

function paletteDistance(current: AssetDetail, other: AssetDetail): number {
	const query = (current.colorPalette || [])
		.map((swatch) => parseHexColor(swatch.hex))
		.filter(Boolean) as { r: number; g: number; b: number }[];
	const palette = (other.colorPalette || [])
		.map((swatch) => parseHexColor(swatch.hex))
		.filter(Boolean) as { r: number; g: number; b: number }[];
	if (!query.length || !palette.length) return Number.POSITIVE_INFINITY;

	let total = 0;
	for (const color of query) {
		let best = Number.POSITIVE_INFINITY;
		for (const swatch of palette) {
			best = Math.min(best, colorDistance(color, swatch));
		}
		total += best;
	}
	return total / query.length;
}

/** Detail page: title similarity, then main keyword, then palette. */
export function findSimilarAssets(
	assets: AssetDetail[],
	current: AssetDetail,
	limit = 18,
): AssetDetail[] {
	return assets
		.filter((asset) => asset._id !== current._id && Boolean(asset.previewUrl))
		.map((asset) => ({
			asset,
			titleScore: titleSimilarity(current.title, asset.title),
			keywordScore: keywordSimilarity(current, asset),
			colorDistance: paletteDistance(current, asset),
		}))
		.sort(
			(a, b) =>
				b.titleScore - a.titleScore ||
				b.keywordScore - a.keywordScore ||
				a.colorDistance - b.colorDistance ||
				(b.asset.publishedAt || '').localeCompare(a.asset.publishedAt || ''),
		)
		.map((item) => item.asset)
		.slice(0, limit);
}

/** Search page: whole-word match on title, source keyword, and tags. */
export function filterAssetsBySearch(
	assets: AssetDetail[],
	query: string,
	category?: string,
): AssetDetail[] {
	const needle = query.trim().toLowerCase();
	return assets.filter((asset) => {
		if (category && category !== 'all' && asset.category !== category) return false;
		if (!needle) return true;
		return assetMatchesSearchQuery(asset, needle);
	});
}

function parseHexColor(value: string): { r: number; g: number; b: number } | null {
	const hex = value.trim().replace(/^#/, '');
	if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
	return {
		r: Number.parseInt(hex.slice(0, 2), 16),
		g: Number.parseInt(hex.slice(2, 4), 16),
		b: Number.parseInt(hex.slice(4, 6), 16),
	};
}

function colorDistance(
	a: { r: number; g: number; b: number },
	b: { r: number; g: number; b: number },
) {
	return (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;
}

export function parseVisualSearchColors(raw: string | null | undefined): string[] {
	if (!raw) return [];
	const seen = new Set<string>();
	for (const part of raw.split(',')) {
		const hex = part.trim().replace(/^#/, '').toLowerCase();
		if (!/^[0-9a-f]{6}$/.test(hex) || seen.has(hex)) continue;
		seen.add(hex);
		if (seen.size >= 6) break;
	}
	return [...seen];
}

/** Rank library assets by palette distance. Query photo never leaves the browser. */
export function rankAssetsByPalette(assets: AssetDetail[], queryHexes: string[]): AssetDetail[] {
	const query = queryHexes.map(parseHexColor).filter(Boolean) as {
		r: number;
		g: number;
		b: number;
	}[];
	if (!query.length) return assets;

	return assets
		.map((asset) => {
			const palette = (asset.colorPalette || [])
				.map((swatch) => parseHexColor(swatch.hex))
				.filter(Boolean) as { r: number; g: number; b: number }[];
			if (!palette.length) {
				return { asset, score: Number.POSITIVE_INFINITY };
			}
			let total = 0;
			for (const color of query) {
				let best = Number.POSITIVE_INFINITY;
				for (const swatch of palette) {
					best = Math.min(best, colorDistance(color, swatch));
				}
				total += best;
			}
			return { asset, score: total / query.length };
		})
		.sort((a, b) => a.score - b.score)
		.map((item) => item.asset);
}

async function uniqueSlug(
	db: D1Database,
	category: CategorySlug,
	title: string,
): Promise<string> {
	const base = slugifyTitle(title) || 'asset';
	for (let attempt = 0; attempt < 12; attempt++) {
		const slug = `${base}-${randomSlugCode(6)}`;
		if (!(await slugExists(db, category, slug))) return slug;
	}
	return `${base}-${randomSlugCode(6)}${Date.now().toString().slice(-4)}`;
}

function toPrepareResult(keywordRow: {
	id: number;
	keyword: string;
	lockBatchId?: string | null;
}): PrepareKeywordResult {
	const hostPrompt = buildHostPrompt(keywordRow.keyword);
	const fullPrompt = `${hostPrompt}\n\n${JSON_OUTPUT_INSTRUCTION}`;
	return {
		keywordId: keywordRow.id,
		keyword: keywordRow.keyword,
		hostPrompt,
		jsonInstruction: JSON_OUTPUT_INSTRUCTION,
		fullPrompt,
		lockBatchId: keywordRow.lockBatchId ?? null,
	};
}

/** Reserve the next keyword and return prompts for Cursor Agent (built-in text/image models). */
export async function prepareNextKeyword(db: D1Database): Promise<PrepareKeywordResult> {
	const keywordRow = await claimNextKeyword(db);
	if (!keywordRow) {
		throw new Error('No unused keywords left in the database');
	}
	return toPrepareResult(keywordRow);
}

/**
 * Reserve `count` unused keywords in one atomic lock batch.
 * Other workers only see unused rows, so they cannot pick these topics.
 */
export async function prepareKeywords(
	db: D1Database,
	count = 1,
): Promise<PrepareKeywordsResult> {
	const { batchId, keywords } = await claimKeywords(db, count);
	return {
		batchId,
		count: keywords.length,
		keywords: keywords.map(toPrepareResult),
	};
}

/** Save Agent-generated metadata + image into D1/R2 and link keyword. */
export async function importGeneratedAsset(
	env: GenerateEnv,
	origin: string,
	input: ImportGeneratedAssetInput,
): Promise<GenerateAssetResult> {
	if (!env.DB) throw new Error('D1 database binding (DB) is missing');
	if (!env.MEDIA) throw new Error('R2 bucket binding (MEDIA) is missing');

	const keywordRow = await getKeywordById(env.DB, input.keywordId);
	if (!keywordRow) {
		throw new Error(`Keyword id ${input.keywordId} not found`);
	}
	if (!keywordRow.used) {
		throw new Error(
			`Keyword id ${input.keywordId} is not reserved. Call /api/generate/prepare first.`,
		);
	}

	const keyword = keywordRow.keyword;
	const keywordId = keywordRow.id;
	const existingLink = await getPrimaryContentLink(
		env.DB,
		keywordId,
		KEYWORD_CONTENT_TYPES.GENERATED_ASSET,
	);
	if (existingLink) {
		const existing = await getGeneratedAssetById(env.DB, existingLink.contentId);
		if (existing) {
			return {
				asset: generatedToDetail(existing, origin),
				meta: {
					...input.meta,
					imagePageTitle: existing.title,
				},
				keyword,
				keywordId,
			};
		}
	}

	const title = formatAssetTitle(input.meta.imagePageTitle.trim() || keyword);
	const contentCategories = resolveContentCategories({
		stored: [
			...(input.meta.contentCategories || []),
			...(input.meta.depictedElements || []),
		],
		title,
		keyword,
	});
	const meta: GeneratedAssetMeta = {
		...input.meta,
		imagePageTitle: title,
		pageShortDescription: formatAcronymsInText(input.meta.pageShortDescription),
		imageCreationDescription: formatAcronymsInText(input.meta.imageCreationDescription),
		tags: normalizeTags(input.meta.tags),
		contentCategories,
		depictedElements: contentCategories,
	};

	try {
		const category = mediumToCategory(meta.medium);
		const slug = await uniqueSlug(env.DB, category, title);
		const id = `gen-${crypto.randomUUID()}`;
		const fileType = input.fileType || 'image/jpeg';
		const ext = fileType.includes('png') ? 'png' : 'jpg';
		const r2ObjectKey = `generated/${category}/${slug}.${ext}`;

		await env.MEDIA.put(r2ObjectKey, input.imageBytes, {
			httpMetadata: { contentType: fileType },
		});

		const record = await insertGeneratedAsset(env.DB, {
			id,
			keywordId,
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
			relatedQueries: meta.relatedSearchQueries || [],
			depictedElements: meta.depictedElements,
			medium: meta.medium,
			r2ObjectKey,
			fileType,
			width: input.width ?? DEFAULT_IMAGE_WIDTH,
			height: input.height ?? DEFAULT_IMAGE_HEIGHT,
		});

		await linkKeywordContent(env.DB, {
			keywordId,
			contentType: KEYWORD_CONTENT_TYPES.GENERATED_ASSET,
			contentId: id,
		});

		return {
			asset: generatedToDetail(record, origin),
			meta,
			keyword,
			keywordId,
		};
	} catch (error) {
		await releaseKeywordById(env.DB, keywordId);
		throw error;
	}
}
