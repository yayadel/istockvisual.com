import { useState } from 'react';

function CopyIcon() {
	return (
		<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
			<rect
				x="5.5"
				y="5.5"
				width="8"
				height="8"
				rx="1.2"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.4"
			/>
			<path
				d="M3.5 10.5h-1A1.5 1.5 0 0 1 1 9V3.5A1.5 1.5 0 0 1 2.5 2H8a1.5 1.5 0 0 1 1.5 1.5v1"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.4"
			/>
		</svg>
	);
}

function PromptArt() {
	return (
		<svg className="prompt-block__svg" viewBox="0 0 220 240" fill="none" aria-hidden="true">
			<rect x="28" y="36" width="128" height="96" rx="6" stroke="currentColor" strokeWidth="1.4" />
			<rect x="40" y="50" width="104" height="68" rx="3" stroke="currentColor" strokeWidth="1.2" opacity="0.45" />
			<path
				d="M52 96c18-22 36-22 54 0"
				stroke="currentColor"
				strokeWidth="1.2"
				opacity="0.55"
			/>
			<circle cx="79" cy="74" r="7" fill="#c4f04b" />
			<path
				d="M156 88h18a8 8 0 0 1 8 8v78a8 8 0 0 1-8 8H48a8 8 0 0 1-8-8v-18"
				stroke="currentColor"
				strokeWidth="1.4"
				strokeLinecap="round"
			/>
			<path d="M62 150h72M62 164h48M62 178h36" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
			<rect x="62" y="148" width="10" height="4" rx="1" fill="#c4f04b" />
			<path
				d="M168 44l3.2 7.4 8.1.7-6.1 5.4 1.8 8-7-4.2-7 4.2 1.8-8-6.1-5.4 8.1-.7Z"
				fill="#c4f04b"
			/>
			<circle cx="188" cy="118" r="3" fill="currentColor" opacity="0.35" />
			<circle cx="198" cy="152" r="2" fill="currentColor" opacity="0.28" />
			<path d="M188 118l10 34" stroke="currentColor" strokeWidth="1" opacity="0.22" />
		</svg>
	);
}

export default function PromptBlock({ prompt }: { prompt: string }) {
	const [copied, setCopied] = useState(false);

	async function copyPrompt() {
		try {
			await navigator.clipboard.writeText(prompt);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1400);
		} catch {
			setCopied(false);
		}
	}

	return (
		<div className="prompt-block">
			<div className="prompt-block__code">
				<div className="prompt-block__toolbar">
					<span className="prompt-block__file">image-prompt.txt</span>
					<button
						type="button"
						className={`prompt-block__copy${copied ? ' is-copied' : ''}`}
						onClick={() => void copyPrompt()}
					>
						<CopyIcon />
						{copied ? 'Copied' : 'Copy'}
					</button>
				</div>
				<pre>
					<code>{prompt}</code>
				</pre>
			</div>
			<aside className="prompt-block__art" aria-hidden="true">
				<p>From prompt to picture</p>
				<PromptArt />
			</aside>
		</div>
	);
}
