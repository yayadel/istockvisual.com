import { useCallback, useState, type MouseEvent } from 'react';
import ImageEditor from './ImageEditor';
import ShareBar from './ShareBar';

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
	const closeEditor = useCallback(() => setEditing(false), []);
	const openEditor = useCallback((event: MouseEvent<HTMLButtonElement>) => {
		event.preventDefault();
		event.stopPropagation();
		setEditing(true);
	}, []);

	return (
		<div className="asset-preview">
			<div
				className="asset-preview__image-wrap wm-protected wm-protected--lock"
				onContextMenu={(event) => event.preventDefault()}
			>
				<img
					src={imageUrl}
					alt={title}
					width={width}
					height={height}
					className="asset-preview__image"
					fetchPriority="high"
					decoding="async"
					draggable={false}
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
					<ShareBar title={title} url={shareUrl} compact />
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
