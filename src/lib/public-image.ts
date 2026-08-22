/** Public, crawlable image URLs with static extensions (Google Images). */

export type PublicImageSize = 'preview' | '500' | '1k';
export type PublicImageFormat = 'avif' | 'jpeg';
export type PublicImageExt = 'avif' | 'jpg' | 'jpeg' | 'webp';

export type ParsedPublicPreview = {
	id: string;
	size?: '500' | '1k';
	format: PublicImageFormat;
	ext: PublicImageExt;
};

function originOf(origin: string) {
	return origin.replace(/\/$/, '');
}

function widthToken(size: PublicImageSize) {
	if (size === '500') return '500w';
	if (size === '1k') return '1000w';
	return '1280w';
}

function localPreviewOrigin() {
	return import.meta.env.DEV ? 'https://stockvisual.org' : '';
}

export function publicImagePath(
	assetId: string,
	size: PublicImageSize = '500',
	ext: 'avif' | 'jpg' = 'jpg',
): string {
	const id = encodeURIComponent(assetId);
	return `${localPreviewOrigin()}/preview/${id}_${widthToken(size)}.${ext}`;
}

export function publicImageUrl(
	origin: string,
	assetId: string,
	size: PublicImageSize = '500',
	ext: 'avif' | 'jpg' = 'jpg',
): string {
	const base = import.meta.env.DEV ? 'https://stockvisual.org' : originOf(origin);
	const id = encodeURIComponent(assetId);
	return `${base}/preview/${id}_${widthToken(size)}.${ext}`;
}

export function previewSrcset(assetId: string, ext: 'avif' | 'jpg' = 'jpg') {
	return `${publicImagePath(assetId, '500', ext)} 500w, ${publicImagePath(assetId, '1k', ext)} 1000w`;
}

export function parsePublicPreviewFile(filename: string): ParsedPublicPreview | null {
	let decoded = filename.trim();
	try {
		decoded = decodeURIComponent(decoded);
	} catch {
		/* keep raw */
	}

	const extMatch = decoded.match(/^(.*)\.(avif|jpe?g|webp)$/i);
	if (!extMatch) return null;

	let stem = extMatch[1];
	if (!stem) return null;

	const ext = extMatch[2].toLowerCase() as PublicImageExt;
	const format: PublicImageFormat = ext === 'avif' ? 'avif' : 'jpeg';

	let size: '500' | '1k' | undefined;
	const sized = stem.match(/^(.*)[_-](500|512|1000|1k|1280)w?$/i);
	if (sized) {
		stem = sized[1];
		const token = sized[2].toLowerCase();
		size = token === '1000' || token === '1k' || token === '1280' ? '1k' : '500';
	} else if (format === 'jpeg') {
		size = '1k';
	}

	if (!stem) return null;
	return { id: stem, size, format, ext };
}

export type PublicPreviewRoute =
	| { kind: 'redirect'; location: string }
	| { kind: 'serve'; id: string; size: string; variant: 'jpg' | 'avif' };

function filenameFromPreviewPath(pathname: string): string | null {
	const prefixes = ['/preview/', '/images/preview/'];
	for (const prefix of prefixes) {
		if (pathname.startsWith(prefix)) return pathname.slice(prefix.length);
	}
	return null;
}

export function resolvePublicPreviewRoute(pathname: string): PublicPreviewRoute | null {
	const filename = filenameFromPreviewPath(pathname);
	if (!filename) return null;
	const parsed = parsePublicPreviewFile(filename);
	if (!parsed) return null;

	const canonical = publicImagePath(parsed.id, parsed.size || '1k', 'jpg');
	if (pathname.startsWith('/images/preview/')) {
		return { kind: 'redirect', location: canonical };
	}

	return {
		kind: 'serve',
		id: parsed.id,
		size: parsed.size || '1k',
		variant: 'jpg',
	};
}

export function parseAssetIdFromImageUrl(url: string): string | null {
	if (!url) return null;
	try {
		const parsed = new URL(url, 'https://stockvisual.org');
		const pretty = filenameFromPreviewPath(parsed.pathname);
		if (pretty) return parsePublicPreviewFile(pretty)?.id ?? null;
		const api = parsed.pathname.match(/^\/api\/preview\/([^/]+)$/);
		if (api) return decodeURIComponent(api[1]);
		const download = parsed.pathname.match(/^\/api\/download\/([^/]+)$/);
		if (download) return decodeURIComponent(download[1]);
	} catch {
		return null;
	}
	return null;
}

/** Map any preview URL (pretty or legacy API) onto a sized public file. */
export function sizedPreviewUrl(
	url: string,
	size: Exclude<PublicImageSize, 'preview'>,
	ext: 'avif' | 'jpg' = 'jpg',
): string {
	const id = parseAssetIdFromImageUrl(url);
	if (!id) {
		if (!url) return url;
		return url.includes('?') ? `${url}&size=${size}` : `${url}?size=${size}`;
	}
	if (url.startsWith('/')) return publicImagePath(id, size, ext);
	try {
		return publicImageUrl(new URL(url).origin, id, size, ext);
	} catch {
		return publicImagePath(id, size, ext);
	}
}

export function imageMimeFromUrl(url: string | undefined): string | undefined {
	if (!url) return undefined;
	const path = url.split('?')[0].toLowerCase();
	if (path.endsWith('.avif')) return 'image/avif';
	if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
	if (path.endsWith('.webp')) return 'image/webp';
	if (path.endsWith('.png')) return 'image/png';
	if (/[?&]v=avif(?:&|$)/i.test(url)) return 'image/avif';
	return undefined;
}

/** Rewrite legacy `/api/preview/...` and `.avif` URLs to canonical `/preview/{id}_{width}w.jpg`. */
export function canonicalizePublicImageUrl(
	url: string | undefined,
	origin: string,
	size: Exclude<PublicImageSize, 'preview'> = '1k',
): string | undefined {
	if (!url) return undefined;
	try {
		const parsed = new URL(url, origin);
		const id = parseAssetIdFromImageUrl(parsed.href);
		if (!id) return parsed.href;

		let resolvedSize = size;
		const qSize = parsed.searchParams.get('size')?.toLowerCase() || '';
		if (qSize === '500' || qSize === '512') resolvedSize = '500';
		if (qSize === '1000' || qSize === '1k') resolvedSize = '1k';

		return publicImageUrl(origin, id, resolvedSize, 'jpg');
	} catch {
		const id = parseAssetIdFromImageUrl(url);
		if (id) return publicImageUrl(origin, id, size, 'jpg');
		return url;
	}
}
