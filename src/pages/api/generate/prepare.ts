import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { prepareKeywords } from '../../../lib/generate-asset';
import { MAX_KEYWORD_CLAIM_COUNT } from '../../../lib/keywords';

type PrepareBody = {
	count?: number;
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
		const body = (await context.request.json().catch(() => ({}))) as PrepareBody;
		const rawCount = Number(body.count ?? 1);
		const count = Number.isFinite(rawCount) && rawCount > 0 ? Math.floor(rawCount) : 1;
		if (count > MAX_KEYWORD_CLAIM_COUNT) {
			return new Response(
				JSON.stringify({
					error: `count must be between 1 and ${MAX_KEYWORD_CLAIM_COUNT}`,
				}),
				{ status: 400, headers: { 'Content-Type': 'application/json' } },
			);
		}

		const prepared = await prepareKeywords(env.DB, count);
		const first = prepared.keywords[0];
		const hasGemini = Boolean(env.GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY);

		return new Response(
			JSON.stringify({
				ok: true,
				mode: 'prepare-keyword',
				batchId: prepared.batchId,
				count: prepared.count,
				keywords: prepared.keywords.map((item) => ({
					keywordId: item.keywordId,
					keyword: item.keyword,
					lockBatchId: item.lockBatchId,
				})),
				// Backward-compatible single-claim fields (first reserved topic).
				keywordId: first?.keywordId,
				keyword: first?.keyword,
				hostPrompt: first?.hostPrompt,
				jsonInstruction: first?.jsonInstruction,
				fullPrompt: first?.fullPrompt,
				lockBatchId: prepared.batchId,
				geminiConfigured: hasGemini,
				instructions: [
					`Reserved ${prepared.count} keyword(s) in lock batch ${prepared.batchId}.`,
					'Other workers will not receive these topics until released or completed.',
					'Process keywords one-by-one (meta → one image → import). Do not batch image generation.',
					hasGemini
						? 'Run `npm run agent:meta:gemma` (or agent:meta) per keyword, then import.'
						: 'Add GEMINI_API_KEY / TOGETHER_API_KEY, then run agent meta per keyword.',
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
