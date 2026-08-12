import { createClient, type SanityClient } from '@sanity/client';
import groq from 'groq';
import type { CategorySlug } from '../config/categories';

export type AssetDoc = {
	_id: string;
	title: string;
	slug: string;
	category: CategorySlug;
	description?: string;
	tags?: string[];
	previewUrl?: string;
	r2ObjectKey?: string;
	fileType?: string;
	width?: number;
	height?: number;
	license?: string;
	isPremium?: boolean;
	publishedAt?: string;
};

const assetFields = groq`{
  _id,
  title,
  "slug": slug.current,
  category,
  description,
  tags,
  previewUrl,
  r2ObjectKey,
  fileType,
  width,
  height,
  license,
  isPremium,
  publishedAt
}`;

/** Demo fixtures when Sanity env is not configured yet. */
const DEMO_ASSETS: AssetDoc[] = [
	{
		_id: 'demo-photo-1',
		title: 'Coastal Light',
		slug: 'coastal-light-184203',
		category: 'photos',
		description: 'Soft morning light along a quiet coastline. Demo asset for local development.',
		tags: ['nature', 'ocean', 'light'],
		previewUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&q=80',
		r2ObjectKey: 'demo/photos/coastal-light.jpg',
		fileType: 'image/jpeg',
		width: 1200,
		height: 800,
		license: 'Demo / editorial use only',
		isPremium: false,
		publishedAt: '2026-01-10',
	},
	{
		_id: 'demo-illustration-1',
		title: 'Geometry Bloom',
		slug: 'geometry-bloom-572910',
		category: 'illustrations',
		description: 'Bold geometric illustration in charcoal and teal.',
		tags: ['abstract', 'geometry'],
		previewUrl: 'https://images.unsplash.com/photo-1557672172-298e090bd0f1?w=1200&q=80',
		r2ObjectKey: 'demo/illustrations/geometry-bloom.png',
		fileType: 'image/png',
		width: 1200,
		height: 900,
		license: 'Demo / editorial use only',
		isPremium: true,
		publishedAt: '2026-02-02',
	},
	{
		_id: 'demo-vector-1',
		title: 'Line City',
		slug: 'line-city-903184',
		category: 'vectors',
		description: 'Clean vector skyline for editorial layouts.',
		tags: ['city', 'vector'],
		previewUrl: 'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=1200&q=80',
		r2ObjectKey: 'demo/vectors/line-city.svg',
		fileType: 'image/svg+xml',
		width: 1600,
		height: 900,
		license: 'Demo / editorial use only',
		isPremium: false,
		publishedAt: '2026-03-12',
	},
	{
		_id: 'demo-3d-1',
		title: 'Studio Orb',
		slug: 'studio-orb-441672',
		category: '3d',
		description: 'Soft 3D orb render for product mock scenes.',
		tags: ['3d', 'product'],
		previewUrl: '/demo/studio-orb.jpg',
		r2ObjectKey: 'demo/3d/studio-orb.jpg',
		fileType: 'image/jpeg',
		width: 1400,
		height: 1400,
		license: 'Demo / editorial use only',
		isPremium: true,
		publishedAt: '2026-04-01',
	},
];

function getSanityConfig() {
	const projectId = import.meta.env.SANITY_PROJECT_ID || import.meta.env.PUBLIC_SANITY_PROJECT_ID;
	const dataset = import.meta.env.SANITY_DATASET || import.meta.env.PUBLIC_SANITY_DATASET || 'production';
	const token = import.meta.env.SANITY_API_TOKEN;
	return { projectId, dataset, token };
}

export function isSanityConfigured() {
	const { projectId } = getSanityConfig();
	return Boolean(projectId);
}

export function getSanityClient(): SanityClient | null {
	const { projectId, dataset, token } = getSanityConfig();
	if (!projectId) return null;
	return createClient({
		projectId,
		dataset,
		apiVersion: '2025-01-01',
		useCdn: !token,
		token: token || undefined,
	});
}

export async function listAssetsByCategory(category: CategorySlug): Promise<AssetDoc[]> {
	const client = getSanityClient();
	if (!client) {
		return DEMO_ASSETS.filter((a) => a.category === category);
	}

	const query = groq`*[_type == "asset" && category == $category] | order(publishedAt desc) ${assetFields}`;
	return client.fetch<AssetDoc[]>(query, { category });
}

export async function getAssetBySlug(category: CategorySlug, slug: string): Promise<AssetDoc | null> {
	const client = getSanityClient();
	if (!client) {
		return DEMO_ASSETS.find((a) => a.category === category && a.slug === slug) ?? null;
	}

	const query = groq`*[_type == "asset" && category == $category && slug.current == $slug][0] ${assetFields}`;
	return client.fetch<AssetDoc | null>(query, { category, slug });
}

export async function getAssetById(id: string): Promise<AssetDoc | null> {
	const client = getSanityClient();
	if (!client) {
		return DEMO_ASSETS.find((a) => a._id === id) ?? null;
	}

	const query = groq`*[_type == "asset" && _id == $id][0] ${assetFields}`;
	return client.fetch<AssetDoc | null>(query, { id });
}

export async function listFeaturedAssets(limit = 8): Promise<AssetDoc[]> {
	const client = getSanityClient();
	if (!client) {
		return DEMO_ASSETS.slice(0, limit);
	}

	const query = groq`*[_type == "asset"] | order(publishedAt desc)[0...$limit] ${assetFields}`;
	return client.fetch<AssetDoc[]>(query, { limit });
}
