import type { APIRoute } from 'astro';

export const prerender = false;

function productionOneKUrl(id: string) {
	return `https://istockvisual.com/api/download/${encodeURIComponent(id)}?size=1k`;
}

function productionPreviewUrl(id: string) {
	return `https://istockvisual.com/preview/${encodeURIComponent(id)}_1000w.jpg`;
}

export const GET: APIRoute = async ({ params }) => {
	const id = params.id?.trim();
	if (!id) return new Response('Missing asset id', { status: 400 });

	let res = await fetch(productionOneKUrl(id)).catch(() => null);
	if (!res?.ok) {
		res = await fetch(productionPreviewUrl(id)).catch(() => null);
	}

	if (!res?.ok || !res.body) {
		return new Response('Preview not found', { status: 404 });
	}

	return new Response(res.body, {
		headers: {
			'Content-Type': res.headers.get('Content-Type') || 'image/jpeg',
			'Content-Disposition': 'inline',
			'Cache-Control': 'public, max-age=86400',
		},
	});
};
