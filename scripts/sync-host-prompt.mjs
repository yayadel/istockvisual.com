import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'host_prompt.txt');
const target = path.join(root, 'src', 'data', 'host-prompt.txt');
const categoriesSource = path.join(root, 'categories');
const categoriesTarget = path.join(root, 'src', 'data', 'content-categories.txt');

if (!fs.existsSync(source)) {
	console.error(`Missing ${source}`);
	process.exit(1);
}

fs.copyFileSync(source, target);
console.log(`Synced ${source} -> ${target}`);

if (fs.existsSync(categoriesSource)) {
	fs.copyFileSync(categoriesSource, categoriesTarget);
	console.log(`Synced ${categoriesSource} -> ${categoriesTarget}`);
}
