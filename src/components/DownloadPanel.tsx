import { useEffect, useMemo, useRef, useState } from 'react';
import {
	DOWNLOAD_FORMATS,
	convertDownloadBlob,
	downloadFileLabel,
	type DownloadFormat,
} from '../lib/download-formats';
import {
	DOWNLOAD_SIZES,
	isFreeDownloadSize,
	outputSizeForDownload,
	type DownloadSizeId,
} from '../lib/download-sizes';

type Props = {
	assetId: string;
	title: string;
	slug: string;
	previewUrl?: string;
	sourceWidth?: number;
	sourceHeight?: number;
	loggedIn: boolean;
	isPro: boolean;
	loginHref: string;
	signupHref?: string;
	upgradeHref?: string;
};

function triggerDownload(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function CrownIcon() {
	return (
		<svg className="download-pro-icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
			<path
				fill="currentColor"
				d="M1.5 12.5h13v1.2H1.5zm.8-7.2 2.7 2.1L8 3.2l2.9 4.2 2.8-2.1.7 7H1.6z"
			/>
		</svg>
	);
}

function ChevronIcon() {
	return (
		<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
			<path fill="currentColor" d="M3.2 5.6 8 10.4l4.8-4.8 1.1 1.1L8 12.6 2.1 6.7z" />
		</svg>
	);
}

export default function DownloadPanel({
	assetId,
	title,
	slug,
	previewUrl,
	sourceWidth = 1536,
	sourceHeight = 1024,
	loggedIn,
	isPro,
	loginHref,
	signupHref = '/signup',
}: Props) {
	const [selected, setSelected] = useState<DownloadSizeId>('1k');
	const [menuOpen, setMenuOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [natural, setNatural] = useState({ width: sourceWidth, height: sourceHeight });
	const [authModalOpen, setAuthModalOpen] = useState(false);
	const [plansModalOpen, setPlansModalOpen] = useState(false);
	const [pendingSize, setPendingSize] = useState<string | null>(null);
	const rootRef = useRef<HTMLDivElement>(null);

	const anyModalOpen = authModalOpen || plansModalOpen;

	useEffect(() => {
		if (!previewUrl) return;
		const image = new Image();
		image.onload = () => {
			if (image.naturalWidth && image.naturalHeight) {
				setNatural({ width: image.naturalWidth, height: image.naturalHeight });
			}
		};
		image.src = previewUrl;
	}, [previewUrl]);

	useEffect(() => {
		if (!anyModalOpen) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				setAuthModalOpen(false);
				setPlansModalOpen(false);
			}
		};
		document.body.classList.add('download-auth-modal-open');
		window.addEventListener('keydown', onKey);
		return () => {
			document.body.classList.remove('download-auth-modal-open');
			window.removeEventListener('keydown', onKey);
		};
	}, [anyModalOpen]);

	useEffect(() => {
		if (!menuOpen) return;
		const onPointer = (event: MouseEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false);
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setMenuOpen(false);
		};
		window.addEventListener('mousedown', onPointer);
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('mousedown', onPointer);
			window.removeEventListener('keydown', onKey);
		};
	}, [menuOpen]);

	const sizes = useMemo(
		() =>
			DOWNLOAD_SIZES.map((size) => ({
				...size,
				output: outputSizeForDownload(natural.width, natural.height, size),
			})),
		[natural.height, natural.width],
	);

	const selectedSize = sizes.find((size) => size.id === selected) || sizes[1]!;

	function gateSize(sizeId: DownloadSizeId): boolean {
		const size = DOWNLOAD_SIZES.find((item) => item.id === sizeId);
		if (!size) return false;

		if (!isFreeDownloadSize(size.id)) {
			if (!loggedIn) {
				setPendingSize(size.label);
				setMenuOpen(false);
				setAuthModalOpen(true);
				return false;
			}
			if (!isPro) {
				setPendingSize(size.label);
				setMenuOpen(false);
				setPlansModalOpen(true);
				return false;
			}
		}
		return true;
	}

	async function downloadSize(sizeId: DownloadSizeId, format: DownloadFormat = 'jpg') {
		if (!gateSize(sizeId)) return;

		setBusy(true);
		setError(null);
		setSelected(sizeId);
		setMenuOpen(false);

		try {
			const res = await fetch(`/api/download/${assetId}?size=${sizeId}`);
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error || 'Download failed');
			}
			const source = await res.blob();
			const output = await convertDownloadBlob(source, format);
			triggerDownload(output, downloadFileLabel(slug, sizeId, format));
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Download failed');
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="download-panel" ref={rootRef}>
			<div className="download-split-wrap">
				<button
					type="button"
					className={`download-split${menuOpen ? ' is-open' : ''}`}
					disabled={busy}
					aria-expanded={menuOpen}
					aria-haspopup="listbox"
					onClick={() => setMenuOpen((open) => !open)}
				>
					<span className="download-split__label">Free Download</span>
					<ChevronIcon />
				</button>

				{menuOpen && (
					<ul className="download-menu" role="listbox" aria-label="Download sizes">
						{sizes.map((size) => {
							const dims = `${size.output.width} × ${size.output.height}`;
							const needsPro = !isFreeDownloadSize(size.id);
							const isSelected = selected === size.id;
							return (
								<li
									key={size.id}
									role="option"
									aria-selected={isSelected}
									className={`download-menu__row${isSelected ? ' is-selected' : ''}`}
								>
									<span className="download-menu__meta">
										{needsPro ? (
											<em className="download-tier download-tier--pro">Pro</em>
										) : (
											<span className="download-tier download-tier--free">Free</span>
										)}
										<span className="download-menu__dims">{dims}</span>
									</span>
									<span className="download-menu__formats">
										{DOWNLOAD_FORMATS.map((format) => (
											<button
												key={format}
												type="button"
												className="download-menu__format"
												disabled={busy}
												onClick={() => void downloadSize(size.id, format)}
											>
												{format.toUpperCase()}
											</button>
										))}
									</span>
								</li>
							);
						})}
					</ul>
				)}
			</div>
			{error && <p className="download-panel__error">{error}</p>}

			{authModalOpen && (
				<div className="download-auth-modal" role="presentation">
					<button
						type="button"
						className="download-auth-modal__backdrop"
						aria-label="Close"
						onClick={() => setAuthModalOpen(false)}
					/>
					<div
						className="download-auth-modal__dialog"
						role="dialog"
						aria-modal="true"
						aria-labelledby="download-auth-title"
					>
						<button
							type="button"
							className="download-auth-modal__close"
							aria-label="Close"
							onClick={() => setAuthModalOpen(false)}
						>
							×
						</button>
						<p className="download-auth-modal__eyebrow">
							<CrownIcon /> Pro download
						</p>
						<h2 id="download-auth-title">Sign up for {pendingSize || '2K+'} downloads</h2>
						<p>
							500 and 1K are free without logging in. Create an account and upgrade to Pro for
							2K, 4K, and 8K.
						</p>
						<div className="download-auth-modal__actions">
							<a className="btn btn--primary" href={signupHref}>
								Create free account
							</a>
							<a className="btn btn--ghost" href={loginHref}>
								Log in
							</a>
						</div>
					</div>
				</div>
			)}

			{plansModalOpen && (
				<div className="download-auth-modal" role="presentation">
					<button
						type="button"
						className="download-auth-modal__backdrop"
						aria-label="Close"
						onClick={() => setPlansModalOpen(false)}
					/>
					<div
						className="download-auth-modal__dialog download-auth-modal__dialog--plans"
						role="dialog"
						aria-modal="true"
						aria-labelledby="download-plans-title"
					>
						<button
							type="button"
							className="download-auth-modal__close"
							aria-label="Close"
							onClick={() => setPlansModalOpen(false)}
						>
							×
						</button>
						<p className="download-auth-modal__eyebrow">
							<CrownIcon /> Membership
						</p>
						<h2 id="download-plans-title">Unlimited downloads</h2>
						<p>
							{pendingSize
								? `${pendingSize} requires Pro. Choose a plan below, or open the pricing page.`
								: 'Choose a temporary plan. Full details and checkout are on the pricing page.'}
						</p>
						<ul className="download-plan-list">
							<li>
								<div>
									<strong>Monthly</strong>
									<span>Unlimited downloads · billed monthly</span>
								</div>
								<em>$29</em>
							</li>
							<li>
								<div>
									<strong>Quarterly</strong>
									<span>Unlimited downloads · best value start</span>
								</div>
								<em>$69</em>
							</li>
							<li>
								<div>
									<strong>Yearly</strong>
									<span>Unlimited downloads · lowest monthly cost</span>
								</div>
								<em>$199</em>
							</li>
						</ul>
						<div className="download-auth-modal__actions">
							<a className="btn btn--primary" href="/price">
								Details · Pricing page
							</a>
							<button
								type="button"
								className="btn btn--ghost"
								onClick={() => setPlansModalOpen(false)}
							>
								Close
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
