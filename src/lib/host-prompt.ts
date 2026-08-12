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
  "tags": ["tag1", "tag2"],
  "relatedSearchQueries": ["query1", "query2"],
  "depictedElements": ["object1", "object2"],
  "imagePageTitle": "English title-case title containing the topic keyword (acronyms like PDF/UAE uppercase)",
  "pageShortDescription": "English sentence-case short description containing the topic keyword (acronyms/proper nouns correct)",
  "medium": "Photograph | Illustration | 3D Graphic"
}

Title rules: imagePageTitle uses standard title case; capitalize acronyms (PDF, UAE, KY, DIY, USA, UK, AI, UI, API, GPS, LED, HD, 4K); lowercase short words like a/an/the/and/or/of/in/on/at/to/by/with unless first/last. Example: "Orbital Quenching PDF Process in a Metallurgy Lab".
`.trim();
