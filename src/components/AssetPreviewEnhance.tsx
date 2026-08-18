import { useCallback, useEffect, useState, type ComponentType, type MouseEvent } from 'react';
import ShareBar from './ShareBar';

const LENS_SIZE = 196;
const LENS_ZOOM = 2.5;
const EDIT_HINT_MS = 5000;
const EDIT_HINT_SHATTER_MS = 620;

type Props = {
	imageUrl: string;
	title: string;
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

export default function AssetPreviewEnhance({
	imageUrl,
	title,
	shareUrl,
	loggedIn = false,
	isPro = false,
	assetId,
}: Props) {
	const [editing, setEditing] = useState(false);
	const [Editor, setEditor] = useState<ComponentType<{
		imageUrl: string;
		title: string;
		onClose: () => void;
		loggedIn?: boolean;
		isPro?: boolean;
		assetId?: string;
	}> | null>(null);
	const [editHint, setEditHint] = useState<'in' | 'out' | 'gone'>('in');

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

	useEffect(() => {
		const wrap = document.querySelector<HTMLElement>('[data-preview-stage]');
		const image = wrap?.querySelector<HTMLImageElement>('.asset-preview__image');
		const lens = wrap?.querySelector<HTMLElement>('[data-preview-lens]');
		if (!wrap || !image || !lens) return;

		const hideLens = () => {
			lens.dataset.active = '';
			wrap.classList.remove('asset-preview__image-wrap--zooming');
		};

		const moveLens = (event: PointerEvent) => {
			if (event.pointerType === 'touch' || !canHoverZoom()) {
				hideLens();
				return;
			}

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
			lens.style.backgroundImage = `url(${JSON.stringify(imageUrl)})`;
			lens.dataset.active = 'true';
			wrap.classList.add('asset-preview__image-wrap--zooming');
		};

		const blockContextMenu = (event: Event) => event.preventDefault();

		wrap.addEventListener('pointermove', moveLens);
		wrap.addEventListener('pointerleave', hideLens);
		wrap.addEventListener('pointercancel', hideLens);
		wrap.addEventListener('contextmenu', blockContextMenu);

		return () => {
			wrap.removeEventListener('pointermove', moveLens);
			wrap.removeEventListener('pointerleave', hideLens);
			wrap.removeEventListener('pointercancel', hideLens);
			wrap.removeEventListener('contextmenu', blockContextMenu);
		};
	}, [imageUrl]);

	const closeEditor = useCallback(() => setEditing(false), []);
	const openEditor = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => {
			event.preventDefault();
			event.stopPropagation();
			dismissEditHint();
			void import('./ImageEditor').then((mod) => {
				setEditor(() => mod.default);
				setEditing(true);
			});
		},
		[dismissEditHint],
	);

	return (
		<>
			<div className="asset-preview__footer">
				<div className="asset-preview__edit-wrap">
					{editHint !== 'gone' ? (
						<div
							className={`asset-preview__edit-hint asset-preview__edit-hint--${editHint}`}
							role="status"
						>
							<p className="asset-preview__edit-hint-copy">✨ You can edit this image for free here</p>
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
			{editing && Editor ? (
				<Editor
					imageUrl={imageUrl}
					title={title}
					onClose={closeEditor}
					loggedIn={loggedIn}
					isPro={isPro}
					assetId={assetId}
				/>
			) : null}
		</>
	);
}
