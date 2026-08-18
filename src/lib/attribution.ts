import { ORG_NAME } from './seo';

/** StockCake-style plain credit line for optional attribution. */
export function buildPhotoAttribution(pageUrl: string): string {
	const url = pageUrl.trim();
	if (!url) return '';
	return `Photo by ${ORG_NAME} on ${url}`;
}
