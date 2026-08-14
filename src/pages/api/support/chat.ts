import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { answerSupportChat, type SupportMessage } from '../../../lib/support-bot';

const MAX_MESSAGES = 12;
const MAX_CHARS = 800;

function json(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

export const POST: APIRoute = async ({ request }) => {
	let body: { messages?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, 400);
	}

	const raw = Array.isArray(body.messages) ? body.messages : [];
	const messages: SupportMessage[] = [];
	for (const item of raw.slice(-MAX_MESSAGES)) {
		if (!item || typeof item !== 'object') continue;
		const role = (item as { role?: string }).role;
		const content = String((item as { content?: string }).content || '').trim();
		if ((role !== 'user' && role !== 'assistant') || !content) continue;
		messages.push({ role, content: content.slice(0, MAX_CHARS) });
	}

	if (!messages.some((item) => item.role === 'user')) {
		return json({ error: 'Ask a question to get started.' }, 400);
	}

	try {
		const result = await answerSupportChat(
			{
				GEMINI_API_KEY: env.GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY,
				GEMINI_MODEL: env.GEMINI_MODEL || import.meta.env.GEMINI_MODEL,
			},
			messages,
		);
		return json(result);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Support chat failed';
		return json({ error: message }, 500);
	}
};
