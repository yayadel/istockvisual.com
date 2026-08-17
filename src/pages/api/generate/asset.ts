import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const POST: APIRoute = async () => {
	return new Response(
		JSON.stringify({
			error: 'Use stepwise generate APIs instead of auto pipeline.',
			prepare: 'POST /api/generate/prepare { count?: N } — lock N unused keywords in one batch',
			meta: 'npm run agent:meta:gemma (or agent:meta) — next pending from batch / single claim',
			release: 'POST /api/generate/release { keywordId | batchId } — free unused locks',
			import: 'POST /api/generate/import',
			cli: 'npm run agent:prepare -- --count N  →  agent:meta:gemma  →  image  →  agent:import',
			hint: 'Lock a batch first so other workers cannot claim the same topics. One image at a time.',
		}),
		{
			status: 410,
			headers: { 'Content-Type': 'application/json' },
		},
	);
};
