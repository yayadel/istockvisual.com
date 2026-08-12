import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const POST: APIRoute = async () => {
	return new Response(
		JSON.stringify({
			error: 'Use stepwise generate APIs instead of auto pipeline.',
			prepare: 'POST /api/generate/prepare (reserve keyword)',
			meta: 'npm run agent:meta (Gemini step-1 metadata in Node) or POST /api/generate/meta',
			release: 'POST /api/generate/release (free keyword if meta fails)',
			import: 'POST /api/generate/import',
			cli: 'npm run agent:meta  →  generate image  →  npm run agent:import',
			hint: 'One asset at a time. Metadata via Gemini; image via Cursor. Set HTTPS_PROXY if Google is unreachable.',
		}),
		{
			status: 410,
			headers: { 'Content-Type': 'application/json' },
		},
	);
};
