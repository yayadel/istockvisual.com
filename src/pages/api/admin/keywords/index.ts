import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireAdminResponse } from '../../../../lib/admin';
import { listAdminKeywords, type KeywordStatusFilter } from '../../../../lib/admin-keywords';

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
