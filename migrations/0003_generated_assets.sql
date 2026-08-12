CREATE TABLE IF NOT EXISTS generated_asset (
	"id" TEXT NOT NULL PRIMARY KEY,
	"keyword" TEXT NOT NULL,
	"slug" TEXT NOT NULL,
	"category" TEXT NOT NULL,
	"title" TEXT NOT NULL,
	"shortDescription" TEXT,
	"description" TEXT,
	"imagePrompt" TEXT NOT NULL,
	"creationDescription" TEXT,
	"usageTips" TEXT,
	"colorPalette" TEXT,
	"tags" TEXT,
	"relatedQueries" TEXT,
	"depictedElements" TEXT,
	"medium" TEXT,
	"r2ObjectKey" TEXT,
	"fileType" TEXT NOT NULL DEFAULT 'image/jpeg',
	"width" INTEGER,
	"height" INTEGER,
	"license" TEXT NOT NULL DEFAULT 'Standard',
	"isPremium" INTEGER NOT NULL DEFAULT 0,
	"publishedAt" TEXT NOT NULL,
	"createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS generated_asset_slug_category_idx
	ON generated_asset ("category", "slug");

CREATE INDEX IF NOT EXISTS generated_asset_keyword_idx ON generated_asset ("keyword");
CREATE INDEX IF NOT EXISTS generated_asset_published_idx ON generated_asset ("publishedAt" DESC);
