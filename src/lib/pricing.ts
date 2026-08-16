export type PricingTab = 'long' | 'short';

export type PricingFeature = {
	label: string;
	tip: string;
};

export type PricingPlan = {
	id: string;
	name: string;
	price: string;
	period: string;
	rate: string;
	description: string;
	cta: string;
	href: string;
	features: PricingFeature[];
	featured?: boolean;
	badge?: string;
	note?: string;
	originalPrice?: string;
	highlight?: string;
};

export const FAIR_USE_POLICY =
	'The first 100 high-resolution (2K/4K/8K) downloads each day are unrestricted. After that, a fair-use cap of 10 HD downloads per hour applies to keep server speeds fast for all members and protect against automated scraping.';

const CORE_FEATURES: PricingFeature[] = [
	{
		label: '2K, 4K, and 8K downloads',
		tip: 'HD files while the plan is active. 512 and 1K previews stay free.',
	},
	{
		label: 'JPG, PNG, WEBP, and SVG',
		tip: 'Export the format your project needs. Same CC0 terms on every file.',
	},
	{
		label: 'CC0 commercial and personal use',
		tip: 'Use in ads, sites, and products. Attribution is not required.',
	},
	{
		label: '512 and 1K previews stay free',
		tip: 'Preview sizes remain available after a term plan ends.',
	},
	{
		label: 'In-browser studio tools',
		tip: 'Editor, convert, vectorize, social resize, watermark, and palette.',
	},
	{
		label: 'No auto-renewal',
		tip: 'One-time charge. Plans and passes end on their own.',
	},
];

const LIFETIME_FEATURES: PricingFeature[] = [
	...CORE_FEATURES,
	{
		label: 'Pay once, download forever',
		tip: 'Keep Pro download access for as long as the library is offered.',
	},
	{
		label: '7-day no-questions refund',
		tip: 'Refund within 7 days even if you already downloaded files.',
	},
	{
		label: 'Launch pricing',
		tip: 'Early supporter rate. The listed original price is the later list price.',
	},
];

export const PRICING_FEATURES = CORE_FEATURES.map((item) => item.label);

/** Long-term decoy: year vs Lifetime (+$40) vs 6-month (higher monthly rate). */
export const LONG_PLANS: PricingPlan[] = [
	{
		id: 'six-month',
		name: '6-Month Pro',
		price: '$49.99',
		period: '/ 6 months',
		rate: '$8.33 / month',
		description:
			'Full HD library for six months. Same files as Lifetime — you only choose how long access lasts.',
		cta: 'Choose 6-Month',
		href: '/signup?plan=6month',
		features: CORE_FEATURES,
		highlight: '7-day trial',
		note: 'No-questions-asked refund within 7 days.',
	},
	{
		id: 'lifetime',
		name: 'Lifetime Access',
		price: '$119.99',
		originalPrice: '$299.99',
		period: 'USD one-time',
		rate: 'Pay once, download forever',
		description:
			'One payment unlocks 2K, 4K, and 8K downloads with no end date. Best value for teams that come back.',
		cta: 'Claim Lifetime Access',
		href: '/signup?plan=lifetime',
		features: LIFETIME_FEATURES,
		featured: true,
		badge: 'On Sale Now',
		highlight: '7-day trial',
		note: 'No-questions-asked refund within 7 days.',
	},
	{
		id: 'year',
		name: '12-Month Pro',
		price: '$79.99',
		period: '/ year',
		rate: '$6.66 / month · Save 66%',
		description:
			'A full year of Pro downloads. Lifetime is only $40 more if you expect to keep using the library.',
		cta: 'Choose 12-Month',
		href: '/signup?plan=year',
		features: CORE_FEATURES,
		highlight: '7-day trial',
		note: 'No-questions-asked refund within 7 days.',
	},
];

/** Short-term for one-off jobs. Daily cost pushes users back to Long-Term. */
export const SHORT_PLANS: PricingPlan[] = [
	{
		id: 'day',
		name: '1-Day Pass',
		price: '$5.99',
		period: 'USD / day',
		rate: '$5.99 / day',
		description: 'Same Pro downloads as longer plans, billed for a single day. Built for a tight deadline.',
		cta: 'Get 1-Day Pass',
		href: '/signup?plan=1day',
		features: CORE_FEATURES,
		note: 'Refund only if you have not downloaded any images.',
	},
	{
		id: 'week',
		name: '7-Day Pass',
		price: '$11.99',
		period: 'USD / 7 days',
		rate: '$1.71 / day',
		description: 'A week of HD downloads for one project. Lifetime is usually cheaper than stacking passes.',
		cta: 'Get 7-Day Pass',
		href: '/signup?plan=7day',
		features: CORE_FEATURES,
		featured: true,
		badge: 'Short-Term Pick',
		note: 'Refund only if you have not downloaded any images.',
	},
	{
		id: 'month',
		name: '1-Month Pro',
		price: '$19.99',
		period: '/ month',
		rate: '$0.66 / day',
		description: 'Thirty days of 2K, 4K, and 8K access. No auto-renew. 3-day unused refund window.',
		cta: 'Get 1-Month Pro',
		href: '/signup?plan=month',
		features: CORE_FEATURES,
		highlight: '3-day trial',
		note: 'Refund within 3 days if you have not downloaded any images.',
	},
];

const CORE_FEATURES: PricingFeature[] = [
	{
		label: '2K, 4K, and 8K downloads',
		tip: 'HD files while the plan is active. 512 and 1K previews stay free.',
	},
	{
		label: 'JPG, PNG, WEBP, and SVG',
		tip: 'Export the format your project needs. Same CC0 terms on every file.',
	},
	{
		label: 'CC0 commercial and personal use',
		tip: 'Use in ads, sites, and products. Attribution is not required.',
	},
	{
		label: '512 and 1K previews stay free',
		tip: 'Preview sizes remain available after a term plan ends.',
	},
	{
		label: 'In-browser studio tools',
		tip: 'Editor, convert, vectorize, social resize, watermark, and palette.',
	},
	{
		label: 'No auto-renewal',
		tip: 'One-time charge. Plans and passes end on their own.',
	},
];

const LIFETIME_FEATURES: PricingFeature[] = [
	...CORE_FEATURES,
	{
		label: 'Pay once, download forever',
		tip: 'Keep Pro download access for as long as the library is offered.',
	},
	{
		label: '7-day no-questions refund',
		tip: 'Refund within 7 days even if you already downloaded files.',
	},
	{
		label: 'Launch pricing',
		tip: 'Early supporter rate. The listed original price is the later list price.',
	},
];

export const PRICING_FEATURES = CORE_FEATURES.map((item) => item.label);

export const PRICING_TRUST = [
	{
		title: 'Commercial License Included',
		text: 'Safe for client work, websites, and commercial printing.',
	},
	{
		title: '7-Day Trial on Long-Term',
		text: '6-Month, 12-Month, and Lifetime include a 7-day trial with a no-questions-asked refund. Short-term passes refund only if unused.',
	},
	{
		title: 'No Recurring Fees',
		text: 'One-time charge. No auto-renewal or hidden costs.',
	},
];

export const LIFETIME_WHY =
	'Why Lifetime Access? We are celebrating our platform launch! Early supporters get lifetime access to support our growing library.';

export const LIFETIME_PLAN = LONG_PLANS.find((plan) => plan.id === 'lifetime')!;
export const YEAR_PLAN = LONG_PLANS.find((plan) => plan.id === 'year')!;
export const SIX_MONTH_PLAN = LONG_PLANS.find((plan) => plan.id === 'six-month')!;
export const MONTH_PLAN = SHORT_PLANS.find((plan) => plan.id === 'month')!;

export const PRICING_COPY = {
	longTab: '★ Long-Term (Best Value)',
	longBadge: 'Recommended',
	shortTab: 'Short-Term / Flexible',
	switchHint: 'Planning to use us long-term?',
	switchCta: 'Switch to Lifetime Access & Save Big →',
};
