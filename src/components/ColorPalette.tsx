import { useState, type CSSProperties } from 'react';

type Swatch = { name: string; hex: string };

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
		<div className="color-palette" style={{ '--palette-count': swatches.length } as CSSProperties}>
			<div className="color-palette__tray" aria-label="Color palette">
				{swatches.map((swatch, index) => {
					const isCopied = copied === swatch.hex;
					return (
						<button
							key={`${swatch.name}-${swatch.hex}-${index}`}
							type="button"
							className={`color-palette__pan${isCopied ? ' is-copied' : ''}`}
							onClick={() => copyHex(swatch.hex)}
							title={isCopied ? 'Copied' : `Copy ${swatch.hex}`}
							aria-label={isCopied ? `${swatch.hex} copied` : `Copy ${swatch.name} ${swatch.hex}`}
						>
							<span
								className="color-palette__chip"
								style={{ background: swatch.hex }}
								aria-hidden="true"
							/>
							<span className="color-palette__meta">
								<strong>{swatch.name}</strong>
								<code>{swatch.hex.toUpperCase()}</code>
							</span>
							<span className="color-palette__hint">{isCopied ? 'Copied' : 'Copy hex'}</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}
