import { useCallback, useEffect, useRef, useState } from 'react';
import ImageEditor from './ImageEditor';

type Props = {
	loggedIn?: boolean;
	isPro?: boolean;
};

function fileTitle(file: File) {
	return file.name.replace(/\.[^.]+$/, '') || 'Uploaded image';
}

export default function ImageToolWorkspace({ loggedIn = false, isPro = false }: Props) {
	const inputRef = useRef<HTMLInputElement>(null);
	const editorWrapRef = useRef<HTMLDivElement>(null);
	const [imageUrl, setImageUrl] = useState<string | null>(null);
	const [title, setTitle] = useState('Uploaded image');
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		return () => {
			if (imageUrl?.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
		};
	}, [imageUrl]);

	useEffect(() => {
		if (!imageUrl) return;
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

	const clearImage = useCallback(() => {
		setImageUrl((prev) => {
			if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
			return null;
		});
		setTitle('Uploaded image');
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
			if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
			return url;
		});
		setTitle(fileTitle(file));
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
			<aside className="image-tool-page__privacy" role="note">
				<p className="image-tool-page__privacy-eyebrow">Free · Private · Local</p>
				<h2>This image tool is completely free</h2>
				<p>
					Everything runs in your browser. We do <strong>not</strong> store your personal
					information, and we do <strong>not</strong> upload or keep the images you edit —
					files stay on your device.
				</p>
			</aside>

			{!imageUrl ? (
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
					<span className="image-tool-page__dropzone-title">Upload an image to start</span>
					<span className="image-tool-page__dropzone-hint">
						Drag &amp; drop, or click to choose a file. Adjust, crop, remove background, and
						expand — all free, all on-device.
					</span>
					<span className="btn btn--primary image-tool-page__dropzone-btn">Choose image</span>
				</label>
			) : (
				<div className="image-tool-page__editor" ref={editorWrapRef}>
					<ImageEditor
						variant="page"
						imageUrl={imageUrl}
						title={title}
						onClose={clearImage}
						loggedIn={loggedIn}
						isPro={isPro}
						allSizesFree
					/>
				</div>
			)}

			{error && <p className="image-tool-page__error">{error}</p>}
		</div>
	);
}
