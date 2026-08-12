import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { createAuth, type AppUser } from './lib/auth';

export const onRequest = defineMiddleware(async (context, next) => {
	context.locals.user = null;
	context.locals.session = null;

	try {
		const secret = env.BETTER_AUTH_SECRET || import.meta.env.BETTER_AUTH_SECRET;
		const baseURL =
			env.BETTER_AUTH_URL ||
			import.meta.env.BETTER_AUTH_URL ||
			context.url.origin;

		if (env.DB && secret) {
			const auth = createAuth({
				DB: env.DB,
				BETTER_AUTH_SECRET: secret,
				BETTER_AUTH_URL: baseURL,
			});

			const session = await auth.api.getSession({
				headers: context.request.headers,
			});

			if (session) {
				context.locals.session = session.session;
				context.locals.user = session.user as AppUser;
			}
		}
	} catch {
		// Auth is optional during first boot / missing bindings.
	}

	return next();
});
