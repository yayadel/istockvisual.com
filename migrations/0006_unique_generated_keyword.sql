-- One generated asset per keyword. Retried imports used to insert a second row.

DELETE FROM keyword_content
WHERE contentType = 'generated_asset'
	AND contentId IN (
		SELECT id FROM (
			SELECT id,
				ROW_NUMBER() OVER (
					PARTITION BY keywordId
					ORDER BY publishedAt DESC
				) AS rn
			FROM generated_asset
			WHERE keywordId IS NOT NULL
		)
		WHERE rn > 1
	);

DELETE FROM generated_asset
WHERE id IN (
	SELECT id FROM (
		SELECT id,
			ROW_NUMBER() OVER (
				PARTITION BY keywordId
				ORDER BY publishedAt DESC
			) AS rn
		FROM generated_asset
		WHERE keywordId IS NOT NULL
	)
	WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS generated_asset_keyword_id_unique
	ON generated_asset ("keywordId")
	WHERE "keywordId" IS NOT NULL;
