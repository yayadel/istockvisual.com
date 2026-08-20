export const QUICK_EDIT_INTRO =
	'Free stock download. Crop, Filter, Cutout, Background Remove, Resize, or Watermark before you save. 512 and 1K stay free.';

export const QUICK_EDIT_SEO_BLURB = QUICK_EDIT_INTRO;

export const QUICK_EDIT_ACTIONS = [
	{
		id: 'crop-16-9',
		label: 'Crop to 16:9',
		shortLabel: '16:9',
		detail: 'Desktop wallpaper and video cover',
	},
	{
		id: 'crop-1-1',
		label: 'Crop to 1:1',
		shortLabel: '1:1',
		detail: 'Social avatar and Instagram post',
	},
	{
		id: 'crop-9-16',
		label: 'Crop to 9:16',
		shortLabel: '9:16',
		detail: 'Mobile wallpaper and Stories',
	},
	{
		id: 'crop-4-3',
		label: 'Crop to 4:3',
		shortLabel: '4:3',
		detail: 'Classic print and presentation',
	},
	{
		id: 'filter-bw',
		label: 'Black and white filter',
		shortLabel: 'Black & white',
		detail: 'Convert this photo to grayscale',
	},
	{
		id: 'cutout',
		label: 'Cutout & BG Remove',
		shortLabel: 'Cutout & BG Remove',
		detail: 'Cut out the subject',
	},
	{
		id: 'finetune',
		label: 'Fine-tune brightness',
		shortLabel: 'Brightness',
		detail: 'Adjust contrast, warmth, and blur',
	},
	{
		id: 'resize',
		label: 'Resize for download',
		shortLabel: 'Resize',
		detail: 'Change pixel dimensions before export',
	},
	{
		id: 'watermark',
		label: 'Add a watermark',
		shortLabel: 'Watermark',
		detail: 'Place a logo or text overlay',
	},
] as const;

export type QuickEditId = (typeof QUICK_EDIT_ACTIONS)[number]['id'];
