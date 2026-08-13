import { useState } from 'react';

type Props = {
	license?: string;
	fileType?: string;
	dimensions?: string;
	medium?: string;
	keyword?: string;
	keywordHref?: string;
};

export default function BasicInfoPanel({
	license = 'Standard',
	fileType = '—',
	dimensions = '—',
	medium,
	keyword,
	keywordHref,
}: Props) {
	const [open, setOpen] = useState(false);

	return (
		<div className={`basic-info-panel${open ? ' is-open' : ''}`}>
			<button
				type="button"
				className="basic-info-panel__toggle"
				aria-expanded={open}
				onClick={() => setOpen((value) => !value)}
			>
				<span>Basic information</span>
				<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
					<path fill="currentColor" d="M3.2 5.6 8 10.4l4.8-4.8 1.1 1.1L8 12.6 2.1 6.7z" />
				</svg>
			</button>

			{open && (
				<div className="basic-info-panel__body">
					<ul className="meta-list">
						<li>
							<span>License</span>
							<span>{license}</span>
						</li>
						<li>
							<span>Type</span>
							<span>{fileType}</span>
						</li>
						<li>
							<span>Dimensions</span>
							<span>{dimensions}</span>
						</li>
						{medium && (
							<li>
								<span>Medium</span>
								<span>{medium}</span>
							</li>
						)}
						{keyword && (
							<li>
								<span>Keyword</span>
								<span>
									{keywordHref ? <a href={keywordHref}>{keyword}</a> : keyword}
								</span>
							</li>
						)}
					</ul>
					<ul className="download-rules">
						<li>500 and 1K: free download, no login required. Default is 1K.</li>
						<li>2K / 4K / 8K: requires a registered Pro membership.</li>
						<li>Pro: unlimited high-resolution downloads.</li>
					</ul>
				</div>
			)}
		</div>
	);
}
