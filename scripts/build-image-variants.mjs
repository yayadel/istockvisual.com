import sharp from 'sharp';

export const MASTER_LONG_EDGE = 4096;

/** Listing / detail display WEBP. Not used for paid downloads. */
export const PREVIEW_LONG_EDGE = 1280;

export async function buildJpegVariant(input, longEdge, quality = 86, mode = 'inside') {
	const resize =
		mode === 'width'
			? { width: longEdge, withoutEnlargement: false, kernel: 'lanczos3' }
			: {
					width: longEdge,
					height: longEdge,
					fit: 'inside',
					withoutEnlargement: false,
					kernel: 'lanczos3',
				};
	return sharp(input, { failOn: 'none' })
		.resize(resize)
		.sharpen({ sigma: 0.55, m1: 0.6, m2: 0.3 })
		.jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:4:4' })
		.toBuffer();
}

/** Single stored file: 4K JPEG. Other sizes are drawn in the browser. */
export async function buildMasterJpeg(input) {
	return buildJpegVariant(input, MASTER_LONG_EDGE, 84, 'inside');
}

export async function masterJpegInfo(input) {
	const buffer = await buildMasterJpeg(input);
	const meta = await sharp(buffer).metadata();
	return {
		buffer,
		width: meta.width || MASTER_LONG_EDGE,
		height: meta.height || MASTER_LONG_EDGE,
	};
}

export async function buildPreviewWebp(input) {
	return sharp(input, { failOn: 'none' })
		.resize({
			width: PREVIEW_LONG_EDGE,
			height: PREVIEW_LONG_EDGE,
			fit: 'inside',
			withoutEnlargement: false,
			kernel: 'lanczos3',
		})
		.webp({ quality: 78, effort: 4 })
		.toBuffer();
}
