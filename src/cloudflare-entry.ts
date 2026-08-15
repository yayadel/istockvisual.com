import astro from '@astrojs/cloudflare/entrypoints/server';
import { sitemapResponse, sitemapXmlForPath } from './lib/sitemap';
import { purgeExpiredVisualSearchUploads } from './lib/visual-search-storage';
import { htmlCachePolicy, mergeVary, setExpiresHeaders } from './lib/http-cache';

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

function decoratePageResponse(request: Request, response: Response) {
	const type = response.headers.get('Content-Type') || '';
	if (!response.ok || !type.includes('text/html')) return response;
	const headers = new Headers(response.headers);
	const policy = htmlCachePolicy(new URL(request.url).pathname);
	setExpiresHeaders(headers, policy.maxAge, policy.cacheControl);
	headers.set('Vary', mergeVary(headers.get('Vary'), 'Cookie'));
	headers.set('Vary', mergeVary(headers.get('Vary'), 'Accept-Encoding'));
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
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
		return new Response(request.method === 'HEAD' ? null : hit.body, {
			status: hit.status,
			headers,
		});
	}

	const response = await produce();
	const headers = new Headers(response.headers);
	headers.set('X-Worker-Cache', 'MISS');
	if (!response.ok) {
		return new Response(request.method === 'HEAD' ? null : response.body, {
			status: response.status,
			headers,
		});
	}

	const body = await response.arrayBuffer();
	if (request.method === 'GET') {
		const stored = new Response(body.slice(0), {
			status: response.status,
			headers,
		});
		ctx.waitUntil(cache.put(key, stored));
	}
	return new Response(request.method === 'HEAD' ? null : body, {
		status: response.status,
		headers,
	});
}

export default {
	async fetch(request: Request, env: WorkerEnv, ctx: WaitCtx) {
		const method = request.method;
		if (method === 'GET' || method === 'HEAD') {
			const pathname = new URL(request.url).pathname;
			if (shouldEdgeCache(pathname)) {
				return withEdgeCache(request, ctx, async () => {
					const xml = await sitemapXmlForPath(pathname, env);
					if (xml) return sitemapResponse(xml);
					return astro.fetch(request, env, ctx);
				});
			}

			const xml = await sitemapXmlForPath(pathname, env);
			if (xml) return sitemapResponse(xml);
		}

		const response = await astro.fetch(request, env, ctx);
		if (method === 'GET' || method === 'HEAD') {
			return decoratePageResponse(request, response);
		}
		return response;
	},
	scheduled(_event: unknown, env: WorkerEnv, ctx: WaitCtx) {
		ctx.waitUntil(purgeExpiredVisualSearchUploads(env.MEDIA));
	},
};
