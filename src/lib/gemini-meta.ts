import {
	formatAcronymsInText,
	formatAssetTitle,
	parseGeneratedMeta,
	type GeneratedAssetMeta,
} from './asset-types';
import { buildHostPrompt, JSON_OUTPUT_INSTRUCTION } from './host-prompt';

export type GeminiEnv = {
	GEMINI_API_KEY?: string;
	GEMINI_MODEL?: string;
};

type GeminiPart = { text?: string };
type GeminiResponse = {
	candidates?: Array<{
		content?: { parts?: GeminiPart[] };
		finishReason?: string;
	}>;
	error?: { message?: string; status?: string; code?: number };
};

const DEFAULT_MODEL = 'gemini-3.6-flash';

function resolveGeminiKey(env: GeminiEnv): string {
	const key =
		env.GEMINI_API_KEY ||
		(typeof import.meta !== 'undefined'
			? (import.meta.env?.GEMINI_API_KEY as string | undefined)
			: undefined) ||
		'';
	if (!key.trim()) {
		throw new Error('GEMINI_API_KEY is not configured in .dev.vars');
	}
	return key.trim();
}

function resolveGeminiModel(env: GeminiEnv): string {
	return (
		env.GEMINI_MODEL ||
		(typeof import.meta !== 'undefined'
			? (import.meta.env?.GEMINI_MODEL as string | undefined)
			: undefined) ||
		DEFAULT_MODEL
	);
}

function extractText(data: GeminiResponse): string {
	const parts = data.candidates?.[0]?.content?.parts || [];
	const text = parts
		.map((part) => part.text || '')
		.join('\n')
		.trim();
	if (!text) {
		const apiError = data.error?.message;
		throw new Error(apiError || 'Gemini returned empty metadata content');
	}
	return text;
}

/** Step 1: generate structured asset metadata from host prompt + keyword via Gemini. */
export async function generateMetaWithGemini(
	env: GeminiEnv,
	keyword: string,
): Promise<GeneratedAssetMeta> {
	const apiKey = resolveGeminiKey(env);
	const model = resolveGeminiModel(env);
	const prompt = `${buildHostPrompt(keyword)}\n\n${JSON_OUTPUT_INSTRUCTION}`;

	const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
	const ac = new AbortController();
	const timer = setTimeout(() => ac.abort(), 40000);

	let res: Response;
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
		if (error instanceof Error && error.name === 'AbortError') {
			throw new Error('Gemini request timed out (40s). Use `npm run agent:meta` instead.');
		}
		throw error;
	} finally {
		clearTimeout(timer);
	}

	const data = (await res.json()) as GeminiResponse;
	if (!res.ok) {
		throw new Error(data.error?.message || `Gemini HTTP ${res.status}`);
	}

	const meta = parseGeneratedMeta(extractText(data), keyword);
	return {
		...meta,
		imagePageTitle: formatAssetTitle(meta.imagePageTitle || keyword),
		pageShortDescription: formatAcronymsInText(meta.pageShortDescription),
		imageCreationDescription: formatAcronymsInText(meta.imageCreationDescription),
	};
}
