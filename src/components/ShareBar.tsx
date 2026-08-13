import { useEffect, useState } from 'react';

type Props = {
	title: string;
	url?: string;
};

export default function ShareBar({ title, url }: Props) {
	const [copied, setCopied] = useState(false);
	const [pageUrl, setPageUrl] = useState(url || '');
	const [canNativeShare, setCanNativeShare] = useState(false);

	useEffect(() => {
		if (!url) setPageUrl(window.location.href);
		setCanNativeShare(typeof navigator.share === 'function');
	}, [url]);

	async function copyLink() {
		const shareUrl = pageUrl || window.location.href;
		try {
			await navigator.clipboard.writeText(shareUrl);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1400);
		} catch {
			setCopied(false);
		}
	}

	async function nativeShare() {
		const shareUrl = pageUrl || window.location.href;
		if (typeof navigator.share === 'function') {
			try {
				await navigator.share({ title, url: shareUrl, text: title });
				return;
			} catch {
				// cancelled
				return;
			}
		}
		await copyLink();
	}

	const shareUrl = pageUrl || url || '';
	const encodedUrl = encodeURIComponent(shareUrl);
	const encodedTitle = encodeURIComponent(title);

	return (
		<section className="share-bar" aria-label="Share">
			<div className="share-bar__head">
				<span className="share-bar__label">Share</span>
			</div>
			<div className="share-bar__actions">
				<button type="button" className="share-bar__btn" onClick={copyLink}>
					{copied ? 'Copied' : 'Copy link'}
				</button>
				{canNativeShare && (
					<button type="button" className="share-bar__btn" onClick={nativeShare}>
						Share…
					</button>
				)}
				<a
					className="share-bar__btn"
					href={shareUrl ? `https://x.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}` : undefined}
					target="_blank"
					rel="noopener noreferrer"
					aria-disabled={!shareUrl}
				>
					X
				</a>
				<a
					className="share-bar__btn"
					href={
						shareUrl
							? `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`
							: undefined
					}
					target="_blank"
					rel="noopener noreferrer"
				>
					LinkedIn
				</a>
				<a
					className="share-bar__btn"
					href={
						shareUrl ? `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` : undefined
					}
					target="_blank"
					rel="noopener noreferrer"
				>
					Facebook
				</a>
			</div>
		</section>
	);
}
