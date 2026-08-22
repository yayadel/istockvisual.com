import type { APIRoute } from 'astro';

export const prerender = false;

function productionOneKUrl(id: string) {
	return `https://stockvisual.org/api/download/${encodeURIComponent(id)}?size=1k`;
}

function productionPreviewUrl(id: string) {
	return `https://stockvisual.org/preview/${encodeURIComponent(id)}_1000w.jpg`;
}

const PROD_FETCH_HEADERS = {
	'User-Agent': 'StockVisualLocalEditor/1.0',
	Accept: 'image/*,*/*',
};

export const GET: APIRoute = async ({ params }) => {
	const id = params.id?.trim();
	if (!id) return new Response('Missing asset id', { status: 400 });

	// Prefer the public preview (CDN-cached) so local Filerobot is not blocked on
	// the slower download/resize path. Fall back to 1K download if needed.
	let res = await fetch(productionPreviewUrl(id), { headers: PROD_FETCH_HEADERS }).catch(() => null);
	if (!res?.ok) {
		res = await fetch(productionOneKUrl(id), { headers: PROD_FETCH_HEADERS }).catch(() => null);
	}

	if (!res?.ok) {
		return new Response('Preview not found', { status: 404 });
	}

	// Buffer locally so Filerobot gets a complete same-origin JPEG (streaming through
	// wrangler/dev can stall or leave the editor on the poster forever).
	const bytes = await res.arrayBuffer().catch(() => null);
	if (!bytes || bytes.byteLength === 0) {
		return new Response('Preview not found', { status: 404 });
	}

	return new Response(bytes, {
		headers: {
			'Content-Type': res.headers.get('Content-Type') || 'image/jpeg',
			'Content-Disposition': 'inline',
			'Cache-Control': 'public, max-age=86400',
		},
	});
};
