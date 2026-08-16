export const ASSET_TILES = [
	'portrait',
	'short',
	'square',
	'landscape',
	'tall',
	'short',
	'portrait',
	'landscape',
] as const;

export type AssetTile = (typeof ASSET_TILES)[number];

export const ASSET_TILE_RATIO: Record<AssetTile, number> = {
	short: 9 / 16,
	landscape: 4 / 5,
	square: 1,
	portrait: 5 / 4,
	tall: 5 / 3,
};

export function assetTileAt(index: number) {
	const tile = ASSET_TILES[index % ASSET_TILES.length];
	return { tile, ratio: ASSET_TILE_RATIO[tile] };
}
