import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireAdminResponse } from '../../../lib/admin';
import { getAdminDashboardStats } from '../../../lib/admin-keywords';

export const GET: APIRoute = async (context) => {
	const denied = requireAdminResponse(context.locals.user, env);
	if (denied) return denied;

	if (!env.DB) {
		return new Response(JSON.stringify({ error: 'Database unavailable' }), {
			status: 503,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const stats = await getAdminDashboardStats(env.DB);

	return new Response(JSON.stringify(stats), {
		headers: { 'Content-Type': 'application/json' },
	});
};
