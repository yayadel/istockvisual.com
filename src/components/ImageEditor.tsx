import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { isFreeDownloadSize } from '../lib/download-sizes';
import {
	ADJUST_SLIDERS,
	DEFAULT_ADJUST,
	DEFAULT_DOWNLOAD_SIZE,
	DOWNLOAD_SIZES,
	EDITOR_ASPECT_PRESETS,
	applyAdjustToImageData,
	aspectPreviewBox,
	canvasFromImage,
	clamp,
	containSize,
	cssFilterFromAdjust,
	expandWithEdgeFill,
	hasAdjustChanges,
	resolveEditorCanvasSize,
	type AdjustValues,
	type DownloadSizeId,
} from '../lib/image-editor-ops';

type ToolId = 'adjust' | 'transform' | 'remove-bg' | 'expand';

type CropRect = { x: number; y: number; w: number; h: number };

type Props = {
	imageUrl: string;
	title: string;
	onClose: () => void;
	loggedIn?: boolean;
	isPro?: boolean;
};

const DEFAULT_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };

const TOOLS: { id: ToolId; label: string; hint: string }[] = [
	{ id: 'adjust', label: 'Adjust', hint: 'Color & light' },
	{ id: 'transform', label: 'Crop & Flip', hint: 'Aspect, crop, rotate' },
	{ id: 'remove-bg', label: 'Remove BG', hint: 'Cut out subject' },
	{ id: 'expand', label: 'Expand', hint: 'Extend canvas' },
];

function fitCropToAspect(crop: CropRect, ratio: number | null): CropRect {
	if (!ratio) return crop;
	const centerX = crop.x + crop.w / 2;
	const centerY = crop.y + crop.h / 2;
	let w = crop.w;
	let h = crop.h;
	const current = w / h;
	if (current > ratio) w = h * ratio;
	else h = w / ratio;
	const next: CropRect = {
		w: clamp(w, 0.12, 1),
		h: clamp(h, 0.12, 1),
		x: centerX - w / 2,
		y: centerY - h / 2,
	};
	next.x = clamp(next.x, 0, 1 - next.w);
	next.y = clamp(next.y, 0, 1 - next.h);
	return next;
}

function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
	return canvasFromImage(source, source.width, source.height);
}

export default function ImageEditor({
	imageUrl,
	title,
	onClose,
	loggedIn = false,
	isPro = false,
}: Props) {
	const stageRef = useRef<HTMLDivElement>(null);
	const workingRef = useRef<HTMLCanvasElement | null>(null);
	const originalRef = useRef<HTMLCanvasElement | null>(null);
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;
	const previewUrlRef = useRef(imageUrl);

	const [ready, setReady] = useState(false);
	const [previewUrl, setPreviewUrl] = useState(imageUrl);
	const [natural, setNatural] = useState({ w: 0, h: 0 });
	const [sizeId, setSizeId] = useState<DownloadSizeId>(DEFAULT_DOWNLOAD_SIZE);
	const [aspectId, setAspectId] = useState('free');
	const [sizeGateMessage, setSizeGateMessage] = useState<string | null>(null);
	const [tool, setTool] = useState<ToolId>('adjust');
	const [adjust, setAdjust] = useState<AdjustValues>(DEFAULT_ADJUST);
	const [rotation, setRotation] = useState(0);
	const [fineRotation, setFineRotation] = useState(0);
	const [flipX, setFlipX] = useState(false);
	const [flipY, setFlipY] = useState(false);
	const [crop, setCrop] = useState<CropRect>(DEFAULT_CROP);
	const [frameUrl, setFrameUrl] = useState<string | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const [status, setStatus] = useState<string | null>(null);
	const [dragging, setDragging] = useState<
		| null
		| { kind: 'move'; startX: number; startY: number; origin: CropRect }
		| { kind: 'resize'; handle: string; startX: number; startY: number; origin: CropRect }
	>(null);

	previewUrlRef.current = previewUrl;

	const aspectPreset = useMemo(
		() => EDITOR_ASPECT_PRESETS.find((item) => item.id === aspectId) ?? EDITOR_ASPECT_PRESETS[0]!,
		[aspectId],
	);

	const sizeOptions = useMemo(() => {
		const sourceW = natural.w || 1536;
		const sourceH = natural.h || 1024;
		return DOWNLOAD_SIZES.map((size) => ({
			...size,
			output: resolveEditorCanvasSize(size.id, aspectPreset.ratio, sourceW, sourceH),
		}));
	}, [aspectPreset.ratio, natural.h, natural.w]);

	const canvasSize = useMemo(() => {
		const selected = sizeOptions.find((item) => item.id === sizeId);
		return selected?.output ?? { width: 1024, height: 768 };
	}, [sizeId, sizeOptions]);

	const rebuildFramePreview = useCallback(() => {
		const working = workingRef.current;
		if (!working) return;
		const { width, height } = canvasSize;
		const frame = document.createElement('canvas');
		frame.width = Math.max(1, width);
		frame.height = Math.max(1, height);
		const ctx = frame.getContext('2d');
		if (!ctx) return;
		const fit = containSize(working.width, working.height, frame.width, frame.height);
		ctx.clearRect(0, 0, frame.width, frame.height);
		ctx.drawImage(
			working,
			0,
			0,
			working.width,
			working.height,
			Math.round(fit.x),
			Math.round(fit.y),
			Math.round(fit.w),
			Math.round(fit.h),
		);
		// Bake advanced adjusts that CSS cannot express (temp/tint/shadows/highlights).
		const needsBake =
			adjust.temperature !== 0 ||
			adjust.tint !== 0 ||
			adjust.highlights !== 0 ||
			adjust.shadows !== 0;
		if (needsBake) {
			const imageData = ctx.getImageData(0, 0, frame.width, frame.height);
			ctx.putImageData(
				applyAdjustToImageData(imageData, {
					...DEFAULT_ADJUST,
					temperature: adjust.temperature,
					tint: adjust.tint,
					highlights: adjust.highlights,
					shadows: adjust.shadows,
				}),
				0,
				0,
			);
		}
		setFrameUrl(frame.toDataURL('image/png'));
	}, [adjust.highlights, adjust.shadows, adjust.temperature, adjust.tint, canvasSize]);

	useEffect(() => {
		if (!ready) return;
		const timer = window.setTimeout(() => rebuildFramePreview(), 40);
		return () => window.clearTimeout(timer);
	}, [ready, rebuildFramePreview, previewUrl]);

	const previewTransform = useMemo(() => {
		const radians = rotation + fineRotation;
		return `rotate(${radians}deg) scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})`;
	}, [flipX, flipY, fineRotation, rotation]);

	const previewFilter = useMemo(() => cssFilterFromAdjust(adjust), [adjust]);

	const revokeIfBlob = useCallback((url: string) => {
		if (url.startsWith('blob:')) URL.revokeObjectURL(url);
	}, []);

	const setWorkingFromCanvas = useCallback(
		(canvas: HTMLCanvasElement) => {
			workingRef.current = canvas;
			setNatural({ w: canvas.width, h: canvas.height });
			const next = canvas.toDataURL('image/png');
			setPreviewUrl((prev) => {
				revokeIfBlob(prev);
				return next;
			});
		},
		[revokeIfBlob],
	);

	const restoreOriginalWorking = useCallback(() => {
		const original = originalRef.current;
		if (!original) return;
		setWorkingFromCanvas(cloneCanvas(original));
	}, [setWorkingFromCanvas]);

	useEffect(() => {
		document.body.classList.add('image-editor-modal-open');
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && !busy) onCloseRef.current();
		};
		window.addEventListener('keydown', onKey);
		return () => {
			document.body.classList.remove('image-editor-modal-open');
			window.removeEventListener('keydown', onKey);
		};
	}, [busy]);

	useEffect(() => {
		let cancelled = false;
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => {
			if (cancelled) return;
			const canvas = canvasFromImage(img, img.naturalWidth, img.naturalHeight);
			originalRef.current = cloneCanvas(canvas);
			workingRef.current = canvas;
			setNatural({ w: img.naturalWidth, h: img.naturalHeight });
			setPreviewUrl(imageUrl);
			setReady(true);
		};
		img.onerror = () => {
			if (cancelled) return;
			setStatus('Failed to load image for editing.');
			setReady(true);
		};
		img.src = imageUrl;
		return () => {
			cancelled = true;
		};
	}, [imageUrl]);

	useEffect(() => {
		return () => {
			revokeIfBlob(previewUrlRef.current);
		};
	}, [revokeIfBlob]);

	const pointerToNorm = useCallback((clientX: number, clientY: number) => {
		const stage = stageRef.current;
		if (!stage) return { x: 0, y: 0 };
		const rect = stage.getBoundingClientRect();
		return {
			x: clamp((clientX - rect.left) / rect.width, 0, 1),
			y: clamp((clientY - rect.top) / rect.height, 0, 1),
		};
	}, []);

	const onCropPointerDown = (
		event: React.PointerEvent,
		kind: 'move' | 'resize',
		handle = '',
	) => {
		event.preventDefault();
		event.stopPropagation();
		const point = pointerToNorm(event.clientX, event.clientY);
		setDragging({ kind, handle, startX: point.x, startY: point.y, origin: crop });
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	};

	useEffect(() => {
		if (!dragging) return;
		const onMove = (event: PointerEvent) => {
			const point = pointerToNorm(event.clientX, event.clientY);
			const dx = point.x - dragging.startX;
			const dy = point.y - dragging.startY;
			const origin = dragging.origin;
			if (dragging.kind === 'move') {
				setCrop({
					...origin,
					x: clamp(origin.x + dx, 0, 1 - origin.w),
					y: clamp(origin.y + dy, 0, 1 - origin.h),
				});
				return;
			}
			let next = { ...origin };
			const handle = dragging.handle;
			if (handle.includes('e')) next.w = clamp(origin.w + dx, 0.12, 1 - origin.x);
			if (handle.includes('s')) next.h = clamp(origin.h + dy, 0.12, 1 - origin.y);
			if (handle.includes('w')) {
				const w = clamp(origin.w - dx, 0.12, origin.x + origin.w);
				next.x = origin.x + origin.w - w;
				next.w = w;
			}
			if (handle.includes('n')) {
				const h = clamp(origin.h - dy, 0.12, origin.y + origin.h);
				next.y = origin.y + origin.h - h;
				next.h = h;
			}
			next.x = clamp(next.x, 0, 1 - next.w);
			next.y = clamp(next.y, 0, 1 - next.h);
			setCrop(fitCropToAspect(next, aspectPreset.ratio));
		};
		const onUp = () => setDragging(null);
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		return () => {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
		};
	}, [aspectPreset.ratio, dragging, pointerToNorm]);

	const selectSize = (next: DownloadSizeId) => {
		if (!isFreeDownloadSize(next)) {
			if (!loggedIn) {
				setSizeGateMessage('Sign in and upgrade to Pro for 2K / 4K / 8K.');
				return;
			}
			if (!isPro) {
				setSizeGateMessage('Pro required for 2K / 4K / 8K. Free sizes: 500 and 1K.');
				return;
			}
		}
		setSizeGateMessage(null);
		setSizeId(next);
	};

	const selectAspect = (id: string) => {
		const preset = EDITOR_ASPECT_PRESETS.find((item) => item.id === id);
		setAspectId(id);
		if (preset) {
			setCrop((current) => fitCropToAspect(current, preset.ratio));
		}
	};

	const resetAdjust = () => {
		setAdjust(DEFAULT_ADJUST);
		setStatus('Adjust reset.');
	};

	const resetTransform = () => {
		setRotation(0);
		setFineRotation(0);
		setFlipX(false);
		setFlipY(false);
		setAspectId('free');
		setCrop(DEFAULT_CROP);
		setStatus('Crop & Flip reset.');
	};

	const resetRemoveBg = () => {
		restoreOriginalWorking();
		setStatus('Background removal reset to original.');
	};

	const resetExpand = () => {
		restoreOriginalWorking();
		setCrop(DEFAULT_CROP);
		setStatus('Expand reset to original.');
	};

	const updateAdjust =
		(key: keyof AdjustValues) => (event: React.ChangeEvent<HTMLInputElement>) => {
			const value = Number(event.currentTarget.value);
			setAdjust((prev) => ({ ...prev, [key]: value }));
		};

	const handleRemoveBackground = useCallback(async () => {
		const working = workingRef.current;
		if (!working) return;
		setBusy('Processing 0%…');
		setStatus(null);
		try {
			const { removeBackground, preload } = await import('@imgly/background-removal');
			const config = {
				model: 'isnet_fp16' as const,
				fetchArgs: { cache: 'force-cache' as RequestCache },
				progress: (_key: string, current: number, total: number) => {
					const pct = total > 0 ? Math.min(99, Math.round((current / total) * 100)) : 0;
					setBusy(`Processing ${pct}%…`);
				},
			};
			await preload(config);
			setBusy('Processing 99%…');
			const blob = await removeBackground(working.toDataURL('image/png'), config);
			const img = new Image();
			const url = URL.createObjectURL(blob);
			await new Promise<void>((resolve, reject) => {
				img.onload = () => resolve();
				img.onerror = () => reject(new Error('Failed to decode result'));
				img.src = url;
			});
			const canvas = canvasFromImage(img, img.naturalWidth, img.naturalHeight);
			URL.revokeObjectURL(url);
			setWorkingFromCanvas(canvas);
			setStatus('Background removed. Transparent PNG ready.');
		} catch (error) {
			console.error(error);
			setStatus('Background removal failed. Please try again.');
		} finally {
			setBusy(null);
		}
	}, [setWorkingFromCanvas]);

	const handleExpand = useCallback(() => {
		const working = workingRef.current;
		if (!working) return;
		const { width, height } = canvasSize;
		if (width === working.width && height === working.height) {
			setStatus('Canvas already matches the selected size. Pick a larger size preset first.');
			return;
		}
		setBusy('Expanding edges…');
		try {
			const expanded = expandWithEdgeFill(
				working,
				working.width,
				working.height,
				width,
				height,
			);
			setWorkingFromCanvas(expanded);
			setCrop(DEFAULT_CROP);
			setStatus(`Expanded to ${width}×${height} with edge fill.`);
		} finally {
			setBusy(null);
		}
	}, [canvasSize, setWorkingFromCanvas]);

	const buildExportCanvas = useCallback(() => {
		const working = workingRef.current;
		if (!working) return null;

		const { width: targetW, height: targetH } = canvasSize;
		const frame = document.createElement('canvas');
		frame.width = targetW;
		frame.height = targetH;
		const frameCtx = frame.getContext('2d');
		if (!frameCtx) return null;

		const fit = containSize(working.width, working.height, targetW, targetH);
		frameCtx.save();
		frameCtx.translate(targetW / 2, targetH / 2);
		frameCtx.rotate(((rotation + fineRotation) * Math.PI) / 180);
		frameCtx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
		frameCtx.drawImage(working, -fit.w / 2, -fit.h / 2, fit.w, fit.h);
		frameCtx.restore();

		if (hasAdjustChanges(adjust)) {
			const imageData = frameCtx.getImageData(0, 0, targetW, targetH);
			frameCtx.putImageData(applyAdjustToImageData(imageData, adjust), 0, 0);
		}

		const needsCrop = crop.x > 0.001 || crop.y > 0.001 || crop.w < 0.999 || crop.h < 0.999;
		if (needsCrop) {
			const sx = Math.round(crop.x * targetW);
			const sy = Math.round(crop.y * targetH);
			const sw = Math.max(1, Math.round(crop.w * targetW));
			const sh = Math.max(1, Math.round(crop.h * targetH));
			const out = document.createElement('canvas');
			out.width = sw;
			out.height = sh;
			const outCtx = out.getContext('2d');
			if (!outCtx) return frame;
			outCtx.drawImage(frame, sx, sy, sw, sh, 0, 0, sw, sh);
			return out;
		}

		return frame;
	}, [adjust, canvasSize, crop, fineRotation, flipX, flipY, rotation]);

	const handleDownload = useCallback(() => {
		if (!isFreeDownloadSize(sizeId)) {
			if (!loggedIn) {
				setSizeGateMessage('Sign in and upgrade to Pro for 2K / 4K / 8K.');
				return;
			}
			if (!isPro) {
				setSizeGateMessage('Pro required for 2K / 4K / 8K. Free sizes: 500 and 1K.');
				return;
			}
		}
		const canvas = buildExportCanvas();
		if (!canvas) return;
		canvas.toBlob((blob) => {
			if (!blob) return;
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `${title.replace(/\s+/g, '-').toLowerCase()}-edited.png`;
			link.click();
			URL.revokeObjectURL(url);
		}, 'image/png');
	}, [buildExportCanvas, isPro, loggedIn, sizeId, title]);

	const stop = (event: React.SyntheticEvent) => {
		event.stopPropagation();
	};

	return createPortal(
		<div
			className="image-editor-modal"
			role="presentation"
			onMouseDown={stop}
			onClick={stop}
		>
			<div className="image-editor-modal__backdrop" aria-hidden="true" />
			<div
				className="image-editor-modal__dialog"
				role="dialog"
				aria-modal="true"
				aria-labelledby="image-editor-title"
				onMouseDown={stop}
				onClick={stop}
			>
				<header className="image-editor-modal__header">
					<div>
						<p className="image-editor-modal__eyebrow">Client-side editor</p>
						<h2 id="image-editor-title">{title}</h2>
					</div>
					<div className="image-editor-modal__header-actions">
						<button
							className="btn btn--ghost"
							type="button"
							onClick={() => onCloseRef.current()}
							disabled={Boolean(busy)}
						>
							Close
						</button>
					</div>
				</header>

				<section className="image-editor-modal__controls" aria-label="Size and tools">
					<div className="image-editor-modal__row">
						<span className="image-editor-modal__row-label">Size</span>
						<div className="image-editor-modal__size-list">
							{sizeOptions.map((size) => {
								const needsPro = !isFreeDownloadSize(size.id);
								const dims = `${size.output.width}×${size.output.height}`;
								return (
									<button
										key={size.id}
										type="button"
										className={`image-editor-modal__size${sizeId === size.id ? ' is-active' : ''}`}
										onClick={() => selectSize(size.id)}
										disabled={Boolean(busy)}
										title={dims}
									>
										<span className="image-editor-modal__size-name">{dims}</span>
										{needsPro ? (
											<em className="download-tier download-tier--pro">Pro</em>
										) : (
											<span className="download-tier download-tier--free">Free</span>
										)}
									</button>
								);
							})}
						</div>
					</div>
					{sizeGateMessage && (
						<p className="image-editor-modal__gate">
							{sizeGateMessage}{' '}
							<a href="/price">Go Pro</a>
						</p>
					)}

					<div className="image-editor-modal__row image-editor-modal__row--tools">
						<span className="image-editor-modal__row-label">Tools</span>
						<nav className="image-editor-modal__tools" aria-label="Edit tools">
							{TOOLS.map((item) => (
								<button
									key={item.id}
									type="button"
									className={`image-editor-modal__tool${tool === item.id ? ' is-active' : ''}`}
									onClick={() => setTool(item.id)}
									disabled={Boolean(busy)}
								>
									<span>{item.label}</span>
									<small>{item.hint}</small>
								</button>
							))}
						</nav>
					</div>

					{tool === 'transform' && (
						<div className="image-editor-modal__row image-editor-modal__row--aspects">
							<span className="image-editor-modal__row-label">Aspect</span>
							<div className="image-editor-modal__aspect-list">
								{EDITOR_ASPECT_PRESETS.map((preset) => {
									const box = aspectPreviewBox(preset.ratio, 18);
									return (
										<button
											key={preset.id}
											type="button"
											className={`image-editor-modal__aspect${aspectId === preset.id ? ' is-active' : ''}`}
											onClick={() => selectAspect(preset.id)}
											disabled={Boolean(busy)}
											title={preset.label}
										>
											<span className="image-editor-modal__aspect-icon" aria-hidden="true">
												<span
													className="image-editor-modal__aspect-shape"
													style={{ width: box.width, height: box.height }}
												/>
											</span>
											<span className="image-editor-modal__aspect-label">{preset.label}</span>
										</button>
									);
								})}
							</div>
						</div>
					)}
				</section>

				<div className="image-editor-modal__body">
					<div className="image-editor-modal__workspace">
						<div className="image-editor-modal__stage-wrap">
							<div
								className="image-editor-modal__stage"
								ref={stageRef}
								style={
									{
										['--ie-ar']: String(canvasSize.width / Math.max(canvasSize.height, 1)),
									} as CSSProperties
								}
							>
								{ready && (frameUrl || previewUrl) ? (
									<div
										className="image-editor-modal__image-layer"
										style={{ transform: previewTransform, filter: previewFilter }}
									>
										<img
											src={frameUrl || previewUrl}
											alt=""
											className="image-editor-modal__image"
											draggable={false}
										/>
									</div>
								) : (
									<p className="image-editor-modal__loading">Loading image…</p>
								)}

								{tool === 'transform' && ready && (
									<div
										className="image-editor-modal__crop"
										style={{
											left: `${crop.x * 100}%`,
											top: `${crop.y * 100}%`,
											width: `${crop.w * 100}%`,
											height: `${crop.h * 100}%`,
										}}
										onPointerDown={(event) => onCropPointerDown(event, 'move')}
									>
										{['nw', 'ne', 'sw', 'se'].map((handle) => (
											<span
												key={handle}
												className={`image-editor-modal__handle image-editor-modal__handle--${handle}`}
												onPointerDown={(event) => onCropPointerDown(event, 'resize', handle)}
											/>
										))}
									</div>
								)}

								{busy && (
									<div className="image-editor-modal__busy" role="status">
										<span className="image-editor-modal__spinner" aria-hidden="true" />
										<p>{busy}</p>
									</div>
								)}
							</div>
						</div>

						<aside className="image-editor-modal__panel">
							{tool === 'adjust' && (
								<>
									<h3>Color & light</h3>
									<p>Fine-tune exposure, color, and tone.</p>
									{ADJUST_SLIDERS.map((item) => (
										<label key={item.key} className="image-editor-modal__slider">
											<span>{item.label}</span>
											<input
												type="range"
												min={item.min}
												max={item.max}
												value={adjust[item.key]}
												onChange={updateAdjust(item.key)}
											/>
											<span>{adjust[item.key]}</span>
										</label>
									))}
									<button className="btn btn--ghost" type="button" onClick={resetAdjust}>
										Reset
									</button>
								</>
							)}

							{tool === 'transform' && (
								<>
									<h3>Crop & Flip</h3>
									<p>Pick an aspect above, then drag the crop box. Rotate or flip as needed.</p>
									<div className="image-editor-modal__action-row">
										<button
											className="btn btn--ghost"
											type="button"
											onClick={() => setRotation((value) => (value + 90) % 360)}
										>
											Rotate 90°
										</button>
										<button
											className={`btn btn--ghost${flipX ? ' is-active' : ''}`}
											type="button"
											onClick={() => setFlipX((value) => !value)}
										>
											Flip H
										</button>
										<button
											className={`btn btn--ghost${flipY ? ' is-active' : ''}`}
											type="button"
											onClick={() => setFlipY((value) => !value)}
										>
											Flip V
										</button>
									</div>
									<label className="image-editor-modal__slider">
										<span>Fine rotate</span>
										<input
											type="range"
											min={-45}
											max={45}
											value={fineRotation}
											onChange={(event) => setFineRotation(Number(event.currentTarget.value))}
										/>
										<span>{fineRotation}°</span>
									</label>
									<button className="btn btn--ghost" type="button" onClick={resetTransform}>
										Reset
									</button>
								</>
							)}

							{tool === 'remove-bg' && (
								<>
									<h3>Remove background</h3>
									<p className="image-editor-modal__tip">
										First use on this site needs to load resources and may feel slow. After
										that, remove background should be much faster.
									</p>
									<button
										className="btn btn--primary"
										type="button"
										onClick={handleRemoveBackground}
										disabled={Boolean(busy) || !ready}
									>
										Remove background
									</button>
									<button className="btn btn--ghost" type="button" onClick={resetRemoveBg}>
										Reset
									</button>
								</>
							)}

							{tool === 'expand' && (
								<>
									<h3>Expand canvas</h3>
									<p>
										Choose a larger Size above, then expand the image to fill the new frame.
									</p>
									<button
										className="btn btn--primary"
										type="button"
										onClick={handleExpand}
										disabled={Boolean(busy) || !ready}
									>
										Expand to {canvasSize.width}×{canvasSize.height}
									</button>
									<button className="btn btn--ghost" type="button" onClick={resetExpand}>
										Reset
									</button>
								</>
							)}

							{status && <p className="image-editor-modal__status">{status}</p>}

							<button
								className="btn btn--primary image-editor-modal__download"
								type="button"
								onClick={handleDownload}
								disabled={!ready || Boolean(busy)}
							>
								Download edited · {canvasSize.width}×{canvasSize.height}
							</button>
						</aside>
					</div>
				</div>
			</div>
		</div>,
		document.body,
	);
}
