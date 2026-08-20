import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import FilerobotImageEditor, { TABS, TOOLS } from 'react-filerobot-image-editor';
import {
	DOWNLOAD_SIZES,
	filenameFromTitle,
	fitLongEdge,
	isFreeDownloadSize,
	outputSizeForDownload,
	type DownloadSizeId,
} from '../lib/download-sizes';
import { LONG_PLANS } from '../lib/pricing';
import type { QuickEditId } from '../lib/quick-edit';
import { cutoutKeepSubject } from '../lib/client-remove-background';
import CutoutKeepOverlay from './CutoutKeepOverlay';
import type { KeepCircle } from '../lib/image-editor-ops';

type SavedImage = {
	name?: string;
	extension?: string;
	fullName?: string;
	mimeType?: string;
	width?: number;
	height?: number;
	imageBase64?: string;
	imageCanvas?: HTMLCanvasElement;
};

type Props = {
	imageUrl: string;
	title: string;
	width?: number;
	height?: number;
	loggedIn?: boolean;
	isPro?: boolean;
	assetId?: string;
};

const FREE_LONG_EDGE = 1024;
const CUTOUT_WHEEL_HINT =
	'Scroll to resize the circle or brush. Ctrl + scroll to zoom the canvas.';
const CANVAS_ZOOM_HINT = 'Ctrl + scroll to zoom the canvas.';

const EDITOR_TABS = [
	TABS.ADJUST,
	TABS.FINETUNE,
	TABS.FILTERS,
	TABS.ANNOTATE,
	TABS.WATERMARK,
	TABS.RESIZE,
	TABS.AI,
];

const CROP_PRESETS = [
	{ titleKey: 'square', descriptionKey: '1:1', ratio: 1 },
	{ titleKey: 'classicTv', descriptionKey: '4:3', ratio: 4 / 3 },
	{ titleKey: 'wideScreen', descriptionKey: '16:9', ratio: 16 / 9 },
	{ titleKey: 'story', descriptionKey: '9:16', ratio: 9 / 16 },
];

const CUTOUT_TAB_ICON =
	'<g data-cutout-icon="1" fill="none" stroke="currentColor" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round">' +
	'<circle cx="13" cy="13" r="6.4"/>' +
	'<circle cx="13" cy="37" r="6.4"/>' +
	'<path d="M19.6 17.4 42.5 7.2"/>' +
	'<path d="M19.6 32.6 42.5 42.8"/>' +
	'<path d="M19.4 17.6 25.8 25 19.4 32.4"/>' +
	'</g>';

function applyCutoutTabIcon(root: HTMLElement) {
	const icon = root.querySelector('[data-testid="FIE-tab-item-icon-ai"]');
	if (!icon || icon.querySelector('[data-cutout-icon]')) return;
	icon.innerHTML = CUTOUT_TAB_ICON;
}

const FILEROBOT_THEME = {
	palette: {
		'bg-primary-active': '#ECF3FF',
	},
	typography: {
		fontFamily: 'Roboto, Arial, sans-serif',
	},
};

function scaleCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
	if (canvas.width === width && canvas.height === height) return canvas;
	const out = document.createElement('canvas');
	out.width = Math.max(1, width);
	out.height = Math.max(1, height);
	const ctx = out.getContext('2d');
	if (!ctx) return canvas;
	ctx.drawImage(canvas, 0, 0, out.width, out.height);
	return out;
}

function triggerDownload(href: string, filename: string) {
	const link = document.createElement('a');
	link.href = href;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
}

function CrownIcon() {
	return (
		<svg className="download-pro-icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
			<path
				fill="currentColor"
				d="M1.5 12.5h13v1.2H1.5zm.8-7.2 2.7 2.1L8 3.2l2.9 4.2 2.8-2.1.7 7H1.6z"
			/>
		</svg>
	);
}

export default function FilerobotAssetEditor({
	imageUrl,
	title,
	width = 1536,
	height = 1024,
	loggedIn = false,
	isPro = false,
	assetId,
}: Props) {
	const [gateMessage, setGateMessage] = useState<string | null>(null);
	const [originalSlot, setOriginalSlot] = useState<Element | null>(null);
	const [sizeSlot, setSizeSlot] = useState<Element | null>(null);
	const [selectedSize, setSelectedSize] = useState<DownloadSizeId>('1k');
	const [sizeMenuOpen, setSizeMenuOpen] = useState(false);
	const [authModalOpen, setAuthModalOpen] = useState(false);
	const [plansModalOpen, setPlansModalOpen] = useState(false);
	const [pendingSize, setPendingSize] = useState<string | null>(null);
	const [cutoutSlot, setCutoutSlot] = useState<Element | null>(null);
	const [canvasSlot, setCanvasSlot] = useState<Element | null>(null);
	const [barSlot, setBarSlot] = useState<Element | null>(null);
	const [cutoutBusy, setCutoutBusy] = useState(false);
	const [wheelHint, setWheelHint] = useState<string | null>(null);
	const frameRef = useRef<HTMLDivElement>(null);
	const sizePickerRef = useRef<HTMLDivElement>(null);
	const updateStateFnRef = useRef<((part: Record<string, unknown>) => void) | undefined>(undefined);
	const clampingResizeRef = useRef(false);
	const cutoutUrlRef = useRef<string | null>(null);
	const wheelHintTimer = useRef<number>(0);
	const savedName = filenameFromTitle(title);
	const nextPath = typeof window === 'undefined' ? '/' : window.location.pathname + window.location.search;
	const loginHref = `/login?next=${encodeURIComponent(nextPath)}`;
	const signupHref = `/signup?next=${encodeURIComponent(nextPath)}`;
	const [source, setSource] = useState(imageUrl);

	const sizes = useMemo(
		() =>
			DOWNLOAD_SIZES.map((size) => ({
				...size,
				output: outputSizeForDownload(width, height, size),
			})),
		[height, width],
	);
	const canvasBoardSize = useMemo(() => {
		const current = Math.max(width, height) || 1;
		const scale = Math.min(1, FREE_LONG_EDGE / current);
		return {
			width: Math.max(1, Math.round(width * scale)),
			height: Math.min(860, Math.max(1, Math.round(height * scale))),
		};
	}, [height, width]);
	const selected = sizes.find((size) => size.id === selectedSize) || sizes[1];

	useEffect(() => {
		setSource((prev) => (prev.startsWith('blob:') ? prev : imageUrl));
	}, [imageUrl]);

	useEffect(() => {
		const preview = document.getElementById('preview');
		const root = frameRef.current;
		if (!preview || !root) return;
		const markReady = () => {
			if (root.querySelector('canvas')) preview.classList.add('is-editor-ready');
		};
		markReady();
		const observer = new MutationObserver(markReady);
		observer.observe(root, { childList: true, subtree: true });
		return () => observer.disconnect();
	}, [source]);

	useEffect(() => {
		const preview = document.getElementById('preview');
		return () => preview?.classList.remove('is-editor-ready');
	}, []);

	useEffect(() => {
		return () => {
			if (source.startsWith('blob:') && source !== cutoutUrlRef.current) {
				URL.revokeObjectURL(source);
			}
		};
	}, [source]);

	useEffect(() => {
		return () => {
			if (cutoutUrlRef.current) URL.revokeObjectURL(cutoutUrlRef.current);
		};
	}, []);

	useEffect(() => {
		const root = frameRef.current;
		if (!root) return;
		setOriginalSlot(null);
		setSizeSlot(null);
		const sync = () => {
			const orig = root.querySelector('.FIE_topbar-buttons-wrapper');
			const info = root.querySelector('.FIE_image_info');
			if (orig) setOriginalSlot(orig);
			if (info) {
				let host = info.querySelector('.filerobot-size-host');
				if (!host) {
					host = document.createElement('div');
					host.className = 'filerobot-size-host';
					info.insertBefore(host, info.firstChild);
				}
				setSizeSlot(host);
			}
			return Boolean(orig && info);
		};
		if (sync()) return;
		const observer = new MutationObserver(() => {
			if (sync()) observer.disconnect();
		});
		observer.observe(root, { childList: true, subtree: true });
		return () => observer.disconnect();
	}, [source]);

	useEffect(() => {
		const root = frameRef.current;
		if (!root) return;
		const syncCutoutUi = () => {
			applyCutoutTabIcon(root);
			const aiOn = root.querySelector('[data-testid="FIE-tab-ai"][aria-selected="true"]');
			root.classList.toggle('is-cutout-tab', Boolean(aiOn));
			const host =
				root.querySelector('[data-testid="FIE-object-removal-brush-mode-toggle"]') ||
				root.querySelector('.FIE_tool-options-wrapper');
			const canvas =
				root.querySelector('.FIE_canvas-container') || root.querySelector('.FIE_canvas-node');
			const bar =
				root.querySelector('.FIE_tools-bar') ||
				root.querySelector('[data-testid="FIE-tools-bar-items"]');
			const next = aiOn && host ? host : null;
			const nextCanvas = aiOn && canvas ? canvas : null;
			const nextBar = aiOn && bar ? bar : null;
			setCutoutSlot((current) => (current === next ? current : next));
			setCanvasSlot((current) => (current === nextCanvas ? current : nextCanvas));
			setBarSlot((current) => (current === nextBar ? current : nextBar));
		};
		syncCutoutUi();
		const observer = new MutationObserver(syncCutoutUi);
		observer.observe(root, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['aria-selected'],
		});
		return () => observer.disconnect();
	}, [source]);

	const showWheelHint = useCallback((cutout: boolean) => {
		setWheelHint(cutout ? CUTOUT_WHEEL_HINT : CANVAS_ZOOM_HINT);
		window.clearTimeout(wheelHintTimer.current);
		wheelHintTimer.current = window.setTimeout(() => setWheelHint(null), 2800);
	}, []);

	useEffect(() => {
		return () => window.clearTimeout(wheelHintTimer.current);
	}, []);

	useEffect(() => {
		const root = frameRef.current;
		if (!root) return;
		const onWheel = (event: WheelEvent) => {
			const canvas =
				root.querySelector('.FIE_canvas-container') || root.querySelector('.FIE_canvas-node');
			if (!canvas || !(event.target instanceof Node) || !canvas.contains(event.target)) return;
			if (root.classList.contains('is-cutout-tab')) return;
			if (event.ctrlKey || event.metaKey) {
				showWheelHint(false);
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			showWheelHint(false);
		};
		root.addEventListener('wheel', onWheel, { capture: true, passive: false });
		return () => root.removeEventListener('wheel', onWheel, { capture: true });
	}, [showWheelHint, source]);

	useEffect(() => {
		if (!sizeMenuOpen) return;
		const onPointer = (event: MouseEvent) => {
			if (!sizePickerRef.current?.contains(event.target as Node)) setSizeMenuOpen(false);
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setSizeMenuOpen(false);
		};
		document.addEventListener('mousedown', onPointer);
		window.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onPointer);
			window.removeEventListener('keydown', onKey);
		};
	}, [sizeMenuOpen]);

	useEffect(() => {
		if (!authModalOpen && !plansModalOpen) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			setAuthModalOpen(false);
			setPlansModalOpen(false);
		};
		document.body.classList.add('download-auth-modal-open');
		window.addEventListener('keydown', onKey);
		return () => {
			document.body.classList.remove('download-auth-modal-open');
			window.removeEventListener('keydown', onKey);
		};
	}, [authModalOpen, plansModalOpen]);

	const requestPro = useCallback(
		(label = '2K+') => {
			setPendingSize(label);
			if (!loggedIn) setAuthModalOpen(true);
			else setPlansModalOpen(true);
		},
		[loggedIn],
	);

	const gateSize = useCallback(
		(sizeId: DownloadSizeId) => {
			const size = DOWNLOAD_SIZES.find((item) => item.id === sizeId);
			if (!size) return false;
			if (isFreeDownloadSize(size.id) || isPro) return true;
			requestPro(size.label);
			return false;
		},
		[isPro, requestPro],
	);

	const applyCanvasSize = useCallback((nextWidth: number, nextHeight: number) => {
		const apply = (attempts = 12) => {
			const update = updateStateFnRef.current;
			if (!update) {
				if (attempts <= 0) return;
				window.setTimeout(() => apply(attempts - 1), 40);
				return;
			}
			clampingResizeRef.current = true;
			update({
				tabId: TABS.RESIZE,
				toolId: TOOLS.RESIZE,
				resize: {
					width: nextWidth,
					height: nextHeight,
				},
			});
			window.setTimeout(() => {
				clampingResizeRef.current = false;
			}, 0);
		};
		apply();
	}, []);

	const pickSize = useCallback(
		(sizeId: DownloadSizeId) => {
			if (!gateSize(sizeId)) return;
			const next = sizes.find((item) => item.id === sizeId);
			setSelectedSize(sizeId);
			setSizeMenuOpen(false);
			setGateMessage(null);
			if (next) applyCanvasSize(next.output.width, next.output.height);
		},
		[applyCanvasSize, gateSize, sizes],
	);

	const applyQuickEdit = useCallback((action: string) => {
		const update = updateStateFnRef.current;
		const root = frameRef.current;
		const clickWhen = (match: () => HTMLElement | null | undefined, attempts = 16) => {
			const el = match();
			if (el) {
				el.click();
				return;
			}
			if (attempts <= 0) return;
			window.setTimeout(() => clickWhen(match, attempts - 1), 40);
		};
		const clickCrop = (token: string) =>
			clickWhen(() =>
				Array.from(root?.querySelectorAll<HTMLElement>('[data-testid="FIE-crop-preset-item"]') || []).find(
					(item) => item.textContent?.includes(token),
				),
			);

		document.getElementById('preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

		switch (action as QuickEditId) {
			case 'crop-16-9':
				update?.({
					tabId: TABS.ADJUST,
					toolId: TOOLS.CROP,
					adjustments: { crop: { ratio: 16 / 9, ratioTitleKey: 'wideScreen' } },
				});
				clickCrop('16:9');
				break;
			case 'crop-1-1':
				update?.({
					tabId: TABS.ADJUST,
					toolId: TOOLS.CROP,
					adjustments: { crop: { ratio: 1, ratioTitleKey: 'square' } },
				});
				clickCrop('1:1');
				break;
			case 'crop-9-16':
				update?.({
					tabId: TABS.ADJUST,
					toolId: TOOLS.CROP,
					adjustments: { crop: { ratio: 9 / 16, ratioTitleKey: 'story' } },
				});
				clickCrop('9:16');
				break;
			case 'crop-4-3':
				update?.({
					tabId: TABS.ADJUST,
					toolId: TOOLS.CROP,
					adjustments: { crop: { ratio: 4 / 3, ratioTitleKey: 'classicTv' } },
				});
				clickCrop('4:3');
				break;
			case 'filter-bw':
				update?.({ tabId: TABS.FILTERS, toolId: TOOLS.FILTERS });
				clickWhen(() =>
					root?.querySelector<HTMLElement>('[data-testid="FIE_filters-item-black & white"]'),
				);
				break;
			case 'finetune':
				update?.({ tabId: TABS.FINETUNE, toolId: TOOLS.BRIGHTNESS });
				break;
			case 'resize':
				update?.({ tabId: TABS.RESIZE, toolId: TOOLS.RESIZE });
				break;
			case 'watermark':
				update?.({ tabId: TABS.WATERMARK, toolId: TOOLS.WATERMARK });
				break;
			case 'cutout':
				update?.({ tabId: TABS.AI, toolId: TOOLS.OBJECT_REMOVAL });
				break;
			default:
				break;
		}
	}, []);

	useEffect(() => {
		const onClick = (event: MouseEvent) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			const link = target.closest<HTMLAnchorElement>('[data-edit]');
			if (!link) return;
			event.preventDefault();
			applyQuickEdit(link.getAttribute('data-edit') || '');
		};
		document.addEventListener('click', onClick);
		return () => document.removeEventListener('click', onClick);
	}, [applyQuickEdit]);

	useEffect(() => {
		if (isPro) return;
		const root = frameRef.current;
		if (!root) return;
		const limitResizeInput = (input: HTMLInputElement) => {
			input.max = String(FREE_LONG_EDGE);
			const value = Number(input.value);
			if (!Number.isFinite(value) || value <= FREE_LONG_EDGE) return false;
			input.value = String(FREE_LONG_EDGE);
			return true;
		};
		const onResizeField = (event: Event) => {
			const target = event.target;
			if (!(target instanceof HTMLInputElement)) return;
			if (!target.closest('.FIE_resize-tool-options')) return;
			if (!limitResizeInput(target)) return;
			requestPro('2K+');
		};
		const bindMax = () => {
			root.querySelectorAll<HTMLInputElement>('.FIE_resize-tool-options input').forEach((input) => {
				input.max = String(FREE_LONG_EDGE);
			});
		};
		root.addEventListener('change', onResizeField, true);
		root.addEventListener('input', onResizeField, true);
		const observer = new MutationObserver(bindMax);
		observer.observe(root, { childList: true, subtree: true });
		bindMax();
		return () => {
			root.removeEventListener('change', onResizeField, true);
			root.removeEventListener('input', onResizeField, true);
			observer.disconnect();
		};
	}, [isPro, requestPro, source]);

	const onCutoutExecute = useCallback(
		async (payload: {
			keepCircle: KeepCircle;
			frameW: number;
			frameH: number;
			paintCanvas: HTMLCanvasElement | null;
		}) => {
			if (cutoutBusy) return false;
			setCutoutBusy(true);
			setGateMessage(null);
			try {
				const cutout = await cutoutKeepSubject({
					source,
					keepCircle: payload.keepCircle,
					frameW: payload.frameW,
					frameH: payload.frameH,
					paintCanvas: payload.paintCanvas,
				});
				const url = URL.createObjectURL(cutout);
				if (cutoutUrlRef.current) URL.revokeObjectURL(cutoutUrlRef.current);
				cutoutUrlRef.current = url;
				setSource(url);
				return true;
			} catch (error) {
				setGateMessage(
					error instanceof Error ? error.message : 'Could not remove the background',
				);
				return false;
			} finally {
				setCutoutBusy(false);
			}
		},
		[cutoutBusy, source],
	);

	const onBeforeSave = useCallback(
		(info: { width?: number; height?: number }) => {
			const chosen = DOWNLOAD_SIZES.find((item) => item.id === selectedSize);
			const longEdge = Math.max(
				chosen?.longEdge || 0,
				info.width || 0,
				info.height || 0,
			);
			if (longEdge > FREE_LONG_EDGE && !isPro) {
				requestPro(chosen?.label || '2K+');
				return false;
			}
			setGateMessage(null);
			return true;
		},
		[isPro, requestPro, selectedSize],
	);

	const onModify = useCallback(
		(state: { resize?: { width?: number; height?: number } }) => {
			if (isPro || clampingResizeRef.current) return;
			const nextWidth = Number(state.resize?.width) || 0;
			const nextHeight = Number(state.resize?.height) || 0;
			if (!nextWidth && !nextHeight) return;
			if (nextWidth <= FREE_LONG_EDGE && nextHeight <= FREE_LONG_EDGE) return;
			clampingResizeRef.current = true;
			const clamped = fitLongEdge(
				nextWidth || FREE_LONG_EDGE,
				nextHeight || FREE_LONG_EDGE,
				FREE_LONG_EDGE,
			);
			updateStateFnRef.current?.({
				resize: {
					...state.resize,
					width: clamped.width,
					height: clamped.height,
				},
			});
			requestPro('2K+');
			window.setTimeout(() => {
				clampingResizeRef.current = false;
			}, 0);
		},
		[isPro, requestPro],
	);

	const onSave = useCallback(
		(imageData: SavedImage) => {
			const filename = imageData.fullName || `${savedName}.${imageData.extension || 'webp'}`;
			const size = DOWNLOAD_SIZES.find((item) => item.id === selectedSize);
			const canvas = imageData.imageCanvas;
			const exportCanvas =
				canvas && size
					? scaleCanvas(
							canvas,
							fitLongEdge(canvas.width, canvas.height, size.longEdge).width,
							fitLongEdge(canvas.width, canvas.height, size.longEdge).height,
						)
					: canvas;
			if (exportCanvas) {
				exportCanvas.toBlob((blob) => {
					if (!blob) return;
					const url = URL.createObjectURL(blob);
					triggerDownload(url, filename);
					window.setTimeout(() => URL.revokeObjectURL(url), 1500);
				}, imageData.mimeType || 'image/webp');
				return;
			}
			if (imageData.imageBase64) triggerDownload(imageData.imageBase64, filename);
		},
		[savedName, selectedSize],
	);

	const sizePicker = selected ? (
		<div className={`filerobot-size${sizeMenuOpen ? ' is-open' : ''}`} ref={sizePickerRef}>
			<button
				type="button"
				className="filerobot-size__toggle"
				aria-expanded={sizeMenuOpen}
				aria-haspopup="listbox"
				onClick={() => setSizeMenuOpen((open) => !open)}
			>
				{isFreeDownloadSize(selected.id) ? (
					<span className="download-tier download-tier--free">Free</span>
				) : (
					<em className="download-tier download-tier--pro">Pro</em>
				)}
				<span className="filerobot-size__dims">
					{selected.output.width} × {selected.output.height}
				</span>
			</button>
			{sizeMenuOpen ? (
				<ul className="filerobot-size__menu" role="listbox" aria-label="Export resolution">
					{sizes.map((size, index) => {
						const needsPro = !isFreeDownloadSize(size.id);
						const prevNeedsPro = index > 0 && !isFreeDownloadSize(sizes[index - 1]?.id);
						const isSelected = selectedSize === size.id;
						return (
							<li
								key={size.id}
								className={`filerobot-size__row${isSelected ? ' is-selected' : ''}${needsPro && !prevNeedsPro ? ' filerobot-size__row--pro-start' : ''}`}
							>
								<button type="button" onClick={() => pickSize(size.id)}>
									{needsPro ? (
										<em className="download-tier download-tier--pro">Pro</em>
									) : (
										<span className="download-tier download-tier--free">Free</span>
									)}
									<span className="filerobot-size__dims">
										{size.output.width} × {size.output.height}
									</span>
								</button>
							</li>
						);
					})}
				</ul>
			) : null}
		</div>
	) : null;

	return (
		<div className="filerobot-studio">
			{gateMessage ? (
				<p className="filerobot-studio__gate" role="status">
					{gateMessage}{' '}
					<a href={loggedIn ? '/price' : '/login'}>{loggedIn ? 'Go Pro' : 'Sign in'}</a>
				</p>
			) : null}
			<div
				className="filerobot-studio__frame"
				ref={frameRef}
				style={
					{
						'--fie-img-w': String(canvasBoardSize.width),
						'--fie-img-h': String(canvasBoardSize.height),
					} as CSSProperties
				}
			>
				<FilerobotImageEditor
					key={assetId || imageUrl}
					source={source}
					theme={FILEROBOT_THEME}
					previewBgColor="#ffffff"
					onBeforeSave={onBeforeSave}
					onSave={onSave}
					onModify={onModify}
					defaultSavedImageName={savedName}
					defaultSavedImageType="webp"
					defaultSavedImageQuality={0.92}
					avoidChangesNotSavedAlertOnLeave
					observePluginContainerSize
					keepZoomOnSourceChange
					useAiTab
					useBackendTranslations={false}
					language="en"
					savingPixelRatio={1}
					previewPixelRatio={1}
					tabsIds={EDITOR_TABS}
					defaultTabId={TABS.ADJUST}
					defaultToolId={TOOLS.CROP}
					updateStateFnRef={updateStateFnRef}
					translations={{
						save: 'Download edited',
						saveAs: 'Download edited as',
						saveAsModalTitle: 'Download edited image',
						aiTab: 'Cutout\nBG Remove',
						objectRemovalApplyingText: 'Removing background…',
					}}
					Crop={{ presetsItems: CROP_PRESETS }}
					Rotate={{ angle: 90, componentType: 'buttons' }}
				/>
				{originalSlot
					? createPortal(
							<a className="filerobot-studio__original" href="#download-original">
								Download original
							</a>,
							originalSlot,
						)
					: null}
				{sizeSlot && sizePicker ? createPortal(sizePicker, sizeSlot) : null}
				{cutoutSlot && canvasSlot ? (
					<CutoutKeepOverlay
						canvasHost={canvasSlot}
						toolsHost={cutoutSlot}
						barHost={barSlot}
						busy={cutoutBusy}
						onWheelHint={() => showWheelHint(true)}
						onExecute={onCutoutExecute}
					/>
				) : null}
				{wheelHint ? (
					<p className="filerobot-zoom-hint" role="status">
						{wheelHint}
					</p>
				) : null}
			</div>

			{authModalOpen && (
				<div className="download-auth-modal" role="presentation">
					<button
						type="button"
						className="download-auth-modal__backdrop"
						aria-label="Close"
						onClick={() => setAuthModalOpen(false)}
					/>
					<div
						className="download-auth-modal__dialog"
						role="dialog"
						aria-modal="true"
						aria-labelledby="editor-auth-title"
					>
						<button
							type="button"
							className="download-auth-modal__close"
							aria-label="Close"
							onClick={() => setAuthModalOpen(false)}
						>
							×
						</button>
						<p className="download-auth-modal__eyebrow">
							<CrownIcon /> Pro download
						</p>
						<h2 id="editor-auth-title">Sign up for {pendingSize || '2K+'} downloads</h2>
						<p>
							512 and 1K are free without logging in. Create an account and upgrade to Pro for
							2K, 4K, and 8K.
						</p>
						<div className="download-auth-modal__actions">
							<a className="btn btn--primary" href={signupHref}>
								Create free account
							</a>
							<a className="btn btn--ghost" href={loginHref}>
								Log in
							</a>
						</div>
					</div>
				</div>
			)}

			{plansModalOpen && (
				<div className="download-auth-modal" role="presentation">
					<button
						type="button"
						className="download-auth-modal__backdrop"
						aria-label="Close"
						onClick={() => setPlansModalOpen(false)}
					/>
					<div
						className="download-auth-modal__dialog download-auth-modal__dialog--plans"
						role="dialog"
						aria-modal="true"
						aria-labelledby="editor-plans-title"
					>
						<button
							type="button"
							className="download-auth-modal__close"
							aria-label="Close"
							onClick={() => setPlansModalOpen(false)}
						>
							×
						</button>
						<p className="download-auth-modal__eyebrow">
							<CrownIcon /> Membership
						</p>
						<h2 id="editor-plans-title">Unlimited downloads</h2>
						<p>
							{pendingSize
								? `${pendingSize} requires Pro. Choose a plan below, or open the pricing page.`
								: 'Choose a temporary plan. Full details and checkout are on the pricing page.'}
						</p>
						<ul className="download-plan-list">
							{LONG_PLANS.map((plan) => (
								<li key={plan.id}>
									<div>
										<strong>{plan.name}</strong>
										<span>{plan.rate}</span>
									</div>
									<em>{plan.price}</em>
								</li>
							))}
						</ul>
						<div className="download-auth-modal__actions">
							<a className="btn btn--primary" href="/price">
								Details · Pricing page
							</a>
							<button
								type="button"
								className="btn btn--ghost"
								onClick={() => setPlansModalOpen(false)}
							>
								Close
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
