import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { schemaTypes } from './schemaTypes';

const projectId = process.env.SANITY_STUDIO_PROJECT_ID || 'yourProjectId';
const dataset = process.env.SANITY_STUDIO_DATASET || 'production';

export default defineConfig({
	name: 'istockvisual',
	title: 'StockVisual CMS',
	projectId,
	dataset,
	plugins: [structureTool()],
	schema: {
		types: schemaTypes,
	},
});
