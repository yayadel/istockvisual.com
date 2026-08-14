import { useEffect, useRef, useState } from 'react';
import { catalogColorHex, normalizeCatalogColor } from '../lib/catalog';

type Hsl = { h: number; s: number; l: number };

type Props = {
	color?: string;
	action: string;
	params?: Record<string, string>;
};

function clamp(value: number, min = 0, max = 1) {
	return Math.min(max, Math.max(min, value));
}

function hslToHex({ h, s, l }: Hsl): string {
	const sat = clamp(s);
	const light = clamp(l);
	const c = (1 - Math.abs(2 * light - 1)) * sat;
	const hp = ((h % 360) + 360) % 360 / 60;
	const x = c * (1 - Math.abs((hp % 2) - 1));
	let r = 0;
	let g = 0;
	let b = 0;
	if (hp < 1) [r, g, b] = [c, x, 0];
	else if (hp < 2) [r, g, b] = [x, c, 0];
	else if (hp < 3) [r, g, b] = [0, c, x];
	else if (hp < 4) [r, g, b] = [0, x, c];
	else if (hp < 5) [r, g, b] = [x, 0, c];
	else [r, g, b] = [c, 0, x];
	const m = light - c / 2;
	const toHex = (channel: number) =>
		Math.round((channel + m) * 255)
			.toString(16)
			.padStart(2, '0');
	return `${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHsl(hex: string): Hsl | null {
	const value = normalizeCatalogColor(hex);
	if (!/^[0-9a-f]{6}$/.test(value)) return null;
	const r = Number.parseInt(value.slice(0, 2), 16) / 255;
	const g = Number.parseInt(value.slice(2, 4), 16) / 255;
	const b = Number.parseInt(value.slice(4, 6), 16) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	if (max === min) return { h: 0, s: 0, l };
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h = 0;
	if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
	else if (max === g) h = (b - r) / d + 2;
	else h = (r - g) / d + 4;
	return { h: h * 60, s, l };
}

function initialHsl(color?: string): Hsl {
	const hex = color ? catalogColorHex(color) : '';
	return hexToHsl(hex) || { h: 0, s: 0, l: 0.82 };
}

export default function CatalogColorPicker({ color = '', action, params = {} }: Props) {
	const applied = catalogColorHex(color);
	const [hsl, setHsl] = useState<Hsl>(() => initialHsl(color));
	const [draft, setDraft] = useState(applied ? `#${applied}` : '');
	const [drag, setDrag] = useState<'wheel' | 'luma' | null>(null);
	const wheelRef = useRef<HTMLDivElement>(null);
	const lumaRef = useRef<HTMLDivElement>(null);
	const hslRef = useRef(hsl);
	hslRef.current = hsl;

	useEffect(() => {
		const next = initialHsl(color);
		setHsl(next);
		setDraft(applied ? `#${applied}` : '');
	}, [color, applied]);

	function hrefFor(hex: string) {
		const search = new URLSearchParams(params);
		if (hex) search.set('color', hex);
		else search.delete('color');
		const qs = search.toString();
		return qs ? `${action}?${qs}` : action;
	}

	function commit(next = hslRef.current, forceHex?: string) {
		const hex = forceHex === '' ? '' : forceHex || hslToHex(next);
		if (hex === applied) return;
		window.location.assign(hrefFor(hex));
	}

	function readWheel(event: PointerEvent | React.PointerEvent) {
		const el = wheelRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const x = event.clientX - (rect.left + rect.width / 2);
		const y = event.clientY - (rect.top + rect.height / 2);
		const maxR = rect.width / 2 - 4;
		const dist = Math.sqrt(x * x + y * y);
		const angle = Math.atan2(y, x);
		const h = (((angle * 180) / Math.PI + 90) + 360) % 360;
		const s = clamp(dist / maxR);
		const next = { ...hslRef.current, h, s };
		hslRef.current = next;
		setHsl(next);
		setDraft(`#${hslToHex(next)}`);
	}

	function readLuma(event: PointerEvent | React.PointerEvent) {
		const el = lumaRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const l = clamp((event.clientX - rect.left) / rect.width);
		const next = { ...hslRef.current, l };
		hslRef.current = next;
		setHsl(next);
		setDraft(`#${hslToHex(next)}`);
	}

	useEffect(() => {
		if (!drag) return;
		function onMove(event: PointerEvent) {
			if (drag === 'wheel') readWheel(event);
			else readLuma(event);
		}
		function onUp() {
			setDrag(null);
			commit();
		}
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		return () => {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
		};
	}, [drag]);

	const knobLeft = 50 + hsl.s * 50 * Math.cos(((hsl.h - 90) * Math.PI) / 180);
	const knobTop = 50 + hsl.s * 50 * Math.sin(((hsl.h - 90) * Math.PI) / 180);
	const liveHex = hslToHex(hsl);

	return (
		<div className="catalog-color">
			<div
				ref={wheelRef}
				className="catalog-color__wheel"
				role="slider"
				aria-label="Hue and saturation"
				aria-valuetext={`#${liveHex}`}
				onPointerDown={(event) => {
					event.preventDefault();
					setDrag('wheel');
					readWheel(event);
				}}
			>
				<span
					className="catalog-color__knob"
					style={{ left: `${knobLeft}%`, top: `${knobTop}%` }}
				/>
			</div>

			<div
				ref={lumaRef}
				className="catalog-color__luma"
				role="slider"
				aria-label="Brightness"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={Math.round(hsl.l * 100)}
				onPointerDown={(event) => {
					event.preventDefault();
					setDrag('luma');
					readLuma(event);
				}}
			>
				<span className="catalog-color__knob" style={{ left: `${hsl.l * 100}%` }} />
			</div>

			<div className="catalog-color__hex">
				<button
					className="catalog-color__none"
					type="button"
					aria-label="Clear color"
					title="Clear color"
					onClick={() => {
						setHsl({ h: 0, s: 0, l: 0.82 });
						setDraft('');
						commit({ h: 0, s: 0, l: 0.82 }, '');
					}}
				>
					<span className="catalog-color__none-icon" aria-hidden="true" />
				</button>
				<input
					type="text"
					value={draft}
					placeholder="#Hex color code"
					spellCheck={false}
					autoComplete="off"
					aria-label="Hex color code"
					onChange={(event) => setDraft(event.target.value)}
					onBlur={() => {
						const hex = normalizeCatalogColor(draft);
						if (!hex) {
							if (!applied) setDraft('');
							else setDraft(`#${applied}`);
							return;
						}
						const next = hexToHsl(hex);
						if (next) {
							hslRef.current = next;
							setHsl(next);
							setDraft(`#${hex}`);
							commit(next, hex);
						}
					}}
					onKeyDown={(event) => {
						if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
					}}
				/>
			</div>
		</div>
	);
}
