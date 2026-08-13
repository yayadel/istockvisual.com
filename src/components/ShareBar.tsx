import { useEffect, useRef, useState } from 'react';

type Props = {
	title: string;
	url?: string;
	/** Compact control for the title row. */
	compact?: boolean;
};

export default function ShareBar({ title, url, compact = false }: Props) {
	const [copied, setCopied] = useState(false);
	const [pageUrl, setPageUrl] = useState(url || '');
	const [canNativeShare, setCanNativeShare] = useState(false);
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLElement>(null);

	useEffect(() => {
		if (!url) setPageUrl(window.location.href);
		setCanNativeShare(typeof navigator.share === 'function');
	}, [url]);

	useEffect(() => {
		if (!open) return;
		const onPointer = (event: MouseEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setOpen(false);
		};
		window.addEventListener('mousedown', onPointer);
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('mousedown', onPointer);
			window.removeEventListener('keydown', onKey);
		};
	}, [open]);

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
				setOpen(false);
				return;
			} catch {
				return;
			}
		}
		await copyLink();
	}

	const shareUrl = pageUrl || url || '';
	const encodedUrl = encodeURIComponent(shareUrl);
	const encodedTitle = encodeURIComponent(title);

	const actions = (
		<>
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
		</>
	);

	if (compact) {
		return (
			<section className={`share-bar share-bar--compact${open ? ' is-open' : ''}`} ref={rootRef}>
				<button
					type="button"
					className="share-bar__toggle"
					aria-expanded={open}
					aria-haspopup="menu"
					onClick={() => setOpen((value) => !value)}
				>
					Share
					<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
						<path fill="currentColor" d="M3.2 5.6 8 10.4l4.8-4.8 1.1 1.1L8 12.6 2.1 6.7z" />
					</svg>
				</button>
				{open && (
					<div className="share-bar__menu" role="menu">
						{actions}
					</div>
				)}
			</section>
		);
	}

	return (
		<section className="share-bar" aria-label="Share" ref={rootRef}>
			<div className="share-bar__head">
				<span className="share-bar__label">Share</span>
			</div>
			<div className="share-bar__actions">{actions}</div>
		</section>
	);
}
