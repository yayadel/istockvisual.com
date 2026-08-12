import { useState } from "react";

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

	return (
		<ul className="palette-swatches">
			{swatches.map((swatch) => {
				const isCopied = copied === swatch.hex;
				return (
					<li key={`${swatch.name}-${swatch.hex}`}>
						<span className="palette-swatches__chip" style={{ background: swatch.hex }} />
						<span className="palette-swatches__meta">
							<strong>{swatch.name}</strong>
							<button
								type="button"
								className={`palette-swatches__hex${isCopied ? " is-copied" : ""}`}
								onClick={() => copyHex(swatch.hex)}
								title={isCopied ? "Copied" : "Copy color code"}
								aria-label={isCopied ? `${swatch.hex} copied` : `Copy ${swatch.hex}`}
							>
								<code>{swatch.hex}</code>
								<span>{isCopied ? "Copied" : "Copy"}</span>
							</button>
						</span>
					</li>
				);
			})}
		</ul>
	);
}
