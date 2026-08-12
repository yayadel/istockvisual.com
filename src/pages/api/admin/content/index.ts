import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireAdminResponse } from '../../../../lib/admin';
import { listAdminGeneratedAssets } from '../../../../lib/admin-keywords';

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

	const result = await listAdminGeneratedAssets(env.DB, { page, limit, q });

	return new Response(JSON.stringify(result), {
		headers: { 'Content-Type': 'application/json' },
	});
};
