import { execSync } from 'node:child_process';
import { buildPreviewAvif } from './build-image-variants.mjs';

const baseUrl = process.env.GENERATE_BASE_URL || 'http://localhost:4325';
const secret = process.env.GENERATE_API_SECRET || 'dev-generate-secret';

function listLocalAssetIds() {
	const raw = execSync(
		'npx wrangler d1 execute istockvisual-db --local --json --command "SELECT id FROM generated_asset"',
		{ encoding: 'utf8' },
	);
	const start = raw.indexOf('[');
	const parsed = JSON.parse(raw.slice(start));
	const rows = parsed[0]?.results ?? parsed.results ?? [];
	return rows.map((row) => String(row.id)).filter(Boolean);
}

const ids = process.argv.slice(2);
const assetIds = ids.length > 0 ? ids : listLocalAssetIds();

if (assetIds.length === 0) {
	console.error('No generated assets found.');
	process.exit(1);
}

console.log(`Building AVIF display previews for ${assetIds.length} asset(s)…`);

for (const assetId of assetIds) {
	console.log(`\n${assetId}`);
	const source = await fetch(`${baseUrl}/api/preview/${assetId}`);
	if (!source.ok) {
		console.error(`  source failed: ${source.status}`);
		continue;
	}

	const original = Buffer.from(await source.arrayBuffer());
	const preview = await buildPreviewWebp(original);
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
		console.error(`  preview failed:`, previewData.error || previewRes.status);
		continue;
	}
	console.log(`  ${preview.length} bytes → ${previewData.key}`);
}
