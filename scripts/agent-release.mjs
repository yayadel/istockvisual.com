import { resolveGenerateEnv } from './lib/generate-env.mjs';
import { readKeywordBatch, resolveBatchPath } from './lib/keyword-batch.mjs';

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
const { baseUrl, secret } = resolveGenerateEnv();
if (!secret) {
	console.error('GENERATE_API_SECRET missing (Cloud: Cursor Secrets; local: .dev.vars GENERATE_API_SECRET_REMOTE)');
	process.exit(1);
}

const batchPath = resolveBatchPath(flags['batch-file'] || flags.batchfile || '');
const localBatch = readKeywordBatch(batchPath);
const batchId = String(flags.batchid || flags['batch-id'] || positional[0] || localBatch?.batchId || '').trim();
const keywordId = Number(flags.keywordid || flags['keyword-id'] || flags.id || 0);

const body = batchId
	? { batchId }
	: Number.isFinite(keywordId) && keywordId > 0
		? { keywordId }
		: null;

if (!body) {
	console.error('Usage: npm run agent:release -- [--batch-id <uuid>] [--keyword-id <id>]');
	console.error('Uses .tmp/keyword-batch.json batchId when no args are given.');
	process.exit(1);
}

const res = await fetch(`${baseUrl}/api/generate/release`, {
	method: 'POST',
	headers: {
		'x-generate-secret': secret,
		Origin: baseUrl,
		'Content-Type': 'application/json',
	},
	body: JSON.stringify(body),
});

const data = await res.json();
if (!res.ok) {
	console.error(data.error || 'Release failed');
	process.exit(1);
}

console.log(JSON.stringify({ ok: true, baseUrl, ...data }, null, 2));
