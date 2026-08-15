import astro from '@astrojs/cloudflare/entrypoints/server';
import { sitemapResponse, sitemapXmlForPath } from './lib/sitemap';
import { purgeExpiredVisualSearchUploads } from './lib/visual-search-storage';

type WorkerEnv = {
	MEDIA?: R2Bucket;
	DB?: D1Database;
};

type WaitCtx = {
	waitUntil: (promise: Promise<unknown>) => void;
};

function shouldEdgeCache(pathname: string) {
	return (
		pathname.startsWith('/api/preview/') ||
		pathname === '/sitemap.xml' ||
		pathname === '/sitemap.xml/' ||
		pathname.startsWith('/sitemap-')
	);
}

function cacheKeyFor(request: Request) {
	const url = new URL(request.url);
	url.hash = '';
	return new Request(url.toString(), { method: 'GET' });
}

async function withEdgeCache(
	request: Request,
	ctx: WaitCtx,
	produce: () => Promise<Response>,
): Promise<Response> {
	const cache = caches.default;
	const key = cacheKeyFor(request);
	const hit = await cache.match(key);
	if (hit) {
		const headers = new Headers(hit.headers);
		headers.set('X-Worker-Cache', 'HIT');
		if (request.method === 'HEAD') {
			return new Response(null, { status: hit.status, headers });
		}
		return new Response(hit.body, { status: hit.status, headers });
	}

	const response = await produce();
	const headers = new Headers(response.headers);
	headers.set('X-Worker-Cache', 'MISS');
	if (!response.ok) {
		if (request.method === 'HEAD') {
			return new Response(null, { status: response.status, headers });
		}
		return new Response(response.body, { status: response.status, headers });
	}

	const body = await response.arrayBuffer();
	if (request.method === 'GET') {
		const stored = new Response(body.slice(0), {
			status: response.status,
			headers,
		});
		ctx.waitUntil(cache.put(key, stored));
	}
	if (request.method === 'HEAD') {
		return new Response(null, { status: response.status, headers });
	}
	return new Response(body, { status: response.status, headers });
}

export default {
	async fetch(request: Request, env: WorkerEnv, ctx: WaitCtx) {
		const method = request.method;
		if (method === 'GET' || method === 'HEAD') {
			const pathname = new URL(request.url).pathname;
			if (shouldEdgeCache(pathname)) {
				return withEdgeCache(request, ctx, async () => {
					const xml = await sitemapXmlForPath(pathname, env);
					if (xml) {
						const response = sitemapResponse(xml);
						if (method === 'HEAD') {
							return new Response(null, { status: 200, headers: response.headers });
						}
						return response;
					}
					return astro.fetch(request, env, ctx);
				});
			}

			const xml = await sitemapXmlForPath(pathname, env);
			if (xml) {
				const response = sitemapResponse(xml);
				if (method === 'HEAD') {
					return new Response(null, { status: 200, headers: response.headers });
				}
				return response;
			}
		}
		return astro.fetch(request, env, ctx);
	},
	scheduled(_event: unknown, env: WorkerEnv, ctx: WaitCtx) {
		ctx.waitUntil(purgeExpiredVisualSearchUploads(env.MEDIA));
	},
};
