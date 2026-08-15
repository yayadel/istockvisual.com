import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { previewObjectKey, variantObjectKey } from '../../../lib/download-sizes';
import { getGeneratedAssetById } from '../../../lib/generated-assets';
import { getAssetById } from '../../../lib/sanity';

const PREVIEW_CACHE = 'public, max-age=31536000, immutable';
const FALLBACK_CACHE = 'public, max-age=86400';

function withCache(headers: Headers, cacheControl: string, contentType: string, etag?: string) {
	headers.set('Content-Type', contentType);
	headers.set('Cache-Control', cacheControl);
	headers.set('CDN-Cache-Control', cacheControl);
	if (etag) headers.set('etag', etag);
}

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

	const size = (context.url.searchParams.get('size') || '').toLowerCase();
	if (size === '500' || size === '1k') {
		const variant = await bucket.get(variantObjectKey(r2ObjectKey, size));
		if (variant) {
			const headers = new Headers();
			variant.writeHttpMetadata(headers);
			withCache(headers, PREVIEW_CACHE, 'image/jpeg', variant.httpEtag);
			return new Response(variant.body, { headers });
		}
	}

	const previewKey = previewObjectKey(r2ObjectKey);
	const preview = await bucket.get(previewKey);
	if (preview) {
		const headers = new Headers();
		preview.writeHttpMetadata(headers);
		withCache(headers, PREVIEW_CACHE, 'image/avif', preview.httpEtag);
		return new Response(preview.body, { headers });
	}

	const object = await bucket.get(r2ObjectKey);
	if (!object) {
		return new Response('Preview not found in R2', { status: 404 });
	}

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	withCache(headers, FALLBACK_CACHE, fileType, object.httpEtag);
	return new Response(object.body, { headers });
};
