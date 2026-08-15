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

export default {
	async fetch(request: Request, env: WorkerEnv, ctx: WaitCtx) {
		if (request.method === 'GET') {
			const xml = await sitemapXmlForPath(new URL(request.url).pathname, env);
			if (xml) return sitemapResponse(xml);
		}
		return astro.fetch(request, env, ctx);
	},
	scheduled(_event: unknown, env: WorkerEnv, ctx: WaitCtx) {
		ctx.waitUntil(purgeExpiredVisualSearchUploads(env.MEDIA));
	},
};
