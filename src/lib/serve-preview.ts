import { previewObjectKey, variantObjectKey } from './download-sizes';
import { getGeneratedAssetById } from './generated-assets';
import { getAssetById } from './sanity';

const PREVIEW_CACHE = 'public, max-age=31536000, immutable';
const FALLBACK_CACHE = 'public, max-age=86400';

type PreviewEnv = {
	MEDIA?: R2Bucket;
	DB?: D1Database;
};

export type ServePreviewInput = {
	id: string;
	size?: string;
	variant?: string;
	method?: string;
};

function withImageHeaders(
	headers: Headers,
	cacheControl: string,
	contentType: string,
	etag?: string,
) {
	headers.delete('X-Robots-Tag');
	headers.delete('Content-Disposition');
	headers.set('Content-Type', contentType);
	headers.set('Cache-Control', cacheControl);
	headers.set('CDN-Cache-Control', cacheControl);
	headers.set('Content-Disposition', 'inline');
	const maxAge = cacheControl.includes('31536000') ? 31_536_000 : 86_400;
	headers.set('Expires', new Date(Date.now() + maxAge * 1000).toUTCString());
	if (etag) headers.set('etag', etag);
}

function bodyFor(method: string | undefined, body: ReadableStream | null) {
	return method === 'HEAD' ? null : body;
}

export async function servePreviewImage(
	env: PreviewEnv,
	input: ServePreviewInput,
): Promise<Response> {
	const id = input.id?.trim();
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

	const size = (input.size || '').toLowerCase();
	const method = input.method || 'GET';

	const previewKey = previewObjectKey(r2ObjectKey);
	const preview = await bucket.get(previewKey);
	if (preview) {
		const headers = new Headers();
		preview.writeHttpMetadata(headers);
		withImageHeaders(headers, PREVIEW_CACHE, 'image/jpeg', preview.httpEtag);
		return new Response(bodyFor(method, preview.body), { headers });
	}

	if (size === '500' || size === '512' || size === '1k') {
		const variantId = size === '512' ? '500' : size;
		const sized = await bucket.get(variantObjectKey(r2ObjectKey, variantId));
		if (sized) {
			const headers = new Headers();
			sized.writeHttpMetadata(headers);
			withImageHeaders(headers, PREVIEW_CACHE, 'image/jpeg', sized.httpEtag);
			return new Response(bodyFor(method, sized.body), { headers });
		}
	}

	const object = await bucket.get(r2ObjectKey);
	if (!object) {
		return new Response('Preview not found in R2', { status: 404 });
	}

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	withImageHeaders(headers, FALLBACK_CACHE, fileType || 'image/jpeg', object.httpEtag);
	return new Response(bodyFor(method, object.body), { headers });
}
