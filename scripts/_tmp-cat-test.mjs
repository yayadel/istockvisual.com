function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function includesTerm(text, term) {
	const needle = term.trim().toLowerCase();
	if (!needle) return false;
	if (needle.length <= 3 || !needle.includes(' ')) {
		const pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(needle)}(?:[^a-z0-9]|$)`, 'i');
		return pattern.test(text);
	}
	return text.includes(needle);
}
const cats =
	'Business,Finance,Technology,AI,People,Workplace,Lifestyle,Landscapes,Nature,Plants,Animals,Cityscapes,Architecture,Interior,Food,Beverage,Coffee,Education,Culture,Medical,Health,Sports,Advertising,E-commerce,Web,Vectors,Illustrations,Photography,Aerial,3D Assets,Backgrounds,Textures,Abstract,Conceptual,Sustainability,Mood'.split(
		',',
	);
const ALIASES = {
	technology: ['tech', 'digital', 'device', 'gadget'],
	sports: ['sport', 'gaming'],
	landscapes: ['landscape', 'mountain'],
	nature: ['forest', 'outdoor'],
	coffee: ['espresso', 'cafe', 'latte'],
	ai: ['artificial intelligence', 'machine learning'],
};
function pick(title) {
	const text = title.toLowerCase();
	return cats
		.map((label) => {
			const key = label.toLowerCase();
			let score = 0;
			if (includesTerm(text, key)) score += 12;
			for (const a of ALIASES[key] || []) if (includesTerm(text, a)) score += 6;
			return { label, score };
		})
		.filter((x) => x.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, 3)
		.map((x) => x.label);
}
console.log(pick('Logitech G Pro Wireless G2 Edition Gaming Mouse'));
console.log(pick('Mountain Landscape at Sunrise Over Alpine Valley'));
console.log(pick('Espresso Coffee Latte Art in Cafe'));
console.log(pick('AI Neural Network Visualization'));
