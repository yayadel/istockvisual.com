type CloudflareEnv = {
	DB: D1Database;
	MEDIA: R2Bucket;
	ASSETS: Fetcher;
	AI: Ai;
	BETTER_AUTH_SECRET: string;
	BETTER_AUTH_URL: string;
	GENERATE_API_SECRET?: string;
	OPENAI_API_KEY?: string;
	OPENAI_BASE_URL?: string;
	OPENAI_MODEL?: string;
	SANITY_PROJECT_ID?: string;
	SANITY_DATASET?: string;
	SANITY_API_TOKEN?: string;
};

declare namespace App {
	interface Locals {
		user: import('./lib/auth').AppUser | null;
		session: {
			id: string;
			token: string;
			expiresAt: Date;
			userId: string;
		} | null;
	}
}

interface ImportMetaEnv {
	readonly SANITY_PROJECT_ID?: string;
	readonly PUBLIC_SANITY_PROJECT_ID?: string;
	readonly SANITY_DATASET?: string;
	readonly PUBLIC_SANITY_DATASET?: string;
	readonly SANITY_API_TOKEN?: string;
	readonly BETTER_AUTH_SECRET?: string;
	readonly BETTER_AUTH_URL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

declare module 'cloudflare:workers' {
	interface Env extends CloudflareEnv {}
}
