export type KeywordRow = {
	id: number;
	keyword: string;
	used: number;
	createdAt: string;
	usedAt?: string | null;
	updatedAt?: string | null;
};

/** Reserve the next unused keyword for generation (does not create content link yet). */
export async function claimNextKeyword(db: D1Database): Promise<KeywordRow | null> {
	const now = new Date().toISOString();
	const row = await db
		.prepare(
			`UPDATE keyword
			 SET used = 1, usedAt = ?, updatedAt = ?
			 WHERE id = (
				SELECT id FROM keyword WHERE used = 0 ORDER BY id ASC LIMIT 1
			 )
			 RETURNING id, keyword, used, createdAt, usedAt, updatedAt`,
		)
		.bind(now, now)
		.first<KeywordRow>();
	return row ?? null;
}

export async function releaseKeywordById(db: D1Database, keywordId: number): Promise<void> {
	await db
		.prepare(
			`UPDATE keyword
			 SET used = 0, usedAt = NULL, updatedAt = ?
			 WHERE id = ?`,
		)
		.bind(new Date().toISOString(), keywordId)
		.run();
}

export async function releaseKeyword(db: D1Database, keyword: string): Promise<void> {
	await db
		.prepare(
			`UPDATE keyword
			 SET used = 0, usedAt = NULL, updatedAt = ?
			 WHERE keyword = ? COLLATE NOCASE`,
		)
		.bind(new Date().toISOString(), keyword.trim())
		.run();
}

export async function getKeywordById(
	db: D1Database,
	keywordId: number,
): Promise<KeywordRow | null> {
	const row = await db
		.prepare(
			`SELECT id, keyword, used, createdAt, usedAt, updatedAt
			 FROM keyword WHERE id = ?`,
		)
		.bind(keywordId)
		.first<KeywordRow>();
	return row ?? null;
}

export async function getNextUnusedKeyword(db: D1Database): Promise<KeywordRow | null> {
	const row = await db
		.prepare(
			`SELECT id, keyword, used, createdAt, usedAt, updatedAt
			 FROM keyword
			 WHERE used = 0
			 ORDER BY id ASC
			 LIMIT 1`,
		)
		.first<KeywordRow>();
	return row ?? null;
}

export async function markKeywordUsed(db: D1Database, keyword: string): Promise<boolean> {
	const now = new Date().toISOString();
	const result = await db
		.prepare(
			`UPDATE keyword
			 SET used = 1, usedAt = ?, updatedAt = ?
			 WHERE keyword = ? COLLATE NOCASE AND used = 0`,
		)
		.bind(now, now, keyword.trim())
		.run();
	return (result.meta.changes ?? 0) > 0;
}

export async function getKeywordStats(db: D1Database) {
	const row = await db
		.prepare(
			`SELECT
				COUNT(*) AS total,
				SUM(CASE WHEN used = 0 THEN 1 ELSE 0 END) AS unused,
				SUM(CASE WHEN used = 1 THEN 1 ELSE 0 END) AS usedCount
			 FROM keyword`,
		)
		.first<{ total: number; unused: number; usedCount: number }>();
	return row ?? { total: 0, unused: 0, usedCount: 0 };
}

export async function getKeywordContentStats(db: D1Database) {
	const row = await db
		.prepare(
			`SELECT
				(SELECT COUNT(*) FROM keyword) AS keywords,
				(SELECT COUNT(*) FROM keyword_content WHERE status = 'active') AS activeLinks,
				(SELECT COUNT(*) FROM generated_asset) AS generatedAssets,
				(SELECT COUNT(*) FROM keyword k
				 WHERE k.used = 1
				 AND NOT EXISTS (
					SELECT 1 FROM keyword_content kc
					WHERE kc.keywordId = k.id AND kc.status = 'active'
				 )) AS usedWithoutContent`,
		)
		.first<{
			keywords: number;
			activeLinks: number;
			generatedAssets: number;
			usedWithoutContent: number;
		}>();
	return (
		row ?? {
			keywords: 0,
			activeLinks: 0,
			generatedAssets: 0,
			usedWithoutContent: 0,
		}
	);
}
