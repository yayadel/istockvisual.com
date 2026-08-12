import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireAdminResponse } from '../../../../lib/admin';
import { listAdminKeywords, type KeywordStatusFilter } from '../../../../lib/admin-keywords';
import { getKeywordById, releaseKeywordById } from '../../../../lib/keywords';

export const GET: APIRoute = async (context) => {
	const denied = requireAdminResponse(context.locals.user, env);
	if (denied) return denied;

	if (!env.DB) {
		return new Response(JSON.stringify({ error: 'Database unavailable' }), {
			status: 503,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const url = context.url.searchParams;
	const page = Number(url.get('page') || '1');
	const limit = Number(url.get('limit') || '50');
	const q = url.get('q') || '';
	const status = (url.get('status') || 'all') as KeywordStatusFilter;

	const result = await listAdminKeywords(env.DB, { page, limit, q, status });

	return new Response(JSON.stringify(result), {
		headers: { 'Content-Type': 'application/json' },
	});
};

/** Release a reserved keyword that has no linked content (orphan claim). */
export const POST: APIRoute = async (context) => {
	const denied = requireAdminResponse(context.locals.user, env);
	if (denied) return denied;

	if (!env.DB) {
		return new Response(JSON.stringify({ error: 'Database unavailable' }), {
			status: 503,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	try {
		const body = (await context.request.json()) as { action?: string; keywordId?: number };
		if (body.action !== 'release') {
			return new Response(JSON.stringify({ error: 'Unsupported action' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		const keywordId = Number(body.keywordId);
		if (!Number.isFinite(keywordId) || keywordId <= 0) {
			return new Response(JSON.stringify({ error: 'keywordId is required' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		const row = await getKeywordById(env.DB, keywordId);
		if (!row) {
			return new Response(JSON.stringify({ error: 'Keyword not found' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		const linked = await env.DB.prepare(
			`SELECT COUNT(*) AS c FROM keyword_content WHERE keywordId = ? AND status = 'active'`,
		)
			.bind(keywordId)
			.first<{ c: number }>();
		if (Number(linked?.c ?? 0) > 0) {
			return new Response(
				JSON.stringify({ error: 'Keyword already has content; refuse to release.' }),
				{ status: 409, headers: { 'Content-Type': 'application/json' } },
			);
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
