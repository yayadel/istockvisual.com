declare module 'imagetracerjs' {
	type ImageDataLike = {
		width: number;
		height: number;
		data: Uint8ClampedArray | number[];
	};

	type ImageTracer = {
		imagedataToSVG: (imgd: ImageDataLike, options?: Record<string, unknown>) => string;
		imageToSVG: (
			url: string,
			callback: (svg: string) => void,
			options?: Record<string, unknown>,
		) => void;
	};

	const ImageTracer: ImageTracer;
	export default ImageTracer;
}
