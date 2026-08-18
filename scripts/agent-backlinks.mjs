import { loadDevVars } from './lib/gemini-node.mjs';
import {
	automatableTargets,
	getTarget,
	loadCatalog,
	loadStatus,
	openUrl,
	pendingTargets,
	resolveDevtoKey,
	resolveGithubToken,
	setTargetStatus,
	sortedTargets,
	submitDevto,
	submitGithubPr,
	targetState,
	writeAllPackets,
	writePacket,
} from './lib/backlinks.mjs';

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

function flagOn(flags, name) {
	const value = flags[name];
	return value === '1' || value === 'true' || value === true;
}

const { flags, positional } = parseCli(process.argv.slice(2));
const command = (positional[0] || 'list').toLowerCase();
const catalog = loadCatalog();
const devVars = loadDevVars();

function printList() {
	const status = loadStatus();
	console.log(`Brand: ${catalog.brand}`);
	console.log(`Site: ${catalog.site}`);
	console.log('');
	for (const target of sortedTargets(catalog)) {
		const state = targetState(target.id, status);
		const row = status.items[target.id] || {};
		const extra = row.url ? ` → ${row.url}` : row.note ? ` (${row.note})` : '';
		console.log(
			`${String(target.priority).padStart(2, ' ')}  ${target.id.padEnd(28)} ${state.padEnd(10)} ${target.adapter.padEnd(10)} ${target.name}${extra}`,
		);
	}
}

async function runOne(target, { dryRun, publish, open }) {
	writePacket(catalog, target);
	if (target.adapter === 'github-pr') {
		const token = resolveGithubToken(devVars);
		if (!token) {
			setTargetStatus(target.id, {
				status: 'blocked',
				note: 'GITHUB_TOKEN missing (.dev.vars or github_token file)',
			});
			throw new Error('GITHUB_TOKEN missing. Put it in .dev.vars as GITHUB_TOKEN.');
		}
		const result = await submitGithubPr({
			token,
			spec: target.github,
			dryRun,
		});
		if (result.dryRun) {
			console.log(`[dry-run] ${target.id}`);
			for (const line of result.preview || []) console.log(`  ${line}`);
			return result;
		}
		if (result.skipped) {
			setTargetStatus(target.id, { status: 'skipped', url: result.url, note: result.reason });
			console.log(`Skipped ${target.id}: ${result.reason}`);
			return result;
		}
		setTargetStatus(target.id, { status: 'submitted', url: result.url, note: `PR #${result.number}` });
		console.log(`Submitted ${target.id}: ${result.url}`);
		return result;
	}

	if (target.adapter === 'devto') {
		const apiKey = resolveDevtoKey(devVars);
		if (!apiKey) {
			setTargetStatus(target.id, { status: 'blocked', note: 'DEV_TO_API_KEY missing' });
			throw new Error('DEV_TO_API_KEY missing. Add it to .dev.vars to auto-publish a Dev.to draft.');
		}
		const result = await submitDevto({
			apiKey,
			catalog,
			spec: target.devto,
			publish,
			dryRun,
		});
		if (result.dryRun) {
			console.log(`[dry-run] ${target.id}: ${result.preview} published=${result.published}`);
			return result;
		}
		setTargetStatus(target.id, {
			status: result.published ? 'submitted' : 'drafted',
			url: result.url,
			note: result.published ? 'published' : 'draft',
		});
		console.log(`${result.published ? 'Published' : 'Drafted'} ${target.id}: ${result.url}`);
		return result;
	}

	if (target.adapter === 'manual') {
		const packet = writePacket(catalog, target);
		setTargetStatus(target.id, {
			status: 'ready',
			note: `Fill the official form. Packet: ${packet}`,
		});
		console.log(`Ready ${target.id}`);
		console.log(`  Submit: ${target.submitUrl}`);
		console.log(`  Packet: ${packet}`);
		if (open) await openUrl(target.submitUrl);
		return { ready: true, url: target.submitUrl, packet };
	}

	throw new Error(`Unknown adapter: ${target.adapter}`);
}

if (command === 'list') {
	printList();
	process.exit(0);
}

if (command === 'kit') {
	const files = writeAllPackets(catalog);
	console.log(`Wrote ${files.length} packets to .tmp/backlinks/packets/`);
	for (const item of files) console.log(`  ${item.id}`);
	process.exit(0);
}

if (command === 'done') {
	const id = flags.id || positional[1];
	if (!id) {
		console.error('Usage: node scripts/agent-backlinks.mjs done --id=<target> --url=<live-url>');
		process.exit(1);
	}
	if (!getTarget(id, catalog)) {
		console.error(`Unknown target: ${id}`);
		process.exit(1);
	}
	setTargetStatus(id, { status: 'submitted', url: flags.url || '', note: flags.note || 'marked done' });
	console.log(`Marked ${id} submitted`);
	process.exit(0);
}

if (command === 'skip') {
	const id = flags.id || positional[1];
	if (!id) {
		console.error('Usage: node scripts/agent-backlinks.mjs skip --id=<target> --reason=...');
		process.exit(1);
	}
	setTargetStatus(id, { status: 'skipped', note: flags.reason || 'skipped' });
	console.log(`Skipped ${id}`);
	process.exit(0);
}

if (command === 'run' || command === 'submit') {
	const dryRun = flagOn(flags, 'dry-run') || flagOn(flags, 'dryrun');
	const publish = flagOn(flags, 'publish');
	const open = flagOn(flags, 'open');
	const includeManual = flagOn(flags, 'include-manual') || flagOn(flags, 'manual');
	const id = flags.id;
	const count = Math.max(1, Number(flags.count || flags.n || 1) || 1);

	let queue = [];
	if (id) {
		const target = getTarget(id, catalog);
		if (!target) {
			console.error(`Unknown target: ${id}`);
			process.exit(1);
		}
		queue = [target];
	} else {
		queue = includeManual ? pendingTargets(catalog) : automatableTargets(catalog);
	}

	if (!queue.length) {
		console.log('No pending automatable targets. Use --include-manual for directory forms, or backlinks:list.');
		process.exit(0);
	}

	const slice = queue.slice(0, count);
	for (let i = 0; i < slice.length; i += 1) {
		const target = slice[i];
		console.log(`\n[${i + 1}/${slice.length}] ${target.id} (${target.adapter})`);
		try {
			await runOne(target, { dryRun, publish, open });
		} catch (error) {
			setTargetStatus(target.id, { status: 'blocked', note: error.message || String(error) });
			console.error(error.message || error);
			process.exit(1);
		}
	}
	process.exit(0);
}

console.error(`Unknown command: ${command}`);
console.error('Commands: list | kit | run | done | skip');
process.exit(1);
