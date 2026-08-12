import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isDownloadSizeId, variantObjectKey } from '../../../lib/download-sizes';
import { getGeneratedAssetById } from '../../../lib/generated-assets';

type VariantBody = {
	assetId: string;
	sizeId: string;
	imageBase64: string;
};

function decodeBase64Image(value: string): Uint8Array {
	const base64 = value.includes(',') ? value.split(',')[1]! : value;
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

export const POST: APIRoute = async (context) => {
	const secret =
		env.GENERATE_API_SECRET ||
		import.meta.env.GENERATE_API_SECRET ||
		(import.meta.env.DEV ? 'dev-generate-secret' : '');
	const provided = context.request.headers.get('x-generate-secret');
	if (!secret || provided !== secret) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	if (!env.DB || !env.MEDIA) {
		return new Response(JSON.stringify({ error: 'Storage unavailable' }), {
			status: 503,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	try {
		const body = (await context.request.json()) as VariantBody;
		if (!body?.assetId || !isDownloadSizeId(body.sizeId) || !body.imageBase64) {
			return new Response(JSON.stringify({ error: 'assetId, sizeId, and imageBase64 are required' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		const asset = await getGeneratedAssetById(env.DB, body.assetId);
		if (!asset?.r2ObjectKey) {
			return new Response(JSON.stringify({ error: 'Asset not found' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		const key = variantObjectKey(asset.r2ObjectKey, body.sizeId);
		const bytes = decodeBase64Image(body.imageBase64);
		await env.MEDIA.put(key, bytes, {
			httpMetadata: { contentType: 'image/jpeg' },
		});

		return new Response(JSON.stringify({ ok: true, key, bytes: bytes.byteLength }), {
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Variant upload failed';
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
};
