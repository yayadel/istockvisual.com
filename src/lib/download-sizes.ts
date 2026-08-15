/** Smallest free download: 512 on the long edge. API/R2 id stays `500`. */
export const FREE_DOWNLOAD_EDGE = 512;
export const FREE_DOWNLOAD_WIDTH = FREE_DOWNLOAD_EDGE;

/** Only this size is stored in R2. Other download sizes are drawn in the browser. */
export const MASTER_DOWNLOAD_SIZE = '4k' as const;
export const MASTER_LONG_EDGE = 4096;
export const PREVIEW_SIZE_ID = 'preview';
export const PREVIEW_LONG_EDGE = 1280;

export const DOWNLOAD_SIZES = [
	{ id: '500', label: '500', longEdge: 500, free: true, fit: 'width' },
	{ id: '1k', label: '1K', longEdge: 1024, free: true, fit: 'long-edge' },
	{ id: '2k', label: '2K', longEdge: 2048, free: false, fit: 'long-edge' },
	{ id: '4k', label: '4K', longEdge: MASTER_LONG_EDGE, free: false, fit: 'long-edge' },
	{ id: '8k', label: '8K', longEdge: 8192, free: false, fit: 'long-edge' },
] as const;

export const STORED_VARIANT_IDS = ['500', '1k', '2k', '4k', '8k'] as const;

export type DownloadSizeId = (typeof DOWNLOAD_SIZES)[number]['id'];

export const DEFAULT_DOWNLOAD_SIZE: DownloadSizeId = '1k';

/** 500 and 1K: free for everyone, no login. */
export function isFreeDownloadSize(sizeId: string | null | undefined): boolean {
	return sizeId === '500' || sizeId === '1k';
}
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

/** Download filename stem: the page title, with only illegal path characters stripped. */
export function filenameFromTitle(title: string): string {
	const cleaned = title
		.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 160);
	return cleaned || 'asset';
}

export function sizeFileLabel(title: string, sizeId: string) {
	const base = filenameFromTitle(title);
	const size = DOWNLOAD_SIZES.find((item) => item.id === sizeId);
	const sizePart = size?.label || sizeId;
	return `${base}-${sizePart}.jpg`;
}

export function variantObjectKey(originalKey: string, sizeId: string) {
	const dot = originalKey.lastIndexOf('.');
	const base = dot >= 0 ? originalKey.slice(0, dot) : originalKey;
	return `${base}-${sizeId}.jpg`;
}

export function previewObjectKey(originalKey: string) {
	const dot = originalKey.lastIndexOf('.');
	const base = dot >= 0 ? originalKey.slice(0, dot) : originalKey;
	return `${base}-preview.avif`;
}

export function legacyPreviewObjectKey(originalKey: string) {
	const dot = originalKey.lastIndexOf('.');
	const base = dot >= 0 ? originalKey.slice(0, dot) : originalKey;
	return `${base}-preview.webp`;
}

export function isDownloadSizeId(value: string | null | undefined): value is DownloadSizeId {
	return DOWNLOAD_SIZES.some((size) => size.id === value);
}

/** Free sizes stay server-resized so 4K is not sent to unpaid clients. */
export function fetchSizeForDownload(sizeId: DownloadSizeId): DownloadSizeId {
	return isFreeDownloadSize(sizeId) ? sizeId : MASTER_DOWNLOAD_SIZE;
}
