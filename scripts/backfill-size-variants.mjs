import { execSync } from 'node:child_process';
import { masterJpegInfo } from './build-image-variants.mjs';

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

console.log(`Compacting ${assetIds.length} asset(s) to a single 4K master…`);

for (const assetId of assetIds) {
	console.log(`\n${assetId}`);
	const preview = await fetch(`${baseUrl}/api/preview/${assetId}`);
	if (!preview.ok) {
		console.error(`  preview failed: ${preview.status}`);
		continue;
	}

	const original = Buffer.from(await preview.arrayBuffer());
	const master = await masterJpegInfo(original);
	console.log(`  4K ${master.width}×${master.height} ${master.buffer.length} bytes`);

	const variantRes = await fetch(`${baseUrl}/api/generate/variants`, {
		method: 'POST',
		headers: {
			'x-generate-secret': secret,
			Origin: baseUrl,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			assetId,
			sizeId: '4k',
			imageBase64: master.buffer.toString('base64'),
			width: master.width,
			height: master.height,
		}),
	});
	const variantData = await variantRes.json();
	if (!variantRes.ok) {
		console.error(`  master failed:`, variantData.error || variantRes.status);
		continue;
	}
	console.log(`  stored ${variantData.key} (${variantData.bytes} bytes)`);
	console.log(`  deleted ${variantData.deleted?.length ?? 0} variant keys`);
}

console.log('\nPurging leftover generated/ variants and unreferenced keys…');
const purgeRes = await fetch(`${baseUrl}/api/generate/variants`, {
	method: 'POST',
	headers: {
		'x-generate-secret': secret,
		Origin: baseUrl,
		'Content-Type': 'application/json',
	},
	body: JSON.stringify({ purge: true }),
});
const purgeData = await purgeRes.json();
if (!purgeRes.ok) {
	console.error('purge failed:', purgeData.error || purgeRes.status);
	process.exit(1);
}
console.log(`deleted ${purgeData.deleted?.length ?? 0} leftover objects`);
console.log(`kept ${purgeData.kept?.length ?? 0} masters`);
