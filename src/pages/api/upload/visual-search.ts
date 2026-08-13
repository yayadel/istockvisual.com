import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import {
	purgeExpiredVisualSearchUploads,
	visualSearchObjectKey,
} from '../../../lib/visual-search-storage';

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function json(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

function safeExt(type: string, name: string) {
	if (type === 'image/jpeg') return 'jpg';
	if (type === 'image/png') return 'png';
	if (type === 'image/webp') return 'webp';
	if (type === 'image/gif') return 'gif';
	const fromName = name.split('.').pop()?.toLowerCase();
	return fromName && fromName.length <= 5 ? fromName : 'jpg';
}

/** Sweep expired query photos in visual-search/ only. */
export const GET: APIRoute = async () => {
	const result = await purgeExpiredVisualSearchUploads(env.MEDIA);
	return json({ ok: true, ...result });
};

export const POST: APIRoute = async ({ request }) => {
	const contentType = request.headers.get('content-type') || '';
	if (!contentType.includes('multipart/form-data')) {
		return json({ error: 'Expected multipart/form-data' }, 400);
	}

	const form = await request.formData();
	const file = form.get('file');

	if (!(file instanceof File)) {
		return json({ error: 'Missing file field' }, 400);
	}

	const name = file.name.toLowerCase();
	const okByName =
		name.endsWith('.jpg') ||
		name.endsWith('.jpeg') ||
		name.endsWith('.png') ||
		name.endsWith('.webp') ||
		name.endsWith('.gif');

	if (!ALLOWED.has(file.type) && !okByName) {
		return json({ error: 'Accepted formats: JPG, PNG, WebP, GIF' }, 400);
	}

	if (file.size <= 0 || file.size > MAX_BYTES) {
		return json({ error: 'Image must be between 1 byte and 8 MB' }, 400);
	}

	const bucket = env.MEDIA;
	const expired = await purgeExpiredVisualSearchUploads(bucket);

	const id = crypto.randomUUID();
	const ext = safeExt(file.type, file.name);
	const key = visualSearchObjectKey(id, ext);
	const bytes = await file.arrayBuffer();
	const type = file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`;

	if (!bucket) {
		return json({
			ok: true,
			stored: false,
			id,
			key,
			filename: file.name,
			contentType: type,
			size: file.size,
			purged: expired.deleted,
			message: 'MEDIA binding missing; query photo was not stored.',
		});
	}

	await bucket.put(key, bytes, {
		httpMetadata: {
			contentType: type,
			cacheControl: 'private, max-age=60',
		},
		customMetadata: {
			originalName: file.name.slice(0, 180),
			uploadedAt: new Date().toISOString(),
			purpose: 'visual-search',
		},
	});

	return json({
		ok: true,
		stored: true,
		id,
		key,
		filename: file.name,
		contentType: type,
		size: file.size,
		purged: expired.deleted,
	});
};
