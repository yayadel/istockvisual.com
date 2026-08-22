import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import FilerobotAssetEditor from './FilerobotAssetEditor';
import { ToolsDropzone } from './ToolsChrome';

type Props = {
	loggedIn?: boolean;
	isPro?: boolean;
};

const EXAMPLE_IMAGE = {
	url: '/demo/studio-orb.jpg',
	title: 'Example',
	width: 1400,
	height: 1867,
} as const;

function fileTitle(file: File) {
	return file.name.replace(/\.[^.]+$/, '') || 'Uploaded image';
}

function readImageDimensions(url: string): Promise<{ width: number; height: number }> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
		img.onerror = () => reject(new Error('Could not read image dimensions'));
		img.src = url;
	});
}

export default function ImageToolWorkspace({ loggedIn = false, isPro = false }: Props) {
	const inputRef = useRef<HTMLInputElement>(null);
	const editorWrapRef = useRef<HTMLDivElement>(null);
	const [imageUrl, setImageUrl] = useState<string>(EXAMPLE_IMAGE.url);
	const [title, setTitle] = useState<string>(EXAMPLE_IMAGE.title);
	const [width, setWidth] = useState<number>(EXAMPLE_IMAGE.width);
	const [height, setHeight] = useState<number>(EXAMPLE_IMAGE.height);
	const [isExample, setIsExample] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const skipScrollRef = useRef(true);
	const boardSize = useMemo(() => {
		const scale = Math.min(1, 1024 / Math.max(width, height, 1));
		return {
			width: Math.max(1, Math.round(width * scale)),
			height: Math.min(860, Math.max(1, Math.round(height * scale))),
		};
	}, [height, width]);

	useEffect(() => {
		return () => {
			if (imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
		};
	}, [imageUrl]);

	useEffect(() => {
		let cancelled = false;
		readImageDimensions(imageUrl)
			.then((dims) => {
				if (!cancelled) {
					setWidth(dims.width);
					setHeight(dims.height);
				}
			})
			.catch(() => {
				if (!cancelled) {
					setWidth(EXAMPLE_IMAGE.width);
					setHeight(EXAMPLE_IMAGE.height);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [imageUrl]);

	useEffect(() => {
		if (skipScrollRef.current) {
			skipScrollRef.current = false;
			return;
		}
		let cancelled = false;
		const scrollEditorIntoView = () => {
			if (cancelled) return;
			editorWrapRef.current?.scrollIntoView({
				behavior: 'smooth',
				block: 'start',
				inline: 'nearest',
			});
		};
		const frame = window.requestAnimationFrame(scrollEditorIntoView);
		const timer = window.setTimeout(scrollEditorIntoView, 120);
		return () => {
			cancelled = true;
			window.cancelAnimationFrame(frame);
			window.clearTimeout(timer);
		};
	}, [imageUrl]);

	const resetToExample = useCallback(() => {
		setImageUrl((prev) => {
			if (prev.startsWith('blob:')) URL.revokeObjectURL(prev);
			return EXAMPLE_IMAGE.url;
		});
		setTitle(EXAMPLE_IMAGE.title);
		setWidth(EXAMPLE_IMAGE.width);
		setHeight(EXAMPLE_IMAGE.height);
		setIsExample(true);
		setError(null);
		if (inputRef.current) inputRef.current.value = '';
	}, []);

	const loadFile = useCallback((file: File | undefined | null) => {
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			setError('Please choose an image file (PNG, JPG, WebP, etc.).');
			return;
		}
		setError(null);
		const url = URL.createObjectURL(file);
		setImageUrl((prev) => {
			if (prev.startsWith('blob:')) URL.revokeObjectURL(prev);
			return url;
		});
		setTitle(fileTitle(file));
		setIsExample(false);
	}, []);

	return (
		<div className="tools-work">
			<ToolsDropzone
				inputRef={inputRef}
				title={isExample ? 'Drop your photo to start editing' : 'Replace the working image'}
				hint="Same Filerobot studio as library assets — crop, finetune, filters, watermark, resize, and cutout on your device."
				cta="Browse files"
				sampleSrc={isExample ? EXAMPLE_IMAGE.url : imageUrl}
				sampleLabel={isExample ? 'Live example' : 'Your image'}
				formats={['PNG', 'JPG', 'WebP']}
				onFiles={(files) => loadFile(files?.[0])}
			/>

			{error && <p className="tools-work__error">{error}</p>}

			<div className="tools-editor" ref={editorWrapRef}>
				<div className="tools-editor__bar">
					<p className="tools-editor__note">
						{isExample ? 'Example image — upload yours to replace.' : `Editing ${title}`}
					</p>
					{!isExample ? (
						<button type="button" className="tools-editor__link" onClick={resetToExample}>
							Use example again
						</button>
					) : null}
				</div>

				<figure
					id="preview"
					className="asset-preview tools-editor__preview"
					style={
						{
							'--preview-ar': `${width} / ${height}`,
							'--fie-img-w': String(boardSize.width),
							'--fie-img-h': String(boardSize.height),
						} as CSSProperties
					}
				>
					<div className="asset-preview__boot" aria-hidden="true">
						<div className="asset-preview__boot-sidebar">
							<span></span>
							<span></span>
							<span></span>
							<span></span>
							<span></span>
							<span></span>
							<span></span>
						</div>
						<div className="asset-preview__boot-main">
							<div className="asset-preview__boot-topbar"></div>
							<div className="asset-preview__boot-canvas"></div>
							<div className="asset-preview__boot-toolbar"></div>
						</div>
					</div>
					<img
						className="asset-preview__poster"
						src={imageUrl}
						alt={title}
						width={width}
						height={height}
						decoding="async"
					/>
					<FilerobotAssetEditor
						key={imageUrl}
						imageUrl={imageUrl}
						title={title}
						width={width}
						height={height}
						loggedIn={loggedIn}
						isPro={isPro}
						allSizesFree
					/>
				</figure>
			</div>
		</div>
	);
}
