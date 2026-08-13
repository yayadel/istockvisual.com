import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { STORED_VARIANT_IDS, variantObjectKey } from '../../../lib/download-sizes';
import {
	getGeneratedAssetById,
	updateGeneratedAssetImageMeta,
} from '../../../lib/generated-assets';

type VariantBody = {
	assetId: string;
	sizeId?: string;
	imageBase64: string;
	width?: number;
	height?: number;
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

function generateSecret() {
	return (
		env.GENERATE_API_SECRET ||
		import.meta.env.GENERATE_API_SECRET ||
		(import.meta.env.DEV ? 'dev-generate-secret' : '')
	);
}

export const POST: APIRoute = async (context) => {
	const secret = generateSecret();
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
		const body = (await context.request.json()) as VariantBody & { purge?: boolean };
		if (body?.purge) {
			const keep = new Set(
				(
					(
						await env.DB.prepare('SELECT r2ObjectKey FROM generated_asset').all<{
							r2ObjectKey: string;
						}>()
					).results ?? []
				)
					.map((row) => row.r2ObjectKey)
					.filter(Boolean),
			);

			const deleted: string[] = [];
			let cursor: string | undefined;
			do {
				const listed = await env.MEDIA.list({ prefix: 'generated/', cursor, limit: 1000 });
				for (const object of listed.objects) {
					const key = object.key;
					const isVariant = /-(500|1k|2k|4k|8k)\.jpe?g$/i.test(key);
					if (isVariant || !keep.has(key)) {
						await env.MEDIA.delete(key);
						deleted.push(key);
					}
				}
				cursor = listed.truncated ? listed.cursor : undefined;
			} while (cursor);

			return new Response(JSON.stringify({ ok: true, deleted, kept: [...keep] }), {
				headers: { 'Content-Type': 'application/json' },
			});
		}

		if (!body?.assetId || !body.imageBase64) {
			return new Response(JSON.stringify({ error: 'assetId and imageBase64 are required' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		if (body.sizeId && body.sizeId !== '4k') {
			return new Response(
				JSON.stringify({
					error: 'Only a 4K master is stored. Other sizes are drawn in the browser.',
				}),
				{ status: 400, headers: { 'Content-Type': 'application/json' } },
			);
		}

		const asset = await getGeneratedAssetById(env.DB, body.assetId);
		if (!asset?.r2ObjectKey) {
			return new Response(JSON.stringify({ error: 'Asset not found' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		const bytes = decodeBase64Image(body.imageBase64);
		await env.MEDIA.put(asset.r2ObjectKey, bytes, {
			httpMetadata: { contentType: 'image/jpeg' },
		});

		if (body.width && body.height) {
			await updateGeneratedAssetImageMeta(env.DB, asset.id, {
				width: body.width,
				height: body.height,
				fileType: 'image/jpeg',
			});
		}

		const deleted: string[] = [];
		for (const sizeId of STORED_VARIANT_IDS) {
			const key = variantObjectKey(asset.r2ObjectKey, sizeId);
			await env.MEDIA.delete(key);
			deleted.push(key);
		}

		return new Response(
			JSON.stringify({
				ok: true,
				key: asset.r2ObjectKey,
				bytes: bytes.byteLength,
				width: body.width,
				height: body.height,
				deleted,
			}),
			{ headers: { 'Content-Type': 'application/json' } },
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Master upload failed';
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
};
