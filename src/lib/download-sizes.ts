export const FREE_DOWNLOAD_WIDTH = 500;

export const DOWNLOAD_SIZES = [
	{ id: '500', label: '500', longEdge: 500, free: true, fit: 'width' },
	{ id: '1k', label: '1K', longEdge: 1024, free: false, fit: 'long-edge' },
	{ id: '2k', label: '2K', longEdge: 2048, free: false, fit: 'long-edge' },
	{ id: '4k', label: '4K', longEdge: 4096, free: false, fit: 'long-edge' },
	{ id: '8k', label: '8K', longEdge: 8192, free: false, fit: 'long-edge' },
] as const;

export type DownloadSizeId = (typeof DOWNLOAD_SIZES)[number]['id'];

export function fitLongEdge(width: number, height: number, longEdge: number) {
	const longest = Math.max(width, height) || 1;
	const scale = longEdge / longest;
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
}

export function fitWidth(width: number, height: number, targetWidth: number) {
	const scale = targetWidth / (width || 1);
	return {
		width: targetWidth,
		height: Math.max(1, Math.round(height * scale)),
	};
}

export function outputSizeForDownload(
	width: number,
	height: number,
	size: (typeof DOWNLOAD_SIZES)[number],
) {
	if (size.fit === 'width') return fitWidth(width, height, size.longEdge);
	return fitLongEdge(width, height, size.longEdge);
}

export function sizeFileLabel(slug: string, sizeId: string) {
	const safe = slug.replace(/[^\w.\-]+/g, '_') || 'asset';
	return `${safe}-${sizeId}.jpg`;
}

export function variantObjectKey(originalKey: string, sizeId: string) {
	const dot = originalKey.lastIndexOf('.');
	const base = dot >= 0 ? originalKey.slice(0, dot) : originalKey;
	return `${base}-${sizeId}.jpg`;
}

export function isDownloadSizeId(value: string | null | undefined): value is DownloadSizeId {
	return DOWNLOAD_SIZES.some((size) => size.id === value);
}
