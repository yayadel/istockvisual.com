import hostPromptTemplate from '../data/host-prompt.txt?raw';
import { contentCategoriesPromptList } from './content-categories';

const KEYWORD_PLACEHOLDER = '[Insert topic keyword here]';
const CATEGORIES_PLACEHOLDER = '[Insert allowed content categories here]';

export function buildHostPrompt(keyword: string): string {
	const trimmed = keyword.trim();
	if (!trimmed) {
		throw new Error('Keyword is required');
	}
	const categoriesList = contentCategoriesPromptList();
	return hostPromptTemplate
		.replace(CATEGORIES_PLACEHOLDER, categoriesList)
		.replace(KEYWORD_PLACEHOLDER, trimmed);
}

export const JSON_OUTPUT_INSTRUCTION = `
Respond with a single JSON object only (no markdown fences), using exactly these keys:
{
  "imagePrompt": "detailed English prompt for image generation",
  "imageCreationDescription": "English description containing the topic keyword",
  "assetUsageTips": "English usage tips for designers/marketers",
  "colorPalette": [{"name": "Color name", "hex": "#RRGGBB"}],
  "tags": ["at least 40 tags merging keywords + depicted elements"],
  "contentCategories": ["1 to 3 exact labels from the allowed category list"],
  "relatedSearchQueries": ["query1", "query2"],
  "imagePageTitle": "English title-case title containing the topic keyword (acronyms like PDF/UAE uppercase)",
  "pageShortDescription": "English sentence-case short description containing the topic keyword (acronyms/proper nouns correct)",
  "medium": "Photograph | Illustration | 3D Graphic"
}

contentCategories is REQUIRED: 1–3 items chosen ONLY from:
${contentCategoriesPromptList()}
Pick them from what the image actually depicts (subject/scene). Gaming peripherals → Technology, not Sports. Sports is physical athletics only. Do NOT invent labels. Do NOT leave contentCategories empty.
Do NOT output separate keywords or depictedElements fields — put those ideas into tags (minimum 40 unique tags).
Title rules: imagePageTitle uses standard title case; capitalize acronyms (PDF, UAE, KY, DIY, USA, UK, AI, UI, API, GPS, LED, HD, 4K); lowercase short words like a/an/the/and/or/of/in/on/at/to/by/with unless first/last. Example: "Orbital Quenching PDF Process in a Metallurgy Lab".
`.trim();
