/** Shared client-side helpers for /tools/* pages. */

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

export function newId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function downloadBlob(blob: Blob, fileName: string) {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = fileName;
	anchor.click();
	window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function yieldToMain(ms = 0): Promise<void> {
	return new Promise((resolve) => {
		window.setTimeout(resolve, ms);
	});
}

export function isLikelyImageFile(file: File): boolean {
	return file.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name);
}

export function loadImageElement(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.decoding = 'async';
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error('Failed to load image'));
		img.src = src;
	});
}

export async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
	const url = URL.createObjectURL(file);
	try {
		return await loadImageElement(url);
	} finally {
		URL.revokeObjectURL(url);
	}
}

export type ScaledRaster = {
	canvas: HTMLCanvasElement;
	width: number;
	height: number;
	imageData: ImageData;
};

/** Scale so longest edge ≤ maxEdge. Uses a temporary canvas (not OffscreenCanvas for broader Safari support). */
export function scaleRasterFromImage(
	image: CanvasImageSource,
	sourceWidth: number,
	sourceHeight: number,
	maxEdge = 1200,
): ScaledRaster {
	const longest = Math.max(sourceWidth, sourceHeight);
	const scale = longest > maxEdge ? maxEdge / longest : 1;
	const width = Math.max(1, Math.round(sourceWidth * scale));
	const height = Math.max(1, Math.round(sourceHeight * scale));
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) throw new Error('Canvas 2D unavailable');
	ctx.drawImage(image, 0, 0, width, height);
	const imageData = ctx.getImageData(0, 0, width, height);
	return { canvas, width, height, imageData };
}

export function clearCanvas(canvas: HTMLCanvasElement | null | undefined) {
	if (!canvas) return;
	const ctx = canvas.getContext('2d');
	if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
	canvas.width = 0;
	canvas.height = 0;
}

export function canvasToBlob(
	canvas: HTMLCanvasElement,
	type = 'image/png',
	quality?: number,
): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (!blob) reject(new Error('Failed to encode image'));
				else resolve(blob);
			},
			type,
			quality,
		);
	});
}

export function stemFromFileName(name: string): string {
	return name.replace(/\.[^.]+$/, '') || 'image';
}

export function relativeLuminance(r: number, g: number, b: number): number {
	const lin = [r, g, b].map((channel) => {
		const c = channel / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

/** Pick black or white text for readable contrast on a hex background. */
export function contrastInk(hex: string): '#111111' | '#ffffff' {
	const cleaned = hex.replace('#', '');
	const full =
		cleaned.length === 3
			? cleaned
					.split('')
					.map((ch) => ch + ch)
					.join('')
			: cleaned;
	const r = Number.parseInt(full.slice(0, 2), 16);
	const g = Number.parseInt(full.slice(2, 4), 16);
	const b = Number.parseInt(full.slice(4, 6), 16);
	const contrastWhite = (1.05) / (relativeLuminance(r, g, b) + 0.05);
	return contrastWhite >= 3 ? '#ffffff' : '#111111';
}
