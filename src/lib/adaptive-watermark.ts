const LABEL = 'iStockVisual';
const TILE_W = 224;
const TILE_H = 142;
const FONT_SIZE = 21;
const ANGLE = (-32 * Math.PI) / 180;
const LUMA_DIV = 8;
const LUMA_SPLIT = 138;
const FILL_DARK = { r: 16, g: 16, b: 16, a: 158 };
const FILL_LIGHT = { r: 255, g: 255, b: 255, a: 168 };
const HALO_DARK = { r: 8, g: 8, b: 8, a: 92 };
const HALO_LIGHT = { r: 255, g: 255, b: 255, a: 80 };

export type ImageContentRect = {
	x: number;
	y: number;
	width: number;
	height: number;
};

/** Painted image box inside an <img> that uses object-fit: contain. */
export function imageContentRect(img: HTMLImageElement): ImageContentRect {
	const nw = img.naturalWidth || 1;
	const nh = img.naturalHeight || 1;
	const bw = img.clientWidth;
	const bh = img.clientHeight;
	const scale = Math.min(bw / nw, bh / nh);
	const width = nw * scale;
	const height = nh * scale;
	return {
		x: (bw - width) / 2,
		y: (bh - height) / 2,
		width,
		height,
	};
}

function paintTiledText(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	dpr: number,
	mode: 'fill' | 'stroke',
) {
	const tileW = TILE_W * dpr;
	const tileH = TILE_H * dpr;
	ctx.font = `750 ${FONT_SIZE * dpr}px Arial, sans-serif`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = '#fff';
	ctx.strokeStyle = '#fff';
	ctx.lineJoin = 'round';
	ctx.lineCap = 'round';
	ctx.lineWidth = Math.max(2, 2.4 * dpr);

	for (let y = -tileH; y < height + tileH; y += tileH) {
		for (let x = -tileW; x < width + tileW; x += tileW) {
			ctx.save();
			ctx.translate(x + tileW / 2, y + tileH * 0.54);
			ctx.rotate(ANGLE);
			if (mode === 'stroke') ctx.strokeText(LABEL, 0, 0);
			else ctx.fillText(LABEL, 0, 0);
			ctx.restore();
		}
	}
}

/**
 * Draw a tiled watermark whose ink flips with local image luminance:
 * light regions → dark type, dark regions → light type, plus a reverse halo
 * so mid-grey and mixed edges stay readable.
 */
export function paintAdaptiveWatermark(
	dest: HTMLCanvasElement,
	source: CanvasImageSource,
	cssWidth: number,
	cssHeight: number,
): boolean {
	if (cssWidth < 8 || cssHeight < 8) return false;

	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	const width = Math.max(1, Math.round(cssWidth * dpr));
	const height = Math.max(1, Math.round(cssHeight * dpr));
	dest.width = width;
	dest.height = height;
	dest.style.width = `${cssWidth}px`;
	dest.style.height = `${cssHeight}px`;

	const lumaW = Math.max(1, Math.ceil(width / LUMA_DIV));
	const lumaH = Math.max(1, Math.ceil(height / LUMA_DIV));
	const lumaCanvas = document.createElement('canvas');
	lumaCanvas.width = lumaW;
	lumaCanvas.height = lumaH;
	const lumaCtx = lumaCanvas.getContext('2d', { willReadFrequently: true });
	if (!lumaCtx) return false;

	let lumaData: ImageData;
	try {
		lumaCtx.drawImage(source, 0, 0, lumaW, lumaH);
		lumaData = lumaCtx.getImageData(0, 0, lumaW, lumaH);
	} catch {
		return false;
	}

	const mask = document.createElement('canvas');
	mask.width = width;
	mask.height = height;
	const maskCtx = mask.getContext('2d', { willReadFrequently: true });
	if (!maskCtx) return false;
	paintTiledText(maskCtx, width, height, dpr, 'fill');
	const core = maskCtx.getImageData(0, 0, width, height).data;

	maskCtx.clearRect(0, 0, width, height);
	paintTiledText(maskCtx, width, height, dpr, 'stroke');
	const halo = maskCtx.getImageData(0, 0, width, height).data;

	const outCtx = dest.getContext('2d');
	if (!outCtx) return false;
	const out = outCtx.createImageData(width, height);
	const px = out.data;
	const luma = lumaData.data;

	for (let p = 0, i = 0; p < width * height; p += 1, i += 4) {
		const coreA = core[i];
		const haloA = halo[i];
		if (coreA < 10 && haloA < 10) continue;

		const x = p % width;
		const y = (p / width) | 0;
		const li = (((y / LUMA_DIV) | 0) * lumaW + ((x / LUMA_DIV) | 0)) * 4;
		const lum = luma[li] * 0.2126 + luma[li + 1] * 0.7152 + luma[li + 2] * 0.0722;
		const lightBg = lum >= LUMA_SPLIT;
		const ink = coreA >= 10 ? (lightBg ? FILL_DARK : FILL_LIGHT) : lightBg ? HALO_LIGHT : HALO_DARK;
		const coverage = (coreA >= 10 ? coreA : haloA) / 255;
		px[i] = ink.r;
		px[i + 1] = ink.g;
		px[i + 2] = ink.b;
		px[i + 3] = Math.round(ink.a * coverage);
	}

	outCtx.putImageData(out, 0, 0);
	return true;
}
