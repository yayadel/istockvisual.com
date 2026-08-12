import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { createAuth, type AppUser } from '../../../lib/auth';
import { resolveAssetById } from '../../../lib/generate-asset';
import { contentDisposition } from '../../../lib/r2';

export const GET: APIRoute = async (context) => {
	const id = context.params.id;
	if (!id) {
		return new Response('Missing asset id', { status: 400 });
	}

	const secret = env.BETTER_AUTH_SECRET || import.meta.env.BETTER_AUTH_SECRET;
	const baseURL =
		env.BETTER_AUTH_URL || import.meta.env.BETTER_AUTH_URL || context.url.origin;

	let user = context.locals.user as AppUser | null;

	if (!user && env.DB && secret) {
		const auth = createAuth({
			DB: env.DB,
			BETTER_AUTH_SECRET: secret,
			BETTER_AUTH_URL: baseURL,
		});
		const session = await auth.api.getSession({ headers: context.request.headers });
		user = (session?.user as AppUser | undefined) ?? null;
	}

	if (!user) {
		return new Response(JSON.stringify({ error: 'Login required' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const asset = await resolveAssetById(env.DB, context.url.origin, id);
	if (!asset) {
		return new Response(JSON.stringify({ error: 'Asset not found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	if (asset.isPremium && user.plan !== 'pro') {
		return new Response(
			JSON.stringify({ error: 'Pro plan required', upgrade: '/account' }),
			{ status: 403, headers: { 'Content-Type': 'application/json' } },
		);
	}

	if (!asset.r2ObjectKey) {
		return new Response(
			JSON.stringify({ error: 'Asset has no R2 object key configured' }),
			{ status: 404, headers: { 'Content-Type': 'application/json' } },
		);
	}

	const bucket = env.MEDIA;
	if (!bucket) {
		return new Response(
			JSON.stringify({
				error: 'MEDIA R2 binding missing',
				r2ObjectKey: asset.r2ObjectKey,
			}),
			{ status: 503, headers: { 'Content-Type': 'application/json' } },
		);
	}

	const object = await bucket.get(asset.r2ObjectKey);
	if (!object) {
		return new Response(
			JSON.stringify({
				error: 'Object not found in R2',
				r2ObjectKey: asset.r2ObjectKey,
			}),
			{ status: 404, headers: { 'Content-Type': 'application/json' } },
		);
	}

	const filename = asset.r2ObjectKey.split('/').pop() || `${asset.slug}.bin`;
	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('etag', object.httpEtag);
	headers.set('Content-Disposition', contentDisposition(filename));
	if (asset.fileType) {
		headers.set('Content-Type', asset.fileType);
	}

	return new Response(object.body, { headers });
};
