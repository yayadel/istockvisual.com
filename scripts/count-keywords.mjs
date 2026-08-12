import fs from 'node:fs';
import readline from 'node:readline';

const CSV_PATH = new URL('../keyword_store/kwdata_172-ok.csv', import.meta.url);

function parseCSVLine(line) {
	const out = [];
	let cur = '';
	let inQ = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (c === '"') {
			inQ = !inQ;
			continue;
		}
		if (c === ',' && !inQ) {
			out.push(cur);
			cur = '';
			continue;
		}
		cur += c;
	}
	out.push(cur);
	return out;
}

let total = 0;
let zero = 0;
let nonzero = 0;

const rl = readline.createInterface({
	input: fs.createReadStream(CSV_PATH),
	crlfDelay: Infinity,
});

for await (const line of rl) {
	total++;
	const cols = parseCSVLine(line);
	const val = Number(cols[6]);
	if (val === 0) zero++;
	else nonzero++;
}

console.log(JSON.stringify({ total, zero, nonzero }, null, 2));
