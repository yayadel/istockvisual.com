import type { CategorySlug } from '../config/categories';
import type { AssetDetail, GeneratedAssetRecord } from './asset-types';

function parseJsonArray<T>(value: string | null | undefined, fallback: T[]): T[] {
	if (!value) return fallback;
	try {
		const parsed = JSON.parse(value) as T[];
		return Array.isArray(parsed) ? parsed : fallback;
	} catch {
		return fallback;
	}
}

function rowToRecord(row: Record<string, unknown>): GeneratedAssetRecord {
	return {
		id: String(row.id),
		keywordId: row.keywordId == null ? null : Number(row.keywordId),
		keyword: String(row.keyword ?? ''),
		slug: String(row.slug),
		category: row.category as CategorySlug,
		title: String(row.title),
		shortDescription: String(row.shortDescription ?? ''),
		description: String(row.description ?? ''),
		imagePrompt: String(row.imagePrompt),
		imageCreationDescription: String(row.creationDescription ?? ''),
		assetUsageTips: String(row.usageTips ?? ''),
		colorPalette: parseJsonArray(row.colorPalette as string, []),
		tags: parseJsonArray<string>(row.tags as string, []),
		relatedSearchQueries: parseJsonArray<string>(row.relatedQueries as string, []),
		depictedElements: parseJsonArray<string>(row.depictedElements as string, []),
		medium: String(row.medium ?? ''),
		r2ObjectKey: String(row.r2ObjectKey ?? ''),
		fileType: String(row.fileType ?? 'image/jpeg'),
		width: Number(row.width ?? 0),
		height: Number(row.height ?? 0),
		license: String(row.license ?? 'Free to use — commercial, no attribution required'),
		isPremium: Boolean(row.isPremium),
		publishedAt: String(row.publishedAt),
		createdAt: String(row.createdAt),
	};
}

export function generatedToDetail(record: GeneratedAssetRecord, origin: string): AssetDetail {
	return {
		_id: record.id,
		title: record.title,
		slug: record.slug,
		category: record.category,
		description: record.description,
		shortDescription: record.shortDescription,
		tags: record.tags,
		previewUrl: `${origin}/api/preview/${record.id}`,
		r2ObjectKey: record.r2ObjectKey,
		fileType: record.fileType,
		width: record.width,
		height: record.height,
		license: record.license,
		isPremium: record.isPremium,
		publishedAt: record.publishedAt,
		source: 'generated',
		keywordId: record.keywordId ?? undefined,
		keyword: record.keyword,
		imagePrompt: record.imagePrompt,
		creationDescription: record.imageCreationDescription,
		usageTips: record.assetUsageTips,
		colorPalette: record.colorPalette,
		relatedQueries: record.relatedSearchQueries,
		depictedElements: record.depictedElements,
		medium: record.medium,
	};
}

export async function insertGeneratedAsset(
	db: D1Database,
	input: {
		id: string;
		keywordId: number;
		keyword: string;
		slug: string;
		category: CategorySlug;
		title: string;
		shortDescription: string;
		description: string;
		imagePrompt: string;
		creationDescription: string;
		usageTips: string;
		colorPalette: unknown[];
		tags: string[];
		relatedQueries: string[];
		depictedElements: string[];
		medium: string;
		r2ObjectKey: string;
		fileType: string;
		width: number;
		height: number;
	},
): Promise<GeneratedAssetRecord> {
	const publishedAt = new Date().toISOString();

	await db
		.prepare(
			`INSERT INTO generated_asset (
				id, keywordId, keyword, slug, category, title, shortDescription, description,
				imagePrompt, creationDescription, usageTips, colorPalette, tags,
				relatedQueries, depictedElements, medium, r2ObjectKey, fileType,
				width, height, license, isPremium, publishedAt
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			input.id,
			input.keywordId,
			input.keyword,
			input.slug,
			input.category,
			input.title,
			input.shortDescription,
			input.description,
			input.imagePrompt,
			input.creationDescription,
			input.usageTips,
			JSON.stringify(input.colorPalette),
			JSON.stringify(input.tags),
			JSON.stringify(input.relatedQueries),
			JSON.stringify(input.depictedElements),
			input.medium,
			input.r2ObjectKey,
			input.fileType,
			input.width,
			input.height,
			'Standard',
			0,
			publishedAt,
		)
		.run();

	const row = await db
		.prepare('SELECT * FROM generated_asset WHERE id = ?')
		.bind(input.id)
		.first<Record<string, unknown>>();

	if (!row) {
		throw new Error('Failed to read inserted generated asset');
	}
	return rowToRecord(row);
}

export async function listGeneratedAssetsByKeywordId(
	db: D1Database,
	keywordId: number,
): Promise<GeneratedAssetRecord[]> {
	const result = await db
		.prepare(
			`SELECT ga.*
			 FROM generated_asset ga
			 INNER JOIN keyword_content kc
				ON kc.contentId = ga.id
				AND kc.contentType = 'generated_asset'
				AND kc.status = 'active'
			 WHERE kc.keywordId = ?
			 ORDER BY ga.publishedAt DESC`,
		)
		.bind(keywordId)
		.all<Record<string, unknown>>();

	return (result.results ?? []).map(rowToRecord);
}

export async function getGeneratedAssetBySlug(
	db: D1Database,
	category: CategorySlug,
	slug: string,
): Promise<GeneratedAssetRecord | null> {
	const row = await db
		.prepare('SELECT * FROM generated_asset WHERE category = ? AND slug = ?')
		.bind(category, slug)
		.first<Record<string, unknown>>();
	return row ? rowToRecord(row) : null;
}

export async function getGeneratedAssetById(
	db: D1Database,
	id: string,
): Promise<GeneratedAssetRecord | null> {
	const row = await db
		.prepare('SELECT * FROM generated_asset WHERE id = ?')
		.bind(id)
		.first<Record<string, unknown>>();
	return row ? rowToRecord(row) : null;
}

export async function listGeneratedAssetsByCategory(
	db: D1Database,
	category: CategorySlug,
	limit = 50,
): Promise<GeneratedAssetRecord[]> {
	const result = await db
		.prepare(
			`SELECT * FROM generated_asset
			 WHERE category = ?
			 ORDER BY publishedAt DESC
			 LIMIT ?`,
		)
		.bind(category, limit)
		.all<Record<string, unknown>>();

	return (result.results ?? []).map(rowToRecord);
}

export async function listRecentGeneratedAssets(
	db: D1Database,
	limit = 8,
): Promise<GeneratedAssetRecord[]> {
	const result = await db
		.prepare(
			`SELECT * FROM generated_asset
			 ORDER BY publishedAt DESC
			 LIMIT ?`,
		)
		.bind(limit)
		.all<Record<string, unknown>>();

	return (result.results ?? []).map(rowToRecord);
}

export async function slugExists(
	db: D1Database,
	category: CategorySlug,
	slug: string,
): Promise<boolean> {
	const row = await db
		.prepare('SELECT id FROM generated_asset WHERE category = ? AND slug = ?')
		.bind(category, slug)
		.first<{ id: string }>();
	return Boolean(row);
}
