import { useId, useState } from 'react';

type TabId = 'long' | 'short';

type Plan = {
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

const LONG_PLANS: Plan[] = [
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
		rate: 'Pay once, download forever',
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

const SHORT_PLANS: Plan[] = [
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

const FEATURES = [
	'Unlimited 2K, 4K, and 8K downloads',
	'JPG, PNG, WEBP, and SVG',
	'Commercial and personal use',
];

function PlanCard({ plan }: { plan: Plan }) {
	return (
		<article className={`pricing-card${plan.featured ? ' is-featured' : ''}`}>
			{plan.badge ? <p className="pricing-card__badge">🔥 {plan.badge}</p> : null}
			<h2>{plan.name}</h2>
			<p className="pricing-card__amount">
				{plan.price}
				{plan.period ? <span> {plan.period}</span> : null}
			</p>
			<p className="pricing-card__rate">{plan.rate}</p>
			<ul className="pricing-card__features">
				{FEATURES.map((item) => (
					<li key={item}>{item}</li>
				))}
			</ul>
			<a className={plan.featured ? 'btn btn--primary' : 'btn btn--ghost'} href={plan.href}>
				{plan.cta}
			</a>
			{plan.note ? <p className="pricing-card__note">✔ {plan.note}</p> : null}
		</article>
	);
}

export default function PricingPlans() {
	const [tab, setTab] = useState<TabId>('long');
	const tabPrefix = useId();
	const longId = `${tabPrefix}-long`;
	const shortId = `${tabPrefix}-short`;
	const plans = tab === 'long' ? LONG_PLANS : SHORT_PLANS;

	return (
		<div className="pricing-plans">
			<div className="pricing-tabs" role="tablist" aria-label="Plan duration">
				<button
					type="button"
					id={longId}
					role="tab"
					aria-selected={tab === 'long'}
					aria-controls={`${longId}-panel`}
					className={`pricing-tabs__tab${tab === 'long' ? ' is-active' : ''}`}
					onClick={() => setTab('long')}
				>
					<span>★ Long-Term (Best Value)</span>
					<em>Lifetime deal</em>
				</button>
				<button
					type="button"
					id={shortId}
					role="tab"
					aria-selected={tab === 'short'}
					aria-controls={`${shortId}-panel`}
					className={`pricing-tabs__tab${tab === 'short' ? ' is-active' : ''}`}
					onClick={() => setTab('short')}
				>
					Short-Term / Flexible
				</button>
			</div>

			{tab === 'short' ? (
				<p className="pricing-switch-hint">
					Planning to use us long-term?{' '}
					<button type="button" onClick={() => setTab('long')}>
						Switch to Lifetime Access &amp; Save Big →
					</button>
				</p>
			) : null}

			<div
				id={tab === 'long' ? `${longId}-panel` : `${shortId}-panel`}
				role="tabpanel"
				aria-labelledby={tab === 'long' ? longId : shortId}
				className="pricing-grid"
			>
				{plans.map((plan) => (
					<PlanCard key={plan.id} plan={plan} />
				))}
			</div>
		</div>
	);
}
