import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import {
	isExpiredVisualSearchObject,
	isVisualSearchObjectKey,
} from '../../../lib/visual-search-storage';

export const GET: APIRoute = async ({ url }) => {
	const key = url.searchParams.get('key') || '';
	if (!isVisualSearchObjectKey(key)) {
		return new Response('Invalid visual search key', { status: 400 });
	}

	const bucket = env.MEDIA;
	if (!bucket) {
		return new Response('MEDIA binding missing', { status: 503 });
	}

	const object = await bucket.get(key);
	if (!object) {
		return new Response('Query photo not found', { status: 404 });
	}

	if (isExpiredVisualSearchObject(object)) {
		await bucket.delete(key);
		return new Response('Query photo expired', { status: 404 });
	}

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('etag', object.httpEtag);
	headers.set('Cache-Control', 'private, max-age=60');
	headers.set('Content-Disposition', 'inline');
	return new Response(object.body, { headers });
};
