import fs from 'node:fs';
import path from 'node:path';
import { buildAllJpegVariants } from './build-image-variants.mjs';

const baseUrl = process.env.GENERATE_BASE_URL || 'http://localhost:4325';
const secret = process.env.GENERATE_API_SECRET || 'dev-generate-secret';

const metaPath = process.argv[2];
const imagePath = process.argv[3];
const keywordId = Number(process.argv[4]);

if (!metaPath || !imagePath || !Number.isFinite(keywordId)) {
	console.error('Usage: node scripts/agent-import.mjs <meta.json> <image.jpg> <keywordId> [width] [height]');
	process.exit(1);
}

const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
const imageBuffer = fs.readFileSync(imagePath);
const ext = path.extname(imagePath).toLowerCase();
const fileType =
	ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

const res = await fetch(`${baseUrl}/api/generate/import`, {
	method: 'POST',
	headers: {
		'x-generate-secret': secret,
		Origin: baseUrl,
		'Content-Type': 'application/json',
	},
	body: JSON.stringify({
		keywordId,
		meta,
		imageBase64: imageBuffer.toString('base64'),
		fileType,
		width: Number(process.argv[5]) || undefined,
		height: Number(process.argv[6]) || undefined,
	}),
});

const data = await res.json();
if (!res.ok) {
	console.error(data.error || 'Import failed');
	process.exit(1);
}

const assetId = data.asset?.id;
if (assetId) {
	console.log('Building 500 / 1K / 2K / 4K / 8K with Sharp…');
	const variants = await buildAllJpegVariants(imageBuffer);
	for (const [sizeId, buffer] of Object.entries(variants)) {
		const variantRes = await fetch(`${baseUrl}/api/generate/variants`, {
			method: 'POST',
			headers: {
				'x-generate-secret': secret,
				Origin: baseUrl,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				assetId,
				sizeId,
				imageBase64: buffer.toString('base64'),
			}),
		});
		const variantData = await variantRes.json();
		if (!variantRes.ok) {
			console.error(`Variant ${sizeId} failed:`, variantData.error || variantRes.status);
		} else {
			console.log(`  ${sizeId}: ${variantData.bytes} bytes`);
		}
	}
}

console.log(JSON.stringify(data, null, 2));
