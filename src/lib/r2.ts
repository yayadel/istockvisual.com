export type MediaBucket = {
	get(key: string): Promise<R2ObjectBody | null>;
	head(key: string): Promise<R2Object | null>;
};

export async function getMediaObject(bucket: MediaBucket, key: string) {
	return bucket.get(key);
}

export function contentDisposition(filename: string) {
	const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'");
	const encoded = encodeURIComponent(filename).replace(/[!'()*]/g, (char) =>
		`%${char.charCodeAt(0).toString(16).toUpperCase()}`,
	);
	return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
