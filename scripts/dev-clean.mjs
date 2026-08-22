import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function clearViteCache() {
	try {
		rmSync('node_modules/.vite', { recursive: true, force: true });
		console.log('Removed node_modules/.vite cache');
	} catch {
		// ignore
	}
}

function stopDev() {
	spawnSync('npx', ['astro', 'dev', 'stop'], { stdio: 'inherit', shell: true });
}

function startDev() {
	return spawnSync(
		'npx',
		['astro', 'dev', '--port', '4325', '--host', '--force'],
		{ stdio: 'inherit', shell: true },
	);
}

clearViteCache();
stopDev();

let result = startDev();
if ((result.status ?? 1) !== 0) {
	console.warn('Dev server exited during first optimize pass — clearing cache and retrying once…');
	clearViteCache();
	stopDev();
	result = startDev();
}

process.exit(result.status ?? 1);
