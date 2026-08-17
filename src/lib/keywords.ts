export const MAX_KEYWORD_CLAIM_COUNT = 50;

export type KeywordRow = {
	id: number;
	keyword: string;
	used: number;
	createdAt: string;
	usedAt?: string | null;
	updatedAt?: string | null;
	lockBatchId?: string | null;
};

const KEYWORD_RETURNING =
	'id, keyword, used, createdAt, usedAt, updatedAt, lockBatchId';

function newLockBatchId(): string {
	return crypto.randomUUID();
}

function clampClaimCount(count: number): number {
	if (!Number.isFinite(count) || count < 1) return 1;
	return Math.min(MAX_KEYWORD_CLAIM_COUNT, Math.floor(count));
}

/**
 * Atomically reserve the next `count` unused keywords for one worker/batch.
 * Other workers only see `used = 0` rows, so they cannot pick these topics.
 */
export async function claimKeywords(
	db: D1Database,
	count = 1,
	lockBatchId?: string,
): Promise<{ batchId: string; keywords: KeywordRow[] }> {
	const take = clampClaimCount(count);
	const batchId = (lockBatchId || '').trim() || newLockBatchId();
	const now = new Date().toISOString();

	// Nested SELECT avoids SQLite "same table" UPDATE/subquery limitations.
	const result = await db
		.prepare(
			`UPDATE keyword
			 SET used = 1, usedAt = ?, updatedAt = ?, lockBatchId = ?
			 WHERE id IN (
				SELECT id FROM (
					SELECT id FROM keyword WHERE used = 0 ORDER BY id ASC LIMIT ?
				)
			 )
			 RETURNING ${KEYWORD_RETURNING}`,
		)
		.bind(now, now, batchId, take)
		.all<KeywordRow>();

	const keywords = result.results ?? [];
	if (keywords.length === 0) {
		throw new Error('No unused keywords left in the database');
	}

	return { batchId, keywords };
}

/** Reserve the next unused keyword for generation (does not create content link yet). */
export async function claimNextKeyword(db: D1Database): Promise<KeywordRow | null> {
	try {
		const { keywords } = await claimKeywords(db, 1);
		return keywords[0] ?? null;
	} catch {
		return null;
	}
}

export async function releaseKeywordById(db: D1Database, keywordId: number): Promise<boolean> {
	const linked = await db
		.prepare(
			`SELECT COUNT(*) AS c FROM keyword_content WHERE keywordId = ? AND status = 'active'`,
		)
		.bind(keywordId)
		.first<{ c: number }>();
	if (Number(linked?.c ?? 0) > 0) {
		return false;
	}

	const result = await db
		.prepare(
			`UPDATE keyword
			 SET used = 0, usedAt = NULL, updatedAt = ?, lockBatchId = NULL
			 WHERE id = ? AND used = 1`,
		)
		.bind(new Date().toISOString(), keywordId)
		.run();
	return (result.meta.changes ?? 0) > 0;
}

/** Release every reserved keyword in a batch that still has no linked content. */
export async function releaseKeywordBatch(
	db: D1Database,
	lockBatchId: string,
): Promise<{ releasedIds: number[]; skippedIds: number[] }> {
	const batchId = lockBatchId.trim();
	if (!batchId) {
		return { releasedIds: [], skippedIds: [] };
	}

	const rows = await db
		.prepare(
			`SELECT id FROM keyword
			 WHERE lockBatchId = ? AND used = 1
			 ORDER BY id ASC`,
		)
		.bind(batchId)
		.all<{ id: number }>();

	const releasedIds: number[] = [];
	const skippedIds: number[] = [];
	for (const row of rows.results ?? []) {
		const ok = await releaseKeywordById(db, row.id);
		if (ok) releasedIds.push(row.id);
		else skippedIds.push(row.id);
	}
	return { releasedIds, skippedIds };
}

export async function releaseKeyword(db: D1Database, keyword: string): Promise<void> {
	await db
		.prepare(
			`UPDATE keyword
			 SET used = 0, usedAt = NULL, updatedAt = ?, lockBatchId = NULL
			 WHERE keyword = ? COLLATE NOCASE
			   AND used = 1
			   AND NOT EXISTS (
					SELECT 1 FROM keyword_content kc
					WHERE kc.keywordId = keyword.id AND kc.status = 'active'
			   )`,
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
			`SELECT ${KEYWORD_RETURNING}
			 FROM keyword WHERE id = ?`,
		)
		.bind(keywordId)
		.first<KeywordRow>();
	return row ?? null;
}

export async function getNextUnusedKeyword(db: D1Database): Promise<KeywordRow | null> {
	const row = await db
		.prepare(
			`SELECT ${KEYWORD_RETURNING}
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

export async function clearKeywordLockBatch(db: D1Database, keywordId: number): Promise<void> {
	await db
		.prepare(
			`UPDATE keyword
			 SET lockBatchId = NULL, updatedAt = ?
			 WHERE id = ?`,
		)
		.bind(new Date().toISOString(), keywordId)
		.run();
}

export async function getKeywordStats(db: D1Database) {
	const row = await db
		.prepare(
			`SELECT
				COUNT(*) AS total,
				SUM(CASE WHEN used = 0 THEN 1 ELSE 0 END) AS unused,
				SUM(CASE WHEN used = 1 THEN 1 ELSE 0 END) AS usedCount,
				SUM(CASE
					WHEN used = 1 AND lockBatchId IS NOT NULL AND NOT EXISTS (
						SELECT 1 FROM keyword_content kc
						WHERE kc.keywordId = keyword.id AND kc.status = 'active'
					) THEN 1 ELSE 0 END) AS lockedCount
			 FROM keyword`,
		)
		.first<{ total: number; unused: number; usedCount: number; lockedCount: number }>();
	return row ?? { total: 0, unused: 0, usedCount: 0, lockedCount: 0 };
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
