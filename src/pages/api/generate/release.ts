import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { releaseKeywordById } from '../../../lib/keywords';

type ReleaseBody = {
	keywordId?: number;
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
		const body = (await context.request.json().catch(() => ({}))) as ReleaseBody;
		const keywordId = Number(body.keywordId);
		if (!Number.isFinite(keywordId) || keywordId <= 0) {
			return new Response(JSON.stringify({ error: 'keywordId is required' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		await releaseKeywordById(env.DB, keywordId);
		return new Response(JSON.stringify({ ok: true, keywordId }), {
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Release failed';
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
};
