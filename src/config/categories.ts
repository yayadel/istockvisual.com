export const CATEGORIES = [
	{ slug: 'photos', label: 'Photos', sanityValue: 'photos' },
	{ slug: 'illustrations', label: 'Illustrations', sanityValue: 'illustrations' },
	{ slug: 'vectors', label: 'Vectors', sanityValue: 'vectors' },
	{ slug: '3d', label: '3D', sanityValue: '3d' },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]['slug'];

export function getCategory(slug: string) {
	return CATEGORIES.find((c) => c.slug === slug);
}

export function isCategorySlug(slug: string): slug is CategorySlug {
	return CATEGORIES.some((c) => c.slug === slug);
}
