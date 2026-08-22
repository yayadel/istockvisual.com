import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

try {
	rmSync('node_modules/.vite', { recursive: true, force: true });
	console.log('Removed node_modules/.vite cache');
} catch {
	// ignore
}

spawnSync('npx', ['astro', 'dev', 'stop'], { stdio: 'inherit', shell: true });

const result = spawnSync(
	'npx',
	['astro', 'dev', '--port', '4325', '--host', '--force'],
	{ stdio: 'inherit', shell: true },
);

process.exit(result.status ?? 1);
