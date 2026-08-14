import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import ImageEditor from './ImageEditor';
import ShareBar from './ShareBar';

const LENS_SIZE = 196;
const LENS_ZOOM = 2.5;
const EDIT_HINT_MS = 4000;
const EDIT_HINT_SHATTER_MS = 620;

type Props = {
	imageUrl: string;
	title: string;
	width?: number;
	height?: number;
	shareUrl?: string;
	loggedIn?: boolean;
	isPro?: boolean;
	assetId?: string;
};

function canHoverZoom() {
	return (
		window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
		!window.matchMedia('(max-width: 720px)').matches
	);
}

export default function AssetPreviewPanel({
	imageUrl,
	title,
	width,
	height,
	shareUrl,
	loggedIn = false,
	isPro = false,
	assetId,
}: Props) {
	const [editing, setEditing] = useState(false);
	const [editHint, setEditHint] = useState<'in' | 'out' | 'gone'>('in');
	const wrapRef = useRef<HTMLDivElement>(null);
	const imageRef = useRef<HTMLImageElement>(null);
	const lensRef = useRef<HTMLDivElement>(null);

	const dismissEditHint = useCallback(() => {
		setEditHint((current) => (current === 'in' ? 'out' : current));
	}, []);

	useEffect(() => {
		const hide = window.setTimeout(dismissEditHint, EDIT_HINT_MS);
		return () => window.clearTimeout(hide);
	}, [dismissEditHint]);

	useEffect(() => {
		if (editHint !== 'out') return;
		const done = window.setTimeout(() => setEditHint('gone'), EDIT_HINT_SHATTER_MS);
		return () => window.clearTimeout(done);
	}, [editHint]);

	const closeEditor = useCallback(() => setEditing(false), []);
	const openEditor = useCallback((event: MouseEvent<HTMLButtonElement>) => {
		event.preventDefault();
		event.stopPropagation();
		dismissEditHint();
		setEditing(true);
	}, [dismissEditHint]);

	const hideLens = useCallback(() => {
		const lens = lensRef.current;
		const wrap = wrapRef.current;
		if (lens) lens.dataset.active = '';
		wrap?.classList.remove('asset-preview__image-wrap--zooming');
	}, []);

	const moveLens = useCallback((event: PointerEvent<HTMLDivElement>) => {
		if (event.pointerType === 'touch' || !canHoverZoom()) {
			hideLens();
			return;
		}

		const image = imageRef.current;
		const wrap = wrapRef.current;
		const lens = lensRef.current;
		if (!image || !wrap || !lens) return;

		const imageRect = image.getBoundingClientRect();
		const x = event.clientX - imageRect.left;
		const y = event.clientY - imageRect.top;

		if (
			imageRect.width < 8 ||
			imageRect.height < 8 ||
			x < 0 ||
			y < 0 ||
			x > imageRect.width ||
			y > imageRect.height
		) {
			hideLens();
			return;
		}

		const wrapRect = wrap.getBoundingClientRect();
		lens.style.left = `${imageRect.left - wrapRect.left + x - LENS_SIZE / 2}px`;
		lens.style.top = `${imageRect.top - wrapRect.top + y - LENS_SIZE / 2}px`;
		lens.style.backgroundSize = `${imageRect.width * LENS_ZOOM}px ${imageRect.height * LENS_ZOOM}px`;
		lens.style.backgroundPosition = `${-(x * LENS_ZOOM - LENS_SIZE / 2)}px ${-(y * LENS_ZOOM - LENS_SIZE / 2)}px`;
		lens.dataset.active = 'true';
		wrap.classList.add('asset-preview__image-wrap--zooming');
	}, [hideLens]);

	return (
		<div className="asset-preview">
			<div
				ref={wrapRef}
				className="asset-preview__image-wrap wm-protected wm-protected--lock"
				onContextMenu={(event) => event.preventDefault()}
				onPointerMove={moveLens}
				onPointerLeave={hideLens}
				onPointerCancel={hideLens}
			>
				<img
					ref={imageRef}
					src={imageUrl}
					alt={title}
					width={width}
					height={height}
					className="asset-preview__image"
					fetchPriority="high"
					decoding="async"
					draggable={false}
				/>
				<div className="wm-protected__mark" aria-hidden="true">
					<span className="wm-protected__mark-layer wm-protected__mark-layer--dark" />
					<span className="wm-protected__mark-layer wm-protected__mark-layer--light" />
				</div>
				<div
					ref={lensRef}
					className="asset-preview__lens"
					aria-hidden="true"
					style={{ backgroundImage: `url(${JSON.stringify(imageUrl)})` }}
				/>
			</div>
			<div className="asset-preview__footer">
				<div className="asset-preview__edit-wrap">
					{editHint !== 'gone' ? (
						<div
							className={`asset-preview__edit-hint asset-preview__edit-hint--${editHint}`}
							role="status"
						>
							<p className="asset-preview__edit-hint-copy">You can edit this file here</p>
							<span className="asset-preview__edit-hint-arrow" aria-hidden="true" />
							<span className="asset-preview__edit-hint-shard" aria-hidden="true" />
							<span className="asset-preview__edit-hint-shard" aria-hidden="true" />
							<span className="asset-preview__edit-hint-shard" aria-hidden="true" />
							<span className="asset-preview__edit-hint-shard" aria-hidden="true" />
							<span className="asset-preview__edit-hint-shard" aria-hidden="true" />
							<span className="asset-preview__edit-hint-shard" aria-hidden="true" />
						</div>
					) : null}
					<button
						className="btn asset-preview__action asset-preview__action--edit"
						type="button"
						onClick={openEditor}
					>
						<span className="asset-preview__action-label">Edit image</span>
						<span className="asset-preview__action-tools">
							Adjust · Crop &amp; Flip · Remove BG · Expand
						</span>
					</button>
				</div>
				<div className="asset-preview__share">
					<ShareBar title={title} url={shareUrl} compact inlineChannels />
				</div>
			</div>
			{editing ? (
				<ImageEditor
					imageUrl={imageUrl}
					title={title}
					onClose={closeEditor}
					loggedIn={loggedIn}
					isPro={isPro}
					assetId={assetId}
				/>
			) : null}
		</div>
	);
}
