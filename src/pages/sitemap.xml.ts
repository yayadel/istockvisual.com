import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { buildSitemapXml, sitemapResponse } from '../lib/sitemap';

export const prerender = false;

export const GET: APIRoute = async () => {
	return sitemapResponse(await buildSitemapXml(env));
};
