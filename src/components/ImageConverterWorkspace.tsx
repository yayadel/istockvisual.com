import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	CONVERT_FORMATS,
	DEFAULT_CONVERT_SETTINGS,
	canEncodeMime,
	convertImageFile,
	downloadBlob,
	formatBytes,
	zipConvertedFiles,
	type ConvertItem,
	type ConvertSettings,
} from '../lib/image-convert';
import { EXAMPLE_IMAGE_URL, fetchExampleImageFile } from '../lib/tools-shared';
import { ToolsDropzone, ToolsEditorShell } from './ToolsChrome';

function newId() {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeItem(file: File, isExample = false): ConvertItem {
	return {
		id: newId(),
		file,
		name: file.name,
		size: file.size,
		previewUrl: URL.createObjectURL(file),
		status: 'queued',
		progress: 0,
		isExample,
	};
}

function revokeItemUrls(item: ConvertItem) {
	URL.revokeObjectURL(item.previewUrl);
	if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
}

function statusLabel(item: ConvertItem) {
	if (item.status === 'queued') return 'Queued';
	if (item.status === 'converting') return `Converting ${item.progress}%`;
	if (item.status === 'done') return 'Done';
	return item.error || 'Error';
}

export default function ImageConverterWorkspace() {
	const inputRef = useRef<HTMLInputElement>(null);
	const itemsRef = useRef<ConvertItem[]>([]);
	const [items, setItems] = useState<ConvertItem[]>([]);
	const [settings, setSettings] = useState<ConvertSettings>(DEFAULT_CONVERT_SETTINGS);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [avifOk, setAvifOk] = useState(true);

	itemsRef.current = items;
	const showingExample = items.length > 0 && items.every((item) => item.isExample);
	const panelSrc = items[0]?.previewUrl || EXAMPLE_IMAGE_URL;
	const panelCaption = showingExample
		? 'Live example'
		: items[0]
			? 'First in queue'
			: 'Live example';

	useEffect(() => {
		let cancelled = false;
		canEncodeMime('image/avif').then((ok) => {
			if (cancelled) return;
			setAvifOk(ok);
			if (!ok) {
				setSettings((prev) =>
					prev.formatId === 'avif' ? { ...prev, formatId: 'webp' } : prev,
				);
			}
		});
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		return () => {
			for (const item of itemsRef.current) {
				revokeItemUrls(item);
			}
		};
	}, []);

	const patchItem = useCallback((id: string, patch: Partial<ConvertItem>) => {
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
			setItems([makeItem(file, true)]);
		} catch {
			setError('Failed to load example image');
		}
	}, []);

	useEffect(() => {
		void seedExample();
	}, [seedExample]);

	const addFiles = useCallback((list: FileList | File[] | null | undefined) => {
		if (!list || list.length === 0) return;
		const next: ConvertItem[] = [];
		for (const file of Array.from(list)) {
			if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) {
				continue;
			}
			next.push(makeItem(file));
		}
		if (!next.length) {
			setError('Please drop image files (JPG, PNG, WebP, HEIC, etc.).');
			return;
		}
		setError(null);
		setItems((prev) => {
			for (const item of prev) {
				if (item.isExample) revokeItemUrls(item);
			}
			return [...prev.filter((item) => !item.isExample), ...next];
		});
	}, []);

	const removeItem = useCallback(
		(id: string) => {
			setItems((prev) => {
				const target = prev.find((item) => item.id === id);
				if (target) revokeItemUrls(target);
				const next = prev.filter((item) => item.id !== id);
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
		if (inputRef.current) inputRef.current.value = '';
		void seedExample();
	}, [seedExample]);

	const doneItems = useMemo(
		() => items.filter((item) => item.status === 'done' && item.resultBlob && item.resultName),
		[items],
	);

	const convertAll = useCallback(async () => {
		const queue = itemsRef.current.filter(
			(item) => item.status === 'queued' || item.status === 'error',
		);
		if (!queue.length) {
			setError('Add images first, or reset failed items.');
			return;
		}
		setBusy(true);
		setError(null);
		for (const item of queue) {
			patchItem(item.id, { status: 'converting', progress: 12, error: undefined });
			try {
				await new Promise((resolve) => window.setTimeout(resolve, 16));
				patchItem(item.id, { progress: 45 });
				const result = await convertImageFile(item.file, settings);
				const resultUrl = URL.createObjectURL(result.blob);
				patchItem(item.id, {
					status: 'done',
					progress: 100,
					resultBlob: result.blob,
					resultUrl,
					resultSize: result.blob.size,
					resultName: result.fileName,
				});
			} catch (err) {
				console.error(err);
				patchItem(item.id, {
					status: 'error',
					progress: 0,
					error: err instanceof Error ? err.message : 'Conversion failed',
				});
			}
			await new Promise((resolve) => window.setTimeout(resolve, 20));
		}
		setBusy(false);
	}, [patchItem, settings]);

	const downloadZip = useCallback(async () => {
		const files = doneItems
			.filter((item) => item.resultBlob && item.resultName)
			.map((item) => ({ name: item.resultName!, blob: item.resultBlob! }));
		if (!files.length) return;
		setBusy(true);
		try {
			const blob = await zipConvertedFiles(files);
			downloadBlob(blob, `istockvisual-converted-${Date.now()}.zip`);
		} catch (err) {
			console.error(err);
			setError('ZIP download failed. Try individual downloads.');
		} finally {
			setBusy(false);
		}
	}, [doneItems]);

	const formats = CONVERT_FORMATS.filter((item) => item.id !== 'avif' || avifOk);

	return (
		<div className="tools-work">
			<ToolsDropzone
				inputRef={inputRef}
				multiple
				accept="image/*,.heic,.heif"
				title={showingExample ? 'Drop images to convert' : 'Add more images'}
				hint="Batch convert locally — formats, quality, and scale stay on this device. Example is live — convert it now."
				cta="Browse files"
				sampleSrc={panelSrc}
				sampleLabel={showingExample || items.length === 0 ? 'Live example' : 'Queue preview'}
				formats={['JPG', 'PNG', 'WebP', 'HEIC']}
				onFiles={(files) => addFiles(files)}
			/>

			<ToolsEditorShell
				note={
					showingExample
						? 'Example image — upload yours or convert the sample now.'
						: `${items.length} image${items.length === 1 ? '' : 's'} in queue`
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
							onClick={convertAll}
							disabled={busy || items.length === 0}
						>
							{busy ? 'Converting…' : 'Convert all'}
						</button>
						<button
							type="button"
							className="btn btn--ghost"
							onClick={downloadZip}
							disabled={busy || doneItems.length === 0}
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
				controlsLabel="Conversion settings"
				controls={
					<div className="tools-controls tools-controls--stacked">
						<label className="tools-controls__field">
							<span>Format</span>
							<select
								value={settings.formatId}
								onChange={(event) => {
									const formatId = event.currentTarget.value as ConvertSettings['formatId'];
									setSettings((prev) => ({ ...prev, formatId }));
								}}
							>
								{formats.map((format) => (
									<option key={format.id} value={format.id}>
										{format.label}
									</option>
								))}
							</select>
						</label>
						<label className="tools-controls__field tools-controls__field--grow">
							<span>Quality · {settings.quality}%</span>
							<input
								type="range"
								min={40}
								max={100}
								value={settings.quality}
								onChange={(event) => {
									const quality = Number(event.currentTarget.value);
									setSettings((prev) => ({ ...prev, quality }));
								}}
							/>
						</label>
						<label className="tools-controls__field tools-controls__field--grow">
							<span>Scale · {settings.scalePercent}%</span>
							<input
								type="range"
								min={10}
								max={100}
								value={settings.scalePercent}
								onChange={(event) => {
									const scalePercent = Number(event.currentTarget.value);
									setSettings((prev) => ({ ...prev, scalePercent }));
								}}
							/>
						</label>
						<label className="tools-controls__field">
							<span>Max width</span>
							<input
								type="number"
								min={0}
								step={64}
								value={settings.maxWidth}
								onChange={(event) => {
									const maxWidth = Math.max(0, Number(event.currentTarget.value) || 0);
									setSettings((prev) => ({ ...prev, maxWidth }));
								}}
							/>
						</label>
						{settings.formatId === 'jpeg' && (
							<label className="tools-controls__field tools-controls__field--color">
								<span>JPG background</span>
								<input
									type="color"
									value={settings.jpgBackground}
									onChange={(event) => {
										const jpgBackground = event.currentTarget.value;
										setSettings((prev) => ({ ...prev, jpgBackground }));
									}}
								/>
							</label>
						)}
						<p className="tools-work__note">
							Canvas re-encode strips EXIF. Set max width to 0 to keep the original width.
						</p>
					</div>
				}
			>
				<figure className="tools-editor__stage-preview">
					<img src={panelSrc} alt="" />
					<figcaption>{panelCaption}</figcaption>
				</figure>
			</ToolsEditorShell>

			{error && <p className="tools-work__error">{error}</p>}

			{items.length > 0 && (
				<section className="tools-queue" aria-label="Queued images">
					{items.map((item) => (
						<article key={item.id} className="tools-queue__row">
							<img src={item.previewUrl} alt="" className="tools-queue__thumb" />
							<div className="tools-queue__meta">
								<strong title={item.name}>{item.isExample ? 'Example image' : item.name}</strong>
								<span>
									{formatBytes(item.size)}
									{item.resultSize != null ? ` → ${formatBytes(item.resultSize)}` : ''}
									{' · '}
									<em className={`tools-queue__status is-${item.status}`}>
										{statusLabel(item)}
									</em>
								</span>
								{item.status === 'converting' && (
									<span
										className="tools-queue__bar"
										style={{ ['--p' as string]: `${item.progress}%` }}
									/>
								)}
							</div>
							<div className="tools-queue__actions">
								{item.status === 'done' && item.resultBlob && item.resultName && (
									<button
										type="button"
										className="btn btn--primary"
										onClick={() => downloadBlob(item.resultBlob!, item.resultName!)}
									>
										Download
									</button>
								)}
								<button
									type="button"
									className="tools-queue__remove"
									onClick={() => removeItem(item.id)}
									disabled={busy && item.status === 'converting'}
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
