import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const file = join(
	'node_modules',
	'react-filerobot-image-editor',
	'lib',
	'components',
	'tools',
	'Watermark',
	'Watermark.js',
);

if (!existsSync(file)) process.exit(0);

const needle =
	'h({type:SELECT_ANNOTATION,payload:{annotationId:"watermark"}}))},[s])';
const patch =
	'h({type:SELECT_ANNOTATION,payload:{annotationId:"watermark",keepTextEditing:!0}}))},[s])';

const src = readFileSync(file, 'utf8');
if (src.includes(patch)) process.exit(0);
if (!src.includes(needle)) {
	console.warn('[patch-filerobot-watermark] pattern not found; skip');
	process.exit(0);
}

writeFileSync(file, src.replace(needle, patch), 'utf8');
console.log('[patch-filerobot-watermark] applied keepTextEditing fix');
