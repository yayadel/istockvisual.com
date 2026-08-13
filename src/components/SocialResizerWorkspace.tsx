import { useCallback, useEffect, useRef, useState } from 'react';
import {
	SOCIAL_PRESETS,
	drawSocialFrame,
	renderSocialBlob,
	socialFileName,
	zipSocialResults,
	type SocialFitMode,
	type SocialPreset,
} from '../lib/social-resize';
import {
	EXAMPLE_IMAGE_URL,
	downloadBlob,
	fetchExampleImageFile,
	isLikelyImageFile,
	loadImageElement,
	newId,
	yieldToMain,
} from '../lib/tools-shared';
import { ToolsDropzone, ToolsPanel } from './ToolsChrome';

type QueueItem = {
	id: string;
	file: File;
	name: string;
	previewUrl: string;
	image: HTMLImageElement | null;
	status: 'loading' | 'ready' | 'error' | 'rendering';
	error?: string;
	resultUrl?: string;
	resultBlob?: Blob;
	isExample?: boolean;
};

function revokeItemUrls(item: QueueItem) {
	URL.revokeObjectURL(item.previewUrl);
	if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
}

function clearCanvasSafe(canvas: HTMLCanvasElement | null) {
	if (!canvas) return;
	const ctx = canvas.getContext('2d');
	if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
	canvas.width = 0;
	canvas.height = 0;
}

export default function SocialResizerWorkspace() {
	const inputRef = useRef<HTMLInputElement>(null);
	const previewCanvasRef = useRef<HTMLCanvasElement>(null);
	const itemsRef = useRef<QueueItem[]>([]);
	const [items, setItems] = useState<QueueItem[]>([]);
	const [demoImage, setDemoImage] = useState<HTMLImageElement | null>(null);
	const [presetId, setPresetId] = useState(SOCIAL_PRESETS[0]!.id);
	const [mode, setMode] = useState<SocialFitMode>('cover');
	const [focusX, setFocusX] = useState(0.5);
	const [focusY, setFocusY] = useState(0.5);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [progress, setProgress] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const draggingFocus = useRef(false);

	itemsRef.current = items;
	const preset = SOCIAL_PRESETS.find((p) => p.id === presetId) ?? SOCIAL_PRESETS[0]!;
	const active = items.find((item) => item.id === activeId) ?? items[0] ?? null;
	const previewImage = active?.image ?? demoImage;
	const showingExample = !active || Boolean(active.isExample);

	useEffect(() => {
		return () => {
			for (const item of itemsRef.current) {
				revokeItemUrls(item);
			}
		};
	}, []);

	useEffect(() => {
		let cancelled = false;
		loadImageElement(EXAMPLE_IMAGE_URL)
			.then((img) => {
				if (!cancelled) setDemoImage(img);
			})
			.catch(() => {
				if (!cancelled) setError('Failed to load example image');
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const patchItem = useCallback((id: string, patch: Partial<QueueItem>) => {
		setItems((prev) =>
			prev.map((item) => {
				if (item.id !== id) return item;
				if (patch.resultUrl && item.resultUrl && patch.resultUrl !== item.resultUrl) {
					URL.revokeObjectURL(item.resultUrl);
				}
				return { ...item, ...patch };
			}),
		);
	}, []);

	const seedExample = useCallback(async () => {
		try {
			const file = await fetchExampleImageFile('example.jpg');
			const id = newId();
			const previewUrl = URL.createObjectURL(file);
			const item: QueueItem = {
				id,
				file,
				name: file.name,
				previewUrl,
				image: null,
				status: 'loading',
				isExample: true,
			};
			setItems([item]);
			setActiveId(id);
			try {
				const image = await loadImageElement(previewUrl);
				patchItem(id, { image, status: 'ready' });
			} catch {
				patchItem(id, { status: 'error', error: 'Decode failed' });
			}
		} catch {
			setError('Failed to load example image');
		}
	}, [patchItem]);

	useEffect(() => {
		void seedExample();
	}, [seedExample]);

	const addFiles = useCallback(
		async (list: FileList | File[] | null | undefined) => {
			if (!list?.length) return;
			const accepted = Array.from(list).filter(isLikelyImageFile);
			if (!accepted.length) {
				setError('Please drop image files.');
				return;
			}
			setError(null);
			const created: QueueItem[] = accepted.map((file) => ({
				id: newId(),
				file,
				name: file.name,
				previewUrl: URL.createObjectURL(file),
				image: null,
				status: 'loading',
			}));
			setItems((prev) => {
				for (const item of prev) {
					if (item.isExample) revokeItemUrls(item);
				}
				return [...prev.filter((item) => !item.isExample), ...created];
			});
			setActiveId(created[0]!.id);

			for (const item of created) {
				try {
					const image = await loadImageElement(item.previewUrl);
					patchItem(item.id, { image, status: 'ready' });
				} catch {
					patchItem(item.id, { status: 'error', error: 'Decode failed' });
				}
				await yieldToMain(0);
			}
		},
		[patchItem],
	);

	const removeItem = useCallback(
		(id: string) => {
			setItems((prev) => {
				const target = prev.find((item) => item.id === id);
				if (target) revokeItemUrls(target);
				const next = prev.filter((item) => item.id !== id);
				setActiveId((current) => (current === id ? next[0]?.id ?? null : current));
				if (next.length === 0) {
					queueMicrotask(() => {
						void seedExample();
					});
				}
				return next;
			});
		},
		[seedExample],
	);

	const clearAll = useCallback(() => {
		setItems((prev) => {
			for (const item of prev) revokeItemUrls(item);
			return [];
		});
		setActiveId(null);
		if (inputRef.current) inputRef.current.value = '';
		void seedExample();
	}, [seedExample]);

	const paintPreview = useCallback(() => {
		const canvas = previewCanvasRef.current;
		const image = previewImage;
		if (!canvas || !image) return;
		const maxPreview = 520;
		const scale = Math.min(1, maxPreview / Math.max(preset.width, preset.height));
		const w = Math.round(preset.width * scale);
		const h = Math.round(preset.height * scale);
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		drawSocialFrame(
			ctx,
			image,
			image.naturalWidth || image.width,
			image.naturalHeight || image.height,
			w,
			h,
			{ mode, focusX, focusY, blurPx: Math.max(12, 24 * scale) },
		);
	}, [focusX, focusY, mode, preset.height, preset.width, previewImage]);

	useEffect(() => {
		paintPreview();
	}, [paintPreview]);

	useEffect(() => {
		return () => clearCanvasSafe(previewCanvasRef.current);
	}, []);

	const renderAll = useCallback(async () => {
		const queue = itemsRef.current.filter((item) => item.image && item.status !== 'error');
		if (!queue.length) {
			setError('Add images first.');
			return;
		}
		setBusy(true);
		setError(null);
		setProgress(0);
		let done = 0;
		for (const item of queue) {
			patchItem(item.id, { status: 'rendering' });
			try {
				const blob = await renderSocialBlob(item.image!, preset, { mode, focusX, focusY });
				const resultUrl = URL.createObjectURL(blob);
				patchItem(item.id, {
					status: 'ready',
					resultBlob: blob,
					resultUrl,
				});
			} catch (err) {
				console.error(err);
				patchItem(item.id, {
					status: 'error',
					error: err instanceof Error ? err.message : 'Render failed',
				});
			}
			done += 1;
			setProgress(Math.round((done / queue.length) * 100));
			await yieldToMain(8);
		}
		setBusy(false);
	}, [focusX, focusY, mode, patchItem, preset]);

	const downloadZip = useCallback(async () => {
		const files = itemsRef.current
			.filter((item) => item.resultBlob)
			.map((item) => ({
				name: socialFileName(item.name, preset),
				blob: item.resultBlob!,
			}));
		if (!files.length) {
			setError('Render images before downloading.');
			return;
		}
		setBusy(true);
		try {
			const blob = await zipSocialResults(files);
			downloadBlob(blob, `social-resize-${preset.width}x${preset.height}.zip`);
		} catch (err) {
			console.error(err);
			setError('ZIP failed');
		} finally {
			setBusy(false);
		}
	}, [preset]);

	const onFocusPointer = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			if (mode !== 'cover') return;
			const rect = event.currentTarget.getBoundingClientRect();
			const x = (event.clientX - rect.left) / rect.width;
			const y = (event.clientY - rect.top) / rect.height;
			setFocusX(Math.min(1, Math.max(0, x)));
			setFocusY(Math.min(1, Math.max(0, y)));
		},
		[mode],
	);

	useEffect(() => {
		const onMove = (event: PointerEvent) => {
			if (!draggingFocus.current || mode !== 'cover') return;
			const board = document.querySelector('.tools-panel__sample .tools-focus-board') as HTMLElement | null;
			if (!board) return;
			const rect = board.getBoundingClientRect();
			setFocusX(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)));
			setFocusY(Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)));
		};
		const onUp = () => {
			draggingFocus.current = false;
		};
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		return () => {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
		};
	}, [mode]);

	return (
		<div className="tools-work">
			<ToolsDropzone
				inputRef={inputRef}
				multiple
				title={showingExample ? 'Drop a batch for social sizes' : 'Add more images'}
				hint="Pick a preset, drag the focus point, then render and download a ZIP. Example is live — try presets now."
				cta="Browse files"
				sampleSrc={active?.previewUrl || EXAMPLE_IMAGE_URL}
				sampleLabel={showingExample ? 'Live example' : 'Active image'}
				formats={['JPG', 'PNG', 'WebP']}
				onFiles={(files) => void addFiles(files)}
			/>

			<ToolsPanel
				title="Platform & fit"
				note="Cover crops to fill the frame. Contain + blur keeps the full image on a soft backdrop."
				sample={
					<figure className="tools-panel__sample">
						<div
							className="tools-focus-board"
							onPointerDown={(event) => {
								if (mode !== 'cover') return;
								draggingFocus.current = true;
								onFocusPointer(event);
							}}
						>
							<canvas ref={previewCanvasRef} className="tools-focus-board__canvas" />
							{mode === 'cover' && (
								<span
									className="tools-focus-board__pin"
									style={{ left: `${focusX * 100}%`, top: `${focusY * 100}%` }}
									aria-hidden="true"
								/>
							)}
						</div>
						<figcaption>
							{showingExample ? 'Live example' : 'Your image'} · {preset.label}
						</figcaption>
					</figure>
				}
				actions={
					<div className="tools-panel__actions">
						<button
							type="button"
							className="btn btn--primary"
							onClick={renderAll}
							disabled={busy || items.length === 0}
						>
							{busy ? `Rendering ${progress}%` : 'Render all sizes'}
						</button>
						<button
							type="button"
							className="btn btn--ghost"
							onClick={downloadZip}
							disabled={busy || !items.some((item) => item.resultBlob)}
						>
							Download ZIP
						</button>
						<button
							type="button"
							className="btn btn--ghost"
							onClick={clearAll}
							disabled={busy || items.length === 0}
						>
							Clear queue
						</button>
					</div>
				}
			>
				<section className="tools-preset-grid" aria-label="Social presets">
					{SOCIAL_PRESETS.map((item: SocialPreset) => (
						<button
							key={item.id}
							type="button"
							className={`tools-preset${presetId === item.id ? ' is-active' : ''}`}
							onClick={() => setPresetId(item.id)}
						>
							<strong>{item.label}</strong>
							<span>
								{item.ratioLabel} · {item.width}×{item.height}
							</span>
						</button>
					))}
				</section>
				<div className="tools-controls tools-controls--stacked">
					<label className="tools-controls__field">
						<span>Mode</span>
						<select
							value={mode}
							onChange={(event) => {
								const next = event.currentTarget.value as SocialFitMode;
								setMode(next);
							}}
						>
							<option value="cover">Cover / crop</option>
							<option value="contain-blur">Contain + blur</option>
						</select>
					</label>
				</div>
				{mode === 'cover' && (
					<p className="tools-work__note" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
						Drag on the preview to move the crop focus.
					</p>
				)}
			</ToolsPanel>

			{error && <p className="tools-work__error">{error}</p>}
			{busy && (
				<div className="tools-progress" aria-live="polite">
					<span className="tools-progress__bar" style={{ ['--p' as string]: `${progress}%` }} />
					<span>Batch progress {progress}%</span>
				</div>
			)}

			{items.length > 0 && (
				<section className="tools-queue" aria-label="Queue">
					{items.map((item) => (
						<article
							key={item.id}
							className={`tools-queue__row${activeId === item.id ? ' is-active' : ''}`}
							onClick={() => setActiveId(item.id)}
						>
							<img src={item.resultUrl || item.previewUrl} alt="" className="tools-queue__thumb" />
							<div className="tools-queue__meta">
								<strong title={item.name}>{item.isExample ? 'Example image' : item.name}</strong>
								<span>
									{item.status === 'loading' && 'Loading…'}
									{item.status === 'ready' && (item.resultBlob ? 'Rendered' : 'Ready')}
									{item.status === 'rendering' && 'Rendering…'}
									{item.status === 'error' && (item.error || 'Error')}
								</span>
							</div>
							<div className="tools-queue__actions">
								{item.resultBlob && (
									<button
										type="button"
										className="btn btn--primary"
										onClick={(event) => {
											event.stopPropagation();
											downloadBlob(item.resultBlob!, socialFileName(item.name, preset));
										}}
									>
										Download
									</button>
								)}
								<button
									type="button"
									className="tools-queue__remove"
									onClick={(event) => {
										event.stopPropagation();
										removeItem(item.id);
									}}
								>
									Remove
								</button>
							</div>
						</article>
					))}
				</section>
			)}
		</div>
	);
}
