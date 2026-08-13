import { sizeFileLabel } from './download-sizes';

export const DOWNLOAD_FORMATS = ['jpg', 'png', 'svg'] as const;
export type DownloadFormat = (typeof DOWNLOAD_FORMATS)[number];

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

/** Convert a downloaded raster blob into JPG / PNG / SVG in the browser. */
export async function convertDownloadBlob(
	source: Blob,
	format: DownloadFormat,
): Promise<Blob> {
	if (format === 'jpg' && /jpe?g/i.test(source.type || '')) {
		return source;
	}

	const canvas = await drawBlobToCanvas(source);

	if (format === 'jpg') {
		return canvasToBlob(canvas, 'image/jpeg', 0.92);
	}

	if (format === 'png') {
		return canvasToBlob(canvas, 'image/png');
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

export function downloadFileLabel(slug: string, sizeId: string, format: DownloadFormat) {
	const base = sizeFileLabel(slug, sizeId).replace(/\.jpe?g$/i, '');
	return `${base}.${format}`;
}
