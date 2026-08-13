import { canvasToBlob, clearCanvas, contrastInk, relativeLuminance } from './tools-shared';

export type PaletteColor = {
	hex: string;
	rgb: { r: number; g: number; b: number };
	hsl: { h: number; s: number; l: number };
	ratio: number;
	ink: '#111111' | '#ffffff';
};

type Rgb = { r: number; g: number; b: number; count: number };

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
	const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
	return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h = 0;
	switch (max) {
		case r:
			h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
			break;
		case g:
			h = ((b - r) / d + 2) / 6;
			break;
		default:
			h = ((r - g) / d + 4) / 6;
	}
	return {
		h: Math.round(h * 360),
		s: Math.round(s * 100),
		l: Math.round(l * 100),
	};
}

function channelRange(pixels: Rgb[], channel: 'r' | 'g' | 'b') {
	let min = 255;
	let max = 0;
	for (const p of pixels) {
		const v = p[channel];
		if (v < min) min = v;
		if (v > max) max = v;
	}
	return max - min;
}

function averageColor(pixels: Rgb[]): Rgb {
	let r = 0;
	let g = 0;
	let b = 0;
	let count = 0;
	for (const p of pixels) {
		r += p.r * p.count;
		g += p.g * p.count;
		b += p.b * p.count;
		count += p.count;
	}
	if (!count) return { r: 0, g: 0, b: 0, count: 0 };
	return {
		r: r / count,
		g: g / count,
		b: b / count,
		count,
	};
}

/** Median-cut quantization on filtered pixel buckets. */
function medianCut(pixels: Rgb[], colorCount: number): Rgb[] {
	if (!pixels.length) return [];
	const boxes: Rgb[][] = [pixels];

	while (boxes.length < colorCount) {
		let targetIndex = -1;
		let bestScore = -1;
		for (let i = 0; i < boxes.length; i++) {
			const box = boxes[i]!;
			if (box.length < 2) continue;
			const score =
				Math.max(channelRange(box, 'r'), channelRange(box, 'g'), channelRange(box, 'b')) *
				box.reduce((sum, p) => sum + p.count, 0);
			if (score > bestScore) {
				bestScore = score;
				targetIndex = i;
			}
		}
		if (targetIndex < 0) break;
		const box = boxes.splice(targetIndex, 1)[0]!;
		const ranges = {
			r: channelRange(box, 'r'),
			g: channelRange(box, 'g'),
			b: channelRange(box, 'b'),
		};
		const channel =
			ranges.r >= ranges.g && ranges.r >= ranges.b ? 'r' : ranges.g >= ranges.b ? 'g' : 'b';
		box.sort((a, b) => a[channel] - b[channel]);
		let total = 0;
		for (const p of box) total += p.count;
		let running = 0;
		let mid = 0;
		for (; mid < box.length - 1; mid++) {
			running += box[mid]!.count;
			if (running >= total / 2) break;
		}
		const left = box.slice(0, Math.max(1, mid + 1));
		const right = box.slice(Math.max(1, mid + 1));
		if (!right.length) {
			boxes.push(box);
			break;
		}
		boxes.push(left, right);
	}

	return boxes.map(averageColor).filter((c) => c.count > 0);
}

/**
 * Extract dominant colors via median cut.
 * Filters near-black, near-white, and low-alpha pixels; samples for speed.
 */
export function extractPaletteFromImageData(
	imageData: ImageData,
	colorCount = 6,
): PaletteColor[] {
	const { data, width, height } = imageData;
	const bucket = new Map<number, Rgb>();
	const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 12000)));

	for (let y = 0; y < height; y += step) {
		for (let x = 0; x < width; x += step) {
			const i = (y * width + x) * 4;
			const a = data[i + 3]!;
			if (a < 128) continue;
			const r = data[i]!;
			const g = data[i + 1]!;
			const b = data[i + 2]!;
			const lum = relativeLuminance(r, g, b);
			if (lum < 0.04 || lum > 0.92) continue;
			const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
			const existing = bucket.get(key);
			if (existing) {
				existing.count += 1;
				existing.r += (r - existing.r) / existing.count;
				existing.g += (g - existing.g) / existing.count;
				existing.b += (b - existing.b) / existing.count;
			} else {
				bucket.set(key, { r, g, b, count: 1 });
			}
		}
	}

	const pixels = [...bucket.values()];
	if (!pixels.length) {
		return [
			{
				hex: '#808080',
				rgb: { r: 128, g: 128, b: 128 },
				hsl: { h: 0, s: 0, l: 50 },
				ratio: 1,
				ink: '#ffffff',
			},
		];
	}

	const quantized = medianCut(pixels, Math.max(2, Math.min(8, colorCount)));
	const total = quantized.reduce((sum, c) => sum + c.count, 0) || 1;
	const colors = quantized
		.sort((a, b) => b.count - a.count)
		.map((c) => {
			const rgb = {
				r: Math.round(c.r),
				g: Math.round(c.g),
				b: Math.round(c.b),
			};
			const hex = toHex(rgb);
			return {
				hex,
				rgb,
				hsl: rgbToHsl(rgb.r, rgb.g, rgb.b),
				ratio: c.count / total,
				ink: contrastInk(hex),
			};
		});

	const ratioSum = colors.reduce((s, c) => s + c.ratio, 0) || 1;
	return colors.map((c) => ({ ...c, ratio: c.ratio / ratioSum }));
}

export function paletteFromImageElement(
	image: HTMLImageElement,
	colorCount = 6,
	maxEdge = 400,
): PaletteColor[] {
	const srcW = image.naturalWidth || image.width;
	const srcH = image.naturalHeight || image.height;
	const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
	const w = Math.max(1, Math.round(srcW * scale));
	const h = Math.max(1, Math.round(srcH * scale));
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	if (!ctx) throw new Error('Canvas 2D unavailable');
	ctx.drawImage(image, 0, 0, w, h);
	const imageData = ctx.getImageData(0, 0, w, h);
	clearCanvas(canvas);
	return extractPaletteFromImageData(imageData, colorCount);
}

export function formatRgb(c: PaletteColor): string {
	return `rgb(${c.rgb.r}, ${c.rgb.g}, ${c.rgb.b})`;
}

export function formatHsl(c: PaletteColor): string {
	return `hsl(${c.hsl.h}, ${c.hsl.s}%, ${c.hsl.l}%)`;
}

export function toTailwindSnippet(colors: PaletteColor[]): string {
	const lines = colors.map((c, i) => {
		const key = i === 0 ? 'primary' : i === 1 ? 'secondary' : `accent${i - 1}`;
		return `    ${key}: '${c.hex.toLowerCase()}',`;
	});
	return `colors: {\n${lines.join('\n')}\n  }`;
}

export function toCssVarsSnippet(colors: PaletteColor[]): string {
	return colors.map((c, i) => `  --color-${i + 1}: ${c.hex.toLowerCase()};`).join('\n');
}

export async function renderPaletteShareCard(
	image: HTMLImageElement,
	colors: PaletteColor[],
): Promise<Blob> {
	const cardW = 1080;
	const swatchH = 220;
	const imgH = 720;
	const canvas = document.createElement('canvas');
	canvas.width = cardW;
	canvas.height = swatchH + imgH;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas 2D unavailable');

	const band = cardW / Math.max(1, colors.length);
	colors.forEach((color, i) => {
		ctx.fillStyle = color.hex;
		ctx.fillRect(i * band, 0, band + 1, swatchH);
		ctx.fillStyle = color.ink;
		ctx.font = '600 28px Sora, Segoe UI, sans-serif';
		ctx.fillText(color.hex, i * band + 24, 72);
		ctx.font = '500 22px Sora, Segoe UI, sans-serif';
		ctx.fillText(`${Math.round(color.ratio * 100)}%`, i * band + 24, 112);
	});

	const srcW = image.naturalWidth || image.width;
	const srcH = image.naturalHeight || image.height;
	const scale = Math.max(cardW / srcW, imgH / srcH);
	const dw = srcW * scale;
	const dh = srcH * scale;
	ctx.drawImage(image, (cardW - dw) / 2, swatchH + (imgH - dh) / 2, dw, dh);

	try {
		return await canvasToBlob(canvas, 'image/png');
	} finally {
		clearCanvas(canvas);
	}
}

export function makeManualColor(hex: string): PaletteColor {
	const cleaned = hex.replace('#', '');
	const full =
		cleaned.length === 3
			? cleaned
					.split('')
					.map((ch) => ch + ch)
					.join('')
			: cleaned.padEnd(6, '0').slice(0, 6);
	const rgb = {
		r: Number.parseInt(full.slice(0, 2), 16) || 0,
		g: Number.parseInt(full.slice(2, 4), 16) || 0,
		b: Number.parseInt(full.slice(4, 6), 16) || 0,
	};
	const normalized = toHex(rgb);
	return {
		hex: normalized,
		rgb,
		hsl: rgbToHsl(rgb.r, rgb.g, rgb.b),
		ratio: 0,
		ink: contrastInk(normalized),
	};
}
