CREATE TABLE IF NOT EXISTS download_log (
	id TEXT PRIMARY KEY,
	userId TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
	assetId TEXT NOT NULL,
	sizeId TEXT NOT NULL,
	createdAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS download_log_userId_idx ON download_log (userId);
CREATE INDEX IF NOT EXISTS download_log_user_size_idx ON download_log (userId, sizeId);
