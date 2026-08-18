import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getGeneratedAssetById } from '../../../../lib/generated-assets';
import { getKeywordWithContent } from '../../../../lib/keyword-content';
import { publicImageUrl } from '../../../../lib/public-image';

export const GET: APIRoute = async (context) => {
	const idParam = context.params.id;
	if (!idParam || !env.DB) {
		return new Response(JSON.stringify({ error: 'Not found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const keywordId = Number(idParam);
	if (!Number.isFinite(keywordId)) {
		return new Response(JSON.stringify({ error: 'Invalid keyword id' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const keyword = await getKeywordWithContent(env.DB, keywordId);
	if (!keyword) {
		return new Response(JSON.stringify({ error: 'Keyword not found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const content = await Promise.all(
		keyword.links.map(async (link) => {
			if (link.contentType === 'generated_asset') {
				const asset = await getGeneratedAssetById(env.DB!, link.contentId);
				return {
					link,
					asset: asset
						? {
								id: asset.id,
								title: asset.title,
								slug: asset.slug,
								category: asset.category,
								pageUrl: `/${asset.category}/${asset.slug}`,
								previewUrl: publicImageUrl(context.url.origin, asset.id, '1k'),
							}
						: null,
				};
			}
			return { link, asset: null };
		}),
	);

	return new Response(
		JSON.stringify({
			keyword: {
				id: keyword.id,
				keyword: keyword.keyword,
				used: Boolean(keyword.used),
				usedAt: keyword.usedAt,
				createdAt: keyword.createdAt,
			},
			content,
		}),
		{ headers: { 'Content-Type': 'application/json' } },
	);
};
