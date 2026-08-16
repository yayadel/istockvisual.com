import { resolveGenerateEnv } from './lib/generate-env.mjs';

const { baseUrl, secret } = resolveGenerateEnv();
if (!secret) {
	console.error('GENERATE_API_SECRET missing (Cloud: Cursor Secrets; local: .dev.vars)');
	process.exit(1);
}

const res = await fetch(`${baseUrl}/api/generate/prepare`, {
	method: 'POST',
	headers: {
		'x-generate-secret': secret,
		'Origin': baseUrl,
		'Content-Type': 'application/json',
	},
});

const data = await res.json();
if (!res.ok) {
	console.error(data.error || 'Prepare failed');
	process.exit(1);
}

console.log(JSON.stringify(data, null, 2));
