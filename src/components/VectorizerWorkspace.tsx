import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	DEFAULT_VECTORIZE_SETTINGS,
	svgToBlob,
	vectorizeBitmap,
	type VectorColorCount,
	type VectorizeSettings,
} from '../lib/image-vectorize';
import { downloadBlob, isLikelyImageFile, yieldToMain } from '../lib/tools-shared';
import { ToolsDropzone, ToolsPanel } from './ToolsChrome';

const COLOR_OPTIONS: VectorColorCount[] = [2, 8, 16, 64];

export default function VectorizerWorkspace() {
	const inputRef = useRef<HTMLInputElement>(null);
	const [sourceUrl, setSourceUrl] = useState<string | null>(null);
	const [fileName, setFileName] = useState('image');
	const [settings, setSettings] = useState<VectorizeSettings>(DEFAULT_VECTORIZE_SETTINGS);
	const [svg, setSvg] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [toast, setToast] = useState<string | null>(null);
	const [split, setSplit] = useState(50);
	const dragSplit = useRef(false);
	const compareRef = useRef<HTMLDivElement>(null);
	const runIdRef = useRef(0);

	useEffect(() => {
		return () => {
			if (sourceUrl) URL.revokeObjectURL(sourceUrl);
		};
	}, [sourceUrl]);

	useEffect(() => {
		if (!toast) return;
		const t = window.setTimeout(() => setToast(null), 1800);
		return () => window.clearTimeout(t);
	}, [toast]);

	const loadFile = useCallback((file: File | undefined | null) => {
		if (!file) return;
		if (!isLikelyImageFile(file)) {
			setError('Please choose an image file.');
			return;
		}
		setError(null);
		setSvg(null);
		const url = URL.createObjectURL(file);
		setSourceUrl((prev) => {
			if (prev) URL.revokeObjectURL(prev);
			return url;
		});
		setFileName(file.name.replace(/\.[^.]+$/, '') || 'image');
	}, []);

	const runVectorize = useCallback(async () => {
		if (!sourceUrl) {
			setError('Add an image first.');
			return;
		}
		const runId = ++runIdRef.current;
		setBusy(true);
		setError(null);
		try {
			await yieldToMain(20);
			const img = await new Promise<HTMLImageElement>((resolve, reject) => {
				const el = new Image();
				el.onload = () => resolve(el);
				el.onerror = () => reject(new Error('Failed to decode image'));
				el.src = sourceUrl;
			});
			const result = await vectorizeBitmap(img, settings, 1200);
			if (runId !== runIdRef.current) return;
			setSvg(result.svg);
		} catch (err) {
			console.error(err);
			if (runId === runIdRef.current) {
				setError(err instanceof Error ? err.message : 'Vectorize failed');
			}
		} finally {
			if (runId === runIdRef.current) setBusy(false);
		}
	}, [settings, sourceUrl]);

	useEffect(() => {
		if (!sourceUrl) return;
		const timer = window.setTimeout(() => {
			void runVectorize();
		}, 280);
		return () => window.clearTimeout(timer);
	}, [sourceUrl, settings, runVectorize]);

	const svgPreviewUrl = useMemo(() => {
		if (!svg) return null;
		return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
	}, [svg]);

	const copySvg = useCallback(async () => {
		if (!svg) return;
		try {
			await navigator.clipboard.writeText(svg);
			setToast('SVG code copied');
		} catch {
			setError('Clipboard copy failed');
		}
	}, [svg]);

	const downloadSvg = useCallback(() => {
		if (!svg) return;
		downloadBlob(svgToBlob(svg), `${fileName}.svg`);
	}, [fileName, svg]);

	const updateSplitFromClientX = useCallback((clientX: number) => {
		const el = compareRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const next = ((clientX - rect.left) / rect.width) * 100;
		setSplit(Math.min(92, Math.max(8, next)));
	}, []);

	useEffect(() => {
		const onMove = (event: PointerEvent) => {
			if (!dragSplit.current) return;
			updateSplitFromClientX(event.clientX);
		};
		const onUp = () => {
			dragSplit.current = false;
		};
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		return () => {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
		};
	}, [updateSplitFromClientX]);

	return (
		<div className="tools-work">
			<ToolsDropzone
				inputRef={inputRef}
				title={sourceUrl ? 'Replace bitmap source' : 'Drop a bitmap to vectorize'}
				hint="Traces locally after scaling to ≤1200px on the long edge."
				cta="Browse files"
				sampleSrc={sourceUrl || '/demo/studio-orb.jpg'}
				sampleLabel={sourceUrl ? 'Source' : 'Trace sample'}
				formats={['PNG', 'JPG', 'WebP']}
				onFiles={(files) => loadFile(files?.[0])}
			/>

			<ToolsPanel
				title="Vectorize settings"
				note="Fewer colors = cleaner silhouettes. Higher blur and min area remove noise."
				sampleSrc={sourceUrl || '/demo/studio-orb.jpg'}
				sampleCaption={svg ? 'Ready for SVG' : 'Awaiting trace'}
				actions={
					<div className="tools-panel__actions">
						<button type="button" className="btn btn--primary" onClick={runVectorize} disabled={busy || !sourceUrl}>
							{busy ? 'Tracing…' : 'Re-trace paths'}
						</button>
						<button type="button" className="btn btn--ghost" onClick={copySvg} disabled={!svg || busy}>
							Copy SVG code
						</button>
						<button type="button" className="btn btn--ghost" onClick={downloadSvg} disabled={!svg || busy}>
							Download SVG
						</button>
					</div>
				}
			>
				<div className="tools-controls tools-controls--stacked">
					<label className="tools-controls__field">
						<span>Colors</span>
						<select
							value={settings.colors}
							onChange={(event) =>
								setSettings((prev) => ({
									...prev,
									colors: Number(event.currentTarget.value) as VectorColorCount,
								}))
							}
						>
							{COLOR_OPTIONS.map((n) => (
								<option key={n} value={n}>
									{n === 2 ? '2 · silhouette' : `${n} colors`}
								</option>
							))}
						</select>
					</label>
					<label className="tools-controls__field tools-controls__field--grow">
						<span>Blur · {settings.blurRadius}</span>
						<input
							type="range"
							min={0}
							max={5}
							step={1}
							value={settings.blurRadius}
							onChange={(event) =>
								setSettings((prev) => ({
									...prev,
									blurRadius: Number(event.currentTarget.value),
								}))
							}
						/>
					</label>
					<label className="tools-controls__field tools-controls__field--grow">
						<span>Min area · {settings.minArea}</span>
						<input
							type="range"
							min={0}
							max={40}
							step={1}
							value={settings.minArea}
							onChange={(event) =>
								setSettings((prev) => ({
									...prev,
									minArea: Number(event.currentTarget.value),
								}))
							}
						/>
					</label>
				</div>
			</ToolsPanel>

			{error && <p className="tools-work__error">{error}</p>}
			{toast && <p className="tools-toast" role="status">{toast}</p>}

			{sourceUrl && (
				<section className="tools-compare" ref={compareRef} aria-label="Before and after">
					<div className="tools-compare__stage" style={{ ['--split' as string]: `${split}%` }}>
						{svgPreviewUrl && (
							<img src={svgPreviewUrl} alt="Vector result" className="tools-compare__layer" />
						)}
						{!svgPreviewUrl && (
							<div className="tools-compare__placeholder">
								{busy ? 'Tracing paths…' : 'SVG preview will appear here'}
							</div>
						)}
						<div className="tools-compare__before">
							<img src={sourceUrl} alt="Original bitmap" />
						</div>
						<button
							type="button"
							className="tools-compare__handle"
							style={{ left: `${split}%` }}
							aria-label="Drag comparison slider"
							onPointerDown={(event) => {
								event.preventDefault();
								dragSplit.current = true;
								updateSplitFromClientX(event.clientX);
							}}
						/>
					</div>
					<div className="tools-compare__labels">
						<span>Bitmap</span>
						<span>SVG</span>
					</div>
					{busy && (
						<div className="tools-progress" aria-live="polite">
							<span className="tools-progress__bar tools-progress__bar--indeterminate" />
							<span>Vectorizing on-device…</span>
						</div>
					)}
				</section>
			)}
		</div>
	);
}
