import { useState } from 'react';
import ImageEditor from './ImageEditor';

type Props = {
	imageUrl: string;
	title: string;
};

export default function AssetPreviewPanel({ imageUrl, title }: Props) {
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
			<div className="asset-preview__image-wrap">
				<img src={imageUrl} alt={title} className="asset-preview__image" />
			</div>
			<div className="asset-preview__footer">
				<button className="btn btn--ghost asset-preview__edit" type="button" onClick={() => setEditing(true)}>
					Edit image
				</button>
			</div>
		</div>
	);
}
