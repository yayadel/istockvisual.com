import { useState } from 'react';

function CopyIcon() {
	return (
		<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
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

function ChevronIcon() {
	return (
		<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
			<path
				d="M4.2 6.2 8 10l3.8-3.8"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function SendIcon() {
	return (
		<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
			<path
				d="M3.4 11.2 20.6 3.4c.7-.3 1.4.4 1.1 1.1L14 21.8c-.3.7-1.3.7-1.6 0l-2.7-6.6-6.6-2.7c-.7-.3-.7-1.3 0-1.6Z"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.7"
				strokeLinejoin="round"
			/>
			<path
				d="M10.2 13.8 20.8 4.4"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.7"
				strokeLinecap="round"
			/>
		</svg>
	);
}

function fallbackCopy(text: string) {
	const field = document.createElement('textarea');
	field.value = text;
	field.setAttribute('readonly', '');
	field.setAttribute('aria-hidden', 'true');
	field.style.position = 'fixed';
	field.style.top = '0';
	field.style.left = '0';
	field.style.width = '1px';
	field.style.height = '1px';
	field.style.padding = '0';
	field.style.border = '0';
	field.style.opacity = '0';
	field.style.fontSize = '16px';
	document.body.appendChild(field);
	field.focus();
	field.select();
	field.setSelectionRange(0, text.length);
	let ok = false;
	try {
		ok = document.execCommand('copy');
	} catch {
		ok = false;
	}
	document.body.removeChild(field);
	return ok;
}

export default function PromptBlock({ prompt }: { prompt: string }) {
	const [copied, setCopied] = useState(false);

	function markCopied() {
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1400);
	}

	function copyPrompt() {
		const text = prompt;
		if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText && window.isSecureContext) {
			void navigator.clipboard.writeText(text).then(markCopied).catch(() => {
				if (fallbackCopy(text)) markCopied();
			});
			return;
		}
		if (fallbackCopy(text)) markCopied();
	}

	return (
		<div className="prompt-block">
			<div className="prompt-block__composer">
				<div className="prompt-block__field">
					<pre>
						<code>{prompt}</code>
					</pre>
				</div>
				<div className="prompt-block__dock">
					<span className="prompt-block__model">
						AI Image Model
						<ChevronIcon />
					</span>
					<div className="prompt-block__actions">
						<button
							type="button"
							className={`prompt-block__copy${copied ? ' is-copied' : ''}`}
							onClick={copyPrompt}
							aria-label={copied ? 'Copied' : 'Copy prompt'}
							title={copied ? 'Copied' : 'Copy prompt'}
						>
							<CopyIcon />
							<span>{copied ? 'Copied' : 'Copy'}</span>
						</button>
						<button
							type="button"
							className={`prompt-block__send${copied ? ' is-copied' : ''}`}
							onClick={copyPrompt}
							aria-label={copied ? 'Copied' : 'Copy prompt'}
							title={copied ? 'Copied' : 'Copy prompt'}
						>
							<SendIcon />
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
