#!/usr/bin/env node
/** Normalize generated_asset.tags on D1 using stock indexing rules. */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveGenerateEnv } from './lib/generate-env.mjs';
import { sanitizeStockTags } from './lib/stock-tags.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { production, devVars } = resolveGenerateEnv();

function parseArgs(argv) {
	const out = {
		id: '',
		slug: '',
		limit: 1,
		apply: false,
		all: false,
	};
	for (const arg of argv) {
		if (arg === '--apply') out.apply = true;
		else if (arg === '--all') {
			out.all = true;
			out.limit = 0;
		} else if (arg.startsWith('--id=')) out.id = arg.slice(5).trim();
		else if (arg.startsWith('--slug=')) out.slug = arg.slice(7).trim();
		else if (arg.startsWith('--limit=')) out.limit = Math.max(0, Number(arg.slice(8)) || 1);
	}
	if (out.all) out.limit = 0;
	return out;
}

function sqlString(value) {
	return `'${String(value).replace(/'/g, "''")}'`;
}

function d1Query(sql) {
	const flag = production ? '--remote' : '--local';
	const env = {
		...process.env,
		CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN || devVars.CLOUDFLARE_API_TOKEN || '',
		CLOUDFLARE_ACCOUNT_ID:
			process.env.CLOUDFLARE_ACCOUNT_ID || devVars.CLOUDFLARE_ACCOUNT_ID || '',
	};
	const commandArg = sql.replace(/"/g, '\\"');
	const raw = execSync(
		`npx wrangler d1 execute istockvisual-db ${flag} --json --command "${commandArg}"`,
		{
			encoding: 'utf8',
			env,
			maxBuffer: 64 * 1024 * 1024,
		},
	);
	const start = raw.indexOf('[');
	const parsed = JSON.parse(raw.slice(start));
	return parsed[0]?.results ?? parsed.results ?? [];
}

function parseTags(raw) {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.map(String) : [];
	} catch {
		return [];
	}
}

function listAssets({ id, slug, limit }) {
	const clauses = [];
	if (id) clauses.push(`id = ${sqlString(id)}`);
	if (slug) clauses.push(`slug LIKE ${sqlString(`%${slug}%`)}`);
	const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
	const limitSql = limit > 0 ? `LIMIT ${limit}` : '';
	return d1Query(
		`SELECT id, slug, title, keyword, tags FROM generated_asset ${where} ORDER BY publishedAt DESC ${limitSql}`,
	);
}

function updateTags(id, tags) {
	const json = JSON.stringify(tags);
	d1Query(`UPDATE generated_asset SET tags = ${sqlString(json)} WHERE id = ${sqlString(id)}`);
}

function printDiff(row, nextTags) {
	const before = parseTags(row.tags);
	console.log(`\n${row.id}`);
	console.log(`  title:   ${row.title}`);
	console.log(`  keyword: ${row.keyword}`);
	console.log(`  slug:    ${row.slug}`);
	console.log(`  before (${before.length}): ${before.join(' | ')}`);
	console.log(`  after  (${nextTags.length}): ${nextTags.join(' | ')}`);
	const removed = before.filter((tag) => !nextTags.some((item) => item.toLowerCase() === tag.toLowerCase()));
	const added = nextTags.filter((tag) => !before.some((item) => item.toLowerCase() === tag.toLowerCase()));
	if (removed.length) console.log(`  removed: ${removed.join(' | ')}`);
	if (added.length) console.log(`  added:   ${added.join(' | ')}`);
}

const args = parseArgs(process.argv.slice(2));
const rows = listAssets(args);

if (rows.length === 0) {
	console.error('No assets matched.');
	process.exit(1);
}

const report = [];
for (const row of rows) {
	const before = parseTags(row.tags);
	const after = sanitizeStockTags(before, { title: row.title, keyword: row.keyword });
	printDiff(row, after);
	report.push({ id: row.id, slug: row.slug, before, after, changed: JSON.stringify(before) !== JSON.stringify(after) });
	if (args.apply && JSON.stringify(before) !== JSON.stringify(after)) {
		updateTags(row.id, after);
		console.log('  -> updated on D1');
	}
}

const changedCount = report.filter((item) => item.changed).length;
console.log(`\nMatched ${rows.length}; would change ${changedCount}.`);
if (!args.apply) {
	console.log('Dry run only. Re-run with --apply to write changes.');
} else {
	console.log(`Applied ${changedCount} update(s) to ${production ? 'remote' : 'local'} D1.`);
}

fs.mkdirSync(path.join(root, '.tmp'), { recursive: true });
fs.writeFileSync(
	path.join(root, '.tmp', 'tag-normalize-preview.json'),
	`${JSON.stringify({ at: new Date().toISOString(), apply: args.apply, report }, null, 2)}\n`,
);
