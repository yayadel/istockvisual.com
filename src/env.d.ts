type CloudflareEnv = {
	DB: D1Database;
	MEDIA: R2Bucket;
	SESSION: KVNamespace;
	ASSETS: Fetcher;
	BETTER_AUTH_SECRET: string;
	BETTER_AUTH_URL: string;
	GENERATE_API_SECRET?: string;
	ADMIN_EMAILS?: string;
	GEMINI_API_KEY?: string;
	GEMINI_MODEL?: string;
	TOGETHER_API_KEY?: string;
	TOGETHER_MODEL?: string;
	TOGETHER_SUPPORT_MODEL?: string;
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
	readonly GENERATE_API_SECRET?: string;
	readonly ADMIN_EMAILS?: string;
	readonly GEMINI_API_KEY?: string;
	readonly GEMINI_MODEL?: string;
	readonly TOGETHER_API_KEY?: string;
	readonly TOGETHER_MODEL?: string;
	readonly TOGETHER_SUPPORT_MODEL?: string;
	readonly LOCAL_AI_TEXT_URL?: string;
	readonly LOCAL_AI_TEXT_MODEL?: string;
	readonly LOCAL_AI_TEXT_API_KEY?: string;
	readonly LOCAL_AI_IMAGE_URL?: string;
	readonly LOCAL_AI_IMAGE_MODEL?: string;
	readonly LOCAL_AI_IMAGE_PROVIDER?: string;
	readonly OPENAI_API_KEY?: string;
	readonly OPENAI_BASE_URL?: string;
	readonly OPENAI_MODEL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

declare module '*.css?url' {
	const href: string;
	export default href;
}

declare module 'cloudflare:workers' {
	interface Env extends CloudflareEnv {}
}
