import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { createAuth, type AppUser } from '../../../lib/auth';
import {
	FREE_DOWNLOAD_WIDTH,
	isDownloadSizeId,
	sizeFileLabel,
	variantObjectKey,
} from '../../../lib/download-sizes';
import {
	logFullSizeDownload,
	remainingFullSizeDownloads,
} from '../../../lib/download-quota';
import { resolveAssetById } from '../../../lib/generate-asset';
import { contentDisposition } from '../../../lib/r2';
import { resizeImageToLongEdgeJpeg, resizeImageToWidthJpeg } from '../../../lib/resize-jpeg';

async function getSessionUser(context: Parameters<APIRoute>[0]): Promise<AppUser | null> {
	let user = context.locals.user as AppUser | null;
	const secret = env.BETTER_AUTH_SECRET || import.meta.env.BETTER_AUTH_SECRET;
	const baseURL = env.BETTER_AUTH_URL || import.meta.env.BETTER_AUTH_URL || context.url.origin;

	if (!user && env.DB && secret) {
		const auth = createAuth({
			DB: env.DB,
			BETTER_AUTH_SECRET: secret,
			BETTER_AUTH_URL: baseURL,
		});
		const session = await auth.api.getSession({ headers: context.request.headers });
		user = (session?.user as AppUser | undefined) ?? null;
	}

	return user;
}

async function readOriginalBytes(
	context: Parameters<APIRoute>[0],
	r2ObjectKey: string,
	previewUrl?: string,
): Promise<{ bytes: Uint8Array; contentType: string } | Response> {
	const bucket = env.MEDIA;
	if (bucket) {
		const object = await bucket.get(r2ObjectKey);
		if (object) {
			return {
				bytes: new Uint8Array(await object.arrayBuffer()),
				contentType: object.httpMetadata?.contentType || 'image/jpeg',
			};
		}
	}

	if (previewUrl) {
		const url = previewUrl.startsWith('http')
			? previewUrl
			: new URL(previewUrl, context.url.origin).toString();
		const res = await fetch(url);
		if (res.ok) {
			return {
				bytes: new Uint8Array(await res.arrayBuffer()),
				contentType: res.headers.get('content-type') || 'image/jpeg',
			};
		}
	}

	return new Response(
		JSON.stringify({
			error: bucket ? 'Object not found in R2' : 'MEDIA R2 binding missing',
			r2ObjectKey,
		}),
		{
			status: bucket ? 404 : 503,
			headers: { 'Content-Type': 'application/json' },
		},
	);
}

function jpegDownload(
	bytes: Uint8Array,
	filename: string,
	extra: Record<string, string> = {},
) {
	return new Response(bytes, {
		headers: {
			'Content-Type': 'image/jpeg',
			'Content-Disposition': contentDisposition(filename),
			'Cache-Control': 'private, max-age=3600',
			...extra,
		},
	});
}

export const GET: APIRoute = async (context) => {
	const id = context.params.id;
	if (!id) {
		return new Response('Missing asset id', { status: 400 });
	}

	const size = context.url.searchParams.get('size')?.toLowerCase() || '';
	const isPreviewSize = size === '500';
	const user = await getSessionUser(context);

	if (size && !isDownloadSizeId(size)) {
		return new Response(JSON.stringify({ error: 'Unknown size' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	if (!isPreviewSize && !user) {
		return new Response(JSON.stringify({ error: 'Login required', login: '/login' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	let remaining: number | null = null;
	if (!isPreviewSize && user && env.DB) {
		remaining = await remainingFullSizeDownloads(env.DB, user.id, user.plan);
		if (remaining === 0) {
			return new Response(
				JSON.stringify({
					error: 'Free full-size downloads used up. Upgrade to Pro for unlimited.',
					upgrade: '/account',
					remaining: 0,
				}),
				{ status: 403, headers: { 'Content-Type': 'application/json' } },
			);
		}
	}

	const asset = await resolveAssetById(env.DB, context.url.origin, id);
	if (!asset) {
		return new Response(JSON.stringify({ error: 'Asset not found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	if (!asset.r2ObjectKey && !asset.previewUrl) {
		return new Response(
			JSON.stringify({ error: 'Asset has no file configured' }),
			{ status: 404, headers: { 'Content-Type': 'application/json' } },
		);
	}

	const filename = sizeFileLabel(asset.slug || 'asset', size || 'original');
	const extra: Record<string, string> = {};
	if (remaining != null) extra['X-Downloads-Remaining'] = String(Math.max(0, remaining - 1));

	const finish = async (bytes: Uint8Array, headers: Record<string, string> = {}) => {
		if (!isPreviewSize && user && env.DB && size) {
			await logFullSizeDownload(env.DB, {
				userId: user.id,
				assetId: asset._id,
				sizeId: size,
			});
		}
		return jpegDownload(bytes, filename, { ...extra, ...headers });
	};

	if (size && asset.r2ObjectKey && env.MEDIA) {
		const variant = await env.MEDIA.get(variantObjectKey(asset.r2ObjectKey, size));
		if (variant) {
			return finish(new Uint8Array(await variant.arrayBuffer()));
		}
	}

	const original = await readOriginalBytes(context, asset.r2ObjectKey || '', asset.previewUrl);
	if (original instanceof Response) return original;

	if (size === '500') {
		try {
			const resized = resizeImageToWidthJpeg(original.bytes, FREE_DOWNLOAD_WIDTH);
			return finish(resized.bytes, {
				'X-Image-Width': String(resized.width),
				'X-Image-Height': String(resized.height),
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Could not resize this file';
			return new Response(JSON.stringify({ error: message }), {
				status: 415,
				headers: { 'Content-Type': 'application/json' },
			});
		}
	}

	if (size === '1k') {
		try {
			const resized = resizeImageToLongEdgeJpeg(original.bytes, 1024);
			return finish(resized.bytes, {
				'X-Image-Width': String(resized.width),
				'X-Image-Height': String(resized.height),
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Could not resize this file';
			return new Response(JSON.stringify({ error: message }), {
				status: 415,
				headers: { 'Content-Type': 'application/json' },
			});
		}
	}

	if (size) {
		return new Response(
			JSON.stringify({
				error: 'This size is still being prepared. Try 500 or 1K, or wait a moment.',
			}),
			{ status: 409, headers: { 'Content-Type': 'application/json' } },
		);
	}

	if (user && env.DB) {
		await logFullSizeDownload(env.DB, {
			userId: user.id,
			assetId: asset._id,
			sizeId: 'original',
		});
	}

	return new Response(original.bytes, {
		headers: {
			'Content-Type': original.contentType || asset.fileType || 'image/jpeg',
			'Content-Disposition': contentDisposition(
				asset.r2ObjectKey?.split('/').pop() || `${asset.slug}.jpg`,
			),
			'Cache-Control': 'private, no-store',
			...extra,
		},
	});
};
