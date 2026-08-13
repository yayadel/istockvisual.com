import { scaleRasterFromImage, yieldToMain } from './tools-shared';

export type VectorColorCount = 2 | 8 | 16 | 64;

export type VectorizeSettings = {
	colors: VectorColorCount;
	/** 0–5 typical */
	blurRadius: number;
	/** Ignore tiny regions (maps to ImageTracer pathomit) */
	minArea: number;
};

export const DEFAULT_VECTORIZE_SETTINGS: VectorizeSettings = {
	colors: 16,
	blurRadius: 0,
	minArea: 8,
};

type ImageTracerApi = {
	imagedataToSVG: (
		imgd: { width: number; height: number; data: Uint8ClampedArray },
		options?: Record<string, unknown>,
	) => string;
};

let tracerPromise: Promise<ImageTracerApi> | null = null;

function loadTracer(): Promise<ImageTracerApi> {
	if (!tracerPromise) {
		tracerPromise = import('imagetracerjs').then((mod) => {
			const api = (mod as { default?: ImageTracerApi }).default ?? (mod as unknown as ImageTracerApi);
			if (!api?.imagedataToSVG) throw new Error('imagetracerjs failed to load');
			return api;
		});
	}
	return tracerPromise;
}

/**
 * Pre-scale to maxEdge, then trace off the main tick via setTimeout so the UI can paint a spinner.
 */
export async function vectorizeBitmap(
	image: HTMLImageElement,
	settings: VectorizeSettings,
	maxEdge = 1200,
): Promise<{ svg: string; width: number; height: number }> {
	const { imageData, width, height } = scaleRasterFromImage(
		image,
		image.naturalWidth || image.width,
		image.naturalHeight || image.height,
		maxEdge,
	);

	await yieldToMain(16);
	const tracer = await loadTracer();
	await yieldToMain(16);

	const svg = await new Promise<string>((resolve, reject) => {
		window.setTimeout(() => {
			try {
				const result = tracer.imagedataToSVG(imageData, {
					numberofcolors: settings.colors,
					blurradius: Math.max(0, Math.min(5, Math.round(settings.blurRadius))),
					pathomit: Math.max(0, Math.round(settings.minArea)),
					ltres: 1,
					qtres: 1,
					scale: 1,
					strokewidth: 0,
					viewbox: true,
					desc: false,
				});
				resolve(result);
			} catch (err) {
				reject(err instanceof Error ? err : new Error('Vectorize failed'));
			}
		}, 0);
	});

	return { svg, width, height };
}

export function svgToBlob(svg: string): Blob {
	return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
}
