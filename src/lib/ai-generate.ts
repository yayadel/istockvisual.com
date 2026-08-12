import type { GeneratedAssetMeta } from './asset-types';
import { parseGeneratedMeta } from './asset-types';
import { buildHostPrompt, JSON_OUTPUT_INSTRUCTION } from './host-prompt';

type AiBinding = {
	run(model: string, input: Record<string, unknown>): Promise<unknown>;
};

type TextGenEnv = {
	AI?: AiBinding;
	OPENAI_API_KEY?: string;
	OPENAI_BASE_URL?: string;
	OPENAI_MODEL?: string;
};

const TEXT_MODEL_WORKERS = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';

export async function generateAssetMetadata(
	env: TextGenEnv,
	keyword: string,
): Promise<GeneratedAssetMeta> {
	const userPrompt = `${buildHostPrompt(keyword)}\n\n${JSON_OUTPUT_INSTRUCTION}`;
	const raw = env.OPENAI_API_KEY
		? await callOpenAi(env, userPrompt)
		: await callWorkersText(env, userPrompt);
	return parseGeneratedMeta(raw, keyword);
}

export async function generateImageBytes(
	env: { AI?: AiBinding },
	imagePrompt: string,
): Promise<Uint8Array> {
	if (!env.AI) {
		throw new Error('Workers AI binding (AI) is not configured');
	}

	const result = await env.AI.run(IMAGE_MODEL, { prompt: imagePrompt });
	if (result instanceof Uint8Array) return result;
	if (result instanceof ArrayBuffer) return new Uint8Array(result);
	if (result instanceof ReadableStream) {
		return new Uint8Array(await new Response(result).arrayBuffer());
	}
	if (result && typeof result === 'object' && 'image' in result) {
		const image = (result as { image?: string }).image;
		if (typeof image === 'string') {
			return decodeBase64Image(image);
		}
	}
	throw new Error('Unexpected image model response format');
}

async function callWorkersText(env: TextGenEnv, userPrompt: string): Promise<string> {
	if (!env.AI) {
		throw new Error('Workers AI binding (AI) is not configured');
	}

	const response = (await env.AI.run(TEXT_MODEL_WORKERS, {
		messages: [
			{
				role: 'system',
				content:
					'You are a stock-asset creative director. Output valid JSON only, no markdown.',
			},
			{ role: 'user', content: userPrompt },
		],
		max_tokens: 2048,
		temperature: 0.7,
	})) as { response?: string };

	if (!response?.response) {
		throw new Error('Workers AI returned an empty text response');
	}
	return response.response;
}

async function callOpenAi(env: TextGenEnv, userPrompt: string): Promise<string> {
	const baseUrl = (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
	const model = env.OPENAI_MODEL || 'gpt-4o-mini';

	const res = await fetch(`${baseUrl}/chat/completions`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.OPENAI_API_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model,
			temperature: 0.7,
			response_format: { type: 'json_object' },
			messages: [
				{
					role: 'system',
					content:
						'You are a stock-asset creative director. Respond with JSON only.',
				},
				{ role: 'user', content: userPrompt },
			],
		}),
	});

	if (!res.ok) {
		const detail = await res.text();
		throw new Error(`OpenAI request failed (${res.status}): ${detail.slice(0, 300)}`);
	}

	const data = (await res.json()) as {
		choices?: Array<{ message?: { content?: string } }>;
	};
	const content = data.choices?.[0]?.message?.content;
	if (!content) {
		throw new Error('OpenAI returned an empty response');
	}
	return content;
}

function decodeBase64Image(value: string): Uint8Array {
	const base64 = value.includes(',') ? value.split(',')[1]! : value;
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

export const DEFAULT_IMAGE_WIDTH = 1024;
export const DEFAULT_IMAGE_HEIGHT = 1024;
