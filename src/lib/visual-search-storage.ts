const PREFIX = 'visual-search/';
const LEGACY_PREFIX = 'uploads/visual-search/';
const TTL_MS = 60 * 60 * 1000;
const KEY_PATTERN = /^[a-zA-Z0-9._-]+$/;

export const VISUAL_SEARCH_PREFIX = PREFIX;
export const VISUAL_SEARCH_TTL_MS = TTL_MS;

const PURGE_PREFIXES = [PREFIX, LEGACY_PREFIX] as const;

export function isVisualSearchObjectKey(key: string): boolean {
	if (key.includes('..') || key.includes('\\') || key.includes('//')) return false;
	for (const prefix of PURGE_PREFIXES) {
		if (!key.startsWith(prefix)) continue;
		const rest = key.slice(prefix.length);
		return rest.length > 0 && !rest.includes('/') && KEY_PATTERN.test(rest);
	}
	return false;
}

export function visualSearchObjectKey(id: string, ext: string) {
	const safeExt = ext.replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'jpg';
	return `${PREFIX}${id}.${safeExt}`;
}

/** Delete expired query photos only. Never touches generated/ or other R2 prefixes. */
export async function purgeExpiredVisualSearchUploads(bucket: R2Bucket | undefined) {
	if (!bucket) return { deleted: [] as string[], skipped: true };

	const deleted: string[] = [];
	const cutoff = Date.now() - TTL_MS;

	for (const prefix of PURGE_PREFIXES) {
		let cursor: string | undefined;
		do {
			const listed = await bucket.list({ prefix, cursor, limit: 1000 });
			for (const object of listed.objects) {
				if (!isVisualSearchObjectKey(object.key)) continue;
				const uploaded = object.uploaded?.getTime?.() ?? 0;
				if (uploaded > 0 && uploaded <= cutoff) {
					await bucket.delete(object.key);
					deleted.push(object.key);
				}
			}
			cursor = listed.truncated ? listed.cursor : undefined;
		} while (cursor);
	}

	return { deleted, skipped: false };
}

export function isExpiredVisualSearchObject(object: { uploaded?: Date }) {
	const uploaded = object.uploaded?.getTime?.() ?? 0;
	return uploaded > 0 && uploaded <= Date.now() - TTL_MS;
}
