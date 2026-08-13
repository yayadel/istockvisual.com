import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

const PREFIX = 'uploads/visual-search/';
const TTL_MS = 60 * 60 * 1000;

function json(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

async function purgeVisualSearchUploads(forceAll = false) {
	const bucket = env.MEDIA;
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

/** Visual search stays in the browser. This endpoint only sweeps leftover R2 keys. */
export const GET: APIRoute = async ({ url }) => {
	const forceAll = url.searchParams.get('all') === '1';
	const result = await purgeVisualSearchUploads(forceAll);
	return json({ ok: true, stored: false, ...result });
};

export const POST: APIRoute = async () => {
	const result = await purgeVisualSearchUploads(true);
	return json({
		ok: true,
		stored: false,
		message: 'Visual search does not upload files. Leftover R2 keys were removed.',
		...result,
	});
};
