import fs from 'node:fs';
import { buildPreviewJpeg, masterJpegInfo } from './build-image-variants.mjs';
import { resolveGenerateEnv } from './lib/generate-env.mjs';

const { baseUrl, secret } = resolveGenerateEnv();
if (!secret) {
	console.error('GENERATE_API_SECRET missing (Cloud: Cursor Secrets; local: .dev.vars)');
	process.exit(1);
}

const metaPath = process.argv[2];
const imagePath = process.argv[3];
const keywordId = Number(process.argv[4]);

if (!metaPath || !imagePath || !Number.isFinite(keywordId)) {
	console.error('Usage: node scripts/agent-import.mjs <meta.json> <image.jpg> <keywordId>');
	process.exit(1);
}

const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
const imageBuffer = fs.readFileSync(imagePath);

console.log('Building 4K master JPEG with Sharp…');
const master = await masterJpegInfo(imageBuffer);
console.log(`  4K: ${master.width}×${master.height}, ${master.buffer.length} bytes`);

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
		imageBase64: master.buffer.toString('base64'),
		fileType: 'image/jpeg',
		width: master.width,
		height: master.height,
	}),
});

const data = await res.json();
if (!res.ok) {
	console.error(data.error || 'Import failed');
	process.exit(1);
}

const assetId = data.asset?.id;
if (assetId) {
	console.log('Building JPEG display preview…');
	const preview = await buildPreviewJpeg(imageBuffer);
	const previewRes = await fetch(`${baseUrl}/api/generate/variants`, {
		method: 'POST',
		headers: {
			'x-generate-secret': secret,
			Origin: baseUrl,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			assetId,
			sizeId: 'preview',
			imageBase64: preview.toString('base64'),
		}),
	});
	const previewData = await previewRes.json();
	if (!previewRes.ok) {
		console.error('Preview failed:', previewData.error || previewRes.status);
	} else {
		console.log(`  preview: ${preview.length} bytes → ${previewData.key}`);
	}
}

console.log(JSON.stringify(data, null, 2));
