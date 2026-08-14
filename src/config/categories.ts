export const CATEGORIES = [
	{ slug: 'photos', label: 'Photos', sanityValue: 'photos', hideUntilHasContent: false },
	{ slug: 'illustrations', label: 'Illustrations', sanityValue: 'illustrations', hideUntilHasContent: true },
	{ slug: 'vectors', label: 'Vectors', sanityValue: 'vectors', hideUntilHasContent: true },
	{ slug: '3d', label: '3D', sanityValue: '3d', hideUntilHasContent: true },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]['slug'];

export function getCategory(slug: string) {
	return CATEGORIES.find((c) => c.slug === slug);
}

export function isCategorySlug(slug: string): slug is CategorySlug {
	return CATEGORIES.some((c) => c.slug === slug);
}

/** Nav / footer / search type list: hide empty media types until they have library content. */
export function visibleNavCategories(
	populatedSlugs: Iterable<string>,
	alwaysInclude?: string | null,
) {
	const populated = new Set(populatedSlugs);
	return CATEGORIES.filter(
		(category) =>
			!category.hideUntilHasContent ||
			populated.has(category.slug) ||
			category.slug === alwaysInclude,
	);
}
