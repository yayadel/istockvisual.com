import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CSV_PATH = path.join(ROOT, 'keyword_store', 'kwdata_172-ok.csv');
const TMP_DIR = path.join(ROOT, '.tmp');
const SQL_PATH = path.join(TMP_DIR, 'keywords-import.sql');

const BATCH_SIZE = 500;
const KEYWORD_COL = 2;
const VALUE_COL = 6;

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const remote = args.has('--remote');
const limitArg = [...args].find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity;

function parseCSVLine(line) {
	const out = [];
	let cur = '';
	let inQ = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (c === '"') {
			inQ = !inQ;
			continue;
		}
		if (c === ',' && !inQ) {
			out.push(cur);
			cur = '';
			continue;
		}
		cur += c;
	}
	out.push(cur);
	return out;
}

function escapeSql(value) {
	return value.replace(/'/g, "''");
}

function runWrangler(argsList) {
	const result = spawnSync('npx', ['wrangler', 'd1', ...argsList], {
		cwd: ROOT,
		stdio: 'inherit',
		shell: true,
	});
	if (result.status !== 0) {
		throw new Error(`wrangler d1 ${argsList.join(' ')} failed`);
	}
}

async function main() {
	if (!fs.existsSync(CSV_PATH)) {
		console.error(`CSV not found: ${CSV_PATH}`);
		process.exit(1);
	}

	fs.mkdirSync(TMP_DIR, { recursive: true });
	const sqlStream = fs.createWriteStream(SQL_PATH, { encoding: 'utf8' });

	let total = 0;
	let skippedZero = 0;
	let skippedEmpty = 0;
	let imported = 0;
	let batch = [];

	const flushBatch = () => {
		if (!batch.length) return;
		const values = batch.map((kw) => `('${escapeSql(kw)}')`).join(',\n  ');
		sqlStream.write(
			`INSERT OR IGNORE INTO keyword (keyword) VALUES\n  ${values};\n`,
		);
		imported += batch.length;
		batch = [];
	};

	const rl = readline.createInterface({
		input: fs.createReadStream(CSV_PATH),
		crlfDelay: Infinity,
	});

	for await (const line of rl) {
		total++;
		const cols = parseCSVLine(line);
		const value = Number(cols[VALUE_COL]);
		if (!Number.isFinite(value) || value === 0) {
			skippedZero++;
			continue;
		}

		const keyword = (cols[KEYWORD_COL] ?? '').trim();
		if (!keyword) {
			skippedEmpty++;
			continue;
		}

		batch.push(keyword);
		if (batch.length >= BATCH_SIZE) {
			flushBatch();
		}

		if (imported + batch.length >= limit) {
			break;
		}
	}

	flushBatch();
	await new Promise((resolve, reject) => {
		sqlStream.end((err) => (err ? reject(err) : resolve()));
	});

	console.log(
		JSON.stringify(
			{
				totalRows: total,
				skippedValueZero: skippedZero,
				skippedEmpty,
				toImport: imported,
				sqlFile: SQL_PATH,
				dryRun,
				remote,
			},
			null,
			2,
		),
	);

	if (dryRun) {
		console.log('Dry run complete. SQL file generated but not executed.');
		return;
	}

	const target = remote ? '--remote' : '--local';
	console.log(`Applying migrations (${target})...`);
	runWrangler(['migrations', 'apply', 'istockvisual-db', target]);

	console.log(`Importing keywords (${target})...`);
	runWrangler(['execute', 'istockvisual-db', target, `--file=${SQL_PATH}`]);

	console.log('Import complete.');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
