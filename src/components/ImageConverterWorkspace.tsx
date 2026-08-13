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

function newId() {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeItem(file: File): ConvertItem {
	return {
		id: newId(),
		file,
		name: file.name,
		size: file.size,
		previewUrl: URL.createObjectURL(file),
		status: 'queued',
		progress: 0,
	};
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
				URL.revokeObjectURL(item.previewUrl);
				if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
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
		setItems((prev) => [...prev, ...next]);
	}, []);

	const removeItem = useCallback((id: string) => {
		setItems((prev) => {
			const target = prev.find((item) => item.id === id);
			if (target) {
				URL.revokeObjectURL(target.previewUrl);
				if (target.resultUrl) URL.revokeObjectURL(target.resultUrl);
			}
			return prev.filter((item) => item.id !== id);
		});
	}, []);

	const clearAll = useCallback(() => {
		setItems((prev) => {
			for (const item of prev) {
				URL.revokeObjectURL(item.previewUrl);
				if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
			}
			return [];
		});
		if (inputRef.current) inputRef.current.value = '';
	}, []);

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
					addFiles(event.dataTransfer.files);
				}}
			>
				<input
					ref={inputRef}
					type="file"
					accept="image/*,.heic,.heif"
					multiple
					hidden
					onChange={(event) => addFiles(event.currentTarget.files)}
				/>
				<div className="tools-rail__text">
					<strong>Add images to convert</strong>
					<span>Drop multiple files, or browse. JPG / PNG / WebP / HEIC.</span>
				</div>
				<span className="tools-rail__cta">Browse</span>
			</label>

			<section className="tools-controls" aria-label="Output settings">
				<label className="tools-controls__field">
					<span>Format</span>
					<select
						value={settings.formatId}
						onChange={(event) =>
							setSettings((prev) => ({
								...prev,
								formatId: event.currentTarget.value as ConvertSettings['formatId'],
							}))
						}
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
						onChange={(event) =>
							setSettings((prev) => ({
								...prev,
								quality: Number(event.currentTarget.value),
							}))
						}
					/>
				</label>
				<label className="tools-controls__field tools-controls__field--grow">
					<span>Scale · {settings.scalePercent}%</span>
					<input
						type="range"
						min={10}
						max={100}
						value={settings.scalePercent}
						onChange={(event) =>
							setSettings((prev) => ({
								...prev,
								scalePercent: Number(event.currentTarget.value),
							}))
						}
					/>
				</label>
				<label className="tools-controls__field">
					<span>Max width</span>
					<input
						type="number"
						min={0}
						step={64}
						value={settings.maxWidth}
						onChange={(event) =>
							setSettings((prev) => ({
								...prev,
								maxWidth: Math.max(0, Number(event.currentTarget.value) || 0),
							}))
						}
					/>
				</label>
				{settings.formatId === 'jpeg' && (
					<label className="tools-controls__field tools-controls__field--color">
						<span>JPG bg</span>
						<input
							type="color"
							value={settings.jpgBackground}
							onChange={(event) =>
								setSettings((prev) => ({
									...prev,
									jpgBackground: event.currentTarget.value,
								}))
							}
						/>
					</label>
				)}
				<div className="tools-controls__actions">
					<button
						type="button"
						className="btn btn--primary"
						onClick={convertAll}
						disabled={busy || items.length === 0}
					>
						{busy ? 'Converting…' : 'Convert'}
					</button>
					<button
						type="button"
						className="btn btn--ghost"
						onClick={downloadZip}
						disabled={busy || doneItems.length === 0}
					>
						ZIP
					</button>
					<button
						type="button"
						className="btn btn--ghost"
						onClick={clearAll}
						disabled={busy || items.length === 0}
					>
						Clear
					</button>
				</div>
			</section>

			<p className="tools-work__note">Canvas re-encode strips EXIF. 0 max width keeps original.</p>

			{error && <p className="tools-work__error">{error}</p>}

			{items.length > 0 && (
				<section className="tools-queue" aria-label="Queued images">
					{items.map((item) => (
						<article key={item.id} className="tools-queue__row">
							<img src={item.previewUrl} alt="" className="tools-queue__thumb" />
							<div className="tools-queue__meta">
								<strong title={item.name}>{item.name}</strong>
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
