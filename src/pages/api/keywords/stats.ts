import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getKeywordContentStats, getKeywordStats } from '../../../lib/keywords';

export const GET: APIRoute = async () => {
	if (!env.DB) {
		return new Response(JSON.stringify({ error: 'Database unavailable' }), {
			status: 503,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const [keywords, relations] = await Promise.all([
		getKeywordStats(env.DB),
		getKeywordContentStats(env.DB),
	]);

	return new Response(
		JSON.stringify({
			keywords,
			relations,
		}),
		{ headers: { 'Content-Type': 'application/json' } },
	);
};
