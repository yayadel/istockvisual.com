import { loadDevVars } from './gemini-node.mjs';

const PRODUCTION_SITE = 'https://istockvisual.com';

function isLocalHost(url) {
	try {
		const host = new URL(url).hostname;
		return host === 'localhost' || host === '127.0.0.1';
	} catch {
		return /localhost|127\.0\.0\.1/.test(String(url));
	}
}

/**
 * Resolve where generate/import scripts should POST.
 * Default is always production (D1/R2 live catalog). Local code is for debugging only.
 * Override with GENERATE_BASE_URL when you intentionally need a non-prod Worker.
 */
export function resolveGenerateEnv() {
	const devVars = loadDevVars();
	const explicit = (process.env.GENERATE_BASE_URL || '').trim();

	let baseUrl = PRODUCTION_SITE;
	if (explicit) baseUrl = explicit.replace(/\/$/, '');

	const production = !isLocalHost(baseUrl);
	const secret = production
		? process.env.GENERATE_API_SECRET ||
			process.env.GENERATE_API_SECRET_REMOTE ||
			devVars.GENERATE_API_SECRET_REMOTE ||
			devVars.GENERATE_API_SECRET ||
			''
		: process.env.GENERATE_API_SECRET ||
			devVars.GENERATE_API_SECRET ||
			'dev-generate-secret';

	return { baseUrl, secret, production, devVars };
}
