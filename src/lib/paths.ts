/** Clean URL helpers for search results (/s/). Tag archives (/t/) redirect to /s/. */

export function toPathSlug(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 96);
}

export function fromPathSlug(slug: string): string {
	try {
		return decodeURIComponent(slug).replace(/-+/g, ' ').trim();
	} catch {
		return slug.replace(/-+/g, ' ').trim();
	}
}

export function tagPath(tag: string): string {
	const slug = toPathSlug(tag);
	return slug ? `/t/${encodeURIComponent(slug)}` : '/t/';
}

export function searchPath(query: string, category = 'all'): string {
	const slug = toPathSlug(query);
	const base = slug ? `/s/${encodeURIComponent(slug)}` : '/s/';
	if (category && category !== 'all') {
		return `${base}?category=${encodeURIComponent(category)}`;
	}
	return base;
}

export function tagMatches(tag: string, slug: string): boolean {
	return toPathSlug(tag) === toPathSlug(slug);
}
