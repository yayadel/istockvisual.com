import { useState } from 'react';
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

	if (editing) {
		return (
			<div className="asset-preview asset-preview--editing">
				<ImageEditor
					imageUrl={imageUrl}
					title={title}
					onCancel={() => setEditing(false)}
				/>
			</div>
		);
	}

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
				<button
					className="btn btn--ghost asset-preview__edit"
					type="button"
					onClick={() => setEditing(true)}
				>
					Edit image
				</button>
				<a className="btn btn--ghost asset-preview__edit" href={aiEditHref}>
					Open in AI Edit
				</a>
			</div>
		</div>
	);
}
