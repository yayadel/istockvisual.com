import { DOWNLOAD_FORMATS } from '../lib/download-formats';
import DetailSectionIcon from './DetailSectionIcon';

type CategoryLink = {
	label: string;
	href: string;
};

type Props = {
	license?: string;
	licenseHref?: string;
	/** Topical category (exactly 1) from the fixed vocabulary. */
	categories?: CategoryLink[];
	/** @deprecated Prefer categories[] */
	categoryLabel?: string;
	categoryHref?: string;
};

const FORMAT_LABELS = DOWNLOAD_FORMATS.map((format) => format.toUpperCase()).join(', ');

export default function BasicInfoPanel({
	license = 'Free to use — commercial OK, attribution required',
	licenseHref = '/info/license',
	categories,
	categoryLabel,
	categoryHref,
}: Props) {
	const categoryLinks =
		categories && categories.length > 0
			? categories
			: categoryLabel
				? [{ label: categoryLabel, href: categoryHref || '' }]
				: [];

	return (
		<section className="basic-info-panel is-open" aria-label="Basic information">
			<h2 className="basic-info-panel__title">
				<DetailSectionIcon name="info" />
				<span>Basic information</span>
			</h2>
			<div className="basic-info-panel__body">
				<ul className="meta-list">
					<li>
						<span>License</span>
						<span>
							{licenseHref ? <a href={licenseHref}>{license}</a> : license}
						</span>
					</li>
					{categoryLinks.length > 0 && (
						<li>
							<span>Category</span>
							<span className="meta-list__links">
								{categoryLinks.map((item, index) => (
									<span key={item.label}>
										{index > 0 ? ', ' : null}
										{item.href ? <a href={item.href}>{item.label}</a> : item.label}
									</span>
								))}
							</span>
						</li>
					)}
					<li>
						<span>Type</span>
						<span>{FORMAT_LABELS}</span>
					</li>
				</ul>
				<ul className="download-rules" aria-label="Download notes">
					<li>500 and 1K: free download, no login required.</li>
					<li>2K / 4K / 8K: requires a registered Pro membership.</li>
					<li>Pro: unlimited high-resolution downloads.</li>
				</ul>
			</div>
		</section>
	);
}
