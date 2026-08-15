import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { buildContentSitemapXml, sitemapResponse } from '../lib/sitemap';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
	const page = Number(params.n);
	if (!Number.isInteger(page) || page < 1) {
		return new Response('Not found', { status: 404 });
	}
	const xml = await buildContentSitemapXml(env, page);
	if (!xml) return new Response('Not found', { status: 404 });
	return sitemapResponse(xml);
};
