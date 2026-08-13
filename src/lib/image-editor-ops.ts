/** Client-side canvas helpers for the image editor (zero server compute). */

import {
	DOWNLOAD_SIZES,
	DEFAULT_DOWNLOAD_SIZE,
	outputSizeForDownload,
	type DownloadSizeId,
} from './download-sizes';

export type AspectPreset = {
	id: string;
	label: string;
	/** null = keep source / free aspect */
	ratio: number | null;
};

/** Full practical ratio set for stock, social, print, and ultrawide. */
export const EDITOR_ASPECT_PRESETS: AspectPreset[] = [
	{ id: 'free', label: 'Free', ratio: null },
	{ id: '1:1', label: '1:1', ratio: 1 },
	{ id: '5:4', label: '5:4', ratio: 5 / 4 },
	{ id: '4:5', label: '4:5', ratio: 4 / 5 },
	{ id: '4:3', label: '4:3', ratio: 4 / 3 },
	{ id: '3:4', label: '3:4', ratio: 3 / 4 },
	{ id: '3:2', label: '3:2', ratio: 3 / 2 },
	{ id: '2:3', label: '2:3', ratio: 2 / 3 },
	{ id: '5:3', label: '5:3', ratio: 5 / 3 },
	{ id: '3:5', label: '3:5', ratio: 3 / 5 },
	{ id: '7:5', label: '7:5', ratio: 7 / 5 },
	{ id: '5:7', label: '5:7', ratio: 5 / 7 },
	{ id: '16:10', label: '16:10', ratio: 16 / 10 },
	{ id: '10:16', label: '10:16', ratio: 10 / 16 },
	{ id: '16:9', label: '16:9', ratio: 16 / 9 },
	{ id: '9:16', label: '9:16', ratio: 9 / 16 },
	{ id: '1.91:1', label: '1.91:1', ratio: 1.91 },
	{ id: '2:1', label: '2:1', ratio: 2 },
	{ id: '1:2', label: '1:2', ratio: 1 / 2 },
	{ id: '21:9', label: '21:9', ratio: 21 / 9 },
	{ id: '9:21', label: '9:21', ratio: 9 / 21 },
	{ id: '32:9', label: '32:9', ratio: 32 / 9 },
	{ id: 'a4-l', label: 'A4', ratio: Math.SQRT2 },
	{ id: 'a4-p', label: 'A4 P', ratio: 1 / Math.SQRT2 },
];

export type AdjustValues = {
	brightness: number;
	contrast: number;
	saturation: number;
	exposure: number;
	highlights: number;
	shadows: number;
	temperature: number;
	tint: number;
	hue: number;
	vibrance: number;
};

export const DEFAULT_ADJUST: AdjustValues = {
	brightness: 0,
	contrast: 0,
	saturation: 0,
	exposure: 0,
	highlights: 0,
	shadows: 0,
	temperature: 0,
	tint: 0,
	hue: 0,
	vibrance: 0,
};

export const ADJUST_SLIDERS: {
	key: keyof AdjustValues;
	label: string;
	min: number;
	max: number;
}[] = [
	{ key: 'brightness', label: 'Brightness', min: -50, max: 50 },
	{ key: 'exposure', label: 'Exposure', min: -50, max: 50 },
	{ key: 'contrast', label: 'Contrast', min: -50, max: 50 },
	{ key: 'highlights', label: 'Highlights', min: -50, max: 50 },
	{ key: 'shadows', label: 'Shadows', min: -50, max: 50 },
	{ key: 'saturation', label: 'Saturation', min: -50, max: 50 },
	{ key: 'vibrance', label: 'Vibrance', min: -50, max: 50 },
	{ key: 'temperature', label: 'Temperature', min: -50, max: 50 },
	{ key: 'tint', label: 'Tint', min: -50, max: 50 },
	{ key: 'hue', label: 'Hue', min: -180, max: 180 },
];

export { DOWNLOAD_SIZES, DEFAULT_DOWNLOAD_SIZE };
export type { DownloadSizeId };

export function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

/** Pixel output from download size tier + aspect preset. */
export function resolveEditorCanvasSize(
	sizeId: DownloadSizeId,
	aspectRatio: number | null,
	sourceW: number,
	sourceH: number,
): { width: number; height: number } {
	const size = DOWNLOAD_SIZES.find((item) => item.id === sizeId) ?? DOWNLOAD_SIZES[1]!;
	if (!aspectRatio) {
		return outputSizeForDownload(sourceW, sourceH, size);
	}
	const longEdge = size.longEdge;
	if (aspectRatio >= 1) {
		return {
			width: longEdge,
			height: Math.max(1, Math.round(longEdge / aspectRatio)),
		};
	}
	return {
		height: longEdge,
		width: Math.max(1, Math.round(longEdge * aspectRatio)),
	};
}

/** Tiny rectangle dims inside a fixed box for aspect chips. */
export function aspectPreviewBox(ratio: number | null, box = 22): { width: number; height: number } {
	if (!ratio || !Number.isFinite(ratio) || ratio <= 0) {
		return { width: box, height: Math.round(box * 0.72) };
	}
	if (ratio >= 1) {
		return { width: box, height: Math.max(6, Math.round(box / ratio)) };
	}
	return { height: box, width: Math.max(6, Math.round(box * ratio)) };
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

	ctx.save();
	ctx.filter = 'blur(28px) saturate(1.05)';
	const cover = Math.max(targetW / sourceW, targetH / sourceH);
	const cw = sourceW * cover;
	const ch = sourceH * cover;
	ctx.drawImage(source, (targetW - cw) / 2, (targetH - ch) / 2, cw, ch);
	ctx.restore();

	ctx.save();
	ctx.globalAlpha = 0.35;
	ctx.fillStyle = '#000';
	ctx.fillRect(0, 0, targetW, targetH);
	ctx.restore();

	ctx.drawImage(source, 0, 0, sourceW, sourceH, dx, dy, dw, dh);

	return out;
}

export function hasAdjustChanges(adjust: AdjustValues): boolean {
	return (Object.keys(DEFAULT_ADJUST) as (keyof AdjustValues)[]).some(
		(key) => adjust[key] !== 0,
	);
}

function hueRotateRgb(r: number, g: number, b: number, degrees: number) {
	const rad = (degrees * Math.PI) / 180;
	const cos = Math.cos(rad);
	const sin = Math.sin(rad);
	const matrix = [
		0.213 + cos * 0.787 - sin * 0.213,
		0.715 - cos * 0.715 - sin * 0.715,
		0.072 - cos * 0.072 + sin * 0.928,
		0.213 - cos * 0.213 + sin * 0.143,
		0.715 + cos * 0.285 + sin * 0.14,
		0.072 - cos * 0.072 - sin * 0.283,
		0.213 - cos * 0.213 - sin * 0.787,
		0.715 - cos * 0.715 + sin * 0.715,
		0.072 + cos * 0.928 + sin * 0.072,
	];
	return {
		r: r * matrix[0]! + g * matrix[1]! + b * matrix[2]!,
		g: r * matrix[3]! + g * matrix[4]! + b * matrix[5]!,
		b: r * matrix[6]! + g * matrix[7]! + b * matrix[8]!,
	};
}

export function applyAdjustToImageData(data: ImageData, adjust: AdjustValues): ImageData {
	if (!hasAdjustChanges(adjust)) return data;

	const brightness = adjust.brightness / 100;
	const exposure = adjust.exposure / 100;
	const contrast = (adjust.contrast / 100) * 255;
	const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
	const saturation = 1 + adjust.saturation / 100;
	const vibrance = adjust.vibrance / 100;
	const highlights = adjust.highlights / 100;
	const shadows = adjust.shadows / 100;
	const temperature = adjust.temperature / 100;
	const tint = adjust.tint / 100;
	const hue = adjust.hue;

	const out = new ImageData(new Uint8ClampedArray(data.data), data.width, data.height);
	const px = out.data;
	const exposureMul = Math.pow(2, exposure);

	for (let i = 0; i < px.length; i += 4) {
		let r = px[i]!;
		let g = px[i + 1]!;
		let bl = px[i + 2]!;

		// Exposure
		r *= exposureMul;
		g *= exposureMul;
		bl *= exposureMul;

		// Brightness + contrast
		r = contrastFactor * (r - 128) + 128 + brightness * 255;
		g = contrastFactor * (g - 128) + 128 + brightness * 255;
		bl = contrastFactor * (bl - 128) + 128 + brightness * 255;

		let lum = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
		const highlightMask = clamp((lum - 128) / 127, 0, 1);
		const shadowMask = clamp((128 - lum) / 128, 0, 1);
		const hiLift = highlights * 80 * highlightMask;
		const shLift = shadows * 80 * shadowMask;
		r += hiLift + shLift;
		g += hiLift + shLift;
		bl += hiLift + shLift;

		// Temperature (warm/cool) + tint (green/magenta)
		r += temperature * 40;
		bl -= temperature * 40;
		g += tint * 35;
		r -= tint * 15;
		bl -= tint * 15;

		lum = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
		r = lum + (r - lum) * saturation;
		g = lum + (g - lum) * saturation;
		bl = lum + (bl - lum) * saturation;

		// Vibrance: boost low-saturation pixels more
		if (vibrance) {
			const maxC = Math.max(r, g, bl);
			const minC = Math.min(r, g, bl);
			const sat = maxC > 1e-3 ? 1 - minC / maxC : 0;
			const vibeFactor = 1 + vibrance * (1 - sat);
			r = lum + (r - lum) * vibeFactor;
			g = lum + (g - lum) * vibeFactor;
			bl = lum + (bl - lum) * vibeFactor;
		}

		if (hue) {
			const rotated = hueRotateRgb(r, g, bl, hue);
			r = rotated.r;
			g = rotated.g;
			bl = rotated.b;
		}

		px[i] = clamp(r, 0, 255);
		px[i + 1] = clamp(g, 0, 255);
		px[i + 2] = clamp(bl, 0, 255);
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

/** Fast CSS preview for basic filters; advanced ones use canvas bake. */
export function cssFilterFromAdjust(adjust: AdjustValues): string {
	const brightness = 1 + adjust.brightness / 100 + adjust.exposure / 120;
	const contrast = 1 + adjust.contrast / 100;
	const saturate = 1 + adjust.saturation / 100 + adjust.vibrance / 140;
	const hue = adjust.hue;
	const parts = [
		`brightness(${brightness})`,
		`contrast(${contrast})`,
		`saturate(${Math.max(0, saturate)})`,
	];
	if (hue) parts.push(`hue-rotate(${hue}deg)`);
	return parts.join(' ');
}
