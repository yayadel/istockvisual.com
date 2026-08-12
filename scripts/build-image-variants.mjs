import sharp from 'sharp';

export const VARIANT_SIZES = [
	{ id: '500', longEdge: 500 },
	{ id: '1k', longEdge: 1024 },
	{ id: '2k', longEdge: 2048 },
	{ id: '4k', longEdge: 4096 },
	{ id: '8k', longEdge: 8192 },
];

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

export async function buildAllJpegVariants(input) {
	const variants = {};
	for (const size of VARIANT_SIZES) {
		const quality = size.id === '8k' ? 82 : size.id === '4k' ? 84 : 86;
		const mode = size.id === '500' ? 'width' : 'inside';
		variants[size.id] = await buildJpegVariant(input, size.longEdge, quality, mode);
	}
	return variants;
}
