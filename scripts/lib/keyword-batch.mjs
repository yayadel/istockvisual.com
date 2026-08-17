import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_BATCH_PATH = path.join(root, '.tmp', 'keyword-batch.json');

/**
 * @typedef {{
 *   keywordId: number;
 *   keyword: string;
 *   status: 'pending' | 'done' | 'failed';
 * }} KeywordBatchItem
 *
 * @typedef {{
 *   batchId: string;
 *   claimedAt: string;
 *   baseUrl: string;
 *   count: number;
 *   keywords: KeywordBatchItem[];
 * }} KeywordBatchFile
 */

export function resolveBatchPath(explicit) {
	const fromEnv = (process.env.KEYWORD_BATCH_FILE || '').trim();
	if (explicit) return path.resolve(explicit);
	if (fromEnv) return path.resolve(fromEnv);
	return DEFAULT_BATCH_PATH;
}

export function readKeywordBatch(batchPath = resolveBatchPath()) {
	if (!fs.existsSync(batchPath)) return null;
	try {
		/** @type {KeywordBatchFile} */
		const data = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
		if (!data?.batchId || !Array.isArray(data.keywords)) return null;
		return data;
	} catch {
		return null;
	}
}

export function writeKeywordBatch(batch, batchPath = resolveBatchPath()) {
	fs.mkdirSync(path.dirname(batchPath), { recursive: true });
	fs.writeFileSync(batchPath, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
	return batchPath;
}

export function createKeywordBatch({ batchId, baseUrl, keywords }, batchPath = resolveBatchPath()) {
	const file = {
		batchId,
		claimedAt: new Date().toISOString(),
		baseUrl,
		count: keywords.length,
		keywords: keywords.map((item) => ({
			keywordId: Number(item.keywordId),
			keyword: String(item.keyword || ''),
			status: 'pending',
		})),
	};
	writeKeywordBatch(file, batchPath);
	return { path: batchPath, batch: file };
}

export function takeNextPendingKeyword(batchPath = resolveBatchPath()) {
	const batch = readKeywordBatch(batchPath);
	if (!batch) return null;
	const index = batch.keywords.findIndex((item) => item.status === 'pending');
	if (index === -1) return null;
	return {
		batchPath,
		batch,
		index,
		item: batch.keywords[index],
	};
}

export function markBatchKeywordStatus(batchPath, keywordId, status) {
	const batch = readKeywordBatch(batchPath);
	if (!batch) return null;
	const row = batch.keywords.find((item) => item.keywordId === Number(keywordId));
	if (!row) return null;
	row.status = status;
	writeKeywordBatch(batch, batchPath);
	return batch;
}

export function pendingCount(batch) {
	return (batch?.keywords || []).filter((item) => item.status === 'pending').length;
}
