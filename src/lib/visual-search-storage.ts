const PREFIX = 'uploads/visual-search/';
const TTL_MS = 60 * 60 * 1000;

export const VISUAL_SEARCH_PREFIX = PREFIX;
export const VISUAL_SEARCH_TTL_MS = TTL_MS;

export async function purgeVisualSearchUploads(
	bucket: R2Bucket | undefined,
	forceAll = false,
) {
	if (!bucket) return { deleted: [] as string[], skipped: true };

	const deleted: string[] = [];
	let cursor: string | undefined;
	const cutoff = Date.now() - TTL_MS;

	do {
		const listed = await bucket.list({ prefix: PREFIX, cursor, limit: 1000 });
		for (const object of listed.objects) {
			const uploaded = object.uploaded?.getTime?.() ?? 0;
			if (forceAll || uploaded <= cutoff) {
				await bucket.delete(object.key);
				deleted.push(object.key);
			}
		}
		cursor = listed.truncated ? listed.cursor : undefined;
	} while (cursor);

	return { deleted, skipped: false };
}
