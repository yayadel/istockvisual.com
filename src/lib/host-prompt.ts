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
  "imageCreationDescription": "English description of the titled visible scene; must match imagePageTitle, not the raw keyword",
  "assetUsageTips": "English usage tips for designers/marketers",
  "colorPalette": [{"name": "Color name", "hex": "#RRGGBB"}],
  "tags": ["22-28 title-case indexing tags (1-3 words each): literal visible objects/scene first, then conceptual; acronyms like PDF/USB/AI uppercase; no SEO travel phrases"],
  "contentCategories": ["exactly 1 exact label from the allowed category list"],
  "imagePageTitle": "Natural title-case stock caption of the visible scene; core subject from the keyword, not a stuffed query",
  "pageShortDescription": "English sentence-case short description of the titled scene; must match imagePageTitle, not the raw keyword",
  "medium": "Photograph | Illustration | 3D Graphic"
}

contentCategories is REQUIRED: exactly **1** item chosen ONLY from:
${contentCategoriesPromptList()}
Pick the single best label for what the image actually depicts (subject/scene). Gaming peripherals → Technology, not Sports. Sports is physical athletics only. Do NOT invent labels. Do NOT leave contentCategories empty. Do NOT return more than one label.
Do NOT output separate keywords, depictedElements, or relatedSearchQueries fields — put subject/object ideas into tags (22–28 unique tags, 1–3 words each).
Title rules: imagePageTitle is a natural stock caption of the visible scene (who/what + action/setting), about 6–12 words, standard title case; capitalize acronyms (PDF, UAE, KY, DIY, USA, UK, AI, UI, API, GPS, LED, HD, 4K); lowercase short words like a/an/the/and/or/of/in/on/at/to/by/with unless first/last. Name the keyword's distinctive subject; do not paste the raw query; do not start with Guide/How to/Best/Tips; do not add Stock Image or Free Download. Example: keyword "how to size a magnetic motor starter" → "Electrician Sizing a Magnetic Motor Starter on a Workbench". Example: "Orbital Quenching PDF Process in a Metallurgy Lab".
Copy alignment: imageCreationDescription, pageShortDescription, imagePrompt, and assetUsageTips MUST describe the same scene as imagePageTitle. Do not paste the raw topic keyword into those fields when the title already named the visible subject (no celebrity names, piracy/download queries, or dictionary queries in copy unless they are actually in the picture). Tags follow the title and visible objects, not the raw seed.
`.trim();
