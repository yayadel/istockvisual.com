import { KEYWORD_CONTENT_STATUS, KEYWORD_CONTENT_TYPES } from './keyword-content';

export type KeywordStatusFilter = 'all' | 'used' | 'unused' | 'no_content';

export type AdminKeywordRow = {
	id: number;
	keyword: string;
	used: boolean;
	usedAt: string | null;
	createdAt: string;
	contentCount: number;
	primaryContent: {
		id: string;
		title: string;
		category: string;
		slug: string;
		publishedAt: string;
	} | null;
};

export type AdminKeywordListResult = {
	items: AdminKeywordRow[];
	page: number;
	limit: number;
	total: number;
	totalPages: number;
};

export type AdminGeneratedAssetRow = {
	id: string;
	keywordId: number | null;
	keyword: string;
	title: string;
	category: string;
	slug: string;
	publishedAt: string;
	createdAt: string;
};

export type AdminGeneratedAssetListResult = {
	items: AdminGeneratedAssetRow[];
	page: number;
	limit: number;
	total: number;
	totalPages: number;
};

function clampLimit(limit: number) {
	return Math.min(100, Math.max(1, limit));
}

export async function listAdminKeywords(
	db: D1Database,
	options: {
		page?: number;
		limit?: number;
		q?: string;
		status?: KeywordStatusFilter;
	},
): Promise<AdminKeywordListResult> {
	const page = Math.max(1, options.page ?? 1);
	const limit = clampLimit(options.limit ?? 50);
	const offset = (page - 1) * limit;
	const q = (options.q ?? '').trim();
	const status = options.status ?? 'all';

	const where: string[] = [];
	const params: unknown[] = [];

	if (q) {
		where.push('k.keyword LIKE ? ESCAPE \'\\\'');
		params.push(`%${q.replace(/[%_\\]/g, '\\$&')}%`);
	}

	if (status === 'used') {
		where.push('k.used = 1');
	} else if (status === 'unused') {
		where.push('k.used = 0');
	} else if (status === 'no_content') {
		where.push(`NOT EXISTS (
			SELECT 1 FROM keyword_content kc
			WHERE kc.keywordId = k.id AND kc.status = ?
		)`);
		params.push(KEYWORD_CONTENT_STATUS.ACTIVE);
	}

	const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

	const totalRow = await db
		.prepare(`SELECT COUNT(*) AS total FROM keyword k ${whereSql}`)
		.bind(...params)
		.first<{ total: number }>();

	const total = totalRow?.total ?? 0;

	const result = await db
		.prepare(
			`SELECT
				k.id,
				k.keyword,
				k.used,
				k.usedAt,
				k.createdAt,
				(
					SELECT COUNT(*)
					FROM keyword_content kc
					WHERE kc.keywordId = k.id AND kc.status = ?
				) AS contentCount,
				(
					SELECT ga.id
					FROM keyword_content kc
					INNER JOIN generated_asset ga ON ga.id = kc.contentId
					WHERE kc.keywordId = k.id
						AND kc.contentType = ?
						AND kc.status = ?
					ORDER BY kc.createdAt DESC
					LIMIT 1
				) AS primaryContentId,
				(
					SELECT ga.title
					FROM keyword_content kc
					INNER JOIN generated_asset ga ON ga.id = kc.contentId
					WHERE kc.keywordId = k.id
						AND kc.contentType = ?
						AND kc.status = ?
					ORDER BY kc.createdAt DESC
					LIMIT 1
				) AS primaryContentTitle,
				(
					SELECT ga.category
					FROM keyword_content kc
					INNER JOIN generated_asset ga ON ga.id = kc.contentId
					WHERE kc.keywordId = k.id
						AND kc.contentType = ?
						AND kc.status = ?
					ORDER BY kc.createdAt DESC
					LIMIT 1
				) AS primaryContentCategory,
				(
					SELECT ga.slug
					FROM keyword_content kc
					INNER JOIN generated_asset ga ON ga.id = kc.contentId
					WHERE kc.keywordId = k.id
						AND kc.contentType = ?
						AND kc.status = ?
					ORDER BY kc.createdAt DESC
					LIMIT 1
				) AS primaryContentSlug,
				(
					SELECT ga.publishedAt
					FROM keyword_content kc
					INNER JOIN generated_asset ga ON ga.id = kc.contentId
					WHERE kc.keywordId = k.id
						AND kc.contentType = ?
						AND kc.status = ?
					ORDER BY kc.createdAt DESC
					LIMIT 1
				) AS primaryContentPublishedAt
			FROM keyword k
			${whereSql}
			ORDER BY k.id ASC
			LIMIT ? OFFSET ?`,
		)
		.bind(
			KEYWORD_CONTENT_STATUS.ACTIVE,
			KEYWORD_CONTENT_TYPES.GENERATED_ASSET,
			KEYWORD_CONTENT_STATUS.ACTIVE,
			KEYWORD_CONTENT_TYPES.GENERATED_ASSET,
			KEYWORD_CONTENT_STATUS.ACTIVE,
			KEYWORD_CONTENT_TYPES.GENERATED_ASSET,
			KEYWORD_CONTENT_STATUS.ACTIVE,
			KEYWORD_CONTENT_TYPES.GENERATED_ASSET,
			KEYWORD_CONTENT_STATUS.ACTIVE,
			KEYWORD_CONTENT_TYPES.GENERATED_ASSET,
			KEYWORD_CONTENT_STATUS.ACTIVE,
			...params,
			limit,
			offset,
		)
		.all<Record<string, unknown>>();

	const items: AdminKeywordRow[] = (result.results ?? []).map((row) => {
		const primaryContentId = row.primaryContentId ? String(row.primaryContentId) : null;
		return {
			id: Number(row.id),
			keyword: String(row.keyword),
			used: Boolean(row.used),
			usedAt: row.usedAt ? String(row.usedAt) : null,
			createdAt: String(row.createdAt),
			contentCount: Number(row.contentCount ?? 0),
			primaryContent: primaryContentId
				? {
						id: primaryContentId,
						title: String(row.primaryContentTitle ?? ''),
						category: String(row.primaryContentCategory ?? ''),
						slug: String(row.primaryContentSlug ?? ''),
						publishedAt: String(row.primaryContentPublishedAt ?? ''),
					}
				: null,
		};
	});

	return {
		items,
		page,
		limit,
		total,
		totalPages: Math.max(1, Math.ceil(total / limit)),
	};
}

export async function listAdminGeneratedAssets(
	db: D1Database,
	options: { page?: number; limit?: number; q?: string },
): Promise<AdminGeneratedAssetListResult> {
	const page = Math.max(1, options.page ?? 1);
	const limit = clampLimit(options.limit ?? 50);
	const offset = (page - 1) * limit;
	const q = (options.q ?? '').trim();

	const where: string[] = [];
	const params: unknown[] = [];

	if (q) {
		where.push('(ga.title LIKE ? ESCAPE \'\\\' OR ga.keyword LIKE ? ESCAPE \'\\\' OR ga.slug LIKE ? ESCAPE \'\\\' )');
		const pattern = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
		params.push(pattern, pattern, pattern);
	}

	const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

	const totalRow = await db
		.prepare(`SELECT COUNT(*) AS total FROM generated_asset ga ${whereSql}`)
		.bind(...params)
		.first<{ total: number }>();

	const total = totalRow?.total ?? 0;

	const result = await db
		.prepare(
			`SELECT ga.id, ga.keywordId, ga.keyword, ga.title, ga.category, ga.slug, ga.publishedAt, ga.createdAt
			 FROM generated_asset ga
			 ${whereSql}
			 ORDER BY ga.publishedAt DESC
			 LIMIT ? OFFSET ?`,
		)
		.bind(...params, limit, offset)
		.all<Record<string, unknown>>();

	const items: AdminGeneratedAssetRow[] = (result.results ?? []).map((row) => ({
		id: String(row.id),
		keywordId: row.keywordId == null ? null : Number(row.keywordId),
		keyword: String(row.keyword ?? ''),
		title: String(row.title),
		category: String(row.category),
		slug: String(row.slug),
		publishedAt: String(row.publishedAt),
		createdAt: String(row.createdAt),
	}));

	return {
		items,
		page,
		limit,
		total,
		totalPages: Math.max(1, Math.ceil(total / limit)),
	};
}

export async function getAdminDashboardStats(db: D1Database) {
	const row = await db
		.prepare(
			`SELECT
				(SELECT COUNT(*) FROM keyword) AS keywordsTotal,
				(SELECT COUNT(*) FROM keyword WHERE used = 0) AS keywordsUnused,
				(SELECT COUNT(*) FROM keyword WHERE used = 1) AS keywordsUsed,
				(SELECT COUNT(*) FROM generated_asset) AS generatedAssets,
				(SELECT COUNT(*) FROM keyword_content WHERE status = 'active') AS activeLinks,
				(SELECT COUNT(*) FROM keyword k
				 WHERE k.used = 1 AND NOT EXISTS (
					SELECT 1 FROM keyword_content kc
					WHERE kc.keywordId = k.id AND kc.status = 'active'
				 )) AS usedWithoutContent`,
		)
		.first<{
			keywordsTotal: number;
			keywordsUnused: number;
			keywordsUsed: number;
			generatedAssets: number;
			activeLinks: number;
			usedWithoutContent: number;
		}>();

	return (
		row ?? {
			keywordsTotal: 0,
			keywordsUnused: 0,
			keywordsUsed: 0,
			generatedAssets: 0,
			activeLinks: 0,
			usedWithoutContent: 0,
		}
	);
}
