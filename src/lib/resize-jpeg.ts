import { decode as decodePng } from 'fast-png';
import { decode as decodeJpeg, encode as encodeJpeg } from 'jpeg-js';

function bilinearRgba(
	src: Uint8Array,
	sw: number,
	sh: number,
	tw: number,
	th: number,
): Uint8Array {
	const dst = new Uint8Array(tw * th * 4);
	const xRatio = tw === 1 ? 0 : (sw - 1) / (tw - 1);
	const yRatio = th === 1 ? 0 : (sh - 1) / (th - 1);

	for (let y = 0; y < th; y++) {
		const fy = y * yRatio;
		const y0 = Math.floor(fy);
		const y1 = Math.min(y0 + 1, sh - 1);
		const wy = fy - y0;
		for (let x = 0; x < tw; x++) {
			const fx = x * xRatio;
			const x0 = Math.floor(fx);
			const x1 = Math.min(x0 + 1, sw - 1);
			const wx = fx - x0;
			const dstOff = (y * tw + x) * 4;
			for (let c = 0; c < 4; c++) {
				const p00 = src[(y0 * sw + x0) * 4 + c];
				const p10 = src[(y0 * sw + x1) * 4 + c];
				const p01 = src[(y1 * sw + x0) * 4 + c];
				const p11 = src[(y1 * sw + x1) * 4 + c];
				dst[dstOff + c] = Math.round(
					p00 * (1 - wx) * (1 - wy) + p10 * wx * (1 - wy) + p01 * (1 - wx) * wy + p11 * wx * wy,
				);
			}
		}
	}

	return dst;
}

function isPng(input: Uint8Array) {
	return input.length >= 8 && input[0] === 0x89 && input[1] === 0x50 && input[2] === 0x4e && input[3] === 0x47;
}

function isJpeg(input: Uint8Array) {
	return input.length >= 3 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff;
}

function toRgba(data: Uint8Array | Uint16Array, width: number, height: number, channels: number) {
	if (channels === 4 && data instanceof Uint8Array) return data;
	const pixels = width * height;
	const out = new Uint8Array(pixels * 4);
	for (let i = 0; i < pixels; i++) {
		if (channels === 1) {
			const v = Number(data[i]);
			out[i * 4] = v;
			out[i * 4 + 1] = v;
			out[i * 4 + 2] = v;
			out[i * 4 + 3] = 255;
		} else if (channels === 2) {
			const v = Number(data[i * 2]);
			out[i * 4] = v;
			out[i * 4 + 1] = v;
			out[i * 4 + 2] = v;
			out[i * 4 + 3] = Number(data[i * 2 + 1]);
		} else if (channels === 3) {
			out[i * 4] = Number(data[i * 3]);
			out[i * 4 + 1] = Number(data[i * 3 + 1]);
			out[i * 4 + 2] = Number(data[i * 3 + 2]);
			out[i * 4 + 3] = 255;
		} else {
			out[i * 4] = Number(data[i * 4]);
			out[i * 4 + 1] = Number(data[i * 4 + 1]);
			out[i * 4 + 2] = Number(data[i * 4 + 2]);
			out[i * 4 + 3] = Number(data[i * 4 + 3]);
		}
	}
	return out;
}

function decodeRgba(input: Uint8Array): { width: number; height: number; data: Uint8Array } {
	if (isPng(input)) {
		const png = decodePng(input);
		return {
			width: png.width,
			height: png.height,
			data: toRgba(png.data, png.width, png.height, png.channels),
		};
	}
	if (isJpeg(input)) {
		return decodeJpeg(input, { useTArray: true, formatAsRGBA: true });
	}
	throw new Error('Unsupported image format');
}

export function resizeImageToLongEdgeJpeg(
	input: Uint8Array,
	longEdge: number,
	quality = 82,
): { bytes: Uint8Array; width: number; height: number } {
	const decoded = decodeRgba(input);
	const { width, height, data } = decoded;
	const longest = Math.max(width, height);
	const scale = longest <= longEdge ? 1 : longEdge / longest;
	const tw = Math.max(1, Math.round(width * scale));
	const th = Math.max(1, Math.round(height * scale));
	const pixels = scale === 1 ? data : bilinearRgba(data, width, height, tw, th);
	const encoded = encodeJpeg({ data: pixels, width: tw, height: th }, quality);
	return {
		bytes: encoded.data instanceof Uint8Array ? encoded.data : new Uint8Array(encoded.data),
		width: tw,
		height: th,
	};
}

export function resizeImageToWidthJpeg(
	input: Uint8Array,
	targetWidth: number,
	quality = 82,
): { bytes: Uint8Array; width: number; height: number } {
	const decoded = decodeRgba(input);
	const { width, height, data } = decoded;
	const scale = width <= targetWidth ? 1 : targetWidth / width;
	const tw = Math.max(1, Math.round(width * scale));
	const th = Math.max(1, Math.round(height * scale));
	const pixels = scale === 1 ? data : bilinearRgba(data, width, height, tw, th);
	const encoded = encodeJpeg({ data: pixels, width: tw, height: th }, quality);
	return {
		bytes: encoded.data instanceof Uint8Array ? encoded.data : new Uint8Array(encoded.data),
		width: tw,
		height: th,
	};
}
