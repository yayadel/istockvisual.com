export const FREE_FULL_DOWNLOAD_LIMIT = 5;

export async function countFullSizeDownloads(db: D1Database, userId: string): Promise<number> {
	const row = await db
		.prepare(
			`SELECT COUNT(*) AS total
			 FROM download_log
			 WHERE userId = ? AND sizeId != '500'`,
		)
		.bind(userId)
		.first<{ total: number }>();
	return Number(row?.total ?? 0);
}

export async function remainingFullSizeDownloads(
	db: D1Database,
	userId: string,
	plan?: string | null,
): Promise<number | null> {
	if (plan === 'pro') return null;
	const used = await countFullSizeDownloads(db, userId);
	return Math.max(0, FREE_FULL_DOWNLOAD_LIMIT - used);
}

export async function logFullSizeDownload(
	db: D1Database,
	input: { userId: string; assetId: string; sizeId: string },
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO download_log (id, userId, assetId, sizeId, createdAt)
			 VALUES (?, ?, ?, ?, ?)`,
		)
		.bind(crypto.randomUUID(), input.userId, input.assetId, input.sizeId, new Date().toISOString())
		.run();
}
