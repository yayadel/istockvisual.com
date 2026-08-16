import { resolveGenerateEnv } from './lib/generate-env.mjs';

const { baseUrl, secret } = resolveGenerateEnv();

console.log('Use Cursor Agent mode instead:');
console.log('  npm run agent:prepare');
console.log('Then in Cursor chat: 用内置模型生成一条素材并导入');
console.log('');
console.log('Legacy endpoint /api/generate/asset is disabled.');

const res = await fetch(`${baseUrl}/api/generate/prepare`, {
	method: 'POST',
	headers: { 'x-generate-secret': secret },
});

const data = await res.json();
console.log(JSON.stringify(data, null, 2));
