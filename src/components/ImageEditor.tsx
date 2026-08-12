import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type AspectPreset = {
	id: string;
	label: string;
	ratio: number | null;
};

type CropRect = {
	x: number;
	y: number;
	w: number;
	h: number;
};

type Props = {
	imageUrl: string;
	title: string;
	onCancel?: () => void;
};

const ASPECT_PRESETS: AspectPreset[] = [
	{ id: 'free', label: 'Free', ratio: null },
	{ id: '1:1', label: '1:1', ratio: 1 },
	{ id: '16:9', label: '16:9', ratio: 16 / 9 },
	{ id: '9:16', label: '9:16', ratio: 9 / 16 },
	{ id: '4:5', label: '4:5', ratio: 4 / 5 },
	{ id: '2:1', label: '2:1', ratio: 2 / 1 },
	{ id: '7:5', label: '7:5', ratio: 7 / 5 },
	{ id: '4:3', label: '4:3', ratio: 4 / 3 },
	{ id: '3:2', label: '3:2', ratio: 3 / 2 },
];

const DEFAULT_CROP: CropRect = { x: 0.08, y: 0.08, w: 0.84, h: 0.84 };

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function fitCropToAspect(crop: CropRect, ratio: number | null): CropRect {
	if (!ratio) return crop;
	const centerX = crop.x + crop.w / 2;
	const centerY = crop.y + crop.h / 2;
	let w = crop.w;
	let h = crop.h;
	const current = w / h;

	if (current > ratio) {
		w = h * ratio;
	} else {
		h = w / ratio;
	}

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

export default function ImageEditor({ imageUrl, title, onCancel }: Props) {
	const stageRef = useRef<HTMLDivElement>(null);
	const [loaded, setLoaded] = useState(false);
	const [rotation, setRotation] = useState(0);
	const [fineRotation, setFineRotation] = useState(0);
	const [flipX, setFlipX] = useState(false);
	const [flipY, setFlipY] = useState(false);
	const [zoom, setZoom] = useState(100);
	const [aspectId, setAspectId] = useState('free');
	const [crop, setCrop] = useState<CropRect>(DEFAULT_CROP);
	const [dragging, setDragging] = useState<
		| null
		| { kind: 'move'; startX: number; startY: number; origin: CropRect }
		| { kind: 'resize'; handle: string; startX: number; startY: number; origin: CropRect }
	>(null);

	const aspectRatio = useMemo(
		() => ASPECT_PRESETS.find((item) => item.id === aspectId)?.ratio ?? null,
		[aspectId],
	);

	const handleCancel = useCallback(() => {
		resetEdits();
		onCancel?.();
	}, [onCancel, resetEdits]);

	const applyAspect = useCallback((id: string) => {
		const preset = ASPECT_PRESETS.find((item) => item.id === id);
		setAspectId(id);
		if (preset) {
			setCrop((current) => fitCropToAspect(current, preset.ratio));
		}
	}, []);

	const rotate90 = useCallback(() => {
		setRotation((value) => (value + 90) % 360);
	}, []);

	const toggleFlipX = useCallback(() => setFlipX((value) => !value), []);
	const toggleFlipY = useCallback(() => setFlipY((value) => !value), []);

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
		setDragging({
			kind,
			handle,
			startX: point.x,
			startY: point.y,
			origin: crop,
		});
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
			setCrop(fitCropToAspect(next, aspectRatio));
		};

		const onUp = () => setDragging(null);
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		return () => {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
		};
	}, [aspectRatio, dragging, pointerToNorm]);

	const exportEditedImage = useCallback(async () => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.src = imageUrl;
		await img.decode();

		const totalRotation = ((rotation + fineRotation) % 360 + 360) % 360;
		const radians = (totalRotation * Math.PI) / 180;
		const zoomFactor = zoom / 100;

		const sx = Math.round(crop.x * img.width);
		const sy = Math.round(crop.y * img.height);
		const sw = Math.max(1, Math.round(crop.w * img.width));
		const sh = Math.max(1, Math.round(crop.h * img.height));

		const sourceCanvas = document.createElement('canvas');
		sourceCanvas.width = sw;
		sourceCanvas.height = sh;
		const sourceCtx = sourceCanvas.getContext('2d');
		if (!sourceCtx) return;

		sourceCtx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

		const rotated = totalRotation % 180 !== 0;
		const outW = rotated ? sh : sw;
		const outH = rotated ? sw : sh;
		const canvas = document.createElement('canvas');
		canvas.width = Math.round(outW * zoomFactor);
		canvas.height = Math.round(outH * zoomFactor);
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		ctx.translate(canvas.width / 2, canvas.height / 2);
		ctx.rotate(radians);
		ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
		ctx.drawImage(
			sourceCanvas,
			(-sw * zoomFactor) / 2,
			(-sh * zoomFactor) / 2,
			sw * zoomFactor,
			sh * zoomFactor,
		);

		canvas.toBlob((blob) => {
			if (!blob) return;
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `${title.replace(/\s+/g, '-').toLowerCase()}-edited.png`;
			link.click();
			URL.revokeObjectURL(url);
		}, 'image/png');
	}, [crop, fineRotation, flipX, flipY, imageUrl, rotation, title, zoom]);

	return (
		<div className="image-editor">
			<div className="image-editor__toolbar">
				<div className="image-editor__tools">
					<button className="image-editor__tool" type="button" onClick={rotate90} title="Rotate 90°">
						↺ Rotate
					</button>
					<button className="image-editor__tool" type="button" onClick={toggleFlipX} title="Flip horizontal">
						⇋ Flip
					</button>
					<button className="image-editor__tool" type="button" onClick={toggleFlipY} title="Flip vertical">
						⇅ Flip V
					</button>
				</div>
				<div className="image-editor__actions">
					<button className="btn btn--ghost" type="button" onClick={resetEdits}>
						Cancel
					</button>
					<button className="btn btn--primary" type="button" onClick={exportEditedImage}>
						Download edited
					</button>
				</div>
			</div>

			<div className="image-editor__ratios">
				{ASPECT_PRESETS.map((preset) => (
					<button
						key={preset.id}
						type="button"
						className={`image-editor__ratio${aspectId === preset.id ? ' is-active' : ''}`}
						onClick={() => applyAspect(preset.id)}
					>
						{preset.label}
					</button>
				))}
			</div>

			<div className="image-editor__stage-wrap">
				<div className="image-editor__stage" ref={stageRef}>
					<img
						src={imageUrl}
						alt={title}
						className="image-editor__image"
						onLoad={() => setLoaded(true)}
					/>
					{loaded && (
						<div
							className="image-editor__crop"
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
									className={`image-editor__handle image-editor__handle--${handle}`}
									onPointerDown={(event) => onCropPointerDown(event, 'resize', handle)}
								/>
							))}
						</div>
					)}
				</div>
			</div>

			<div className="image-editor__sliders">
				<label className="image-editor__slider">
					<span>Rotate</span>
					<input
						type="range"
						min={-45}
						max={45}
						value={fineRotation}
						onChange={(event) => setFineRotation(Number(event.target.value))}
					/>
					<span>{fineRotation}°</span>
				</label>
				<label className="image-editor__slider">
					<span>Zoom</span>
					<input
						type="range"
						min={100}
						max={200}
						value={zoom}
						onChange={(event) => setZoom(Number(event.target.value))}
					/>
					<span>{zoom}%</span>
				</label>
			</div>
		</div>
	);
}
