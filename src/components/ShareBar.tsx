import { useState } from 'react';

type Props = {
	title: string;
	url?: string;
};

export default function ShareBar({ title, url }: Props) {
	const [copied, setCopied] = useState(false);
	const shareUrl =
		url || (typeof window !== 'undefined' ? window.location.href : '');

	async function copyLink() {
		if (!shareUrl) return;
		try {
			await navigator.clipboard.writeText(shareUrl);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1400);
		} catch {
			setCopied(false);
		}
	}

	async function nativeShare() {
		if (!shareUrl || typeof navigator === 'undefined' || !navigator.share) {
			await copyLink();
			return;
		}
		try {
			await navigator.share({ title, url: shareUrl, text: title });
		} catch {
			// user cancelled or share failed — ignore
		}
	}

	const encodedUrl = encodeURIComponent(shareUrl);
	const encodedTitle = encodeURIComponent(title);
	const canNativeShare =
		typeof navigator !== 'undefined' && typeof navigator.share === 'function';

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
					href={`https://x.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`}
					target="_blank"
					rel="noopener noreferrer"
				>
					X
				</a>
				<a
					className="share-bar__btn"
					href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`}
					target="_blank"
					rel="noopener noreferrer"
				>
					LinkedIn
				</a>
				<a
					className="share-bar__btn"
					href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
					target="_blank"
					rel="noopener noreferrer"
				>
					Facebook
				</a>
			</div>
		</section>
	);
}
