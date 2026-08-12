-- Better Auth core tables + membership fields for istockvisual
CREATE TABLE IF NOT EXISTS "user" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"name" TEXT NOT NULL,
	"email" TEXT NOT NULL UNIQUE,
	"emailVerified" INTEGER NOT NULL DEFAULT 0,
	"image" TEXT,
	"createdAt" TEXT NOT NULL,
	"updatedAt" TEXT NOT NULL,
	"plan" TEXT NOT NULL DEFAULT 'free',
	"planExpiresAt" TEXT
);

CREATE TABLE IF NOT EXISTS "session" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"expiresAt" TEXT NOT NULL,
	"token" TEXT NOT NULL UNIQUE,
	"createdAt" TEXT NOT NULL,
	"updatedAt" TEXT NOT NULL,
	"ipAddress" TEXT,
	"userAgent" TEXT,
	"userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"accountId" TEXT NOT NULL,
	"providerId" TEXT NOT NULL,
	"userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
	"accessToken" TEXT,
	"refreshToken" TEXT,
	"idToken" TEXT,
	"accessTokenExpiresAt" TEXT,
	"refreshTokenExpiresAt" TEXT,
	"scope" TEXT,
	"password" TEXT,
	"createdAt" TEXT NOT NULL,
	"updatedAt" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
	"id" TEXT NOT NULL PRIMARY KEY,
	"identifier" TEXT NOT NULL,
	"value" TEXT NOT NULL,
	"expiresAt" TEXT NOT NULL,
	"createdAt" TEXT,
	"updatedAt" TEXT
);

CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("userId");
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("userId");
