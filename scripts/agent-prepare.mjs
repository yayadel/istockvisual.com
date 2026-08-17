import { resolveGenerateEnv } from './lib/generate-env.mjs';
import {
	createKeywordBatch,
	pendingCount,
	resolveBatchPath,
} from './lib/keyword-batch.mjs';

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

const count = Math.max(1, Number(flags.count || flags.n || positional[0] || 1) || 1);
const batchPath = resolveBatchPath(
	flags['batch-file'] || flags.batchfile || positional[1] || '',
);

const res = await fetch(`${baseUrl}/api/generate/prepare`, {
	method: 'POST',
	headers: {
		'x-generate-secret': secret,
		Origin: baseUrl,
		'Content-Type': 'application/json',
	},
	body: JSON.stringify({ count }),
});

const data = await res.json();
if (!res.ok) {
	console.error(data.error || 'Prepare failed');
	process.exit(1);
}

const keywords = Array.isArray(data.keywords) && data.keywords.length
	? data.keywords
	: data.keywordId
		? [{ keywordId: data.keywordId, keyword: data.keyword }]
		: [];

if (!keywords.length) {
	console.error('Prepare returned no keywords');
	process.exit(1);
}

const saved = createKeywordBatch(
	{
		batchId: data.batchId || data.lockBatchId || crypto.randomUUID(),
		baseUrl,
		keywords,
	},
	batchPath,
);

console.log(
	JSON.stringify(
		{
			ok: true,
			baseUrl,
			batchId: saved.batch.batchId,
			count: saved.batch.count,
			pending: pendingCount(saved.batch),
			batchFile: saved.path.replaceAll('\\', '/'),
			keywords: saved.batch.keywords,
			next: [
				'Process one keyword at a time from the batch file.',
				'npm run agent:meta:gemma   # takes next pending from batch',
				'Generate ONE image, then agent-import.mjs …',
				`Optional release whole batch: POST /api/generate/release { "batchId": "${saved.batch.batchId}" }`,
			],
		},
		null,
		2,
	),
);
