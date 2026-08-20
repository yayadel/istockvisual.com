import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { isFreeDownloadSize } from '../lib/download-sizes';
import {
	EDITOR_EXPORT_FORMATS,
	blobFromCanvas,
	editedDownloadFileName,
	formatByteSize,
	type EditorExportFormat,
} from '../lib/download-formats';
import { formatHsl, formatRgb, makeManualColor, type PaletteColor } from '../lib/palette-extract';
import {
	ADJUST_SLIDER_GROUPS,
	DEFAULT_ADJUST,
	DEFAULT_DOWNLOAD_SIZE,
	DEFAULT_KEEP_CIRCLE,
	DOWNLOAD_SIZES,
	EDITOR_ADJUST_PRESETS,
	EDITOR_ASPECT_FEATURED_IDS,
	EDITOR_ASPECT_PRESETS,
	applyAdjustToImageData,
	aspectPreviewBox,
	bakeAdjustToCanvas,
	bakeTransformToCanvas,
	canvasFromImage,
	clamp,
	clampFreeEditorOutput,
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
	needsCanvasAdjustPreview,
	resolveEditorCanvasSize,
	type AdjustValues,
	type DownloadSizeId,
	type KeepCircle,
} from '../lib/image-editor-ops';

export type ToolId = 'adjust' | 'transform' | 'remove-bg' | 'expand' | 'pick-color';

type PickedSwatch = PaletteColor & { x: number; y: number; nx: number; ny: number };

type CropRect = { x: number; y: number; w: number; h: number };

type Props = {
	imageUrl: string;
	title: string;
	onClose: () => void;
	loggedIn?: boolean;
	isPro?: boolean;
	/** Asset detail editor: load 1K for free users, 4K for Pro. */
	assetId?: string;
	/** Inline page layout instead of fullscreen modal portal. */
	variant?: 'modal' | 'page' | 'inline';
	/** Standalone Image Tool: every output size is free. */
	allSizesFree?: boolean;
	/** Controlled tool (asset detail links). */
	activeTool?: ToolId;
	onToolChange?: (tool: ToolId) => void;
};

const DEFAULT_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };

const EXPAND_PERCENTS = [10, 20, 30, 40, 80] as const;

const TOOLS: { id: ToolId; label: string; hint: string }[] = [
	{ id: 'adjust', label: 'Adjust', hint: 'Color & light' },
	{ id: 'transform', label: 'Crop', hint: 'Crop, flip, rotate' },
	{ id: 'remove-bg', label: 'Cutout', hint: 'Cut out subject' },
	{ id: 'expand', label: 'Expand', hint: 'Extend canvas' },
	{ id: 'pick-color', label: 'Color', hint: 'Sample any pixel' },
];

function ToolGlyph({ id }: { id: ToolId }) {
	return (
		<svg className="image-editor-modal__glyph" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
			{id === 'adjust' ? (
				<>
					<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
					<path
						d="M12 3.4v2.4M12 18.2v2.4M3.4 12h2.4M18.2 12h2.4M6.1 6.1l1.7 1.7M16.2 16.2l1.7 1.7M17.9 6.1l-1.7 1.7M7.8 16.2l-1.7 1.7"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.7"
						strokeLinecap="round"
					/>
				</>
			) : null}
			{id === 'transform' ? (
				<path
					d="M7 4.5h9.5v3H21v9h-4.5v3H7v-3H3v-9h4V4.5Zm0 3H5.2v5.6H7m10 0h1.8V7.5H17M7 16.5h10"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.6"
					strokeLinejoin="round"
				/>
			) : null}
			{id === 'remove-bg' ? (
				<>
					<rect x="4" y="6" width="16" height="13" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
					<path d="M8 15.2 10.6 12l2 2.1 3.2-3.8 4.2 5" fill="none" stroke="currentColor" strokeWidth="1.6" />
					<circle cx="9" cy="9.2" r="1.15" fill="currentColor" />
				</>
			) : null}
			{id === 'expand' ? (
				<path
					d="M8.2 4.5H4.5V8.2M15.8 4.5h3.7V8.2M8.2 19.5H4.5v-3.7M15.8 19.5h3.7v-3.7M8 8l8 8M16 8 8 16"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.7"
					strokeLinecap="round"
				/>
			) : null}
			{id === 'pick-color' ? (
				<path
					d="M14.8 4.8 19.2 9.2 10 18.4 5.4 19.6 6.6 15Z"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.6"
					strokeLinejoin="round"
				/>
			) : null}
		</svg>
	);
}

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
	assetId,
	variant = 'modal',
	allSizesFree = false,
	activeTool,
	onToolChange,
}: Props) {
	/** Asset editor: Expand is Pro-only so free users can't bypass 2K/4K/8K. Tools page stays open. */
	const canUseExpand = allSizesFree || isPro;
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
	const [exportFormat, setExportFormat] = useState<EditorExportFormat>('webp');
	const [exportQuality, setExportQuality] = useState(92);
	const [estimatedBytes, setEstimatedBytes] = useState<number | null>(null);
	const [aspectId, setAspectId] = useState('free');
	const [sizeGateMessage, setSizeGateMessage] = useState<string | null>(null);
	const [toolState, setToolState] = useState<ToolId>(activeTool ?? 'adjust');
	const tool = activeTool ?? toolState;
	const samplePixelsRef = useRef<ImageData | null>(null);
	const [pickedColor, setPickedColor] = useState<PickedSwatch | null>(null);
	const [pickedHistory, setPickedHistory] = useState<PickedSwatch[]>([]);
	const [pickHover, setPickHover] = useState<PickedSwatch | null>(null);
	const [adjust, setAdjust] = useState<AdjustValues>(DEFAULT_ADJUST);
	const [adjustPresetId, setAdjustPresetId] = useState('original');
	const [adjustGroupId, setAdjustGroupId] = useState(ADJUST_SLIDER_GROUPS[0]!.id);
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
	/** Image size before the current expand — used to draw the “original vs added” guide. */
	const [expandOrigin, setExpandOrigin] = useState({ w: 0, h: 0 });
	/** After Apply fills, stop previewing another empty margin until % changes. */
	const [expandSettled, setExpandSettled] = useState(false);
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

	const editorSourceUrl = useMemo(() => {
		if (import.meta.env.DEV) return imageUrl;
		if (allSizesFree || variant === 'page' || !assetId) return imageUrl;
		return isPro ? `/api/download/${assetId}?size=4k` : `/api/download/${assetId}?size=1k`;
	}, [allSizesFree, assetId, imageUrl, isPro, variant]);

	const aspectPreset = useMemo(
		() => EDITOR_ASPECT_PRESETS.find((item) => item.id === aspectId) ?? EDITOR_ASPECT_PRESETS[0]!,
		[aspectId],
	);

	const sizeOptions = useMemo(() => {
		const sourceW = natural.w || 1536;
		const sourceH = natural.h || 1024;
		const lockFree = Boolean(assetId) && !allSizesFree && !isPro;
		return DOWNLOAD_SIZES.map((size) => {
			const output = resolveEditorCanvasSize(size.id, aspectPreset.ratio, sourceW, sourceH);
			return {
				...size,
				output: lockFree ? clampFreeEditorOutput(size.id, output) : output,
			};
		});
	}, [allSizesFree, aspectPreset.ratio, assetId, isPro, natural.h, natural.w]);

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
		const baseW = expandOrigin.w > 0 ? expandOrigin.w : natural.w;
		const baseH = expandOrigin.h > 0 ? expandOrigin.h : natural.h;
		if (baseW <= 0 || baseH <= 0) return null;
		const scale = 1 + expandPct / 100;
		return {
			width: Math.max(1, Math.round(baseW * scale)),
			height: Math.max(1, Math.round(baseH * scale)),
		};
	}, [expandOrigin.h, expandOrigin.w, expandPct, natural.h, natural.w]);

	previewUrlRef.current = previewUrl;

	/** Stage frame: while previewing, show enlarged canvas with original centered smaller. */
	const stageSize = useMemo(() => {
		if (tool === 'expand' && !expandSettled && expandTarget) {
			return expandTarget;
		}
		if (tool === 'expand' && natural.w > 0) {
			return { width: natural.w, height: natural.h };
		}
		return canvasSize;
	}, [canvasSize, expandSettled, expandTarget, natural.h, natural.w, tool]);

	/** Original bounds inside the expanded frame (preview only). */
	const expandPreviewing = tool === 'expand' && !expandSettled;
	const expandGuideStyle = useMemo(() => {
		if (!expandPreviewing) return null;
		const baseW = expandOrigin.w > 0 ? expandOrigin.w : natural.w;
		const baseH = expandOrigin.h > 0 ? expandOrigin.h : natural.h;
		if (baseW <= 0 || baseH <= 0 || stageSize.width <= 0 || stageSize.height <= 0) {
			return null;
		}
		const fit = containSize(baseW, baseH, stageSize.width, stageSize.height);
		const hasMargin =
			fit.x > 0.5 ||
			fit.y > 0.5 ||
			fit.w < stageSize.width - 1 ||
			fit.h < stageSize.height - 1;
		if (!hasMargin) return null;
		return {
			left: `${(fit.x / stageSize.width) * 100}%`,
			top: `${(fit.y / stageSize.height) * 100}%`,
			width: `${(fit.w / stageSize.width) * 100}%`,
			height: `${(fit.h / stageSize.height) * 100}%`,
		};
	}, [
		expandOrigin.h,
		expandOrigin.w,
		expandPreviewing,
		natural.h,
		natural.w,
		stageSize.height,
		stageSize.width,
	]);

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
		// Bake Camera Raw-style adjusts that CSS filters cannot preview.
		const bakeAdjust = needsCanvasAdjustPreview(adjust);
		if (bakeAdjust) {
			const imageData = ctx.getImageData(0, 0, frame.width, frame.height);
			ctx.putImageData(applyAdjustToImageData(imageData, adjust), 0, 0);
		}
		try {
			setFrameUrl(frame.toDataURL('image/png'));
		} catch {
			/* keep previous frameUrl / previewUrl */
		}
	}, [adjust, stageSize]);

	useEffect(() => {
		if (!ready) return;
		if (tool === 'expand' && !expandSettled) return;
		const timer = window.setTimeout(() => rebuildFramePreview(), 40);
		return () => window.clearTimeout(timer);
	}, [ready, rebuildFramePreview, previewUrl, tool, expandSettled]);

	const previewTransform = useMemo(() => {
		if (tool === 'pick-color') return undefined;
		const radians = rotation + fineRotation;
		return `rotate(${radians}deg) scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})`;
	}, [flipX, flipY, fineRotation, rotation, tool]);

	const previewFilter = useMemo(
		() => (needsCanvasAdjustPreview(adjust) ? undefined : cssFilterFromAdjust(adjust)),
		[adjust],
	);

	const revokeIfBlob = useCallback((url: string) => {
		if (url.startsWith('blob:')) URL.revokeObjectURL(url);
	}, []);

	const setWorkingFromCanvas = useCallback(
		(canvas: HTMLCanvasElement) => {
			workingRef.current = canvas;
			setNatural({ w: canvas.width, h: canvas.height });
			const applyUrl = (url: string) => {
				setPreviewUrl((prev) => {
					revokeIfBlob(prev);
					return url;
				});
				setFrameUrl(url);
			};
			canvas.toBlob(
				(blob) => {
					if (blob) {
						applyUrl(URL.createObjectURL(blob));
						return;
					}
					try {
						applyUrl(canvas.toDataURL('image/jpeg', 0.92));
					} catch (error) {
						console.error(error);
						setStatus('Preview update failed. Try reloading the image.');
					}
				},
				'image/jpeg',
				0.92,
			);
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
		if (variant === 'page') return;
		if (variant === 'modal') document.body.classList.add('image-editor-modal-open');
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
		let objectUrl: string | null = null;

		const paintFromImage = (img: HTMLImageElement, preview: string) => {
			const canvas = canvasFromImage(img, img.naturalWidth, img.naturalHeight);
			originalRef.current = cloneCanvas(canvas);
			workingRef.current = canvas;
			setNatural({ w: img.naturalWidth, h: img.naturalHeight });
			setExpandOrigin({ w: img.naturalWidth, h: img.naturalHeight });
			setExpandSettled(false);
			setPreviewUrl((prev) => {
				revokeIfBlob(prev);
				return preview;
			});
			setFrameUrl(null);
			setReady(true);
		};

		const loadBlob = async (url: string, credentials: RequestCredentials) => {
			const response = await fetch(url, { mode: 'cors', credentials });
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const blob = await response.blob();
			if (cancelled) return;
			objectUrl = URL.createObjectURL(blob);
			const img = new Image();
			await new Promise<void>((resolve, reject) => {
				img.onload = () => resolve();
				img.onerror = () => reject(new Error('decode failed'));
				img.src = objectUrl!;
			});
			if (cancelled) return;
			paintFromImage(img, objectUrl);
			objectUrl = null;
		};

		const load = async () => {
			try {
				const credentials = editorSourceUrl.startsWith('/api/download/') ? 'include' : 'omit';
				await loadBlob(editorSourceUrl, credentials);
			} catch {
				if (assetId && isPro && editorSourceUrl.includes('size=4k')) {
					try {
						await loadBlob(`/api/download/${assetId}?size=1k`, 'omit');
						return;
					} catch {
						/* fall through */
					}
				}
				if (assetId && !allSizesFree && !isPro) {
					setStatus('Failed to load image for editing.');
					setReady(true);
					return;
				}
				try {
					await loadBlob(imageUrl, 'omit');
				} catch {
					const img = new Image();
					img.crossOrigin = 'anonymous';
					img.onload = () => {
						if (cancelled) return;
						paintFromImage(img, imageUrl);
					};
					img.onerror = () => {
						if (cancelled) return;
						setStatus('Failed to load image for editing.');
						setReady(true);
					};
					img.src = imageUrl;
				}
			}
		};

		void load();
		return () => {
			cancelled = true;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	}, [assetId, editorSourceUrl, imageUrl, isPro, revokeIfBlob]);

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
				setSizeGateMessage('Pro required for 2K / 4K / 8K. Free sizes: 512 and 1K.');
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

	const selectTool = useCallback(
		(id: ToolId) => {
			const expandLocked = id === 'expand' && !canUseExpand;
			if (expandLocked) {
				setSizeGateMessage(
					loggedIn
						? 'Expand is a Pro feature. Upgrade to unlock canvas expand.'
						: 'Sign in and upgrade to Pro to use Expand.',
				);
				if (activeTool === undefined) return;
			} else {
				setSizeGateMessage(null);
			}
			onToolChange?.(id);
			if (activeTool === undefined) setToolState(id);
			if (id === 'expand' && !expandLocked) {
				const working = workingRef.current;
				const w = working?.width || natural.w;
				const h = working?.height || natural.h;
				if (w > 0 && h > 0) {
					setExpandOrigin({ w, h });
				}
				setExpandSettled(false);
				setStatus(
					'Preview: original is centered smaller. Click Apply changes to fill the new margins.',
				);
			}
			if (id === 'pick-color') {
				setStatus('Click any point on the image to read HEX, RGB, and HSL.');
			}
		},
		[activeTool, canUseExpand, loggedIn, natural.h, natural.w, onToolChange],
	);

	useEffect(() => {
		if (!activeTool) return;
		if (activeTool === 'pick-color') {
			setStatus('Click any point on the image to read HEX, RGB, and HSL.');
		}
		if (activeTool === 'expand' && canUseExpand) {
			const working = workingRef.current;
			const w = working?.width || natural.w;
			const h = working?.height || natural.h;
			if (w > 0 && h > 0) setExpandOrigin({ w, h });
			setExpandSettled(false);
		}
	}, [activeTool, canUseExpand]);

	useEffect(() => {
		if (tool !== 'pick-color' || !ready) {
			samplePixelsRef.current = null;
			return;
		}
		const working = workingRef.current;
		if (!working) return;
		const source = hasAdjustChanges(adjust) ? bakeAdjustToCanvas(working, adjust) : working;
		const ctx = source.getContext('2d', { willReadFrequently: true });
		if (!ctx) return;
		try {
			samplePixelsRef.current = ctx.getImageData(0, 0, source.width, source.height);
		} catch {
			samplePixelsRef.current = null;
		}
	}, [adjust, previewUrl, ready, tool]);

	const sampleStagePoint = useCallback(
		(clientX: number, clientY: number): PickedSwatch | null => {
			const stage = stageRef.current;
			const pixels = samplePixelsRef.current;
			if (!stage || !pixels) return null;
			const rect = stage.getBoundingClientRect();
			if (rect.width < 2 || rect.height < 2) return null;
			const px = clientX - rect.left;
			const py = clientY - rect.top;
			const fit = containSize(pixels.width, pixels.height, rect.width, rect.height);
			if (px < fit.x || py < fit.y || px > fit.x + fit.w || py > fit.y + fit.h) return null;
			const x = clamp(Math.floor(((px - fit.x) / fit.w) * pixels.width), 0, pixels.width - 1);
			const y = clamp(Math.floor(((py - fit.y) / fit.h) * pixels.height), 0, pixels.height - 1);
			const i = (y * pixels.width + x) * 4;
			const r = pixels.data[i] ?? 0;
			const g = pixels.data[i + 1] ?? 0;
			const b = pixels.data[i + 2] ?? 0;
			const a = pixels.data[i + 3] ?? 0;
			if (a < 8) return null;
			const swatch = makeManualColor(
				`#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`,
			);
			return {
				...swatch,
				x,
				y,
				nx: px / rect.width,
				ny: py / rect.height,
			};
		},
		[],
	);

	const copyPickedValue = useCallback(async (value: string, label: string) => {
		try {
			await navigator.clipboard.writeText(value);
			setStatus(`Copied ${label}: ${value}`);
		} catch {
			setStatus(`Could not copy ${label}.`);
		}
	}, []);

	const onPickPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
		if (tool !== 'pick-color') return;
		setPickHover(sampleStagePoint(event.clientX, event.clientY));
	};

	const onPickPointerLeave = () => {
		if (tool !== 'pick-color') return;
		setPickHover(null);
	};

	const onPickPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
		if (tool !== 'pick-color') return;
		event.preventDefault();
		const next = sampleStagePoint(event.clientX, event.clientY);
		if (!next) return;
		setPickedColor(next);
		setPickedHistory((prev) => [next, ...prev.filter((item) => item.hex !== next.hex)].slice(0, 8));
		void copyPickedValue(next.hex, 'HEX');
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
		const original = originalRef.current;
		if (original) {
			setExpandOrigin({ w: original.width, h: original.height });
		}
		setExpandSettled(false);
		setCrop(DEFAULT_CROP);
		setStatus('Expand reset to last applied image.');
	};

	const resetSession = () => {
		resetAdjust();
		resetTransform();
		setSizeId(DEFAULT_DOWNLOAD_SIZE);
		setExportFormat('webp');
		setExportQuality(92);
		setSizeGateMessage(null);
		setEstimatedBytes(null);
		setStatus('Editor reset.');
	};

	const applyExpandPercent = useCallback(
		(pct: number, options?: { fromCustom?: boolean }) => {
			const next = Math.round(clamp(pct, 1, 200));
			const working = workingRef.current;
			if (working) {
				setExpandOrigin({ w: working.width, h: working.height });
			}
			setExpandSettled(false);
			setExpandPct(next);
			if (!options?.fromCustom) setExpandCustomDraft('');
			setStatus(null);
		},
		[],
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

	const applyExpandChanges = useCallback(async () => {
		if (!canUseExpand) {
			setSizeGateMessage(
				loggedIn
					? 'Expand is a Pro feature. Upgrade to unlock canvas expand.'
					: 'Sign in and upgrade to Pro to use Expand.',
			);
			setStatus(null);
			return;
		}
		const working = workingRef.current;
		if (!working) {
			setStatus('Image not ready yet.');
			return;
		}

		const originW = working.width;
		const originH = working.height;
		setExpandOrigin({ w: originW, h: originH });

		const scale = 1 + expandPct / 100;
		const targetW = Math.max(1, Math.round(originW * scale));
		const targetH = Math.max(1, Math.round(originH * scale));
		if (targetW === originW && targetH === originH) {
			setStatus('Choose an expand amount above 0% first.');
			return;
		}

		const VISUAL_MS = 900;
		const startedAt = performance.now();
		let stopped = false;
		let displayPct = 0;
		setBusy('Filling 0%…');
		setStatus(null);
		const tickId = window.setInterval(() => {
			if (stopped) return;
			const elapsed = performance.now() - startedAt;
			const next = Math.min(95, (elapsed / VISUAL_MS) * 95);
			const rounded = Math.floor(next);
			if (rounded <= displayPct) return;
			displayPct = rounded;
			setBusy(`Filling ${displayPct}%…`);
		}, 50);

		try {
			const expanded = expandWithEdgeFill(working, originW, originH, targetW, targetH);
			if (!expanded.width || !expanded.height) {
				throw new Error('Expand produced an empty canvas');
			}

			const remaining = Math.max(0, VISUAL_MS - (performance.now() - startedAt));
			if (remaining > 0) {
				await new Promise<void>((resolve) => window.setTimeout(resolve, remaining));
			}

			stopped = true;
			window.clearInterval(tickId);
			setBusy('Filling 100%…');

			// Commit pixels immediately so Download cannot race an old canvas.
			workingRef.current = expanded;
			originalRef.current = cloneCanvas(expanded);
			setWorkingFromCanvas(expanded);
			setExpandOrigin({ w: expanded.width, h: expanded.height });
			setExpandSettled(true);
			setCrop(DEFAULT_CROP);
			setPendingCommit(false);
			setStatus(`Done — expanded +${expandPct}% to ${targetW}×${targetH}. Download uses this result.`);
		} catch (error) {
			console.error(error);
			setStatus('Expand failed. Please try again.');
		} finally {
			stopped = true;
			window.clearInterval(tickId);
			setBusy(null);
		}
	}, [canUseExpand, expandPct, loggedIn, setWorkingFromCanvas]);

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

	const resolveExportSource = useCallback(() => {
		const working = workingRef.current;
		if (!working) return null;

		// Only Pro / tools-page may bake Expand into download.
		if (canUseExpand && tool === 'expand' && !expandSettled && expandPct > 0) {
			const targetW = Math.max(1, Math.round(working.width * (1 + expandPct / 100)));
			const targetH = Math.max(1, Math.round(working.height * (1 + expandPct / 100)));
			if (targetW !== working.width || targetH !== working.height) {
				return expandWithEdgeFill(
					working,
					working.width,
					working.height,
					targetW,
					targetH,
				);
			}
		}
		return working;
	}, [canUseExpand, expandPct, expandSettled, tool]);

	const buildExportCanvas = useCallback(() => {
		const source = resolveExportSource();
		if (!source) return null;

		const liveTransform = {
			rotation,
			fineRotation,
			flipX,
			flipY,
			crop,
		};
		const hasLive =
			hasAdjustChanges(adjust) || hasTransformChanges(liveTransform);

		// Expanded native export only for users allowed to Expand (Pro / tools page).
		const preferNative =
			canUseExpand &&
			!hasLive &&
			(expandSettled || (tool === 'expand' && expandPct > 0));

		const targetW = preferNative ? source.width : canvasSize.width;
		const targetH = preferNative ? source.height : canvasSize.height;

		const frame = document.createElement('canvas');
		frame.width = Math.max(1, targetW);
		frame.height = Math.max(1, targetH);
		const frameCtx = frame.getContext('2d');
		if (!frameCtx) return null;

		const fit = containSize(source.width, source.height, frame.width, frame.height);
		frameCtx.save();
		frameCtx.translate(frame.width / 2, frame.height / 2);
		frameCtx.rotate(((rotation + fineRotation) * Math.PI) / 180);
		frameCtx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
		frameCtx.drawImage(source, -fit.w / 2, -fit.h / 2, fit.w, fit.h);
		frameCtx.restore();

		if (hasAdjustChanges(adjust)) {
			const imageData = frameCtx.getImageData(0, 0, frame.width, frame.height);
			frameCtx.putImageData(applyAdjustToImageData(imageData, adjust), 0, 0);
		}

		const needsCrop = crop.x > 0.001 || crop.y > 0.001 || crop.w < 0.999 || crop.h < 0.999;
		if (needsCrop) {
			const sx = Math.round(crop.x * frame.width);
			const sy = Math.round(crop.y * frame.height);
			const sw = Math.max(1, Math.round(crop.w * frame.width));
			const sh = Math.max(1, Math.round(crop.h * frame.height));
			const out = document.createElement('canvas');
			out.width = sw;
			out.height = sh;
			const outCtx = out.getContext('2d');
			if (!outCtx) return frame;
			outCtx.drawImage(frame, sx, sy, sw, sh, 0, 0, sw, sh);
			return out;
		}

		return frame;
	}, [
		adjust,
		canUseExpand,
		canvasSize.height,
		canvasSize.width,
		crop,
		expandPct,
		expandSettled,
		fineRotation,
		flipX,
		flipY,
		resolveExportSource,
		rotation,
		tool,
	]);

	const handleDownload = useCallback(() => {
		if (!allSizesFree && !isFreeDownloadSize(sizeId)) {
			if (!loggedIn) {
				setSizeGateMessage('Sign in and upgrade to Pro for 2K / 4K / 8K. Crop and filters are kept.');
				return;
			}
			if (!isPro) {
				setSizeGateMessage('Pro required for 2K / 4K / 8K. Crop and filters are kept. Free sizes: 512 and 1K.');
				return;
			}
		}
		const canvas = buildExportCanvas();
		if (!canvas) {
			setStatus('Nothing to download yet.');
			return;
		}
		let exportCanvas = canvas;
		if (assetId && !allSizesFree && !isPro) {
			const capped = clampFreeEditorOutput(sizeId, {
				width: canvas.width,
				height: canvas.height,
			});
			if (capped.width !== canvas.width || capped.height !== canvas.height) {
				const scaled = document.createElement('canvas');
				scaled.width = capped.width;
				scaled.height = capped.height;
				const ctx = scaled.getContext('2d');
				if (ctx) {
					ctx.imageSmoothingEnabled = true;
					ctx.imageSmoothingQuality = 'high';
					ctx.drawImage(canvas, 0, 0, capped.width, capped.height);
					exportCanvas = scaled;
				}
			}
		}
		void blobFromCanvas(exportCanvas, exportFormat, exportQuality).then((blob) => {
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = editedDownloadFileName(title, aspectId, exportFormat);
			link.click();
			URL.revokeObjectURL(url);
			setEstimatedBytes(blob.size);
			setStatus(`Downloaded ${exportCanvas.width}×${exportCanvas.height} · ${formatByteSize(blob.size)}.`);
		}).catch(() => {
			setStatus('Download failed (canvas blocked). Apply changes, then try again.');
		});
	}, [
		allSizesFree,
		aspectId,
		assetId,
		buildExportCanvas,
		exportFormat,
		exportQuality,
		isPro,
		loggedIn,
		sizeId,
		title,
	]);

	useEffect(() => {
		if (!ready) return;
		let cancelled = false;
		const timer = window.setTimeout(() => {
			const canvas = buildExportCanvas();
			if (!canvas) return;
			void blobFromCanvas(canvas, exportFormat, exportQuality)
				.then((blob) => {
					if (!cancelled) setEstimatedBytes(blob.size);
				})
				.catch(() => {
					if (!cancelled) setEstimatedBytes(null);
				});
		}, 320);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, [buildExportCanvas, exportFormat, exportQuality, ready]);

	const stop = (event: React.SyntheticEvent) => {
		event.stopPropagation();
	};

	const isPage = variant === 'page';
	const isInline = variant === 'inline';
	const isEmbedded = isPage || isInline;

	const editor = (
		<div
			className={`image-editor-modal${isPage ? ' image-editor-modal--page' : ''}${isInline ? ' image-editor-modal--inline' : ''}${isEmbedded ? ' image-editor-modal--paint' : ''}`}
			role="presentation"
			onMouseDown={isEmbedded ? undefined : stop}
			onClick={isEmbedded ? undefined : stop}
		>
			{!isEmbedded && <div className="image-editor-modal__backdrop" aria-hidden="true" />}
			<div
				className="image-editor-modal__dialog"
				role={isEmbedded ? 'region' : 'dialog'}
				aria-modal={isEmbedded ? undefined : true}
				aria-labelledby="image-editor-title"
				onMouseDown={isEmbedded ? undefined : stop}
				onClick={isEmbedded ? undefined : stop}
			>
			{!isEmbedded ? (
				<header className="image-editor-modal__header">
					<div>
						<p className="image-editor-modal__eyebrow">Client-side editor</p>
						<h2 id="image-editor-title">{title}</h2>
					</div>
					<div className="image-editor-modal__header-actions">
						<a className="btn image-editor-modal__own-cta" href="/tools/image">
							<svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
								<rect x="2.6" y="5.4" width="14.8" height="13.2" rx="2" stroke="currentColor" strokeWidth="1.7" />
								<path
									d="M4.6 16.9 8.5 12.5l2.1 2.15 2.85-3.55 4.35 5.8"
									stroke="currentColor"
									strokeWidth="1.7"
									strokeLinejoin="round"
								/>
								<circle cx="18.1" cy="6.1" r="3.2" stroke="currentColor" strokeWidth="1.7" />
								<path d="M18.1 4.6v3M16.6 6.1h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
							</svg>
							Edit your own image
						</a>
						<button
							className="btn btn--ghost"
							type="button"
							onClick={resetSession}
							disabled={Boolean(busy)}
						>
							Reset
						</button>
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
				<div className="image-editor-modal__titlebar">
					<h2 id="image-editor-title">{title}</h2>
					<span className="image-editor-modal__titlebar-size">
						{natural.w && natural.h ? `${natural.w} × ${natural.h} px` : 'Loading…'}
					</span>
					{isInline ? (
						<button
							type="button"
							className="btn btn--ghost image-editor-modal__titlebar-done"
							onClick={() => onCloseRef.current()}
							disabled={Boolean(busy)}
						>
							Done
						</button>
					) : null}
				</div>
			)}

				<div className="image-editor-modal__app">
					<nav className="image-editor-modal__rail" aria-label="Editor tools">
						{TOOLS.map((item) => {
							const expandLocked = item.id === 'expand' && !canUseExpand;
							const className = `image-editor-modal__rail-tool${tool === item.id ? ' is-active' : ''}${expandLocked ? ' is-locked' : ''}`;
							const href =
								item.id === 'transform'
									? '#edit-crop'
									: item.id === 'remove-bg'
										? '#edit-remove-bg'
										: item.id === 'pick-color'
											? '#edit-pick-color'
											: `#edit-${item.id}`;
							const inner = (
								<>
									<ToolGlyph id={item.id} />
									<span>
										{item.label}
										{expandLocked ? (
											<em className="download-tier download-tier--pro">Pro</em>
										) : null}
									</span>
								</>
							);
							return isInline ? (
								<a
									key={item.id}
									href={href}
									className={className}
									onClick={(event) => {
										event.preventDefault();
										selectTool(item.id);
									}}
									aria-disabled={Boolean(busy) || undefined}
								>
									{inner}
								</a>
							) : (
								<button
									key={item.id}
									type="button"
									className={className}
									onClick={() => selectTool(item.id)}
									disabled={Boolean(busy)}
								>
									{inner}
								</button>
							);
						})}
						{isInline ? (
							<button
								type="button"
								className="image-editor-modal__rail-tool image-editor-modal__rail-tool--done"
								onClick={() => onCloseRef.current()}
							>
								<span>Done</span>
							</button>
						) : null}
					</nav>
					<div className="image-editor-modal__main">
				<section className="image-editor-modal__options" aria-label="Tool options">
					{!isPage && tool !== 'pick-color' && (
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
								<div className="image-editor-modal__gate" role="status">
									<p className="image-editor-modal__gate-text">{sizeGateMessage}</p>
									<a className="image-editor-modal__gate-cta" href="/price">
										Go Pro
									</a>
								</div>
							)}
						</>
					)}

					{tool === 'adjust' && (
						<>
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
						<div className="image-editor-modal__row image-editor-modal__row--groups">
							<span className="image-editor-modal__row-label">Sliders</span>
							<div className="image-editor-modal__group-tabs" role="tablist" aria-label="Adjust groups">
								{ADJUST_SLIDER_GROUPS.map((group) => (
									<button
										key={group.id}
										type="button"
										role="tab"
										aria-selected={adjustGroupId === group.id}
										className={`image-editor-modal__group-tab${adjustGroupId === group.id ? ' is-active' : ''}`}
										onClick={() => setAdjustGroupId(group.id)}
									>
										{group.label}
									</button>
								))}
							</div>
						</div>
						<div className="image-editor-modal__options-sliders">
							{(ADJUST_SLIDER_GROUPS.find((group) => group.id === adjustGroupId)?.sliders ?? []).map(
								(item) => (
									<div key={item.key} className="image-editor-modal__slider image-editor-modal__slider--bar">
										<span>{item.label}</span>
										<input
											type="range"
											min={item.min}
											max={item.max}
											value={adjust[item.key]}
											onChange={updateAdjust(item.key)}
											aria-label={item.label}
										/>
										<span className="image-editor-modal__slider-value">{adjust[item.key]}</span>
									</div>
								),
							)}
						</div>
						<div className="image-editor-modal__row image-editor-modal__row--actions">
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
						</div>
						</>
					)}

					{tool === 'transform' && (
						<>
						<div className="image-editor-modal__row image-editor-modal__row--aspects">
							<span className="image-editor-modal__row-label">Aspect</span>
							<div className="image-editor-modal__aspect-list">
								{EDITOR_ASPECT_PRESETS.map((preset) => {
									const box = aspectPreviewBox(preset.ratio, 18);
									return (
										<button
											key={preset.id}
											type="button"
											className={`image-editor-modal__aspect${aspectId === preset.id ? ' is-active' : ''}${
											(EDITOR_ASPECT_FEATURED_IDS as readonly string[]).includes(preset.id)
												? ' is-featured'
												: ''
										}`}
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
						<div className="image-editor-modal__row image-editor-modal__row--actions">
							<span className="image-editor-modal__row-label">Transform</span>
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
								<label className="image-editor-modal__slider image-editor-modal__slider--bar">
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
									Apply
								</button>
							</div>
						</div>
						</>
					)}

					{tool === 'expand' && canUseExpand && (
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
								<button
									className="btn btn--primary"
									type="button"
									onClick={() => void applyExpandChanges()}
									disabled={!ready || Boolean(busy)}
								>
									Apply · +{expandPct}%
								</button>
								<button className="btn btn--ghost" type="button" onClick={resetExpand}>
									Reset
								</button>
							</div>
						</div>
					)}

					{tool === 'expand' && !canUseExpand && (
						<div className="image-editor-modal__row">
							<span className="image-editor-modal__row-label">Expand</span>
							<p className="image-editor-modal__options-hint">
								Canvas expand is included with Pro.
								<a href={loggedIn ? '/account' : '/login'}>
									{loggedIn ? ' Upgrade to Pro' : ' Sign in'}
								</a>
							</p>
						</div>
					)}

					{tool === 'remove-bg' && (
						<div className="image-editor-modal__row image-editor-modal__row--actions">
							<span className="image-editor-modal__row-label">Cutout</span>
							<div className="image-editor-modal__action-row">
								<p className="image-editor-modal__options-hint">
									Drag the circle onto the subject, then remove the background.
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
									Apply
								</button>
								<button className="btn btn--ghost" type="button" onClick={resetRemoveBg}>
									Reset
								</button>
							</div>
						</div>
					)}

					{tool === 'pick-color' && (
						<div className="image-editor-modal__row image-editor-modal__row--actions">
							<span className="image-editor-modal__row-label">Sample</span>
							<div className="image-editor-modal__action-row">
								<p className="image-editor-modal__options-hint">
									Click any pixel to read HEX, RGB, and HSL.
								</p>
								{(pickedColor || pickHover) ? (
									<div className="image-editor-modal__pick-result image-editor-modal__pick-result--bar">
										<span
											className="image-editor-modal__pick-swatch"
											style={{ background: (pickedColor || pickHover)!.hex }}
										/>
										<button
											type="button"
											onClick={() =>
												pickedColor && void copyPickedValue(pickedColor.hex, 'HEX')
											}
										>
											{(pickedColor || pickHover)!.hex}
										</button>
										<button
											type="button"
											onClick={() =>
												pickedColor && void copyPickedValue(formatRgb(pickedColor), 'RGB')
											}
										>
											{formatRgb((pickedColor || pickHover)!)}
										</button>
										<button
											type="button"
											onClick={() =>
												pickedColor && void copyPickedValue(formatHsl(pickedColor), 'HSL')
											}
										>
											{formatHsl((pickedColor || pickHover)!)}
										</button>
									</div>
								) : null}
							</div>
						</div>
					)}
				</section>

				<div className="image-editor-modal__body">
					<div className="image-editor-modal__workspace">
						<div className="image-editor-modal__stage-wrap">
							<div
								className={`image-editor-modal__stage${tool === 'expand' ? ' image-editor-modal__stage--expand' : ''}${tool === 'pick-color' ? ' image-editor-modal__stage--pick' : ''}${expandPreviewing ? ' is-expand-preview' : ''}`}
								ref={stageRef}
								onPointerMove={onPickPointerMove}
								onPointerLeave={onPickPointerLeave}
								onPointerDown={onPickPointerDown}
								style={
									{
										['--ie-ar']: String(stageSize.width / Math.max(stageSize.height, 1)),
									} as CSSProperties
								}
							>
								{ready && expandPreviewing && expandGuideStyle ? (
									<>
										<img
											src={previewUrl}
											alt=""
											className="image-editor-modal__expand-source"
											style={expandGuideStyle}
											draggable={false}
										/>
										<div
											className="image-editor-modal__expand-guide"
											style={expandGuideStyle}
											aria-hidden="true"
										>
											<span className="image-editor-modal__expand-guide-label">Original</span>
										</div>
									</>
								) : ready && (frameUrl || previewUrl) ? (
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

								{tool === 'expand' && ready && expandTarget && (
									<p className="image-editor-modal__expand-meta">
										{expandSettled
											? `${natural.w}×${natural.h}`
											: `${expandOrigin.w || natural.w}×${expandOrigin.h || natural.h} → ${expandTarget.width}×${expandTarget.height} · +${expandPct}%`}
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

								{tool === 'pick-color' && pickedColor ? (
									<span
										className="image-editor-modal__pick-mark"
										style={{ left: `${pickedColor.nx * 100}%`, top: `${pickedColor.ny * 100}%` }}
										aria-hidden="true"
									/>
								) : null}

								{tool === 'pick-color' && pickHover ? (
									<div
										className="image-editor-modal__eyedropper"
										style={{
											left: `${pickHover.nx * 100}%`,
											top: `${pickHover.ny * 100}%`,
											background: pickHover.hex,
											color: pickHover.ink,
										}}
										aria-hidden="true"
									>
										{pickHover.hex}
									</div>
								) : null}

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
									<h3>Adjust</h3>
									<p>Use the top bar for presets and sliders, then apply.</p>
								</>
							)}

							{tool === 'transform' && (
								<>
									<h3>Crop</h3>
									<p>Pick an aspect in the top bar, then drag the crop box on the image.</p>
								</>
							)}

							{tool === 'remove-bg' && (
								<>
									<h3>Remove background</h3>
									<p>First use may load extra resources and feel slow; later runs are faster.</p>
								</>
							)}

							{tool === 'expand' && (
								<>
									<h3>Expand canvas</h3>
									<p>
										{canUseExpand
											? 'Choose a ratio in the top bar. Apply fills the new margins (blur + edge mirror).'
											: 'Canvas expand is included with Pro.'}
									</p>
								</>
							)}

							{tool === 'pick-color' && (
								<>
									<h3>Pick color</h3>
									<p>Click a pixel on the image. This is an eyedropper, not the page palette.</p>
									{pickedColor ? (
										<div className="image-editor-modal__pick-result">
											<span
												className="image-editor-modal__pick-swatch"
												style={{ background: pickedColor.hex }}
											/>
											<dl className="image-editor-modal__pick-codes">
												<div>
													<dt>HEX</dt>
													<dd>
														<button
															type="button"
															onClick={() => void copyPickedValue(pickedColor.hex, 'HEX')}
														>
															{pickedColor.hex}
														</button>
													</dd>
												</div>
												<div>
													<dt>RGB</dt>
													<dd>
														<button
															type="button"
															onClick={() => void copyPickedValue(formatRgb(pickedColor), 'RGB')}
														>
															{formatRgb(pickedColor)}
														</button>
													</dd>
												</div>
												<div>
													<dt>HSL</dt>
													<dd>
														<button
															type="button"
															onClick={() => void copyPickedValue(formatHsl(pickedColor), 'HSL')}
														>
															{formatHsl(pickedColor)}
														</button>
													</dd>
												</div>
												<div>
													<dt>Pixel</dt>
													<dd>
														{pickedColor.x}, {pickedColor.y}
													</dd>
												</div>
											</dl>
										</div>
									) : (
										<p className="image-editor-modal__tip">No sample yet. Click the image.</p>
									)}
									{pickedHistory.length > 1 ? (
										<div className="image-editor-modal__pick-history" aria-label="Recent samples">
											{pickedHistory.map((item) => (
												<button
													key={`${item.hex}-${item.x}-${item.y}`}
													type="button"
													title={item.hex}
													style={{ background: item.hex }}
													onClick={() => {
														setPickedColor(item);
														void copyPickedValue(item.hex, 'HEX');
													}}
												/>
											))}
										</div>
									) : null}
									<p className="image-editor-modal__tip">
										Need a full palette from the photo? Use the{' '}
										<a href="/tools/palette">Palette Generator</a>.
									</p>
								</>
							)}

							{status && <p className="image-editor-modal__status">{status}</p>}

							{tool !== 'pick-color' && (
							<div className="image-editor-modal__export">
								<span className="image-editor-modal__row-label">Export</span>
								<div className="image-editor-modal__format-list" role="group" aria-label="File format">
									{EDITOR_EXPORT_FORMATS.map((format) => (
										<button
											key={format}
											type="button"
											className={`image-editor-modal__format${exportFormat === format ? ' is-active' : ''}`}
											onClick={() => setExportFormat(format)}
										>
											{format === 'jpg' ? 'JPG' : format === 'png' ? 'PNG' : 'WebP'}
										</button>
									))}
								</div>
								{exportFormat !== 'png' ? (
									<label className="image-editor-modal__slider image-editor-modal__slider--bar">
										<span>Quality</span>
										<input
											type="range"
											min={10}
											max={100}
											value={exportQuality}
											onChange={(event) => setExportQuality(Number(event.currentTarget.value))}
										/>
										<span>{exportQuality}%</span>
									</label>
								) : (
									<p className="image-editor-modal__tip">PNG is lossless.</p>
								)}
								<p className="image-editor-modal__estimate">
									{estimatedBytes != null
										? `About ${formatByteSize(estimatedBytes)}`
										: 'Estimating size…'}
								</p>
								<div className="image-editor-modal__export-actions">
									{isInline ? (
										<button className="btn btn--ghost" type="button" onClick={resetSession}>
											Reset
										</button>
									) : null}
									<button
										className="btn btn--primary image-editor-modal__download"
										type="button"
										onClick={handleDownload}
										disabled={!ready || Boolean(busy)}
									>
										Export & Download ·{' '}
										{tool === 'transform'
											? aspectPreset.label
											: canUseExpand && tool === 'expand' && !expandSettled && expandTarget
												? `${expandTarget.width}×${expandTarget.height}`
												: canUseExpand && expandSettled
													? `${natural.w}×${natural.h}`
													: `${canvasSize.width}×${canvasSize.height}`}
									</button>
								</div>
							</div>
							)}
						</aside>
					</div>
					{isEmbedded ? (
						<footer className="image-editor-modal__statusbar">
							<div className="image-editor-modal__status-meta">
								<span>
									{canvasSize.width} × {canvasSize.height} px
								</span>
								<span>{aspectPreset.label}</span>
								<span>{TOOLS.find((item) => item.id === tool)?.label}</span>
								{estimatedBytes != null ? <span>{formatByteSize(estimatedBytes)}</span> : null}
							</div>
							{tool !== 'pick-color' ? (
								<div className="image-editor-modal__status-export">
									<div className="image-editor-modal__format-list" role="group" aria-label="File format">
										{EDITOR_EXPORT_FORMATS.map((format) => (
											<button
												key={format}
												type="button"
												className={`image-editor-modal__format${exportFormat === format ? ' is-active' : ''}`}
												onClick={() => setExportFormat(format)}
											>
												{format === 'jpg' ? 'JPG' : format === 'png' ? 'PNG' : 'WebP'}
											</button>
										))}
									</div>
									{exportFormat !== 'png' ? (
										<label className="image-editor-modal__slider image-editor-modal__slider--bar image-editor-modal__slider--status">
											<span>Quality</span>
											<input
												type="range"
												min={10}
												max={100}
												value={exportQuality}
												onChange={(event) => setExportQuality(Number(event.currentTarget.value))}
											/>
											<span>{exportQuality}%</span>
										</label>
									) : null}
									<button className="btn btn--ghost" type="button" onClick={resetSession}>
										Reset
									</button>
									<button
										className="btn btn--primary"
										type="button"
										onClick={handleDownload}
										disabled={!ready || Boolean(busy)}
									>
										Export & Download
									</button>
								</div>
							) : null}
						</footer>
					) : null}
				</div>
					</div>
				</div>
			</div>
		</div>
	);

	if (isEmbedded) return editor;
	return createPortal(editor, document.body);
}
