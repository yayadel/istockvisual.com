import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import {
	KEYWORD_CONTENT_TYPES,
	type KeywordContentType,
	getKeywordForContent,
	listKeywordContentLinks,
} from '../../../../../lib/keyword-content';

export const GET: APIRoute = async (context) => {
	const { type, id } = context.params;
	if (!type || !id || !env.DB) {
		return new Response(JSON.stringify({ error: 'Not found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const contentType = type as KeywordContentType;
	if (!Object.values(KEYWORD_CONTENT_TYPES).includes(contentType)) {
		return new Response(JSON.stringify({ error: 'Unsupported content type' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const keyword = await getKeywordForContent(env.DB, contentType, id);
	if (!keyword) {
		return new Response(JSON.stringify({ error: 'No keyword linked to this content' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const links = await listKeywordContentLinks(env.DB, keyword.id, { contentType });

	return new Response(
		JSON.stringify({
			keyword,
			links,
		}),
		{ headers: { 'Content-Type': 'application/json' } },
	);
};
