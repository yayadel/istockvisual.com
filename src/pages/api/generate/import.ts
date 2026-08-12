import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import type { GeneratedAssetMeta } from '../../../lib/asset-types';
import { importGeneratedAsset } from '../../../lib/generate-asset';

type ImportBody = {
	keywordId: number;
	meta: GeneratedAssetMeta;
	imageBase64: string;
	fileType?: string;
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

	try {
		const body = (await context.request.json()) as ImportBody;
		if (!body?.keywordId || !body?.meta?.imagePrompt || !body?.imageBase64) {
			return new Response(
				JSON.stringify({ error: 'keywordId, meta.imagePrompt, and imageBase64 are required' }),
				{ status: 400, headers: { 'Content-Type': 'application/json' } },
			);
		}

		const imageBytes = decodeBase64Image(body.imageBase64);
		const result = await importGeneratedAsset(env, context.url.origin, {
			keywordId: body.keywordId,
			meta: body.meta,
			imageBytes,
			fileType: body.fileType,
			width: body.width,
			height: body.height,
		});

		return new Response(
			JSON.stringify({
				ok: true,
				keyword: result.keyword,
				keywordId: result.keywordId,
				asset: {
					id: result.asset._id,
					title: result.asset.title,
					slug: result.asset.slug,
					category: result.asset.category,
					previewUrl: result.asset.previewUrl,
					pageUrl: `/${result.asset.category}/${result.asset.slug}`,
				},
				meta: result.meta,
			}),
			{ headers: { 'Content-Type': 'application/json' } },
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Import failed';
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
};
