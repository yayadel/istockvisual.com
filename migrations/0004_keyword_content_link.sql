-- Keyword ↔ content relational model for generated assets and future content types.

ALTER TABLE keyword ADD COLUMN "usedAt" TEXT;
ALTER TABLE keyword ADD COLUMN "updatedAt" TEXT;

ALTER TABLE generated_asset ADD COLUMN "keywordId" INTEGER REFERENCES keyword ("id");

CREATE TABLE IF NOT EXISTS keyword_content (
	"id" INTEGER PRIMARY KEY AUTOINCREMENT,
	"keywordId" INTEGER NOT NULL REFERENCES keyword ("id") ON DELETE CASCADE,
	"contentType" TEXT NOT NULL,
	"contentId" TEXT NOT NULL,
	"role" TEXT NOT NULL DEFAULT 'primary',
	"status" TEXT NOT NULL DEFAULT 'active',
	"createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
	UNIQUE ("keywordId", "contentType", "contentId")
);

CREATE INDEX IF NOT EXISTS keyword_content_keyword_idx ON keyword_content ("keywordId");
CREATE INDEX IF NOT EXISTS keyword_content_lookup_idx ON keyword_content ("contentType", "contentId");
CREATE INDEX IF NOT EXISTS keyword_content_status_idx ON keyword_content ("status");
CREATE INDEX IF NOT EXISTS generated_asset_keyword_id_idx ON generated_asset ("keywordId");

-- Backfill keywordId from legacy keyword text column.
UPDATE generated_asset
SET keywordId = (
	SELECT k.id
	FROM keyword k
	WHERE k.keyword = generated_asset.keyword COLLATE NOCASE
)
WHERE keywordId IS NULL;

-- Backfill primary links for existing generated assets.
INSERT OR IGNORE INTO keyword_content ("keywordId", "contentType", "contentId", "role", "status")
SELECT keywordId, 'generated_asset', id, 'primary', 'active'
FROM generated_asset
WHERE keywordId IS NOT NULL;

-- Sync usedAt for keywords that already have linked content.
UPDATE keyword
SET usedAt = COALESCE(
	usedAt,
	(
		SELECT MIN(kc.createdAt)
		FROM keyword_content kc
		WHERE kc.keywordId = keyword.id AND kc.status = 'active'
	)
)
WHERE used = 1 AND usedAt IS NULL;
