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
function parseCli(argv) {
	const flags = {};
	const positional = [];
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (!arg.startsWith('--')) {
			positional.push(arg);
			continue;
		}
		const eq = arg.indexOf('=');
		const key = (eq === -1 ? arg.slice(2) : arg.slice(2, eq)).toLowerCase();
		if (eq !== -1) {
			flags[key] = arg.slice(eq + 1);
			continue;
		}
		const next = argv[i + 1];
		if (next && !next.startsWith('--')) {
			flags[key] = next;
			i += 1;
		} else {
			flags[key] = '1';
		}
	}
	return { flags, positional };
}

const { flags, positional } = parseCli(process.argv.slice(2));
const providerRaw = String(
	flags.provider || process.env.META_PROVIDER || devVars.META_PROVIDER || 'gemini',
).toLowerCase();
const provider =
	providerRaw === 'together' || providerRaw === 'gemma' || providerRaw === 'gemma4'
		? 'together'
		: 'gemini';

const geminiKey = process.env.GEMINI_API_KEY || devVars.GEMINI_API_KEY || '';
const geminiModel =
	process.env.GEMINI_MODEL || devVars.GEMINI_MODEL || 'gemini-3.6-flash';
const togetherKey = process.env.TOGETHER_API_KEY || devVars.TOGETHER_API_KEY || '';
const togetherModel =
	process.env.TOGETHER_MODEL || devVars.TOGETHER_MODEL || 'google/gemma-4-31B-it';

const keywordIdArg = Number(positional[0]);
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
	keyword = positional[1] || '';
	if (!keyword) {
		console.error('Usage: npm run agent:meta');
		console.error('   or: npm run agent:meta:gemma');
		console.error('   or: node scripts/agent-meta.mjs [--provider gemini|together] <keywordId> "<keyword>"');
		process.exit(1);
	}
}

if (provider === 'gemini' && !geminiKey) {
	console.error('GEMINI_API_KEY missing in .dev.vars');
	process.exit(1);
}
if (provider === 'together' && !togetherKey) {
	console.error('TOGETHER_API_KEY missing in .dev.vars');
	process.exit(1);
}

const metaPath = path.join(tmpDir, `meta-${slugifyKeyword(keyword)}.json`);
const pyScript = path.join(
	root,
	'scripts',
	provider === 'together' ? 'gemma_meta.py' : 'gemini_meta.py',
);
const modelLabel = provider === 'together' ? togetherModel : geminiModel;
const providerLabel = provider === 'together' ? 'Together Gemma 4' : 'Gemini Interactions';

console.error(`Generating metadata with ${providerLabel} (${modelLabel}) for: ${keyword}`);

const env = { ...process.env };
if (provider === 'together') {
	env.TOGETHER_API_KEY = togetherKey;
	env.TOGETHER_MODEL = togetherModel;
} else {
	env.GEMINI_API_KEY = geminiKey;
	env.GEMINI_MODEL = geminiModel;
	env.GEMINI_THINKING_LEVEL =
		process.env.GEMINI_THINKING_LEVEL || devVars.GEMINI_THINKING_LEVEL || 'low';
}
if (devVars.HTTPS_PROXY && !env.HTTPS_PROXY) env.HTTPS_PROXY = devVars.HTTPS_PROXY;
if (devVars.HTTP_PROXY && !env.HTTP_PROXY) env.HTTP_PROXY = devVars.HTTP_PROXY;

const py = spawnSync('python', [pyScript, keyword, '--out', metaPath], {
	cwd: root,
	env,
	encoding: 'utf8',
	maxBuffer: 16 * 1024 * 1024,
});

if (py.status !== 0) {
	console.error(py.stderr || py.stdout || `${path.basename(pyScript)} failed`);
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
const usagePath = metaPath.replace(/\.json$/i, '.usage.json');
let usage = null;
if (fs.existsSync(usagePath)) {
	try {
		usage = JSON.parse(fs.readFileSync(usagePath, 'utf8'));
	} catch {
		usage = null;
	}
}
console.log(
	JSON.stringify(
		{
			ok: true,
			provider: provider === 'together' ? 'together-gemma' : 'gemini-interactions',
			model: modelLabel,
			keywordId,
			keyword,
			metaPath: relativeMeta,
			usage,
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
