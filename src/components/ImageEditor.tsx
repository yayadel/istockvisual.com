import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
	DEFAULT_ADJUST,
	EDITOR_SIZE_PRESETS,
	applyAdjustToImageData,
	canvasFromImage,
	clamp,
	containSize,
	cssFilterFromAdjust,
	expandWithEdgeFill,
	resolveCanvasSize,
	type AdjustValues,
} from '../lib/image-editor-ops';

type ToolId = 'adjust' | 'transform' | 'remove-bg' | 'expand';

type CropRect = { x: number; y: number; w: number; h: number };

type Props = {
	imageUrl: string;
	title: string;
	onClose: () => void;
};

const DEFAULT_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };

const TOOLS: { id: ToolId; label: string; hint: string }[] = [
	{ id: 'adjust', label: 'Adjust', hint: 'Brightness, contrast, saturation — Canvas, no model' },
	{ id: 'transform', label: 'Crop & Flip', hint: 'Crop, rotate, flip' },
	{ id: 'remove-bg', label: 'Remove BG', hint: 'On-device AI (~30MB first load)' },
	{ id: 'expand', label: 'Expand', hint: 'Edge fill outpaint — no server' },
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

export default function ImageEditor({ imageUrl, title, onClose }: Props) {
	const stageRef = useRef<HTMLDivElement>(null);
	const sourceRef = useRef<HTMLImageElement | null>(null);
	const workingRef = useRef<HTMLCanvasElement | null>(null);
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;
	const previewUrlRef = useRef(imageUrl);

	const [ready, setReady] = useState(false);
	const [previewUrl, setPreviewUrl] = useState(imageUrl);
	const [natural, setNatural] = useState({ w: 0, h: 0 });
	const [sizeId, setSizeId] = useState('original');
	const [tool, setTool] = useState<ToolId>('adjust');
	const [adjust, setAdjust] = useState<AdjustValues>(DEFAULT_ADJUST);
	const [rotation, setRotation] = useState(0);
	const [fineRotation, setFineRotation] = useState(0);
	const [flipX, setFlipX] = useState(false);
	const [flipY, setFlipY] = useState(false);
	const [crop, setCrop] = useState<CropRect>(DEFAULT_CROP);
	const [busy, setBusy] = useState<string | null>(null);
	const [status, setStatus] = useState<string | null>(null);
	const [dragging, setDragging] = useState<
		| null
		| { kind: 'move'; startX: number; startY: number; origin: CropRect }
		| { kind: 'resize'; handle: string; startX: number; startY: number; origin: CropRect }
	>(null);

	previewUrlRef.current = previewUrl;

	const sizePreset = useMemo(
		() => EDITOR_SIZE_PRESETS.find((item) => item.id === sizeId) ?? EDITOR_SIZE_PRESETS[0],
		[sizeId],
	);

	const canvasSize = useMemo(() => {
		if (!natural.w || !natural.h) return { width: 1200, height: 900 };
		return resolveCanvasSize(sizePreset, natural.w, natural.h);
	}, [natural, sizePreset]);

	const stageAspect = canvasSize.width / Math.max(canvasSize.height, 1);

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
			sourceRef.current = img;
			const canvas = canvasFromImage(img, img.naturalWidth, img.naturalHeight);
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
			setCrop(fitCropToAspect(next, sizePreset.ratio));
		};
		const onUp = () => setDragging(null);
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		return () => {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
		};
	}, [dragging, pointerToNorm, sizePreset.ratio]);

	const resetAdjust = () => setAdjust(DEFAULT_ADJUST);

	const updateAdjust =
		(key: keyof AdjustValues) => (event: React.ChangeEvent<HTMLInputElement>) => {
			const value = Number(event.currentTarget.value);
			setAdjust((prev) => ({ ...prev, [key]: value }));
		};

	const handleRemoveBackground = useCallback(async () => {
		const working = workingRef.current;
		if (!working) return;
		setBusy('Loading on-device model…');
		setStatus(null);
		try {
			const { removeBackground } = await import('@imgly/background-removal');
			setBusy('Removing background…');
			const blob = await removeBackground(working.toDataURL('image/png'), {
				progress: (key, current, total) => {
					if (total > 0) {
						setBusy(`Downloading model ${Math.round((current / total) * 100)}%…`);
					} else {
						setBusy(String(key));
					}
				},
			});
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
			setStatus('Background removed on-device. Transparent PNG ready.');
		} catch (error) {
			console.error(error);
			setStatus('Background removal failed. Check network for the first model download.');
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

		if (adjust.brightness || adjust.contrast || adjust.saturation) {
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
	}, [buildExportCanvas, title]);

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
			{/* Backdrop does not close — avoid losing edits on mis-clicks. */}
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
						<button
							className="btn btn--primary"
							type="button"
							onClick={handleDownload}
							disabled={!ready || Boolean(busy)}
						>
							Download
						</button>
					</div>
				</header>

				<section className="image-editor-modal__sizes" aria-label="Output size">
					<span className="image-editor-modal__sizes-label">Size</span>
					<div className="image-editor-modal__size-list">
						{EDITOR_SIZE_PRESETS.map((preset) => (
							<button
								key={preset.id}
								type="button"
								className={`image-editor-modal__size${sizeId === preset.id ? ' is-active' : ''}`}
								onClick={() => setSizeId(preset.id)}
								disabled={Boolean(busy)}
							>
								{preset.label}
							</button>
						))}
					</div>
					<span className="image-editor-modal__size-meta">
						{canvasSize.width}×{canvasSize.height}px
					</span>
				</section>

				<div className="image-editor-modal__body">
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

					<div className="image-editor-modal__workspace">
						<div className="image-editor-modal__stage-wrap">
							<div
								className="image-editor-modal__stage"
								ref={stageRef}
								style={{ aspectRatio: String(stageAspect) }}
							>
								{ready ? (
									<div
										className="image-editor-modal__image-layer"
										style={{ transform: previewTransform, filter: previewFilter }}
									>
										<img
											src={previewUrl}
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
									<p>Runs in your browser via Canvas — no upload, no server GPU.</p>
									<label className="image-editor-modal__slider">
										<span>Brightness</span>
										<input
											type="range"
											min={-50}
											max={50}
											value={adjust.brightness}
											onChange={updateAdjust('brightness')}
										/>
										<span>{adjust.brightness}</span>
									</label>
									<label className="image-editor-modal__slider">
										<span>Contrast</span>
										<input
											type="range"
											min={-50}
											max={50}
											value={adjust.contrast}
											onChange={updateAdjust('contrast')}
										/>
										<span>{adjust.contrast}</span>
									</label>
									<label className="image-editor-modal__slider">
										<span>Saturation</span>
										<input
											type="range"
											min={-50}
											max={50}
											value={adjust.saturation}
											onChange={updateAdjust('saturation')}
										/>
										<span>{adjust.saturation}</span>
									</label>
									<button className="btn btn--ghost" type="button" onClick={resetAdjust}>
										Reset adjust
									</button>
								</>
							)}

							{tool === 'transform' && (
								<>
									<h3>Crop & transform</h3>
									<p>Drag the crop box. Export uses the selected region.</p>
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
								</>
							)}

							{tool === 'remove-bg' && (
								<>
									<h3>Remove background</h3>
									<p>
										Uses <code>@imgly/background-removal</code> (WASM + ONNX) entirely in your
										browser. First run downloads ~30MB model into cache.
									</p>
									<button
										className="btn btn--primary"
										type="button"
										onClick={handleRemoveBackground}
										disabled={Boolean(busy) || !ready}
									>
										Remove background
									</button>
								</>
							)}

							{tool === 'expand' && (
								<>
									<h3>Expand canvas</h3>
									<p>
										Fills new margins with blurred edge extension. Choose a larger Size above,
										then run Expand. (AI inpainting can be added later as an optional ONNX
										model.)
									</p>
									<button
										className="btn btn--primary"
										type="button"
										onClick={handleExpand}
										disabled={Boolean(busy) || !ready}
									>
										Expand to {canvasSize.width}×{canvasSize.height}
									</button>
								</>
							)}

							{status && <p className="image-editor-modal__status">{status}</p>}
						</aside>
					</div>
				</div>
			</div>
		</div>,
		document.body,
	);
}
