/** Client-side canvas helpers for the image editor (zero server compute). */

export type SizePreset = {
	id: string;
	label: string;
	/** Fixed pixel size; null = derive from source + ratio */
	width: number | null;
	height: number | null;
	ratio: number | null;
};

export const EDITOR_SIZE_PRESETS: SizePreset[] = [
	{ id: 'original', label: 'Original', width: null, height: null, ratio: null },
	{ id: '1:1', label: '1:1 Square', width: null, height: null, ratio: 1 },
	{ id: '16:9', label: '16:9', width: null, height: null, ratio: 16 / 9 },
	{ id: '9:16', label: '9:16', width: null, height: null, ratio: 9 / 16 },
	{ id: '4:5', label: '4:5', width: null, height: null, ratio: 4 / 5 },
	{ id: '4:3', label: '4:3', width: null, height: null, ratio: 4 / 3 },
	{ id: '3:2', label: '3:2', width: null, height: null, ratio: 3 / 2 },
	{ id: '1080', label: '1080×1080', width: 1080, height: 1080, ratio: 1 },
	{ id: '1920', label: '1920×1080', width: 1920, height: 1080, ratio: 16 / 9 },
	{ id: '1080p', label: '1080×1920', width: 1080, height: 1920, ratio: 9 / 16 },
];

export type AdjustValues = {
	brightness: number;
	contrast: number;
	saturation: number;
};

export const DEFAULT_ADJUST: AdjustValues = {
	brightness: 0,
	contrast: 0,
	saturation: 0,
};

export function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

export function resolveCanvasSize(
	preset: SizePreset,
	sourceW: number,
	sourceH: number,
): { width: number; height: number } {
	if (preset.width && preset.height) {
		return { width: preset.width, height: preset.height };
	}
	if (!preset.ratio) {
		return { width: sourceW, height: sourceH };
	}
	const longEdge = Math.max(sourceW, sourceH);
	if (preset.ratio >= 1) {
		const width = longEdge;
		const height = Math.max(1, Math.round(width / preset.ratio));
		return { width, height };
	}
	const height = longEdge;
	const width = Math.max(1, Math.round(height * preset.ratio));
	return { width, height };
}

export function containSize(imgW: number, imgH: number, boxW: number, boxH: number) {
	const imgRatio = imgW / imgH;
	const boxRatio = boxW / boxH;
	if (imgRatio > boxRatio) {
		return { w: boxW, h: boxW / imgRatio, x: 0, y: (boxH - boxW / imgRatio) / 2 };
	}
	const w = boxH * imgRatio;
	return { w, h: boxH, x: (boxW - w) / 2, y: 0 };
}

/** Mirror + blur edge fill for outpainting empty canvas margins (no AI model). */
export function expandWithEdgeFill(
	source: CanvasImageSource,
	sourceW: number,
	sourceH: number,
	targetW: number,
	targetH: number,
): HTMLCanvasElement {
	const out = document.createElement('canvas');
	out.width = targetW;
	out.height = targetH;
	const ctx = out.getContext('2d');
	if (!ctx) return out;

	const fit = containSize(sourceW, sourceH, targetW, targetH);
	const dx = Math.round(fit.x);
	const dy = Math.round(fit.y);
	const dw = Math.max(1, Math.round(fit.w));
	const dh = Math.max(1, Math.round(fit.h));

	// Blurred cover fill
	ctx.save();
	ctx.filter = 'blur(28px) saturate(1.05)';
	const cover = Math.max(targetW / sourceW, targetH / sourceH);
	const cw = sourceW * cover;
	const ch = sourceH * cover;
	ctx.drawImage(source, (targetW - cw) / 2, (targetH - ch) / 2, cw, ch);
	ctx.restore();

	// Soft vignette over fill
	ctx.save();
	ctx.globalAlpha = 0.35;
	ctx.fillStyle = '#000';
	ctx.fillRect(0, 0, targetW, targetH);
	ctx.restore();

	// Sharp subject centered
	ctx.drawImage(source, 0, 0, sourceW, sourceH, dx, dy, dw, dh);

	return out;
}

export function applyAdjustToImageData(data: ImageData, adjust: AdjustValues): ImageData {
	const { brightness, contrast, saturation } = adjust;
	if (!brightness && !contrast && !saturation) return data;

	const b = brightness / 100;
	const c = (contrast / 100) * 255;
	const contrastFactor = (259 * (c + 255)) / (255 * (259 - c));
	const s = 1 + saturation / 100;
	const out = new ImageData(new Uint8ClampedArray(data.data), data.width, data.height);
	const px = out.data;

	for (let i = 0; i < px.length; i += 4) {
		let r = px[i];
		let g = px[i + 1];
		let bl = px[i + 2];

		r = clamp(contrastFactor * (r - 128) + 128 + b * 255, 0, 255);
		g = clamp(contrastFactor * (g - 128) + 128 + b * 255, 0, 255);
		bl = clamp(contrastFactor * (bl - 128) + 128 + b * 255, 0, 255);

		const gray = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
		r = clamp(gray + (r - gray) * s, 0, 255);
		g = clamp(gray + (g - gray) * s, 0, 255);
		bl = clamp(gray + (bl - gray) * s, 0, 255);

		px[i] = r;
		px[i + 1] = g;
		px[i + 2] = bl;
	}
	return out;
}

export function canvasFromImage(
	source: CanvasImageSource,
	width: number,
	height: number,
): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (ctx) ctx.drawImage(source, 0, 0, width, height);
	return canvas;
}

export function cssFilterFromAdjust(adjust: AdjustValues): string {
	const brightness = 1 + adjust.brightness / 100;
	const contrast = 1 + adjust.contrast / 100;
	const saturate = 1 + adjust.saturation / 100;
	return `brightness(${brightness}) contrast(${contrast}) saturate(${saturate})`;
}
