import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
	DEFAULT_KEEP_CIRCLE,
	clamp,
	keepCircleNormRadii,
	type KeepCircle,
} from '../lib/image-editor-ops';

type Mode = 'circle' | 'brush' | 'eraser';

type Props = {
	canvasHost: Element;
	toolsHost: Element;
	barHost?: Element | null;
	busy: boolean;
	onWheelHint?: () => void;
	onExecute: (payload: {
		keepCircle: KeepCircle;
		frameW: number;
		frameH: number;
		paintCanvas: HTMLCanvasElement | null;
	}) => Promise<boolean>;
};

function ToolIcon({ name }: { name: Mode }) {
	if (name === 'circle') {
		return (
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
				<circle cx="8" cy="8" r="5.25" stroke="currentColor" strokeWidth="1.5" />
			</svg>
		);
	}
	if (name === 'eraser') {
		return (
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
				<path
					d="M4.2 9.6 8.8 5l3 3-4.6 4.6H4.2V9.6Z"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinejoin="round"
				/>
				<path d="M3.5 13.2h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
			</svg>
		);
	}
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path
				d="M9.8 3.2 12.8 6.2 6.4 12.6H3.4v-3L9.8 3.2Z"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinejoin="round"
			/>
			<path d="M8.6 4.4 11.6 7.4" stroke="currentColor" strokeWidth="1.5" />
		</svg>
	);
}

export default function CutoutKeepOverlay({
	canvasHost,
	toolsHost,
	busy,
	onWheelHint,
	onExecute,
}: Props) {
	const overlayRef = useRef<HTMLDivElement>(null);
	const paintRef = useRef<HTMLCanvasElement>(null);
	const lastPaint = useRef<{ x: number; y: number } | null>(null);
	const [keepCircle, setKeepCircle] = useState<KeepCircle>(DEFAULT_KEEP_CIRCLE);
	const [mode, setMode] = useState<Mode>('circle');
	const [brushSize, setBrushSize] = useState(28);
	const [frame, setFrame] = useState({ width: 1, height: 1 });
	const [keepDragging, setKeepDragging] = useState<
		| null
		| { kind: 'move'; startX: number; startY: number; origin: KeepCircle }
		| { kind: 'resize'; startX: number; startY: number; origin: KeepCircle }
	>(null);

	useEffect(() => {
		const node = overlayRef.current;
		if (!node) return;
		const sync = () => {
			const next = { width: Math.max(1, node.clientWidth), height: Math.max(1, node.clientHeight) };
			setFrame((current) =>
				current.width === next.width && current.height === next.height ? current : next,
			);
			const paint = paintRef.current;
			if (!paint) return;
			if (paint.width !== next.width || paint.height !== next.height) {
				const copy = document.createElement('canvas');
				copy.width = paint.width;
				copy.height = paint.height;
				const copyCtx = copy.getContext('2d');
				if (copyCtx) copyCtx.drawImage(paint, 0, 0);
				paint.width = next.width;
				paint.height = next.height;
				const ctx = paint.getContext('2d');
				if (ctx && copy.width && copy.height) ctx.drawImage(copy, 0, 0, next.width, next.height);
			}
		};
		sync();
		const observer = new ResizeObserver(sync);
		observer.observe(node);
		return () => observer.disconnect();
	}, []);

	const pointerToNorm = useCallback((clientX: number, clientY: number) => {
		const stage = overlayRef.current;
		if (!stage) return { x: 0, y: 0 };
		const rect = stage.getBoundingClientRect();
		return {
			x: clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1),
			y: clamp((clientY - rect.top) / Math.max(1, rect.height), 0, 1),
		};
	}, []);

	const keepCircleStyle = useMemo(() => {
		const { rx, ry } = keepCircleNormRadii(keepCircle, frame.width, frame.height);
		return {
			left: `${(keepCircle.cx - rx) * 100}%`,
			top: `${(keepCircle.cy - ry) * 100}%`,
			width: `${rx * 2 * 100}%`,
			height: `${ry * 2 * 100}%`,
		};
	}, [frame.height, frame.width, keepCircle]);

	const onKeepPointerDown = (event: React.PointerEvent, kind: 'move' | 'resize') => {
		if (mode !== 'circle' || busy) return;
		event.preventDefault();
		event.stopPropagation();
		const point = pointerToNorm(event.clientX, event.clientY);
		setKeepDragging({ kind, startX: point.x, startY: point.y, origin: keepCircle });
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	};

	useEffect(() => {
		if (!keepDragging) return;
		const frameW = frame.width;
		const frameH = frame.height;
		const onMove = (event: PointerEvent) => {
			const point = pointerToNorm(event.clientX, event.clientY);
			const origin = keepDragging.origin;
			const { rx, ry } = keepCircleNormRadii(origin, frameW, frameH);
			if (keepDragging.kind === 'move') {
				const dx = point.x - keepDragging.startX;
				const dy = point.y - keepDragging.startY;
				setKeepCircle({
					...origin,
					cx: clamp(origin.cx + dx, rx, 1 - rx),
					cy: clamp(origin.cy + dy, ry, 1 - ry),
				});
				return;
			}
			const dxPx = (point.x - origin.cx) * frameW;
			const dyPx = (point.y - origin.cy) * frameH;
			const dist = Math.hypot(dxPx, dyPx);
			const minSide = Math.max(1, Math.min(frameW, frameH));
			const nextR = clamp(dist / minSide, 0.06, 0.48);
			const radii = keepCircleNormRadii({ ...origin, r: nextR }, frameW, frameH);
			setKeepCircle({
				cx: clamp(origin.cx, radii.rx, 1 - radii.rx),
				cy: clamp(origin.cy, radii.ry, 1 - radii.ry),
				r: nextR,
			});
		};
		const onUp = () => setKeepDragging(null);
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		return () => {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
		};
	}, [frame.height, frame.width, keepDragging, pointerToNorm]);

	const paintAt = useCallback(
		(clientX: number, clientY: number) => {
			const canvas = paintRef.current;
			const overlay = overlayRef.current;
			if (!canvas || !overlay) return;
			const ctx = canvas.getContext('2d');
			if (!ctx) return;
			const rect = overlay.getBoundingClientRect();
			const x = clientX - rect.left;
			const y = clientY - rect.top;
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';
			ctx.lineWidth = brushSize;
			if (mode === 'eraser') {
				ctx.globalCompositeOperation = 'destination-out';
				ctx.strokeStyle = 'rgba(0,0,0,1)';
			} else {
				ctx.globalCompositeOperation = 'source-over';
				ctx.strokeStyle = 'rgba(90, 133, 0, 0.45)';
			}
			ctx.beginPath();
			if (lastPaint.current) ctx.moveTo(lastPaint.current.x, lastPaint.current.y);
			else ctx.moveTo(x, y);
			ctx.lineTo(x, y);
			ctx.stroke();
			lastPaint.current = { x, y };
		},
		[brushSize, mode],
	);

	const onPaintPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
		if ((mode !== 'brush' && mode !== 'eraser') || busy) return;
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		lastPaint.current = null;
		paintAt(event.clientX, event.clientY);
	};

	const onPaintPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
		if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
		paintAt(event.clientX, event.clientY);
	};

	const onPaintPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		lastPaint.current = null;
	};

	useEffect(() => {
		const overlay = overlayRef.current;
		if (!overlay) return;
		const onWheel = (event: WheelEvent) => {
			if (busy) return;
			onWheelHint?.();
			if (event.ctrlKey || event.metaKey) {
				event.preventDefault();
				const target =
					canvasHost.querySelector('.FIE_canvas-node') ||
					canvasHost.querySelector('.konvajs-content') ||
					canvasHost.querySelector('canvas:not(.filerobot-keep__paint)');
				if (target) {
					target.dispatchEvent(
						new WheelEvent('wheel', {
							deltaY: event.deltaY,
							deltaX: event.deltaX,
							deltaMode: event.deltaMode,
							clientX: event.clientX,
							clientY: event.clientY,
							bubbles: true,
							cancelable: true,
						}),
					);
				}
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			const shrink = event.deltaY > 0;
			if (mode === 'circle') {
				setKeepCircle((current) => {
					const nextR = clamp(current.r * (shrink ? 0.94 : 1.06), 0.06, 0.48);
					const radii = keepCircleNormRadii(
						{ ...current, r: nextR },
						frame.width,
						frame.height,
					);
					return {
						cx: clamp(current.cx, radii.rx, 1 - radii.rx),
						cy: clamp(current.cy, radii.ry, 1 - radii.ry),
						r: nextR,
					};
				});
				return;
			}
			setBrushSize((size) => clamp(size + (shrink ? -4 : 4), 8, 72));
		};
		overlay.addEventListener('wheel', onWheel, { passive: false });
		return () => overlay.removeEventListener('wheel', onWheel);
	}, [busy, canvasHost, frame.height, frame.width, mode, onWheelHint]);

	const runExecute = async () => {
		const overlay = overlayRef.current;
		const ok = await onExecute({
			keepCircle,
			frameW: overlay?.clientWidth || frame.width,
			frameH: overlay?.clientHeight || frame.height,
			paintCanvas: paintRef.current,
		});
		if (!ok) return;
		const paint = paintRef.current;
		const ctx = paint?.getContext('2d');
		if (paint && ctx) ctx.clearRect(0, 0, paint.width, paint.height);
	};

	const toolButtons = (
		<div className="filerobot-cutout-bar" role="group" aria-label="Keep subject tools">
			{(
				[
					['circle', 'Circle'],
					['brush', 'Brush'],
					['eraser', 'Eraser'],
				] as const
			).map(([id, label]) => (
				<button
					key={id}
					type="button"
					className="filerobot-cutout-item"
					aria-selected={mode === id}
					onClick={() => setMode(id)}
					disabled={busy}
				>
					<ToolIcon name={id} />
					<span className="filerobot-cutout-item__label">{label}</span>
				</button>
			))}
		</div>
	);

	return (
		<>
			{createPortal(
				<div
					ref={overlayRef}
					className={`filerobot-keep${mode === 'circle' ? '' : ' is-paint'}${busy ? ' is-busy' : ''}`}
				>
					<canvas
						ref={paintRef}
						className="filerobot-keep__paint"
						onPointerDown={onPaintPointerDown}
						onPointerMove={onPaintPointerMove}
						onPointerUp={onPaintPointerUp}
						onPointerCancel={onPaintPointerUp}
					/>
					{mode === 'circle' ? (
						<div
							className="filerobot-keep-circle"
							style={keepCircleStyle}
							onPointerDown={(event) => onKeepPointerDown(event, 'move')}
							role="presentation"
							title="Drag to mark the subject to keep"
						>
							<span className="filerobot-keep-circle__label">Keep subject</span>
							<span
								className="filerobot-keep-circle__handle"
								onPointerDown={(event) => onKeepPointerDown(event, 'resize')}
							/>
						</div>
					) : null}
				</div>,
				canvasHost,
			)}
			{createPortal(
				<div className="filerobot-cutout">
					<div className="filerobot-cutout-option">
						<span className="filerobot-cutout-option__label">
							{mode === 'circle' ? 'Circle size' : 'Brush size'}
						</span>
						<div className="filerobot-cutout-option__row">
							<input
								type="range"
								min={mode === 'circle' ? 6 : 8}
								max={mode === 'circle' ? 48 : 72}
								value={
									mode === 'circle' ? Math.round(keepCircle.r * 100) : brushSize
								}
								onChange={(event) => {
									const value = Number(event.target.value);
									if (mode === 'circle') {
										setKeepCircle((current) => {
											const nextR = clamp(value / 100, 0.06, 0.48);
											const radii = keepCircleNormRadii(
												{ ...current, r: nextR },
												frame.width,
												frame.height,
											);
											return {
												cx: clamp(current.cx, radii.rx, 1 - radii.rx),
												cy: clamp(current.cy, radii.ry, 1 - radii.ry),
												r: nextR,
											};
										});
										return;
									}
									setBrushSize(value);
								}}
								disabled={busy}
							/>
							<input
								className="filerobot-cutout-option__value"
								type="number"
								min={mode === 'circle' ? 6 : 8}
								max={mode === 'circle' ? 48 : 72}
								value={mode === 'circle' ? Math.round(keepCircle.r * 100) : brushSize}
								onChange={(event) => {
									const value = Number(event.target.value);
									if (!Number.isFinite(value)) return;
									if (mode === 'circle') {
										setKeepCircle((current) => ({
											...current,
											r: clamp(value / 100, 0.06, 0.48),
										}));
										return;
									}
									setBrushSize(clamp(value, 8, 72));
								}}
								disabled={busy}
							/>
						</div>
					</div>
					<button
						type="button"
						className="filerobot-cutout-apply"
						onClick={() => void runExecute()}
						disabled={busy}
					>
						{busy ? 'Removing…' : 'Execute'}
					</button>
					{toolButtons}
				</div>,
				toolsHost,
			)}
		</>
	);
}
