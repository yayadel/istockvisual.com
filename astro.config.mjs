// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
	site: 'https://istockvisual.com',
	server: {
		port: 4325,
	},
	output: 'server',
	adapter: cloudflare({
		platformProxy: {
			enabled: true,
		},
		// D1/R2 bindings run locally without CLOUDFLARE_API_TOKEN
		remoteBindings: false,
	}),
	integrations: [react()],
	vite: {
		ssr: {
			noExternal: ['jpeg-js', 'fast-png'],
			external: ['@imgly/background-removal', 'onnxruntime-web'],
		},
		optimizeDeps: {
			exclude: ['@imgly/background-removal', 'onnxruntime-web', 'heic2any'],
			include: ['jszip', 'imagetracerjs'],
		},
	},
});
