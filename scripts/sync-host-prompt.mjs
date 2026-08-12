import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'host_prompt.txt');
const target = path.join(root, 'src', 'data', 'host-prompt.txt');

if (!fs.existsSync(source)) {
	console.error(`Missing ${source}`);
	process.exit(1);
}

fs.copyFileSync(source, target);
console.log(`Synced ${source} -> ${target}`);
