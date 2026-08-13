import { useEffect, useRef, useState } from 'react';

type Props = {
	title: string;
	url?: string;
	compact?: boolean;
	inlineChannels?: boolean;
};

function ShareIcon({ size = 16 }: { size?: number }) {
	return (
		<svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
			<path
				fill="currentColor"
				d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"
			/>
		</svg>
	);
}

function LinkIcon() {
	return (
		<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
			<path
				fill="currentColor"
				d="M3.9 12a5 5 0 0 1 5-5h4v2h-4a3 3 0 1 0 0 6h4v2h-4a5 5 0 0 1-5-5zm7-1h6v2h-6v-2zm4-4h4a5 5 0 0 1 0 10h-4v-2h4a3 3 0 1 0 0-6h-4V7z"
			/>
		</svg>
	);
}

function MailIcon() {
	return (
		<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
			<path
				fill="currentColor"
				d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5L4 8V6l8 5 8-5v2z"
			/>
		</svg>
	);
}

function XIcon() {
	return (
		<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
			<path
				fill="currentColor"
				d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.743l7.727-8.847L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"
			/>
		</svg>
	);
}

export default function ShareBar({ title, url, compact = true, inlineChannels = false }: Props) {
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
		if (typeof navigator.share !== 'function') return;
		try {
			await navigator.share({ title, url: shareUrl, text: title });
			setOpen(false);
		} catch {
			// cancelled
		}
	}

	const shareUrl = pageUrl || url || '';
	const encodedUrl = encodeURIComponent(shareUrl);
	const encodedTitle = encodeURIComponent(title);
	const mailHref = `mailto:?subject=${encodedTitle}&body=${encodedUrl}`;

	return (
		<section
			className={`share-bar share-bar--menu${open ? ' is-open' : ''}${compact ? ' share-bar--compact' : ''}`}
			ref={rootRef}
			aria-label="Share"
		>
			<button
				type="button"
				className="share-bar__toggle"
				aria-expanded={open}
				aria-haspopup="menu"
				onClick={() => setOpen((value) => !value)}
			>
				<ShareIcon size={18} />
				<span>Share</span>
			</button>

			{open && (
				<div className="share-bar__menu" role="menu">
					<a
						className="share-bar__item"
						role="menuitem"
						href={
							shareUrl
								? `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
								: undefined
						}
						target="_blank"
						rel="noopener noreferrer"
					>
						<span className="share-bar__icon share-bar__icon--facebook" aria-hidden="true">
							f
						</span>
						Facebook
					</a>
					<a
						className="share-bar__item"
						role="menuitem"
						href={
							shareUrl
								? `https://www.pinterest.com/pin/create/button/?url=${encodedUrl}&description=${encodedTitle}`
								: undefined
						}
						target="_blank"
						rel="noopener noreferrer"
					>
						<span className="share-bar__icon share-bar__icon--pinterest" aria-hidden="true">
							P
						</span>
						Pinterest
					</a>
					<a
						className="share-bar__item"
						role="menuitem"
						href={
							shareUrl
								? `https://x.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`
								: undefined
						}
						target="_blank"
						rel="noopener noreferrer"
					>
						<span className="share-bar__icon share-bar__icon--x" aria-hidden="true">
							<XIcon />
						</span>
						Twitter
					</a>
					<a className="share-bar__item" role="menuitem" href={mailHref}>
						<span className="share-bar__icon share-bar__icon--muted" aria-hidden="true">
							<MailIcon />
						</span>
						Email
					</a>
					{canNativeShare && (
						<button type="button" className="share-bar__item" role="menuitem" onClick={nativeShare}>
							<span className="share-bar__icon share-bar__icon--muted" aria-hidden="true">
								<ShareIcon size={18} />
							</span>
							Share via…
						</button>
					)}
					<div className="share-bar__divider" role="separator" />
					<button type="button" className="share-bar__item" role="menuitem" onClick={copyLink}>
						<span className="share-bar__icon share-bar__icon--muted" aria-hidden="true">
							<LinkIcon />
						</span>
						{copied ? 'Copied' : 'Copy link'}
					</button>
				</div>
			)}
		</section>
	);
}
