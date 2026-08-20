import {
	canvasFromImage,
	compositeCropToCanvas,
	extractKeepFocusCropWithMask,
	keepForegroundTouchingSeeds,
	mapKeepCircleToSource,
	mapPaintMaskToSource,
	type KeepCircle,
} from './image-editor-ops';

const IMGLY_CONFIG = {
	model: 'isnet_fp16' as const,
	fetchArgs: { cache: 'force-cache' as RequestCache },
};

export async function removeImageBackground(source: Blob | HTMLImageElement | string) {
	const { removeBackground, preload } = await import('@imgly/background-removal');
	await preload(IMGLY_CONFIG);
	return removeBackground(source, IMGLY_CONFIG);
}

export function imageToPngBlob(image: HTMLImageElement) {
	const canvas = document.createElement('canvas');
	canvas.width = image.naturalWidth || image.width;
	canvas.height = image.naturalHeight || image.height;
	const ctx = canvas.getContext('2d');
	if (!ctx) return Promise.reject(new Error('Canvas unavailable'));
	ctx.drawImage(image, 0, 0);
	return new Promise<Blob>((resolve, reject) => {
		canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Encode failed'))), 'image/png');
	});
}

function loadWorkingImage(source: Blob | HTMLImageElement | string) {
	if (source instanceof HTMLImageElement) return Promise.resolve(source);
	const img = new Image();
	img.crossOrigin = 'anonymous';
	const url = source instanceof Blob ? URL.createObjectURL(source) : source;
	return new Promise<HTMLImageElement>((resolve, reject) => {
		img.onload = () => {
			if (source instanceof Blob) URL.revokeObjectURL(url);
			resolve(img);
		};
		img.onerror = () => {
			if (source instanceof Blob) URL.revokeObjectURL(url);
			reject(new Error('Failed to load image'));
		};
		img.src = url;
	});
}

function canvasToPngBlob(canvas: HTMLCanvasElement) {
	return new Promise<Blob>((resolve, reject) => {
		canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Encode failed'))), 'image/png');
	});
}

export async function cutoutKeepSubject(options: {
	source: Blob | HTMLImageElement | string;
	keepCircle: KeepCircle;
	frameW: number;
	frameH: number;
	paintCanvas?: HTMLCanvasElement | null;
}) {
	const image = await loadWorkingImage(options.source);
	const sourceW = image.naturalWidth || image.width;
	const sourceH = image.naturalHeight || image.height;
	const working = canvasFromImage(image, sourceW, sourceH);
	const mapped = mapKeepCircleToSource(
		options.keepCircle,
		sourceW,
		sourceH,
		options.frameW,
		options.frameH,
	);
	const paintMask =
		options.paintCanvas && options.paintCanvas.width > 0
			? mapPaintMaskToSource(
					options.paintCanvas,
					sourceW,
					sourceH,
					options.frameW,
					options.frameH,
				)
			: null;
	const { crop, offsetX, offsetY } = extractKeepFocusCropWithMask(
		working,
		mapped.cx,
		mapped.cy,
		mapped.r,
		paintMask,
	);
	const cutoutBlob = await removeImageBackground(crop.toDataURL('image/png'));
	const cutoutUrl = URL.createObjectURL(cutoutBlob);
	try {
		const cutoutImg = await loadWorkingImage(cutoutUrl);
		const cutout = canvasFromImage(
			cutoutImg,
			cutoutImg.naturalWidth || cutoutImg.width,
			cutoutImg.naturalHeight || cutoutImg.height,
		);
		const canvas = compositeCropToCanvas(
			working.width,
			working.height,
			cutout,
			offsetX,
			offsetY,
			crop.width,
			crop.height,
		);
		const r2 = mapped.r * mapped.r;
		const kept = keepForegroundTouchingSeeds(canvas, (x, y) => {
			const dx = x + 0.5 - mapped.cx;
			const dy = y + 0.5 - mapped.cy;
			if (dx * dx + dy * dy <= r2) return true;
			return Boolean(paintMask?.[y * sourceW + x]);
		});
		if (!kept) {
			throw new Error(
				'No subject overlapped the keep circle or brush. Move the circle or paint the subject, then execute again.',
			);
		}
		return canvasToPngBlob(canvas);
	} finally {
		URL.revokeObjectURL(cutoutUrl);
	}
}
