import { canvasToBlob, clearCanvas, stemFromFileName, yieldToMain } from './tools-shared';

export type SocialFitMode = 'cover' | 'contain-blur';

export type SocialPreset = {
	id: string;
	label: string;
	platform: string;
	width: number;
	height: number;
	ratioLabel: string;
};

export const SOCIAL_PRESETS: SocialPreset[] = [
	{
		id: 'ig-square',
		label: 'Instagram Square',
		platform: 'Instagram feed post',
		width: 1080,
		height: 1080,
		ratioLabel: '1:1',
	},
	{
		id: 'ig-portrait',
		label: 'Instagram Portrait',
		platform: 'Instagram feed (4:5)',
		width: 1080,
		height: 1350,
		ratioLabel: '4:5',
	},
	{
		id: 'story-reels',
		label: 'Story / Reels / TikTok',
		platform: 'Vertical short-form',
		width: 1080,
		height: 1920,
		ratioLabel: '9:16',
	},
	{
		id: 'youtube-thumb',
		label: 'YouTube Thumbnail',
		platform: 'YouTube / landscape',
		width: 1280,
		height: 720,
		ratioLabel: '16:9',
	},
	{
		id: 'og-share',
		label: 'Facebook / LinkedIn',
		platform: 'Link preview & share',
		width: 1200,
		height: 630,
		ratioLabel: '1.91:1',
	},
];

export type SocialDrawOptions = {
	mode: SocialFitMode;
	/** 0–1 focal point for cover crop (0.5 = center) */
	focusX: number;
	focusY: number;
	blurPx?: number;
};

function clamp01(n: number) {
	return Math.min(1, Math.max(0, n));
}

/** Draw image into target canvas using cover crop or contain + blurred backdrop. */
export function drawSocialFrame(
	ctx: CanvasRenderingContext2D,
	image: CanvasImageSource,
	srcW: number,
	srcH: number,
	outW: number,
	outH: number,
	options: SocialDrawOptions,
) {
	const focusX = clamp01(options.focusX);
	const focusY = clamp01(options.focusY);
	ctx.clearRect(0, 0, outW, outH);

	if (options.mode === 'contain-blur') {
		const coverScale = Math.max(outW / srcW, outH / srcH);
		const bw = srcW * coverScale;
		const bh = srcH * coverScale;
		ctx.save();
		ctx.filter = `blur(${options.blurPx ?? 24}px) brightness(0.82)`;
		ctx.drawImage(image, (outW - bw) / 2, (outH - bh) / 2, bw, bh);
		ctx.restore();

		const containScale = Math.min(outW / srcW, outH / srcH);
		const fw = srcW * containScale;
		const fh = srcH * containScale;
		ctx.drawImage(image, (outW - fw) / 2, (outH - fh) / 2, fw, fh);
		return;
	}

	const scale = Math.max(outW / srcW, outH / srcH);
	const drawW = srcW * scale;
	const drawH = srcH * scale;
	const maxOffsetX = Math.max(0, drawW - outW);
	const maxOffsetY = Math.max(0, drawH - outH);
	const dx = -maxOffsetX * focusX;
	const dy = -maxOffsetY * focusY;
	ctx.drawImage(image, dx, dy, drawW, drawH);
}

export async function renderSocialBlob(
	image: HTMLImageElement,
	preset: SocialPreset,
	options: SocialDrawOptions,
	mime: 'image/png' | 'image/jpeg' = 'image/png',
	quality = 0.92,
): Promise<Blob> {
	const canvas = document.createElement('canvas');
	canvas.width = preset.width;
	canvas.height = preset.height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas 2D unavailable');
	drawSocialFrame(
		ctx,
		image,
		image.naturalWidth || image.width,
		image.naturalHeight || image.height,
		preset.width,
		preset.height,
		options,
	);
	try {
		return await canvasToBlob(canvas, mime, quality);
	} finally {
		clearCanvas(canvas);
	}
}

export function socialFileName(originalName: string, preset: SocialPreset, ext = 'png'): string {
	return `${stemFromFileName(originalName)}_${preset.width}x${preset.height}.${ext}`;
}

export async function zipSocialResults(
	files: { name: string; blob: Blob }[],
): Promise<Blob> {
	const { default: JSZip } = await import('jszip');
	const zip = new JSZip();
	for (const file of files) {
		zip.file(file.name, file.blob);
		await yieldToMain(0);
	}
	return zip.generateAsync({ type: 'blob' });
}
