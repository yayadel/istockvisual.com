export type PricingTab = 'long' | 'short';

export type PricingPlan = {
	id: string;
	name: string;
	price: string;
	period: string;
	rate: string;
	cta: string;
	href: string;
	featured?: boolean;
	badge?: string;
	note?: string;
	originalPrice?: string;
	highlight?: string;
};

export const FAIR_USE_POLICY =
	'The first 100 high-resolution (2K/4K/8K) downloads each day are unrestricted. After that, a fair-use cap of 10 HD downloads per hour applies to keep server speeds fast for all members and protect against automated scraping.';

/** Long-term decoy: year vs Lifetime (+$40) vs 6-month (higher monthly rate). */
export const LONG_PLANS: PricingPlan[] = [
	{
		id: 'six-month',
		name: '6-Month Pro',
		price: '$49.99',
		period: '/ 6 months',
		rate: '$8.33 / month',
		cta: 'Choose 6-Month',
		href: '/signup?plan=6month',
		highlight: '7-day trial',
		note: 'No-questions-asked refund within 7 days.',
	},
	{
		id: 'lifetime',
		name: 'Lifetime Access',
		price: '$119.99',
		originalPrice: '$299.99',
		period: 'One-Time Payment',
		rate: 'Pay once, download forever',
		cta: 'Claim Lifetime Access',
		href: '/signup?plan=lifetime',
		featured: true,
		badge: 'Launch · Most Popular',
		highlight: '7-day trial',
		note: 'No-questions-asked refund within 7 days.',
	},
	{
		id: 'year',
		name: '12-Month Pro',
		price: '$79.99',
		period: '/ year',
		rate: '$6.66 / month · Save 66%',
		cta: 'Choose 12-Month',
		href: '/signup?plan=year',
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
		period: '',
		rate: '$5.99 / day',
		cta: 'Get 1-Day Pass',
		href: '/signup?plan=1day',
		note: 'Refund only if you have not downloaded any images.',
	},
	{
		id: 'week',
		name: '7-Day Pass',
		price: '$11.99',
		period: '',
		rate: '$1.71 / day',
		cta: 'Get 7-Day Pass',
		href: '/signup?plan=7day',
		note: 'Refund only if you have not downloaded any images.',
	},
	{
		id: 'month',
		name: '1-Month Pro',
		price: '$19.99',
		period: '/ month',
		rate: '$0.66 / day',
		cta: 'Get 1-Month Pro',
		href: '/signup?plan=month',
		highlight: '3-day trial',
		note: 'Refund within 3 days if you have not downloaded any images.',
	},
];

export const PRICING_FEATURES = [
	'2K, 4K, and 8K downloads',
	'JPG, PNG, WEBP, and SVG',
	'Commercial and personal use',
];

export const PRICING_TRUST = [
	{
		title: 'Commercial License Included',
		text: 'Safe for client work, websites, and commercial printing.',
	},
	{
		title: 'Unused-Plan Refund',
		text: 'Refund if you have not downloaded any images. 1-Month Pro includes a 3-day trial.',
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
