import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { previewObjectKey } from '../../../lib/download-sizes';
import { getGeneratedAssetById } from '../../../lib/generated-assets';
import { resizeImageToLongEdgeJpeg } from '../../../lib/resize-jpeg';
import { getAssetById } from '../../../lib/sanity';

const PREVIEW_LONG_EDGE = 1024;

export const GET: APIRoute = async (context) => {
	const id = context.params.id;
	if (!id) {
		return new Response('Missing asset id', { status: 400 });
	}

	const bucket = env.MEDIA;
	if (!bucket) {
		return new Response('MEDIA binding missing', { status: 503 });
	}

	let r2ObjectKey: string | undefined;
	let fileType = 'image/jpeg';

	if (id.startsWith('gen-') && env.DB) {
		const generated = await getGeneratedAssetById(env.DB, id);
		if (!generated) {
			return new Response('Asset not found', { status: 404 });
		}
		r2ObjectKey = generated.r2ObjectKey;
		fileType = generated.fileType;
	} else {
		const asset = await getAssetById(id);
		if (!asset?.r2ObjectKey) {
			return new Response('Asset not found', { status: 404 });
		}
		r2ObjectKey = asset.r2ObjectKey;
		fileType = asset.fileType || fileType;
	}

	const previewKey = previewObjectKey(r2ObjectKey);
	const cached = await bucket.get(previewKey);
	if (cached) {
		const headers = new Headers();
		cached.writeHttpMetadata(headers);
		headers.set('etag', cached.httpEtag);
		headers.set('Content-Type', 'image/jpeg');
		headers.set('Cache-Control', 'public, max-age=86400');
		return new Response(cached.body, { headers });
	}

	const object = await bucket.get(r2ObjectKey);
	if (!object) {
		return new Response('Preview not found in R2', { status: 404 });
	}

	try {
		const master = new Uint8Array(await object.arrayBuffer());
		const resized = resizeImageToLongEdgeJpeg(master, PREVIEW_LONG_EDGE, 82);
		await bucket.put(previewKey, resized.bytes, {
			httpMetadata: { contentType: 'image/jpeg' },
		});
		return new Response(resized.bytes, {
			headers: {
				'Content-Type': 'image/jpeg',
				'Cache-Control': 'public, max-age=86400',
			},
		});
	} catch {
		const headers = new Headers();
		object.writeHttpMetadata(headers);
		headers.set('etag', object.httpEtag);
		headers.set('Content-Type', fileType);
		headers.set('Cache-Control', 'public, max-age=86400');
		return new Response(object.body, { headers });
	}
};
