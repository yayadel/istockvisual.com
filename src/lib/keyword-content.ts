import type { KeywordRow } from './keywords';

/** Supported content backends linked to a keyword. Extend when adding Sanity/R2/manual uploads. */
export const KEYWORD_CONTENT_TYPES = {
	GENERATED_ASSET: 'generated_asset',
	SANITY_ASSET: 'sanity_asset',
} as const;

export type KeywordContentType =
	(typeof KEYWORD_CONTENT_TYPES)[keyof typeof KEYWORD_CONTENT_TYPES];

/** Relationship role — one keyword may map to multiple contents over time. */
export const KEYWORD_CONTENT_ROLES = {
	PRIMARY: 'primary',
	VARIANT: 'variant',
	RELATED: 'related',
} as const;

export type KeywordContentRole =
	(typeof KEYWORD_CONTENT_ROLES)[keyof typeof KEYWORD_CONTENT_ROLES];

export const KEYWORD_CONTENT_STATUS = {
	ACTIVE: 'active',
	FAILED: 'failed',
	ARCHIVED: 'archived',
} as const;

export type KeywordContentStatus =
	(typeof KEYWORD_CONTENT_STATUS)[keyof typeof KEYWORD_CONTENT_STATUS];

export type KeywordContentLink = {
	id: number;
	keywordId: number;
	contentType: KeywordContentType;
	contentId: string;
	role: KeywordContentRole;
	status: KeywordContentStatus;
	createdAt: string;
};

export type KeywordWithContent = KeywordRow & {
	usedAt?: string | null;
	updatedAt?: string | null;
	links: KeywordContentLink[];
};

export type LinkKeywordContentInput = {
	keywordId: number;
	contentType: KeywordContentType;
	contentId: string;
	role?: KeywordContentRole;
	status?: KeywordContentStatus;
};

function rowToLink(row: Record<string, unknown>): KeywordContentLink {
	return {
		id: Number(row.id),
		keywordId: Number(row.keywordId),
		contentType: row.contentType as KeywordContentType,
		contentId: String(row.contentId),
		role: row.role as KeywordContentRole,
		status: row.status as KeywordContentStatus,
		createdAt: String(row.createdAt),
	};
}

/** Create or upsert a keyword ↔ content association. */
export async function linkKeywordContent(
	db: D1Database,
	input: LinkKeywordContentInput,
): Promise<KeywordContentLink> {
	const role = input.role ?? KEYWORD_CONTENT_ROLES.PRIMARY;
	const status = input.status ?? KEYWORD_CONTENT_STATUS.ACTIVE;

	await db
		.prepare(
			`INSERT INTO keyword_content (keywordId, contentType, contentId, role, status)
			 VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT(keywordId, contentType, contentId) DO UPDATE SET
				role = excluded.role,
				status = excluded.status`,
		)
		.bind(input.keywordId, input.contentType, input.contentId, role, status)
		.run();

	const row = await db
		.prepare(
			`SELECT id, keywordId, contentType, contentId, role, status, createdAt
			 FROM keyword_content
			 WHERE keywordId = ? AND contentType = ? AND contentId = ?`,
		)
		.bind(input.keywordId, input.contentType, input.contentId)
		.first<Record<string, unknown>>();

	if (!row) {
		throw new Error('Failed to read keyword_content link');
	}
	return rowToLink(row);
}

/** Mark keyword as used and attach primary content in one batch. */
export async function attachKeywordContent(
	db: D1Database,
	input: LinkKeywordContentInput,
): Promise<KeywordContentLink> {
	const now = new Date().toISOString();
	const role = input.role ?? KEYWORD_CONTENT_ROLES.PRIMARY;
	const status = input.status ?? KEYWORD_CONTENT_STATUS.ACTIVE;

	await db.batch([
		db
			.prepare(
				`UPDATE keyword
				 SET used = 1, usedAt = ?, updatedAt = ?, lockBatchId = NULL
				 WHERE id = ?`,
			)
			.bind(now, now, input.keywordId),
		db
			.prepare(
				`INSERT INTO keyword_content (keywordId, contentType, contentId, role, status)
				 VALUES (?, ?, ?, ?, ?)
				 ON CONFLICT(keywordId, contentType, contentId) DO UPDATE SET
					role = excluded.role,
					status = excluded.status`,
			)
			.bind(input.keywordId, input.contentType, input.contentId, role, status),
	]);

	const row = await db
		.prepare(
			`SELECT id, keywordId, contentType, contentId, role, status, createdAt
			 FROM keyword_content
			 WHERE keywordId = ? AND contentType = ? AND contentId = ?`,
		)
		.bind(input.keywordId, input.contentType, input.contentId)
		.first<Record<string, unknown>>();

	if (!row) {
		throw new Error('Failed to read keyword_content link after attach');
	}
	return rowToLink(row);
}

export async function listKeywordContentLinks(
	db: D1Database,
	keywordId: number,
	options?: { status?: KeywordContentStatus; contentType?: KeywordContentType },
): Promise<KeywordContentLink[]> {
	const clauses = ['keywordId = ?'];
	const params: unknown[] = [keywordId];

	if (options?.status) {
		clauses.push('status = ?');
		params.push(options.status);
	}
	if (options?.contentType) {
		clauses.push('contentType = ?');
		params.push(options.contentType);
	}

	const result = await db
		.prepare(
			`SELECT id, keywordId, contentType, contentId, role, status, createdAt
			 FROM keyword_content
			 WHERE ${clauses.join(' AND ')}
			 ORDER BY createdAt DESC`,
		)
		.bind(...params)
		.all<Record<string, unknown>>();

	return (result.results ?? []).map(rowToLink);
}

export async function getPrimaryContentLink(
	db: D1Database,
	keywordId: number,
	contentType?: KeywordContentType,
): Promise<KeywordContentLink | null> {
	const clauses = [`keywordId = ?`, `role = ?`, `status = ?`];
	const params: unknown[] = [
		keywordId,
		KEYWORD_CONTENT_ROLES.PRIMARY,
		KEYWORD_CONTENT_STATUS.ACTIVE,
	];

	if (contentType) {
		clauses.push('contentType = ?');
		params.push(contentType);
	}

	const row = await db
		.prepare(
			`SELECT id, keywordId, contentType, contentId, role, status, createdAt
			 FROM keyword_content
			 WHERE ${clauses.join(' AND ')}
			 ORDER BY createdAt DESC
			 LIMIT 1`,
		)
		.bind(...params)
		.first<Record<string, unknown>>();

	return row ? rowToLink(row) : null;
}

export async function getKeywordForContent(
	db: D1Database,
	contentType: KeywordContentType,
	contentId: string,
): Promise<KeywordRow | null> {
	const row = await db
		.prepare(
			`SELECT k.id, k.keyword, k.used, k.createdAt
			 FROM keyword k
			 INNER JOIN keyword_content kc ON kc.keywordId = k.id
			 WHERE kc.contentType = ? AND kc.contentId = ?
			 ORDER BY
				CASE kc.role
					WHEN 'primary' THEN 0
					WHEN 'variant' THEN 1
					ELSE 2
				END,
				kc.createdAt DESC
			 LIMIT 1`,
		)
		.bind(contentType, contentId)
		.first<KeywordRow>();

	return row ?? null;
}

export async function getKeywordWithContent(
	db: D1Database,
	keywordId: number,
): Promise<KeywordWithContent | null> {
	const keyword = await db
		.prepare(
			`SELECT id, keyword, used, createdAt, usedAt, updatedAt
			 FROM keyword WHERE id = ?`,
		)
		.bind(keywordId)
		.first<KeywordRow & { usedAt?: string | null; updatedAt?: string | null }>();

	if (!keyword) return null;

	const links = await listKeywordContentLinks(db, keywordId);
	return { ...keyword, links };
}

export async function archiveKeywordContentLink(
	db: D1Database,
	linkId: number,
): Promise<void> {
	await db
		.prepare(`UPDATE keyword_content SET status = ? WHERE id = ?`)
		.bind(KEYWORD_CONTENT_STATUS.ARCHIVED, linkId)
		.run();
}

export async function countKeywordContent(
	db: D1Database,
	keywordId: number,
	status: KeywordContentStatus = KEYWORD_CONTENT_STATUS.ACTIVE,
): Promise<number> {
	const row = await db
		.prepare(
			`SELECT COUNT(*) AS count
			 FROM keyword_content
			 WHERE keywordId = ? AND status = ?`,
		)
		.bind(keywordId, status)
		.first<{ count: number }>();
	return row?.count ?? 0;
}
