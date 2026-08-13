import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { purgeVisualSearchUploads } from '../../../lib/visual-search-storage';

function json(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

/** Visual search stays in the browser. This endpoint only sweeps leftover R2 keys. */
export const GET: APIRoute = async ({ url }) => {
	const forceAll = url.searchParams.get('all') === '1';
	const result = await purgeVisualSearchUploads(env.MEDIA, forceAll);
	return json({ ok: true, stored: false, ...result });
};

export const POST: APIRoute = async () => {
	const result = await purgeVisualSearchUploads(env.MEDIA, true);
	return json({
		ok: true,
		stored: false,
		message: 'Visual search does not upload files. Leftover R2 keys were removed.',
		...result,
	});
};
