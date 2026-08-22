import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { resolvePublicPreviewRoute } from '../../../lib/public-image';
import { servePreviewImage } from '../../../lib/serve-preview';

export const prerender = false;

async function handle(context: Parameters<APIRoute>[0]) {
	const resolved = resolvePublicPreviewRoute(context.url.pathname);
	if (!resolved) {
		return new Response('Not found', { status: 404 });
	}

	if (resolved.kind === 'redirect') {
		return new Response(null, {
			status: 301,
			headers: {
				Location: resolved.location,
				'Cache-Control': 'public, max-age=86400',
			},
		});
	}

	return servePreviewImage(env, {
		id: resolved.id,
		size: resolved.size,
		variant: resolved.variant,
		method: context.request.method,
		origin: context.url.origin,
	});
}

export const GET: APIRoute = handle;
export const HEAD: APIRoute = handle;
