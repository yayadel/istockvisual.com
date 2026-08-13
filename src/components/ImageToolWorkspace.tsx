import { useCallback, useEffect, useRef, useState } from 'react';
import ImageEditor from './ImageEditor';

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
			<label
				className="tools-rail"
				onDragOver={(event) => {
					event.preventDefault();
					event.currentTarget.classList.add('is-dragover');
				}}
				onDragLeave={(event) => {
					event.currentTarget.classList.remove('is-dragover');
				}}
				onDrop={(event) => {
					event.preventDefault();
					event.currentTarget.classList.remove('is-dragover');
					loadFile(event.dataTransfer.files?.[0]);
				}}
			>
				<input
					ref={inputRef}
					type="file"
					accept="image/*"
					hidden
					onChange={(event) => loadFile(event.currentTarget.files?.[0])}
				/>
				<div className="tools-rail__text">
					<strong>{isExample ? 'Open your image' : 'Replace image'}</strong>
					<span>Drop a file here, or browse. PNG / JPG / WebP.</span>
				</div>
				<span className="tools-rail__cta">Browse</span>
			</label>

			{error && <p className="tools-work__error">{error}</p>}

			<section className="tools-stage" ref={editorWrapRef} aria-label="Editor">
				<div className="tools-stage__meta">
					<span>{isExample ? 'Showing example' : title}</span>
					{isExample ? null : (
						<button type="button" className="tools-stage__link" onClick={resetToExample}>
							Use example again
						</button>
					)}
				</div>
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
			</section>
		</div>
	);
}
