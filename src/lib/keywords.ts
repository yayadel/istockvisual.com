export type KeywordRow = {
	id: number;
	keyword: string;
	used: number;
	createdAt: string;
};

export async function claimNextKeyword(db: D1Database): Promise<KeywordRow | null> {
	const row = await db
		.prepare(
			`UPDATE keyword
			 SET used = 1
			 WHERE id = (
				SELECT id FROM keyword WHERE used = 0 ORDER BY id ASC LIMIT 1
			 )
			 RETURNING id, keyword, used, createdAt`,
		)
		.first<KeywordRow>();
	return row ?? null;
}

export async function releaseKeyword(db: D1Database, keyword: string): Promise<void> {
	await db
		.prepare(
			`UPDATE keyword
			 SET used = 0
			 WHERE keyword = ? COLLATE NOCASE`,
		)
		.bind(keyword.trim())
		.run();
}

export async function getNextUnusedKeyword(db: D1Database): Promise<KeywordRow | null> {
	const row = await db
		.prepare(
			`SELECT id, keyword, used, createdAt
			 FROM keyword
			 WHERE used = 0
			 ORDER BY id ASC
			 LIMIT 1`,
		)
		.first<KeywordRow>();
	return row ?? null;
}

export async function markKeywordUsed(db: D1Database, keyword: string): Promise<boolean> {
	const result = await db
		.prepare(
			`UPDATE keyword
			 SET used = 1
			 WHERE keyword = ? COLLATE NOCASE AND used = 0`,
		)
		.bind(keyword.trim())
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
