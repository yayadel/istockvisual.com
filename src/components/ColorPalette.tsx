import { useState } from 'react';

type Swatch = { name: string; hex: string };

function contrastInk(hex: string): 'light' | 'dark' {
	const value = hex.replace('#', '').trim();
	const normalized =
		value.length === 3
			? value
					.split('')
					.map((char) => char + char)
					.join('')
			: value;
	if (normalized.length !== 6) return 'dark';
	const r = Number.parseInt(normalized.slice(0, 2), 16);
	const g = Number.parseInt(normalized.slice(2, 4), 16);
	const b = Number.parseInt(normalized.slice(4, 6), 16);
	if ([r, g, b].some((channel) => Number.isNaN(channel))) return 'dark';
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance > 0.62 ? 'dark' : 'light';
}

export default function ColorPalette({ swatches }: { swatches: Swatch[] }) {
	const [copied, setCopied] = useState<string | null>(null);

	async function copyHex(hex: string) {
		try {
			await navigator.clipboard.writeText(hex);
			setCopied(hex);
			window.setTimeout(() => setCopied((current) => (current === hex ? null : current)), 1400);
		} catch {
			setCopied(null);
		}
	}

	if (!swatches.length) return null;

	return (
		<div className="color-palette" style={{ '--palette-count': swatches.length } as React.CSSProperties}>
			<div className="color-palette__tray" aria-label="Color palette">
				{swatches.map((swatch, index) => {
					const isCopied = copied === swatch.hex;
					const ink = contrastInk(swatch.hex);
					return (
						<button
							key={`${swatch.name}-${swatch.hex}-${index}`}
							type="button"
							className={`color-palette__pan is-${ink}${isCopied ? ' is-copied' : ''}`}
							style={{ background: swatch.hex }}
							onClick={() => copyHex(swatch.hex)}
							title={isCopied ? 'Copied' : `Copy ${swatch.hex}`}
							aria-label={isCopied ? `${swatch.hex} copied` : `Copy ${swatch.name} ${swatch.hex}`}
						>
							<span className="color-palette__sheen" aria-hidden="true" />
							<span className="color-palette__meta">
								<strong>{swatch.name}</strong>
								<code>{swatch.hex.toUpperCase()}</code>
							</span>
							<span className="color-palette__hint">{isCopied ? 'Copied' : 'Copy'}</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}
