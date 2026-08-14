import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { imageContentRect, paintAdaptiveWatermark } from '../lib/adaptive-watermark';
import ImageEditor from './ImageEditor';
import ShareBar from './ShareBar';

const LENS_SIZE = 196;
const LENS_ZOOM = 2.5;

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
	const [wmAdaptive, setWmAdaptive] = useState(false);
	const wrapRef = useRef<HTMLDivElement>(null);
	const imageRef = useRef<HTMLImageElement>(null);
	const lensRef = useRef<HTMLDivElement>(null);
	const wmCanvasRef = useRef<HTMLCanvasElement>(null);

	const paintWatermark = useCallback(() => {
		const image = imageRef.current;
		const canvas = wmCanvasRef.current;
		if (!image || !canvas || !image.complete || image.naturalWidth < 2) {
			setWmAdaptive(false);
			return;
		}

		const box = imageContentRect(image);
		canvas.style.left = `${box.x}px`;
		canvas.style.top = `${box.y}px`;
		const ok = paintAdaptiveWatermark(canvas, image, box.width, box.height);
		setWmAdaptive(ok);
	}, []);

	const closeEditor = useCallback(() => setEditing(false), []);
	const openEditor = useCallback((event: MouseEvent<HTMLButtonElement>) => {
		event.preventDefault();
		event.stopPropagation();
		setEditing(true);
	}, []);

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

	useEffect(() => {
		const image = imageRef.current;
		if (!image) return;

		const onReady = () => paintWatermark();
		if (image.complete) onReady();
		else image.addEventListener('load', onReady);

		const observer = new ResizeObserver(() => paintWatermark());
		observer.observe(image);

		return () => {
			image.removeEventListener('load', onReady);
			observer.disconnect();
		};
	}, [imageUrl, paintWatermark]);

	const wrapClass = [
		'asset-preview__image-wrap',
		'wm-protected',
		'wm-protected--lock',
		wmAdaptive ? 'wm-protected--adaptive' : '',
	]
		.filter(Boolean)
		.join(' ');

	return (
		<div className="asset-preview">
			<div
				ref={wrapRef}
				className={wrapClass}
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
					crossOrigin="anonymous"
					fetchPriority="high"
					decoding="async"
					draggable={false}
				/>
				<div className="wm-protected__fallback" aria-hidden="true">
					<span className="wm-protected__fallback-layer wm-protected__fallback-layer--dark" />
					<span className="wm-protected__fallback-layer wm-protected__fallback-layer--light" />
				</div>
				<canvas ref={wmCanvasRef} className="wm-protected__adaptive" aria-hidden="true" />
				<div
					ref={lensRef}
					className="asset-preview__lens"
					aria-hidden="true"
					style={{ backgroundImage: `url(${JSON.stringify(imageUrl)})` }}
				/>
			</div>
			<div className="asset-preview__footer">
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
