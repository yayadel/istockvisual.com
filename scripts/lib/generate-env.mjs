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

function looksLikeCloudAgent() {
	return Boolean(
		process.env.CURSOR_AGENT ||
			process.env.CURSOR_CLOUD ||
			process.env.CLOUD_AGENT ||
			process.env.CURSOR_CLOUD_AGENT,
	);
}

/**
 * Resolve where generate/import scripts should POST.
 * Cloud Agent VMs have no .dev.vars → production Worker.
 * Local .dev.vars with localhost stays local unless GENERATE_BASE_URL is set.
 */
export function resolveGenerateEnv() {
	const devVars = loadDevVars();
	const explicit = (process.env.GENERATE_BASE_URL || '').trim();
	const fromAuth = (devVars.BETTER_AUTH_URL || '').trim();
	const cloud = looksLikeCloudAgent() || !Object.keys(devVars).length;

	let baseUrl = PRODUCTION_SITE;
	if (explicit) baseUrl = explicit.replace(/\/$/, '');
	else if (!cloud && fromAuth) baseUrl = fromAuth.replace(/\/$/, '');
	else if (cloud) baseUrl = PRODUCTION_SITE;

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
