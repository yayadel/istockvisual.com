import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { createAuth } from '../../../lib/auth';

export const ALL: APIRoute = async (context) => {
	const secret = env.BETTER_AUTH_SECRET || import.meta.env.BETTER_AUTH_SECRET;
	const baseURL =
		env.BETTER_AUTH_URL || import.meta.env.BETTER_AUTH_URL || context.url.origin;

	if (!env.DB || !secret) {
		return new Response(
			JSON.stringify({
				error: 'Auth is not configured. Set DB binding and BETTER_AUTH_SECRET.',
			}),
			{ status: 503, headers: { 'Content-Type': 'application/json' } },
		);
	}

	const auth = createAuth({
		DB: env.DB,
		BETTER_AUTH_SECRET: secret,
		BETTER_AUTH_URL: baseURL,
	});

	return auth.handler(context.request);
};
