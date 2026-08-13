import hostPromptTemplate from '../data/host-prompt.txt?raw';

const PLACEHOLDER = '[Insert topic keyword here]';

export function buildHostPrompt(keyword: string): string {
	const trimmed = keyword.trim();
	if (!trimmed) {
		throw new Error('Keyword is required');
	}
	return hostPromptTemplate.replace(PLACEHOLDER, trimmed);
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

contentCategories MUST be 1–3 items chosen ONLY from:
Business, Finance, Technology, AI, People, Workplace, Lifestyle, Landscapes, Nature, Plants, Animals, Cityscapes, Architecture, Interior, Food, Beverage, Coffee, Education, Culture, Medical, Health, Sports, Advertising, E-commerce, Web, Vectors, Illustrations, Photography, Aerial, 3D Assets, Backgrounds, Textures, Abstract, Conceptual, Sustainability, Mood.
Pick them based on the image page title / topic. Do NOT invent labels.
Do NOT output separate keywords or depictedElements fields — put those ideas into tags (minimum 40 unique tags).
Title rules: imagePageTitle uses standard title case; capitalize acronyms (PDF, UAE, KY, DIY, USA, UK, AI, UI, API, GPS, LED, HD, 4K); lowercase short words like a/an/the/and/or/of/in/on/at/to/by/with unless first/last. Example: "Orbital Quenching PDF Process in a Metallurgy Lab".
`.trim();
