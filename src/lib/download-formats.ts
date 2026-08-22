import {
	DOWNLOAD_SIZES,
	filenameFromTitle,
	outputSizeForDownload,
	sizeFileLabel,
	type DownloadSizeId,
} from './download-sizes';

export const DOWNLOAD_FORMATS = ['jpg', 'png', 'webp', 'svg'] as const;
export type DownloadFormat = (typeof DOWNLOAD_FORMATS)[number];

export const EDITOR_EXPORT_FORMATS = ['webp', 'png', 'jpg'] as const;
export type EditorExportFormat = (typeof EDITOR_EXPORT_FORMATS)[number];

export function isDownloadFormat(value: string | null | undefined): value is DownloadFormat {
	return DOWNLOAD_FORMATS.includes(value as DownloadFormat);
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result || ''));
		reader.onerror = () => reject(new Error('Failed to read image data'));
		reader.readAsDataURL(blob);
	});
}

function canvasToBlob(
	canvas: HTMLCanvasElement,
	type: string,
	quality?: number,
): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (!blob) reject(new Error('Format conversion failed'));
				else resolve(blob);
			},
			type,
			quality,
		);
	});
}

async function drawBlobToCanvas(source: Blob): Promise<HTMLCanvasElement> {
	const bitmap = await createImageBitmap(source);
	const canvas = document.createElement('canvas');
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	const ctx = canvas.getContext('2d');
	if (!ctx) {
		bitmap.close();
		throw new Error('Canvas unavailable');
	}
	ctx.drawImage(bitmap, 0, 0);
	bitmap.close();
	return canvas;
}

/** Scale a raster blob to a download size in the browser (4K master → 2K / 4K / 8K). */
export async function scaleDownloadBlob(
	source: Blob,
	sizeId: DownloadSizeId,
	sourceWidth: number,
	sourceHeight: number,
	onProgress?: (percent: number) => void,
): Promise<Blob> {
	const size = DOWNLOAD_SIZES.find((item) => item.id === sizeId);
	if (!size) return source;

	const target = outputSizeForDownload(sourceWidth, sourceHeight, size);

	onProgress?.(25);
	const bitmap = await createImageBitmap(source);
	const alreadyFits =
		Math.abs(bitmap.width - target.width) <= 1 && Math.abs(bitmap.height - target.height) <= 1;
	if (alreadyFits) {
		bitmap.close();
		onProgress?.(100);
		return source;
	}

	onProgress?.(55);
	const canvas = document.createElement('canvas');
	canvas.width = target.width;
	canvas.height = target.height;
	const ctx = canvas.getContext('2d');
	if (!ctx) {
		bitmap.close();
		throw new Error('Canvas unavailable');
	}
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(bitmap, 0, 0, target.width, target.height);
	bitmap.close();
	onProgress?.(100);
	return canvasToBlob(canvas, 'image/jpeg', 0.92);
}

/** Convert a downloaded raster blob into JPG / PNG / WEBP / SVG in the browser. */
export async function convertDownloadBlob(
	source: Blob,
	format: DownloadFormat,
	qualityPct = 92,
): Promise<Blob> {
	const q = Math.min(1, Math.max(0.1, qualityPct / 100));
	if (format === 'jpg' && /jpe?g/i.test(source.type || '') && qualityPct === 92) {
		return source;
	}
	if (format === 'webp' && /webp/i.test(source.type || '') && qualityPct === 92) {
		return source;
	}

	const canvas = await drawBlobToCanvas(source);

	if (format === 'jpg') {
		return canvasToBlob(canvas, 'image/jpeg', q);
	}

	if (format === 'png') {
		return canvasToBlob(canvas, 'image/png');
	}

	if (format === 'webp') {
		return canvasToBlob(canvas, 'image/webp', q);
	}

	const pngBlob = await canvasToBlob(canvas, 'image/png');
	const dataUrl = await blobToDataUrl(pngBlob);
	const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}">
  <image width="${canvas.width}" height="${canvas.height}" href="${dataUrl}" xlink:href="${dataUrl}" />
</svg>
`;
	return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
}

export function downloadFileLabel(title: string, sizeId: string, format: DownloadFormat) {
	const base = sizeFileLabel(title, sizeId).replace(/\.jpe?g$/i, '');
	return `${base}.${format}`;
}

export function mimeForExportFormat(format: EditorExportFormat) {
	if (format === 'png') return 'image/png';
	if (format === 'jpg') return 'image/jpeg';
	return 'image/webp';
}

export function blobFromCanvas(
	canvas: HTMLCanvasElement,
	format: EditorExportFormat,
	qualityPct = 92,
): Promise<Blob> {
	const mime = mimeForExportFormat(format);
	const quality = format === 'png' ? undefined : Math.min(1, Math.max(0.1, qualityPct / 100));
	return canvasToBlob(canvas, mime, quality);
}

export function formatByteSize(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Edited export name: title + aspect, no random codes. */
export function editedDownloadFileName(
	title: string,
	aspectId: string,
	format: EditorExportFormat,
) {
	const base = filenameFromTitle(title);
	const ratio = !aspectId || aspectId === 'free' ? 'free' : aspectId.replace(/:/g, '-');
	return `${base}-${ratio}.${format}`;
}
