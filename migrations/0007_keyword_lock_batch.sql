-- Batch lock for multi-process keyword isolation.
-- claim N unused rows at once; other workers only see used = 0.
ALTER TABLE keyword ADD COLUMN "lockBatchId" TEXT;

CREATE INDEX IF NOT EXISTS keyword_lock_batch_idx ON keyword ("lockBatchId");
CREATE INDEX IF NOT EXISTS keyword_unused_id_idx ON keyword ("used", "id");
