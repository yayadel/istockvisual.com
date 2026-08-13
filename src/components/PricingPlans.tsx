import { useId, useState } from 'react';
import {
	LONG_PLANS,
	PRICING_COPY,
	PRICING_FEATURES,
	SHORT_PLANS,
	type PricingPlan,
	type PricingTab,
} from '../lib/pricing';

function PlanCard({ plan }: { plan: PricingPlan }) {
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
				{PRICING_FEATURES.map((item) => (
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
	const [tab, setTab] = useState<PricingTab>('long');
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
					<span>{PRICING_COPY.longTab}</span>
					<em>{PRICING_COPY.longBadge}</em>
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
					{PRICING_COPY.shortTab}
				</button>
			</div>

			{tab === 'short' ? (
				<p className="pricing-switch-hint">
					{PRICING_COPY.switchHint}{' '}
					<button type="button" onClick={() => setTab('long')}>
						{PRICING_COPY.switchCta}
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
