import { defineType, defineField } from 'sanity';

export const tag = defineType({
	name: 'tag',
	title: 'Tag',
	type: 'document',
	fields: [
		defineField({
			name: 'title',
			title: 'Title',
			type: 'string',
			validation: (rule) => rule.required(),
		}),
		defineField({
			name: 'slug',
			title: 'Slug',
			type: 'slug',
			options: { source: 'title' },
			validation: (rule) => rule.required(),
		}),
	],
});
