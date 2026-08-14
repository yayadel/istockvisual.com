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

/** Fallback when Sanity env is not configured. Library content lives in D1. */
const DEMO_ASSETS: AssetDoc[] = [];

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
