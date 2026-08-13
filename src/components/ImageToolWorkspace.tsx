import { useCallback, useEffect, useRef, useState } from 'react';
import ImageEditor from './ImageEditor';
import { ToolsDropzone, ToolsPanel } from './ToolsChrome';

type Props = {
	loggedIn?: boolean;
	isPro?: boolean;
};

const EXAMPLE_IMAGE = {
	url: '/demo/studio-orb.jpg',
	title: 'Example',
} as const;

function fileTitle(file: File) {
	return file.name.replace(/\.[^.]+$/, '') || 'Uploaded image';
}

export default function ImageToolWorkspace({ loggedIn = false, isPro = false }: Props) {
	const inputRef = useRef<HTMLInputElement>(null);
	const editorWrapRef = useRef<HTMLDivElement>(null);
	const [imageUrl, setImageUrl] = useState<string>(EXAMPLE_IMAGE.url);
	const [title, setTitle] = useState<string>(EXAMPLE_IMAGE.title);
	const [isExample, setIsExample] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const skipScrollRef = useRef(true);

	useEffect(() => {
		return () => {
			if (imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
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
				block: 'center',
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
				hint="Local editor — adjust, crop, remove background, and expand without uploading to a server."
				cta="Browse files"
				sampleSrc={isExample ? EXAMPLE_IMAGE.url : imageUrl}
				sampleLabel={isExample ? 'Live example' : 'Your image'}
				formats={['PNG', 'JPG', 'WebP']}
				onFiles={(files) => loadFile(files?.[0])}
			/>

			{error && <p className="tools-work__error">{error}</p>}

			<div ref={editorWrapRef}>
				<ToolsPanel
					title="Editor workspace"
					note={isExample ? 'Showing example — upload to replace.' : title}
					sampleSrc={imageUrl}
					sampleCaption={isExample ? 'Example in use' : 'Current image'}
					flush
					actions={
						!isExample ? (
							<button type="button" className="tools-stage__link" onClick={resetToExample}>
								Use example again
							</button>
						) : null
					}
				>
					<div className="tools-stage__frame">
						<ImageEditor
							key={imageUrl}
							variant="page"
							imageUrl={imageUrl}
							title={title}
							onClose={resetToExample}
							loggedIn={loggedIn}
							isPro={isPro}
							allSizesFree
						/>
					</div>
				</ToolsPanel>
			</div>
		</div>
	);
}
