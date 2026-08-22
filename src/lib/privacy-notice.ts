export const PRIVACY_NOTICE_COOKIE = 'stockvisual-privacy-ok';
export const PRIVACY_NOTICE_STORAGE_KEY = 'stockvisual-privacy-ok';
/** Pre-rebrand keys; still accepted so returning visitors are not re-prompted. */
export const LEGACY_PRIVACY_NOTICE_COOKIE = 'istockvisual-privacy-ok';
export const LEGACY_PRIVACY_NOTICE_STORAGE_KEY = 'istockvisual-privacy-ok';
export const PRIVACY_NOTICE_TTL_SECONDS = 24 * 60 * 60;
export const PRIVACY_NOTICE_KV_PREFIX = 'privacy-notice:';

export function clientIpFromHeaders(headers: Headers, fallback = ''): string {
	const cf = headers.get('cf-connecting-ip')?.trim();
	if (cf) return cf;
	const trueClient = headers.get('true-client-ip')?.trim();
	if (trueClient) return trueClient;
	const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
	if (forwarded) return forwarded;
	return fallback.trim();
}

export async function privacyNoticeIpKey(ip: string): Promise<string> {
	const normalized = ip.trim() || 'unknown';
	const data = new TextEncoder().encode(`${PRIVACY_NOTICE_KV_PREFIX}${normalized}`);
	const digest = await crypto.subtle.digest('SHA-256', data);
	const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
	return `${PRIVACY_NOTICE_KV_PREFIX}${hex}`;
}

export function privacyNoticeCookieHeader(): string {
	return `${PRIVACY_NOTICE_COOKIE}=1; Max-Age=${PRIVACY_NOTICE_TTL_SECONDS}; Path=/; SameSite=Lax`;
}
