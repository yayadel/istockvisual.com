const baseUrl = process.env.GENERATE_BASE_URL || 'http://localhost:4325';
const secret = process.env.GENERATE_API_SECRET || 'dev-generate-secret';

const res = await fetch(`${baseUrl}/api/generate/asset`, {
	method: 'POST',
	headers: {
		'x-generate-secret': secret,
	},
});

const data = await res.json();
if (!res.ok) {
	console.error(data.error || 'Generation failed');
	process.exit(1);
}

console.log(JSON.stringify(data, null, 2));
