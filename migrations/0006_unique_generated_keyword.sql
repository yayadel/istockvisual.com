-- One generated asset per keyword. Retried imports used to insert a second row.

DELETE FROM keyword_content
WHERE contentType = 'generated_asset'
	AND contentId IN (
		SELECT ga.id
		FROM generated_asset ga
		WHERE ga.keywordId IS NOT NULL
			AND ga.id NOT IN (
				SELECT keep.id
				FROM generated_asset keep
				WHERE keep.keywordId = ga.keywordId
				ORDER BY keep.publishedAt DESC
				LIMIT 1
			)
	);

DELETE FROM generated_asset
WHERE keywordId IS NOT NULL
	AND id NOT IN (
		SELECT keep.id
		FROM generated_asset keep
		WHERE keep.keywordId = generated_asset.keywordId
		ORDER BY keep.publishedAt DESC
		LIMIT 1
	);

CREATE UNIQUE INDEX IF NOT EXISTS generated_asset_keyword_id_unique
	ON generated_asset ("keywordId")
	WHERE "keywordId" IS NOT NULL;
