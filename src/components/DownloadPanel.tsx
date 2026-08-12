import { useEffect, useMemo, useState } from 'react';
import { FREE_FULL_DOWNLOAD_LIMIT } from '../lib/download-quota';
import {
	DOWNLOAD_SIZES,
	outputSizeForDownload,
	sizeFileLabel,
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
	remainingFullDownloads: number | null;
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

export default function DownloadPanel({
	assetId,
	title,
	slug,
	previewUrl,
	sourceWidth = 1536,
	sourceHeight = 1024,
	loggedIn,
	isPro,
	remainingFullDownloads,
	loginHref,
	signupHref = '/signup',
	upgradeHref = '/account',
}: Props) {
	const [active, setActive] = useState<DownloadSizeId | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [remaining, setRemaining] = useState(remainingFullDownloads);
	const [natural, setNatural] = useState({ width: sourceWidth, height: sourceHeight });
	const [authModalOpen, setAuthModalOpen] = useState(false);
	const [plansModalOpen, setPlansModalOpen] = useState(false);
	const [pendingSize, setPendingSize] = useState<string | null>(null);

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

	const sizes = useMemo(
		() =>
			DOWNLOAD_SIZES.map((size) => ({
				...size,
				output: outputSizeForDownload(natural.width, natural.height, size),
			})),
		[natural.height, natural.width],
	);

	async function downloadSize(sizeId: DownloadSizeId) {
		const size = DOWNLOAD_SIZES.find((item) => item.id === sizeId);
		if (!size) return;

		if (!size.free && !loggedIn) {
			setPendingSize(size.label);
			setAuthModalOpen(true);
			return;
		}
		if (!size.free && !isPro && remaining === 0) {
			window.location.href = upgradeHref;
			return;
		}

		setActive(sizeId);
		setError(null);

		try {
			const res = await fetch(`/api/download/${assetId}?size=${size.id}`);
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as {
					error?: string;
					remaining?: number;
				} | null;
				if (typeof body?.remaining === 'number') setRemaining(body.remaining);
				throw new Error(body?.error || 'Download failed');
			}
			const headerRemaining = res.headers.get('X-Downloads-Remaining');
			if (headerRemaining != null) setRemaining(Number(headerRemaining));
			triggerDownload(await res.blob(), sizeFileLabel(slug, size.id));
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Download failed');
		} finally {
			setActive(null);
		}
	}

	const busy = active !== null;

	return (
		<div className="download-panel">
			<p className="download-panel__label">Download</p>
			<div className="download-sizes">
				{sizes.map((size) => {
					const quotaLocked = !size.free && !isPro && remaining === 0;
					const needsAuth = !size.free && !loggedIn;
					const showPro = needsAuth || quotaLocked;
					const label =
						size.free && !loggedIn ? `${size.label} · without login` : size.label;
					const hint = `${size.output.width} × ${size.output.height}`;
					return (
						<button
							key={size.id}
							type="button"
							className={`download-size${size.free && !loggedIn ? ' download-size--free' : ''}${active === size.id ? ' is-busy' : ''}`}
							disabled={busy}
							onClick={() => downloadSize(size.id)}
							title={
								needsAuth
									? 'Create a free account to download this size'
									: quotaLocked
										? 'Free full-size downloads used up'
										: `Download ${hint}`
							}
						>
							<strong>{label}</strong>
							<span>{hint}</span>
							{showPro && (
								<em className="download-pro-badge">
									<CrownIcon />
									Pro
								</em>
							)}
						</button>
					);
				})}
			</div>
			{busy && (
				<p className="download-panel__hint" aria-live="polite">
					Downloading {title}…
				</p>
			)}
			{error && <p className="download-panel__error">{error}</p>}

			<div className="download-pricing">
				<a className="download-buy download-buy--single" href="/price">
					<span>Single download</span>
					<strong>$0.99</strong>
				</a>
				<button
					type="button"
					className="download-buy download-buy--member"
					onClick={() => setPlansModalOpen(true)}
				>
					<strong>unlimited download & ads free</strong>
				</button>
			</div>

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
						<h2 id="download-auth-title">Sign up to download {pendingSize || 'full size'}</h2>
						<p>
							Guests can download the 500px preview without logging in. Create a free account to
							unlock 1K–8K downloads ({FREE_FULL_DOWNLOAD_LIMIT} full-size downloads included).
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
						<p>Choose a temporary plan. Full details and checkout are on the pricing page.</p>
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
