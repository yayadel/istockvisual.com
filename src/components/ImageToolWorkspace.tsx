import { useCallback, useEffect, useRef, useState } from 'react';
import ImageEditor from './ImageEditor';

type Props = {
	loggedIn?: boolean;
	isPro?: boolean;
};

const EXAMPLE_IMAGE = {
	url: '/demo/studio-orb.jpg',
	title: 'Example Image',
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

	const onInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		loadFile(event.currentTarget.files?.[0]);
	};

	const onDrop = (event: React.DragEvent<HTMLLabelElement>) => {
		event.preventDefault();
		event.currentTarget.classList.remove('is-dragover');
		loadFile(event.dataTransfer.files?.[0]);
	};

	return (
		<div className="image-tool-page">
			<section className="image-tool-page__upload" aria-label="Upload image">
				<label
					className="image-tool-page__dropzone"
					onDragOver={(event) => {
						event.preventDefault();
						event.currentTarget.classList.add('is-dragover');
					}}
					onDragLeave={(event) => {
						event.currentTarget.classList.remove('is-dragover');
					}}
					onDrop={onDrop}
				>
					<input
						ref={inputRef}
						type="file"
						accept="image/*"
						hidden
						onChange={onInputChange}
					/>
					<span className="image-tool-page__dropzone-kicker">Start here</span>
					<span className="image-tool-page__dropzone-title">
						{isExample ? 'Drop your photo' : 'Swap in another photo'}
					</span>
					<span className="image-tool-page__dropzone-hint">
						PNG, JPG, or WebP. Editing stays on this device.
					</span>
					<span className="image-tool-page__dropzone-btn">Choose image</span>
				</label>
			</section>

			{error && <p className="image-tool-page__error">{error}</p>}

			<section className="image-tool-page__studio" ref={editorWrapRef} aria-label="Editor">
				<div className="image-tool-page__studio-bar">
					<div>
						<p className="image-tool-page__studio-kicker">Workspace</p>
						<h2>{isExample ? 'Try the example' : 'Your edit session'}</h2>
					</div>
					{isExample ? (
						<p className="image-tool-page__example-badge">
							Demo file · replace anytime above
						</p>
					) : (
						<button
							type="button"
							className="image-tool-page__reset-example"
							onClick={resetToExample}
						>
							Back to example
						</button>
					)}
				</div>
				<div className="image-tool-page__studio-frame">
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
			</section>
		</div>
	);
}
