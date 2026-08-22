// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
	site: 'https://stockvisual.org',
	server: {
		port: 4325,
		host: true,
	},
	output: 'server',
	adapter: cloudflare({
		// Local UI at http://localhost:4325 uses production D1 + R2
		remoteBindings: true,
		imageService: 'passthrough',
	}),
	integrations: [react()],
	build: {
		inlineStylesheets: 'never',
	},
	vite: {
		// Filerobot/Konva break in `astro dev` if React is duplicated across
		// optimized chunks (dispatcher.getOwner is not a function → no canvas).
		resolve: {
			dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
		},
		build: {
			rollupOptions: {
				output: {
					manualChunks(id) {
						if (
							id.includes('node_modules/react-filerobot-image-editor') ||
							id.includes('node_modules/konva') ||
							id.includes('node_modules/react-konva') ||
							id.includes('node_modules/styled-components')
						) {
							return 'filerobot-vendor';
						}
					},
				},
			},
		},
		ssr: {
			noExternal: ['jpeg-js', 'fast-png'],
			external: [
				'@imgly/background-removal',
				'onnxruntime-web',
				'konva',
				'react-konva',
				'react-filerobot-image-editor',
				'styled-components',
			],
		},
		optimizeDeps: {
			exclude: ['@imgly/background-removal', 'onnxruntime-web', 'heic2any'],
			include: [
				'react',
				'react-dom',
				'react/jsx-runtime',
				'react/jsx-dev-runtime',
				'jszip',
				'imagetracerjs',
				'react-filerobot-image-editor',
				'styled-components',
				'konva',
				'react-konva',
			],
		},
	},
});
