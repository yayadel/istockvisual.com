import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import {
	PRIVACY_NOTICE_TTL_SECONDS,
	clientIpFromHeaders,
	privacyNoticeCookieHeader,
	privacyNoticeIpKey,
} from '../../lib/privacy-notice';

function json(data: unknown, status = 200, extra?: HeadersInit) {
	const headers = new Headers(extra);
	headers.set('Content-Type', 'application/json; charset=utf-8');
	headers.set('Cache-Control', 'private, no-store');
	return new Response(JSON.stringify(data), { status, headers });
}

async function isAcknowledged(ip: string): Promise<boolean> {
	if (!env.SESSION || !ip) return false;
	const value = await env.SESSION.get(await privacyNoticeIpKey(ip));
	return Boolean(value);
}

export const GET: APIRoute = async ({ request }) => {
	const ip = clientIpFromHeaders(request.headers);
	return json({ acknowledged: await isAcknowledged(ip) });
};

export const POST: APIRoute = async ({ request }) => {
	const ip = clientIpFromHeaders(request.headers);
	if (env.SESSION && ip) {
		await env.SESSION.put(await privacyNoticeIpKey(ip), String(Date.now()), {
			expirationTtl: PRIVACY_NOTICE_TTL_SECONDS,
		});
	}
	return json({ ok: true, acknowledged: true }, 200, {
		'Set-Cookie': privacyNoticeCookieHeader(),
	});
};
