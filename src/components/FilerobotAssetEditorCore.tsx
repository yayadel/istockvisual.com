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
import { QUICK_EDIT_ACTIONS } from '../lib/quick-edit';
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
	/** Standalone tools page — no Pro gates on export sizes. */
	allSizesFree?: boolean;
};

const FREE_LONG_EDGE = 1024;
const QUICK_EDIT_HASH = new Set<string>(QUICK_EDIT_ACTIONS.map((action) => action.id));
const RESIZE_PRO_HINT =
	'Sizes above 1024 px need Pro. Upgrade to unlock 2K, 4K, and 8K exports.';
const RESIZE_TOOL_SELECTOR =
	'.FIE_resize-tool-options, .FIE_resize-tool-option, .FIE_resize-width-option, .FIE_resize-height-option, .FIE_save-modal, .FIE_save-resize-wrapper';
const RESIZE_INPUT_SELECTOR = `${RESIZE_TOOL_SELECTOR} input`;
const SAVE_MODAL_SELECTOR = '.FIE_save-modal';

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

/** Default crop frame as a fraction of the shown image (centered). */
const DEFAULT_CROP_SCALE = 0.8;

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
	allSizesFree = false,
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
	const [resizeProHint, setResizeProHint] = useState(false);
	const [saveModalHost, setSaveModalHost] = useState<Element | null>(null);
	const [saveModalResizeHost, setSaveModalResizeHost] = useState<Element | null>(null);
	const [tabsDownloadSlot, setTabsDownloadSlot] = useState<Element | null>(null);
	const [saveDownloadDisabled, setSaveDownloadDisabled] = useState(true);
	const frameRef = useRef<HTMLDivElement>(null);
	const sizePickerRef = useRef<HTMLDivElement>(null);
	const updateStateFnRef = useRef<((part: Record<string, unknown>) => void) | undefined>(undefined);
	const clampingResizeRef = useRef(false);
	const cutoutUrlRef = useRef<string | null>(null);
	const defaultCropAppliedRef = useRef(false);
	const resizeHintTimer = useRef<number>(0);
	const savedName = filenameFromTitle(title);
	const nextPath = typeof window === 'undefined' ? '/' : window.location.pathname + window.location.search;
	const loginHref = `/login?next=${encodeURIComponent(nextPath)}`;
	const signupHref = `/signup?next=${encodeURIComponent(nextPath)}`;
	const editorSource = useMemo(() => {
		// Local dev: poster URLs are absolute production hosts (CORS). Load via same-origin proxy.
		if (assetId && import.meta.env.DEV) {
			return `/api/editor-image/${encodeURIComponent(assetId)}`;
		}
		if (assetId && isPro && !import.meta.env.DEV) {
			return `/api/download/${assetId}?size=4k`;
		}
		return imageUrl;
	}, [assetId, imageUrl, isPro]);
	const [source, setSource] = useState(editorSource);

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
		setSource((prev) => (prev.startsWith('blob:') ? prev : editorSource));
	}, [editorSource]);

	useEffect(() => {
		const preview = document.getElementById('preview');
		const root = frameRef.current;
		if (!preview || !root || !source) return;

		const markReady = () => {
			const fieRoot = root.querySelector('.FIE_root');
			if (fieRoot) preview.classList.add('is-editor-mounted');

			const canvas =
				root.querySelector<HTMLCanvasElement>('.FIE_canvas-node canvas') ||
				root.querySelector<HTMLCanvasElement>('.konvajs-content canvas') ||
				root.querySelector<HTMLCanvasElement>('.FIE_canvas-container canvas');
			const canvasReady = Boolean(canvas && canvas.width > 1 && canvas.height > 1);
			if (canvasReady) preview.classList.add('is-editor-ready');
		};

		markReady();
		const observer = new MutationObserver(markReady);
		observer.observe(root, { childList: true, subtree: true, attributes: true });
		let ticks = 0;
		const timer = window.setInterval(() => {
			ticks += 1;
			markReady();
			if (preview.classList.contains('is-editor-ready') || ticks >= 80) {
				window.clearInterval(timer);
			}
		}, 50);

		return () => {
			observer.disconnect();
			window.clearInterval(timer);
		};
	}, [source]);

	useEffect(() => {
		defaultCropAppliedRef.current = false;
	}, [source]);

	useEffect(() => {
		if (!source) return;

		/** Crop coords are relative to Filerobot `shownImageDimensions`, not the Konva canvas. */
		const applyCenteredCrop = (force = false) => {
			if (defaultCropAppliedRef.current && !force) return true;
			const update = updateStateFnRef.current;
			if (!update) return false;

			let applied = false;
			update((state: {
				shownImageDimensions?: { width?: number; height?: number };
				adjustments?: { crop?: { width?: number; height?: number } };
			}) => {
				const shownW = Number(state?.shownImageDimensions?.width) || 0;
				const shownH = Number(state?.shownImageDimensions?.height) || 0;
				if (shownW < 2 || shownH < 2) return null;

				const width = Math.max(1, Math.round(shownW * DEFAULT_CROP_SCALE));
				const height = Math.max(1, Math.round(shownH * DEFAULT_CROP_SCALE));
				const x = Math.max(0, Math.round((shownW - width) / 2));
				const y = Math.max(0, Math.round((shownH - height) / 2));

				const current = state?.adjustments?.crop;
				if (
					!force &&
					current?.width &&
					current?.height &&
					Math.abs(current.width / shownW - DEFAULT_CROP_SCALE) < 0.03 &&
					Math.abs(current.height / shownH - DEFAULT_CROP_SCALE) < 0.03
				) {
					applied = true;
					return null;
				}

				applied = true;
				return {
					adjustments: {
						crop: {
							// ORIGINAL_CROP — keeps source aspect; 80% of shown image, centered
							ratio: 'Crop',
							ratioTitleKey: 'original',
							width,
							height,
							x,
							y,
						},
					},
				};
			});

			if (applied) defaultCropAppliedRef.current = true;
			return applied;
		};

		let attempts = 0;
		const followUps: number[] = [];
		const tick = window.setInterval(() => {
			attempts += 1;
			if (applyCenteredCrop() || attempts >= 120) {
				window.clearInterval(tick);
				if (defaultCropAppliedRef.current) {
					// Filerobot may reset crop when shownImageDimensions settles — re-apply briefly.
					followUps.push(
						window.setTimeout(() => applyCenteredCrop(true), 120),
						window.setTimeout(() => applyCenteredCrop(true), 360),
						window.setTimeout(() => applyCenteredCrop(true), 700),
					);
				}
			}
		}, 50);

		return () => {
			window.clearInterval(tick);
			followUps.forEach((id) => window.clearTimeout(id));
		};
	}, [source]);

	useEffect(() => {
		const preview = document.getElementById('preview');
		return () => preview?.classList.remove('is-editor-ready', 'is-editor-mounted');
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

		const syncDownloadUi = () => {
			const navbar = root.querySelector('[data-testid="FIE-tabs-navbar"]');
			if (navbar) {
				let host = navbar.querySelector('.filerobot-tabs-download-host');
				if (!host) {
					host = document.createElement('div');
					host.className = 'filerobot-tabs-download-host';
					navbar.appendChild(host);
				}
				setTabsDownloadSlot((current) => (current === host ? current : host));
			}

			const saveButton = root.querySelector<HTMLButtonElement>(
				'.FIE_buttons-save-btn-button, [data-testid="FIE-save-button"] button',
			);
			setSaveDownloadDisabled(!saveButton || saveButton.disabled);
		};

		syncDownloadUi();
		const observer = new MutationObserver(syncDownloadUi);
		observer.observe(root, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['disabled', 'aria-disabled', 'class'],
		});
		return () => observer.disconnect();
	}, [source]);

	const triggerSaveDownload = useCallback(() => {
		const root = frameRef.current;
		if (!root) return;
		const saveButton = root.querySelector<HTMLButtonElement>(
			'.FIE_buttons-save-btn-button, [data-testid="FIE-save-button"] button',
		);
		saveButton?.click();
	}, []);

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

	const showResizeProHint = useCallback(() => {
		setResizeProHint(true);
		window.clearTimeout(resizeHintTimer.current);
		resizeHintTimer.current = window.setTimeout(() => setResizeProHint(false), 4200);
	}, []);

	useEffect(() => {
		return () => {
			window.clearTimeout(resizeHintTimer.current);
		};
	}, []);

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
			if (allSizesFree || isFreeDownloadSize(size.id) || isPro) return true;
			requestPro(size.label);
			return false;
		},
		[allSizesFree, isPro, requestPro],
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

	const scrollPreviewIntoView = useCallback(() => {
		document.getElementById('preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}, []);

	useEffect(() => {
		const hash = window.location.hash.replace(/^#/, '');
		if (!hash) return;

		const run = () => {
			if (hash === 'preview') {
				scrollPreviewIntoView();
				return;
			}
			if (QUICK_EDIT_HASH.has(hash)) applyQuickEdit(hash);
		};

		run();

		if (hash !== 'preview') {
			const onHash = () => {
				const next = window.location.hash.replace(/^#/, '');
				if (next === 'preview') scrollPreviewIntoView();
				else if (QUICK_EDIT_HASH.has(next)) applyQuickEdit(next);
			};
			window.addEventListener('hashchange', onHash);
			return () => window.removeEventListener('hashchange', onHash);
		}

		const preview = document.getElementById('preview');
		if (!preview) return;

		const scrollWhenReady = () => {
			if (preview.classList.contains('is-editor-ready')) scrollPreviewIntoView();
		};

		const observer = new MutationObserver(scrollWhenReady);
		observer.observe(preview, { attributes: true, attributeFilter: ['class'] });
		scrollWhenReady();

		const onHash = () => {
			const next = window.location.hash.replace(/^#/, '');
			if (next === 'preview') scrollPreviewIntoView();
			else if (QUICK_EDIT_HASH.has(next)) applyQuickEdit(next);
		};
		window.addEventListener('hashchange', onHash);

		return () => {
			observer.disconnect();
			window.removeEventListener('hashchange', onHash);
		};
	}, [applyQuickEdit, scrollPreviewIntoView]);

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
		if (allSizesFree || isPro) return;
		const limitResizeInput = (input: HTMLInputElement, silent = false) => {
			input.max = String(FREE_LONG_EDGE);
			const value = Number(input.value);
			if (!Number.isFinite(value) || value <= FREE_LONG_EDGE) return false;
			input.value = String(FREE_LONG_EDGE);
			input.dispatchEvent(new Event('input', { bubbles: true }));
			input.dispatchEvent(new Event('change', { bubbles: true }));
			if (!silent) showResizeProHint();
			return true;
		};
		const onResizeField = (event: Event) => {
			const target = event.target;
			if (!(target instanceof HTMLInputElement)) return;
			if (!target.closest(RESIZE_TOOL_SELECTOR)) return;
			limitResizeInput(target);
		};
		const bindMax = () => {
			document.querySelectorAll<HTMLInputElement>(RESIZE_INPUT_SELECTOR).forEach((input) => {
				limitResizeInput(input, true);
			});
		};
		document.addEventListener('change', onResizeField, true);
		document.addEventListener('input', onResizeField, true);
		const observer = new MutationObserver(bindMax);
		observer.observe(document.body, { childList: true, subtree: true });
		bindMax();
		return () => {
			document.removeEventListener('change', onResizeField, true);
			document.removeEventListener('input', onResizeField, true);
			observer.disconnect();
		};
	}, [allSizesFree, isPro, showResizeProHint]);

	useEffect(() => {
		const root = frameRef.current;
		if (!root) return;
		const syncResizeHint = () => {
			const onResizeTab = root.querySelector('[data-testid="FIE-tab-resize"][aria-selected="true"]');
			const saveModalOpen = document.querySelector(SAVE_MODAL_SELECTOR);
			const host =
				saveModalOpen?.querySelector('.FIE_save-resize-wrapper')?.parentElement ||
				saveModalOpen?.querySelector('.SfxModalContent-root') ||
				saveModalOpen;
			const resizeHost = saveModalOpen?.querySelector('.FIE_save-resize-wrapper') || null;
			setSaveModalHost(host instanceof Element ? host : null);
			setSaveModalResizeHost(resizeHost instanceof Element ? resizeHost : null);
			if (!onResizeTab && !saveModalOpen) setResizeProHint(false);
		};
		syncResizeHint();
		const observer = new MutationObserver(syncResizeHint);
		observer.observe(root, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['aria-selected'],
		});
		observer.observe(document.body, { childList: true, subtree: true });
		return () => observer.disconnect();
	}, [source]);

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
			if (longEdge > FREE_LONG_EDGE && !allSizesFree && !isPro) {
				requestPro(chosen?.label || '2K+');
				return false;
			}
			setGateMessage(null);
			return true;
		},
		[allSizesFree, isPro, requestPro, selectedSize],
	);

	const onModify = useCallback(
		(state: { resize?: { width?: number; height?: number } }) => {
			if (allSizesFree || isPro || clampingResizeRef.current) return;
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
			showResizeProHint();
			window.setTimeout(() => {
				clampingResizeRef.current = false;
			}, 0);
		},
		[allSizesFree, isPro, showResizeProHint],
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
				{allSizesFree || isFreeDownloadSize(selected.id) ? (
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
						const needsPro = !allSizesFree && !isFreeDownloadSize(size.id);
						const prevNeedsPro =
							index > 0 && !allSizesFree && !isFreeDownloadSize(sizes[index - 1]?.id);
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

	const resizeProHintUi = (
		<div
			className={`filerobot-resize-pro-hint${saveModalHost ? ' filerobot-resize-pro-hint--modal' : ''}`}
			role="status"
		>
			<p>{RESIZE_PRO_HINT}</p>
			<button
				type="button"
				onClick={() => {
					setResizeProHint(false);
					requestPro('2K+');
				}}
			>
				Go Pro
			</button>
		</div>
	);

	const saveModalProBadgeUi = !allSizesFree && !isPro ? (
		<div className="filerobot-save-pro-badge" role="note" aria-label="Pro up to 8K">
			<span className="filerobot-save-pro-badge__pill">PRO</span>
			<span className="filerobot-save-pro-badge__text">Up to 8K</span>
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
				{source ? (
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
					disableZooming
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
				) : null}
				{originalSlot && assetId
					? createPortal(
							<a className="filerobot-studio__original" href="#download-original">
								Download original
							</a>,
							originalSlot,
						)
					: null}
				{sizeSlot && sizePicker ? createPortal(sizePicker, sizeSlot) : null}
				{tabsDownloadSlot
					? createPortal(
							<button
								type="button"
								className="filerobot-tabs-download"
								onClick={triggerSaveDownload}
								disabled={saveDownloadDisabled}
								aria-label="Download edited"
								title="Download edited"
							>
								<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
									<path
										fill="currentColor"
										d="M12 3.5a1 1 0 0 1 1 1v8.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.42l2.3 2.3V4.5a1 1 0 0 1 1-1Zm-7 14a1 1 0 0 1 1 1v1h12v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z"
									/>
								</svg>
								<span>{'Download\nEdited'}</span>
							</button>,
							tabsDownloadSlot,
						)
					: null}
				{cutoutSlot && canvasSlot ? (
					<CutoutKeepOverlay
						canvasHost={canvasSlot}
						toolsHost={cutoutSlot}
						barHost={barSlot}
						busy={cutoutBusy}
						onExecute={onCutoutExecute}
					/>
				) : null}
				{saveModalResizeHost && saveModalProBadgeUi
					? createPortal(saveModalProBadgeUi, saveModalResizeHost)
					: null}
				{resizeProHint && !saveModalHost ? resizeProHintUi : null}
				{resizeProHint && saveModalHost
					? createPortal(resizeProHintUi, saveModalHost)
					: null}
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
