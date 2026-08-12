export type MediaBucket = {
	get(key: string): Promise<R2ObjectBody | null>;
	head(key: string): Promise<R2Object | null>;
};

export async function getMediaObject(bucket: MediaBucket, key: string) {
	return bucket.get(key);
}

export function contentDisposition(filename: string) {
	const safe = filename.replace(/[^\w.\-]+/g, '_');
	return `attachment; filename="${safe}"`;
}
