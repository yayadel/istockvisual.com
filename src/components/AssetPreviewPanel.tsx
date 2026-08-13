import { useCallback, useState } from 'react';
import ImageEditor from './ImageEditor';

type Props = {
	imageUrl: string;
	title: string;
	aiEditHref?: string;
};

export default function AssetPreviewPanel({
	imageUrl,
	title,
	aiEditHref = '/tools/ai-edit',
}: Props) {
	const [editing, setEditing] = useState(false);
	const closeEditor = useCallback(() => setEditing(false), []);
	const openEditor = useCallback((event: React.MouseEvent) => {
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
					className="asset-preview__image"
					draggable={false}
				/>
			</div>
			<div className="asset-preview__footer">
				<button className="asset-preview__action" type="button" onClick={openEditor}>
					Edit image
				</button>
				<a className="asset-preview__action asset-preview__action--secondary" href={aiEditHref}>
					Open in AI Edit
				</a>
			</div>
			{editing ? (
				<ImageEditor imageUrl={imageUrl} title={title} onClose={closeEditor} />
			) : null}
		</div>
	);
}
