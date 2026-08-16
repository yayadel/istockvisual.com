import type { AssetDetail } from './asset-types';
import { assetTileAt } from './asset-tiles';
import { fitWidth } from './download-sizes';

export type CatalogCardPayload = {
	href: string;
	title: string;
	preview: string;
	isPremium: boolean;
	tile: string;
	ratio: number;
	width: number;
	height: number;
};

export function catalogCardPayload(asset: AssetDetail, index: number): CatalogCardPayload {
	const { tile, ratio } = assetTileAt(index);
	const preview = asset.previewUrl || '';
	const src500 = preview
		? preview.includes('?')
			? `${preview}&size=500`
			: `${preview}?size=500`
		: '';
	const box = fitWidth(asset.width || 1536, asset.height || 1024, 500);
	return {
		href: `/${asset.category}/${asset.slug}`,
		title: asset.title,
		preview: src500,
		isPremium: asset.isPremium,
		tile,
		ratio,
		width: box.width,
		height: box.height,
	};
}
