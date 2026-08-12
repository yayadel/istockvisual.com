import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { generateMetaWithGemini } from '../../../lib/gemini-meta';
import { getKeywordById } from '../../../lib/keywords';

type MetaBody = {
	keywordId?: number;
	keyword?: string;
};

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
		const body = (await context.request.json().catch(() => ({}))) as MetaBody;
		let keywordId = Number(body.keywordId);
		let keyword = typeof body.keyword === 'string' ? body.keyword.trim() : '';

		if (Number.isFinite(keywordId) && keywordId > 0) {
			const row = await getKeywordById(env.DB, keywordId);
			if (!row) {
				return new Response(JSON.stringify({ error: `Keyword id ${keywordId} not found` }), {
					status: 404,
					headers: { 'Content-Type': 'application/json' },
				});
			}
			if (!row.used) {
				return new Response(
					JSON.stringify({
						error: `Keyword id ${keywordId} is not reserved. Call /api/generate/prepare first.`,
					}),
					{ status: 400, headers: { 'Content-Type': 'application/json' } },
				);
			}
			keyword = row.keyword;
		} else if (!keyword) {
			return new Response(
				JSON.stringify({ error: 'keywordId (preferred) or keyword is required' }),
				{ status: 400, headers: { 'Content-Type': 'application/json' } },
			);
		}

		const meta = await generateMetaWithGemini(env, keyword);
		return new Response(
			JSON.stringify({
				ok: true,
				provider: 'gemini',
				model: env.GEMINI_MODEL || import.meta.env.GEMINI_MODEL || 'gemini-2.0-flash',
				keywordId: Number.isFinite(keywordId) && keywordId > 0 ? keywordId : null,
				keyword,
				meta,
				hint: 'Prefer `npm run agent:meta` locally — Gemini runs in Node and is more reliable than Worker fetch.',
				next: [
					'Use meta.imagePrompt with Cursor image generation (one asset at a time).',
					'POST /api/generate/import with keywordId, meta, and imageBase64.',
				],
			}),
			{ headers: { 'Content-Type': 'application/json' } },
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Meta generation failed';
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
};
