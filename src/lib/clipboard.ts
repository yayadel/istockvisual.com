/** Safe clipboard write with execCommand fallback. Never throws. */
export async function copyTextSafe(text: string): Promise<boolean> {
	const value = text?.trim();
	if (!value || typeof document === 'undefined') return false;

	try {
		if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText && window.isSecureContext) {
			await navigator.clipboard.writeText(value);
			return true;
		}
	} catch {
		/* fall through */
	}

	try {
		const field = document.createElement('textarea');
		field.value = value;
		field.setAttribute('readonly', 'true');
		field.style.position = 'fixed';
		field.style.left = '-9999px';
		document.body.appendChild(field);
		field.select();
		const ok = document.execCommand('copy');
		field.remove();
		return ok;
	} catch {
		return false;
	}
}
