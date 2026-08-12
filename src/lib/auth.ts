import { betterAuth } from 'better-auth';

export type Plan = 'free' | 'pro';

export type AppUser = {
	id: string;
	name: string;
	email: string;
	emailVerified: boolean;
	image?: string | null;
	createdAt: Date;
	updatedAt: Date;
	plan: Plan;
	planExpiresAt?: string | null;
};

export type AuthEnv = {
	DB: D1Database;
	BETTER_AUTH_SECRET: string;
	BETTER_AUTH_URL: string;
};

export function createAuth(env: AuthEnv) {
	return betterAuth({
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		database: env.DB,
		emailAndPassword: {
			enabled: true,
		},
		user: {
			additionalFields: {
				plan: {
					type: 'string',
					required: false,
					defaultValue: 'free',
					input: false,
				},
				planExpiresAt: {
					type: 'string',
					required: false,
					defaultValue: null,
					input: false,
				},
			},
		},
	});
}

export type Auth = ReturnType<typeof createAuth>;
