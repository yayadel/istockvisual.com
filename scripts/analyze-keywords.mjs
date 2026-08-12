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

let n = 0;
let zero = 0;
let nonzero = 0;

const rl = readline.createInterface({
	input: fs.createReadStream(CSV_PATH),
	crlfDelay: Infinity,
});

for await (const line of rl) {
	n++;
	const cols = parseCSVLine(line);
	const val = Number(cols[6]);
	if (val === 0) zero++;
	else nonzero++;
	if (n <= 5) {
		console.log(`row ${n}: keyword="${cols[2]}" value=${cols[6]}`);
	}
	if (n >= 100000) break;
}

console.log(`sample ${n}: value=0 -> ${zero}, value!=0 -> ${nonzero}`);
