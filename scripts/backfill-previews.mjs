import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPreviewJpeg } from './build-image-variants.mjs';
import { resolveGenerateEnv } from './lib/generate-env.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const progressPath = path.join(root, '.tmp', 'preview-jpg-backfill.json');
const concurrency = Math.max(1, Number(process.env.PREVIEW_BACKFILL_CONCURRENCY || 3));
const { baseUrl, secret, production, devVars } = resolveGenerateEnv();

if (!secret) {
	console.error('GENERATE_API_SECRET missing');
	process.exit(1);
}

function loadProgress() {
	try {
		const parsed = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
		return new Set(Array.isArray(parsed.done) ? parsed.done.map(String) : []);
	} catch {
		return new Set();
	}
}

let progressWrite = Promise.resolve();

function saveProgress(done) {
	progressWrite = progressWrite.then(() => {
		fs.mkdirSync(path.dirname(progressPath), { recursive: true });
		fs.writeFileSync(progressPath, `${JSON.stringify({ done: [...done] }, null, 2)}\n`);
	});
	return progressWrite;
}

function listAssetIds() {
	const flag = production ? '--remote' : '--local';
	const env = {
		...process.env,
		CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN || devVars.CLOUDFLARE_API_TOKEN || '',
		CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || devVars.CLOUDFLARE_ACCOUNT_ID || '',
	};
	const raw = execSync(
		`npx wrangler d1 execute istockvisual-db ${flag} --json --command "SELECT id FROM generated_asset"`,
		{ encoding: 'utf8', env, maxBuffer: 32 * 1024 * 1024 },
	);
	const start = raw.indexOf('[');
	const parsed = JSON.parse(raw.slice(start));
	const rows = parsed[0]?.results ?? parsed.results ?? [];
	return rows.map((row) => String(row.id)).filter(Boolean);
}

async function alreadyHasJpegPreview(assetId) {
	const url = `${baseUrl}/preview/${encodeURIComponent(assetId)}_1000w.jpg`;
	const res = await fetch(url, { method: 'HEAD' });
	if (!res.ok) return false;
	const type = (res.headers.get('content-type') || '').toLowerCase();
	const cache = res.headers.get('cache-control') || '';
	return type.includes('image/jpeg') && cache.includes('31536000');
}

async function convertOne(assetId) {
	if (await alreadyHasJpegPreview(assetId)) {
		return 'skip';
	}

	const source = await fetch(`${baseUrl}/api/preview/${encodeURIComponent(assetId)}`);
	if (!source.ok) {
		throw new Error(`source ${source.status}`);
	}

	const original = Buffer.from(await source.arrayBuffer());
	const preview = await buildPreviewJpeg(original);
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
		throw new Error(previewData.error || `upload ${previewRes.status}`);
	}
	return `${preview.length} bytes → ${previewData.key}`;
}

const ids = process.argv.filter((arg) => !arg.startsWith('--')).slice(2);
const assetIds = ids.length > 0 ? ids : listAssetIds();

if (assetIds.length === 0) {
	console.error('No generated assets found.');
	process.exit(1);
}

const done = loadProgress();
const queue = assetIds.filter((id) => !done.has(id));
let ok = 0;
let skipped = 0;
let failed = 0;

console.log(
	`Converting ${queue.length} of ${assetIds.length} display previews to JPEG on ${baseUrl} (concurrency ${concurrency})…`,
);

let cursor = 0;
async function worker() {
	while (cursor < queue.length) {
		const index = cursor++;
		const assetId = queue[index];
		process.stdout.write(`[${index + 1}/${queue.length}] ${assetId} `);
		try {
			const result = await convertOne(assetId);
			done.add(assetId);
			await saveProgress(done);
			if (result === 'skip') {
				skipped += 1;
				console.log('already jpeg');
			} else {
				ok += 1;
				console.log(result);
			}
		} catch (error) {
			failed += 1;
			console.log(`failed: ${error instanceof Error ? error.message : error}`);
		}
	}
}

await Promise.all(Array.from({ length: Math.min(concurrency, queue.length || 1) }, () => worker()));

console.log(`\nDone. converted=${ok} skipped=${skipped} failed=${failed} remaining_queue=${queue.length - ok - skipped - failed}`);
if (failed) process.exit(1);
