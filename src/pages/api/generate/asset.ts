import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { runGenerateAssetPipeline } from '../../../lib/generate-asset';

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
		const result = await runGenerateAssetPipeline(env, context.url.origin);
		return new Response(
			JSON.stringify({
				ok: true,
				keyword: result.keyword,
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
		const message = error instanceof Error ? error.message : 'Generation failed';
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
};
