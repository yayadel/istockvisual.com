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
};

/** Long-term decoy: year vs Lifetime (+$20) vs 6-month (higher monthly rate). */
export const LONG_PLANS: PricingPlan[] = [
	{
		id: 'year',
		name: '12-Month Pro',
		price: '$39.99',
		period: '/ year',
		rate: '$3.33 / month',
		cta: 'Get 12-Month Pro',
		href: '/signup?plan=year',
	},
	{
		id: 'lifetime',
		name: 'Lifetime Access',
		price: '$59.99',
		period: 'Pay once',
		rate: '★ Pay once, download forever',
		cta: 'Get Lifetime Access',
		href: '/signup?plan=lifetime',
		featured: true,
		badge: 'Most Popular',
		note: 'One-time payment. No auto-renewal. No hidden fees.',
	},
	{
		id: 'six-month',
		name: '6-Month Pro',
		price: '$29.99',
		period: '/ 6 mos',
		rate: '$5.00 / month',
		cta: 'Get 6-Month Pro',
		href: '/signup?plan=6month',
	},
];

/** Short-term for one-off jobs. Four month-passes ≈ Lifetime. */
export const SHORT_PLANS: PricingPlan[] = [
	{
		id: 'day',
		name: '1-Day Pass',
		price: '$3.99',
		period: '',
		rate: '$3.99 / day',
		cta: 'Get 1-Day Pass',
		href: '/signup?plan=1day',
	},
	{
		id: 'week',
		name: '7-Day Pass',
		price: '$7.99',
		period: '',
		rate: '$1.14 / day',
		cta: 'Get 7-Day Pass',
		href: '/signup?plan=7day',
	},
	{
		id: 'month',
		name: '1-Month Pro',
		price: '$12.99',
		period: '/ month',
		rate: '$0.43 / day',
		cta: 'Get 1-Month Pro',
		href: '/signup?plan=month',
	},
];

export const PRICING_FEATURES = [
	'Unlimited 2K, 4K, and 8K downloads',
	'JPG, PNG, WEBP, and SVG',
	'Commercial and personal use',
];

export const LIFETIME_PLAN = LONG_PLANS.find((plan) => plan.id === 'lifetime')!;
export const YEAR_PLAN = LONG_PLANS.find((plan) => plan.id === 'year')!;
export const MONTH_PLAN = SHORT_PLANS.find((plan) => plan.id === 'month')!;

export const PRICING_COPY = {
	longTab: '★ Long-Term (Best Value)',
	longBadge: 'Save up to 70%',
	shortTab: 'Short-Term / Flexible',
	switchHint: 'Planning to use us long-term?',
	switchCta: 'Switch to Lifetime Access & Save Big →',
};
