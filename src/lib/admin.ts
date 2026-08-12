import type { AppUser } from './auth';

export type AdminEnv = {
	ADMIN_EMAILS?: string;
};

export function resolveAdminEnv(env?: AdminEnv): AdminEnv {
	return {
		ADMIN_EMAILS: env?.ADMIN_EMAILS || import.meta.env.ADMIN_EMAILS,
	};
}

export function getAdminEmails(env?: AdminEnv): string[] {
	const { ADMIN_EMAILS } = resolveAdminEnv(env);
	const raw = ADMIN_EMAILS || '';
	return raw
		.split(',')
		.map((email) => email.trim().toLowerCase())
		.filter(Boolean);
}

export function isAdminUser(
	user: AppUser | null | undefined,
	env?: AdminEnv,
): boolean {
	if (!user?.email) return false;
	const allowed = getAdminEmails(env);
	if (allowed.length === 0) {
		return import.meta.env.DEV;
	}
	return allowed.includes(user.email.toLowerCase());
}

export function requireAdminResponse(
	user: AppUser | null | undefined,
	env?: AdminEnv,
): Response | null {
	if (!user) {
		return new Response(JSON.stringify({ error: 'Login required' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' },
		});
	}
	if (!isAdminUser(user, env)) {
		return new Response(JSON.stringify({ error: 'Admin access required' }), {
			status: 403,
			headers: { 'Content-Type': 'application/json' },
		});
	}
	return null;
}
