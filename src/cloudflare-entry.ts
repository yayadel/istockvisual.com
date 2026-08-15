import astro from '@astrojs/cloudflare/entrypoints/server';
import { buildSitemapXml, sitemapResponse } from './lib/sitemap';
import { purgeExpiredVisualSearchUploads } from './lib/visual-search-storage';

type WorkerEnv = {
	MEDIA?: R2Bucket;
	DB?: D1Database;
};

type WaitCtx = {
	waitUntil: (promise: Promise<unknown>) => void;
};

export default {
	async fetch(request: Request, env: WorkerEnv, ctx: WaitCtx) {
		const path = new URL(request.url).pathname;
		if (request.method === 'GET' && (path === '/sitemap.xml' || path === '/sitemap.xml/')) {
			return sitemapResponse(await buildSitemapXml(env));
		}
		return astro.fetch(request, env, ctx);
	},
	scheduled(_event: unknown, env: WorkerEnv, ctx: WaitCtx) {
		ctx.waitUntil(purgeExpiredVisualSearchUploads(env.MEDIA));
	},
};
