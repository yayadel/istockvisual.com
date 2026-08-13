import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { isFreeDownloadSize } from '../lib/download-sizes';
import {
	ADJUST_SLIDERS,
	DEFAULT_ADJUST,
	DEFAULT_DOWNLOAD_SIZE,
	DEFAULT_KEEP_CIRCLE,
	DOWNLOAD_SIZES,
	EDITOR_ADJUST_PRESETS,
	EDITOR_ASPECT_PRESETS,
	applyAdjustToImageData,
	aspectPreviewBox,
	bakeAdjustToCanvas,
	bakeTransformToCanvas,
	canvasFromImage,
	clamp,
	compositeCropToCanvas,
	containSize,
	cssFilterFromAdjust,
	expandWithEdgeFill,
	extractKeepFocusCrop,
	hasAdjustChanges,
	hasTransformChanges,
	keepCircleNormRadii,
	keepForegroundTouchingCircle,
	mapKeepCircleToSource,
	resolveEditorCanvasSize,
	type AdjustValues,
	type DownloadSizeId,
	type KeepCircle,
} from '../lib/image-editor-ops';

type ToolId = 'adjust' | 'transform' | 'remove-bg' | 'expand';

type CropRect = { x: number; y: number; w: number; h: number };

type Props = {
	imageUrl: string;
	title: string;
	onClose: () => void;
	loggedIn?: boolean;
	isPro?: boolean;
	/** Inline page layout instead of fullscreen modal portal. */
	variant?: 'modal' | 'page';
	/** Standalone Image Tool: every output size is free. */
	allSizesFree?: boolean;
};

const DEFAULT_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };

const EXPAND_PERCENTS = [10, 20, 30, 40, 80] as const;

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
	variant = 'modal',
	allSizesFree = false,
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
	const [adjustPresetId, setAdjustPresetId] = useState('original');
	const [rotation, setRotation] = useState(0);
	const [fineRotation, setFineRotation] = useState(0);
	const [flipX, setFlipX] = useState(false);
	const [flipY, setFlipY] = useState(false);
	const [crop, setCrop] = useState<CropRect>(DEFAULT_CROP);
	const [keepCircle, setKeepCircle] = useState<KeepCircle>(DEFAULT_KEEP_CIRCLE);
	const [frameUrl, setFrameUrl] = useState<string | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const [status, setStatus] = useState<string | null>(null);
	/** True after Remove BG / Expand until Apply changes locks the baseline. */
	const [pendingCommit, setPendingCommit] = useState(false);
	const [expandPct, setExpandPct] = useState(20);
	const [expandCustomDraft, setExpandCustomDraft] = useState('');
	const [dragging, setDragging] = useState<
		| null
		| { kind: 'move'; startX: number; startY: number; origin: CropRect }
		| { kind: 'resize'; handle: string; startX: number; startY: number; origin: CropRect }
	>(null);
	const [keepDragging, setKeepDragging] = useState<
		| null
		| { kind: 'move'; startX: number; startY: number; origin: KeepCircle }
		| { kind: 'resize'; startX: number; startY: number; origin: KeepCircle }
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
		const sourceW = Math.max(1, natural.w || 1536);
		const sourceH = Math.max(1, natural.h || 1024);
		// Standalone Image Tool: always follow the uploaded image (and optional aspect).
		if (variant === 'page') {
			if (!aspectPreset.ratio) {
				return { width: sourceW, height: sourceH };
			}
			const longEdge = Math.max(sourceW, sourceH);
			if (aspectPreset.ratio >= 1) {
				return {
					width: longEdge,
					height: Math.max(1, Math.round(longEdge / aspectPreset.ratio)),
				};
			}
			return {
				width: Math.max(1, Math.round(longEdge * aspectPreset.ratio)),
				height: longEdge,
			};
		}
		const selected = sizeOptions.find((item) => item.id === sizeId);
		return selected?.output ?? { width: 1024, height: 768 };
	}, [aspectPreset.ratio, natural.h, natural.w, sizeId, sizeOptions, variant]);

	const expandTarget = useMemo(() => {
		if (natural.w <= 0 || natural.h <= 0) return null;
		const scale = 1 + expandPct / 100;
		return {
			width: Math.max(1, Math.round(natural.w * scale)),
			height: Math.max(1, Math.round(natural.h * scale)),
		};
	}, [expandPct, natural.h, natural.w]);

	/** Stage frame: expand preview uses % target; after expand, show the filled pixels. */
	const stageSize = useMemo(() => {
		if (tool === 'expand') {
			if (pendingCommit && natural.w > 0) {
				return { width: natural.w, height: natural.h };
			}
			if (expandTarget) return expandTarget;
		}
		return canvasSize;
	}, [canvasSize, expandTarget, natural.h, natural.w, pendingCommit, tool]);

	const expandGuideStyle = useMemo(() => {
		if (tool !== 'expand' || pendingCommit || !expandTarget || natural.w <= 0) return null;
		const fit = containSize(natural.w, natural.h, expandTarget.width, expandTarget.height);
		return {
			left: `${(fit.x / expandTarget.width) * 100}%`,
			top: `${(fit.y / expandTarget.height) * 100}%`,
			width: `${(fit.w / expandTarget.width) * 100}%`,
			height: `${(fit.h / expandTarget.height) * 100}%`,
		};
	}, [expandTarget, natural.h, natural.w, pendingCommit, tool]);

	const keepCircleStyle = useMemo(() => {
		const { rx, ry } = keepCircleNormRadii(keepCircle, canvasSize.width, canvasSize.height);
		return {
			left: `${(keepCircle.cx - rx) * 100}%`,
			top: `${(keepCircle.cy - ry) * 100}%`,
			width: `${rx * 2 * 100}%`,
			height: `${ry * 2 * 100}%`,
		};
	}, [canvasSize.height, canvasSize.width, keepCircle]);

	const rebuildFramePreview = useCallback(() => {
		const working = workingRef.current;
		if (!working) return;
		const { width, height } = stageSize;
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
	}, [adjust.highlights, adjust.shadows, adjust.temperature, adjust.tint, stageSize]);

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

	const commitBaseline = useCallback(() => {
		const working = workingRef.current;
		if (!working) return;
		originalRef.current = cloneCanvas(working);
		setPendingCommit(false);
	}, []);

	const restoreOriginalWorking = useCallback(() => {
		const original = originalRef.current;
		if (!original) return;
		setWorkingFromCanvas(cloneCanvas(original));
		setPendingCommit(false);
	}, [setWorkingFromCanvas]);

	useEffect(() => {
		if (variant !== 'modal') return;
		document.body.classList.add('image-editor-modal-open');
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && !busy) onCloseRef.current();
		};
		window.addEventListener('keydown', onKey);
		return () => {
			document.body.classList.remove('image-editor-modal-open');
			window.removeEventListener('keydown', onKey);
		};
	}, [busy, variant]);

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

	const onKeepPointerDown = (event: React.PointerEvent, kind: 'move' | 'resize') => {
		event.preventDefault();
		event.stopPropagation();
		const point = pointerToNorm(event.clientX, event.clientY);
		setKeepDragging({ kind, startX: point.x, startY: point.y, origin: keepCircle });
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

	useEffect(() => {
		if (!keepDragging) return;
		const frameW = canvasSize.width;
		const frameH = canvasSize.height;
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
	}, [canvasSize.height, canvasSize.width, keepDragging, pointerToNorm]);

	const selectSize = (next: DownloadSizeId) => {
		if (!allSizesFree && !isFreeDownloadSize(next)) {
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

	const selectAdjustPreset = (id: string) => {
		const preset = EDITOR_ADJUST_PRESETS.find((item) => item.id === id);
		if (!preset) return;
		setAdjustPresetId(id);
		setAdjust({ ...preset.values });
		setStatus(id === 'original' ? 'Preset: Original.' : `Preset: ${preset.label}.`);
	};

	const resetAdjust = () => {
		setAdjust(DEFAULT_ADJUST);
		setAdjustPresetId('original');
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
		setKeepCircle(DEFAULT_KEEP_CIRCLE);
		setStatus('Background removal reset to last applied image.');
	};

	const resetExpand = () => {
		restoreOriginalWorking();
		setCrop(DEFAULT_CROP);
		setStatus('Expand reset to last applied image.');
	};

	const applyExpandPercent = useCallback(
		(pct: number, options?: { fromCustom?: boolean }) => {
			const next = Math.round(clamp(pct, 1, 200));
			if (pendingCommit) {
				restoreOriginalWorking();
				setCrop(DEFAULT_CROP);
			}
			setExpandPct(next);
			if (!options?.fromCustom) setExpandCustomDraft('');
			setStatus(null);
		},
		[pendingCommit, restoreOriginalWorking],
	);

	const commitExpandCustomDraft = useCallback(() => {
		const raw = expandCustomDraft.trim().replace(/%/g, '');
		if (!raw) {
			setExpandCustomDraft('');
			return;
		}
		const parsed = Number(raw);
		if (!Number.isFinite(parsed)) {
			setExpandCustomDraft(String(expandPct));
			setStatus('Enter a number between 1 and 200.');
			return;
		}
		const next = Math.round(clamp(parsed, 1, 200));
		applyExpandPercent(next, { fromCustom: true });
		setExpandCustomDraft(
			(EXPAND_PERCENTS as readonly number[]).includes(next) ? '' : String(next),
		);
	}, [applyExpandPercent, expandCustomDraft, expandPct]);

	const applyAdjustChanges = useCallback(() => {
		const working = workingRef.current;
		if (!working) return;
		if (!hasAdjustChanges(adjust)) {
			setStatus('No color adjustments to apply.');
			return;
		}
		const baked = bakeAdjustToCanvas(working, adjust);
		setWorkingFromCanvas(baked);
		originalRef.current = cloneCanvas(baked);
		setAdjust(DEFAULT_ADJUST);
		setAdjustPresetId('original');
		setPendingCommit(false);
		setStatus('Adjust applied. Continue with another tool or download.');
	}, [adjust, setWorkingFromCanvas]);

	const applyTransformChanges = useCallback(() => {
		const working = workingRef.current;
		if (!working) return;
		const transform = { rotation, fineRotation, flipX, flipY, crop };
		if (!hasTransformChanges(transform)) {
			setStatus('No crop or flip changes to apply.');
			return;
		}
		const baked = bakeTransformToCanvas(
			working,
			transform,
			canvasSize.width,
			canvasSize.height,
		);
		setWorkingFromCanvas(baked);
		originalRef.current = cloneCanvas(baked);
		setRotation(0);
		setFineRotation(0);
		setFlipX(false);
		setFlipY(false);
		setAspectId('free');
		setCrop(DEFAULT_CROP);
		setPendingCommit(false);
		setStatus('Crop & Flip applied. Continue with another tool or download.');
	}, [canvasSize.height, canvasSize.width, crop, fineRotation, flipX, flipY, rotation, setWorkingFromCanvas]);

	const applyRemoveBgChanges = useCallback(() => {
		if (!pendingCommit) {
			setStatus('Run Remove background first, then apply.');
			return;
		}
		commitBaseline();
		setStatus('Background removal applied. Continue with another tool or download.');
	}, [commitBaseline, pendingCommit]);

	const applyExpandChanges = useCallback(() => {
		if (!pendingCommit) {
			setStatus('Run Expand first, then apply.');
			return;
		}
		commitBaseline();
		setStatus('Expand applied. Continue with another tool or download.');
	}, [commitBaseline, pendingCommit]);

	const updateAdjust =
		(key: keyof AdjustValues) => (event: React.ChangeEvent<HTMLInputElement>) => {
			const value = Number(event.currentTarget.value);
			setAdjustPresetId('custom');
			setAdjust((prev) => ({ ...prev, [key]: value }));
		};

	const handleRemoveBackground = useCallback(async () => {
		const working = workingRef.current;
		if (!working) return;

		// Library progress only covers downloads and jumps; drive a linear UI clock instead.
		const VISUAL_MS = 14_000;
		const startedAt = performance.now();
		let stopped = false;
		let displayPct = 0;
		setBusy('Processing 0%…');
		setStatus(null);
		const tickId = window.setInterval(() => {
			if (stopped) return;
			const elapsed = performance.now() - startedAt;
			let next: number;
			if (elapsed <= VISUAL_MS) {
				next = (elapsed / VISUAL_MS) * 95;
			} else {
				// Past estimate: crawl slowly toward 99 while work continues.
				next = 95 + Math.min(4, ((elapsed - VISUAL_MS) / 10_000) * 4);
			}
			const rounded = Math.min(99, Math.floor(next));
			if (rounded <= displayPct) return;
			displayPct = rounded;
			setBusy(`Processing ${displayPct}%…`);
		}, 80);

		try {
			const { removeBackground, preload } = await import('@imgly/background-removal');
			const config = {
				model: 'isnet_fp16' as const,
				fetchArgs: { cache: 'force-cache' as RequestCache },
			};
			await preload(config);

			// Map the on-screen circle onto the working image, then matte a focus
			// crop around that mark so the selected location actually drives cutout.
			const mapped = mapKeepCircleToSource(
				keepCircle,
				working.width,
				working.height,
				canvasSize.width,
				canvasSize.height,
			);
			const { crop, offsetX, offsetY } = extractKeepFocusCrop(
				working,
				mapped.cx,
				mapped.cy,
				mapped.r,
			);
			const blob = await removeBackground(crop.toDataURL('image/png'), config);
			const img = new Image();
			const url = URL.createObjectURL(blob);
			await new Promise<void>((resolve, reject) => {
				img.onload = () => resolve();
				img.onerror = () => reject(new Error('Failed to decode result'));
				img.src = url;
			});
			const cutout = canvasFromImage(img, img.naturalWidth, img.naturalHeight);
			URL.revokeObjectURL(url);

			const canvas = compositeCropToCanvas(
				working.width,
				working.height,
				cutout,
				offsetX,
				offsetY,
				crop.width,
				crop.height,
			);
			const kept = keepForegroundTouchingCircle(canvas, mapped.cx, mapped.cy, mapped.r);
			setWorkingFromCanvas(canvas);
			setPendingCommit(true);
			setStatus(
				kept
					? 'Background removed for the marked subject. Click Apply changes to continue.'
					: 'Background removed near the circle, but no clear subject overlap was found.',
			);
		} catch (error) {
			console.error(error);
			setStatus('Background removal failed. Please try again.');
		} finally {
			stopped = true;
			window.clearInterval(tickId);
			setBusy(null);
		}
	}, [canvasSize.height, canvasSize.width, keepCircle, setWorkingFromCanvas]);

	const handleExpand = useCallback(async () => {
		const working = workingRef.current;
		if (!working || !expandTarget) return;
		if (
			expandTarget.width === working.width &&
			expandTarget.height === working.height
		) {
			setStatus('Choose an expand amount above 0% first.');
			return;
		}

		const VISUAL_MS = 1_100;
		const startedAt = performance.now();
		let stopped = false;
		let displayPct = 0;
		setBusy('Expanding 0%…');
		setStatus(null);
		const tickId = window.setInterval(() => {
			if (stopped) return;
			const elapsed = performance.now() - startedAt;
			const next = Math.min(95, (elapsed / VISUAL_MS) * 95);
			const rounded = Math.floor(next);
			if (rounded <= displayPct) return;
			displayPct = rounded;
			setBusy(`Expanding ${displayPct}%…`);
		}, 50);

		try {
			await new Promise<void>((resolve) => {
				window.setTimeout(resolve, VISUAL_MS);
			});
			const expanded = expandWithEdgeFill(
				working,
				working.width,
				working.height,
				expandTarget.width,
				expandTarget.height,
			);
			stopped = true;
			window.clearInterval(tickId);
			setBusy('Expanding 100%…');
			setWorkingFromCanvas(expanded);
			setCrop(DEFAULT_CROP);
			setPendingCommit(true);
			setStatus(
				`Expanded +${expandPct}% to ${expandTarget.width}×${expandTarget.height}. Click Apply changes to keep editing with other tools.`,
			);
		} finally {
			stopped = true;
			window.clearInterval(tickId);
			setBusy(null);
		}
	}, [expandPct, expandTarget, setWorkingFromCanvas]);

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
		if (!allSizesFree && !isFreeDownloadSize(sizeId)) {
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
	}, [allSizesFree, buildExportCanvas, isPro, loggedIn, sizeId, title]);

	const stop = (event: React.SyntheticEvent) => {
		event.stopPropagation();
	};

	const isPage = variant === 'page';

	const editor = (
		<div
			className={`image-editor-modal${isPage ? ' image-editor-modal--page' : ''}`}
			role="presentation"
			onMouseDown={isPage ? undefined : stop}
			onClick={isPage ? undefined : stop}
		>
			{!isPage && <div className="image-editor-modal__backdrop" aria-hidden="true" />}
			<div
				className="image-editor-modal__dialog"
				role={isPage ? 'region' : 'dialog'}
				aria-modal={isPage ? undefined : true}
				aria-labelledby="image-editor-title"
				onMouseDown={isPage ? undefined : stop}
				onClick={isPage ? undefined : stop}
			>
			{!isPage ? (
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
			) : (
				<h2 id="image-editor-title" className="visually-hidden">
					{title}
				</h2>
			)}

				<section className="image-editor-modal__controls" aria-label="Editor tools">
					{!isPage && (
						<>
							<div className="image-editor-modal__row">
								<span className="image-editor-modal__row-label">Size</span>
								<div className="image-editor-modal__size-list">
									{sizeOptions.map((size) => {
										const needsPro = !allSizesFree && !isFreeDownloadSize(size.id);
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
						</>
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

					{tool === 'adjust' && (
						<div className="image-editor-modal__row image-editor-modal__row--presets">
							<span className="image-editor-modal__row-label">Presets</span>
							<div className="image-editor-modal__preset-list">
								{EDITOR_ADJUST_PRESETS.map((preset) => (
									<button
										key={preset.id}
										type="button"
										className={`image-editor-modal__preset${adjustPresetId === preset.id ? ' is-active' : ''}`}
										onClick={() => selectAdjustPreset(preset.id)}
										disabled={Boolean(busy)}
										title={preset.label}
									>
										{preset.label}
									</button>
								))}
							</div>
						</div>
					)}

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

					{tool === 'expand' && (
						<div className="image-editor-modal__row image-editor-modal__row--expand">
							<span className="image-editor-modal__row-label">Expand</span>
							<div className="image-editor-modal__expand-list" role="group" aria-label="Expand amount">
								{EXPAND_PERCENTS.map((pct) => (
									<button
										key={pct}
										type="button"
										className={`image-editor-modal__expand-pct${
											expandCustomDraft === '' && expandPct === pct ? ' is-active' : ''
										}`}
										onClick={() => applyExpandPercent(pct)}
										disabled={Boolean(busy)}
									>
										+{pct}%
									</button>
								))}
								<label
									className={`image-editor-modal__expand-custom${
										expandCustomDraft !== '' ||
										!(EXPAND_PERCENTS as readonly number[]).includes(expandPct)
											? ' is-active'
											: ''
									}`}
								>
									<span className="visually-hidden">Custom expand percent</span>
									<span className="image-editor-modal__expand-custom-prefix" aria-hidden="true">
										+
									</span>
									<input
										type="number"
										min={1}
										max={200}
										inputMode="numeric"
										placeholder="Custom"
										value={
											expandCustomDraft !== ''
												? expandCustomDraft
												: (EXPAND_PERCENTS as readonly number[]).includes(expandPct)
													? ''
													: String(expandPct)
										}
										onChange={(event) => {
											setExpandCustomDraft(event.currentTarget.value);
										}}
										onBlur={() => commitExpandCustomDraft()}
										onKeyDown={(event) => {
											if (event.key === 'Enter') {
												event.preventDefault();
												commitExpandCustomDraft();
												(event.currentTarget as HTMLInputElement).blur();
											}
										}}
										disabled={Boolean(busy)}
										aria-label="Custom expand percent"
									/>
									<span className="image-editor-modal__expand-custom-suffix" aria-hidden="true">
										%
									</span>
								</label>
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
										['--ie-ar']: String(stageSize.width / Math.max(stageSize.height, 1)),
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

								{tool === 'expand' && expandGuideStyle && (
									<div
										className="image-editor-modal__expand-guide"
										style={expandGuideStyle}
										aria-hidden="true"
									/>
								)}

								{tool === 'expand' && ready && expandTarget && (
									<p className="image-editor-modal__expand-meta">
										{pendingCommit
											? `${natural.w}×${natural.h}`
											: `${natural.w}×${natural.h} → ${expandTarget.width}×${expandTarget.height} · +${expandPct}%`}
									</p>
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

								{tool === 'remove-bg' && ready && (
									<div
										className="image-editor-modal__keep-circle"
										style={keepCircleStyle}
										onPointerDown={(event) => onKeepPointerDown(event, 'move')}
										role="presentation"
										title="Drag to mark the subject to keep"
									>
										<span className="image-editor-modal__keep-label">Keep subject</span>
										<span
											className="image-editor-modal__handle image-editor-modal__handle--se"
											onPointerDown={(event) => onKeepPointerDown(event, 'resize')}
										/>
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
										<div key={item.key} className="image-editor-modal__slider">
											<span>{item.label}</span>
											<input
												type="range"
												min={item.min}
												max={item.max}
												value={adjust[item.key]}
												onChange={updateAdjust(item.key)}
												aria-label={item.label}
											/>
											<span className="image-editor-modal__slider-value">
												{adjust[item.key]}
											</span>
											<button
												className="image-editor-modal__slider-reset"
												type="button"
												onClick={() => {
													setAdjustPresetId('custom');
													setAdjust((prev) => ({
														...prev,
														[item.key]: DEFAULT_ADJUST[item.key],
													}));
												}}
												disabled={adjust[item.key] === DEFAULT_ADJUST[item.key]}
												title={`Reset ${item.label}`}
											>
												Reset
											</button>
										</div>
									))}
									<button className="btn btn--ghost" type="button" onClick={resetAdjust}>
										Reset all
									</button>
									<button
										className="btn btn--primary"
										type="button"
										onClick={applyAdjustChanges}
										disabled={!ready || Boolean(busy) || !hasAdjustChanges(adjust)}
									>
										Apply changes
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
									<button
										className="btn btn--primary"
										type="button"
										onClick={applyTransformChanges}
										disabled={
											!ready ||
											Boolean(busy) ||
											!hasTransformChanges({
												rotation,
												fineRotation,
												flipX,
												flipY,
												crop,
											})
										}
									>
										Apply changes
									</button>
								</>
							)}

							{tool === 'remove-bg' && (
								<>
									<h3>Remove background</h3>
									<p>
										Drag the circle onto the subject you want to keep, then remove
										background. Cutout follows your mark (not the whole scene guess).
									</p>
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
									<button
										className="btn btn--primary"
										type="button"
										onClick={applyRemoveBgChanges}
										disabled={!ready || Boolean(busy) || !pendingCommit}
									>
										Apply changes
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
										Pick how much to grow the frame. The preview keeps the original centered;
										confirm to fill the new margins.
									</p>
									{expandTarget && (
										<p className="image-editor-modal__expand-dims">
											{pendingCommit
												? `Result ${natural.w}×${natural.h}`
												: `Target ${expandTarget.width}×${expandTarget.height} (+${expandPct}%)`}
										</p>
									)}
									<button
										className="btn btn--primary"
										type="button"
										onClick={() => void handleExpand()}
										disabled={Boolean(busy) || !ready || pendingCommit}
									>
										Confirm expand +{expandPct}%
									</button>
									<button
										className="btn btn--primary"
										type="button"
										onClick={applyExpandChanges}
										disabled={!ready || Boolean(busy) || !pendingCommit}
									>
										Apply changes
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
								Download edited ·{' '}
								{tool === 'transform'
									? aspectPreset.label
									: `${canvasSize.width}×${canvasSize.height}`}
							</button>
						</aside>
					</div>
				</div>
			</div>
		</div>
	);

	if (isPage) return editor;
	return createPortal(editor, document.body);
}
