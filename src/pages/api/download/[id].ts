import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { createAuth, type AppUser } from '../../../lib/auth';
import {
	FREE_DOWNLOAD_EDGE,
	isDownloadSizeId,
	isFreeDownloadSize,
	normalizeDownloadSizeId,
	sizeFileLabel,
	filenameFromTitle,
} from '../../../lib/download-sizes';
import { resolveAssetById } from '../../../lib/generate-asset';
import { contentDisposition } from '../../../lib/r2';
import { resizeImageToLongEdgeJpeg } from '../../../lib/resize-jpeg';

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

	const sizeRaw = context.url.searchParams.get('size')?.toLowerCase() || '';
	const size = sizeRaw ? normalizeDownloadSizeId(sizeRaw) || '' : '';
	const freeSize = isFreeDownloadSize(size);
	const user = await getSessionUser(context);

	if (sizeRaw && !isDownloadSizeId(sizeRaw)) {
		return new Response(JSON.stringify({ error: 'Unknown size' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	// 512 / 1K: free for everyone. 2K / 4K / 8K: Pro only.
	if (size && !freeSize) {
		if (!user) {
			return new Response(JSON.stringify({ error: 'Login required', login: '/login' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' },
			});
		}
		if (user.plan !== 'pro') {
			return new Response(
				JSON.stringify({
					error: 'Pro membership required for 2K, 4K, and 8K downloads.',
					upgrade: '/price',
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

	const filename = sizeFileLabel(asset.title || asset.slug || 'asset', size || 'original');

	const finish = async (bytes: Uint8Array, headers: Record<string, string> = {}) =>
		jpegDownload(bytes, filename, headers);

	const original = await readOriginalBytes(context, asset.r2ObjectKey || '', asset.previewUrl);
	if (original instanceof Response) return original;

	if (size === '500') {
		try {
			const resized = resizeImageToLongEdgeJpeg(original.bytes, FREE_DOWNLOAD_EDGE);
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

	if (size === '2k' || size === '4k' || size === '8k') {
		return finish(original.bytes, { 'X-Master-Size': '4k' });
	}

	// Original / unspecified size: Pro only
	if (!user) {
		return new Response(JSON.stringify({ error: 'Login required', login: '/login' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' },
		});
	}
	if (user.plan !== 'pro') {
		return new Response(
			JSON.stringify({
				error: 'Pro membership required for original downloads.',
				upgrade: '/price',
			}),
			{ status: 403, headers: { 'Content-Type': 'application/json' } },
		);
	}

	return new Response(original.bytes, {
		headers: {
			'Content-Type': original.contentType || asset.fileType || 'image/jpeg',
			'Content-Disposition': contentDisposition(
				`${filenameFromTitle(asset.title || asset.slug || 'asset')}.jpg`,
			),
			'Cache-Control': 'private, no-store',
		},
	});
};
