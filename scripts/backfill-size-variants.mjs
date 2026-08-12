import { buildAllJpegVariants } from './build-image-variants.mjs';

const baseUrl = process.env.GENERATE_BASE_URL || 'http://localhost:4325';
const secret = process.env.GENERATE_API_SECRET || 'dev-generate-secret';

const listRes = await fetch(`${baseUrl}/api/admin/content`);
// Fallback: caller passes asset ids. Query via wrangler is more reliable for local.

const ids = process.argv.slice(2);
if (ids.length === 0) {
	console.error('Usage: node scripts/backfill-size-variants.mjs <assetId> [assetId...]');
	process.exit(1);
}

for (const assetId of ids) {
	console.log(`\n${assetId}`);
	const preview = await fetch(`${baseUrl}/api/preview/${assetId}`);
	if (!preview.ok) {
		console.error(`  preview failed: ${preview.status}`);
		continue;
	}
	const original = Buffer.from(await preview.arrayBuffer());
	const variants = await buildAllJpegVariants(original);
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
			console.error(`  ${sizeId} failed:`, variantData.error || variantRes.status);
		} else {
			console.log(`  ${sizeId}: ${variantData.bytes} bytes -> ${variantData.key}`);
		}
	}
}
