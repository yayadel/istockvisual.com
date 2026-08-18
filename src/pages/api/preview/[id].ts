import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { servePreviewImage } from '../../../lib/serve-preview';

export const prerender = false;

export const GET: APIRoute = async (context) => {
	const id = context.params.id;
	if (!id) {
		return new Response('Missing asset id', { status: 400 });
	}

	return servePreviewImage(env, {
		id,
		size: context.url.searchParams.get('size') || '',
		variant: context.url.searchParams.get('v') || '',
		method: context.request.method,
	});
};

export const HEAD: APIRoute = GET;
