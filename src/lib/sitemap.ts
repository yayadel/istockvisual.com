import { CATEGORIES } from '../config/categories';
import { CONTENT_CATEGORY_PAGES } from './content-categories';
import {
	SITEMAP_CONTENT_PAGE_SIZE,
	countSitemapAssets,
	listPopulatedMediaTypes,
	listSitemapAssets,
	listTopContentCategoriesByCount,
} from './generated-assets';
import { publicImageUrl } from './public-image';
import { LEGAL_PAGES, PRESS_PATH, siteOrigin } from './seo';

type SitemapEnv = {
	DB?: D1Database;
};

type SitemapUrl = {
	path: string;
	lastmod?: string;
	changefreq?: string;
	priority?: string;
	images?: Array<{ loc: string; title?: string; caption?: string }>;
};

function xmlEscape(value: string) {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function loc(origin: string, path: string) {
	if (path === '/') return `${origin}/`;
	return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

function urlsetXml(origin: string, urls: SitemapUrl[], options: { images?: boolean } = {}) {
	const xmlns = options.images
		? 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'
		: 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"';
	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset ${xmlns}>
${urls
	.map((item) => {
		const bits = [`<loc>${xmlEscape(loc(origin, item.path))}</loc>`];
		if (item.lastmod) bits.push(`<lastmod>${xmlEscape(item.lastmod)}</lastmod>`);
		if (item.changefreq) bits.push(`<changefreq>${item.changefreq}</changefreq>`);
		if (item.priority) bits.push(`<priority>${item.priority}</priority>`);
		for (const image of item.images || []) {
			const imageBits = [`<image:loc>${xmlEscape(image.loc)}</image:loc>`];
			if (image.title) imageBits.push(`<image:title>${xmlEscape(image.title)}</image:title>`);
			if (image.caption) {
				imageBits.push(`<image:caption>${xmlEscape(image.caption)}</image:caption>`);
			}
			bits.push(`<image:image>\n      ${imageBits.join('\n      ')}\n    </image:image>`);
		}
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
		...LEGAL_PAGES.map((page) => ({
			path: page.href,
			changefreq: 'yearly',
			priority: '0.3',
		})),
		{ path: PRESS_PATH, changefreq: 'monthly', priority: '0.5' },
	];
	void env;
	return urlsetXml(origin, urls);
}

export async function buildToolsSitemapXml(env: SitemapEnv): Promise<string> {
	const origin = siteOrigin();
	void env;
	return urlsetXml(origin, [
		{ path: '/tools/image', changefreq: 'weekly', priority: '0.7' },
		{ path: '/tools/convert', changefreq: 'weekly', priority: '0.7' },
		{ path: '/tools/vectorize', changefreq: 'weekly', priority: '0.7' },
		{ path: '/tools/social', changefreq: 'weekly', priority: '0.7' },
		{ path: '/tools/watermark', changefreq: 'weekly', priority: '0.7' },
		{ path: '/tools/palette', changefreq: 'weekly', priority: '0.7' },
	]);
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
			images: asset.id
				? [
						{
							loc: publicImageUrl(origin, asset.id, '1k'),
							title: asset.title || undefined,
							caption: asset.shortDescription || asset.title || undefined,
						},
					]
				: undefined,
		})),
		{ images: true },
	);
}

export async function buildSitemapIndexXml(env: SitemapEnv): Promise<string> {
	const origin = siteOrigin();
	const today = new Date().toISOString().slice(0, 10);
	const files = [
		{ path: '/sitemap-pages.xml', lastmod: today },
		{ path: '/sitemap-categories.xml', lastmod: today },
		{ path: '/sitemap-tools.xml', lastmod: today },
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
	if (path === '/sitemap-tools.xml') return buildToolsSitemapXml(env);

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
			'Cache-Control': 'public, max-age=300, s-maxage=3600',
			'CDN-Cache-Control': 'public, max-age=3600',
			Expires: new Date(Date.now() + 3600 * 1000).toUTCString(),
		},
	});
}
