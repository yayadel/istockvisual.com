/** Client-side image format conversion (Canvas + optional HEIC decode). */

export type ConvertMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';

export type ConvertFormatId = 'jpeg' | 'png' | 'webp' | 'avif';

export const CONVERT_FORMATS: {
	id: ConvertFormatId;
	mime: ConvertMime;
	ext: string;
	label: string;
}[] = [
	{ id: 'jpeg', mime: 'image/jpeg', ext: 'jpg', label: 'JPG' },
	{ id: 'png', mime: 'image/png', ext: 'png', label: 'PNG' },
	{ id: 'webp', mime: 'image/webp', ext: 'webp', label: 'WebP' },
	{ id: 'avif', mime: 'image/avif', ext: 'avif', label: 'AVIF' },
];

export type ConvertSettings = {
	formatId: ConvertFormatId;
	/** 1–100 */
	quality: number;
	/** Percent of original size, 1–100 */
	scalePercent: number;
	/** 0 = no cap */
	maxWidth: number;
	/** Hex background when flattening transparency for JPEG */
	jpgBackground: string;
};

export const DEFAULT_CONVERT_SETTINGS: ConvertSettings = {
	formatId: 'webp',
	quality: 85,
	scalePercent: 100,
	maxWidth: 0,
	jpgBackground: '#ffffff',
};

export type ConvertItemStatus = 'queued' | 'converting' | 'done' | 'error';

export type ConvertItem = {
	id: string;
	file: File;
	name: string;
	size: number;
	previewUrl: string;
	status: ConvertItemStatus;
	progress: number;
	error?: string;
	resultBlob?: Blob;
	resultUrl?: string;
	resultSize?: number;
	resultName?: string;
	isExample?: boolean;
};

function formatById(id: ConvertFormatId) {
	return CONVERT_FORMATS.find((item) => item.id === id) ?? CONVERT_FORMATS[2]!;
}

export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB'];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function isHeicFile(file: File): boolean {
	const name = file.name.toLowerCase();
	return (
		name.endsWith('.heic') ||
		name.endsWith('.heif') ||
		file.type === 'image/heic' ||
		file.type === 'image/heif'
	);
}

async function decodeToBitmap(file: File): Promise<ImageBitmap> {
	let blob: Blob = file;
	if (isHeicFile(file)) {
		const heic2any = (await import('heic2any')).default;
		const converted = await heic2any({
			blob: file,
			toType: 'image/png',
			quality: 0.92,
		});
		blob = Array.isArray(converted) ? converted[0]! : converted;
	}
	return createImageBitmap(blob);
}

function resolveOutputSize(
	srcW: number,
	srcH: number,
	settings: ConvertSettings,
): { width: number; height: number } {
	let width = srcW;
	let height = srcH;
	const scale = Math.min(100, Math.max(1, settings.scalePercent)) / 100;
	width = Math.max(1, Math.round(width * scale));
	height = Math.max(1, Math.round(height * scale));
	if (settings.maxWidth > 0 && width > settings.maxWidth) {
		const ratio = settings.maxWidth / width;
		width = settings.maxWidth;
		height = Math.max(1, Math.round(height * ratio));
	}
	return { width, height };
}

function canvasToBlob(
	canvas: HTMLCanvasElement,
	mime: string,
	quality: number,
): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (blob) resolve(blob);
				else reject(new Error(`Browser could not encode ${mime}`));
			},
			mime,
			quality,
		);
	});
}

/** Probe whether the browser can encode the given MIME via canvas. */
export async function canEncodeMime(mime: ConvertMime): Promise<boolean> {
	try {
		const canvas = document.createElement('canvas');
		canvas.width = 2;
		canvas.height = 2;
		const ctx = canvas.getContext('2d');
		if (!ctx) return false;
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, 2, 2);
		const blob = await canvasToBlob(canvas, mime, 0.8);
		return blob.type === mime || (mime === 'image/jpeg' && blob.type === 'image/jpg');
	} catch {
		return false;
	}
}

/**
 * Convert one image fully in the browser.
 * Canvas redraw strips EXIF/XMP by default (privacy-friendly).
 */
export async function convertImageFile(
	file: File,
	settings: ConvertSettings,
): Promise<{ blob: Blob; fileName: string }> {
	const format = formatById(settings.formatId);
	const bitmap = await decodeToBitmap(file);
	try {
		const { width, height } = resolveOutputSize(bitmap.width, bitmap.height, settings);
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Canvas unavailable');

		if (format.mime === 'image/jpeg') {
			ctx.fillStyle = settings.jpgBackground || '#ffffff';
			ctx.fillRect(0, 0, width, height);
		} else {
			ctx.clearRect(0, 0, width, height);
		}

		ctx.drawImage(bitmap, 0, 0, width, height);

		const quality = Math.min(1, Math.max(0.01, settings.quality / 100));
		let blob: Blob;
		try {
			blob = await canvasToBlob(canvas, format.mime, quality);
		} catch (error) {
			if (format.mime === 'image/avif') {
				blob = await canvasToBlob(canvas, 'image/webp', quality);
			} else {
				throw error;
			}
		}

		const base = file.name.replace(/\.[^.]+$/, '') || 'converted';
		const ext = blob.type === 'image/webp' && format.mime === 'image/avif' ? 'webp' : format.ext;
		return { blob, fileName: `${base}.${ext}` };
	} finally {
		bitmap.close();
	}
}

export async function zipConvertedFiles(
	files: { name: string; blob: Blob }[],
): Promise<Blob> {
	const JSZip = (await import('jszip')).default;
	const zip = new JSZip();
	for (const file of files) {
		zip.file(file.name, file.blob);
	}
	return zip.generateAsync({ type: 'blob' });
}

export function downloadBlob(blob: Blob, fileName: string) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = fileName;
	link.click();
	window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
