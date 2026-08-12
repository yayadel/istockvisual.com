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
	}),
	integrations: [react()],
});
