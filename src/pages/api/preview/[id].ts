import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getGeneratedAssetById } from '../../../lib/generated-assets';
import { getAssetById } from '../../../lib/sanity';

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

	const object = await bucket.get(r2ObjectKey);
	if (!object) {
		return new Response('Preview not found in R2', { status: 404 });
	}

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('etag', object.httpEtag);
	headers.set('Content-Type', fileType);
	headers.set('Cache-Control', 'public, max-age=86400');

	return new Response(object.body, { headers });
};
