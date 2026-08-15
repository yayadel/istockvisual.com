const FAR_FUTURE_MS = Date.parse('Wed, 01 Jan 2031 00:00:00 GMT');

export function httpDate(ms: number = Date.now()) {
	return new Date(ms).toUTCString();
}

export function setExpiresHeaders(
	headers: Headers,
	maxAgeSeconds: number,
	cacheControl?: string,
) {
	const age = Math.max(0, Math.floor(maxAgeSeconds));
	headers.set(
		'Cache-Control',
		cacheControl ||
			(age >= 31_536_000
				? `public, max-age=${age}, immutable`
				: `public, max-age=${age}, must-revalidate`),
	);
	headers.set('Expires', httpDate(Date.now() + age * 1000));
}

export function setFarFutureExpires(headers: Headers) {
	headers.set('Cache-Control', 'public, max-age=31536000, immutable');
	headers.set('Expires', httpDate(FAR_FUTURE_MS));
}

const COMPRESSIBLE = /text\/|javascript|json|xml|svg\+xml|manifest|form-urlencoded/i;

export function mergeVary(current: string | null, token: string) {
	const parts = new Set(
		(current || '')
			.split(',')
			.map((item) => item.trim())
			.filter(Boolean),
	);
	parts.add(token);
	return [...parts].join(', ');
}

export function shouldGzip(request: Request, response: Response) {
	if (response.headers.get('Content-Encoding')) return false;
	const type = response.headers.get('Content-Type') || '';
	if (!COMPRESSIBLE.test(type)) return false;
	const accept = request.headers.get('Accept-Encoding') || '';
	return /\bgzip\b/i.test(accept);
}

export function gzipResponse(response: Response): Response {
	if (!response.body) return response;
	const headers = new Headers(response.headers);
	headers.set('Content-Encoding', 'gzip');
	headers.set('Vary', mergeVary(headers.get('Vary'), 'Accept-Encoding'));
	headers.delete('Content-Length');
	return new Response(response.body.pipeThrough(new CompressionStream('gzip')), {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

export function htmlCachePolicy(pathname: string): { maxAge: number; cacheControl: string } {
	if (/^\/(account|login|signup|admin|api)(\/|$)/i.test(pathname)) {
		return { maxAge: 0, cacheControl: 'private, no-store' };
	}
	return { maxAge: 300, cacheControl: 'public, max-age=300, must-revalidate' };
}
