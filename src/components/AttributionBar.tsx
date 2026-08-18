import { useCallback, useState } from 'react';
import { buildPhotoAttribution } from '../lib/attribution';
import { copyTextSafe } from '../lib/clipboard';
import { IMAGE_SOURCE_NOTICE, LICENSE_PATH } from '../lib/seo';

function CopyIcon() {
	return (
		<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
			<rect x="5.5" y="5.5" width="8" height="8" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
			<path
				d="M3.5 10.5h-1A1.5 1.5 0 0 1 1 9V3.5A1.5 1.5 0 0 1 2.5 2H8a1.5 1.5 0 0 1 1.5 1.5v1"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.4"
			/>
		</svg>
	);
}

type Props = {
	pageUrl: string;
};

export default function AttributionBar({ pageUrl }: Props) {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(async () => {
		const text = buildPhotoAttribution(pageUrl);
		if (!text) return;

		let ok = false;
		try {
			ok = await copyTextSafe(text);
		} catch {
			ok = false;
		}

		const toast = document.getElementById('copyNotification');
		if (toast) {
			toast.textContent = ok ? 'Copied' : 'Copy unavailable';
		}

		if (ok) {
			setCopied(true);
			window.setTimeout(() => {
				setCopied(false);
				if (toast && toast.textContent === 'Copied') toast.textContent = '';
			}, 1400);
		}
	}, [pageUrl]);

	return (
		<div className="attribution-bar">
			<a className="attribution-bar__license" href={LICENSE_PATH}>
				Free to Use (CC0)
			</a>
			<span className="attribution-bar__source">{IMAGE_SOURCE_NOTICE}</span>
			<button
				type="button"
				className={`attribution-bar__copy${copied ? ' is-copied' : ''}`}
				data-copy={buildPhotoAttribution(pageUrl) || undefined}
				onClick={() => void handleCopy()}
				aria-label={copied ? 'Copied' : 'Copy Attribution'}
			>
				<CopyIcon />
				<span>{copied ? 'Copied' : 'Copy Attribution'}</span>
			</button>
			<p id="copyNotification" className="attribution-bar__toast" role="status" aria-live="polite" />
		</div>
	);
}
