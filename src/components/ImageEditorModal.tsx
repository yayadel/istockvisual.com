import ImageEditor, { type ToolId } from './ImageEditor';

type Props = {
	imageUrl: string;
	title: string;
	onClose: () => void;
	loggedIn?: boolean;
	isPro?: boolean;
	assetId?: string;
	activeTool?: ToolId;
};

/** Lazy-loaded detail-page editor: crop, light, format, then download in the browser. */
export default function ImageEditorModal({
	activeTool = 'transform',
	...props
}: Props) {
	return <ImageEditor {...props} variant="modal" activeTool={activeTool} />;
}
