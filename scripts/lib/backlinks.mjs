import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDevVars } from './gemini-node.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const BACKLINKS_DIR = path.join(root, '.tmp', 'backlinks');
export const STATUS_PATH = path.join(BACKLINKS_DIR, 'status.json');
export const PACKETS_DIR = path.join(BACKLINKS_DIR, 'packets');
export const PATCHES_DIR = path.join(BACKLINKS_DIR, 'patches');
export const CATALOG_PATH = path.join(root, 'src', 'data', 'backlink-targets.json');

export function loadCatalog() {
	return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
}

export function loadStatus() {
	if (!fs.existsSync(STATUS_PATH)) return { updatedAt: null, items: {} };
	try {
		return JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8'));
	} catch {
		return { updatedAt: null, items: {} };
	}
}

export function saveStatus(status) {
	fs.mkdirSync(BACKLINKS_DIR, { recursive: true });
	status.updatedAt = new Date().toISOString();
	fs.writeFileSync(STATUS_PATH, `${JSON.stringify(status, null, 2)}\n`);
	return status;
}

export function setTargetStatus(id, patch) {
	const status = loadStatus();
	status.items[id] = {
		...(status.items[id] || { id, status: 'pending' }),
		...patch,
		at: new Date().toISOString(),
	};
	saveStatus(status);
	return status.items[id];
}

export function sortedTargets(catalog = loadCatalog()) {
	return [...catalog.targets].sort((a, b) => (a.priority || 99) - (b.priority || 99));
}

export function getTarget(id, catalog = loadCatalog()) {
	return catalog.targets.find((item) => item.id === id) || null;
}

export function targetState(id, status = loadStatus()) {
	return status.items[id]?.status || 'pending';
}

export function pendingTargets(catalog = loadCatalog(), status = loadStatus()) {
	return sortedTargets(catalog).filter((item) => {
		const state = status.items[item.id]?.status;
		return !state || state === 'pending' || state === 'blocked';
	});
}

export function automatableTargets(catalog = loadCatalog(), status = loadStatus()) {
	return pendingTargets(catalog, status).filter(
		(item) => item.adapter === 'github-pr' || item.adapter === 'devto',
	);
}

export function resolveGithubToken(devVars = loadDevVars()) {
	const fromEnv =
		process.env.GITHUB_TOKEN ||
		process.env.GH_TOKEN ||
		devVars.GITHUB_TOKEN ||
		devVars.GH_TOKEN ||
		'';
	if (fromEnv.trim()) return fromEnv.trim();
	const filePath = path.join(root, 'github_token');
	if (fs.existsSync(filePath)) {
		const raw = fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/)[0] || '';
		if (raw) return raw;
	}
	return '';
}

export function resolveDevtoKey(devVars = loadDevVars()) {
	return (process.env.DEV_TO_API_KEY || devVars.DEV_TO_API_KEY || '').trim();
}

export function packetMarkdown(catalog, target) {
	const fields = target.fields || {};
	const lines = [
		`# ${target.name}`,
		'',
		`- Adapter: \`${target.adapter}\``,
		`- Channel: ${target.channel}`,
		`- Submit: ${target.submitUrl}`,
		`- Link URL: ${target.linkUrl}`,
		`- Anchor: ${target.anchor}`,
		`- DoFollow likely: ${target.dofollow ? 'yes' : 'mixed / nofollow'}`,
		'',
		'## Listing copy (brand / URL anchors only)',
		'',
		catalog.oneLiner,
		'',
		'```',
		`Name: ${fields.name || catalog.brand}`,
		`Website: ${fields.website || target.linkUrl}`,
		fields.tagline ? `Tagline: ${fields.tagline}` : null,
		fields.short ? `Short: ${fields.short}` : null,
		fields.description ? `Description:\n${fields.description}` : null,
		'```',
		'',
		target.alternativesTo
			? `Listed as an alternative to: ${target.alternativesTo.join(', ')}`
			: null,
		'',
		'Do not use commercial keyword anchors such as “Free Stock Photos”.',
		'',
	].filter((line) => line !== null);
	return `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}

export function writePacket(catalog, target) {
	fs.mkdirSync(PACKETS_DIR, { recursive: true });
	const file = path.join(PACKETS_DIR, `${target.id}.md`);
	fs.writeFileSync(file, packetMarkdown(catalog, target));
	return file;
}

export function writeAllPackets(catalog = loadCatalog()) {
	return sortedTargets(catalog).map((target) => ({
		id: target.id,
		file: writePacket(catalog, target),
	}));
}

export function insertListEntry(markdown, spec) {
	const already = /\[iStockVisual\]/i.test(markdown) && /istockvisual\.com/i.test(markdown);
	if (already) return { already: true, markdown };

	const heading = spec.heading;
	const marker = spec.marker || '-';
	const line = spec.line;
	const title = spec.title || 'iStockVisual';
	const headingEsc = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const headingRe = new RegExp(`^${headingEsc}\\s*$`, 'm');
	let source = markdown;
	let match = source.match(headingRe);

	if (!match && spec.createSectionBefore) {
		const before = source.indexOf(spec.createSectionBefore);
		const block = `${heading}\n\n${line}\n\n`;
		if (before === -1) {
			source = `${source.trimEnd()}\n\n${block}`;
		} else {
			source = `${source.slice(0, before)}${block}${source.slice(before)}`;
		}
		return { already: false, markdown: source };
	}

	if (!match) {
		throw new Error(`Heading not found: ${heading}`);
	}

	const start = match.index + match[0].length;
	const after = source.slice(start);
	const next = after.search(/\n#{1,6} /);
	const end = next === -1 ? source.length : start + next;
	const sectionBody = source.slice(start, end);
	const markerEsc = marker === '*' ? '\\*' : '-';
	const itemRe = new RegExp(`^\\s*${markerEsc} \\[([^\\]]+)\\]`, 'gm');
	const items = [];
	let itemMatch;
	while ((itemMatch = itemRe.exec(sectionBody))) {
		items.push({ title: itemMatch[1], index: start + itemMatch.index });
	}

	const needle = title.toLowerCase();
	let insertAt = end;
	for (const item of items) {
		if (item.title.toLowerCase() > needle) {
			insertAt = item.index;
			break;
		}
	}
	if (insertAt === end && items.length) {
		const last = items[items.length - 1];
		const fromLast = source.slice(last.index);
		const nl = fromLast.indexOf('\n');
		insertAt = last.index + (nl === -1 ? fromLast.length : nl + 1);
	}

	const prefix = source[insertAt - 1] === '\n' ? '' : '\n';
	const nextMarkdown = `${source.slice(0, insertAt)}${prefix}${line}\n${source.slice(insertAt)}`;
	return { already: false, markdown: nextMarkdown };
}

async function githubFetch(token, method, url, body) {
	const res = await fetch(url, {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
			'User-Agent': 'istockvisual-backlinks',
			...(body ? { 'Content-Type': 'application/json' } : {}),
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	const text = await res.text();
	let data = null;
	try {
		data = text ? JSON.parse(text) : null;
	} catch {
		data = { raw: text };
	}
	if (!res.ok) {
		const message = data?.message || text || `GitHub ${res.status}`;
		const error = new Error(message);
		error.status = res.status;
		error.data = data;
		throw error;
	}
	return data;
}

async function wait(ms) {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function submitGithubPr({ token, spec, dryRun = false }) {
	const [owner, repo] = spec.repo.split('/');
	const filePath = spec.file || 'README.md';
	const fileMeta = await githubFetch(
		token,
		'GET',
		`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`,
	);
	const current = Buffer.from(fileMeta.content.replace(/\n/g, ''), 'base64').toString('utf8');
	const next = insertListEntry(current, spec);
	if (next.already) {
		return { skipped: true, reason: 'already listed', url: `https://github.com/${spec.repo}` };
	}

	if (dryRun) {
		const preview = next.markdown
			.split(/\r?\n/)
			.filter((line) => /iStockVisual/i.test(line))
			.slice(0, 3);
		return { dryRun: true, preview };
	}

	const me = await githubFetch(token, 'GET', 'https://api.github.com/user');
	const login = me.login;
	await githubFetch(token, 'POST', `https://api.github.com/repos/${owner}/${repo}/forks`, {});

	let forkReady = null;
	for (let i = 0; i < 20; i += 1) {
		try {
			forkReady = await githubFetch(token, 'GET', `https://api.github.com/repos/${login}/${repo}`);
			break;
		} catch {
			await wait(2000);
		}
	}
	if (!forkReady) throw new Error(`Fork ${login}/${repo} did not become ready`);

	const repoMeta = await githubFetch(token, 'GET', `https://api.github.com/repos/${owner}/${repo}`);
	const defaultBranch = repoMeta.default_branch || 'master';
	const ref = await githubFetch(
		token,
		'GET',
		`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`,
	);
	const sha = ref.object.sha;
	const branch = 'add-istockvisual';

	try {
		await githubFetch(token, 'POST', `https://api.github.com/repos/${login}/${repo}/git/refs`, {
			ref: `refs/heads/${branch}`,
			sha,
		});
	} catch (error) {
		if (!String(error.message || '').includes('already exists')) throw error;
	}

	const forkFile = await githubFetch(
		token,
		'GET',
		`https://api.github.com/repos/${login}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${branch}`,
	);
	const forkCurrent = Buffer.from(forkFile.content.replace(/\n/g, ''), 'base64').toString('utf8');
	const forkNext = insertListEntry(forkCurrent, spec);
	if (forkNext.already) {
		return { skipped: true, reason: 'already listed on fork', url: `https://github.com/${login}/${repo}` };
	}

	await githubFetch(
		token,
		'PUT',
		`https://api.github.com/repos/${login}/${repo}/contents/${encodeURIComponent(filePath)}`,
		{
			message: spec.prTitle || 'Add iStockVisual',
			content: Buffer.from(forkNext.markdown, 'utf8').toString('base64'),
			branch,
			sha: forkFile.sha,
		},
	);

	const pull = await githubFetch(token, 'POST', `https://api.github.com/repos/${owner}/${repo}/pulls`, {
		title: spec.prTitle || 'Add iStockVisual',
		head: `${login}:${branch}`,
		base: defaultBranch,
		body: spec.prBody || 'Add iStockVisual as a CC0 visual library.',
	});

	return { url: pull.html_url, number: pull.number };
}

export function devtoArticleMarkdown(catalog) {
	return `iStockVisual is a CC0 visual library for frontend and design work: photos, illustrations, vectors, and 3D stills. Attribution is not required.

## Library

- Website: [iStockVisual](${catalog.site})
- Collections: [category library](${catalog.site}/c/)
- License: [CC0](${catalog.site}/info/license)
- Textures: [this collection](${catalog.site}/c/textures)
- 3D stills: [this collection](${catalog.site}/c/3d-assets)

Free downloads are 512 and 1K. Larger sizes are on Pro. Filenames use the scene title.

## In-browser tools

These run in the tab. Your own files stay on the device.

- [Image Editor](${catalog.site}/tools/image)
- [Image Convert](${catalog.site}/tools/convert)
- [Image Vectorizer](${catalog.site}/tools/vectorize)
- [Palette Generator](${catalog.site}/tools/palette)

Optional credit, if you want it: \`Generated by iStockVisual.com\` plus a link to the asset page. Source: ${catalog.site}/info/press
`;
}

export async function submitDevto({ apiKey, catalog, spec, publish = false, dryRun = false }) {
	const article = {
		title: spec.title,
		published: Boolean(publish),
		canonical_url: spec.canonical,
		tags: spec.tags || ['webdev', 'design'],
		body_markdown: devtoArticleMarkdown(catalog),
	};
	if (dryRun) {
		return { dryRun: true, preview: article.title, published: article.published };
	}
	const res = await fetch('https://dev.to/api/articles', {
		method: 'POST',
		headers: {
			'api-key': apiKey,
			'Content-Type': 'application/json',
			'User-Agent': 'istockvisual-backlinks',
		},
		body: JSON.stringify({ article }),
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		throw new Error(data.error || data.message || `Dev.to ${res.status}`);
	}
	return { url: data.url, id: data.id, published: Boolean(data.published) };
}

export async function openUrl(url) {
	if (process.platform === 'win32') {
		const { spawn } = await import('node:child_process');
		spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
		return;
	}
	const { spawn } = await import('node:child_process');
	const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
	spawn(cmd, [url], { detached: true, stdio: 'ignore' }).unref();
}
