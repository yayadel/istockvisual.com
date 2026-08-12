import { defineType, defineField } from 'sanity';

export const asset = defineType({
	name: 'asset',
	title: 'Asset',
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
			options: { source: 'title', maxLength: 96 },
			validation: (rule) => rule.required(),
		}),
		defineField({
			name: 'category',
			title: 'Category',
			type: 'string',
			options: {
				list: [
					{ title: 'Photos', value: 'photos' },
					{ title: 'Illustrations', value: 'illustrations' },
					{ title: 'Vectors', value: 'vectors' },
					{ title: '3D', value: '3d' },
				],
				layout: 'radio',
			},
			validation: (rule) => rule.required(),
		}),
		defineField({
			name: 'description',
			title: 'Description',
			type: 'text',
			rows: 4,
		}),
		defineField({
			name: 'tags',
			title: 'Tags',
			type: 'array',
			of: [{ type: 'string' }],
			options: { layout: 'tags' },
		}),
		defineField({
			name: 'previewUrl',
			title: 'Preview URL',
			type: 'url',
			description: 'Public preview image URL (Sanity CDN or R2 public URL).',
		}),
		defineField({
			name: 'r2ObjectKey',
			title: 'R2 Object Key',
			type: 'string',
			description: 'Full object key in the Cloudflare R2 MEDIA bucket.',
		}),
		defineField({
			name: 'fileType',
			title: 'File MIME type',
			type: 'string',
		}),
		defineField({
			name: 'width',
			title: 'Width',
			type: 'number',
		}),
		defineField({
			name: 'height',
			title: 'Height',
			type: 'number',
		}),
		defineField({
			name: 'license',
			title: 'License',
			type: 'string',
		}),
		defineField({
			name: 'isPremium',
			title: 'Pro only',
			type: 'boolean',
			initialValue: false,
		}),
		defineField({
			name: 'publishedAt',
			title: 'Published at',
			type: 'datetime',
		}),
	],
	preview: {
		select: {
			title: 'title',
			subtitle: 'category',
			mediaUrl: 'previewUrl',
		},
		prepare({ title, subtitle, mediaUrl }) {
			return {
				title,
				subtitle,
				media: mediaUrl
					? // Sanity preview expects an image; URL string still shows in list subtitle path
						undefined
					: undefined,
			};
		},
	},
});
