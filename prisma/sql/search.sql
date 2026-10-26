-- Optional search indexes. Apply after `prisma migrate deploy`.
-- The vector column is intentionally absent: its dimension must match a chosen
-- embedding model, and no model is configured in this repository.
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "Chunk"
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce("normalizedText", ''))) STORED;

CREATE INDEX IF NOT EXISTS chunk_search_vector_idx ON "Chunk" USING GIN (search_vector);

-- 'simple' does not stem Arabic or Urdu. Application ranking still uses the
-- normalized text. A language-specific dictionary can be added after it is installed.
