const baseUrl = process.env.GENERATE_BASE_URL || 'http://localhost:4325';
const secret = process.env.GENERATE_API_SECRET || 'dev-generate-secret';

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
