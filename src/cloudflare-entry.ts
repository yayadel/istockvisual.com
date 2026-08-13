import astro from '@astrojs/cloudflare/entrypoints/server';
import { purgeExpiredVisualSearchUploads } from './lib/visual-search-storage';

type MediaEnv = {
	MEDIA?: R2Bucket;
};

type WaitCtx = {
	waitUntil: (promise: Promise<unknown>) => void;
};

export default {
	fetch: astro.fetch,
	scheduled(_event: unknown, env: MediaEnv, ctx: WaitCtx) {
		ctx.waitUntil(purgeExpiredVisualSearchUploads(env.MEDIA));
	},
};
