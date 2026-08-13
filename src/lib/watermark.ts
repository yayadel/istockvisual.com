import { canvasToBlob, clearCanvas, stemFromFileName, yieldToMain } from './tools-shared';

export type WatermarkKind = 'text' | 'logo';
export type WatermarkLayout = 'grid' | 'tile';

/** 0 1 2 / 3 4 5 / 6 7 8 */
export type GridSlot = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type WatermarkSettings = {
	kind: WatermarkKind;
	text: string;
	fontFamily: string;
	color: string;
	/** 0–100 */
	opacity: number;
	/** Font / logo size as % of longest edge */
	sizePercent: number;
	layout: WatermarkLayout;
	gridSlot: GridSlot;
	/** Extra margin as % of longest edge for grid mode */
	marginPercent: number;
	tileGapPercent: number;
	tileAngleDeg: number;
	logoScale: number;
	stroke: boolean;
};

export const DEFAULT_WATERMARK_SETTINGS: WatermarkSettings = {
	kind: 'text',
	text: 'iStockVisual',
	fontFamily: 'Sora, Segoe UI, sans-serif',
	color: '#ffffff',
	opacity: 45,
	sizePercent: 3.2,
	layout: 'grid',
	gridSlot: 8,
	marginPercent: 3,
	tileGapPercent: 18,
	tileAngleDeg: -45,
	logoScale: 12,
	stroke: true,
};

export const WATERMARK_FONTS = [
	{ id: 'sora', label: 'Sora', value: 'Sora, Segoe UI, sans-serif' },
	{ id: 'system', label: 'System UI', value: 'system-ui, Segoe UI, sans-serif' },
	{ id: 'serif', label: 'Georgia', value: 'Georgia, Times New Roman, serif' },
	{ id: 'mono', label: 'Consolas', value: 'Consolas, Courier New, monospace' },
] as const;

function hexToRgba(hex: string, alpha: number): string {
	const cleaned = hex.replace('#', '');
	const full =
		cleaned.length === 3
			? cleaned
					.split('')
					.map((ch) => ch + ch)
					.join('')
			: cleaned;
	const r = Number.parseInt(full.slice(0, 2), 16) || 0;
	const g = Number.parseInt(full.slice(2, 4), 16) || 0;
	const b = Number.parseInt(full.slice(4, 6), 16) || 0;
	return `rgba(${r},${g},${b},${alpha})`;
}

function gridAnchor(
	slot: GridSlot,
	width: number,
	height: number,
	boxW: number,
	boxH: number,
	margin: number,
): { x: number; y: number } {
	const col = slot % 3;
	const row = Math.floor(slot / 3);
	const x =
		col === 0 ? margin : col === 1 ? (width - boxW) / 2 : width - boxW - margin;
	const y =
		row === 0 ? margin : row === 1 ? (height - boxH) / 2 : height - boxH - margin;
	return { x, y };
}

export function paintWatermark(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	settings: WatermarkSettings,
	logo?: HTMLImageElement | null,
) {
	const longest = Math.max(width, height);
	const alpha = Math.min(1, Math.max(0, settings.opacity / 100));
	const margin = (longest * settings.marginPercent) / 100;

	ctx.save();
	ctx.globalAlpha = alpha;

	if (settings.kind === 'logo' && logo) {
		const target = (longest * settings.logoScale) / 100;
		const scale = Math.min(target / logo.naturalWidth, target / logo.naturalHeight);
		const lw = Math.max(1, logo.naturalWidth * scale);
		const lh = Math.max(1, logo.naturalHeight * scale);

		if (settings.layout === 'tile') {
			const gap = (longest * settings.tileGapPercent) / 100;
			const stepX = lw + gap;
			const stepY = lh + gap;
			ctx.translate(width / 2, height / 2);
			ctx.rotate((settings.tileAngleDeg * Math.PI) / 180);
			ctx.translate(-width / 2, -height / 2);
			for (let y = -height; y < height * 2; y += stepY) {
				for (let x = -width; x < width * 2; x += stepX) {
					ctx.drawImage(logo, x, y, lw, lh);
				}
			}
		} else {
			const { x, y } = gridAnchor(settings.gridSlot, width, height, lw, lh, margin);
			ctx.drawImage(logo, x, y, lw, lh);
		}
		ctx.restore();
		return;
	}

	const fontSize = Math.max(10, (longest * settings.sizePercent) / 100);
	ctx.font = `600 ${fontSize}px ${settings.fontFamily}`;
	ctx.textBaseline = 'top';
	const text = settings.text || 'Watermark';
	const metrics = ctx.measureText(text);
	const tw = metrics.width;
	const th = fontSize * 1.2;
	const fill = hexToRgba(settings.color, 1);

	const drawTextAt = (x: number, y: number) => {
		if (settings.stroke) {
			ctx.lineWidth = Math.max(1, fontSize * 0.08);
			ctx.strokeStyle = 'rgba(0,0,0,0.3)';
			ctx.strokeText(text, x, y);
		}
		ctx.fillStyle = fill;
		ctx.fillText(text, x, y);
	};

	if (settings.layout === 'tile') {
		const gap = (longest * settings.tileGapPercent) / 100;
		const stepX = tw + gap;
		const stepY = th + gap;
		ctx.translate(width / 2, height / 2);
		ctx.rotate((settings.tileAngleDeg * Math.PI) / 180);
		ctx.translate(-width / 2, -height / 2);
		for (let y = -height; y < height * 2; y += stepY) {
			for (let x = -width; x < width * 2; x += stepX) {
				drawTextAt(x, y);
			}
		}
	} else {
		const { x, y } = gridAnchor(settings.gridSlot, width, height, tw, th, margin);
		drawTextAt(x, y);
	}

	ctx.restore();
}

export async function renderWatermarkedBlob(
	image: HTMLImageElement,
	settings: WatermarkSettings,
	logo?: HTMLImageElement | null,
	mime: 'image/png' | 'image/jpeg' = 'image/png',
	quality = 0.92,
): Promise<Blob> {
	const width = image.naturalWidth || image.width;
	const height = image.naturalHeight || image.height;
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas 2D unavailable');
	ctx.drawImage(image, 0, 0, width, height);
	paintWatermark(ctx, width, height, settings, logo);
	try {
		return await canvasToBlob(canvas, mime, quality);
	} finally {
		clearCanvas(canvas);
	}
}

export function watermarkFileName(originalName: string, ext = 'png'): string {
	return `${stemFromFileName(originalName)}_wm.${ext}`;
}

export async function zipWatermarkResults(files: { name: string; blob: Blob }[]): Promise<Blob> {
	const { default: JSZip } = await import('jszip');
	const zip = new JSZip();
	for (const file of files) {
		zip.file(file.name, file.blob);
		await yieldToMain(0);
	}
	return zip.generateAsync({ type: 'blob' });
}
