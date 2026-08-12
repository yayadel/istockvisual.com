import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Load KEY=VALUE pairs from .dev.vars (local secrets). */
export function loadDevVars(filePath = path.join(root, '.dev.vars')) {
	const out = {};
	if (!fs.existsSync(filePath)) return out;
	for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eq = trimmed.indexOf('=');
		if (eq <= 0) continue;
		const key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		out[key] = value;
	}
	return out;
}

export function slugifyKeyword(value) {
	return String(value || 'keyword')
		.toLowerCase()
		.replace(/[^\w\s-]/g, '')
		.trim()
		.replace(/\s+/g, '-')
		.slice(0, 60);
}

function applyProxyIfConfigured(devVars = {}) {
	const proxy =
		process.env.HTTPS_PROXY ||
		process.env.HTTP_PROXY ||
		process.env.ALL_PROXY ||
		devVars.HTTPS_PROXY ||
		devVars.HTTP_PROXY ||
		'';
	if (proxy) {
		setGlobalDispatcher(new ProxyAgent(proxy));
	}
	return proxy || null;
}

/**
 * Call Gemini from Node (avoids local Cloudflare Worker fetch hangs).
 * Supports HTTPS_PROXY / GEMINI_BASE_URL for regions where Google is blocked.
 */
export async function generateMetaWithGeminiNode({
	apiKey,
	model = 'gemini-2.0-flash',
	keyword,
	hostPromptTemplate,
	jsonInstruction,
	timeoutMs = 60000,
	baseUrl = 'https://generativelanguage.googleapis.com',
	devVars = {},
}) {
	if (!apiKey) throw new Error('GEMINI_API_KEY is missing');
	if (!keyword) throw new Error('keyword is required');

	const proxy = applyProxyIfConfigured(devVars);
	const hostPrompt = hostPromptTemplate.replace('[Insert topic keyword here]', keyword.trim());
	const prompt = `${hostPrompt}\n\n${jsonInstruction}`;
	const endpointBase = (baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
	const url = `${endpointBase}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

	const ac = new AbortController();
	const timer = setTimeout(() => ac.abort(), timeoutMs);

	let res;
	try {
		res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			signal: ac.signal,
			body: JSON.stringify({
				contents: [{ role: 'user', parts: [{ text: prompt }] }],
				generationConfig: {
					temperature: 0.75,
					responseMimeType: 'application/json',
				},
			}),
		});
	} catch (error) {
		if (error?.name === 'AbortError') {
			throw new Error(`Gemini timed out after ${timeoutMs}ms`);
		}
		const cause = error?.cause?.code || error?.cause?.message || error?.message || 'fetch failed';
		throw new Error(
			`Cannot reach Gemini (${cause}).${proxy ? '' : ' Set HTTPS_PROXY in .dev.vars or system env if Google is blocked.'} Optional: GEMINI_BASE_URL for a compatible gateway.`,
		);
	} finally {
		clearTimeout(timer);
	}

	const data = await res.json();
	if (!res.ok) {
		throw new Error(data?.error?.message || `Gemini HTTP ${res.status}`);
	}

	const text = (data.candidates?.[0]?.content?.parts || [])
		.map((part) => part.text || '')
		.join('\n')
		.trim();
	if (!text) throw new Error('Gemini returned empty metadata content');

	const jsonText = extractJson(text);
	const meta = JSON.parse(jsonText);
	if (!meta?.imagePrompt) {
		throw new Error('Gemini JSON missing imagePrompt');
	}
	return meta;
}

function extractJson(raw) {
	const trimmed = String(raw).trim();
	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fenced?.[1]) return fenced[1].trim();
	const start = trimmed.indexOf('{');
	const end = trimmed.lastIndexOf('}');
	if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
	return trimmed;
}
