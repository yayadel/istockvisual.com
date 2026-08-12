import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { prepareNextKeyword } from '../../../lib/generate-asset';

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

	if (!env.DB) {
		return new Response(JSON.stringify({ error: 'Database unavailable' }), {
			status: 503,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	try {
		const prepared = await prepareNextKeyword(env.DB);
		const hasGemini = Boolean(env.GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY);
		return new Response(
			JSON.stringify({
				ok: true,
				mode: 'prepare-keyword',
				...prepared,
				geminiConfigured: hasGemini,
				instructions: hasGemini
					? [
							'Keyword reserved.',
							'Run `npm run agent:meta` to generate step-1 metadata with Gemini (Node), or POST /api/generate/meta.',
							'Then generate ONE image from meta.imagePrompt and import.',
						]
					: [
							'Keyword reserved, but GEMINI_API_KEY is missing in .dev.vars.',
							'Add the key, then run `npm run agent:meta`.',
						],
			}),
			{ headers: { 'Content-Type': 'application/json' } },
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Prepare failed';
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
};
