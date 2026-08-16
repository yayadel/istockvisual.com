import { useId, useState } from 'react';
import {
	LIFETIME_WHY,
	LONG_PLANS,
	PRICING_COPY,
	PRICING_TRUST,
	SHORT_PLANS,
	type PricingPlan,
	type PricingTab,
} from '../lib/pricing';

function PlanCard({ plan }: { plan: PricingPlan }) {
	return (
		<article className={`pricing-card${plan.featured ? ' is-featured' : ''}`}>
			<p className={`pricing-card__badge${plan.badge ? '' : ' is-empty'}`}>
				{plan.badge || '\u00a0'}
			</p>
			<h2>{plan.name}</h2>
			<p className="pricing-card__amount">
				{plan.originalPrice ? (
					<del aria-label={`Was ${plan.originalPrice}`}>{plan.originalPrice}</del>
				) : null}
				<strong>{plan.price}</strong>
				{plan.period ? <span>{plan.period}</span> : null}
			</p>
			<p className="pricing-card__rate">{plan.rate}</p>
			<p className="pricing-card__desc">{plan.description}</p>
			{plan.highlight ? <p className="pricing-card__highlight">{plan.highlight}</p> : <p className="pricing-card__highlight is-empty">&nbsp;</p>}
			<a className={plan.featured ? 'btn btn--primary' : 'btn btn--ghost'} href={plan.href}>
				{plan.cta}
			</a>
			<p className="pricing-card__includes">Plan Includes:</p>
			<ul className="pricing-card__features">
				{plan.features.map((item) => (
					<li key={item.label}>
						<span className="pricing-card__check" aria-hidden="true">
							✓
						</span>
						<span>{item.label}</span>
						<span className="pricing-card__info" title={item.tip} aria-label={item.tip}>
							i
						</span>
					</li>
				))}
			</ul>
			{plan.note ? <p className="pricing-card__note">* {plan.note}</p> : null}
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

			<ul className="pricing-trust">
				{PRICING_TRUST.map((item) => (
					<li key={item.title}>
						<strong>✔ {item.title}</strong>
						<span>{item.text}</span>
					</li>
				))}
			</ul>
			<p className="pricing-trust__why">{LIFETIME_WHY}</p>
		</div>
	);
}
