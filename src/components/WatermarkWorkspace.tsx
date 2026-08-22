import { useCallback, useEffect, useRef, useState } from 'react';
import {
	DEFAULT_WATERMARK_SETTINGS,
	WATERMARK_FONTS,
	paintWatermark,
	renderWatermarkedBlob,
	watermarkFileName,
	zipWatermarkResults,
	type GridSlot,
	type WatermarkSettings,
} from '../lib/watermark';
import {
	EXAMPLE_IMAGE_URL,
	downloadBlob,
	fetchExampleImageFile,
	isLikelyImageFile,
	loadImageElement,
	newId,
	yieldToMain,
} from '../lib/tools-shared';
import { ToolsDropzone, ToolsEditorShell } from './ToolsChrome';

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

const GRID_SLOTS: GridSlot[] = [0, 1, 2, 3, 4, 5, 6, 7, 8];

function revokeItemUrls(item: QueueItem) {
	URL.revokeObjectURL(item.previewUrl);
	if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
}

export default function WatermarkWorkspace() {
	const inputRef = useRef<HTMLInputElement>(null);
	const logoInputRef = useRef<HTMLInputElement>(null);
	const previewCanvasRef = useRef<HTMLCanvasElement>(null);
	const itemsRef = useRef<QueueItem[]>([]);
	const [items, setItems] = useState<QueueItem[]>([]);
	const [demoImage, setDemoImage] = useState<HTMLImageElement | null>(null);
	const [settings, setSettings] = useState<WatermarkSettings>(DEFAULT_WATERMARK_SETTINGS);
	const [logoUrl, setLogoUrl] = useState<string | null>(null);
	const [logoImage, setLogoImage] = useState<HTMLImageElement | null>(null);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [progress, setProgress] = useState(0);
	const [error, setError] = useState<string | null>(null);

	itemsRef.current = items;
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
		return () => {
			if (logoUrl) URL.revokeObjectURL(logoUrl);
		};
	}, [logoUrl]);

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

	const onLogoFile = useCallback(async (file: File | undefined | null) => {
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			setError('Logo must be an image (PNG recommended).');
			return;
		}
		const url = URL.createObjectURL(file);
		setLogoUrl((prev) => {
			if (prev) URL.revokeObjectURL(prev);
			return url;
		});
		try {
			const image = await loadImageElement(url);
			setLogoImage(image);
			setSettings((prev) => ({ ...prev, kind: 'logo' }));
		} catch {
			setError('Failed to load logo');
		}
	}, []);

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
		const srcW = image.naturalWidth || image.width;
		const srcH = image.naturalHeight || image.height;
		const maxEdge = 560;
		const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
		const w = Math.max(1, Math.round(srcW * scale));
		const h = Math.max(1, Math.round(srcH * scale));
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.drawImage(image, 0, 0, w, h);
		paintWatermark(ctx, w, h, settings, logoImage);
	}, [logoImage, previewImage, settings]);

	useEffect(() => {
		paintPreview();
	}, [paintPreview]);

	useEffect(() => {
		return () => {
			const canvas = previewCanvasRef.current;
			if (!canvas) return;
			const ctx = canvas.getContext('2d');
			if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
			canvas.width = 0;
			canvas.height = 0;
		};
	}, []);

	const applyAll = useCallback(async () => {
		const queue = itemsRef.current.filter((item) => item.image && item.status !== 'error');
		if (!queue.length) {
			setError('Add images first.');
			return;
		}
		if (settings.kind === 'logo' && !logoImage) {
			setError('Upload a logo image first.');
			return;
		}
		setBusy(true);
		setError(null);
		setProgress(0);
		let done = 0;
		for (const item of queue) {
			patchItem(item.id, { status: 'rendering' });
			try {
				const blob = await renderWatermarkedBlob(item.image!, settings, logoImage);
				const resultUrl = URL.createObjectURL(blob);
				patchItem(item.id, { status: 'ready', resultBlob: blob, resultUrl });
			} catch (err) {
				console.error(err);
				patchItem(item.id, {
					status: 'error',
					error: err instanceof Error ? err.message : 'Failed',
				});
			}
			done += 1;
			setProgress(Math.round((done / queue.length) * 100));
			await yieldToMain(8);
		}
		setBusy(false);
	}, [logoImage, patchItem, settings]);

	const downloadPreview = useCallback(async () => {
		const canvas = previewCanvasRef.current;
		if (!canvas || !previewImage) return;
		try {
			const blob = await new Promise<Blob>((resolve, reject) => {
				canvas.toBlob(
					(result) => {
						if (!result) reject(new Error('Failed to encode preview'));
						else resolve(result);
					},
					'image/png',
				);
			});
			downloadBlob(blob, watermarkFileName(active?.name || 'example.jpg'));
		} catch {
			setError('Preview download failed');
		}
	}, [active?.name, previewImage]);

	const downloadZip = useCallback(async () => {
		const files = itemsRef.current
			.filter((item) => item.resultBlob)
			.map((item) => ({
				name: watermarkFileName(item.name),
				blob: item.resultBlob!,
			}));
		if (!files.length) {
			setError('Apply watermark before downloading.');
			return;
		}
		setBusy(true);
		try {
			const blob = await zipWatermarkResults(files);
			downloadBlob(blob, `watermarks-${Date.now()}.zip`);
		} catch (err) {
			console.error(err);
			setError('ZIP failed');
		} finally {
			setBusy(false);
		}
	}, []);

	return (
		<div className="tools-work">
			<ToolsDropzone
				inputRef={inputRef}
				multiple
				title={showingExample ? 'Drop images for batch watermarking' : 'Add more images'}
				hint="Mark size scales with each photo’s longest edge — consistent from thumbnails to 4K. Example is live — adjust controls now."
				cta="Browse files"
				sampleSrc={active?.previewUrl || EXAMPLE_IMAGE_URL}
				sampleLabel={showingExample ? 'Live example' : 'Active image'}
				formats={['JPG', 'PNG', 'WebP']}
				onFiles={(files) => void addFiles(files)}
			/>

			<ToolsEditorShell
				note={
					showingExample
						? 'Example image — upload yours or adjust watermark settings on the sample now.'
						: `Previewing ${active?.isExample ? 'example image' : active?.name || 'image'}`
				}
				resetLabel={showingExample ? undefined : 'Use example again'}
				onReset={
					showingExample
						? undefined
						: () => {
								clearAll();
							}
				}
				actions={
					<>
						<button
							type="button"
							className="btn btn--primary"
							onClick={applyAll}
							disabled={busy || items.length === 0}
						>
							{busy ? `Applying ${progress}%` : 'Apply to all'}
						</button>
						<button
							type="button"
							className="btn btn--ghost"
							onClick={() => void downloadPreview()}
							disabled={!previewImage}
						>
							Download preview
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
					</>
				}
				controlsLabel="Watermark controls"
				controls={
					<div className="tools-controls tools-controls--wrap tools-controls--stacked">
						<label className="tools-controls__field">
							<span>Type</span>
							<select
								value={settings.kind}
								onChange={(event) => {
									const kind = event.currentTarget.value as WatermarkSettings['kind'];
									setSettings((prev) => ({ ...prev, kind }));
								}}
							>
								<option value="text">Text</option>
								<option value="logo">Logo</option>
							</select>
						</label>
						{settings.kind === 'text' ? (
							<>
								<label className="tools-controls__field tools-controls__field--grow">
									<span>Text</span>
									<input
										type="text"
										value={settings.text}
										onChange={(event) => {
											const text = event.currentTarget.value;
											setSettings((prev) => ({ ...prev, text }));
										}}
									/>
								</label>
								<label className="tools-controls__field">
									<span>Font</span>
									<select
										value={settings.fontFamily}
										onChange={(event) => {
											const fontFamily = event.currentTarget.value;
											setSettings((prev) => ({ ...prev, fontFamily }));
										}}
									>
										{WATERMARK_FONTS.map((font) => (
											<option key={font.id} value={font.value}>
												{font.label}
											</option>
										))}
									</select>
								</label>
								<label className="tools-controls__field tools-controls__field--color">
									<span>Color</span>
									<input
										type="color"
										value={settings.color}
										onChange={(event) => {
											const color = event.currentTarget.value;
											setSettings((prev) => ({ ...prev, color }));
										}}
									/>
								</label>
							</>
						) : (
							<label className="tools-controls__field">
								<span>Logo</span>
								<button
									type="button"
									className="btn btn--ghost"
									onClick={() => logoInputRef.current?.click()}
								>
									{logoImage ? 'Replace logo' : 'Upload PNG'}
								</button>
								<input
									ref={logoInputRef}
									type="file"
									accept="image/png,image/webp,image/*"
									hidden
									onChange={(event) => void onLogoFile(event.currentTarget.files?.[0])}
								/>
							</label>
						)}
						<label className="tools-controls__field">
							<span>Layout</span>
							<select
								value={settings.layout}
								onChange={(event) => {
									const layout = event.currentTarget.value as WatermarkSettings['layout'];
									setSettings((prev) => ({ ...prev, layout }));
								}}
							>
								<option value="grid">Nine-point</option>
								<option value="tile">Diagonal tile</option>
							</select>
						</label>
						<label className="tools-controls__field tools-controls__field--grow">
							<span>Opacity · {settings.opacity}%</span>
							<input
								type="range"
								min={5}
								max={100}
								value={settings.opacity}
								onChange={(event) => {
									const opacity = Number(event.currentTarget.value);
									setSettings((prev) => ({ ...prev, opacity }));
								}}
							/>
						</label>
						<label className="tools-controls__field tools-controls__field--grow">
							<span>
								{settings.kind === 'logo' ? 'Logo size' : 'Size'} ·{' '}
								{settings.kind === 'logo' ? settings.logoScale : settings.sizePercent}%
							</span>
							<input
								type="range"
								min={settings.kind === 'logo' ? 4 : 1.5}
								max={settings.kind === 'logo' ? 40 : 12}
								step={0.1}
								value={settings.kind === 'logo' ? settings.logoScale : settings.sizePercent}
								onChange={(event) => {
									const value = Number(event.currentTarget.value);
									setSettings((prev) =>
										prev.kind === 'logo'
											? { ...prev, logoScale: value }
											: { ...prev, sizePercent: value },
									);
								}}
							/>
						</label>
						{settings.kind === 'text' && (
							<label className="tools-controls__check">
								<input
									type="checkbox"
									checked={settings.stroke}
									onChange={(event) => {
										const stroke = event.currentTarget.checked;
										setSettings((prev) => ({ ...prev, stroke }));
									}}
								/>
								<span>Stroke</span>
							</label>
						)}
						{settings.layout === 'grid' && (
							<div className="tools-grid-picker" role="group" aria-label="Watermark position">
								{GRID_SLOTS.map((slot) => (
									<button
										key={slot}
										type="button"
										className={settings.gridSlot === slot ? 'is-active' : undefined}
										onClick={() => setSettings((prev) => ({ ...prev, gridSlot: slot }))}
										aria-label={`Position ${slot + 1}`}
									/>
								))}
							</div>
						)}
						{settings.layout === 'tile' && (
							<>
								<label className="tools-controls__field tools-controls__field--grow">
									<span>Gap · {settings.tileGapPercent}%</span>
									<input
										type="range"
										min={8}
										max={40}
										value={settings.tileGapPercent}
										onChange={(event) => {
											const tileGapPercent = Number(event.currentTarget.value);
											setSettings((prev) => ({ ...prev, tileGapPercent }));
										}}
									/>
								</label>
								<label className="tools-controls__field tools-controls__field--grow">
									<span>Angle · {settings.tileAngleDeg}°</span>
									<input
										type="range"
										min={-60}
										max={60}
										value={settings.tileAngleDeg}
										onChange={(event) => {
											const tileAngleDeg = Number(event.currentTarget.value);
											setSettings((prev) => ({ ...prev, tileAngleDeg }));
										}}
									/>
								</label>
							</>
						)}
						<p className="tools-work__note">
							Nine-point placement or diagonal tile. Text includes a soft stroke for contrast.
						</p>
					</div>
				}
			>
				<figure className="tools-editor__stage-preview">
					<canvas ref={previewCanvasRef} />
					<figcaption>{showingExample ? 'Live example' : 'Your image'}</figcaption>
				</figure>
			</ToolsEditorShell>

			{error && <p className="tools-work__error">{error}</p>}

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
									{item.status === 'ready' && (item.resultBlob ? 'Done' : 'Ready')}
									{item.status === 'rendering' && 'Working…'}
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
											downloadBlob(item.resultBlob!, watermarkFileName(item.name));
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
