import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { catalogCardPayload } from '../../lib/catalog-card';
import { applyCatalogFilters, paginateCatalog, parseCatalogQuery } from '../../lib/catalog';
import { listAllAssets, parseVisualSearchColors, rankAssetsByPalette } from '../../lib/generate-asset';

export const GET: APIRoute = async ({ url }) => {
	const page = Number(url.searchParams.get('page') || '1');
	const query = parseCatalogQuery(url, { q: (url.searchParams.get('q') || '').trim() });
	const mode = url.searchParams.get('mode') || '';
	const queryColors = parseVisualSearchColors(url.searchParams.get('c'));
	const pool = await listAllAssets(env.DB, url.origin, 600);
	const scoped = applyCatalogFilters(pool, query);
	const ranked = mode === 'visual' ? rankAssetsByPalette(scoped, queryColors) : scoped;
	const paged = paginateCatalog(ranked, page);

	return new Response(
		JSON.stringify({
			page: paged.page,
			hasMore: paged.hasMore,
			items: paged.items.map((asset, i) => catalogCardPayload(asset, paged.indexOffset + i)),
		}),
		{
			status: 200,
			headers: {
				'Content-Type': 'application/json; charset=utf-8',
				'Cache-Control': 'public, max-age=30',
			},
		},
	);
};
