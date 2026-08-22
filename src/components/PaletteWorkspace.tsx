import { useCallback, useEffect, useRef, useState } from 'react';
import {
	formatHsl,
	formatRgb,
	makeManualColor,
	paletteFromImageElement,
	renderPaletteShareCard,
	toCssVarsSnippet,
	toTailwindSnippet,
	type PaletteColor,
} from '../lib/palette-extract';
import {
	EXAMPLE_IMAGE_URL,
	downloadBlob,
	isLikelyImageFile,
	loadImageElement,
	loadImageFromFile,
} from '../lib/tools-shared';
import { ToolsDropzone, ToolsEditorShell } from './ToolsChrome';

type CopyFormat = 'hex' | 'rgb' | 'hsl';

declare global {
	interface Window {
		EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> };
	}
}

export default function PaletteWorkspace() {
	const inputRef = useRef<HTMLInputElement>(null);
	const [sourceUrl, setSourceUrl] = useState<string>(EXAMPLE_IMAGE_URL);
	const [isExample, setIsExample] = useState(true);
	const [image, setImage] = useState<HTMLImageElement | null>(null);
	const [colors, setColors] = useState<PaletteColor[]>([]);
	const [colorCount, setColorCount] = useState(6);
	const [copyFormat, setCopyFormat] = useState<CopyFormat>('hex');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [toast, setToast] = useState<string | null>(null);
	const [eyeDropperOk, setEyeDropperOk] = useState(false);

	useEffect(() => {
		setEyeDropperOk(typeof window.EyeDropper === 'function');
	}, []);

	useEffect(() => {
		return () => {
			if (sourceUrl.startsWith('blob:')) URL.revokeObjectURL(sourceUrl);
		};
	}, [sourceUrl]);

	useEffect(() => {
		if (!toast) return;
		const t = window.setTimeout(() => setToast(null), 1600);
		return () => window.clearTimeout(t);
	}, [toast]);

	const extract = useCallback((img: HTMLImageElement, count: number) => {
		setBusy(true);
		window.setTimeout(() => {
			try {
				setColors(paletteFromImageElement(img, count));
				setError(null);
			} catch (err) {
				console.error(err);
				setError(err instanceof Error ? err.message : 'Extract failed');
			} finally {
				setBusy(false);
			}
		}, 0);
	}, []);

	useEffect(() => {
		let cancelled = false;
		loadImageElement(EXAMPLE_IMAGE_URL)
			.then((img) => {
				if (!cancelled) setImage(img);
			})
			.catch(() => {
				if (!cancelled) setError('Failed to load example image');
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const loadFile = useCallback(
		async (file: File | undefined | null) => {
			if (!file) return;
			if (!isLikelyImageFile(file)) {
				setError('Please choose an image file.');
				return;
			}
			setError(null);
			try {
				const img = await loadImageFromFile(file);
				const url = URL.createObjectURL(file);
				setSourceUrl((prev) => {
					if (prev.startsWith('blob:')) URL.revokeObjectURL(prev);
					return url;
				});
				setIsExample(false);
				setImage(img);
				extract(img, colorCount);
			} catch (err) {
				console.error(err);
				setError('Failed to load image');
			}
		},
		[colorCount, extract],
	);

	useEffect(() => {
		if (image) extract(image, colorCount);
	}, [colorCount, extract, image]);

	const copyValue = useCallback(
		async (color: PaletteColor) => {
			const value =
				copyFormat === 'hex'
					? color.hex
					: copyFormat === 'rgb'
						? formatRgb(color)
						: formatHsl(color);
			try {
				await navigator.clipboard.writeText(value);
				setToast(`Copied ${value}`);
			} catch {
				setError('Clipboard copy failed');
			}
		},
		[copyFormat],
	);

	const copySnippet = useCallback(
		async (kind: 'tailwind' | 'css') => {
			if (!colors.length) return;
			const text = kind === 'tailwind' ? toTailwindSnippet(colors) : toCssVarsSnippet(colors);
			try {
				await navigator.clipboard.writeText(text);
				setToast(kind === 'tailwind' ? 'Tailwind snippet copied' : 'CSS variables copied');
			} catch {
				setError('Clipboard copy failed');
			}
		},
		[colors],
	);

	const pickEyeDropper = useCallback(async () => {
		if (!window.EyeDropper) {
			setError('EyeDropper API is not supported in this browser.');
			return;
		}
		try {
			const dropper = new window.EyeDropper();
			const result = await dropper.open();
			const manual = makeManualColor(result.sRGBHex);
			setColors((prev) => {
				if (prev.some((c) => c.hex === manual.hex)) return prev;
				return [...prev, { ...manual, ratio: 0 }];
			});
			setToast(`Added ${manual.hex}`);
		} catch {
			/* cancelled */
		}
	}, []);

	const exportShare = useCallback(async () => {
		if (!image || !colors.length) return;
		setBusy(true);
		try {
			downloadBlob(await renderPaletteShareCard(image, colors), 'palette-share.png');
		} catch (err) {
			console.error(err);
			setError('Share image export failed');
		} finally {
			setBusy(false);
		}
	}, [colors, image]);

	return (
		<div className="tools-work">
			<ToolsDropzone
				inputRef={inputRef}
				title={isExample ? 'Drop an image to extract colors' : 'Replace source image'}
				hint="Median-cut palette, local only. Example is live — change color count or copy swatches now."
				cta="Browse files"
				sampleSrc={sourceUrl}
				sampleLabel={isExample ? 'Live example' : 'Your image'}
				formats={['JPG', 'PNG', 'WebP']}
				onFiles={(files) => void loadFile(files?.[0])}
			/>

			<ToolsEditorShell
				note={
					isExample
						? 'Example image — upload yours or copy swatches from the sample now.'
						: 'Click a swatch to copy its value'
				}
				actions={
					<>
						{eyeDropperOk && (
							<button type="button" className="btn btn--ghost" onClick={pickEyeDropper} disabled={!image}>
								Eyedropper
							</button>
						)}
						<button
							type="button"
							className="btn btn--ghost"
							onClick={() => void copySnippet('css')}
							disabled={!colors.length}
						>
							Copy CSS vars
						</button>
						<button
							type="button"
							className="btn btn--ghost"
							onClick={() => void copySnippet('tailwind')}
							disabled={!colors.length}
						>
							Copy Tailwind
						</button>
						<button
							type="button"
							className="btn btn--primary"
							onClick={exportShare}
							disabled={busy || !colors.length || !image}
						>
							Export share image
						</button>
					</>
				}
				controlsLabel="Palette options"
				controls={
					<div className="tools-controls tools-controls--stacked">
						<label className="tools-controls__field">
							<span>Colors</span>
							<select
								value={colorCount}
								onChange={(event) => setColorCount(Number(event.currentTarget.value))}
							>
								{[5, 6, 7, 8].map((n) => (
									<option key={n} value={n}>
										{n}
									</option>
								))}
							</select>
						</label>
						<label className="tools-controls__field">
							<span>Copy as</span>
							<select
								value={copyFormat}
								onChange={(event) => setCopyFormat(event.currentTarget.value as CopyFormat)}
							>
								<option value="hex">HEX</option>
								<option value="rgb">RGB</option>
								<option value="hsl">HSL</option>
							</select>
						</label>
						<p className="tools-work__note">
							Export as CSS variables, Tailwind snippet, or a shareable color card.
						</p>
					</div>
				}
			>
				<section className="tools-palette" aria-label="Extracted palette">
					<div className="tools-palette__media">
						<img src={sourceUrl} alt="Source for palette extraction" />
						{busy && <span className="tools-palette__busy">Extracting…</span>}
					</div>
					{colors.length > 0 && (
						<div className="tools-swatches" role="list">
							{colors.map((color) => (
								<button
									key={color.hex + String(color.ratio)}
									type="button"
									role="listitem"
									className="tools-swatch"
									style={{ background: color.hex, color: color.ink }}
									onClick={() => void copyValue(color)}
									title="Click to copy"
								>
									<strong>{color.hex}</strong>
									<span>{color.ratio > 0 ? `${Math.round(color.ratio * 100)}%` : 'Manual'}</span>
								</button>
							))}
						</div>
					)}
				</section>
			</ToolsEditorShell>

			{error && <p className="tools-work__error">{error}</p>}
			{toast && <p className="tools-toast" role="status">{toast}</p>}
		</div>
	);
}
