import { CATEGORIES } from '../config/categories';
import { CONTENT_CATEGORY_PAGES } from './content-categories';
import {
	SITEMAP_CONTENT_PAGE_SIZE,
	countSitemapAssets,
	listPopulatedMediaTypes,
	listSitemapAssets,
	listTopContentCategoriesByCount,
} from './generated-assets';
import { LEGAL_PAGES, siteOrigin } from './seo';

type SitemapEnv = {
	DB?: D1Database;
};

type SitemapUrl = {
	path: string;
	lastmod?: string;
	changefreq?: string;
	priority?: string;
};

function xmlEscape(value: string) {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function loc(origin: string, path: string) {
	if (path === '/') return `${origin}/`;
	return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

function urlsetXml(origin: string, urls: SitemapUrl[]) {
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

function indexXml(origin: string, files: Array<{ path: string; lastmod?: string }>) {
	return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${files
	.map((item) => {
		const bits = [`<loc>${xmlEscape(loc(origin, item.path))}</loc>`];
		if (item.lastmod) bits.push(`<lastmod>${xmlEscape(item.lastmod)}</lastmod>`);
		return `  <sitemap>\n    ${bits.join('\n    ')}\n  </sitemap>`;
	})
	.join('\n')}
</sitemapindex>
`;
}

export function contentSitemapCount(totalAssets: number) {
	return Math.max(1, Math.ceil(totalAssets / SITEMAP_CONTENT_PAGE_SIZE));
}

export async function buildPagesSitemapXml(env: SitemapEnv): Promise<string> {
	const origin = siteOrigin();
	const urls: SitemapUrl[] = [
		{ path: '/', changefreq: 'daily', priority: '1.0' },
		{ path: '/price', changefreq: 'monthly', priority: '0.6' },
		{ path: '/tools/image', changefreq: 'monthly', priority: '0.5' },
		{ path: '/tools/convert', changefreq: 'monthly', priority: '0.5' },
		{ path: '/tools/vectorize', changefreq: 'monthly', priority: '0.5' },
		{ path: '/tools/social', changefreq: 'monthly', priority: '0.5' },
		{ path: '/tools/watermark', changefreq: 'monthly', priority: '0.5' },
		{ path: '/tools/palette', changefreq: 'monthly', priority: '0.5' },
		...LEGAL_PAGES.map((page) => ({
			path: page.href,
			changefreq: 'yearly',
			priority: '0.3',
		})),
	];
	void env;
	return urlsetXml(origin, urls);
}

export async function buildCategoriesSitemapXml(env: SitemapEnv): Promise<string> {
	const origin = siteOrigin();
	const urls: SitemapUrl[] = [{ path: '/c/', changefreq: 'daily', priority: '0.8' }];

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
	}

	return urlsetXml(origin, urls);
}

export async function buildContentSitemapXml(env: SitemapEnv, page: number): Promise<string | null> {
	const origin = siteOrigin();
	if (!env.DB || page < 1) return null;

	const total = await countSitemapAssets(env.DB);
	const files = contentSitemapCount(total);
	if (page > files) return null;

	const assets = await listSitemapAssets(env.DB, {
		limit: SITEMAP_CONTENT_PAGE_SIZE,
		offset: (page - 1) * SITEMAP_CONTENT_PAGE_SIZE,
	});

	return urlsetXml(
		origin,
		assets.map((asset) => ({
			path: `/${asset.category}/${asset.slug}`,
			lastmod: asset.publishedAt ? asset.publishedAt.slice(0, 10) : undefined,
			changefreq: 'weekly',
			priority: '0.9',
		})),
	);
}

export async function buildSitemapIndexXml(env: SitemapEnv): Promise<string> {
	const origin = siteOrigin();
	const today = new Date().toISOString().slice(0, 10);
	const files = [
		{ path: '/sitemap-pages.xml', lastmod: today },
		{ path: '/sitemap-categories.xml', lastmod: today },
	];

	const total = env.DB ? await countSitemapAssets(env.DB) : 0;
	const contentFiles = contentSitemapCount(total);
	for (let page = 1; page <= contentFiles; page += 1) {
		files.push({ path: `/sitemap-content-${page}.xml`, lastmod: today });
	}

	return indexXml(origin, files);
}

export async function sitemapXmlForPath(pathname: string, env: SitemapEnv): Promise<string | null> {
	const path = pathname.replace(/\/+$/, '') || pathname;
	if (path === '/sitemap.xml') return buildSitemapIndexXml(env);
	if (path === '/sitemap-pages.xml') return buildPagesSitemapXml(env);
	if (path === '/sitemap-categories.xml') return buildCategoriesSitemapXml(env);

	const content = path.match(/^\/sitemap-content-(\d+)\.xml$/);
	if (content) {
		const page = Number(content[1]);
		if (!Number.isInteger(page) || page < 1) return null;
		return buildContentSitemapXml(env, page);
	}

	return null;
}

export function sitemapResponse(xml: string) {
	return new Response(xml, {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
			'Cache-Control': 'public, max-age=300',
		},
	});
}
