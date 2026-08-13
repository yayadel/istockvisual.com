import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadDevVars, slugifyKeyword } from './lib/gemini-node.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const devVars = loadDevVars();
const baseUrl = process.env.GENERATE_BASE_URL || devVars.BETTER_AUTH_URL || 'http://localhost:4325';
const secret =
	process.env.GENERATE_API_SECRET || devVars.GENERATE_API_SECRET || 'dev-generate-secret';
const geminiKey = process.env.GEMINI_API_KEY || devVars.GEMINI_API_KEY || '';
const geminiModel =
	process.env.GEMINI_MODEL || devVars.GEMINI_MODEL || 'gemini-3.6-flash';

const keywordIdArg = Number(process.argv[2]);
const tmpDir = path.join(root, '.tmp');
fs.mkdirSync(tmpDir, { recursive: true });

let keywordId = Number.isFinite(keywordIdArg) && keywordIdArg > 0 ? keywordIdArg : null;
let keyword = '';
let claimedByThisRun = false;

if (!keywordId) {
	const prepareRes = await fetch(`${baseUrl}/api/generate/prepare`, {
		method: 'POST',
		headers: {
			'x-generate-secret': secret,
			Origin: baseUrl,
			'Content-Type': 'application/json',
		},
	});
	const prepared = await prepareRes.json();
	if (!prepareRes.ok) {
		console.error(prepared.error || 'Prepare failed');
		process.exit(1);
	}
	keywordId = prepared.keywordId;
	keyword = prepared.keyword;
	claimedByThisRun = true;
} else {
	keyword = process.argv[3] || '';
	if (!keyword) {
		console.error('Usage: npm run agent:meta');
		console.error('   or: node scripts/agent-meta.mjs <keywordId> "<keyword>"');
		process.exit(1);
	}
}

if (!geminiKey) {
	console.error('GEMINI_API_KEY missing in .dev.vars');
	process.exit(1);
}

const metaPath = path.join(tmpDir, `meta-${slugifyKeyword(keyword)}.json`);
const pyScript = path.join(root, 'scripts', 'gemini_meta.py');

console.error(`Generating metadata with Gemini Interactions (${geminiModel}) for: ${keyword}`);

const env = {
	...process.env,
	GEMINI_API_KEY: geminiKey,
	GEMINI_MODEL: geminiModel,
	GEMINI_THINKING_LEVEL:
		process.env.GEMINI_THINKING_LEVEL || devVars.GEMINI_THINKING_LEVEL || 'medium',
};
if (devVars.HTTPS_PROXY && !env.HTTPS_PROXY) env.HTTPS_PROXY = devVars.HTTPS_PROXY;
if (devVars.HTTP_PROXY && !env.HTTP_PROXY) env.HTTP_PROXY = devVars.HTTP_PROXY;

const py = spawnSync('python', [pyScript, keyword, '--out', metaPath], {
	cwd: root,
	env,
	encoding: 'utf8',
	maxBuffer: 16 * 1024 * 1024,
});

if (py.status !== 0) {
	console.error(py.stderr || py.stdout || 'gemini_meta.py failed');
	if (claimedByThisRun && keywordId) {
		await fetch(`${baseUrl}/api/generate/release`, {
			method: 'POST',
			headers: {
				'x-generate-secret': secret,
				Origin: baseUrl,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ keywordId }),
		}).catch(() => undefined);
	}
	process.exit(py.status || 1);
}

if (py.stderr) console.error(py.stderr.trim());

let meta;
try {
	meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
} catch {
	console.error('Failed to read generated meta JSON');
	process.exit(1);
}

if (!meta?.imagePrompt) {
	console.error('Gemini JSON missing imagePrompt');
	process.exit(1);
}

const categoriesPath = path.join(root, 'categories');
const allowed = fs
	.readFileSync(categoriesPath, 'utf8')
	.split(',')
	.map((item) => item.trim())
	.filter(Boolean);
const allowedMap = new Map(allowed.map((item) => [item.toLowerCase(), item]));
const contentCategories = [];
for (const value of meta.contentCategories || []) {
	const matched = allowedMap.get(String(value || '').trim().toLowerCase());
	if (!matched || contentCategories.includes(matched)) continue;
	contentCategories.push(matched);
	if (contentCategories.length >= 1) break;
}
if (contentCategories.length === 0) {
	console.error('Gemini JSON missing valid contentCategories (exactly 1 from /categories)');
	process.exit(1);
}
meta.contentCategories = contentCategories.slice(0, 1);
meta.depictedElements = [];
fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

const relativeMeta = path.relative(root, metaPath).replaceAll('\\', '/');
console.log(
	JSON.stringify(
		{
			ok: true,
			provider: 'gemini-interactions',
			model: geminiModel,
			keywordId,
			keyword,
			metaPath: relativeMeta,
			imagePageTitle: meta.imagePageTitle,
			contentCategories: meta.contentCategories,
			imagePrompt: meta.imagePrompt,
			next: [
				'Generate ONE image from imagePrompt (do not batch).',
				`Import: node scripts/agent-import.mjs ${relativeMeta} <image.jpg> ${keywordId} [w] [h]`,
			],
		},
		null,
		2,
	),
);
