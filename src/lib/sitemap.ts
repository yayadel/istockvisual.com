import { CATEGORIES } from '../config/categories';
import { CONTENT_CATEGORY_PAGES } from './content-categories';
import {
	listPopulatedMediaTypes,
	listSitemapAssets,
	listTopContentCategoriesByCount,
} from './generated-assets';
import { LEGAL_PAGES, siteOrigin } from './seo';

type SitemapEnv = {
	DB?: D1Database;
};

function xmlEscape(value: string) {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function loc(origin: string, path: string) {
	if (path === '/') return `${origin}/`;
	return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function buildSitemapXml(env: SitemapEnv): Promise<string> {
	const origin = siteOrigin();
	const urls: Array<{ path: string; lastmod?: string; changefreq?: string; priority?: string }> = [
		{ path: '/', changefreq: 'daily', priority: '1.0' },
		{ path: '/c/', changefreq: 'daily', priority: '0.8' },
		{ path: '/price', changefreq: 'monthly', priority: '0.6' },
		{ path: '/tools/image', changefreq: 'monthly', priority: '0.5' },
		{ path: '/tools/convert', changefreq: 'monthly', priority: '0.5' },
		{ path: '/tools/vectorize', changefreq: 'monthly', priority: '0.5' },
		{ path: '/tools/social', changefreq: 'monthly', priority: '0.5' },
		{ path: '/tools/watermark', changefreq: 'monthly', priority: '0.5' },
		{ path: '/tools/palette', changefreq: 'monthly', priority: '0.5' },
		...LEGAL_PAGES.map((page) => ({
			path: page.href,
 mar: 'yearly' as const,
			changefreq: 'yearly',
			priority: '0.3',
		})),
	];

	if (env.DB) {
		const populated = await listPopulatedMediaTypes(env.DB);
		for (const category of CATEGORIES) {
			if (!category.hideUntilHasContent || populated.has(category.slug)) {
				urls.push({ path: `/${category.slug}`, changefreq: 'daily', priority: '0.8' });
			}
		}

		const topics = await listTopContentCategoriesByCount(env.DB, CONTENT_CATEGORY_PAGES.length);
		for (const topic of topics) {
			if (topic.count > 0) {
				urls.push({ path: `/c/${topic.slug}`, changefreq: 'weekly', priority: '0.7' });
			}
		}

		const assets = await listSitemapAssets(env.DB);
		for (const asset of assets) {
			urls.push({
				path: `/${asset.category}/${asset.slug}`,
				lastmod: asset.publishedAt ? asset.publishedAt.slice(0, 10) : undefined,
				changefreq: 'weekly',
				priority: '0.9',
			});
		}
	}

	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
	.map((item) => {
		const bits = [`<loc>${xmlEscape(loc(origin, item.path))}</loc>`];
		if (item.lastmod) bits.push(`<lastmod>${xmlEscape(item.lastmod)}</lastmod>`);
		if (item.changefreq) bits.push(`<changefreq>${item.changefreq}</changefreq>`);
		if (item.priority) bits.push(`<priority>${item.priority}</priority>`);
		return `  <url>\n    ${bits.join('\n    ')}\n  </url>`;
	})
	.join('\n')}
</urlset>
`;
}

export function sitemapResponse(xml: string) {
	return new Response(xml, {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
			'Cache-Control': 'public, max-age=3600',
		},
	});
}
